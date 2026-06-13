# Raindrop MCP Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `raindrop-mcp` match the proven `metro-mcp` public/protocol model: `/` is the landing page, protocol routes are precise, OAuth is MCP-client driven, and every public claim is verified against the live MCP server.

**Architecture:** Keep the Cloudflare Worker as the front door for OAuth/MCP routes and delegate public static pages to Workers Static Assets. Mirror Metro's route separation: `/` for landing, `/docs/` for setup/reference, `/info` for JSON server summary, `/.well-known/*` for discovery, `/authorize`/`/token`/`/register` for MCP OAuth, `/auth/*` only for upstream Raindrop login/callback, and `/mcp` for authenticated MCP traffic.

**Tech Stack:** Cloudflare Workers, Wrangler static assets, Workers KV, TypeScript, Bun tests, MCP Streamable HTTP, OAuth 2.1 + PKCE, Raindrop OAuth.

---

## Reference Model From Metro MCP

Metro MCP has the shape we want:

- `GET /` serves `public/index.html`.
- `GET /docs/` serves static docs.
- `GET /info` returns JSON status/capabilities.
- `POST /mcp` is the protected MCP endpoint.
- `GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-authorization-server` are public discovery.
- `GET /authorize`, `POST /authorize`, `POST /token`, `POST /register`, `GET /callback` handle OAuth.
- Unmatched public paths do not silently become fake product pages.
- The landing page has proof surfaces: copyable MCP URL, client install modal/snippets, docs link, and a demo panel.

Raindrop MCP is close, but needs these corrections:

- Remove SPA fallback semantics that make arbitrary paths like `/dashboard` look real.
- Add `/info` so JSON status does not compete with the landing page.
- Make the landing page match real server behavior: 24 tools, not 26; no "zero storage" claim because encrypted user tokens and sessions are stored in KV.
- Make the install flow client-driven like Metro: users add `/mcp`; MCP clients discover OAuth and open `/authorize`.
- Add resource indicator support so JWTs can be audience-bound to `https://raindrop-mcp.anuragd.me/mcp`.
- Add an E2E script that verifies the same full path we manually proved.

## File Structure

- Modify `wrangler.jsonc`: asset routing behavior.
- Modify `src/worker.ts`: add `/info` route.
- Create `src/routes/info.ts`: public JSON server summary.
- Modify `src/routes/metadata.ts`: advertise resource indicators and richer protected resource metadata.
- Modify `src/oauth/oauth.types.ts`: store optional `resource` on authorization codes and JWT payloads.
- Modify `src/types/oauth-server.types.ts`: expose resource-aware request/response typing.
- Modify `src/oauth/authorization-server.service.ts`: carry resource from `/authorize` through auth code to JWT `aud`.
- Modify `src/routes/oauth.ts`: parse/validate `resource`, persist it, and pass it into token generation.
- Modify `src/mcp/raindrop-handler.ts`: enforce JWT audience when present.
- Modify `tests/worker.routes.test.ts`: static routing and `/info` tests.
- Modify `tests/oauth.routes.test.ts`: resource indicator and token `aud` tests.
- Modify `tests/worker.mcp.test.ts`: wrong-audience rejection test.
- Modify `public/index.html`: Metro-style landing/install modal and truthful copy.
- Create `public/docs/index.html`: concise setup/reference docs.
- Modify `scripts/check-cloudflare-readiness.mjs`: include `/`, `/info`, browser-style `/auth/init`, and landing claim checks.
- Create `scripts/check-cloudflare-e2e.mjs`: full dynamic-client-registration, OAuth, token, and MCP tool call probe with secret-safe output.
- Modify `README.md`, `docs/OAUTH.md`, `docs/OAUTH_AUTHORIZATION_SERVER.md`, `docs/DEPLOYMENT.md`, `docs/DEPLOYMENT_CHECKLIST.md`: align docs with the public/protocol model.

---

### Task 1: Match Metro Static Routing Semantics

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `tests/worker.routes.test.ts`

- [ ] **Step 1: Update asset config to stop fake SPA routes**

Replace the `assets` block in `wrangler.jsonc` with:

```jsonc
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "none",
    "run_worker_first": [
      "/.well-known/*",
      "/auth/*",
      "/authorize",
      "/health",
      "/info",
      "/mcp",
      "/register",
      "/token"
    ]
  },
```

- [ ] **Step 2: Update asset mock in route tests**

In `tests/worker.routes.test.ts`, replace the `ASSETS.fetch` mock with:

