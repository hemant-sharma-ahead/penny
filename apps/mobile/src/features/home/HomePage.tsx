import { View, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProfile } from '@/hooks/useProfile';
import { useGroupContext } from '~/context/GroupContext';
import { GroupDashboard } from '~/features/groups/GroupDashboard';
import { MarketTicker } from './MarketTicker';
import { StoriesRow } from './stories/StoriesRow';
import { GlanceHeader } from './GlanceHeader';
import { AccountsStrip } from './AccountsStrip';
import { ToolsGrid } from './ToolsGrid';
import { MoneyStatsCard } from './MoneyStatsCard';
import { FinancialHealthCard } from '~/features/health/FinancialHealthCard';
import { HomeGroupsCard } from './HomeGroupsCard';
import { useHome } from './useHome';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

/**
 * RN port of apps/web-react/src/features/home/HomePage.tsx. Groups is now ported (mobile-migration
 * plan's "Restore integration points" step) — this restores web's `useGroupContext`/`activeGroup` branch
 * (Home becomes that group's `GroupDashboard` when a group is the active context) and the `HomeGroupsCard`
 * placement, both previously dropped when Home was ported personal-only ahead of Groups.
 */
export function HomePage() {
  const modeBg = useModeBackgroundColor();
  const { activeGroup } = useGroupContext();
  const { summary, assetGroups, totalAssets, totalLiabilities } = useHome();
  const { profile } = useProfile();

  // When a group is the active context, Home becomes that group's dashboard.
  if (activeGroup) {
    // GroupDashboard owns its own FlatList/scrolling (its shared-expense feed is virtualized — see its
    // own file), so it isn't wrapped in a ScrollView here the way the personal-home view below still is.
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <GroupDashboard group={activeGroup} />
      </SafeAreaView>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.displayName?.trim().split(/\s+/)[0];

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="px-4 pt-3 pb-6">
          <Text className="text-xl font-semibold text-primary mb-3">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </Text>

          {summary && (
            <GlanceHeader
              summary={summary}
              assetGroups={assetGroups}
              totalAssets={totalAssets}
              totalLiabilities={totalLiabilities}
            />
          )}

          <MoneyStatsCard />

          <FinancialHealthCard />

          <View className="mb-4">
            <StoriesRow />
          </View>

          <HomeGroupsCard />

          {summary && summary.accountBalances.length > 0 && (
            <View className="mb-4">
              <AccountsStrip accounts={summary.accountBalances} />
            </View>
          )}

          <View className="mb-4">
            <MarketTicker />
          </View>

          <ToolsGrid />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
