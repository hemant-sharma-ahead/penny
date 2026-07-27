import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader, SearchInput } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { CALCULATORS, getCalculator, searchCalculators, type CalculatorId } from './calculatorRegistry';
import { FireCalculator } from './FireCalculator';
import { HraCalculator } from './HraCalculator';
import { SipSwpCalculator } from './SipSwpCalculator';
import { TaxRegimeCalculator } from './TaxRegimeCalculator';
import { FdRdCalculator } from './FdRdCalculator';
import { LumpsumCalculator } from './LumpsumCalculator';
import { CapitalGainsCalculator } from './CapitalGainsCalculator';
import { GratuityCalculator } from './GratuityCalculator';
import { SsyCalculator } from './SsyCalculator';
import { InflationCalculator } from './InflationCalculator';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

function renderCalculator(id: CalculatorId) {
  switch (id) {
    case 'fire':
      return <FireCalculator />;
    case 'hra':
      return <HraCalculator />;
    case 'sip-swp':
      return <SipSwpCalculator />;
    case 'tax-regime':
      return <TaxRegimeCalculator />;
    case 'fd-rd':
      return <FdRdCalculator />;
    case 'lumpsum':
      return <LumpsumCalculator />;
    case 'capital-gains':
      return <CapitalGainsCalculator />;
    case 'gratuity':
      return <GratuityCalculator />;
    case 'ssy':
      return <SsyCalculator />;
    case 'inflation':
      return <InflationCalculator />;
    default:
      return null;
  }
}

/**
 * RN port of apps/web-react/src/features/calculators/CalculatorsPage.tsx. Web's `?calc=` URL search
 * param (so a calculator is a shareable/bookmarkable deep link) becomes plain local `useState` — RN has
 * no URL bar, and no other screen deep-links into a specific calculator yet.
 */
export function CalculatorsPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<CalculatorId | null>(null);

  const active = activeId ? getCalculator(activeId) : undefined;
  const results = useMemo(() => searchCalculators(query), [query]);

  // ── Detail view ────────────────────────────────────────────────────────────────
  if (active) {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <View className="px-4 pt-4 pb-3 border-b border-theme flex-row items-center gap-3">
          {/* Web just clears local `?calc=` state here, returning to the list within the same page —
              the shared `BackButton` calls `navigation.goBack()`, which would exit the whole feature
              instead (found via the 2026-07-25 parity sweep). Clear `activeId` directly instead. */}
          <Pressable
            onPress={() => setActiveId(null)}
            accessibilityLabel="Back to calculators"
            hitSlop={8}
            className="w-9 h-9 items-center justify-center rounded-full -ml-2"
          >
            <Icon name="ti-arrow-left" size={20} color={theme.textSecondary} />
          </Pressable>
          <View className="flex-row items-center gap-2.5 flex-1">
            <View
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: tint(active.color) }}
            >
              <Icon name={active.icon} size={18} color={active.color} />
            </View>
            <Text className="text-base font-semibold text-primary flex-1" numberOfLines={1}>
              {active.title}
            </Text>
          </View>
        </View>

        <ScrollView>
          <View className="px-4 py-4 pb-24">{renderCalculator(active.id)}</View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Searchable list view ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader leading={<BackButton />} title="Calculators">
        <Text className="text-xs mt-0.5 text-tertiary">On-device calculations — nothing leaves your phone</Text>
      </PageHeader>

      <View className="px-4 py-3 border-b border-theme">
        <SearchInput value={query} onChange={setQuery} placeholder="Search calculators…" />
      </View>

      <ScrollView>
        <View className="px-4 py-4 gap-2.5">
          {results.length === 0 && (
            <View className="items-center py-12">
              <Icon name="ti-search-off" size={32} color={theme.textTertiary} />
              <Text className="text-sm mt-2 text-tertiary">No calculators match "{query}"</Text>
            </View>
          )}

          {results.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setActiveId(c.id)}
              className="bg-surface border border-theme rounded-2xl p-3.5 flex-row items-center gap-3"
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: tint(c.color) }}
              >
                <Icon name={c.icon} size={20} color={c.color} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary">{c.title}</Text>
                <Text className="text-xs text-tertiary leading-snug">{c.subtitle}</Text>
              </View>
              <Icon name="ti-chevron-right" size={16} color={theme.textTertiary} />
            </Pressable>
          ))}

          {query.trim() === '' && (
            <Text className="text-[11px] text-center text-tertiary mt-2">
              {CALCULATORS.length} calculators available
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
