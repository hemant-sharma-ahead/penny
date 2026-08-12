// PPF statement import — reconciliation review (mockup §2). Directly reuses EPF's already-approved
// conflict-first triage layout (`EpfImportReviewSheet.tsx` — Direction C): the real conflict(s)
// pinned open at the top under "Needs your decision", new rows as a pre-checked light checklist,
// matches collapsed into one quiet summary line. New in this file (no EPF equivalent): the
// **calculation card** for interest rows — every real PPF statement includes exactly one annual
// interest row, and this shows Penny's fresh recalculation from the rate table next to the imported
// figure (three states: Matches / Differs / Not verified — see `calcState()` below).
import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { PpfTransactionType } from '@/core/db/types';
import type { PpfReconciliationItem } from '@/core/portfolio/ppfReconciliation';
import { formatCurrency } from '@/lib/formatters';
import { Modal, Button, StatBox } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { itemKey, type PpfImportSelection } from './ppfImportLogic';

const PPF_TX_LABELS: Record<PpfTransactionType, string> = {
  deposit: 'Deposit',
  interest: 'Interest Credited',
  withdrawal: 'Withdrawal'
};

const PPF_ACCENT = '#8b5cf6';

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

type CalcState = 'not-verified' | 'differs' | 'matches';

function calcState(item: PpfReconciliationItem): CalcState | null {
  if (item.calculatedInterest == null) return null;
  if (item.calculatedInterest.basedOnIncompleteHistory) return 'not-verified';
  if (item.calculatedInterest.mismatched) return 'differs';
  return 'matches';
}

/** Interest rows with a real calculation to show get pulled out of the standard new/matches
 *  treatment into their own calc-card (see this file's header comment) — a conflict-kind interest
 *  row keeps the standard conflict-card (the existing-vs-imported decision is the more pressing
 *  one) but also renders the calc-card as extra context. */
function hasCalcCard(item: PpfReconciliationItem): boolean {
  return item.type === 'interest' && item.calculatedInterest != null;
}

interface PpfImportReviewSheetProps {
  title: string;
  items: PpfReconciliationItem[];
  /** How many raw statement rows couldn't be parsed at all under the confirmed mapping — surfaced,
   *  never silently dropped, same principle bank-import's own review screens follow. */
  rejectedCount: number;
  confirmLabel: string;
  saving?: boolean;
  onConfirm: (selection: PpfImportSelection) => void;
  onClose: () => void;
}

