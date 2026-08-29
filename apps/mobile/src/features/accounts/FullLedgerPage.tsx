import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { Account, Expense } from '@/core/db/types';
import {
  accountsRepo,
  bankStatementImportsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  hashtagsRepo
} from '@/core/db/repositories';
import { buildLedgerRows, type LedgerRow } from '@/core/bank-import/ledger';
import {
  buildResolvedImportRecord,
  relinkLedgerRow,
  resolveSkippedRowToExisting,
  unmatchLedgerRow
} from '@/core/bank-import/ledgerActions';
import { normalizeNarration } from '@/core/bank-import/normalization';
import { inferPaymentMode } from '@/core/expenses/paymentModeInference';
import { RECONCILIATION_DESCRIPTION } from '@/core/expenses/cashFlowSummary';
import { logActivity } from '@/core/db/activityLog';
import { notifyAccountsChanged, notifyBankImportsChanged, useAccountsRefresh } from '@/hooks/useDataRefresh';
import { notifyTxnChanged, useTxnRefresh } from '@/hooks/useTxnRefresh';
import { useRepository } from '@/hooks/useRepository';
import type { AccountInput } from '~/hooks/useAccountForm';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';
import { formatCurrency } from '@/lib/formatters';
import { formatDate } from '@/lib/date';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { useThemeColors } from '~/theme/useThemeColors';
import { Banner, Button, Card, ConfirmDialog, EmptyState, Modal, PennyLoader } from '~/components/ui';
import { ExpenseForm, PossibleMatchPickerModal, type StatementPresetInput } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import type { HomeStackParamList } from '~/navigation/HomeStack';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 60;

/**
 * Full Ledger (`docs/plans/bank-reconciliation-ledger.md`) — a dense, row-by-row Statement ⟷ Expense
 * reconciliation for a chosen date window, reached from `CheckpointTimelinePage`'s "View full ledger
 * ›". A deeper zoom on the SAME feature family, not a competing screen — that page's own sparse
 * checkpoint table, the anchor-boundary divider, and the account badge are all untouched by this one.
 *
 * **Phase 2 (relink/unmatch/resolve, built 2026-08-10)** on top of Phase 1's read-only view: a tap on
 * a `'matched'` or `'skipped-unresolved'` row opens a centered action menu (`RowActionModal` — a
 * centered `Modal`, per `docs/DESIGN_GUIDELINES.md`'s non-negotiable "centered modals, never bottom
 * sheets" rule; the phase-2 mockup's own bottom-sheet chrome was wrong on this point and isn't
 * reproduced here, only its options/content). `'anomaly'`/`'not-covered'` rows get no action of their
 * own — an anomaly's real fix is always initiated from ITS statement-side counterpart (a
 * `'skipped-unresolved'` row elsewhere in the window); picking the anomaly's own expense via "Pick the
 * matching transaction" links them and the anomaly row disappears on its own.
 */
