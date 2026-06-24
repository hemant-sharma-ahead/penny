// FIRE (Financial Independence, Retire Early) calculator — pure, on-device.
//
// Computes the corpus needed to live off investments (the "FIRE number") using a
// safe withdrawal rate, then projects how many years of investing it takes to get
// there — accounting for inflation eroding the target each year.

export interface FireInput {
  currentAge: number;
  monthlyExpenses: number; // current monthly expenses, today's money
  currentCorpus: number; // already-saved investable corpus
  monthlyInvestment: number; // amount invested every month going forward
  expectedReturnPct: number; // expected annual return (pre-retirement), nominal
  inflationPct: number; // expected annual inflation
  swrPct: number; // safe withdrawal rate, e.g. 4
}

export interface FireResult {
  fireNumber: number; // corpus needed in today's money
  yearsToFi: number | null; // whole years until FI (null if not reached within horizon)
  fiAge: number | null; // age at which FI is reached
  corpusAtFi: number; // projected corpus when FI is reached (or at horizon)
  targetAtFi: number; // inflation-adjusted FIRE number at that point
}

const MAX_HORIZON_YEARS = 70;

export function calcFire(input: FireInput): FireResult | null {
  const { currentAge, monthlyExpenses, currentCorpus, monthlyInvestment, expectedReturnPct, inflationPct, swrPct } =
    input;

  if (currentAge < 0 || monthlyExpenses <= 0 || swrPct <= 0) return null;
  if (currentCorpus < 0 || monthlyInvestment < 0 || expectedReturnPct < 0 || inflationPct < 0) return null;

  const annualExpenses = monthlyExpenses * 12;
  const fireNumber = annualExpenses / (swrPct / 100);

  const r = expectedReturnPct / 100;
  const infl = inflationPct / 100;
  const annualInvestment = monthlyInvestment * 12;

  let corpus = currentCorpus;

  // Already financially independent today.
  if (corpus >= fireNumber) {
    return { fireNumber, yearsToFi: 0, fiAge: currentAge, corpusAtFi: corpus, targetAtFi: fireNumber };
  }

  let lastTarget = fireNumber;
  for (let year = 1; year <= MAX_HORIZON_YEARS; year++) {
    corpus = corpus * (1 + r) + annualInvestment;
    const target = fireNumber * Math.pow(1 + infl, year);
    lastTarget = target;
    if (corpus >= target) {
      return { fireNumber, yearsToFi: year, fiAge: currentAge + year, corpusAtFi: corpus, targetAtFi: target };
    }
  }

  return { fireNumber, yearsToFi: null, fiAge: null, corpusAtFi: corpus, targetAtFi: lastTarget };
}
