# OAuth Authorization Server Deployment Checklist

Use this checklist to ensure a smooth deployment of the OAuth 2.1 Authorization Server.

## Pre-Deployment

### ✅ Code Verification

- [ ] All tests passing: `bun test`
- [ ] Type check clean: `bun run type-check`
- [ ] Git status clean (all changes committed)
- [ ] Latest code on main/master branch

### ✅ Environment Variables

Generate secrets:

```bash
# JWT signing key
openssl rand -base64 32

# Token encryption key (if not already set)
openssl rand -hex 32
```

Verify these are set in your deployment environment:

**Required:**
- [ ] `JWT_SIGNING_KEY` (generated above)
- [ ] `JWT_ISSUER` (your deployment URL)
- [ ] `OAUTH_CLIENT_ID` (Raindrop OAuth app)
- [ ] `OAUTH_CLIENT_SECRET` (Raindrop OAuth app)
- [ ] `OAUTH_REDIRECT_URI` (your-url/auth/callback)
- [ ] `TOKEN_ENCRYPTION_KEY` (generated above)
- [ ] `KV_REST_API_URL` (Vercel KV)
- [ ] `KV_REST_API_TOKEN` (Vercel KV)

**Optional (with defaults):**
- [ ] `JWT_ACCESS_TOKEN_EXPIRY` (default: 3600)
- [ ] `JWT_REFRESH_TOKEN_EXPIRY` (default: 2592000)
- [ ] `NODE_ENV` (default: production)

### ✅ Infrastructure

- [ ] Vercel KV attached to project
- [ ] DNS configured for production domain
- [ ] SSL certificate valid (HTTPS required)
- [ ] Raindrop OAuth app redirect URI updated

### ✅ Documentation

- [ ] Team briefed on new OAuth flow
- [ ] Migration guide shared with users
- [ ] Support channels prepared for questions

## Deployment Steps

### Step 1: Backup

```bash
# Backup current environment variables
vercel env pull .env.backup

# Tag current production version
git tag -a v0.0.9 -m "Pre-OAuth deployment"
git push origin v0.0.9
```

- [ ] Environment variables backed up
- [ ] Production version tagged

### Step 2: Set Environment Variables

**Via Vercel Dashboard:**

1. Go to Project Settings → Environment Variables
2. Add/Update variables listed above
3. Scope: Production, Preview, Development (as needed)

**Via CLI:**

```bash
# Set JWT_SIGNING_KEY
echo "your_generated_key" | vercel env add JWT_SIGNING_KEY production

# Set JWT_ISSUER
echo "https://your-domain.com" | vercel env add JWT_ISSUER production

# Verify
vercel env ls
```

- [ ] All environment variables set
- [ ] Variables verified in dashboard

### Step 3: Deploy to Preview

```bash
# Deploy to preview first
vercel

# Get preview URL and save it
```

Preview URL: ___________________

- [ ] Preview deployment successful
- [ ] Preview URL accessible

### Step 4: Test Preview Deployment

Use preview URL for testing:

```bash
# Replace with your preview URL
export PREVIEW_URL="https://your-preview-url.vercel.app"

# Test discovery
curl $PREVIEW_URL/.well-known/oauth-authorization-server | jq

# Test backward compatibility (session-based auth)
# Should still work without JWT
```

- [ ] Discovery endpoint returns correct metadata
- [ ] Authorization endpoint accessible
- [ ] Token endpoint returns 400 (not 500) for invalid requests
- [ ] Session-based auth still works

### Step 5: Deploy to Production

```bash
# Deploy to production
vercel --prod

# Verify deployment
vercel ls
```

Production URL: ___________________

- [ ] Production deployment successful
- [ ] Deployment verified in Vercel dashboard

### Step 6: Smoke Tests

```bash
export PROD_URL="https://your-production-url.com"

# 1. Discovery endpoint
curl $PROD_URL/.well-known/oauth-authorization-server | jq

# 2. Protected resource metadata
curl $PROD_URL/.well-known/oauth-protected-resource/api/raindrop | jq

# 3. Health check
curl $PROD_URL/health

# 4. MCP endpoint (should return 401 without auth)
curl -X POST $PROD_URL/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

- [ ] Discovery endpoint works
- [ ] Protected resource metadata works
- [ ] Health endpoint responds
- [ ] MCP endpoint requires authentication

### Step 7: End-to-End OAuth Test

**7.1 Register Test Client:**

```bash
curl -X POST $PROD_URL/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Production Test Client",
    "redirect_uris": ["https://oauth.tools/callback"],
    "token_endpoint_auth_method": "none"
  }' | jq
```

Save client_id: ___________________

- [ ] Client registration works

**7.2 Test Authorization Flow:**

Use https://oauth.tools/ or open manually:

```
$PROD_URL/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://oauth.tools/callback&response_type=code&scope=raindrop:read+raindrop:write&state=test123&code_challenge=YOUR_CODE_CHALLENGE&code_challenge_method=S256
```

- [ ] Authorization page loads
- [ ] Raindrop authentication works
- [ ] Consent UI displays correctly
- [ ] Authorization code received

**7.3 Exchange Code for Token:**

```bash
curl -X POST $PROD_URL/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "client_id": "YOUR_CLIENT_ID",
    "redirect_uri": "https://oauth.tools/callback",
    "code_verifier": "YOUR_CODE_VERIFIER"
  }' | jq
