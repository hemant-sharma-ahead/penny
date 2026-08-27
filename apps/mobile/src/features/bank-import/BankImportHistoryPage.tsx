import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account, Expense, ImportBatchSummary } from '@/core/db/types';
import { accountsRepo, bankStatementImportsRepo, expensesRepo } from '@/core/db/repositories';
import { findStandingCoverageGaps } from '@/core/bank-import/coverage';
import { useRepository } from '@/hooks/useRepository';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';
import { formatCurrency } from '@/lib/formatters';
import { formatDate } from '@/lib/date';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import { Banner, Card, EmptyState, ListContainer } from '~/components/ui';
import type { HomeStackParamList } from '~/navigation/HomeStack';

/** Same statement-importable account types as `AccountList.tsx`'s own `STATEMENT_IMPORTABLE` set —
 *  Import History is batch-level history, kept for both `bank` and `credit_card` accounts alike (unlike
 *  the checkpoint/balance-sync guarantee itself, which stays bank-only — see
 *  `docs/mockups/proposals/bank-balance-sync-v2.html` §1's own "batch-level facts, not checkpoint
 *  facts" distinction). Duplicated as a literal here rather than imported — feature modules must not
 *  cross-import (`CONTRIBUTING.md`'s "Architecture rules"). */
const STATEMENT_IMPORTABLE = new Set<Account['type']>(['bank', 'credit_card']);

/**
 * Import History (docs/plans/bank-balance-sync.md §5/§11a, mockup v2 §4, plan §7 Stage 2, built
 * 2026-08-08) — reachable from `AccountsPage.tsx`'s header, the same way as "Merchant recognition" /
 * "Cash-withdrawal codes". Unlike those two globally-scoped screens, this is inherently per-account
 * data (`Account.coveredStatementRanges`) — a real difference from the mockup's own frames, which show
 * the list/detail screens already scoped to one account. Deviation (documented in the plan, not
 * freelanced silently): since the only entry point is one global header icon, this page owns one extra
 * "which account?" step itself before the v2 mockup's own list/detail states, rather than adding a
 * second, per-row entry point that would duplicate the existing per-row "Import" action's own place in
 * `AccountList.tsx`.
 *
 * Three states, one component, driven by local state rather than three separate stack screens —
 * `useRegisterHeaderScreen`'s own custom `backHandler` steps back through them one at a time (batch
 * detail → batch list → account picker) before finally popping the stack.
 */
