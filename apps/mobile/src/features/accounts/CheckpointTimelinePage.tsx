import { Fragment, useMemo } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account } from '@/core/db/types';
import { accountsRepo, bankStatementImportsRepo, expensesRepo } from '@/core/db/repositories';
import { delta } from '@/core/accounts/balanceCalculator';
import { computeCheckpointDiagnostics, type CheckpointComparison } from '@/core/bank-import/checkpointDiagnostics';
import { computeAccountVerificationStatus } from '@/core/bank-import/accountVerification';
import { mergeCoveredRanges, detectCoverageGap } from '@/core/bank-import/coverage';
import { useRepository } from '@/hooks/useRepository';
import { useAccountsRefresh } from '@/hooks/useDataRefresh';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';
import { formatCurrency } from '@/lib/formatters';
import { formatDate, formatDateShort } from '@/lib/date';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { useThemeColors } from '~/theme/useThemeColors';
import { Banner, Button, Card, EmptyState } from '~/components/ui';
import { tint } from '~/lib/color';
import type { HomeStackParamList } from '~/navigation/HomeStack';
import { useOpeningBalanceResolution, type OpeningBalanceImplied } from './useOpeningBalanceResolution';

/**
 * The full checkpoint-diff timeline (docs/plans/bank-balance-sync.md §7 Stage 4, mockup `bank-balance-
 * sync-v2.html` Frame 4). Self-contained (loads its own account + expenses, same pattern as
 * `BankImportHistoryPage.tsx`) rather than receiving pre-computed data via route params — this is a real
 * screen reachable from more than one place (the drill-in's "View full reconciliation table ›", and
 * directly for a `'flat-from-start'`/anchor-disagreement finding with nothing to drill into first).
 *
 * Branches its own rendering per diagnostic signature (mockup's two Frame 4 variants) rather than being
 * two separate routes — both read the exact same underlying diagnostic, just render/act differently.
 *
 * **Anchor-boundary extension (2026-08-09, `bank-balance-sync-v3.html`'s "#optiond" — "two
 * self-consistent halves, one explicit boundary marker")**: with the 2026-08-09 fix that makes
 * `Account.openingBalance`/`openingBalanceAsOfDate` ALWAYS sit at the true earliest transaction date
 * (even across a flagged §14b disagreement), a single `computeCheckpointDiagnostics()` call over the
 * WHOLE ledger already naturally walks through both the backfilled period and the original period
 * continuously — so there's no need for two separate table cards, just one extra divider row at the
 * boundary (`account.anchorReference.oldAnchorDate`), reading its diff LIVE off the current diagnostic
 * (`recomputeAnchorAgreement`, via `useOpeningBalanceResolution`) rather than a frozen snapshot — the
 * exact fix for the on-device bug where a corrective re-import that actually fixed the ledger left the
 * stale disagreement showing forever.
 */
