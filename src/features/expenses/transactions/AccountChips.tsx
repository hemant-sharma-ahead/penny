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
    <div className="flex gap-2 overflow-x-auto pt-1 pb-0.5">
      {showNone && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="flex-shrink-0 flex flex-col items-center gap-1 w-[56px]"
        >
          <span
            className="w-9 h-9 rounded-[10px] grid place-items-center flex-shrink-0"
            style={{
              backgroundColor: '#6b7280',
              boxShadow: value === '' ? '0 0 0 2px var(--color-surface), 0 0 0 3.5px #6b7280' : undefined
            }}
          >
            <i className="ti ti-circle-off" style={{ fontSize: 15, color: '#fff' }} aria-hidden="true" />
          </span>
          <span className="text-[8px] font-medium leading-tight text-secondary text-center">None</span>
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
            className="flex-shrink-0 flex flex-col items-center gap-1 w-[56px]"
            style={{ opacity: isDisabled ? 0.35 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
          >
            <span
              className="w-9 h-9 rounded-[10px] grid place-items-center flex-shrink-0"
              style={{
                backgroundColor: acc.color,
                boxShadow: isSelected ? `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${acc.color}` : undefined
              }}
            >
              <i className={`ti ${acc.icon}`} style={{ fontSize: 15, color: '#fff' }} aria-hidden="true" />
            </span>
            <span className="text-[8px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
              {acc.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
