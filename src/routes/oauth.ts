import { parse as parseCookie } from 'cookie';

import { AuthorizationServerService } from '../oauth/authorization-server.service.js';
import { CloudflareKVStore } from '../oauth/cloudflare-kv-store.js';
import { TokenStorage } from '../oauth/token-storage.js';
import type { ClientRegistrationRequest, TokenResponse } from '../types/oauth-server.types.js';
import type { Env } from '../worker/env.js';

function createAuthorizationServerService(env: Env): AuthorizationServerService {
  return new AuthorizationServerService(
    new TokenStorage(new CloudflareKVStore(env.RAINDROP_AUTH_KV)),
    {
      issuer: env.JWT_ISSUER,
      signingKey: env.JWT_SIGNING_KEY,
      accessTokenExpiry: parseOptionalInteger(env.JWT_ACCESS_TOKEN_EXPIRY),
      refreshTokenExpiry: parseOptionalInteger(env.JWT_REFRESH_TOKEN_EXPIRY),
    }
  );
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  return value === undefined ? undefined : parseInt(value, 10);
}

function accessTokenExpiry(env: Env): number {
  return parseInt(env.JWT_ACCESS_TOKEN_EXPIRY || '3600', 10);
}

function oauthErrorResponse(error: string, description: string): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: description,
    }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    }
  );
}

function registrationErrorResponse(error: string, description: string): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: description,
    }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

function authorizationErrorResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: 'invalid_request', error_description: message }),
    {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function registerClient(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as ClientRegistrationRequest;

    if (!body.client_name) {
      return registrationErrorResponse('invalid_client_metadata', 'Missing client_name');
    }

    if (!body.redirect_uris || body.redirect_uris.length === 0) {
      return registrationErrorResponse(
        'invalid_redirect_uri',
        'At least one redirect_uri is required'
      );
    }

    for (const uri of body.redirect_uris) {
      try {
        const url = new URL(uri);
        if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
          return registrationErrorResponse(
            'invalid_redirect_uri',
            `Redirect URI must use HTTPS (except localhost): ${uri}`
          );
        }
      } catch {
        return registrationErrorResponse('invalid_redirect_uri', `Invalid URI format: ${uri}`);
      }
    }

    const authServerService = createAuthorizationServerService(env);
    const response = await authServerService.registerClient(body);

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Client registration error:', error);
    return registrationErrorResponse(
      'server_error',
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
}

export async function authorizeGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;

  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const responseType = params.get('response_type');
  const scope = params.get('scope') || 'raindrop:read raindrop:write';
  const state = params.get('state');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');

  if (!clientId) {
    return authorizationErrorResponse('Missing client_id parameter');
  }
  if (!redirectUri) {
    return authorizationErrorResponse('Missing redirect_uri parameter');
  }
  if (responseType !== 'code') {
    return authorizationErrorResponse('Invalid response_type. Only "code" is supported.');
  }
  if (!state) {
    return authorizationErrorResponse('Missing state parameter (CSRF protection)');
  }
  if (!codeChallenge) {
    return authorizationErrorResponse('Missing code_challenge parameter (PKCE required)');
  }
  if (codeChallengeMethod !== 'S256') {
    return authorizationErrorResponse('Invalid code_challenge_method. Only "S256" is supported.');
  }

  const authServerService = createAuthorizationServerService(env);
  const client = await authServerService.getClient(clientId);
  if (!client) {
    return authorizationErrorResponse('Invalid client_id');
  }

  if (!client.redirect_uris.includes(redirectUri)) {
    return authorizationErrorResponse('Invalid redirect_uri for this client');
  }

  const cookies = parseCookie(request.headers.get('cookie') || '');
  const raindropSession = cookies.raindrop_session;

  if (!raindropSession) {
    const loginUrl = new URL('/auth/init', url.origin);
    loginUrl.searchParams.set('redirect_uri', request.url);
    return Response.redirect(loginUrl.toString(), 302);
  }

  const consentHtml = generateConsentHtml({
    clientName: client.client_name,
    scope,
    state,
    clientId,
    redirectUri,
    codeChallenge,
  });

  return new Response(consentHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

export async function authorizePost(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();

  const action = formData.get('action') as string;
  const state = formData.get('state') as string;
  const clientId = formData.get('client_id') as string;
  const redirectUri = formData.get('redirect_uri') as string;
  const codeChallenge = formData.get('code_challenge') as string;
  const scope = formData.get('scope') as string;

  if (action === 'deny') {
    const errorUrl = new URL(redirectUri);
    errorUrl.searchParams.set('error', 'access_denied');
    errorUrl.searchParams.set('error_description', 'User denied authorization');
    if (state) {
      errorUrl.searchParams.set('state', state);
    }
    return Response.redirect(errorUrl.toString(), 302);
  }

  const cookies = parseCookie(request.headers.get('cookie') || '');
  const raindropSession = cookies.raindrop_session;

  if (!raindropSession) {
    return authorizationErrorResponse('Authentication required');
  }

  try {
    const authServerService = createAuthorizationServerService(env);
    const code = await authServerService.createAuthorizationCode(
      clientId,
      raindropSession,
      redirectUri,
      scope,
      codeChallenge
    );

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }

    return Response.redirect(callbackUrl.toString(), 302);
  } catch (error) {
    console.error('Authorization error:', error);
    return authorizationErrorResponse('Failed to generate authorization code');
  }
}

export async function token(request: Request, env: Env): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body: Record<string, string>;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else if (contentType.includes('application/json')) {
      body = (await request.json()) as Record<string, string>;
    } else {
      return oauthErrorResponse(
        'invalid_request',
        'Content-Type must be application/x-www-form-urlencoded or application/json'
      );
    }

    const grantType = body.grant_type;
    const clientId = body.client_id;
    const clientSecret = body.client_secret;

    if (!grantType) {
      return oauthErrorResponse('invalid_request', 'Missing grant_type parameter');
    }

    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
      return oauthErrorResponse(
        'unsupported_grant_type',
        'Only authorization_code and refresh_token grants are supported'
      );
    }

    if (!clientId) {
      return oauthErrorResponse('invalid_request', 'Missing client_id parameter');
    }

    const authServerService = createAuthorizationServerService(env);
    const isValidClient = await authServerService.validateClient(clientId, clientSecret);
    if (!isValidClient) {
      return oauthErrorResponse('invalid_client', 'Client authentication failed');
    }

    if (grantType === 'authorization_code') {
      return await handleAuthorizationCodeGrant(body, clientId, authServerService, env);
    }

    if (grantType === 'refresh_token') {
      return await handleRefreshTokenGrant(body, clientId, authServerService, env);
    }

    return oauthErrorResponse('invalid_request', 'Invalid grant_type');
  } catch (error) {
    console.error('Token endpoint error:', error);
    return oauthErrorResponse(
      'server_error',
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
}

async function handleAuthorizationCodeGrant(
  body: Record<string, string>,
  clientId: string,
  authServerService: AuthorizationServerService,
  env: Env
): Promise<Response> {
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;

  if (!code) {
    return oauthErrorResponse('invalid_request', 'Missing code parameter');
  }
  if (!redirectUri) {
    return oauthErrorResponse('invalid_request', 'Missing redirect_uri parameter');
  }
  if (!codeVerifier) {
    return oauthErrorResponse('invalid_request', 'Missing code_verifier parameter (PKCE required)');
  }

  try {
    const tokens = await authServerService.exchangeCode(code, clientId, codeVerifier, redirectUri);

    const response: TokenResponse = {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: accessTokenExpiry(env),
      refresh_token: tokens.refreshToken,
      scope: 'raindrop:read raindrop:write',
    };

    return tokenResponse(response);
  } catch (error) {
    console.error('Authorization code exchange error:', error);
    return oauthErrorResponse(
      'invalid_grant',
      error instanceof Error ? error.message : 'Invalid authorization code'
    );
  }
}

async function handleRefreshTokenGrant(
  body: Record<string, string>,
  clientId: string,
  authServerService: AuthorizationServerService,
  env: Env
): Promise<Response> {
  const refreshToken = body.refresh_token;

  if (!refreshToken) {
    return oauthErrorResponse('invalid_request', 'Missing refresh_token parameter');
  }

  try {
    const response = await authServerService.refreshAccessToken(refreshToken, clientId);
    return tokenResponse({
      ...response,
      expires_in: accessTokenExpiry(env),
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return oauthErrorResponse(
      'invalid_grant',
      error instanceof Error ? error.message : 'Invalid refresh token'
    );
  }
}

function tokenResponse(response: TokenResponse): Response {
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
    },
  });
}

