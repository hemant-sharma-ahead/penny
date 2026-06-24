import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import { TabStrip, PageHeader } from '@/components/ui';
import { useGoals } from './useGoals';
import { GoalsTab } from './GoalsTab';
import { SipCalculatorTab } from './SipCalculatorTab';

export function GoalsPage() {
  const { mode } = usePrivacy();
  const { goals, saveGoal, removeGoal, totalSaved, totalTarget } = useGoals();
  const [activeTab, setActiveTab] = useState<'goals' | 'sip'>('goals');

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Goals"
        subtitle={
          goals.length > 0
            ? `${mode === 'open' ? formatCurrency(totalSaved) : '••••'} of ${mode === 'open' ? formatCurrency(totalTarget) : '••••'} saved`
            : undefined
        }
      />

      {/* Tabs */}
      <TabStrip
        options={[
          { value: 'goals', label: 'Goals' },
          { value: 'sip', label: 'SIP Calculator' }
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'goals' && <GoalsTab goals={goals} mode={mode} saveGoal={saveGoal} removeGoal={removeGoal} />}

      {activeTab === 'sip' && <SipCalculatorTab />}
    </div>
  );
}
