import { useMemo, useState } from 'react';
import type { TaxSummary } from '@/core/tax/calculator';
import { parseNumber } from '@/lib/formatters';

/**
 * RN port of apps/web-legacy/src/features/tax/deductions/useTaxDeductions.ts — unchanged. Owns the
 * manual deduction inputs (PPF/ELSS/NPS/other 80C, parents' premium) and combines them with the
 * inferred amounts from the tax summary to produce the 80C / 80CCD(1B) / 80D totals.
 */
export function useTaxDeductions(summary: TaxSummary | null) {
  const [ppf, setPpf] = useState('');
  const [elss, setElss] = useState('');
  const [nps, setNps] = useState('');
  const [other80C, setOther80C] = useState('');
  const [parentsPremium, setParentsPremium] = useState('');

  const manual80CTotal = useMemo(
    () => [ppf, elss, nps, other80C].reduce((s, v) => s + parseNumber(v), 0),
    [ppf, elss, nps, other80C]
  );

  const inferred80CTotal = useMemo(() => (summary?.inferred80C ?? []).reduce((s, i) => s + i.amount, 0), [summary]);

  const total80C = inferred80CTotal + manual80CTotal;
  const npsAmount = parseNumber(nps);

  const total80D = useMemo(
    () => ({ self: summary?.inferred80DAmount ?? 0, parents: parseNumber(parentsPremium) }),
    [summary, parentsPremium]
  );

  return {
    ppf,
    setPpf,
    elss,
    setElss,
    nps,
    setNps,
    other80C,
    setOther80C,
    parentsPremium,
    setParentsPremium,
    total80C,
    npsAmount,
    total80D
  };
}
