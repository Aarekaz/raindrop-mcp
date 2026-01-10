/**
 * Express routes for OAuth 2.0 endpoints
 * Handles authorization flow, session management, and logout
 */

import { Router, Request, Response } from 'express';
import { OAuthService } from './oauth.service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('oauth-routes');

export function createOAuthRoutes(oauthService: OAuthService): Router {
  const router = Router();

  /**
   * Start OAuth flow
   * GET /auth/init?redirect_uri=<url>
   */
  router.get('/auth/init', async (req: Request, res: Response) => {
    try {
      const redirectUri = req.query.redirect_uri as string;
      if (!redirectUri) {
        return res.status(400).json({ error: 'redirect_uri parameter is required' });
      }

      const { authUrl, state } = await oauthService.initFlow(redirectUri);

      // Set state cookie for CSRF protection
      res.cookie('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000, // 5 minutes
      });

      res.redirect(authUrl);
    } catch (error) {
      logger.error('OAuth init error', error);
      res.status(500).json({ error: 'Failed to initialize OAuth flow' });
    }
  });

  /**
   * OAuth callback endpoint
   * GET /auth/callback?code=<code>&state=<state>
   */
  router.get('/auth/callback', async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state parameter' });
      }

      // Validate state matches cookie (CSRF protection)
      const stateCookie = req.cookies.oauth_state;
      if (stateCookie !== state) {
        return res.status(403).json({ error: 'Invalid state parameter (CSRF check failed)' });
      }

      const session = await oauthService.handleCallback(
        code as string,
        state as string
      );

      // Set session cookie
      res.cookie('mcp_session', session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        path: '/',
      });

      // Clear OAuth state cookie
      res.clearCookie('oauth_state');

      // Redirect to original URI with session info
      const redirectUri = req.query.redirect_uri as string || '/';
      res.redirect(redirectUri + `?session_id=${session.sessionId}`);
    } catch (error) {
      logger.error('OAuth callback error', error);
      res.status(500).json({ error: 'OAuth callback failed' });
    }
  });

  /**
   * Get session status
   * GET /auth/status
   */
  router.get('/auth/status', async (req: Request, res: Response) => {
    const sessionId = req.cookies.mcp_session || req.headers.authorization?.split(' ')[1];

    if (!sessionId) {
      return res.json({ authenticated: false });
    }

    try {
      const token = await oauthService.ensureValidToken(sessionId);
      res.json({ authenticated: true, hasValidToken: !!token });
    } catch (error) {
      res.json({ authenticated: false });
    }
  });

  /**
   * Logout and invalidate session
   * POST /auth/logout
   */
  router.post('/auth/logout', async (req: Request, res: Response) => {
    const sessionId = req.cookies.mcp_session;

    if (sessionId) {
      try {
        const storage = (oauthService as any).storage;
        await storage.deleteSession(sessionId);
      } catch (error) {
        logger.error('Logout error', error);
      }
    }

    res.clearCookie('mcp_session');
    res.json({ success: true });
  });

  /**
   * Manually trigger token refresh
   * POST /auth/refresh
   */
  router.post('/auth/refresh', async (req: Request, res: Response) => {
    const sessionId = req.cookies.mcp_session || req.headers.authorization?.split(' ')[1];

    if (!sessionId) {
      return res.status(401).json({ error: 'No session found' });
    }

    try {
      const token = await oauthService.ensureValidToken(sessionId);
      res.json({ success: true, hasValidToken: !!token });
    } catch (error) {
      logger.error('Token refresh error', error);
      res.status(401).json({ error: 'Token refresh failed' });
    }
  });

  return router;
}
