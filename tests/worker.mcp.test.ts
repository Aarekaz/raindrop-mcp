import { describe, expect, test } from 'bun:test';
import type { ExecutionContext, KVNamespace } from '@cloudflare/workers-types';

import type { Env, Fetcher } from '../src/worker/env.js';
import worker from '../src/worker.js';

const requestContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} satisfies ExecutionContext;

class InMemoryKVNamespace {
  private readonly values = new Map<string, string>();

  async get<T>(key: string, type?: 'text' | 'json'): Promise<T | string | null> {
    const value = this.values.get(key);
    if (value === undefined) {
      return null;
    }

    if (type === 'json') {
      return JSON.parse(value) as T;
    }

    return value;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    RAINDROP_AUTH_KV: new InMemoryKVNamespace() as unknown as KVNamespace,
    RAINDROP_ACCESS_TOKEN: 'env-test-token',
    ASSETS: {
      fetch: () => new Response('asset'),
    } as Fetcher,
    ...overrides,
  };
}

function parseFirstSseDataJson(text: string): unknown {
  if (!text.startsWith('event:') && !text.startsWith('data:')) {
    return JSON.parse(text);
  }

  const line = text
    .split('\n')
    .find((l) => l.startsWith('data: '));
  if (!line) {
    throw new Error(`No SSE data line found. Body:\n${text}`);
  }
  return JSON.parse(line.slice('data: '.length));
}

async function fetchWorker(
  path: string,
  init?: RequestInit,
  env = createEnv()
): Promise<Response> {
  return worker.fetch(new Request(`https://example.com${path}`, init), env, requestContext);
}

async function mcpCall(method: string, id: number): Promise<any> {
  const request = new Request('https://example.com/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'x-raindrop-token': 'test-token',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {},
    }),
  });

  const response = await worker.fetch(request, createEnv(), requestContext);
  const text = await response.text();
  return parseFirstSseDataJson(text);
}

