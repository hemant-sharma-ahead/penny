import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import { TabStrip } from '@/components/ui';
import { useGoals } from './useGoals';
import { GoalsTab } from './GoalsTab';
import { SipCalculatorTab } from './SipCalculatorTab';

export function GoalsPage() {
  const { mode } = usePrivacy();
  const { goals, saveGoal, removeGoal, totalSaved, totalTarget } = useGoals();
  const [activeTab, setActiveTab] = useState<'goals' | 'sip'>('goals');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <h2 className="text-xl font-semibold text-primary">Goals</h2>
        {goals.length > 0 && (
          <p className="text-sm mt-0.5 text-secondary">
            {mode === 'open' ? formatCurrency(totalSaved) : '••••'} of{' '}
            {mode === 'open' ? formatCurrency(totalTarget) : '••••'} saved
          </p>
        )}
      </div>

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
