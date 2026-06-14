import type { ExpenseCategory } from './types';

export interface IntentGroupMeta {
  label: string;
  color: string;
}

export const INTENT_GROUP_META: Record<string, IntentGroupMeta> = {
  daily_living: { label: 'Daily Living', color: '#ef4444' },
  home_utilities: { label: 'Home & Utilities', color: '#3b82f6' },
  health: { label: 'Health', color: '#10b981' },
  financial: { label: 'Financial', color: '#22c55e' },
  lifestyle: { label: 'Lifestyle', color: '#8b5cf6' },
  travel: { label: 'Travel', color: '#0ea5e9' },
  education: { label: 'Education', color: '#6366f1' },
  family_giving: { label: 'Family & Giving', color: '#ec4899' },
  other: { label: 'Other', color: '#6b7280' },
  income: { label: 'Income', color: '#10b981' },
  transfers: { label: 'Transfers', color: '#3b82f6' }
};

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
    id: 'cat-household',
    name: 'Household Supplies',
    icon: 'ti-home',
    color: '#3b82f6',
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
    icon: 'ti-piggy-bank',
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
    icon: 'ti-fork',
    color: '#ef4444',
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
    name: 'Dividends & Interest',
    icon: 'ti-chart-bar',
    color: '#22c55e',
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
  fuel: 'cat-transport',
  petrol: 'cat-transport',
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
  // Education
  education: 'cat-tuition',
  tuition: 'cat-tuition',
  courses: 'cat-tuition',
  books: 'cat-books',
  school: 'cat-school-fees',
  'school fees': 'cat-school-fees',
  // Family & Giving
  family: 'cat-family-support',
  'family support': 'cat-family-support',
  charity: 'cat-charity',
  donation: 'cat-charity',
  donations: 'cat-charity',
  occasions: 'cat-occasions',
  'gifts & occasions': 'cat-occasions',
  // Income
  salary: 'cat-inc-salary',
  income: 'cat-inc-other',
  business: 'cat-inc-freelance',
  freelance: 'cat-inc-freelance',
  rental: 'cat-inc-rental',
  dividends: 'cat-inc-dividends',
  interest: 'cat-inc-dividends',
  cashback: 'cat-inc-cashback',
  refund: 'cat-inc-cashback',
  reimbursement: 'cat-inc-cashback',
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
