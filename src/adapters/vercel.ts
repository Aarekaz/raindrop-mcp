/**
 * Vercel Serverless Function Adapter
 * 
 * Exports the Express app as a Vercel serverless function.
 * Handles the conversion between Vercel's request/response format
 * and Express middleware.
 */

import { app } from '../http-server.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel serverless function handler
 * 
 * This function is called by Vercel's runtime for each HTTP request.
 * It forwards the request to the Express app and handles the response.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel automatically handles the request/response conversion
  // We just need to pass it to Express
  return app(req as any, res as any);
}

// Export the Express app for direct import if needed
export { app };
