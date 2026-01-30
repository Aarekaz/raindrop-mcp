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
import { AuthorizationServerService } from "../src/oauth/authorization-server.service.js";
import { decrypt } from "../src/oauth/crypto.utils.js";
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
import {
  CollectionListOutputSchema,
  BookmarkSearchOutputSchema,
  TagListOutputSchema,
  HighlightListOutputSchema,
  BulkEditOutputSchema,
  StatisticsOutputSchema,
  OperationResultSchema,
} from '../src/types/tool-outputs.js';

type Bookmark = RaindropComponents.schemas.Bookmark;
type Collection = RaindropComponents.schemas.Collection;

const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';

/**
 * Validate Origin header to prevent DNS rebinding attacks
 * Required by MCP Streamable HTTP specification
 */
function validateOrigin(req: Request): void {
  const origin = req.headers.get('origin');

  // Allow requests without Origin header (non-browser clients)
  if (!origin) {
    return;
  }

  const allowedOrigins = [
    'https://your-app.vercel.app', // Production domain
    'http://localhost:3000',        // Local development
    'http://127.0.0.1:3000',        // Local development (numeric)
  ];

  const isAllowed = allowedOrigins.some(allowed =>
    origin.startsWith(allowed)
  );

  if (!isAllowed) {
    throw new Error(`Invalid origin: ${origin}. Potential DNS rebinding attack.`);
  }
}

/**
 * Validate required environment variables
 * Throws with actionable error message if any are missing
 */
function validateEnvVars(required: string[]): void {
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n\n` +
      `For OAuth deployment, you need:\n` +
      `  - OAUTH_CLIENT_ID (from https://app.raindrop.io/settings/integrations)\n` +
      `  - OAUTH_CLIENT_SECRET (from Raindrop OAuth app)\n` +
      `  - OAUTH_REDIRECT_URI (e.g., https://your-app.vercel.app/auth/callback)\n` +
      `  - TOKEN_ENCRYPTION_KEY (generate: openssl rand -hex 32)\n` +
      `  - KV_REST_API_URL and KV_REST_API_TOKEN (auto-set when you attach Vercel KV)\n\n` +
      `For direct token deployment (no OAuth), you need:\n` +
      `  - RAINDROP_ACCESS_TOKEN (from Raindrop settings)\n\n` +
      `See docs/DEPLOYMENT.md for full setup instructions.`
    );
  }
}

// Validate OAuth environment variables (if using OAuth)
if (process.env.OAUTH_CLIENT_ID || process.env.OAUTH_CLIENT_SECRET) {
  // If any OAuth vars are set, require all of them
  validateEnvVars([
    'OAUTH_CLIENT_ID',
    'OAUTH_CLIENT_SECRET',
    'OAUTH_REDIRECT_URI',
    'TOKEN_ENCRYPTION_KEY',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
  ]);
}

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
const authServerService = new AuthorizationServerService(tokenStorage);

/**
 * Token verification for MCP authentication
 * Supports both JWT tokens (new) and session-based auth (legacy)
 */
