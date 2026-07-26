import { useState } from 'react';
import type { Liability, LiabilityType } from '@/core/db/types';
import { calcEmi } from '@/core/loans/calculator';
import { deriveTenureMonths } from '@/core/loans/amortization';
import { parseNumber } from '@/lib/formatters';

/** Best-effort remaining tenure (months) from a saved loan, to prefill the tenure fields on edit. */
function initialTenure(existing?: Liability): { yrs: string; mos: string } {
  if (!existing?.emiAmount) return { yrs: '', mos: '' };
  const months = deriveTenureMonths(existing.outstandingAmount, existing.interestRate, existing.emiAmount);
  if (!months || months <= 0) return { yrs: '', mos: '' };
  return { yrs: String(Math.floor(months / 12)), mos: String(months % 12) };
}

/**
 * Owns the "Add/Edit Loan" form state, derives the computed EMI live, and persists the liability.
 * @param saveLiability repository mutation from useLoans
 * @param onSaved called after a successful save (e.g. to close the modal)
 * @param existing when set, the form edits this loan in place (preserves id / createdAt / principal)
 */
export function useLoanForm(
  saveLiability: (l: Liability) => Promise<unknown>,
  onSaved: () => void,
  existing?: Liability
) {
  const t0 = initialTenure(existing);
  const [type, setType] = useState<LiabilityType>(existing?.type ?? 'home_loan');
  const [name, setName] = useState(existing?.name ?? '');
  const [lender, setLender] = useState(existing?.lenderName ?? '');
  const [outstanding, setOutstanding] = useState(existing ? String(existing.outstandingAmount) : '');
  const [rate, setRate] = useState(existing ? String(existing.interestRate) : '');
  const [tenureYrs, setTenureYrs] = useState(t0.yrs);
  const [tenureMos, setTenureMos] = useState(t0.mos);
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
      ...(existing ?? {}), // preserve fields the form doesn't edit (e.g. endDate) when editing
      id: existing?.id ?? crypto.randomUUID(),
      type,
      name: name.trim(),
      lenderName: lender.trim() || undefined,
      // On add, principal = outstanding; on edit, keep the original principal and just update outstanding.
      principalAmount: existing?.principalAmount ?? parseNumber(outstanding),
      outstandingAmount: parseNumber(outstanding),
      interestRate: parseNumber(rate),
      emiAmount: computedEmi ?? existing?.emiAmount ?? undefined,
      createdAt: existing?.createdAt ?? ts,
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
