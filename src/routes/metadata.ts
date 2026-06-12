import type { Env } from '../worker/env.js';
import { json } from '../worker/http.js';

const DEFAULT_ISSUER = 'https://raindrop-mcp.aarekaz.workers.dev';

const AUTHORIZATION_SERVER_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600',
};

const AUTHORIZATION_SERVER_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const PROTECTED_RESOURCE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'max-age=3600',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

function issuerFromEnv(env: Env): string {
  const configuredIssuer = env.JWT_ISSUER?.trim();

  return configuredIssuer && configuredIssuer.length > 0 ? configuredIssuer : DEFAULT_ISSUER;
}

function firstForwardedHeaderValue(value: string | null): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = firstForwardedHeaderValue(request.headers.get('x-forwarded-host'));
  const forwardedProto = firstForwardedHeaderValue(request.headers.get('x-forwarded-proto'));
  const host = forwardedHost || url.host;
  const proto = forwardedProto || url.protocol.replace(':', '');

  return `${proto}://${host}`;
}

function resourcePath(request: Request): string {
  const url = new URL(request.url);
  const requestedPath = url.searchParams.get('path');

  return requestedPath ? `/${requestedPath.replace(/^\/+/, '')}` : '/mcp';
}

export function authorizationServerMetadata(_request: Request, env: Env): Response {
  const issuer = issuerFromEnv(env);

  return json(
    {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      scopes_supported: ['raindrop:read', 'raindrop:write'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      service_documentation: 'https://github.com/Aarekaz/raindrop-mcp#readme',
      ui_locales_supported: ['en'],
      token_endpoint_auth_signing_alg_values_supported: ['HS256'],
      require_request_uri_registration: false,
      require_signed_request_object: false,
      pkce_code_challenge_methods_supported: ['S256'],
    },
    {
      status: 200,
      headers: AUTHORIZATION_SERVER_HEADERS,
    }
  );
}

export function authorizationServerMetadataHead(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      ...AUTHORIZATION_SERVER_HEADERS,
      ...JSON_HEADERS,
    },
  });
}

export function authorizationServerMetadataOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: AUTHORIZATION_SERVER_CORS_HEADERS,
  });
}

export function protectedResourceMetadata(request: Request, env: Env): Response {
  const resource = `${requestOrigin(request)}${resourcePath(request)}`;

  return json(
    {
      resource,
      authorization_servers: [issuerFromEnv(env)],
    },
    {
      status: 200,
      headers: PROTECTED_RESOURCE_HEADERS,
    }
  );
}

export function protectedResourceMetadataHead(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      ...PROTECTED_RESOURCE_HEADERS,
      ...JSON_HEADERS,
    },
  });
}

export function protectedResourceMetadataOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: PROTECTED_RESOURCE_HEADERS,
  });
}
