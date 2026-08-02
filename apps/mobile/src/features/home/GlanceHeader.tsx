import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivacy } from '~/context/PrivacyContext';
import { useForecast } from '~/hooks/useForecast';
import { formatCompact, formatCurrency } from '@/lib/formatters';
import { IconBadge, Modal, ProgressBar } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import type { HomeSummary, AssetGroup } from './useHome';

/**
 * Maps a net-worth breakdown row's asset class to where it lands in Portfolio — 2026-08-01 Equity
 * consolidation grew this from a single flat `holdingsSubTab` string to a `{ mainTab, equitySubTab }`
 * pair, since Stocks/MF now live one level deeper (under the new Equity main tab) while the other 4
 * asset classes each got promoted straight to their own main tab.
 */
function assetPortfolioTarget(ac: string): { mainTab: string; equitySubTab?: string } {
  if (ac === 'nps' || ac === 'ppf' || ac === 'epf') return { mainTab: 'retirement' };
  if (ac === 'gold') return { mainTab: 'precious_metals' };
  if (ac === 'vehicle' || ac === 'property' || ac === 'other') return { mainTab: 'real_assets' };
  if (ac === 'fd') return { mainTab: 'fixed_income' };
  if (ac === 'stock') return { mainTab: 'equity', equitySubTab: 'stocks' };
  if (ac === 'mf') return { mainTab: 'equity', equitySubTab: 'mf' };
  return { mainTab: 'equity' };
}

const LIABILITY_META: Record<string, { label: string; icon: string }> = {
  home_loan: { label: 'Home Loan', icon: 'ti-home' },
  car_loan: { label: 'Car Loan', icon: 'ti-car' },
  personal_loan: { label: 'Personal Loan', icon: 'ti-user' },
  education_loan: { label: 'Education Loan', icon: 'ti-school' },
  credit_card: { label: 'Credit Card', icon: 'ti-credit-card' },
  bnpl: { label: 'BNPL', icon: 'ti-device-mobile' },
  gold_loan: { label: 'Gold Loan', icon: 'ti-coin' },
  lap: { label: 'Loan Against Property', icon: 'ti-building' },
  las: { label: 'Loan Against Securities', icon: 'ti-chart-bar' },
  overdraft: { label: 'Overdraft', icon: 'ti-credit-card' },
  informal: { label: 'Informal Loan', icon: 'ti-users' },
  rental_deposit: { label: 'Rental Deposit', icon: 'ti-building' }
};

interface Props {
  summary: HomeSummary;
  assetGroups: AssetGroup[];
  totalAssets: number;
  totalLiabilities: number;
}

/** Light, minimal Home header: the two numbers that matter most (net worth + safe-to-spend),
 *  a slim asset bar, and a tap-through to the full breakdown. Breakdown rows navigate to the matching
 *  module's real route (Accounts/Expenses/Portfolio/Loans), same mapping as web's `GlanceHeader` —
 *  web's `assetSubTab`/`{ state: { tab: 'iou' } }` deep-link hints are now restored too (found missing
 *  via the 2026-07-25 parity sweep): `PortfolioPage`/`ExpensesPage` both read an initial sub-tab param
 *  off `useRoute()` now. "Safe to spend" navigates to the real `CashFlow` screen (restored once that
 *  module was ported — see `~/features/cashflow/CashFlowPage.tsx`). */