```ts
  ASSETS: {
    fetch: (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response('<!DOCTYPE html><title>Raindrop MCP</title>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/docs/' || url.pathname === '/docs/index.html') {
        return new Response('<!DOCTYPE html><title>Raindrop MCP Docs</title>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('asset not found', { status: 404 });
    },
  } as Fetcher,
```

- [ ] **Step 3: Replace the unknown path test**

Replace the existing `unknown paths fall back to static assets` test with:

```ts
  test('GET / serves the landing page from static assets', async () => {
    const response = await fetchWorker('/');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(await response.text()).toContain('Raindrop MCP');
  });

  test('GET /docs/ serves static documentation', async () => {
    const response = await fetchWorker('/docs/');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(await response.text()).toContain('Raindrop MCP Docs');
  });

  test('unknown GET paths do not become fake app pages', async () => {
    const response = await fetchWorker('/dashboard');

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('asset not found');
  });
```

- [ ] **Step 4: Run focused route tests**

Run:

```bash
bun test tests/worker.routes.test.ts
```

Expected: all worker route tests pass.

- [ ] **Step 5: Validate Wrangler config**

Run:

```bash
bunx wrangler deploy --dry-run
```

Expected: dry run completes without config errors.

- [ ] **Step 6: Commit**

```bash
git add wrangler.jsonc tests/worker.routes.test.ts
git commit -m "fix: make public routes explicit"
```

---

### Task 2: Add `/info` Like Metro MCP

**Files:**
- Create: `src/routes/info.ts`
- Modify: `src/worker.ts`
- Modify: `tests/worker.routes.test.ts`

- [ ] **Step 1: Create `src/routes/info.ts`**

```ts
import type { Env } from '../worker/env.js';
import { json } from '../worker/http.js';

const DEFAULT_BASE_URL = 'https://raindrop-mcp.anuragd.me';

function baseUrlFromRequest(request: Request, env: Env): string {
  const issuer = env.JWT_ISSUER?.trim();
  if (issuer) {
    return issuer.replace(/\/+$/, '');
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}` || DEFAULT_BASE_URL;
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
        toolsAvailable: 24,
        resourcesAvailable: 2,
        resourceTemplatesAvailable: 2,
      },
      tools: [
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
        'highlight_list',
        'highlight_manage',
        'bulk_edit_bookmarks',
      ],
      resources: [
        'raindrop://user/profile',
        'raindrop://collections',
      ],
      resourceTemplates: [
        'raindrop://collection/{id}',
        'raindrop://bookmark/{id}',
      ],
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
```

- [ ] **Step 2: Wire `/info` into `src/worker.ts`**

Add the import:

```ts
import { info } from './routes/info.js';
```

Add this route immediately after `/health`:

```ts
router.on('GET', '/info', (request, env) => info(request, env));
```

- [ ] **Step 3: Add route test**

In `tests/worker.routes.test.ts`, add:

```ts
type InfoResponse = {
  name: string;
  endpoints: {
    landing: string;
    docs: string;
    info: string;
    mcp: string;
  };
  stats: {
    toolsAvailable: number;
  };
};

test('/info returns public server summary JSON', async () => {
  const response = await fetchWorker('/info');
  const body = await readJson<InfoResponse>(response);

  expect(response.status).toBe(200);
  expect(body.name).toBe('Raindrop MCP');
  expect(body.endpoints.landing).toBe('/');
  expect(body.endpoints.docs).toBe('/docs/');
  expect(body.endpoints.info).toBe('/info');
  expect(body.endpoints.mcp).toBe('/mcp');
  expect(body.stats.toolsAvailable).toBe(24);
});
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/worker.routes.test.ts
bun run type-check
```

Expected: route tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/info.ts src/worker.ts tests/worker.routes.test.ts
git commit -m "feat: add public server info endpoint"
```

---

### Task 3: Make The Landing Page Metro-Style And Truthful

**Files:**
- Modify: `public/index.html`
- Create: `public/docs/index.html`

- [ ] **Step 1: Update landing claims**

In `public/index.html`, change the public copy to these exact truths:

```html
<p>Connect your Raindrop.io bookmarks to any MCP-compatible assistant. Search saved links, collections, tags, and highlights from the tools your client already knows how to use.</p>
```

Replace every "26 tools" claim with:

```html
24 tools
```

Replace every "Zero Storage" or "nothing gets copied, stored, or cached permanently" claim with:

```html
Encrypted token storage
```

and:

