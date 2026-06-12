import { describe, expect, test } from 'bun:test';
import type { ExecutionContext, KVNamespace } from '@cloudflare/workers-types';

import type { Env, Fetcher } from '../src/worker/env.js';
import worker from '../src/worker.js';

const requestContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} satisfies ExecutionContext;

const env = {
  RAINDROP_AUTH_KV: {} as KVNamespace,
  ASSETS: {
    fetch: () => new Response('asset'),
  } as Fetcher,
} satisfies Env;

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://example.com${path}`, init), env, requestContext);
}

describe('worker routes', () => {
  test('/health returns service health JSON', async () => {
    const response = await fetchWorker('/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('raindrop-mcp');
  });

  test('/.well-known/oauth-authorization-server returns default issuer endpoints', async () => {
    const response = await fetchWorker('/.well-known/oauth-authorization-server');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authorization_endpoint).toBe('https://raindrop-mcp.anuragd.me/authorize');
    expect(body.token_endpoint).toBe('https://raindrop-mcp.anuragd.me/token');
  });

  test('unknown paths fall back to static assets', async () => {
    const response = await fetchWorker('/unknown');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('asset');
  });

  test('POST /health returns method_not_allowed', async () => {
    const response = await fetchWorker('/health', { method: 'POST' });
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body.error).toBe('method_not_allowed');
  });
});
