// Canonical, concise per-asset tax notes — the single source of truth shared by the Portfolio
// asset tabs (contextual "Tax on this" notes) and the Tax screen. Awareness, not advice; current
// to Budget 2024 + GST 2.0.

export type AssetTaxTopic = 'fd' | 'equity' | 'gold' | 'property' | 'retirement';

export interface AssetTaxInfo {
  title: string;
  points: string[];
}

export const ASSET_TAX_INFO: Record<AssetTaxTopic, AssetTaxInfo> = {
  fd: {
    title: 'Tax on FDs & RDs',
    points: [
      'Interest is fully taxable at your income-tax slab, in the year it accrues — under "Income from other sources".',
      'Banks deduct 10% TDS once interest crosses ₹40,000 a year (₹50,000 for senior citizens); 20% if no PAN.',
      'TDS is only part-payment — at a 30% slab you pay the balance when filing. Submit 15G/15H if your income is below the taxable limit to avoid TDS.'
    ]
  },
  equity: {
    title: 'Tax on stocks & mutual funds',
    points: [
      'Equity LTCG (held > 12 months): 12.5% on gains above ₹1.25 lakh a year.',
      'Equity STCG (held ≤ 12 months): 20%.',
      'Debt mutual funds bought after Apr 2023 are taxed at your slab, with no long-term benefit.',
      'Each trade also carries STT, stamp duty and exchange/SEBI fees. F&O is business income, taxed at slab (ITR-3).'
    ]
  },
  gold: {
    title: 'Tax on gold & silver',
    points: [
      'Buying attracts 3% GST (plus ~5% GST on jewellery making charges).',
      'On sale: LTCG 12.5% if held over 24 months, else taxed at your slab.',
      'Sovereign Gold Bonds differ — interest is taxable, but redemption gains at maturity are exempt.'
    ]
  },
  property: {
    title: 'Tax on property',
    points: [
      'Rental income is taxable (after a 30% standard deduction and home-loan interest).',
      'On sale: LTCG 12.5% if held over 24 months — with a grandfathering option (20% with indexation) for property bought before 23 Jul 2024.',
      'Buying adds ~6–7% stamp duty + registration; under-construction homes also carry 5% GST.',
      'Section 54/54F can exempt LTCG if you reinvest in another house.'
    ]
  },
  retirement: {
    title: 'Tax on NPS, PPF & EPF',
    points: [
      'PPF is fully exempt (EEE) — contribution, interest and maturity.',
      'EPF is exempt if you contribute for 5+ continuous years; early withdrawal can be taxed.',
      'NPS: an extra ₹50,000 deduction under 80CCD(1B); 60% of the maturity corpus is tax-free, the rest buys an annuity taxed at slab.'
    ]
  }
};