describe('Worker MCP handler', () => {
  test('tools/list returns all registered tools without calling Raindrop API', async () => {
    const msg = await mcpCall('tools/list', 1);
    expect(msg).toHaveProperty('jsonrpc', '2.0');
    expect(msg).toHaveProperty('id', 1);
    expect(msg).toHaveProperty('result.tools');

    const toolNames = (msg.result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'collection_list',
        'collection_manage',
        'bookmark_search',
        'bookmark_manage',
        'tag_list',
        'highlight_manage',
        'bulk_edit_bookmarks',
        'bookmark_statistics',
      ])
    );
    expect(toolNames).toHaveLength(24);
  });

  test('resources/list and resources/templates/list expose Raindrop resources', async () => {
    const resources = await mcpCall('resources/list', 2);
    expect(resources).toHaveProperty('result.resources');
    const resourceUris = (resources.result.resources as Array<{ uri: string }>).map((r) => r.uri);
    expect(resourceUris).toEqual(
      expect.arrayContaining([
        'raindrop://user/profile',
        'raindrop://collections',
      ])
    );

    const templates = await mcpCall('resources/templates/list', 3);
    expect(templates).toHaveProperty('result.resourceTemplates');
    const templateUris = (templates.result.resourceTemplates as Array<{ uriTemplate: string }>).map(
      (t) => t.uriTemplate
    );
    expect(templateUris).toEqual(
      expect.arrayContaining(['raindrop://collection/{id}', 'raindrop://bookmark/{id}'])
    );
  });

  test('all tools have output schemas and annotations defined', async () => {
    const msg = await mcpCall('tools/list', 4);
    const tools = msg.result.tools as Array<{
      name: string;
      outputSchema?: Record<string, unknown>;
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
      };
    }>;

    const expectedTools = [
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

    expect(tools).toHaveLength(expectedTools.length);

    for (const tool of tools) {
      expect(tool).toHaveProperty('outputSchema');
      expect(tool.outputSchema).toBeDefined();
      expect(typeof tool.outputSchema).toBe('object');
      expect(Object.keys(tool.outputSchema ?? {}).length).toBeGreaterThan(0);
      expect(tool).toHaveProperty('annotations');
      expect(tool.annotations).toHaveProperty('readOnlyHint');
      expect(tool.annotations).toHaveProperty('destructiveHint');
      expect(tool.annotations).toHaveProperty('idempotentHint');
      expect(tool.annotations).toHaveProperty('openWorldHint');
    }

    for (const toolName of expectedTools) {
      const tool = tools.find(t => t.name === toolName);
      expect(tool).toBeDefined();
      expect(tool?.outputSchema).toBeDefined();
    }

    const collectionList = tools.find(t => t.name === 'collection_list');
    expect(collectionList?.annotations?.readOnlyHint).toBe(true);
    expect(collectionList?.annotations?.destructiveHint).toBe(false);
    expect(collectionList?.annotations?.idempotentHint).toBe(true);

    const bookmarkSearch = tools.find(t => t.name === 'bookmark_search');
    expect(bookmarkSearch?.annotations?.readOnlyHint).toBe(true);
    expect(bookmarkSearch?.annotations?.destructiveHint).toBe(false);

    const tagList = tools.find(t => t.name === 'tag_list');
    expect(tagList?.annotations?.readOnlyHint).toBe(true);
    expect(tagList?.annotations?.destructiveHint).toBe(false);

    const bookmarkStatistics = tools.find(t => t.name === 'bookmark_statistics');
    expect(bookmarkStatistics?.annotations?.readOnlyHint).toBe(true);
    expect(bookmarkStatistics?.annotations?.destructiveHint).toBe(false);

    // Check destructive tools have correct annotations
    const collectionManage = tools.find(t => t.name === 'collection_manage');
    expect(collectionManage?.annotations?.destructiveHint).toBe(true);
    expect(collectionManage?.annotations?.readOnlyHint).toBe(false);
    expect(collectionManage?.annotations?.idempotentHint).toBe(false);

    const bookmarkManage = tools.find(t => t.name === 'bookmark_manage');
    expect(bookmarkManage?.annotations?.destructiveHint).toBe(true);
    expect(bookmarkManage?.annotations?.readOnlyHint).toBe(false);

    const highlightManage = tools.find(t => t.name === 'highlight_manage');
    expect(highlightManage?.annotations?.destructiveHint).toBe(true);
    expect(highlightManage?.annotations?.readOnlyHint).toBe(false);

    // Check bulk edit (not destructive, but not read-only)
    const bulkEdit = tools.find(t => t.name === 'bulk_edit_bookmarks');
    expect(bulkEdit?.annotations?.readOnlyHint).toBe(false);
    expect(bulkEdit?.annotations?.destructiveHint).toBe(false);
    expect(bulkEdit?.annotations?.idempotentHint).toBe(false);
  });

  test('GET /mcp status is less than 500', async () => {
    const response = await fetchWorker('/mcp', {
      method: 'GET',
      headers: {
        accept: 'text/event-stream',
        'x-raindrop-token': 'test-token',
      },
    });

    expect(response.status).toBeLessThan(500);
  });

  test('DELETE /mcp status is less than 500', async () => {
    const response = await fetchWorker('/mcp', {
      method: 'DELETE',
      headers: {
        'x-raindrop-token': 'test-token',
      },
    });

    expect(response.status).toBeLessThan(500);
  });

  test('bad Origin returns 403', async () => {
    const response = await fetchWorker('/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'origin': 'http://malicious.com', // Invalid origin
        'x-raindrop-token': 'test-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(response.status).toBe(403);
  });

  test('OPTIONS /mcp returns 204 with CORS headers', async () => {
    const response = await fetchWorker('/mcp', { method: 'OPTIONS' });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Raindrop-Token');
  });
});
