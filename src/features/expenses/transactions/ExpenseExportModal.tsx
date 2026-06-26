import { useState } from 'react';
import { Modal, Button, TextInput } from '@/components/ui';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { exportExpensesAsCsv, downloadProtectedZip } from '@/core/export/exportCsv';

interface ExpenseExportModalProps {
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  onClose: () => void;
}

export function ExpenseExportModal({ expenses, expenseCategories, onClose }: ExpenseExportModalProps) {
  const [exportRange, setExportRange] = useState<'this_month' | 'last_3' | 'all_time' | 'custom'>('this_month');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exporting, setExporting] = useState(false);

  return (
    <Modal onClose={onClose} title="Export Expenses" size="sm">
      <div className="flex flex-col gap-2">
        {(
          [
            { value: 'this_month', label: 'This month' },
            { value: 'last_3', label: 'Last 3 months' },
            { value: 'all_time', label: 'All time' },
            { value: 'custom', label: 'Custom range' }
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setExportRange(value)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left"
            style={{
              borderColor: exportRange === value ? 'var(--color-primary)' : 'var(--color-border)',
              backgroundColor: exportRange === value ? 'var(--color-primary)15' : 'transparent'
            }}
          >
            <div
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
              style={{ borderColor: exportRange === value ? 'var(--color-primary)' : 'var(--color-border)' }}
            >
              {exportRange === value && (
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
              )}
            </div>
            <span className="text-sm font-medium text-primary">{label}</span>
          </button>
        ))}
        {exportRange === 'custom' && (
          <div className="flex gap-2 pt-1">
            <TextInput label="From" type="date" value={exportFrom} onChange={(val) => setExportFrom(val)} />
            <TextInput label="To" type="date" value={exportTo} onChange={(val) => setExportTo(val)} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-tertiary">Export password</label>
        <div className="relative">
          <input
            type={showExportPassword ? 'text' : 'password'}
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
            placeholder="Set a password for the ZIP file"
            className="input-surface border border-theme rounded-xl px-3 py-2.5 text-sm w-full pr-10"
          />
          <button
            type="button"
            onClick={() => setShowExportPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary"
          >
            <i
              className={`ti ${showExportPassword ? 'ti-eye-off' : 'ti-eye'}`}
              style={{ fontSize: 16 }}
              aria-hidden="true"
            />
          </button>
        </div>
        <p className="text-[11px] text-tertiary leading-relaxed">
          The ZIP is AES-256 encrypted. This password cannot be recovered — keep it safe.
        </p>
      </div>

      <Button
        variant="primary"
        fullWidth
        loading={exporting}
        disabled={!exportPassword || exporting || (exportRange === 'custom' && (!exportFrom || !exportTo))}
        onClick={async () => {
          if (!exportPassword) return;
          setExporting(true);
          const now = Date.now();
          let startMs = 0;
          let endMs = now;
          let label = 'all-time';
          if (exportRange === 'this_month') {
            startMs = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
            label = 'this-month';
          } else if (exportRange === 'last_3') {
            startMs = new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1).getTime();
            label = 'last-3-months';
          } else if (exportRange === 'custom') {
            startMs = exportFrom ? new Date(exportFrom).getTime() : 0;
            endMs = exportTo ? new Date(exportTo + 'T23:59:59').getTime() : now;
            label = exportFrom && exportTo ? `${exportFrom}-to-${exportTo}` : 'custom';
          }
          const filtered = expenses.filter((e) => e.date >= startMs && e.date <= endMs);
          const csv = exportExpensesAsCsv(filtered, expenseCategories);
          await downloadProtectedZip(csv, `penny-expenses-${label}.zip`, exportPassword);
          setExporting(false);
          setExportPassword('');
          onClose();
        }}
      >
        {exporting ? 'Creating ZIP…' : 'Download protected ZIP'}
      </Button>
    </Modal>
  );
}
