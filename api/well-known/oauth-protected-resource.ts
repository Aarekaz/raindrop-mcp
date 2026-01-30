import {
  generateProtectedResourceMetadata,
  getPublicOrigin,
  metadataCorsOptionsRequestHandler,
} from 'mcp-handler';

/**
 * OAuth Protected Resource Metadata endpoint
 * Complies with RFC 9728 and MCP Streamable HTTP specification
 *
 * Updated to point to self-hosted authorization server
 */
const AUTH_SERVER_URL = (process.env.JWT_ISSUER || 'https://raindrop-mcp.anuragd.me').trim();

const handler = (req: Request): Response => {
  const url = new URL(req.url);
  const requestedPath = url.searchParams.get('path');
  const resourcePath = requestedPath
    ? `/${requestedPath.replace(/^\\//, '')}`
    : '/mcp';

  const origin = getPublicOrigin(req);
  const resourceUrl = `${origin}${resourcePath}`;

  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [AUTH_SERVER_URL],
    resourceUrl,
  });

  return new Response(JSON.stringify(metadata), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'max-age=3600',
      'Content-Type': 'application/json',
    },
  });
};

/**
 * CORS preflight handler for metadata endpoint
 */
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
