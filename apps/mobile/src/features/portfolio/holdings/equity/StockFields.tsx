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
  fetchedName: string;
  priceFetching: boolean;
  stockFetchAttempted: boolean;
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
  fetchedName,
  priceFetching,
  stockFetchAttempted
}: StockFieldsProps) {
  const theme = useThemeColors();

  return (
    <>
      <View>
        <TextInput
          label="NSE symbol"
          placeholder="e.g. RELIANCE, INFY, TCS, HDFCBANK"
          value={symbol}
          // Store exactly what the native keyboard hands back — do NOT re-inject a
          // JS-transformed (.toUpperCase()) string into this controlled value. Feeding a
          // transformed string back into a controlled TextInput's `value` desyncs the
          // native text buffer from React state, which on Android caused typed characters
          // to get duplicated/re-inserted (found + fixed 2026-08-24). `autoCapitalize`
          // below already makes the keyboard type uppercase directly, so this is rarely
          // even visibly wrong — but don't rely on the keyboard alone for correctness:
          // the actual price lookup (useLivePrice.ts -> fetchStockQuote) and the final
          // saved value (holdingMappers.ts's applyStockFields) both uppercase the symbol
          // themselves at their point of use, independent of what's typed here.
          onChange={setSymbol}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {priceFetching && (
          <View className="flex-row items-center gap-1.5 mt-1">
            <Icon name="ti-loader-2" size={12} color={theme.textTertiary} spin />
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
