import { STATUS, tint } from './statusColors';

/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Primitives ─────────────────────────────────────────────────────────────

/** Midnight (local) of the given instant. */
export function startOfToday(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days from today (midnight) until `epochMs`; negative if in the past. */
export function daysUntil(epochMs: number, nowMs: number = Date.now()): number {
  return Math.ceil((epochMs - startOfToday(nowMs)) / DAY_MS);
}

/** Whole days between two instants (b − a). */
export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY_MS);
}

// ── Keys (YYYY-MM-DD / YYYY-MM) ──────────────────────────────────────────────

/** `YYYY-MM-DD` key for an instant — also the value format for <input type="date">. */
export function toDateKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Alias of {@link toDateKey} for the date-input use-site. */
export const epochToDateInput = toDateKey;

/** `HH:mm` (24-hour) key for an instant — the value format for a time-input use-site. */
export function toTimeKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Alias of {@link toTimeKey} for the time-input use-site. */
export const epochToTimeInput = toTimeKey;

/** Combines a `YYYY-MM-DD` date key and an `HH:mm` time key into an epoch timestamp. */
export function combineDateTime(dateStr: string, timeStr: string): number {
  const base = new Date(`${dateStr}T00:00:00`);
  if (isNaN(base.getTime())) return Date.now();
  const [h, m] = timeStr.split(':').map(Number);
  base.setHours(h || 0, m || 0, 0, 0);
  return base.getTime();
}

/**
 * Convert a date-input value ('YYYY-MM-DD') to an epoch timestamp that includes the current
 * time-of-day — so multiple entries on the same day order by when they were entered, not by a
 * shared midnight. When editing, pass the record's existing timestamp: if the calendar day is
 * unchanged, it's preserved verbatim (so its position doesn't jump); if the day changed, the new
 * day takes the current time-of-day.
 */
export function dateInputToEpoch(dateStr: string, existingMs?: number): number {
  if (existingMs !== undefined && toDateKey(existingMs) === dateStr) return existingMs;
  const base = new Date(dateStr);
  if (isNaN(base.getTime())) return Date.now();
  const now = new Date();
  base.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return base.getTime();
}

/** `YYYY-MM` month key. */
export function toMonthYearKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Shifts a `YYYY-MM` key by `delta` months. */
export function offsetMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y ?? 0, (mo ?? 1) - 1 + delta, 1);
  return toMonthYearKey(d);
}

/** Start (inclusive) / end (exclusive) epoch bounds for a `YYYY-MM` key, in local time. */
export function monthBounds(monthKey: string): { start: number; end: number } {
  const [y, m] = monthKey.split('-').map(Number);
  const year = y ?? new Date().getFullYear();
  const monthIndex = (m ?? 1) - 1;
  return { start: new Date(year, monthIndex, 1).getTime(), end: new Date(year, monthIndex + 1, 1).getTime() };
}

/** Start (inclusive) / end (exclusive) epoch bounds for a calendar year, in local time. */
export function yearBounds(year: number): { start: number; end: number } {
  return { start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() };
}

/** Start (inclusive, epoch 0) / end (exclusive, one day past `nowMs`) bounds for "all time" — the
 *  lifetime-scoped counterpart of {@link monthBounds}/{@link yearBounds}, added 2026-08-16 for
 *  Analytics' All Time view. `start: 0` deliberately means "no txn before this account existed" rather
 *  than the true earliest transaction date, so `computeCashFlowSummary`'s "Initial" column reads as 0
 *  for all time (matching that it's a lifetime figure, not a mid-history snapshot). */
export function allTimeBounds(nowMs: number = Date.now()): { start: number; end: number } {
  return { start: 0, end: nowMs + DAY_MS };
}

// ── Labels ───────────────────────────────────────────────────────────────────

/** Relative day label for a date key: "Today" / "Yesterday" / "5 Jan 2026". */
export function dateLabel(key: string, nowMs: number = Date.now()): string {
  if (key === toDateKey(nowMs)) return 'Today';
  if (key === toDateKey(nowMs - DAY_MS)) return 'Yesterday';
  const [y, m, d] = key.split('-');
  const mLabel = m ? MONTHS[(parseInt(m, 10) - 1) % 12] : '';
  return `${d ?? ''} ${mLabel} ${y ?? ''}`.trim();
}

/** "Jan 2026" label for a `YYYY-MM` key. */
export function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return `${MONTHS[(parseInt(mo ?? '1', 10) - 1) % 12] ?? ''} ${y ?? ''}`.trim();
}

