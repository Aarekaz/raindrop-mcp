/**
 * OAuth Callback Endpoint
 *
 * Handles the redirect from Raindrop after user authorization.
 * Exchanges authorization code for access token and creates session.
 * SECURITY FIXES: Uses stored redirectUri, removes session_id from URL.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parse as parseCookie } from 'cookie';
import { OAuthService } from '../../src/oauth/oauth.service.js';
import { TokenStorage } from '../../src/oauth/token-storage.js';
import { OAuthConfig } from '../../src/oauth/oauth.types.js';

const oauthConfig: OAuthConfig = {
  clientId: process.env.OAUTH_CLIENT_ID!,
  clientSecret: process.env.OAUTH_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
  authorizationEndpoint: 'https://raindrop.io/oauth/authorize',
  tokenEndpoint: 'https://raindrop.io/oauth/access_token',
};

const tokenStorage = new TokenStorage();
const oauthService = new OAuthService(oauthConfig, tokenStorage);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'code and state parameters are required'
      });
    }

    // Verify state cookie (CSRF protection)
    const cookies = parseCookie(req.headers.cookie || '');
    const storedState = cookies.oauth_state;

    if (!storedState || storedState !== state) {
      return res.status(400).json({
        error: 'Invalid state',
        message: 'State parameter mismatch. Possible CSRF attack.'
      });
    }

    // SECURITY FIX: Retrieve redirect_uri from stored OAuthState BEFORE handling callback
    // The handleCallback method deletes the state, so we must get redirectUri first
    const storedOAuthState = await oauthService['storage'].getOAuthState(state);
    const redirectUri = storedOAuthState?.redirectUri || '/';

    // Exchange code for tokens
    const session = await oauthService.handleCallback(code, state);

    // Set session cookie
    res.setHeader('Set-Cookie', [
      `mcp_session=${session.sessionId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}; Path=/`,
      `oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/` // Clear state cookie
    ]);

    // Redirect to the stored redirect URI (session_id already in httpOnly cookie)
    return res.redirect(redirectUri);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.status(500).json({ error: 'OAuth callback failed' });
  }
}
