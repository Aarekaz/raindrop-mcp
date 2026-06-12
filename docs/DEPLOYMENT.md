# Deployment (Cloudflare Workers)

This project deploys as a Cloudflare Worker. The Worker entrypoint is `src/worker.ts`, routes are served directly from the Worker, and OAuth/session state is stored in Workers KV through the `RAINDROP_AUTH_KV` binding.

## Endpoints

- `POST /mcp` - MCP Streamable HTTP endpoint
- `GET /health` - service health
- `GET /auth/init` and `GET /auth/callback` - Raindrop OAuth flow
- `GET /authorize`, `POST /authorize`, `POST /token`, `POST /register` - OAuth authorization server endpoints
- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`

## Prerequisites

- Bun 1.0+
- Cloudflare account with Workers enabled
- Raindrop.io OAuth app for production OAuth

Install dependencies:

```bash
bun install
```

Authenticate Wrangler:

```bash
bunx wrangler login
```

## Create Workers KV

Create production and preview KV namespaces:

```bash
bun run cf:kv:create
```

Wrangler prints namespace IDs for `RAINDROP_AUTH_KV`. Copy the production `id` and preview `preview_id` into `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "RAINDROP_AUTH_KV",
    "id": "your-production-kv-id",
    "preview_id": "your-preview-kv-id"
  }
]
```

## Configure Secrets

Set required production secrets with Wrangler:

```bash
bunx wrangler secret put OAUTH_CLIENT_ID
bunx wrangler secret put OAUTH_CLIENT_SECRET
bunx wrangler secret put OAUTH_REDIRECT_URI
bunx wrangler secret put OAUTH_ALLOWED_REDIRECT_URIS
bunx wrangler secret put TOKEN_ENCRYPTION_KEY
bunx wrangler secret put JWT_SIGNING_KEY
```

Notes:

- `OAUTH_REDIRECT_URI` should point to your deployed callback URL, for example `https://raindrop-mcp.example.com/auth/callback`.
- `OAUTH_ALLOWED_REDIRECT_URIS` is a comma-separated allowlist for post-auth redirects.
- `TOKEN_ENCRYPTION_KEY` must be 64 hex characters. Generate one with `openssl rand -hex 32`.
- `JWT_SIGNING_KEY` should be a high-entropy secret.
- `JWT_ISSUER`, `JWT_ACCESS_TOKEN_EXPIRY`, and `JWT_REFRESH_TOKEN_EXPIRY` are configured in `wrangler.jsonc`.

## Optional Direct Token Fallback

For development or a single-user private deployment, the Worker can read a Raindrop token from the environment:

```bash
bunx wrangler secret put RAINDROP_ACCESS_TOKEN
bunx wrangler secret put ALLOW_ENV_TOKEN_AUTH
```

Set `ALLOW_ENV_TOKEN_AUTH` to `true` to opt in. This fallback is not recommended for production because it uses one deployment-wide Raindrop token instead of per-user OAuth.

Requests can also send a direct token per request with `X-Raindrop-Token`; that is useful for smoke tests and local MCP clients.

## Local Development

Start the Worker locally:

```bash
bun run dev
```

Wrangler serves the Worker at `http://localhost:8787` by default.

## Deploy

Deploy to Cloudflare Workers:

```bash
bun run deploy:cloudflare
```

## Smoke Tests

Set a base URL and a Raindrop API token:

```bash
export BASE_URL="https://raindrop-mcp.example.com"
export RAINDROP_TOKEN="your-raindrop-token"
```

Check health:

```bash
curl "$BASE_URL/health"
```

Check OAuth protected-resource metadata:

```bash
curl "$BASE_URL/.well-known/oauth-protected-resource"
```

Check MCP tool listing with direct request-token auth:

```bash
curl -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Raindrop-Token: $RAINDROP_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Expected result: `/health` returns JSON with `"status":"ok"`, metadata returns the deployed resource and authorization server, and `tools/list` returns the registered Raindrop MCP tools.

You can run the same production readiness checks with:

```bash
BASE_URL="https://raindrop-mcp.aarekaz.workers.dev" bun run cf:readiness
```

The readiness command exits non-zero if required Worker secrets are missing. While `OAUTH_CLIENT_ID` or `OAUTH_CLIENT_SECRET` are unset, it also verifies that `/auth/init` fails closed with `oauth_not_configured`.
