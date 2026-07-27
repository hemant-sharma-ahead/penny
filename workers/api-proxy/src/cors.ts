// Permissive CORS for the (public, read-only) proxy + small JSON helpers.

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS }
  });
}

/** Raw upstream JSON text passed through with CORS + a cache-status hint header. */
export function passthrough(text: string, cache: 'HIT' | 'MISS'): Response {
  return new Response(text, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-proxy-cache': cache, ...CORS_HEADERS }
  });
}

/** Raw upstream XML (RSS) text passed through with CORS + a cache-status hint header. */
export function passthroughXml(text: string, cache: 'HIT' | 'MISS'): Response {
  return new Response(text, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'x-proxy-cache': cache, ...CORS_HEADERS }
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
