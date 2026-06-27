import { MarketTicker } from './MarketTicker';
import { StoriesRow } from './stories/StoriesRow';
import { GlanceHeader } from './GlanceHeader';
import { AccountsStrip } from './AccountsStrip';
import { ToolsGrid } from './ToolsGrid';
import { useHome } from './useHome';

export function HomePage() {
  const { summary, assetGroups, totalAssets, totalLiabilities } = useHome();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="px-4 pt-3 pb-6 flex flex-col">
      {/* Markets at top — the standard placement users expect */}
      <div className="mb-3">
        <MarketTicker />
      </div>

      <h2 className="text-xl font-semibold text-primary mb-3">{greeting}</h2>

      {/* Instagram-style stories — surfaced on Home, the screen users visit daily */}
      <div className="mb-4">
        <StoriesRow />
      </div>

      {summary && (
        <GlanceHeader
          summary={summary}
          assetGroups={assetGroups}
          totalAssets={totalAssets}
          totalLiabilities={totalLiabilities}
        />
      )}

      {summary && summary.accountBalances.length > 0 && (
        <div className="mb-4">
          <AccountsStrip accounts={summary.accountBalances} />
        </div>
      )}

      <ToolsGrid />
    </div>
  );
}
