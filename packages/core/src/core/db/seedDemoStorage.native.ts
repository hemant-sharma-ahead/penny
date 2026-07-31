import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEMO_SEED_KEY } from './seedDemoStorage.constants';

/**
 * RN counterpart to seedDemoStorage.ts. `isDemoSeededSync()` must stay synchronous (seedDemoData.ts and
 * `reseedForEmployment()` both call it as a plain boolean guard, same as web), but AsyncStorage is
 * inherently async — same shape of problem `ipoClient.native.ts`/`npsClient.native.ts` already solved:
 * an in-memory flag instead of a real read-through. This is safe here specifically because every real
 * caller already ORs it with the persisted, encrypted `profile.demoSeeded` field (`profile?.demoSeeded
 * || isDemoSeeded()` — see SettingsPage/ProfilePage), which *is* correctly restored across app
 * restarts; this in-memory flag only needs to be right within a single session (e.g. immediately after
 * `seedDemoData()` runs, before the caller re-renders).
 */
export { DEMO_SEED_KEY };

let demoSeededMemFlag = false;
// Best-effort background hydration on module load, so a cold start that (unusually) already has demo
// data seeded self-corrects quickly even before any profile read completes.
void AsyncStorage.getItem(DEMO_SEED_KEY).then((v) => {
  if (v === '1') demoSeededMemFlag = true;
});

export function isDemoSeededSync(): boolean {
  return demoSeededMemFlag;
}

export function markDemoSeeded(): void {
  demoSeededMemFlag = true;
  void AsyncStorage.setItem(DEMO_SEED_KEY, '1');
}

/**
 * Clears the demo-seeded marker. Unlike web, does NOT clear the other device-local dismissal/cache keys
 * (`penny_active_events`, `penny_cats_v2`, `penny_merchant_memory_v1`, `penny_iou_v2`,
 * `penny_recurring_due_dismissed`, `penny_income_suggestions_dismissed`) — those belong to other mobile
 * contexts/modules (EventModeContext, category customization, etc.) that read/write them through their
 * own `~/lib/storage` (AsyncStorage) calls under the same key names; clearing them from here would mean
 * `packages/core` reaching into app-local UI state it has no other reason to know about. Flagged as a
 * known, narrow gap (not silently dropped) — see the mobile-migration plan's Track 4 Onboarding entry.
 */
export function clearDemoSeedMarkers(): void {
  demoSeededMemFlag = false;
  void AsyncStorage.removeItem(DEMO_SEED_KEY);
}

/**
 * Seeds the demo past-events list under the exact same AsyncStorage key
 * (`penny_past_events`) that `apps/mobile/src/context/EventModeContext.tsx`'s `PAST_LS_KEY` already
 * reads — so seeded trip/event data is real on mobile too, not dropped. There's no RN equivalent of
 * web's `window.dispatchEvent(new CustomEvent('penny-events-updated'))`: `EventModeContext` only loads
 * this list once on mount (see its own docstring) and isn't wired to re-sync afterward, so seeded past
 * events only appear after the next full app restart/remount. Flagged, not silently dropped.
 */
export function persistDemoPastEvents(demoPastEvents: unknown): void {
  void AsyncStorage.setItem('penny_past_events', JSON.stringify(demoPastEvents));
}

/**
 * RN counterpart of web's `mergeLocalEvents` — real gap found on-device (not anticipated by the plan):
 * `seedGroupFixtures.ts` called bare `localStorage`/`window` directly for this one helper, which don't
 * exist as globals on RN at all (`ReferenceError: Property 'localStorage' doesn't exist`, not just a
 * silent no-op like the `typeof window === 'undefined'`-guarded calls elsewhere in this file). Reads
 * under the same AsyncStorage keys `EventModeContext.tsx` uses (`penny_active_events`/`penny_past_events`),
 * so seeded trip/event links are real on mobile too — visible after the next app restart/remount, same
 * documented limitation as `persistDemoPastEvents` above (no RN equivalent of the DOM re-sync event).
 */
export async function mergeLocalEvents<T>(opts: {
  active?: (events: T[]) => T[];
  past?: (events: T[]) => T[];
}): Promise<void> {
  const readEvents = async (key: string): Promise<T[]> => {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  };
  if (opts.active) {
    const next = opts.active(await readEvents('penny_active_events'));
    await AsyncStorage.setItem('penny_active_events', JSON.stringify(next));
  }
  if (opts.past) {
    const next = opts.past(await readEvents('penny_past_events'));
    await AsyncStorage.setItem('penny_past_events', JSON.stringify(next));
  }
}
