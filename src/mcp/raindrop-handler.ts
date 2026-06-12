/**
 * Raindrop MCP Server - Cloudflare Worker handler
 *
 * Main MCP endpoint using the MCP SDK's web-standard Streamable HTTP transport
 * with Worker env-scoped auth services.
 * Provides tools for Raindrop.io bookmark management with OAuth authentication.
 */

import { z } from "zod";
import { RaindropService } from "../services/raindrop.service.js";
import { OAuthService } from "../oauth/oauth.service.js";
import { TokenStorage } from "../oauth/token-storage.js";
import { OAuthConfig } from "../oauth/oauth.types.js";
import { AuthorizationServerService } from "../oauth/authorization-server.service.js";
import { CloudflareKVStore } from "../oauth/cloudflare-kv-store.js";
import { decrypt } from "../oauth/crypto.utils.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { components as RaindropComponents } from "../types/raindrop.schema.js";
import type { Env } from "../worker/env.js";
import {
  BookmarkManageInputSchema,
  BookmarkSearchInputSchema,
  CollectionManageInputSchema,
  CollectionChildrenInputSchema,
  CollectionBulkDeleteInputSchema,
  CollectionReorderInputSchema,
  CollectionExpandInputSchema,
  CollectionMergeInputSchema,
  CollectionCleanInputSchema,
  CollectionCoverUploadInputSchema,
  EmptyTrashInputSchema,
  UserStatsInputSchema,
  TagInputSchema,
  TagManageInputSchema,
  HighlightManageInputSchema,
  BulkEditInputSchema,
  FilterStatsInputSchema,
  RaindropCacheInputSchema,
  RaindropSuggestExistingInputSchema,
  RaindropBulkCreateInputSchema,
  RaindropBulkDeleteInputSchema,
  RaindropFileUploadInputSchema,
  RaindropCoverUploadInputSchema,
} from "../types/raindrop-zod.schemas.js";
import {
  CollectionListOutputSchema,
  BookmarkSearchOutputSchema,
  TagListOutputSchema,
  HighlightListOutputSchema,
  BulkEditOutputSchema,
  BulkDeleteOutputSchema,
  StatisticsOutputSchema,
  UserStatsOutputSchema,
  OperationResultSchema,
} from '../types/tool-outputs.js';

type Bookmark = RaindropComponents.schemas.Bookmark;
type Collection = RaindropComponents.schemas.Collection;
type ResponseBody = ConstructorParameters<typeof Response>[0];

const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';
const LOCALHOST_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:8787',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8787',
]);

function optionalOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return undefined;
  }
}

/**
 * Validate Origin header to prevent DNS rebinding attacks
 * Required by MCP Streamable HTTP specification
 */
function validateOrigin(req: Request, env: Env): void {
  const origin = req.headers.get('origin');

  // Allow requests without Origin header (non-browser clients)
  if (!origin) {
    return;
  }

  const requestOrigin = new URL(req.url).origin;
  const allowedOrigins = new Set<string>([
    requestOrigin,
    ...LOCALHOST_ORIGINS,
  ]);

  const jwtIssuerOrigin = optionalOrigin(env.JWT_ISSUER);
  if (jwtIssuerOrigin) {
    allowedOrigins.add(jwtIssuerOrigin);
  }

  const redirectOrigin = optionalOrigin(env.OAUTH_REDIRECT_URI);
  if (redirectOrigin) {
    allowedOrigins.add(redirectOrigin);
  }

  const isAllowed = allowedOrigins.has(origin);

  if (!isAllowed) {
    throw new Error(`Invalid origin: ${origin}. Potential DNS rebinding attack.`);
  }
}

function createTokenStorage(env: Env): TokenStorage {
  return new TokenStorage(new CloudflareKVStore(env.RAINDROP_AUTH_KV), env.TOKEN_ENCRYPTION_KEY);
}

function allowsEnvTokenAuth(env: Env): boolean {
  return env.ALLOW_ENV_TOKEN_AUTH === 'true';
}

