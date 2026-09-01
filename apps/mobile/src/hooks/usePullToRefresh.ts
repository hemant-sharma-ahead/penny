import { useCallback, useState } from 'react';

/** Minimum time the spinner stays visible even when `reload` resolves near-instantly — true of almost
 *  every screen in this app except News/Portfolio (real external fetches): a Dexie-backed screen's
 *  "reload" is really just re-reading already-live local data, which can resolve in a handful of
 *  milliseconds. Without a floor, the spinner would flash for under 100ms and read as broken rather
 *  than as "there was nothing to actually fetch here." */
const MIN_VISIBLE_MS = 500;

/**
 * Shared pull-to-refresh wiring — one place for "show the spinner for at least `MIN_VISIBLE_MS`, call
 * `reload` (sync or async), never let a rejection crash the gesture" instead of each screen
 * reimplementing this slightly differently. Mirrors `NewsView.tsx`'s original hand-rolled version
 * (real external fetch, its own `loading` flag already serves this role) — this hook is for every
 * other screen, whose "refresh" is a local re-render of on-device data, not a network call.
 *
 * Returns props ready to spread onto `<RefreshControl refreshing={...} onRefresh={...} />`.
 */
// `unknown` (not `void | Promise<void>`) deliberately — `useRepository`'s own `reload` returns a
// cleanup closure (`() => void`), not `void`/`Promise<void>`, and TS's "a function returning
// something is assignable to a `() => void` parameter" leniency does NOT extend to a `void`-bearing
// UNION like `void | Promise<void>`, so that stricter signature rejected over a dozen real, correct
// call sites across the app. This hook only ever cares whether `reload()` eventually settles, never
// its return value, so `unknown` is the accurate type, not a type-safety compromise.
export function usePullToRefresh(reload: () => unknown) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const startedAt = Date.now();
    void Promise.resolve()
      .then(() => reload())
      .catch(() => {
        // Never let a refresh failure crash the pull gesture — whatever's already on screen stays as
        // is. A screen with a real external fetch (News/Portfolio) already surfaces its own error
        // state independently of this.
      })
      .finally(() => {
        const elapsed = Date.now() - startedAt;
        setTimeout(() => setRefreshing(false), Math.max(0, MIN_VISIBLE_MS - elapsed));
      });
    // `reload` is intentionally the only dependency — callers should pass a `useCallback`'d reload (or
    // accept a fresh `onRefresh` identity each render, which `RefreshControl` handles fine either way).
  }, [reload]);

  return { refreshing, onRefresh };
}
