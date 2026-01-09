import { describe, it, expect, beforeEach } from 'vitest';
import { RaindropService } from '../src/services/raindrop.service';

describe('RaindropService', () => {
  let service: RaindropService;

  beforeEach(() => {
    // Skip if no token is available
    if (!process.env.RAINDROP_ACCESS_TOKEN) {
      console.log('Skipping tests - RAINDROP_ACCESS_TOKEN not set');
      return;
    }
    service = new RaindropService();
  });

  describe('Constructor', () => {
    it('should throw error if token is missing', () => {
      const originalToken = process.env.RAINDROP_ACCESS_TOKEN;
      delete process.env.RAINDROP_ACCESS_TOKEN;

      expect(() => new RaindropService()).toThrow(
        'RAINDROP_ACCESS_TOKEN is required'
      );

      process.env.RAINDROP_ACCESS_TOKEN = originalToken;
    });

    it('should create service with valid token', () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;
      expect(service).toBeDefined();
    });
  });

  describe('Collections', () => {
    it('should fetch collections', async () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;

      const collections = await service.getCollections();
      expect(Array.isArray(collections)).toBe(true);
    });

    it('should handle collection not found error', async () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;

      await expect(service.getCollection(999999999)).rejects.toThrow();
    });
  });

  describe('Bookmarks', () => {
    it('should search bookmarks', async () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;

      const result = await service.getBookmarks({ perPage: 5 });
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('count');
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should handle bookmark not found error', async () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;

      await expect(service.getBookmark(999999999)).rejects.toThrow();
    });
  });

  describe('Tags', () => {
    it('should fetch all tags', async () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;

      const tags = await service.getTags();
      expect(Array.isArray(tags)).toBe(true);
    });
  });

  describe('User', () => {
    it('should fetch user info', async () => {
      if (!process.env.RAINDROP_ACCESS_TOKEN) return;

      const user = await service.getUserInfo();
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('_id');
    });
  });
});
