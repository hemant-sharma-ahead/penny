import { Badge } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { daysUntil } from '@/lib/date';
import { nowMs } from '~/features/portfolio/holdings/shared/helpers';

// Small pill showing a validity/expiry date (RC, insurance, PUCC, fitness) with
// colour coding: red = expired, amber = within 30 days, green = valid.
export function ValidityBadge({ label, upto }: { label: string; upto: number }) {
  const theme = useThemeColors();
  const days = daysUntil(upto, nowMs());
  const expired = days < 0;
  const soon = days >= 0 && days <= 30;
  const color = expired ? theme.danger : soon ? theme.warning : theme.success;
  const text = expired
    ? `${label} expired`
    : `${label} · ${new Date(upto).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}`;
  return <Badge label={text} color={color} size="sm" />;
}
