# Deployment (Vercel)

This repository is designed to be hosted on Vercel using the `mcp-handler` pattern.

## Endpoints

- MCP endpoint: `POST /mcp` (rewritten to `POST /api/raindrop` via `vercel.json`)
- Health: `GET /health` (rewritten to `GET /api/health`)
- OAuth init: `GET /auth/init` (served from `api/auth/init.ts`)
- OAuth callback: `GET /auth/callback` (served from `api/auth/callback.ts`)
- OAuth metadata: `GET /.well-known/oauth-protected-resource` (served from `api/.well-known/oauth-protected-resource.ts`)

## Deploy

```bash
npm install
npm run deploy:vercel
```

## Environment Variables

### OAuth (Recommended)

Set these in Vercel → Project → Settings → Environment Variables:

- `OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_REDIRECT_URI` (example: `https://your-app.vercel.app/auth/callback`)
- `OAUTH_ALLOWED_REDIRECT_URIS` (comma-separated allowlist, example: `https://your-app.com/dashboard,/dashboard`)
- `TOKEN_ENCRYPTION_KEY` (64 hex chars; generate with `openssl rand -hex 32`)
- `KV_REST_API_URL` and `KV_REST_API_TOKEN` (auto-set when you attach Vercel KV)

Optional:

- `API_KEY` (recommended: protects the MCP endpoint via `X-API-Key`)
- `NODE_ENV=production`

### Direct Token (No OAuth)

If you don’t want OAuth, you can run single-user with:

- `RAINDROP_ACCESS_TOKEN`

In production, set `API_KEY` too.

## Quick Checks

```bash
curl https://your-app.vercel.app/health
```

To verify MCP is reachable, you should use an MCP client (Streamable HTTP) pointed at:

- `https://your-app.vercel.app/mcp`

## MCP Compliance

This server implements MCP best practices:

- **Structured outputs**: All tools define output schemas
- **Tool metadata**: Annotations for read-only, destructive, idempotent operations
- **Helpful errors**: Error messages include examples and guidance
- **Evaluations**: 10 test questions in `evaluations/raindrop.xml`

See README.md for full compliance details.

