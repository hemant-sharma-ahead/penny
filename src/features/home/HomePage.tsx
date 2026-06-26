import { MarketStrip } from './MarketStrip';
import { NetWorthCard } from './NetWorthCard';
import { AccountsStrip } from './AccountsStrip';
import { SafeToSpendCard } from './SafeToSpendCard';
import { ToolsGrid } from './ToolsGrid';
import { useHome } from './useHome';

export function HomePage() {
  const { summary, assetGroups, totalAssets, totalLiabilities } = useHome();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-primary">{greeting}</h2>

      {summary && (
        <NetWorthCard
          summary={summary}
          assetGroups={assetGroups}
          totalAssets={totalAssets}
          totalLiabilities={totalLiabilities}
        />
      )}

      <MarketStrip />

      {summary && summary.accountBalances.length > 0 && <AccountsStrip accounts={summary.accountBalances} />}

      <SafeToSpendCard />

      <ToolsGrid />
    </div>
  );
}
