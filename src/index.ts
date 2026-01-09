#!/usr/bin/env node
/**
 * Entry point for the Raindrop MCP server
 * 
 * Initializes the MCP server using STDIO transport for process-based communication.
 * This is the standard way to run MCP servers with AI assistants like Claude.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from 'dotenv';
import { RaindropMCPService } from './services/raindropmcp.service.js';
import { createLogger } from './utils/logger.js';

// Load environment variables
config();

const logger = createLogger('mcp-server');

/**
 * Main function to bootstrap the MCP server
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting Raindrop MCP server');

    // Create STDIO transport and MCP service
    const transport = new StdioServerTransport();
    const mcpService = new RaindropMCPService();
    const server = mcpService.getServer();

    // Connect server to transport
    await server.connect(transport);
    logger.info('MCP server connected via STDIO transport');

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      try {
        await mcpService.cleanup();
        await server.close();
        logger.info('Server shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    logger.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
