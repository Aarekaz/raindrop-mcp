/**
 * Type definitions for OAuth 2.1 Authorization Server
 */

/**
 * OAuth 2.0 Client registration information
 */
export interface OAuthClient {
  client_id: string;
  client_secret_hash: string | null;  // bcrypt hash, null for public clients
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: 'client_secret_post' | 'none';
  scope: string;
  created_at: number;
  registration_access_token: string;
}

/**
 * Authorization code with PKCE challenge
 */
export interface AuthorizationCode {
  code: string;
  client_id: string;
  user_id: string;  // From Raindrop authentication
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  expires_at: number;  // 5 minutes
  created_at: number;
}

/**
 * Refresh token information
 */
export interface RefreshToken {
  token: string;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: number;  // 30 days
  created_at: number;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  // Standard claims (RFC 7519)
  iss: string;  // Issuer - https://raindrop-mcp.anuragd.me
  sub: string;  // Subject - Raindrop user_id
  aud: string;  // Audience - 'raindrop-mcp' or resource URI
  exp: number;  // Expiration time (Unix timestamp)
  iat: number;  // Issued at (Unix timestamp)

  // Custom claims
  client_id: string;
  scope: string;  // Space-separated scopes
  raindrop_user_id: string;
}

/**
 * Client registration request (RFC 7591)
 */
export interface ClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types?: string[];
  token_endpoint_auth_method?: 'client_secret_post' | 'none';
  scope?: string;
}

/**
 * Client registration response (RFC 7591)
 */
export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;  // Only for confidential clients
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: 'client_secret_post' | 'none';
  scope: string;
  created_at: number;
  registration_access_token: string;
  registration_client_uri: string;
}

/**
 * Token response (RFC 6749)
 */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

/**
 * Authorization request parameters
 */
export interface AuthorizationRequest {
  client_id: string;
  redirect_uri: string;
  response_type: 'code';
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: 'S256';
}

/**
 * Token request parameters (authorization_code grant)
 */
export interface TokenRequest {
  grant_type: 'authorization_code' | 'refresh_token';
  code?: string;  // For authorization_code
  refresh_token?: string;  // For refresh_token
  client_id: string;
  client_secret?: string;  // For confidential clients
  redirect_uri?: string;  // Required for authorization_code
  code_verifier?: string;  // Required for PKCE
}
