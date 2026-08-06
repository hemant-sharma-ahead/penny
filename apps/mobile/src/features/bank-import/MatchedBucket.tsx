import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Account, Expense } from '@/core/db/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { inferPaymentMode } from '@/core/bank-import/paymentModeInference';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { UseBankImportReturn } from './useBankImport';
import { PossibleMatchPickerModal } from './PossibleMatchPickerModal';

interface MatchedBucketProps {
  bi: UseBankImportReturn;
  accountMap: Map<string, Account>;
  candidatePool: Expense[];
  masked: boolean;
}

/** Bucket 1 (mockup `#s3` main + zoomed frames) — confident auto-matches, collapsed by default (a
 *  real statement can run 100–300+ lines and this bucket needs no action by default), never hidden.
 *  Supports the manual-override picker (docs/plans/bank-statement-import.md §5's "trust the user"
 *  cascade — reassigning here can bump another statement line back to unresolved). */
export function MatchedBucket({ bi, accountMap, candidatePool, masked }: MatchedBucketProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [reassigning, setReassigning] = useState<number | null>(null);
  const reassigningPair =
    reassigning !== null ? bi.matchedPairs.find((p) => p.statementRow.rowIndex === reassigning) : null;
  const paymentModeLabels = useMemo(
    () => new Map(bi.allPaymentModes.map((m) => [m.id, m.label])),
    [bi.allPaymentModes]
  );

  if (bi.matchedPairs.length === 0) return null;

  return (
    <View>
      <Pressable onPress={() => setExpanded((v) => !v)} className="flex-row items-center gap-2 py-1">
        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.success }} />
        <Text className="text-sm font-semibold text-primary flex-1">✓ Matched</Text>
        <Text className="text-xs text-tertiary">
          {bi.matchedPairs.length} · {expanded ? 'tap to collapse' : 'tap to review'}
        </Text>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>

      {expanded && (
        <View className="gap-1.5 mt-1">
          {/* Capped render — a real statement can confirm 100–300+ matches here; this bucket is
              audit-only (collapsed by default, nothing needs reviewing), so a plain, unvirtualized
              `.map()` is fine up to a bound but should not render an unbounded list. Revisit with
              `@shopify/flash-list` (this app's standard for large/growing lists) if a real statement
              routinely needs to page past this cap. */}
          {bi.matchedPairs.slice(0, 150).map((pair) => {
            const acc = pair.expense.accountId ? accountMap.get(pair.expense.accountId) : undefined;
            // Payment-mode mismatch flag (2026-08-06) — informational only, never auto-corrected and
            // never blocks anything: `inferPaymentMode` reads the statement row's own narration
            // keyword (UPI/NEFT/POS/ATM/...), compared against whatever payment mode is already
            // recorded on the matched expense. Only shown when the expense actually has a recorded
            // mode to compare against (an older expense predating payment modes has none, so there's
            // nothing to flag). The user decides manually whether to fix it — this never writes
            // anything back to the expense.
            const recordedModeId = pair.expense.paymentMode;
            const impliedMode = inferPaymentMode(pair.statementRow.rawNarration);
            const modeMismatch = !!recordedModeId && recordedModeId !== impliedMode.id;
            const recordedModeLabel = recordedModeId ? (paymentModeLabels.get(recordedModeId) ?? recordedModeId) : '';
            return (
              <Pressable
                key={pair.statementRow.rowIndex}
                onPress={() => setReassigning(pair.statementRow.rowIndex)}
                className="flex-row rounded-xl border border-theme overflow-hidden"
              >
                <View className="flex-1 p-2.5 bg-surface-2">
                  <Text className="text-[9px] uppercase tracking-wide text-tertiary">Statement</Text>
                  <Text className="text-xs font-semibold text-primary mt-0.5" numberOfLines={1}>
                    {pair.statementRow.rawNarration}
                  </Text>
                  <Text className="text-xs text-secondary mt-0.5">
                    {pair.statementRow.direction === 'debit' ? '−' : '+'}
                    {masked ? '••••' : formatCurrency(pair.statementRow.amount)} · {formatDate(pair.statementRow.date)}
                  </Text>
                </View>
                <View className="flex-1 p-2.5 border-l border-dashed border-theme">
                  <Text className="text-[9px] uppercase tracking-wide text-tertiary">Recorded</Text>
                  <Text className="text-xs font-semibold text-primary mt-0.5" numberOfLines={1}>
                    {pair.expense.description}
                    {acc ? ` · ${acc.name}` : ''}
                  </Text>
                  <Text className="text-xs text-secondary mt-0.5">
                    {masked ? '••••' : formatCurrency(pair.expense.amount)} · {formatDate(pair.expense.date)}
                  </Text>
                  {modeMismatch && (
                    <Text className="text-[10px] mt-0.5" style={{ color: theme.warning }}>
                      Statement suggests {impliedMode.label} · recorded as {recordedModeLabel}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
          {bi.matchedPairs.length > 150 && (
            <Text className="text-[10px] text-tertiary text-center">
              +{bi.matchedPairs.length - 150} more — all confirmed, nothing to review.
            </Text>
          )}
          <Text className="text-[10px] text-tertiary text-center">
            Disagree with a match? Tap any pair to re-choose.
          </Text>
        </View>
      )}

      {reassigningPair && (
        <PossibleMatchPickerModal
          statementLine={reassigningPair.statementRow}
          candidatePool={candidatePool}
          currentlyMatchedId={reassigningPair.expense.id}
          accountMap={accountMap}
          masked={masked}
          onPick={(expense) => {
            bi.reassignMatchedPair(reassigningPair.statementRow, expense);
            setReassigning(null);
          }}
          onClose={() => setReassigning(null)}
        />
      )}
    </View>
  );
}
