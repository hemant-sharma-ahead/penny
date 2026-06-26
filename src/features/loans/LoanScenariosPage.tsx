import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import type { Liability } from '@/core/db/types';
import { SegmentedControl, PageHeader } from '@/components/ui';
import { useLoans } from './useLoans';
import { MyLoansTab } from './myloans/MyLoansTab';
import { PlannerTab } from './planner/PlannerTab';
import { usePlanner } from './planner/usePlanner';

export function LoanScenariosPage() {
  const { mode } = usePrivacy();
  const { saveLiability, emiLoans } = useLoans();
  const planner = usePlanner();
  const [activeTab, setActiveTab] = useState<'myloans' | 'planner'>('myloans');

  function handlePlanLoan(l: Liability) {
    planner.prefillFromLoan(l);
    setActiveTab('planner');
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Loans" className="flex-shrink-0" />

      <div className="px-4 py-2.5 border-b border-theme flex-shrink-0">
        <SegmentedControl
          options={[
            { value: 'myloans' as const, label: 'My Loans' },
            { value: 'planner' as const, label: 'Planner' }
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === 'myloans' && (
        <MyLoansTab emiLoans={emiLoans} mode={mode} saveLiability={saveLiability} onPlanLoan={handlePlanLoan} />
      )}

      {activeTab === 'planner' && <PlannerTab planner={planner} mode={mode} />}
    </div>
  );
}
