import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';

/**
 * OAuth Protected Resource Metadata endpoint
 * Complies with RFC 9728 and MCP Streamable HTTP specification
 */
const handler = protectedResourceHandler({
  authServerUrls: ['https://raindrop.io'],
  scopes: ['raindrop:read', 'raindrop:write'],
});

/**
 * CORS preflight handler for metadata endpoint
 */
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
