import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Button, Card, SectionLabel, SegmentedControl, SelectInput, Badge } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { ColumnMapping } from '@/core/import/importMatcher';

interface MapColumnsStepProps {
  header: string[];
  mapping: ColumnMapping;
  onConfirm: (mapping: ColumnMapping) => void;
  onBack: () => void;
}

type AmountMode = 'single' | 'split';
type TypeMode = 'text' | 'incomeFlag';

const NONE = '-1';

function columnOptions(header: string[], includeNone: boolean) {
  const opts = header.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }));
  return includeNone ? [{ value: NONE, label: '— None —' }, ...opts] : opts;
}

/** A field label row with an optional "Auto-matched" badge (2026-08-23, real-device-testing-pass item
 *  79) — every field below this component's own required Date/Description pair uses this instead of
 *  `SelectInput`'s own `label` prop, so a field `guessColumnMapping()` already resolved can say so right
 *  next to its label, matching the mockup's confirmed final direction. */
function FieldLabel({ label, autoMatched }: { label: string; autoMatched?: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-xs font-medium text-secondary">{label}</Text>
      {autoMatched && <Badge label="Auto-matched" size="sm" />}
    </View>
  );
}

/**
 * RN port of apps/web-react/src/features/import/MapColumnsStep.tsx. Custom-format only: lets the user
 * confirm/adjust the column mapping importMatcher.ts guessed, rather than starting from a blank slate.
 * Amount is a genuine either/or: one signed column, or a separate debit/credit (outflow/inflow) pair.
 *
 * 2026-08-23 redesign (real-device-testing-pass item 79, `docs/mockups/proposals/
 * penny-csv-mapping-and-group-leave-v1.html`'s confirmed-final "Required/Common + collapsible More
 * fields" direction): `ColumnMapping` has always modeled more fields than this screen ever showed —
 * `tags`/`paymentMode`/`bankName`/`accountType` and an explicit type-text/income-flag pair were resolved
 * by `guessColumnMapping()` behind the scenes but never rendered here, silently unconfirmable/
 * uneditable for a Custom-format import. Required + a "commonly used" tier are always visible; the rest
 * live in a collapsible "More fields" disclosure (chevron-header pattern reused from
 * `review/DuplicatesBucket.tsx`) that auto-expands, with an "N auto-matched" badge, whenever the initial
 * guess already filled anything inside it — a pre-filled value must never hide inside a collapsed
 * section unseen. `iouPerson`/`sharedToGroupNote` (item 76/77's new Penny-only export columns) are
 * deliberately NOT added here — see `importMatcher.ts`'s own doc comment on those two fields for why.
 */
