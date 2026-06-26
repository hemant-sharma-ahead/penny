import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, PageHeader } from '@/components/ui';
import { usePrivacy } from '@/context/PrivacyContext';
import { useEventMode } from '@/context/EventModeContext';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { monthLabel } from '@/lib/date';
import { useForecast } from '@/hooks/useForecast';
import { PATHS } from '@/router/paths';
import { EventsModal } from './events/EventsModal';
import { useEventEditor } from './events/useEventEditor';
import { ExpenseExportModal } from './transactions/ExpenseExportModal';

interface ExpensesHeaderProps {
  filteredTotal: number;
  monthFilter: string | null;
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  linkedCountByEventHashtag: Map<string, number>;
  saveExpense: (e: Expense) => Promise<void>;
}

export function ExpensesHeader({
  filteredTotal,
  monthFilter,
  expenses,
  expenseCategories,
  linkedCountByEventHashtag,
  saveExpense
}: ExpensesHeaderProps) {
  const navigate = useNavigate();
  const { mode } = usePrivacy();
  const { events, updateEvent } = useEventMode();
  const { loading: forecastLoading, forecast } = useForecast();
  const safeToSpend = Math.max(0, forecast.discretionary);
  const [nowMs] = useState(() => Date.now());
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const { unlinkDialog, closeUnlinkDialog, handleEditEventSave } = useEventEditor(expenses, saveExpense, updateEvent);

  const immersiveEvent = events.find((e) => e.subtype === 'immersive');

  return (
    <>
      <PageHeader
        title="Transactions"
        actions={
          <>
            <button
              onClick={() => setShowEventSheet(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 relative"
              aria-label="Manage events"
            >
              <i className="ti ti-flag-3" style={{ fontSize: 18 }} aria-hidden="true" />
              {events.length > 0 && (
                <span
                  className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full"
                  style={{ backgroundColor: events[0]?.color ?? '#ef4444' }}
                />
              )}
            </button>
            <Button
              variant="ghost"
              icon="ti-file-import"
              aria-label="Import expenses"
              className="w-8 h-8 rounded-lg hover:text-primary"
              onClick={() => navigate(PATHS.app.import)}
            />
            <Button
              variant="ghost"
              icon="ti-file-export"
              aria-label="Export expenses"
              className="w-8 h-8 rounded-lg hover:text-primary"
              onClick={() => setShowExportSheet(true)}
            />
          </>
        }
      >
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-secondary">
            {monthFilter ? monthLabel(monthFilter) : 'All transactions'}:{' '}
            <span className="font-medium text-primary">{mode === 'open' ? formatCurrency(filteredTotal) : '••••'}</span>
          </p>
          <div className="flex items-center gap-2">
            {immersiveEvent && (
              <span
                className="text-[10px] font-semibold flex items-center gap-1"
                style={{ color: immersiveEvent.color }}
              >
                <i className="ti ti-plane" style={{ fontSize: 11 }} aria-hidden="true" />
                Vacation On · {immersiveEvent.name}
              </span>
            )}
            {!forecastLoading && (
              <button
                onClick={() => navigate(PATHS.app.cashflow)}
                className="flex items-center gap-1 rounded-full bg-surface-2 border border-theme px-2.5 py-1 text-[11px] font-medium text-secondary"
                aria-label="View cash flow"
              >
                <i
                  className="ti ti-wallet"
                  style={{ fontSize: 12, color: 'var(--color-primary)' }}
                  aria-hidden="true"
                />
                Safe: <span className="text-primary">{mode === 'open' ? formatCurrency(safeToSpend) : '••••'}</span>
              </button>
            )}
          </div>
        </div>
      </PageHeader>

      {/* Export modal */}
      {showExportSheet && (
        <ExpenseExportModal
          expenses={expenses}
          expenseCategories={expenseCategories}
          onClose={() => setShowExportSheet(false)}
        />
      )}

      {/* Events modal */}
      {showEventSheet && (
        <EventsModal
          onClose={() => setShowEventSheet(false)}
          linkedCountByEventHashtag={linkedCountByEventHashtag}
          nowMs={nowMs}
          onRequestEditSave={handleEditEventSave}
        />
      )}

      {/* Unlink confirmation dialog */}
      {unlinkDialog && (
        <Modal
          onClose={closeUnlinkDialog}
          nested
          footer={
            <div className="flex flex-col gap-2">
              <Button variant="primary" fullWidth onClick={unlinkDialog.onConfirmUnlink}>
                Confirm &amp; Unlink
              </Button>
              <Button variant="secondary" fullWidth onClick={unlinkDialog.onConfirm}>
                Confirm, keep linked
              </Button>
              <Button variant="ghost" fullWidth onClick={closeUnlinkDialog}>
                Cancel
              </Button>
            </div>
          }
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning-subtle flex items-center justify-center flex-shrink-0">
              <i className="ti ti-alert-triangle text-warning" style={{ fontSize: 20 }} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Date range changed</p>
              <p className="text-xs mt-0.5 text-tertiary">
                {unlinkDialog.outOfRangeCount} transaction
                {unlinkDialog.outOfRangeCount !== 1 ? 's fall' : ' falls'} outside the new date range.
              </p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-secondary">
            You can keep them linked to this event, or unlink them so they appear in regular analytics instead.
          </p>
        </Modal>
      )}
    </>
  );
}
