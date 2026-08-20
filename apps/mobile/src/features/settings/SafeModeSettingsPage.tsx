import { useMemo, type ReactNode } from 'react';
import { View, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, ListContainer, SectionLabel, Toggle } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { BankLogo } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { useRepository } from '@/hooks/useRepository';
import { notifyAccountsChanged, notifyCategoriesChanged, notifyTagsChanged } from '@/hooks/useDataRefresh';
import { accountsRepo, expenseCategoriesRepo, hashtagsRepo } from '@/core/db/repositories';
import { INTENT_GROUP_META } from '@/core/db/defaultCategories';
import { buildParentCategoryMap, groupKey, isHiddenInSafeMode } from '@/core/expenses/categoryGroups';
import { useSettings, type SafeModeVisibility } from '~/context/SettingsContext';
import type { ExpenseCategory } from '@/core/db/types';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';

/** RN port of apps/web-react/src/features/settings/SafeModeSettingsPage.tsx — straightforward
 *  list/toggle port, no CSS grids or hand-rolled overlays to translate. */

interface ModuleToggleDef {
  key: keyof SafeModeVisibility;
  label: string;
  icon: string;
}

const MODULE_TOGGLES: ModuleToggleDef[] = [
  { key: 'loans', label: 'Loans', icon: 'ti-file-invoice' },
  { key: 'iou', label: 'IOU (lent / borrowed)', icon: 'ti-users' },
  { key: 'portfolio', label: 'Portfolio', icon: 'ti-chart-pie' },
  { key: 'goals', label: 'Goals', icon: 'ti-target' },
  { key: 'insurance', label: 'Insurance', icon: 'ti-shield' },
  { key: 'subscriptions', label: 'Subscriptions', icon: 'ti-refresh' }
];

interface RenderedGroup {
  key: string;
  label: string;
  color: string;
  cats: ExpenseCategory[];
}

function ToggleRow({
  icon,
  iconColor,
  iconElement,
  label,
  value,
  onChange
}: {
  icon: string;
  iconColor?: string;
  /** Overrides the rendered icon element entirely (e.g. `BankLogo` for a real per-bank logo) while
   *  keeping this row's icon tile sizing/background driven by `iconColor` unchanged. */
  iconElement?: ReactNode;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center gap-3 px-3 py-2.5">
      <View
        className="w-8 h-8 rounded-[9px] items-center justify-center"
        // Web falls back to `var(--color-text-tertiary)` (theme-aware), not a hardcoded gray only
        // correct for the Penny Blue theme — found via the 2026-07-26 parity sweep (the 6 "Other
        // modules" rows here have no per-module color, so they always hit this fallback).
        style={{ backgroundColor: iconColor ?? theme.textTertiary }}
      >
        {iconElement ?? <Icon name={icon} size={14} color="#fff" />}
      </View>
      <Text className="flex-1 min-w-0 text-sm font-medium text-primary" numberOfLines={1}>
        {label}
      </Text>
      <Toggle value={value} onChange={onChange} accessibilityLabel={`Hide ${label} in Safe Mode`} />
    </View>
  );
}