export function BankImportHistoryPage() {
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'BankImportHistory'>>();
  const { items: accounts } = useRepository(accountsRepo);
  const { items: allExpenses } = useRepository(expensesRepo);
  const { items: allImportRecords, reload: reloadImportRecords } = useRepository(bankStatementImportsRepo);

  const [accountId, setAccountId] = useState<string | null>(route.params?.accountId ?? null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const importableAccounts = useMemo(
    () => accounts.filter((a) => STATEMENT_IMPORTABLE.has(a.type) && !a.isArchived),
    [accounts]
  );
  const account = useMemo(() => accounts.find((a) => a.id === accountId) ?? null, [accounts, accountId]);
  const batches = useMemo(
    () => [...(account?.coveredStatementRanges ?? [])].sort((a, b) => b.importedAt - a.importedAt),
    [account]
  );
  const selectedBatch = batches.find((b) => b.batchId === selectedBatchId) ?? null;

  // Closed-loop sweep (docs/plans/bank-balance-sync.md §3 decision #16) — re-derived fresh every time
  // this screen renders, from the account's ENTIRE covered history, not just one batch. Placeholder
  // surface: this is decision #16's "surface for now" call, pending Stage 4's persistent "unverified
  // account" badge, which should absorb this finding into the SAME indicator rather than this staying
  // a second, separate one long-term.
  const standingGaps = useMemo(() => {
    if (!account) return [];
    const accountExpenses = allExpenses.filter((e) => e.accountId === account.id || e.toAccountId === account.id);
    const accountImportRecords = allImportRecords.filter((r) => r.accountId === account.id);
    return findStandingCoverageGaps(account.coveredStatementRanges ?? [], accountExpenses, accountImportRecords);
  }, [account, allExpenses, allImportRecords]);

  useRegisterHeaderScreen(
    'BankImportHistory',
    useCallback(() => {
      if (selectedBatchId) {
        setSelectedBatchId(null);
        return;
      }
      // Only step back to the account picker if this page owns that step itself — guards against a
      // future direct per-account entry point (`route.params.accountId` already set), which should
      // pop the stack immediately instead of surfacing a picker step it never showed in the first place.
      if (!route.params?.accountId && accountId) {
        setAccountId(null);
        return;
      }
      navigation.goBack();
    }, [selectedBatchId, accountId, route.params?.accountId, navigation])
  );

  if (!accountId || !account) {
    return <AccountPickerView modeBg={modeBg} importableAccounts={importableAccounts} onSelect={setAccountId} />;
  }

  if (selectedBatch) {
    return <BatchDetailView modeBg={modeBg} account={account} batch={selectedBatch} />;
  }

  return (
    <BatchListView
      modeBg={modeBg}
      account={account}
      batches={batches}
      standingGaps={standingGaps}
      onSelectBatch={setSelectedBatchId}
      reload={reloadImportRecords}
    />
  );
}

function AccountPickerView({
  modeBg,
  importableAccounts,
  onSelect
}: {
  modeBg: string;
  importableAccounts: Account[];
  onSelect: (id: string) => void;
}) {
  const theme = useThemeColors();
  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary">Import history</Text>
        <Text className="text-xs text-tertiary mt-0.5">Choose an account to see its past statement imports.</Text>
      </View>
      <ScrollView className="flex-1">
        <View className="px-4 py-4">
          {importableAccounts.length === 0 ? (
            <Card>
              <EmptyState
                icon="ti-history"
                title="No statement-importable accounts yet"
                description="Add a bank or credit card account and import a statement to build up history here."
              />
            </Card>
          ) : (
            <ListContainer>
              {importableAccounts.map((a) => {
                const count = a.coveredStatementRanges?.length ?? 0;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => onSelect(a.id)}
                    accessibilityLabel={`View import history for ${a.name}`}
                    className="flex-row items-center gap-3 px-4 py-3"
                  >
                    <Icon name={a.icon} size={18} color={theme.textSecondary} />
                    <Text className="flex-1 text-sm font-medium text-primary" numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text className="text-xs text-tertiary">
                      {count} import{count === 1 ? '' : 's'}
                    </Text>
                    <Icon name="ti-chevron-right" size={14} color={theme.textTertiary} />
                  </Pressable>
                );
              })}
            </ListContainer>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BatchListView({
  modeBg,
  account,
  batches,
  standingGaps,
  onSelectBatch,
  reload
}: {
  modeBg: string;
  account: Account;
  batches: ImportBatchSummary[];
  standingGaps: Expense[];
  onSelectBatch: (batchId: string) => void;
  reload: () => unknown;
}) {
  const theme = useThemeColors();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary">Import history</Text>
        <Text className="text-xs text-tertiary mt-0.5">{account.name}</Text>
      </View>
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View className="px-4 py-4 gap-4">
          {standingGaps.length > 0 && (
            // Placeholder surface for the closed-loop sweep (docs/plans/bank-balance-sync.md §3
            // decision #16) — not owned by any one batch below (a standing gap is a fact about the
            // account's whole covered history, not any single import), so it's shown here at the
            // account level, above the batch list. Should eventually be absorbed into Stage 4's
            // persistent "unverified account" badge instead of remaining its own separate indicator.
            <Banner variant="warning" icon="ti-alert-triangle" title="Unexplained transactions found">
              {standingGaps.length === 1
                ? '1 transaction falls inside a period your import history says is fully covered, but no statement line explains it.'
                : `${standingGaps.length} transactions fall inside periods your import history says are fully covered, but no statement line explains them.`}{' '}
              Worth a look — possibly a duplicate, a mis-logged entry, or something missing from a future re-import.
            </Banner>
          )}
          {batches.length === 0 ? (
            <Card>
              <EmptyState
                icon="ti-history"
                title="No imports yet"
                description="Nothing has been imported for this account yet."
              />
            </Card>
          ) : (
            <ListContainer>
              {batches.map((b) => (
                <Pressable
                  key={b.batchId}
                  onPress={() => onSelectBatch(b.batchId)}
                  accessibilityLabel={`View details for ${b.fileName}`}
                  className="flex-row items-center gap-3 px-4 py-3"
                >
                  <View
                    className="w-8 h-8 rounded-lg items-center justify-center shrink-0"
                    style={{ backgroundColor: theme.surfaceSecondary }}
                  >
                    <Icon name="ti-file-check" size={16} color={theme.textSecondary} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                      {b.fileName}
                    </Text>
                    <Text className="text-[11px] text-tertiary mt-0.5" numberOfLines={1}>
                      {formatDate(b.start)}–{formatDate(b.end)} · imported {formatDate(b.importedAt)}
                    </Text>
                  </View>
                  <View className="items-end shrink-0">
                    <Text className="text-xs font-semibold text-primary">{b.addedCount} added</Text>
                    <Text
                      className="text-[11px] mt-0.5"
                      style={{ color: b.skippedCount > 0 ? theme.warning : theme.textTertiary }}
                    >
                      {b.skippedCount} skipped
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ListContainer>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BatchDetailView({ modeBg, account, batch }: { modeBg: string; account: Account; batch: ImportBatchSummary }) {
  const theme = useThemeColors();
  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
          {batch.fileName}
        </Text>
        <Text className="text-xs text-tertiary mt-0.5">{account.name}</Text>
      </View>
      <ScrollView className="flex-1">
        <View className="px-4 py-4 gap-4">
          <Card className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-secondary">Covered range</Text>
              <Text className="text-xs font-semibold text-primary">
                {formatDate(batch.start)}–{formatDate(batch.end)}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-secondary">New</Text>
              <Text className="text-xs font-semibold text-primary">{batch.addedCount}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-secondary">Matched</Text>
              <Text className="text-xs font-semibold text-primary">{batch.matchedCount}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-secondary">Excluded</Text>
              <Text
                className="text-xs font-semibold"
                style={{ color: batch.skippedCount > 0 ? theme.warning : theme.textPrimary }}
              >
                {batch.skippedCount}
              </Text>
            </View>
          </Card>

          {batch.skippedRows.length > 0 && (
            <View className="gap-1">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary px-1">
                Excluded rows
              </Text>
              <ListContainer>
                {batch.skippedRows.map((r, i) => (
                  // No stable id on a historical skipped-row record — index is safe here, this list
                  // never reorders/mutates after the batch is committed.
                  <View key={i} className="flex-row items-center gap-3 px-4 py-3">
                    <View
                      className="w-7 h-7 rounded-lg items-center justify-center shrink-0"
                      style={{ backgroundColor: theme.surfaceSecondary }}
                    >
                      <Icon name="ti-x" size={14} color={theme.textTertiary} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs font-medium text-primary" numberOfLines={1}>
                        {r.rawNarration}
                      </Text>
                      <Text className="text-[11px] text-tertiary mt-0.5">
                        {formatDate(r.date)} · you chose not to add
                      </Text>
                    </View>
                    <Text className="text-xs font-semibold text-primary">{formatCurrency(r.amount)}</Text>
                  </View>
                ))}
              </ListContainer>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
