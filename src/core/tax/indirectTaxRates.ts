// Indirect-tax rate model — pure, on-device, India-first.
//
// Every band carries a time-versioned list of rate entries (newest first). Looking up the
// rate in force on an expense's date keeps historical estimates honest and powers the
// "what changed when" awareness view. Two bases:
//   - 'markup' (GST slabs): the slab is added on top of a base price, so the tax embedded
//     in a consumer (tax-inclusive) amount is rate/(100+rate).
//   - 'share'  (fuel/sin/vehicle/toll): the rate already expresses the portion of the price
//     that is tax/levy, so embedded tax is rate/100 of the amount.
//
// Fuel, alcohol, tobacco, vehicle and toll figures are deliberate estimates — these levies
// (state excise, VAT, cess, road tax) vary by state and product and are labelled as such.

export type TaxRegime = 'gst' | 'fuel' | 'sin' | 'vehicle' | 'levy' | 'exempt';

export type TaxBandId =
  | 'gst-0'
  | 'gst-5'
  | 'gst-12'
  | 'gst-18'
  | 'gst-28'
  | 'gst-40'
  | 'insurance'
  | 'fuel'
  | 'alcohol'
  | 'tobacco'
  | 'vehicle'
  | 'toll'
  | 'exempt';

export interface RateEntry {
  effectiveFrom: number; // epoch ms — date this rate took effect
  ratePct: number; // see `basis`
  note?: string; // what changed / context (shown in the history view)
}

export interface TaxBand {
  id: TaxBandId;
  label: string;
  regime: TaxRegime;
  basis: 'markup' | 'share';
  /** Rate entries sorted descending by effectiveFrom (newest first). */
  rates: RateEntry[];
  /** Plain-language one-liner for the awareness screen. */
  blurb: string;
  /** A few example items that typically fall in this band (awareness screen). */
  examples?: string[];
  /** Date the slab was withdrawn (e.g. 12% & 28% under GST 2.0). History/reference only. */
  retiredOn?: number;
}

/** GST rollout — 1 July 2017. The baseline effective-from for current GST slabs. */
export const GST_LAUNCH = Date.UTC(2017, 6, 1);
/** GST 2.0 rationalisation — 22 September 2025 (12% & 28% retired; 40% added; insurance exempted). */
export const GST_2_0 = Date.UTC(2025, 8, 22);

const entry = (ratePct: number, effectiveFrom = GST_LAUNCH, note?: string): RateEntry => ({
  effectiveFrom,
  ratePct,
  ...(note ? { note } : {})
});

