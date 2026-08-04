import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivacy } from '~/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import { IconBadge, Modal, ProgressBar } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { useRetirementProjection } from './useRetirementProjection';
import { RetirementCorpusChart } from './RetirementCorpusChart';
import { RetirementFundedSummary } from './RetirementFundedSummary';
import { RetirementDrilldownModal } from './RetirementDrilldownModal';
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
}

/**
 * Home's money hero. As of the Retirement Corpus redesign, Net worth and the new Retirement Corpus
 * card are fused into one borderless unit — no card background on either: Net worth's label/number/
 * "View breakdown" sit directly over `RetirementCorpusChart`'s naturally-empty top-left corner, and
 * everything below the chart (the "% funded" gauge, stat rows, CTA chip, tap hint) opens the
 * expense-projection drill-down on tap. Net worth's own tap target is a nested `Pressable` so it opens
 * its breakdown `Modal` instead of also triggering the drill-down (RN's responder system gives the
 * innermost `Pressable` the touch, same pattern `AccountList.tsx`'s row + trailing action buttons
 * already rely on — no explicit stopPropagation call needed).
 *
 * Safe-to-spend and the colored asset-proportion bar/assets-liabilities line were removed from Home
 * entirely (2026-08 declutter) — Safe-to-spend already lives on the Cash Flow screen, and the bar/line
 * didn't say anything the tap-through breakdown below doesn't already say better. That breakdown modal
 * (assetPortfolioTarget/LIABILITY_META + the assets/liabilities rows) is unchanged.
 */
export function GlanceHeader({ summary, assetGroups, totalAssets }: Props) {
  const { shouldMask } = usePrivacy();
  const theme = useThemeColors();
  const [detailOpen, setDetailOpen] = useState(false);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  // Net worth is an aggregate, not a specific sensitive item — Safe Mode keeps it visible;
  // only Privacy Mode hides it (same as everywhere else "sensitive" defaults to false).
  const open = !shouldMask(false);

  const { plan, projection, currentAge, monthlyExpenseToday, points, updatePlan } = useRetirementProjection(summary);
  const retirementYear = projection?.yearlyPath[projection.yearlyPath.length - 1]?.year ?? new Date().getFullYear();

  const goToAsset = (ac: string) => {
    if (ac === 'liquid') navigation.navigate('Accounts');
    else if (ac === 'iou') navigation.navigate('Expenses', { screen: 'ExpensesMain', params: { initialTab: 'iou' } });
    else navigation.navigate('Portfolio', assetPortfolioTarget(ac));
  };

  return (
    <>
      {/* Fused hero — Net worth + Retirement Corpus, one borderless unit (no card bg/border). Only the
          "Tap for expense projection" row (inside RetirementFundedSummary) opens the drill-down — the
          chart itself has its own scrub gesture (RetirementCorpusChart), and shouldn't also double as a
          tap target for a different action. */}
      <View className="mb-4">
        <View style={{ position: 'relative' }}>
          {projection && points.length > 0 ? (
            <RetirementCorpusChart points={points} retirementYear={retirementYear} open={open} />
          ) : (
            <View style={{ height: 244 }} />
          )}

          {/* Net worth text overlay — nested Pressable, own tap target (see doc comment above). */}
          <Pressable
            onPress={() => setDetailOpen(true)}
            className="absolute left-0 top-4"
            accessibilityLabel="View net worth breakdown"
          >
            <Text className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.textTertiary }}>
              Net worth
            </Text>
            <Text
              className="text-[25px] font-extrabold tracking-tight leading-tight mt-0.5"
              style={{ color: theme.textPrimary }}
            >
              {open ? formatCurrency(summary.netWorth) : '••••'}
            </Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Text className="text-[10px]" style={{ color: theme.textTertiary }}>
                View breakdown
              </Text>
              <Icon name="ti-chevron-right" size={11} color={theme.textTertiary} />
            </View>
          </Pressable>
        </View>

        {projection && (
          <RetirementFundedSummary
            projection={projection}
            monthlyInvestment={plan?.monthlyInvestment ?? 0}
            retirementYear={retirementYear}
            open={open}
            onOpenDrilldown={() => setDrilldownOpen(true)}
          />
        )}
      </View>

      {drilldownOpen && projection && plan && (
        <RetirementDrilldownModal
          plan={plan}
          monthlyExpenseToday={monthlyExpenseToday}
          projection={projection}
          currentAge={currentAge}
          open={open}
          onUpdate={updatePlan}
          onClose={() => setDrilldownOpen(false)}
        />
      )}

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
