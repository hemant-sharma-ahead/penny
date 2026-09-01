import type { InsuranceType, InsurerCategory } from '@/core/db/types';

// Researched insurer picklists (insurance-redesign-v4.html §⑤) — real, currently-operating IRDAI-
// registered insurers, categorized so the Add/Edit form's insurer dropdown can scope itself to the
// selected policy type (life insurers for Term/Life, standalone health insurers for Health, general
// insurers shared by Vehicle/Home/Travel/Other). Not the full IRDAI registry (24 life / ~7 standalone
// health / 26 general as of FY2024-25) — a curated, real subset of the most commonly held policies,
// matching the mockup's "11 life / 8 health / 11 general" scoping. "Other" always remains available as
// an explicit escape hatch (see `insurerMemory.ts`) for anything not listed.

export const LIFE_INSURERS = [
  'LIC (Life Insurance Corporation)',
  'HDFC Life',
  'ICICI Prudential Life',
  'SBI Life',
  'Axis Max Life',
  'Tata AIA Life',
  'Bajaj Allianz Life',
  'Aditya Birla Sun Life',
  'Kotak Mahindra Life',
  'PNB MetLife',
  'Canara HSBC Life'
] as const;

export const HEALTH_INSURERS = [
  'Star Health and Allied Insurance',
  'Niva Bupa Health Insurance',
  'Care Health Insurance',
  'HDFC ERGO General Insurance',
  'ICICI Lombard General Insurance',
  'Aditya Birla Health Insurance',
  'ManipalCigna Health Insurance',
  'Tata AIG General Insurance'
] as const;

export const GENERAL_INSURERS = [
  'HDFC ERGO General Insurance',
  'ICICI Lombard General Insurance',
  'Bajaj Allianz General Insurance',
  'Tata AIG General Insurance',
  'New India Assurance',
  'National Insurance',
  'United India Insurance',
  'Oriental Insurance',
  'Reliance General Insurance',
  'Go Digit General Insurance',
  'SBI General Insurance'
] as const;

/** Which researched picklist a policy type scopes its insurer dropdown to. */
export function insurerCategoryForType(type: InsuranceType): InsurerCategory {
  if (type === 'term' || type === 'life') return 'life';
  if (type === 'health') return 'health';
  return 'general'; // vehicle | home | travel | other
}

const LISTS: Record<InsurerCategory, readonly string[]> = {
  life: LIFE_INSURERS,
  health: HEALTH_INSURERS,
  general: GENERAL_INSURERS
};

/** The researched picklist for a category — always sorted as curated above, "Other" handled separately
 *  by the caller (a trailing, always-present escape hatch, never part of this list itself). */
export function insurersForCategory(category: InsurerCategory): readonly string[] {
  return LISTS[category];
}

export function insurersForType(type: InsuranceType): readonly string[] {
  return insurersForCategory(insurerCategoryForType(type));
}
