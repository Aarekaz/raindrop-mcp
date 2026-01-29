/**
 * OAuth 2.1 Authorization Server Service
 * Issues JWT tokens and manages OAuth clients
 */

import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { TokenStorage } from './token-storage.js';
import {
  OAuthClient,
  AuthorizationCode,
  RefreshToken,
  JWTPayload,
  ClientRegistrationRequest,
  ClientRegistrationResponse,
} from './oauth.types.js';
import type { TokenResponse } from '../types/oauth-server.types.js';

const JWT_ISSUER = process.env.JWT_ISSUER || 'https://raindrop-mcp.anuragd.me';
const JWT_ACCESS_TOKEN_EXPIRY = parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRY || '3600', 10); // 1 hour
const JWT_REFRESH_TOKEN_EXPIRY = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRY || '2592000', 10); // 30 days

export class AuthorizationServerService {
  private storage: TokenStorage;
  private jwtSecret: Uint8Array | null;

  constructor(storage: TokenStorage) {
    this.storage = storage;

    const key = process.env.JWT_SIGNING_KEY;
    if (key) {
      // Convert base64 key to Uint8Array
      this.jwtSecret = new TextEncoder().encode(key);
    } else {
      // JWT features will be unavailable, but don't fail initialization
      // This allows backward compatibility and testing without JWT
      this.jwtSecret = null;
    }
  }

  // ============================================================================
  // Client Management
  // ============================================================================

  /**
   * Register a new OAuth client (RFC 7591)
   */
  async registerClient(
    metadata: ClientRegistrationRequest
  ): Promise<ClientRegistrationResponse> {
    // Generate client credentials
    const clientId = crypto.randomUUID();
    const registrationAccessToken = crypto.randomUUID();

    // Determine if this is a confidential or public client
    const isConfidential = metadata.token_endpoint_auth_method !== 'none';
    let clientSecret: string | undefined;
    let clientSecretHash: string | null = null;

    if (isConfidential) {
      clientSecret = crypto.randomBytes(32).toString('base64url');
      clientSecretHash = await bcrypt.hash(clientSecret, 10);
    }

    const client: OAuthClient = {
      client_id: clientId,
      client_secret_hash: clientSecretHash,
      client_name: metadata.client_name,
      redirect_uris: metadata.redirect_uris,
      grant_types: metadata.grant_types || ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: metadata.token_endpoint_auth_method || 'none',
      scope: metadata.scope || 'raindrop:read raindrop:write',
      created_at: Date.now(),
      registration_access_token: registrationAccessToken,
    };

    await this.storage.saveClient(client);

    const response: ClientRegistrationResponse = {
      client_id: clientId,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      scope: client.scope,
      created_at: client.created_at,
      registration_access_token: registrationAccessToken,
      registration_client_uri: `${JWT_ISSUER}/register/${clientId}`,
    };

    if (clientSecret) {
      response.client_secret = clientSecret;
    }

    return response;
  }

  /**
   * Get OAuth client by client_id
   */
  async getClient(clientId: string): Promise<OAuthClient | null> {
    return await this.storage.getClient(clientId);
  }

  /**
   * Validate client credentials
   */
  async validateClient(clientId: string, clientSecret?: string): Promise<boolean> {
    const client = await this.getClient(clientId);
    if (!client) {
      return false;
    }

    // Public clients (no secret required)
    if (!client.client_secret_hash) {
      return true;
    }

    // Confidential clients (secret required)
    if (!clientSecret) {
      return false;
    }

    return await bcrypt.compare(clientSecret, client.client_secret_hash);
  }

  // ============================================================================
  // Authorization Flow
  // ============================================================================

