import { View, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { formatDate } from '@/lib/date';
import type { UseBankImportReturn } from './useBankImport';

interface ExpenseCoverageNudgeProps {
  bi: UseBankImportReturn;
  /** Same display label `SetupStep.tsx` already computes for its own dropzone caption (`bankLabel`) —
   *  passed down rather than re-derived here, since `bi.presetId`/`bi.banks` alone don't say "your
   *  custom format" for the Custom preset case. */
  bankLabel: string;
}

/**
 * Expense-first nudge (docs/mockups/proposals/bank-import-expense-first-nudge-v1.html) — sibling to
 * `OpeningBalancePrompt.tsx`, same convention: rendered by `SetupStep.tsx` IN PLACE OF the plain
 * "Continue to review" button whenever `bi.expenseCoverageWarning` is set, never alongside it. Every
 * branch here still lets the user proceed (`confirmMapping`), same as the plain button did — this is
 * advisory only, never a gate.
 */
export function ExpenseCoverageNudge({ bi, bankLabel }: ExpenseCoverageNudgeProps) {
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const warning = bi.expenseCoverageWarning;
  if (!warning) return null;

  // Both labels are derived from `formatDate` alone — its already-existing "31 Jul 2026" output already
  // carries everything a compact "Jul 2026" / "1–31 Jul 2026" label needs, so this just splits the
  // already-formatted string rather than introducing a new date-formatting call. Falls back to the full
  // "1 Jul 2026 – 5 Aug 2026" form on the rare statement whose own range actually spans more than one
  // calendar month (the mockup's compact form assumes a single month throughout).
  const startFull = formatDate(warning.rangeStart);
  const endFull = formatDate(warning.rangeEnd);
  const startDay = startFull.split(' ')[0];
  const startMonthYear = startFull.split(' ').slice(1).join(' ');
  const endMonthYear = endFull.split(' ').slice(1).join(' ');
  const periodShort = endMonthYear;
  const periodFull = startMonthYear === endMonthYear ? `${startDay}–${endFull}` : `${startFull} – ${endFull}`;

  function goLogExpensesFirst() {
    // Cross-tab nested navigation (Bank Import lives in `HomeStack`, Expense Import in `ExpensesStack`
    // — sibling tabs, so a bare `navigate('Import')` wouldn't resolve; see `HomeStack.tsx`'s own doc
    // comment for this convention). Only primitive params cross the boundary — no import of anything
    // from `features/import/` itself, keeping the feature-module boundary clean.
    navigation.navigate('Expenses', {
      screen: 'Import',
      params: { fromBankImport: { bankName: bankLabel, fileName: bi.fileName } }
    });
  }

  return (
    <View
      className="rounded-2xl p-3.5"
      style={{ backgroundColor: tint(theme.warning, 10), borderWidth: 1, borderColor: theme.warning }}
    >
      <View className="flex-row gap-2">
        <Icon name="ti-bulb" size={16} color={theme.warning} />
        <View className="flex-1">
          <Text className="text-xs font-extrabold text-primary">
            {`You haven't logged expenses for ${periodShort} yet`}
          </Text>
          <Text className="text-[11px] text-secondary leading-relaxed mt-1">
            {`For the best reconciliation experience, consider importing your expenses for ${periodFull} first, then re-importing this statement — Penny can then match each line against what you've already recorded instead of creating everything fresh.`}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-2 mt-3">
        <View className="flex-1 bg-surface-2 rounded-xl py-2 items-center">
          <Text className="text-sm font-extrabold text-primary">{warning.statementCount}</Text>
          <Text className="text-[9px] text-tertiary uppercase mt-0.5">Statement lines</Text>
        </View>
        <View className="flex-1 bg-surface-2 rounded-xl py-2 items-center">
          <Text className="text-sm font-extrabold" style={{ color: theme.warning }}>
            {warning.existingCount}
          </Text>
          <Text className="text-[9px] text-tertiary uppercase mt-0.5">Already logged</Text>
        </View>
      </View>

      <View className="gap-2 mt-3">
        {/* Solid warning-colored CTA — white text on a colored background, same convention `Badge`'s
            own `solid` variant already uses for a warning-colored fill elsewhere in this app, rather
            than introducing a new one-off hardcoded ink color just for this button. */}
        <Button variant="primary" color={theme.warning} icon="ti-receipt-2" fullWidth onPress={goLogExpensesFirst}>
          Go log expenses first
        </Button>
        <Button variant="ghost" fullWidth onPress={bi.confirmMapping}>
          Continue anyway
        </Button>
      </View>
    </View>
  );
}
