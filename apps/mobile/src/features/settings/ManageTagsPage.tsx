import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListContainer, SearchInput, Toggle } from '~/components/ui';
import { TipNudgeBanner } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useRepository } from '@/hooks/useRepository';
import { notifyTagsChanged } from '@/hooks/useDataRefresh';
import { hashtagsRepo } from '@/core/db/repositories';
import { dismissTip } from '~/lib/tipsStorage';
import { shouldNudgeSetAside } from '@/core/tips/tipTriggers';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';

/**
 * RN port of apps/web-react/src/features/settings/ManageTagsPage.tsx. The only place an *existing*
 * tag's "Set aside" classification can be changed — retroactively reclassifies every past transaction
 * carrying that tag, so it deliberately doesn't live one accidental tap away in the Add Expense form.
 */
export function ManageTagsPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const { items: hashtags, save: saveHashtag, loading, reload } = useRepository(hashtagsRepo);
  const [search, setSearch] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  useDefaultHeaderBack('ManageTags');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? hashtags.filter((h) => h.name.includes(q)) : hashtags;
    return [...list].sort((a, b) => b.usageCount - a.usageCount);
  }, [hashtags, search]);

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View className="px-4 py-4 gap-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search tags…" />

          {/* Tier 1 "Did you know" nudge (2026-08-16) — fires once, ever, once there are a few tags but
              none has ever been marked Set Aside. Suppressed permanently on dismiss OR the moment the
              user actually turns Set Aside on for any tag (see the Toggle's onChange below). */}
          <TipNudgeBanner
            id="tag-set-aside"
            text="Did you know “Set Aside” keeps a tag’s spend out of your daily-living total — without hiding it? Try it on any tag below."
            active={shouldNudgeSetAside(
              hashtags.length,
              hashtags.some((h) => h.setAside)
            )}
          />

          <View>
            <View className="flex-row items-center gap-1.5 mb-1">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">Set aside</Text>
              <Pressable onPress={() => setShowInfo((v) => !v)} accessibilityLabel="What does Set aside mean?">
                <Icon name="ti-info-circle" size={14} color={theme.textTertiary} />
              </Pressable>
            </View>
            <Text className="text-xs text-secondary mb-2 leading-relaxed">
              This is the only place to change an existing tag's classification — changing it here retroactively affects
              every past transaction that carries the tag, which is why the Add Expense form only lets you set this
              once, when a tag is first created.
            </Text>
            {showInfo && (
              <View className="rounded-xl bg-surface-3 px-3.5 py-3 mb-3">
                <Text className="text-xs text-secondary leading-relaxed">
                  Transactions tagged with a "Set aside" tag don't count toward your daily living total or health score
                  — use it for money spent on someone else's behalf, gifts, or anything that shouldn't skew your
                  everyday spending picture. Budgets are unaffected (a tagged expense still counts against its
                  category's budget — this only changes the routine/set-aside split). Independent of whether the tag is
                  hidden in Safe Mode (Settings → Safe Mode → Tags).
                </Text>
              </View>
            )}

            {loading ? (
              <Text className="text-xs text-tertiary">Loading…</Text>
            ) : filtered.length === 0 ? (
              <Text className="text-xs text-tertiary">{search ? 'No matching tags.' : 'No tags yet.'}</Text>
            ) : (
              <ListContainer>
                {filtered.map((h) => (
                  <View key={h.id} className="flex-row items-center gap-3 px-3 py-2.5">
                    <View className="w-8 h-8 rounded-[9px] items-center justify-center bg-surface-2">
                      <Icon name="ti-hash" size={14} color="#ec4899" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                        #{h.name}
                      </Text>
                      <Text className="text-[11px] text-tertiary">
                        {h.usageCount} transaction{h.usageCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Toggle
                      value={!!h.setAside}
                      onChange={(setAside) => {
                        // The user just did the exact thing the Set-Aside nudge above points at —
                        // suppress it for good, same "dismissed OR acted upon" rule every Tier 1 nudge
                        // follows (regardless of which specific tag they toggled it on for).
                        if (setAside) void dismissTip('tag-set-aside');
                        // Turning Set Aside on defaults Safe Mode visibility to match, same smart default as a
                        // brand-new tag gets — still independently editable in Settings → Safe Mode → Tags.
                        void saveHashtag({
                          ...h,
                          setAside,
                          hideInSafeMode: setAside ? true : h.hideInSafeMode
                        }).then(notifyTagsChanged);
                      }}
                      accessibilityLabel={`Set aside #${h.name}`}
                    />
                  </View>
                ))}
              </ListContainer>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