function generateConsentHtml(params: {
  clientName: string;
  scope: string;
  state: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): string {
  const scopes = params.scope.split(' ');
  const scopeDescriptions: Record<string, string> = {
    'raindrop:read': 'Read your bookmarks and collections',
    'raindrop:write': 'Create and modify bookmarks',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize Application</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #f6f7f9; background: #0b0d0f; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .consent-card { background: #12161a; border: 1px solid #1f2a32; border-radius: 16px; max-width: 480px; width: 100%; padding: 40px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle, .scope-item, .security-note { color: #93a0ad; line-height: 1.6; }
    .app-name, .scope-icon { color: #3dff9f; }
    .scopes { background: #0c0f13; border: 1px solid #1f2a32; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .actions { display: flex; gap: 12px; }
    button { flex: 1; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
    .btn-approve { background: #3dff9f; color: #0a0d0b; border: 0; }
    .btn-deny { background: transparent; color: #f6f7f9; border: 1px solid #1f2a32; }
  </style>
</head>
<body>
  <div class="consent-card">
    <h1>Authorize Access</h1>
    <p class="subtitle">
      <span class="app-name">${escapeHtml(params.clientName)}</span> is requesting access to your Raindrop.io account
    </p>
    <div class="scopes">
      ${scopes.map(scope => `
        <div class="scope-item">
          <span class="scope-icon">✓</span>
          <span>${escapeHtml(scopeDescriptions[scope] || scope)}</span>
        </div>
      `).join('')}
    </div>
    <form method="POST" action="/authorize">
      <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
      <div class="actions">
        <button type="submit" name="action" value="approve" class="btn-approve">Authorize</button>
        <button type="submit" name="action" value="deny" class="btn-deny">Deny</button>
      </div>
    </form>
    <p class="security-note">Only authorize applications you trust.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
