/**
 * Raindrop MCP Server - Vercel Deployment
 *
 * Main MCP endpoint using mcp-handler for Vercel Functions.
 * Provides tools for Raindrop.io bookmark management with OAuth authentication.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { RaindropService } from "../src/services/raindrop.service.js";
import { OAuthService } from "../src/oauth/oauth.service.js";
import { TokenStorage } from "../src/oauth/token-storage.js";
import { OAuthConfig } from "../src/oauth/oauth.types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { components as RaindropComponents } from "../src/types/raindrop.schema.js";
import {
  BookmarkManageInputSchema,
  BookmarkSearchInputSchema,
  CollectionManageInputSchema,
  TagInputSchema,
  HighlightManageInputSchema,
  BulkEditInputSchema,
  FilterStatsInputSchema,
} from "../src/types/raindrop-zod.schemas.js";

type Bookmark = RaindropComponents.schemas.Bookmark;
type Collection = RaindropComponents.schemas.Collection;

// Initialize OAuth service
const oauthConfig: OAuthConfig = {
  clientId: process.env.OAUTH_CLIENT_ID!,
  clientSecret: process.env.OAUTH_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
  authorizationEndpoint: 'https://raindrop.io/oauth/authorize',
  tokenEndpoint: 'https://raindrop.io/oauth/access_token',
};

const tokenStorage = new TokenStorage();
const oauthService = new OAuthService(oauthConfig, tokenStorage);

/**
 * Token verification for MCP authentication
 */
const verifyToken = async (
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  try {
    // Method 1: OAuth session ID
    if (bearerToken) {
      try {
        const raindropToken = await oauthService.ensureValidToken(bearerToken);
        return {
          token: raindropToken,
          scopes: ['raindrop:read', 'raindrop:write'],
          clientId: 'oauth-session',
          extra: { sessionId: bearerToken },
        };
      } catch (error) {
        // Session invalid, continue to other methods
      }
    }

    // Method 2: Direct Raindrop token from header
    const directToken = req.headers.get('x-raindrop-token');
    if (directToken) {
      return {
        token: directToken,
        scopes: ['raindrop:read', 'raindrop:write'],
        clientId: 'direct-token',
        extra: { method: 'header' },
      };
    }

    // Method 3: Environment token (development fallback)
    const envToken = process.env.RAINDROP_ACCESS_TOKEN;
    if (envToken && process.env.NODE_ENV !== 'production') {
      return {
        token: envToken,
        scopes: ['raindrop:read', 'raindrop:write'],
        clientId: 'env-token',
        extra: { method: 'environment' },
      };
    }

    return undefined;
  } catch (error) {
    console.error('Token verification error:', error);
    return undefined;
  }
};

/**
 * Create MCP handler with Raindrop tools
 * Uses request-scoped RaindropService based on auth token
 */
