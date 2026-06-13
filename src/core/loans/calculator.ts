/** Monthly EMI via the PMT formula: P × r(1+r)^n / ((1+r)^n − 1) */
export function calcEmi(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRatePct <= 0) return principal / months;
  const r = annualRatePct / 100 / 12;
  const factor = Math.pow(1 + r, months);
  return (principal * r * factor) / (factor - 1);
}

// ── Scenario 1: Standard EMI ──────────────────────────────────────────────────

export interface EmiResult {
  emi: number;
  totalInterest: number;
  totalPayment: number;
  interestPct: number;
}

export function scenarioEmi(principal: number, annualRatePct: number, months: number): EmiResult | null {
  if (principal <= 0 || months <= 0 || annualRatePct < 0) return null;
  const emi = calcEmi(principal, annualRatePct, months);
  const totalPayment = emi * months;
  const totalInterest = totalPayment - principal;
  return { emi, totalInterest, totalPayment, interestPct: (totalInterest / principal) * 100 };
}

// ── Scenario 2: Extra EMI ─────────────────────────────────────────────────────

export interface ExtraEmiResult {
  baseMonths: number;
  newMonths: number;
  monthsSaved: number;
  baseInterest: number;
  newInterest: number;
  interestSaved: number;
}

/** Extra EMIs paid as lump at end of each year (e.g. from annual bonus) */
export function scenarioExtraEmi(
  principal: number,
  annualRatePct: number,
  months: number,
  extraPerYear: number
): ExtraEmiResult | null {
  if (principal <= 0 || months <= 0 || annualRatePct < 0 || extraPerYear <= 0) return null;
  const r = annualRatePct / 100 / 12;
  const emi = calcEmi(principal, annualRatePct, months);
  const baseInterest = emi * months - principal;

  let balance = principal;
  let m = 0;
  let totalInterest = 0;

  while (balance > 0.5 && m < months * 3) {
    m++;
    const interest = balance * r;
    totalInterest += interest;
    balance -= emi - interest;
    if (balance <= 0) {
      break;
    }
    if (m % 12 === 0) {
      balance = Math.max(0, balance - extraPerYear * emi);
    }
  }

  return {
    baseMonths: months,
    newMonths: m,
    monthsSaved: Math.max(0, months - m),
    baseInterest,
    newInterest: totalInterest,
    interestSaved: Math.max(0, baseInterest - totalInterest)
  };
}

// ── Scenario 3: Step-up EMI ───────────────────────────────────────────────────

export interface StepUpResult {
  startingEmi: number;
  flatEmi: number;
  actualMonths: number;
  baseInterest: number;
  newInterest: number;
  interestDiff: number; // positive = saved vs flat, negative = extra paid
}

/** Start with a lower EMI and increase by X% each year */
export function scenarioStepUp(
  principal: number,
  annualRatePct: number,
  months: number,
  startEmi: number,
  annualStepUpPct: number
): StepUpResult | null {
  if (principal <= 0 || months <= 0 || annualRatePct < 0 || startEmi <= 0 || annualStepUpPct < 0) return null;
  const r = annualRatePct / 100 / 12;
  const flatEmi = calcEmi(principal, annualRatePct, months);
  const baseInterest = flatEmi * months - principal;

  let balance = principal;
  let m = 0;
  let totalInterest = 0;
  let currentEmi = startEmi;

  while (balance > 0.5 && m < months * 4) {
    m++;
    const interest = balance * r;
    totalInterest += interest;
    const payment = Math.min(balance + interest, currentEmi);
    balance -= payment - interest;
    if (balance <= 0) {
      break;
    }
    if (m % 12 === 0) {
      currentEmi *= 1 + annualStepUpPct / 100;
    }
  }

  return {
    startingEmi: startEmi,
    flatEmi,
    actualMonths: m,
    baseInterest,
    newInterest: totalInterest,
    interestDiff: baseInterest - totalInterest
  };
}

// ── Scenario 4: Lump Sum Prepayment ──────────────────────────────────────────

export interface LumpSumResult {
  balanceAtMonth: number;
  originalEmi: number;
  baseInterestAfter: number;
  optionA: { newRemainingMonths: number; monthsSaved: number; interestAfter: number }; // reduce tenure
  optionB: { newEmi: number; emiReduction: number; interestAfter: number }; // reduce EMI
}