export function PpfImportReviewSheet({
  title,
  items,
  rejectedCount,
  confirmLabel,
  saving,
  onConfirm,
  onClose
}: PpfImportReviewSheetProps) {
  const theme = useThemeColors();

  const keyed = useMemo(() => items.map((item, index) => ({ item, key: itemKey(item, index) })), [items]);

  const conflicts = useMemo(() => keyed.filter((k) => k.item.kind === 'conflict'), [keyed]);
  const calcCards = useMemo(() => keyed.filter((k) => k.item.kind !== 'conflict' && hasCalcCard(k.item)), [keyed]);
  const newItems = useMemo(() => keyed.filter((k) => k.item.kind === 'new' && !hasCalcCard(k.item)), [keyed]);
  const matches = useMemo(() => keyed.filter((k) => k.item.kind === 'matches' && !hasCalcCard(k.item)), [keyed]);

  const totalNew = keyed.filter((k) => k.item.kind === 'new').length;
  const totalMatched = keyed.filter((k) => k.item.kind === 'matches').length;
  const totalConflict = conflicts.length;

  const [uncheckedKeys, setUncheckedKeys] = useState<Set<string>>(new Set());
  const [conflictChoices, setConflictChoices] = useState<Map<string, 'imported' | 'existing'>>(new Map());
  const [matchesExpanded, setMatchesExpanded] = useState(false);

  function toggleChecked(key: string) {
    setUncheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setConflictChoice(key: string, choice: 'imported' | 'existing') {
    setConflictChoices((prev) => new Map(prev).set(key, choice));
  }

  function handleConfirm() {
    const checkableKeys = keyed.filter((k) => k.item.kind === 'new').map((k) => k.key);
    const checkedKeys = new Set(checkableKeys.filter((k) => !uncheckedKeys.has(k)));
    onConfirm({ checkedKeys, conflictChoices });
  }

  function existingAmount(item: PpfReconciliationItem): number {
    return item.existing?.amount ?? 0;
  }

  return (
    <Modal
      onClose={onClose}
      title="Review import"
      scrollable
      footer={
        <Button variant="primary" fullWidth onPress={handleConfirm} loading={saving} disabled={saving}>
          {confirmLabel}
        </Button>
      }
    >
      <Text className="-mt-2 text-[10px] text-tertiary" numberOfLines={1}>
        {title}
      </Text>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <StatBox size="sm" label="New" value={totalNew} valueColor={theme.info} />
        </View>
        <View className="flex-1">
          <StatBox size="sm" label="Matched" value={totalMatched} valueColor={theme.success} />
        </View>
        <View className="flex-1">
          <StatBox
            size="sm"
            label="Conflict"
            value={totalConflict}
            valueColor={totalConflict > 0 ? theme.warning : undefined}
          />
        </View>
      </View>

      {rejectedCount > 0 && (
        <Text className="text-[10px]" style={{ color: theme.warning }}>
          {rejectedCount} row{rejectedCount === 1 ? '' : 's'} in the file couldn't be read and won't be imported.
        </Text>
      )}

      {conflicts.length > 0 && (
        <View className="gap-2">
          <Text className="text-[9.5px] font-extrabold uppercase tracking-wide px-0.5" style={{ color: theme.warning }}>
            Needs your decision
          </Text>
          {conflicts.map(({ item, key }) => {
            const choice = conflictChoices.get(key) ?? 'imported';
            const state = calcState(item);
            return (
              <View
                key={key}
                className="rounded-2xl p-2.5 gap-2 border"
                style={{ backgroundColor: tint(theme.warning, 10), borderColor: tint(theme.warning, 35) }}
              >
                <View className="flex-row items-center gap-1.5">
                  <Icon name="ti-alert-triangle" size={13} color={theme.warning} />
                  <Text className="text-xs font-bold text-primary flex-1" numberOfLines={1}>
                    {dateLabel(item.date)} · {PPF_TX_LABELS[item.type]}
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  {(['imported', 'existing'] as const).map((side) => {
                    const selected = choice === side;
                    const value = side === 'imported' ? item.imported : existingAmount(item);
                    return (
                      <Pressable
                        key={side}
                        onPress={() => setConflictChoice(key, side)}
                        className="flex-1 rounded-xl p-2 border"
                        style={{
                          backgroundColor: selected ? '#fff7e8' : theme.surface,
                          borderColor: selected ? theme.warning : theme.border
                        }}
                      >
                        <Text
                          className="text-[8px] font-bold uppercase tracking-wide"
                          style={{ color: selected ? '#b1650a' : theme.textTertiary }}
                        >
                          {side === 'imported' ? 'Imported' : 'Existing'}
                        </Text>
                        <Text className="text-xs font-extrabold text-primary mt-0.5 tabular-nums">
                          {formatCurrency(value)}
                        </Text>
                        <View className="flex-row items-center gap-1 mt-1">
                          <View
                            className="w-2.5 h-2.5 rounded-full border"
                            style={{
                              borderColor: selected ? theme.warning : theme.textTertiary,
                              backgroundColor: selected ? theme.warning : 'transparent'
                            }}
                          />
                          <Text
                            className="text-[8.5px] font-semibold"
                            style={{ color: selected ? '#b1650a' : theme.textTertiary }}
                          >
                            {side === 'imported' ? 'Use this — default' : 'Keep this instead'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {state && item.calculatedInterest && (
                  <Text className="text-[9.5px] leading-relaxed" style={{ color: '#6d28d9' }}>
                    Penny's recalculation for this year: {formatCurrency(item.calculatedInterest.amount)}
                    {state === 'differs' ? ' — differs from both figures above.' : '.'}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {calcCards.length > 0 && (
        <View className="gap-2">
          {calcCards.map(({ item, key }) => {
            const state = calcState(item);
            const checked = item.kind === 'new' ? !uncheckedKeys.has(key) : true;
            const badge =
              state === 'differs'
                ? { label: 'Differs', bg: tint(theme.warning, 15), color: '#b1650a' }
                : state === 'not-verified'
                  ? { label: 'Not verified', bg: '#e2e8f0', color: '#94a3b8' }
                  : { label: 'Matches', bg: tint(theme.success, 15), color: theme.success };
            const muted = state === 'not-verified';
            return (
              <View
                key={key}
                className="rounded-2xl p-2.5 gap-1.5 border"
                style={{
                  backgroundColor: muted ? theme.surfaceSecondary : tint(PPF_ACCENT, 10),
                  borderColor: muted ? theme.border : tint(PPF_ACCENT, 35)
                }}
              >
                <View className="flex-row items-center gap-1.5">
                  {item.kind === 'new' && (
                    <Pressable
                      onPress={() => toggleChecked(key)}
                      hitSlop={8}
                      className="w-4 h-4 rounded items-center justify-center border shrink-0"
                      style={{
                        borderColor: checked ? PPF_ACCENT : theme.border,
                        backgroundColor: checked ? PPF_ACCENT : 'transparent'
                      }}
                    >
                      {checked && <Icon name="ti-check" size={10} color="#fff" />}
                    </Pressable>
                  )}
                  <Icon name="ti-calculator" size={13} color={muted ? theme.textTertiary : PPF_ACCENT} />
                  <Text
                    className="text-[10.5px] font-extrabold flex-1"
                    style={{ color: muted ? theme.textSecondary : '#5b21b6' }}
                    numberOfLines={1}
                  >
                    {PPF_TX_LABELS[item.type]} · {dateLabel(item.date)}
                  </Text>
                  <Text
                    className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1 rounded-lg p-1.5 bg-surface border border-theme">
                    <Text className="text-[8px] font-bold uppercase tracking-wide text-tertiary">Imported</Text>
                    <Text className="text-xs font-extrabold text-primary mt-0.5 tabular-nums">
                      {formatCurrency(item.imported)}
                    </Text>
                  </View>
                  <View className="flex-1 rounded-lg p-1.5 bg-surface border border-theme">
                    <Text className="text-[8px] font-bold uppercase tracking-wide text-tertiary">Calculated</Text>
                    <Text className="text-xs font-extrabold text-primary mt-0.5 tabular-nums">
                      {item.calculatedInterest ? formatCurrency(item.calculatedInterest.amount) : '—'}
                    </Text>
                  </View>
                </View>
                <Text className="text-[9px] leading-relaxed" style={{ color: muted ? theme.textTertiary : '#6d28d9' }}>
                  {state === 'not-verified'
                    ? "Penny's earliest record for this account starts after this financial year began, so this calculation isn't based on your full history — shown for reference only, not compared."
                    : state === 'differs'
                      ? "Your statement's figure is kept — it's what was actually credited. The difference may mean a deposit/withdrawal from an earlier year wasn't imported, or landed after the 5th of a month (which pushes it to next month's interest)."
                      : 'Based on the deposits/withdrawals Penny has on record for this year.'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {newItems.length > 0 && (
        <View className="gap-0.5">
          <Text className="text-[9.5px] font-extrabold uppercase tracking-wide px-0.5" style={{ color: theme.info }}>
            New — will be added
          </Text>
          {newItems.map(({ item, key }) => {
            const checked = !uncheckedKeys.has(key);
            return (
              <Pressable
                key={key}
                onPress={() => toggleChecked(key)}
                className="flex-row items-center gap-2.5 py-2 border-b border-dashed border-theme"
              >
                <View
                  className="w-4 h-4 rounded items-center justify-center border shrink-0"
                  style={{
                    borderColor: checked ? theme.info : theme.border,
                    backgroundColor: checked ? theme.info : 'transparent'
                  }}
                >
                  {checked && <Icon name="ti-check" size={10} color="#fff" />}
                </View>
                <Text className="text-[10px] text-tertiary w-[74px]">{dateLabel(item.date)}</Text>
                <Text className="text-xs font-medium text-primary flex-1" numberOfLines={1}>
                  {PPF_TX_LABELS[item.type]}
                </Text>
                <Text className="text-xs font-semibold text-primary tabular-nums">{formatCurrency(item.imported)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {matches.length > 0 && (
        <View>
          <Pressable
            onPress={() => setMatchesExpanded((v) => !v)}
            className="flex-row items-center gap-1.5 py-2 border-t border-theme"
          >
            <Icon name="ti-circle-check" size={14} color={theme.success} />
            <Text className="text-[10.5px] text-secondary flex-1">
              {matches.length} more row{matches.length === 1 ? '' : 's'} already match{matches.length === 1 ? 'es' : ''}{' '}
              your records
            </Text>
            <Text className="text-[9.5px] font-bold" style={{ color: '#64748b' }}>
              {matchesExpanded ? 'Hide' : 'View'}
            </Text>
          </Pressable>
          {matchesExpanded && (
            <View className="gap-1 pb-1">
              {matches.map(({ item, key }) => (
                <View key={key} className="flex-row items-center justify-between px-1 py-1">
                  <Text className="text-[10.5px] text-tertiary">
                    {dateLabel(item.date)} · {PPF_TX_LABELS[item.type]}
                  </Text>
                  <Text className="text-[10.5px] text-tertiary tabular-nums">{formatCurrency(item.imported)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {items.length === 0 && (
        <Text className="text-center text-sm text-tertiary py-6">Nothing in this statement to review.</Text>
      )}
    </Modal>
  );
}