const verifyToken = async (
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  try {
    // Method 1: JWT token (contains '.' separators)
    if (bearerToken && bearerToken.includes('.')) {
      try {
        const payload = await authServerService.verifyJWT(bearerToken);

        // Get user's Raindrop token for backend API calls
        const encryptedToken = await tokenStorage.getUserRaindropToken(payload.sub);
        if (!encryptedToken) {
          console.error('No Raindrop token found for user:', payload.sub);
          return undefined;
        }

        const raindropToken = decrypt(encryptedToken);

        return {
          token: raindropToken,
          scopes: payload.scope.split(' '),
          clientId: payload.client_id,
          extra: {
            userId: payload.sub,
            jwtPayload: payload,
            authMethod: 'jwt',
          },
        };
      } catch (error) {
        console.error('JWT verification failed:', error);
        // JWT invalid, continue to other methods
      }
    }

    // Method 2: OAuth session ID (legacy/backward compatibility)
    if (bearerToken && !bearerToken.includes('.')) {
      try {
        const raindropToken = await oauthService.ensureValidToken(bearerToken);
        return {
          token: raindropToken,
          scopes: ['raindrop:read', 'raindrop:write'],
          clientId: 'oauth-session',
          extra: {
            sessionId: bearerToken,
            authMethod: 'session',
          },
        };
      } catch (error) {
        // Session invalid, continue to other methods
      }
    }

    // Method 3: Direct Raindrop token from header
    const directToken = req.headers.get('x-raindrop-token');
    if (directToken) {
      return {
        token: directToken,
        scopes: ['raindrop:read', 'raindrop:write'],
        clientId: 'direct-token',
        extra: {
          method: 'header',
          authMethod: 'direct',
        },
      };
    }

    // Method 4: Environment token (development fallback)
    const envToken = process.env.RAINDROP_ACCESS_TOKEN;
    if (envToken) {
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          'WARNING: Using RAINDROP_ACCESS_TOKEN in production. ' +
          'This is not recommended. Use OAuth instead for multi-user support.'
        );
      }
      return {
        token: envToken,
        scopes: ['raindrop:read', 'raindrop:write'],
        clientId: 'env-token',
        extra: {
          method: 'environment',
          authMethod: 'env',
        },
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
  // Validate origin to prevent DNS rebinding attacks
  try {
    validateOrigin(req);
  } catch (error) {
    console.error('Origin validation failed:', error);
    return new Response('Forbidden', { status: 403 });
  }

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
          outputSchema: CollectionListOutputSchema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async () => {
          const collections = await raindropService.getCollections();
          return {
            content: [
              textContent(`Found ${collections.length} collections`),
              ...collections.map(makeCollectionLink),
            ],
            structuredContent: {
              collections,
              total: collections.length,
            },
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
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof CollectionManageInputSchema>) => {
          switch (args.operation) {
            case 'create':
              if (!args.title) {
                throw new Error(
                  'title required for create. ' +
                  'Provide a descriptive collection name (e.g., "Research Papers", "Tutorial Videos"). ' +
                  'Collections organize your bookmarks into categories. ' +
                  'Optionally set public=true to share the collection publicly.'
                );
              }
              const created = await raindropService.createCollection(args.title, args.public);
              return {
                content: [
                  textContent(`Created collection: ${created.title}`),
                  makeCollectionLink(created),
                ],
                structuredContent: {
                  success: true,
                  message: `Created collection: ${created.title}`,
                  resourceUri: `raindrop://collection/${created._id}`,
                },
              };
            case 'update':
              if (!args.id) {
                throw new Error(
                  'id required for update. ' +
                  'Use collection_list to see available collections and their IDs. ' +
                  'Collection IDs are visible in the raindrop://collection/{id} resource URIs.'
                );
              }
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
                structuredContent: {
                  success: true,
                  message: `Updated collection ${args.id}`,
                  resourceUri: `raindrop://collection/${updated._id}`,
                },
              };
            case 'delete':
              if (!args.id) {
                throw new Error(
                  'id required for delete. ' +
                  'Use collection_list to find the collection you want to delete. ' +
                  'WARNING: Deleting a collection moves all its bookmarks to "Unsorted". ' +
                  'The operation is permanent. Consider renaming or archiving instead.'
                );
              }
              await raindropService.deleteCollection(args.id);
              return {
                content: [textContent(`Deleted collection ${args.id}`)],
                structuredContent: {
                  success: true,
                  message: `Deleted collection ${args.id}`,
                },
              };
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
          outputSchema: BookmarkSearchOutputSchema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
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
          const page = args.page ?? 1;
          const perPage = args.perPage ?? 25;
          const hasMore = result.count > page * perPage;
          return {
            content: [
              textContent(`Found ${result.items.length} bookmarks (total: ${result.count})`),
              ...result.items.map(makeBookmarkLink),
            ],
            structuredContent: {
              bookmarks: result.items,
              total: result.count,
              page,
              hasMore,
            },
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
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof BookmarkManageInputSchema>) => {
          switch (args.operation) {
            case 'create':
              if (!args.url) {
                throw new Error(
                  'url required for create. ' +
                  'Provide a valid URL (e.g., "https://example.com/article"). ' +
                  'The URL will be automatically parsed and metadata extracted by Raindrop.io. ' +
                  'Use the "suggest" operation first to get AI-powered collection and tag recommendations.'
                );
              }
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
                structuredContent: {
                  success: true,
                  message: `Created: ${created.title || created.link}`,
                  resourceUri: `raindrop://bookmark/${created._id}`,
                },
              };
            case 'update':
              if (!args.id) {
                throw new Error(
                  'id required for update. ' +
                  'Use bookmark_search to find bookmark IDs, or check the raindrop://bookmark/{id} resource. ' +
                  'Bookmark IDs are numeric values returned by bookmark_search and visible in resource URIs.'
                );
              }
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
                structuredContent: {
                  success: true,
                  message: `Updated bookmark ${args.id}`,
                  resourceUri: `raindrop://bookmark/${updated._id}`,
                },
              };
            case 'suggest':
              if (!args.url) {
                throw new Error(
                  'url required for suggest. ' +
                  'Provide a URL to get AI-powered collection and tag suggestions. ' +
                  'Example: "https://github.com/openai/gpt-4" would suggest tags like "ai", "github", "openai". ' +
                  'Use these suggestions when creating bookmarks with bookmark_manage create.'
                );
              }
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
                structuredContent: {
                  success: true,
                  message: suggestionText.join('\n'),
                },
              };
            case 'delete':
              if (!args.id) {
                throw new Error(
                  'id required for delete. ' +
                  'Use bookmark_search to find the bookmark you want to delete. ' +
                  'WARNING: This operation is destructive and cannot be undone. ' +
                  'Consider using bookmark_manage update with important=false instead of deleting.'
                );
              }
              await raindropService.deleteBookmark(args.id);
              return {
                content: [textContent(`Deleted bookmark ${args.id}`)],
                structuredContent: {
                  success: true,
                  message: `Deleted bookmark ${args.id}`,
                },
              };
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
          outputSchema: TagListOutputSchema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof TagInputSchema>) => {
          const tags = await raindropService.getTags(args.collectionId);
          const tagList = tags.map((tag) => `${tag._id} (${tag.count})`).join(', ');
          return {
            content: [textContent(`Tags: ${tagList}`)],
            structuredContent: {
              tags,
              total: tags.length,
            },
          };
        }
      );

      // Tool 6: Manage Highlights
      server.registerTool(
        'highlight_manage',
        {
          title: 'Highlight Manage',
          description: 'Create, update, delete, or list highlights',
          inputSchema: HighlightManageInputSchema.shape,
          outputSchema: HighlightListOutputSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof HighlightManageInputSchema>) => {
          switch (args.operation) {
            case 'create':
              if (!args.bookmarkId || !args.text) {
                throw new Error(
                  'bookmarkId and text required for creating highlights. ' +
                  'Use bookmark_search to find the bookmark, then provide the text you want to highlight. ' +
                  'Optionally add a note or color (yellow, blue, green, red). ' +
                  'Example: text="Important quote here", color="yellow", note="Remember this!"'
                );
              }
              const created = await raindropService.createHighlight(
                args.bookmarkId,
                {
                  text: args.text,
                  color: args.color,
                  note: args.note,
                }
              );
              return {
                content: [textContent(`Created highlight: ${created._id}`)],
                structuredContent: {
                  highlights: [created],
                  total: 1,
                },
              };
            case 'update':
              if (!args.id) {
                throw new Error(
                  'id required for update. ' +
                  'Use highlight_manage list with bookmarkId to see existing highlights. ' +
                  'Highlight IDs are string values (e.g., "65abc123def456").'
                );
              }
              const updates: { text?: string; note?: string; color?: string } = {};
              if (args.text !== undefined) updates.text = args.text;
              if (args.color !== undefined) updates.color = args.color;
              if (args.note !== undefined) updates.note = args.note;
              await raindropService.updateHighlight(args.id, updates);
              return {
                content: [textContent(`Updated highlight ${args.id}`)],
                structuredContent: {
                  highlights: [],
                  total: 0,
                },
              };
            case 'delete':
              if (!args.id) {
                throw new Error(
                  'id required for delete. ' +
                  'Use highlight_manage list to find highlight IDs. ' +
                  'Deleting a highlight removes the annotation permanently from the bookmark.'
                );
              }
              await raindropService.deleteHighlight(args.id);
              return {
                content: [textContent(`Deleted highlight ${args.id}`)],
                structuredContent: {
                  highlights: [],
                  total: 0,
                },
              };
            case 'list':
              if (!args.bookmarkId) {
                throw new Error(
                  'bookmarkId required for listing highlights. ' +
                  'Use bookmark_search to find the bookmark, then use its ID here. ' +
                  'This will return all highlights (annotations) saved for that bookmark.'
                );
              }
              const highlights = await raindropService.getHighlights(args.bookmarkId);
              return {
                content: [
                  textContent(`Found ${highlights.length} highlights`),
                  textContent(JSON.stringify(highlights, null, 2)),
                ],
                structuredContent: {
                  highlights,
                  total: highlights.length,
                },
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
          outputSchema: BulkEditOutputSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof BulkEditInputSchema>) => {
          if (!args.ids || args.ids.length === 0) {
            throw new Error(
              'ids array required for bulk operations. ' +
              'Use bookmark_search to find multiple bookmarks, then provide their IDs as an array. ' +
              'Example: ids=[123, 456, 789] to update three bookmarks at once. ' +
              'You can update tags, important status, or move bookmarks to different collections.'
            );
          }
          if (!args.collectionId) {
            throw new Error(
              'collectionId required for bulk operations. ' +
              'Specify which collection the bookmarks are currently in. ' +
              'Use collection_list to find collection IDs. ' +
              'This is required by the Raindrop.io API for bulk operations.'
            );
          }

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
          return {
            content: [textContent(`Bulk updated ${result.modified} bookmarks`)],
            structuredContent: {
              modified: result.modified,
              bookmarkIds: args.ids,
            },
          };
        }
      );

      // Tool 8: Get Bookmark Statistics
      server.registerTool(
        'bookmark_statistics',
        {
          title: 'Bookmark Statistics',
          description: 'Get bookmark statistics and filters',
          inputSchema: FilterStatsInputSchema.shape,
          outputSchema: StatisticsOutputSchema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof FilterStatsInputSchema>) => {
          const stats = await raindropService.getFilters(
            args.collectionId,
            {
              search: args.search,
              tagsSort: args.tagsSort,
            }
          );
          return {
            content: [textContent(JSON.stringify(stats, null, 2))],
            structuredContent: stats,
          };
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
      streamableHttpEndpoint: '/mcp',
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
  resourceMetadataPath: RESOURCE_METADATA_PATH,
});

// Add CORS headers to all responses
const withCors = (handler: (req: Request) => Promise<Response>) => {
  return async (req: Request): Promise<Response> => {
    const response = await handler(req);
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Raindrop-Token');
    if (response.status === 401 && !headers.has('WWW-Authenticate')) {
      const resourceMetadataUrl = new URL(RESOURCE_METADATA_PATH, req.url).toString();
      headers.set('WWW-Authenticate', `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}"`);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
};

// CORS preflight handler
const corsHandler = async (_req: Request): Promise<Response> => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Raindrop-Token',
      'Access-Control-Max-Age': '86400',
    },
  });
};

// HEAD handler (returns same headers as GET but no body)
const headHandler = async (_req: Request): Promise<Response> => {
  const response = await authHandler(_req);
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
};

// Wrap with CORS support
const corsAuthHandler = withCors(authHandler);
const corsHeadHandler = withCors(headHandler);

// Streamable HTTP transport requires GET, POST, DELETE, and OPTIONS (for CORS)
// HEAD is also supported for endpoint health checks
export {
  corsAuthHandler as GET,
  corsAuthHandler as POST,
  corsAuthHandler as DELETE,
  corsHeadHandler as HEAD,
  corsHandler as OPTIONS
};
