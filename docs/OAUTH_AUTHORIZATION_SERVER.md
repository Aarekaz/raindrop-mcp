# OAuth 2.1 Authorization Server

This document describes the self-contained OAuth 2.1 Authorization Server implementation in raindrop-mcp.

## Overview

raindrop-mcp has been transformed from an OAuth **client** (delegating to Raindrop.io) into a full OAuth 2.1 **Authorization Server** that:

- Issues JWT access tokens to MCP clients
- Manages client registration (RFC 7591)
- Implements PKCE (RFC 7636) for secure authorization
- Uses Raindrop.io as the backend identity provider
- Maintains backward compatibility with session-based authentication

## Architecture

### Current vs. Previous Flow

**Previous (OAuth Client):**
```
MCP Client → raindrop-mcp → Raindrop.io OAuth → Session Cookie → MCP requests
```

**Current (Authorization Server):**
```
MCP Client → /authorize → User consent → /token → JWT → MCP requests
                ↓
        Raindrop.io (identity verification only)
```

### Key Components

1. **Authorization Endpoint** (`/authorize`)
   - Handles authorization requests with PKCE
   - Shows user consent UI
   - Issues authorization codes

2. **Token Endpoint** (`/token`)
   - Exchanges authorization codes for JWT tokens
   - Supports refresh token grant
   - Validates PKCE challenges

3. **Registration Endpoint** (`/register`)
   - Dynamic client registration (RFC 7591)
   - Issues client credentials

4. **Authorization Server Service**
   - Core OAuth logic
   - JWT signing and verification (HMAC-SHA256)
   - PKCE validation
   - Token management

## Environment Variables

Add these to your `.env.local`:

```bash
# JWT Configuration
JWT_SIGNING_KEY=<base64-32-bytes>  # Generate: openssl rand -base64 32
JWT_ISSUER=https://raindrop-mcp.anuragd.me
JWT_ACCESS_TOKEN_EXPIRY=3600  # 1 hour
JWT_REFRESH_TOKEN_EXPIRY=2592000  # 30 days

# Keep existing Raindrop OAuth (for user identity)
OAUTH_CLIENT_ID=<raindrop-oauth-app-id>
OAUTH_CLIENT_SECRET=<raindrop-oauth-app-secret>
OAUTH_REDIRECT_URI=https://raindrop-mcp.anuragd.me/auth/callback

# Keep existing token encryption
TOKEN_ENCRYPTION_KEY=<64-char-hex>  # Generate: openssl rand -hex 32

# Vercel KV (auto-set by Vercel)
KV_REST_API_URL=<auto>
KV_REST_API_TOKEN=<auto>
```

## MCP Client Configuration

MCP clients can now auto-discover the OAuth server:

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

The client will:
1. Fetch `/.well-known/oauth-authorization-server` for server metadata
2. Open browser to `/authorize` endpoint
3. User authenticates via Raindrop.io (if needed)
4. User sees consent screen
5. Client receives authorization code
6. Client exchanges code for JWT token (with PKCE verification)
7. All MCP requests use Bearer JWT token

## API Endpoints

### Discovery

#### GET /.well-known/oauth-authorization-server

Returns authorization server metadata (RFC 8414):

```json
{
  "issuer": "https://raindrop-mcp.anuragd.me",
  "authorization_endpoint": "https://raindrop-mcp.anuragd.me/authorize",
  "token_endpoint": "https://raindrop-mcp.anuragd.me/token",
  "registration_endpoint": "https://raindrop-mcp.anuragd.me/register",
  "scopes_supported": ["raindrop:read", "raindrop:write"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "code_challenge_methods_supported": ["S256"]
}
```

#### GET /.well-known/oauth-protected-resource/api/raindrop

Returns protected resource metadata (RFC 9728):

```json
{
  "resource": "https://raindrop-mcp.anuragd.me/api/raindrop",
  "authorization_servers": [
    "https://raindrop-mcp.anuragd.me"
  ]
}
```

### Authorization Flow

#### GET /authorize

Authorization endpoint with PKCE.

**Parameters:**
- `client_id` (required): OAuth client ID
- `redirect_uri` (required): Callback URI
- `response_type` (required): Must be "code"
- `scope` (required): Space-separated scopes
- `state` (required): CSRF token
- `code_challenge` (required): PKCE challenge (base64url-encoded SHA-256)
- `code_challenge_method` (required): Must be "S256"

