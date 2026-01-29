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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'IBM Plex Mono', monospace;
      color: #f6f7f9;
      background: radial-gradient(circle at 20% 20%, #17202a, transparent 55%),
        radial-gradient(circle at 80% 0%, #0f1c17, transparent 45%),
        radial-gradient(circle at 80% 80%, #0f1216, transparent 50%),
        #0b0d0f;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .consent-card {
      background: rgba(18, 22, 26, 0.95);
      border: 1px solid #1f2a32;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      max-width: 480px;
      width: 100%;
      padding: 40px;
      position: relative;
      overflow: hidden;
    }
    .consent-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, #3dff9f, transparent);
    }
    .logo {
      width: 48px;
      height: 48px;
      background: #12161a;
      border: 1px solid #1f2a32;
      border-radius: 12px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .brand-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #3dff9f;
      box-shadow: 0 0 12px rgba(61, 255, 159, 0.6);
    }
    h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: #f6f7f9;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 14px;
      color: #93a0ad;
      margin-bottom: 32px;
      line-height: 1.6;
    }
    .app-name {
      font-weight: 600;
      color: #3dff9f;
    }
    .section-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 16px;
      font-weight: 600;
      color: #f6f7f9;
      margin-bottom: 16px;
    }
    .scopes {
      background: rgba(12, 15, 19, 0.6);
      border: 1px solid #1f2a32;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 32px;
    }
    .scope-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 14px;
      color: #93a0ad;
      line-height: 1.6;
    }
    .scope-item:last-child {
      margin-bottom: 0;
    }
    .scope-icon {
      color: #3dff9f;
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
      border-radius: 8px;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
      border: 1px solid transparent;
    }
    .btn-approve {
      background: #3dff9f;
      color: #0a0d0b;
      box-shadow: 0 0 20px rgba(61, 255, 159, 0.3);
    }
    .btn-approve:hover {
      transform: translateY(-2px) scale(1.01);
      box-shadow: 0 0 30px rgba(61, 255, 159, 0.5);
    }
    .btn-deny {
      background: transparent;
      color: #f6f7f9;
      border-color: #1f2a32;
    }
    .btn-deny:hover {
      border-color: #3dff9f;
      background: rgba(61, 255, 159, 0.05);
    }
    .security-note {
      margin-top: 24px;
      padding: 16px;
      background: rgba(255, 179, 71, 0.1);
      border-left: 3px solid #ffb347;
      border-radius: 8px;
      font-size: 13px;
      color: #93a0ad;
      line-height: 1.6;
    }
    .security-note strong {
      color: #ffb347;
    }
  </style>
</head>
<body>
  <div class="consent-card">
    <div class="logo">
      <span class="brand-dot"></span>
    </div>
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
