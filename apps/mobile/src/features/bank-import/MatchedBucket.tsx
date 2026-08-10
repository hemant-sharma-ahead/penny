import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Account, Expense } from '@/core/db/types';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { inferPaymentMode } from '@/core/bank-import/paymentModeInference';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { Button, Modal, SelectInput } from '~/components/ui';
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
  // Retroactive cash-transfer conversion (docs/plans/bank-balance-sync.md §17 Finding 1, §7 Stage 7) —
  // `dismissedSuggestions` is purely in-session UI state (never persisted, same "dismissible-only"
  // philosophy every other suggestion in this feature follows) so tapping "Not now" just hides the
  // chip for the rest of this review; re-opening the import re-derives it fresh from the expense's own
  // (still-unconverted) `type`. `convertingRowIndex` opens the cash-account picker only for the
  // ambiguous case (2+ cash accounts, no single confident `toAccountId`) — a single cash account
  // resolves and converts immediately, no picker needed.
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const [convertingRowIndex, setConvertingRowIndex] = useState<number | null>(null);
  const [chosenCashAccountId, setChosenCashAccountId] = useState('');
  const convertingPair =
    convertingRowIndex !== null ? bi.matchedPairs.find((p) => p.statementRow.rowIndex === convertingRowIndex) : null;

  if (bi.matchedPairs.length === 0) return null;

  /** "Convert" tapped on a retroactive suggestion chip — a resolved `toAccountId` (exactly one cash
   *  account exists) converts immediately; otherwise opens the picker modal below to ask which one. */
  function handleConvert(statementRow: ParsedStatementRow, toAccountId: string | undefined) {
    if (toAccountId) {
      bi.convertMatchedPairToTransfer(statementRow, toAccountId);
      return;
    }
    setChosenCashAccountId('');
    setConvertingRowIndex(statementRow.rowIndex);
  }

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
            // Retroactive cash-transfer suggestion (§17 Finding 1, §7 Stage 7) — the same narration-code
            // detection `PossibleBucket.tsx`/`UnmatchedBucket.tsx` already run for a brand-new row,
            // applied here to a row that instead matched an existing plain expense. `null` whenever the
            // narration doesn't carry a cash-withdrawal code, the expense is already a transfer, or
            // there's no cash account to convert into at all — in every one of those cases nothing
            // renders, the row looks exactly like it does today.
            const retroSuggestion = bi.suggestRetroactiveCashTransferFor(pair);
            const showRetroSuggestion = !!retroSuggestion && !dismissedSuggestions.has(pair.statementRow.rowIndex);
            return (
              <View key={pair.statementRow.rowIndex} className="rounded-xl border border-theme overflow-hidden">
                <Pressable onPress={() => setReassigning(pair.statementRow.rowIndex)} className="flex-row">
                  <View className="flex-1 p-2.5 bg-surface-2">
                    <Text className="text-[9px] uppercase tracking-wide text-tertiary">Statement</Text>
                    <Text className="text-xs font-semibold text-primary mt-0.5" numberOfLines={1}>
                      {pair.statementRow.rawNarration}
                    </Text>
                    <Text className="text-xs text-secondary mt-0.5">
                      {pair.statementRow.direction === 'debit' ? '−' : '+'}
                      {masked ? '••••' : formatCurrency(pair.statementRow.amount)} ·{' '}
                      {formatDate(pair.statementRow.date)}
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
                {showRetroSuggestion && (
                  <View
                    className="px-2.5 py-2 border-t border-dashed gap-1.5"
                    style={{ borderColor: theme.warning, backgroundColor: tint(theme.warning, 6) }}
                  >
                    <Text className="text-[10px]" style={{ color: theme.warning }}>
                      🔁 Looks like a transfer to your cash account — convert it?
                    </Text>
                    <View className="flex-row gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => handleConvert(pair.statementRow, retroSuggestion?.toAccountId)}
                      >
                        Convert
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setDismissedSuggestions((prev) => new Set(prev).add(pair.statementRow.rowIndex))}
                      >
                        Not now
                      </Button>
                    </View>
                  </View>
                )}
              </View>
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

      {/* Ambiguous cash-account picker for the retroactive suggestion chip above (§17 Finding 1) — only
       *  reached when 2+ cash accounts exist, so `suggestRetroactiveCashTransferFor` couldn't resolve a
       *  single confident `toAccountId` on its own. Same visual pattern as `PossibleBucket.tsx`'s
       *  `pendingCashChoice` modal for the identical new-row case. */}
      {convertingPair && (
        <Modal
          onClose={() => setConvertingRowIndex(null)}
          title="Which cash account?"
          footer={
            <Button
              variant="primary"
              fullWidth
              disabled={!chosenCashAccountId}
              onPress={() => {
                bi.convertMatchedPairToTransfer(convertingPair.statementRow, chosenCashAccountId);
                setConvertingRowIndex(null);
              }}
            >
              Convert to transfer
            </Button>
          }
        >
          <Text className="text-xs text-secondary mb-3">
            This looks like a cash withdrawal — which of your cash accounts did it go into?
          </Text>
          <SelectInput
            label="Cash account"
            value={chosenCashAccountId}
            onChange={setChosenCashAccountId}
            options={bi.cashAccounts.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Modal>
      )}
    </View>
  );
}
