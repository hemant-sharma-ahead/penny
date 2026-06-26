# Penny — Adding an External API Client

Use this when adding a new external data source (live prices, external service, etc.).

---

## Rules before adding a new API

1. **Check if it's in the permitted domain list** in `penny-standards.md`. If not, raise it first — don't add a new domain without it being discussed and added to the list.

2. **No API keys in code.** Phase 1 uses only free, no-auth APIs. If an API requires a key, it goes in the user's encrypted profile (like the Anthropic API key model) or it waits for Phase 2 when the backend proxy is available.

3. **Cache aggressively.** Price data doesn't need to be real-time. Use the `price_cache` Dexie store (plain, unencrypted — no PII) with sensible TTLs.

4. **Respect CORS.** If the API doesn't support browser-origin CORS, it needs a Cloudflare Worker proxy (Phase 1.5+). Don't add `no-cors` mode.

5. **Handle failure gracefully.** Live data is always optional. If the API is unavailable, the app must work — show stale cached data or a "data unavailable" state. Never block core UI on live data.

---

## File placement

Create `src/core/{feature}/{name}Client.ts`. Examples:
- `src/core/ipo/ipoClient.ts`
- `src/core/portfolio/mfClient.ts`
- `src/core/portfolio/yahooClient.ts`
- `src/core/assets/npsNavClient.ts`

All API clients live under `src/core/`. Never in `src/features/`.

---

## Standard client shape

```ts
// src/core/{feature}/{name}Client.ts

const BASE_URL = 'https://api.example.com';
const CACHE_KEY_PREFIX = 'name_';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function fetchSomething(param: string): Promise<SomethingData | null> {
  // 1. Check cache first
  const cacheKey = `${CACHE_KEY_PREFIX}${param}`;
  const cached = await checkPriceCache(cacheKey);
  if (cached) return cached.data as SomethingData;

  // 2. Fetch
  try {
    const res = await fetch(`${BASE_URL}/endpoint/${param}`);
    if (!res.ok) return null;
    const data: SomethingData = await res.json();

    // 3. Store in cache
    await writePriceCache(cacheKey, data, CACHE_TTL_MS);
    return data;
  } catch {
    return null; // always fail gracefully
  }
}
```

### Cache helpers

Use the `price_cache` store directly (it's a plain store, no encryption needed):

```ts
import { db } from '@/core/db/schema';

async function checkPriceCache(key: string): Promise<PriceCacheEntry | null> {
  const entry = await db.price_cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > entry.ttlMs) {
    await db.price_cache.delete(key);
    return null;
  }
  return entry;
}

async function writePriceCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  await db.price_cache.put({ key, data, updatedAt: Date.now(), ttlMs });
}
```

---

## Hook pattern for live data

Create a `use{Data}.ts` hook in `src/hooks/` or inside the feature folder:

```ts
export function useLiveData(param: string) {
  const [data, setData] = useState<SomethingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await fetchSomething(param);
    if (result) {
      setData(result);
      setLastUpdated(Date.now());
    }
    setLoading(false);
  }, [param]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, lastUpdated, refresh };
}
```

---

## Adding to CSP

If the domain is new, add it to the `Content-Security-Policy` in `vite.config.ts`:

```ts
"connect-src 'self' https://new-api-domain.com"
```

---

## Existing clients to reference

| Client | File | API | TTL |
|---|---|---|---|
| MFAPI.in (NAV + search) | `src/core/portfolio/mfClient.ts` | `api.mfapi.in` | 24h |
| Yahoo Finance (stocks) | `src/core/portfolio/yahooClient.ts` | `query.yahoofinance.com` | 15min |
| IPO data | `src/core/ipo/ipoClient.ts` | `webnodejs.investorgain.com` | 30min |
| NPS NAV | `src/core/assets/npsNavClient.ts` | `npsnav.in` | 24h |
| Vehicle RC | `src/core/assets/vehicleClient.ts` | `vahandetails.com` | 30 days (staleness) |

---

## What NOT to do

- Do not call APIs from inside components — always through a client file + hook
- Do not block UI on live data — cached/offline state must always work
- Do not send any user data (amounts, names, account numbers) to external APIs
- Do not fetch on every render — always cache and debounce refreshes
