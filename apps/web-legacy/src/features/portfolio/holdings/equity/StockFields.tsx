import { TextInput, DetailRow } from '@/components/ui';

interface StockFieldsProps {
  symbol: string;
  setSymbol: (v: string) => void;
  units: string;
  setUnits: (v: string) => void;
  avgCostPrice: string;
  setAvgCostPrice: (v: string) => void;
  fetchedPrice: number | null;
  setFetchedPrice: (v: number | null) => void;
  fetchedName: string;
  setFetchedName: (v: string) => void;
  priceFetching: boolean;
  stockFetchAttempted: boolean;
  setStockFetchAttempted: (v: boolean) => void;
}

// Stock fields: NSE symbol with live price/name lookup, shares + avg buy price,
// and a computed value row.
export function StockFields({
  symbol,
  setSymbol,
  units,
  setUnits,
  avgCostPrice,
  setAvgCostPrice,
  fetchedPrice,
  setFetchedPrice,
  fetchedName,
  setFetchedName,
  priceFetching,
  stockFetchAttempted,
  setStockFetchAttempted
}: StockFieldsProps) {
  return (
    <>
      <div>
        <label className="text-xs font-medium text-secondary">NSE symbol</label>
        <div className="mt-1 relative">
          <input
            type="text"
            className="w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] input-surface uppercase pr-8"
            placeholder="e.g. RELIANCE, INFY, TCS, HDFCBANK"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              setStockFetchAttempted(false);
              setFetchedPrice(null);
              setFetchedName('');
            }}
          />
          {priceFetching && (
            <i
              className="ti ti-loader-2 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-tertiary"
              style={{ fontSize: 16 }}
            />
          )}
        </div>
        {!priceFetching && fetchedPrice !== null && (
          <p className="mt-1 text-[11px]" style={{ color: '#10b981' }}>
            <i className="ti ti-check" style={{ fontSize: 10 }} /> Current price:{' '}
            <strong>
              ₹{fetchedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </p>
        )}
        {!priceFetching && fetchedName && <p className="mt-0.5 text-[11px] text-secondary">{fetchedName}</p>}
        {!priceFetching && stockFetchAttempted && fetchedPrice === null && symbol.trim().length >= 1 && (
          <p className="mt-1 text-[11px] text-tertiary">
            Symbol not found on NSE — try with .BO suffix for BSE (e.g. RELIANCE.BO)
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Shares held"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={units}
          onChange={setUnits}
        />
        <TextInput
          label="Avg buy price (₹)"
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={avgCostPrice}
          onChange={setAvgCostPrice}
        />
      </div>

      {/* Computed current value */}
      {fetchedPrice !== null && parseFloat(units) > 0 && (
        <DetailRow
          label="Current value (shares × price)"
          value={`₹${(parseFloat(units) * fetchedPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          size="md"
        />
      )}
    </>
  );
}
