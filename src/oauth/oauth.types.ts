/**
 * Type definitions for OAuth 2.0 authentication flow
 */

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

export interface StoredSession {
  sessionId: string;
  userId: string;
  accessToken: string;       // Encrypted in storage
  refreshToken: string;      // Encrypted in storage
  expiresAt: number;
  createdAt: number;
  lastUsedAt: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface OAuthState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: number;
}