function createOAuthService(env: Env, tokenStorage: TokenStorage): OAuthService {
  const oauthConfig: OAuthConfig = {
    clientId: env.OAUTH_CLIENT_ID ?? '',
    clientSecret: env.OAUTH_CLIENT_SECRET ?? '',
    redirectUri: env.OAUTH_REDIRECT_URI ?? '',
    authorizationEndpoint: 'https://raindrop.io/oauth/authorize',
    tokenEndpoint: 'https://raindrop.io/oauth/access_token',
  };

  return new OAuthService(oauthConfig, tokenStorage);
}

function createAuthorizationServerService(
  env: Env,
  tokenStorage: TokenStorage
): AuthorizationServerService {
  return new AuthorizationServerService(tokenStorage, {
    issuer: env.JWT_ISSUER,
    signingKey: env.JWT_SIGNING_KEY,
    accessTokenExpiry: env.JWT_ACCESS_TOKEN_EXPIRY,
    refreshTokenExpiry: env.JWT_REFRESH_TOKEN_EXPIRY,
  });
}

/**
 * Token verification for MCP authentication
 * Supports both JWT tokens (new) and session-based auth (legacy)
 */
function createVerifyToken(
  env: Env,
  tokenStorage: TokenStorage,
  oauthService: OAuthService,
  authServerService: AuthorizationServerService
): (req: Request, bearerToken?: string) => Promise<AuthInfo | undefined> {
  return async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
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

        const raindropToken = decrypt(encryptedToken, env.TOKEN_ENCRYPTION_KEY);

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
    const envToken = allowsEnvTokenAuth(env) ? env.RAINDROP_ACCESS_TOKEN : undefined;
    if (envToken) {
      if (env.NODE_ENV === 'production') {
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
}

function parseBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.get('Authorization');
  const [type, token] = authHeader?.split(' ') ?? [];
  return type?.toLowerCase() === 'bearer' ? token : undefined;
}

function getResourceMetadataUrl(req: Request): string {
  return new URL(RESOURCE_METADATA_PATH, req.url).toString();
}

function unauthorizedMcpResponse(req: Request, message: string): Response {
  return new Response(JSON.stringify({
    error: 'invalid_token',
    error_description: message,
  }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer error="invalid_token", error_description="${message}", resource_metadata="${getResourceMetadataUrl(req)}"`,
    },
  });
}

function forbiddenMcpResponse(req: Request, message: string): Response {
  return new Response(JSON.stringify({
    error: 'insufficient_scope',
    error_description: message,
  }), {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer error="insufficient_scope", error_description="${message}", resource_metadata="${getResourceMetadataUrl(req)}"`,
    },
  });
}

function mcpMethodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      Allow: 'POST, HEAD, OPTIONS',
    },
  });
}

