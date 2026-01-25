import { describe, it, expect } from 'vitest';
import { POST } from '../api/raindrop';

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
});
