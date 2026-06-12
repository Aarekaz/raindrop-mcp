import type { ExecutionContext } from '@cloudflare/workers-types';

import {
  createRaindropMcpHandler,
  createRaindropMcpHeadHandler,
  raindropMcpOptionsHandler,
} from './mcp/raindrop-handler.js';
import { authCallback, authInit } from './routes/auth.js';
import { health } from './routes/health.js';
import { info } from './routes/info.js';
import {
  authorizationServerMetadata,
  authorizationServerMetadataHead,
  authorizationServerMetadataOptions,
  protectedResourceMetadata,
  protectedResourceMetadataHead,
  protectedResourceMetadataOptions,
} from './routes/metadata.js';
import {
  authorizeGet,
  authorizePost,
  registerClient,
  token,
} from './routes/oauth.js';
import type { Env } from './worker/env.js';
import { Router } from './worker/router.js';

const router = new Router();

router.on('GET', '/health', () => health());
router.on('GET', '/info', (request, env) => info(request, env));
router.on('GET', '/auth/init', (request, env) => authInit(request, env));
router.on('GET', '/auth/callback', (request, env) => authCallback(request, env));
router.on('POST', '/register', (request, env) => registerClient(request, env));
router.on('GET', '/authorize', (request, env) => authorizeGet(request, env));
router.on('POST', '/authorize', (request, env) => authorizePost(request, env));
router.on('POST', '/token', (request, env) => token(request, env));
router.on('GET', '/mcp', (request, env) => createRaindropMcpHandler(env)(request));
router.on('POST', '/mcp', (request, env) => createRaindropMcpHandler(env)(request));
router.on('DELETE', '/mcp', (request, env) => createRaindropMcpHandler(env)(request));
router.on('HEAD', '/mcp', (request, env) => createRaindropMcpHeadHandler(env)(request));
router.on('OPTIONS', '/mcp', (request) => raindropMcpOptionsHandler(request));
router.on('GET', '/.well-known/oauth-authorization-server', (request, env) =>
  authorizationServerMetadata(request, env)
);
router.on('HEAD', '/.well-known/oauth-authorization-server', () =>
  authorizationServerMetadataHead()
);
router.on('OPTIONS', '/.well-known/oauth-authorization-server', () =>
  authorizationServerMetadataOptions()
);
router.on('GET', '/.well-known/oauth-protected-resource', (request, env) =>
  protectedResourceMetadata(request, env)
);
router.on('HEAD', '/.well-known/oauth-protected-resource', () =>
  protectedResourceMetadataHead()
);
router.on('OPTIONS', '/.well-known/oauth-protected-resource', () =>
  protectedResourceMetadataOptions()
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const result = await router.handle(request, env, ctx);

    if (result.matched) {
      return result.response;
    }

    return env.ASSETS.fetch(request);
  },
};
