// Resolves the indirect-tax band for a single expense. Description keywords are checked BEFORE
// the category default, so high-tax items that hide inside a broad category (fuel/toll inside
// Transport, a vehicle purchase logged anywhere) are still caught and taxed correctly.

import type { Expense, ExpenseCategory } from '@/core/db/types';
import type { TaxBandId } from './indirectTaxRates';
import { CATEGORY_BAND, INTENT_GROUP_BAND, DEFAULT_BAND } from './categoryTaxMap';

/** Petrol/diesel — outside GST, ~50% of pump price is tax. */
export const FUEL_KEYWORDS = [
  'petrol',
  'diesel',
  'fuel',
  'iocl',
  'bpcl',
  'hpcl',
  'indian oil',
  'bharat petroleum',
  'hindustan petroleum',
  'hp petrol',
  'shell',
  'nayara',
  'jio-bp',
  'jio bp',
  'fuel station',
  'petrol pump',
  'gas station'
];

/** Highway tolls / FASTag used at a toll plaza. */
export const TOLL_KEYWORDS = ['toll', 'fastag', 'fast tag', 'nhai', 'toll plaza'];

/** One-time vehicle purchase / registration taxes. */
export const VEHICLE_KEYWORDS = [
  'road tax',
  'rto',
  'vehicle registration',
  'car registration',
  'ex-showroom',
  'ex showroom',
  'on-road price',
  'on road price',
  'vehicle purchase',
  'car purchase',
  'bike purchase',
  'two-wheeler',
  'two wheeler'
];

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((k) => haystack.includes(k));
}

/**
 * The band for one expense. Keyword overrides (fuel/toll/vehicle) win over the category default,
 * which in turn wins over the intent-group fallback.
 */
export function classifyTaxBand(
  expense: Pick<Expense, 'description' | 'categoryId'>,
  category?: ExpenseCategory
): TaxBandId {
  const text = (expense.description ?? '').toLowerCase();

  if (text) {
    // Toll first: "toll" is more specific than the generic vehicle/fuel cues.
    if (matchesAny(text, TOLL_KEYWORDS)) return 'toll';
    if (matchesAny(text, VEHICLE_KEYWORDS)) return 'vehicle';
    if (matchesAny(text, FUEL_KEYWORDS)) return 'fuel';
  }

  const byCategory = CATEGORY_BAND[expense.categoryId];
  if (byCategory) return byCategory;

  if (category?.intentGroup) {
    const byGroup = INTENT_GROUP_BAND[category.intentGroup];
    if (byGroup) return byGroup;
  }

  return DEFAULT_BAND;
}
