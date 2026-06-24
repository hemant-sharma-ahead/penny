import type { PersonalIou } from '@/core/db/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { Button, Card } from '@/components/ui';
import { ListRow, DueDateBadge } from '@/components/shared';

interface IouCardProps {
  iou: PersonalIou;
  nowMs: number;
  mode: 'open' | 'safe' | 'privacy';
  onEdit: (iou: PersonalIou) => void;
  /** When provided, renders the active variant with a "Mark settled" action. Omit for history. */
  onSettle?: (iou: PersonalIou) => void;
}

export function IouCard({ iou, nowMs, mode, onEdit, onSettle }: IouCardProps) {
  const isLent = iou.direction === 'lent';
  const accentColor = isLent ? '#10b981' : '#ef4444';
  const accentBg = isLent ? '#f0fdf4' : '#fef2f2';
  const amount = mode === 'open' ? formatCurrency(iou.amount) : '••••';

  if (!onSettle) {
    return (
      <Card onClick={() => onEdit(iou)} className="opacity-70">
        <ListRow
          icon="ti-check"
          iconColor="var(--color-text-tertiary)"
          iconBg="var(--color-surface-secondary)"
          iconSize="sm"
          align="center"
          title={<p className="text-sm font-medium truncate text-secondary">{iou.description}</p>}
          subtitle={
            <p className="text-xs text-tertiary">
              {isLent ? 'Lent' : 'Borrowed'} {formatDateShort(iou.date)}
              {iou.settledAt !== undefined && ` · settled ${formatDateShort(iou.settledAt)}`}
            </p>
          }
          right={
            <p className="text-sm font-semibold" style={{ color: accentColor }}>
              {amount}
            </p>
          }
        />
      </Card>
    );
  }

  return (
    <Card onClick={() => onEdit(iou)}>
      <ListRow
        icon={isLent ? 'ti-arrow-up' : 'ti-arrow-down'}
        iconColor={accentColor}
        iconBg={accentBg}
        iconSize="sm"
        align="center"
        title={<p className="text-sm font-semibold truncate text-primary">{iou.description}</p>}
        subtitle={
          <p className="text-xs text-tertiary">
            {isLent ? 'Lent' : 'Borrowed'} {formatDateShort(iou.date)}
            {iou.notes && ` · ${iou.notes}`}
          </p>
        }
        right={
          <>
            <p className="text-sm font-semibold" style={{ color: accentColor }}>
              {amount}
            </p>
            {iou.dueDate !== undefined && <DueDateBadge dueDateMs={iou.dueDate} nowMs={nowMs} />}
          </>
        }
      />
      <div className="mt-3 pt-3 flex justify-end border-t border-theme">
        <Button
          variant="ghost"
          size="sm"
          icon="ti-check"
          onClick={(e) => {
            e.stopPropagation();
            onSettle(iou);
          }}
          style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
        >
          Mark settled
        </Button>
      </div>
    </Card>
  );
}
