import type { IpoStatus } from '@/core/ipo/ipoTypes';
import { DAY_MS } from '@/lib/date';

export const IPO_SUBTAB_ORDER: IpoStatus[] = ['upcoming', 'open', 'closed', 'listed'];

export const IPO_SUBTAB_META: Record<IpoStatus, { label: string; icon: string; emptyMessage: string }> = {
  upcoming: { label: 'Upcoming', icon: 'ti-calendar-event', emptyMessage: 'No upcoming IPOs right now.' },
  open: { label: 'Open', icon: 'ti-door-enter', emptyMessage: 'No IPOs are currently open for subscription.' },
  closed: { label: 'Closed', icon: 'ti-clock-hour-4', emptyMessage: 'No closed IPOs awaiting listing.' },
  listed: { label: 'Listed', icon: 'ti-list-check', emptyMessage: 'No recently listed IPOs.' }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatLastUpdated(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Updated just now';
  return `Updated ${new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

export function formatIpoDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function currentFyLabel(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const s = m >= 4 ? y : y - 1;
  return `FY ${s}-${String(s + 1).slice(2)}`;
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const close = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  close.setHours(0, 0, 0, 0);
  const diff = Math.ceil((close.getTime() - today.getTime()) / DAY_MS);
  return diff >= 0 ? diff : null;
}
