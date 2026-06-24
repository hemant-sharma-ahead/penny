import { Card, Button } from '@/components/ui';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { displayName, intervalLabel, toMonthly } from '@/core/subscriptions/format';
import type { Subscription } from '@/core/db/types';

interface ActiveSubCardProps {
  sub: Subscription;
  mode: 'open' | 'safe' | 'privacy';
  onCancel: (sub: Subscription) => void;
}

export function ActiveSubCard({ sub, mode, onCancel }: ActiveSubCardProps) {
  const monthly = toMonthly(sub.detectedAmount, sub.intervalDays);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-primary truncate">{displayName(sub.merchantCategory)}</p>
            {sub.status === 'trial' && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
                Trial
              </span>
            )}
          </div>
          <p className="text-xs text-secondary mt-0.5">
            {mode === 'open' ? formatCurrency(sub.detectedAmount) : '••••'} · {intervalLabel(sub.intervalDays)}
            {sub.intervalDays !== 30 && mode === 'open' && (
              <span className="text-tertiary"> ({formatCurrency(monthly)}/mo)</span>
            )}
          </p>
          {sub.lastChargedAt !== undefined && (
            <p className="text-xs text-tertiary mt-0.5">Last charged {formatDateShort(sub.lastChargedAt)}</p>
          )}
          {sub.status === 'trial' && sub.trialEndsAt !== undefined && (
            <p className="text-xs text-blue-500 mt-0.5">Trial may end {formatDateShort(sub.trialEndsAt)}</p>
          )}
        </div>
        <Button variant="secondary" size="sm" className="flex-shrink-0" onClick={() => onCancel(sub)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
