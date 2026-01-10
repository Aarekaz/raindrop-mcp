/**
 * Well-known endpoints for MCP specification compliance
 * Implements RFC9728: OAuth 2.0 Protected Resource Metadata
 */

import { Router, Request, Response } from 'express';

export function createWellKnownRoutes(): Router {
  const router = Router();

  /**
   * MCP spec compliance: Protected Resource Metadata (RFC9728)
   * GET /.well-known/oauth-protected-resource
   */
  router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`;

    res.json({
      resource: serverUrl,
      authorization_servers: ['https://raindrop.io'],
      scopes_supported: [],
      bearer_methods_supported: ['header', 'body'],
      resource_documentation: 'https://github.com/Aarekaz/raindrop-mcp',
    });
  });

  return router;
}
