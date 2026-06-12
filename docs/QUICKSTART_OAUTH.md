# Quick Start: Testing OAuth Authorization Server

This guide tests the OAuth 2.1 Authorization Server locally on Cloudflare Workers.

## Prerequisites

- Bun 1.0+
- Cloudflare Wrangler
- Raindrop.io OAuth app credentials
- Workers KV binding configured in `wrangler.jsonc`

## Step 1. Install Dependencies

```bash
bun install
```

## Step 2. Generate Secrets

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Use the first value for `JWT_SIGNING_KEY` and the second value for `TOKEN_ENCRYPTION_KEY`.

## Step 3. Configure Local Environment

Create or update `.dev.vars` for Wrangler local development:

```bash
JWT_SIGNING_KEY=<base64-secret>
JWT_ISSUER=http://localhost:8787
JWT_ACCESS_TOKEN_EXPIRY=3600
JWT_REFRESH_TOKEN_EXPIRY=2592000

OAUTH_CLIENT_ID=<your-raindrop-client-id>
OAUTH_CLIENT_SECRET=<your-raindrop-client-secret>
OAUTH_REDIRECT_URI=http://localhost:8787/auth/callback
OAUTH_ALLOWED_REDIRECT_URIS=http://localhost:8080/callback,/dashboard

TOKEN_ENCRYPTION_KEY=<64-char-hex>
```

For direct-token smoke testing only, you may also add:

```bash
ALLOW_ENV_TOKEN_AUTH=true
RAINDROP_ACCESS_TOKEN=<your-raindrop-api-token>
```

## Step 4. Start Wrangler

```bash
bun run dev
```

Wrangler serves the Worker at `http://localhost:8787`.

## Step 5. Test Discovery

```bash
curl http://localhost:8787/.well-known/oauth-authorization-server | jq
curl http://localhost:8787/.well-known/oauth-protected-resource | jq
```

Expected: metadata points at `http://localhost:8787`.

## Step 6. Register a Test Client

```bash
curl -X POST http://localhost:8787/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["http://localhost:8080/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "token_endpoint_auth_method": "none",
    "scope": "raindrop:read raindrop:write"
  }' | jq
```

Save the `client_id`.

## Step 7. Generate PKCE Values

```javascript
// save as generate-pkce.js
import crypto from "crypto";

const codeVerifier = crypto.randomBytes(32).toString("base64url");
const codeChallenge = crypto
  .createHash("sha256")
  .update(codeVerifier)
  .digest("base64url");

console.log("Code Verifier:", codeVerifier);
console.log("Code Challenge:", codeChallenge);
```

```bash
node generate-pkce.js
```

## Step 8. Start Authorization

Open this URL after replacing the placeholders:

```text
http://localhost:8787/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8080/callback&response_type=code&scope=raindrop:read+raindrop:write&state=test123&code_challenge=YOUR_CODE_CHALLENGE&code_challenge_method=S256
```

Expected flow:

1. Redirect to `/auth/init` if no session exists.
2. Authenticate with Raindrop.io.
3. Approve the consent screen.
4. Redirect to `http://localhost:8080/callback?code=...&state=test123`.

Copy the authorization code from the URL.

## Step 9. Exchange Code for Token

```bash
curl -X POST http://localhost:8787/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "client_id": "YOUR_CLIENT_ID",
    "redirect_uri": "http://localhost:8080/callback",
    "code_verifier": "YOUR_CODE_VERIFIER"
  }' | jq
```

Expected: a JWT `access_token`, `token_type: "Bearer"`, `expires_in`, and a refresh token when the client is registered for the refresh-token grant.

## Step 10. Test MCP

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq
```

Expected: list of available MCP tools.

## Step 11. Test Refresh

```bash
curl -X POST http://localhost:8787/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "client_id": "YOUR_CLIENT_ID"
  }' | jq
```

Expected: a new access token.

## Troubleshooting

### `JWT_SIGNING_KEY environment variable not set`

Add it to `.dev.vars` and restart Wrangler.

### `Invalid or expired authorization code`

Authorization codes expire after 5 minutes and can be used once.

### `PKCE validation failed`

Use the same `code_verifier` that generated the original `code_challenge`.

### `No Raindrop token found for user`

Complete the Raindrop authentication flow first so the Worker can store the encrypted Raindrop token in Workers KV.

### Redirect to localhost:8080 fails

That can be fine during manual testing. You only need the `code` query parameter from the redirected URL. Running `python3 -m http.server 8080` can make the redirect look cleaner.

## Production Deployment

Use [Deployment](./DEPLOYMENT.md) for Cloudflare KV creation, Worker secrets, deploy, and smoke-test commands.
