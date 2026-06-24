import { useState } from 'react';
import { Modal, Button, TextInput, SelectInput } from '@/components/ui';
import type { Budget, ExpenseCategory } from '@/core/db/types';
import { toMonthYearKey } from '@/lib/formatters';

interface BudgetModalProps {
  expenseCategories: ExpenseCategory[];
  initialCategoryId: string;
  existingBudget?: Budget | undefined;
  onSave: (budget: Budget) => void;
  onClose: () => void;
}

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
      <TextInput
        label="Monthly limit (₹)"
        type="number"
        inputMode="decimal"
        placeholder="e.g. 5000"
        value={amount}
        onChange={(val) => setAmount(val)}
      />
      <Button variant="primary" fullWidth onClick={handleSave}>
        Save budget
      </Button>
    </Modal>
  );
}
