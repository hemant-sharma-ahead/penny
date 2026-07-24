import { View, Text } from 'react-native';
import { TextInput, DetailRow } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

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
  const theme = useThemeColors();

  return (
    <>
      <View>
        <TextInput
          label="NSE symbol"
          placeholder="e.g. RELIANCE, INFY, TCS, HDFCBANK"
          value={symbol}
          onChange={(v) => {
            setSymbol(v.toUpperCase());
            setStockFetchAttempted(false);
            setFetchedPrice(null);
            setFetchedName('');
          }}
          autoComplete="off"
        />
        {priceFetching && (
          <View className="flex-row items-center gap-1.5 mt-1">
            <Icon name="ti-loader-2" size={12} color={theme.textTertiary} />
            <Text className="text-[11px] text-tertiary">Fetching…</Text>
          </View>
        )}
        {!priceFetching && fetchedPrice !== null && (
          <View className="flex-row items-center gap-1 mt-1">
            <Icon name="ti-check" size={10} color={theme.success} />
            <Text className="text-[11px]" style={{ color: theme.success }}>
              Current price:{' '}
              <Text className="font-semibold">
                ₹{fetchedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </Text>
          </View>
        )}
        {!priceFetching && fetchedName && <Text className="mt-0.5 text-[11px] text-secondary">{fetchedName}</Text>}
        {!priceFetching && stockFetchAttempted && fetchedPrice === null && symbol.trim().length >= 1 && (
          <Text className="mt-1 text-[11px] text-tertiary">
            Symbol not found on NSE — try with .BO suffix for BSE (e.g. RELIANCE.BO)
          </Text>
        )}
      </View>
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-1 min-w-[45%]">
          <TextInput label="Shares held" keyboardType="decimal-pad" placeholder="0" value={units} onChange={setUnits} />
        </View>
        <View className="flex-1 min-w-[45%]">
          <TextInput
            label="Avg buy price (₹)"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={avgCostPrice}
            onChange={setAvgCostPrice}
          />
        </View>
      </View>

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
