# Migration Guide: Session-Based Auth → OAuth 2.1 Authorization Server

This guide helps you migrate from the legacy session-based authentication to the new OAuth 2.1 Authorization Server.

## Overview

raindrop-mcp has been upgraded from session-based authentication to a full OAuth 2.1 Authorization Server:

- **Before**: Session cookies with encrypted Raindrop tokens
- **After**: JWT tokens issued by raindrop-mcp, with Raindrop.io as identity provider

**Good news**: Both authentication methods work simultaneously. No breaking changes for existing users.

## For Deployment Administrators

### Step 1: Update Environment Variables

Add these new variables to your deployment:

```bash
# Generate a secure JWT signing key
openssl rand -base64 32

# Add to .env.local or deployment environment:
JWT_SIGNING_KEY=<generated-key>
JWT_ISSUER=https://raindrop-mcp.anuragd.me  # Your deployment URL
JWT_ACCESS_TOKEN_EXPIRY=3600  # 1 hour (optional, defaults to 3600)
JWT_REFRESH_TOKEN_EXPIRY=2592000  # 30 days (optional, defaults to 2592000)
```

Keep all existing variables:
```bash
OAUTH_CLIENT_ID=<raindrop-oauth-app-id>
OAUTH_CLIENT_SECRET=<raindrop-oauth-app-secret>
OAUTH_REDIRECT_URI=https://raindrop-mcp.anuragd.me/auth/callback
TOKEN_ENCRYPTION_KEY=<64-char-hex>
KV_REST_API_URL=<auto-set-by-vercel>
KV_REST_API_TOKEN=<auto-set-by-vercel>
```

### Step 2: Deploy

```bash
# Install new dependencies
bun install

# Type check
bun run type-check

# Deploy
vercel --prod
```

### Step 3: Verify Deployment

Test the OAuth server metadata endpoint:

```bash
curl https://YOUR-DEPLOYMENT-URL/.well-known/oauth-authorization-server | jq
```

Expected response:
```json
{
  "issuer": "https://YOUR-DEPLOYMENT-URL",
  "authorization_endpoint": "https://YOUR-DEPLOYMENT-URL/authorize",
  "token_endpoint": "https://YOUR-DEPLOYMENT-URL/token",
  ...
}
```

### Step 4: Test Backward Compatibility

Existing session-based authentication should still work:

1. Authenticate via `/auth/init`
2. Session cookie is set
3. MCP requests with session cookie work as before

No action required from existing users.

## For MCP Client Users

### Option 1: Continue Using Session-Based Auth (No Changes)

Your existing configuration continues to work:

