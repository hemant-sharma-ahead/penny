// Penny API Proxy Worker (Phase 1.5 Track A).
// Transparent passthrough + tiered cache for external finance APIs (fixes CORS, collapses N→1),
// plus a permanent D1 cache + morning queue/Cron for the rate-limited vahandetails vehicle API.
// This worker is the deploy template for Tracks B–E. See workers/api-proxy/README.md.

import { CORS_HEADERS, json, passthrough, passthroughXml, preflight } from './cors';
import { isRateLimited } from './ratelimit';
import { parsePath, upstreamUrl, isKnownPrefix } from './lib/upstreams';
import { cacheKey, ttlFor } from './lib/cachePolicy';
import { decideVahan, istParts, inWorkingWindow, canSpend, normalizeReg, nextWindowStartMs } from './lib/vahan';
import { fetchVahan } from './vahanFetch';
import { buildMarketSnapshot, getMarketSnapshot } from './market';
import { fetchNewsFeed, isKnownFeed } from './news';
import { EPF_RATE_TABLE } from './epfRates';
import { PPF_RATE_TABLE } from './ppfRates';
import {
  getVehicle,
  putVehicle,
  enqueue,
  dequeueBatch,
  removeFromQueue,
  bumpAttempt,
  getBudget,
  incBudget
} from './vehicleStore';

export interface Env {
  CACHE: KVNamespace;
  DB: D1Database;
  /** Optional override of the (public) vahandetails key, set via `wrangler secret`. */
  VAHAN_API_KEY?: string;
}

const QUEUE_DRAIN_BATCH = 100;
const QUEUE_MAX_ATTEMPTS = 5; // drop a reg after ~5 failed mornings

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === 'OPTIONS') return preflight();

    const url = new URL(req.url);
    if (url.pathname === '/health') return json({ status: 'ok', ts: Date.now() });

    // Market snapshot — global, edge-cached; short-circuits before rate-limit (it's public + cacheable).
    if (url.pathname === '/market') return handleMarket(req, env, ctx);

    // EPF interest rate table — static, in-source data (changes at most once a year); no rate-limit
    // needed (tiny, cheap, never calls an upstream at all).
    if (url.pathname === '/epf-rates') return json(EPF_RATE_TABLE);

    // PPF interest rate table — same shape/rationale as /epf-rates above.
    if (url.pathname === '/ppf-rates') return json(PPF_RATE_TABLE);

    const ip = req.headers.get('cf-connecting-ip') ?? 'anon';
    if (await isRateLimited(env.CACHE, ip)) return json({ error: 'rate_limited' }, 429);
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

    // News RSS (fixed feed IDs, own cache — see news.ts for why this isn't the generic passthrough).
    const rssMatch = /^\/rss\/([^/]+)$/.exec(url.pathname);
    if (rssMatch?.[1]) return handleNews(rssMatch[1], env, ctx);

    // Vehicle (semantic: D1 permanent cache + queue).
    const vMatch = /^\/vehicle\/([^/]+)$/.exec(url.pathname);
    if (vMatch?.[1]) return handleVehicle(decodeURIComponent(vMatch[1]), url, env);

    // Everything else: transparent passthrough by prefix.
    const parsed = parsePath(url.pathname);
    if (parsed && isKnownPrefix(parsed.prefix)) return handlePassthrough(parsed.prefix, parsed.rest, url, env, ctx);

    return json({ error: 'not_found' }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Refresh the global market snapshot every tick; drain the vehicle queue (self-guards to the
    // Vahan morning window). One */15 cron drives both.
    ctx.waitUntil(buildMarketSnapshot(env));
    ctx.waitUntil(drainVehicleQueue(env));
  }
};

