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

export function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(epochMs)
  );
}

export function formatDateShort(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(epochMs));
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