```html
The Worker stores encrypted OAuth session data in Cloudflare KV so MCP clients can call Raindrop on your behalf. Bookmark content is fetched live from Raindrop when tools run.
```

- [ ] **Step 2: Add Metro-style install modal markup**

Before the closing `</body>` tag in `public/index.html`, add:

```html
  <dialog class="install-dialog" id="install-dialog" aria-labelledby="install-title">
    <div class="dialog-header">
      <h2 id="install-title">Add Raindrop MCP to your client</h2>
      <button type="button" class="dialog-close" data-close-install aria-label="Close install dialog">Close</button>
    </div>
    <p class="dialog-subtitle">Use the MCP endpoint. Your client discovers OAuth, opens Raindrop authorization, and stores the resulting token.</p>
    <div class="tab-list" role="tablist" aria-label="Client install snippets">
      <button role="tab" aria-selected="true" aria-controls="tab-claude" id="tab-btn-claude" data-tab="claude">Claude Desktop</button>
      <button role="tab" aria-selected="false" aria-controls="tab-cursor" id="tab-btn-cursor" data-tab="cursor">Cursor</button>
      <button role="tab" aria-selected="false" aria-controls="tab-codex" id="tab-btn-codex" data-tab="codex">Codex CLI</button>
      <button role="tab" aria-selected="false" aria-controls="tab-generic" id="tab-btn-generic" data-tab="generic">Generic</button>
    </div>
    <div class="tab-panels">
      <div role="tabpanel" id="tab-claude" aria-labelledby="tab-btn-claude">
        <p class="tab-help">Add to Claude Desktop MCP config.</p>
        <pre><code>{
  "mcpServers": {
    "raindrop": {
      "url": "https://raindrop-mcp.anuragd.me/mcp",
      "transport": "streamable-http"
    }
  }
}</code></pre>
        <button type="button" class="copy-snippet">Copy</button>
      </div>
      <div role="tabpanel" id="tab-cursor" aria-labelledby="tab-btn-cursor" hidden>
        <p class="tab-help">Add to Cursor MCP config.</p>
        <pre><code>{
  "mcpServers": {
    "raindrop": {
      "url": "https://raindrop-mcp.anuragd.me/mcp",
      "transport": "streamable-http"
    }
  }
}</code></pre>
        <button type="button" class="copy-snippet">Copy</button>
      </div>
      <div role="tabpanel" id="tab-codex" aria-labelledby="tab-btn-codex" hidden>
        <p class="tab-help">Register the hosted MCP endpoint.</p>
        <pre><code>codex mcp add raindrop https://raindrop-mcp.anuragd.me/mcp</code></pre>
        <button type="button" class="copy-snippet">Copy</button>
      </div>
      <div role="tabpanel" id="tab-generic" aria-labelledby="tab-btn-generic" hidden>
        <p class="tab-help">Use this with any OAuth-aware Streamable HTTP MCP client.</p>
        <pre><code>{
  "name": "raindrop",
  "url": "https://raindrop-mcp.anuragd.me/mcp",
  "transport": "streamable-http"
}</code></pre>
        <button type="button" class="copy-snippet">Copy</button>
      </div>
    </div>
  </dialog>
  <div class="toast" role="status" aria-live="polite"></div>
```

- [ ] **Step 3: Add install modal behavior**

Inside the existing `<script>` tag, add:

```js
    const installDialog = document.getElementById('install-dialog');
    const openInstallButtons = document.querySelectorAll('[data-open-install]');
    const closeInstallButton = document.querySelector('[data-close-install]');
    const toast = document.querySelector('.toast');

    const showToast = (message) => {
      if (!toast) return;
      toast.textContent = message;
      toast.dataset.show = 'true';
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => {
        toast.dataset.show = 'false';
      }, 1400);
    };

    openInstallButtons.forEach((button) => {
      button.addEventListener('click', () => {
        installDialog?.showModal();
      });
    });

    closeInstallButton?.addEventListener('click', () => {
      installDialog?.close();
    });

    document.querySelectorAll('[role="tab"][data-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('[role="tab"][data-tab]').forEach((candidate) => {
          const selected = candidate === tab;
          candidate.setAttribute('aria-selected', String(selected));
        });
        document.querySelectorAll('[role="tabpanel"]').forEach((panel) => {
          panel.hidden = panel.id !== `tab-${target}`;
        });
      });
    });

    document.querySelectorAll('.copy-snippet').forEach((button) => {
      button.addEventListener('click', async () => {
        const code = button.parentElement?.querySelector('code')?.textContent?.trim() || '';
        try {
          await navigator.clipboard.writeText(code);
          showToast('Copied');
        } catch {
          showToast('Copy failed');
        }
      });
    });
```