/**
 * Month-scrub-bar chip label (item 43, docs/plans/real-device-testing-pass.md Phase 5). Always
 * "Mon YYYY" (e.g. "Aug 2026", "Jul 2025") — item 13b (2026-08-29,
 * `docs/mockups/proposals/punch-list-batch-v1.html` §1) deliberately reverses the prior v5
 * mockup's decision to omit the year for the current calendar year: the scrub strip spans a
 * full year+ of history, so a chip's format silently changing the moment a year boundary is
 * crossed while scrolling read as inconsistent rather than economical ("Jan" sitting right next
 * to "Dec 2025"). No longer needs a "now" reference at all, since the year is never conditionally
 * omitted anymore.
 */
export function monthChipLabel(m: string): string {
  const [y, mo] = m.split('-');
  const monthName = MONTHS[(parseInt(mo ?? '1', 10) - 1) % 12] ?? '';
  const year = parseInt(y ?? '0', 10);
  return `${monthName} ${year}`;
}

export function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(epochMs)
  );
}

export function formatDateShort(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(epochMs));
}

export function formatTime(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(
    new Date(epochMs)
  );
}

/** "12 Aug 2026, 2:30 PM" — full date (with year) + time in one string. Neither `formatDate` (no time)
 *  nor `formatDateShort` (no year, no time) is enough on its own for a record whose actual moment
 *  matters and can plausibly span several years (e.g. an "all time" SMS scan) — using either alone
 *  silently loses real information the source data (the original SMS) still carries. */
export function formatDateTime(epochMs: number): string {
  return `${formatDate(epochMs)}, ${formatTime(epochMs)}`;
}

/** Formats a month count as a compact duration, e.g. 27 → "2y 3m", 12 → "1y", 5 → "5m". */
export function formatMonthsDuration(totalMonths: number): string {
  const y = Math.floor(totalMonths / 12);
  const mo = totalMonths % 12;
  if (y === 0) return `${mo}m`;
  if (mo === 0) return `${y}y`;
  return `${y}y ${mo}m`;
}

// ── Due-date status ───────────────────────────────────────────────────────────

/**
 * Buckets a due date into a status text + color (token-based, theme-aware) for renewal/expiry badges.
 * @param warningDays days-remaining threshold for the urgent (danger) state. Default 7.
 * @param expiredLabel label when past due. Default "Xd overdue"; pass "Expired" for insurance.
 */
export function dueDateInfo(
  dueDateMs: number,
  nowMs: number,
  warningDays = 7,
  expiredLabel?: string
): { text: string; color: string; bg: string } {
  const days = Math.ceil((dueDateMs - nowMs) / DAY_MS);
  if (days < 0) return { text: expiredLabel ?? `${-days}d overdue`, color: STATUS.danger, bg: tint(STATUS.danger) };
  if (days === 0) return { text: 'Due today', color: STATUS.warning, bg: tint(STATUS.warning) };
  if (days <= warningDays) return { text: `${days}d left`, color: STATUS.danger, bg: tint(STATUS.danger) };
  if (days <= 30) return { text: `${days}d left`, color: STATUS.warning, bg: tint(STATUS.warning) };
  return { text: formatDateShort(dueDateMs), color: STATUS.neutral, bg: 'var(--color-surface-secondary)' };
}

// ─── Age from date of birth (Track 2) ─────────────────────────────────────────
// `dob` is an ISO date string (YYYY-MM-DD). deriveAge is exact (for FIRE/tax/EPF/NPS);
// deriveAgeBand returns a 5-year band — the ONLY form of DOB allowed in AI context.

/** Exact age in whole years from an ISO `YYYY-MM-DD` date of birth. Returns null if unparseable. */
export function deriveAge(dobIso: string, nowMs: number = Date.now()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobIso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const now = new Date(nowMs);
  let age = now.getFullYear() - year;
  // Subtract a year if this year's birthday hasn't happened yet.
  const monthDiff = now.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) age--;
  return age >= 0 && age < 150 ? age : null;
}

/** 5-year age band (e.g. "30–34") for AI context — never the exact age. Returns null if unparseable. */
export function deriveAgeBand(dobIso: string, nowMs: number = Date.now()): string | null {
  const age = deriveAge(dobIso, nowMs);
  if (age === null) return null;
  const start = Math.floor(age / 5) * 5;
  return `${start}–${start + 4}`;
}
