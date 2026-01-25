import { describe, it, expect } from 'vitest';
import { POST, GET, DELETE } from '../api/raindrop';

function parseFirstSseDataJson(text: string): unknown {
  const line = text
    .split('\n')
    .find((l) => l.startsWith('data: '));
  if (!line) {
    throw new Error(`No SSE data line found. Body:\n${text}`);
  }
  return JSON.parse(line.slice('data: '.length));
}

async function mcpCall(method: string, id: number): Promise<any> {
  const request = new Request('https://example.com/api/raindrop', {
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

  const response = await POST(request);
  const text = await response.text();
  return parseFirstSseDataJson(text);
}

describe('Vercel MCP handler', () => {
  it('lists tools without calling Raindrop API', async () => {
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
  });

  it('lists resources and resource templates', async () => {
    const resources = await mcpCall('resources/list', 2);
    expect(resources).toHaveProperty('result.resources');
    const resourceUris = (resources.result.resources as Array<{ uri: string }>).map((r) => r.uri);
    expect(resourceUris).toEqual(
      expect.arrayContaining(['raindrop://user/profile', 'raindrop://collections'])
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

  it('all tools have output schemas defined', async () => {
    const msg = await mcpCall('tools/list', 4);
    const tools = msg.result.tools as Array<{ name: string; outputSchema?: any }>;

    // Verify all 8 tools have output schemas
    expect(tools).toHaveLength(8);

    // Check that every tool has an outputSchema defined
    for (const tool of tools) {
      expect(tool).toHaveProperty('outputSchema');
      expect(tool.outputSchema).toBeDefined();
      expect(typeof tool.outputSchema).toBe('object');
      // Output schema should not be empty
      expect(Object.keys(tool.outputSchema).length).toBeGreaterThan(0);
    }

    // Verify key tools have output schemas (existence check)
    const expectedTools = [
      'collection_list',
      'collection_manage',
      'bookmark_search',
      'bookmark_manage',
      'tag_list',
      'highlight_manage',
      'bulk_edit_bookmarks',
      'bookmark_statistics'
    ];

    for (const toolName of expectedTools) {
      const tool = tools.find(t => t.name === toolName);
      expect(tool).toBeDefined();
      expect(tool?.outputSchema).toBeDefined();
    }
  });

  it('all tools have proper annotations', async () => {
    const msg = await mcpCall('tools/list', 5);
    const tools = msg.result.tools as Array<{
      name: string;
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
      }
    }>;

    // Verify all tools have annotations
    for (const tool of tools) {
      expect(tool).toHaveProperty('annotations');
      expect(tool.annotations).toHaveProperty('readOnlyHint');
      expect(tool.annotations).toHaveProperty('destructiveHint');
      expect(tool.annotations).toHaveProperty('idempotentHint');
      expect(tool.annotations).toHaveProperty('openWorldHint');
    }

    // Check read-only tools have correct annotations
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

  it('supports GET method for SSE streams', async () => {
    const request = new Request('https://example.com/api/raindrop', {
      method: 'GET',
      headers: {
        accept: 'text/event-stream',
        'x-raindrop-token': 'test-token',
      },
    });

    const response = await GET(request);
    // GET without POST should either work or return appropriate response
    expect(response.status).toBeLessThan(500);
  });

  it('supports DELETE method for session termination', async () => {
    const request = new Request('https://example.com/api/raindrop', {
      method: 'DELETE',
      headers: {
        'x-raindrop-token': 'test-token',
      },
    });

    const response = await DELETE(request);
    // DELETE should return appropriate status
    expect(response.status).toBeLessThan(500);
  });

  it('validates Origin header to prevent DNS rebinding', async () => {
    const request = new Request('https://example.com/api/raindrop', {
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

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