- [ ] **Step 4: Add modal CSS**

Inside `public/index.html` `<style>`, add:

```css
    .install-dialog {
      width: min(720px, calc(100vw - 32px));
      border: 1px solid var(--color-border);
      background: var(--color-panel);
      color: var(--color-text);
      border-radius: 8px;
      padding: 24px;
    }

    .install-dialog::backdrop {
      background: rgba(2, 6, 12, 0.72);
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .dialog-close,
    .copy-snippet {
      border: 1px solid var(--color-border);
      color: var(--color-text);
      background: transparent;
      border-radius: 8px;
      padding: 8px 12px;
    }

    .dialog-subtitle,
    .tab-help {
      color: var(--color-muted);
      margin-top: 10px;
    }

    .tab-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 20px 0 14px;
    }

    .tab-list [role="tab"] {
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 8px 12px;
      color: var(--color-muted);
      background: transparent;
    }

    .tab-list [aria-selected="true"] {
      color: var(--color-bg);
      background: var(--color-accent);
      border-color: var(--color-accent);
    }

    .toast {
      position: fixed;
      right: 20px;
      bottom: 20px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 10px 14px;
      background: var(--color-panel);
      color: var(--color-text);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 160ms ease, transform 160ms ease;
      pointer-events: none;
    }

    .toast[data-show="true"] {
      opacity: 1;
      transform: translateY(0);
    }
```

- [ ] **Step 5: Wire hero CTA to modal**

Change the primary CTA button to:

```html
<button class="btn btn-primary" type="button" data-open-install>Connect MCP Client</button>
```

Keep the copy endpoint button as the secondary action:

```html
<button class="btn btn-secondary" id="copy-endpoint" type="button">Copy Endpoint</button>
```

- [ ] **Step 6: Create `public/docs/index.html`**

