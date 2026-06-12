# Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `raindrop-mcp` from Vercel Functions + Vercel KV to a Cloudflare Worker + Workers KV architecture while preserving the existing MCP, OAuth, and Raindrop.io behavior.

**Architecture:** Replace Vercel route files with a single Cloudflare Worker router. Move auth/session persistence behind a request-scoped KV-backed `TokenStorage`, keep Raindrop.io as the external source of truth, and serve static landing assets from Cloudflare Workers Assets or Pages. Extract the MCP handler so it can run in Worker `fetch()` without Vercel rewrites.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Workers KV, Web Fetch API, `mcp-handler` or MCP SDK fallback, Raindrop.io REST API, Bun test runner.

---

## File Structure

- Create: `wrangler.jsonc`
  - Cloudflare Worker config, compatibility date, `nodejs_compat`, KV binding, observability, asset binding.
- Create: `src/worker.ts`
  - Worker `fetch(request, env, ctx)` entrypoint and route dispatch.
- Create: `src/worker/env.ts`
  - Generated-type import boundary and runtime env helpers.
- Create: `src/worker/router.ts`
  - Small method/path router for Worker routes.
- Create: `src/worker/http.ts`
  - Shared JSON, redirect, cookie, CORS, and error response helpers.
- Create: `src/oauth/cloudflare-kv-store.ts`
  - KV adapter implementing the storage operations currently done through `@vercel/kv`.
- Modify: `src/oauth/token-storage.ts`
  - Remove direct `@vercel/kv` import; accept an injected store/binding.
- Modify: `src/oauth/oauth.service.ts`
  - Stop reaching into private storage from route code; expose `getOAuthState()`.
- Create: `src/routes/auth.ts`
  - Worker-native `/auth/init` and `/auth/callback`.
- Create: `src/routes/oauth.ts`
  - Worker-native `/authorize`, `/token`, `/register`.
- Create: `src/routes/metadata.ts`
  - Worker-native `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`.
- Create: `src/routes/health.ts`
  - Worker-native `/health`.
- Create: `src/mcp/raindrop-handler.ts`
  - Extract current MCP registration/auth logic from `api/raindrop.ts` into a request-scoped handler factory.
- Modify: `api/raindrop.ts`
  - During transition, either re-export extracted handler for tests or delete after Worker tests replace it.
- Modify: `tests/vercel.mcp.test.ts`
  - Rename and retarget tests to Worker route helpers.
- Create: `tests/worker.routes.test.ts`
  - Route-level tests for `/health`, metadata, auth errors, and MCP `tools/list`.
- Modify: `package.json`
  - Replace Vercel scripts/deps with Wrangler scripts/deps.
- Modify: `docs/DEPLOYMENT.md`
  - Rewrite as Cloudflare deployment guide.
- Remove after migration passes: `vercel.json`
  - Vercel rewrites and function settings no longer apply.

## Task 1: Add Cloudflare Tooling And Config

**Files:**
- Create: `wrangler.jsonc`
- Modify: `package.json`
- Test: `package.json` scripts

- [ ] **Step 1: Add Wrangler dependencies**

Run:

```bash
bun add -d wrangler @cloudflare/workers-types
```

Expected: `package.json` and `bun.lock` update with `wrangler` and `@cloudflare/workers-types`.

- [ ] **Step 2: Remove Vercel-only packages**

Run:

```bash
bun remove @vercel/kv @vercel/node vercel
```

Expected: Vercel packages disappear from `package.json`; Bun updates `bun.lock`.

- [ ] **Step 3: Create Worker config**

Create `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "raindrop-mcp",
  "main": "src/worker.ts",
  "compatibility_date": "2026-06-12",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },
  "kv_namespaces": [
    {
      "binding": "RAINDROP_AUTH_KV",
      "id": "replace-with-production-kv-id",
      "preview_id": "replace-with-preview-kv-id"
    }
  ],
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "vars": {
    "JWT_ISSUER": "https://raindrop-mcp.anuragd.me",
    "JWT_ACCESS_TOKEN_EXPIRY": "3600",
    "JWT_REFRESH_TOKEN_EXPIRY": "2592000"
  }
}
```

