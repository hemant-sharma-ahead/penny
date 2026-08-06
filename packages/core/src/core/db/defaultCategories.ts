import type { ExpenseCategory } from './types';

export interface IntentGroupMeta {
  label: string;
  color: string;
  /**
   * Whether this group counts toward "daily-routine" living spend (the main category analytics).
   * `false` marks a group as **set aside** — one-off / support / non-routine spend (travel, family
   * support, legal, financial moves) that is summarised separately so a trip or a lawsuit never
   * distorts the everyday spending picture. Defaults to routine (true) when omitted.
   */
  routine?: boolean;
}

/**
 * Categories whose entire point is a money movement with a specific person — picking one of these
 * makes the Lent/Borrowed person selection mandatory, not just an optional toggle (2026-08-06, explicit
 * user decision). `ExpenseForm.tsx` and bank-import's `BulkCategorizeModal.tsx` both auto-open (and
 * lock open) the Lent/Borrowed panel whenever the selected category is one of these four, instead of
 * leaving it as a manual toggle the user might never open before an otherwise-silent validation
 * failure. `cat-lending`/`cat-return-borrowed` are the expense pair (money going out — a fresh loan you
 * give, or paying back a loan you took); `cat-inc-borrowed`/`cat-collected-money` are the income pair
 * (money coming in — a fresh loan you take, or someone paying back a loan you gave).
 */
export const IOU_MANDATORY_CATEGORY_IDS = new Set<string>([
  'cat-lending',
  'cat-return-borrowed',
  'cat-inc-borrowed',
  'cat-collected-money'
]);

export const INTENT_GROUP_META: Record<string, IntentGroupMeta> = {
  daily_living: { label: 'Daily Living', color: '#ef4444' },
  home_utilities: { label: 'Home & Utilities', color: '#3b82f6' },
  renovation: { label: 'Renovation', color: '#b45309', routine: false },
  health: { label: 'Health', color: '#10b981' },
  financial: { label: 'Financial', color: '#22c55e', routine: false },
  lifestyle: { label: 'Lifestyle', color: '#8b5cf6' },
  sin_goods: { label: 'Sin Goods', color: '#b91c1c' },
  travel: { label: 'Travel', color: '#0ea5e9', routine: false },
  education: { label: 'Education', color: '#6366f1' },
  family_giving: { label: 'Family & Giving', color: '#ec4899', routine: false },
  legal: { label: 'Legal', color: '#475569', routine: false },
  other: { label: 'Other', color: '#6b7280', routine: false },
  income: { label: 'Income', color: '#10b981', routine: false },
  transfers: { label: 'Transfers', color: '#3b82f6', routine: false }
};

/**
 * Whether a spending group belongs in the main "daily-routine" analytics. Known set-aside intent
 * groups (routine === false) are separated out; everything else — routine intent groups AND
 * user-created parent groups (whose key isn't an intent group) — counts as daily routine.
 */