export function CheckpointTimelinePage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'CheckpointTimeline'>>();
  const { accountId } = route.params;
  useDefaultHeaderBack('CheckpointTimeline');

  const { items: accounts, reload: reloadAccounts } = useRepository(accountsRepo);
  const { items: allExpenses, reload: reloadExpenses } = useRepository(expensesRepo);
  const { items: allImportRecords } = useRepository(bankStatementImportsRepo);
  // The anchor-boundary divider's own Update/Keep actions write straight to `accountsRepo` (via
  // `useOpeningBalanceResolution`) without navigating away — this page needs to actually see that write
  // to re-render the resolved state, unlike `CheckOpeningBalancePage.tsx`'s equivalent actions, which
  // always `navigation.goBack()` immediately after and so never needed this subscription.
  useAccountsRefresh(reloadAccounts);
  // Found + fixed 2026-08-10 (`FullLedgerPage.tsx`'s identical fix) — this page can stay mounted in
  // the background while a transaction gets recorded elsewhere; without this, its own checkpoint walk
  // kept running against a stale `allExpenses` snapshot from whenever it first mounted.
  useTxnRefresh(reloadExpenses);
  const account = accounts.find((a) => a.id === accountId) ?? null;

  // Description + this row's own signed amount (found via on-device feedback 2026-08-09: the table only
  // ever showed the running balance, never what actually moved between checkpoints) — `delta()` gives the
  // amount signed relative to THIS account specifically, so a transfer's credit/debit direction is always
  // correct regardless of which side of it this account is on.
  const txnDetailById = useMemo(
    () => new Map(allExpenses.map((e) => [e.id, { description: e.description, amount: delta(accountId, e) }])),
    [allExpenses, accountId]
  );

  const diagnostics = useMemo(() => {
    if (!account) return null;
    const accountTxns = allExpenses.filter((e) => e.accountId === account.id || e.toAccountId === account.id);
    return computeCheckpointDiagnostics(
      account.id,
      account.openingBalance,
      accountTxns,
      account.openingBalanceAsOfDate
    );
  }, [account, allExpenses]);

  // The anchor-disagreement finding, looked up directly from `allFindings` (NOT `activeFinding`) —
  // deliberately independent of `accountVerification.ts`'s checkpoint-mismatch > anchor-disagreement >
  // standing-gap priority order, since that order only picks ONE finding for the account-level badge;
  // this divider needs to know whether an anchor-disagreement is live regardless of whether some OTHER,
  // higher-priority finding also happens to be active on this same account right now. `allFindings` only
  // ever contains this finding when the LIVE recompute still disagrees (`recomputeAnchorAgreement`) — so
  // its absence here, when `account.anchorReference` is still set, is itself the "resolved" signal.
  const anchorFinding = useMemo(() => {
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
    return status.allFindings.find((f) => f.kind === 'anchor-disagreement');
  }, [account, allExpenses, allImportRecords]);

  const {
    implied: anchorImplied,
    update: updateAnchor,
    dismiss: dismissAnchor
  } = useOpeningBalanceResolution(account, anchorFinding);

  if (!account || !diagnostics) {
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

  const signature = diagnostics.mismatch?.signature;
  const firstDisagreeingIndex = diagnostics.mismatch
    ? diagnostics.comparisons.findIndex((c) => c.expenseId === diagnostics.mismatch?.firstDisagreeing.expenseId)
    : -1;

  const anchorRef = account.anchorReference;
  // First checkpoint at/after the OLD anchor's own date — the boundary between "this backfill's own
  // statement" (everything before) and "already verified, unchanged from today" (everything from here
  // on). `-1` when nothing checkpointed exists at/after that date (nothing to anchor the divider to) —
  // the divider is simply not rendered in that case, a documented, harmless fallback.
  const boundaryIndex = anchorRef ? diagnostics.comparisons.findIndex((c) => c.date >= anchorRef.oldAnchorDate) : -1;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary">Reconciliation</Text>
        <Text className="text-xs text-tertiary mt-0.5">{account.name}</Text>
      </View>
      <ScrollView className="flex-1">
        <View className="px-4 py-4 gap-3">
          <Text className="text-[11px] text-secondary leading-relaxed">
            Comparing Penny's running balance against your bank's own stated balance after each checkpointed
            transaction.
          </Text>

          {diagnostics.comparisons.length === 0 ? (
            <Card>
              <EmptyState
                icon="ti-file-off"
                title="No checkpoints yet"
                description="Import a bank statement with a balance column to start verifying this account."
              />
            </Card>
          ) : (
            <View className="rounded-xl border border-theme overflow-hidden">
              <View
                className="flex-row items-center justify-between px-3 py-2"
                style={{ backgroundColor: theme.surfaceSecondary }}
              >
                <View>
                  <Text className="text-[8px] font-bold uppercase tracking-wide text-tertiary">Opening balance</Text>
                  {account.openingBalanceAsOfDate !== undefined && (
                    <Text className="text-[8px] text-tertiary mt-0.5">
                      as of {formatDate(account.openingBalanceAsOfDate)}
                    </Text>
                  )}
                </View>
                <Text className="text-[11px] font-extrabold text-primary">
                  {formatCurrency(account.openingBalance)}
                </Text>
              </View>
              {/* Balance-column legend (found + fixed 2026-08-09, on-device feedback: the table showed
               *  neither the bank's own stated balance nor an explicit "which number is which" cue) —
               *  stated once here, never repeated per row; color alone (dark = Statement, primary accent =
               *  Penny) carries the distinction below. Diff's own green/red is a SEPARATE signal
               *  (agrees/disagrees) — deliberately not reused for Statement/Penny, so the two meanings
               *  never collide on the same row. */}
              <View
                className="flex-row items-center gap-3 px-3 py-1.5 border-t border-theme"
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
              <View
                className="flex-row px-3 py-2 border-t border-theme"
                style={{ backgroundColor: theme.surfaceSecondary }}
              >
                <Text className="flex-1 text-[9px] font-extrabold uppercase tracking-wide text-tertiary">Date</Text>
                <Text className="flex-[1.6] text-[9px] font-extrabold uppercase tracking-wide text-tertiary">Txn</Text>
                <Text className="flex-1 text-right text-[9px] font-extrabold uppercase tracking-wide text-tertiary">
                  Balance
                </Text>
                <Text className="flex-1 text-right text-[9px] font-extrabold uppercase tracking-wide text-tertiary">
                  Diff
                </Text>
              </View>
              {diagnostics.comparisons.map((c, i) => (
                <Fragment key={c.expenseId}>
                  {anchorRef && i === 0 && (
                    <TimelineSectionLabel text={`Before ${formatDate(anchorRef.oldAnchorDate)} (this backfill)`} />
                  )}
                  {i === boundaryIndex && (
                    <AnchorBoundaryDivider
                      account={account}
                      implied={anchorImplied}
                      onUpdate={updateAnchor}
                      onKeep={dismissAnchor}
                    />
                  )}
                  {anchorRef && i === boundaryIndex && (
                    <TimelineSectionLabel text={`${formatDate(anchorRef.oldAnchorDate)} onward (already verified)`} />
                  )}
                  <TimelineRow
                    comparison={c}
                    description={txnDetailById.get(c.expenseId)?.description ?? '—'}
                    amount={txnDetailById.get(c.expenseId)?.amount ?? 0}
                    flagged={firstDisagreeingIndex !== -1 && i >= firstDisagreeingIndex}
                    showLastAgreeingDivider={i === firstDisagreeingIndex - 1 && signature === 'steps-partway'}
                  />
                </Fragment>
              ))}
            </View>
          )}

          {diagnostics.mismatch && signature === 'steps-partway' && diagnostics.mismatch.lastAgreeing && (
            <Banner variant="warning" icon="ti-bulb">
              A missing or duplicate transaction between {formatDateShort(diagnostics.mismatch.lastAgreeing.date)} and{' '}
              {formatDateShort(diagnostics.mismatch.firstDisagreeing.date)} — most likely a{' '}
              {formatCurrency(Math.abs(diagnostics.mismatch.diff))} debit or credit that never got recorded. Not an
              opening-balance issue, since earlier checkpoints agree.
            </Banner>
          )}

          {diagnostics.mismatch && signature === 'flat-from-start' && (
            <Banner variant="info" icon="ti-anchor">
              Flat from the very first checkpoint — this points at your opening balance, not a missing row.
            </Banner>
          )}

          {!diagnostics.mismatch && diagnostics.comparisons.length > 0 && !anchorFinding && (
            <Banner variant="success" icon="ti-circle-check">
              Every checkpoint agrees — this account is fully reconciled.
            </Banner>
          )}
        </View>
      </ScrollView>

      <View className="flex-row gap-2 px-4 py-3 border-t border-theme" style={{ backgroundColor: theme.surface }}>
        {diagnostics.mismatch || anchorFinding ? (
          signature === 'flat-from-start' || (!diagnostics.mismatch && anchorFinding) ? (
            <Button
              variant="secondary"
              icon="ti-anchor"
              fullWidth
              onPress={() => navigation.navigate('CheckOpeningBalance', { accountId: account.id })}
            >
              Check opening balance
            </Button>
          ) : (
            <Button variant="ghost" fullWidth onPress={() => navigation.goBack()}>
              I've reviewed this, dismiss
            </Button>
          )
        ) : (
          // `docs/plans/bank-reconciliation-ledger.md` — a deeper zoom into every transaction, not
          // just checkpoints, always reachable even when everything above already agrees.
          <Button
            variant="ghost"
            icon="ti-list-search"
            fullWidth
            onPress={() => navigation.navigate('FullLedger', { accountId: account.id })}
          >
            View full ledger ›
          </Button>
        )}
      </View>
    </SafeAreaView>
  );
}

