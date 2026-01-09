/**
 * Raindrop MCP Service
 * 
 * Exposes Raindrop.io functionality through the Model Context Protocol.
 * Provides tools and resources for AI assistants to interact with bookmarks.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RaindropService } from './raindrop.service.js';
import {
  BookmarkManageInputSchema,
  BookmarkOutputSchema,
  BookmarkSearchInputSchema,
  BookmarkSearchOutputSchema,
  CollectionManageInputSchema,
  CollectionOutputSchema,
  TagInputSchema,
  HighlightManageInputSchema,
  BulkEditInputSchema,
} from '../types/raindrop-zod.schemas.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('raindrop-mcp');
const SERVER_VERSION = '0.1.0';

/**
 * MCP content type for tool responses
 */
type McpContent =
  | { type: 'text'; text: string }
  | { type: 'resource_link'; uri: string; name: string; description: string; mimeType: string };

/**
 * Helper function to create text content
 */
function textContent(text: string): McpContent {
  return { type: 'text', text };
}

/**
 * Helper function to create a resource link for a collection
 */
function makeCollectionLink(collection: any): McpContent {
  return {
    type: 'resource_link',
    uri: `mcp://collection/${collection._id}`,
    name: collection.title || 'Untitled Collection',
    description: collection.description || `Collection with ${collection.count || 0} bookmarks`,
    mimeType: 'application/json',
  };
}

/**
 * Helper function to create a resource link for a bookmark
 */
function makeBookmarkLink(bookmark: any): McpContent {
  return {
    type: 'resource_link',
    uri: `mcp://raindrop/${bookmark._id}`,
    name: bookmark.title || 'Untitled',
    description: bookmark.excerpt || bookmark.link || 'No description',
    mimeType: 'application/json',
  };
}

/**
 * Helper to set object properties only if value is defined
 */
function setIfDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/**
 * Main MCP server for Raindrop.io
 */
export class RaindropMCPService {
  private server: McpServer;
  private raindropService: RaindropService;

  /**
   * Create a new Raindrop MCP service
   * @param token Optional Raindrop.io access token for multi-tenant support
   */
  constructor(token?: string) {
    logger.info('Initializing Raindrop MCP service');
    
    // Create Raindrop service with optional token for multi-tenant support
    this.raindropService = new RaindropService(token);
    this.server = new McpServer({
      name: 'raindrop-mcp',
      version: SERVER_VERSION,
      description: 'MCP Server for Raindrop.io bookmark management',
      capabilities: {
        resources: true,
        tools: true,
      },
    });

    this.registerTools();
    this.registerResourceHandlers();
    
    logger.info('Raindrop MCP service initialized');
  }

