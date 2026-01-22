# HTTP Transport & Serverless Support

This document describes the HTTP transport implementation for the Raindrop MCP server, enabling serverless deployment and remote access.

## Overview

The Raindrop MCP server now supports two transport modes:

1. **STDIO Transport** (Original) - For local Claude Desktop integration
2. **HTTP/SSE Transport** (New) - For remote access and serverless deployment

## Architecture

### Dual Transport Support

```
┌─────────────────────────────────────────────────────┐
│                 Raindrop MCP Server                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐         ┌──────────────────────┐ │
│  │ STDIO Entry  │         │   HTTP Entry (NEW)   │ │
│  │ (index.ts)   │         │ (http-server.ts)     │ │
│  └──────┬───────┘         └──────────┬───────────┘ │
│         │                            │             │
│         │      ┌──────────────┐      │             │
│         └──────┤ MCP Service  ├──────┘             │
│                │   (Shared)   │                    │
│                └──────┬───────┘                    │
│                       │                            │
│                ┌──────▼──────────┐                 │
│                │ Raindrop.io API │                 │
│                └─────────────────┘                 │
└─────────────────────────────────────────────────────┘
```

### HTTP Server Features

- **SSE (Server-Sent Events)** for real-time MCP communication
- **Multi-tenant support** via per-request authentication
- **Security middleware** (Helmet, CORS)
- **API key authentication** (optional)
- **Graceful shutdown** handling
- **Health check endpoints**
- **Serverless-ready** exports

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file:

#### Option A: OAuth (Production)

```env
# OAuth Configuration
OAUTH_CLIENT_ID=your_client_id
OAUTH_CLIENT_SECRET=your_client_secret
OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
OAUTH_ALLOWED_REDIRECT_URIS=/dashboard,/
TOKEN_ENCRYPTION_KEY=your_64_char_hex_key  # Generate: openssl rand -hex 32

# Server Configuration
PORT=3000
NODE_ENV=development
API_KEY=your_secret_api_key
CORS_ORIGIN=*
```

**Note**: For local OAuth testing, you'll need to configure Raindrop OAuth app with `http://localhost:3000/auth/callback` as redirect URI.

#### Option B: Direct Token (Simple/Development)

```env
# Direct Token
RAINDROP_ACCESS_TOKEN=your_raindrop_token

# Server Configuration
PORT=3000
NODE_ENV=development
API_KEY=your_secret_api_key
CORS_ORIGIN=*
```

### 3. Build and Run

```bash
# Build the HTTP server
npm run build:http

# Start the server
npm run start:http
```

The server will start on `http://localhost:3000`

## Authentication

The server supports multiple authentication methods for maximum flexibility:

### Authentication Methods

| Method | Security | Multi-User | Use Case |
|--------|----------|------------|----------|
| **OAuth 2.0 Session** | ⭐⭐⭐⭐⭐ | ✅ Yes | Production deployments |
| **Direct Token Header** | ⭐⭐⭐ | ✅ Yes | API integrations, development |
| **Environment Token** | ⭐⭐ | ❌ No | Local development only |

### Method 1: OAuth 2.0 Session (Recommended)

**Best for**: Production multi-user deployments

Users authenticate via OAuth flow, server maintains encrypted sessions:

**Flow:**
```bash
# Step 1: Initiate OAuth (user visits in browser)
GET https://your-server.vercel.app/auth/init?redirect_uri=/dashboard

# Step 2: User authorizes on Raindrop.io (automatic redirect)

# Step 3: Callback sets session cookie
# Cookie: mcp_session=xxx (httpOnly, secure, 14-day expiry)

# Step 4: Client uses session for MCP requests
curl https://your-server.vercel.app/mcp \
  -H "Cookie: mcp_session=session_id_here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Features:**
- PKCE flow (Proof Key for Code Exchange)
- State parameter for CSRF protection
- Redirect URI allowlist
- AES-256-GCM token encryption
- HttpOnly, Secure cookies
- Automatic token refresh
- Session storage in Vercel KV (Redis)

**Requirements:**
```env
OAUTH_CLIENT_ID=your_client_id
OAUTH_CLIENT_SECRET=your_client_secret
OAUTH_REDIRECT_URI=https://your-app.vercel.app/auth/callback
OAUTH_ALLOWED_REDIRECT_URIS=https://your-app.com/dashboard,/dashboard
TOKEN_ENCRYPTION_KEY=64_char_hex_key
KV_REST_API_URL=https://...  # Auto-set by Vercel
KV_REST_API_TOKEN=...         # Auto-set by Vercel
```

📖 **Complete OAuth Setup**: See [OAuth Guide](./OAUTH.md)

### Method 2: Direct Token Header (Per-Request)

**Best for**: Personal use, API integrations, development

Each request includes user's Raindrop token in header:

```bash
curl https://your-server.vercel.app/mcp \
  -H "X-Raindrop-Token: user_raindrop_token" \
  -H "X-API-Key: server_api_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Features:**
