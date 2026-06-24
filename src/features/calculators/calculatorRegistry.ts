// Metadata for the M13 financial calculators. Drives the searchable list and the
// deep-link entries in the Settings drawer. Keep `id` values URL-safe — they are
// used as the `?calc=` query param.

export type CalculatorId =
  | 'fire'
  | 'tax-regime'
  | 'hra'
  | 'sip-swp'
  | 'fd-rd'
  | 'lumpsum'
  | 'capital-gains'
  | 'gratuity'
  | 'ssy'
  | 'inflation';

export interface CalculatorMeta {
  id: CalculatorId;
  title: string;
  subtitle: string;
  icon: string; // Tabler icon name (outline)
  color: string;
  keywords: string[]; // extra search terms beyond the title/subtitle
}

export const CALCULATORS: CalculatorMeta[] = [
  {
    id: 'fire',
    title: 'FIRE Calculator',
    subtitle: 'Corpus to retire early & years to financial independence',
    icon: 'ti-flame',
    color: '#f97316',
    keywords: ['retire early', 'financial independence', 'corpus', 'swr', 'withdrawal']
  },
  {
    id: 'tax-regime',
    title: 'Old vs New Tax Regime',
    subtitle: 'Compare income tax under both regimes (FY 2025-26)',
    icon: 'ti-scale',
    color: '#8b5cf6',
    keywords: ['income tax', 'slabs', 'deductions', '80c', 'rebate', '87a', 'regime']
  },
  {
    id: 'hra',
    title: 'HRA Exemption',
    subtitle: 'House rent allowance exemption under Section 10(13A)',
    icon: 'ti-home-2',
    color: '#3b82f6',
    keywords: ['house rent', 'allowance', 'rent', 'metro', 'section 10', 'salary']
  },
  {
    id: 'sip-swp',
    title: 'SIP & SWP Planner',
    subtitle: 'Build a corpus with a step-up SIP, then draw a monthly income (SWP)',
    icon: 'ti-arrows-up-down',
    color: '#10b981',
    keywords: [
      'sip',
      'swp',
      'step-up',
      'top-up',
      'systematic withdrawal',
      'withdrawal',
      'retirement income',
      'corpus',
      'drawdown',
      'mutual fund',
      'pension',
      'future value',
      'compounding'
    ]
  },
  {
    id: 'fd-rd',
    title: 'FD / RD Maturity',
    subtitle: 'Fixed & recurring deposit maturity and interest',
    icon: 'ti-building-bank',
    color: '#14b8a6',
    keywords: ['fixed deposit', 'recurring deposit', 'fd', 'rd', 'maturity', 'compound interest', 'bank', 'tenure']
  },
  {
    id: 'lumpsum',
    title: 'Lumpsum & CAGR',
    subtitle: 'Future value of a one-time investment, or its annualised return',
    icon: 'ti-coin',
    color: '#06b6d4',
    keywords: ['lumpsum', 'one-time', 'cagr', 'annualised return', 'future value', 'absolute return', 'growth']
  },
  {
    id: 'capital-gains',
    title: 'Capital Gains Tax',
    subtitle: 'LTCG / STCG on equity, debt, gold & property (Budget 2024)',
    icon: 'ti-chart-candle',
    color: '#ec4899',
    keywords: ['ltcg', 'stcg', 'capital gains', 'equity', 'debt', 'gold', 'property', 'tax', 'indexation']
  },
  {
    id: 'gratuity',
    title: 'Gratuity',
    subtitle: 'End-of-service gratuity under the Payment of Gratuity Act',
    icon: 'ti-cash-banknote',
    color: '#f59e0b',
    keywords: ['gratuity', 'retirement', 'end of service', 'salary', 'basic', 'da', 'employment']
  },
  {
    id: 'ssy',
    title: 'Sukanya Samriddhi (SSY)',
    subtitle: 'Girl-child savings scheme maturity at 21 years',
    icon: 'ti-baby-carriage',
    color: '#d946ef',
    keywords: ['sukanya samriddhi', 'ssy', 'girl child', 'daughter', 'savings scheme', 'maturity', 'small savings']
  },
  {
    id: 'inflation',
    title: 'Inflation / Future Cost',
    subtitle: 'What today’s money will cost — and be worth — later',
    icon: 'ti-trending-down',
    color: '#0ea5e9',
    keywords: ['inflation', 'future cost', 'purchasing power', 'present value', 'cost of living', 'erosion']
  }
];

export function searchCalculators(query: string): CalculatorMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return CALCULATORS;
  return CALCULATORS.filter((c) => {
    const haystack = [c.title, c.subtitle, ...c.keywords].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

export function getCalculator(id: string): CalculatorMeta | undefined {
  return CALCULATORS.find((c) => c.id === id);
}
