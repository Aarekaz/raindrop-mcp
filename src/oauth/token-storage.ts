/**
 * Token storage implementation using Vercel KV
 * Handles encrypted session and OAuth state persistence
 */

import { kv } from '@vercel/kv';
import { StoredSession, OAuthState } from './oauth.types.js';
import { encrypt, decrypt } from './crypto.utils.js';

const SESSION_TTL = 14 * 24 * 60 * 60; // 14 days in seconds
const STATE_TTL = 5 * 60; // 5 minutes in seconds

export class TokenStorage {
  /**
   * Save a session with encrypted tokens
   */
  async saveSession(session: StoredSession): Promise<void> {
    const encrypted = {
      ...session,
      accessToken: encrypt(session.accessToken),
      refreshToken: encrypt(session.refreshToken),
    };

    await kv.set(`session:${session.sessionId}`, encrypted, { ex: SESSION_TTL });
    await kv.set(`user:${session.userId}`, session.sessionId, { ex: SESSION_TTL });
  }

  /**
   * Retrieve a session and decrypt tokens
   */
  async getSession(sessionId: string): Promise<StoredSession | null> {
    const data = await kv.get<StoredSession>(`session:${sessionId}`);
    if (!data) return null;

    return {
      ...data,
      accessToken: decrypt(data.accessToken),
      refreshToken: decrypt(data.refreshToken),
    };
  }

  /**
   * Delete a session and associated user mapping
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      await kv.del(`session:${sessionId}`);
      await kv.del(`user:${session.userId}`);
    }
  }

  /**
   * Save OAuth state temporarily (PKCE verifier, CSRF state)
   */
  async saveOAuthState(state: OAuthState): Promise<void> {
    await kv.set(`oauth:${state.state}`, state, { ex: STATE_TTL });
  }

  /**
   * Retrieve OAuth state
   */
  async getOAuthState(state: string): Promise<OAuthState | null> {
    return await kv.get<OAuthState>(`oauth:${state}`);
  }

  /**
   * Delete OAuth state after use
   */
  async deleteOAuthState(state: string): Promise<void> {
    await kv.del(`oauth:${state}`);
  }
}