function TimelineSectionLabel({ text }: { text: string }) {
  const theme = useThemeColors();
  return (
    <View className="px-3 pt-2 pb-1" style={{ backgroundColor: theme.surface }}>
      <Text className="text-[9px] text-tertiary uppercase tracking-wide">{text}</Text>
    </View>
  );
}

/**
 * Determines whether item ① ("a missed transaction between the two statements") genuinely applies —
 * only when there's a real, uncovered calendar-day gap between the covered-range batch ending just
 * before `oldAnchorDate` and the one starting at/after it. Reuses `coverage.ts`'s own
 * `detectCoverageGap`/`mergeCoveredRanges` adjacency logic rather than reinventing it (docs/plans/
 * bank-balance-sync.md §11b). Defaults to `true` (show the item, with its own built-in caveat) when
 * there's no covered range starting at/after `oldAnchorDate` to compare against at all — an ambiguous
 * case where correctness of items ②/③ matters more than perfecting ①'s conditionality.
 */
function hasGapAroundBoundary(account: Account, oldAnchorDate: number): boolean {
  const merged = mergeCoveredRanges(account.coveredStatementRanges ?? []);
  const nextRange = merged.filter((r) => r.start >= oldAnchorDate).sort((a, b) => a.start - b.start)[0];
  if (!nextRange) return true;
  const priorRanges = merged.filter((r) => r.end < oldAnchorDate);
  return detectCoverageGap(nextRange, priorRanges) !== null;
}

