import type { KVNamespace } from '@cloudflare/workers-types';

export interface Fetcher {
  fetch(request: Request): Promise<Response> | Response;
}

export interface Env {
  RAINDROP_AUTH_KV: KVNamespace;
  ASSETS: Fetcher;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_URI?: string;
  OAUTH_ALLOWED_REDIRECT_URIS?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  JWT_SIGNING_KEY?: string;
  JWT_ISSUER?: string;
  JWT_ACCESS_TOKEN_EXPIRY?: string;
  JWT_REFRESH_TOKEN_EXPIRY?: string;
  RAINDROP_ACCESS_TOKEN?: string;
  NODE_ENV?: string;
}
