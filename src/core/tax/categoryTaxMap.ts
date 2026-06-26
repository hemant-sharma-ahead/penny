// Maps spending to an indirect-tax band. Specific default categories map directly; everything
// else falls back to its intent group. The keyword classifier (taxBandClassifier.ts) overrides
// this for fuel/toll/vehicle, which can hide inside a broader category like Transport.

import type { TaxBandId } from './indirectTaxRates';

/** Per default-category band assignment (estimates; consumer prices are tax-inclusive). */
export const CATEGORY_BAND: Record<string, TaxBandId> = {
  // Daily living
  'cat-groceries': 'gst-5', // mix of nil-rated staples + 5/12% packaged → ~5% effective
  'cat-food': 'gst-5', // restaurant GST is 5% (no ITC)
  'cat-transport': 'gst-5', // cabs/autos 5% (fuel/toll split out by the classifier)
  'cat-household': 'gst-18',
  // Home & utilities
  'cat-rent': 'exempt', // residential rent — no GST
  'cat-bills': 'gst-18', // electricity is exempt, but telecom/piped utilities ~18%
  'cat-internet': 'gst-18',
  'cat-maintenance': 'gst-18',
  // Health
  'cat-health': 'gst-5', // medicines 5–12%; consultations exempt → ~5% blended
  'cat-fitness': 'gst-18',
  'cat-personal-care': 'gst-18',
  // Financial (excluded from the spend base — see SPEND_EXCLUDED)
  'cat-sip': 'exempt',
  'cat-insurance-premium': 'insurance', // 18% until GST 2.0, then exempt — handled by the insurance band
  'cat-loan-emi': 'exempt', // interest is exempt; principal isn't consumption
  'cat-savings': 'exempt',
  // Lifestyle
  'cat-shopping': 'gst-18', // apparel/footwear straddle 5/18 post-GST-2.0 → ~18% blended
  'cat-entertainment': 'gst-18',
  'cat-subscriptions': 'gst-18',
  'cat-gifts': 'gst-18',
  // Travel
  'cat-flights': 'gst-5', // economy air travel
  'cat-hotels': 'gst-5', // most room tariffs ≤ ₹7,500 → 5% post-GST-2.0
  'cat-local-travel': 'gst-5',
  'cat-trip-food': 'gst-5',
  // Education — exempt
  'cat-tuition': 'exempt',
  'cat-books': 'exempt',
  'cat-school-fees': 'exempt',
  // Family & giving
  'cat-family-support': 'exempt',
  'cat-occasions': 'gst-18',
  'cat-religious': 'exempt',
  'cat-charity': 'exempt',
  // Sin goods (new categories — Track 7)
  'cat-alcohol': 'alcohol',
  'cat-tobacco': 'tobacco',
  // Other
  'cat-other': 'gst-18'
};

/** Fallback band by intent group, for user-created categories with no explicit mapping. */
export const INTENT_GROUP_BAND: Record<string, TaxBandId> = {
  daily_living: 'gst-5',
  home_utilities: 'gst-18',
  health: 'gst-5',
  financial: 'exempt',
  lifestyle: 'gst-18',
  travel: 'gst-5',
  education: 'exempt',
  family_giving: 'exempt',
  sin_goods: 'alcohol',
  other: 'gst-18'
};

/**
 * Categories that are saving/investing rather than consumption — excluded from the spend base
 * entirely (they shouldn't count as "spend" or attract an indirect-tax estimate).
 */
export const SPEND_EXCLUDED = new Set<string>(['cat-sip', 'cat-savings']);

/** Default band when nothing else matches. */
export const DEFAULT_BAND: TaxBandId = 'gst-18';
