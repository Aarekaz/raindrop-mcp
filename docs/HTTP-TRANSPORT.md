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

```env
# Required
RAINDROP_ACCESS_TOKEN=your_raindrop_token

# Optional
API_KEY=your_secret_api_key
PORT=3000
NODE_ENV=development
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

### Two-Layer Authentication

#### Layer 1: API Key (Optional)
Protects the server endpoint itself:

```bash
curl http://localhost:3000/sse \
  -H "X-API-Key: your_secret_api_key"
```

Set via environment variable:
```env
API_KEY=your_secret_api_key
```

#### Layer 2: Raindrop Token
Authenticates with Raindrop.io API:

**Option A: Server-wide token** (single user)
```env
RAINDROP_ACCESS_TOKEN=your_raindrop_token
```

**Option B: Per-user tokens** (multi-tenant)
```bash
curl http://localhost:3000/sse \
  -H "X-API-Key: server_api_key" \
  -H "X-Raindrop-Token: user_raindrop_token"
```

## Endpoints

### `GET /`
Server information and documentation

**Response:**
```json
{
  "name": "Raindrop MCP Server",
  "version": "0.1.0",
  "transport": "Server-Sent Events (SSE)",
  "endpoints": {
    "health": "/health",
    "sse": "/sse",
    "messages": "/messages"
  }
}
```

### `GET /health`
Health check endpoint (no authentication required)

**Response:**
```json
{
  "status": "healthy",
  "service": "raindrop-mcp",
  "version": "0.1.0",
  "timestamp": "2026-01-09T21:00:00.000Z",
  "transport": "sse"
}
```

### `GET /sse`
SSE connection endpoint for MCP communication

**Headers:**
- `X-API-Key` (optional) - Server API key
- `X-Raindrop-Token` (optional) - User-specific Raindrop token

**Response:**
Establishes SSE connection with `text/event-stream` content type

### `POST /messages`
Client message endpoint for bidirectional communication

**Headers:**
- `X-API-Key` (optional) - Server API key
- `Content-Type: text/plain`

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

Coming soon - adapter in development

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

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `RAINDROP_ACCESS_TOKEN` | Fallback Raindrop token | - | Yes* |
| `API_KEY` | Server API key | - | No** |
| `PORT` | HTTP server port | 3000 | No |
| `HOST` | HTTP server host | 0.0.0.0 | No |
| `NODE_ENV` | Environment mode | development | No |
| `CORS_ORIGIN` | CORS allowed origins | * | No |

\* Required unless using per-user tokens  
\*\* Recommended for production

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

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(
  new URL('https://your-server.vercel.app/sse'),
  {
    headers: {
      'X-API-Key': 'your_api_key',
      'X-Raindrop-Token': 'user_token'
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
- [ ] Cloudflare Workers adapter
- [ ] Request rate limiting
- [ ] Response caching
- [ ] Metrics and monitoring
- [ ] Connection pooling
- [ ] Session management

## Support

- [GitHub Issues](https://github.com/Aarekaz/raindrop-mcp/issues)
- [Deployment Guide](./DEPLOYMENT.md)
- [Main README](../README.md)
