import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState } from '~/components/ui';
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
  const insets = useSafeAreaInsets();
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  function handleContribute(goal: Goal, amount: number) {
    saveGoal({ ...goal, currentAmount: goal.currentAmount + amount, updatedAt: Date.now() }).catch(() => {});
  }

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="px-4 pt-4">
          <SuggestedGoals goals={goals} />
        </View>
        {goals.length === 0 ? (
          <View className="px-4 py-6">
            <EmptyState icon="ti-target" title="No goals yet" description="Tap + to set your first savings goal." />
          </View>
        ) : (
          <View className="px-4 py-4 gap-3">
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
          </View>
        )}
      </ScrollView>

      <View className="absolute right-4" style={{ bottom: insets.bottom + 16 }}>
        <Button
          variant="primary"
          icon="ti-plus"
          accessibilityLabel="Add goal"
          className="w-14 h-14 rounded-full shadow-lg"
          onPress={() => {
            setEditingGoal(null);
            setShowForm(true);
          }}
        />
      </View>

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
