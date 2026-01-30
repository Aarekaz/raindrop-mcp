# Deployment (Vercel)

This repository is designed to be hosted on Vercel using the `mcp-handler` pattern.

## Endpoints

- MCP endpoint: `POST /mcp` (rewritten to `POST /api/raindrop` via `vercel.json`)
- Health: `GET /health` (rewritten to `GET /api/health`)
- OAuth init: `GET /auth/init` (served from `api/auth/init.ts`)
- OAuth callback: `GET /auth/callback` (served from `api/auth/callback.ts`)
- OAuth metadata: `GET /.well-known/oauth-protected-resource` (served from `public/.well-known/oauth-protected-resource`)
- OAuth auth server metadata: `GET /.well-known/oauth-authorization-server` (served from `public/.well-known/oauth-authorization-server`)

Note: `.well-known` metadata is served as static files. For preview or local dev URLs, update the JSON files in `public/.well-known/` to match the deployed origin.

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

## Vercel Best Practices

This deployment follows Vercel MCP server best practices:

### Fluid Compute Enabled

Fluid compute is enabled for optimized performance:
- 90% cost savings vs traditional serverless
- 50% CPU reduction vs legacy SSE transport
- Optimized concurrency for irregular MCP usage patterns
- Automatic bytecode caching for faster cold starts

Verify in Vercel dashboard: Project → Settings → Functions → Fluid Compute (should be ON)

### Streamable HTTP Transport

The server implements MCP Streamable HTTP specification (2025-03-26):
- Supports GET, POST, and DELETE methods
- Optional SSE upgrade for streaming responses
- Session management via Mcp-Session-Id headers
- Origin header validation for security

### Security

Critical security features:
- Origin header validation (prevents DNS rebinding attacks)
- OAuth 2.0 with PKCE authentication
- AES-256-GCM token encryption
- HTTPS-only in production

### Testing

Test all HTTP methods after deployment:

```bash
# Test POST (client requests)
curl -X POST https://your-app.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Test GET (server messages)
curl -X GET https://your-app.vercel.app/mcp \
  -H "Accept: text/event-stream"

# Test DELETE (session termination)
curl -X DELETE https://your-app.vercel.app/mcp
```

## MCP Compliance

This server implements MCP best practices:

- **Structured outputs**: All tools define output schemas
- **Tool metadata**: Annotations for read-only, destructive, idempotent operations
- **Helpful errors**: Error messages include examples and guidance
- **Evaluations**: 10 test questions in `evaluations/raindrop.xml`

See README.md for full compliance details.
