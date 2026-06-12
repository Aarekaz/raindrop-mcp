import type { ExecutionContext } from '@cloudflare/workers-types';

import { health } from './routes/health.js';
import {
  authorizationServerMetadata,
  authorizationServerMetadataHead,
  authorizationServerMetadataOptions,
  protectedResourceMetadata,
  protectedResourceMetadataHead,
  protectedResourceMetadataOptions,
} from './routes/metadata.js';
import type { Env } from './worker/env.js';
import { Router } from './worker/router.js';

const router = new Router();

router.on('GET', '/health', () => health());
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
