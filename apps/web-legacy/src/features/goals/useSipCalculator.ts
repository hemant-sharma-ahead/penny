import { useState } from 'react';
import { calcSipNeeded } from '@/core/goals/sipCalculator';
import { parseNumber } from '@/lib/formatters';

/** Owns the standalone SIP-calculator inputs and computes the required monthly SIP on demand. */
export function useSipCalculator() {
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [years, setYears] = useState('');
  const [annualReturn, setAnnualReturn] = useState('11');
  const [result, setResult] = useState<number | null>(null);

  function calculate() {
    const t = parseNumber(target);
    const s = parseNumber(saved);
    const y = parseNumber(years);
    const r = parseNumber(annualReturn) || 11;
    if (t <= 0 || y <= 0) return;
    setResult(calcSipNeeded(t, s, y * 12, r));
  }

  return {
    target,
    setTarget,
    saved,
    setSaved,
    years,
    setYears,
    annualReturn,
    setAnnualReturn,
    result,
    calculate
  };
}
