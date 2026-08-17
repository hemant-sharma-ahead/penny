import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { formatCurrency } from '@/lib/formatters';
import { TabStrip, PageHeader } from '~/components/ui';
import { useGoals } from './useGoals';
import { GoalsTab } from './GoalsTab';
import { SipCalculatorTab } from './SipCalculatorTab';
import { FireCalculator } from '~/features/calculators/FireCalculator';
import { SipSwpCalculator } from '~/features/calculators/SipSwpCalculator';
import { LumpsumCalculator } from '~/features/calculators/LumpsumCalculator';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';

type GoalsTabKey = 'goals' | 'goal-sip' | 'fire' | 'sip-swp' | 'lumpsum';

/** Wraps a standalone calculator (which renders bare, no scroll container of its own — see
 *  `FireCalculator.tsx` etc.) the same way `SipCalculatorTab`/the old Calculators hub's detail view
 *  both already did. */
function CalculatorTab({ children }: { children: ReactNode }) {
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
      <View className="px-4 py-4">{children}</View>
    </ScrollView>
  );
}

export function GoalsPage() {
  const modeBg = useModeBackgroundColor();
  useRegisterHeaderScreen('Goals');
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.goals);
  const {
    goals,
    saveGoal,
    removeGoal,
    totalSaved,
    totalTarget,
    contributionsByGoal,
    effectiveSaved,
    accounts,
    saveAccount,
    expenses,
    categories,
    hashtags,
    saveContribution,
    saveGoalContributionTxn,
    removeContribution,
    goalLinkedTxnIds,
    linkTransaction,
    refreshGoalData
  } = useGoals();
  const [activeTab, setActiveTab] = useState<GoalsTabKey>('goals');

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        subtitle={
          goals.length > 0
            ? `${masked ? '••••' : formatCurrency(totalSaved)} of ${masked ? '••••' : formatCurrency(totalTarget)} saved`
            : undefined
        }
      />

      {/* 2026-08-01 relocation: FIRE/SIP & SWP/Lumpsum & CAGR moved in from Home's old generic
          Calculators hub — planning tools belong next to Goals, not on a Home tile. "SIP Calculator"
          renamed "Goal SIP" to disambiguate from the new "SIP & SWP" tab (same topic, different
          question: "what SIP do I need for this goal" vs. "given a SIP, what corpus/drawdown do I
          get"). Scrollable since 5 tabs no longer fit one screen width. */}
      <TabStrip
        scrollable
        options={[
          { value: 'goals', label: 'Goals' },
          { value: 'goal-sip', label: 'Goal SIP' },
          { value: 'fire', label: 'FIRE' },
          { value: 'sip-swp', label: 'SIP & SWP' },
          { value: 'lumpsum', label: 'Lumpsum & CAGR' }
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'goals' && (
        <GoalsTab
          goals={goals}
          masked={masked}
          saveGoal={saveGoal}
          removeGoal={removeGoal}
          contributionsByGoal={contributionsByGoal}
          effectiveSaved={effectiveSaved}
          accounts={accounts}
          saveAccount={saveAccount}
          expenses={expenses}
          categories={categories}
          hashtags={hashtags}
          saveContribution={saveContribution}
          saveGoalContributionTxn={saveGoalContributionTxn}
          removeContribution={removeContribution}
          goalLinkedTxnIds={goalLinkedTxnIds}
          linkTransaction={linkTransaction}
          onRefresh={refreshGoalData}
        />
      )}
      {activeTab === 'goal-sip' && <SipCalculatorTab />}
      {activeTab === 'fire' && (
        <CalculatorTab>
          <FireCalculator />
        </CalculatorTab>
      )}
      {activeTab === 'sip-swp' && (
        <CalculatorTab>
          <SipSwpCalculator />
        </CalculatorTab>
      )}
      {activeTab === 'lumpsum' && (
        <CalculatorTab>
          <LumpsumCalculator />
        </CalculatorTab>
      )}
    </SafeAreaView>
  );
}
