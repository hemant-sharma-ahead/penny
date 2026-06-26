import { useState } from 'react';
import type { Liability, LiabilityType } from '@/core/db/types';
import { calcEmi } from '@/core/loans/calculator';
import { parseNumber } from '@/lib/formatters';

/**
 * Owns the "Add Loan" form state, derives the computed EMI live, and persists a new liability.
 * @param saveLiability repository mutation from useLoans
 * @param onSaved called after a successful save (e.g. to close the modal)
 */
export function useLoanForm(saveLiability: (l: Liability) => Promise<unknown>, onSaved: () => void) {
  const [type, setType] = useState<LiabilityType>('home_loan');
  const [name, setName] = useState('');
  const [lender, setLender] = useState('');
  const [outstanding, setOutstanding] = useState('');
  const [rate, setRate] = useState('');
  const [tenureYrs, setTenureYrs] = useState('');
  const [tenureMos, setTenureMos] = useState('');
  const [saving, setSaving] = useState(false);

  const tenureTotal = parseNumber(tenureYrs) * 12 + parseNumber(tenureMos);
  const computedEmi =
    tenureTotal > 0 && parseNumber(outstanding) > 0 && parseNumber(rate) > 0
      ? calcEmi(parseNumber(outstanding), parseNumber(rate), tenureTotal)
      : null;

  const canSave = Boolean(name.trim() && outstanding && rate);

  function save() {
    if (!canSave || saving) return;
    setSaving(true);
    const ts = Date.now();
    const loan: Liability = {
      id: crypto.randomUUID(),
      type,
      name: name.trim(),
      lenderName: lender.trim() || undefined,
      principalAmount: parseNumber(outstanding),
      outstandingAmount: parseNumber(outstanding),
      interestRate: parseNumber(rate),
      emiAmount: computedEmi ?? undefined,
      createdAt: ts,
      updatedAt: ts
    };
    saveLiability(loan)
      .then(() => {
        setSaving(false);
        onSaved();
      })
      .catch(() => setSaving(false));
  }

  return {
    type,
    setType,
    name,
    setName,
    lender,
    setLender,
    outstanding,
    setOutstanding,
    rate,
    setRate,
    tenureYrs,
    setTenureYrs,
    tenureMos,
    setTenureMos,
    saving,
    computedEmi,
    canSave,
    save
  };
}
