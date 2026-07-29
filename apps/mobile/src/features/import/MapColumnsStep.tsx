import { useState } from 'react';
import { View, Text } from 'react-native';
import { Button, Card, SectionLabel, SegmentedControl, SelectInput } from '~/components/ui';
import type { ColumnMapping } from '@/core/import/importMatcher';

interface MapColumnsStepProps {
  header: string[];
  mapping: ColumnMapping;
  onConfirm: (mapping: ColumnMapping) => void;
  onBack: () => void;
}

type AmountMode = 'single' | 'split';

const NONE = '-1';

function columnOptions(header: string[], includeNone: boolean) {
  const opts = header.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }));
  return includeNone ? [{ value: NONE, label: '— None —' }, ...opts] : opts;
}

/**
 * RN port of apps/web-react/src/features/import/MapColumnsStep.tsx. Custom-format only: lets the user
 * confirm/adjust the column mapping importMatcher.ts guessed, rather than starting from a blank slate.
 * Amount is a genuine either/or: one signed column, or a separate debit/credit (outflow/inflow) pair.
 */
export function MapColumnsStep({ header, mapping, onConfirm, onBack }: MapColumnsStepProps) {
  const [m, setM] = useState<ColumnMapping>(mapping);
  const [amountMode, setAmountMode] = useState<AmountMode>(
    mapping.outflow >= 0 && mapping.inflow >= 0 ? 'split' : 'single'
  );

  function set(field: keyof ColumnMapping, value: string) {
    setM((prev) => ({ ...prev, [field]: Number(value) }));
  }

  const requiredMissing =
    m.date < 0 || m.description < 0 || (amountMode === 'single' ? m.amount < 0 : m.outflow < 0 || m.inflow < 0);

  function handleConfirm() {
    onConfirm({
      ...m,
      ...(amountMode === 'single' ? { outflow: -1, inflow: -1 } : { amount: -1 })
    });
  }

  return (
    <>
      <Card padding="sm" radius="md" className="gap-1">
        <Text className="text-sm font-semibold text-primary">Map your columns</Text>
        <Text className="text-xs text-tertiary leading-relaxed">
          We took a best guess from your file&apos;s headers — check it and adjust anything that&apos;s wrong.
        </Text>
      </Card>

      <View className="gap-3">
        <SelectInput
          label="Date"
          required
          value={m.date >= 0 ? String(m.date) : ''}
          onChange={(v) => set('date', v)}
          options={columnOptions(header, false)}
        />
        <SelectInput
          label="Description / merchant"
          required
          value={m.description >= 0 ? String(m.description) : ''}
          onChange={(v) => set('description', v)}
          options={columnOptions(header, false)}
        />

        <View className="gap-2">
          <SectionLabel>Amount</SectionLabel>
          <SegmentedControl
            options={[
              { value: 'single', label: 'One amount column' },
              { value: 'split', label: 'Separate debit / credit' }
            ]}
            value={amountMode}
            onChange={(v) => setAmountMode(v as AmountMode)}
          />
          {amountMode === 'single' ? (
            <SelectInput
              value={m.amount >= 0 ? String(m.amount) : ''}
              onChange={(v) => set('amount', v)}
              options={columnOptions(header, false)}
              placeholder="Which column?"
            />
          ) : (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <SelectInput
                  label="Debit / outflow"
                  value={m.outflow >= 0 ? String(m.outflow) : ''}
                  onChange={(v) => set('outflow', v)}
                  options={columnOptions(header, false)}
                />
              </View>
              <View className="flex-1">
                <SelectInput
                  label="Credit / inflow"
                  value={m.inflow >= 0 ? String(m.inflow) : ''}
                  onChange={(v) => set('inflow', v)}
                  options={columnOptions(header, false)}
                />
              </View>
            </View>
          )}
        </View>

        <SelectInput
          label="Category (optional)"
          value={m.category >= 0 ? String(m.category) : NONE}
          onChange={(v) => set('category', v)}
          options={columnOptions(header, true)}
        />
        <SelectInput
          label="Account (optional)"
          value={m.account >= 0 ? String(m.account) : NONE}
          onChange={(v) => set('account', v)}
          options={columnOptions(header, true)}
          hint="Leave as None if your file doesn't track which account each row is from."
        />
        <SelectInput
          label="Notes (optional)"
          value={m.notes >= 0 ? String(m.notes) : NONE}
          onChange={(v) => set('notes', v)}
          options={columnOptions(header, true)}
        />
      </View>

      <View className="flex-row gap-3 pb-4">
        <Button variant="secondary" className="flex-1" onPress={onBack}>
          Back
        </Button>
        <Button variant="primary" className="flex-[2]" disabled={requiredMissing} onPress={handleConfirm}>
          Continue
        </Button>
      </View>
    </>
  );
}
