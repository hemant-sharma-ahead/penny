import { formatDateShort } from './formatters';

export function dueDateInfo(
  dueDateMs: number,
  nowMs: number,
  warningDays = 7,
  expiredLabel?: string
): { text: string; color: string; bg: string } {
  const days = Math.ceil((dueDateMs - nowMs) / 86_400_000);
  if (days < 0) return { text: expiredLabel ?? `${-days}d overdue`, color: '#ef4444', bg: '#fef2f2' };
  if (days === 0) return { text: 'Due today', color: '#f59e0b', bg: '#fffbeb' };
  if (days <= warningDays) return { text: `${days}d left`, color: '#ef4444', bg: '#fef2f2' };
  if (days <= 30) return { text: `${days}d left`, color: '#f59e0b', bg: '#fffbeb' };
  return { text: formatDateShort(dueDateMs), color: '#64748b', bg: 'var(--color-surface-secondary)' };
}
