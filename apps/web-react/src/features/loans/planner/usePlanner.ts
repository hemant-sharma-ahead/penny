import { useMemo, useState } from 'react';
import type { Liability } from '@/core/db/types';
import { calcAmortization, deriveTenureMonths } from '@/core/loans/amortization';
import type { LoanPlanParams } from '@/core/loans/amortization';
import { parseNumber } from '@/lib/formatters';

export interface PrepayRow {
  id: string;
  month: string;
  amount: string;
}

/**
 * Owns all loan-planner input state and derives the amortization schedule (with and without
 * accelerators) plus the interest/tenure savings. Pure math lives in `core/loans/amortization`.
 */
export function usePlanner() {
  const now = new Date();

  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [tenureYrs, setTenureYrs] = useState('');
  const [tenureMos, setTenureMos] = useState('');
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [startMonth, setStartMonth] = useState(now.getMonth());
  const [stepUp, setStepUp] = useState('0');
  const [extraEmi, setExtraEmi] = useState('0');
  const [strategy, setStrategy] = useState<'reduce_tenure' | 'reduce_emi'>('reduce_tenure');
  const [prepayRows, setPrepayRows] = useState<PrepayRow[]>([]);

  const totalTenureMonths = parseNumber(tenureYrs) * 12 + parseNumber(tenureMos);

  const planParams = useMemo(
    (): LoanPlanParams => ({
      principal: parseNumber(principal),
      annualRatePct: parseNumber(rate),
      tenureMonths: totalTenureMonths,
      startYear,
      startMonth,
      stepUpPct: parseNumber(stepUp),
      extraEmiPerYear: Math.round(parseNumber(extraEmi)),
      prepayments: prepayRows
        .map((r) => ({ month: parseInt(r.month, 10), amount: parseNumber(r.amount) }))
        .filter((p) => p.month > 0 && p.amount > 0),
      strategy
    }),
    [principal, rate, totalTenureMonths, startYear, startMonth, stepUp, extraEmi, prepayRows, strategy]
  );

  const baseParams = useMemo(
    (): LoanPlanParams => ({ ...planParams, stepUpPct: 0, extraEmiPerYear: 0, prepayments: [] }),
    [planParams]
  );

  const result = useMemo(() => calcAmortization(planParams), [planParams]);
  const baseline = useMemo(() => calcAmortization(baseParams), [baseParams]);

  const isValid = planParams.principal > 0 && planParams.annualRatePct > 0 && planParams.tenureMonths > 0;
  const hasAccelerators =
    planParams.stepUpPct > 0 || planParams.extraEmiPerYear > 0 || planParams.prepayments.length > 0;
  const interestSaved = Math.max(0, baseline.totalInterest - result.totalInterest);
  const monthsSaved = Math.max(0, baseline.actualTenureMonths - result.actualTenureMonths);

  const yearOptions = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 1 + i);

  function addPrepayRow() {
    setPrepayRows((prev) => [...prev, { id: crypto.randomUUID(), month: '', amount: '' }]);
  }
  function updatePrepayRow(id: string, field: 'month' | 'amount', val: string) {
    setPrepayRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }
  function removePrepayRow(id: string) {
    setPrepayRows((prev) => prev.filter((r) => r.id !== id));
  }

  /** Seeds the planner from an existing tracked loan (does not switch tabs — caller handles that). */
  function prefillFromLoan(l: Liability) {
    setPrincipal(String(Math.round(l.outstandingAmount)));
    setRate(String(l.interestRate));
    if (l.emiAmount) {
      const t = deriveTenureMonths(l.outstandingAmount, l.interestRate, l.emiAmount);
      setTenureYrs(String(Math.floor(t / 12)));
      setTenureMos(String(t % 12));
    } else {
      setTenureYrs('');
      setTenureMos('');
    }
    setStartYear(now.getFullYear());
    setStartMonth(now.getMonth());
    setStepUp('0');
    setExtraEmi('0');
    setStrategy('reduce_tenure');
    setPrepayRows([]);
  }

  return {
    // inputs + setters
    principal,
    setPrincipal,
    rate,
    setRate,
    tenureYrs,
    setTenureYrs,
    tenureMos,
    setTenureMos,
    startYear,
    setStartYear,
    startMonth,
    setStartMonth,
    stepUp,
    setStepUp,
    extraEmi,
    setExtraEmi,
    strategy,
    setStrategy,
    prepayRows,
    addPrepayRow,
    updatePrepayRow,
    removePrepayRow,
    yearOptions,
    // derived
    planParams,
    result,
    baseline,
    isValid,
    hasAccelerators,
    interestSaved,
    monthsSaved,
    prefillFromLoan
  };
}