```

- [ ] Token exchange works
- [ ] JWT token received
- [ ] Refresh token received

**7.4 Test MCP Request:**

```bash
curl -X POST $PROD_URL/mcp \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq
```

- [ ] MCP request with JWT works
- [ ] Tool list returned

**7.5 Test Refresh Token:**

```bash
curl -X POST $PROD_URL/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "client_id": "YOUR_CLIENT_ID"
  }' | jq
```

- [ ] Refresh token works
- [ ] New access token received

### Step 8: Test Backward Compatibility

**Session-based auth (legacy):**

1. Open `$PROD_URL/auth/init` in browser
2. Authenticate with Raindrop
3. Note session cookie is set
4. Try MCP request with session cookie

- [ ] Session-based login still works
- [ ] Session cookie is set
- [ ] MCP requests with session work

### Step 9: Monitor Initial Traffic

Check Vercel dashboard for:

- [ ] Function invocations (normal patterns)
- [ ] Error rates (should be low)
- [ ] Response times (similar to before)
- [ ] KV operations (authorization codes, tokens)

Monitor for 15-30 minutes after deployment.

### Step 10: Update Documentation

- [ ] README updated with OAuth information
- [ ] Deployment guide reflects new variables
- [ ] User documentation updated
- [ ] API documentation reflects new endpoints

## Post-Deployment

### ✅ Communication

- [ ] Announce new OAuth support to users
- [ ] Share migration guide
- [ ] Update support documentation
- [ ] Notify integration partners

### ✅ Monitoring Setup

Set up alerts for:

- [ ] High error rate on OAuth endpoints
- [ ] JWT verification failures
- [ ] PKCE validation failures
- [ ] KV storage capacity
- [ ] Token expiry patterns

### ✅ Cleanup

- [ ] Remove test clients from production
- [ ] Archive backup files
- [ ] Update runbooks
- [ ] Document any issues encountered

## Rollback Plan

If critical issues occur:

### Quick Rollback (< 5 minutes)

```bash
# Revert to previous deployment
vercel rollback

# Verify
curl $PROD_URL/.well-known/oauth-protected-resource/api/raindrop | jq
```

- [ ] Previous deployment ID noted: ___________________
- [ ] Rollback procedure tested in preview

### Partial Rollback (Remove JWT, Keep Session)

If JWT auth is problematic but session auth works:

1. Remove `JWT_SIGNING_KEY` from environment
2. Redeploy (same code)
3. JWT auth becomes unavailable
4. Session auth continues working

## Success Criteria

Deployment is successful when:

- [ ] All smoke tests pass
- [ ] End-to-end OAuth flow works
- [ ] Backward compatibility verified
- [ ] No increase in error rates
- [ ] Response times similar to before
- [ ] MCP clients can authenticate
- [ ] Team can support OAuth questions

## Known Issues / Workarounds

| Issue | Impact | Workaround |
|-------|--------|-----------|
| JWT key rotation not supported | Users must re-auth after key change | Plan maintenance window |
| No revocation endpoint | Cannot revoke tokens early | Wait for expiry (1 hour) |
| No rate limiting | Potential abuse | Rely on Vercel limits |

## Support Resources

- **Documentation**: `/docs/OAUTH_AUTHORIZATION_SERVER.md`
- **Migration Guide**: `/docs/MIGRATION_GUIDE.md`
- **Quick Start**: `/docs/QUICKSTART_OAUTH.md`
- **GitHub Issues**: https://github.com/Aarekaz/raindrop-mcp/issues

## Deployment History

| Date | Version | Deployed By | Status | Notes |
|------|---------|-------------|--------|-------|
| 2026-01-29 | v0.1.0 | | ⏳ Pending | OAuth 2.1 Authorization Server |
| | | | | |

## Post-Deployment Review (24 hours)

After 24 hours, review:

- [ ] Total OAuth authorizations
- [ ] JWT vs. session auth ratio
- [ ] Token refresh patterns
- [ ] Error patterns
- [ ] User feedback
- [ ] Performance metrics

## Security Checklist

- [ ] JWT_SIGNING_KEY is at least 32 bytes (256 bits)
- [ ] HTTPS enforced (no HTTP in production)
- [ ] PKCE required for all auth requests
- [ ] Client secrets are bcrypt-hashed (confidential clients)
- [ ] Tokens are encrypted at rest (AES-256-GCM)
- [ ] Authorization codes expire after 5 minutes
- [ ] JWT tokens expire after 1 hour
- [ ] Refresh tokens expire after 30 days
- [ ] CSRF protection with state parameter
- [ ] Origin validation on MCP endpoint

## Final Sign-Off

**Deployment Date**: ___________________
**Deployed By**: ___________________
**Reviewed By**: ___________________
**Status**: [ ] Success [ ] Partial [ ] Rollback Required

**Notes**:
___________________________________________
___________________________________________
___________________________________________

---

**Version**: v0.1.0
**Last Updated**: January 29, 2026
