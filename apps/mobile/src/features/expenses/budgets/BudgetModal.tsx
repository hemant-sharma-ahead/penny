import { useState } from 'react';
import { Modal, Button, SelectInput, AmountInput } from '~/components/ui';
import type { Budget, ExpenseCategory } from '@/core/db/types';
import { toMonthYearKey } from '@/lib/formatters';

interface BudgetModalProps {
  expenseCategories: ExpenseCategory[];
  initialCategoryId: string;
  existingBudget?: Budget | undefined;
  onSave: (budget: Budget) => void;
  onClose: () => void;
}

// RN port note: web's `nested` prop (z-index stacking above another modal) is dropped — the mobile
// `Modal` (RN's own `Modal`) already stacks above whatever is open beneath it in mount order, so no
// stacking hint is needed here (see `~/components/ui/Modal.tsx`'s port note).
export function BudgetModal({
  expenseCategories,
  initialCategoryId,
  existingBudget,
  onSave,
  onClose
}: BudgetModalProps) {
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [amount, setAmount] = useState(existingBudget ? String(existingBudget.limitAmount) : '');

  function handleSave() {
    const parsed = parseFloat(amount);
    if (!categoryId || isNaN(parsed) || parsed <= 0) return;
    onSave({
      id: existingBudget?.id ?? crypto.randomUUID(),
      categoryId,
      monthYear: toMonthYearKey(),
      limitAmount: parsed,
      createdAt: existingBudget?.createdAt ?? Date.now(),
      updatedAt: Date.now()
    });
  }

  return (
    <Modal onClose={onClose} title="Set Budget" size="sm">
      <SelectInput
        label="Category"
        value={categoryId}
        onChange={setCategoryId}
        placeholder="Select category"
        options={expenseCategories.map((c) => ({ value: c.id, label: c.name }))}
      />
      <AmountInput label="Monthly limit" placeholder="e.g. 5000" value={amount} onChange={(val) => setAmount(val)} />
      <Button variant="primary" fullWidth onPress={handleSave}>
        Save budget
      </Button>
    </Modal>
  );
}
