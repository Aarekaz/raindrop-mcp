import {
  generateProtectedResourceMetadata,
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
  try {
    const url = new URL(req.url);
    const requestedPath = url.searchParams.get('path');
    const resourcePath = requestedPath
      ? `/${requestedPath.replace(/^\\//, '')}`
      : '/mcp';

    const forwardedHost = req.headers.get('x-forwarded-host');
    const forwardedProto = req.headers.get('x-forwarded-proto');
    const host = forwardedHost ? forwardedHost.split(',')[0].trim() : url.host;
    const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : url.protocol.replace(':', '');
    const origin = `${proto}://${host}`;

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
  } catch (error) {
    console.error('Protected resource metadata error:', error);
    return new Response(JSON.stringify({ error: 'server_error' }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
      },
    });
  }
};

/**
 * CORS preflight handler for metadata endpoint
 */
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
