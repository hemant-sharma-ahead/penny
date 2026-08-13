import { useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { Button, ProgressBar } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, AccountType, ExpenseCategory } from '@/core/db/types';
import type { ParsedRow, RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';
import type { CategoryResolution, CategoryAction } from '@/core/import/importCategoryResolution';
import type { AccountResolution, AccountAction } from '@/core/import/importAccountResolution';
import type { RowOverride } from '@/core/import/importPipeline';
import type { RowTriage, DisplayTransferPair } from './useImport';
import { AccountsSection } from './review/AccountsSection';
import { PreviewSection } from './review/PreviewSection';

interface ReviewStepProps {
  parsedRows: ParsedRow[];
  rejectedRows: RejectedRow[];
  carryForwardExcludedRows: ParsedRow[];
  mapping: ColumnMapping | null;
  /** Original CSV header row — threaded down to `UnparsedRows` so a rejected row's editor can show the
   *  full original row (all columns, not just date/amount/description) alongside its column labels. */
  header: string[];
  categoryResolutions: CategoryResolution[];
  accountResolutions: AccountResolution[];
  noAccountColumn: boolean;
  singleAccountId: string | null;
  setSingleAccountId: (id: string) => void;
  singleAccountCreate: { name: string; type: AccountType } | null;
  setSingleAccountCreate: (v: { name: string; type: AccountType } | null) => void;
  categories: ExpenseCategory[];
  accounts: Account[];
  /** Per-category existing-transaction counts, threaded down to `CategoryTile` → `CategoryPickerModal`'s
   *  "Frequent" quick-pick row — see `useImport.ts`'s doc comment. */
  txnCountByCategory: Map<string, number>;
  /** Set once `useImport`'s reference-data load (categories/accounts) has exhausted its retries — shows
   *  a small inline "Couldn't load categories" affordance instead of leaving the Categories section
   *  silently empty for the rest of the session. */
  categoriesLoadError: boolean;
  onRetryLoadCategories: () => void;
  rowTriage: RowTriage[];
  totalRowsRead: number;
  actualTransactionCount: number;
  readyCount: number;
  attentionCount: number;
  duplicateCount: number;
  transferPairs: DisplayTransferPair[];
  accountsResolved: boolean;
  confirmedAccountCount: number;
  /** True once every source category resolved as a transfer has a destination account picked
   *  (2026-08-09 fix) — gates the Import button the same way `accountsResolved` does, since an
   *  incomplete transfer would otherwise silently write with no `toAccountId`. See `useImport.ts`'s
   *  doc comment. */
  transfersResolved: boolean;
  categoriesDecidedCount: number;
  touchedCategorySources: Set<string>;
  categoryTags: Map<string, string>;
  /** Per-row overrides (2026-08-06) — see `RowOverride`'s doc comment. */
  rowOverrides: Map<number, RowOverride>;
  /** "Remembered — {categoryName}" suggestions (2026-08-13, review redesign issue #8) — see
   *  `useImport.ts`'s doc comment. */
  rememberedSuggestions: Map<string, { categoryId: string; categoryName: string }>;
  importing: boolean;
  onUpdateCategory: (sourceName: string, suggestion: CategoryAction) => void;
  onUpdateCategoryTag: (sourceName: string, tag: string) => void;
  onMoveRowsToCategory: (rowIndices: number[], categoryId: string, categoryName: string) => void;
  onTagRows: (rowIndices: number[], tag: string) => void;
  /** "Looks good, create it" (2026-08-13, review redesign issue #7) — see `useImport.ts`'s
   *  `acknowledgeCategory` doc comment. */
  onAcknowledgeCategory: (sourceName: string) => void;
  /** "Not a transfer — log separately" (2026-08-13, review redesign issue #4) — see `useImport.ts`'s
   *  `unpairTransfer` doc comment. */
  onUnpairTransfer: (outgoingIndex: number, incomingIndex: number) => void;
  onUpdateAccount: (sourceName: string, suggestion: AccountAction) => void;
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
  onImport: () => void;
}

/**
 * RN port of apps/web-react/src/features/import/ReviewStep.tsx — the merged Accounts + Preview review
 * screen: a single continuous scroll with exactly 2 accordion sections, no tabs. Web's `position: sticky`
 * top progress bar has no RN equivalent, so this renders it as its own fixed `View` above a `ScrollView`
 * that carries everything else (the two accordion cards, the hint text, and the Import button) — the
 * same "fixed header, scrolling body below" split `ImportPage.tsx` already uses for `PageHeader` itself.
 *
 * Accounts and Preview are independently expandable (2026-08-13, bucket-tiles redesign §4) — the former
 * `manualSection`-forces-exclusivity state (exactly one of the two open at a time) is gone; both can be
 * open simultaneously, same as every other pair of sibling sections in this app. Each still defaults per
 * the same "auto until manually touched" rule as before (Accounts starts expanded while unresolved and
 * auto-collapses once resolved; Preview starts expanded once Accounts is resolved), just no longer
 * coupled to its sibling's own state.
 */
export function ReviewStep({
  parsedRows,
  rejectedRows,
  carryForwardExcludedRows,
  mapping,
  header,
  categoryResolutions,
  accountResolutions,
  noAccountColumn,
  singleAccountId,
  setSingleAccountId,
  singleAccountCreate,
  setSingleAccountCreate,
  categories,
  accounts,
  txnCountByCategory,
  categoriesLoadError,
  onRetryLoadCategories,
  rowTriage,
  totalRowsRead,
  actualTransactionCount,
  readyCount,
  attentionCount,
  duplicateCount,
  transferPairs,
  accountsResolved,
  confirmedAccountCount,
  transfersResolved,
  categoriesDecidedCount,
  touchedCategorySources,
  categoryTags,
  rowOverrides,
  rememberedSuggestions,
  importing,
  onUpdateCategory,
  onUpdateCategoryTag,
  onMoveRowsToCategory,
  onTagRows,
  onAcknowledgeCategory,
  onUnpairTransfer,
  onUpdateAccount,
  onFixRejected,
  onImport
}: ReviewStepProps) {
  const theme = useThemeColors();
  // Auto-expand/collapse, independently per section (2026-08-13, bucket-tiles redesign §4 — no more
  // mutual exclusion): each starts `null` (not yet manually touched), in which case its expanded state
  // derives from `accountsResolved` — Accounts open while unresolved, Preview open once resolved. Once a
  // section is manually toggled, IT (and only it) switches to being fully user-controlled; its sibling
  // keeps following the same derived default until it too is touched.
  const [accountsManuallyExpanded, setAccountsManuallyExpanded] = useState<boolean | null>(null);
  const [previewManuallyExpanded, setPreviewManuallyExpanded] = useState<boolean | null>(null);
  const accountsExpanded = accountsManuallyExpanded ?? !accountsResolved;
  const previewExpanded = previewManuallyExpanded ?? accountsResolved;

  function toggleAccounts() {
    setAccountsManuallyExpanded(!accountsExpanded);
  }
  function togglePreview() {
    setPreviewManuallyExpanded(!previewExpanded);
  }

  const sourceAccountCount = accountResolutions.length;
  /** The account this import is targeting, for `CategoryTile`'s "Transfer to account" picker to exclude
   *  (2026-08-09 fix) — only meaningful for a whole-file `noAccountColumn` import, which always debits
   *  exactly one account; a per-row multi-account CSV has no single universal target to exclude here
   *  (a given tile's own rows could legitimately span several source accounts), so nothing is filtered
   *  in that case — see `PreviewSection.tsx`'s doc comment. */
  const excludeAccountId = noAccountColumn ? (singleAccountId ?? undefined) : undefined;
  const progressPct =
    (accountsResolved ? 50 : 0) +
    (categoryResolutions.length === 0 ? 0 : (categoriesDecidedCount / categoryResolutions.length) * 50);

  return (
    <View className="flex-1">
      <View className="px-4 pt-3 pb-2 border-b border-theme bg-surface gap-1.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] text-secondary">{accountsResolved ? '1' : '0'} of 2 sections done</Text>
          <Text className="text-[11px] text-secondary">{totalRowsRead} rows</Text>
        </View>
        <ProgressBar value={progressPct} size="xs" animate />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 12, paddingBottom: 16, gap: 16 }}>
        <View className="bg-surface rounded-xl overflow-hidden border border-theme">
          <Pressable onPress={toggleAccounts} className="flex-row items-center justify-between gap-2 p-3">
            <View className="flex-1 flex-row items-center gap-2.5">
              <View
                className="w-6 h-6 rounded-md items-center justify-center flex-shrink-0"
                style={{ backgroundColor: accountsResolved ? theme.success : theme.surfaceTertiary }}
              >
                {accountsResolved ? (
                  <Icon name="ti-check" size={13} color="#fff" />
                ) : (
                  <Text className="text-[11px] font-extrabold" style={{ color: theme.textTertiary }}>
                    {sourceAccountCount || 1}
                  </Text>
                )}
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-[13.5px] font-bold text-primary">Accounts</Text>
                <Text className="text-[10.5px] text-tertiary" numberOfLines={1}>
                  {noAccountColumn
                    ? 'One account for the whole file'
                    : accountsResolved
                      ? `${sourceAccountCount} → ${confirmedAccountCount} confirmed`
                      : `${sourceAccountCount} source account${sourceAccountCount !== 1 ? 's' : ''} · needs a decision`}
                </Text>
              </View>
            </View>
            <Icon name={accountsExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
          </Pressable>
          {accountsExpanded && (
            <View className="border-t border-theme px-3 pb-3 pt-1">
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
            </View>
          )}
        </View>

        <View className="bg-surface rounded-xl overflow-hidden border border-theme">
          <Pressable onPress={togglePreview} className="flex-row items-center justify-between gap-2 p-3">
            <View className="flex-1 flex-row items-center gap-2.5">
              <View
                className="w-6 h-6 rounded-md items-center justify-center flex-shrink-0"
                style={{ backgroundColor: attentionCount > 0 ? theme.warning : theme.success }}
              >
                {attentionCount > 0 ? (
                  <Text className="text-[11px] font-extrabold text-white">{attentionCount}</Text>
                ) : (
                  <Icon name="ti-check" size={13} color="#fff" />
                )}
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-[13.5px] font-bold text-primary">Preview — {totalRowsRead} rows</Text>
                <Text className="text-[10.5px]" numberOfLines={1}>
                  <Text style={{ color: theme.success, fontWeight: '800' }}>{readyCount} ready</Text>
                  <Text className="text-tertiary"> · </Text>
                  <Text style={{ color: theme.warning, fontWeight: '800' }}>{attentionCount} attention</Text>
                  <Text className="text-tertiary"> · </Text>
                  <Text className="text-tertiary" style={{ fontWeight: '800' }}>
                    {duplicateCount} duplicate
                  </Text>
                </Text>
                <Text className="text-[10.5px] font-bold text-secondary">
                  {actualTransactionCount} actual transaction{actualTransactionCount !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <Icon name={previewExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
          </Pressable>
          {previewExpanded && (
            <View className="border-t border-theme px-3 pb-3 pt-2">
              <PreviewSection
                rejectedRows={rejectedRows}
                mapping={mapping}
                header={header}
                onFixRejected={onFixRejected}
                carryForwardExcludedRows={carryForwardExcludedRows}
                transferPairs={transferPairs}
                categoryResolutions={categoryResolutions}
                touchedCategorySources={touchedCategorySources}
                parsedRows={parsedRows}
                rowTriage={rowTriage}
                categories={categories}
                accounts={accounts}
                excludeAccountId={excludeAccountId}
                txnCountByCategory={txnCountByCategory}
                categoryTags={categoryTags}
                rowOverrides={rowOverrides}
                rememberedSuggestions={rememberedSuggestions}
                onUpdateCategory={onUpdateCategory}
                onUpdateCategoryTag={onUpdateCategoryTag}
                onMoveRowsToCategory={onMoveRowsToCategory}
                onTagRows={onTagRows}
                onAcknowledge={onAcknowledgeCategory}
                onUnpairTransfer={onUnpairTransfer}
              />
            </View>
          )}
        </View>

        {categoriesLoadError && (
          <Pressable
            onPress={onRetryLoadCategories}
            className="flex-row items-center justify-center gap-1.5 py-1.5 rounded-lg"
            style={{ backgroundColor: tint(theme.warning, 15) }}
          >
            <Icon name="ti-alert-triangle" size={13} color={theme.warning} />
            <Text className="text-[11.5px] font-semibold" style={{ color: theme.warning }}>
              Couldn&apos;t load categories — tap to retry
            </Text>
          </Pressable>
        )}

        {!accountsResolved && (
          <Text className="text-center text-[10.5px] text-tertiary" style={{ marginTop: -8 }}>
            Resolve the account above, or tap Preview to see rows first
          </Text>
        )}
        {accountsResolved && !transfersResolved && (
          <Text className="text-center text-[10.5px] text-tertiary" style={{ marginTop: -8 }}>
            Pick a destination account for every category marked as a transfer
          </Text>
        )}
        {/* 2026-08-13, review redesign issue #7 — an unconfirmed "create" guess must never silently
         *  import; "Confirm the N items above" points the user directly at what's blocking them,
         *  mirroring the accounts/transfers hints above it. */}
        {accountsResolved && transfersResolved && attentionCount > 0 && (
          <Text className="text-center text-[10.5px]" style={{ color: theme.warning, marginTop: -8 }}>
            {attentionCount} item{attentionCount !== 1 ? 's' : ''} need{attentionCount === 1 ? 's' : ''} your input
            before importing
          </Text>
        )}

        <View className="flex-row gap-3">
          <Button
            variant="primary"
            className="flex-1"
            loading={importing}
            disabled={!accountsResolved || !transfersResolved || importing || readyCount === 0 || attentionCount > 0}
            onPress={onImport}
          >
            {!accountsResolved
              ? 'Resolve accounts to continue'
              : !transfersResolved
                ? 'Pick every transfer destination to continue'
                : attentionCount > 0
                  ? `Confirm the ${attentionCount} item${attentionCount !== 1 ? 's' : ''} above to continue`
                  : importing
                    ? 'Importing…'
                    : `Import ${actualTransactionCount} transaction${actualTransactionCount !== 1 ? 's' : ''}`}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
