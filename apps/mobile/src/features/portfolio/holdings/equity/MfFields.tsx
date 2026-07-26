import { View, TextInput as RNTextInput, Pressable, Text } from 'react-native';
import { TextInput, DetailRow } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { MfSearchResult, MfSchemeDetail } from '@/core/portfolio/mfApiClient';

interface MfFieldsProps {
  editing: boolean;
  mfQuery: string;
  setMfQuery: (v: string) => void;
  schemeCode: string;
  setSchemeCode: (v: string) => void;
  mfResults: MfSearchResult[];
  mfSearching: boolean;
  mfDropdownOpen: boolean;
  setMfDropdownOpen: (v: boolean) => void;
  schemeDetail: MfSchemeDetail | null;
  setSchemeDetail: (v: MfSchemeDetail | null) => void;
  name: string;
  setName: (v: string) => void;
  units: string;
  setUnits: (v: string) => void;
  avgCostPrice: string;
  setAvgCostPrice: (v: string) => void;
  fetchedPrice: number | null;
  setFetchedPrice: (v: number | null) => void;
  priceFetching: boolean;
}

// Mutual-fund fields: fund search (MFAPI.in) or a plain scheme-code field when
// editing, live NAV indicator, units/avg-NAV inputs, and a computed value row.
export function MfFields({
  editing,
  mfQuery,
  setMfQuery,
  schemeCode,
  setSchemeCode,
  mfResults,
  mfSearching,
  mfDropdownOpen,
  setMfDropdownOpen,
  schemeDetail,
  setSchemeDetail,
  name,
  setName,
  units,
  setUnits,
  avgCostPrice,
  setAvgCostPrice,
  fetchedPrice,
  setFetchedPrice,
  priceFetching
}: MfFieldsProps) {
  const theme = useThemeColors();

  return (
    <>
      {/* Search — only when adding new; editing shows plain scheme code field */}
      {!editing ? (
        <View>
          <Text className="text-xs font-medium text-secondary">Search fund</Text>
          <View className="mt-1 relative flex-row items-center">
            <RNTextInput
              value={mfQuery}
              onChangeText={(v) => {
                setMfQuery(v);
                if (!v) {
                  setSchemeCode('');
                  setMfDropdownOpen(false);
                }
              }}
              placeholder="e.g. Parag Parikh, Axis Bluechip…"
              placeholderTextColor={theme.textTertiary}
              className="bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm pr-16"
              style={{ borderColor: theme.border }}
            />
            {mfSearching && (
              <View className="absolute right-3">
                <Icon name="ti-loader-2" size={16} color={theme.textTertiary} />
              </View>
            )}
            {schemeCode && !mfSearching && (
              <Pressable
                className="absolute right-2 px-1 py-0.5"
                onPress={() => {
                  setSchemeCode('');
                  setMfQuery('');
                  setMfDropdownOpen(false);
                  setName('');
                  setFetchedPrice(null);
                  setSchemeDetail(null);
                }}
              >
                <Text className="text-[10px] text-tertiary">Clear</Text>
              </Pressable>
            )}
          </View>
          {mfDropdownOpen && mfResults.length > 0 && !schemeCode && (
            <View className="mt-1 w-full rounded-xl border border-theme overflow-hidden bg-surface">
              {mfResults.map((r, idx) => (
                <Pressable
                  key={r.schemeCode}
                  className={`w-full px-3 py-2.5 flex-row items-center justify-between gap-2 ${idx < mfResults.length - 1 ? 'border-b border-theme' : ''}`}
                  onPress={() => {
                    setSchemeCode(String(r.schemeCode));
                    setMfQuery(r.schemeName);
                    if (!name) setName(r.schemeName);
                    setMfDropdownOpen(false);
                  }}
                >
                  <Text className="flex-1 text-xs text-primary leading-snug" numberOfLines={1}>
                    {r.schemeName}
                  </Text>
                  <Text
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: '#6366f115', color: '#6366f1' }}
                  >
                    {r.schemeCode}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {schemeCode && (
            <View className="mt-1 flex flex-col gap-0.5">
              <Text className="text-[10px] text-tertiary">Code: {schemeCode}</Text>
              {schemeDetail?.schemeCategory && (
                <Text className="text-[10px] text-secondary">
                  {schemeDetail.schemeCategory}
                  {schemeDetail.fundHouse ? ` · ${schemeDetail.fundHouse}` : ''}
                </Text>
              )}
            </View>
          )}
        </View>
      ) : (
        <TextInput
          label="MFAPI scheme code"
          hint="e.g. 120503 for PPFAS"
          keyboardType="numeric"
          placeholder="Leave blank to enter price manually"
          value={schemeCode}
          onChange={setSchemeCode}
        />
      )}

      {/* Live NAV */}
      {schemeCode && (
        <View className="flex-row items-center gap-1.5 px-0.5">
          {priceFetching ? (
            <>
              <Icon name="ti-loader-2" size={12} color={theme.textTertiary} />
              <Text className="text-[11px] text-tertiary">Fetching NAV…</Text>
            </>
          ) : fetchedPrice !== null ? (
            <>
              <Icon name="ti-check" size={12} color={theme.success} />
              <Text className="text-[11px] text-secondary">
                Current NAV: <Text className="font-semibold text-primary">₹{fetchedPrice.toFixed(4)}</Text>
              </Text>
            </>
          ) : null}
        </View>
      )}

      <View className="flex-row flex-wrap gap-3">
        <View className="flex-1 min-w-[45%]">
          <TextInput
            label="Units held"
            keyboardType="decimal-pad"
            placeholder="0.000"
            value={units}
            onChange={setUnits}
          />
        </View>
        <View className="flex-1 min-w-[45%]">
          <TextInput
            label="Avg NAV (₹)"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={avgCostPrice}
            onChange={setAvgCostPrice}
          />
        </View>
      </View>

      {/* Computed current value */}
      {fetchedPrice !== null && parseFloat(units) > 0 && (
        <DetailRow
          label="Current value (units × NAV)"
          value={`₹${(parseFloat(units) * fetchedPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          size="md"
        />
      )}
    </>
  );
}
