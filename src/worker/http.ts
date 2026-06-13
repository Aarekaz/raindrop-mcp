type JsonInit = ResponseInit & {
  headers?: ConstructorParameters<typeof Headers>[0];
};

function withJsonContentType(headers?: ConstructorParameters<typeof Headers>[0]): Headers {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return responseHeaders;
}

export function json(data: unknown, init: JsonInit = {}): Response {
  const { headers, ...responseInit } = init;

  return new Response(JSON.stringify(data, null, 2), {
    ...responseInit,
    headers: withJsonContentType(headers),
  });
}

export function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export function methodNotAllowed(): Response {
  return json({ error: 'method_not_allowed' }, { status: 405 });
}
