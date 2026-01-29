/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * Provides server discovery information
 */

const BASE_URL = process.env.JWT_ISSUER || 'https://raindrop-mcp.anuragd.me';

/**
 * GET /.well-known/oauth-authorization-server
 * Returns authorization server metadata
 */
export async function GET(): Promise<Response> {
  const metadata = {
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/token`,
    registration_endpoint: `${BASE_URL}/register`,
    scopes_supported: ['raindrop:read', 'raindrop:write'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],

    // Additional metadata
    service_documentation: 'https://github.com/Aarekaz/raindrop-mcp#readme',
    ui_locales_supported: ['en'],

    // Token endpoint response format
    token_endpoint_auth_signing_alg_values_supported: ['HS256'],

    // Security best practices
    require_request_uri_registration: false,
    require_signed_request_object: false,

    // PKCE is required
    pkce_code_challenge_methods_supported: ['S256'],
  };

  return new Response(JSON.stringify(metadata, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * OPTIONS - CORS preflight
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * HEAD - Health check
 */
export async function HEAD(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