- Stateless (no session storage)
- Multi-tenant capable
- Simple to implement
- Per-request authentication

**Requirements:**
```env
API_KEY=your_server_api_key  # Optional server protection
```

Users provide their own Raindrop tokens from: https://app.raindrop.io/settings/integrations

### Method 3: Environment Token (Fallback)

**Best for**: Local development only

Server uses token from environment variable:

```env
RAINDROP_ACCESS_TOKEN=your_raindrop_token
```

```bash
# Works without any auth headers (development only)
curl http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

⚠️ **Limitations:**
- Single-user only
- Disabled in `NODE_ENV=production`
- Not suitable for shared deployments

### Server API Key Protection (Optional)

Add an additional layer of protection to your server endpoint:

```env
API_KEY=your_secret_server_key
```

All requests must include:
```bash
-H "X-API-Key: your_secret_server_key"
```

**Recommended for:**
- Production deployments
- Public-facing servers
- Rate limiting enforcement

**Works with all authentication methods**

## Endpoints

### MCP Protocol Endpoints

#### `GET /mcp` or `POST /mcp`
Primary MCP protocol endpoint (using mcp-handler)

**Authentication:** Required (see Authentication section)

**Headers:**
- `Cookie: mcp_session=xxx` (OAuth session)
- OR `X-Raindrop-Token: xxx` (direct token)
- `X-API-Key: xxx` (optional server protection)
- `Content-Type: application/json`

**Request Body (POST):**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "collection_list",
        "description": "List all Raindrop.io collections",
        "inputSchema": { ... }
      }
    ]
  }
}
```

### Health & Info Endpoints

#### `GET /health`
Health check endpoint (no authentication required)

**Response (with OAuth):**
```json
{
  "status": "ok",
  "service": "raindrop-mcp",
  "version": "0.1.0",
  "oauth": true,
  "storage": "vercel-kv",
  "timestamp": "2026-01-23T21:00:00.000Z"
}
```

**Response (without OAuth):**
```json
{
  "status": "ok",
  "service": "raindrop-mcp",
  "version": "0.1.0",
  "oauth": false,
  "timestamp": "2026-01-23T21:00:00.000Z"
}
```

#### `GET /`
Server information and documentation

**Response:**
```json
{
  "name": "Raindrop MCP Server",
  "version": "0.1.0",
  "transport": "mcp-handler",
  "oauth": true,
  "endpoints": {
    "health": "/health",
    "mcp": "/mcp",
    "oauth": {
      "init": "/auth/init",
      "callback": "/auth/callback",
      "metadata": "/.well-known/oauth-protected-resource"
    }
  }
}
```

### OAuth Endpoints

#### `GET /auth/init?redirect_uri=<uri>`
Initiate OAuth 2.0 authorization flow

**Query Parameters:**
- `redirect_uri` (required) - Where to redirect after successful auth
  - Must be in `OAUTH_ALLOWED_REDIRECT_URIS` allowlist
  - Can be relative path (e.g., `/dashboard`) or absolute URL

**Example:**
```bash
https://your-server.vercel.app/auth/init?redirect_uri=/dashboard
```

**Response:**
Redirects to Raindrop.io authorization page

**Sets Cookie:**
```
oauth_state=xxx; HttpOnly; Secure; SameSite=Lax; Max-Age=300
```

#### `GET /auth/callback?code=<code>&state=<state>`
OAuth callback endpoint (called by Raindrop.io)

