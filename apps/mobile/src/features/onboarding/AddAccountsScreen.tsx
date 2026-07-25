import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '@/core/accounts/meta';
import type { AccountType } from '@/core/db/types';
import { useOnboardingDraft, type DraftAccount } from '~/context/OnboardingDraftContext';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import { OnboardingBack } from './OnboardingBack';

/** Quick-add for the account types that already exist, so expense tracking works immediately after
 *  setup instead of requiring a trip to the Accounts page first. Fully optional — skippable. */
export function AddAccountsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();
  const { accountsToCreate = [], setDraft } = useOnboardingDraft();
  const [type, setType] = useState<AccountType>('bank');
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  function addCurrent(list: DraftAccount[]): DraftAccount[] {
    const trimmed = name.trim();
    if (!trimmed) return list;
    return [...list, { name: trimmed, type, openingBalance: Number(openingBalance) || 0 }];
  }

  function handleAddAnother() {
    const next = addCurrent(accountsToCreate);
    if (next === accountsToCreate) return; // nothing to add
    setDraft({ accountsToCreate: next });
    setName('');
    setOpeningBalance('');
  }

  function handleContinue() {
    setDraft({ accountsToCreate: addCurrent(accountsToCreate) });
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

          <View className="flex-row flex-wrap gap-2 mb-4">
            {ACCOUNT_TYPES.map((t) => {
              const meta = ACCOUNT_TYPE_META[t];
              const selected = type === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  className="items-center gap-1.5 rounded-2xl border p-3"
                  style={{
                    width: '31%',
                    borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected ? tint(theme.primary, 6) : undefined
                  }}
                >
                  <View
                    className="w-9 h-9 rounded-xl items-center justify-center"
                    style={{ backgroundColor: meta.color }}
                  >
                    <Icon name={meta.icon} size={16} color="#fff" />
                  </View>
                  <Text className="text-xs font-semibold text-primary">{meta.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="gap-3 mb-4">
            <TextInput
              label={`${ACCOUNT_TYPE_META[type].label} account name`}
              value={name}
              onChange={setName}
              placeholder={`e.g. HDFC ${ACCOUNT_TYPE_META[type].label}`}
            />
            <TextInput
              label="Opening balance (optional)"
              keyboardType="numeric"
              value={openingBalance}
              onChange={setOpeningBalance}
              placeholder="0"
            />
          </View>

          <View className="flex-row items-start gap-1 mb-6">
            <Icon name="ti-device-mobile" size={11} color={theme.textTertiary} />
            <Text className="text-[10px] text-tertiary flex-1 leading-relaxed">
              Account names and balances are encrypted on-device — never sent anywhere, even in a backup, unless you
              enable one.
            </Text>
          </View>

          <View className="mt-auto gap-2.5">
            <Button variant="secondary" fullWidth onPress={handleAddAnother} disabled={!name.trim()}>
              Add another account
            </Button>
            <Button variant="primary" size="lg" fullWidth onPress={handleContinue}>
              Continue
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