- [ ] **Step 4: Update scripts**

Set scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "type-check": "tsc --noEmit",
    "test": "bun test",
    "deploy:cloudflare": "wrangler deploy",
    "cf:kv:create": "wrangler kv namespace create RAINDROP_AUTH_KV && wrangler kv namespace create RAINDROP_AUTH_KV --preview"
  }
}
```

- [ ] **Step 5: Verify config parses**

Run:

```bash
bunx wrangler types
bun run type-check
```

Expected: `worker-configuration.d.ts` is generated, then typecheck fails only because `src/worker.ts` does not exist yet.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock wrangler.jsonc worker-configuration.d.ts
git commit -m "chore: add cloudflare worker configuration"
```

## Task 2: Make Token Storage Runtime-Agnostic

**Files:**
- Create: `src/oauth/cloudflare-kv-store.ts`
- Modify: `src/oauth/token-storage.ts`
- Modify: `src/oauth/oauth.service.ts`
- Test: `tests/token-storage.test.ts`

- [ ] **Step 1: Add a storage adapter interface**

In `src/oauth/token-storage.ts`, replace direct `@vercel/kv` usage with:

```ts
export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ex?: number }): Promise<void>;
  del(key: string): Promise<void>;
}
```

Update constructor:

```ts
export class TokenStorage {
  constructor(private readonly store: KeyValueStore) {}
}
```

Replace every `kv.get`, `kv.set`, and `kv.del` call with `this.store.get`, `this.store.set`, and `this.store.del`.

- [ ] **Step 2: Add Cloudflare KV adapter**

Create `src/oauth/cloudflare-kv-store.ts`:

```ts
import type { KeyValueStore } from './token-storage.js';

export class CloudflareKVStore implements KeyValueStore {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    return await this.kv.get<T>(key, 'json');
  }

  async set<T>(key: string, value: T, options?: { ex?: number }): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: options?.ex,
    });
  }

  async del(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}
```

- [ ] **Step 3: Expose OAuth state lookup properly**

In `src/oauth/oauth.service.ts`, add:

```ts
async getStoredState(state: string) {
  return await this.storage.getOAuthState(state);
}
```

Then route code can stop using `oauthService['storage']`.

- [ ] **Step 4: Add in-memory test adapter**

Create `tests/token-storage.test.ts` with a local map-backed store:

```ts
import { describe, expect, it } from 'vitest';
import { TokenStorage, type KeyValueStore } from '../src/oauth/token-storage';

class MemoryStore implements KeyValueStore {
  values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('TokenStorage', () => {
  it('stores and deletes OAuth state through the injected store', async () => {
    const storage = new TokenStorage(new MemoryStore());
    await storage.saveOAuthState({
      state: 'state-1',
      codeVerifier: 'verifier',
      redirectUri: '/after',
      expiresAt: Date.now() + 300000,
    });

    await expect(storage.getOAuthState('state-1')).resolves.toMatchObject({
      state: 'state-1',
      redirectUri: '/after',
    });

    await storage.deleteOAuthState('state-1');
    await expect(storage.getOAuthState('state-1')).resolves.toBeNull();
  });
});
```

- [ ] **Step 5: Verify**

Run:

```bash
bun test tests/token-storage.test.ts
bun run type-check
```

Expected: token storage test passes; typecheck exposes only route files still instantiating `new TokenStorage()` without a store.

- [ ] **Step 6: Commit**

```bash
git add src/oauth/token-storage.ts src/oauth/cloudflare-kv-store.ts src/oauth/oauth.service.ts tests/token-storage.test.ts
git commit -m "refactor: inject auth token storage backend"
```

## Task 3: Add Worker Router And Basic Routes

**Files:**
- Create: `src/worker.ts`
- Create: `src/worker/env.ts`
- Create: `src/worker/router.ts`
- Create: `src/worker/http.ts`
- Create: `src/routes/health.ts`
- Create: `src/routes/metadata.ts`
- Test: `tests/worker.routes.test.ts`

- [ ] **Step 1: Create env type boundary**

Create `src/worker/env.ts`:

