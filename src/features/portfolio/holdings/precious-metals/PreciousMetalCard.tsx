import { Card, IconBadge } from '@/components/ui';
import { goldPriceForKarat } from '@/core/metals/metalsClient';
import { formatCurrency } from '@/lib/formatters';
import type { Holding } from '@/core/db/types';

const METAL_CATEGORY_LABEL: Record<string, string> = {
  jewellery: 'Jewellery',
  coin: 'Coin',
  bar: 'Bar',
  digital: 'Digital',
  other: 'Other'
};

// View card for a gold/silver holding — weight, karat/purity, live spot value and gain/loss.
export function PreciousMetalCard({
  holding,
  spotGold,
  spotSilver,
  onEdit,
  mode
}: {
  holding: Holding;
  spotGold: number | null;
  spotSilver: number | null;
  onEdit: () => void;
  mode: string;
}) {
  const meta = holding.assetMeta ?? {};
  const isGold = meta.metalType !== 'silver';
  const weightGrams = meta.metalWeightGrams ?? holding.units ?? 0;
  const purchasePricePerGram = meta.metalPurchasePricePerGram ?? holding.avgCostPrice ?? 0;
  const karat = meta.metalKarat ?? 22;
  const purity = meta.metalPurity ?? '999';
  const category = meta.metalCategory ?? 'other';

  const spotPrice = isGold ? spotGold : spotSilver;
  const effectiveSpotPerGram =
    isGold && spotPrice ? goldPriceForKarat(spotPrice, karat as 14 | 18 | 22 | 24) : spotPrice;
  const currentValue = effectiveSpotPerGram
    ? weightGrams * effectiveSpotPerGram
    : (holding.currentValue ?? holding.investedAmount);
  const costBasis = weightGrams * purchasePricePerGram;
  const gainLoss = currentValue - costBasis;
  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

  const iconColor = isGold ? '#d97706' : '#94a3b8';
  const iconBg = isGold ? '#d9780615' : '#94a3b815';
  const icon = isGold ? 'ti-circle-letter-g' : 'ti-circle-letter-s';

  const priceLabel = isGold
    ? `₹${Math.round(spotPrice ?? 0).toLocaleString('en-IN')}/g (24K)`
    : `₹${Math.round(spotPrice ?? 0).toLocaleString('en-IN')}/g`;

  return (
    <Card onClick={onEdit} padding="sm" className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <IconBadge icon={icon} color={iconColor} bg={iconBg} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary truncate">{holding.name}</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: iconBg, color: iconColor }}
              >
                {METAL_CATEGORY_LABEL[category]}
              </span>
              <span className="text-[10px] text-secondary">
                {weightGrams}g · {isGold ? `${karat}K` : purity}
              </span>
            </div>
          </div>
        </div>
        <i
          className="ti ti-chevron-right text-tertiary flex-shrink-0 mt-1"
          style={{ fontSize: 15 }}
          aria-hidden="true"
        />
      </div>

      {/* Value row */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] text-secondary">Current value</p>
          <p className="text-lg font-bold text-primary">{mode === 'open' ? formatCurrency(currentValue) : '••••'}</p>
          {mode === 'open' && <p className="text-[10px] text-secondary mt-0.5">Cost: {formatCurrency(costBasis)}</p>}
        </div>
        {mode === 'open' && (
          <div className="text-right">
            <p
              className="text-sm font-semibold"
              style={{ color: gainLoss >= 0 ? 'var(--color-primary)' : 'var(--color-danger, #ef4444)' }}
            >
              {gainLoss >= 0 ? '+' : ''}
              {formatCurrency(gainLoss)}
            </p>
            <p
              className="text-[10px]"
              style={{ color: gainLoss >= 0 ? 'var(--color-primary)' : 'var(--color-danger, #ef4444)' }}
            >
              {gainLoss >= 0 ? '▲' : '▼'} {Math.abs(gainLossPct).toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* Spot price stamp */}
      {spotPrice ? (
        <p className="text-[9px] text-tertiary">{priceLabel} · Live (end-of-day)</p>
      ) : (
        <p className="text-[9px] text-tertiary">Live price unavailable · showing cost basis</p>
      )}
    </Card>
  );
}
