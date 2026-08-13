import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { usePrivacy } from '../context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';
import { ExpensesPage } from '../features/expenses/ExpensesPage';
import { ImportPage } from '../features/import/ImportPage';

/**
 * The Expenses tab's own navigation stack — same chrome-persistence fix as `HomeStack.tsx`. Only
 * `Import` is Expenses-only; `Accounts`/`CashFlow`/`ManageTags` (also reachable from here, via
 * `ExpenseForm.tsx`/`ExpensesHeader.tsx`) live in `HomeStack` and are reached with the cross-tab
 * nested form (`navigate('Home', { screen: 'Accounts' })`) rather than being registered twice.
 */
export type ExpensesStackParamList = {
  ExpensesMain: { initialTab?: string } | undefined;
  /** `fromBankImport` (docs/mockups/proposals/bank-import-expense-first-nudge-v1.html) — set only when
   *  this screen is reached via Bank Import's "Go log expenses first" nudge (`ExpenseCoverageNudge.tsx`,
   *  cross-tab navigation from `HomeStack`'s `BankImport` screen); `ImportPage` shows a one-time toast
   *  confirming Bank Import's own in-progress state is preserved, then never re-shows it for this screen
   *  instance. Primitive fields only (bank display name + file name) — no import of anything from
   *  `features/bank-import/` here, keeping the feature-module boundary clean. */
  Import: { fromBankImport?: { bankName: string; fileName: string } } | undefined;
};

const Stack = createNativeStackNavigator<ExpensesStackParamList>();

export function ExpensesStack() {
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  const modeColors = getPrivacyModeColors(mode, activePalette);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: modeColors.bg } }}>
      <Stack.Screen name="ExpensesMain" component={ExpensesPage} />
      <Stack.Screen name="Import" component={ImportPage} />
    </Stack.Navigator>
  );
}