/** Serve the market snapshot from the edge cache; fall back to the KV snapshot (built on cold miss). */
async function handleMarket(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // `caches.default` is Cloudflare-specific (not in the standard WebWorker CacheStorage type).
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL('/market', req.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const snapshot = await getMarketSnapshot(env);
  const res = new Response(JSON.stringify(snapshot), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
      ...CORS_HEADERS
    }
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function handlePassthrough(
  prefix: string,
  rest: string,
  url: URL,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const key = cacheKey(prefix, rest, url.search);
  const cached = await env.CACHE.get(key);
  if (cached !== null) return passthrough(cached, 'HIT');

  const upstream = upstreamUrl(prefix, rest, url.search);
  if (!upstream) return json({ error: 'not_found' }, 404);

  let res: Response;
  try {
    res = await fetch(upstream, { headers: { 'user-agent': 'penny-api-proxy' } });
  } catch {
    return json({ error: 'upstream_unreachable' }, 502);
  }
  if (!res.ok) return json({ error: 'upstream_error', status: res.status }, 502);

  const text = await res.text();
  // Cache in the background so we don't delay the response.
  ctx.waitUntil(env.CACHE.put(key, text, { expirationTtl: ttlFor(prefix, rest) }));
  return passthrough(text, 'MISS');
}

async function handleNews(feedId: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!isKnownFeed(feedId)) return json({ error: 'not_found' }, 404);
  try {
    const result = await fetchNewsFeed(feedId, env, ctx);
    if (!result) return json({ error: 'not_found' }, 404);
    return passthroughXml(result.xml, result.cache);
  } catch {
    return json({ error: 'upstream_error' }, 502);
  }
}

async function handleVehicle(rawReg: string, url: URL, env: Env): Promise<Response> {
  const regno = normalizeReg(rawReg);
  if (!regno) return json({ error: 'bad_request' }, 400);

  const refresh = url.searchParams.get('refresh') === '1';
  const now = Date.now();
  const cached = await getVehicle(env.DB, regno);
  const { dayKey } = istParts(now);
  const used = await getBudget(env.DB, dayKey);

  const decision = decideVahan({ cached: cached !== null, refresh, budgetUsed: used, nowMs: now });

  if (decision === 'serve_cache') return json({ status: 'ok', cached: true, data: cached });

  if (decision === 'fetch_now') {
    try {
      const data = await fetchVahan(regno, env.VAHAN_API_KEY ?? 'Test_1234');
      await putVehicle(env.DB, regno, data);
      await incBudget(env.DB, dayKey, 2);
      await removeFromQueue(env.DB, regno);
      return json({ status: 'ok', cached: false, data });
    } catch {
      await enqueue(env.DB, regno, now);
      return queuedResponse(now, cached);
    }
  }

  await enqueue(env.DB, regno, now);
  return queuedResponse(now, cached);
}

function queuedResponse(now: number, cached: unknown | null): Response {
  return json({
    status: cached ? 'ok_stale_queued' : 'queued',
    queued: true,
    ...(cached ? { data: cached } : {}),
    message: "We'll fetch this vehicle's details by tomorrow morning — it'll appear automatically, no need to retry.",
    etaMorningIST: new Date(nextWindowStartMs(now)).toISOString()
  });
}

/** Cron: drain queued reg numbers within today's budget + working window. One success serves all. */
async function drainVehicleQueue(env: Env): Promise<void> {
  const now = Date.now();
  if (!inWorkingWindow(now)) return;
  const { dayKey } = istParts(now);
  let used = await getBudget(env.DB, dayKey);

  for (const row of await dequeueBatch(env.DB, QUEUE_DRAIN_BATCH)) {
    if (!canSpend(used)) break;
    try {
      const data = await fetchVahan(row.regno, env.VAHAN_API_KEY ?? 'Test_1234');
      await putVehicle(env.DB, row.regno, data);
      await removeFromQueue(env.DB, row.regno);
      used = await incBudget(env.DB, dayKey, 2);
    } catch {
      await bumpAttempt(env.DB, row.regno, now);
      if (row.attempts + 1 >= QUEUE_MAX_ATTEMPTS) await removeFromQueue(env.DB, row.regno);
    }
  }
}

// Re-export for the CORS header constant used by tooling/tests.
export { CORS_HEADERS };
