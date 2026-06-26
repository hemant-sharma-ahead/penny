// Which ITR form likely applies — a plain-language decision aid, not filing advice.
// Covers the individual/HUF forms (ITR-1..4); ITR-5 is noted as for firms/LLPs/AOPs.

export interface ITRAnswers {
  isHUF: boolean;
  hasBusinessOrProfession: boolean;
  isPresumptive: boolean; // opting for 44AD/44ADA/44AE presumptive taxation
  hasCapitalGains: boolean;
  multipleHouseProperties: boolean;
  incomeAbove50L: boolean;
  foreignAssetsOrIncome: boolean;
}

export interface ITRSuggestion {
  form: string; // 'ITR-1 (Sahaj)' …
  why: string;
  claimable: string[];
}

export function suggestITR(a: ITRAnswers): ITRSuggestion {
  // Business/profession first — it dominates the choice.
  if (a.hasBusinessOrProfession) {
    if (a.isPresumptive && !a.hasCapitalGains && !a.foreignAssetsOrIncome) {
      return {
        form: 'ITR-4 (Sugam)',
        why: 'Presumptive business/professional income (44AD/44ADA/44AE) with total income up to ₹50L.',
        claimable: ['Presumptive income @ 6%/8% (44AD) or 50% (44ADA)', 'Salary/pension', 'One house property']
      };
    }
    return {
      form: 'ITR-3',
      why: 'Income from a business or profession (non-presumptive).',
      claimable: ['Business/professional P&L', 'Capital gains', 'Multiple house properties', 'Salary, other sources']
    };
  }

  // No business income → ITR-1 vs ITR-2.
  const needsITR2 =
    a.isHUF || a.hasCapitalGains || a.multipleHouseProperties || a.incomeAbove50L || a.foreignAssetsOrIncome;

  if (needsITR2) {
    return {
      form: 'ITR-2',
      why: a.isHUF
        ? 'HUFs cannot use ITR-1; with no business income, ITR-2 applies.'
        : 'Capital gains, more than one house property, foreign assets, or income above ₹50L push you beyond ITR-1.',
      claimable: [
        'Salary/pension',
        'Capital gains',
        'Multiple house properties',
        'Foreign income/assets',
        'Other sources'
      ]
    };
  }

  return {
    form: 'ITR-1 (Sahaj)',
    why: 'Resident individual with salary/pension, one house property and other sources, total income up to ₹50L.',
    claimable: [
      'Salary/pension',
      'One house property',
      'Interest & other sources',
      'Chapter VI-A deductions (old regime)'
    ]
  };
}

/** ITR-5 is out of scope for individuals — surfaced as awareness. */
export const ITR5_NOTE = 'ITR-5 is for firms, LLPs, AOPs and BOIs — not individuals or HUFs.';

/** When a taxpayer can file under a HUF (awareness, not advice). */
export const HUF_ELIGIBILITY: { title: string; points: string[]; benefit: string } = {
  title: 'Can you file under a HUF?',
  points: [
    'A HUF (Hindu Undivided Family — also Jain/Sikh/Buddhist) forms automatically from a common ancestor; a married couple is enough to start one.',
    'It needs its own PAN and its own income — ancestral property, a family business, or assets/gifts given to the HUF (transferring your own salary in triggers clubbing and saves nothing).',
    'The Karta (head of family) files and signs; the HUF uses ITR-2 (no business) or ITR-3 (business) — never ITR-1.'
  ],
  benefit:
    'A HUF gets its own ₹2.5L basic exemption, slabs and 80C/80D limits — so genuine family income is taxed separately from yours.'
};
