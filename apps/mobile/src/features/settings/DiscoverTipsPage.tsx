import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, SearchInput, SectionLabel, Toggle } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { DID_YOU_KNOW_FACTS } from '@/core/tips/didYouKnowFacts';
import type { TipModule } from '@/core/tips/types';
import { getDailyTipEnabled, setDailyTipEnabled } from '~/lib/tipsStorage';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';

const MODULE_META: Record<TipModule, { label: string; icon: string }> = {
  transactions: { label: 'Transactions', icon: 'ti-receipt' },
  categories: { label: 'Categories', icon: 'ti-category' },
  tags: { label: 'Tags, Events & Set Aside', icon: 'ti-hash' },
  events: { label: 'Tags, Events & Set Aside', icon: 'ti-hash' },
  iou: { label: 'Lending & IOU', icon: 'ti-users' },
  import: { label: 'Import & Merchant Memory', icon: 'ti-file-import' },
  analytics: { label: 'Analytics', icon: 'ti-chart-bar' },
  budgets: { label: 'Budgets', icon: 'ti-target-arrow' },
  backup: { label: 'Backup, Timeline & Privacy', icon: 'ti-shield-lock' },
  timeline: { label: 'Backup, Timeline & Privacy', icon: 'ti-shield-lock' },
  privacy: { label: 'Backup, Timeline & Privacy', icon: 'ti-shield-lock' },
  portfolio: { label: 'Portfolio, EPF & PPF', icon: 'ti-building-bank' },
  goals: { label: 'Goals & Financial Health', icon: 'ti-target' },
  chip: { label: 'Chip', icon: 'ti-sparkles' },
  groups: { label: 'Groups & Onboarding', icon: 'ti-users-group' },
  onboarding: { label: 'Groups & Onboarding', icon: 'ti-users-group' },
  tax: { label: 'Tax', icon: 'ti-receipt-tax' }
};

/** Several `TipModule`s share one displayed group (see `MODULE_META` above — Tags/Events, Backup/
 *  Timeline/Privacy, Groups/Onboarding) since each is too small on its own to read as a real section.
 *  Grouping key is the shared label, not the raw module. */
function groupLabelFor(module: TipModule): string {
  return MODULE_META[module].label;
}

/**
 * "Discover Penny" hub (2026-08-16, Tier 3) — the full tip catalogue (curated + everything else the
 * research turned up), grouped by module, searchable. Nothing here is gated by "seen" state; unlike the
 * Home daily card (Tier 2) and contextual nudges (Tier 1), which only ever draw from the curated subset
 * (`DidYouKnowFact.curated`), this hub shows the whole library — it's the complete, always-available
 * reference the other two tiers point to. The Home daily-card on/off toggle lives at the top of this
 * page rather than a separate row in general Settings, since every tip-related control belongs together.
 */
export function DiscoverTipsPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  useDefaultHeaderBack('DiscoverTips');
  const [search, setSearch] = useState('');
  const [dailyTipEnabled, setDailyTipEnabledState] = useState(true);

  useEffect(() => {
    void getDailyTipEnabled().then(setDailyTipEnabledState);
  }, []);

  function handleToggleDailyTip(value: boolean) {
    setDailyTipEnabledState(value);
    void setDailyTipEnabled(value);
  }

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? DID_YOU_KNOW_FACTS.filter((f) => f.text.toLowerCase().includes(q)) : DID_YOU_KNOW_FACTS;
    const byLabel = new Map<string, { icon: string; facts: typeof DID_YOU_KNOW_FACTS }>();
    for (const fact of filtered) {
      const label = groupLabelFor(fact.module);
      const slot = byLabel.get(label) ?? { icon: MODULE_META[fact.module].icon, facts: [] };
      slot.facts.push(fact);
      byLabel.set(label, slot);
    }
    return Array.from(byLabel.entries()).map(([label, { icon, facts }]) => ({ label, icon, facts }));
  }, [search]);

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 py-4 gap-4">
          <Banner variant="info" icon="ti-bulb">
            Everything Penny can do that isn't always obvious from using it day to day — a growing list, curated for
            real usefulness rather than volume.
          </Banner>

          <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl border border-theme bg-surface">
            <View
              className="w-8 h-8 rounded-[9px] items-center justify-center"
              style={{ backgroundColor: tint(theme.info, 10) }}
            >
              <Icon name="ti-calendar-bolt" size={14} color={theme.info} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-medium text-primary">Daily tip on Home</Text>
              <Text className="text-[11px] text-tertiary">One new tip a day, until you've seen them all</Text>
            </View>
            <Toggle value={dailyTipEnabled} onChange={handleToggleDailyTip} accessibilityLabel="Daily tip on Home" />
          </View>

          <SearchInput value={search} onChange={setSearch} placeholder="Search tips…" />

          {groups.length === 0 ? (
            <Text className="text-xs text-tertiary text-center py-6">No matching tips.</Text>
          ) : (
            groups.map((group) => (
              <View key={group.label}>
                <View className="flex-row items-center gap-1.5 mb-1.5">
                  <Icon name={group.icon} size={13} color={theme.info} />
                  <SectionLabel className="mt-0 mb-0">{group.label}</SectionLabel>
                  <Text className="text-[10px] text-tertiary">({group.facts.length})</Text>
                </View>
                <View className="rounded-xl border border-theme bg-surface overflow-hidden">
                  {group.facts.map((fact, i) => (
                    <View key={fact.id} className={`px-3.5 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}>
                      <Text className="text-xs text-secondary leading-relaxed">{fact.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
