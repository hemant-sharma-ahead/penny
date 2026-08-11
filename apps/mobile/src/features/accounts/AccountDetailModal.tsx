import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import {
  CHECKPOINT_ELIGIBLE,
  type AccountVerificationFinding,
  type AccountVerificationStatus
} from '@/core/bank-import/accountVerification';
import type { CheckpointHighlight, CheckpointRowMark } from '~/features/expenses/transactions/TransactionsTab';
import { EntityTransactionsModal } from '~/components/shared';
import { Button } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import type { HomeStackParamList } from '~/navigation/HomeStack';
import { AccountVerificationBanner } from './AccountVerificationBanner';

interface AccountDetailModalProps {
  account: Account;
  txns: Expense[];
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  hashtags: Hashtag[];
  shouldMask: (sensitive: boolean | undefined) => boolean;
  /** `undefined` when this account isn't `CHECKPOINT_ELIGIBLE` at all. */
  verification?: AccountVerificationStatus;
  verificationLoading: boolean;
  onDismiss: (fingerprint: string) => void;
  onReopen: (fingerprint: string) => void;
  onClose: () => void;
}

function buildHighlight(finding: AccountVerificationFinding): CheckpointHighlight | undefined {
  const mismatch = finding.checkpointMismatch;
  if (finding.kind === 'checkpoint-mismatch' && mismatch?.signature === 'steps-partway') {
    const lastAgreeing = mismatch.lastAgreeing;
    if (!lastAgreeing) return undefined; // guaranteed by the signature, guarded explicitly for the type checker
    const marks = new Map<string, CheckpointRowMark>();
    marks.set(lastAgreeing.expenseId, 'agree');
    marks.set(mismatch.firstDisagreeing.expenseId, 'flag');
    return {
      marks,
      dividerBeforeId: mismatch.firstDisagreeing.expenseId,
      dividerLabel: `${formatCurrency(Math.abs(mismatch.diff))} gap`,
      scrollToId: lastAgreeing.expenseId
    };
  }
  if (finding.kind === 'standing-gap' && finding.standingGapExpenses) {
    const first = finding.standingGapExpenses[0];
    if (!first) return undefined;
    // `'gap'`, not `'flag'` — `'flag'`/`'still'` are checkpoint-mismatch-only terms ("first/still
    // disagreeing checkpoint"), which don't apply to a standing-gap finding: every flagged transaction
    // here is an equal member of the same finding, not a specific first-vs-others distinction (bug
    // found via on-device testing 2026-08-09: every row wrongly said "First disagreeing").
    const marks = new Map<string, CheckpointRowMark>();
    for (const e of finding.standingGapExpenses) marks.set(e.id, 'gap');
    return { marks, scrollToId: first.id };
  }
  return undefined;
}

/**
 * Wraps `EntityTransactionsModal` with the Stage 4 snapshot banner + transaction-list drill-in
 * (docs/plans/bank-balance-sync.md §7 Stage 4, mockup `bank-balance-sync-v2.html` Frames 2/3). Kept
 * separate from `AccountList.tsx` itself so that file doesn't need to own the drill-in/banner-expanded
 * local state directly. Generic-modal decoupling: all of this component's own bank-import-specific
 * knowledge lives here, never inside `EntityTransactionsModal` (shared with categories/tags/goals too).
 */
