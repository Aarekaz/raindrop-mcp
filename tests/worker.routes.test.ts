import { describe, expect, test } from 'bun:test';
import type { ExecutionContext, KVNamespace } from '@cloudflare/workers-types';
import ts from 'typescript';

import type { Env, Fetcher } from '../src/worker/env.js';
import { Router } from '../src/worker/router.js';
import worker from '../src/worker.js';

const requestContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} satisfies ExecutionContext;

const env: Env = {
  RAINDROP_AUTH_KV: {} as KVNamespace,
  ASSETS: {
    fetch: (request: Request) => {
      const { pathname } = new URL(request.url);

      if (pathname === '/' || pathname === '/index.html') {
        return new Response('<h1>Raindrop MCP</h1>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (pathname === '/docs/' || pathname === '/docs/index.html') {
        return new Response('<h1>Documentation</h1>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return new Response('asset not found', { status: 404 });
    },
  } as Fetcher,
};

type HealthResponse = {
  status: string;
  service: string;
};

type AuthorizationServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
};

type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
};

type InfoResponse = {
  name: string;
  status: string;
  links: {
    website: string;
    documentation: string;
    mcpServer: string;
    protectedResourceMetadata: string;
    authorizationServerMetadata: string;
  };
  endpoints: {
    landing: string;
    docs: string;
    info: string;
    mcp: string;
    oauth: {
      authorize: string;
      token: string;
      register: string;
      raindropLogin: string;
      raindropCallback: string;
    };
  };
  stats: {
    toolsAvailable: number;
    resourcesAvailable: number;
    resourceTemplatesAvailable: number;
  };
  tools: string[];
  resources: Array<{
    name: string;
    uri: string;
  }>;
  resourceTemplates: Array<{
    name: string;
    uriTemplate: string;
  }>;
};

type ErrorResponse = {
  error: string;
};

type WranglerConfig = {
  assets?: {
    not_found_handling?: string;
    run_worker_first?: string[];
  };
};

async function readWranglerConfig(): Promise<WranglerConfig> {
  const configUrl = new URL('../wrangler.jsonc', import.meta.url);
  const configText = await Bun.file(configUrl).text();
  const parsed = ts.parseConfigFileTextToJson(configUrl.pathname, configText);

  expect(parsed.error).toBeUndefined();

  return parsed.config as WranglerConfig;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function fetchWorker(
  path: string,
  init?: RequestInit,
  envOverride: Partial<Env> = {}
): Promise<Response> {
  return worker.fetch(new Request(`https://example.com${path}`, init), {
    ...env,
    ...envOverride,
  }, requestContext);
}

describe('worker routes', () => {
  test('/health returns service health JSON', async () => {
    const response = await fetchWorker('/health');
    const body = await readJson<HealthResponse>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('raindrop-mcp');
  });

  test('/info returns public server summary JSON', async () => {
    const response = await fetchWorker('/info');
    const body = await readJson<InfoResponse>(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(body.status).toBe('operational');
    expect(body.name).toBe('Raindrop MCP');
    expect(body.links.website).toBe('https://example.com');
    expect(body.links.documentation).toBe('https://example.com/docs/');
    expect(body.links.mcpServer).toBe('https://example.com/mcp');
    expect(body.links.protectedResourceMetadata).toBe(
      'https://example.com/.well-known/oauth-protected-resource'
    );
    expect(body.links.authorizationServerMetadata).toBe(
      'https://example.com/.well-known/oauth-authorization-server'
    );
    expect(body.endpoints).toEqual({
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
    });
    expect(body.stats.toolsAvailable).toBe(24);
    expect(body.tools).toHaveLength(24);
    expect(body.tools).toEqual(
      expect.arrayContaining(['collection_list', 'bookmark_search', 'bookmark_statistics'])
    );
    expect(body.resources.map((resource) => resource.name)).toEqual([
      'user_profile',
      'collections',
    ]);
    expect(body.resourceTemplates.map((template) => template.name)).toEqual([
      'collection',
      'bookmark',
    ]);
  });

  test('/info uses normalized JWT_ISSUER links when configured', async () => {
    const response = await fetchWorker('/info', undefined, {
      JWT_ISSUER: '  https://auth.example.test///  ',
    });
    const body = await readJson<InfoResponse>(response);

    expect(body.links.website).toBe('https://auth.example.test');
    expect(body.links.documentation).toBe('https://auth.example.test/docs/');
    expect(body.links.mcpServer).toBe('https://auth.example.test/mcp');
    expect(body.links.authorizationServerMetadata).toBe(
      'https://auth.example.test/.well-known/oauth-authorization-server'
    );
  });

  test('/.well-known/oauth-authorization-server returns default issuer endpoints', async () => {
    const response = await fetchWorker('/.well-known/oauth-authorization-server');
    const body = await readJson<AuthorizationServerMetadata>(response);

    expect(response.status).toBe(200);
    expect(body.authorization_endpoint).toBe('https://raindrop-mcp.anuragd.me/authorize');
    expect(body.token_endpoint).toBe('https://raindrop-mcp.anuragd.me/token');
  });

  test('/.well-known/oauth-protected-resource returns default resource', async () => {
    const response = await fetchWorker('/.well-known/oauth-protected-resource');
    const body = await readJson<ProtectedResourceMetadata>(response);

    expect(response.status).toBe(200);
    expect(body.resource).toBe('https://example.com/mcp');
    expect(body.authorization_servers).toEqual(['https://raindrop-mcp.anuragd.me']);
  });

  test('/.well-known/oauth-protected-resource normalizes custom resource path', async () => {
    const response = await fetchWorker('/.well-known/oauth-protected-resource?path=/custom');
    const body = await readJson<ProtectedResourceMetadata>(response);

    expect(response.status).toBe(200);
    expect(body.resource).toBe('https://example.com/custom');
  });

  test('metadata routes use JWT_ISSUER override', async () => {
    const override = { JWT_ISSUER: 'https://auth.example.test' };
    const authResponse = await fetchWorker(
      '/.well-known/oauth-authorization-server',
      undefined,
      override
    );
    const protectedResponse = await fetchWorker(
      '/.well-known/oauth-protected-resource',
      undefined,
      override
    );
    const authBody = await readJson<AuthorizationServerMetadata>(authResponse);
    const protectedBody = await readJson<ProtectedResourceMetadata>(protectedResponse);

    expect(authBody.issuer).toBe('https://auth.example.test');
    expect(authBody.authorization_endpoint).toBe('https://auth.example.test/authorize');
    expect(protectedBody.authorization_servers).toEqual(['https://auth.example.test']);
  });

  test('metadata routes fall back to default issuer when JWT_ISSUER is whitespace', async () => {
    const response = await fetchWorker('/.well-known/oauth-authorization-server', undefined, {
      JWT_ISSUER: '   ',
    });
    const body = await readJson<AuthorizationServerMetadata>(response);

    expect(body.issuer).toBe('https://raindrop-mcp.anuragd.me');
  });

  test('OPTIONS metadata routes return CORS preflight response', async () => {
    const authResponse = await fetchWorker('/.well-known/oauth-authorization-server', {
      method: 'OPTIONS',
    });
    const protectedResponse = await fetchWorker('/.well-known/oauth-protected-resource', {
      method: 'OPTIONS',
    });

    expect(authResponse.status).toBe(204);
    expect(authResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(authResponse.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(protectedResponse.status).toBe(204);
    expect(protectedResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(protectedResponse.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
  });

  test('HEAD metadata routes return headers without a body', async () => {
    const authResponse = await fetchWorker('/.well-known/oauth-authorization-server', {
      method: 'HEAD',
    });
    const protectedResponse = await fetchWorker('/.well-known/oauth-protected-resource', {
      method: 'HEAD',
    });

    expect(authResponse.status).toBe(200);
    expect(authResponse.headers.get('Content-Type')).toBe('application/json');
    expect(await authResponse.text()).toBe('');
    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.headers.get('Content-Type')).toBe('application/json');
    expect(await protectedResponse.text()).toBe('');
  });

  test('GET / serves the landing page from static assets', async () => {
    const response = await fetchWorker('/');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(await response.text()).toBe('<h1>Raindrop MCP</h1>');
  });

  test('GET /docs/ serves static documentation', async () => {
    const response = await fetchWorker('/docs/');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(await response.text()).toBe('<h1>Documentation</h1>');
  });

  test('unknown GET paths do not become fake app pages', async () => {
    const response = await fetchWorker('/dashboard');

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('asset not found');
  });

  test('wrangler asset routing does not SPA-fallback over protocol routes', async () => {
    const config = await readWranglerConfig();

    expect(config.assets?.not_found_handling).toBe('none');
    expect(config.assets?.run_worker_first).toEqual(
      expect.arrayContaining([
        '/.well-known/*',
        '/auth/*',
        '/authorize',
        '/mcp',
        '/register',
        '/token',
      ])
    );
  });

  test('POST /health returns method_not_allowed', async () => {
    const response = await fetchWorker('/health', { method: 'POST' });
    const body = await readJson<ErrorResponse>(response);

    expect(response.status).toBe(405);
    expect(body.error).toBe('method_not_allowed');
  });

  test('router preserves matched route 404 responses', async () => {
    const router = new Router();
    router.on('GET', '/api-missing', () => new Response('api missing', { status: 404 }));

    const result = await router.handle(
      new Request('https://example.com/api-missing'),
      env,
      requestContext
    );

    expect(result.matched).toBe(true);
    expect(result.response.status).toBe(404);
    expect(await result.response.text()).toBe('api missing');
  });
});