async function verifyHeadAuth(
  env: Env,
  tokenStorage: TokenStorage,
  authServerService: AuthorizationServerService,
  req: Request
): Promise<AuthInfo | undefined> {
  const bearerToken = parseBearerToken(req);

  if (bearerToken?.includes('.')) {
    try {
      const payload = await authServerService.verifyJWT(bearerToken);
      const encryptedToken = await tokenStorage.getUserRaindropToken(payload.sub);

      if (!encryptedToken) {
        return undefined;
      }

      return {
        token: decrypt(encryptedToken, env.TOKEN_ENCRYPTION_KEY),
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
    }
  }

  if (bearerToken && !bearerToken.includes('.')) {
    const session = await tokenStorage.getSession(bearerToken);
    if (session && session.expiresAt > Date.now()) {
      return {
        token: session.accessToken,
        scopes: ['raindrop:read', 'raindrop:write'],
        clientId: 'oauth-session',
        extra: {
          sessionId: bearerToken,
          authMethod: 'session',
        },
      };
    }
  }

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

  if (allowsEnvTokenAuth(env) && env.RAINDROP_ACCESS_TOKEN) {
    return {
      token: env.RAINDROP_ACCESS_TOKEN,
      scopes: ['raindrop:read', 'raindrop:write'],
      clientId: 'env-token',
      extra: {
        method: 'environment',
        authMethod: 'env',
      },
    };
  }

  return undefined;
}

/**
 * Create MCP handler with Raindrop tools
 * Uses request-scoped RaindropService based on auth token
 */
function createBaseHandler(env: Env): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
  // Validate origin to prevent DNS rebinding attacks
  try {
    validateOrigin(req, env);
  } catch (error) {
    console.warn('Origin validation failed:', error instanceof Error ? error.message : String(error));
    return new Response('Forbidden', { status: 403 });
  }

  // Get auth info from request (set by the Worker auth wrapper)
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

  const server = new McpServer(
    {
      name: 'raindrop-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

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

      server.registerTool(
        'collection_children_list',
        {
          title: 'Collection Children List',
          description: 'List all nested (child) collections',
          inputSchema: CollectionChildrenInputSchema.shape,
          outputSchema: CollectionListOutputSchema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async () => {
          const collections = await raindropService.getChildCollections();
          return {
            content: [
              textContent(`Found ${collections.length} child collections`),
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

      server.registerTool(
        'collection_bulk_delete',
        {
          title: 'Collection Bulk Delete',
          description: 'Delete multiple collections by ID',
          inputSchema: CollectionBulkDeleteInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof CollectionBulkDeleteInputSchema>) => {
          await raindropService.deleteCollections(args.ids);
          return {
            content: [textContent(`Deleted ${args.ids.length} collections`)],
            structuredContent: {
              success: true,
              message: `Deleted ${args.ids.length} collections`,
            },
          };
        }
      );

      server.registerTool(
        'collection_reorder',
        {
          title: 'Collection Reorder',
          description: 'Reorder all collections by title or count',
          inputSchema: CollectionReorderInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof CollectionReorderInputSchema>) => {
          await raindropService.reorderCollections(args.sort);
          return {
            content: [textContent(`Reordered collections by ${args.sort}`)],
            structuredContent: {
              success: true,
              message: `Reordered collections by ${args.sort}`,
            },
          };
        }
      );

      server.registerTool(
        'collection_expand',
        {
          title: 'Collection Expand/Collapse',
          description: 'Expand or collapse all collections',
          inputSchema: CollectionExpandInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof CollectionExpandInputSchema>) => {
          await raindropService.setCollectionsExpanded(args.expanded);
          return {
            content: [textContent(`${args.expanded ? 'Expanded' : 'Collapsed'} all collections`)],
            structuredContent: {
              success: true,
              message: `${args.expanded ? 'Expanded' : 'Collapsed'} all collections`,
            },
          };
        }
      );

      server.registerTool(
        'collection_merge',
        {
          title: 'Collection Merge',
          description: 'Merge multiple collections into one',
          inputSchema: CollectionMergeInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof CollectionMergeInputSchema>) => {
          await raindropService.mergeCollections(args.to, args.ids);
          return {
            content: [textContent(`Merged ${args.ids.length} collections into ${args.to}`)],
            structuredContent: {
              success: true,
              message: `Merged ${args.ids.length} collections into ${args.to}`,
              resourceUri: `raindrop://collection/${args.to}`,
            },
          };
        }
      );

      server.registerTool(
        'collection_clean',
        {
          title: 'Collection Clean',
          description: 'Remove all empty collections',
          inputSchema: CollectionCleanInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async () => {
          const result = await raindropService.cleanCollections();
          return {
            content: [textContent(`Removed ${result.count} empty collections`)],
            structuredContent: {
              success: true,
              message: `Removed ${result.count} empty collections`,
            },
          };
        }
      );

      server.registerTool(
        'collection_empty_trash',
        {
          title: 'Collection Empty Trash',
          description: 'Permanently delete all bookmarks in Trash',
          inputSchema: EmptyTrashInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async () => {
          await raindropService.emptyTrash();
          return {
            content: [textContent('Emptied Trash collection')],
            structuredContent: {
              success: true,
              message: 'Emptied Trash collection',
            },
          };
        }
      );

      server.registerTool(
        'collection_cover_upload',
        {
          title: 'Collection Cover Upload',
          description: 'Upload a cover image for a collection (base64)',
          inputSchema: CollectionCoverUploadInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof CollectionCoverUploadInputSchema>) => {
          await raindropService.uploadCollectionCover(
            args.id,
            args.fileBase64,
            args.fileName,
            args.mimeType
          );
          return {
            content: [textContent(`Uploaded cover for collection ${args.id}`)],
            structuredContent: {
              success: true,
              message: `Uploaded cover for collection ${args.id}`,
              resourceUri: `raindrop://collection/${args.id}`,
            },
          };
        }
      );

      server.registerTool(
        'user_stats',
        {
          title: 'User Stats',
          description: 'Get system collection counts and metadata',
          inputSchema: UserStatsInputSchema.shape,
          outputSchema: UserStatsOutputSchema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async () => {
          const stats = await raindropService.getUserStats();
          return {
            content: [textContent('Fetched user stats')],
            structuredContent: stats,
          };
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

      server.registerTool(
        'bookmark_cache',
        {
          title: 'Bookmark Cache',
          description: 'Get permanent cache URL for a bookmark (PRO)',
          inputSchema: RaindropCacheInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof RaindropCacheInputSchema>) => {
          const url = await raindropService.getRaindropCacheUrl(args.id);
          return {
            content: [textContent(`Cache URL: ${url}`)],
            structuredContent: {
              success: true,
              message: url,
            },
          };
        }
      );

      server.registerTool(
        'bookmark_suggest_existing',
        {
          title: 'Bookmark Suggest Existing',
          description: 'Get collection/tag suggestions for an existing bookmark',
          inputSchema: RaindropSuggestExistingInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof RaindropSuggestExistingInputSchema>) => {
          const suggestions = await raindropService.getSuggestionsForBookmark(args.id);
          return {
            content: [textContent('Suggestions ready')],
            structuredContent: {
              success: true,
              message: JSON.stringify(suggestions),
            },
          };
        }
      );

      server.registerTool(
        'bookmark_bulk_create',
        {
          title: 'Bookmark Bulk Create',
          description: 'Create multiple bookmarks in a single request',
          inputSchema: RaindropBulkCreateInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof RaindropBulkCreateInputSchema>) => {
          const created = await raindropService.bulkCreateBookmarks(args.items);
          return {
            content: [textContent(`Created ${created.length} bookmarks`)],
            structuredContent: {
              success: true,
              message: `Created ${created.length} bookmarks`,
            },
          };
        }
      );

      server.registerTool(
        'bookmark_bulk_delete',
        {
          title: 'Bookmark Bulk Delete',
          description: 'Delete multiple bookmarks in a collection',
          inputSchema: RaindropBulkDeleteInputSchema.shape,
          outputSchema: BulkDeleteOutputSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof RaindropBulkDeleteInputSchema>) => {
          const result = await raindropService.bulkDeleteBookmarks(
            args.collectionId,
            {
              ids: args.ids,
              search: args.search,
              nested: args.nested,
            }
          );
          return {
            content: [textContent(`Deleted ${result.modified} bookmarks`)],
            structuredContent: {
              modified: result.modified,
            },
          };
        }
      );

      server.registerTool(
        'bookmark_file_upload',
        {
          title: 'Bookmark File Upload',
          description: 'Upload a file as a bookmark (base64)',
          inputSchema: RaindropFileUploadInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof RaindropFileUploadInputSchema>) => {
          const item = await raindropService.uploadRaindropFile(
            args.fileBase64,
            args.fileName,
            args.mimeType,
            args.collectionId
          );
          return {
            content: [textContent(`Uploaded file bookmark ${item._id}`)],
            structuredContent: {
              success: true,
              message: `Uploaded file bookmark ${item._id}`,
              resourceUri: `raindrop://bookmark/${item._id}`,
            },
          };
        }
      );

      server.registerTool(
        'bookmark_cover_upload',
        {
          title: 'Bookmark Cover Upload',
          description: 'Upload a cover image for a bookmark (base64)',
          inputSchema: RaindropCoverUploadInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof RaindropCoverUploadInputSchema>) => {
          await raindropService.uploadRaindropCover(
            args.id,
            args.fileBase64,
            args.fileName,
            args.mimeType
          );
          return {
            content: [textContent(`Uploaded cover for bookmark ${args.id}`)],
            structuredContent: {
              success: true,
              message: `Uploaded cover for bookmark ${args.id}`,
              resourceUri: `raindrop://bookmark/${args.id}`,
            },
          };
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

      // Tool 5b: Manage Tags
      server.registerTool(
        'tag_manage',
        {
          title: 'Tag Manage',
          description: 'List, rename, merge, or delete tags',
          inputSchema: TagManageInputSchema.shape,
          outputSchema: OperationResultSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (args: z.infer<typeof TagManageInputSchema>) => {
          switch (args.operation) {
            case 'list': {
              const tags = await raindropService.getTags(args.collectionId);
              const tagList = tags.map((tag) => `${tag._id} (${tag.count})`).join(', ');
              return {
                content: [textContent(`Tags: ${tagList}`)],
                structuredContent: {
                  success: true,
                  message: `Found ${tags.length} tags`,
                },
              };
            }
            case 'rename': {
              if (!args.replace || !args.tags || args.tags.length !== 1) {
                throw new Error(
                  'rename requires replace and tags with exactly one tag name. ' +
                  'Example: tags=["old"], replace="new".'
                );
              }
              await raindropService.renameTag(args.tags, args.replace, args.collectionId);
              return {
                content: [textContent(`Renamed tag ${args.tags[0]} → ${args.replace}`)],
                structuredContent: {
                  success: true,
                  message: `Renamed tag ${args.tags[0]} → ${args.replace}`,
                },
              };
            }
            case 'merge': {
              if (!args.replace || !args.tags || args.tags.length < 2) {
                throw new Error(
                  'merge requires replace and tags with two or more tag names. ' +
                  'Example: tags=["old1","old2"], replace="new".'
                );
              }
              await raindropService.mergeTags(args.tags, args.replace, args.collectionId);
              return {
                content: [textContent(`Merged ${args.tags.length} tags → ${args.replace}`)],
                structuredContent: {
                  success: true,
                  message: `Merged ${args.tags.length} tags → ${args.replace}`,
                },
              };
            }
            case 'delete': {
              if (!args.tags || args.tags.length === 0) {
                throw new Error(
                  'delete requires tags with at least one tag name. ' +
                  'Example: tags=["obsolete"].'
                );
              }
              await raindropService.deleteTags(args.tags, args.collectionId);
              return {
                content: [textContent(`Deleted ${args.tags.length} tag(s)`)],
                structuredContent: {
                  success: true,
                  message: `Deleted ${args.tags.length} tag(s)`,
                },
              };
            }
            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
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
              if (!args.bookmarkId || !args.id) {
                throw new Error(
                  'bookmarkId and id required for update. ' +
                  'Use highlight_manage list with bookmarkId to see existing highlights. ' +
                  'Highlight IDs are string values (e.g., "65abc123def456").'
                );
              }
              const updates: { text?: string; note?: string; color?: string } = {};
              if (args.text !== undefined) updates.text = args.text;
              if (args.color !== undefined) updates.color = args.color;
              if (args.note !== undefined) updates.note = args.note;
              await raindropService.updateHighlight(args.bookmarkId, args.id, updates);
              return {
                content: [textContent(`Updated highlight ${args.id}`)],
                structuredContent: {
                  highlights: [],
                  total: 0,
                },
              };
            case 'delete':
              if (!args.bookmarkId || !args.id) {
                throw new Error(
                  'bookmarkId and id required for delete. ' +
                  'Use highlight_manage list to find highlight IDs. ' +
                  'Deleting a highlight removes the annotation permanently from the bookmark.'
                );
              }
              await raindropService.deleteHighlight(args.bookmarkId, args.id);
              return {
                content: [textContent(`Deleted highlight ${args.id}`)],
                structuredContent: {
                  highlights: [],
                  total: 0,
                },
              };
            case 'list':
              const highlights = args.bookmarkId
                ? await raindropService.getHighlights(args.bookmarkId)
                : args.collectionId
                  ? await raindropService.getHighlightsByCollection(
                      args.collectionId,
                      args.page,
                      args.perPage
                    )
                  : await raindropService.getHighlightsAll(args.page, args.perPage);
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

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(req, { authInfo });
  } finally {
    await server.close();
  }
  };
}

function addMcpCorsHeaders(req: Request, response: Response, body: ResponseBody): Response {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Raindrop-Token');
    if (response.status === 401 && !headers.has('WWW-Authenticate')) {
      const resourceMetadataUrl = new URL(RESOURCE_METADATA_PATH, req.url).toString();
      headers.set('WWW-Authenticate', `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}"`);
    }

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
}

// Add CORS headers to all responses
const withCors = (handler: (req: Request) => Promise<Response>) => {
  return async (req: Request): Promise<Response> => {
    const response = await handler(req);
    return addMcpCorsHeaders(req, response, response.body);
  };
};

// CORS preflight handler
export const raindropMcpOptionsHandler = async (_req: Request): Promise<Response> => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Raindrop-Token',
      'Access-Control-Max-Age': '86400',
    },
  });
};

export function createRaindropMcpHandler(env: Env): (request: Request) => Promise<Response> {
  const tokenStorage = createTokenStorage(env);
  const oauthService = createOAuthService(env, tokenStorage);
  const authServerService = createAuthorizationServerService(env, tokenStorage);
  const verifyToken = createVerifyToken(env, tokenStorage, oauthService, authServerService);
  const baseHandler = createBaseHandler(env);

  const authHandler = async (request: Request): Promise<Response> => {
    if (request.method === 'GET' || request.method === 'DELETE') {
      return mcpMethodNotAllowed();
    }

    const authInfo = await verifyToken(request, parseBearerToken(request));

    if (!authInfo) {
      return unauthorizedMcpResponse(request, 'No authorization provided');
    }

    if (!authInfo.scopes.includes('raindrop:read')) {
      return forbiddenMcpResponse(request, 'Insufficient scope');
    }

    if (authInfo.expiresAt && authInfo.expiresAt < Date.now() / 1000) {
      return unauthorizedMcpResponse(request, 'Token has expired');
    }

    (request as Request & { auth?: AuthInfo }).auth = authInfo;
    return baseHandler(request);
  };

  return withCors(authHandler);
}

export function createRaindropMcpHeadHandler(env: Env): (request: Request) => Promise<Response> {
  const tokenStorage = createTokenStorage(env);
  const authServerService = createAuthorizationServerService(env, tokenStorage);

  return async (request: Request): Promise<Response> => {
    try {
      validateOrigin(request, env);
    } catch (error) {
      console.warn('Origin validation failed:', error instanceof Error ? error.message : String(error));
      return addMcpCorsHeaders(request, new Response(null, { status: 403 }), null);
    }

    const authInfo = await verifyHeadAuth(env, tokenStorage, authServerService, request);

    if (!authInfo?.scopes.includes('raindrop:read')) {
      const resourceMetadataUrl = new URL(RESOURCE_METADATA_PATH, request.url).toString();
      const unauthorized = new Response(null, {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}"`,
        },
      });
      return addMcpCorsHeaders(request, unauthorized, null);
    }

    return addMcpCorsHeaders(request, new Response(null, { status: 200 }), null);
  };
}
