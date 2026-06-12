# Cloudflare Deployment Checklist

Use this checklist for production deployment of the Raindrop MCP Cloudflare Worker.

## Pre-Deployment

### Code Verification

- [ ] `bun run type-check`
- [ ] `bun test`
- [ ] `bunx wrangler deploy --dry-run`
- [ ] `git diff --check`
- [ ] Git status clean

### Cloudflare Infrastructure

- [ ] Logged in with `bunx wrangler login`
- [ ] Production Workers KV namespace created for `RAINDROP_AUTH_KV`
- [ ] Preview Workers KV namespace created for `RAINDROP_AUTH_KV`
- [ ] `wrangler.jsonc` contains the real production `id`
- [ ] `wrangler.jsonc` contains the real `preview_id`
- [ ] DNS/custom domain configured if not using `workers.dev`
- [ ] HTTPS active on the production URL

Create KV namespaces:

```bash
bun run cf:kv:create
```

### Secrets and Vars

Generate secrets:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Required Worker secrets:

- [ ] `JWT_SIGNING_KEY`
- [ ] `OAUTH_CLIENT_ID`
- [ ] `OAUTH_CLIENT_SECRET`
- [ ] `OAUTH_REDIRECT_URI`
- [ ] `OAUTH_ALLOWED_REDIRECT_URIS`
- [ ] `TOKEN_ENCRYPTION_KEY`

Set secrets:

```bash
bunx wrangler secret put JWT_SIGNING_KEY
bunx wrangler secret put OAUTH_CLIENT_ID
bunx wrangler secret put OAUTH_CLIENT_SECRET
bunx wrangler secret put OAUTH_REDIRECT_URI
bunx wrangler secret put OAUTH_ALLOWED_REDIRECT_URIS
bunx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Required non-secret vars in `wrangler.jsonc`:

- [ ] `JWT_ISSUER`
- [ ] `JWT_ACCESS_TOKEN_EXPIRY`
- [ ] `JWT_REFRESH_TOKEN_EXPIRY`

Optional direct-token fallback:

- [ ] `RAINDROP_ACCESS_TOKEN` set only for single-user/private deployments
- [ ] `ALLOW_ENV_TOKEN_AUTH=true` set only when deployment-wide token auth is intentional

### Raindrop OAuth App

- [ ] Production callback URL added: `https://your-worker-domain.example.com/auth/callback`
- [ ] Local callback URL added if testing locally: `http://localhost:8787/auth/callback`
- [ ] Client ID copied into `OAUTH_CLIENT_ID`
- [ ] Client secret copied into `OAUTH_CLIENT_SECRET`

## Deployment

### Preview or Dry Run

```bash
bun run type-check
bun test
bunx wrangler deploy --dry-run
```

- [ ] Bundle succeeds
- [ ] Bindings include `RAINDROP_AUTH_KV`
- [ ] Assets are included if expected

### Production Deploy

```bash
bun run deploy:cloudflare
```

Production URL: ___________________

- [ ] Deploy succeeded
- [ ] Cloudflare dashboard shows the latest Worker version
- [ ] Custom domain routes to the Worker if configured

## Smoke Tests

```bash
export BASE_URL="https://your-worker-domain.example.com"
export RAINDROP_TOKEN="your-raindrop-token"
```

### Health and Metadata

```bash
curl "$BASE_URL/health" | jq
curl "$BASE_URL/.well-known/oauth-authorization-server" | jq
curl "$BASE_URL/.well-known/oauth-protected-resource" | jq
```

- [ ] `/health` returns status ok
- [ ] Authorization-server metadata uses the production issuer
- [ ] Protected-resource metadata points at `$BASE_URL/mcp`

### MCP Auth Enforcement

```bash
curl -i -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

- [ ] Unauthenticated request is rejected

### MCP Direct Token Smoke

```bash
curl -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Raindrop-Token: $RAINDROP_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq
```

- [ ] Tool list is returned

### OAuth Registration

```bash
curl -X POST "$BASE_URL/register" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Production Test Client",
    "redirect_uris": ["https://oauth.tools/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "token_endpoint_auth_method": "none",
    "scope": "raindrop:read raindrop:write"
  }' | jq
```

- [ ] Client registration works
- [ ] Client ID saved for end-to-end OAuth test

### End-to-End OAuth

- [ ] Generate PKCE verifier and challenge
- [ ] Open `$BASE_URL/authorize?...`
- [ ] Raindrop login works
- [ ] Consent screen loads
- [ ] Authorization code is returned
- [ ] `/token` exchanges code for JWT
- [ ] `/mcp` accepts the JWT
- [ ] Refresh-token grant returns a new access token

## Monitoring

- [ ] Check Worker logs with `bunx wrangler tail`
- [ ] Monitor OAuth endpoint errors
- [ ] Monitor JWT verification failures
- [ ] Monitor Workers KV reads/writes
- [ ] Remove production test clients after validation

## Rollback

- [ ] Previous commit tagged
- [ ] Previous Cloudflare Worker deployment identified
- [ ] Rollback procedure tested or documented

If needed, roll back from the Cloudflare dashboard or Wrangler deployment history, then verify:

```bash
curl "$BASE_URL/health" | jq
```

## Success Criteria

- [ ] Cloudflare deploy succeeds
- [ ] All smoke tests pass
- [ ] OAuth flow works end to end
- [ ] MCP direct-token smoke test works
- [ ] Unauthenticated MCP requests are rejected
- [ ] No active docs instruct deployers to use another hosting provider
