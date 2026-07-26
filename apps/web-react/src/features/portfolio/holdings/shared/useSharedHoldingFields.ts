import { useState } from 'react';
import type { Holding } from '@/core/db/types';

export interface SharedHoldingState {
  name: string;
  setName: (v: string) => void;
  investedAmount: string;
  setInvestedAmount: (v: string) => void;
  currentValue: string;
  setCurrentValue: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

// Owns the holding fields common to every asset class (name / amount / current
// value / notes), seeded from the holding being edited. For an RD the amount
// field shows the monthly installment rather than the total committed.
export function useSharedHoldingFields(editing: Holding | null): SharedHoldingState {
  const [name, setName] = useState(editing?.name ?? '');
  const [investedAmount, setInvestedAmount] = useState(() => {
    if (!editing) return '';
    if (
      (editing.assetMeta?.fdSubType ?? editing.assetClass) === 'rd' &&
      editing.assetMeta?.rdMonthlyInstallment != null
    )
      return String(editing.assetMeta.rdMonthlyInstallment);
    return String(editing.investedAmount);
  });
  const [currentValue, setCurrentValue] = useState(editing?.currentValue != null ? String(editing.currentValue) : '');
  const [notes, setNotes] = useState(editing?.notes ?? '');

  return {
    name,
    setName,
    investedAmount,
    setInvestedAmount,
    currentValue,
    setCurrentValue,
    notes,
    setNotes
  };
}
