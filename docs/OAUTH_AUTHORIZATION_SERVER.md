# OAuth 2.1 Authorization Server

This document describes the OAuth 2.1 Authorization Server implementation in `raindrop-mcp`.

## Overview

`raindrop-mcp` acts as an OAuth authorization server for MCP clients while using Raindrop.io as the upstream identity and API provider.

It:

- Issues JWT access tokens to MCP clients.
- Supports OAuth client registration.
- Requires PKCE for authorization-code flows.
- Stores clients, authorization codes, refresh tokens, sessions, and encrypted Raindrop tokens in Workers KV.
- Serves OAuth and MCP routes from the Cloudflare Worker entrypoint.

## Architecture

```text
MCP Client -> /authorize -> Raindrop login -> consent -> /token -> JWT -> /mcp
                                      |
                                      v
                         Workers KV stores encrypted user token
```

Core endpoints:

- `GET /authorize`
- `POST /authorize`
- `POST /token`
- `POST /register`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`
- `POST /mcp`

## Cloudflare Configuration

`RAINDROP_AUTH_KV` must be configured as a Workers KV binding in `wrangler.jsonc`.

Required Worker secrets:

```bash
bunx wrangler secret put OAUTH_CLIENT_ID
bunx wrangler secret put OAUTH_CLIENT_SECRET
bunx wrangler secret put OAUTH_REDIRECT_URI
bunx wrangler secret put OAUTH_ALLOWED_REDIRECT_URIS
bunx wrangler secret put TOKEN_ENCRYPTION_KEY
bunx wrangler secret put JWT_SIGNING_KEY
```

Required non-secret Worker vars:

- `JWT_ISSUER`
- `JWT_ACCESS_TOKEN_EXPIRY`
- `JWT_REFRESH_TOKEN_EXPIRY`

See [Deployment](./DEPLOYMENT.md) for the full Cloudflare setup.

## MCP Client Configuration

OAuth-aware MCP clients can auto-discover the authorization server:

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

Client flow:

1. Fetch `/.well-known/oauth-protected-resource`.
2. Fetch `/.well-known/oauth-authorization-server`.
3. Open `/authorize`.
4. Complete Raindrop authentication if needed.
5. Approve consent.
6. Exchange the authorization code at `/token`.
7. Send `Authorization: Bearer <jwt>` to `/mcp`.

## Discovery

### `GET /.well-known/oauth-authorization-server`

Returns authorization server metadata:

```json
{
  "issuer": "https://your-worker-domain.example.com",
  "authorization_endpoint": "https://your-worker-domain.example.com/authorize",
  "token_endpoint": "https://your-worker-domain.example.com/token",
  "registration_endpoint": "https://your-worker-domain.example.com/register",
  "scopes_supported": ["raindrop:read", "raindrop:write"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "code_challenge_methods_supported": ["S256"]
}
```

### `GET /.well-known/oauth-protected-resource`

Returns protected resource metadata:

```json
{
  "resource": "https://your-worker-domain.example.com/mcp",
  "authorization_servers": ["https://your-worker-domain.example.com"]
}
```

## Authorization Endpoint

### `GET /authorize`

Required query parameters:

- `client_id`
- `redirect_uri`
- `response_type=code`
- `scope`
- `state`
- `code_challenge`
- `code_challenge_method=S256`

If the user is not authenticated, the Worker redirects to `/auth/init`. If the user is authenticated, the Worker shows a consent screen.

### `POST /authorize`

Approves or denies the consent screen. The Worker revalidates the client, redirect URI, scopes, and requested action before redirecting.

## Token Endpoint

### `POST /token`

Supports:

- `authorization_code`
- `refresh_token`

Authorization-code exchange:

```json
{
  "grant_type": "authorization_code",
  "code": "authorization_code_here",
  "client_id": "client_id_here",
  "client_secret": "client_secret_here",
  "redirect_uri": "http://localhost:8080/callback",
  "code_verifier": "pkce_verifier_here"
}
```

Refresh-token exchange:

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "refresh_token_here",
  "client_id": "client_id_here",
  "client_secret": "client_secret_here"
}
```

The Worker enforces the registered client grant policy before issuing tokens.

## Client Registration

### `POST /register`

Example:

```json
{
  "client_name": "My MCP Client",
  "redirect_uris": ["http://localhost:8080/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none",
  "scope": "raindrop:read raindrop:write"
}
```

Response:

```json
{
  "client_id": "uuid",
  "client_secret": "secret-if-confidential",
  "client_name": "My MCP Client",
  "redirect_uris": ["http://localhost:8080/callback"],
  "registration_access_token": "uuid",
  "registration_client_uri": "https://your-worker-domain.example.com/register/uuid",
  "created_at": 1234567890
}
```

## Token Format

JWT access tokens are signed with `JWT_SIGNING_KEY` and include:

```json
{
  "iss": "https://your-worker-domain.example.com",
  "sub": "raindrop_user_id",
  "aud": "raindrop-mcp",
  "exp": 1234567890,
  "iat": 1234567890,
  "client_id": "client_id_here",
  "scope": "raindrop:read raindrop:write",
  "raindrop_user_id": "raindrop_user_id"
}
```

Refresh tokens are opaque values stored in Workers KV with the configured TTL.

## Security Features

- PKCE with `S256` is required for authorization-code flows.
- Authorization codes are short-lived and one-time use.
- Refresh tokens are scoped to registered clients.
- Confidential client secrets are bcrypt-hashed.
- User Raindrop tokens are encrypted with AES-256-GCM before storage.
- The Worker validates redirect URIs and requested scopes on both authorization GET and POST.
- Direct deployment-wide token auth is disabled unless `ALLOW_ENV_TOKEN_AUTH=true`.

## Testing

See [Quick Start OAuth](./QUICKSTART_OAUTH.md) for an end-to-end local flow.

Minimal smoke checks:

```bash
curl http://localhost:8787/.well-known/oauth-authorization-server | jq
curl http://localhost:8787/.well-known/oauth-protected-resource | jq
curl http://localhost:8787/health | jq
```

## Troubleshooting

### `JWT verification failed`

Check `JWT_SIGNING_KEY`, `JWT_ISSUER`, and the token expiration.

### `PKCE validation failed`

Use the same `code_verifier` that generated the submitted `code_challenge`.

### `Invalid or expired authorization code`

Generate a new authorization code. Codes expire quickly and can be used once.

### `No Raindrop token found for user`

Complete the Raindrop login flow through `/auth/init` or `/authorize` so the Worker can store the encrypted Raindrop token in Workers KV.

## Standards

- OAuth 2.0 Authorization Framework
- OAuth 2.0 Dynamic Client Registration
- Proof Key for Code Exchange
- OAuth 2.0 Authorization Server Metadata
- OAuth 2.0 Protected Resource Metadata
- MCP Streamable HTTP OAuth discovery
