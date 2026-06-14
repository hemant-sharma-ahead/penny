import type {
  Asset,
  Budget,
  ChipInsight,
  Expense,
  ExpenseCategory,
  Goal,
  GoalContribution,
  Holding,
  InsurancePolicy,
  Liability,
  PersonalIou,
  Subscription
} from './types';
import {
  assetsRepo,
  budgetsRepo,
  chipInsightsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  goalContributionsRepo,
  goalsRepo,
  holdingsRepo,
  insurancePoliciesRepo,
  liabilitiesRepo,
  personalIousRepo,
  subscriptionsRepo
} from './repositories';
import { db } from './schema';

export const DEMO_SEED_KEY = 'penny_demo_seeded';
export const isDemoSeeded = () => localStorage.getItem(DEMO_SEED_KEY) === '1';

export async function seedDemoData(): Promise<void> {
  if (isDemoSeeded()) return;

  const now = Date.now();
  const DAY = 86_400_000;
  const ago = (d: number) => now - d * DAY;
  const from = (d: number) => now + d * DAY;

  // ── Expense categories ─────────────────────────────────────────────────────
  const cats: Record<string, ExpenseCategory> = {
    groceries: {
      id: 'demo-cat-groceries',
      name: 'Groceries',
      icon: 'ti-shopping-cart',
      color: '#10b981',
      isDefault: true,
      intentGroup: 'daily_living',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    dining: {
      id: 'demo-cat-dining',
      name: 'Dining & Café',
      icon: 'ti-coffee',
      color: '#f59e0b',
      isDefault: true,
      intentGroup: 'daily_living',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    transport: {
      id: 'demo-cat-transport',
      name: 'Transport',
      icon: 'ti-car',
      color: '#3b82f6',
      isDefault: true,
      intentGroup: 'daily_living',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    utilities: {
      id: 'demo-cat-utilities',
      name: 'Utilities',
      icon: 'ti-bolt',
      color: '#6366f1',
      isDefault: true,
      intentGroup: 'home_utilities',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    rent: {
      id: 'demo-cat-rent',
      name: 'Rent',
      icon: 'ti-home',
      color: '#ec4899',
      isDefault: true,
      intentGroup: 'home_utilities',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    medical: {
      id: 'demo-cat-medical',
      name: 'Medical',
      icon: 'ti-heart-plus',
      color: '#ef4444',
      isDefault: true,
      intentGroup: 'health',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    shopping: {
      id: 'demo-cat-shopping',
      name: 'Shopping',
      icon: 'ti-shirt',
      color: '#8b5cf6',
      isDefault: true,
      intentGroup: 'lifestyle',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    entertainment: {
      id: 'demo-cat-entertainment',
      name: 'Entertainment',
      icon: 'ti-device-tv',
      color: '#f97316',
      isDefault: true,
      intentGroup: 'lifestyle',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    investments: {
      id: 'demo-cat-investments',
      name: 'Investments',
      icon: 'ti-chart-line',
      color: '#00a86b',
      isDefault: true,
      intentGroup: 'financial',
      applicableTo: 'expense',
      createdAt: ago(90)
    },
    other: {
      id: 'demo-cat-other',
      name: 'Other',
      icon: 'ti-dots-circle-horizontal',
      color: '#94a3b8',
      isDefault: true,
      intentGroup: 'other',
      applicableTo: 'expense',
      createdAt: ago(90)
    }
  };
  await Promise.all(Object.values(cats).map((c) => expenseCategoriesRepo.put(c)));

  const catId = (key: keyof typeof cats): string => {
    const cat = cats[key];
    if (!cat) throw new Error(`Unknown category key: ${key}`);
    return cat.id;
  };

  // ── Expenses ───────────────────────────────────────────────────────────────
  const exp = (
    daysAgo: number,
    amount: number,
    catKey: keyof typeof cats,
    description: string,
    hashtags: string[] = [],
    extra?: Partial<Expense>
  ): Expense => ({
    id: crypto.randomUUID(),
    amount,
    categoryId: catId(catKey),
    description,
    date: ago(daysAgo),
    hashtags: ['sample', ...hashtags],
    isRecurring: false,
    createdAt: ago(daysAgo),
    updatedAt: ago(daysAgo),
    ...extra
  });

  const expenses: Expense[] = [
    // ── April 2026 (75–45 days ago) ──
    exp(75, 22000, 'rent', 'Monthly rent — April', ['emi'], { isRecurring: true, recurringIntervalDays: 30 }),
    exp(73, 1800, 'utilities', 'Electricity bill — April', []),
    exp(72, 5500, 'groceries', 'Big Bazaar monthly grocery run', []),
    exp(70, 1200, 'dining', 'Lunch at office café', []),
    exp(69, 800, 'transport', 'Ola rides — week 1', []),
    exp(67, 3200, 'groceries', 'Zepto & Blinkit top-ups', []),
    exp(65, 649, 'entertainment', 'Netflix subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(65, 119, 'entertainment', 'Spotify subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(65, 999, 'other', 'Cult.fit gym membership', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(63, 1200, 'medical', 'Pharmacy — vitamins & prescription', []),
    exp(61, 2100, 'dining', 'Team dinner at Social', []),
    exp(58, 4500, 'shopping', 'Myntra — kurtas & casuals', []),

    // ── May 2026 (44–15 days ago) ──
    exp(44, 22000, 'rent', 'Monthly rent — May', ['emi'], { isRecurring: true, recurringIntervalDays: 30 }),
    exp(43, 2100, 'utilities', 'Electricity + internet bill', []),
    exp(41, 6200, 'groceries', 'Supermart monthly stock-up', []),
    exp(40, 1499, 'shopping', 'Amazon Prime annual renewal', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 365
    }),
    exp(38, 2800, 'groceries', "Blinkit + Nature's Basket", []),
    exp(37, 4800, 'dining', 'Birthday dinner at Trèsind', []),
    exp(36, 2100, 'transport', 'Uber + metro recharge', []),
    exp(34, 649, 'entertainment', 'Netflix subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(34, 119, 'entertainment', 'Spotify subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(34, 999, 'other', 'Cult.fit gym membership', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(32, 5000, 'investments', 'PPFCF SIP — May instalment', ['sip', 'tax'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(30, 6800, 'shopping', 'Amazon sale — shoes & bags', []),
    exp(28, 3200, 'entertainment', 'Movie tickets + BookMyShow', []),
    exp(25, 800, 'medical', 'Apollo pharmacy', []),
    exp(22, 1800, 'dining', 'Swiggy weekend orders', []),
    exp(18, 1400, 'transport', 'Ola & auto fares', []),

    // ── June 2026 current month ──
    exp(13, 22000, 'rent', 'Monthly rent — June', ['emi'], { isRecurring: true, recurringIntervalDays: 30 }),
    exp(12, 1950, 'utilities', 'Electricity bill — June', []),
    exp(11, 2800, 'groceries', 'Zepto + local kirana', []),
    exp(10, 1200, 'dining', 'Lunch with colleague', []),

    // Leh Ladakh trip (June 4–9)
    exp(9, 18500, 'transport', 'IndiGo flights — DEL-IXL return', ['leh-ladakh', 'vacation']),
    exp(8, 12000, 'other', 'Zostel Leh — 4 nights', ['leh-ladakh', 'vacation']),
    exp(7, 3500, 'transport', 'Shared taxi — Leh-Nubra-Pangong', ['leh-ladakh', 'vacation']),
    exp(7, 4200, 'dining', 'Meals & cafés during trip', ['leh-ladakh', 'vacation']),
    exp(6, 2800, 'entertainment', 'Rafting, Khardung La permit & activities', ['leh-ladakh', 'vacation']),

    exp(5, 649, 'entertainment', 'Netflix subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(5, 119, 'entertainment', 'Spotify subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(5, 999, 'other', 'Cult.fit gym membership', ['subscription'], { isRecurring: true, recurringIntervalDays: 30 }),
    exp(4, 5000, 'investments', 'PPFCF SIP — June instalment', ['sip', 'tax'], {
      isRecurring: true,
      recurringIntervalDays: 30
    }),
    exp(3, 1900, 'groceries', 'Blinkit top-up post trip', []),
    exp(2, 2300, 'dining', 'Team lunch — catching up post vacation', []),
    exp(1, 700, 'transport', 'Uber to office', [])
  ];
  await Promise.all(expenses.map((e) => expensesRepo.put(e)));

  // ── Budgets (current month) ─────────────────────────────────────────────────
  const monthYear = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const budgets: Budget[] = [
    {
      id: 'demo-budget-groceries',
      categoryId: catId('groceries'),
      monthYear,
      limitAmount: 6000,
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    {
      id: 'demo-budget-dining',
      categoryId: catId('dining'),
      monthYear,
      limitAmount: 3500,
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    {
      id: 'demo-budget-transport',
      categoryId: catId('transport'),
      monthYear,
      limitAmount: 3000,
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    {
      id: 'demo-budget-entertainment',
      categoryId: catId('entertainment'),
      monthYear,
      limitAmount: 3000,
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    {
      id: 'demo-budget-shopping',
      categoryId: catId('shopping'),
      monthYear,
      limitAmount: 4000,
      createdAt: ago(5),
      updatedAt: ago(5)
    }
  ];
  await Promise.all(budgets.map((b) => budgetsRepo.put(b)));

  // ── Holdings ────────────────────────────────────────────────────────────────
  const holdings: Holding[] = [
    {
      id: 'demo-holding-mf',
      assetClass: 'mf',
      name: 'Parag Parikh Flexi Cap Fund — Direct Growth',
      schemeCode: '122639',
      units: 312.45,
      avgCostPrice: 160.02,
      currentPrice: 198.42,
      investedAmount: 50000,
      currentValue: 62008,
      createdAt: ago(180),
      updatedAt: ago(1)
    },
    {
      id: 'demo-holding-stock',
      assetClass: 'stock',
      name: 'Infosys Ltd',
      symbol: 'INFY.NS',
      units: 10,
      avgCostPrice: 1420,
      currentPrice: 1558,
      investedAmount: 14200,
      currentValue: 15580,
      createdAt: ago(120),
      updatedAt: ago(1)
    },
    {
      id: 'demo-holding-fd',
      assetClass: 'fd',
      name: 'SBI Fixed Deposit',
      investedAmount: 100000,
      currentValue: 107500,
      interestRate: 7.5,
      maturityDate: from(180),
      createdAt: ago(185),
      updatedAt: ago(1)
    },
    {
      id: 'demo-holding-gold',
      assetClass: 'gold',
      name: '24K Gold — 5g',
      units: 5,
      avgCostPrice: 5500,
      currentPrice: 7200,
      investedAmount: 27500,
      currentValue: 36000,
      createdAt: ago(365),
      updatedAt: ago(1)
    }
  ];
  await Promise.all(holdings.map((h) => holdingsRepo.put(h)));

  // ── Goals ────────────────────────────────────────────────────────────────────
  const goals: Goal[] = [
    {
      id: 'demo-goal-emergency',
      name: 'Emergency Fund',
      targetAmount: 300000,
      currentAmount: 120000,
      targetDate: from(365),
      risk: 'conservative',
      icon: 'ti-shield',
      notes: '#sample',
      createdAt: ago(200),
      updatedAt: ago(10)
    },
    {
      id: 'demo-goal-europe',
      name: 'Europe Trip',
      targetAmount: 200000,
      currentAmount: 30000,
      targetDate: from(540),
      risk: 'moderate',
      sipAmount: 5000,
      icon: 'ti-plane',
      notes: '#sample',
      createdAt: ago(90),
      updatedAt: ago(5)
    },
    {
      id: 'demo-goal-home',
      name: 'Home Down Payment',
      targetAmount: 2500000,
      currentAmount: 1700000,
      targetDate: from(720),
      risk: 'aggressive',
      sipAmount: 25000,
      icon: 'ti-building',
      notes: '#sample',
      createdAt: ago(730),
      updatedAt: ago(30)
    }
  ];
  await Promise.all(goals.map((g) => goalsRepo.put(g)));

  // Goal contributions (a few for each goal)
  const goalContributions: GoalContribution[] = [
    { id: 'demo-gc-1', goalId: 'demo-goal-emergency', amount: 10000, date: ago(60), createdAt: ago(60) },
    { id: 'demo-gc-2', goalId: 'demo-goal-emergency', amount: 10000, date: ago(30), createdAt: ago(30) },
    { id: 'demo-gc-3', goalId: 'demo-goal-europe', amount: 5000, date: ago(60), createdAt: ago(60) },
    { id: 'demo-gc-4', goalId: 'demo-goal-europe', amount: 5000, date: ago(30), createdAt: ago(30) },
    { id: 'demo-gc-5', goalId: 'demo-goal-home', amount: 25000, date: ago(60), createdAt: ago(60) },
    { id: 'demo-gc-6', goalId: 'demo-goal-home', amount: 25000, date: ago(30), createdAt: ago(30) }
  ];
  await Promise.all(goalContributions.map((gc) => goalContributionsRepo.put(gc)));

  // ── Insurance ────────────────────────────────────────────────────────────────
  const insurance: InsurancePolicy[] = [
    {
      id: 'demo-ins-term',
      type: 'term',
      insurer: 'HDFC Life',
      coverageAmount: 10000000,
      annualPremium: 18500,
      renewalDate: from(90),
      notes: '#sample',
      createdAt: ago(365),
      updatedAt: ago(1)
    },
    {
      id: 'demo-ins-health',
      type: 'health',
      insurer: 'Star Health',
      coverageAmount: 500000,
      annualPremium: 14200,
      renewalDate: from(240),
      sumInsured: 500000,
      notes: '#sample',
      createdAt: ago(300),
      updatedAt: ago(1)
    }
  ];
  await Promise.all(insurance.map((p) => insurancePoliciesRepo.put(p)));

  // ── Subscriptions ─────────────────────────────────────────────────────────
  const subscriptions: Subscription[] = [
    {
      id: 'demo-sub-netflix',
      merchantCategory: 'Streaming',
      detectedAmount: 649,
      intervalDays: 30,
      status: 'active',
      lastChargedAt: ago(5),
      confirmedByUser: true,
      createdAt: ago(180),
      updatedAt: ago(5)
    },
    {
      id: 'demo-sub-spotify',
      merchantCategory: 'Music',
      detectedAmount: 119,
      intervalDays: 30,
      status: 'active',
      lastChargedAt: ago(5),
      confirmedByUser: true,
      createdAt: ago(180),
      updatedAt: ago(5)
    },
    {
      id: 'demo-sub-amazon',
      merchantCategory: 'Shopping & Delivery',
      detectedAmount: 1499,
      intervalDays: 365,
      status: 'active',
      lastChargedAt: ago(40),
      confirmedByUser: true,
      createdAt: ago(400),
      updatedAt: ago(40)
    },
    {
      id: 'demo-sub-gym',
      merchantCategory: 'Fitness',
      detectedAmount: 999,
      intervalDays: 30,
      status: 'active',
      lastChargedAt: ago(60),
      confirmedByUser: false,
      createdAt: ago(240),
      updatedAt: ago(60)
    }
  ];
  await Promise.all(subscriptions.map((s) => subscriptionsRepo.put(s)));

  // ── IOUs ──────────────────────────────────────────────────────────────────
  const ious: PersonalIou[] = [
    {
      id: 'demo-iou-1',
      direction: 'lent',
      amount: 3000,
      description: 'Shared grocery run — will settle end of month',
      date: ago(45),
      isSettled: false,
      notes: '#sample',
      createdAt: ago(45),
      updatedAt: ago(45)
    },
    {
      id: 'demo-iou-2',
      direction: 'lent',
      amount: 8500,
      description: 'Emergency — medical bill cover',
      date: ago(8),
      isSettled: false,
      notes: '#sample',
      createdAt: ago(8),
      updatedAt: ago(8)
    },
    {
      id: 'demo-iou-3',
      direction: 'borrowed',
      amount: 2000,
      description: 'Borrowed for cab fare when wallet was empty',
      date: ago(12),
      isSettled: false,
      notes: '#sample',
      createdAt: ago(12),
      updatedAt: ago(12)
    }
  ];
  await Promise.all(ious.map((i) => personalIousRepo.put(i)));

  // ── Assets (for net worth) ────────────────────────────────────────────────
  const assets: Asset[] = [
    {
      id: 'demo-asset-home',
      type: 'real_estate',
      name: '2BHK Apartment — Primary Residence',
      value: 8000000,
      purchaseValue: 6000000,
      purchaseDate: ago(1825),
      notes: '#sample',
      createdAt: ago(1825),
      updatedAt: ago(30)
    },
    {
      id: 'demo-asset-savings',
      type: 'bank_account',
      name: 'HDFC Savings Account',
      value: 250000,
      notes: '#sample',
      createdAt: ago(365),
      updatedAt: ago(1)
    },
    {
      id: 'demo-asset-ppf',
      type: 'ppf',
      name: 'PPF Account — SBI',
      value: 325000,
      purchaseDate: ago(1095),
      notes: '#sample',
      createdAt: ago(1095),
      updatedAt: ago(30)
    }
  ];
  await Promise.all(assets.map((a) => assetsRepo.put(a)));

  // ── Liabilities ───────────────────────────────────────────────────────────
  const liabilities: Liability[] = [
    {
      id: 'demo-liability-homeloan',
      type: 'home_loan',
      name: 'Home Loan — HDFC Bank',
      principalAmount: 6000000,
      outstandingAmount: 4000000,
      interestRate: 8.5,
      emiAmount: 39400,
      emiDueDate: 5,
      startDate: ago(1825),
      endDate: from(5475),
      notes: '#sample',
      createdAt: ago(1825),
      updatedAt: ago(30)
    }
  ];
  await Promise.all(liabilities.map((l) => liabilitiesRepo.put(l)));

  // ── Extra Chip insights ───────────────────────────────────────────────────
  const extraInsights: ChipInsight[] = [
    {
      id: 'demo-insight-budget',
      moduleTag: 'EXPENSES',
      headline: 'Dining budget exceeded by ₹6,300 this month',
      reasoning:
        'Your dining budget is ₹3,500 but spending is ₹9,800 — mainly driven by the Leh Ladakh trip. Excluding travel, regular dining is ₹5,500 which is still ₹2,000 over.',
      consequence: 'At this rate, dining alone will cost ₹1.17L/year — ₹65K more than budgeted.',
      actionLabel: 'Review dining budget',
      isRead: false,
      isMock: true,
      generatedAt: ago(1),
      createdAt: ago(1)
    },
    {
      id: 'demo-insight-gym',
      moduleTag: 'SUBSCRIPTIONS',
      headline: 'Gym subscription unused for 60 days',
      reasoning:
        "Your Cult.fit membership (₹999/mo) has not had any check-ins in the last 60 days. That's ₹1,998 spent without any visits.",
      consequence: 'Pausing or cancelling saves ₹11,988/year.',
      actionLabel: 'Review subscriptions',
      isRead: false,
      isMock: true,
      generatedAt: ago(1),
      createdAt: ago(1)
    }
  ];
  await Promise.all(extraInsights.map((i) => chipInsightsRepo.put(i)));

  // Seed past events so the analytics Events section works out of the box
  const demoPastEvents = [
    {
      id: 'demo-event-leh',
      name: 'Leh Ladakh',
      subtype: 'immersive' as const,
      hashtag: 'leh-ladakh', // matches expense hashtags exactly
      startDate: ago(9), // Jun 5
      endDate: ago(4), // Jun 10 (day after last trip expense)
      autoTag: true,
      color: '#0ea5e9'
    }
  ];
  localStorage.setItem('penny_past_events', JSON.stringify(demoPastEvents));
  // Notify EventModeProvider (already mounted) to re-sync from localStorage
  window.dispatchEvent(new CustomEvent('penny-events-updated'));

  localStorage.setItem(DEMO_SEED_KEY, '1');
}

// Clears all seeded demo data — resets financial tables to empty, keeps profile + security
export async function clearDemoData(): Promise<void> {
  await Promise.all([
    db.expenses.clear(),
    db.expense_categories.clear(),
    db.budgets.clear(),
    db.hashtags.clear(),
    db.holdings.clear(),
    db.goals.clear(),
    db.goal_contributions.clear(),
    db.assets.clear(),
    db.liabilities.clear(),
    db.insurance_policies.clear(),
    db.chip_insights.clear(),
    db.subscriptions.clear(),
    db.personal_ious.clear()
  ]);
  localStorage.removeItem(DEMO_SEED_KEY);
  localStorage.removeItem('penny_past_events');
  localStorage.removeItem('penny_cats_v2');
  window.location.reload();
}
