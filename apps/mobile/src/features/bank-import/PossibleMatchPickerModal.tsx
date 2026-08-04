import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import type { Account, Expense } from '@/core/db/types';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { DAY_MS, monthBounds, toMonthYearKey } from '@/lib/date';
import { Modal, SearchInput, Button, Card } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

type RangeMode = '3d' | '14d' | 'month';

interface PossibleMatchPickerModalProps {
  statementLine: ParsedStatementRow;
  /** Every recorded transaction eligible for this account (either direction) — filtered here by the
   *  active date range + search, independently of whatever the one-shot matcher pass already narrowed
   *  down to, so "Widen range"/"View whole month" can reach further than the matcher's own ±3 days. */
  candidatePool: Expense[];
  /** The one-shot matcher's own closest guess(es) for this line (bucket 2 only) — highlighted in the
   *  list below with a "Suggested" badge instead of presenting every candidate neutrally. */
  suggestedIds?: Set<string>;
  accountMap: Map<string, Account>;
  masked: boolean;
  onPick: (expense: Expense) => void;
  /** Omitted when reassigning an already-"Matched" pair (bucket 1) — both fallbacks below only make
   *  sense for a statement line that isn't confidently linked to anything yet (bucket 2). */
  onAddAsNew?: () => void;
  /** Distinct from `onAddAsNew` — parks the line in "Not yet logged" for a later bulk-categorize pass
   *  instead of opening the single-row form immediately. */
  onMoveToUnmatched?: () => void;
  onClose: () => void;
}

/**
 * Adapted from `features/goals/LinkTransactionModal.tsx` (not imported — a new, independent
 * component, per the architecture rule against feature-to-feature imports). Used both for bucket 2
 * ("Possible matches") and bucket 1's manual override ("Disagree with a match? Tap any pair to
 * re-choose") — docs/plans/bank-statement-import.md §5/§6.
 */
export function PossibleMatchPickerModal({
  statementLine,
  candidatePool,
  suggestedIds,
  accountMap,
  masked,
  onPick,
  onAddAsNew,
  onMoveToUnmatched,
  onClose
}: PossibleMatchPickerModalProps) {
  const theme = useThemeColors();
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<RangeMode>('3d');

  const matches = useMemo(() => {
    const inRange = candidatePool.filter((e) => {
      if (range === '3d') return Math.abs(e.date - statementLine.date) <= 3 * DAY_MS;
      if (range === '14d') return Math.abs(e.date - statementLine.date) <= 14 * DAY_MS;
      const { start, end } = monthBounds(toMonthYearKey(new Date(statementLine.date)));
      return e.date >= start && e.date < end;
    });
    const q = query.trim().toLowerCase();
    const filtered = q ? inRange.filter((e) => e.description.toLowerCase().includes(q)) : inRange;
    // The matcher's own suggested candidate(s) float to the top, ahead of the usual date sort — the
    // whole point of highlighting a suggestion is that it's the first thing seen, not buried in a
    // date-ordered list.
    return filtered
      .sort((a, b) => b.date - a.date)
      .sort((a, b) => Number(suggestedIds?.has(b.id) ?? false) - Number(suggestedIds?.has(a.id) ?? false))
      .slice(0, 50);
  }, [candidatePool, range, statementLine.date, query, suggestedIds]);

  return (
    <Modal onClose={onClose} title="Choose the match" scrollable>
      <View className="gap-3">
        <Card padding="sm" radius="md">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Statement line</Text>
          <Text className="text-sm font-semibold text-primary mt-0.5" numberOfLines={1}>
            {statementLine.rawNarration}
          </Text>
          <Text className="text-xs text-tertiary mt-0.5">
            {formatDateShort(statementLine.date)} · {statementLine.direction === 'debit' ? '−' : '+'}
            {formatCurrency(statementLine.amount)}
          </Text>
        </Card>

        <SearchInput value={query} onChange={setQuery} placeholder="Search your transactions…" />

        <View className="flex-row gap-1.5">
          {(
            [
              { value: '3d' as const, label: '± 3 days' },
              { value: '14d' as const, label: 'Widen range' },
              { value: 'month' as const, label: 'View whole month' }
            ] as const
          ).map((opt) => {
            const active = range === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setRange(opt.value)}
                className="rounded-full px-3 py-1.5 border"
                style={{
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? tint(theme.primary, 12) : 'transparent'
                }}
              >
                <Text className="text-xs font-semibold" style={{ color: active ? theme.primary : theme.textSecondary }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {matches.length === 0 && (
          <Text className="text-xs text-tertiary text-center py-6">
            No transactions in this range{query ? ' match your search' : ''}.
          </Text>
        )}

        <ScrollView style={{ maxHeight: 320 }}>
          <View className="gap-2">
            {matches.map((e) => {
              const acc = e.accountId ? accountMap.get(e.accountId) : undefined;
              const amountColor =
                e.type === 'income' ? theme.success : e.type === 'expense' ? theme.danger : theme.info;
              const suggested = suggestedIds?.has(e.id) ?? false;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => onPick(e)}
                  className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 border-2 ${suggested ? '' : 'bg-surface-2'}`}
                  style={{
                    backgroundColor: suggested ? tint(theme.warning, 10) : undefined,
                    borderColor: suggested ? theme.warning : 'transparent'
                  }}
                >
                  <View
                    className="w-8 h-8 rounded-lg items-center justify-center shrink-0"
                    style={{ backgroundColor: tint(amountColor, 12) }}
                  >
                    <Icon name="ti-receipt" size={16} color={amountColor} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                        {e.description}
                      </Text>
                      {suggested && (
                        <View className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: theme.warning }}>
                          <Text className="text-[9px] font-bold uppercase text-white">Suggested</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-xs text-tertiary" numberOfLines={1}>
                      {formatDateShort(e.date)}
                      {acc?.name ? ` · ${acc.name}` : ''}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold" style={{ color: amountColor }}>
                    {masked ? '••••' : formatCurrency(e.amount)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {(onAddAsNew || onMoveToUnmatched) && (
          <View className="gap-2">
            {onAddAsNew && (
              <Button variant="secondary" fullWidth onPress={onAddAsNew}>
                No match — add as new
              </Button>
            )}
            {onMoveToUnmatched && (
              <Button variant="ghost" fullWidth onPress={onMoveToUnmatched}>
                Move to "Not yet logged" for later
              </Button>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}
