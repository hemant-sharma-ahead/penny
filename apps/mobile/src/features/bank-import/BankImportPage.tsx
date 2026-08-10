import { useCallback } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivacy } from '~/context/PrivacyContext';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
import type { HomeStackParamList } from '~/navigation/HomeStack';
import { useBankImport } from './useBankImport';
import { SetupStep } from './SetupStep';
import { ReviewStep } from './ReviewStep';
import { DoneStep } from './DoneStep';

/**
 * Bank Statement Import's top-level page (docs/plans/bank-statement-import.md) — a thin step-switch
 * over `useBankImport`, mirroring `features/import/ImportPage.tsx`'s shape but a wholly independent
 * module (no shared code with that importer, per §4). Registered in `HomeStack.tsx` as
 * `{ accountId: string }`, entered from `AccountsPage`'s per-row Import action
 * (`AccountList.tsx`) — statement import is inherently scoped to one account.
 */
export function BankImportPage() {
  const modeBg = useModeBackgroundColor();
  const { shouldMask } = usePrivacy();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'BankImport'>>();
  const accountId = route.params.accountId;
  const bi = useBankImport(accountId);
  // Destructured out so `stepBack` below can depend on the stable setter directly (from `useState`)
  // instead of the whole `bi` object — `useBankImport()` returns a fresh object literal every render,
  // so depending on `bi` itself defeated memoization entirely: `stepBack` was a new function every
  // render once `target` went non-null (i.e. once past 'setup'), which kept re-firing
  // `useRegisterHeaderScreen`'s internal `useFocusEffect` (its own `backHandler` dependency never
  // stabilized either), calling `setScreen` every render and looping forever — the "Maximum update
  // depth exceeded" crash, reproducible once the review screen loads.
  const { setStep } = bi;

  const backTarget: Record<typeof bi.step, typeof bi.step | null> = {
    setup: null,
    review: 'setup',
    done: bi.committed ? null : 'review'
  };
  const target = backTarget[bi.step];
  const stepBack = useCallback(() => {
    if (target) setStep(target);
  }, [target, setStep]);
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  useRegisterHeaderScreen('BankImport', target ? stepBack : goBack);

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary">Import statement</Text>
        <Text className="text-xs text-tertiary mt-0.5">{bi.account?.name ?? 'Account'}</Text>
      </View>

      {bi.step === 'review' ? (
        <ReviewStep bi={bi} shouldMask={shouldMask} onImport={() => bi.setStep('done')} />
      ) : bi.step === 'done' ? (
        <DoneStep bi={bi} onDone={() => navigation.goBack()} />
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 px-4 py-4">
            <SetupStep bi={bi} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
