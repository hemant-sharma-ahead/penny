// Defensive per-IP fixed-window rate limit backed by KV. Generous by default — this only stops abuse.

export async function isRateLimited(kv: KVNamespace, ip: string, limit = 120, windowSec = 60): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${ip}:${bucket}`;
  const current = parseInt((await kv.get(key)) ?? '0', 10) + 1;
  // TTL a little past the window so the counter self-expires.
  await kv.put(key, String(current), { expirationTtl: windowSec + 5 });
  return current > limit;
}
