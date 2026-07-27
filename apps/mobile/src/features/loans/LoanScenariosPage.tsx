import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import type { Liability } from '@/core/db/types';
import { SegmentedControl, PageHeader } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { useLoans } from './useLoans';
import { MyLoansTab } from './myloans/MyLoansTab';
import { PlannerTab } from './planner/PlannerTab';
import { usePlanner } from './planner/usePlanner';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

export function LoanScenariosPage() {
  const modeBg = useModeBackgroundColor();
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.loans);
  const { saveLiability, deleteLiability, emiLoans } = useLoans();
  const planner = usePlanner();
  const [activeTab, setActiveTab] = useState<'myloans' | 'planner'>('myloans');

  function handlePlanLoan(l: Liability) {
    planner.prefillFromLoan(l);
    setActiveTab('planner');
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader leading={<BackButton />} title="Loans" />

      <View className="px-4 py-2.5 border-b border-theme">
        <SegmentedControl
          options={[
            { value: 'myloans' as const, label: 'My Loans' },
            { value: 'planner' as const, label: 'Planner' }
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </View>

      {activeTab === 'myloans' && (
        <MyLoansTab
          emiLoans={emiLoans}
          masked={masked}
          saveLiability={saveLiability}
          deleteLiability={deleteLiability}
          onPlanLoan={handlePlanLoan}
        />
      )}

      {activeTab === 'planner' && <PlannerTab planner={planner} masked={masked} />}
    </SafeAreaView>
  );
}
