const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toDateKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateLabel(key: string): string {
  const todayKey = toDateKey(Date.now());
  const yesterdayKey = toDateKey(Date.now() - 86_400_000);
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  const [y, m, d] = key.split('-');
  const mLabel = m ? (MONTHS_SHORT[(parseInt(m, 10) - 1) % 12] ?? '') : '';
  return `${d ?? ''} ${mLabel} ${y ?? ''}`.trim();
}

export function offsetMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y ?? 0, (mo ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return `${MONTHS_SHORT[(parseInt(mo ?? '1', 10) - 1) % 12] ?? ''} ${y ?? ''}`.trim();
}