export function scenarioLumpSum(
  principal: number,
  annualRatePct: number,
  months: number,
  prepayMonth: number,
  lumpSum: number
): LumpSumResult | null {
  if (principal <= 0 || months <= 0 || annualRatePct < 0 || prepayMonth < 1 || lumpSum <= 0) return null;
  if (prepayMonth >= months) return null;

  const r = annualRatePct / 100 / 12;
  const emi = calcEmi(principal, annualRatePct, months);

  let balance = principal;
  for (let i = 0; i < prepayMonth; i++) {
    const interest = balance * r;
    balance -= emi - interest;
  }
  balance = Math.max(0, balance);

  const remainingMonths = months - prepayMonth;
  const baseInterestAfter = Math.max(0, emi * remainingMonths - balance);
  const newBalance = Math.max(0, balance - lumpSum);

  // Option A: keep EMI, tenure shrinks
  let balA = newBalance;
  let mA = 0;
  let intA = 0;
  while (balA > 0.5 && mA < remainingMonths * 2) {
    mA++;
    const interest = balA * r;
    intA += interest;
    balA -= emi - interest;
    if (balA <= 0) {
      break;
    }
  }

  // Option B: keep remaining tenure, EMI shrinks
  const newEmi = calcEmi(newBalance, annualRatePct, remainingMonths);

  return {
    balanceAtMonth: balance,
    originalEmi: emi,
    baseInterestAfter,
    optionA: { newRemainingMonths: mA, monthsSaved: remainingMonths - mA, interestAfter: intA },
    optionB: { newEmi, emiReduction: emi - newEmi, interestAfter: Math.max(0, newEmi * remainingMonths - newBalance) }
  };
}

// ── Scenario 5: Balance Transfer ──────────────────────────────────────────────

export interface BalanceTransferResult {
  currentEmi: number;
  newEmi: number;
  emiReduction: number;
  currentInterestRemaining: number;
  newInterestRemaining: number;
  grossSaving: number;
  netSaving: number;
  breakEvenMonths: number | null;
}

export function scenarioBalanceTransfer(
  outstanding: number,
  remainingMonths: number,
  currentRatePct: number,
  newRatePct: number,
  processingFee: number
): BalanceTransferResult | null {
  if (outstanding <= 0 || remainingMonths <= 0 || currentRatePct < 0 || newRatePct < 0 || processingFee < 0)
    return null;
  if (newRatePct >= currentRatePct) return null;

  const currentEmi = calcEmi(outstanding, currentRatePct, remainingMonths);
  const newEmi = calcEmi(outstanding, newRatePct, remainingMonths);
  const currentInterestRemaining = Math.max(0, currentEmi * remainingMonths - outstanding);
  const newInterestRemaining = Math.max(0, newEmi * remainingMonths - outstanding);
  const grossSaving = currentInterestRemaining - newInterestRemaining;
  const netSaving = grossSaving - processingFee;
  const emiDiff = currentEmi - newEmi;
  const breakEvenMonths = emiDiff > 0 ? Math.ceil(processingFee / emiDiff) : null;

  return {
    currentEmi,
    newEmi,
    emiReduction: emiDiff,
    currentInterestRemaining,
    newInterestRemaining,
    grossSaving,
    netSaving,
    breakEvenMonths: netSaving > 0 ? breakEvenMonths : null
  };
}

// ── Scenario 6: Combination ───────────────────────────────────────────────────

export interface CombinationResult {
  baseMonths: number;
  newMonths: number;
  monthsSaved: number;
  baseInterest: number;
  newInterest: number;
  interestSaved: number;
}

/** Extra EMIs at year-end + annual lump sum payment */
export function scenarioCombination(
  principal: number,
  annualRatePct: number,
  months: number,
  extraEmisPerYear: number,
  annualLumpSum: number
): CombinationResult | null {
  if (principal <= 0 || months <= 0 || annualRatePct < 0) return null;
  if (extraEmisPerYear <= 0 && annualLumpSum <= 0) return null;

  const r = annualRatePct / 100 / 12;
  const emi = calcEmi(principal, annualRatePct, months);
  const baseInterest = emi * months - principal;

  let balance = principal;
  let m = 0;
  let totalInterest = 0;

  while (balance > 0.5 && m < months * 3) {
    m++;
    const interest = balance * r;
    totalInterest += interest;
    balance -= emi - interest;
    if (balance <= 0) {
      break;
    }
    if (m % 12 === 0) {
      if (extraEmisPerYear > 0) balance = Math.max(0, balance - extraEmisPerYear * emi);
      if (annualLumpSum > 0) balance = Math.max(0, balance - annualLumpSum);
    }
  }

  return {
    baseMonths: months,
    newMonths: m,
    monthsSaved: Math.max(0, months - m),
    baseInterest,
    newInterest: totalInterest,
    interestSaved: Math.max(0, baseInterest - totalInterest)
  };
}
