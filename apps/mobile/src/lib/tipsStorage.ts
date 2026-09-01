// "Did You Know" tips (2026-08-16) — AsyncStorage persistence for Tier 1 (contextual nudges, dismissed
// forever once acted on/closed) and Tier 2's Home daily card (one curated tip revealed per day, stops
// once all have been shown). Same `getJSON`/`setJSON` convention every other dismiss/seen tracker in
// this app already uses (`penny_vacation_note_dismissed`, `penny_recurring_due_dismissed`, etc.).
import { getItem, setItem, getJSON, setJSON } from './storage';

const DISMISSED_KEY = 'penny_tips_dismissed';
const DAILY_STATE_KEY = 'penny_daily_tip_state';
const DAILY_ENABLED_KEY = 'penny_daily_tip_enabled';

// ── Tier 1 — contextual nudges, dismissed once, forever ─────────────────────────────────────────────

export async function isTipDismissed(id: string): Promise<boolean> {
  const list = await getJSON<string[]>(DISMISSED_KEY);
  return !!list?.includes(id);
}

/** Marks a nudge permanently suppressed — call on the ✕ tap, AND on the caller's own "the user just did
 *  the hinted thing" moment (e.g. actually applying a bulk hashtag), per the design's "dismissed OR
 *  acted upon" rule. */
export async function dismissTip(id: string): Promise<void> {
  const list = (await getJSON<string[]>(DISMISSED_KEY)) ?? [];
  if (!list.includes(id)) await setJSON(DISMISSED_KEY, [...list, id]);
}

// ── Tier 2 — Home's daily card ───────────────────────────────────────────────────────────────────────

export interface DailyTipState {
  /** How many of the curated tips have been revealed so far, in order — also this session's read
   *  position once "today's" one has been revealed (never advances further within the same day). */
  revealedCount: number;
  /** `YYYY-MM-DD` of the last time `revealedCount` advanced — compared against "today" to decide whether
   *  a fresh reveal is due. */
  lastRevealedDateKey: string;
  /** `YYYY-MM-DD` the card was last dismissed on — the card stays hidden for the remainder of that date
   *  only; a new day always gets a fresh chance to show (or reveal) regardless of a prior dismiss. */
  dismissedDateKey: string;
}

const DEFAULT_DAILY_STATE: DailyTipState = { revealedCount: 0, lastRevealedDateKey: '', dismissedDateKey: '' };

export async function getDailyTipState(): Promise<DailyTipState> {
  return (await getJSON<DailyTipState>(DAILY_STATE_KEY)) ?? DEFAULT_DAILY_STATE;
}

export async function setDailyTipState(state: DailyTipState): Promise<void> {
  await setJSON(DAILY_STATE_KEY, state);
}

/** The Discover Penny toggle (default ON when never set) — turning it off just stops the card from
 *  rendering; `revealedCount` still advances in the background, so re-enabling later resumes where it
 *  left off rather than restarting the sequence. */
export async function getDailyTipEnabled(): Promise<boolean> {
  const raw = await getItem(DAILY_ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

export async function setDailyTipEnabled(enabled: boolean): Promise<void> {
  await setItem(DAILY_ENABLED_KEY, String(enabled));
}
