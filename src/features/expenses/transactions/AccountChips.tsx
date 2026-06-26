import type { Account } from '@/core/db/types';
import { Button } from '@/components/ui';

interface AccountChipsProps {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  showNone?: boolean;
  disabledId?: string;
  onAddAccount: () => void;
}

/** Horizontal, scrollable account selector used by the expense/income/transfer form. */
export function AccountChips({ accounts, value, onChange, showNone, disabledId, onAddAccount }: AccountChipsProps) {
  if (accounts.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon="ti-plus"
        style={{ color: 'var(--color-primary)' }}
        onClick={onAddAccount}
      >
        Add account to track balance
      </Button>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {showNone && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-[64px]"
          style={
            value === ''
              ? { borderColor: '#6b7280', backgroundColor: 'var(--color-surface-secondary)' }
              : { borderColor: 'transparent', backgroundColor: 'var(--color-surface-secondary)' }
          }
        >
          <i className="ti ti-circle-off" style={{ fontSize: 18, color: '#6b7280' }} aria-hidden="true" />
          <span className="text-[9px] font-medium leading-tight text-secondary">None</span>
        </button>
      )}
      {accounts.map((acc) => {
        const isSelected = value === acc.id;
        const isDisabled = acc.id === disabledId;
        return (
          <button
            key={acc.id}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(isSelected && showNone ? '' : acc.id)}
            className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-[64px]"
            style={{
              opacity: isDisabled ? 0.35 : 1,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              borderColor: isSelected ? acc.color : 'transparent',
              backgroundColor: 'var(--color-surface-secondary)'
            }}
          >
            <i className={`ti ${acc.icon}`} style={{ fontSize: 18, color: acc.color }} aria-hidden="true" />
            <span className="text-[9px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
              {acc.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
