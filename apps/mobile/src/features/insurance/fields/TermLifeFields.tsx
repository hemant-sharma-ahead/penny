import { View, Text } from 'react-native';
import { AmountInput } from '~/components/ui';
import { Toggle } from '~/components/ui';

interface TermLifeFieldsProps {
  maturityBenefit: string;
  setMaturityBenefit: (v: string) => void;
  isULIP: boolean;
  setIsULIP: (v: boolean) => void;
}

/** Life-exclusive fields — everything Term also needed (Sum assured, Premium payment term, Nominee)
 *  moved into the main `PolicyForm.tsx` flow in the 2026-08-31 dense-grid relayout (they're universal-
 *  enough-in-position now, not truly type-specific placement-wise), leaving only the two fields that
 *  are genuinely Life/ULIP-only: expected maturity benefit, and the ULIP toggle (used purely to pick
 *  the correct revival-window wording if a policy ever lapses — see `premiumSchedule.ts`). */
export function TermLifeFields({ maturityBenefit, setMaturityBenefit, isULIP, setIsULIP }: TermLifeFieldsProps) {
  return (
    <View className="gap-3">
      <AmountInput
        label="Expected maturity benefit (optional)"
        value={maturityBenefit}
        onChange={setMaturityBenefit}
        placeholder="e.g. 4500000"
      />

      <View>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-xs font-medium text-primary">Market-linked (ULIP)?</Text>
            <Text className="text-[10px] text-tertiary mt-0.5">
              Only used to pick the correct revival-window wording if this ever lapses
            </Text>
          </View>
          <Toggle value={isULIP} onChange={setIsULIP} accessibilityLabel="Market-linked (ULIP)" />
        </View>
        <Text className="text-[10px] text-tertiary mt-1.5">
          {isULIP
            ? 'Unit-linked (ULIP) — if lapsed, revivable within 3 years of the first missed premium.'
            : 'Non-linked (Endowment / Whole Life) — if lapsed, revivable within 5 years of the first missed premium.'}
        </Text>
      </View>
    </View>
  );
}
