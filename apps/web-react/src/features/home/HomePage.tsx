import { MarketTicker } from './MarketTicker';
import { StoriesRow } from './stories/StoriesRow';
import { GlanceHeader } from './GlanceHeader';
import { AccountsStrip } from './AccountsStrip';
import { ToolsGrid } from './ToolsGrid';
import { MoneyStatsCard } from './MoneyStatsCard';
import { FinancialHealthCard } from '@/features/health/FinancialHealthCard';
import { useHome } from './useHome';
import { useProfile } from '@/hooks/useProfile';
import { useGroupContext } from '@/context/GroupContext';
import { GroupDashboard } from '@/features/groups/GroupDashboard';
import { HomeGroupsCard } from '@/features/groups/HomeGroupsCard';

export function HomePage() {
  const { activeGroup } = useGroupContext();
  const { summary, assetGroups, totalAssets, totalLiabilities } = useHome();
  const { profile } = useProfile();

  // When a group is the active context, Home becomes that group's dashboard.
  if (activeGroup) return <GroupDashboard group={activeGroup} />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.displayName?.trim().split(/\s+/)[0];

  return (
    <div className="px-4 pt-3 pb-6 flex flex-col">
      {/* Personal glance — greeting first, then your money */}
      <h2 className="text-xl font-semibold text-primary mb-3">
        {greeting}
        {firstName ? `, ${firstName}` : ''}
      </h2>

      {summary && (
        <GlanceHeader
          summary={summary}
          assetGroups={assetGroups}
          totalAssets={totalAssets}
          totalLiabilities={totalLiabilities}
        />
      )}

      {/* Money facts: spent this month · insurance · loans */}
      <MoneyStatsCard />

      {/* How am I doing — folded health score + quick wins */}
      <FinancialHealthCard />

      {/* Attention / insights */}
      <div className="mb-4">
        <StoriesRow />
      </div>

      {/* Your world */}
      <HomeGroupsCard />

      {summary && summary.accountBalances.length > 0 && (
        <div className="mb-4">
          <AccountsStrip accounts={summary.accountBalances} />
        </div>
      )}

      {/* Context: markets sit below your own money */}
      <div className="mb-4">
        <MarketTicker />
      </div>

      <ToolsGrid />
    </div>
  );
}
