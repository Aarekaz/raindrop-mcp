/**
 * OAuth 2.1 Token Endpoint
 * Handles token requests (authorization_code and refresh_token grants)
 */

import { AuthorizationServerService } from '../../src/oauth/authorization-server.service.js';
import { TokenStorage } from '../../src/oauth/token-storage.js';
import type { TokenResponse } from '../../src/types/oauth-server.types.js';

const storage = new TokenStorage();
const authServerService = new AuthorizationServerService(storage);

const JWT_ACCESS_TOKEN_EXPIRY = parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRY || '3600', 10);

/**
 * POST /token - Token endpoint
 * Supports authorization_code and refresh_token grants
 */
export async function POST(req: Request): Promise<Response> {
  try {
    // Parse request body
    const contentType = req.headers.get('content-type') || '';
    let body: Record<string, string>;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else if (contentType.includes('application/json')) {
      body = await req.json() as Record<string, string>;
    } else {
      return errorResponse(
        'invalid_request',
        'Content-Type must be application/x-www-form-urlencoded or application/json'
      );
    }

    const grantType = body.grant_type;
    const clientId = body.client_id;
    const clientSecret = body.client_secret;

    // Validate grant_type
    if (!grantType) {
      return errorResponse('invalid_request', 'Missing grant_type parameter');
    }

    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
      return errorResponse(
        'unsupported_grant_type',
        'Only authorization_code and refresh_token grants are supported'
      );
    }

    // Validate client
    if (!clientId) {
      return errorResponse('invalid_request', 'Missing client_id parameter');
    }

    const isValidClient = await authServerService.validateClient(clientId, clientSecret);
    if (!isValidClient) {
      return errorResponse('invalid_client', 'Client authentication failed');
    }

    // Handle grant type
    if (grantType === 'authorization_code') {
      return await handleAuthorizationCodeGrant(body, clientId);
    } else if (grantType === 'refresh_token') {
      return await handleRefreshTokenGrant(body, clientId);
    }

    return errorResponse('invalid_request', 'Invalid grant_type');
  } catch (error) {
    console.error('Token endpoint error:', error);
    return errorResponse(
      'server_error',
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
}

/**
 * Handle authorization_code grant
 */
async function handleAuthorizationCodeGrant(
  body: Record<string, string>,
  clientId: string
): Promise<Response> {
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;

  // Validate required parameters
  if (!code) {
    return errorResponse('invalid_request', 'Missing code parameter');
  }
  if (!redirectUri) {
    return errorResponse('invalid_request', 'Missing redirect_uri parameter');
  }
  if (!codeVerifier) {
    return errorResponse('invalid_request', 'Missing code_verifier parameter (PKCE required)');
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await authServerService.exchangeCode(
      code,
      clientId,
      codeVerifier,
      redirectUri
    );

    const response: TokenResponse = {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: JWT_ACCESS_TOKEN_EXPIRY,
      refresh_token: tokens.refreshToken,
      scope: 'raindrop:read raindrop:write',
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Authorization code exchange error:', error);
    return errorResponse(
      'invalid_grant',
      error instanceof Error ? error.message : 'Invalid authorization code'
    );
  }
}

/**
 * Handle refresh_token grant
 */
async function handleRefreshTokenGrant(
  body: Record<string, string>,
  clientId: string
): Promise<Response> {
  const refreshToken = body.refresh_token;

  // Validate required parameters
  if (!refreshToken) {
    return errorResponse('invalid_request', 'Missing refresh_token parameter');
  }

  try {
    // Refresh access token
    const response = await authServerService.refreshAccessToken(refreshToken, clientId);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return errorResponse(
      'invalid_grant',
      error instanceof Error ? error.message : 'Invalid refresh token'
    );
  }
}

/**
 * Return OAuth error response
 */
function errorResponse(error: string, description: string): Response {
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