```json
{
  "mcpServers": {
    "raindrop": {
      "url": "https://raindrop-mcp.anuragd.me/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Authentication flow:
1. MCP client requests endpoint
2. Server returns 401 with authentication URL
3. You authenticate via browser → `/auth/init`
4. Session cookie is set
5. All subsequent requests use session cookie

### Option 2: Migrate to OAuth 2.1 (Recommended)

Modern MCP clients with OAuth support can use auto-discovery:

```json
{
  "mcpServers": {
    "raindrop": {
      "url": "https://raindrop-mcp.anuragd.me/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Authentication flow:
1. MCP client fetches `/.well-known/oauth-authorization-server`
2. Client opens browser to `/authorize`
3. You authenticate (if needed) and see consent screen
4. Client receives JWT token
5. All subsequent requests use Bearer JWT token

**Benefits:**
- Standard OAuth 2.1 flow
- JWT tokens (stateless, can be verified offline)
- Refresh tokens (no re-authentication needed)
- Better security (PKCE, short-lived tokens)

## For Developers

### Reading JWT Tokens

Access tokens are now JWTs. You can decode them:

```javascript
// Decode JWT (header.payload.signature)
const [header, payload, signature] = token.split('.');
const decoded = JSON.parse(atob(payload));

console.log(decoded);
// {
//   iss: "https://raindrop-mcp.anuragd.me",
//   sub: "raindrop_user_id",
//   aud: "raindrop-mcp",
//   exp: 1234567890,
//   iat: 1234567890,
//   client_id: "client_id",
//   scope: "raindrop:read raindrop:write",
//   raindrop_user_id: "raindrop_user_id"
// }
```

### Verifying JWT Tokens

Server-side verification:

```typescript
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SIGNING_KEY);

const { payload } = await jwtVerify(token, secret, {
  issuer: 'https://raindrop-mcp.anuragd.me',
  audience: 'raindrop-mcp',
});

console.log(payload.sub); // User ID
console.log(payload.scope); // Scopes
```

### Building OAuth Clients

See the [OAuth Authorization Server documentation](./OAUTH_AUTHORIZATION_SERVER.md) for full API details.

**Quick start:**

1. **Register client:**
```bash
curl -X POST https://raindrop-mcp.anuragd.me/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My App",
    "redirect_uris": ["http://localhost:8080/callback"]
  }'
```

2. **Generate PKCE challenge:**
```javascript
import crypto from 'crypto';

const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');
```

3. **Start authorization:**
```
https://raindrop-mcp.anuragd.me/authorize?client_id=CLIENT_ID&redirect_uri=http://localhost:8080/callback&response_type=code&scope=raindrop:read+raindrop:write&state=random123&code_challenge=CODE_CHALLENGE&code_challenge_method=S256
```

4. **Exchange code for token:**
```bash
curl -X POST https://raindrop-mcp.anuragd.me/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTH_CODE",
    "client_id": "CLIENT_ID",
    "redirect_uri": "http://localhost:8080/callback",
    "code_verifier": "CODE_VERIFIER"
  }'
```

## Rollback Plan

If you need to rollback:

### Step 1: Remove JWT Environment Variables

Remove from deployment:
- `JWT_SIGNING_KEY`
- `JWT_ISSUER`
- `JWT_ACCESS_TOKEN_EXPIRY`
- `JWT_REFRESH_TOKEN_EXPIRY`

### Step 2: Revert Code

```bash
git checkout HEAD~1  # Or specific commit before OAuth changes
vercel --prod
```

### Step 3: Verify

Session-based auth should work as before. JWT auth will be unavailable.

## Deprecation Timeline

**Current (v0.1.0):**
- Both session-based and JWT auth supported
- No breaking changes

**Future (v1.0.0):**
- OAuth 2.1 is primary authentication method
- Session-based auth marked as legacy (still supported)

**Future (v2.0.0):**
- Session-based auth removed
- OAuth 2.1 only

**Timeline:** At least 6 months between each major version.

## Troubleshooting

### "JWT_SIGNING_KEY environment variable not set"

**Solution:** Add `JWT_SIGNING_KEY` to your environment:
```bash
openssl rand -base64 32  # Generate key
# Add to .env.local or deployment settings
```

### Session-based auth stops working

**Check:**
1. `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` are still set
2. `TOKEN_ENCRYPTION_KEY` is still set
3. Vercel KV is still attached
4. `/auth/init` endpoint is accessible

### JWT tokens not working

**Check:**
1. `JWT_SIGNING_KEY` is set in deployment
2. `JWT_ISSUER` matches your deployment URL
3. Token hasn't expired (check `exp` claim)
4. User has Raindrop token in KV (authenticate via `/auth/init` first)

### "No Raindrop token found for user"

**Cause:** JWT auth requires user to authenticate at least once to store Raindrop token.

**Solution:**
1. Open `/auth/init` in browser
2. Authenticate with Raindrop.io
3. Try JWT request again

## Support

- **GitHub Issues**: https://github.com/Aarekaz/raindrop-mcp/issues
- **Documentation**: [OAuth Authorization Server](./OAUTH_AUTHORIZATION_SERVER.md)
- **Slack/Discord**: (if applicable)

## FAQ

### Q: Do I need to migrate immediately?

**A:** No. Session-based auth will be supported for at least 6 months. Migrate at your convenience.

### Q: Can I use both authentication methods?

**A:** Yes. The server supports both simultaneously. Useful for gradual migration.

### Q: What if my MCP client doesn't support OAuth?

**A:** Continue using session-based auth. No changes needed.

### Q: Are there performance benefits to JWT?

**A:** Yes:
- JWT tokens are stateless (no database lookup for every request)
- Shorter-lived tokens (better security)
- Can be verified offline
- Standard OAuth 2.1 (better interoperability)

### Q: How do I rotate JWT signing keys?

**A:** Currently, key rotation requires:
1. Generate new key
2. Update `JWT_SIGNING_KEY`
3. Redeploy
4. All existing JWTs become invalid (users re-authenticate)

Future versions will support graceful key rotation.

### Q: Can I disable session-based auth?

**A:** Not in v0.1.0. Future versions will have a config option.