Create a concise static docs page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Raindrop MCP Docs</title>
  <meta name="description" content="Connect MCP clients to Raindrop MCP and understand the OAuth, MCP, and Cloudflare routes.">
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0b1117; color: #f6f8fb; line-height: 1.6; }
    main { width: min(960px, calc(100vw - 32px)); margin: 0 auto; padding: 56px 0; }
    a { color: #3dff9f; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { overflow: auto; background: #101923; border: 1px solid #243140; border-radius: 8px; padding: 16px; }
    section { border-top: 1px solid #243140; padding-top: 28px; margin-top: 28px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    .card { border: 1px solid #243140; border-radius: 8px; padding: 16px; background: #0f1822; }
  </style>
</head>
<body>
  <main>
    <p><a href="/">Raindrop MCP</a></p>
    <h1>Connect Raindrop MCP</h1>
    <p>Use the hosted MCP endpoint with any OAuth-aware Streamable HTTP client.</p>
    <pre><code>{
  "mcpServers": {
    "raindrop": {
      "url": "https://raindrop-mcp.anuragd.me/mcp",
      "transport": "streamable-http"
    }
  }
}</code></pre>
    <section>
      <h2>HTTP endpoints</h2>
      <div class="grid">
        <div class="card"><strong>GET /</strong><p>Landing page.</p></div>
        <div class="card"><strong>GET /docs/</strong><p>This setup page.</p></div>
        <div class="card"><strong>GET /info</strong><p>JSON server summary.</p></div>
        <div class="card"><strong>POST /mcp</strong><p>Primary MCP Streamable HTTP endpoint.</p></div>
        <div class="card"><strong>GET /.well-known/oauth-protected-resource</strong><p>MCP protected-resource metadata.</p></div>
        <div class="card"><strong>GET /.well-known/oauth-authorization-server</strong><p>OAuth authorization server metadata.</p></div>
        <div class="card"><strong>GET/POST /authorize</strong><p>MCP OAuth authorization and consent.</p></div>
        <div class="card"><strong>POST /token</strong><p>Authorization code and refresh token exchange.</p></div>
        <div class="card"><strong>POST /register</strong><p>Dynamic client registration.</p></div>
        <div class="card"><strong>GET /auth/init</strong><p>Internal Raindrop login step used by /authorize.</p></div>
      </div>
    </section>
    <section>
      <h2>Flow</h2>
      <ol>
        <li>The MCP client reads protected-resource metadata from <code>/.well-known/oauth-protected-resource</code>.</li>
        <li>The client reads authorization server metadata from <code>/.well-known/oauth-authorization-server</code>.</li>
        <li>The client registers with <code>/register</code>.</li>
        <li>The client opens <code>/authorize</code> with PKCE and resource metadata.</li>
        <li>The Worker sends the user to Raindrop when no Raindrop session exists.</li>
        <li>The Worker stores the encrypted Raindrop token in KV and redirects back to <code>/authorize</code>.</li>
        <li>The user approves the MCP client.</li>
        <li>The client exchanges the authorization code at <code>/token</code>.</li>
        <li>The client calls <code>/mcp</code> with the issued bearer token.</li>
      </ol>
    </section>
  </main>
</body>
</html>
```

- [ ] **Step 7: Smoke static HTML locally**

Run:

```bash
bunx wrangler deploy --dry-run
```

Expected: assets include both `public/index.html` and `public/docs/index.html`.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/docs/index.html
git commit -m "feat: align public pages with mcp client flow"
```

---

### Task 4: Add OAuth Resource Indicators And JWT Audience Binding

**Files:**
- Modify: `src/oauth/oauth.types.ts`
- Modify: `src/types/oauth-server.types.ts`
- Modify: `src/oauth/authorization-server.service.ts`
- Modify: `src/routes/oauth.ts`
- Modify: `src/routes/metadata.ts`
- Modify: `src/mcp/raindrop-handler.ts`
- Modify: `tests/oauth.routes.test.ts`
- Modify: `tests/worker.mcp.test.ts`

- [ ] **Step 1: Extend authorization-code and JWT types**

In `src/oauth/oauth.types.ts`, add optional resource/audience fields:

```ts
export interface AuthorizationCode {
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  resource?: string;
  expires_at: number;
  created_at: number;
}

export interface JWTPayload {
  sub: string;
  client_id: string;
  scope: string;
  iss: string;
  aud?: string;
  iat: number;
  exp: number;
}
```

- [ ] **Step 2: Advertise resource indicators**

In `src/routes/metadata.ts`, add these fields to authorization server metadata:

```ts
      resource_indicators_supported: true,
      authorization_response_iss_parameter_supported: false,
```

Add fields to protected resource metadata:

```ts
      scopes_supported: ['raindrop:read', 'raindrop:write'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${issuerFromEnv(env)}/docs/`,
```

- [ ] **Step 3: Add canonical resource helpers**

In `src/oauth/authorization-server.service.ts`, add:

```ts
export function canonicalizeResource(resource: string): string {
  const url = new URL(resource);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.protocol}//${url.host.toLowerCase()}${pathname}`;
}

export function expectedMcpResource(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host.toLowerCase()}/mcp`;
}
```

- [ ] **Step 4: Store resource in authorization codes**

Change `createAuthorizationCode` signature to:

```ts
async createAuthorizationCode(
  clientId: string,
  userId: string,
  redirectUri: string,
  scope: string,
  codeChallenge: string,
  resource?: string
): Promise<string> {
```

Add this field when building `authCode`:

```ts
      resource,
```

- [ ] **Step 5: Put audience in JWTs**

Change `exchangeCode` token generation to:

```ts
    const accessToken = await this.generateJWT(
      authCode.user_id,
      clientId,
      authCode.scope,
      authCode.resource
    );
```

Change `generateJWT` signature and payload:

```ts
  async generateJWT(userId: string, clientId: string, scope: string, audience?: string): Promise<string> {
    if (!this.jwtSecret) {
      throw new Error('JWT signing key not configured');
    }

    const builder = new SignJWT({
      sub: userId,
      client_id: clientId,
      scope,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.issuer)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTokenExpiry}s`);

    if (audience) {
      builder.setAudience(audience);
    }

    return await builder.sign(this.jwtSecret);
  }
```

- [ ] **Step 6: Parse resource in `/authorize`**

In `src/routes/oauth.ts`, read and validate resource:

```ts
  const resource = params.get('resource');
  let canonicalResource: string | undefined;

  if (resource) {
    try {
      canonicalResource = canonicalizeResource(resource);
    } catch {
      return authorizationErrorResponse('resource parameter must be an absolute URI');
    }
  }
```

Pass it into `createAuthorizationCode`:

```ts
    const code = await authServerService.createAuthorizationCode(
      clientId,
      raindropSession,
      redirectUri,
      target.scope,
      codeChallenge,
      canonicalResource
    );
