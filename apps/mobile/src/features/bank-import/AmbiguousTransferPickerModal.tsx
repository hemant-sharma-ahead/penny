import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import type { PossibleTransferSuggestion } from '@/core/bank-import/matcher';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Modal, Button, Card } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

interface AmbiguousTransferPickerModalProps {
  statementRow: ParsedStatementRow;
  /** 2+ equally-plausible candidates — `suggestAmbiguousTransferCandidates` never returns fewer than 2
   *  (that's `suggestPossibleTransfer`'s own single-confident-suggestion job instead). */
  candidates: PossibleTransferSuggestion[];
  masked: boolean;
  onPick: (candidate: PossibleTransferSuggestion) => void;
  onNeither: () => void;
  onClose: () => void;
}

/**
 * docs/plans/bank-balance-sync.md §13's "genuine ambiguity" case, built exactly to mockup
 * `bank-balance-sync-v2.html` §7 ("Which transaction is this transfer?") — surfaced only when
 * `suggestAmbiguousTransferCandidates` finds 2+ equally-plausible candidates for a statement row (e.g.
 * two same-bank accounts with coincidental same-day/same-amount activity). Never auto-links: the user
 * must explicitly select one candidate and confirm, or choose "Neither" — same "dismissible-suggestion-
 * only" philosophy `suggestPossibleTransfer`'s own doc comment already states, and the same pattern
 * `PossibleMatchPickerModal` already uses elsewhere in this feature (a centered modal, no auto-pick).
 *
 * Deliberately a plain radio-select + explicit confirm button, NOT `PossibleMatchPickerModal`'s
 * tap-to-instantly-pick pattern — the mockup's own frame shows a selected radio state plus a separate
 * "Link selected as transfer" button, since committing to a specific OTHER account's transaction is a
 * bigger, more consequential choice than picking among the current account's own candidates.
 */
export function AmbiguousTransferPickerModal({
  statementRow,
  candidates,
  masked,
  onPick,
  onNeither,
  onClose
}: AmbiguousTransferPickerModalProps) {
  const theme = useThemeColors();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = selectedIndex !== null ? candidates[selectedIndex] : undefined;

  return (
    <Modal onClose={onClose} title="Which transaction is this transfer?">
      <View className="gap-3">
        <Card padding="sm" radius="md">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Statement line</Text>
          <Text className="text-sm font-semibold text-primary mt-0.5" numberOfLines={1}>
            {statementRow.rawNarration}
          </Text>
          <Text className="text-xs text-tertiary mt-0.5">
            {formatDate(statementRow.date)} · {statementRow.direction === 'debit' ? '−' : '+'}
            {masked ? '••••' : formatCurrency(statementRow.amount)}
          </Text>
        </Card>

        <View className="gap-2">
          {candidates.map((c, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Pressable
                key={c.expense.id}
                onPress={() => setSelectedIndex(i)}
                className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 border-2"
                style={{
                  backgroundColor: isSelected ? tint(theme.primary, 10) : undefined,
                  borderColor: isSelected ? theme.primary : theme.border
                }}
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center shrink-0"
                  style={{ backgroundColor: tint(theme.info, 12) }}
                >
                  <Icon name="ti-arrows-left-right" size={16} color={theme.info} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                    {c.expense.description}
                  </Text>
                  <Text className="text-xs text-tertiary" numberOfLines={1}>
                    {formatDate(c.expense.date)} · {masked ? '••••' : formatCurrency(c.expense.amount)} ·{' '}
                    {c.account.name}
                  </Text>
                </View>
                <View
                  className="w-5 h-5 rounded-full border-2 items-center justify-center shrink-0"
                  style={{ borderColor: isSelected ? theme.primary : theme.border }}
                >
                  {isSelected && (
                    <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View className="gap-2">
          <Button variant="primary" fullWidth disabled={!selected} onPress={() => selected && onPick(selected)}>
            Link selected as transfer
          </Button>
          <Button variant="ghost" fullWidth onPress={onNeither}>
            Neither — keep both separate
          </Button>
        </View>
      </View>
    </Modal>
  );
}
