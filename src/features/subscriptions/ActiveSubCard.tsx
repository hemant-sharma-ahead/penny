import { Card, Button, Badge, Banner } from '@/components/ui';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { daysBetween } from '@/lib/date';
import { STATUS } from '@/lib/statusColors';
import { displayName, intervalLabel, toAnnual, nextRenewal, isDormant } from '@/core/subscriptions/format';
import type { Subscription } from '@/core/db/types';

interface ActiveSubCardProps {
  sub: Subscription;
  nowMs: number;
  mode: 'open' | 'safe' | 'privacy';
  onCancel: (sub: Subscription) => void;
}

export function ActiveSubCard({ sub, nowMs, mode, onCancel }: ActiveSubCardProps) {
  const annual = toAnnual(sub.detectedAmount, sub.intervalDays);
  const renewMs = nextRenewal(sub, nowMs);
  const dormant = isDormant(sub, nowMs);
  const money = (n: number) => (mode === 'open' ? formatCurrency(n) : '••••');

  const renewLabel = (() => {
    if (renewMs === null) return null;
    const d = daysBetween(nowMs, renewMs);
    if (d <= 0) return 'Renews today';
    if (d === 1) return 'Renews tomorrow';
    return `Renews in ${d} days · ${formatDateShort(renewMs)}`;
  })();

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-primary truncate">{displayName(sub.merchantCategory)}</p>
            {sub.status === 'trial' && (
              <span className="flex-shrink-0">
                <Badge label="Trial" color={STATUS.info} size="sm" />
              </span>
            )}
          </div>
          <p className="text-xs text-secondary mt-0.5">
            {money(sub.detectedAmount)} · {intervalLabel(sub.intervalDays)}
            {mode === 'open' && <span className="text-tertiary"> · {formatCurrency(annual)}/yr</span>}
          </p>
          {renewLabel && <p className="text-xs text-tertiary mt-0.5">{renewLabel}</p>}
          {sub.status === 'trial' && sub.trialEndsAt !== undefined && (
            <p className="text-xs text-info mt-0.5">Trial may end {formatDateShort(sub.trialEndsAt)}</p>
          )}
        </div>
        <Button variant="secondary" size="sm" className="flex-shrink-0" onClick={() => onCancel(sub)}>
          Cancel
        </Button>
      </div>

      {dormant && sub.lastChargedAt !== undefined && (
        <Banner variant="warning" icon="ti-zzz">
          Looks unused — last charged {formatDateShort(sub.lastChargedAt)}. Cancelling saves{' '}
          {mode === 'open' ? formatCurrency(annual) : '••••'}/yr.
        </Banner>
      )}
    </Card>
  );
}
