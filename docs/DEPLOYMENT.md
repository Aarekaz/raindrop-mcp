# Deployment Guide

This guide covers deploying the Raindrop MCP server with HTTP transport to various serverless platforms. The server now supports **OAuth 2.0 authentication** for secure multi-user deployments.

## Table of Contents

- [Authentication Overview](#authentication-overview)
- [Vercel Deployment](#vercel-deployment)
- [Cloudflare Workers Deployment](#cloudflare-workers-deployment)
- [Local HTTP Server](#local-http-server)
- [Environment Variables](#environment-variables)
- [Testing the Deployment](#testing-the-deployment)

---

## Authentication Overview

The Raindrop MCP server supports multiple authentication methods:

| Method | Use Case | Setup Complexity | Multi-User |
|--------|----------|------------------|------------|
| **OAuth 2.0** | Production (recommended) | Medium | ✅ Yes |
| **Direct Token** | Personal use, development | Easy | ❌ No |
| **Environment Token** | Local development | Easy | ❌ No |

**For production deployments**, we recommend OAuth 2.0. See the [OAuth Guide](./OAUTH.md) for complete setup instructions.

**For quick personal use**, you can deploy with just a direct Raindrop token (see environment variables below).

---

## Vercel Deployment

### Prerequisites

1. [Vercel Account](https://vercel.com/signup)
2. [Vercel CLI](https://vercel.com/docs/cli) installed: `npm i -g vercel`
3. **Choose authentication method**:
   - **OAuth (Recommended)**: Raindrop OAuth app ([Create here](https://raindrop.io/dev/apps)) + Vercel KV
   - **Direct Token**: Raindrop.io API token ([Get here](https://app.raindrop.io/settings/integrations))

### Quick Deploy

#### Option 1: Using Vercel CLI (Recommended)

```bash
# Install dependencies
npm install

# Login to Vercel
vercel login

# Deploy (first time - follow prompts)
npm run deploy:vercel
```

During the first deployment, you'll be prompted to:
- Link to existing project or create new one
- Set project name
- Configure build settings (accept defaults)

#### Option 2: Deploy via Git Integration

1. Push your code to GitHub/GitLab/Bitbucket
2. Import project in [Vercel Dashboard](https://vercel.com/new)
3. Configure environment variables (see below)
4. Deploy automatically

### Configure Environment Variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables.

#### Option A: OAuth Authentication (Recommended for Production)

**Required OAuth Variables:**
```bash
# OAuth credentials from https://raindrop.io/dev/apps
OAUTH_CLIENT_ID=your_client_id_here
OAUTH_CLIENT_SECRET=your_client_secret_here
OAUTH_REDIRECT_URI=https://your-project.vercel.app/auth/callback

# Security: Allowed redirect URIs (comma-separated)
OAUTH_ALLOWED_REDIRECT_URIS=https://your-app.com/dashboard,/dashboard

# Token encryption key (generate: openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=your_64_char_hex_key

# Vercel KV (automatically set when KV linked)
KV_REST_API_URL=https://your-kv-instance.vercel-storage.com
KV_REST_API_TOKEN=your_kv_token
```

**Optional Variables:**
```bash
API_KEY=your_api_key_for_authentication
CORS_ORIGIN=https://yourdomain.com
NODE_ENV=production
```

**📖 Complete OAuth Setup**: See [OAuth Guide](./OAUTH.md) for detailed instructions.

#### Option B: Direct Token (Simple, Single-User)

**Required:**
```bash
RAINDROP_ACCESS_TOKEN=your_raindrop_token_here
```

**Optional:**
```bash
API_KEY=your_api_key_for_authentication
CORS_ORIGIN=https://yourdomain.com
NODE_ENV=production
```

#### Using Vercel CLI:

```bash
# OAuth setup
vercel env add OAUTH_CLIENT_ID production
vercel env add OAUTH_CLIENT_SECRET production
vercel env add OAUTH_REDIRECT_URI production
vercel env add OAUTH_ALLOWED_REDIRECT_URIS production
vercel env add TOKEN_ENCRYPTION_KEY production

# Or direct token setup
vercel env add RAINDROP_ACCESS_TOKEN production
vercel env add API_KEY production
```

### Setup Vercel KV (Required for OAuth)

OAuth requires persistent storage for sessions and tokens. Use Vercel KV:

1. **Create KV Database**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard) → Storage
   - Click **Create Database** → **KV (Redis)**
   - Choose name (e.g., `raindrop-mcp-storage`)
   - Select region closest to your deployment

2. **Link to Project**:
   - Open your project → Storage tab
   - Click **Connect Store**
   - Select your KV database
   - This automatically sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`

3. **Verify**:
   ```bash
   # Check environment variables are set
   vercel env ls
   ```

   Should show:
   ```
   KV_REST_API_URL    (Production)
   KV_REST_API_TOKEN  (Production, Encrypted)
   ```

**Note**: Vercel KV free tier includes:
- 30,000 commands/month
- 256MB storage
- Suitable for hundreds of users

### Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your domain
3. Configure DNS as instructed

---

## Cloudflare Workers Deployment

Deploy to Cloudflare's global edge network for low-latency, worldwide access.

### Quick Deploy

```bash
# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Set secrets
wrangler secret put RAINDROP_ACCESS_TOKEN
wrangler secret put API_KEY

# Build and deploy
npm run build:cloudflare
npm run deploy:cloudflare
```

Your worker will be live at: `https://raindrop-mcp.your-subdomain.workers.dev`

### Why Cloudflare Workers?

- **Global Edge Network**: Deploy to 300+ cities worldwide
- **Zero Cold Starts**: Sub-millisecond startup time
- **Cost Effective**: 100,000 requests/day on free tier
- **Auto-scaling**: Scales automatically with traffic

**📖 Full Guide**: See [CLOUDFLARE-WORKERS.md](./CLOUDFLARE-WORKERS.md) for detailed instructions, advanced features, and troubleshooting.

---

## Local HTTP Server

### Development Mode

```bash
# Install dependencies
npm install

# Build the HTTP server
npm run build:http

# Start with environment variables
export RAINDROP_ACCESS_TOKEN=your_token
export API_KEY=optional_api_key
npm run start:http
```

Or use a `.env` file:

```bash
# .env
RAINDROP_ACCESS_TOKEN=your_token
API_KEY=optional_api_key
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
```

Then run:

```bash
npm run start:http
```

### Production Mode

```bash
# Build
npm run build:http

# Start with production settings
NODE_ENV=production npm run start:http
```

---

## Environment Variables

### OAuth Authentication Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `OAUTH_CLIENT_ID` | OAuth app client ID from Raindrop.io | For OAuth | `65a1b2c3d4e5f6g7h8i9j0k1` |
| `OAUTH_CLIENT_SECRET` | OAuth app client secret | For OAuth | `a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6` |
| `OAUTH_REDIRECT_URI` | OAuth callback URL | For OAuth | `https://your-app.vercel.app/auth/callback` |
| `OAUTH_ALLOWED_REDIRECT_URIS` | Comma-separated allowed redirect URIs | For OAuth | `https://app.com/dashboard,/dashboard` |
| `TOKEN_ENCRYPTION_KEY` | 64-char hex key for token encryption | For OAuth | `a1b2c3...` (generate with `openssl rand -hex 32`) |
| `KV_REST_API_URL` | Vercel KV REST API endpoint | For OAuth | Auto-set by Vercel when KV linked |
| `KV_REST_API_TOKEN` | Vercel KV authentication token | For OAuth | Auto-set by Vercel when KV linked |

### Direct Token Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `RAINDROP_ACCESS_TOKEN` | Raindrop.io API token (fallback for dev/personal use) | Without OAuth | `abc123def456...` |

### Server Configuration Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `API_KEY` | Server API key for endpoint protection | `undefined` | `my-secret-api-key` |
| `PORT` | HTTP server port | `3000` | `8080` |
| `HOST` | HTTP server host | `0.0.0.0` | `127.0.0.1` |
| `NODE_ENV` | Environment mode | `development` | `production` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` | `https://myapp.com` |

### Multi-Tenant Configuration

The server supports three authentication methods simultaneously:

**Method 1: OAuth Session (Recommended for production)**
```bash
# User authenticates via /auth/init flow
# Session cookie automatically included in requests
curl https://your-domain.vercel.app/mcp \
  -H "Cookie: mcp_session=session_id_here"
```

**Method 2: Direct Raindrop Token (Per-user)**
```bash
# Each user provides their own token
curl https://your-domain.vercel.app/mcp \
  -H "X-Raindrop-Token: user_specific_token" \
  -H "X-API-Key: your_server_api_key"
```

**Method 3: Environment Token (Development fallback)**
```bash
# Uses RAINDROP_ACCESS_TOKEN from environment
# Only works in non-production environments
curl http://localhost:3000/mcp
```

This allows different users to connect with their own Raindrop.io accounts while sharing the same server instance.

---

## Testing the Deployment

### Health Check

```bash
# Local
curl http://localhost:3000/health

# Vercel
curl https://your-project.vercel.app/health

# Cloudflare Workers
curl https://raindrop-mcp.your-subdomain.workers.dev/health
```

Expected response (with OAuth enabled):
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

Expected response (without OAuth):
```json
{
  "status": "ok",
  "service": "raindrop-mcp",
  "version": "0.1.0",
  "oauth": false,
  "timestamp": "2026-01-23T21:00:00.000Z"
}
```

### Test OAuth Flow (If Using OAuth)

1. **Initiate OAuth**:
   ```bash
   # Visit in browser
   https://your-project.vercel.app/auth/init?redirect_uri=/dashboard
   ```

   You'll be redirected to Raindrop.io to authorize the app.

2. **Verify Session Cookie**:
   After authorization, check browser DevTools → Application → Cookies.

   You should see:
   - `mcp_session` cookie (httpOnly, secure)

3. **Test Authenticated MCP Request**:
   ```bash
   # Extract session cookie from browser DevTools
   curl https://your-project.vercel.app/mcp \
     -H "Cookie: mcp_session=YOUR_SESSION_ID" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```

**📖 Complete OAuth Testing Guide**: See [OAuth Guide](./OAUTH.md#testing-oauth)

### Test MCP Connection (Direct Token)

```bash
# With user-specific Raindrop token
curl https://your-project.vercel.app/mcp \
  -H "X-API-Key: your_api_key" \
  -H "X-Raindrop-Token: user_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Expected response:
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
      },
      ...
    ]
  }
}
```

### Integration with MCP Clients

#### With OAuth (Recommended)

Users authenticate via browser OAuth flow, then client uses session:

```typescript
// After user completes OAuth in browser
const client = new Client({
  transport: new SSEClientTransport(
    new URL('https://your-project.vercel.app/mcp'),
    {
      credentials: 'include', // Include session cookies
    }
  )
});
```

#### With Direct Token

```typescript
const client = new Client({
  transport: new SSEClientTransport(
    new URL('https://your-project.vercel.app/mcp'),
    {
      headers: {
        'X-API-Key': 'your_server_api_key',
        'X-Raindrop-Token': 'user_raindrop_token'
      }
    }
  )
});
```

---

## Platform Comparison

| Feature | Vercel | Cloudflare Workers |
|---------|--------|-------------------|
| **Cold Start** | ~500ms | Sub-millisecond |
| **Free Tier** | 100GB bandwidth | 100K requests/day |
| **Execution Time** | 10s (hobby), 300s (pro) | 10-50ms CPU time |
| **Global CDN** | Yes | 300+ edge locations |
| **Custom Domains** | Yes (free SSL) | Yes (free SSL) |
| **WebSocket** | No | Yes (with Durable Objects) |
| **Node.js Support** | Full | Limited (Web APIs) |
| **Best For** | Node.js apps, longer execution | Edge computing, low latency |

---

## Troubleshooting

### Common Issues

**1. 401 Unauthorized**
- Check that `API_KEY` is set correctly
- Verify `X-API-Key` header matches

**2. 500 Internal Server Error**
- Check `RAINDROP_ACCESS_TOKEN` is set
- Verify Raindrop token is valid
- Check platform function logs

**3. SSE Connection Drops**
- Vercel functions have a 300s (5 min) timeout
- Cloudflare Workers need Durable Objects for persistent connections
- Implement reconnection logic in client

**4. CORS Errors**
- Set `CORS_ORIGIN` environment variable
- Check client origin matches allowed origin

### View Logs

**Vercel:**
```bash
vercel logs your-project-name
```

**Cloudflare Workers:**
```bash
wrangler tail
wrangler tail --env production
```

**Local:**
Logs appear in console where you ran `npm run start:http`

---

## Performance Optimization

### Vercel Regions

The default region is `iad1` (Washington, D.C.). To change:

Edit `vercel.json`:
```json
{
  "regions": ["sfo1"]  // San Francisco
}
```

Available regions: `iad1`, `sfo1`, `lhr1`, `gru1`, `hnd1`, `sin1`, `syd1`

### Cloudflare Workers

- Automatically deployed to all edge locations
- Use KV for caching
- Implement Durable Objects for state

### Function Memory

Increase memory for better performance (edit `vercel.json`):
```json
{
  "functions": {
    "api/**/*.ts": {
      "memory": 2048  // Increase to 2GB
    }
  }
}
```

### Cold Start Optimization

- Keep dependencies minimal
- Use tree-shaking
- Consider edge functions for faster cold starts

---

## Security Best Practices

1. **Always set API_KEY in production**
2. **Use HTTPS only** (provided automatically by both platforms)
3. **Restrict CORS_ORIGIN** to specific domains
4. **Rotate API keys regularly**
5. **Use per-user Raindrop tokens** for multi-tenant deployments
6. **Monitor function logs** for suspicious activity

---

## Next Steps

- Set up monitoring and analytics
- Configure custom domains
- Implement rate limiting
- Add request caching
- Set up CI/CD pipeline
- Scale to multiple regions

---

## Architecture: mcp-handler Pattern

The Vercel deployment uses the **mcp-handler** library, which provides a standardized way to build MCP servers for serverless platforms.

### Key Features

- **Request-scoped services**: Each request gets its own `RaindropService` instance with the authenticated user's token
- **Multi-method auth**: Supports OAuth sessions, direct tokens, and environment fallback
- **Type-safe**: Full TypeScript support with Zod validation
- **Serverless-optimized**: Designed for stateless function invocation

### Architecture Overview

```typescript
// api/raindrop.ts structure
verifyToken() → Extracts token from OAuth session/header/env
    ↓
withMcpAuth() → Validates token, sets req.auth
    ↓
baseHandler() → Creates RaindropService with user token
    ↓
createMcpHandler() → Defines MCP tools with access to service
    ↓
server.tool() → Individual tool handlers (collection_list, etc.)
```

### Benefits

- **Multi-tenant**: Each request isolated with its own authentication
- **Stateless**: No shared state between requests (serverless-friendly)
- **Scalable**: Automatically scales with Vercel's infrastructure
- **Secure**: Token validation before any MCP operations

---

## Additional Resources

- [OAuth Guide](./OAUTH.md) - Complete OAuth setup and troubleshooting
- [Cloudflare Workers Guide](./CLOUDFLARE-WORKERS.md) - Detailed Cloudflare deployment
- [HTTP Transport Guide](./HTTP-TRANSPORT.md) - HTTP transport overview
- [Main README](../README.md) - Project documentation
- [mcp-handler Documentation](https://github.com/vercel/mcp-handler) - Official mcp-handler library

---

## Support

- [GitHub Issues](https://github.com/Aarekaz/raindrop-mcp/issues)
- [Vercel Documentation](https://vercel.com/docs)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [MCP Documentation](https://modelcontextprotocol.io)
