/**
 * OAuth 2.0 service implementing PKCE flow for Raindrop.io
 * Handles authorization, token exchange, and token refresh
 */

import pkceChallenge from 'pkce-challenge';
import crypto from 'crypto';
import { OAuthConfig, TokenResponse, StoredSession } from './oauth.types.js';
import { TokenStorage } from './token-storage.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('oauth');

export class OAuthService {
  private config: OAuthConfig;
  private storage: TokenStorage;

  constructor(config: OAuthConfig, storage: TokenStorage) {
    this.config = config;
    this.storage = storage;
  }

  /**
   * Initialize OAuth flow with PKCE
   * Returns authorization URL and state for CSRF protection
   */
  async initFlow(redirectUri: string): Promise<{ authUrl: string; state: string }> {
    const state = crypto.randomUUID();
    const { code_verifier, code_challenge } = await pkceChallenge(128);

    // Store state temporarily for callback validation
    await this.storage.saveOAuthState({
      state,
      codeVerifier: code_verifier,
      redirectUri,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Build authorization URL with PKCE parameters
    const authUrl = new URL(this.config.authorizationEndpoint);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', code_challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    logger.info('OAuth flow initiated', { state });
    return { authUrl: authUrl.toString(), state };
  }

  /**
   * Handle OAuth callback after user authorization
   * Exchanges authorization code for access/refresh tokens
   */
  async handleCallback(code: string, state: string): Promise<StoredSession> {
    // Validate state parameter (CSRF protection)
    const storedState = await this.storage.getOAuthState(state);
    if (!storedState) {
      throw new Error('Invalid or expired state parameter');
    }

    // Exchange authorization code for tokens
    const tokens = await this.exchangeCodeForTokens(code, storedState.codeVerifier);

    // Get user information from Raindrop
    const userInfo = await this.getUserInfo(tokens.access_token);

    // Create and store session
    const session: StoredSession = {
      sessionId: crypto.randomUUID(),
      userId: String(userInfo._id),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    await this.storage.saveSession(session);
    await this.storage.deleteOAuthState(state);

    logger.info('OAuth callback completed', { userId: session.userId });
    return session;
  }

  /**
   * Exchange authorization code for access/refresh tokens
   */
  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Token exchange failed', { status: response.status, error: errorText });
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return (await response.json()) as TokenResponse;
  }

  /**
   * Get user information from Raindrop API
   */
  private async getUserInfo(accessToken: string): Promise<{ _id: number }> {
    const response = await fetch('https://api.raindrop.io/rest/v1/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      logger.error('Failed to get user info', { status: response.status });
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = (await response.json()) as { user: { _id: number } };
    return data.user;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(session: StoredSession): Promise<StoredSession> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Token refresh failed', { status: response.status, error: errorText });
      throw new Error('Token refresh failed');
    }

    const tokens = (await response.json()) as TokenResponse;

    const updatedSession: StoredSession = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      lastUsedAt: Date.now(),
    };

    await this.storage.saveSession(updatedSession);

    logger.info('Token refreshed', { userId: session.userId });
    return updatedSession;
  }

  /**
   * Ensure token is valid, refreshing if necessary
   * Automatically refreshes tokens that expire within 1 hour
   */
  async ensureValidToken(sessionId: string): Promise<string> {
    const session = await this.storage.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const timeUntilExpiry = session.expiresAt - Date.now();
    const REFRESH_THRESHOLD = 60 * 60 * 1000; // 1 hour in milliseconds

    // Refresh token if it expires within threshold
    if (timeUntilExpiry < REFRESH_THRESHOLD) {
      const refreshed = await this.refreshToken(session);
      return refreshed.accessToken;
    }

    return session.accessToken;
  }
}
