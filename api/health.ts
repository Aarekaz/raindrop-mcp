/**
 * Health endpoint for Vercel deployment.
 */

export function GET(): Response {
  return new Response(
    JSON.stringify(
      {
        status: 'ok',
        service: 'raindrop-mcp',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  );
}
