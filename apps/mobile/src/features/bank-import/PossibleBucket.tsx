import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Account, Expense } from '@/core/db/types';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { normalizeNarration } from '@/core/bank-import/normalization';
import { suggestForMerchant } from '@/core/bank-import/merchantMemory';
import { inferPaymentMode } from '@/core/bank-import/paymentModeInference';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { ExpenseForm } from '~/components/shared';
import { Button, Modal, SelectInput } from '~/components/ui';
import type { UseBankImportReturn } from './useBankImport';
import { PossibleMatchPickerModal } from './PossibleMatchPickerModal';

interface PossibleBucketProps {
  bi: UseBankImportReturn;
  accountMap: Map<string, Account>;
  candidatePool: Expense[];
  masked: boolean;
}

/** Bucket 2 (mockup `#s3` "Possible matches" + `#s4` picker) — close-but-not-exact amount, or
 *  ambiguous same-day/same-amount ties. Collapsed by default (2026-08-03, matches every other bucket
 *  — a real statement's buckets can run long, so nothing should dump its full contents on-screen
 *  unasked). Resolved via the same picker modal as bucket 1's manual override, or falls through to
 *  the statementPreset `ExpenseForm` when the user picks "No match — add as new"
 *  (docs/plans/bank-statement-import.md §5/§6/§8). */