**Flow:**
1. If user not authenticated, redirects to `/auth/init`
2. Shows consent UI
3. On approval, redirects to `redirect_uri` with authorization code
4. On denial, redirects with error

**Example:**
```
GET /authorize?client_id=abc123&redirect_uri=http://localhost:8080/callback&response_type=code&scope=raindrop:read+raindrop:write&state=xyz&code_challenge=abc...&code_challenge_method=S256
```

#### POST /token

Token endpoint for code exchange and refresh.

**Grant Types:**

1. **authorization_code** - Exchange code for JWT

**Request (application/json):**
```json
{
  "grant_type": "authorization_code",
  "code": "authorization_code_here",
  "client_id": "client_id_here",
  "client_secret": "client_secret_here",  // Optional for public clients
  "redirect_uri": "http://localhost:8080/callback",
  "code_verifier": "pkce_verifier_here"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "uuid-v4",
  "scope": "raindrop:read raindrop:write"
}
```

2. **refresh_token** - Refresh access token

**Request:**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "refresh_token_here",
  "client_id": "client_id_here",
  "client_secret": "client_secret_here"  // Optional for public clients
}
```

### Client Registration

#### POST /register

Dynamic client registration (RFC 7591).

**Request:**
```json
{
  "client_name": "My MCP Client",
  "redirect_uris": ["http://localhost:8080/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none",
  "scope": "raindrop:read raindrop:write"
}
```

**Response:**
```json
{
  "client_id": "uuid-v4",
  "client_secret": "secret-if-confidential",
  "client_name": "My MCP Client",
  "redirect_uris": ["http://localhost:8080/callback"],
  "registration_access_token": "uuid-v4",
  "registration_client_uri": "https://raindrop-mcp.anuragd.me/register/uuid",
  "created_at": 1234567890
}
```

## JWT Token Format

### Access Token (JWT)

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "iss": "https://raindrop-mcp.anuragd.me",
  "sub": "raindrop_user_id",
  "aud": "raindrop-mcp",
  "exp": 1234567890,
  "iat": 1234567890,
  "client_id": "client_id_here",
  "scope": "raindrop:read raindrop:write",
  "raindrop_user_id": "raindrop_user_id"
}
```

**Signature:** HMAC-SHA256 with `JWT_SIGNING_KEY`

### Refresh Token

Opaque UUID stored in Vercel KV with 30-day TTL.

## Security Features

### PKCE (RFC 7636)

All authorization requests **must** include PKCE:

1. Client generates random `code_verifier` (43-128 characters)
2. Client calculates `code_challenge = BASE64URL(SHA256(code_verifier))`
3. Client sends `code_challenge` in `/authorize`
4. Client sends `code_verifier` in `/token`
5. Server verifies: `SHA256(code_verifier) == code_challenge`

This prevents authorization code interception attacks.

### Client Authentication

**Public Clients** (e.g., desktop apps, mobile apps):
- `token_endpoint_auth_method: "none"`
- No client secret required
- Must use PKCE

**Confidential Clients** (e.g., server-side apps):
- `token_endpoint_auth_method: "client_secret_post"`
- Client secret required (bcrypt-hashed in storage)
- PKCE recommended

### Token Storage

- **Authorization codes**: 5-minute TTL, one-time use
- **Refresh tokens**: 30-day TTL
- **User Raindrop tokens**: Encrypted with AES-256-GCM, 14-day TTL
- **Client secrets**: Bcrypt-hashed (cost factor: 10)

### CSRF Protection

- `state` parameter required in authorization requests
- State validated in callback

## Backward Compatibility

The server maintains backward compatibility with existing session-based authentication:

1. **JWT tokens** (new): `Authorization: Bearer eyJhbGc...`
2. **Session cookies** (legacy): `Authorization: Bearer session_id`
3. **Direct tokens**: `X-Raindrop-Token: token`
4. **Environment tokens**: `RAINDROP_ACCESS_TOKEN` (development only)

Token verification tries methods in order, allowing gradual migration.

## Testing

### 1. Test Server Metadata

```bash
curl https://raindrop-mcp.anuragd.me/.well-known/oauth-authorization-server | jq
```

Expected: Server metadata with endpoints

### 2. Register Test Client

```bash
curl -X POST https://raindrop-mcp.anuragd.me/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["http://localhost:8080/callback"],
    "token_endpoint_auth_method": "none"
  }' | jq
```

Expected: Client credentials (save `client_id`)

### 3. Start Authorization Flow

Open in browser:
```
https://raindrop-mcp.anuragd.me/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8080/callback&response_type=code&scope=raindrop:read+raindrop:write&state=random123&code_challenge=YOUR_CODE_CHALLENGE&code_challenge_method=S256
```

Expected:
1. Redirect to `/auth/init` (if not authenticated)
2. Consent screen
3. Redirect to `http://localhost:8080/callback?code=...&state=random123`

### 4. Exchange Code for Token

```bash
curl -X POST https://raindrop-mcp.anuragd.me/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "client_id": "YOUR_CLIENT_ID",
    "redirect_uri": "http://localhost:8080/callback",
    "code_verifier": "YOUR_CODE_VERIFIER"
  }' | jq
```

Expected: JWT access token and refresh token

### 5. Verify JWT

Paste token into https://jwt.io and verify:
- Header: `alg: HS256`
- Payload: Contains `iss`, `sub`, `exp`, `scope`, etc.
- Signature: Valid with `JWT_SIGNING_KEY`

### 6. Test MCP Request

```bash
curl -X POST https://raindrop-mcp.anuragd.me/mcp \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq
```

Expected: MCP tool list response

### 7. Test Refresh Token

```bash
curl -X POST https://raindrop-mcp.anuragd.me/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "client_id": "YOUR_CLIENT_ID"
  }' | jq
```

Expected: New JWT access token

## Deployment

### Vercel

1. Push code to GitHub
2. Deploy to Vercel: `vercel --prod`
3. Set environment variables in Vercel dashboard:
   - `JWT_SIGNING_KEY`
   - `JWT_ISSUER`
   - `OAUTH_CLIENT_ID`
   - `OAUTH_CLIENT_SECRET`
   - `OAUTH_REDIRECT_URI`
   - `TOKEN_ENCRYPTION_KEY`
4. Attach Vercel KV (auto-sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`)

### Custom Deployment

1. Set all environment variables
2. Deploy to any Node.js hosting (18+)
3. Set up Vercel KV or compatible Redis
4. Configure DNS for `JWT_ISSUER` domain

## Monitoring

Key metrics to monitor:

- **Token issuance rate**: `/token` endpoint requests/min
- **Authorization failures**: Failed PKCE validations, expired codes
- **JWT verification failures**: Invalid signatures, expired tokens
- **KV storage**: Authorization code, refresh token, client storage usage
- **User Raindrop token storage**: Successful/failed Raindrop API calls

## Troubleshooting

### "JWT verification failed"

- Check `JWT_SIGNING_KEY` is set correctly
- Verify token hasn't expired (`exp` claim)
- Ensure `JWT_ISSUER` matches deployment URL

### "PKCE validation failed"

- Verify `code_verifier` matches original `code_challenge`
- Ensure SHA-256 is used (not plain text)
- Check base64url encoding (not base64)

### "Invalid or expired authorization code"

- Authorization codes expire after 5 minutes
- Codes are one-time use only
- Check system clock synchronization

### "No Raindrop token found for user"

- User must authenticate via `/auth/init` first
- Check Vercel KV has `user_raindrop:{user_id}` entry
- Token expires after 14 days (re-authenticate)

## Standards Compliance

- **RFC 6749**: OAuth 2.0 Authorization Framework
- **RFC 7591**: OAuth 2.0 Dynamic Client Registration
- **RFC 7636**: Proof Key for Code Exchange (PKCE)
- **RFC 8414**: OAuth 2.0 Authorization Server Metadata
- **RFC 9728**: OAuth 2.0 Protected Resource Metadata
- **MCP Streamable HTTP**: OAuth auto-discovery

## Future Enhancements

- [ ] Rate limiting on `/token` and `/register` endpoints
- [ ] JWT key rotation support
- [ ] Client management UI
- [ ] Revocation endpoint (RFC 7009)
- [ ] Token introspection endpoint (RFC 7662)
- [ ] OpenID Connect support
- [ ] Scope-based access control
- [ ] Admin API for client management
