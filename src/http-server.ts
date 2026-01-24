#!/usr/bin/env node
/**
 * HTTP Server Entry Point for Raindrop MCP
 * 
 * Implements HTTP transport using Express and Server-Sent Events (SSE).
 * Supports multi-tenant deployment and serverless platforms.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from 'dotenv';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { RaindropMCPService } from './services/raindropmcp.service.js';
import { createLogger } from './utils/logger.js';
import { OAuthService } from './oauth/oauth.service.js';
import { TokenStorage } from './oauth/token-storage.js';
import { OAuthConfig } from './oauth/oauth.types.js';
import { createOAuthRoutes } from './oauth/oauth.routes.js';
import { createWellKnownRoutes } from './oauth/well-known.routes.js';
import { createSessionMiddleware, AuthenticatedRequest } from './oauth/session.middleware.js';

// Load environment variables
config();

const logger = createLogger('http-server');

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_KEY = process.env.API_KEY; // Optional: for authentication

// OAuth configuration
let oauthService: OAuthService | null = null;
if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET && process.env.OAUTH_REDIRECT_URI) {
  const oauthConfig: OAuthConfig = {
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    redirectUri: process.env.OAUTH_REDIRECT_URI,
    authorizationEndpoint: 'https://raindrop.io/oauth/authorize',
    tokenEndpoint: 'https://raindrop.io/oauth/access_token',
  };

  const tokenStorage = new TokenStorage();
  oauthService = new OAuthService(oauthConfig, tokenStorage);
  logger.info('OAuth authentication enabled');
} else {
  logger.warn('OAuth not configured - using legacy token authentication only');
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
 * Authentication middleware
 * Validates API key if configured
 */
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth in development if API_KEY is not set
  if (NODE_ENV === 'development' && !API_KEY) {
    logger.warn('Running without authentication in development mode');
    return next();
  }

  // Check for API key
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    res.status(401).json({ 
      error: 'Unauthorized',
      message: 'API key required. Provide via X-API-Key header or apiKey query parameter'
    });
    return;
  }

  if (API_KEY && apiKey !== API_KEY) {
    res.status(403).json({ 
      error: 'Forbidden',
      message: 'Invalid API key'
    });
    return;
  }

  next();
}

/**
 * Validate required environment variables for Raindrop.io
 */
function validateToken(req: Request): string {
  // Check for user-specific token in request
  const userToken = req.headers['x-raindrop-token'] as string;
  
  if (userToken) {
    return userToken;
  }

  // Fall back to server-wide token
  const serverToken = process.env.RAINDROP_ACCESS_TOKEN;
  
  if (!serverToken) {
    throw new HttpError(
      500,
      'RAINDROP_ACCESS_TOKEN not configured. Set environment variable or provide X-Raindrop-Token header'
    );
  }

  return serverToken;
}

/**
 * Error handling middleware
 */
function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error('Error handling request:', err);

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  // Default to 500 for unknown errors
  res.status(500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
}

/**
 * Create and configure Express application
 */
function createApp(): express.Application {
  const app = express();

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Allow SSE connections
    crossOriginEmbedderPolicy: false,
  }));

  // Cookie parser for OAuth sessions
  app.use(cookieParser());

  // CORS configuration
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use(cors({
    origin: corsOrigin,
    // Never allow credentials with wildcard origin
    credentials: corsOrigin !== '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Raindrop-Token'],
  }));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.path} - ${req.ip}`);
    next();
  });

  // Health check endpoint (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'raindrop-mcp',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      transport: 'sse',
    });
  });

  // Info endpoint (no auth required)
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Raindrop MCP Server',
      description: 'Model Context Protocol server for Raindrop.io bookmark management',
      version: '0.1.0',
      transport: 'Server-Sent Events (SSE)',
      endpoints: {
        health: '/health',
        sse: '/sse',
        messages: '/messages',
        auth: oauthService ? {
          init: '/auth/init',
          callback: '/auth/callback',
          status: '/auth/status',
          logout: '/auth/logout',
          refresh: '/auth/refresh',
        } : undefined,
      },
      documentation: 'https://github.com/Aarekaz/raindrop-mcp',
      authenticationMethods: oauthService
        ? ['OAuth 2.0', 'X-Raindrop-Token header', 'Environment token']
        : ['X-Raindrop-Token header', 'Environment token'],
    });
  });

  // OAuth routes (if configured)
  if (oauthService) {
    app.use(createOAuthRoutes(oauthService));
    app.use(createWellKnownRoutes());
    logger.info('OAuth routes registered');
  }

  // SSE endpoint for MCP communication
  const sseMiddleware = oauthService
    ? [authMiddleware, createSessionMiddleware(oauthService)]
    : [authMiddleware];

  app.get('/sse', ...sseMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      logger.info('New SSE connection established');

      // Get Raindrop token from session middleware or legacy method
      const raindropToken = req.raindropToken || validateToken(req);

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

      // Create MCP service with user-specific token
      const mcpService = new RaindropMCPService(raindropToken);
      const server = mcpService.getServer();

      // Create SSE transport
      const transport = new SSEServerTransport('/messages', res);

      // Connect server to transport
      await server.connect(transport);
      logger.info('MCP server connected via SSE transport');

      // Handle client disconnect
      req.on('close', async () => {
        logger.info('SSE connection closed');
        try {
          await mcpService.cleanup();
          await server.close();
        } catch (error) {
          logger.error('Error cleaning up connection:', error);
        }
      });

    } catch (error) {
      next(error);
    }
  });

  // POST endpoint for client messages
  const messagesMiddleware = oauthService
    ? [authMiddleware, createSessionMiddleware(oauthService), express.text({ type: 'text/plain' })]
    : [authMiddleware, express.text({ type: 'text/plain' })];

  app.post('/messages', ...messagesMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      logger.debug('Received message from client');

      // Validate Raindrop token (already validated by middleware if OAuth enabled)
      if (!req.raindropToken) {
        validateToken(req);
      }

      // The SSE transport handles message processing
      // This endpoint acknowledges receipt
      res.status(200).send('Message received');

    } catch (error) {
      next(error);
    }
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start the HTTP server
 */
async function startServer(): Promise<void> {
  try {
    const app = createApp();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Raindrop MCP HTTP server listening on ${HOST}:${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      logger.info(`Health check: http://${HOST}:${PORT}/health`);
      logger.info(`SSE endpoint: http://${HOST}:${PORT}/sse`);
      
      if (NODE_ENV === 'development' && !API_KEY) {
        logger.warn('⚠️  No API_KEY configured - authentication disabled in development');
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    logger.error('Fatal error starting HTTP server:', error);
    process.exit(1);
  }
}

// Export app for serverless platforms (Vercel, Lambda, etc.)
export const app = createApp();

// Start server if running directly (not imported as module)
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}