const baseHandler = async (req: Request): Promise<Response> => {
  // Get auth info from request (set by withMcpAuth)
  const authInfo = (req as unknown as { auth?: AuthInfo }).auth;

  if (!authInfo?.token) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Authentication required'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const raindropToken = authInfo.token as string;
  const raindropService = new RaindropService(raindropToken);

  // Create handler with access to raindropService via closure
  const handler = createMcpHandler(
    (server) => {
      // Helper functions
      const textContent = (text: string) => ({ type: 'text' as const, text });
      const makeCollectionLink = (collection: Collection) => ({
        type: 'resource_link' as const,
        uri: `raindrop://collection/${collection._id}`,
        name: collection.title || `Collection ${collection._id}`,
        description: collection.description || `Collection with ${collection.count ?? 0} bookmarks`,
        mimeType: 'application/json',
      });
      const makeBookmarkLink = (bookmark: Bookmark) => ({
        type: 'resource_link' as const,
        uri: `raindrop://bookmark/${bookmark._id}`,
        name: bookmark.title || bookmark.link || `Bookmark ${bookmark._id}`,
        description: bookmark.excerpt || bookmark.link,
        mimeType: 'application/json',
      });

      // Resources
      server.registerResource(
        'user_profile',
        'raindrop://user/profile',
        {
          title: 'User Profile',
          description: 'Authenticated user profile information from Raindrop.io',
          mimeType: 'application/json',
        },
        async (uri) => {
          const user = await raindropService.getUserInfo();
          return {
            contents: [
              {
                uri: uri.toString(),
                mimeType: 'application/json',
                text: JSON.stringify(user, null, 2),
              },
            ],
          };
        }
      );

      server.registerResource(
        'collections',
        'raindrop://collections',
        {
          title: 'Collections',
          description: 'List of collections available to the authenticated user',
          mimeType: 'application/json',
        },
        async (uri) => {
          const collections = await raindropService.getCollections();
          return {
            contents: [
              {
                uri: uri.toString(),
                mimeType: 'application/json',
                text: JSON.stringify(collections, null, 2),
              },
            ],
          };
        }
      );

      server.registerResource(
        'collection',
        new ResourceTemplate('raindrop://collection/{id}', {
          list: undefined,
        }),
        {
          title: 'Collection',
          description: 'A single Raindrop.io collection by ID',
          mimeType: 'application/json',
        },
        async (uri) => {
          const id = parseInt(uri.pathname.slice(1), 10);
          if (!Number.isFinite(id)) {
            throw new Error(`Invalid collection ID in uri: ${uri.toString()}`);
          }
          const collection = await raindropService.getCollection(id);
          return {
            contents: [
              {
                uri: uri.toString(),
                mimeType: 'application/json',
                text: JSON.stringify(collection, null, 2),
              },
            ],
          };
        }
      );

      server.registerResource(
        'bookmark',
        new ResourceTemplate('raindrop://bookmark/{id}', {
          list: undefined,
        }),
        {
          title: 'Bookmark',
          description: 'A single Raindrop.io bookmark by ID',
          mimeType: 'application/json',
        },
        async (uri) => {
          const id = parseInt(uri.pathname.slice(1), 10);
          if (!Number.isFinite(id)) {
            throw new Error(`Invalid bookmark ID in uri: ${uri.toString()}`);
          }
          const bookmark = await raindropService.getBookmark(id);
          return {
            contents: [
              {
                uri: uri.toString(),
                mimeType: 'application/json',
                text: JSON.stringify(bookmark, null, 2),
              },
            ],
          };
        }
      );

      // Tool 1: List Collections
      server.registerTool(
        'collection_list',
        {
          title: 'Collection List',
          description: 'List all Raindrop.io collections',
          inputSchema: {},
        },
        async () => {
          const collections = await raindropService.getCollections();
          return {
            content: [
              textContent(`Found ${collections.length} collections`),
              ...collections.map(makeCollectionLink),
            ],
          };
        }
      );

      // Tool 2: Manage Collections
      server.registerTool(
        'collection_manage',
        {
          title: 'Collection Manage',
          description: 'Create, update, or delete a collection',
          inputSchema: CollectionManageInputSchema.shape,
        },
        async (args: z.infer<typeof CollectionManageInputSchema>) => {
          switch (args.operation) {
            case 'create':
              if (!args.title) throw new Error('title required for create');
              const created = await raindropService.createCollection(args.title, args.public);
              return {
                content: [
                  textContent(`Created collection: ${created.title}`),
                  makeCollectionLink(created),
                ],
              };
            case 'update':
              if (!args.id) throw new Error('id required for update');
              const updates: Partial<Collection> = {};
              if (args.title !== undefined) updates.title = args.title;
              if (args.description !== undefined) updates.description = args.description;
              if (args.color !== undefined) updates.color = args.color;
              if (args.public !== undefined) updates.public = args.public;
              const updated = await raindropService.updateCollection(args.id, updates);
              return {
                content: [
                  textContent(`Updated collection ${args.id}`),
                  makeCollectionLink(updated),
                ],
              };
            case 'delete':
              if (!args.id) throw new Error('id required for delete');
              await raindropService.deleteCollection(args.id);
              return { content: [textContent(`Deleted collection ${args.id}`)] };
            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
        }
      );

      // Tool 3: Search Bookmarks
      server.registerTool(
        'bookmark_search',
        {
          title: 'Bookmark Search',
          description: 'Search bookmarks with filters',
          inputSchema: BookmarkSearchInputSchema.shape,
        },
        async (args: z.infer<typeof BookmarkSearchInputSchema>) => {
          const result = await raindropService.getBookmarks({
            collection: args.collection,
            search: args.search,
            tags: args.tags,
            important: args.important,
            page: args.page,
            perPage: args.perPage,
            sort: args.sort,
          });
          return {
            content: [
              textContent(`Found ${result.items.length} bookmarks (total: ${result.count})`),
              ...result.items.map(makeBookmarkLink),
            ],
          };
        }
      );

      // Tool 4: Manage Bookmarks
      server.registerTool(
        'bookmark_manage',
        {
          title: 'Bookmark Manage',
          description: 'Create, update, delete, or get suggestions for a bookmark',
          inputSchema: BookmarkManageInputSchema.shape,
        },
        async (args: z.infer<typeof BookmarkManageInputSchema>) => {
          switch (args.operation) {
            case 'create':
              if (!args.url) throw new Error('url required for create');
              const created = await raindropService.createBookmark(
                args.collectionId || -1, // -1 = Unsorted
                {
                  link: args.url,
                  title: args.title,
                  excerpt: args.description,
                  tags: args.tags,
                  important: args.important,
                }
              );
              return {
                content: [
                  textContent(`Created: ${created.title || created.link}`),
                  makeBookmarkLink(created),
                ],
              };
            case 'update':
              if (!args.id) throw new Error('id required for update');
              const updates: Partial<Bookmark> = {};
              if (args.title !== undefined) updates.title = args.title;
              if (args.description !== undefined) updates.excerpt = args.description;
              if (args.tags !== undefined) updates.tags = args.tags;
              if (args.important !== undefined) updates.important = args.important;
              if (args.collectionId !== undefined) updates.collection = { $id: args.collectionId };
              const updated = await raindropService.updateBookmark(args.id, updates);
              return {
                content: [
                  textContent(`Updated bookmark ${args.id}`),
                  makeBookmarkLink(updated),
                ],
              };
            case 'suggest':
              if (!args.url) throw new Error('url required for suggest');
              const suggestions = await raindropService.getSuggestions(args.url);

              // Format suggestions for display
              const suggestionText = [];
              if (suggestions.collections && suggestions.collections.length > 0) {
                const collectionIds = suggestions.collections.map(c => c.$id).join(', ');
                suggestionText.push(`Suggested collections: ${collectionIds}`);
              }
              if (suggestions.tags && suggestions.tags.length > 0) {
                suggestionText.push(`Suggested tags: ${suggestions.tags.join(', ')}`);
              }
              if (suggestionText.length === 0) {
                suggestionText.push('No suggestions available for this URL');
              }

              return {
                content: [textContent(suggestionText.join('\n'))],
              };
            case 'delete':
              if (!args.id) throw new Error('id required for delete');
              await raindropService.deleteBookmark(args.id);
              return { content: [textContent(`Deleted bookmark ${args.id}`)] };
            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
        }
      );

      // Tool 5: List Tags
      server.registerTool(
        'tag_list',
        {
          title: 'Tag List',
          description: 'List all tags',
          inputSchema: TagInputSchema.shape,
        },
        async (args: z.infer<typeof TagInputSchema>) => {
          const tags = await raindropService.getTags(args.collectionId);
          const tagList = tags.map((tag) => `${tag._id} (${tag.count})`).join(', ');
          return { content: [textContent(`Tags: ${tagList}`)] };
        }
      );

      // Tool 6: Manage Highlights
      server.registerTool(
        'highlight_manage',
        {
          title: 'Highlight Manage',
          description: 'Create, update, delete, or list highlights',
          inputSchema: HighlightManageInputSchema.shape,
        },
        async (args: z.infer<typeof HighlightManageInputSchema>) => {
          switch (args.operation) {
            case 'create':
              if (!args.bookmarkId || !args.text) throw new Error('bookmarkId and text required');
              const created = await raindropService.createHighlight(
                args.bookmarkId,
                {
                  text: args.text,
                  color: args.color,
                  note: args.note,
                }
              );
              return { content: [textContent(`Created highlight: ${created._id}`)] };
            case 'update':
              if (!args.id) throw new Error('id required');
              const updates: { text?: string; note?: string; color?: string } = {};
              if (args.text !== undefined) updates.text = args.text;
              if (args.color !== undefined) updates.color = args.color;
              if (args.note !== undefined) updates.note = args.note;
              await raindropService.updateHighlight(args.id, updates);
              return { content: [textContent(`Updated highlight ${args.id}`)] };
            case 'delete':
              if (!args.id) throw new Error('id required');
              await raindropService.deleteHighlight(args.id);
              return { content: [textContent(`Deleted highlight ${args.id}`)] };
            case 'list':
              if (!args.bookmarkId) throw new Error('bookmarkId required');
              const highlights = await raindropService.getHighlights(args.bookmarkId);
              return {
                content: [
                  textContent(`Found ${highlights.length} highlights`),
                  textContent(JSON.stringify(highlights, null, 2)),
                ],
              };
            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
        }
      );

      // Tool 7: Bulk Edit Bookmarks
      server.registerTool(
        'bulk_edit_bookmarks',
        {
          title: 'Bulk Edit Bookmarks',
          description: 'Perform bulk operations on bookmarks',
          inputSchema: BulkEditInputSchema.shape,
        },
        async (args: z.infer<typeof BulkEditInputSchema>) => {
          const updates: {
            ids?: number[];
            important?: boolean;
            tags?: string[];
            media?: string[];
            cover?: string;
            collection?: { $id: number };
          } = {};
          if (args.ids !== undefined) {
            updates.ids = args.ids;
          }
          if (args.important !== undefined) updates.important = args.important;
          if (args.tags !== undefined) updates.tags = args.tags;
          if (args.media !== undefined) updates.media = args.media;
          if (args.cover) updates.cover = args.cover;
          if (args.moveToCollection) updates.collection = { $id: args.moveToCollection };

          const result = await raindropService.bulkUpdateBookmarks(args.collectionId, updates);
          return { content: [textContent(`Bulk updated ${result.modified} bookmarks`)] };
        }
      );

      // Tool 8: Get Bookmark Statistics
      server.registerTool(
        'bookmark_statistics',
        {
          title: 'Bookmark Statistics',
          description: 'Get bookmark statistics and filters',
          inputSchema: FilterStatsInputSchema.shape,
        },
        async (args: z.infer<typeof FilterStatsInputSchema>) => {
          const stats = await raindropService.getFilters(
            args.collectionId,
            {
              search: args.search,
              tagsSort: args.tagsSort,
            }
          );
          return { content: [textContent(JSON.stringify(stats, null, 2))] };
        }
      );
    },
    {
      serverInfo: {
        name: 'raindrop-mcp',
        version: '0.1.0',
      },
      capabilities: {
        tools: {},
        resources: {},
      },
    },
    {
      streamableHttpEndpoint: '/api/raindrop',
      disableSse: true,
      maxDuration: 300,
    }
  );

  return handler(req);
};

// Apply OAuth authentication
const authHandler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  requiredScopes: ['raindrop:read'],
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

// Export for Vercel Functions
export { authHandler as GET, authHandler as POST, authHandler as DELETE };
