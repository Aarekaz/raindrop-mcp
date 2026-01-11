/**
 * OAuth Protected Resource Metadata (RFC9728)
 *
 * MCP specification compliance endpoint that provides OAuth configuration details.
 * Allows MCP clients to discover authorization servers and supported scopes.
 */

import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';

const handler = protectedResourceHandler({
  authServerUrls: ['https://raindrop.io'],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