/**
 * The anchor-boundary marker (docs/plans/bank-balance-sync.md §7 Stage 3/4, mockup
 * `bank-balance-sync-v3.html`'s "#optiond" — "two self-consistent halves, one explicit boundary
 * marker"). `implied` is `undefined` exactly when the live recompute no longer disagrees (a corrective
 * import already fixed the ledger) — renders the resolved acknowledgement instead of the
 * checklist+buttons in that case, the concrete fix for the on-device bug where this stayed frozen
 * forever.
 */
function AnchorBoundaryDivider({
  account,
  implied,
  onUpdate,
  onKeep
}: {
  account: Account;
  implied: OpeningBalanceImplied | undefined;
  onUpdate: () => void;
  onKeep: () => void;
}) {
  const theme = useThemeColors();
  const ref = account.anchorReference;
  if (!ref) return null;

  if (!implied) {
    return (
      <View className="items-center py-2.5 px-3" style={{ backgroundColor: tint(theme.success, 10) }}>
        <Text className="text-[10.5px] font-semibold" style={{ color: theme.success }}>
          ✓ This gap has been resolved — the two statements now agree
        </Text>
      </View>
    );
  }

  const diff = implied.impliedBalance - implied.currentBalance;
  const showGapItem = hasGapAroundBoundary(account, ref.oldAnchorDate);

  return (
    <View
      className="px-3.5 py-3"
      style={{
        backgroundColor: tint(theme.danger, 8),
        borderTopWidth: 2,
        borderBottomWidth: 2,
        borderColor: theme.danger
      }}
    >
      <Text className="text-[11px] font-extrabold mb-1.5" style={{ color: theme.danger }}>
        {`⚠ ANCHOR BOUNDARY — ${formatDate(ref.oldAnchorDate)}`}
      </Text>
      <Text className="text-[10.5px] leading-relaxed mb-2" style={{ color: theme.danger }}>
        {`This backfill's own math implies ${formatCurrency(implied.impliedBalance)} here. Your account currently has ${formatCurrency(implied.currentBalance)} recorded for this date — a ${formatCurrency(Math.abs(diff))} gap.`}
      </Text>
      <View className="bg-surface border rounded-lg p-2.5 mb-2.5" style={{ borderColor: theme.border }}>
        <Text className="text-[9px] font-extrabold uppercase tracking-wide text-tertiary mb-1.5">
          Penny can't tell which of these is true — worth checking your real statement for
        </Text>
        {showGapItem && (
          <Text className="text-[10px] text-secondary leading-relaxed mb-1">
            ① A missed transaction between the two statements — only applies if there's an actual gap between them;
            check your coverage history.
          </Text>
        )}
        <Text className="text-[10px] text-secondary leading-relaxed mb-1">
          {showGapItem ? '②' : '①'} An error in the earlier statement itself — often its very first row (worth
          re-checking against the original PDF/passbook).
        </Text>
        <Text className="text-[10px] text-secondary leading-relaxed">
          {showGapItem ? '③' : '②'} Less likely: the original opening figure itself was wrong, or an entry is missing
          from the later period.
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Button variant="primary" fullWidth onPress={onUpdate}>
          {`Update to ${formatCurrency(implied.impliedBalance)}`}
        </Button>
        <Button variant="secondary" fullWidth onPress={onKeep}>
          {`Keep ${formatCurrency(implied.currentBalance)} ✓ (already flagged)`}
        </Button>
      </View>
    </View>
  );
}

