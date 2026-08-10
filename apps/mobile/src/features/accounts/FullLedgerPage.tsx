import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { Account } from '@/core/db/types';
import { accountsRepo, bankStatementImportsRepo, expensesRepo } from '@/core/db/repositories';
import { buildLedgerRows, type LedgerRow } from '@/core/bank-import/ledger';
import { notifyAccountsChanged, useAccountsRefresh } from '@/hooks/useDataRefresh';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';
import { useRepository } from '@/hooks/useRepository';
import { formatCurrency } from '@/lib/formatters';
import { formatDate, formatDateShort } from '@/lib/date';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { useThemeColors } from '~/theme/useThemeColors';
import { Banner, Card, EmptyState } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import type { HomeStackParamList } from '~/navigation/HomeStack';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 60;

/**
 * Full Ledger (`docs/plans/bank-reconciliation-ledger.md`, Phase 1 — read-only) — a dense,
 * row-by-row Statement ⟷ Expense reconciliation for a chosen date window, reached from
 * `CheckpointTimelinePage`'s "View full ledger ›". A deeper zoom on the SAME feature family, not a
 * competing screen — that page's own sparse checkpoint table, the anchor-boundary divider, and the
 * account badge are all untouched by this one.
 */
export function FullLedgerPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const route = useRoute<RouteProp<HomeStackParamList, 'FullLedger'>>();
  const { accountId } = route.params;
  useDefaultHeaderBack('FullLedger');

  const { items: accounts, reload: reloadAccounts } = useRepository(accountsRepo);
  const { items: allExpenses, reload: reloadExpenses } = useRepository(expensesRepo);
  const { items: allImportRecords } = useRepository(bankStatementImportsRepo);
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
      <ScrollView className="flex-1">
        <View className="px-4 py-4 gap-3">
          <View className="flex-row items-center justify-between px-3 py-2 rounded-xl border border-theme">
            <Text className="text-xs font-bold text-primary">
              {formatDateShort(loadedStart)} – {formatDate(windowEnd)}
            </Text>
            <Text className="text-[10px] text-tertiary">
              {rows.length} row{rows.length === 1 ? '' : 's'}
            </Text>
          </View>

          {/* Rows are in ascending statement order (oldest first, matching a real bank statement) —
           *  so "earlier" content belongs ABOVE what's currently shown, extending the same
           *  continuously-growing list rather than swapping to a disconnected window
           *  (docs/plans/bank-reconciliation-ledger.md, refined 2026-08-10 on-device feedback). */}
          <Pressable
            onPress={() => setLoadedStart((prev) => prev - WINDOW_DAYS * DAY_MS)}
            className="flex-row items-center justify-center gap-1.5 py-2.5 rounded-full border border-theme"
          >
            <Icon name="ti-chevron-up" size={13} color={theme.textSecondary} />
            <Text className="text-xs font-semibold text-secondary">Load earlier transactions</Text>
          </Pressable>

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
                    onDismiss={() => dismissRow(row)}
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
    </SafeAreaView>
  );
}

function LedgerRowView({
  row,
  accountName,
  onDismiss
}: {
  row: LedgerRow;
  accountName: string | undefined;
  onDismiss: () => void;
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

  return (
    <View className="flex-row border-t border-theme" style={{ backgroundColor: theme.surface }}>
      <View className="flex-1 px-2 py-2 border-r border-theme min-w-0">
        {row.statement ? (
          <>
            <Text className="text-[8.5px] text-tertiary">{formatDateShort(row.date)}</Text>
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
            <Text className="text-[8.5px] text-tertiary">{formatDateShort(row.date)}</Text>
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
          <>
            <Text className="text-[9.5px] italic" style={{ color: theme.warning }}>
              Skipped during import. Reimport the statement to resolve this.
            </Text>
            <Pressable onPress={onDismiss} hitSlop={6}>
              <Text className="text-[9px] underline mt-1" style={{ color: theme.textTertiary }}>
                Dismiss, not mine
              </Text>
            </Pressable>
          </>
        )}
      </View>
      <View className="items-end justify-center px-2" style={{ minWidth: 64 }}>
        {row.computedBalance !== undefined ? (
          <Text className="text-[9px] font-bold text-primary">{formatCurrency(row.computedBalance)}</Text>
        ) : (
          <Text className="text-[9px] text-tertiary">—</Text>
        )}
      </View>
    </View>
  );
}