**Query Parameters:**
- `code` - Authorization code from Raindrop
- `state` - CSRF protection token

**Validation:**
- Verifies state matches cookie
- Exchanges code for access token using PKCE
- Fetches user information
- Creates encrypted session

**Response:**
Redirects to original `redirect_uri`

**Sets Cookie:**
```
mcp_session=xxx; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600; Path=/
```

**Security:**
- State validation prevents CSRF
- PKCE prevents code interception
- Redirect URI retrieved from server (not query param)
- Session ID not exposed in URL

#### `GET /.well-known/oauth-protected-resource`
OAuth 2.0 metadata endpoint

**Response:**
```json
{
  "resource": "https://your-server.vercel.app",
  "authorization_servers": ["https://raindrop.io"],
  "bearer_methods_supported": ["header", "cookie"],
  "resource_documentation": "https://github.com/Aarekaz/raindrop-mcp"
}
```

## Serverless Deployment

### Vercel

The server includes a Vercel adapter for seamless deployment.

**Files:**
- `src/adapters/vercel.ts` - Vercel serverless function adapter
- `vercel.json` - Deployment configuration
- `.vercelignore` - Files to exclude

**Deploy:**
```bash
npm run deploy:vercel
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

### AWS Lambda

Coming soon - adapter in development

### Cloudflare Workers

The server includes a Cloudflare Workers adapter for edge deployment.

**Files:**
- `src/adapters/cloudflare-worker.ts` - Cloudflare Workers adapter
- `wrangler.toml` - Wrangler configuration (if present)

**Deploy:**
```bash
npm run deploy:cloudflare
```

See [CLOUDFLARE-WORKERS.md](./CLOUDFLARE-WORKERS.md) for detailed instructions.

## Development

### File Structure

```
src/
├── index.ts                 # STDIO entry point (original)
├── http-server.ts           # HTTP entry point (new)
├── adapters/
│   └── vercel.ts           # Vercel adapter
├── services/
│   ├── raindrop.service.ts      # API client (shared)
│   └── raindropmcp.service.ts   # MCP layer (shared)
├── types/
└── utils/
```

### Available Scripts

```bash
# Development
npm run dev          # STDIO mode
npm run dev:http     # HTTP mode

# Building
npm run build        # Build STDIO
npm run build:http   # Build HTTP
npm run build:all    # Build both

# Running
npm run start:stdio  # Run STDIO
npm run start:http   # Run HTTP

# Deployment
npm run deploy:vercel  # Deploy to Vercel
npm run deploy:lambda  # Deploy to Lambda (coming soon)
```

## Configuration Options

### Environment Variables

#### OAuth Authentication (Production)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `OAUTH_CLIENT_ID` | OAuth app client ID | For OAuth | `65a1b2c3d4e5f6g7h8i9j0k1` |
| `OAUTH_CLIENT_SECRET` | OAuth app client secret | For OAuth | `a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6` |
| `OAUTH_REDIRECT_URI` | OAuth callback URL | For OAuth | `https://your-app.vercel.app/auth/callback` |
| `OAUTH_ALLOWED_REDIRECT_URIS` | Allowed redirect URIs (comma-separated) | For OAuth | `https://app.com/dashboard,/dashboard` |
| `TOKEN_ENCRYPTION_KEY` | 64-char hex encryption key | For OAuth | Generate: `openssl rand -hex 32` |
| `KV_REST_API_URL` | Vercel KV endpoint | For OAuth | Auto-set by Vercel |
| `KV_REST_API_TOKEN` | Vercel KV auth token | For OAuth | Auto-set by Vercel |

#### Direct Token (Development/Simple)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `RAINDROP_ACCESS_TOKEN` | Raindrop API token (fallback) | Without OAuth | `abc123def456...` |

#### Server Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `API_KEY` | Server API key protection | - | Recommended for production |
| `PORT` | HTTP server port | `3000` | No |
| `HOST` | HTTP server host | `0.0.0.0` | No |
| `NODE_ENV` | Environment mode | `development` | No |
| `CORS_ORIGIN` | CORS allowed origins | `*` | No |

### Security Headers

Automatically configured via Helmet:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block

For SSE endpoint:
- Cache-Control: no-cache, no-store, must-revalidate
- Connection: keep-alive
- X-Accel-Buffering: no