  /**
   * Get the MCP server instance
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * Cleanup resources on shutdown
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up Raindrop MCP service');
  }

  /**
   * Register all MCP tools
   */
  private registerTools(): void {
    // Collection List Tool
    this.server.registerTool(
      'collection_list',
      {
        title: 'Collection List',
        description: 'List all Raindrop.io collections for the authenticated user. Returns resource links to individual collections.',
        inputSchema: z.object({}).shape,
      },
      async () => {
        try {
          const collections = await this.raindropService.getCollections();
          const content: McpContent[] = [
            textContent(`Found ${collections.length} collections`),
            ...collections.map(makeCollectionLink),
          ];
          return { content };
        } catch (error) {
          logger.error('Error listing collections:', error);
          throw error;
        }
      }
    );

    // Collection Manage Tool
    this.server.registerTool(
      'collection_manage',
      {
        title: 'Collection Manage',
        description: 'Create, update, or delete a Raindrop.io collection. Use operation parameter to specify action.',
        inputSchema: CollectionManageInputSchema.shape,
      },
      async (args: z.infer<typeof CollectionManageInputSchema>) => {
        try {
          switch (args.operation) {
            case 'create':
              if (!args.title) throw new Error('title is required for create operation');
              const created = await this.raindropService.createCollection(
                args.title,
                args.public
              );
              return {
                content: [
                  textContent(`Created collection: ${created.title}`),
                  makeCollectionLink(created),
                ],
              };

            case 'update':
              if (!args.id) throw new Error('id is required for update operation');
              const updates: Record<string, unknown> = {};
              setIfDefined(updates, 'title', args.title);
              setIfDefined(updates, 'description', args.description);
              setIfDefined(updates, 'color', args.color);
              setIfDefined(updates, 'public', args.public);
              const updated = await this.raindropService.updateCollection(args.id, updates);
              return {
                content: [
                  textContent(`Updated collection ${args.id}`),
                  makeCollectionLink(updated),
                ],
              };

            case 'delete':
              if (!args.id) throw new Error('id is required for delete operation');
              await this.raindropService.deleteCollection(args.id);
              return {
                content: [textContent(`Deleted collection ${args.id}`)],
              };

            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
        } catch (error) {
          logger.error('Error managing collection:', error);
          throw error;
        }
      }
    );

    // Bookmark Search Tool
    this.server.registerTool(
      'bookmark_search',
      {
        title: 'Bookmark Search',
        description: 'Search and filter Raindrop.io bookmarks with advanced options. Returns resource links to matching bookmarks.',
        inputSchema: BookmarkSearchInputSchema.shape,
      },
      async (args: z.infer<typeof BookmarkSearchInputSchema>) => {
        try {
          const result = await this.raindropService.getBookmarks({
            search: args.search,
            collection: args.collection,
            tags: args.tags,
            important: args.important,
            page: args.page,
            perPage: args.perPage,
            sort: args.sort,
          });

          const content: McpContent[] = [
            textContent(`Found ${result.count} bookmarks`),
            ...result.items.map(makeBookmarkLink),
          ];

          return { content };
        } catch (error) {
          logger.error('Error searching bookmarks:', error);
          throw error;
        }
      }
    );

    // Bookmark Manage Tool
    this.server.registerTool(
      'bookmark_manage',
      {
        title: 'Bookmark Manage',
        description: 'Create, update, or delete a Raindrop.io bookmark. Use operation parameter to specify action.',
        inputSchema: BookmarkManageInputSchema.shape,
      },
      async (args: z.infer<typeof BookmarkManageInputSchema>) => {
        try {
          switch (args.operation) {
            case 'create':
              if (!args.collectionId) {
                throw new Error('collectionId is required for create operation');
              }
              const created = await this.raindropService.createBookmark(args.collectionId, {
                link: args.url,
                title: args.title,
                excerpt: args.description,
                tags: args.tags,
                important: args.important,
              });
              return {
                content: [
                  textContent(`Created bookmark: ${created.title || created.link}`),
                  makeBookmarkLink(created),
                ],
              };

            case 'update':
              if (!args.id) throw new Error('id is required for update operation');
              const updates: Record<string, unknown> = {};
              setIfDefined(updates, 'link', args.url);
              setIfDefined(updates, 'title', args.title);
              setIfDefined(updates, 'excerpt', args.description);
              setIfDefined(updates, 'tags', args.tags);
              setIfDefined(updates, 'important', args.important);
              const updated = await this.raindropService.updateBookmark(args.id, updates);
              return {
                content: [
                  textContent(`Updated bookmark ${args.id}`),
                  makeBookmarkLink(updated),
                ],
              };

            case 'delete':
              if (!args.id) throw new Error('id is required for delete operation');
              await this.raindropService.deleteBookmark(args.id);
              return {
                content: [textContent(`Deleted bookmark ${args.id}`)],
              };

            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
        } catch (error) {
          logger.error('Error managing bookmark:', error);
          throw error;
        }
      }
    );

    // Tag List Tool
    this.server.registerTool(
      'tag_list',
      {
        title: 'Tag List',
        description: 'List all tags from Raindrop.io, optionally filtered by collection.',
        inputSchema: TagInputSchema.shape,
      },
      async (args: z.infer<typeof TagInputSchema>) => {
        try {
          const tags = await this.raindropService.getTags(args.collectionId);
          const tagList = tags.map((tag) => `${tag._id} (${tag.count})`).join(', ');
          return {
            content: [
              textContent(`Found ${tags.length} tags`),
              textContent(tagList || 'No tags found'),
            ],
          };
        } catch (error) {
          logger.error('Error listing tags:', error);
          throw error;
        }
      }
    );

    // Highlight Manage Tool
    this.server.registerTool(
      'highlight_manage',
      {
        title: 'Highlight Manage',
        description: 'Create, update, delete, or list highlights for bookmarks. Use operation parameter to specify action.',
        inputSchema: HighlightManageInputSchema.shape,
      },
      async (args: z.infer<typeof HighlightManageInputSchema>) => {
        try {
          switch (args.operation) {
            case 'list':
              if (!args.bookmarkId) throw new Error('bookmarkId is required for list operation');
              const highlights = await this.raindropService.getHighlights(args.bookmarkId);
              const highlightList = highlights
                .map((h) => `[${h.color || 'yellow'}] ${h.text.substring(0, 50)}...`)
                .join('\n');
              return {
                content: [
                  textContent(`Found ${highlights.length} highlights`),
                  textContent(highlightList || 'No highlights found'),
                ],
              };

            case 'create':
              if (!args.bookmarkId || !args.text) {
                throw new Error('bookmarkId and text are required for create operation');
              }
              const created = await this.raindropService.createHighlight(args.bookmarkId, {
                text: args.text,
                note: args.note,
                color: args.color,
              });
              return {
                content: [textContent(`Created highlight: ${created.text.substring(0, 50)}...`)],
              };

            case 'update':
              if (!args.id) throw new Error('id is required for update operation');
              const updates: Record<string, unknown> = {};
              setIfDefined(updates, 'text', args.text);
              setIfDefined(updates, 'note', args.note);
              setIfDefined(updates, 'color', args.color);
              const updated = await this.raindropService.updateHighlight(args.id, updates);
              return {
                content: [textContent(`Updated highlight ${args.id}`)],
              };

            case 'delete':
              if (!args.id) throw new Error('id is required for delete operation');
              await this.raindropService.deleteHighlight(args.id);
              return {
                content: [textContent(`Deleted highlight ${args.id}`)],
              };

            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
        } catch (error) {
          logger.error('Error managing highlight:', error);
          throw error;
        }
      }
    );

    // Bulk Edit Tool
    this.server.registerTool(
      'bulk_edit_bookmarks',
      {
        title: 'Bulk Edit Bookmarks',
        description: 'Bulk update tags, favorite status, media, cover, or move bookmarks to another collection.',
        inputSchema: BulkEditInputSchema.shape,
      },
      async (args: z.infer<typeof BulkEditInputSchema>) => {
        try {
          const updates: Record<string, unknown> = {};
          setIfDefined(updates, 'ids', args.ids);
          setIfDefined(updates, 'important', args.important);
          setIfDefined(updates, 'tags', args.tags);
          setIfDefined(updates, 'media', args.media);
          setIfDefined(updates, 'cover', args.cover);
          
          if (args.moveToCollection) {
            updates.collection = { $id: args.moveToCollection };
          }

          const result = await this.raindropService.bulkUpdateBookmarks(
            args.collectionId,
            updates
          );

          return {
            content: [
              textContent(`Bulk edit successful. Modified ${result.modified} bookmarks`),
            ],
          };
        } catch (error) {
          logger.error('Error bulk editing bookmarks:', error);
          throw error;
        }
      }
    );

    logger.info('Registered 7 MCP tools');
  }

  /**
   * Register resource handlers for dynamic resource access
   */
  private registerResourceHandlers(): void {
    // Handle resource read requests
    this.server.onResourceRead(async (uri: string) => {
      try {
        // User profile resource
        if (uri === 'mcp://user/profile') {
          const user = await this.raindropService.getUserInfo();
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(user, null, 2),
              },
            ],
          };
        }

        // Collection resource
        if (uri.startsWith('mcp://collection/')) {
          const id = parseInt(uri.split('/').pop() || '0');
          if (!id) throw new Error('Invalid collection ID');
          
          const collection = await this.raindropService.getCollection(id);
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(collection, null, 2),
              },
            ],
          };
        }

        // Bookmark resource
        if (uri.startsWith('mcp://raindrop/')) {
          const id = parseInt(uri.split('/').pop() || '0');
          if (!id) throw new Error('Invalid bookmark ID');
          
          const bookmark = await this.raindropService.getBookmark(id);
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(bookmark, null, 2),
              },
            ],
          };
        }

        throw new Error(`Resource not found: ${uri}`);
      } catch (error) {
        logger.error(`Error reading resource ${uri}:`, error);
        throw error;
      }
    });

    // Handle resource list requests
    this.server.onResourceList(async () => {
      return {
        resources: [
          {
            uri: 'mcp://user/profile',
            name: 'User Profile',
            description: 'Authenticated user information from Raindrop.io',
            mimeType: 'application/json',
          },
        ],
      };
    });

    logger.info('Registered resource handlers');
  }
}

export default RaindropMCPService;
