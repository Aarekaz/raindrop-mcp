/**
 * Raindrop MCP Server - Vercel Deployment
 *
 * Main MCP endpoint using mcp-handler for Vercel Functions.
 * Provides tools for Raindrop.io bookmark management with OAuth authentication.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { RaindropService } from "../src/services/raindrop.service.js";
import { OAuthService } from "../src/oauth/oauth.service.js";
import { TokenStorage } from "../src/oauth/token-storage.js";
import { OAuthConfig } from "../src/oauth/oauth.types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  BookmarkManageInputSchema,
  BookmarkSearchInputSchema,
  CollectionManageInputSchema,
  TagInputSchema,
  HighlightManageInputSchema,
  BulkEditInputSchema,
  FilterStatsInputSchema,
} from "../src/types/raindrop-zod.schemas.js";

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
  const authInfo = (req as any).auth as AuthInfo | undefined;

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
      const makeCollectionLink = (collection: any) => ({
        type: 'resource' as const,
        resource: {
          uri: `raindrop://collection/${collection._id}`,
          name: collection.title || 'Untitled Collection',
          description: collection.description || `Collection with ${collection.count || 0} bookmarks`,
          mimeType: 'application/json',
        },
      });
      const makeBookmarkLink = (bookmark: any) => ({
        type: 'resource' as const,
        resource: {
          uri: `raindrop://bookmark/${bookmark._id}`,
          name: bookmark.title || 'Untitled',
          description: bookmark.excerpt || bookmark.link || 'No description',
          mimeType: 'application/json',
        },
      });

      // Tool 1: List Collections
      server.tool(
        'collection_list',
        'List all Raindrop.io collections',
        {},
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
      server.tool(
        'collection_manage',
        'Create, update, or delete a collection',
        CollectionManageInputSchema.shape,
        async (args: any) => {
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
              const updates: Record<string, any> = {};
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
      server.tool(
        'bookmark_search',
        'Search bookmarks with filters',
        BookmarkSearchInputSchema.shape,
        async (args: any) => {
          const result = await raindropService.getBookmarks({
            collection: args.collectionId,
            search: args.search,
            tag: args.tag,
            page: args.page,
            perPage: args.perpage,
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
      server.tool(
        'bookmark_manage',
        'Create, update, or delete a bookmark',
        BookmarkManageInputSchema.shape,
        async (args: any) => {
          switch (args.operation) {
            case 'create':
              if (!args.link) throw new Error('link required for create');
              const created = await raindropService.createBookmark(
                args.collectionId || -1, // -1 = Unsorted
                {
                  link: args.link,
                  title: args.title,
                  excerpt: args.excerpt,
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
              const updates: Record<string, any> = {};
              if (args.title !== undefined) updates.title = args.title;
              if (args.excerpt !== undefined) updates.excerpt = args.excerpt;
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
      server.tool(
        'tag_list',
        'List all tags',
        TagInputSchema.shape,
        async (args: any) => {
          const tags = await raindropService.getTags(args.collectionId);
          const tagList = tags.map((tag: any) => `${tag._id} (${tag.count})`).join(', ');
          return { content: [textContent(`Tags: ${tagList}`)] };
        }
      );

      // Tool 6: Manage Highlights
      server.tool(
        'highlight_manage',
        'Create, update, or delete highlights',
        HighlightManageInputSchema.shape,
        async (args: any) => {
          switch (args.operation) {
            case 'create':
              if (!args.raindropId || !args.text) throw new Error('raindropId and text required');
              const created = await raindropService.createHighlight(
                args.raindropId,
                {
                  text: args.text,
                  color: args.color,
                  note: args.note,
                }
              );
              return { content: [textContent(`Created highlight: ${created._id}`)] };
            case 'update':
              if (!args.highlightId) throw new Error('highlightId required');
              const updates: Record<string, any> = {};
              if (args.text !== undefined) updates.text = args.text;
              if (args.color !== undefined) updates.color = args.color;
              if (args.note !== undefined) updates.note = args.note;
              await raindropService.updateHighlight(args.highlightId, updates);
              return { content: [textContent(`Updated highlight ${args.highlightId}`)] };
            case 'delete':
              if (!args.highlightId) throw new Error('highlightId required');
              await raindropService.deleteHighlight(args.highlightId);
              return { content: [textContent(`Deleted highlight ${args.highlightId}`)] };
            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
        }
      );

      // Tool 7: Bulk Edit Bookmarks
      server.tool(
        'bulk_edit_bookmarks',
        'Perform bulk operations on bookmarks',
        BulkEditInputSchema.shape,
        async (args: any) => {
          if (!args.ids || args.ids.length === 0) {
            throw new Error('ids array required');
          }
          if (!args.collectionId) {
            throw new Error('collectionId required for bulk operations');
          }

          const updates: Record<string, any> = { ids: args.ids };
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
      server.tool(
        'bookmark_statistics',
        'Get bookmark statistics and filters',
        FilterStatsInputSchema.shape,
        async (args: any) => {
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
      name: 'raindrop-mcp',
      version: '1.0.0',
      description: 'MCP Server for Raindrop.io bookmark management',
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