```

Add a hidden field to the consent form:

```html
      <input type="hidden" name="resource" value="${escapeHtml(params.resource || '')}" />
```

Add `resource?: string` to the `generateConsentHtml` params object.

- [ ] **Step 7: Enforce audience in MCP handler**

In `src/mcp/raindrop-handler.ts`, after JWT verification, reject mismatched audience:

```ts
function audienceMatches(payload: JWTPayload, requestUrl: string): boolean {
  if (!payload.aud) {
    return true;
  }
  return canonicalizeResource(payload.aud) === expectedMcpResource(requestUrl);
}
```

Use it in JWT auth path:

```ts
        if (!audienceMatches(payload, req.url)) {
          return {
            ok: false,
            response: unauthorizedMcpResponse(req, 'Token audience does not match this MCP resource'),
          };
        }
```

- [ ] **Step 8: Add OAuth audience test**

In `tests/oauth.routes.test.ts`, add a test that exchanges a resource-bound authorization code and verifies `aud`:

```ts
  test('POST /token includes resource audience when authorization used resource indicator', async () => {
    const kv = new InMemoryKVNamespace();
    const signingKey = 'resource-audience-test-secret';
    const client = createClient();
    const codeVerifier = 'resource-audience-test-verifier-000000000000000000000000000000';
    const codeChallenge = createCodeChallenge(codeVerifier);
    const resource = 'https://example.com/mcp';

    await seedClient(kv, client);
    await kv.seedJson('authcode:resource-code', {
      code: 'resource-code',
      client_id: client.client_id,
      user_id: 'user-123',
      redirect_uri: client.redirect_uris[0],
      scope: 'raindrop:read raindrop:write',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      resource,
      expires_at: Date.now() + 300000,
      created_at: Date.now(),
    });

    const response = await fetchWorker('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: client.client_id,
        code: 'resource-code',
        redirect_uri: client.redirect_uris[0],
        code_verifier: codeVerifier,
      }),
    }, {
      RAINDROP_AUTH_KV: kv as unknown as KVNamespace,
      JWT_SIGNING_KEY: signingKey,
      JWT_ISSUER: 'https://example.com',
    });

    const body = await readJson<{ access_token: string }>(response);
    const { payload } = await jwtVerify(body.access_token, new TextEncoder().encode(signingKey), {
      issuer: 'https://example.com',
      audience: resource,
    });

    expect(response.status).toBe(200);
    expect(payload.aud).toBe(resource);
  });
```

- [ ] **Step 9: Add wrong-audience MCP test**

In `tests/worker.mcp.test.ts`, add a test that signs a JWT with `aud: https://wrong.example/mcp` and expects `/mcp` to return 401.

```ts
  test('JWT auth rejects wrong resource audience', async () => {
    const kv = new InMemoryKVNamespace();
    const signingKey = 'wrong-audience-test-secret';
    const token = await new SignJWT({
      sub: 'user-123',
      client_id: 'client-env-key',
      scope: 'raindrop:read raindrop:write',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://example.com')
      .setAudience('https://wrong.example/mcp')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(signingKey));

    const response = await fetchWorker('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    }, {
      RAINDROP_AUTH_KV: kv as unknown as KVNamespace,
      JWT_SIGNING_KEY: signingKey,
      JWT_ISSUER: 'https://example.com',
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('invalid_token');
  });
```

- [ ] **Step 10: Run OAuth and MCP tests**

```bash
bun test tests/oauth.routes.test.ts tests/worker.mcp.test.ts
bun run type-check
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/oauth/oauth.types.ts src/types/oauth-server.types.ts src/oauth/authorization-server.service.ts src/routes/oauth.ts src/routes/metadata.ts src/mcp/raindrop-handler.ts tests/oauth.routes.test.ts tests/worker.mcp.test.ts
git commit -m "feat: bind oauth tokens to mcp resource"
```

---

### Task 5: Add Full Secret-Safe E2E Automation

**Files:**
- Create: `scripts/check-cloudflare-e2e.mjs`
- Modify: `package.json`
- Modify: `scripts/check-cloudflare-readiness.mjs`

- [ ] **Step 1: Create `scripts/check-cloudflare-e2e.mjs`**