export function AccountDetailModal({
  account,
  txns,
  categoryMap,
  accountMap,
  hashtags,
  shouldMask,
  verification,
  verificationLoading,
  onDismiss,
  onReopen,
  onClose
}: AccountDetailModalProps) {
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [drillIn, setDrillIn] = useState<AccountVerificationFinding | null>(null);

  const eligible = CHECKPOINT_ELIGIBLE.has(account.type);
  const neverImported = (account.coveredStatementRanges?.length ?? 0) === 0;
  const verifiedThroughDate = useMemo(() => {
    const ranges = account.coveredStatementRanges ?? [];
    return ranges.length === 0 ? undefined : Math.max(...ranges.map((r) => r.end));
  }, [account.coveredStatementRanges]);
  const dismissedAt = account.dismissedVerificationFindings?.find(
    (d) => d.fingerprint === verification?.dismissedFinding?.fingerprint
  )?.dismissedAt;

  // Memoized on `drillIn` alone (not recomputed on every unrelated re-render, e.g. a dismiss elsewhere
  // updating `verification`) — `TransactionsTab`'s own `rows` memo keys off this object's identity, and
  // a fresh `Map` every render would defeat that for no reason (CLAUDE.md's "trace the whole prop
  // chain back to its source" memoization lesson).
  const highlight = useMemo(() => (drillIn ? buildHighlight(drillIn) : undefined), [drillIn]);

  const banner =
    eligible && !drillIn ? (
      <AccountVerificationBanner
        loading={verificationLoading}
        neverImported={neverImported}
        status={verification ?? { needsAttention: false, allFindings: [] }}
        verifiedThroughDate={verifiedThroughDate}
        dismissedAt={dismissedAt}
        onImportStatement={() => {
          onClose();
          navigation.navigate('BankImport', { accountId: account.id });
        }}
        onInvestigate={(finding) => setDrillIn(finding)}
        onCheckOpeningBalance={() => {
          onClose();
          navigation.navigate('CheckOpeningBalance', { accountId: account.id });
        }}
        onDismiss={onDismiss}
        onReopen={onReopen}
        onViewTable={() => {
          onClose();
          navigation.navigate('CheckpointTimeline', { accountId: account.id });
        }}
      />
    ) : drillIn ? (
      <View
        className="flex-row items-center gap-2 rounded-xl border p-2.5"
        style={{ borderColor: theme.danger, backgroundColor: theme.surfaceSecondary }}
      >
        <Text className="flex-1 text-[10.5px]" style={{ color: theme.danger }}>
          ↓ Scrolled to the flagged {drillIn.kind === 'standing-gap' ? 'transaction(s)' : 'window'} below
        </Text>
      </View>
    ) : undefined;

  // Found + fixed 2026-08-11, on-device testing: a `'standing-gap'` drill-in (an unlinked expense
  // inside a covered period) had NO footer action at all — dead end, no way forward once you'd seen
  // the highlighted row. `CheckpointTimeline`'s own reconciliation table wouldn't even help here (it
  // only shows checkpoint-carrying rows, never an anomaly like this one) — `FullLedger` is the actual
  // fix path, since resolving the anomaly's real statement-side counterpart there is what makes this
  // finding disappear.
  const footer =
    drillIn?.kind === 'standing-gap' ? (
      <Button
        variant="ghost"
        fullWidth
        onPress={() => {
          onClose();
          navigation.navigate('FullLedger', { accountId: account.id });
        }}
      >
        View full ledger
      </Button>
    ) : drillIn && (drillIn.kind === 'checkpoint-mismatch' || drillIn.kind === 'anchor-disagreement') ? (
      <Button
        variant="ghost"
        fullWidth
        onPress={() => {
          onClose();
          navigation.navigate('CheckpointTimeline', { accountId: account.id });
        }}
      >
        View full reconciliation table
      </Button>
    ) : undefined;

  return (
    <EntityTransactionsModal
      title={account.name}
      statLabel="Current balance"
      statValue={
        shouldMask(account.hideInSafeMode)
          ? '••••'
          : formatCurrency(computeBalance(account.id, account.openingBalance, txns))
      }
      expenses={txns.filter((t) => t.accountId === account.id || t.toAccountId === account.id)}
      categoryMap={categoryMap}
      accountMap={accountMap}
      hashtags={hashtags}
      shouldMask={shouldMask}
      banner={banner}
      checkpointHighlight={highlight}
      footer={footer}
      onClose={onClose}
    />
  );
}
