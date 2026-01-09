# Deployment Guide

This guide covers deploying the Raindrop MCP server with HTTP transport to various serverless platforms.

## Table of Contents

- [Vercel Deployment](#vercel-deployment)
- [Cloudflare Workers Deployment](#cloudflare-workers-deployment)
- [Local HTTP Server](#local-http-server)
- [Environment Variables](#environment-variables)
- [Testing the Deployment](#testing-the-deployment)

---

## Vercel Deployment

### Prerequisites

1. [Vercel Account](https://vercel.com/signup)
2. [Vercel CLI](https://vercel.com/docs/cli) installed: `npm i -g vercel`
3. Raindrop.io API token from [Settings → Integrations](https://app.raindrop.io/settings/integrations)

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

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

**Required:**
```
RAINDROP_ACCESS_TOKEN=your_raindrop_token_here
```

**Optional:**
```
API_KEY=your_api_key_for_authentication
CORS_ORIGIN=https://yourdomain.com
NODE_ENV=production
```

#### Using Vercel CLI:

```bash
# Set environment variables
vercel env add RAINDROP_ACCESS_TOKEN production
vercel env add API_KEY production
vercel env add CORS_ORIGIN production
```

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

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `RAINDROP_ACCESS_TOKEN` | Raindrop.io API token (server-wide fallback) | `abc123...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEY` | API key for authentication | `undefined` (no auth in dev) |
| `PORT` | HTTP server port | `3000` |
| `HOST` | HTTP server host | `0.0.0.0` |
| `NODE_ENV` | Environment mode | `development` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |

### Multi-Tenant Configuration

For multi-tenant deployments, users can provide their own Raindrop token via request header:

```bash
curl https://your-domain.vercel.app/sse \
  -H "X-Raindrop-Token: user_specific_token" \
  -H "X-API-Key: your_api_key"
```

This allows different users to connect with their own Raindrop.io accounts.

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

Expected response:
```json
{
  "status": "healthy",
  "service": "raindrop-mcp",
  "version": "0.1.0",
  "timestamp": "2026-01-09T21:00:00.000Z",
  "transport": "sse"
}
```

### Test SSE Connection

```bash
# Local (without authentication)
curl -N http://localhost:3000/sse

# With API key
curl -N http://localhost:3000/sse \
  -H "X-API-Key: your_api_key"

# With user-specific Raindrop token
curl -N http://localhost:3000/sse \
  -H "X-API-Key: your_api_key" \
  -H "X-Raindrop-Token: user_token"
```

The connection should stay open and you'll see SSE events.

### Integration with MCP Clients

To connect an MCP client to your deployed server:

```javascript
// Example client configuration
{
  "transport": "sse",
  "url": "https://your-project.vercel.app/sse",
  "headers": {
    "X-API-Key": "your_api_key",
    "X-Raindrop-Token": "user_raindrop_token"
  }
}
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
    "src/adapters/vercel.ts": {
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

## Additional Resources

- [Cloudflare Workers Guide](./CLOUDFLARE-WORKERS.md) - Detailed Cloudflare deployment
- [HTTP Transport Guide](./HTTP-TRANSPORT.md) - HTTP transport overview
- [Main README](../README.md) - Project documentation

---

## Support

- [GitHub Issues](https://github.com/Aarekaz/raindrop-mcp/issues)
- [Vercel Documentation](https://vercel.com/docs)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [MCP Documentation](https://modelcontextprotocol.io)
