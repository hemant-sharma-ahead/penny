import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { useSettings } from '@/context/SettingsContext';
import { formatCurrency } from '@/lib/formatters';
import { TabStrip, PageHeader } from '@/components/ui';
import { useGoals } from './useGoals';
import { GoalsTab } from './GoalsTab';
import { SipCalculatorTab } from './SipCalculatorTab';

export function GoalsPage() {
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.goals);
  const { goals, saveGoal, removeGoal, totalSaved, totalTarget } = useGoals();
  const [activeTab, setActiveTab] = useState<'goals' | 'sip'>('goals');

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Goals"
        subtitle={
          goals.length > 0
            ? `${masked ? '••••' : formatCurrency(totalSaved)} of ${masked ? '••••' : formatCurrency(totalTarget)} saved`
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

      {activeTab === 'goals' && <GoalsTab goals={goals} masked={masked} saveGoal={saveGoal} removeGoal={removeGoal} />}

      {activeTab === 'sip' && <SipCalculatorTab />}
    </div>
  );
}
