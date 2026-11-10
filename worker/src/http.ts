/** Owns resource responses and shared conditional-request handling; authentication runs before these helpers. */
export function error(code: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function cached(
  request: Request,
  resource: { body: string; version: string } | { error: string; status: number },
): Response {
  if ('error' in resource) return error(resource.error, resource.status);
  const etag = `"${resource.version}"`;
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' };
  const matches = request.headers
    .get('If-None-Match')
    ?.split(',')
    .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
  return new Response(matches ? null : resource.body, { status: matches ? 304 : 200, headers });
}
