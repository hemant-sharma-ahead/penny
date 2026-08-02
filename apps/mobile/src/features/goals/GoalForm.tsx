import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import type { Goal, GoalRisk } from '@/core/db/types';
import { epochToDateInput, formatCurrency } from '@/lib/formatters';
import { calcInflation } from '@/core/calculators/inflation';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { TextInput, OptionButton, AmountInput, DateInput, Toggle } from '~/components/ui';
import { FormModal } from '~/components/shared';

/** Assumed long-run retail inflation for the "adjusted for inflation" helper below — same 6% default
 *  the standalone Inflation calculator used before this dissolved into an inline goal-amount helper
 *  (2026-08-01 relocation), not user-editable here (keeps the form from growing another field). */
const ASSUMED_INFLATION_PCT = 6;

interface Props {
  editing: Goal | null;
  onSave: (goal: Goal) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const RISK_OPTIONS: { value: GoalRisk; label: string; color: string }[] = [
  { value: 'conservative', label: 'Conservative', color: '#3b82f6' },
  { value: 'moderate', label: 'Moderate', color: '#10b981' },
  { value: 'aggressive', label: 'Aggressive', color: '#ef4444' }
];

export function GoalForm({ editing, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(editing ? String(editing.targetAmount) : '');
  const [currentAmount, setCurrentAmount] = useState(editing ? String(editing.currentAmount) : '0');
  const [targetDate, setTargetDate] = useState(() => {
    if (editing) return epochToDateInput(editing.targetDate);
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return epochToDateInput(d.getTime());
  });
  const [risk, setRisk] = useState<GoalRisk>(editing?.risk ?? 'moderate');
  // Default on for every goal (new or existing) — a Goal only exists because you deliberately set money
  // aside for something, so "counts toward Safe to spend" is the sensible default across the board, not
  // just for security-oriented goals (Emergency Fund, Retirement). The toggle is purely a manual
  // escape hatch for a goal you personally still want to read as spendable. See `core/goals/progress.ts`.
  const [countsTowardSafeToSpend, setCountsTowardSafeToSpend] = useState(editing?.countsTowardSafeToSpend ?? true);
  const [saving, setSaving] = useState(false);
  const theme = useThemeColors();
  const [nowMs] = useState(() => Date.now());

  const inflationAdjusted = useMemo(() => {
    const amount = parseFloat(targetAmount);
    const years = (new Date(targetDate).getTime() - nowMs) / (365.25 * 24 * 60 * 60 * 1000);
    if (!(amount > 0) || !(years > 0.5)) return null;
    return calcInflation({ currentCost: amount, inflationPct: ASSUMED_INFLATION_PCT, years });
  }, [targetAmount, targetDate, nowMs]);

  function handleSave() {
    const target = parseFloat(targetAmount);
    const current = parseFloat(currentAmount) || 0;
    if (!name.trim() || isNaN(target) || target <= 0) return;
    setSaving(true);
    const now = Date.now();
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      targetAmount: target,
      currentAmount: current,
      targetDate: new Date(targetDate).getTime(),
      risk,
      countsTowardSafeToSpend,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    })
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!editing) return;
    onDelete(editing.id).catch(() => {});
  }

  return (
    <FormModal
      title={editing ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Save goal'}
    >
      <TextInput
        label="Goal name"
        value={name}
        onChange={setName}
        placeholder="e.g. Emergency fund, Europe trip"
        autoFocus
      />

      <AmountInput label="Target amount" value={targetAmount} onChange={setTargetAmount} placeholder="e.g. 500000" />

      <AmountInput label="Already saved" value={currentAmount} onChange={setCurrentAmount} placeholder="0" />
      {editing && (
        <Text className="text-[11px] -mt-2.5 text-tertiary">
          A starting baseline only — contributions logged since (Goal Detail → Add contribution, or linked from a
          transaction) are added to this automatically, not folded in here.
        </Text>
      )}

      <View className="flex-row items-center gap-3 bg-surface-2 border border-theme rounded-xl px-3.5 py-3">
        <View className="flex-1">
          <Text className="text-[12.5px] font-semibold text-primary">Counts toward Safe to spend</Text>
          <Text className="text-[10.5px] text-tertiary mt-0.5 leading-relaxed">
            Money saved here won't show up as available to spend on Home, Expenses, or Cash Flow.
          </Text>
        </View>
        <Toggle
          value={countsTowardSafeToSpend}
          onChange={setCountsTowardSafeToSpend}
          accessibilityLabel="Counts toward Safe to spend"
        />
      </View>

      <DateInput label="Target date" value={targetDate} onChange={setTargetDate} />

      {inflationAdjusted && (
        <View className="rounded-xl p-3 flex-row gap-2 bg-surface-2 border border-theme">
          <Icon name="ti-trending-up" size={16} color={theme.textTertiary} />
          <Text className="text-xs leading-relaxed text-secondary flex-1">
            Adjusted for ~{ASSUMED_INFLATION_PCT}% inflation, this may actually cost about{' '}
            <Text className="font-semibold text-primary">{formatCurrency(inflationAdjusted.futureCost)}</Text> by your
            target date — plan for that, not just today's {formatCurrency(parseFloat(targetAmount))}.
          </Text>
        </View>
      )}

      <View>
        <Text className="text-xs font-medium text-secondary">Investment approach</Text>
        <View className="mt-1 flex-row flex-wrap gap-2">
          {RISK_OPTIONS.map((opt) => (
            <View key={opt.value} className="w-[31%]">
              <OptionButton
                compact
                label={opt.label}
                selected={risk === opt.value}
                onPress={() => setRisk(opt.value)}
                color={opt.color}
              />
            </View>
          ))}
        </View>
        <Text className="text-[10px] mt-1.5 text-tertiary">Conservative 7% · Moderate 11% · Aggressive 14% p.a.</Text>
      </View>
    </FormModal>
  );
}
