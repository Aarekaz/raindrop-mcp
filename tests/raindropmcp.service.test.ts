import { describe, it, expect, beforeEach } from 'vitest';
import { RaindropMCPService } from '../src/services/raindropmcp.service';

describe('RaindropMCPService', () => {
  let mcpService: RaindropMCPService;

  beforeEach(() => {
    if (!process.env.RAINDROP_ACCESS_TOKEN) {
      console.log('Skipping tests - RAINDROP_ACCESS_TOKEN not set');
      return;
    }
    mcpService = new RaindropMCPService();
  });

  describe('Initialization', () => {
    it('should create MCP service', () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;
      expect(mcpService).toBeDefined();
    });

    it('should have a server instance', () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;
      const server = mcpService.getServer();
      expect(server).toBeDefined();
    });
  });

  describe('Tool Registration', () => {
    it('should register all required tools', () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;
      
      const server = mcpService.getServer();
      const tools = (server as any)._tools || [];
      
      // Should have at least our 7 core tools
      expect(tools.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup successfully', async () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;
      await expect(mcpService.cleanup()).resolves.not.toThrow();
    });
  });
});