export function PossibleBucket({ bi, accountMap, candidatePool, masked }: PossibleBucketProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState<ParsedStatementRow | null>(null);
  // Auto cash-withdrawal detection (2026-08-05) — when the narration matches but more than one cash
  // account exists, ask which one *before* opening ExpenseForm (a small dedicated cash-accounts-only
  // picker, not the form's own general any-account To-account picker), per explicit user feedback.
  const [pendingCashChoice, setPendingCashChoice] = useState<ParsedStatementRow | null>(null);
  const [chosenCashAccountId, setChosenCashAccountId] = useState('');
  const [resolvedToAccountId, setResolvedToAccountId] = useState('');
  const choosingItem = choosing !== null ? bi.possibleItems.find((p) => p.statementRow.rowIndex === choosing) : null;

  if (bi.possibleItems.length === 0) return null;

  return (
    <View>
      <Pressable onPress={() => setExpanded((v) => !v)} className="flex-row items-center gap-2 py-1">
        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.warning }} />
        <Text className="text-sm font-semibold text-primary flex-1">Possible matches</Text>
        <Text className="text-xs text-tertiary">{bi.possibleItems.length}</Text>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>

      {expanded && (
        <View className="gap-1.5 mt-1">
          {/* Paired tile — same visual as the Matched bucket's confident pairs, so a possible match is
           *  actually legible at a glance instead of a plain "Choose ›" row — just amber/dashed instead
           *  of green/confident, and the right half shows either the single closest candidate or a
           *  "N possible matches" placeholder when the matcher itself couldn't pick a favorite. */}
          {bi.possibleItems.map((item) => {
            const [only] = item.candidates;
            const tied = item.candidates.length > 1;
            return (
              <Pressable
                key={item.statementRow.rowIndex}
                onPress={() => setChoosing(item.statementRow.rowIndex)}
                className="flex-row rounded-xl border overflow-hidden"
                style={{ borderColor: theme.warning }}
              >
                <View className="flex-1 p-2.5 bg-surface-2">
                  <Text className="text-[9px] uppercase tracking-wide text-tertiary">Statement</Text>
                  <Text className="text-xs font-semibold text-primary mt-0.5" numberOfLines={1}>
                    {item.statementRow.rawNarration}
                  </Text>
                  <Text className="text-xs text-secondary mt-0.5">
                    {item.statementRow.direction === 'debit' ? '−' : '+'}
                    {masked ? '••••' : formatCurrency(item.statementRow.amount)} · {formatDate(item.statementRow.date)}
                  </Text>
                </View>
                <View
                  className="flex-1 p-2.5 border-l border-dashed"
                  style={{ borderColor: theme.warning, backgroundColor: tint(theme.warning, 6) }}
                >
                  <Text className="text-[9px] uppercase tracking-wide" style={{ color: theme.warning }}>
                    {tied ? `${item.candidates.length} possible` : 'Closest guess'}
                  </Text>
                  {only && !tied ? (
                    <>
                      <Text className="text-xs font-semibold text-primary mt-0.5" numberOfLines={1}>
                        {only.description}
                      </Text>
                      <Text className="text-xs text-secondary mt-0.5">
                        {masked ? '••••' : formatCurrency(only.amount)} · {formatDate(only.date)}
                      </Text>
                    </>
                  ) : (
                    <Text className="text-xs font-semibold text-primary mt-0.5">Tap to choose ›</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {choosingItem && (
        <PossibleMatchPickerModal
          statementLine={choosingItem.statementRow}
          candidatePool={candidatePool}
          suggestedIds={new Set(choosingItem.candidates.map((c) => c.id))}
          accountMap={accountMap}
          masked={masked}
          onPick={(expense) => {
            bi.resolvePossibleMatch(choosingItem.statementRow, expense);
            setChoosing(null);
          }}
          onAddAsNew={() => {
            bi.dismissPossibleAsNew(choosingItem.statementRow);
            setChoosing(null);
            const row = choosingItem.statementRow;
            const suggestion = bi.suggestCashTransferFor(row.rawNarration);
            if (suggestion && !suggestion.toAccountId && bi.cashAccounts.length > 1) {
              setChosenCashAccountId('');
              setPendingCashChoice(row);
            } else {
              setAddingNew(row);
            }
          }}
          onMoveToUnmatched={() => {
            bi.dismissPossibleAsNew(choosingItem.statementRow);
            setChoosing(null);
          }}
          onClose={() => setChoosing(null)}
        />
      )}

      {pendingCashChoice && (
        <Modal
          onClose={() => setPendingCashChoice(null)}
          title="Which cash account?"
          footer={
            <Button
              variant="primary"
              fullWidth
              disabled={!chosenCashAccountId}
              onPress={() => {
                setResolvedToAccountId(chosenCashAccountId);
                setAddingNew(pendingCashChoice);
                setPendingCashChoice(null);
              }}
            >
              Continue
            </Button>
          }
        >
          <Text className="text-xs text-secondary mb-3">
            This looks like a cash withdrawal — which of your cash accounts did it go into? You can still change this in
            the next step.
          </Text>
          <SelectInput
            label="Cash account"
            value={chosenCashAccountId}
            onChange={setChosenCashAccountId}
            options={bi.cashAccounts.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Modal>
      )}

      {addingNew &&
        (() => {
          const normalizedKey = normalizeNarration(addingNew.rawNarration, bi.overrides);
          const suggestion = suggestForMerchant(normalizedKey, bi.importRecords, bi.expensesById);
          // Merchant memory (an already-real, previously-used mode) takes priority over the raw
          // narration inference — same precedence `BulkCategorizeModal` uses. `paymentModeCandidate`
          // is only attached when the resolved mode IS the inferred one (not a memory override, which
          // is always already a real row) — that's the only case `PaymentModeChips` needs the extra
          // label/icon/color for, since a not-yet-created rail (NEFT/IMPS/RTGS/Cheque) is otherwise
          // invisible to it until `commitAndImport()` creates it.
          const inferredMode = inferPaymentMode(addingNew.rawNarration);
          const resolvedPaymentMode = suggestion?.paymentMode ?? inferredMode.id;
          // Auto cash-withdrawal detection (2026-08-05) — `resolvedToAccountId` (set via the
          // `pendingCashChoice` picker above) wins when present; otherwise falls back to the
          // suggestion's own resolved account (the confident, exactly-one-cash-account case never
          // needed the picker at all). Falls back further (2026-08-05) to the softer cross-account
          // amount/date suggestion only when no cash-code match fired — narration-code detection is
          // the more confident signal of the two, so it always wins when both happen to apply.
          const cashSuggestion = bi.suggestCashTransferFor(addingNew.rawNarration);
          const crossAccountSuggestion = cashSuggestion ? null : bi.suggestPossibleTransferFor(addingNew);
          const toAccountId = resolvedToAccountId || cashSuggestion?.toAccountId || crossAccountSuggestion?.account.id;
          const suggestedType = cashSuggestion?.suggestedType ?? (crossAccountSuggestion ? 'transfer' : undefined);
          const suggestionNote = crossAccountSuggestion
            ? `Might be the other side of a transfer with ${crossAccountSuggestion.account.name} — recorded there as "${crossAccountSuggestion.expense.description}".`
            : undefined;
          return (
            <ExpenseForm
              categories={bi.categories}
              txnCountByCategory={bi.txnCountByCategory}
              hashtags={bi.hashtags}
              editing={null}
              activeEvents={[]}
              saveAccount={bi.saveAccountForForm}
              searchMerchant={() => []}
              statementPreset={{
                amount: addingNew.amount,
                date: addingNew.date,
                accountId: bi.account?.id ?? '',
                type: addingNew.direction === 'debit' ? 'expense' : 'income',
                ...(suggestedType && { suggestedType }),
                ...(toAccountId && { toAccountId }),
                ...(suggestionNote && { suggestionNote }),
                paymentMode: resolvedPaymentMode,
                ...(resolvedPaymentMode === inferredMode.id && { paymentModeCandidate: inferredMode }),
                ...(suggestion?.description && { descriptionSuggestion: suggestion.description }),
                ...(suggestion?.categoryId && { categorySuggestion: suggestion.categoryId })
              }}
              onSave={async (expense, newTagSetAside) => {
                bi.stageNewTxnFromForm(expense, addingNew, newTagSetAside);
                setAddingNew(null);
                setResolvedToAccountId('');
              }}
              onDelete={async () => {}}
              onClose={() => {
                setAddingNew(null);
                setResolvedToAccountId('');
              }}
            />
          );
        })()}
    </View>
  );
}