  /**
   * Create authorization code
   */
  async createAuthorizationCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    scope: string,
    codeChallenge: string
  ): Promise<string> {
    const code = crypto.randomUUID();
    const now = Date.now();

    const authCode: AuthorizationCode = {
      code,
      client_id: clientId,
      user_id: userId,
      redirect_uri: redirectUri,
      scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      expires_at: now + 5 * 60 * 1000, // 5 minutes
      created_at: now,
    };

    await this.storage.saveAuthCode(authCode);
    return code;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    code: string,
    clientId: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Retrieve and delete authorization code (one-time use)
    const authCode = await this.storage.getAuthCode(code);
    if (!authCode) {
      throw new Error('Invalid or expired authorization code');
    }

    // Verify authorization code
    if (authCode.client_id !== clientId) {
      throw new Error('Client ID mismatch');
    }

    if (authCode.redirect_uri !== redirectUri) {
      throw new Error('Redirect URI mismatch');
    }

    if (Date.now() > authCode.expires_at) {
      await this.storage.deleteAuthCode(code);
      throw new Error('Authorization code expired');
    }

    // Verify PKCE
    const isValid = this.validatePKCE(codeVerifier, authCode.code_challenge);
    if (!isValid) {
      await this.storage.deleteAuthCode(code);
      throw new Error('PKCE validation failed');
    }

    // Delete authorization code
    await this.storage.deleteAuthCode(code);

    // Generate tokens
    const accessToken = await this.generateJWT(
      authCode.user_id,
      clientId,
      authCode.scope
    );
    const refreshToken = await this.createRefreshToken(
      authCode.user_id,
      clientId,
      authCode.scope
    );

    return { accessToken, refreshToken };
  }

  // ============================================================================
  // Token Operations
  // ============================================================================

  /**
   * Generate JWT access token
   */
  async generateJWT(userId: string, clientId: string, scope: string): Promise<string> {
    if (!this.jwtSecret) {
      throw new Error(
        'JWT_SIGNING_KEY environment variable not set. ' +
        'Generate with: openssl rand -base64 32'
      );
    }

    const now = Math.floor(Date.now() / 1000);

    const payload: JWTPayload = {
      iss: JWT_ISSUER,
      sub: userId,
      aud: 'raindrop-mcp',
      exp: now + JWT_ACCESS_TOKEN_EXPIRY,
      iat: now,
      client_id: clientId,
      scope,
      raindrop_user_id: userId,
    };

    const jwt = await new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + JWT_ACCESS_TOKEN_EXPIRY)
      .sign(this.jwtSecret);

    return jwt;
  }

  /**
   * Verify JWT token
   */
  async verifyJWT(token: string): Promise<JWTPayload> {
    if (!this.jwtSecret) {
      throw new Error(
        'JWT_SIGNING_KEY environment variable not set. ' +
        'Generate with: openssl rand -base64 32'
      );
    }

    try {
      const { payload } = await jwtVerify(token, this.jwtSecret, {
        issuer: JWT_ISSUER,
        audience: 'raindrop-mcp',
      });

      return payload as unknown as JWTPayload;
    } catch (error) {
      throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create refresh token
   */
  async createRefreshToken(
    userId: string,
    clientId: string,
    scope: string
  ): Promise<string> {
    const token = crypto.randomUUID();
    const now = Date.now();

    const refreshToken: RefreshToken = {
      token,
      client_id: clientId,
      user_id: userId,
      scope,
      expires_at: now + JWT_REFRESH_TOKEN_EXPIRY * 1000,
      created_at: now,
    };

    await this.storage.saveRefreshToken(refreshToken);
    return token;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string, clientId: string): Promise<TokenResponse> {
    const token = await this.storage.getRefreshToken(refreshToken);
    if (!token) {
      throw new Error('Invalid or expired refresh token');
    }

    if (token.client_id !== clientId) {
      throw new Error('Client ID mismatch');
    }

    if (Date.now() > token.expires_at) {
      await this.storage.deleteRefreshToken(refreshToken);
      throw new Error('Refresh token expired');
    }

    // Generate new access token
    const accessToken = await this.generateJWT(
      token.user_id,
      clientId,
      token.scope
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: JWT_ACCESS_TOKEN_EXPIRY,
      scope: token.scope,
    };
  }

  // ============================================================================
  // PKCE Validation
  // ============================================================================

  /**
   * Validate PKCE code_verifier against code_challenge
   * Uses SHA-256 hash
   */
  validatePKCE(codeVerifier: string, codeChallenge: string): boolean {
    // Hash code_verifier with SHA-256
    const hash = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Constant-time comparison
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(codeChallenge)
    );
  }
}
