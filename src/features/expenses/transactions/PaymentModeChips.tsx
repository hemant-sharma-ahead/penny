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
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {PAYMENT_MODES.map((m) => {
        const disabled = isPaymentModeDisabled(selectedAccount, m.id);
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(value === m.id ? '' : m.id)}
            className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-[58px]"
            style={{
              opacity: disabled ? 0.3 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
              borderColor: active && !disabled ? m.color : 'transparent',
              backgroundColor: 'var(--color-surface-secondary)'
            }}
          >
            <i className={`ti ${m.icon}`} style={{ fontSize: 18, color: m.color }} aria-hidden="true" />
            <span className="text-[9px] font-medium leading-tight text-secondary">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
