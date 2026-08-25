import { View, ScrollView, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '~/components/ui';
import { AccountFormModal } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { ACCOUNT_TYPE_META } from '@/core/accounts/meta';
import type { Account } from '@/core/db/types';
import type { AccountInput } from '~/hooks/useAccountForm';
import { useOnboardingDraft } from '~/context/OnboardingDraftContext';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import { OnboardingBack } from './OnboardingBack';

// `useAccountForm` deliberately NOT imported via a static `import { useAccountForm } from
// '~/hooks/useAccountForm'` here — that exact static import reproduced a 100%-of-the-time
// fresh-install release crash (`TypeError: Cannot read property 'create' of undefined`, RN's
// `[runtime not ready]`, native SIGABRT), root-caused via on-device bisection (isolated down to
// this one import — every other import in this file, converted one at a time, was cleared) to a
// Babel/Metro ESM-interop timing issue specific to Hermes-bytecode release builds and this being
// one of the first consumers of this named export reached during cold boot (Onboarding's stack is
// eagerly required by the root navigator, unlike `AccountsPage.tsx`'s later, warm-boot import of
// the exact same hook, which never exhibited this). Never reproduced in a debug/Metro-served build,
// nor on a warm relaunch of an already-onboarded install — only a genuinely fresh install did.
// A plain CommonJS `require()` + destructure, evaluated at this same module scope, does not hit
// whatever code path the static import's compiled interop wrapper does — confirmed fixed via the
// identical on-device bisection. See `docs/ARCHITECTURE.md`'s 2026-08-25 decision-log entry for the
// full investigation trail before ever "cleaning this up" back to a normal import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAccountForm } = require('~/hooks/useAccountForm') as typeof import('~/hooks/useAccountForm');

/** Quick-add for the account types that already exist, so expense tracking works immediately after
 *  setup instead of requiring a trip to the Accounts page first. Fully optional — skippable.
 *
 *  Reuses the exact same `AccountFormModal`/`useAccountForm` every other "+ Add account" entry point in
 *  the app already uses (`AccountsPage.tsx`, `ExpenseForm.tsx`, …) instead of a bespoke inline form. The
 *  one wrinkle: `accountsRepo` can't be written to yet at this point in onboarding — no Data Master Key
 *  exists until `SetupCredentialsScreen`'s final step — so `fakeSaveAccount` below fabricates an
 *  `Account`-shaped record in memory and stages it on `OnboardingDraftContext` instead of persisting it,
 *  the same trick `CashWithdrawalSuggestionCard.tsx` uses for a caller that can't hit the real repo. */
export function AddAccountsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();
  const { accountsToCreate = [], setDraft } = useOnboardingDraft();

  // `useAccountForm`'s duplicate-name check just needs an `Account[]` to search by name — fabricate one
  // from the drafted accounts (the `id` is only ever compared against `editing?.id`, which is always
  // `null` here since onboarding never edits a drafted entry, so a plain index stand-in is fine).
  const draftedAsAccounts: Account[] = accountsToCreate.map((acc, i) => ({
    ...acc,
    id: String(i),
    isArchived: false,
    createdAt: 0,
    updatedAt: 0
  }));

  async function fakeSaveAccount(data: AccountInput): Promise<Account> {
    const now = Date.now();
    const record: Account = { id: crypto.randomUUID(), ...data, isArchived: false, createdAt: now, updatedAt: now };
    setDraft({ accountsToCreate: [...accountsToCreate, data] });
    return record;
  }

  const accountForm = useAccountForm(fakeSaveAccount, draftedAsAccounts);

  function handleContinue() {
    navigation.navigate('BackupSetup');
  }

  function removeAccount(index: number) {
    setDraft({ accountsToCreate: accountsToCreate.filter((_, i) => i !== index) });
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="LifeHousehold" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-6 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name="ti-building-bank" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">Add your accounts</Text>
            <Text className="text-secondary text-sm text-center">
              Optional — add the ones you'll track expenses from. You can always add more later.
            </Text>
          </View>

          {accountsToCreate.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {accountsToCreate.map((acc, i) => (
                <View
                  key={`${acc.name}-${i}`}
                  className="flex-row items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1.5 bg-surface-2"
                >
                  <Icon name={ACCOUNT_TYPE_META[acc.type].icon} size={12} color={ACCOUNT_TYPE_META[acc.type].color} />
                  <Text className="text-xs font-semibold text-secondary">{acc.name}</Text>
                  <Pressable accessibilityLabel={`Remove ${acc.name}`} onPress={() => removeAccount(i)}>
                    <Icon name="ti-x" size={12} color={theme.textTertiary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Button variant="secondary" fullWidth icon="ti-plus" onPress={accountForm.openAdd} className="mb-6">
            Add account
          </Button>

          <View className="flex-row items-start gap-1 mb-6">
            <Icon name="ti-device-mobile" size={11} color={theme.textTertiary} />
            <Text className="text-[10px] text-tertiary flex-1 leading-relaxed">
              Account names and balances are encrypted on-device — never sent anywhere, even in a backup, unless you
              enable one.
            </Text>
          </View>

          <View className="mt-auto gap-2.5">
            <Button variant="primary" size="lg" fullWidth onPress={handleContinue}>
              Continue
            </Button>
          </View>
        </View>
      </ScrollView>

      {accountForm.showForm && <AccountFormModal form={accountForm} saving={false} />}
    </SafeAreaView>
  );
}
