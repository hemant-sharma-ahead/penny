import type { Account } from '@/core/db/types';
import { PAYMENT_MODES, isPaymentModeDisabled } from './paymentModes';

interface PaymentModeChipsProps {
  value: string;
  onChange: (mode: string) => void;
  selectedAccount?: Account | undefined;
}

/** Horizontal, scrollable payment-mode selector. Disables modes incompatible with the account. */
export function PaymentModeChips({ value, onChange, selectedAccount }: PaymentModeChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pt-1 pb-0.5">
      {PAYMENT_MODES.map((m) => {
        const disabled = isPaymentModeDisabled(selectedAccount, m.id);
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(value === m.id ? '' : m.id)}
            className="flex-shrink-0 flex flex-col items-center gap-1 w-[50px]"
            style={{ opacity: disabled ? 0.3 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            <span
              className="w-9 h-9 rounded-[10px] grid place-items-center flex-shrink-0"
              style={{
                backgroundColor: m.color,
                boxShadow: active && !disabled ? `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${m.color}` : undefined
              }}
            >
              <i className={`ti ${m.icon}`} style={{ fontSize: 15, color: '#fff' }} aria-hidden="true" />
            </span>
            <span className="text-[8px] font-medium leading-tight text-secondary text-center">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
