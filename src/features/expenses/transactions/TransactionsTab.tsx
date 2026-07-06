import { formatCurrency } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import type { Account, Expense, ExpenseCategory } from '@/core/db/types';
import { isHiddenInSafeMode } from '@/core/expenses/categoryGroups';
import { SwipeableRow } from './SwipeableRow';

interface TransactionsTabProps {
  grouped: { label: string; items: Expense[] }[];
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  shouldMask: (sensitive: boolean | undefined) => boolean;
  onEdit: (expense: Expense) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (expense: Expense) => void;
  /** Share-later (Track E): opens the group picker for an as-yet-unshared expense. */
  onShare?: ((expense: Expense) => void) | undefined;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function TransactionsTab({
  grouped,
  categoryMap,
  accountMap,
  shouldMask,
  onEdit,
  onDelete,
  onDuplicate,
  onShare,
  selectMode = false,
  selectedIds,
  onToggleSelect
}: TransactionsTabProps) {
  if (grouped.length === 0) {
    return (
      <div className="p-10 text-center">
        <i className="ti ti-wallet text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
        <p className="text-sm mt-3 text-tertiary">No transactions yet. Tap + to add one.</p>
      </div>
    );
  }

  return (
    <div>
      {grouped.map((group, gi) => (
        <div key={group.label}>
          {/* Day header — shifted right so the rail runs continuously to its left */}
          <div className="relative pl-10 pr-4 pt-4 pb-1.5">
            <span
              className="absolute w-px"
              style={{ left: 20, top: gi === 0 ? '55%' : 0, bottom: 0, backgroundColor: 'var(--color-border)' }}
              aria-hidden="true"
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">{group.label}</span>
          </div>

          {group.items.map((txn, ti) => {
            const txnType = txn.type ?? 'expense';
            const cat = categoryMap.get(txn.categoryId);
            const accent =
              txnType === 'income' ? '#10b981' : txnType === 'transfer' ? '#3b82f6' : (cat?.color ?? '#6b7280');
            const icon =
              txnType === 'income'
                ? 'ti-arrow-up-circle'
                : txnType === 'transfer'
                  ? 'ti-arrows-exchange'
                  : (cat?.icon ?? 'ti-dots');
            const amountColor = txnType === 'income' ? '#10b981' : txnType === 'expense' ? '#ef4444' : '#3b82f6';
            const prefix = txnType === 'income' ? '+' : txnType === 'transfer' ? '' : '-';
            const acc = txn.accountId ? accountMap.get(txn.accountId) : undefined;
            const catLabel =
              txnType === 'transfer' ? 'Transfer' : (cat?.name ?? (txnType === 'income' ? 'Income' : 'Uncategorized'));
            const subtitle = acc?.name ? `${catLabel} · ${acc.name}` : catLabel;
            const isSel = selectedIds?.has(txn.id) ?? false;
            const masked = shouldMask(cat && isHiddenInSafeMode(cat));

            // icon + title/meta + amount — shared between modes
            const body = (
              <>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${accent}1f` }}
                >
                  <i className={`ti ${icon}`} style={{ fontSize: 18, color: accent }} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-primary">
                    {txn.description}
                    {txn.receiptDataUrl && (
                      <i
                        className="ti ti-paperclip ml-1 text-tertiary"
                        style={{ fontSize: 12 }}
                        aria-label="Has receipt"
                      />
                    )}
                    {(txn.shareWith?.length ?? 0) > 0 && (
                      <i
                        className="ti ti-users-group ml-1"
                        style={{ fontSize: 12, color: 'var(--color-primary)' }}
                        aria-label="Shared with a group"
                      />
                    )}
                  </p>
                  <p className="text-[11.5px] text-tertiary truncate mt-0.5">
                    {subtitle}
                    {txn.hashtags.map((tag) => (
                      <span key={tag} className="ml-1.5 font-medium" style={{ color: 'var(--color-primary)' }}>
                        #{tag}
                      </span>
                    ))}
                  </p>
                </div>
                <span
                  className="text-sm font-bold tabular-nums flex-shrink-0 ml-2"
                  style={{ color: masked ? 'var(--color-text-primary)' : amountColor }}
                >
                  {masked ? '••••' : `${prefix}${formatCurrency(txn.amount)}`}
                </span>
              </>
            );

            // Select mode: flat tappable row with a checkbox; no rail.
            if (selectMode) {
              return (
                <button
                  key={txn.id}
                  onClick={() => onToggleSelect?.(txn.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={isSel ? { backgroundColor: 'var(--color-surface-secondary)' } : undefined}
                >
                  <i
                    className={`ti ${isSel ? 'ti-circle-check-filled' : 'ti-circle'} flex-shrink-0`}
                    style={{ fontSize: 20, color: isSel ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
                    aria-hidden="true"
                  />
                  {body}
                </button>
              );
            }

            // Normal mode: timeline rail + dot live INSIDE the row (above the swipe row's bg);
            // stacked per-row segments form a continuous rail. Swipe-left → Copy/Delete; tap → edit.
            const isLastRowOverall = gi === grouped.length - 1 && ti === group.items.length - 1;
            const isShared = (txn.shareWith?.length ?? 0) > 0;
            const actions = [
              ...(onDuplicate
                ? [{ icon: 'ti-copy', label: 'Copy', color: STATUS.info, onClick: () => onDuplicate(txn) }]
                : []),
              ...(onShare && txnType === 'expense' && !isShared
                ? [
                    {
                      icon: 'ti-users-group',
                      label: 'Share',
                      color: 'var(--color-primary)',
                      onClick: () => onShare(txn)
                    }
                  ]
                : []),
              ...(onDelete
                ? [{ icon: 'ti-trash', label: 'Delete', color: STATUS.danger, onClick: () => onDelete(txn.id) }]
                : [])
            ];
            return (
              <SwipeableRow key={txn.id} actions={actions} onTap={() => onEdit(txn)}>
                <div
                  className="relative w-full flex items-center gap-3 pl-10 pr-4 py-3 text-left"
                  style={
                    isShared
                      ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)' }
                      : undefined
                  }
                >
                  {/* rail segment for this row */}
                  <span
                    className="absolute w-px"
                    style={{
                      left: 20,
                      top: 0,
                      bottom: isLastRowOverall ? '50%' : 0,
                      backgroundColor: 'var(--color-border)'
                    }}
                    aria-hidden="true"
                  />
                  {/* dot on the rail */}
                  <span
                    className="absolute w-2.5 h-2.5 rounded-full"
                    style={{ left: 15, top: '50%', transform: 'translateY(-50%)', backgroundColor: accent }}
                    aria-hidden="true"
                  />
                  {body}
                </div>
              </SwipeableRow>
            );
          })}
        </div>
      ))}
    </div>
  );
}
