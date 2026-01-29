/**
 * Token storage implementation using Vercel KV
 * Handles encrypted session and OAuth state persistence
 */

import { kv } from '@vercel/kv';
import {
  StoredSession,
  OAuthState,
  OAuthClient,
  AuthorizationCode,
  RefreshToken
} from './oauth.types.js';
import { encrypt, decrypt } from './crypto.utils.js';

const SESSION_TTL = 14 * 24 * 60 * 60; // 14 days in seconds
const STATE_TTL = 5 * 60; // 5 minutes in seconds
const AUTH_CODE_TTL = 5 * 60; // 5 minutes in seconds
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

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

  // ============================================================================
  // OAuth Authorization Server Storage Methods
  // ============================================================================

  /**
   * Save OAuth client registration
   */
  async saveClient(client: OAuthClient): Promise<void> {
    await kv.set(`client:${client.client_id}`, client);
  }

  /**
   * Get OAuth client by client_id
   */
  async getClient(clientId: string): Promise<OAuthClient | null> {
    return await kv.get<OAuthClient>(`client:${clientId}`);
  }

  /**
   * Save authorization code (short-lived, 5 minutes)
   */
  async saveAuthCode(authCode: AuthorizationCode): Promise<void> {
    await kv.set(`authcode:${authCode.code}`, authCode, { ex: AUTH_CODE_TTL });
  }

  /**
   * Get authorization code
   */
  async getAuthCode(code: string): Promise<AuthorizationCode | null> {
    return await kv.get<AuthorizationCode>(`authcode:${code}`);
  }

  /**
   * Delete authorization code (one-time use)
   */
  async deleteAuthCode(code: string): Promise<void> {
    await kv.del(`authcode:${code}`);
  }

  /**
   * Save refresh token (long-lived, 30 days)
   */
  async saveRefreshToken(token: RefreshToken): Promise<void> {
    await kv.set(`refresh:${token.token}`, token, { ex: REFRESH_TOKEN_TTL });
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(token: string): Promise<RefreshToken | null> {
    return await kv.get<RefreshToken>(`refresh:${token}`);
  }

  /**
   * Delete refresh token
   */
  async deleteRefreshToken(token: string): Promise<void> {
    await kv.del(`refresh:${token}`);
  }

  /**
   * Save user → Raindrop token mapping (encrypted)
   * Used to make backend API calls on behalf of the user
   */
  async saveUserRaindropToken(userId: string, encryptedToken: string): Promise<void> {
    await kv.set(`user_raindrop:${userId}`, encryptedToken, { ex: SESSION_TTL });
  }

  /**
   * Get user's Raindrop token (returns encrypted value)
   */
  async getUserRaindropToken(userId: string): Promise<string | null> {
    return await kv.get<string>(`user_raindrop:${userId}`);
  }
}
