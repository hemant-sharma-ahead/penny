// SIP + SWP calculator — pure, on-device.
//
// Models both phases of a single investment journey:
//   1. Accumulation — a monthly SIP (optionally stepped up every year) compounds
//      at the expected return to build a corpus.
//   2. Withdrawal — a Systematic Withdrawal Plan (SWP) draws a monthly income from
//      that corpus (optionally raised every year for inflation) while the remaining
//      balance keeps growing at a — usually more conservative — return.
//
// Conventions: SIP contributions land at the end of each month (ordinary annuity);
// SWP withdrawals are taken at the start of each month and the remainder grows for
// that month. The step-up and the withdrawal increase are both applied at year
// boundaries.

export interface SipSwpInput {
  // Accumulation (SIP) phase
  monthlyInvestment: number; // starting monthly SIP
  annualStepUpPct: number; // yearly SIP increase, e.g. 10
  accumulationReturnPct: number; // expected annual return while investing
  accumulationYears: number;

  // Withdrawal (SWP) phase — set monthlyWithdrawal or withdrawalYears to 0 to skip
  monthlyWithdrawal: number; // starting monthly withdrawal
  annualWithdrawalIncreasePct: number; // yearly withdrawal increase (inflation), e.g. 6
  withdrawalReturnPct: number; // expected annual return while withdrawing
  withdrawalYears: number;
}

export interface SwpYearRow {
  year: number; // 1-based year of the withdrawal phase
  withdrawnInYear: number; // total drawn during the year
  yearEndCorpus: number; // corpus remaining at year end
}

export interface SipSwpResult {
  // Accumulation
  corpusAtRetirement: number; // corpus when the SIP ends / SWP begins
  totalInvested: number;
  accumulationGains: number;
  finalMonthlySip: number; // instalment in the final year of the SIP

  // Withdrawal
  hasSwp: boolean;
  totalWithdrawn: number;
  finalMonthlyWithdrawal: number;
  withdrawalGains: number; // growth earned during the withdrawal phase
  corpusAtEnd: number; // balance left after the withdrawal period
  corpusDepleted: boolean; // true if the corpus ran out before the period ended
  monthsCorpusLasted: number | null; // months the corpus survived (only when depleted)
  withdrawalSchedule: SwpYearRow[];
}

export function calcSipSwp(input: SipSwpInput): SipSwpResult | null {
  const {
    monthlyInvestment,
    annualStepUpPct,
    accumulationReturnPct,
    accumulationYears,
    monthlyWithdrawal,
    annualWithdrawalIncreasePct,
    withdrawalReturnPct,
    withdrawalYears
  } = input;

  if (monthlyInvestment <= 0 || accumulationYears <= 0) return null;
  if (annualStepUpPct < 0 || accumulationReturnPct < 0) return null;
  if (monthlyWithdrawal < 0 || annualWithdrawalIncreasePct < 0 || withdrawalReturnPct < 0 || withdrawalYears < 0) {
    return null;
  }

  // ── Accumulation phase ─────────────────────────────────────────────────────
  const rAcc = accumulationReturnPct / 100 / 12;
  const stepUp = annualStepUpPct / 100;
  const accMonths = Math.round(accumulationYears * 12);

  let corpus = 0;
  let currentSip = monthlyInvestment;
  let totalInvested = 0;

  for (let month = 1; month <= accMonths; month++) {
    corpus = corpus * (1 + rAcc) + currentSip;
    totalInvested += currentSip;
    // Raise the instalment at each year boundary (after the 12th, 24th… payment).
    if (month % 12 === 0 && month < accMonths) currentSip *= 1 + stepUp;
  }

  const corpusAtRetirement = corpus;
  const finalMonthlySip = currentSip;

  // ── Withdrawal phase ───────────────────────────────────────────────────────
  const hasSwp = monthlyWithdrawal > 0 && withdrawalYears > 0;

  let totalWithdrawn = 0;
  let corpusDepleted = false;
  let monthsCorpusLasted: number | null = null;
  let finalMonthlyWithdrawal = 0;
  let drawCorpus = corpusAtRetirement;
  const withdrawalSchedule: SwpYearRow[] = [];

  if (hasSwp) {
    const rWit = withdrawalReturnPct / 100 / 12;
    const wIncr = annualWithdrawalIncreasePct / 100;
    const witMonths = Math.round(withdrawalYears * 12);

    let currentWithdrawal = monthlyWithdrawal;
    let withdrawnInYear = 0;

    for (let month = 1; month <= witMonths; month++) {
      if (drawCorpus < currentWithdrawal) {
        // Corpus can no longer sustain a full withdrawal — take whatever is left.
        totalWithdrawn += drawCorpus;
        withdrawnInYear += drawCorpus;
        drawCorpus = 0;
        corpusDepleted = true;
        monthsCorpusLasted = month;
        finalMonthlyWithdrawal = currentWithdrawal;
        withdrawalSchedule.push({ year: Math.ceil(month / 12), withdrawnInYear, yearEndCorpus: 0 });
        break;
      }

      // Withdraw at the start of the month, then the remainder grows for the month.
      drawCorpus -= currentWithdrawal;
      totalWithdrawn += currentWithdrawal;
      withdrawnInYear += currentWithdrawal;
      drawCorpus *= 1 + rWit;

      const atYearBoundary = month % 12 === 0;
      const atEnd = month === witMonths;
      if (atYearBoundary || atEnd) {
        withdrawalSchedule.push({ year: Math.ceil(month / 12), withdrawnInYear, yearEndCorpus: drawCorpus });
        withdrawnInYear = 0;
        finalMonthlyWithdrawal = currentWithdrawal;
        // Raise the withdrawal for next year (never after the final payment).
        if (atYearBoundary && !atEnd) currentWithdrawal *= 1 + wIncr;
      }
    }
  }

  const corpusAtEnd = hasSwp ? drawCorpus : corpusAtRetirement;
  const withdrawalGains = hasSwp ? totalWithdrawn + corpusAtEnd - corpusAtRetirement : 0;

  return {
    corpusAtRetirement,
    totalInvested,
    accumulationGains: corpusAtRetirement - totalInvested,
    finalMonthlySip,
    hasSwp,
    totalWithdrawn,
    finalMonthlyWithdrawal,
    withdrawalGains,
    corpusAtEnd,
    corpusDepleted,
    monthsCorpusLasted,
    withdrawalSchedule
  };
}
