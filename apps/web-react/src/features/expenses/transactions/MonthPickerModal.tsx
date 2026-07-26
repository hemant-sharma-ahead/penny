import { useState } from 'react';
import { Modal } from '@/components/ui';

const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthPickerModalProps {
  value: string;
  onSelect: (m: string) => void;
  onClose: () => void;
  maxMonth?: string | undefined;
  nested?: boolean | undefined;
}

export function MonthPickerModal({ value, onSelect, onClose, maxMonth, nested }: MonthPickerModalProps) {
  const [year, setYear] = useState(() => parseInt(value.split('-')[0] ?? String(new Date().getFullYear()), 10));
  const maxYear = maxMonth
    ? parseInt(maxMonth.split('-')[0] ?? String(new Date().getFullYear()), 10)
    : new Date().getFullYear();

  return (
    <Modal onClose={onClose} title="Select Month" size="sm" nested={nested}>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setYear((y) => y - 1)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2"
        >
          <i className="ti ti-chevron-left" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
        <span className="text-base font-semibold text-primary">{year}</span>
        <button
          onClick={() => setYear((y) => y + 1)}
          disabled={year >= maxYear}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2 disabled:opacity-30"
        >
          <i className="ti ti-chevron-right" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {MONTH_LABELS_SHORT.map((label, idx) => {
          const m = `${year}-${String(idx + 1).padStart(2, '0')}`;
          const isSelected = m === value;
          const isDisabled = maxMonth ? m > maxMonth : false;
          return (
            <button
              key={m}
              onClick={() => {
                onSelect(m);
                onClose();
              }}
              disabled={isDisabled}
              className="py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-30"
              style={
                isSelected
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : { backgroundColor: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)' }
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
