/**
 * OAuth Initiation Endpoint
 *
 * Starts the OAuth flow by redirecting users to Raindrop's authorization page.
 * Includes security: redirect URI validation against allowlist.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
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

/**
 * Validate redirect URI against allowlist
 * SECURITY FIX: Prevents open redirect attacks
 */
function validateRedirectUri(redirectUri: string): { valid: boolean; error?: string } {
  const allowedUris = process.env.OAUTH_ALLOWED_REDIRECT_URIS?.split(',').map(uri => uri.trim()) || [];

  if (allowedUris.length === 0) {
    // If no allowlist configured, only allow relative paths
    if (redirectUri.startsWith('/') && !redirectUri.startsWith('//')) {
      return { valid: true };
    }
    return {
      valid: false,
      error: 'No allowed redirect URIs configured. Set OAUTH_ALLOWED_REDIRECT_URIS environment variable.'
    };
  }

  // Allow relative paths
  if (redirectUri.startsWith('/') && !redirectUri.startsWith('//')) {
    return { valid: true };
  }

  // Validate absolute URLs against allowlist
  try {
    const url = new URL(redirectUri);
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redirectUri = req.query.redirect_uri as string;

    if (!redirectUri) {
      return res.status(400).json({
        error: 'redirect_uri parameter is required',
        hint: 'Provide ?redirect_uri=/dashboard or full URL from allowlist'
      });
    }

    // SECURITY: Validate redirect_uri against allowlist
    const validation = validateRedirectUri(redirectUri);
    if (!validation.valid) {
      console.warn('Invalid redirect_uri rejected:', redirectUri, validation.error);
      return res.status(400).json({
        error: 'invalid_redirect_uri',
        message: validation.error,
        hint: 'Redirect URI must be in OAUTH_ALLOWED_REDIRECT_URIS allowlist or a relative path'
      });
    }

    const { authUrl, state } = await oauthService.initFlow(redirectUri);

    // Set state cookie for CSRF protection
    res.setHeader('Set-Cookie', [
      `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=300; Path=/`
    ]);

    return res.redirect(authUrl);
  } catch (error) {
    console.error('OAuth init error:', error);
    return res.status(500).json({ 
      error: 'Failed to initialize OAuth flow',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
