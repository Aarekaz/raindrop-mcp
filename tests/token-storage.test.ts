import { describe, expect, it } from 'vitest';
import { KeyValueStore, TokenStorage } from '../src/oauth/token-storage.js';
import type { OAuthState, RefreshToken, StoredSession } from '../src/oauth/oauth.types.js';

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, unknown>();
  readonly setOptions = new Map<string, { ex?: number } | undefined>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T, options?: { ex?: number }): Promise<void> {
    this.values.set(key, value);
    this.setOptions.set(key, options);
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('TokenStorage', () => {
  it('saves, reads, and deletes OAuth state', async () => {
    const store = new MemoryStore();
    const storage = new TokenStorage(store);
    const state: OAuthState = {
      state: 'state-123',
      codeVerifier: 'verifier-456',
      redirectUri: 'https://example.com/callback',
      expiresAt: Date.now() + 300_000,
    };

    await storage.saveOAuthState(state);
    await expect(storage.getOAuthState(state.state)).resolves.toEqual(state);
    expect(store.setOptions.get(`oauth:${state.state}`)).toEqual({ ex: 5 * 60 });

    await storage.deleteOAuthState(state.state);
    await expect(storage.getOAuthState(state.state)).resolves.toBeNull();
  });

  it('keeps refreshable user sessions for 30 days', async () => {
    const store = new MemoryStore();
    const storage = new TokenStorage(store, 'a'.repeat(64));
    const session: StoredSession = {
      sessionId: 'session-123',
      userId: 'user-123',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    await storage.saveSession(session);

    expect(store.setOptions.get('session:session-123')).toEqual({ ex: 30 * 24 * 60 * 60 });
    expect(store.setOptions.get('user:user-123')).toEqual({ ex: 30 * 24 * 60 * 60 });
    await expect(storage.getSessionIdForUser('user-123')).resolves.toBe('session-123');
  });

  it('stores refresh tokens for the lifetime encoded in the token', async () => {
    const store = new MemoryStore();
    const storage = new TokenStorage(store);
    const refreshToken: RefreshToken = {
      token: 'refresh-123',
      client_id: 'client-123',
      user_id: 'user-123',
      scope: 'raindrop:read',
      expires_at: Date.now() + 90_000,
      created_at: Date.now(),
    };

    await storage.saveRefreshToken(refreshToken);

    const ttl = store.setOptions.get('refresh:refresh-123')?.ex;
    expect(ttl).toBeGreaterThanOrEqual(89);
    expect(ttl).toBeLessThanOrEqual(90);
  });
});
