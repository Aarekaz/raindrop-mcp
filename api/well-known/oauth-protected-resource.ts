import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';

/**
 * OAuth Protected Resource Metadata endpoint
 * Complies with RFC 9728 and MCP Streamable HTTP specification
 *
 * Updated to point to self-hosted authorization server
 */
const handler = protectedResourceHandler({
  authServerUrls: [
    process.env.JWT_ISSUER || 'https://raindrop-mcp.anuragd.me'
  ],
});

/**
 * CORS preflight handler for metadata endpoint
 */
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
