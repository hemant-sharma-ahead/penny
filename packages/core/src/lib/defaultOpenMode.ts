/**
 * Pure helpers for the "3-day default-to-Open" Settings preference (punch-list item 12) — arming
 * duration, whether an armed window is still live, and the countdown copy/urgency shown by the
 * Settings "Frequent" card banner (`apps/mobile/src/features/settings/SettingsPage.tsx`).
 *
 * Platform-agnostic on purpose: the actual persisted `defaultOpenArmedUntil` epoch-ms lives in mobile's
 * `SettingsContext.tsx` (an AsyncStorage-backed preference, not `EncryptedRepository` data — this is a
 * device-local UI setting), and `PrivacyContext.tsx` uses `isDefaultOpenArmed()` to decide whether to
 * suppress its existing AppState background-revert-to-Safe effect. Kept here (not inlined in either
 * file) so both can share one definition of "armed" and one countdown-formatting rule, and so the rule
 * is unit-testable without pulling in React/AsyncStorage/RN at all.
 */

/** Arming window: 3 days from the moment "Default to Open mode" is confirmed. */
export const DEFAULT_OPEN_ARM_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** True while `armedUntil` is set and still in the future relative to `now`. */
export function isDefaultOpenArmed(armedUntil: number | null | undefined, now: number = Date.now()): boolean {
  return typeof armedUntil === 'number' && armedUntil > now;
}

/** Which tint the countdown pill should use — neutral/green while >24h remain, amber once under. */
export function getDefaultOpenCountdownUrgency(armedUntil: number, now: number = Date.now()): 'days' | 'hours' {
  return armedUntil - now >= DAY_MS ? 'days' : 'hours';
}

/**
 * "N days left" while more than 24h remain (whole days, floored — matches the plain-language "about N
 * days" a countdown that isn't live-ticking should give), then switches to "N hours left" (ceiled, floor
 * of 1) once under a day. Callers should treat a non-positive/expired `armedUntil` as already-expired
 * (`isDefaultOpenArmed` returning false) rather than calling this — it never returns "0 ... left".
 */
export function getDefaultOpenCountdownLabel(armedUntil: number, now: number = Date.now()): string {
  const remainingMs = Math.max(0, armedUntil - now);
  if (remainingMs >= DAY_MS) {
    const days = Math.floor(remainingMs / DAY_MS);
    return `${days} day${days === 1 ? '' : 's'} left`;
  }
  const hours = Math.max(1, Math.ceil(remainingMs / HOUR_MS));
  return `${hours} hour${hours === 1 ? '' : 's'} left`;
}
