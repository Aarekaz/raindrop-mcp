import type { Env } from '../worker/env.js';
import { json } from '../worker/http.js';

const DEFAULT_PRODUCTION_BASE_URL = 'https://raindrop-mcp.anuragd.me';

const TOOL_NAMES = [
  'collection_list',
  'collection_children_list',
  'collection_manage',
  'collection_bulk_delete',
  'collection_reorder',
  'collection_expand',
  'collection_merge',
  'collection_clean',
  'collection_empty_trash',
  'collection_cover_upload',
  'user_stats',
  'bookmark_search',
  'bookmark_manage',
  'bookmark_cache',
  'bookmark_suggest_existing',
  'bookmark_bulk_create',
  'bookmark_bulk_delete',
  'bookmark_file_upload',
  'bookmark_cover_upload',
  'tag_list',
  'tag_manage',
  'highlight_manage',
  'bulk_edit_bookmarks',
  'bookmark_statistics',
];

const RESOURCES = [
  {
    name: 'user_profile',
    uri: 'raindrop://user/profile',
  },
  {
    name: 'collections',
    uri: 'raindrop://collections',
  },
];

const RESOURCE_TEMPLATES = [
  {
    name: 'collection',
    uriTemplate: 'raindrop://collection/{id}',
  },
  {
    name: 'bookmark',
    uriTemplate: 'raindrop://bookmark/{id}',
  },
];

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function baseUrlFromRequest(request: Request, env: Env): string {
  const configuredIssuer = trimTrailingSlashes(env.JWT_ISSUER?.trim() ?? '');

  if (configuredIssuer) {
    return configuredIssuer;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return DEFAULT_PRODUCTION_BASE_URL;
  }
}

export function info(request: Request, env: Env): Response {
  const baseUrl = baseUrlFromRequest(request, env);

  return json(
    {
      name: 'Raindrop MCP',
      version: '0.2.0',
      description: 'MCP server for Raindrop.io bookmarks, collections, tags, and highlights.',
      status: 'operational',
      links: {
        website: baseUrl,
        documentation: `${baseUrl}/docs/`,
        mcpServer: `${baseUrl}/mcp`,
        protectedResourceMetadata: `${baseUrl}/.well-known/oauth-protected-resource`,
        authorizationServerMetadata: `${baseUrl}/.well-known/oauth-authorization-server`,
      },
      endpoints: {
        landing: '/',
        docs: '/docs/',
        info: '/info',
        mcp: '/mcp',
        oauth: {
          authorize: '/authorize',
          token: '/token',
          register: '/register',
          raindropLogin: '/auth/init',
          raindropCallback: '/auth/callback',
        },
      },
      transport: {
        type: 'streamable-http',
        endpoint: '/mcp',
      },
      authentication: {
        type: 'OAuth 2.1 + PKCE',
        upstreamProvider: 'Raindrop.io',
        directRequestTokenHeader: 'X-Raindrop-Token',
      },
      stats: {
        toolsAvailable: TOOL_NAMES.length,
        resourcesAvailable: RESOURCES.length,
        resourceTemplatesAvailable: RESOURCE_TEMPLATES.length,
      },
      tools: TOOL_NAMES,
      resources: RESOURCES,
      resourceTemplates: RESOURCE_TEMPLATES,
    },
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}
