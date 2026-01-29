# Quick Start: Testing OAuth Authorization Server

This guide helps you quickly test the OAuth 2.1 Authorization Server implementation locally.

## Prerequisites

- Bun or Node.js 18+
- Vercel KV (or local Redis)
- Raindrop.io OAuth app credentials

## Step 1: Generate Secrets

```bash
# Generate JWT signing key
openssl rand -base64 32

# Copy the output, you'll need it next
```

## Step 2: Configure Environment

Create `.env.local` (or update existing):

```bash
# OAuth Authorization Server
JWT_SIGNING_KEY=<paste-generated-key>
JWT_ISSUER=http://localhost:3000
JWT_ACCESS_TOKEN_EXPIRY=3600
JWT_REFRESH_TOKEN_EXPIRY=2592000

# Raindrop OAuth (existing)
OAUTH_CLIENT_ID=<your-raindrop-client-id>
OAUTH_CLIENT_SECRET=<your-raindrop-client-secret>
OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback

# Security (existing)
TOKEN_ENCRYPTION_KEY=<your-64-char-hex>

# Vercel KV (development)
KV_REST_API_URL=<your-kv-url>
KV_REST_API_TOKEN=<your-kv-token>
```

## Step 3: Install Dependencies

```bash
bun install
```

## Step 4: Start Development Server

```bash
bun run dev
```

Server starts at http://localhost:3000

## Step 5: Test Discovery Endpoint

Open http://localhost:3000/.well-known/oauth-authorization-server

Expected JSON response:
```json
{
  "issuer": "http://localhost:3000",
  "authorization_endpoint": "http://localhost:3000/authorize",
  "token_endpoint": "http://localhost:3000/token",
  "registration_endpoint": "http://localhost:3000/register",
  ...
}
```

## Step 6: Register Test Client

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["http://localhost:8080/callback"],
    "token_endpoint_auth_method": "none"
  }' | jq
```

Save the `client_id` from the response.

## Step 7: Generate PKCE Challenge

Using Node.js:

```javascript
// save as generate-pkce.js
import crypto from 'crypto';

const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

console.log('Code Verifier:', codeVerifier);
console.log('Code Challenge:', codeChallenge);
```

```bash
node generate-pkce.js
```

Save both values.

## Step 8: Start Authorization Flow

Open in browser (replace placeholders):

```
http://localhost:3000/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8080/callback&response_type=code&scope=raindrop:read+raindrop:write&state=test123&code_challenge=YOUR_CODE_CHALLENGE&code_challenge_method=S256
```

Expected flow:
1. Redirects to `/auth/init` (if not authenticated)
2. Login with Raindrop.io
3. See consent screen
4. Redirects to `http://localhost:8080/callback?code=...&state=test123`

Copy the authorization code from the URL.

## Step 9: Exchange Code for Token

```bash
curl -X POST http://localhost:3000/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "client_id": "YOUR_CLIENT_ID",
    "redirect_uri": "http://localhost:8080/callback",
    "code_verifier": "YOUR_CODE_VERIFIER"
  }' | jq
```

Expected response:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "uuid-v4",
  "scope": "raindrop:read raindrop:write"
}
```

Save the `access_token`.

## Step 10: Verify JWT Token

Paste your access token into https://jwt.io

Expected:
- **Algorithm**: HS256
- **Issuer**: http://localhost:3000
- **Subject**: Your Raindrop user ID
- **Expiration**: ~1 hour from now

## Step 11: Test MCP Request

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }' | jq
```

Expected: List of available MCP tools

## Step 12: Test Refresh Token

```bash
curl -X POST http://localhost:3000/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "client_id": "YOUR_CLIENT_ID"
  }' | jq
```

Expected: New access token

## Troubleshooting

### "JWT_SIGNING_KEY environment variable not set"

Make sure `.env.local` contains `JWT_SIGNING_KEY`.

Restart dev server: `bun run dev`

### "Invalid or expired authorization code"

Authorization codes expire after 5 minutes. Generate a new one (Step 8).

### "PKCE validation failed"

Make sure you're using the same `code_verifier` that generated the `code_challenge`.

### "No Raindrop token found for user"

