// News RSS passthrough (Phase 1.5 Track A extension). AllOrigins (the prior client-side proxy — see
// packages/core/src/core/news/newsClient.constants.ts) started 408-timing-out on the RBI/SEBI feeds
// specifically (found 2026-07-27, live in RN Web console). Unlike the generic `lib/upstreams.ts`
// passthrough (one prefix → one host, `rest` forwarded verbatim), each RSS feed lives on a different
// publisher host with no shared path shape, and the response is XML, not JSON — a dedicated handful of
// fixed feed IDs (mirroring `market.ts`'s dedicated snapshot route) fits better than trying to force
// this into the prefix+rest shape.

// Mirrors the client's NEWS_SOURCES (packages/core/src/core/news/newsClient.constants.ts). Kept as its
// own copy here deliberately — this worker is a separate deployable with no dependency on packages/core,
// same precedent as vahanFetch.ts/market.ts having their own constants.
export const NEWS_FEEDS: Record<string, string> = {
  'et-markets': 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
  mint: 'https://www.livemint.com/rss/markets',
  rbi: 'https://www.rbi.org.in/pressreleases_rss.xml',
  sebi: 'https://www.sebi.gov.in/sebirss.xml'
};

const NEWS_TTL = 45 * 60; // seconds; mirrors the client's NEWS_TTL_MS

export function isKnownFeed(feedId: string): boolean {
  return feedId in NEWS_FEEDS;
}

function cacheKey(feedId: string): string {
  return `news:${feedId}`;
}

/** Fetch one RSS feed (cached), returning the raw XML text plus whether it was a cache hit. Caching the
 *  fresh fetch happens via `ctx.waitUntil` so it doesn't delay the response, mirroring `handlePassthrough`
 *  in index.ts. */
export async function fetchNewsFeed(
  feedId: string,
  env: { CACHE: KVNamespace },
  ctx: ExecutionContext
): Promise<{ xml: string; cache: 'HIT' | 'MISS' } | null> {
  const feedUrl = NEWS_FEEDS[feedId];
  if (!feedUrl) return null;

  const key = cacheKey(feedId);
  const cached = await env.CACHE.get(key);
  if (cached !== null) return { xml: cached, cache: 'HIT' };

  const res = await fetch(feedUrl, { headers: { 'user-agent': 'penny-api-proxy' } });
  if (!res.ok) throw new Error(`upstream_error:${res.status}`);
  const xml = await res.text();
  ctx.waitUntil(env.CACHE.put(key, xml, { expirationTtl: NEWS_TTL }));
  return { xml, cache: 'MISS' };
}
