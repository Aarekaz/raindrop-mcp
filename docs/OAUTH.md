# OAuth Setup

This server supports OAuth 2.1 for multi-user MCP deployments on Cloudflare Workers. Sessions, OAuth clients, authorization codes, refresh tokens, and encrypted Raindrop tokens are stored in Workers KV through the `RAINDROP_AUTH_KV` binding.

## 1. Create a Raindrop OAuth App

Create an app in the Raindrop developer console and collect:

- Client ID
- Client Secret
- Redirect URI: `https://your-worker-domain.example.com/auth/callback`

For local testing, add `http://localhost:8787/auth/callback` if your Raindrop app allows a development redirect URI.

## 2. Configure Cloudflare State Storage

Create the Workers KV namespaces:

```bash
bun run cf:kv:create
```

Copy the printed production `id` and preview `preview_id` into `wrangler.jsonc` under the `RAINDROP_AUTH_KV` binding.

## 3. Set Worker Secrets

Required production secrets:

```bash
bunx wrangler secret put OAUTH_CLIENT_ID
bunx wrangler secret put OAUTH_CLIENT_SECRET
bunx wrangler secret put OAUTH_REDIRECT_URI
bunx wrangler secret put OAUTH_ALLOWED_REDIRECT_URIS
bunx wrangler secret put TOKEN_ENCRYPTION_KEY
bunx wrangler secret put JWT_SIGNING_KEY
```

Generate `TOKEN_ENCRYPTION_KEY` with:

```bash
openssl rand -hex 32
```

Generate `JWT_SIGNING_KEY` with:

```bash
openssl rand -base64 32
```

`JWT_ISSUER`, `JWT_ACCESS_TOKEN_EXPIRY`, and `JWT_REFRESH_TOKEN_EXPIRY` are non-secret Worker vars in `wrangler.jsonc`.

## 4. Configure Redirect Allowlist

`OAUTH_ALLOWED_REDIRECT_URIS` is a comma-separated allowlist for post-auth redirects.

Examples:

- `https://your-worker-domain.example.com/`
- `/`
- `http://localhost:8080/callback`

## 5. Run the OAuth Flow

Start the Worker locally:

```bash
bun run dev
```

Start auth:

```text
http://localhost:8787/auth/init?redirect_uri=/
```

After Raindrop authorization, the Worker sets an httpOnly `mcp_session` cookie.

## 6. Calling the MCP Server

OAuth-aware MCP clients should use Streamable HTTP with OAuth discovery enabled:

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

For development smoke tests, you can pass a Raindrop token per request:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Raindrop-Token: $RAINDROP_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

The deployment-wide `RAINDROP_ACCESS_TOKEN` fallback is disabled unless `ALLOW_ENV_TOKEN_AUTH=true` is explicitly set. Prefer OAuth or per-request `X-Raindrop-Token` auth for production.
