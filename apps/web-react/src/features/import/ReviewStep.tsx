import { useState } from 'react';
import { Button, ProgressBar } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
import type { Account, AccountType, ExpenseCategory } from '@/core/db/types';
import type { ParsedRow, RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';
import type { CategoryResolution, CategoryAction } from '@/core/import/importCategoryResolution';
import type { AccountResolution, AccountAction } from '@/core/import/importAccountResolution';
import type { RowTriage, DisplayTransferPair } from './useImport';
import { AccountsSection } from './review/AccountsSection';
import { PreviewSection } from './review/PreviewSection';

type Section = 'accounts' | 'preview';

interface ReviewStepProps {
  parsedRows: ParsedRow[];
  rejectedRows: RejectedRow[];
  carryForwardExcludedRows: ParsedRow[];
  mapping: ColumnMapping | null;
  categoryResolutions: CategoryResolution[];
  accountResolutions: AccountResolution[];
  noAccountColumn: boolean;
  singleAccountId: string | null;
  setSingleAccountId: (id: string) => void;
  singleAccountCreate: { name: string; type: AccountType } | null;
  setSingleAccountCreate: (v: { name: string; type: AccountType } | null) => void;
  categories: ExpenseCategory[];
  accounts: Account[];
  rowTriage: RowTriage[];
  totalRowsRead: number;
  actualTransactionCount: number;
  readyCount: number;
  attentionCount: number;
  duplicateCount: number;
  transferPairs: DisplayTransferPair[];
  accountsResolved: boolean;
  confirmedAccountCount: number;
  categoriesDecidedCount: number;
  touchedCategorySources: Set<string>;
  categoryTags: Map<string, string>;
  importing: boolean;
  onUpdateCategory: (sourceName: string, suggestion: CategoryAction) => void;
  onUpdateCategoryTag: (sourceName: string, tag: string) => void;
  onUpdateAccount: (sourceName: string, suggestion: AccountAction) => void;
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
  onImport: () => void;
}

/**
 * The merged Accounts + Preview review screen (2026-07-28 redesign) — a single continuous scroll with
 * exactly 2 accordion sections, no tabs. See docs/mockups/proposals/import-wizard-redesign-v4.html for
 * the approved structure this implements.
 */
export function ReviewStep({
  parsedRows,
  rejectedRows,
  carryForwardExcludedRows,
  mapping,
  categoryResolutions,
  accountResolutions,
  noAccountColumn,
  singleAccountId,
  setSingleAccountId,
  singleAccountCreate,
  setSingleAccountCreate,
  categories,
  accounts,
  rowTriage,
  totalRowsRead,
  actualTransactionCount,
  readyCount,
  attentionCount,
  duplicateCount,
  transferPairs,
  accountsResolved,
  confirmedAccountCount,
  categoriesDecidedCount,
  touchedCategorySources,
  categoryTags,
  importing,
  onUpdateCategory,
  onUpdateCategoryTag,
  onUpdateAccount,
  onFixRejected,
  onImport
}: ReviewStepProps) {
  // Auto-expand/collapse: Accounts is expanded while it has an outstanding decision and auto-collapses
  // (auto-expanding Preview) the moment it's resolved — but only until the user manually toggles a
  // section themselves, per the accordion mechanic in the approved mockup. `manualSection` is null
  // until the user's first manual toggle, so this is a derived value (no effect/setState needed).
  const [manualSection, setManualSection] = useState<Section | null>(null);
  const expanded: Section = manualSection ?? (accountsResolved ? 'preview' : 'accounts');

  function toggleSection(section: Section) {
    setManualSection(section);
  }

  const sourceAccountCount = accountResolutions.length;
  const progressPct =
    (accountsResolved ? 50 : 0) +
    (categoryResolutions.length === 0 ? 0 : (categoriesDecidedCount / categoryResolutions.length) * 50);

  return (
    <div className="flex flex-col gap-4 -mt-4">
      <div className="sticky top-0 z-30 bg-surface -mx-4 px-4 pt-3 pb-2 border-b border-theme flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] text-secondary">
          <span>{accountsResolved ? '1' : '0'} of 2 sections done</span>
          <span>{totalRowsRead} rows</span>
        </div>
        <ProgressBar value={progressPct} size="xs" animate />
      </div>

      <div className="surface rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('accounts')}
          className="w-full flex items-center justify-between gap-2 p-3 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-extrabold flex-shrink-0"
              style={{
                backgroundColor: accountsResolved ? 'var(--color-success)' : 'var(--color-surface-3)',
                color: accountsResolved ? '#fff' : 'var(--color-text-tertiary)'
              }}
            >
              {accountsResolved ? <i className="ti ti-check" aria-hidden="true" /> : sourceAccountCount || 1}
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-primary">Accounts</p>
              <p className="text-[10.5px] text-tertiary truncate">
                {noAccountColumn
                  ? 'One account for the whole file'
                  : accountsResolved
                    ? `${sourceAccountCount} → ${confirmedAccountCount} confirmed`
                    : `${sourceAccountCount} source account${sourceAccountCount !== 1 ? 's' : ''} · needs a decision`}
              </p>
            </div>
          </div>
          <i
            className={`ti ti-chevron-${expanded === 'accounts' ? 'up' : 'down'} text-tertiary flex-shrink-0`}
            aria-hidden="true"
          />
        </button>
        {expanded === 'accounts' && (
          <div className="border-t border-theme px-3 pb-3 pt-1">
            <AccountsSection
              accountResolutions={accountResolutions}
              accounts={accounts}
              noAccountColumn={noAccountColumn}
              singleAccountId={singleAccountId}
              setSingleAccountId={setSingleAccountId}
              singleAccountCreate={singleAccountCreate}
              setSingleAccountCreate={setSingleAccountCreate}
              onUpdateAccount={onUpdateAccount}
              parsedRows={parsedRows}
              rowTriage={rowTriage}
            />
          </div>
        )}
      </div>

      <div className="surface rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('preview')}
          className="w-full flex items-center justify-between gap-2 p-3 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-extrabold flex-shrink-0"
              style={
                attentionCount > 0
                  ? { backgroundColor: STATUS.warning, color: '#fff' }
                  : { backgroundColor: STATUS.success, color: '#fff' }
              }
            >
              {attentionCount > 0 ? attentionCount : <i className="ti ti-check" aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-primary">Preview — {totalRowsRead} rows</p>
              <p className="text-[10.5px] truncate">
                <b style={{ color: STATUS.success, fontWeight: 800 }}>{readyCount} ready</b>
                <span className="text-tertiary mx-1">·</span>
                <b style={{ color: STATUS.warning, fontWeight: 800 }}>{attentionCount} attention</b>
                <span className="text-tertiary mx-1">·</span>
                <b className="text-tertiary" style={{ fontWeight: 800 }}>
                  {duplicateCount} duplicate
                </b>
              </p>
              <p className="text-[10.5px] font-bold text-secondary">
                {actualTransactionCount} actual transaction{actualTransactionCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <i
            className={`ti ti-chevron-${expanded === 'preview' ? 'up' : 'down'} text-tertiary flex-shrink-0`}
            aria-hidden="true"
          />
        </button>
        {expanded === 'preview' && (
          <div className="border-t border-theme px-3 pb-3 pt-2">
            <PreviewSection
              rejectedRows={rejectedRows}
              mapping={mapping}
              onFixRejected={onFixRejected}
              carryForwardExcludedRows={carryForwardExcludedRows}
              transferPairs={transferPairs}
              categoryResolutions={categoryResolutions}
              categoriesDecidedCount={categoriesDecidedCount}
              touchedCategorySources={touchedCategorySources}
              parsedRows={parsedRows}
              rowTriage={rowTriage}
              categories={categories}
              categoryTags={categoryTags}
              onUpdateCategory={onUpdateCategory}
              onUpdateCategoryTag={onUpdateCategoryTag}
            />
          </div>
        )}
      </div>

      {!accountsResolved && (
        <p className="text-center text-[10.5px] text-tertiary -mt-1">
          Resolve the account above, or tap Preview to see rows first
        </p>
      )}

      <div className="flex gap-3 pb-4 pt-1">
        <Button
          variant="primary"
          className="flex-1"
          loading={importing}
          disabled={!accountsResolved || importing || readyCount === 0}
          onClick={onImport}
        >
          {!accountsResolved
            ? 'Resolve accounts to continue'
            : importing
              ? 'Importing…'
              : `Import ${actualTransactionCount} transaction${actualTransactionCount !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
}
