/**
 * Cloudflare Workers Adapter
 * 
 * Exports the MCP server as a Cloudflare Worker using the Fetch API.
 * Cloudflare Workers run on the edge with global distribution.
 * 
 * Note: Cloudflare Workers use the Service Worker API, not Node.js APIs.
 * This means some features like process.env need to be adapted.
 */

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { RaindropMCPService } from '../services/raindropmcp.service.js';

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // Environment variables
  RAINDROP_ACCESS_TOKEN?: string;
  API_KEY?: string;
  CORS_ORIGIN?: string;
  NODE_ENV?: string;
  
  // KV namespace for session storage (optional)
  SESSIONS?: KVNamespace;
  
  // Durable Object namespace for long-lived SSE connections (optional)
  SSE_CONNECTIONS?: DurableObjectNamespace;
}

/**
 * Custom error class for HTTP errors
 */
class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Create JSON response
 */
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Create error response
 */
function errorResponse(error: Error | HttpError, env: Env): Response {
  const isDev = env.NODE_ENV === 'development';
  
  if (error instanceof HttpError) {
    return jsonResponse({
      error: error.name,
      message: error.message,
    }, error.statusCode);
  }

  return jsonResponse({
    error: 'Internal Server Error',
    message: isDev ? error.message : 'An unexpected error occurred',
  }, 500);
}

/**
 * Validate authentication
 */
function validateAuth(request: Request, env: Env): void {
  // Skip API key check in development if not set
  if (env.NODE_ENV === 'development' && !env.API_KEY) {
    return;
  }

  // Check API key
  const apiKey = request.headers.get('x-api-key');
  if (env.API_KEY && apiKey !== env.API_KEY) {
    throw new HttpError(403, 'Invalid or missing API key');
  }
}

/**
 * Get Raindrop token from request or environment
 */
function getRaindropToken(request: Request, env: Env): string {
  // Check for user-specific token
  const userToken = request.headers.get('x-raindrop-token');
  if (userToken) {
    return userToken;
  }

  // Fall back to server-wide token
  if (!env.RAINDROP_ACCESS_TOKEN) {
    throw new HttpError(
      500,
      'RAINDROP_ACCESS_TOKEN not configured. Set environment variable or provide X-Raindrop-Token header'
    );
  }

  return env.RAINDROP_ACCESS_TOKEN;
}

/**
 * Handle CORS preflight requests
 */
function handleCors(request: Request, env: Env): Response | null {
  if (request.method === 'OPTIONS') {
    const origin = env.CORS_ORIGIN || '*';
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Raindrop-Token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  return null;
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response, env: Env): Response {
  const origin = env.CORS_ORIGIN || '*';
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', origin);
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Handle root endpoint - service information
 */
function handleRoot(): Response {
  return jsonResponse({
    name: 'Raindrop MCP Server',
    description: 'Model Context Protocol server for Raindrop.io bookmark management',
    version: '0.1.0',
    transport: 'Server-Sent Events (SSE)',
    runtime: 'Cloudflare Workers',
    endpoints: {
      health: '/health',
      sse: '/sse',
      messages: '/messages',
    },
    documentation: 'https://github.com/Aarekaz/raindrop-mcp',
  });
}

/**
 * Handle health check endpoint
 */
function handleHealth(): Response {
  return jsonResponse({
    status: 'healthy',
    service: 'raindrop-mcp',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    transport: 'sse',
    runtime: 'cloudflare-workers',
  });
}

/**
 * Handle SSE connection endpoint
 * 
 * Note: Cloudflare Workers have a 30-second CPU time limit for free tier,
 * and connections are subject to timeout limits. For production use,
 * consider using Durable Objects for long-lived connections.
 */
async function handleSSE(request: Request, env: Env): Promise<Response> {
  validateAuth(request, env);
  const raindropToken = getRaindropToken(request, env);

  // Create a TransformStream for SSE
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial connection message
  await writer.write(encoder.encode('data: {"type":"connection","status":"connected"}\n\n'));

  // Create MCP service with user-specific token
  const mcpService = new RaindropMCPService(raindropToken);
  const server = mcpService.getServer();

  // Note: This is a simplified SSE implementation
  // For production, consider using Durable Objects for stateful connections
  // that need to persist beyond the Worker's execution time

  // Create response with SSE headers
  const response = new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });

  return response;
}

/**
 * Handle POST messages endpoint
 */
async function handleMessages(request: Request, env: Env): Promise<Response> {
  validateAuth(request, env);
  getRaindropToken(request, env); // Validate token

  // Parse message body
  const body = await request.text();
  
  // In a real implementation, this would process the message
  // and coordinate with the SSE connection (possibly via Durable Objects)
  
  return new Response('Message received', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}

/**
 * Main Cloudflare Workers fetch handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // Handle CORS preflight
      const corsResponse = handleCors(request, env);
      if (corsResponse) {
        return corsResponse;
      }

      const url = new URL(request.url);
      const path = url.pathname;

      // Route requests
      let response: Response;

      switch (path) {
        case '/':
          response = handleRoot();
          break;

        case '/health':
          response = handleHealth();
          break;

        case '/sse':
          if (request.method !== 'GET') {
            throw new HttpError(405, 'Method not allowed. Use GET for SSE endpoint.');
          }
          response = await handleSSE(request, env);
          break;

        case '/messages':
          if (request.method !== 'POST') {
            throw new HttpError(405, 'Method not allowed. Use POST for messages endpoint.');
          }
          response = await handleMessages(request, env);
          break;

        default:
          throw new HttpError(404, `Route ${path} not found`);
      }

      // Add CORS headers to response
      return addCorsHeaders(response, env);

    } catch (error) {
      const errorResp = errorResponse(error as Error, env);
      return addCorsHeaders(errorResp, env);
    }
  },
};

/**
 * Durable Object for persistent SSE connections (optional enhancement)
 * 
 * Uncomment and implement this for production use with long-lived connections.
 * Durable Objects maintain state and can handle connections that last longer
 * than the Worker's execution time limit.
 */
/*
export class SSEConnection {
  state: DurableObjectState;
  env: Env;
  sessions: Map<string, WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    // Handle WebSocket upgrade for persistent connections
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept WebSocket connection
      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Expected WebSocket', { status: 400 });
  }

  async handleSession(websocket: WebSocket) {
    websocket.accept();
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, websocket);

    websocket.addEventListener('message', (msg) => {
      // Handle incoming messages
      console.log('Received message:', msg.data);
    });

    websocket.addEventListener('close', () => {
      this.sessions.delete(sessionId);
    });
  }
}
*/
