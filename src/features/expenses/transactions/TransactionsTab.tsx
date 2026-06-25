import { formatCurrency } from '@/lib/formatters';
import type { Account, Expense, ExpenseCategory } from '@/core/db/types';

interface TransactionsTabProps {
  grouped: { label: string; items: Expense[] }[];
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  mode: 'open' | 'safe' | 'privacy';
  onEdit: (expense: Expense) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function TransactionsTab({
  grouped,
  categoryMap,
  accountMap,
  mode,
  onEdit,
  selectMode = false,
  selectedIds,
  onToggleSelect
}: TransactionsTabProps) {
  return (
    <div>
      {grouped.length === 0 ? (
        <div className="p-10 text-center">
          <i className="ti ti-wallet text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
          <p className="text-sm mt-3 text-tertiary">No transactions yet. Tap + to add one.</p>
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.label}>
            <div className="px-4 py-2 bg-surface-2 border-b border-theme">
              <span className="text-xs font-medium uppercase tracking-wide text-tertiary">{group.label}</span>
            </div>
            {group.items.map((txn) => {
              const txnType = txn.type ?? 'expense';
              const cat = categoryMap.get(txn.categoryId);
              const iconColor =
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
              const pmLabel = txn.paymentMode
                ? ({ cash: 'Cash', upi: 'UPI', card: 'Card', net: 'Net', wallet: 'Wallet' }[txn.paymentMode] ??
                  txn.paymentMode)
                : undefined;
              const accLine = [acc?.name, pmLabel ? `(${pmLabel})` : undefined].filter(Boolean).join(' ');
              const isSel = selectedIds?.has(txn.id) ?? false;
              return (
                <button
                  key={txn.id}
                  onClick={() => (selectMode ? onToggleSelect?.(txn.id) : onEdit(txn))}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-theme"
                  style={selectMode && isSel ? { backgroundColor: 'var(--color-surface-secondary)' } : undefined}
                >
                  {selectMode && (
                    <i
                      className={`ti ${isSel ? 'ti-circle-check-filled' : 'ti-circle'} flex-shrink-0`}
                      style={{ fontSize: 20, color: isSel ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${iconColor}18` }}
                  >
                    <i className={`ti ${icon}`} style={{ fontSize: 18, color: iconColor }} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-primary">{txn.description}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {txnType === 'expense' && cat && <span className="text-[10px] text-tertiary">{cat.name}</span>}
                      {txnType === 'income' && (
                        <span className="text-[10px] font-medium" style={{ color: '#10b981' }}>
                          Income
                        </span>
                      )}
                      {txnType === 'transfer' && (
                        <span className="text-[10px] font-medium" style={{ color: '#3b82f6' }}>
                          Transfer
                        </span>
                      )}
                      {txn.hashtags.map((tag) => (
                        <span key={tag} className="text-[10px] font-medium" style={{ color: 'var(--color-primary)' }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 ml-2 gap-0.5">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: mode === 'open' ? amountColor : 'var(--color-text-primary)' }}
                    >
                      {mode === 'open' ? `${prefix}${formatCurrency(txn.amount)}` : '••••'}
                    </span>
                    {accLine && (
                      <span className="text-[9px] text-tertiary text-right leading-tight max-w-[90px] truncate">
                        {accLine}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
