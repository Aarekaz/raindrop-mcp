/**
 * OAuth 2.1 Authorization Endpoint
 * Handles authorization requests with PKCE
 */

import { parse as parseCookie } from 'cookie';
import { AuthorizationServerService } from '../../src/oauth/authorization-server.service.js';
import { TokenStorage } from '../../src/oauth/token-storage.js';

const storage = new TokenStorage();
const authServerService = new AuthorizationServerService(storage);

/**
 * GET /authorize - Authorization endpoint
 * Shows consent UI if user is authenticated, otherwise redirects to login
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;

  // Parse authorization request
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const responseType = params.get('response_type');
  const scope = params.get('scope') || 'raindrop:read raindrop:write'; // Default scope for MCP clients
  const state = params.get('state');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');

  // Validate required parameters
  if (!clientId) {
    return errorResponse('Missing client_id parameter');
  }
  if (!redirectUri) {
    return errorResponse('Missing redirect_uri parameter');
  }
  if (responseType !== 'code') {
    return errorResponse('Invalid response_type. Only "code" is supported.');
  }
  // Note: scope is now optional, defaults to 'raindrop:read raindrop:write'
  if (!state) {
    return errorResponse('Missing state parameter (CSRF protection)');
  }
  if (!codeChallenge) {
    return errorResponse('Missing code_challenge parameter (PKCE required)');
  }
  if (codeChallengeMethod !== 'S256') {
    return errorResponse('Invalid code_challenge_method. Only "S256" is supported.');
  }

  // Validate client
  const client = await authServerService.getClient(clientId);
  if (!client) {
    return errorResponse('Invalid client_id');
  }

  // Validate redirect_uri
  if (!client.redirect_uris.includes(redirectUri)) {
    return errorResponse('Invalid redirect_uri for this client');
  }

  // Check if user is authenticated
  const cookies = parseCookie(req.headers.get('cookie') || '');
  const raindropSession = cookies.raindrop_session;

  if (!raindropSession) {
    // User not authenticated, redirect to login
    const loginUrl = new URL('/auth/init', url.origin);
    loginUrl.searchParams.set('redirect_uri', req.url);
    return Response.redirect(loginUrl.toString(), 302);
  }

  // User is authenticated, show consent UI
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

/**
 * POST /authorize - Handle consent decision
 */
export async function POST(req: Request): Promise<Response> {
  const formData = await req.formData();

  const action = formData.get('action') as string;
  const state = formData.get('state') as string;
  const clientId = formData.get('client_id') as string;
  const redirectUri = formData.get('redirect_uri') as string;
  const codeChallenge = formData.get('code_challenge') as string;
  const scope = formData.get('scope') as string;

  // Check if user denied
  if (action === 'deny') {
    const errorUrl = new URL(redirectUri);
    errorUrl.searchParams.set('error', 'access_denied');
    errorUrl.searchParams.set('error_description', 'User denied authorization');
    if (state) {
      errorUrl.searchParams.set('state', state);
    }
    return Response.redirect(errorUrl.toString(), 302);
  }

  // User approved, get user ID from session
  const cookies = parseCookie(req.headers.get('cookie') || '');
  const raindropSession = cookies.raindrop_session;

  if (!raindropSession) {
    return errorResponse('Authentication required');
  }

  // Use raindrop_session as user_id (it contains the Raindrop user ID)
  const userId = raindropSession;

  try {
    // Generate authorization code
    const code = await authServerService.createAuthorizationCode(
      clientId,
      userId,
      redirectUri,
      scope,
      codeChallenge
    );

    // Redirect back to client with authorization code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }

    return Response.redirect(callbackUrl.toString(), 302);
  } catch (error) {
    console.error('Authorization error:', error);
    return errorResponse('Failed to generate authorization code');
  }
}

/**
 * Generate consent UI HTML
 */
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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .consent-card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 480px;
      width: 100%;
      padding: 40px;
    }
    .logo {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: white;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: #718096;
      margin-bottom: 32px;
    }
    .app-name {
      font-weight: 600;
      color: #667eea;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 16px;
    }
    .scopes {
      background: #f7fafc;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 32px;
    }
    .scope-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 14px;
      color: #4a5568;
    }
    .scope-item:last-child {
      margin-bottom: 0;
    }
    .scope-icon {
      color: #48bb78;
      margin-right: 12px;
      font-weight: bold;
      flex-shrink: 0;
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    button {
      flex: 1;
      padding: 14px 24px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .btn-approve {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-approve:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }
    .btn-deny {
      background: white;
      color: #4a5568;
      border: 2px solid #e2e8f0;
    }
    .btn-deny:hover {
      background: #f7fafc;
    }
    .security-note {
      margin-top: 24px;
      padding: 16px;
      background: #fff5f5;
      border-left: 4px solid #fc8181;
      border-radius: 8px;
      font-size: 13px;
      color: #742a2a;
    }
  </style>
</head>
<body>
  <div class="consent-card">
    <div class="logo">🔐</div>
    <h1>Authorize Access</h1>
    <p class="subtitle">
      <span class="app-name">${escapeHtml(params.clientName)}</span> is requesting access to your Raindrop.io account
    </p>

    <div class="section-title">This application will be able to:</div>
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
        <button type="submit" name="action" value="approve" class="btn-approve">
          Authorize
        </button>
        <button type="submit" name="action" value="deny" class="btn-deny">
          Deny
        </button>
      </div>
    </form>

    <div class="security-note">
      <strong>Security Notice:</strong> Only authorize applications you trust. They will have access to your Raindrop.io data as specified above.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Return error response
 */
function errorResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: 'invalid_request', error_description: message }),
    {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
