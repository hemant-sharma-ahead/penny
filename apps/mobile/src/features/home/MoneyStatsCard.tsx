import { View, Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatCompact, formatCurrency } from '@/lib/formatters';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useHomeStats } from './useHomeStats';
import { HomeEmptyPromptCard } from './HomeEmptyPromptCard';

/**
 * The Home "money facts" card (Track: Home advisor) — three hairline-split columns: Spent this month
 * (living subtext) · Insurance cover · Loans outstanding, plus a Tax story line. Each column taps
 * through to its real route (Expenses/Insurance/Loans), matching web's `MoneyStatsCard`.
 *
 * **Empty state, per item** (2026-08-05, `docs/mockups/proposals/home-empty-states-v2.html`) — Spent,
 * Insurance, and Loans are each independently either a real stat column (grouped together into one
 * row-card) or a `HomeEmptyPromptCard` ("Track ___"), never gated on each other. A user who's started
 * tracking expenses but hasn't added insurance yet still sees "Track Insurance" as a real prompt, not a
 * silent `'—'` — the original "all empty or none" gate hid the Insurance/Loans prompts again the moment
 * *any* figure went non-zero (found 2026-08-05), which defeated the point of adding them (they're the
 * only entry point to Insurance/Loans/Accounts anywhere in the app). Tax story is gated on
 * `stats.spentThisMonth > 0` too — with no real expense activity yet there's no real tax story to tell,
 * so it stays hidden until "Spent" itself has something real to show (2026-08-05 follow-up).
 */
export function MoneyStatsCard() {
  const stats = useHomeStats();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  if (!stats) return null;

  const realCols: {
    key: string;
    icon: string;
    color: string;
    label: string;
    value: string;
    sub: string;
    to: string;
  }[] = [];
  if (stats.spentThisMonth > 0) {
    realCols.push({
      key: 'spent',
      icon: 'ti-receipt',
      color: theme.danger,
      label: 'Spent',
      value: formatCurrency(stats.spentThisMonth),
      sub: `Living ${formatCompact(stats.livingThisMonth)}`,
      to: 'Expenses'
    });
  }
  if (stats.insuranceCover > 0) {
    realCols.push({
      key: 'insurance',
      icon: 'ti-shield',
      color: theme.info,
      label: 'Insurance',
      value: formatCompact(stats.insuranceCover),
      sub: 'cover',
      to: 'Insurance'
    });
  }
  if (stats.loansOutstanding > 0) {
    realCols.push({
      key: 'loans',
      icon: 'ti-building-bank',
      color: '#06b6d4',
      label: 'Loans',
      value: formatCompact(stats.loansOutstanding),
      sub: 'outstanding',
      to: 'Loans'
    });
  }

  return (
    <>
      {realCols.length > 0 && (
        <View className="bg-surface border border-theme rounded-2xl mb-4 overflow-hidden">
          <View className="flex-row">
            {realCols.map((c, i) => (
              <Pressable
                key={c.key}
                onPress={() => navigation.navigate(c.to)}
                className={`flex-1 px-3 py-3 ${i > 0 ? 'border-l border-theme' : ''}`}
              >
                <View className="flex-row items-center gap-1.5">
                  <Icon name={c.icon} size={12} color={c.color} />
                  <Text className="text-[10px] font-semibold text-secondary">{c.label}</Text>
                </View>
                <Text className="text-[15px] font-extrabold text-primary tracking-tight mt-1">{c.value}</Text>
                <Text className="text-[9px] text-tertiary mt-0.5">{c.sub}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {stats.spentThisMonth === 0 && (
        <HomeEmptyPromptCard
          icon="ti-receipt"
          title="Track your expenses"
          subtitle="Add an account and import your bank statement, or bring expenses in from another app — both from the Expenses screen."
          actions={[
            { label: '+ Add account', onPress: () => navigation.navigate('Accounts'), variant: 'secondary' },
            { label: 'Go to Expenses', onPress: () => navigation.navigate('Expenses') }
          ]}
        />
      )}
      {/* Insurance/Loans share one row, half-width each (2026-08-10, on-device feedback: two full-width
       *  prompts stacked wasted the common "nothing set up yet" case's vertical space). `flex-1` on each
       *  card means the layout degrades correctly when only one is empty too — it just fills the row
       *  alone, no separate single-card branch needed. */}
      {(stats.insuranceCover === 0 || stats.loansOutstanding === 0) && (
        <View className="flex-row gap-3 mb-4">
          {stats.insuranceCover === 0 && (
            <HomeEmptyPromptCard
              compact
              icon="ti-shield"
              title="Track Insurance"
              subtitle="Add a policy to see your total life & health cover at a glance."
              actions={[
                { label: '+ Add policy', onPress: () => navigation.navigate('Insurance'), variant: 'secondary' }
              ]}
            />
          )}
          {stats.loansOutstanding === 0 && (
            <HomeEmptyPromptCard
              compact
              icon="ti-building-bank"
              title="Track Loans"
              subtitle="Add a loan to track EMIs and payoff progress over time."
              actions={[{ label: '+ Add loan', onPress: () => navigation.navigate('Loans'), variant: 'secondary' }]}
            />
          )}
        </View>
      )}

      {/* Tax — a line into the Tax Awareness screen (Tax has no Home tile of its own). Gated on real
          expense activity (2026-08-05 follow-up) — with no expenses/income/accounts entered, there's no
          real tax story to tell yet either; comes back once `stats.spentThisMonth` is real, the same
          signal that already decides whether "Spent" itself shows as a real column vs. its own prompt. */}
      {stats.spentThisMonth > 0 && (
        <Pressable
          onPress={() => navigation.navigate('Tax')}
          className="w-full flex-row items-center gap-2 px-3 py-2.5 bg-surface border border-theme rounded-2xl mb-4 active:bg-surface-2"
        >
          <Icon name="ti-receipt-tax" size={14} color="#8b5cf6" />
          <Text className="text-[12px] font-semibold text-primary">Tax story</Text>
          <Text className="text-[11px] text-tertiary flex-1" numberOfLines={1}>
            · where your money really goes this FY
          </Text>
          <Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />
        </Pressable>
      )}
    </>
  );
}
