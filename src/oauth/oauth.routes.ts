/**
 * Express routes for OAuth 2.0 endpoints
 * Handles authorization flow, session management, and logout
 */

import { Router, Request, Response } from 'express';
import { OAuthService } from './oauth.service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('oauth-routes');

/**
 * Validate redirect URI against allowlist
 * Prevents open redirect attacks by only allowing pre-configured URLs
 *
 * @param redirectUri - The redirect URI to validate
 * @returns Object with validation result and error message if invalid
 */
function validateRedirectUri(redirectUri: string): { valid: boolean; error?: string } {
  // Get allowlist from environment (comma-separated)
  const allowedUris = process.env.OAUTH_ALLOWED_REDIRECT_URIS?.split(',').map(uri => uri.trim()) || [];

  // If no allowlist configured, only allow relative URLs
  if (allowedUris.length === 0) {
    if (redirectUri.startsWith('/') && !redirectUri.startsWith('//')) {
      return { valid: true };
    }
    return {
      valid: false,
      error: 'No allowed redirect URIs configured. Set OAUTH_ALLOWED_REDIRECT_URIS environment variable.'
    };
  }

  // Allow relative URLs (must start with / but not //)
  if (redirectUri.startsWith('/') && !redirectUri.startsWith('//')) {
    return { valid: true };
  }

  // For absolute URLs, validate against allowlist
  try {
    const url = new URL(redirectUri);

    // Check if URL is in allowlist (exact match on origin + pathname)
    const isAllowed = allowedUris.some(allowedUri => {
      try {
        const allowed = new URL(allowedUri);
        return url.origin === allowed.origin && url.pathname === allowed.pathname;
      } catch {
        return false;
      }
    });

    if (isAllowed) {
      return { valid: true };
    }

    return {
      valid: false,
      error: 'Redirect URI not in allowlist. Check OAUTH_ALLOWED_REDIRECT_URIS configuration.'
    };
  } catch (err) {
    return {
      valid: false,
      error: 'Invalid redirect URI format. Must be a valid URL or relative path.'
    };
  }
}

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
        res.status(400).json({
          error: 'redirect_uri parameter is required',
          hint: 'Provide ?redirect_uri=/dashboard or full URL from allowlist'
        });
        return;
      }

      // SECURITY: Validate redirect_uri against allowlist
      const validation = validateRedirectUri(redirectUri);
      if (!validation.valid) {
        logger.warn('Invalid redirect_uri rejected', { redirectUri, error: validation.error });
        res.status(400).json({
          error: 'invalid_redirect_uri',
          message: validation.error,
          hint: 'Redirect URI must be in OAUTH_ALLOWED_REDIRECT_URIS allowlist or a relative path'
        });
        return;
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
      return;
    } catch (error) {
      logger.error('OAuth init error', error);
      res.status(500).json({ error: 'Failed to initialize OAuth flow' });
      return;
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
        res.status(400).json({ error: 'Missing code or state parameter' });
        return;
      }

      // Validate state matches cookie (CSRF protection)
      const stateCookie = req.cookies.oauth_state;
      if (stateCookie !== state) {
        res.status(403).json({ error: 'Invalid state parameter (CSRF check failed)' });
        return;
      }

      // SECURITY FIX: Retrieve redirect_uri from stored OAuthState BEFORE handling callback
      // The handleCallback method deletes the state, so we must get redirectUri first
      const storedState = await oauthService['storage'].getOAuthState(state as string);
      const redirectUri = storedState?.redirectUri || '/';

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

      // Redirect to the stored redirect URI (session_id already in httpOnly cookie)
      res.redirect(redirectUri);
      return;
    } catch (error) {
      logger.error('OAuth callback error', error);
      res.status(500).json({ error: 'OAuth callback failed' });
      return;
    }
  });

  /**
   * Get session status
   * GET /auth/status
   */
  router.get('/auth/status', async (req: Request, res: Response) => {
    const sessionId = req.cookies.mcp_session || req.headers.authorization?.split(' ')[1];

    if (!sessionId) {
      res.json({ authenticated: false });
      return;
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
      res.status(401).json({ error: 'No session found' });
      return;
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