export function SafeModeSettingsPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  useDefaultHeaderBack('SafeModeSettings');
  const { safeModeVisibility, setSafeModeVisibility } = useSettings();
  const {
    items: categories,
    save: saveCategory,
    loading: categoriesLoading,
    reload: reloadCategories
  } = useRepository(expenseCategoriesRepo);
  const {
    items: accounts,
    save: saveAccount,
    loading: accountsLoading,
    reload: reloadAccounts
  } = useRepository(accountsRepo);
  const {
    items: hashtags,
    save: saveHashtag,
    loading: hashtagsLoading,
    reload: reloadHashtags
  } = useRepository(hashtagsRepo);
  const sortedHashtags = useMemo(() => [...hashtags].sort((a, b) => b.usageCount - a.usageCount), [hashtags]);
  // Three independent repos back this one screen — pull-to-refresh reloads all of them together.
  const { refreshing, onRefresh } = usePullToRefresh(() => {
    reloadCategories();
    reloadAccounts();
    reloadHashtags();
  });

  const parentCategoryMap = useMemo(() => buildParentCategoryMap(categories), [categories]);

  const groups = useMemo<RenderedGroup[]>(() => {
    const leafCats = categories.filter((c) => !c.isGroup);
    const byKey = new Map<string, ExpenseCategory[]>();
    for (const cat of leafCats) {
      const key = groupKey(cat);
      const arr = byKey.get(key);
      if (arr) arr.push(cat);
      else byKey.set(key, [cat]);
    }
    const ordered: RenderedGroup[] = [];
    for (const [key, meta] of Object.entries(INTENT_GROUP_META)) {
      const cats = byKey.get(key);
      if (cats?.length) ordered.push({ key, label: meta.label, color: meta.color, cats });
    }
    for (const parent of parentCategoryMap.values()) {
      const cats = byKey.get(parent.id);
      if (cats?.length) ordered.push({ key: parent.id, label: parent.name, color: parent.color, cats });
    }
    return ordered;
  }, [categories, parentCategoryMap]);

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View className="px-4 py-4 gap-4">
          <Banner variant="info">
            Safe Mode shows your everyday numbers so you can check things at a glance in public — toggle on the
            accounts, categories, and modules you'd rather keep hidden there. Everyday spending stays visible by
            default; income, transfers, family support, legal, sin goods, and investments default to hidden. Open Mode
            always shows everything — these toggles only change what Safe Mode does.
          </Banner>

          <View>
            <SectionLabel>Accounts</SectionLabel>
            {accountsLoading ? (
              <Text className="text-xs text-tertiary">Loading…</Text>
            ) : accounts.length === 0 ? (
              <Text className="text-xs text-tertiary">No accounts yet.</Text>
            ) : (
              <ListContainer>
                {accounts.map((acc) => (
                  <ToggleRow
                    key={acc.id}
                    icon={acc.icon}
                    iconColor={acc.color}
                    iconElement={<BankLogo account={acc} size={14} color="#fff" />}
                    label={acc.name}
                    value={!!acc.hideInSafeMode}
                    onChange={(hidden) =>
                      void saveAccount({ ...acc, hideInSafeMode: hidden }).then(notifyAccountsChanged)
                    }
                  />
                ))}
              </ListContainer>
            )}
          </View>

          <View>
            <SectionLabel>Tags</SectionLabel>
            <Text className="text-xs text-secondary -mt-1 mb-2">
              Independent of a tag's "Set aside" classification (Manage Tags) — a tag can be hidden here without being
              excluded from your daily-living total, or vice versa.
            </Text>
            {hashtagsLoading ? (
              <Text className="text-xs text-tertiary">Loading…</Text>
            ) : sortedHashtags.length === 0 ? (
              <Text className="text-xs text-tertiary">No tags yet.</Text>
            ) : (
              <ListContainer>
                {sortedHashtags.map((h) => (
                  <ToggleRow
                    key={h.id}
                    icon="ti-hash"
                    iconColor="#ec4899"
                    label={h.name}
                    value={!!h.hideInSafeMode}
                    onChange={(hidden) => void saveHashtag({ ...h, hideInSafeMode: hidden }).then(notifyTagsChanged)}
                  />
                ))}
              </ListContainer>
            )}
          </View>

          <View>
            <SectionLabel>Other modules</SectionLabel>
            <ListContainer>
              {MODULE_TOGGLES.map((m) => (
                <ToggleRow
                  key={m.key}
                  icon={m.icon}
                  label={m.label}
                  value={!safeModeVisibility[m.key]}
                  onChange={(hidden) => setSafeModeVisibility(m.key, !hidden)}
                />
              ))}
            </ListContainer>
          </View>

          <View>
            <SectionLabel>Expense &amp; income categories</SectionLabel>
            <Text className="text-xs text-secondary -mt-1 mb-2">
              Hiding a category hides it everywhere — transactions and budgets. Everyday spending stays visible by
              default; income, transfers, family &amp; giving, legal, sin goods, and financial default to hidden.
            </Text>
            {categoriesLoading ? (
              <Text className="text-xs text-tertiary">Loading…</Text>
            ) : (
              <View className="gap-4">
                {groups.map((g) => (
                  <View key={g.key}>
                    <View className="flex-row items-center gap-1.5 mb-1.5">
                      <View className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                      <Text className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: g.color }}>
                        {g.label}
                      </Text>
                    </View>
                    <ListContainer>
                      {g.cats.map((cat) => (
                        <ToggleRow
                          key={cat.id}
                          icon={cat.icon}
                          iconColor={cat.color}
                          label={cat.name}
                          value={isHiddenInSafeMode(cat)}
                          onChange={(hidden) =>
                            void saveCategory({ ...cat, hideInSafeMode: hidden }).then(notifyCategoriesChanged)
                          }
                        />
                      ))}
                    </ListContainer>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
