# Migration Guide: Session Auth to OAuth 2.1 on Cloudflare Workers

This guide covers the current Cloudflare Worker deployment. Older deployments used a different hosting and KV setup; the active path is now Cloudflare Workers plus Workers KV.

## What Changed

- The Worker serves MCP, OAuth, metadata, and health routes from `src/worker.ts`.
- Workers KV stores OAuth clients, authorization codes, refresh tokens, sessions, and encrypted Raindrop tokens.
- JWT access tokens are issued for OAuth-aware MCP clients.
- Session-cookie auth and per-request `X-Raindrop-Token` auth remain available.
- Deployment-wide `RAINDROP_ACCESS_TOKEN` auth is disabled unless `ALLOW_ENV_TOKEN_AUTH=true`.

## For Deployment Administrators

### 1. Create Workers KV

```bash
bunx wrangler login
bun run cf:kv:create
```

Copy the printed namespace IDs into `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "RAINDROP_AUTH_KV",
    "id": "your-production-kv-id",
    "preview_id": "your-preview-kv-id"
  }
]
```

### 2. Set Secrets

Generate secrets:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Set Worker secrets:

```bash
bunx wrangler secret put JWT_SIGNING_KEY
bunx wrangler secret put OAUTH_CLIENT_ID
bunx wrangler secret put OAUTH_CLIENT_SECRET
bunx wrangler secret put OAUTH_REDIRECT_URI
bunx wrangler secret put OAUTH_ALLOWED_REDIRECT_URIS
bunx wrangler secret put TOKEN_ENCRYPTION_KEY
```

`JWT_ISSUER`, `JWT_ACCESS_TOKEN_EXPIRY`, and `JWT_REFRESH_TOKEN_EXPIRY` live in `wrangler.jsonc`.

### 3. Deploy

```bash
bun install
bun run type-check
bun test
bun run deploy:cloudflare
```

### 4. Verify

```bash
export BASE_URL="https://your-worker-domain.example.com"

curl "$BASE_URL/health" | jq
curl "$BASE_URL/.well-known/oauth-authorization-server" | jq
curl "$BASE_URL/.well-known/oauth-protected-resource" | jq
```

For a direct-token MCP smoke test:

```bash
curl -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Raindrop-Token: $RAINDROP_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## For MCP Client Users

OAuth-aware clients can use:

```json
{
  "mcpServers": {
    "raindrop": {
      "url": "https://your-worker-domain.example.com/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Clients that cannot complete OAuth can use a per-request token header:

```json
{
  "mcpServers": {
    "raindrop": {
      "url": "https://your-worker-domain.example.com/mcp",
      "transport": "streamable-http",
      "headers": {
        "X-Raindrop-Token": "your_raindrop_token"
      }
    }
  }
}
```

## Rollback

Cloudflare Workers supports deployment rollback from the Cloudflare dashboard and Wrangler deployment history. Before deploying a major auth change, tag the prior commit:

```bash
git tag -a pre-cloudflare-oauth -m "Pre Cloudflare OAuth deployment"
git push origin pre-cloudflare-oauth
```

If OAuth is misconfigured but the Worker is healthy, fix secrets or vars and redeploy. If the Worker itself is unhealthy, roll back to the prior Worker deployment and verify `/health`.

## Troubleshooting

### `JWT_SIGNING_KEY environment variable not set`

Set the secret with `bunx wrangler secret put JWT_SIGNING_KEY`.

### Session auth stops working

Check:

- `OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_REDIRECT_URI`
- `OAUTH_ALLOWED_REDIRECT_URIS`
- `TOKEN_ENCRYPTION_KEY`
- `RAINDROP_AUTH_KV` namespace IDs in `wrangler.jsonc`

### JWT tokens not working

Check:

- `JWT_SIGNING_KEY` secret is present.
- `JWT_ISSUER` matches the deployed URL.
- The token has not expired.
- The user has completed Raindrop auth so their encrypted Raindrop token exists in Workers KV.

### `No Raindrop token found for user`

Open `/auth/init` or retry the OAuth flow. The Worker needs one successful Raindrop login before it can call the Raindrop API for that user.

## More

- [Deployment](./DEPLOYMENT.md)
- [OAuth Setup](./OAUTH.md)
- [OAuth Authorization Server](./OAUTH_AUTHORIZATION_SERVER.md)
