// Sukanya Samriddhi Yojana (SSY) calculator — pure, on-device.
//
// Deposits are allowed for 15 years from account opening; the account matures
// 21 years from opening. Interest is compounded annually. After year 15 no further
// deposits are made but the balance keeps earning interest until maturity.
// Deposits are modelled at the start of each year (so they earn interest that year).

export const SSY_DEPOSIT_YEARS = 15;
export const SSY_MATURITY_YEARS = 21;
export const SSY_MIN_ANNUAL = 250;
export const SSY_MAX_ANNUAL = 1_50_000;
export const SSY_DEFAULT_RATE_PCT = 8.2;

export interface SsyInput {
  annualDeposit: number;
  ratePct: number;
}

export interface SsyYearRow {
  year: number;
  deposit: number;
  interest: number;
  balance: number; // year-end balance
}

export interface SsyResult {
  maturityValue: number;
  totalDeposited: number;
  totalInterest: number;
  depositBelowMin: boolean;
  depositAboveMax: boolean;
  schedule: SsyYearRow[];
}

export function calcSsy(input: SsyInput): SsyResult | null {
  const { annualDeposit, ratePct } = input;
  if (annualDeposit <= 0 || ratePct < 0) return null;

  const r = ratePct / 100;
  let balance = 0;
  let totalDeposited = 0;
  const schedule: SsyYearRow[] = [];

  for (let year = 1; year <= SSY_MATURITY_YEARS; year++) {
    const deposit = year <= SSY_DEPOSIT_YEARS ? annualDeposit : 0;
    balance += deposit;
    totalDeposited += deposit;
    const interest = balance * r;
    balance += interest;
    schedule.push({ year, deposit, interest, balance });
  }

  return {
    maturityValue: balance,
    totalDeposited,
    totalInterest: balance - totalDeposited,
    depositBelowMin: annualDeposit < SSY_MIN_ANNUAL,
    depositAboveMax: annualDeposit > SSY_MAX_ANNUAL,
    schedule
  };
}
