import { describe, expect, it } from 'vitest';
import { KeyValueStore, TokenStorage } from '../src/oauth/token-storage.js';
import { OAuthState } from '../src/oauth/oauth.types.js';

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('TokenStorage', () => {
  it('saves, reads, and deletes OAuth state', async () => {
    const storage = new TokenStorage(new MemoryStore());
    const state: OAuthState = {
      state: 'state-123',
      codeVerifier: 'verifier-456',
      redirectUri: 'https://example.com/callback',
      expiresAt: Date.now() + 300_000,
    };

    await storage.saveOAuthState(state);
    await expect(storage.getOAuthState(state.state)).resolves.toEqual(state);

    await storage.deleteOAuthState(state.state);
    await expect(storage.getOAuthState(state.state)).resolves.toBeNull();
  });
});
