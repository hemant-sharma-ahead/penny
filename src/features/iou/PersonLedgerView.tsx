import type { LedgerEntry, Person } from '@/core/db/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { Modal, Button, Badge } from '@/components/ui';
import { ListRow, DueDateBadge } from '@/components/shared';
import { STATUS, tint } from '@/lib/statusColors';
import type { PrivacyMode } from '@/context/PrivacyContext';
import { isSettled } from '@/core/iou/ledger';

interface PersonLedgerViewProps {
  person: Person;
  /** Entries for this person, sorted newest-first. */
  entries: LedgerEntry[];
  net: number;
  mode: PrivacyMode;
  nowMs: number;
  onAddEntry: () => void;
  onSettle: () => void;
  onEditPerson: () => void;
  onEditEntry: (entry: LedgerEntry) => void;
  onDeleteEntry: (id: string) => void;
  onClose: () => void;
}

function entryLabel(e: LedgerEntry): string {
  if (e.kind === 'settlement') return e.settleDirection === 'you_paid_them' ? 'You paid' : 'They paid you';
  return e.kind === 'lent' ? 'You lent' : 'You borrowed';
}

function entryColor(e: LedgerEntry): string {
  if (e.kind === 'settlement') return STATUS.neutral;
  return e.kind === 'lent' ? STATUS.success : STATUS.danger;
}

export function PersonLedgerView({
  person,
  entries,
  net,
  mode,
  nowMs,
  onAddEntry,
  onSettle,
  onEditPerson,
  onEditEntry,
  onDeleteEntry,
  onClose
}: PersonLedgerViewProps) {
  const settled = isSettled(net);
  const headColor = settled ? STATUS.neutral : net > 0 ? STATUS.success : STATUS.danger;
  const headLabel = settled ? 'All settled up' : net > 0 ? `${person.name} owes you` : `You owe ${person.name}`;
  const headAmount = mode === 'open' ? formatCurrency(Math.abs(net)) : '••••';

  return (
    <Modal
      onClose={onClose}
      title={person.name}
      scrollable
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" icon="ti-plus" onClick={onAddEntry} className="flex-1">
            Add entry
          </Button>
          <Button variant="primary" icon="ti-check" onClick={onSettle} className="flex-1">
            Settle up
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-tertiary">{headLabel}</p>
            {!settled && (
              <p className="text-2xl font-bold" style={{ color: headColor }}>
                {headAmount}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onEditPerson}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-tertiary hover:bg-surface-2"
            aria-label="Edit person"
          >
            <i className="ti ti-pencil" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {entries.map((e) => {
            const color = entryColor(e);
            const linked = !!e.linkedTxnId;
            // Manual lent/borrowed entries are editable (editing re-syncs any linked transaction).
            // Expense-origin entries are owned by their expense — edit there; settlements aren't edited.
            const editable = e.kind !== 'settlement' && e.origin !== 'expense';
            return (
              <div
                key={e.id}
                className={`rounded-xl px-3 py-2 bg-surface-2 ${editable ? 'cursor-pointer' : ''}`}
                onClick={editable ? () => onEditEntry(e) : undefined}
              >
                <ListRow
                  icon={
                    e.kind === 'settlement'
                      ? 'ti-check'
                      : e.kind === 'lent'
                        ? 'ti-arrow-up-right'
                        : 'ti-arrow-down-left'
                  }
                  iconColor={color}
                  iconBg={tint(color)}
                  iconSize="sm"
                  align="center"
                  title={
                    <p className="text-sm font-medium text-primary truncate">
                      {e.description?.trim() || entryLabel(e)}
                    </p>
                  }
                  subtitle={
                    <p className="text-xs text-tertiary flex items-center gap-1.5">
                      <span>
                        {entryLabel(e)} · {formatDateShort(e.date)}
                      </span>
                      {linked && <Badge label="in account" color={STATUS.info} size="sm" />}
                    </p>
                  }
                  right={
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color }}>
                        {mode === 'open' ? formatCurrency(e.amount) : '••••'}
                      </p>
                      {e.dueDate !== undefined && e.kind !== 'settlement' && (
                        <DueDateBadge dueDateMs={e.dueDate} nowMs={nowMs} />
                      )}
                      {!editable && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onDeleteEntry(e.id);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-tertiary hover:bg-surface"
                          aria-label="Delete entry"
                        >
                          <i className="ti ti-trash text-xs" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
