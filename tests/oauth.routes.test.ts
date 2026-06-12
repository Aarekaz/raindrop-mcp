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

function createEnv(): Env {
  return {
    RAINDROP_AUTH_KV: new InMemoryKVNamespace() as unknown as KVNamespace,
    ASSETS: {
      fetch: () => new Response('asset'),
    } as Fetcher,
  };
}

async function fetchWorker(path: string, init?: RequestInit, env = createEnv()): Promise<Response> {
  return worker.fetch(new Request(`https://example.com${path}`, init), env, requestContext);
}

describe('OAuth Worker routes', () => {
  test('GET /auth/init without redirect_uri returns required parameter JSON', async () => {
    const response = await fetchWorker('/auth/init');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('redirect_uri parameter is required');
  });

  test('POST /token with empty JSON returns invalid_request', async () => {
    const response = await fetchWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'invalid_request' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Pragma')).toBe('no-cache');
  });

  test('POST /register missing client_name returns invalid_client_metadata', async () => {
    const response = await fetchWorker('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://client.example/callback'] }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'invalid_client_metadata' });
  });

  test('POST /register with http non-localhost redirect URI returns invalid_redirect_uri', async () => {
    const response = await fetchWorker('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bad Redirect Client',
        redirect_uris: ['http://client.example/callback'],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'invalid_redirect_uri' });
  });

  test('GET /authorize without client_id returns missing client_id text', async () => {
    const response = await fetchWorker('/authorize');
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain('Missing client_id parameter');
  });

  test('GET /authorize with unknown client_id returns Invalid client_id', async () => {
    const response = await fetchWorker(
      '/authorize?client_id=unknown&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&response_type=code&state=state-123&code_challenge=challenge&code_challenge_method=S256'
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain('Invalid client_id');
  });
});
