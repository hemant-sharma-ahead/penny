import { useMemo } from 'react';
import { View, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { accountsRepo, bankStatementImportsRepo, expensesRepo } from '@/core/db/repositories';
import { computeAccountVerificationStatus } from '@/core/bank-import/accountVerification';
import { useRepository } from '@/hooks/useRepository';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';
import { formatCurrency } from '@/lib/formatters';
import { formatDate } from '@/lib/date';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import { Button, Card, EmptyState } from '~/components/ui';
import type { HomeStackParamList } from '~/navigation/HomeStack';
import { useOpeningBalanceResolution } from './useOpeningBalanceResolution';

/**
 * The "check your opening balance" destination (docs/plans/bank-balance-sync.md §7 Stage 4, mockup
 * `bank-balance-sync-v2.html` Frame 2b's second frame) — reuses the anchor-strip VISUAL pattern already
 * established for `OpeningBalancePrompt.tsx` (Stage 3's import-flow screen), but is a genuinely separate,
 * standalone screen: it's reached from the account detail OUTSIDE any active import session, and its
 * three actions differ (directly editing `Account.openingBalance`, jumping to a fresh import, or
 * dismissing — not staging a `PendingOpeningBalanceUpdate` for an in-progress commit).
 */
export function CheckOpeningBalancePage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'CheckOpeningBalance'>>();
  const { accountId } = route.params;
  useDefaultHeaderBack('CheckOpeningBalance');

  const { items: accounts, reload } = useRepository(accountsRepo);
  const { items: allExpenses } = useRepository(expensesRepo);
  const { items: allImportRecords } = useRepository(bankStatementImportsRepo);
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const account = accounts.find((a) => a.id === accountId) ?? null;

  const activeFinding = useMemo(() => {
    if (!account) return undefined;
    const accountTxns = allExpenses.filter((e) => e.accountId === account.id || e.toAccountId === account.id);
    const importRecords = allImportRecords.filter((r) => r.accountId === account.id);
    const status = computeAccountVerificationStatus({
      accountId: account.id,
      openingBalance: account.openingBalance,
      openingBalanceAsOfDate: account.openingBalanceAsOfDate,
      accountTxns,
      importRecords,
      coveredRanges: account.coveredStatementRanges ?? [],
      anchorReference: account.anchorReference,
      dismissed: account.dismissedVerificationFindings ?? []
    });
    return status.activeFinding;
  }, [account, allExpenses, allImportRecords]);

  const { implied, update, dismiss } = useOpeningBalanceResolution(account, activeFinding);

  if (!account || !implied) {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <Card className="m-4">
          <EmptyState
            icon="ti-circle-check"
            title="Nothing to check"
            description="This account's opening balance isn't currently flagged."
          />
        </Card>
      </SafeAreaView>
    );
  }

  async function updateOpeningBalance() {
    await update();
    navigation.goBack();
  }

  async function dismissAndGoBack() {
    await dismiss();
    navigation.goBack();
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary">Opening balance</Text>
        <Text className="text-xs text-tertiary mt-0.5">{account.name}</Text>
      </View>
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View className="px-4 py-4">
          <View className="bg-surface border rounded-xl p-3.5 gap-3" style={{ borderColor: theme.warning }}>
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <Text className="text-[9px] text-tertiary uppercase tracking-wide">Currently set</Text>
                <Text className="text-sm font-extrabold text-primary">{formatCurrency(implied.currentBalance)}</Text>
                {implied.currentAsOfDate && (
                  <Text className="text-[9px] text-tertiary mt-0.5">as of {formatDate(implied.currentAsOfDate)}</Text>
                )}
              </View>
              <Icon name="ti-arrow-right" size={16} color={theme.textTertiary} />
              <View className="flex-1 items-end">
                <Text className="text-[9px] text-tertiary uppercase tracking-wide">Implied by checkpoints</Text>
                <Text className="text-sm font-extrabold" style={{ color: theme.success }}>
                  {formatCurrency(implied.impliedBalance)}
                </Text>
              </View>
            </View>
            <Text className="text-[10px] text-secondary leading-relaxed">
              This only rules out a missing transaction if this date was itself independently verified — if it was a
              typed-in guess, importing an even earlier statement is the only way to fully confirm it.
            </Text>
            {implied.diffStaysConstant === false && (
              <Text className="text-[10px] text-secondary leading-relaxed">
                The gap size also changes later on, so there may be more than one issue — updating this alone may not
                fully resolve it.
              </Text>
            )}
            <View className="gap-1.5">
              <Button variant="primary" fullWidth onPress={updateOpeningBalance}>
                {`Update to ${formatCurrency(implied.impliedBalance)}`}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onPress={() => navigation.navigate('BankImport', { accountId: account.id })}
              >
                Import an earlier statement to confirm
              </Button>
              {(implied.kind === 'checkpoint-mismatch' || implied.kind === 'anchor-disagreement') && (
                <Button
                  variant="ghost"
                  fullWidth
                  onPress={() => navigation.navigate('CheckpointTimeline', { accountId: account.id })}
                >
                  View full reconciliation table
                </Button>
              )}
              <Button variant="ghost" fullWidth onPress={dismissAndGoBack}>
                {`Keep ${formatCurrency(implied.currentBalance)}, dismiss`}
              </Button>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
