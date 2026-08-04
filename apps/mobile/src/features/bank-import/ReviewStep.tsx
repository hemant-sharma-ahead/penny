import { useMemo } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { RECONCILIATION_DESCRIPTION } from '@/core/expenses/cashFlowSummary';
import { Button } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { UseBankImportReturn } from './useBankImport';
import { MatchedBucket } from './MatchedBucket';
import { PossibleBucket } from './PossibleBucket';
import { UnmatchedBucket } from './UnmatchedBucket';
import { LoneWolfBucket } from './LoneWolfBucket';

interface ReviewStepProps {
  bi: UseBankImportReturn;
  shouldMask: (sensitive?: boolean) => boolean;
  onImport: () => void;
}

/**
 * The big review screen (mockup `#s3`–`#s7`) — a fixed summary strip (counts frozen from the
 * one-shot matcher pass, docs/plans/bank-statement-import.md §5) plus the 4 collapsible buckets
 * (§6). A sticky bottom bar always shows how much is currently staged and ready to import — nothing
 * here writes to the vault; that only happens on the final "Import" tap (§10b).
 */
export function ReviewStep({ bi, shouldMask, onImport }: ReviewStepProps) {
  const theme = useThemeColors();
  const masked = shouldMask(false);

  const accountMap = useMemo(() => new Map(bi.accounts.map((a) => [a.id, a])), [bi.accounts]);

  /** Every recorded transaction eligible to be linked to this account's statement lines — the same
   *  pool the matcher itself draws from, recomputed here so the manual picker (widen range / whole
   *  month) can reach beyond whatever the one-shot pass already narrowed down to. */
  const candidatePool = useMemo(() => {
    if (!bi.account) return [];
    const accId = bi.account.id;
    return Array.from(bi.expensesById.values()).filter(
      (e) => e.description !== RECONCILIATION_DESCRIPTION && (e.accountId === accId || e.toAccountId === accId)
    );
  }, [bi.expensesById, bi.account]);

  // All 4 read live staged state, not the one-shot matcher's frozen `matchResult` snapshot — a real
  // bug fixed 2026-08-03 (the summary strip never updated as items moved between buckets during
  // review, e.g. resolving a possible match or moving one to "Not yet logged"). "New" covers both a
  // not-yet-resolved statement line and one already staged into a new Expense, since both represent
  // a transaction that will be newly created on commit. See `useBankImport.ts`'s `loneWolves` doc
  // comment for why lone wolves specifically need their own reactive derivation, not just a plain count.
  const matchedCount = bi.matchedPairs.length;
  const possibleCount = bi.possibleItems.length;
  const newCount = bi.unmatchedRows.length + bi.stagedNewTxns.length;
  const loneCount = bi.loneWolves.length;
  const linesCount = bi.parseResult?.rows.length ?? matchedCount + possibleCount + newCount;

  const stats: { n: number; label: string; color?: string }[] = [
    { n: linesCount, label: 'Lines' },
    { n: matchedCount, label: 'Matched', color: theme.success },
    { n: possibleCount, label: 'Possible', color: theme.warning },
    { n: newCount, label: 'New', color: theme.info },
    { n: loneCount, label: 'Lone', color: theme.danger }
  ];

  // `bi.matchedPairs` already includes every possible-match item the user has resolved — see
  // `useBankImport.ts`'s `readyCount` comment.
  const readyBreakdown = `${bi.matchedPairs.length} confirmed, ${bi.stagedNewTxns.length} new, ${bi.loneWolfDeletions.size} lone-wolf action${bi.loneWolfDeletions.size === 1 ? '' : 's'}`;

  return (
    <View className="flex-1">
      <View className="flex-row gap-2 px-4 pt-3">
        {stats.map((s) => (
          <View key={s.label} className="flex-1 rounded-xl border border-theme bg-surface items-center py-2">
            <Text className="text-sm font-bold" style={{ color: s.color ?? theme.textPrimary }}>
              {s.n}
            </Text>
            <Text className="text-[9px] text-tertiary uppercase mt-0.5">{s.label}</Text>
          </View>
        ))}
      </View>

      {/* A real statement can run 100–300+ lines across these 4 buckets (docs/plans/bank-statement-
          import.md §6) — Possible/Unmatched/Lone-Wolf are all expanded by default, so anything past
          one screen height must actually be reachable. `ScrollView` is enough for now; `MatchedBucket`'s
          own 150-item cap already flags a future `FlashList` move as a follow-up if a real statement
          needs it. */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 10 }}
      >
        <MatchedBucket bi={bi} accountMap={accountMap} candidatePool={candidatePool} masked={masked} />
        <PossibleBucket bi={bi} accountMap={accountMap} candidatePool={candidatePool} masked={masked} />
        <UnmatchedBucket bi={bi} masked={masked} />
        <LoneWolfBucket bi={bi} masked={masked} />
      </ScrollView>

      <View className="border-t border-theme bg-surface px-4 py-2.5 flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-sm font-bold text-primary">{bi.readyCount} ready to import</Text>
          <Text className="text-[10px] text-tertiary">{readyBreakdown}</Text>
        </View>
        <Button variant="primary" onPress={onImport}>
          Import
        </Button>
      </View>
    </View>
  );
}