## Client Integration

### MCP Client Configuration

#### Option 1: OAuth Session (Recommended)

User authenticates via browser OAuth flow, then client uses session cookie:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// Step 1: Direct user to OAuth flow (in browser)
// https://your-server.vercel.app/auth/init?redirect_uri=/dashboard

// Step 2: After OAuth, session cookie is set automatically
// Now create client with credentials included

const transport = new SSEClientTransport(
  new URL('https://your-server.vercel.app/mcp'),
  {
    credentials: 'include', // Include cookies in requests
    headers: {
      'X-API-Key': 'your_server_api_key' // Optional server protection
    }
  }
);

const client = new Client({
  name: 'my-mcp-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

**Benefits:**
- Secure OAuth flow
- Automatic token refresh
- No token handling in client code
- Works with multiple users

#### Option 2: Direct Token Header

Each user provides their own Raindrop token:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(
  new URL('https://your-server.vercel.app/mcp'),
  {
    headers: {
      'X-API-Key': 'your_server_api_key',
      'X-Raindrop-Token': 'user_raindrop_token' // User's personal token
    }
  }
);

const client = new Client({
  name: 'my-mcp-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

**Benefits:**
- Stateless
- Simple to implement
- No OAuth setup required
- Direct control over tokens

#### Option 3: Environment Token (Local Development)

Uses server's environment token:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(
  new URL('http://localhost:3000/mcp')
  // No headers needed - uses RAINDROP_ACCESS_TOKEN from server env
);

const client = new Client({
  name: 'my-mcp-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

**Benefits:**
- Simplest for local development
- No authentication setup

**Limitations:**
- Single-user only
- Not suitable for production

## Limitations

### Vercel Specifics

- **Function timeout**: 300 seconds (5 minutes) max
- **Memory**: Configurable (1024 MB default)
- **Cold starts**: May occur on first request
- **Regions**: Configurable (default: iad1)

### SSE Considerations

- **One-way communication** from server to client
- **Reconnection** logic needed on client side
- **Proxy compatibility** - works through most proxies/load balancers

## Troubleshooting

### Connection Issues

**Problem:** SSE connection immediately closes  
**Solution:** Check authentication headers and tokens

**Problem:** 401 Unauthorized  
**Solution:** Verify API_KEY matches server configuration

**Problem:** 500 Internal Server Error  
**Solution:** Check RAINDROP_ACCESS_TOKEN is valid

### Performance Issues

**Problem:** Slow cold starts  
**Solution:** 
- Increase Vercel function memory
- Keep serverless function warm with periodic pings
- Consider edge deployment

### CORS Errors

**Problem:** CORS policy blocking requests  
**Solution:** Set `CORS_ORIGIN` environment variable to your client domain

## Migration Guide

### From STDIO to HTTP

The HTTP transport is **additional**, not a replacement. Your existing STDIO setup continues to work.

To add HTTP transport:

1. Update dependencies: `npm install`
2. Build HTTP server: `npm run build:http`
3. Configure environment variables
4. Start HTTP server: `npm run start:http`

Both transports can run simultaneously on different ports.

## Best Practices

1. **Use per-user tokens** for multi-tenant deployments
2. **Set API_KEY** in production environments
3. **Restrict CORS_ORIGIN** to specific domains
4. **Monitor health endpoint** for uptime checks
5. **Implement client reconnection** logic for SSE
6. **Log and monitor** Vercel function logs
7. **Rotate API keys** regularly

## Future Enhancements

- [ ] WebSocket transport option
- [ ] AWS Lambda adapter
- [ ] Request rate limiting
- [ ] Response caching
- [ ] Metrics and monitoring dashboard
- [ ] Connection pooling
- [ ] Session analytics
- [ ] Multi-region deployment
- [ ] GraphQL API support

## Support

- [OAuth Guide](./OAUTH.md) - Complete OAuth setup and troubleshooting
- [Deployment Guide](./DEPLOYMENT.md) - Deployment with OAuth and direct token
- [Cloudflare Workers Guide](./CLOUDFLARE-WORKERS.md) - Edge deployment
- [GitHub Issues](https://github.com/Aarekaz/raindrop-mcp/issues)
- [Main README](../README.md)
