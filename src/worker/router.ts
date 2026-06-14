import type { ExecutionContext } from '@cloudflare/workers-types';

import type { Env } from './env.js';
import { methodNotAllowed, notFound } from './http.js';

export type RouteHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext
) => Promise<Response> | Response;

type RouteTable = Map<string, Map<string, RouteHandler>>;

function normalizePath(path: string): string {
  if (path === '/') {
    return path;
  }

  return path.replace(/\/+$/, '') || '/';
}

export interface RouterResult {
  matched: boolean;
  response: Response;
}

export class Router {
  private readonly routes: RouteTable = new Map();

  on(method: string, path: string, handler: RouteHandler): void {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = normalizePath(path);
    const existing = this.routes.get(normalizedPath);
    const handlers = existing ?? new Map<string, RouteHandler>();

    handlers.set(normalizedMethod, handler);
    this.routes.set(normalizedPath, handlers);
  }

  async handle(request: Request, env: Env, ctx: ExecutionContext): Promise<RouterResult> {
    const url = new URL(request.url);
    const handlers = this.routes.get(normalizePath(url.pathname));

    if (!handlers) {
      return {
        matched: false,
        response: notFound(),
      };
    }

    const handler = handlers.get(request.method.toUpperCase());

    if (!handler) {
      return {
        matched: true,
        response: methodNotAllowed(),
      };
    }

    return {
      matched: true,
      response: await handler(request, env, ctx),
    };
  }
}
