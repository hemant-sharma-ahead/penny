// The income waterfall — the spine of the Tax Footprint. Reconciles gross salary down to what
// was actually consumed, and answers: "of the money I didn't save, how much was direct tax, how
// much indirect tax, and how much real spending?" Pure; every input is overridable upstream.
//
// Identity (proven): consumed = gross − totalSavings ≡ directTax + trackedSpend
//                              = directTax + indirectTax + realConsumption

export interface WaterfallInput {
  gross: number; // annual gross income
  epfEmployee: number; // employee EPF/PF contribution — forced *savings*, not tax
  professionalTax: number; // statutory state levy (direct)
  lwf: number; // labour welfare fund (direct, usually tiny)
  incomeTax: number; // direct income tax (from regime engine or manual correction)
  trackedSpend: number; // FY consumption spend (excludes investments/transfers)
  indirectTax: number; // estimated indirect tax embedded within trackedSpend
}

export interface IncomeWaterfall {
  gross: number;
  epf: number;
  statutoryLevies: number; // professionalTax + lwf
  incomeTax: number;
  inHand: number; // gross − epf − statutoryLevies − incomeTax
  trackedSpend: number;
  discretionarySavings: number; // inHand − trackedSpend (signed; negative ⇒ dipped into savings/credit)
  totalSavings: number; // epf + discretionarySavings
  consumed: number; // gross − totalSavings ≡ directTax + trackedSpend
  directTax: number; // incomeTax + statutoryLevies
  indirectTax: number;
  realConsumption: number; // trackedSpend − indirectTax
  // Shares of `consumed` (sum ≈ 100)
  directPct: number;
  indirectPct: number;
  realPct: number;
  // Overall
  savingsRate: number; // totalSavings / gross
  overspent: boolean; // discretionarySavings < 0
}

export function computeWaterfall(input: WaterfallInput): IncomeWaterfall {
  const gross = Math.max(0, input.gross);
  const epf = Math.max(0, input.epfEmployee);
  const statutoryLevies = Math.max(0, input.professionalTax) + Math.max(0, input.lwf);
  const incomeTax = Math.max(0, input.incomeTax);
  const trackedSpend = Math.max(0, input.trackedSpend);
  const indirectTax = Math.min(Math.max(0, input.indirectTax), trackedSpend);

  const inHand = gross - epf - statutoryLevies - incomeTax;
  const discretionarySavings = inHand - trackedSpend;
  const totalSavings = epf + discretionarySavings;
  const consumed = gross - totalSavings; // ≡ directTax + trackedSpend

  const directTax = incomeTax + statutoryLevies;
  const realConsumption = trackedSpend - indirectTax;

  const pct = (part: number) => (consumed > 0 ? (part / consumed) * 100 : 0);

  return {
    gross,
    epf,
    statutoryLevies,
    incomeTax,
    inHand,
    trackedSpend,
    discretionarySavings,
    totalSavings,
    consumed,
    directTax,
    indirectTax,
    realConsumption,
    directPct: pct(directTax),
    indirectPct: pct(indirectTax),
    realPct: pct(realConsumption),
    savingsRate: gross > 0 ? (totalSavings / gross) * 100 : 0,
    overspent: discretionarySavings < 0
  };
}

/** Default EPF/PF basis: 12% of basic, with basic assumed at 50% of gross unless overridden. */
export const DEFAULT_BASIC_PCT = 50;
export const EPF_RATE_PCT = 12;
/** Common ceiling for professional tax across most states (annual). */
export const DEFAULT_PROFESSIONAL_TAX = 2_400;

export function defaultEpf(gross: number, basicPct: number = DEFAULT_BASIC_PCT): number {
  return Math.round((gross * (basicPct / 100) * EPF_RATE_PCT) / 100);
}