export function FullLedgerPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const route = useRoute<RouteProp<HomeStackParamList, 'FullLedger'>>();
  const { accountId } = route.params;
  useDefaultHeaderBack('FullLedger');

  const { items: accounts, loading: accountsLoading, reload: reloadAccounts } = useRepository(accountsRepo);
  // Tier 2 performance fix (2026-08-28) — every use of `allExpenses` below is already scoped to this
  // one account (`accountId === account.id || toAccountId === account.id`), so there was never a
  // reason to decrypt the WHOLE `expenses` table here. Replaces `useRepository(expensesRepo)`'s
  // `getAll()` with the real indexed `queryByAccount()` — same `items`/`loading`/`reload` shape, just
  // scoped at the query itself instead of filtered afterward in JS.
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const reloadExpenses = useCallback(() => {
    let cancelled = false;
    expensesRepo.queryByAccount(accountId).then((rows) => {
      if (!cancelled) {
        setAllExpenses(rows);
        setExpensesLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);
  useEffect(() => reloadExpenses(), [reloadExpenses]);
  const { items: allImportRecords, reload: reloadImportRecords } = useRepository(bankStatementImportsRepo);
  const { items: categories } = useRepository(expenseCategoriesRepo);
  const { items: hashtags } = useRepository(hashtagsRepo);
  useAccountsRefresh(reloadAccounts);
  // Found + fixed 2026-08-10, on-device testing: a transaction recorded from another screen while
  // this one stayed mounted in the background never showed up here — `useRepository` only fetches
  // once on mount, and `expensesRepo`'s canonical single-expense save path
  // (`useExpenses.ts`'s `saveExpenseWithHashtags`) wasn't broadcasting the existing `notifyTxnChanged`
  // signal other mutations in that file already do. Fixed at the source (that call site) too — this
  // subscription is the other half, so THIS screen actually reacts to it.
  useTxnRefresh(reloadExpenses);
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Same three-repo combo already used after a relink/unmatch/resolve write below (e.g.
  // `handleUnmatchConfirm`) — pull-to-refresh re-derives the whole ledger from scratch the same way.
  const { refreshing, onRefresh } = usePullToRefresh(
    useCallback(
      () => Promise.all([reloadAccounts(), reloadExpenses(), reloadImportRecords()]),
      [reloadAccounts, reloadExpenses, reloadImportRecords]
    )
  );

  // Recent-first, continuously-growing window (docs/plans/bank-reconciliation-ledger.md —
  // "windowed, recent-first" decision, refined 2026-08-10 on-device feedback: a discrete ‹/› window
  // SWAP felt disjointed — extending the SAME list via "Load earlier", so it reads as one continuous
  // ledger, is what was actually wanted). `windowEnd` is fixed at "today" as of when this
  // screen opened (captured once via lazy `useState` init, a React-blessed escape hatch — never
  // re-read via a fresh `Date.now()` mid-render, which `react-hooks/purity` forbids and which would
  // also make the visible range silently drift forward as real time passes during the session).
  // `loadedStart` only ever moves backward, extending the SAME list — there is no forward paging,
  // since `windowEnd` already always covers up to "now".
  const [windowEnd] = useState(() => Date.now());
  const [loadedStart, setLoadedStart] = useState(windowEnd - WINDOW_DAYS * DAY_MS);

  const rows = useMemo(() => {
    if (!account) return [];
    const accountTxns = allExpenses.filter((e) => e.accountId === account.id || e.toAccountId === account.id);
    const importRecords = allImportRecords.filter((r) => r.accountId === account.id);
    const dismissedFingerprints = new Set((account.dismissedSkippedRows ?? []).map((d) => d.fingerprint));
    return buildLedgerRows({
      accountId: account.id,
      openingBalance: account.openingBalance,
      ...(account.openingBalanceAsOfDate !== undefined
        ? { openingBalanceAsOfDate: account.openingBalanceAsOfDate }
        : {}),
      accountTxns,
      importRecords,
      batches: account.coveredStatementRanges ?? [],
      dismissedFingerprints,
      windowStart: loadedStart,
      windowEnd
    });
  }, [account, allExpenses, allImportRecords, loadedStart, windowEnd]);

  // Every account expense not already linked to a statement line — the pool a relink/resolve picker
  // draws from. Deliberately excludes the CURRENTLY-linked expense too (for a relink) rather than
  // preserving it with a `currentlyMatchedId` highlight the way bucket 1's live reassign does —
  // re-picking the exact same expense here would be a no-op the user can already get by just
  // cancelling out of the flow, so the extra highlighting isn't worth the complexity in this,
  // after-the-fact context.
  const candidatePool = useMemo(() => {
    if (!account) return [];
    const linkedIds = new Set(allImportRecords.filter((r) => r.accountId === account.id).map((r) => r.linkedTxnId));
    return allExpenses.filter(
      (e) =>
        (e.accountId === account.id || e.toAccountId === account.id) &&
        e.description !== RECONCILIATION_DESCRIPTION &&
        !linkedIds.has(e.id)
    );
  }, [account, allExpenses, allImportRecords]);

  const dismissRow = useCallback(
    async (row: LedgerRow) => {
      if (!account || !row.dismissKey) return;
      const next: Account = {
        ...account,
        dismissedSkippedRows: [
          ...(account.dismissedSkippedRows ?? []).filter((d) => d.fingerprint !== row.dismissKey),
          { fingerprint: row.dismissKey, dismissedAt: Date.now() }
        ],
        updatedAt: Date.now()
      };
      await accountsRepo.put(next);
      notifyAccountsChanged();
    },
    [account]
  );

  // ── Phase 2: relink / unmatch / resolve ────────────────────────────────────────────────────────
  const [actionRow, setActionRow] = useState<LedgerRow | null>(null);
  const [unmatchRow, setUnmatchRow] = useState<LedgerRow | null>(null);
  const [pickerRow, setPickerRow] = useState<{ row: LedgerRow; mode: 'relink' | 'resolve' } | null>(null);
  const [addNewRow, setAddNewRow] = useState<LedgerRow | null>(null);

  const handleUnmatchConfirm = useCallback(async () => {
    if (!account || !unmatchRow?.expense) return;
    const expense = allExpenses.find((e) => e.id === unmatchRow.expense?.expenseId);
    const record = allImportRecords.find(
      (r) => r.accountId === account.id && r.linkedTxnId === unmatchRow.expense?.expenseId
    );
    const batch = account.coveredStatementRanges?.find((b) => b.batchId === record?.batchId);
    if (!expense || !record || !batch) {
      setUnmatchRow(null);
      return;
    }
    const now = Date.now();
    const { updatedExpense, updatedBatch } = unmatchLedgerRow(account.id, expense, record, batch, now);
    await expensesRepo.put(updatedExpense);
    await bankStatementImportsRepo.delete(record.id);
    await accountsRepo.put({
      ...account,
      coveredStatementRanges: (account.coveredStatementRanges ?? []).map((b) =>
        b.batchId === batch.batchId ? updatedBatch : b
      ),
      updatedAt: now
    });
    logActivity({
      action: 'UPDATE',
      entityType: 'expense',
      entityId: updatedExpense.id,
      summary: `Unmatched "${record.rawNarration}" from ${updatedExpense.description}`
    });
    setUnmatchRow(null);
    await Promise.all([reloadExpenses(), reloadImportRecords(), reloadAccounts()]);
    notifyTxnChanged();
    notifyBankImportsChanged();
    notifyAccountsChanged();
  }, [account, unmatchRow, allExpenses, allImportRecords, reloadExpenses, reloadImportRecords, reloadAccounts]);

  const handlePick = useCallback(
    async (newExpense: Expense) => {
      if (!account || !pickerRow) return;
      const { row, mode } = pickerRow;
      const now = Date.now();

      if (mode === 'relink') {
        const oldExpense = allExpenses.find((e) => e.id === row.expense?.expenseId);
        const record = allImportRecords.find(
          (r) => r.accountId === account.id && r.linkedTxnId === row.expense?.expenseId
        );
        if (!oldExpense || !record) {
          setPickerRow(null);
          return;
        }
        const { updatedOldExpense, updatedNewExpense } = relinkLedgerRow(
          account.id,
          oldExpense,
          newExpense,
          record,
          now
        );
        await expensesRepo.put(updatedOldExpense);
        await expensesRepo.put(updatedNewExpense);
        await bankStatementImportsRepo.put({ ...record, linkedTxnId: newExpense.id });
        logActivity({
          action: 'UPDATE',
          entityType: 'expense',
          entityId: updatedNewExpense.id,
          summary: `Relinked "${record.rawNarration}" to ${updatedNewExpense.description}`
        });
      } else {
        if (!row.statement || !row.batchId) {
          setPickerRow(null);
          return;
        }
        const rawNarration = row.statement.rawNarration;
        const amount = Math.abs(row.statement.amount);
        const direction: 'debit' | 'credit' = row.statement.amount >= 0 ? 'credit' : 'debit';
        const updatedExpense = resolveSkippedRowToExisting(
          account.id,
          { rawNarration, date: row.date, amount, direction },
          newExpense,
          now
        );
        await expensesRepo.put(updatedExpense);
        const newRecord = buildResolvedImportRecord({
          id: crypto.randomUUID(),
          batchId: row.batchId,
          accountId: account.id,
          rawNarration,
          date: row.date,
          amount,
          type: updatedExpense.type ?? 'expense',
          linkedTxnId: newExpense.id,
          normalizedKey: normalizeNarration(rawNarration),
          now,
          ...(row.rowIndex !== undefined ? { sourceRowIndex: row.rowIndex } : {})
        });
        await bankStatementImportsRepo.put(newRecord);
        logActivity({
          action: 'UPDATE',
          entityType: 'expense',
          entityId: updatedExpense.id,
          summary: `Resolved "${rawNarration}" to ${updatedExpense.description}`
        });
      }

      setPickerRow(null);
      await Promise.all([reloadExpenses(), reloadImportRecords()]);
      notifyTxnChanged();
      notifyBankImportsChanged();
    },
    [account, pickerRow, allExpenses, allImportRecords, reloadExpenses, reloadImportRecords]
  );

  const addNewPreset: StatementPresetInput | undefined = useMemo(() => {
    if (!account || !addNewRow?.statement) return undefined;
    return {
      amount: Math.abs(addNewRow.statement.amount),
      date: addNewRow.date,
      accountId: account.id,
      type: addNewRow.statement.amount >= 0 ? 'income' : 'expense',
      paymentMode: inferPaymentMode(addNewRow.statement.rawNarration).id
    };
  }, [account, addNewRow]);

  const handleAddNewSave = useCallback(
    async (expense: Expense) => {
      if (!account || !addNewRow?.statement || !addNewRow.batchId) return;
      const now = Date.now();
      await expensesRepo.put(expense);
      const newRecord = buildResolvedImportRecord({
        id: crypto.randomUUID(),
        batchId: addNewRow.batchId,
        accountId: account.id,
        rawNarration: addNewRow.statement.rawNarration,
        date: addNewRow.date,
        amount: Math.abs(addNewRow.statement.amount),
        type: expense.type ?? 'expense',
        linkedTxnId: expense.id,
        normalizedKey: normalizeNarration(addNewRow.statement.rawNarration),
        now,
        ...(addNewRow.rowIndex !== undefined ? { sourceRowIndex: addNewRow.rowIndex } : {})
      });
      await bankStatementImportsRepo.put(newRecord);
      logActivity({
        action: 'CREATE',
        entityType: 'expense',
        entityId: expense.id,
        summary: `Added: ${expense.description}`
      });
      setAddNewRow(null);
      await Promise.all([reloadExpenses(), reloadImportRecords()]);
      notifyTxnChanged();
      notifyBankImportsChanged();
    },
    [account, addNewRow, reloadExpenses, reloadImportRecords]
  );

  // `AccountChips`' own "+" tile inside `ExpenseForm` — mirrors `useBankImport.ts`'s
  // `saveAccountForForm` exactly, plus the `notifyAccountsChanged()` broadcast that one doesn't need
  // (bank-import's own bucket screens read `bi.accounts` directly, not `useRepository`).
  const saveAccountForForm = useCallback(async (data: AccountInput, editing: Account | null): Promise<Account> => {
    const now = Date.now();
    const record: Account = editing
      ? { ...editing, ...data, updatedAt: now }
      : { id: crypto.randomUUID(), ...data, isArchived: false, createdAt: now, updatedAt: now };
    await accountsRepo.put(record);
    notifyAccountsChanged();
    return record;
  }, []);

  // Both repos start empty until their first load resolves — without this check, a genuinely-loading
  // screen showed the same "Account not found" message below as an actually-deleted account (found
  // 2026-08-28, real-device performance pass: `accounts`/`allExpenses` are both `[]` on first render,
  // so `!account` was true during every cold load, not just a real deletion).
  if (accountsLoading || expensesLoading) {
    return (
      <SafeAreaView edges={[]} className="flex-1 items-center justify-center" style={{ backgroundColor: modeBg }}>
        <PennyLoader size="lg" accessibilityLabel="Loading ledger" />
      </SafeAreaView>
    );
  }

  if (!account) {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <Card className="m-4">
          <EmptyState
            icon="ti-alert-triangle"
            title="Account not found"
            description="This account may have been deleted."
          />
        </Card>
      </SafeAreaView>
    );
  }

  const skippedCount = rows.filter((r) => r.kind === 'skipped-unresolved').length;
  const anomalyCount = rows.filter((r) => r.kind === 'anomaly').length;
  const notCoveredCount = rows.filter((r) => r.kind === 'not-covered').length;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary">Full ledger</Text>
        <Text className="text-xs text-tertiary mt-0.5">{account.name} · every transaction, statement order</Text>
      </View>
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View className="px-4 py-4 gap-3">
          <View className="flex-row items-center justify-between px-3 py-2 rounded-xl border border-theme">
            <Text className="text-xs font-bold text-primary">
              {formatDate(loadedStart)} – {formatDate(windowEnd)}
            </Text>
            <Text className="text-[10px] text-tertiary">
              {rows.length} row{rows.length === 1 ? '' : 's'}
            </Text>
          </View>

          {/* Rows are in ascending statement order (oldest first, matching a real bank statement) —
           *  so "earlier" content belongs ABOVE what's currently shown, extending the same
           *  continuously-growing list rather than swapping to a disconnected window
           *  (docs/plans/bank-reconciliation-ledger.md, refined 2026-08-10 on-device feedback). */}
          <Button
            variant="primary"
            icon="ti-chevron-up"
            fullWidth
            onPress={() => setLoadedStart((prev) => prev - WINDOW_DAYS * DAY_MS)}
          >
            Load earlier transactions
          </Button>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                icon="ti-file-off"
                title="No transactions in this window"
                description="Try an earlier window, or import a bank statement to start reconciling this account."
              />
            </Card>
          ) : (
            <>
              <View
                className="flex-row items-center gap-3 px-3 py-1.5 rounded-t-xl border border-b-0 border-theme"
                style={{ backgroundColor: theme.surface }}
              >
                <View className="flex-row items-center gap-1">
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.textPrimary }} />
                  <Text className="text-[8.5px] text-secondary">Statement</Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                  <Text className="text-[8.5px] text-secondary">Penny</Text>
                </View>
              </View>
              <View className="rounded-b-xl border border-theme overflow-hidden">
                {rows.map((row, i) => (
                  <LedgerRowView
                    key={`${row.kind}-${row.date}-${i}`}
                    row={row}
                    accountName={
                      row.expense?.otherAccountId ? accountMap.get(row.expense.otherAccountId)?.name : undefined
                    }
                    onPress={
                      row.kind === 'matched' || row.kind === 'skipped-unresolved' ? () => setActionRow(row) : undefined
                    }
                  />
                ))}
              </View>
            </>
          )}

          {(skippedCount > 0 || anomalyCount > 0 || notCoveredCount > 0) && (
            <Banner variant="info" icon="ti-info-circle">
              {[
                skippedCount > 0 ? `${skippedCount} row${skippedCount === 1 ? '' : 's'} still skipped` : null,
                anomalyCount > 0
                  ? `${anomalyCount} genuine anomal${anomalyCount === 1 ? 'y' : 'ies'} (not in statement)`
                  : null,
                notCoveredCount > 0 ? `${notCoveredCount} outside any imported statement's coverage` : null
              ]
                .filter(Boolean)
                .join(' · ')}{' '}
              — none of these affect your verified checkpoints above.
            </Banner>
          )}
        </View>
      </ScrollView>

      {actionRow && actionRow.kind === 'matched' && (
        <RowActionModal
          title="Fix this match"
          subtitle={`${formatDate(actionRow.date)} · this statement line is currently linked to an expense.`}
          context={[
            {
              label: 'Statement',
              value: `${actionRow.statement?.rawNarration ?? ''} · ${formatCurrency(actionRow.statement?.amount ?? 0)}`
            },
            {
              label: 'Currently linked to',
              value: `${actionRow.expense?.description ?? ''} · ${formatCurrency(actionRow.expense?.amount ?? 0)}`
            }
          ]}
          options={[
            {
              icon: 'ti-arrows-exchange',
              iconColor: theme.info,
              iconBg: tint(theme.info, 15),
              label: "This isn't the right match",
              description: 'Choose the correct transaction instead',
              onPress: () => {
                setPickerRow({ row: actionRow, mode: 'relink' });
                setActionRow(null);
              }
            },
            {
              icon: 'ti-x',
              iconColor: theme.danger,
              iconBg: tint(theme.danger, 12),
              label: 'Unmatch',
              description: 'Nothing recorded corresponds to this statement line',
              onPress: () => {
                setUnmatchRow(actionRow);
                setActionRow(null);
              }
            }
          ]}
          onClose={() => setActionRow(null)}
        />
      )}

      {actionRow && actionRow.kind === 'skipped-unresolved' && (
        <RowActionModal
          title="Resolve this statement line"
          subtitle={`${formatDate(actionRow.date)} · never became a recorded transaction.`}
          context={[
            {
              label: 'Statement',
              value: `${actionRow.statement?.rawNarration ?? ''} · ${formatCurrency(actionRow.statement?.amount ?? 0)}`
            }
          ]}
          options={[
            {
              icon: 'ti-search',
              iconColor: theme.info,
              iconBg: tint(theme.info, 15),
              label: 'Pick the matching transaction',
              description: "Already recorded, just wasn't linked",
              onPress: () => {
                setPickerRow({ row: actionRow, mode: 'resolve' });
                setActionRow(null);
              }
            },
            {
              icon: 'ti-plus',
              iconColor: theme.primary,
              iconBg: tint(theme.primary, 12),
              label: 'Add as a new transaction',
              description: 'Never recorded — log it now',
              onPress: () => {
                setAddNewRow(actionRow);
                setActionRow(null);
              }
            },
            {
              icon: 'ti-minus',
              iconColor: theme.textTertiary,
              iconBg: tint(theme.textTertiary, 12),
              label: 'Not mine, dismiss',
              description: 'Stop flagging this line',
              onPress: () => {
                void dismissRow(actionRow);
                setActionRow(null);
              }
            }
          ]}
          onClose={() => setActionRow(null)}
        />
      )}

      <ConfirmDialog
        isOpen={unmatchRow !== null}
        onClose={() => setUnmatchRow(null)}
        onConfirm={handleUnmatchConfirm}
        title="Unmatch this line?"
        message={
          unmatchRow
            ? `"${unmatchRow.expense?.description ?? ''}" stays exactly as recorded — it just won't be linked to this statement line anymore. "${unmatchRow.statement?.rawNarration ?? ''}" goes back to showing as unresolved in the ledger, same as any other skipped row, until you relink or resolve it.`
            : ''
        }
        confirmLabel="Unmatch"
        confirmVariant="danger"
      />

      {pickerRow && (
        <PossibleMatchPickerModal
          statementLine={{
            rawNarration: pickerRow.row.statement?.rawNarration ?? '',
            date: pickerRow.row.date,
            amount: Math.abs(pickerRow.row.statement?.amount ?? 0),
            direction: (pickerRow.row.statement?.amount ?? 0) >= 0 ? 'credit' : 'debit',
            rowIndex: 0
          }}
          candidatePool={candidatePool}
          accountMap={accountMap}
          masked={false}
          onPick={handlePick}
          onClose={() => setPickerRow(null)}
        />
      )}

      {addNewRow && (
        <ExpenseForm
          categories={categories}
          hashtags={hashtags}
          editing={null}
          activeEvents={[]}
          statementPreset={addNewPreset}
          saveAccount={saveAccountForForm}
          searchMerchant={() => []}
          onSave={handleAddNewSave}
          onDelete={async () => {}}
          onClose={() => setAddNewRow(null)}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * A generic option-menu, built from `Modal` + a plain list of bordered rows — reused for both the
 * matched-row "Fix this match" and skipped-row "Resolve this statement line" menus. Centered, per
 * `docs/DESIGN_GUIDELINES.md`'s non-negotiable "centered modals, never bottom sheets" rule — the
 * phase-2 mockup's own bottom-sheet chrome doesn't carry over, only its options/content do.
 */
function RowActionModal({
  title,
  subtitle,
  context,
  options,
  onClose
}: {
  title: string;
  subtitle: string;
  context: { label: string; value: string }[];
  options: {
    icon: string;
    iconColor: string;
    iconBg: string;
    label: string;
    description: string;
    onPress: () => void;
  }[];
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} title={title}>
      <View className="gap-3">
        <Text className="text-xs text-tertiary -mt-2">{subtitle}</Text>
        <Card padding="sm" radius="md">
          {context.map((c) => (
            <View key={c.label} className="flex-row items-center justify-between py-0.5">
              <Text className="text-[10px] uppercase tracking-wide text-tertiary">{c.label}</Text>
              <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
                {c.value}
              </Text>
            </View>
          ))}
        </Card>
        <View className="gap-2">
          {options.map((opt) => (
            <Pressable
              key={opt.label}
              onPress={opt.onPress}
              className="flex-row items-center gap-3 rounded-xl border border-theme p-3"
            >
              <View className="w-9 h-9 rounded-lg items-center justify-center" style={{ backgroundColor: opt.iconBg }}>
                <Icon name={opt.icon} size={16} color={opt.iconColor} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-primary">{opt.label}</Text>
                <Text className="text-[11px] text-tertiary mt-0.5">{opt.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function LedgerRowView({
  row,
  accountName,
  onPress
}: {
  row: LedgerRow;
  accountName: string | undefined;
  /** Present only for `'matched'`/`'skipped-unresolved'` rows — Phase 2's action menu (which includes
   *  "Not mine, dismiss" as one of its options — a skipped row has no separate standalone dismiss
   *  action anymore, now that everything funnels through one tap target). `'anomaly'`/`'not-covered'`
   *  rows have no action of their own (see this file's own top doc comment). */
  onPress: (() => void) | undefined;
}) {
  const theme = useThemeColors();
  const tintBg =
    row.kind === 'anomaly'
      ? tint(theme.danger, 6)
      : row.kind === 'not-covered'
        ? tint(theme.textTertiary, 6)
        : row.kind === 'skipped-unresolved'
          ? tint(theme.warning, 6)
          : undefined;

  const Container = onPress ? Pressable : View;

  return (
    <Container
      className="flex-row border-t border-theme"
      style={{ backgroundColor: theme.surface }}
      {...(onPress ? { onPress } : {})}
    >
      <View className="flex-1 px-2 py-2 border-r border-theme min-w-0">
        {row.statement ? (
          <>
            <Text className="text-[8.5px] text-tertiary">{formatDate(row.date)}</Text>
            <Text className="text-[10px] font-semibold text-primary" numberOfLines={1}>
              {row.statement.rawNarration}
            </Text>
            <Text
              className="text-[9px] mt-0.5"
              style={{ color: row.statement.amount >= 0 ? theme.success : theme.danger }}
            >
              {row.statement.amount >= 0 ? '+' : ''}
              {formatCurrency(row.statement.amount)}
            </Text>
          </>
        ) : (
          <Text
            className="text-[9.5px] italic"
            style={{ color: row.kind === 'anomaly' ? theme.danger : theme.textTertiary }}
          >
            {row.kind === 'anomaly' ? 'Not found in statement' : 'Statement not imported for this period'}
          </Text>
        )}
      </View>
      <View className="flex-1 px-2 py-2 min-w-0" style={tintBg ? { backgroundColor: tintBg } : undefined}>
        {row.expense ? (
          <>
            <Text className="text-[8.5px] text-tertiary">{formatDate(row.date)}</Text>
            <Text className="text-[10px] font-semibold text-primary" numberOfLines={1}>
              {row.expense.isTransfer
                ? `→ Transfer${accountName ? ` to ${accountName}` : ''}`
                : row.expense.description}
            </Text>
            <Text
              className="text-[9px] mt-0.5"
              style={{ color: row.expense.amount >= 0 ? theme.success : theme.danger }}
            >
              {row.expense.amount >= 0 ? '+' : ''}
              {formatCurrency(row.expense.amount)}
            </Text>
          </>
        ) : (
          <Text className="text-[9.5px] italic" style={{ color: theme.warning }}>
            Skipped during import. Tap to resolve.
          </Text>
        )}
      </View>
      <View className="items-end justify-center px-2" style={{ minWidth: 64 }}>
        {row.computedBalance !== undefined ? (
          <Text className="text-[9px] font-bold text-primary">{formatCurrency(row.computedBalance)}</Text>
        ) : (
          <Text className="text-[9px] text-tertiary">—</Text>
        )}
      </View>
    </Container>
  );
}