```ts
export interface Env {
  RAINDROP_AUTH_KV: KVNamespace;
  ASSETS: Fetcher;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_URI?: string;
  OAUTH_ALLOWED_REDIRECT_URIS?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  JWT_SIGNING_KEY?: string;
  JWT_ISSUER?: string;
  JWT_ACCESS_TOKEN_EXPIRY?: string;
  JWT_REFRESH_TOKEN_EXPIRY?: string;
  RAINDROP_ACCESS_TOKEN?: string;
  NODE_ENV?: string;
}
```

- [ ] **Step 2: Create response helpers**

Create `src/worker/http.ts`:

```ts
export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

export function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export function methodNotAllowed(): Response {
  return json({ error: 'method_not_allowed' }, { status: 405 });
}
```

- [ ] **Step 3: Create router**

Create `src/worker/router.ts`:

```ts
import type { Env } from './env.js';
import { methodNotAllowed, notFound } from './http.js';

export type RouteHandler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response;

export class Router {
  private routes = new Map<string, RouteHandler>();

  on(method: string, path: string, handler: RouteHandler): void {
    this.routes.set(`${method.toUpperCase()} ${path}`, handler);
  }

  async handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const handler = this.routes.get(`${request.method.toUpperCase()} ${url.pathname}`);
    if (handler) {
      return await handler(request, env, ctx);
    }

    const hasPath = Array.from(this.routes.keys()).some((key) => key.endsWith(` ${url.pathname}`));
    return hasPath ? methodNotAllowed() : notFound();
  }
}
```

- [ ] **Step 4: Port health and metadata**

Create `src/routes/health.ts`:

```ts
import { json } from '../worker/http.js';

export function health(): Response {
  return json({
    status: 'ok',
    service: 'raindrop-mcp',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}
```

Create `src/routes/metadata.ts` by moving the logic from `api/well-known/oauth-authorization-server.ts` and `api/well-known/oauth-protected-resource.ts` into exported `authorizationServerMetadata()` and `protectedResourceMetadata(request, env)` functions.

- [ ] **Step 5: Create Worker entrypoint**

Create `src/worker.ts`:

```ts
import { health } from './routes/health.js';
import { authorizationServerMetadata, protectedResourceMetadata } from './routes/metadata.js';
import type { Env } from './worker/env.js';
import { Router } from './worker/router.js';

const router = new Router();

router.on('GET', '/health', health);
router.on('GET', '/.well-known/oauth-authorization-server', authorizationServerMetadata);
router.on('GET', '/.well-known/oauth-protected-resource', protectedResourceMetadata);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const routed = await router.handle(request, env, ctx);
    if (routed.status !== 404) {
      return routed;
    }
    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 6: Test basic routes**

Create `tests/worker.routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import worker from '../src/worker';

const env = {
  RAINDROP_AUTH_KV: {} as KVNamespace,
  ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
} as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as ExecutionContext;

