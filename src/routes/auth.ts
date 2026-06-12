import { parse as parseCookie } from 'cookie';

import { CloudflareKVStore } from '../oauth/cloudflare-kv-store.js';
import { encrypt } from '../oauth/crypto.utils.js';
import { OAuthService } from '../oauth/oauth.service.js';
import type { OAuthConfig } from '../oauth/oauth.types.js';
import { TokenStorage } from '../oauth/token-storage.js';
import type { Env } from '../worker/env.js';
import { json } from '../worker/http.js';

const OAUTH_CONFIG_ENDPOINTS = {
  authorizationEndpoint: 'https://raindrop.io/oauth/authorize',
  tokenEndpoint: 'https://raindrop.io/oauth/access_token',
} as const;

const SESSION_MAX_AGE = 14 * 24 * 60 * 60;

function createTokenStorage(env: Env): TokenStorage {
  return new TokenStorage(new CloudflareKVStore(env.RAINDROP_AUTH_KV));
}

function createOAuthService(env: Env, tokenStorage: TokenStorage): OAuthService {
  const oauthConfig: OAuthConfig = {
    clientId: env.OAUTH_CLIENT_ID ?? '',
    clientSecret: env.OAUTH_CLIENT_SECRET ?? '',
    redirectUri: env.OAUTH_REDIRECT_URI ?? '',
    ...OAUTH_CONFIG_ENDPOINTS,
  };

  return new OAuthService(oauthConfig, tokenStorage);
}

function validateRedirectUri(
  redirectUri: string,
  env: Env,
  requestOrigin?: string
): { valid: boolean; error?: string } {
  const allowedUris =
    env.OAUTH_ALLOWED_REDIRECT_URIS?.split(',').map(uri => uri.trim()).filter(Boolean) ?? [];

  if (redirectUri.startsWith('/') && !redirectUri.startsWith('//')) {
    return { valid: true };
  }

  try {
    const url = new URL(redirectUri);

    if (requestOrigin) {
      const origin = new URL(requestOrigin);
      if (url.origin === origin.origin) {
        return { valid: true };
      }
    }

    if (allowedUris.length === 0) {
      return {
        valid: false,
        error: 'No allowed redirect URIs configured. Set OAUTH_ALLOWED_REDIRECT_URIS environment variable.',
      };
    }

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
      error: 'Redirect URI not in allowlist. Check OAUTH_ALLOWED_REDIRECT_URIS configuration.',
    };
  } catch {
    return {
      valid: false,
      error: 'Invalid redirect URI format. Must be a valid URL or relative path.',
    };
  }
}

function redirectWithCookies(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie);
  }

  return new Response(null, { status: 302, headers });
}

export async function authInit(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const redirectUri = url.searchParams.get('redirect_uri');

    if (!redirectUri) {
      return json(
        {
          error: 'redirect_uri parameter is required',
          hint: 'Provide ?redirect_uri=/dashboard or full URL from allowlist',
        },
        { status: 400 }
      );
    }

    const validation = validateRedirectUri(redirectUri, env, url.origin);
    if (!validation.valid) {
      console.warn('Invalid redirect_uri rejected:', redirectUri, validation.error);
      return json(
        {
          error: 'invalid_redirect_uri',
          message: validation.error,
          hint: 'Redirect URI must be in OAUTH_ALLOWED_REDIRECT_URIS allowlist or a relative path',
        },
        { status: 400 }
      );
    }

    const tokenStorage = createTokenStorage(env);
    const oauthService = createOAuthService(env, tokenStorage);
    const { authUrl, state } = await oauthService.initFlow(redirectUri);

    return redirectWithCookies(authUrl, [
      `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=300; Path=/`,
    ]);
  } catch (error) {
    console.error('OAuth init error:', error);
    return json(
      {
        error: 'Failed to initialize OAuth flow',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function authCallback(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return json(
        {
          error: 'Missing required parameters',
          message: 'code and state parameters are required',
        },
        { status: 400 }
      );
    }

    const cookies = parseCookie(request.headers.get('cookie') || '');
    const storedState = cookies.oauth_state;

    if (!storedState || storedState !== state) {
      return json(
        {
          error: 'Invalid state',
          message: 'State parameter mismatch. Possible CSRF attack.',
        },
        { status: 400 }
      );
    }

    const tokenStorage = createTokenStorage(env);
    const oauthService = createOAuthService(env, tokenStorage);
    const storedOAuthState = await oauthService.getStoredState(state);
    const redirectUri = storedOAuthState?.redirectUri || '/';
    const session = await oauthService.handleCallback(code, state);

    try {
      await tokenStorage.saveUserRaindropToken(session.userId, encrypt(session.accessToken));
    } catch (error) {
      console.error('Failed to store user Raindrop token:', error);
    }

    return redirectWithCookies(redirectUri, [
      `mcp_session=${session.sessionId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}; Path=/`,
      `raindrop_session=${session.userId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}; Path=/`,
      'oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
    ]);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return json({ error: 'OAuth callback failed' }, { status: 500 });
  }
}
