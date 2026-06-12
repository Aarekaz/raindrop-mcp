import { describe, expect, test } from 'bun:test';
import type { ExecutionContext, KVNamespace } from '@cloudflare/workers-types';
import crypto from 'crypto';
import { jwtVerify } from 'jose';

import type { Env, Fetcher } from '../src/worker/env.js';
import type { AuthorizationCode, OAuthClient } from '../src/types/oauth-server.types.js';
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

  async seedJson(key: string, value: unknown): Promise<void> {
    this.values.set(key, JSON.stringify(value));
  }
}

function createEnv(overrides: Partial<Env> = {}, kv = new InMemoryKVNamespace()): Env {
  return {
    RAINDROP_AUTH_KV: kv as unknown as KVNamespace,
    ASSETS: {
      fetch: () => new Response('asset'),
    } as Fetcher,
    ...overrides,
  };
}

async function fetchWorker(path: string, init?: RequestInit, env = createEnv()): Promise<Response> {
  return worker.fetch(new Request(`https://example.com${path}`, init), env, requestContext);
}

function createCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function createClient(overrides: Partial<OAuthClient> = {}): OAuthClient {
  return {
    client_id: 'client-env',
    client_secret_hash: null,
    client_name: 'Env Client',
    redirect_uris: ['https://client.example/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none',
    scope: 'raindrop:read raindrop:write',
    created_at: Date.now(),
    registration_access_token: 'registration-token',
    ...overrides,
  };
}

function createAuthCode(overrides: Partial<AuthorizationCode> = {}): AuthorizationCode {
  return {
    code: 'code-env',
    client_id: 'client-env',
    user_id: 'user-env',
    redirect_uri: 'https://client.example/callback',
    scope: 'raindrop:read raindrop:write',
    code_challenge: createCodeChallenge('test-code-verifier'),
    code_challenge_method: 'S256',
    expires_at: Date.now() + 5 * 60 * 1000,
    created_at: Date.now(),
    ...overrides,
  };
}

async function seedClient(kv: InMemoryKVNamespace, client: OAuthClient): Promise<void> {
  await kv.seedJson(`client:${client.client_id}`, client);
}

async function seedAuthCode(kv: InMemoryKVNamespace, authCode: AuthorizationCode): Promise<void> {
  await kv.seedJson(`authcode:${authCode.code}`, authCode);
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

  test('POST /token with unsupported content type returns invalid_request', async () => {
    const response = await fetchWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'grant_type=authorization_code',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'invalid_request' });
  });

  test('POST /token with unsupported grant returns unsupported_grant_type', async () => {
    const response = await fetchWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'password' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'unsupported_grant_type' });
  });

  test('POST /token authorization_code exchange uses Worker env JWT config', async () => {
    const kv = new InMemoryKVNamespace();
    const signingKey = 'worker-env-signing-key';
    const issuer = 'https://worker-issuer.example';
    const clientId = 'client-env';
    const code = 'code-env';
    const codeVerifier = 'test-code-verifier';
    const redirectUri = 'https://client.example/callback';
    const env = createEnv(
      {
        JWT_SIGNING_KEY: signingKey,
        JWT_ACCESS_TOKEN_EXPIRY: '123',
        JWT_ISSUER: issuer,
      },
      kv
    );
    const client = createClient({
      client_id: clientId,
      redirect_uris: [redirectUri],
      scope: 'raindrop:read',
    });
    const authCode = createAuthCode({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'raindrop:read',
      code_challenge: createCodeChallenge(codeVerifier),
    });
    await seedClient(kv, client);
    await seedAuthCode(kv, authCode);

    const response = await fetchWorker(
      '/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      },
      env
    );
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token: string;
      scope: string;
    };
    const { payload } = await jwtVerify(body.access_token, new TextEncoder().encode(signingKey), {
      issuer,
      audience: 'raindrop-mcp',
    });

    expect(response.status).toBe(200);
    expect(body.expires_in).toBe(123);
    expect(body.scope).toBe('raindrop:read');
    expect(body.refresh_token).toBeString();
    expect(payload.client_id).toBe(clientId);
    expect(payload.sub).toBe('user-env');
    expect(payload.iss).toBe(issuer);
    expect(payload.scope).toBe('raindrop:read');
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      throw new Error('JWT is missing numeric exp/iat claims');
    }
    expect(payload.exp - payload.iat).toBe(123);
  });

  test('POST /token falls back safely for whitespace issuer and invalid expiry env', async () => {
    const kv = new InMemoryKVNamespace();
    const signingKey = 'worker-env-signing-key';
    const client = createClient();
    const authCode = createAuthCode();
    const env = createEnv(
      {
        JWT_SIGNING_KEY: signingKey,
        JWT_ACCESS_TOKEN_EXPIRY: 'not-a-number',
        JWT_ISSUER: '   ',
      },
      kv
    );
    await seedClient(kv, client);
    await seedAuthCode(kv, authCode);

    const response = await fetchWorker(
      '/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: client.client_id,
          code: authCode.code,
          redirect_uri: authCode.redirect_uri,
          code_verifier: 'test-code-verifier',
        }),
      },
      env
    );
    const body = (await response.json()) as { access_token: string; expires_in: number };
    const { payload } = await jwtVerify(body.access_token, new TextEncoder().encode(signingKey), {
      issuer: 'https://raindrop-mcp.anuragd.me',
      audience: 'raindrop-mcp',
    });

    expect(response.status).toBe(200);
    expect(body.expires_in).toBe(3600);
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      throw new Error('JWT is missing numeric exp/iat claims');
    }
    expect(payload.exp - payload.iat).toBe(3600);
  });

  test('POST /token omits refresh_token for authorization-code-only clients', async () => {
    const kv = new InMemoryKVNamespace();
    const signingKey = 'worker-env-signing-key';
    const client = createClient({ grant_types: ['authorization_code'] });
    const authCode = createAuthCode();
    await seedClient(kv, client);
    await seedAuthCode(kv, authCode);

    const response = await fetchWorker(
      '/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: client.client_id,
          code: authCode.code,
          redirect_uri: authCode.redirect_uri,
          code_verifier: 'test-code-verifier',
        }),
      },
      createEnv({ JWT_SIGNING_KEY: signingKey }, kv)
    );
    const body = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      scope: string;
    };

    expect(response.status).toBe(200);
    expect(body.access_token).toBeString();
    expect(body.refresh_token).toBeUndefined();
    expect(body.scope).toBe(authCode.scope);
  });

  test('POST /token rejects refresh_token grant for authorization-code-only clients', async () => {
    const kv = new InMemoryKVNamespace();
    const client = createClient({ grant_types: ['authorization_code'] });
    await seedClient(kv, client);

    const response = await fetchWorker(
      '/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: client.client_id,
          refresh_token: 'refresh-token',
        }),
      },
      createEnv({}, kv)
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'unauthorized_client' });
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

  test('POST /register rejects unsupported grant_types', async () => {
    const response = await fetchWorker('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bad Grant Client',
        redirect_uris: ['https://client.example/callback'],
        grant_types: ['authorization_code', 'client_credentials'],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'invalid_client_metadata' });
    expect(body.error_description).toContain('Unsupported grant_type');
  });

  test('POST /register rejects unsupported scope', async () => {
    const response = await fetchWorker('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bad Scope Client',
        redirect_uris: ['https://client.example/callback'],
        scope: 'raindrop:read raindrop:delete',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'invalid_client_metadata' });
    expect(body.error_description).toContain('Unsupported scope');
  });

  test('GET /authorize without client_id returns missing client_id text', async () => {
    const response = await fetchWorker('/authorize');
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain('Missing client_id parameter');
  });

  test('GET /authorize without state returns missing state text', async () => {
    const response = await fetchWorker(
      '/authorize?client_id=client&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&response_type=code&code_challenge=challenge&code_challenge_method=S256'
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain('Missing state parameter');
  });

  test('GET /authorize rejects unsupported scope for registered client', async () => {
    const kv = new InMemoryKVNamespace();
    const client = createClient();
    await seedClient(kv, client);
    const response = await fetchWorker(
      `/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent(client.redirect_uris[0])}&response_type=code&state=state-123&code_challenge=${createCodeChallenge('test-code-verifier')}&code_challenge_method=S256&scope=raindrop%3Adelete`,
      undefined,
      createEnv({}, kv)
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain('Unsupported scope requested');
  });

  test('GET /authorize rejects broader scope than registered client', async () => {
    const kv = new InMemoryKVNamespace();
    const client = createClient({ scope: 'raindrop:read' });
    await seedClient(kv, client);
    const response = await fetchWorker(
      `/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent(client.redirect_uris[0])}&response_type=code&state=state-123&code_challenge=${createCodeChallenge('test-code-verifier')}&code_challenge_method=S256&scope=raindrop%3Aread%20raindrop%3Awrite`,
      undefined,
      createEnv({}, kv)
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain('Requested scope exceeds registered client scope');
  });

  test('GET /authorize with unknown client_id returns Invalid client_id', async () => {
    const response = await fetchWorker(
      '/authorize?client_id=unknown&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&response_type=code&state=state-123&code_challenge=challenge&code_challenge_method=S256'
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain('Invalid client_id');
  });

  test('POST /authorize deny with unregistered client does not redirect to form URI', async () => {
    const response = await fetchWorker('/authorize', {
      method: 'POST',
      body: new URLSearchParams({
        action: 'deny',
        state: 'state-123',
        client_id: 'missing-client',
        redirect_uri: 'https://evil.example/callback',
        scope: 'raindrop:read',
        code_challenge: createCodeChallenge('test-code-verifier'),
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
    expect(text).toContain('Invalid client_id');
  });

  test('POST /authorize deny with bad redirect_uri does not redirect to form URI', async () => {
    const kv = new InMemoryKVNamespace();
    const client = createClient();
    await seedClient(kv, client);
    const response = await fetchWorker(
      '/authorize',
      {
        method: 'POST',
        body: new URLSearchParams({
          action: 'deny',
          state: 'state-123',
          client_id: client.client_id,
          redirect_uri: 'https://evil.example/callback',
          scope: 'raindrop:read',
          code_challenge: createCodeChallenge('test-code-verifier'),
        }),
      },
      createEnv({}, kv)
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
    expect(text).toContain('Invalid redirect_uri');
  });

  test('POST /authorize approve rejects scope escalation for narrow client', async () => {
    const kv = new InMemoryKVNamespace();
    const client = createClient({ scope: 'raindrop:read' });
    await seedClient(kv, client);
    const response = await fetchWorker(
      '/authorize',
      {
        method: 'POST',
        headers: { Cookie: 'raindrop_session=user-123' },
        body: new URLSearchParams({
          action: 'approve',
          state: 'state-123',
          client_id: client.client_id,
          redirect_uri: client.redirect_uris[0],
          scope: 'raindrop:read raindrop:write',
          code_challenge: createCodeChallenge('test-code-verifier'),
        }),
      },
      createEnv({}, kv)
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
    expect(text).toContain('Requested scope exceeds registered client scope');
  });

  test('POST /authorize with missing action returns 400 and does not approve', async () => {
    const kv = new InMemoryKVNamespace();
    const client = createClient();
    await seedClient(kv, client);
    const response = await fetchWorker(
      '/authorize',
      {
        method: 'POST',
        headers: { Cookie: 'raindrop_session=user-123' },
        body: new URLSearchParams({
          state: 'state-123',
          client_id: client.client_id,
          redirect_uri: client.redirect_uris[0],
          scope: 'raindrop:read',
          code_challenge: createCodeChallenge('test-code-verifier'),
        }),
      },
      createEnv({}, kv)
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
    expect(text).toContain('Invalid action parameter');
  });

  test('POST /authorize with unknown action returns 400 and does not approve', async () => {
    const kv = new InMemoryKVNamespace();
    const client = createClient();
    await seedClient(kv, client);
    const response = await fetchWorker(
      '/authorize',
      {
        method: 'POST',
        headers: { Cookie: 'raindrop_session=user-123' },
        body: new URLSearchParams({
          action: 'maybe',
          state: 'state-123',
          client_id: client.client_id,
          redirect_uri: client.redirect_uris[0],
          scope: 'raindrop:read',
          code_challenge: createCodeChallenge('test-code-verifier'),
        }),
      },
      createEnv({}, kv)
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
    expect(text).toContain('Invalid action parameter');
  });

  test('GET /auth/callback without code and state returns missing parameters', async () => {
    const response = await fetchWorker('/auth/callback');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Missing required parameters');
  });

  test('GET /auth/callback with mismatched state cookie returns invalid state', async () => {
    const response = await fetchWorker('/auth/callback?code=code&state=query-state', {
      headers: { Cookie: 'oauth_state=cookie-state' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid state');
  });

  test('GET /auth/callback with matching cookie but missing KV state returns invalid state', async () => {
    const response = await fetchWorker('/auth/callback?code=code&state=state-123', {
      headers: { Cookie: 'oauth_state=state-123' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid state');
  });
});
