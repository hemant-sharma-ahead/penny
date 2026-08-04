import { useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { getCalculator, type CalculatorId } from './calculatorRegistry';
import { FireCalculator } from './FireCalculator';
import { SipSwpCalculator } from './SipSwpCalculator';
import { FdRdCalculator } from './FdRdCalculator';
import { LumpsumCalculator } from './LumpsumCalculator';
import { GratuityCalculator } from './GratuityCalculator';
import { SsyCalculator } from './SsyCalculator';

function renderCalculator(id: CalculatorId) {
  switch (id) {
    case 'fire':
      return <FireCalculator />;
    case 'sip-swp':
      return <SipSwpCalculator />;
    case 'fd-rd':
      return <FdRdCalculator />;
    case 'lumpsum':
      return <LumpsumCalculator />;
    case 'gratuity':
      return <GratuityCalculator />;
    case 'ssy':
      return <SsyCalculator />;
  }
}

/**
 * A calculator's contextual entry point (2026-08-01 relocation) — an icon+title+subtitle row that opens
 * that calculator's existing, unchanged form/logic inside the shared centred `Modal` (never a bottom
 * sheet, per `docs/DESIGN_GUIDELINES.md`) rather than a pushed screen — matches how Portfolio's own
 * hand-rolled overlays already work, and avoids giving Portfolio a nested `Stack.Navigator` it doesn't
 * otherwise need (see `MainTabs.tsx`'s doc comment on why Portfolio renders directly today).
 */
function CalculatorEntryRow({ id }: { id: CalculatorId }) {
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);
  const meta = getCalculator(id);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2.5 bg-surface border border-theme rounded-xl p-2.5 mb-2"
      >
        <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: tint(meta.color) }}>
          <Icon name={meta.icon} size={16} color={meta.color} />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-bold text-primary">{meta.title}</Text>
          <Text className="text-[10px] text-tertiary mt-0.5">{meta.subtitle}</Text>
        </View>
        <Icon name="ti-chevron-right" size={16} color={theme.textTertiary} />
      </Pressable>

      {open && (
        <Modal title={meta.title} onClose={() => setOpen(false)} scrollable>
          {renderCalculator(id)}
        </Modal>
      )}
    </>
  );
}

/** A labelled group of calculator entry rows — dropped into whichever screen a calculator is actually
 *  about (Portfolio's Retirement/Fixed Income sections today), instead of Home's old generic hub. */
export function CalculatorsSection({ ids }: { ids: CalculatorId[] }) {
  return (
    <View className="mt-1">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-2">Calculators</Text>
      {ids.map((id) => (
        <CalculatorEntryRow key={id} id={id} />
      ))}
    </View>
  );
}