export function MapColumnsStep({ header, mapping, onConfirm, onBack }: MapColumnsStepProps) {
  const theme = useThemeColors();
  const [m, setM] = useState<ColumnMapping>(mapping);
  const [amountMode, setAmountMode] = useState<AmountMode>(
    mapping.outflow >= 0 && mapping.inflow >= 0 ? 'split' : 'single'
  );
  const [typeMode, setTypeMode] = useState<TypeMode>(
    mapping.incomeFlag >= 0 && mapping.typeText < 0 ? 'incomeFlag' : 'text'
  );

  // A one-time snapshot of what `guessColumnMapping()` resolved BEFORE any user edit — drives every
  // "Auto-matched" badge and the More-fields auto-expand/count below. Deliberately never recomputed as
  // the user edits `m`: a field the user manually clears (or fills in) must not have its badge flicker
  // on/off as a side effect of their own edit — "auto-matched" means "the guess found this," not
  // "this select currently has a value."
  const [initialMapping] = useState(mapping);
  const moreFieldsAutoMatched = {
    tags: initialMapping.tags >= 0,
    type: initialMapping.typeText >= 0 || initialMapping.incomeFlag >= 0,
    bankName: initialMapping.bankName >= 0,
    accountType: initialMapping.accountType >= 0
  };
  const moreFieldsAutoMatchedCount = Object.values(moreFieldsAutoMatched).filter(Boolean).length;
  const [moreExpanded, setMoreExpanded] = useState(moreFieldsAutoMatchedCount > 0);

  function set(field: keyof ColumnMapping, value: string) {
    setM((prev) => ({ ...prev, [field]: Number(value) }));
  }

  const requiredMissing =
    m.date < 0 || m.description < 0 || (amountMode === 'single' ? m.amount < 0 : m.outflow < 0 || m.inflow < 0);

  function handleConfirm() {
    onConfirm({
      ...m,
      ...(amountMode === 'single' ? { outflow: -1, inflow: -1 } : { amount: -1 }),
      ...(typeMode === 'text' ? { incomeFlag: -1 } : { typeText: -1 })
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
        <SectionLabel className="-mb-1">Required</SectionLabel>
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
          <SectionLabel className="-mb-1">Amount</SectionLabel>
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

        <SectionLabel className="-mb-1">Optional — commonly used</SectionLabel>
        <SelectInput
          label="Category"
          value={m.category >= 0 ? String(m.category) : NONE}
          onChange={(v) => set('category', v)}
          options={columnOptions(header, true)}
        />
        <SelectInput
          label="Account"
          value={m.account >= 0 ? String(m.account) : NONE}
          onChange={(v) => set('account', v)}
          options={columnOptions(header, true)}
          hint="Leave as None if your file doesn't track which account each row is from."
        />
        <View className="gap-1.5">
          <FieldLabel label="Payment mode" autoMatched={initialMapping.paymentMode >= 0} />
          <SelectInput
            value={m.paymentMode >= 0 ? String(m.paymentMode) : NONE}
            onChange={(v) => set('paymentMode', v)}
            options={columnOptions(header, true)}
          />
        </View>
        <SelectInput
          label="Notes"
          value={m.notes >= 0 ? String(m.notes) : NONE}
          onChange={(v) => set('notes', v)}
          options={columnOptions(header, true)}
        />

        <View className="rounded-xl overflow-hidden border border-theme">
          <Pressable
            onPress={() => setMoreExpanded((prev) => !prev)}
            className="flex-row items-center gap-1.5 px-2.5 py-2.5"
            style={{ backgroundColor: tint(theme.neutral, 12) }}
            accessibilityLabel={moreExpanded ? 'Collapse more fields' : 'Expand more fields'}
          >
            <Icon name={moreExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={13} color={theme.textTertiary} />
            <Text className="text-xs font-bold text-primary flex-1">More fields</Text>
            {moreFieldsAutoMatchedCount > 0 && <Badge label={`${moreFieldsAutoMatchedCount} auto-matched`} size="sm" />}
          </Pressable>

          {moreExpanded && (
            <View className="border-t border-theme px-2.5 py-3 gap-3" style={{ backgroundColor: theme.surface }}>
              <View className="gap-1.5">
                <FieldLabel label="Tags" autoMatched={moreFieldsAutoMatched.tags} />
                <SelectInput
                  value={m.tags >= 0 ? String(m.tags) : NONE}
                  onChange={(v) => set('tags', v)}
                  options={columnOptions(header, true)}
                />
              </View>

              <View className="gap-2">
                <SectionLabel className="-mb-1">Transaction type</SectionLabel>
                <SegmentedControl
                  options={[
                    { value: 'text', label: 'Text column' },
                    { value: 'incomeFlag', label: 'Income-flag column' }
                  ]}
                  value={typeMode}
                  onChange={(v) => setTypeMode(v as TypeMode)}
                />
                {typeMode === 'text' ? (
                  <View className="gap-1.5">
                    <FieldLabel label="Type" autoMatched={initialMapping.typeText >= 0} />
                    <SelectInput
                      value={m.typeText >= 0 ? String(m.typeText) : NONE}
                      onChange={(v) => set('typeText', v)}
                      options={columnOptions(header, true)}
                    />
                  </View>
                ) : (
                  <View className="gap-1.5">
                    <FieldLabel label="Income flag" autoMatched={initialMapping.incomeFlag >= 0} />
                    <SelectInput
                      value={m.incomeFlag >= 0 ? String(m.incomeFlag) : NONE}
                      onChange={(v) => set('incomeFlag', v)}
                      options={columnOptions(header, true)}
                    />
                  </View>
                )}
              </View>

              <View className="gap-1.5">
                <FieldLabel label="Bank name" autoMatched={moreFieldsAutoMatched.bankName} />
                <SelectInput
                  value={m.bankName >= 0 ? String(m.bankName) : NONE}
                  onChange={(v) => set('bankName', v)}
                  options={columnOptions(header, true)}
                />
              </View>

              <SelectInput
                label="Account type"
                value={m.accountType >= 0 ? String(m.accountType) : NONE}
                onChange={(v) => set('accountType', v)}
                options={columnOptions(header, true)}
              />
            </View>
          )}
        </View>
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