function TimelineRow({
  comparison,
  description,
  amount,
  flagged,
  showLastAgreeingDivider
}: {
  comparison: CheckpointComparison;
  description: string;
  /** This row's own signed amount, relative to the account this whole page is for (found + fixed
   *  2026-08-09 — see the page's own `txnDetailById` doc comment). */
  amount: number;
  flagged: boolean;
  showLastAgreeingDivider: boolean;
}) {
  const theme = useThemeColors();
  return (
    <>
      <View
        className="flex-row items-center px-3 py-2 border-t border-theme"
        style={flagged ? { backgroundColor: tint(theme.danger, 7) } : undefined}
      >
        <Text className="flex-1 text-[10px] text-secondary">{formatDateShort(comparison.date)}</Text>
        <View className="flex-[1.6]">
          <Text className="text-[10px] font-semibold text-primary" numberOfLines={1}>
            {description}
          </Text>
          <Text className="text-[8.5px]" style={{ color: amount >= 0 ? theme.success : theme.danger }}>
            {amount >= 0 ? '+' : ''}
            {formatCurrency(amount)}
          </Text>
        </View>
        {/* Statement (top, always dark) over Penny (bottom, always the primary accent) — color alone
         *  distinguishes them per the legend stated once in the table header above; never re-tinted
         *  red/green here even on a disagreeing row, so this color pairing never collides with Diff's own
         *  agree/disagree signal on the same row. */}
        <View className="flex-1 items-end">
          <Text className="text-[10px] font-bold" style={{ color: theme.textPrimary }}>
            {formatCurrency(comparison.statementBalance)}
          </Text>
          <Text className="text-[9px] font-semibold" style={{ color: theme.primary }}>
            {formatCurrency(comparison.computedBalance)}
          </Text>
        </View>
        <Text
          className="flex-1 text-right text-[10px] font-bold"
          style={{ color: comparison.diff === 0 ? theme.success : theme.danger }}
        >
          {comparison.diff > 0 ? '+' : ''}
          {formatCurrency(comparison.diff)}
        </Text>
      </View>
      {showLastAgreeingDivider && (
        <View className="items-center py-1" style={{ backgroundColor: theme.surfaceSecondary }}>
          <Text className="text-[9px] text-tertiary">— last agreeing checkpoint —</Text>
        </View>
      )}
    </>
  );
}
