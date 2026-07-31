// Tiny platform seam for seedDemoData.ts's handful of direct localStorage/window touches. Kept as a
// small standalone module (with a `.native.ts` sibling) rather than duplicating all 1,650+ lines of
// seedDemoData.ts's pure data-generation logic into a full `.native.ts` fork just for 5 call sites —
// the mobile-migration plan's Track 4 Onboarding entry explicitly sanctions "a refactor to accept an
// injected storage adapter" as the alternative to a full sibling for exactly this shape of problem.
import { DEMO_SEED_KEY } from './seedDemoStorage.constants';

export { DEMO_SEED_KEY };

export function isDemoSeededSync(): boolean {
  return localStorage.getItem(DEMO_SEED_KEY) === '1';
}

export function markDemoSeeded(): void {
  localStorage.setItem(DEMO_SEED_KEY, '1');
}

/** Clears the demo-seeded marker plus every other device-local dismissal/cache key wipeDemoData()
 *  resets so a re-seed (or a real "Exit Demo Mode") starts clean. */
export function clearDemoSeedMarkers(): void {
  localStorage.removeItem(DEMO_SEED_KEY);
  localStorage.removeItem('penny_past_events');
  localStorage.removeItem('penny_active_events');
  localStorage.removeItem('penny_cats_v2');
  localStorage.removeItem('penny_merchant_memory_v1');
  localStorage.removeItem('penny_iou_v2');
  localStorage.removeItem('penny_recurring_due_dismissed');
  localStorage.removeItem('penny_income_suggestions_dismissed');
}

/** Seeds the demo past-events list (so the Events analytics section works out of the box) and notifies
 *  the already-mounted EventModeProvider to re-sync — web-only DOM CustomEvent. */
export function persistDemoPastEvents(demoPastEvents: unknown): void {
  localStorage.setItem('penny_past_events', JSON.stringify(demoPastEvents));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('penny-events-updated'));
}

/** Read+transform+write helper for `seedGroupFixtures.ts`'s active/past local event lists — async so the
 *  same call site works unmodified against native's AsyncStorage (see the `.native.ts` sibling). */
export async function mergeLocalEvents<T>(opts: {
  active?: (events: T[]) => T[];
  past?: (events: T[]) => T[];
}): Promise<void> {
  const readEvents = (key: string): T[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]') as T[];
    } catch {
      return [];
    }
  };
  if (opts.active)
    localStorage.setItem('penny_active_events', JSON.stringify(opts.active(readEvents('penny_active_events'))));
  if (opts.past) localStorage.setItem('penny_past_events', JSON.stringify(opts.past(readEvents('penny_past_events'))));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('penny-events-updated'));
}
