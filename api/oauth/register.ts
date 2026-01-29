/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591)
 * Allows clients to register dynamically
 */

import { AuthorizationServerService } from '../../src/oauth/authorization-server.service.js';
import { TokenStorage } from '../../src/oauth/token-storage.js';
import type { ClientRegistrationRequest } from '../../src/types/oauth-server.types.js';

const storage = new TokenStorage();
const authServerService = new AuthorizationServerService(storage);

/**
 * POST /register - Register a new OAuth client
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json() as ClientRegistrationRequest;

    // Validate required fields
    if (!body.client_name) {
      return errorResponse('invalid_client_metadata', 'Missing client_name');
    }

    if (!body.redirect_uris || body.redirect_uris.length === 0) {
      return errorResponse('invalid_redirect_uri', 'At least one redirect_uri is required');
    }

    // Validate redirect URIs
    for (const uri of body.redirect_uris) {
      try {
        const url = new URL(uri);
        // Allow http only for localhost (for development)
        if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
          return errorResponse(
            'invalid_redirect_uri',
            `Redirect URI must use HTTPS (except localhost): ${uri}`
          );
        }
      } catch {
        return errorResponse('invalid_redirect_uri', `Invalid URI format: ${uri}`);
      }
    }

    // Register client
    const response = await authServerService.registerClient(body);

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Client registration error:', error);
    return errorResponse(
      'server_error',
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
}

/**
 * Return error response
 */
function errorResponse(error: string, description: string): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: description,
    }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
