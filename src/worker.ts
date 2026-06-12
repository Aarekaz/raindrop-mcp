import type { ExecutionContext } from '@cloudflare/workers-types';

import { health } from './routes/health.js';
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from './routes/metadata.js';
import type { Env } from './worker/env.js';
import { Router } from './worker/router.js';

const router = new Router();

router.on('GET', '/health', () => health());
router.on('GET', '/.well-known/oauth-authorization-server', (request, env) =>
  authorizationServerMetadata(request, env)
);
router.on('GET', '/.well-known/oauth-protected-resource', (request, env) =>
  protectedResourceMetadata(request, env)
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await router.handle(request, env, ctx);

    if (response.status !== 404) {
      return response;
    }

    return env.ASSETS.fetch(request);
  },
};
