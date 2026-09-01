import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Account, Expense } from '@/core/db/types';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import type { PossibleTransferSuggestion } from '@/core/bank-import/matcher';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { normalizeNarration } from '@/core/bank-import/normalization';
import { suggestForMerchant } from '@/core/bank-import/merchantMemory';
import { inferPaymentMode } from '@/core/expenses/paymentModeInference';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { ExpenseForm, PossibleMatchPickerModal } from '~/components/shared';
import { Button, Modal, SelectInput } from '~/components/ui';
import type { UseBankImportReturn } from './useBankImport';
import { AmbiguousTransferPickerModal } from './AmbiguousTransferPickerModal';

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
  // Ambiguous cross-account transfer choice (docs/plans/bank-balance-sync.md §13, §7 Stage 6) — asked
  // only when no cash-withdrawal suggestion fired AND `suggestAmbiguousTransferCandidatesFor` finds 2+
  // equally-plausible candidates. Picking a candidate now absorbs it in place via
  // `linkAsCrossAccountTransfer` (found + fixed 2026-08-09 — see that function's own doc comment), no
  // `ExpenseForm` involved; `transferResolvedAsNeither` records an explicit "Neither" so the `addingNew`
  // step below never re-runs the single-suggestion heuristic and silently re-surfaces a note for a
  // choice already made.
  const [pendingTransferChoice, setPendingTransferChoice] = useState<{
    row: ParsedStatementRow;
    candidates: PossibleTransferSuggestion[];
  } | null>(null);
  const [transferResolvedAsNeither, setTransferResolvedAsNeither] = useState(false);
  // Single-candidate cross-account transfer absorption (found + fixed 2026-08-09, see
  // `convertCandidateToTransfer`'s own doc comment) — `suggestPossibleTransferFor` found exactly one
  // confident candidate on a DIFFERENT account; offered as a "Link these" chip instead of silently
  // prefilling a note into a brand-new record (the pre-fix behavior, which duplicated the real-world
  // transfer's other leg). `singleTransferLinkDismissed` records an explicit "Not the same, add
  // separately" so the `addingNew` step below never re-runs the same single-candidate heuristic and
  // silently re-surfaces the note for a choice already made — same role `transferResolvedAsNeither`
  // plays for the ambiguous (2+ candidate) sibling case.
  const [pendingCrossAccountLink, setPendingCrossAccountLink] = useState<{
    row: ParsedStatementRow;
    candidate: PossibleTransferSuggestion;
  } | null>(null);
  const [singleTransferLinkDismissed, setSingleTransferLinkDismissed] = useState(false);
  const choosingItem = choosing !== null ? bi.possibleItems.find((p) => p.statementRow.rowIndex === choosing) : null;

  if (bi.possibleItems.length === 0) return null;

  /** Routes a statement row (post "no match — add as new" / "no match" resolution) to whichever of the
   *  four add-flow gates applies, in priority order: the cash-account-choice gate (already existed),
   *  then the ambiguous-transfer-choice gate (§13), then the new single-candidate cross-account-link
   *  gate (found + fixed 2026-08-09), then straight to `ExpenseForm`. Cash-withdrawal detection always
   *  wins over the softer cross-account heuristic when both apply (same precedence the `addingNew`
   *  block below already documents) — `suggestPossibleTransferFor`/`suggestAmbiguousTransferCandidatesFor`
   *  are mutually exclusive by construction (exactly-one vs. 2+ candidates), so at most one of the two
   *  gates below ever fires for a given row. */
  function routeRowForAdding(row: ParsedStatementRow) {
    const cashSuggestion = bi.suggestCashTransferFor(row.rawNarration, row.direction);
    if (cashSuggestion && !cashSuggestion.toAccountId && bi.cashAccounts.length > 1) {
      setChosenCashAccountId('');
      setPendingCashChoice(row);
      return;
    }
    if (!cashSuggestion) {
      const ambiguousCandidates = bi.suggestAmbiguousTransferCandidatesFor(row);
      if (ambiguousCandidates) {
        setPendingTransferChoice({ row, candidates: ambiguousCandidates });
        return;
      }
      const singleCandidate = bi.suggestPossibleTransferFor(row);
      if (singleCandidate) {
        setPendingCrossAccountLink({ row, candidate: singleCandidate });
        return;
      }
    }
    setAddingNew(row);
  }

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
            routeRowForAdding(choosingItem.statementRow);
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

      {pendingTransferChoice && (
        <AmbiguousTransferPickerModal
          statementRow={pendingTransferChoice.row}
          candidates={pendingTransferChoice.candidates}
          masked={masked}
          onPick={(candidate) => {
            // Absorbs the picked candidate in place (found + fixed 2026-08-09) — no `ExpenseForm`
            // involved, since there's nothing left to fill in (date/amount are already known, and
            // category/description don't apply to a transfer). See `linkAsCrossAccountTransfer`'s own
            // doc comment.
            bi.linkAsCrossAccountTransfer(pendingTransferChoice.row, candidate.expense);
            setPendingTransferChoice(null);
          }}
          onNeither={() => {
            setTransferResolvedAsNeither(true);
            setAddingNew(pendingTransferChoice.row);
            setPendingTransferChoice(null);
          }}
          onClose={() => {
            // Cancelling the picker without a decision — the row already left the "Possible" bucket
            // (`dismissPossibleAsNew` already ran before this gate), so there's no "still undecided"
            // state to fall back to; the safe default is the same as an explicit "Neither" (never
            // auto-links). The user can still manually mark it as a transfer inside `ExpenseForm` itself.
            setTransferResolvedAsNeither(true);
            setAddingNew(pendingTransferChoice.row);
            setPendingTransferChoice(null);
          }}
        />
      )}

      {/* Single-candidate cross-account transfer link chip (found + fixed 2026-08-09) — same visual
       *  language as `MatchedBucket.tsx`'s retroactive-cash-transfer chip (warning-tinted card, 🔁
       *  lead-in, sm secondary/ghost button pair), presented as this row's own modal step since there's
       *  no persistent list row to attach an inline chip to at this point in the "add as new" flow. */}
      {pendingCrossAccountLink && (
        <Modal onClose={() => setPendingCrossAccountLink(null)} title="Possible transfer">
          <View
            className="rounded-xl border px-3 py-2.5 gap-2"
            style={{ borderColor: theme.warning, backgroundColor: tint(theme.warning, 6) }}
          >
            <Text className="text-xs" style={{ color: theme.warning }}>
              🔁 Might be the transfer you recorded on {pendingCrossAccountLink.candidate.account.name} (
              {formatDate(pendingCrossAccountLink.candidate.expense.date)},{' '}
              {masked ? '••••' : formatCurrency(pendingCrossAccountLink.candidate.expense.amount)}) — recorded there as
              "{pendingCrossAccountLink.candidate.expense.description}".
            </Text>
            <View className="flex-row gap-2">
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  bi.linkAsCrossAccountTransfer(pendingCrossAccountLink.row, pendingCrossAccountLink.candidate.expense);
                  setPendingCrossAccountLink(null);
                }}
              >
                Link these
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  setSingleTransferLinkDismissed(true);
                  setAddingNew(pendingCrossAccountLink.row);
                  setPendingCrossAccountLink(null);
                }}
              >
                Not the same, add separately
              </Button>
            </View>
          </View>
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
          const cashSuggestion = bi.suggestCashTransferFor(addingNew.rawNarration, addingNew.direction);
          // Cross-account transfer note (2026-08-05; absorb-in-place path found + fixed 2026-08-09) —
          // an explicit "Neither" from `AmbiguousTransferPickerModal`, or an explicit "Not the same, add
          // separately" from the single-candidate link chip above, always wins over recomputing either
          // heuristic fresh (which would just return the same result again for the same row). A
          // confidently-linked single candidate never reaches this point at all any more —
          // `routeRowForAdding`'s own gate absorbs it via `linkAsCrossAccountTransfer` before
          // `ExpenseForm` ever opens — so this is now only reachable for a row with no candidate, or one
          // whose suggestion was explicitly declined.
          const crossAccountSuggestion =
            transferResolvedAsNeither || singleTransferLinkDismissed || cashSuggestion
              ? null
              : bi.suggestPossibleTransferFor(addingNew);
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
                setTransferResolvedAsNeither(false);
                setSingleTransferLinkDismissed(false);
              }}
              onDelete={async () => {}}
              onClose={() => {
                setAddingNew(null);
                setResolvedToAccountId('');
                setTransferResolvedAsNeither(false);
                setSingleTransferLinkDismissed(false);
              }}
            />
          );
        })()}
    </View>
  );
}
