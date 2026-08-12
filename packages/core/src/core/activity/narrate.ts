// Pure, local "Chip voice" narration of activity — no AI, no network. Real Chip AI is Phase 2.
import type { ActivityLog } from '@/core/db/types';
import { DAY_MS, startOfToday } from '@/lib/date';

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Real user changes only — drop checkpoints / system markers from stats + narration. */
function isUserChange(e: ActivityLog): boolean {
  return e.entityType !== 'system' && e.action !== 'CHECKPOINT';
}

function humanJoin(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A short, friendly summary of today's changes, in Chip's voice. */
export function narrateDay(entries: ActivityLog[], nowMs: number = Date.now()): string {
  const since = startOfToday(nowMs);
  const todays = entries.filter((e) => e.timestamp >= since && isUserChange(e));
  if (todays.length === 0) return "No changes today — your money's taking a breather. 🌙";

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let moved = 0;
  let imported = 0;
  for (const e of todays) {
    if (e.action === 'CREATE') created += 1;
    else if (e.action === 'UPDATE') updated += 1;
    else if (e.action === 'DELETE' || e.action === 'BULK_DELETE' || e.action === 'UNDO_IMPORT')
      deleted += e.entityCount ?? 1;
    else if (e.action === 'BULK_MOVE') moved += e.entityCount ?? 1;
    else if (e.action === 'IMPORT') imported += e.entityCount ?? 1;
    else if (e.action === 'BULK_UPDATE') updated += e.entityCount ?? 1;
  }

  const bits: string[] = [];
  if (created) bits.push(`added ${created} thing${created === 1 ? '' : 's'}`);
  if (imported) bits.push(`imported ${imported} transaction${imported === 1 ? '' : 's'}`);
  if (updated) bits.push(`tweaked ${updated}`);
  if (moved) bits.push(`reorganised ${moved} transaction${moved === 1 ? '' : 's'}`);
  if (deleted) bits.push(`cleared out ${deleted}`);

  const total = todays.length;
  const vibe = total >= 8 ? 'Busy money day! ' : total >= 3 ? 'Nice and steady. ' : 'Just a light touch today. ';
  return `${vibe}You ${humanJoin(bits)}.`;
}

export interface WeeklyStats {
  total: number;
  busiestDay: string | null;
  added: number;
  removed: number;
}

/** Last-7-days stats for the Story tab grid, computed entirely on-device. Null if no activity. */
export function weeklyStats(entries: ActivityLog[], nowMs: number = Date.now()): WeeklyStats | null {
  const since = startOfToday(nowMs) - 6 * DAY_MS;
  const week = entries.filter((e) => e.timestamp >= since && isUserChange(e));
  if (week.length === 0) return null;

  const byWeekday = new Map<number, number>();
  let added = 0;
  let removed = 0;
  for (const e of week) {
    const wd = new Date(e.timestamp).getDay();
    byWeekday.set(wd, (byWeekday.get(wd) ?? 0) + 1);
    if (e.action === 'CREATE' || e.action === 'IMPORT') added += e.entityCount ?? 1;
    if (e.action === 'DELETE' || e.action === 'BULK_DELETE' || e.action === 'UNDO_IMPORT')
      removed += e.entityCount ?? 1;
  }
  const busiest = [...byWeekday.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    total: week.length,
    busiestDay: busiest ? (SHORT_DAYS[busiest[0]] ?? null) : null,
    added,
    removed
  };
}