```js
#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'https://raindrop-mcp.anuragd.me';
const REDIRECT_URI = process.env.E2E_REDIRECT_URI || 'http://localhost:8765/callback';
const TOOL_NAME = process.env.E2E_TOOL || 'collection_list';

function form(data) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) body.set(key, value);
  }
  return body;
}

function wrangler(args) {
  return execFileSync('bunx', ['wrangler', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function getLoggedInUserId() {
  const raw = wrangler(['kv', 'key', 'list', '--binding', 'RAINDROP_AUTH_KV', '--remote']);
  const keys = JSON.parse(raw);
  const userKey = keys.map((key) => key.name).find((name) => /^user:\d+/.test(name));
  if (!userKey) {
    throw new Error('No Raindrop OAuth session found in KV. Open /auth/init?redirect_uri=/ once first.');
  }
  return userKey.slice('user:'.length);
}

async function main() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomUUID();
  const resource = `${BASE_URL}/mcp`;

  const registration = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Raindrop MCP E2E Probe',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'raindrop:read raindrop:write',
    }),
  });
  if (registration.status !== 201) throw new Error(`register failed: ${registration.status}`);
  const client = await registration.json();

  const userId = getLoggedInUserId();
  const authorization = await fetch(`${BASE_URL}/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `raindrop_session=${userId}`,
    },
    body: form({
      action: 'approve',
      state,
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      scope: 'raindrop:read raindrop:write',
      resource,
    }),
  });
  if (authorization.status !== 302) throw new Error(`authorize failed: ${authorization.status}`);
  const location = authorization.headers.get('location');
  const code = new URL(location).searchParams.get('code');
  if (!code) throw new Error('authorize redirect did not include code');

  const tokenResponse = await fetch(`${BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (tokenResponse.status !== 200) throw new Error(`token failed: ${tokenResponse.status}`);
  const tokenBody = await tokenResponse.json();

  const mcpResponse = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: TOOL_NAME, arguments: {} },
    }),
  });
  if (mcpResponse.status !== 200) throw new Error(`mcp failed: ${mcpResponse.status}`);
  const responseText = await mcpResponse.text();
  const dataLine = responseText.split('\n').find((line) => line.startsWith('data: '));
  const payload = JSON.parse(dataLine ? dataLine.slice(6) : responseText);
  if (payload.result?.isError) throw new Error(`${TOOL_NAME} returned MCP error`);

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    register: registration.status,
    authorize: authorization.status,
    token: tokenResponse.status,
    mcp: mcpResponse.status,
    tool: TOOL_NAME,
    ok: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 2: Add package scripts**

In `package.json`, add:

```json
"cf:e2e": "node scripts/check-cloudflare-e2e.mjs"
```

- [ ] **Step 3: Expand readiness checks**

In `scripts/check-cloudflare-readiness.mjs`, add checks:

```js
  const landing = await fetch(`${BASE_URL}/`, { redirect: 'manual' });
  if (landing.status === 200 && landing.headers.get('content-type')?.includes('text/html')) {
    pass('/ serves landing HTML');
  } else {
    ready = false;
    fail(`/ returned ${landing.status}`);
  }

  const fakeRoute = await fetch(`${BASE_URL}/dashboard`, { redirect: 'manual' });
  if (fakeRoute.status === 404) {
    pass('/dashboard is not a fake landing route');
  } else {
    ready = false;
    fail(`/dashboard returned ${fakeRoute.status}`);
  }

  const info = await getJson('/info');
  if (info.response.status === 200 && info.body?.endpoints?.mcp === '/mcp') {
    pass('/info returns MCP summary');
  } else {
    ready = false;
    fail(`/info returned ${info.response.status}`);
  }
```

- [ ] **Step 4: Run scripts locally**

```bash
bun run cf:readiness
bun run cf:e2e
```

Expected:

```text
PASS / serves landing HTML
PASS /dashboard is not a fake landing route
PASS /info returns MCP summary
```

`cf:e2e` prints statuses only and does not print tokens.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-cloudflare-e2e.mjs scripts/check-cloudflare-readiness.mjs package.json
git commit -m "test: add cloudflare e2e probe"
```

---

### Task 6: Align Docs And Deployment Checklist

**Files:**
- Modify: `README.md`
- Modify: `docs/OAUTH.md`
- Modify: `docs/OAUTH_AUTHORIZATION_SERVER.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/DEPLOYMENT_CHECKLIST.md`

- [ ] **Step 1: Update README quick start**

Replace the hosted quick start with:

```md
### Hosted Server

Use the production MCP endpoint:

```text
https://raindrop-mcp.anuragd.me/mcp
```

OAuth-aware MCP clients will:

1. Discover `/.well-known/oauth-protected-resource`.
2. Discover `/.well-known/oauth-authorization-server`.
3. Register with `/register`.
4. Open `/authorize` with PKCE.
5. Send you through Raindrop OAuth when no Raindrop session exists.
6. Exchange the authorization code at `/token`.
7. Call `/mcp` with the issued bearer token.
```

- [ ] **Step 2: Update endpoint table**

Use this endpoint list in docs:

```md
| Endpoint | Purpose |
| --- | --- |
| `GET /` | Public landing page |
| `GET /docs/` | Static setup/reference docs |
| `GET /info` | Public JSON capability summary |
| `POST /mcp` | MCP Streamable HTTP endpoint |
| `GET /.well-known/oauth-protected-resource` | Protected resource metadata |
| `GET /.well-known/oauth-authorization-server` | Authorization server metadata |
| `POST /register` | Dynamic client registration |
| `GET /authorize` | MCP OAuth authorization entry |
| `POST /authorize` | Consent approval/deny |
| `POST /token` | Authorization code and refresh token exchange |
| `GET /auth/init` | Internal Raindrop OAuth start |
| `GET /auth/callback` | Internal Raindrop OAuth callback |
```

- [ ] **Step 3: Update checklist verification commands**

In `docs/DEPLOYMENT_CHECKLIST.md`, include:

```bash
bun run type-check
bun test
bun run cf:types:check
bunx wrangler deploy --dry-run
bun run cf:readiness
bun run cf:e2e
```

- [ ] **Step 4: Run docs grep**

```bash
rg -n "dashboard|26 tools|Zero Storage|nothing gets copied|/auth/init\\?redirect_uri=/" README.md docs public
```

Expected: no matches except Cloudflare dashboard administrative references.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/OAUTH.md docs/OAUTH_AUTHORIZATION_SERVER.md docs/DEPLOYMENT.md docs/DEPLOYMENT_CHECKLIST.md
git commit -m "docs: document mcp client driven oauth flow"
```

---

### Task 7: Final Production Verification And PR Update

**Files:**
- No code files unless verification exposes a defect.

- [ ] **Step 1: Run full local gates**

```bash
bun run type-check
bun test
bun run cf:types:check
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Deploy**

```bash
bunx wrangler deploy
```

Expected: output includes both:

```text
https://raindrop-mcp.aarekaz.workers.dev
raindrop-mcp.anuragd.me (custom domain)
```

- [ ] **Step 3: Verify production**

```bash
bun run cf:readiness
bun run cf:e2e
```

Expected: both pass.

- [ ] **Step 4: Browser verify public pages**

Open:

```text
https://raindrop-mcp.anuragd.me/
https://raindrop-mcp.anuragd.me/docs/
https://raindrop-mcp.anuragd.me/info
```

Expected:

- `/` shows the landing page, install modal opens, copy buttons work.
- `/docs/` shows setup/reference docs.
- `/info` returns JSON.
- `/dashboard` returns 404.

- [ ] **Step 5: Push**

```bash
git push
```

- [ ] **Step 6: Update PR**

Use this PR note:

```md
Polished Raindrop MCP to match the proven Metro MCP public/protocol model.

- `/` is now the only landing page route.
- `/docs/` provides setup/reference docs.
- `/info` provides JSON server summary.
- `/dashboard` no longer renders as a fake app route.
- Landing page install flow is MCP-client driven.
- OAuth metadata and JWT flow support resource-bound MCP access.
- Added secret-safe Cloudflare E2E probe.

Verified:
- `bun run type-check`
- `bun test`
- `bun run cf:types:check`
- `wrangler deploy --dry-run`
- `bun run cf:readiness`
- `bun run cf:e2e`
- production browser checks for `/`, `/docs/`, `/info`, `/dashboard`
```

---

## Self-Review

**Spec coverage:** This plan covers the Metro-inspired landing page model, MCP OAuth flow, static routing, no dashboard route, public docs, `/info`, live E2E, production deploy, and small commits.

**Placeholder scan:** The plan contains no unfinished placeholder markers, deferred implementation notes, or unnamed "add tests" steps. Every task has exact file paths, code blocks for code changes, commands, expected results, and commit messages.

**Type consistency:** Resource indicator fields are introduced in OAuth types, saved on authorization codes, surfaced in JWT `aud`, and checked in the MCP handler. Route names match existing Raindrop routes: `/auth/init`, `/auth/callback`, `/authorize`, `/token`, `/register`, `/mcp`.