export const TAX_BANDS: Record<TaxBandId, TaxBand> = {
  'gst-0': {
    id: 'gst-0',
    label: 'GST 0% (exempt / nil-rated)',
    regime: 'gst',
    basis: 'markup',
    rates: [entry(0)],
    blurb: 'Unbranded staples, fresh produce and many essentials carry no GST.',
    examples: ['Fresh vegetables & fruit', 'Unbranded atta/rice', 'Milk']
  },
  'gst-5': {
    id: 'gst-5',
    label: 'GST 5%',
    regime: 'gst',
    basis: 'markup',
    rates: [entry(5)],
    blurb: 'Mass-consumption goods and most everyday services.',
    examples: ['Restaurant dining', 'Cab rides', 'Economy flights', 'Packaged food', 'Medicines']
  },
  'gst-12': {
    id: 'gst-12',
    label: 'GST 12%',
    regime: 'gst',
    basis: 'markup',
    rates: [entry(12)],
    retiredOn: GST_2_0,
    blurb: 'Retired under GST 2.0 (22 Sep 2025) — most 12% items moved to 5%, some to 18%.',
    examples: ['(historical) Apparel above ₹1,000', 'Processed foods']
  },
  'gst-18': {
    id: 'gst-18',
    label: 'GST 18%',
    regime: 'gst',
    basis: 'markup',
    rates: [entry(18)],
    blurb: 'The standard slab — most services and consumer goods. Absorbed many ex-28% items under GST 2.0.',
    examples: ['Telecom & internet', 'Electronics', 'ACs & large TVs', 'Entertainment', 'Personal care']
  },
  'gst-28': {
    id: 'gst-28',
    label: 'GST 28%',
    regime: 'gst',
    basis: 'markup',
    rates: [entry(28)],
    retiredOn: GST_2_0,
    blurb: 'Retired under GST 2.0 (22 Sep 2025) — most items moved to 18%; sin/luxury moved to the new 40% slab.',
    examples: ['(historical) ACs', 'Large TVs', 'Cement']
  },
  'gst-40': {
    id: 'gst-40',
    label: 'GST 40% (de-merit)',
    regime: 'gst',
    basis: 'markup',
    rates: [entry(40, GST_2_0, 'New de-merit slab introduced under GST 2.0')],
    blurb: 'The new top slab from GST 2.0 (22 Sep 2025) for sin & ultra-luxury goods.',
    examples: ['Tobacco & pan masala', 'Aerated/sugary drinks', 'Luxury cars', 'Yachts']
  },
  insurance: {
    id: 'insurance',
    label: 'Insurance premium',
    regime: 'gst',
    basis: 'markup',
    // Individual health & life insurance premiums became GST-exempt under GST 2.0.
    rates: [entry(0, GST_2_0, 'Individual health & life premiums exempted under GST 2.0'), entry(18)],
    blurb: 'Individual health & life insurance premiums carried 18% GST until GST 2.0 (22 Sep 2025) made them exempt.',
    examples: ['Term/life premium', 'Health insurance premium']
  },
  fuel: {
    id: 'fuel',
    label: 'Fuel (petrol / diesel)',
    regime: 'fuel',
    basis: 'share',
    // Petrol/diesel sit OUTSIDE GST — taxed via central excise + state VAT. Tax is roughly
    // half the pump price; the exact split varies by state.
    rates: [entry(50, GST_LAUNCH, 'Excise + state VAT; ~50% of pump price (varies by state)')],
    blurb:
      'Petrol and diesel are outside GST. Central excise + state VAT together are about half of what you pay at the pump.',
    examples: ['Petrol', 'Diesel']
  },
  alcohol: {
    id: 'alcohol',
    label: 'Alcohol',
    regime: 'sin',
    basis: 'share',
    // Liquor is outside GST — state excise duty + VAT, very high and state-specific.
    rates: [entry(50, GST_LAUNCH, 'State excise + VAT; varies widely by state')],
    blurb:
      'Alcohol is outside GST and taxed by states via excise duty and VAT — typically around half the shelf price.',
    examples: ['Beer', 'Wine', 'Spirits']
  },
  tobacco: {
    id: 'tobacco',
    label: 'Tobacco',
    regime: 'sin',
    basis: 'share',
    // GST 28% + compensation cess + NCCD — among the most heavily taxed goods.
    rates: [entry(53, GST_LAUNCH, 'GST 28% + compensation cess + NCCD')],
    blurb:
      'Cigarettes and tobacco carry GST 28% plus a hefty compensation cess and excise — over half the retail price.',
    examples: ['Cigarettes', 'Chewing tobacco']
  },
  vehicle: {
    id: 'vehicle',
    label: 'Vehicle purchase',
    regime: 'vehicle',
    basis: 'share',
    // 28% GST + cess (1–22% by type) + one-time road tax + registration.
    rates: [entry(35, GST_LAUNCH, '28% GST + cess + one-time road tax + registration')],
    blurb:
      'Buying a car or bike stacks 28% GST, a compensation cess, a one-time state road tax and registration — together roughly a third of the on-road price.',
    examples: ['Car purchase', 'Two-wheeler purchase', 'Road tax / RTO']
  },
  toll: {
    id: 'toll',
    label: 'Toll / road levy',
    regime: 'levy',
    basis: 'share',
    // A user levy for road infrastructure (NHAI/FASTag). Treated as a levy in full.
    rates: [entry(100, GST_LAUNCH, 'Road-use levy (NHAI / FASTag)')],
    blurb: 'Tolls are a government levy for road use, collected via FASTag. The whole amount is a levy.',
    examples: ['Highway toll', 'FASTag recharge used at toll']
  },
  exempt: {
    id: 'exempt',
    label: 'No indirect tax',
    regime: 'exempt',
    basis: 'markup',
    rates: [entry(0)],
    blurb: 'Residential rent, education, financial outflows and most healthcare carry no indirect tax for you.',
    examples: ['House rent', 'School / college fees', 'Loan EMI', 'Savings & SIP']
  }
};

/** The rate in force on a given date for a band (latest entry with effectiveFrom ≤ atMs). */
export function rateOn(band: TaxBand, atMs: number): number {
  for (const r of band.rates) {
    if (atMs >= r.effectiveFrom) return r.ratePct;
  }
  // Older than every entry → fall back to the earliest known rate.
  return band.rates[band.rates.length - 1]?.ratePct ?? 0;
}

/** Embedded indirect tax in a recorded (consumer) amount for a band, on a given date. */
export function embeddedTax(band: TaxBand, amount: number, atMs: number): number {
  const rate = rateOn(band, atMs);
  if (rate <= 0 || amount <= 0) return 0;
  return band.basis === 'markup' ? (amount * rate) / (100 + rate) : (amount * rate) / 100;
}

export const REGIME_LABEL: Record<TaxRegime, string> = {
  gst: 'GST',
  fuel: 'Fuel taxes',
  sin: 'Sin goods (excise/cess)',
  vehicle: 'Vehicle taxes',
  levy: 'Road levies',
  exempt: 'No indirect tax'
};