export function GlanceHeader({ summary, assetGroups, totalAssets, totalLiabilities }: Props) {
  const { shouldMask } = usePrivacy();
  const theme = useThemeColors();
  const { loading: forecastLoading, forecast, safeToSpend } = useForecast();
  const [detailOpen, setDetailOpen] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  // Net worth is an aggregate, not a specific sensitive item — Safe Mode keeps it visible;
  // only Privacy Mode hides it (same as everywhere else "sensitive" defaults to false).
  const open = !shouldMask(false);

  const goToAsset = (ac: string) => {
    if (ac === 'liquid') navigation.navigate('Accounts');
    else if (ac === 'iou') navigation.navigate('Expenses', { screen: 'ExpensesMain', params: { initialTab: 'iou' } });
    else navigation.navigate('Portfolio', assetPortfolioTarget(ac));
  };

  const safe = safeToSpend;
  const breached = forecast.bufferBreachMs !== null;
  const safeSub = forecastLoading
    ? ''
    : breached
      ? 'dips below your cushion soon'
      : forecast.daysToPayday !== null
        ? `${forecast.daysToPayday} day${forecast.daysToPayday === 1 ? '' : 's'} till payday`
        : `${forecast.daysLeft} days to month-end`;

  return (
    <>
      {/* Money hero — net worth + safe-to-spend, with the assets/liabilities bar inside the same card */}
      <View className="rounded-[18px] overflow-hidden bg-surface border border-theme mb-4">
        <View className="flex-row">
          <Pressable onPress={() => setDetailOpen(true)} className="flex-1 px-4 py-3.5 active:bg-surface-2">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Net worth</Text>
            <Text className="text-[24px] font-bold tracking-tight text-primary leading-tight mt-0.5">
              {open ? formatCurrency(summary.netWorth) : '••••'}
            </Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Text className="text-[11px] text-tertiary">View breakdown</Text>
              <Icon name="ti-chevron-right" size={12} color={theme.textTertiary} />
            </View>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('CashFlow')}
            className="flex-1 px-4 py-3.5 border-l border-theme active:bg-surface-2"
          >
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Safe to spend</Text>
            <Text
              className="text-[24px] font-bold tracking-tight leading-tight mt-0.5"
              style={{ color: breached ? theme.danger : theme.primary }}
            >
              {open ? formatCurrency(safe) : '••••'}
            </Text>
            <Text className="text-[11px] text-tertiary mt-0.5" numberOfLines={1}>
              {safeSub}
            </Text>
          </Pressable>
        </View>

        {/* Slim asset bar + assets/liabilities line — inside the card */}
        {open && totalAssets > 0 && (
          <Pressable onPress={() => setDetailOpen(true)} className="w-full px-4 pb-3.5">
            <View className="flex-row rounded-full overflow-hidden mb-1.5" style={{ height: 6, gap: 2 }}>
              {assetGroups.map(({ ac, value, meta }) => (
                <View key={ac} style={{ flex: value / totalAssets, backgroundColor: meta.color }} />
              ))}
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] text-tertiary">
                Assets <Text className="text-secondary font-medium">{formatCompact(totalAssets)}</Text>
              </Text>
              {totalLiabilities > 0 && (
                <Text className="text-[11px] text-tertiary">
                  Liabilities{' '}
                  <Text className="font-medium" style={{ color: theme.danger }}>
                    −{formatCompact(totalLiabilities)}
                  </Text>
                </Text>
              )}
            </View>
          </Pressable>
        )}
      </View>

      {detailOpen && (
        <Modal onClose={() => setDetailOpen(false)} title="Net worth" scrollable>
          <View className="gap-4">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-sm text-secondary">Total</Text>
              <Text className="text-xl font-bold text-primary">{open ? formatCurrency(summary.netWorth) : '••••'}</Text>
            </View>

            {/* Assets */}
            <View>
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2">Assets</Text>
              <View>
                {assetGroups.map(({ ac, value, meta }) => (
                  <Pressable key={ac} onPress={() => goToAsset(ac)} className="w-full flex-row items-center gap-3 py-2">
                    <IconBadge icon={meta.icon} color={meta.color} bg={tint(meta.color, 13)} size="sm" />
                    <View className="flex-1">
                      <View className="flex-row items-baseline gap-1.5 mb-1">
                        <Text className="text-[13px] font-medium text-primary">{meta.label}</Text>
                        {open && totalAssets > 0 && (
                          <Text className="text-[10px] text-tertiary">{((value / totalAssets) * 100).toFixed(0)}%</Text>
                        )}
                      </View>
                      <ProgressBar
                        value={open && totalAssets > 0 ? (value / totalAssets) * 100 : 0}
                        color={meta.color}
                        size="xs"
                      />
                    </View>
                    <Text className="text-[13px] font-medium text-secondary">
                      {open ? formatCurrency(value) : '••••'}
                    </Text>
                    <Icon name="ti-chevron-right" size={13} color={theme.textTertiary} />
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Liabilities */}
            {(summary.liabilities.length > 0 ||
              summary.creditCardAccounts.some((c) => c.outstanding > 0) ||
              summary.netIou < 0) && (
              <View>
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2">
                  Liabilities
                </Text>
                <View>
                  {summary.netIou < 0 && (
                    <Pressable
                      onPress={() =>
                        navigation.navigate('Expenses', { screen: 'ExpensesMain', params: { initialTab: 'iou' } })
                      }
                      className="w-full flex-row items-center gap-3 py-2"
                    >
                      <IconBadge icon="ti-users" color={theme.danger} bg={tint(theme.danger, 12)} size="sm" />
                      <View className="flex-1">
                        <Text className="text-[13px] font-medium text-primary" numberOfLines={1}>
                          Owed to others
                        </Text>
                        <Text className="text-[10px] text-tertiary">IOU — you owe</Text>
                      </View>
                      <Text className="text-[13px] font-medium" style={{ color: theme.danger }}>
                        {open ? formatCurrency(-summary.netIou) : '••••'}
                      </Text>
                    </Pressable>
                  )}
                  {summary.creditCardAccounts
                    .filter((c) => c.outstanding > 0)
                    .map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => navigation.navigate('Accounts')}
                        className="w-full flex-row items-center gap-3 py-2"
                      >
                        <IconBadge icon={c.icon} color={theme.danger} bg={tint(theme.danger, 12)} size="sm" />
                        <View className="flex-1">
                          <Text className="text-[13px] font-medium text-primary" numberOfLines={1}>
                            {c.name}
                          </Text>
                          <Text className="text-[10px] text-tertiary">Credit card outstanding</Text>
                        </View>
                        <Text className="text-[13px] font-medium" style={{ color: theme.danger }}>
                          {open ? formatCurrency(c.outstanding) : '••••'}
                        </Text>
                      </Pressable>
                    ))}
                  {summary.liabilities.map((l) => {
                    const lMeta = LIABILITY_META[l.type] ?? { label: l.type, icon: 'ti-credit-card' };
                    return (
                      <Pressable
                        key={l.id}
                        onPress={() => navigation.navigate('Loans')}
                        className="w-full flex-row items-center gap-3 py-2"
                      >
                        <IconBadge icon={lMeta.icon} color={theme.danger} bg={tint(theme.danger, 12)} size="sm" />
                        <View className="flex-1">
                          <Text className="text-[13px] font-medium text-primary" numberOfLines={1}>
                            {l.name}
                          </Text>
                          {l.interestRate > 0 && (
                            <Text className="text-[10px] text-tertiary">{l.interestRate}% p.a.</Text>
                          )}
                        </View>
                        <Text className="text-[13px] font-medium" style={{ color: theme.danger }}>
                          {open ? formatCurrency(l.outstandingAmount) : '••••'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </Modal>
      )}
    </>
  );
}
