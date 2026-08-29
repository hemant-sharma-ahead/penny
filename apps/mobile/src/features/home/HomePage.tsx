import { View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useGroupContext } from '~/context/GroupContext';
import { GroupDashboard } from '~/features/groups/GroupDashboard';
import { DailyTipCard } from '~/components/shared';
import { Card, PennyLoader } from '~/components/ui';
import { StoriesRow } from './stories/StoriesRow';
import { GlanceHeader } from './GlanceHeader';
import { AccountsStrip } from './AccountsStrip';
import { MoneyStatsCard } from './MoneyStatsCard';
import { FinancialHealthCard } from '~/features/health/FinancialHealthCard';
import { HomeGroupsCard } from './HomeGroupsCard';
import { useHome } from './useHome';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useThemeColors } from '~/theme/useThemeColors';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';
import type { AppRouteKey } from '@/core/advisor/guidance';

/** Maps the advisor's platform-agnostic route keys to this app's actual screen names — RN port of
 *  apps/web-react/src/features/health/FinancialHealthCard.tsx's `ROUTE_MAP`. Resolved from within
 *  HomeStack (this hook is used from `HomePage`, a HomeStack screen), same bubble-up-to-parent-tab
 *  pattern `GlanceHeader`/`useHomeStories` already rely on for `Portfolio`/`Expenses`/`Goals`. */
const ROUTE_MAP: Record<AppRouteKey, string> = {
  goals: 'Goals',
  insurance: 'Insurance',
  expenses: 'Expenses',
  loans: 'Loans',
  portfolio: 'Portfolio'
};

/**
 * RN port of apps/web-react/src/features/home/HomePage.tsx. Groups is now ported (mobile-migration
 * plan's "Restore integration points" step) — this restores web's `useGroupContext`/`activeGroup` branch
 * (Home becomes that group's `GroupDashboard` when a group is the active context) and the `HomeGroupsCard`
 * placement, both previously dropped when Home was ported personal-only ahead of Groups.
 */
export function HomePage() {
  const theme = useThemeColors();
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { activeGroup } = useGroupContext();
  const { summary, assetGroups, totalAssets, reload } = useHome();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  useRegisterHeaderScreen('HomeMain');

  // When a group is the active context, Home becomes that group's dashboard. "Personal ▾"/the group
  // name itself is no longer rendered here at all — 2026-08-01 chrome consolidation moved it into
  // `MainTabs`' own global header (center slot, Home only), replacing the floating pill this file used
  // to render (2026-07-31) above the tab bar.
  if (activeGroup) {
    // GroupDashboard owns its own FlatList/scrolling (its shared-expense feed is virtualized — see its
    // own file), so it isn't wrapped in a ScrollView here the way the personal-home view below still is.
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <GroupDashboard group={activeGroup} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View className="px-4 pt-3 pb-6">
          {/* Home's daily "Did you know" card (2026-08-16) — deliberately the very first thing on the
              screen, above the at-a-glance summary: Home is the most-visited screen, so this is where a
              daily tip earns the most eyes. See DailyTipCard.tsx's own doc comment for the full mechanics
              (one new curated tip a day, stops once all are shown, toggle in Discover Penny). */}
          <DailyTipCard onSeeAll={() => navigation.navigate('DiscoverTips')} />

          {summary ? (
            <GlanceHeader summary={summary} assetGroups={assetGroups} totalAssets={totalAssets} />
          ) : (
            // Cold-start placeholder — `summary` stays null until `useHome`'s first load resolves.
            // Previously this slot (and AccountsStrip's below) rendered nothing at all, which is what
            // made a slow load read as a blank screen rather than a busy one (2026-08-28, real-device
            // performance pass). Roughly matches GlanceHeader's own height so the layout doesn't jump
            // once real content swaps in.
            <Card radius="lg" className="items-center justify-center py-10 mb-4">
              <PennyLoader size="lg" accessibilityLabel="Loading your summary" />
            </Card>
          )}

          <MoneyStatsCard />

          <FinancialHealthCard onNavigate={(to) => navigation.navigate(ROUTE_MAP[to])} />

          <View className="mb-4">
            <StoriesRow />
          </View>

          <HomeGroupsCard />

          {summary && summary.accountBalances.length > 0 && (
            <View className="mb-4">
              <AccountsStrip accounts={summary.accountBalances} />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