export function isRoutineGroup(groupKey: string): boolean {
  const meta = INTENT_GROUP_META[groupKey];
  return meta ? meta.routine !== false : true;
}

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  // ── Daily Living ─────────────────────────────────────────────────────────────
  {
    id: 'cat-groceries',
    name: 'Groceries',
    icon: 'ti-basket',
    color: '#22c55e',
    isDefault: true,
    intentGroup: 'daily_living',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-food',
    name: 'Dining & Café',
    icon: 'ti-pizza',
    color: '#ef4444',
    isDefault: true,
    intentGroup: 'daily_living',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-transport',
    name: 'Transport',
    icon: 'ti-car',
    color: '#f59e0b',
    isDefault: true,
    intentGroup: 'daily_living',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-fuel',
    name: 'Fuel',
    icon: 'ti-gas-station',
    color: '#f59e0b',
    isDefault: true,
    intentGroup: 'daily_living',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-salon',
    name: 'Salon & Grooming',
    icon: 'ti-scissors',
    color: '#ec4899',
    isDefault: true,
    intentGroup: 'daily_living',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-household',
    name: 'Household Supplies',
    icon: 'ti-home',
    color: '#3b82f6',
    isDefault: true,
    intentGroup: 'daily_living',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-food-drinks',
    name: 'Food & Drinks',
    icon: 'ti-cup',
    color: '#d97706',
    isDefault: true,
    intentGroup: 'daily_living',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Home & Utilities ─────────────────────────────────────────────────────────
  {
    id: 'cat-rent',
    name: 'Rent',
    icon: 'ti-building',
    color: '#6366f1',
    isDefault: true,
    intentGroup: 'home_utilities',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-bills',
    name: 'Bills & Utilities',
    icon: 'ti-receipt',
    color: '#06b6d4',
    isDefault: true,
    intentGroup: 'home_utilities',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-internet',
    name: 'Internet & Phone',
    icon: 'ti-wifi',
    color: '#8b5cf6',
    isDefault: true,
    intentGroup: 'home_utilities',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-maintenance',
    name: 'Maintenance',
    icon: 'ti-tools',
    color: '#78716c',
    isDefault: true,
    intentGroup: 'home_utilities',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-home-services',
    name: 'Home Services',
    icon: 'ti-air-conditioning',
    color: '#06b6d4',
    isDefault: true,
    intentGroup: 'home_utilities',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Renovation ───────────────────────────────────────────────────────────────
  {
    id: 'cat-reno-materials',
    name: 'Materials',
    icon: 'ti-wall',
    color: '#b45309',
    isDefault: true,
    intentGroup: 'renovation',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-reno-labour',
    name: 'Labour & Contractor',
    icon: 'ti-hammer',
    color: '#92400e',
    isDefault: true,
    intentGroup: 'renovation',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-reno-furniture',
    name: 'Furniture',
    icon: 'ti-sofa',
    color: '#a16207',
    isDefault: true,
    intentGroup: 'renovation',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-reno-fixtures',
    name: 'Fixtures & Fittings',
    icon: 'ti-bulb',
    color: '#ca8a04',
    isDefault: true,
    intentGroup: 'renovation',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-reno-painting',
    name: 'Painting',
    icon: 'ti-brush',
    color: '#d97706',
    isDefault: true,
    intentGroup: 'renovation',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-reno-interior',
    name: 'Interior & Design',
    icon: 'ti-ruler-2',
    color: '#c2410c',
    isDefault: true,
    intentGroup: 'renovation',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-reno-appliances',
    name: 'Appliances',
    icon: 'ti-wash-machine',
    color: '#78716c',
    isDefault: true,
    intentGroup: 'renovation',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-reno-other',
    name: 'Other Renovation',
    icon: 'ti-tools',
    color: '#6b7280',
    isDefault: true,
    intentGroup: 'renovation',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Health ───────────────────────────────────────────────────────────────────
  {
    id: 'cat-health',
    name: 'Medical & Pharmacy',
    icon: 'ti-stethoscope',
    color: '#10b981',
    isDefault: true,
    intentGroup: 'health',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-fitness',
    name: 'Fitness & Gym',
    icon: 'ti-barbell',
    color: '#f43f5e',
    isDefault: true,
    intentGroup: 'health',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-personal-care',
    name: 'Personal Care',
    icon: 'ti-sparkles',
    color: '#ec4899',
    isDefault: true,
    intentGroup: 'health',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Financial ────────────────────────────────────────────────────────────────
  {
    id: 'cat-sip',
    name: 'SIP & Investments',
    icon: 'ti-chart-line',
    color: '#10b981',
    isDefault: true,
    intentGroup: 'financial',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-insurance-premium',
    name: 'Insurance Premium',
    icon: 'ti-shield',
    color: '#3b82f6',
    isDefault: true,
    intentGroup: 'financial',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-loan-emi',
    name: 'Loan EMI',
    icon: 'ti-file-invoice',
    color: '#ef4444',
    isDefault: true,
    intentGroup: 'financial',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-savings',
    name: 'Savings Transfer',
    icon: 'ti-pig-money',
    color: '#22c55e',
    isDefault: true,
    intentGroup: 'financial',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Lifestyle ────────────────────────────────────────────────────────────────
  {
    id: 'cat-shopping',
    name: 'Shopping & Apparel',
    icon: 'ti-shopping-bag',
    color: '#8b5cf6',
    isDefault: true,
    intentGroup: 'lifestyle',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-entertainment',
    name: 'Entertainment',
    icon: 'ti-device-tv',
    color: '#ec4899',
    isDefault: true,
    intentGroup: 'lifestyle',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-subscriptions',
    name: 'Subscriptions',
    icon: 'ti-refresh',
    color: '#7c3aed',
    isDefault: true,
    intentGroup: 'lifestyle',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-gifts',
    name: 'Gifts & Presents',
    icon: 'ti-gift',
    color: '#f43f5e',
    isDefault: true,
    intentGroup: 'lifestyle',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Sin Goods ────────────────────────────────────────────────────────────────
  {
    id: 'cat-alcohol',
    name: 'Alcohol',
    icon: 'ti-bottle',
    color: '#b91c1c',
    isDefault: true,
    intentGroup: 'sin_goods',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-tobacco',
    name: 'Tobacco',
    icon: 'ti-flame',
    color: '#7f1d1d',
    isDefault: true,
    intentGroup: 'sin_goods',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Travel ───────────────────────────────────────────────────────────────────
  {
    id: 'cat-flights',
    name: 'Flights & Trains',
    icon: 'ti-plane',
    color: '#0ea5e9',
    isDefault: true,
    intentGroup: 'travel',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-hotels',
    name: 'Hotels & Stay',
    icon: 'ti-bed',
    color: '#6366f1',
    isDefault: true,
    intentGroup: 'travel',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-local-travel',
    name: 'Local Travel',
    icon: 'ti-map-pin',
    color: '#f59e0b',
    isDefault: true,
    intentGroup: 'travel',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-trip-food',
    name: 'Food on Trip',
    icon: 'ti-tools-kitchen-2',
    color: '#ef4444',
    isDefault: true,
    intentGroup: 'travel',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-trip-prep',
    name: 'Trip Prep',
    icon: 'ti-luggage',
    color: '#0ea5e9',
    isDefault: true,
    intentGroup: 'travel',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-trip-shopping',
    name: 'Trip Shopping',
    icon: 'ti-shopping-bag',
    color: '#8b5cf6',
    isDefault: true,
    intentGroup: 'travel',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-trip-fuel',
    name: 'Trip Fuel',
    icon: 'ti-gas-station',
    color: '#0ea5e9',
    isDefault: true,
    intentGroup: 'travel',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-vehicle-service',
    name: 'Vehicle Service',
    icon: 'ti-tools',
    color: '#78716c',
    isDefault: true,
    intentGroup: 'travel',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Education ────────────────────────────────────────────────────────────────
  {
    id: 'cat-tuition',
    name: 'Tuition & Courses',
    icon: 'ti-school',
    color: '#6366f1',
    isDefault: true,
    intentGroup: 'education',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-books',
    name: 'Books & Materials',
    icon: 'ti-book',
    color: '#78716c',
    isDefault: true,
    intentGroup: 'education',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-school-fees',
    name: 'School Fees',
    icon: 'ti-certificate',
    color: '#8b5cf6',
    isDefault: true,
    intentGroup: 'education',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-edu-transport',
    name: 'Transportation Fee',
    icon: 'ti-bus',
    color: '#f59e0b',
    isDefault: true,
    intentGroup: 'education',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-edu-trip',
    name: 'School Trip',
    icon: 'ti-backpack',
    color: '#10b981',
    isDefault: true,
    intentGroup: 'education',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-edu-competition',
    name: 'Competition',
    icon: 'ti-trophy',
    color: '#f97316',
    isDefault: true,
    intentGroup: 'education',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Family & Giving ──────────────────────────────────────────────────────────
  {
    id: 'cat-family-support',
    name: 'Family Support',
    icon: 'ti-heart-handshake',
    color: '#ec4899',
    isDefault: true,
    intentGroup: 'family_giving',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-occasions',
    name: 'Occasions',
    icon: 'ti-confetti',
    color: '#f59e0b',
    isDefault: true,
    intentGroup: 'family_giving',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-religious',
    name: 'Religious & Cultural',
    icon: 'ti-star',
    color: '#f97316',
    isDefault: true,
    intentGroup: 'family_giving',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-charity',
    name: 'Donations',
    icon: 'ti-coin',
    color: '#22c55e',
    isDefault: true,
    intentGroup: 'family_giving',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-family-misc',
    name: 'Miscellaneous',
    icon: 'ti-dots',
    color: '#f9a8d4',
    isDefault: true,
    intentGroup: 'family_giving',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-lending',
    name: 'Lending',
    icon: 'ti-cash-move',
    color: '#db2777',
    isDefault: true,
    intentGroup: 'family_giving',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    // Reverse flow of an existing "Borrowed Money" entry (2026-08-06) — you pay back what you
    // borrowed. Person selection under Lent/Borrowed is mandatory for this category — see
    // `IOU_MANDATORY_CATEGORY_IDS` below.
    id: 'cat-return-borrowed',
    name: 'Return Borrowed',
    icon: 'ti-cash-minus',
    color: '#9333ea',
    isDefault: true,
    intentGroup: 'family_giving',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Legal ────────────────────────────────────────────────────────────────────
  {
    id: 'cat-legal-advocate',
    name: 'Advocate Fee',
    icon: 'ti-gavel',
    color: '#475569',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-court',
    name: 'Court Fee',
    icon: 'ti-building-bank',
    color: '#334155',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-stamp',
    name: 'Stamp Duty',
    icon: 'ti-license',
    color: '#64748b',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-notary',
    name: 'Notary Charges',
    icon: 'ti-stamp',
    color: '#6366f1',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-filing',
    name: 'Filing & Documentation',
    icon: 'ti-files',
    color: '#0ea5e9',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-affidavit',
    name: 'Affidavit Charges',
    icon: 'ti-file-text',
    color: '#8b5cf6',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-typing',
    name: 'Typing & Printing',
    icon: 'ti-printer',
    color: '#78716c',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-exemption',
    name: 'Exemption Fee',
    icon: 'ti-file-certificate',
    color: '#f59e0b',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-transport',
    name: 'Legal Transport',
    icon: 'ti-car',
    color: '#f97316',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-food',
    name: 'Legal Food & Refreshments',
    icon: 'ti-cup',
    color: '#ef4444',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  {
    id: 'cat-legal-misc',
    name: 'Other Legal Fees',
    icon: 'ti-scale',
    color: '#6b7280',
    isDefault: true,
    intentGroup: 'legal',
    applicableTo: 'expense',
    createdAt: 0
  },
  // ── Other ────────────────────────────────────────────────────────────────────
  {
    id: 'cat-other',
    name: 'Other',
    icon: 'ti-dots',
    color: '#6b7280',
    isDefault: true,
    intentGroup: 'other',
    applicableTo: 'expense',
    createdAt: 0
  }
];

export const DEFAULT_INCOME_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'cat-inc-salary',
    name: 'Salary',
    icon: 'ti-briefcase',
    color: '#10b981',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-freelance',
    name: 'Freelance & Business',
    icon: 'ti-building',
    color: '#6366f1',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-rental',
    name: 'Rental Income',
    icon: 'ti-home',
    color: '#8b5cf6',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-dividends',
    name: 'Dividends',
    icon: 'ti-chart-bar',
    color: '#22c55e',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-interest',
    name: 'Interest',
    icon: 'ti-percentage',
    color: '#16a34a',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-capital-gains',
    name: 'Capital Gains',
    icon: 'ti-trending-up',
    color: '#10b981',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-bonus',
    name: 'Bonus & Incentive',
    icon: 'ti-award',
    color: '#f59e0b',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-reimbursement',
    name: 'Reimbursements',
    icon: 'ti-receipt-refund',
    color: '#0ea5e9',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-cashback',
    name: 'Cashback & Refund',
    icon: 'ti-coins',
    color: '#f59e0b',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-gift',
    name: 'Gift Received',
    icon: 'ti-gift',
    color: '#ec4899',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-borrowed',
    name: 'Borrowed Money',
    icon: 'ti-cash-move-back',
    color: '#a855f7',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    // Reverse flow of an existing "Lending" entry (2026-08-06) — someone pays back what you lent
    // them. Person selection under Lent/Borrowed is mandatory for this category — see
    // `IOU_MANDATORY_CATEGORY_IDS` below.
    id: 'cat-collected-money',
    name: 'Collected Money',
    icon: 'ti-receipt-refund',
    color: '#ec4899',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-cash',
    name: 'Cash Income',
    icon: 'ti-cash',
    color: '#84cc16',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  },
  {
    id: 'cat-inc-other',
    name: 'Other Income',
    icon: 'ti-dots',
    color: '#6b7280',
    isDefault: true,
    intentGroup: 'income',
    applicableTo: 'income',
    createdAt: 0
  }
];

export const DEFAULT_TRANSFER_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'cat-tr-bank',
    name: 'Bank Transfer',
    icon: 'ti-arrows-exchange',
    color: '#3b82f6',
    isDefault: true,
    intentGroup: 'transfers',
    applicableTo: 'transfer',
    createdAt: 0
  },
  {
    id: 'cat-tr-wallet',
    name: 'Wallet Top-up',
    icon: 'ti-wallet',
    color: '#8b5cf6',
    isDefault: true,
    intentGroup: 'transfers',
    applicableTo: 'transfer',
    createdAt: 0
  },
  {
    id: 'cat-tr-cc-payment',
    name: 'Credit Card Payment',
    icon: 'ti-credit-card',
    color: '#ef4444',
    isDefault: true,
    intentGroup: 'transfers',
    applicableTo: 'transfer',
    createdAt: 0
  },
  {
    id: 'cat-tr-investment',
    name: 'Investment Transfer',
    icon: 'ti-chart-line',
    color: '#10b981',
    isDefault: true,
    intentGroup: 'transfers',
    applicableTo: 'transfer',
    createdAt: 0
  },
  {
    id: 'cat-tr-other',
    name: 'Other Transfer',
    icon: 'ti-dots',
    color: '#6b7280',
    isDefault: true,
    intentGroup: 'transfers',
    applicableTo: 'transfer',
    createdAt: 0
  }
];

export const ALL_DEFAULT_CATEGORIES: ExpenseCategory[] = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
  ...DEFAULT_TRANSFER_CATEGORIES
];

// Maps lowercased import category names → our category IDs.
// Used by Cashew and MoneyView parsers in step 46.
export const CATEGORY_MIGRATION_MAP: Record<string, string> = {
  // Food & dining
  'food & dining': 'cat-food',
  'food and dining': 'cat-food',
  'food & beverages': 'cat-food',
  dining: 'cat-food',
  'dining & café': 'cat-food',
  'dining & cafe': 'cat-food',
  restaurant: 'cat-food',
  cafe: 'cat-food',
  food: 'cat-food',
  beverages: 'cat-food',
  groceries: 'cat-groceries',
  grocery: 'cat-groceries',
  supermarket: 'cat-groceries',
  // Transport
  transport: 'cat-transport',
  transportation: 'cat-transport',
  fuel: 'cat-fuel',
  petrol: 'cat-fuel',
  diesel: 'cat-fuel',
  commute: 'cat-transport',
  'auto & transport': 'cat-transport',
  auto: 'cat-transport',
  cab: 'cat-transport',
  // Home
  rent: 'cat-rent',
  bills: 'cat-bills',
  'bills & utilities': 'cat-bills',
  utilities: 'cat-bills',
  electricity: 'cat-bills',
  water: 'cat-bills',
  gas: 'cat-bills',
  household: 'cat-household',
  'household supplies': 'cat-household',
  maintenance: 'cat-maintenance',
  'home maintenance': 'cat-maintenance',
  internet: 'cat-internet',
  phone: 'cat-internet',
  mobile: 'cat-internet',
  'internet & phone': 'cat-internet',
  // Health
  health: 'cat-health',
  medical: 'cat-health',
  healthcare: 'cat-health',
  pharmacy: 'cat-health',
  'health & fitness': 'cat-fitness',
  fitness: 'cat-fitness',
  gym: 'cat-fitness',
  'personal care': 'cat-personal-care',
  salon: 'cat-salon',
  haircut: 'cat-salon',
  barber: 'cat-salon',
  spa: 'cat-salon',
  'home services': 'cat-home-services',
  'home service': 'cat-home-services',
  'ac service': 'cat-home-services',
  'pest control': 'cat-home-services',
  plumber: 'cat-home-services',
  electrician: 'cat-home-services',
  renovation: 'cat-reno-other',
  remodeling: 'cat-reno-other',
  'renovation materials': 'cat-reno-materials',
  contractor: 'cat-reno-labour',
  furniture: 'cat-reno-furniture',
  painting: 'cat-reno-painting',
  interior: 'cat-reno-interior',
  beauty: 'cat-personal-care',
  grooming: 'cat-personal-care',
  // Financial
  investment: 'cat-sip',
  investments: 'cat-sip',
  'mutual fund': 'cat-sip',
  sip: 'cat-sip',
  stocks: 'cat-sip',
  insurance: 'cat-insurance-premium',
  'insurance premium': 'cat-insurance-premium',
  emi: 'cat-loan-emi',
  loan: 'cat-loan-emi',
  'loan emi': 'cat-loan-emi',
  savings: 'cat-savings',
  // Lifestyle
  shopping: 'cat-shopping',
  apparel: 'cat-shopping',
  clothing: 'cat-shopping',
  fashion: 'cat-shopping',
  entertainment: 'cat-entertainment',
  movies: 'cat-entertainment',
  gaming: 'cat-entertainment',
  subscriptions: 'cat-subscriptions',
  subscription: 'cat-subscriptions',
  gifts: 'cat-gifts',
  'gifts & donations': 'cat-gifts',
  // Sin goods
  alcohol: 'cat-alcohol',
  liquor: 'cat-alcohol',
  beer: 'cat-alcohol',
  wine: 'cat-alcohol',
  spirits: 'cat-alcohol',
  'bar & alcohol': 'cat-alcohol',
  tobacco: 'cat-tobacco',
  cigarette: 'cat-tobacco',
  cigarettes: 'cat-tobacco',
  smoking: 'cat-tobacco',
  // Travel
  travel: 'cat-flights',
  flights: 'cat-flights',
  trains: 'cat-flights',
  bus: 'cat-local-travel',
  hotel: 'cat-hotels',
  hotels: 'cat-hotels',
  accommodation: 'cat-hotels',
  stay: 'cat-hotels',
  'local travel': 'cat-local-travel',
  'trip prep': 'cat-trip-prep',
  'trip shopping': 'cat-trip-shopping',
  'trip food': 'cat-trip-food',
  'vehicle service': 'cat-vehicle-service',
  'bike service': 'cat-vehicle-service',
  'car service': 'cat-vehicle-service',
  servicing: 'cat-vehicle-service',
  // Education
  education: 'cat-tuition',
  tuition: 'cat-tuition',
  courses: 'cat-tuition',
  books: 'cat-books',
  school: 'cat-school-fees',
  'school fees': 'cat-school-fees',
  'transportation fee': 'cat-edu-transport',
  'transport fee': 'cat-edu-transport',
  'school trip': 'cat-edu-trip',
  competition: 'cat-edu-competition',
  // Family & Giving
  family: 'cat-family-support',
  'family support': 'cat-family-support',
  charity: 'cat-charity',
  donation: 'cat-charity',
  donations: 'cat-charity',
  occasions: 'cat-occasions',
  'gifts & occasions': 'cat-occasions',
  // Legal
  legal: 'cat-legal-misc',
  'legal fees': 'cat-legal-misc',
  advocate: 'cat-legal-advocate',
  'advocate fee': 'cat-legal-advocate',
  lawyer: 'cat-legal-advocate',
  'lawyer fee': 'cat-legal-advocate',
  'court fee': 'cat-legal-court',
  court: 'cat-legal-court',
  'stamp duty': 'cat-legal-stamp',
  stamp: 'cat-legal-stamp',
  notary: 'cat-legal-notary',
  affidavit: 'cat-legal-affidavit',
  'typing & printing': 'cat-legal-typing',
  printing: 'cat-legal-typing',
  'exemption fee': 'cat-legal-exemption',
  // Income
  salary: 'cat-inc-salary',
  income: 'cat-inc-other',
  business: 'cat-inc-freelance',
  freelance: 'cat-inc-freelance',
  rental: 'cat-inc-rental',
  dividends: 'cat-inc-dividends',
  interest: 'cat-inc-interest',
  'capital gains': 'cat-inc-capital-gains',
  ltcg: 'cat-inc-capital-gains',
  stcg: 'cat-inc-capital-gains',
  bonus: 'cat-inc-bonus',
  incentive: 'cat-inc-bonus',
  cashback: 'cat-inc-cashback',
  refund: 'cat-inc-cashback',
  reimbursement: 'cat-inc-reimbursement',
  reimbursements: 'cat-inc-reimbursement',
  // Transfers
  transfer: 'cat-tr-bank',
  'bank transfer': 'cat-tr-bank',
  'credit card payment': 'cat-tr-cc-payment',
  'cc payment': 'cat-tr-cc-payment',
  // Fallback
  others: 'cat-other',
  other: 'cat-other',
  miscellaneous: 'cat-other',
  misc: 'cat-other'
};
