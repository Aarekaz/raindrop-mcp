import { json } from '../worker/http.js';

export function health(): Response {
  return json(
    {
      status: 'ok',
      service: 'raindrop-mcp',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  );
}