describe('Cloudflare Worker routes', () => {
  it('serves health', async () => {
    const response = await worker.fetch(new Request('https://example.com/health'), env, ctx);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok', service: 'raindrop-mcp' });
  });

  it('serves authorization metadata', async () => {
    const response = await worker.fetch(new Request('https://example.com/.well-known/oauth-authorization-server'), env, ctx);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: 'https://raindrop-mcp.anuragd.me/authorize',
      token_endpoint: 'https://raindrop-mcp.anuragd.me/token',
    });
  });
});
```

- [ ] **Step 7: Verify**

Run:

```bash
bun test tests/worker.routes.test.ts
bun run type-check
```

Expected: route tests pass; typecheck may still fail on old Vercel route files until Task 6 removes or excludes them.

- [ ] **Step 8: Commit**

```bash
git add src/worker.ts src/worker src/routes/health.ts src/routes/metadata.ts tests/worker.routes.test.ts
git commit -m "feat: add cloudflare worker routing shell"
```

## Task 4: Port OAuth Routes To Worker Request/Response

**Files:**
- Create: `src/routes/auth.ts`
- Create: `src/routes/oauth.ts`
- Modify: `src/worker.ts`
- Test: `tests/oauth.routes.test.ts`

- [ ] **Step 1: Port `/auth/init`**

Move logic from `api/auth/init.ts` to `src/routes/auth.ts` as:

```ts
export async function authInit(request: Request, env: Env): Promise<Response>
```

Use `new URL(request.url).searchParams`, `request.headers.get('host')`, and `Response.redirect(authUrl, 302)`. Set the `oauth_state` cookie with `Set-Cookie`.

- [ ] **Step 2: Port `/auth/callback`**

Move logic from `api/auth/callback.ts` to:

```ts
export async function authCallback(request: Request, env: Env): Promise<Response>
```

Use `TokenStorage(new CloudflareKVStore(env.RAINDROP_AUTH_KV))`, `OAuthService`, and `oauthService.getStoredState(state)`.

- [ ] **Step 3: Port `/register`, `/authorize`, `/token`**

Move `api/oauth/register.ts`, `api/oauth/authorize.ts`, and `api/oauth/token.ts` into `src/routes/oauth.ts` as:

```ts
export async function registerClient(request: Request, env: Env): Promise<Response>
export async function authorizeGet(request: Request, env: Env): Promise<Response>
export async function authorizePost(request: Request, env: Env): Promise<Response>
export async function token(request: Request, env: Env): Promise<Response>
```

Each function must construct `new AuthorizationServerService(new TokenStorage(new CloudflareKVStore(env.RAINDROP_AUTH_KV)))` inside the handler, not at module scope.

- [ ] **Step 4: Register routes**

In `src/worker.ts`, add:

```ts
router.on('GET', '/auth/init', authInit);
router.on('GET', '/auth/callback', authCallback);
router.on('POST', '/register', registerClient);
router.on('GET', '/authorize', authorizeGet);
router.on('POST', '/authorize', authorizePost);
router.on('POST', '/token', token);
```

- [ ] **Step 5: Add OAuth route tests**

Create `tests/oauth.routes.test.ts` with tests for missing parameter errors:

```ts
import { describe, expect, it } from 'vitest';
import worker from '../src/worker';

const env = {
  RAINDROP_AUTH_KV: {} as KVNamespace,
  ASSETS: { fetch: async () => new Response('asset') },
} as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as ExecutionContext;

describe('OAuth routes', () => {
  it('rejects auth init without redirect_uri', async () => {
    const response = await worker.fetch(new Request('https://example.com/auth/init'), env, ctx);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'redirect_uri parameter is required' });
  });

  it('rejects token requests without grant_type', async () => {
    const response = await worker.fetch(new Request('https://example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }), env, ctx);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_request' });
  });
});
```

- [ ] **Step 6: Verify**

Run:

```bash
bun test tests/oauth.routes.test.ts
bun run type-check
```

Expected: OAuth route tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/auth.ts src/routes/oauth.ts src/worker.ts tests/oauth.routes.test.ts
git commit -m "feat: port oauth routes to cloudflare worker"
```

## Task 5: Extract MCP Handler For Worker

**Files:**
- Create: `src/mcp/raindrop-handler.ts`
- Modify: `api/raindrop.ts`
- Modify: `src/worker.ts`
- Modify: `tests/vercel.mcp.test.ts`

- [ ] **Step 1: Extract handler factory**

Move MCP registration logic from `api/raindrop.ts` into:

```ts
export function createRaindropMcpHandler(env: Env): (request: Request) => Promise<Response>
```

Inside the factory, create request-scoped `TokenStorage(new CloudflareKVStore(env.RAINDROP_AUTH_KV))`, `OAuthService`, and `AuthorizationServerService`.

- [ ] **Step 2: Keep auth priority unchanged**

Preserve token verification order:

1. JWT bearer token
2. legacy opaque session bearer token
3. `X-Raindrop-Token`
4. `env.RAINDROP_ACCESS_TOKEN`

- [ ] **Step 3: Register `/mcp` in Worker**

In `src/worker.ts`, add:

```ts
router.on('GET', '/mcp', (request, env) => createRaindropMcpHandler(env)(request));
router.on('POST', '/mcp', (request, env) => createRaindropMcpHandler(env)(request));
router.on('DELETE', '/mcp', (request, env) => createRaindropMcpHandler(env)(request));
router.on('OPTIONS', '/mcp', () => corsPreflight());
```

