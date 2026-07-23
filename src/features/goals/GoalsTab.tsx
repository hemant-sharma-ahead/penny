import { useState } from 'react';
import { Button, EmptyState } from '@/components/ui';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { SuggestedGoals } from './SuggestedGoals';
import type { Goal } from './useGoals';

interface GoalsTabProps {
  goals: Goal[];
  masked: boolean;
  saveGoal: (g: Goal) => Promise<unknown>;
  removeGoal: (id: string) => Promise<unknown>;
}

export function GoalsTab({ goals, masked, saveGoal, removeGoal }: GoalsTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  function handleContribute(goal: Goal, amount: number) {
    saveGoal({ ...goal, currentAmount: goal.currentAmount + amount, updatedAt: Date.now() }).catch(() => {});
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 pt-4">
          <SuggestedGoals goals={goals} />
        </div>
        {goals.length === 0 ? (
          <div className="px-4 py-6">
            <EmptyState icon="ti-target" title="No goals yet" description="Tap + to set your first savings goal." />
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                masked={masked}
                onEdit={(g) => {
                  setEditingGoal(g);
                  setShowForm(true);
                }}
                onContribute={handleContribute}
              />
            ))}
          </div>
        )}
      </div>

      <Button
        variant="primary"
        icon="ti-plus"
        aria-label="Add goal"
        className="fixed w-14 h-14 rounded-full shadow-lg z-10"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', right: '1rem' }}
        onClick={() => {
          setEditingGoal(null);
          setShowForm(true);
        }}
      />

      {showForm && (
        <GoalForm
          editing={editingGoal}
          onSave={async (goal) => {
            await saveGoal(goal);
            setShowForm(false);
          }}
          onDelete={async (id) => {
            await removeGoal(id);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
