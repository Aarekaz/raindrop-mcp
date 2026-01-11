# Cloudflare Workers Deployment Guide

Deploy the Raindrop MCP server to Cloudflare's global edge network for low-latency, worldwide access.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Environment Management](#environment-management)
- [Advanced Features](#advanced-features)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

---

## Overview

### Why Cloudflare Workers?

- **Global Edge Network**: Deploy to 300+ cities worldwide
- **Zero Cold Starts**: Sub-millisecond startup time
- **Cost Effective**: 100,000 requests/day on free tier
- **Auto-scaling**: Scales automatically with traffic
- **Built-in DDoS Protection**: Enterprise-grade security

### Architecture

```
┌──────────────────────────────────────────────┐
│         Cloudflare Edge Network              │
│  ┌────────────────────────────────────────┐  │
│  │      Cloudflare Worker (V8 Engine)     │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  Raindrop MCP Server             │  │  │
│  │  │  - SSE Transport                 │  │  │
│  │  │  - Multi-tenant Auth             │  │  │
│  │  │  - Edge Caching                  │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
│                    ↓                          │
│            Raindrop.io API                    │
└──────────────────────────────────────────────┘
```

---

## Prerequisites

### 1. Cloudflare Account
Sign up at [cloudflare.com](https://www.cloudflare.com/) (free tier available)

### 2. Install Wrangler CLI
```bash
npm install -g wrangler

# or use with npx
npx wrangler --version
```

### 3. Authenticate Wrangler
```bash
wrangler login
```

This opens a browser for OAuth authentication.

### 4. Get Account ID
Find your Account ID in the Cloudflare dashboard:
1. Log into [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select your account
3. Copy Account ID from the sidebar

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Account
Edit `wrangler.toml` and add your Account ID:
```toml
account_id = "your_account_id_here"
```

### 3. Set Secrets
```bash
# Set Raindrop.io API token (required)
wrangler secret put RAINDROP_ACCESS_TOKEN

# Set API key (optional but recommended)
wrangler secret put API_KEY
```

### 4. Build
```bash
npm run build:cloudflare
```

### 5. Deploy
```bash
npm run deploy:cloudflare
```

Your worker will be deployed to `https://raindrop-mcp.your-subdomain.workers.dev`

---

## Configuration

### wrangler.toml Explained

#### Basic Settings
```toml
name = "raindrop-mcp"
main = "build/cloudflare-worker.js"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]
```

- `name`: Worker name (must be unique in your account)
- `main`: Entry point file
- `compatibility_date`: Worker runtime version
- `compatibility_flags`: Enable Node.js compatibility

#### Environment Variables
```toml
[vars]
NODE_ENV = "development"
CORS_ORIGIN = "*"
```

These are **public** variables visible in the code.

#### Secrets (Encrypted)
Set via CLI only - never in wrangler.toml:
```bash
wrangler secret put RAINDROP_ACCESS_TOKEN
wrangler secret put API_KEY
```

Secrets are encrypted and only accessible at runtime.

#### Environments
```toml
[env.production]
name = "raindrop-mcp-production"
workers_dev = false
route = "raindrop-mcp.your-domain.com/*"
vars = { NODE_ENV = "production" }

[env.staging]
name = "raindrop-mcp-staging"
workers_dev = true
vars = { NODE_ENV = "staging" }
```

Deploy to specific environments:
```bash
npm run deploy:cloudflare:staging
npm run deploy:cloudflare:production
```

---

## Deployment

### Development Deployment
```bash
# Build and deploy to dev environment
npm run build:cloudflare
npm run deploy:cloudflare

# Or use wrangler directly
wrangler deploy
```

Your worker URL: `https://raindrop-mcp.your-subdomain.workers.dev`

### Production Deployment

#### Option 1: Workers.dev Subdomain
```bash
wrangler deploy --env production
```

#### Option 2: Custom Domain
1. Add domain to Cloudflare (must be on Cloudflare DNS)
2. Update `wrangler.toml`:
```toml
[env.production]
route = "api.yourdomain.com/*"
zone_name = "yourdomain.com"
```
3. Deploy:
```bash
wrangler deploy --env production
```

### CI/CD Deployment

#### GitHub Actions
Create `.github/workflows/deploy-cloudflare.yml`:
```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build:cloudflare
      
      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

## Environment Management

### Setting Secrets

#### Via Wrangler CLI
```bash
# Set for default environment
wrangler secret put RAINDROP_ACCESS_TOKEN

# Set for specific environment
wrangler secret put API_KEY --env production
```

#### Via Dashboard
1. Go to Workers & Pages
2. Select your worker
3. Settings → Variables
4. Add encrypted variable

### Reading Secrets in Code
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Access secrets via env object
    const token = env.RAINDROP_ACCESS_TOKEN;
    const apiKey = env.API_KEY;
    
    // Use in your code
  }
}
```

### Listing Secrets
```bash
wrangler secret list
wrangler secret list --env production
```

### Deleting Secrets
```bash
wrangler secret delete API_KEY
wrangler secret delete API_KEY --env production
```

---

## Advanced Features

### 1. KV Storage (Optional)
For session management and caching:

#### Create KV Namespace
```bash
wrangler kv:namespace create "SESSIONS"
wrangler kv:namespace create "SESSIONS" --preview
```

#### Update wrangler.toml
```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "your_namespace_id"
preview_id = "your_preview_namespace_id"
```

#### Use in Code
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Store session
    await env.SESSIONS.put('session_id', 'session_data');
    
    // Retrieve session
    const data = await env.SESSIONS.get('session_id');
    
    // Delete session
    await env.SESSIONS.delete('session_id');
  }
}
```

### 2. Durable Objects (Optional)
For persistent SSE connections:

#### Enable in wrangler.toml
```toml
[[durable_objects.bindings]]
name = "SSE_CONNECTIONS"
class_name = "SSEConnection"
script_name = "raindrop-mcp"

[[migrations]]
tag = "v1"
new_classes = ["SSEConnection"]
```

#### Implement Durable Object
Uncomment the `SSEConnection` class in `cloudflare-worker.ts`

### 3. Custom Domains

#### Add Domain
```bash
wrangler domains add api.yourdomain.com
```

#### Configure DNS
Cloudflare automatically configures DNS records.

#### Update wrangler.toml
```toml
[[routes]]
pattern = "api.yourdomain.com/*"
zone_name = "yourdomain.com"
```

### 4. Analytics
Enable in wrangler.toml:
```toml
[observability]
enabled = true
```

View analytics in the Cloudflare dashboard.

---

## Limitations

### Cloudflare Workers Constraints

| Resource | Free Tier | Paid Plan |
|----------|-----------|-----------|
| Requests/day | 100,000 | Unlimited |
| CPU time | 10ms | 50ms |
| Memory | 128 MB | 128 MB |
| Script size | 1 MB | 10 MB |
| Subrequests | 50 | 1000 |

### SSE Connection Limits

**Important**: Cloudflare Workers have execution time limits:
- Initial request: 10-50ms CPU time
- Long-lived connections need Durable Objects

For production SSE:
1. Use Durable Objects for persistent connections
2. Implement client reconnection logic
3. Consider WebSocket upgrade for bi-directional communication

### Node.js Compatibility

Workers use V8 engine, not Node.js. Some limitations:
- No native Node.js modules (fs, path, etc.)
- Use Web Standards APIs (fetch, streams, etc.)
- `nodejs_compat` flag enables some compatibility

---

## Troubleshooting

### Build Errors

**Problem**: TypeScript compilation errors  
**Solution**: Ensure `@cloudflare/workers-types` is installed:
```bash
npm install -D @cloudflare/workers-types
```

**Problem**: Missing dependencies  
**Solution**: Bundle all dependencies in build:
```bash
npm run build:cloudflare
```

### Deployment Errors

**Problem**: `Account ID is required`  
**Solution**: Add to wrangler.toml:
```toml
account_id = "your_account_id_here"
```

**Problem**: `Authentication error`  
**Solution**: Re-authenticate:
```bash
wrangler logout
wrangler login
```

**Problem**: `Worker name already in use`  
**Solution**: Change name in wrangler.toml:
```toml
name = "raindrop-mcp-yourname"
```

### Runtime Errors

**Problem**: `ReferenceError: process is not defined`  
**Solution**: Workers don't have Node.js globals. Use `env` object:
```typescript
// Don't use: process.env.API_KEY
// Instead use: env.API_KEY
```

**Problem**: CPU time limit exceeded  
**Solution**:
1. Optimize code for performance
2. Reduce external API calls
3. Use async operations efficiently
4. Consider paid plan for 50ms limit

**Problem**: SSE connections dropping  
**Solution**:
1. Implement Durable Objects for persistence
2. Add client reconnection logic
3. Set reasonable timeout values

### Testing Locally

```bash
# Start local dev server
npm run dev:cloudflare

# Or with wrangler
wrangler dev
```

Access at `http://localhost:8787`

### View Logs

```bash
# Tail live logs
wrangler tail

# Tail specific environment
wrangler tail --env production

# Filter logs
wrangler tail --status error
```

### Rollback Deployment

```bash
# List deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback
```

---

## Performance Optimization

### 1. Bundle Optimization
- Minimize dependencies
- Use tree-shaking
- Remove unused code

### 2. Edge Caching
```typescript
// Cache API responses
const cache = caches.default;
const cachedResponse = await cache.match(request);
if (cachedResponse) return cachedResponse;

// Fetch and cache
const response = await fetch(request);
ctx.waitUntil(cache.put(request, response.clone()));
return response;
```

### 3. Async Operations
```typescript
// Use waitUntil for background tasks
ctx.waitUntil(
  logRequest(request)
);
```

### 4. Connection Pooling
Reuse Raindrop.io API connections within the same Worker instance.

---

## Security Best Practices

1. **Always use secrets** for sensitive data (API keys, tokens)
2. **Validate all inputs** from requests
3. **Set CORS_ORIGIN** to specific domains in production
4. **Enable rate limiting** (use KV for counters)
5. **Monitor logs** for suspicious activity
6. **Use custom domains** with SSL certificates
7. **Implement request signing** for API authentication

---

## Cost Estimate

### Free Tier
- 100,000 requests/day
- Perfect for development and small projects
- No credit card required

### Paid Plan ($5/month + usage)
- Unlimited requests
- $0.50 per million requests beyond included
- 50ms CPU time per request
- Recommended for production

### Example Costs
- 1M requests/month: ~$5/month
- 10M requests/month: ~$10/month
- Very cost-effective compared to traditional hosting

---

## Next Steps

1. Deploy to development environment
2. Test with health check: `curl https://your-worker.workers.dev/health`
3. Configure custom domain (optional)
4. Set up CI/CD pipeline
5. Enable analytics and monitoring
6. Implement Durable Objects for persistent connections (if needed)
7. Deploy to production

---

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Workers Examples](https://developers.cloudflare.com/workers/examples/)
- [Durable Objects Guide](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

---

## Support

- [GitHub Issues](https://github.com/Aarekaz/raindrop-mcp/issues)
- [Cloudflare Community](https://community.cloudflare.com/)
- [Discord](https://discord.gg/cloudflaredev)