Complete the authentication flow first (Step 8). This stores your Raindrop token.

### Redirect to localhost:8080 fails

That's expected - you just need the authorization code from the URL.

Or set up a local server:

```bash
# Python
python3 -m http.server 8080

# Node.js
npx http-server -p 8080
```

## Next Steps

### Test with Real MCP Client

Update your MCP client config:

```json
{
  "mcpServers": {
    "raindrop": {
      "url": "http://localhost:3000/mcp",
      "transport": "streamable-http"
    }
  }
}
```

The client should auto-discover OAuth and open the authorization flow.

### Deploy to Vercel

```bash
# Set environment variables in Vercel dashboard
vercel --prod
```

Update `JWT_ISSUER` to your production URL.

### Build Your Own OAuth Client

See [OAuth Authorization Server documentation](./OAUTH_AUTHORIZATION_SERVER.md) for full API details.

## Complete Test Script

Create `test-oauth.sh`:

```bash
#!/bin/bash

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo "OAuth 2.1 Authorization Server Test"
echo "===================================="
echo

# 1. Test discovery
echo -e "${GREEN}1. Testing discovery endpoint...${NC}"
curl -s http://localhost:3000/.well-known/oauth-authorization-server | jq -r '.issuer'
echo

# 2. Register client
echo -e "${GREEN}2. Registering test client...${NC}"
CLIENT_RESPONSE=$(curl -s -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["http://localhost:8080/callback"],
    "token_endpoint_auth_method": "none"
  }')

CLIENT_ID=$(echo $CLIENT_RESPONSE | jq -r '.client_id')
echo "Client ID: $CLIENT_ID"
echo

# 3. Generate PKCE
echo -e "${GREEN}3. Generating PKCE challenge...${NC}"
CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=' | tr '/+' '_-')
CODE_CHALLENGE=$(echo -n $CODE_VERIFIER | openssl dgst -sha256 -binary | base64 | tr -d '=' | tr '/+' '_-')
echo "Code Verifier: $CODE_VERIFIER"
echo "Code Challenge: $CODE_CHALLENGE"
echo

# 4. Authorization URL
echo -e "${GREEN}4. Authorization URL (open in browser):${NC}"
echo "http://localhost:3000/authorize?client_id=$CLIENT_ID&redirect_uri=http://localhost:8080/callback&response_type=code&scope=raindrop:read+raindrop:write&state=test123&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256"
echo

echo "After authorization, paste the code parameter from the redirect URL:"
read -p "Authorization code: " AUTH_CODE
echo

# 5. Exchange code for token
echo -e "${GREEN}5. Exchanging code for token...${NC}"
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/token \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\": \"authorization_code\",
    \"code\": \"$AUTH_CODE\",
    \"client_id\": \"$CLIENT_ID\",
    \"redirect_uri\": \"http://localhost:8080/callback\",
    \"code_verifier\": \"$CODE_VERIFIER\"
  }")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')
REFRESH_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.refresh_token')
echo "Access Token: ${ACCESS_TOKEN:0:20}..."
echo "Refresh Token: $REFRESH_TOKEN"
echo

# 6. Test MCP request
echo -e "${GREEN}6. Testing MCP request with JWT...${NC}"
curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq -r '.result.tools[0].name'
echo

# 7. Test refresh token
echo -e "${GREEN}7. Testing refresh token...${NC}"
NEW_TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/token \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\": \"refresh_token\",
    \"refresh_token\": \"$REFRESH_TOKEN\",
    \"client_id\": \"$CLIENT_ID\"
  }")

NEW_ACCESS_TOKEN=$(echo $NEW_TOKEN_RESPONSE | jq -r '.access_token')
echo "New Access Token: ${NEW_ACCESS_TOKEN:0:20}..."
echo

echo -e "${GREEN}✓ All tests passed!${NC}"
```

Make executable and run:

```bash
chmod +x test-oauth.sh
./test-oauth.sh
```

## Resources

- [OAuth 2.1 Authorization Server Docs](./OAUTH_AUTHORIZATION_SERVER.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md)
- [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html) - OAuth 2.0
- [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html) - PKCE