- [ ] **Step 4: Retarget MCP tests**

Rename `tests/vercel.mcp.test.ts` to `tests/worker.mcp.test.ts`. Import `worker` from `src/worker` and call `worker.fetch()` with an env that includes:

```ts
RAINDROP_AUTH_KV: memoryKvNamespace,
RAINDROP_ACCESS_TOKEN: 'test-token',
ASSETS: { fetch: async () => new Response('asset') }
```

- [ ] **Step 5: Verify MCP discovery**

Run:

```bash
bun test tests/worker.mcp.test.ts
bun run type-check
```

Expected: `tools/list`, resource list, annotations, output schemas, GET, DELETE, and bad Origin tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/raindrop-handler.ts src/worker.ts tests/worker.mcp.test.ts
git rm tests/vercel.mcp.test.ts
git commit -m "feat: serve mcp endpoint from cloudflare worker"
```

## Task 6: Remove Vercel Surface

**Files:**
- Delete: `vercel.json`
- Delete or archive: `api/**/*.ts`
- Modify: `tsconfig.json`
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Remove Vercel config**

Run:

```bash
git rm vercel.json
```

- [ ] **Step 2: Remove Vercel API routes after Worker tests pass**

Run:

```bash
git rm -r api
```

- [ ] **Step 3: Update TypeScript include**

In `tsconfig.json`, change:

```json
"include": ["src/**/*", "api/**/*"]
```

to:

```json
"include": ["src/**/*", "tests/**/*", "worker-configuration.d.ts"]
```

- [ ] **Step 4: Rewrite deployment docs**

Replace `docs/DEPLOYMENT.md` with Cloudflare instructions:

```md
# Deployment (Cloudflare Workers)

## Setup

Run:

```bash
bun install
bunx wrangler login
bun run cf:kv:create
```

Copy the KV namespace IDs into `wrangler.jsonc`.

## Secrets

```bash
bunx wrangler secret put OAUTH_CLIENT_ID
bunx wrangler secret put OAUTH_CLIENT_SECRET
bunx wrangler secret put OAUTH_REDIRECT_URI
bunx wrangler secret put OAUTH_ALLOWED_REDIRECT_URIS
bunx wrangler secret put TOKEN_ENCRYPTION_KEY
bunx wrangler secret put JWT_SIGNING_KEY
```

Optional:

```bash
bunx wrangler secret put RAINDROP_ACCESS_TOKEN
```

## Local Development

```bash
bun run dev
```

## Deploy

```bash
bun run deploy:cloudflare
```

## Smoke Tests

```bash
curl https://your-worker-domain/health
curl https://your-worker-domain/.well-known/oauth-authorization-server
curl -X POST https://your-worker-domain/mcp \
  -H "Content-Type: application/json" \
  -H "X-Raindrop-Token: $RAINDROP_ACCESS_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```
```

- [ ] **Step 5: Verify**

Run:

```bash
bun run type-check
bun test
bunx wrangler dev --local --port 8787
```

Expected: typecheck passes, tests pass, and local Worker serves `/health`.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json README.md docs/DEPLOYMENT.md package.json bun.lock wrangler.jsonc
git add -u
git commit -m "chore: remove vercel deployment surface"
```

## Task 7: Manual Cloudflare OAuth And MCP Validation

**Files:**
- Modify only if validation finds bugs.

- [ ] **Step 1: Start local Worker**

Run:

```bash
bunx wrangler dev --local --port 8787
```

Expected: Worker starts on `http://localhost:8787`.

- [ ] **Step 2: Smoke public routes**

Run:

```bash
curl -s http://localhost:8787/health | python3 -m json.tool
curl -s http://localhost:8787/.well-known/oauth-authorization-server | python3 -m json.tool
curl -s http://localhost:8787/.well-known/oauth-protected-resource | python3 -m json.tool
```

Expected: all return valid JSON. Protected resource metadata should point to `http://localhost:8787/mcp` locally.

