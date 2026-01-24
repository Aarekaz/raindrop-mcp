/**
 * Session validation middleware for Express
 * Implements three-tier token priority system:
 * 1. OAuth session (cookie/Bearer token)
 * 2. Direct token header (X-Raindrop-Token)
 * 3. Environment token (RAINDROP_ACCESS_TOKEN)
 */

import { Request, Response, NextFunction } from 'express';
import { OAuthService } from './oauth.service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('session-middleware');

export interface AuthenticatedRequest extends Request {
  raindropToken?: string;
  sessionId?: string;
}

export function createSessionMiddleware(oauthService: OAuthService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Priority 1: OAuth session (cookie or Bearer token)
      const sessionId = req.cookies.mcp_session ||
                       req.headers.authorization?.replace('Bearer ', '');

      if (sessionId) {
        try {
          const token = await oauthService.ensureValidToken(sessionId);
          req.raindropToken = token;
          req.sessionId = sessionId;
          logger.debug('Authenticated via OAuth session', { sessionId });
          return next();
        } catch (error) {
          logger.warn('Invalid OAuth session', { sessionId });
          // Fall through to other auth methods
        }
      }

      // Priority 2: Direct token header (legacy/test mode)
      const directToken = req.headers['x-raindrop-token'] as string;
      if (directToken) {
        req.raindropToken = directToken;
        logger.debug('Authenticated via direct token header');
        return next();
      }

      // Priority 3: Environment token (development fallback)
      const envToken = process.env.RAINDROP_ACCESS_TOKEN;
      if (envToken && process.env.NODE_ENV !== 'production') {
        req.raindropToken = envToken;
        logger.debug('Authenticated via environment token');
        return next();
      }

      // No authentication found - return 401 with OAuth challenge
      const serverUrl = `${req.protocol}://${req.get('host')}`;
      res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required. Start OAuth flow at /auth/init or provide X-Raindrop-Token header',
        authenticate: `Bearer resource_metadata="${serverUrl}/.well-known/oauth-protected-resource"`,
      });
    } catch (error) {
      logger.error('Auth middleware error', error);
      next(error);
    }
  };
}