- [ ] **Step 3: Smoke MCP tools/list**

Run:

```bash
curl -s -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Raindrop-Token: test-token" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | head -40
```

Expected: SSE `data:` line with `result.tools` containing 24 tools.

- [ ] **Step 4: Validate bad origin rejection**

Run:

```bash
curl -i -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Origin: http://malicious.com" \
  -H "X-Raindrop-Token: test-token" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Expected: `HTTP/1.1 403 Forbidden`.

- [ ] **Step 5: Commit validation fixes**

If any fixes were needed:

```bash
git add .
git commit -m "fix: validate cloudflare worker mcp runtime"
```

If no fixes were needed, do not create an empty commit.

## Task 8: Production Deploy

**Files:**
- Modify: `wrangler.jsonc` only if KV IDs or domain config need adjustment.

- [ ] **Step 1: Create KV namespaces**

Run:

```bash
bun run cf:kv:create
```

Expected: Wrangler prints production and preview KV namespace IDs.

- [ ] **Step 2: Insert KV namespace IDs**

Update `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "RAINDROP_AUTH_KV",
    "id": "actual-production-id",
    "preview_id": "actual-preview-id"
  }
]
```

- [ ] **Step 3: Set secrets**

Run:

```bash
bunx wrangler secret put OAUTH_CLIENT_ID
bunx wrangler secret put OAUTH_CLIENT_SECRET
bunx wrangler secret put OAUTH_REDIRECT_URI
bunx wrangler secret put OAUTH_ALLOWED_REDIRECT_URIS
bunx wrangler secret put TOKEN_ENCRYPTION_KEY
bunx wrangler secret put JWT_SIGNING_KEY
```

Expected: Wrangler confirms each secret was uploaded.

- [ ] **Step 4: Deploy**

Run:

```bash
bun run deploy:cloudflare
```

Expected: Wrangler prints deployed Worker URL.

- [ ] **Step 5: Production smoke**

Run:

```bash
curl -s https://raindrop-mcp.anuragd.me/health | python3 -m json.tool
curl -s https://raindrop-mcp.anuragd.me/.well-known/oauth-protected-resource | python3 -m json.tool
```

Expected: both endpoints return correct JSON with production origin.

- [ ] **Step 6: Commit deploy config**

```bash
git add wrangler.jsonc docs/DEPLOYMENT.md
git commit -m "chore: configure cloudflare production deployment"
```

## Risks And Decisions

- **MCP runtime compatibility:** `mcp-handler` may not fully support Workers. If `/mcp tools/list` fails under `wrangler dev`, replace `mcp-handler` in `src/mcp/raindrop-handler.ts` with direct MCP SDK Streamable HTTP wiring instead of trying to patch Worker globals.
- **KV consistency:** Workers KV is eventually consistent. It is acceptable for OAuth state/session data at this scale, but authorization-code exchange immediately after write should be validated carefully. If consistency causes callback/token flakiness, move auth codes and OAuth state to Durable Objects or D1 while keeping sessions in KV.
- **Secrets:** Never put `OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `JWT_SIGNING_KEY`, or user tokens in `wrangler.jsonc`; use `wrangler secret put`.
- **Free-plan limits:** Workers Free is suitable for this project shape, but exceeding the daily request limit returns Cloudflare 1027. KV write/delete/list free limits are also daily-limited, so OAuth-heavy testing should use a paid Worker plan or local development.

## Final Verification Checklist

- [ ] `bun run type-check` passes.
- [ ] `bun test` passes.
- [ ] `bunx wrangler dev --local --port 8787` serves `/health`.
- [ ] `POST /mcp tools/list` returns 24 tools.
- [ ] `/.well-known/oauth-authorization-server` points to the deployed issuer.
- [ ] `/.well-known/oauth-protected-resource` points to the current `/mcp` origin.
- [ ] OAuth login sets cookies without exposing `session_id` in the URL.
- [ ] JWT bearer auth can call `/mcp`.
- [ ] Legacy session bearer auth can call `/mcp` until intentionally removed.
- [ ] `X-Raindrop-Token` direct-token auth still works.
- [ ] Vercel config and dependencies are removed.

