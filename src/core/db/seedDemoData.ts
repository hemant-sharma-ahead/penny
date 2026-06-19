import type {
  Account,
  Budget,
  ChipInsight,
  EpfEmployer,
  EpfTransaction,
  Expense,
  ExpenseCategory,
  Goal,
  GoalContribution,
  Holding,
  InsurancePolicy,
  Liability,
  PersonalIou,
  PpfTransaction,
  Subscription
} from './types';
import {
  accountsRepo,
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
  const CC = 'demo-acc-hdfc-cc';
  const SAVINGS = 'demo-acc-hdfc-savings';
  const CASH = 'demo-acc-cash';

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
    accountId: SAVINGS,
    createdAt: ago(daysAgo),
    updatedAt: ago(daysAgo),
    ...extra
  });

  const expenses: Expense[] = [
    // ── April 2026 (75–45 days ago) ──
    exp(75, 22000, 'rent', 'Monthly rent — April', ['emi'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: SAVINGS,
      paymentMode: 'net'
    }),
    exp(73, 1800, 'utilities', 'Electricity bill — April', [], { accountId: SAVINGS, paymentMode: 'upi' }),
    exp(72, 5500, 'groceries', 'Big Bazaar monthly grocery run', [], { accountId: CC, paymentMode: 'card' }),
    exp(70, 1200, 'dining', 'Lunch at office café', [], { accountId: CC, paymentMode: 'card' }),
    exp(69, 800, 'transport', 'Ola rides — week 1', [], { accountId: CASH, paymentMode: 'cash' }),
    exp(67, 3200, 'groceries', 'Zepto & Blinkit top-ups', [], { accountId: CC, paymentMode: 'card' }),
    exp(65, 649, 'entertainment', 'Netflix subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(65, 119, 'entertainment', 'Spotify subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(65, 999, 'other', 'Cult.fit gym membership', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(63, 1200, 'medical', 'Pharmacy — vitamins & prescription', [], { accountId: SAVINGS, paymentMode: 'upi' }),
    exp(61, 2100, 'dining', 'Team dinner at Social', [], { accountId: CC, paymentMode: 'card' }),
    exp(58, 4500, 'shopping', 'Myntra — kurtas & casuals', [], { accountId: CC, paymentMode: 'card' }),

    // ── May 2026 (44–15 days ago) ──
    exp(44, 22000, 'rent', 'Monthly rent — May', ['emi'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: SAVINGS,
      paymentMode: 'net'
    }),
    exp(43, 2100, 'utilities', 'Electricity + internet bill', [], { accountId: SAVINGS, paymentMode: 'upi' }),
    exp(41, 6200, 'groceries', 'Supermart monthly stock-up', [], { accountId: CC, paymentMode: 'card' }),
    exp(40, 1499, 'shopping', 'Amazon Prime annual renewal', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 365,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(38, 2800, 'groceries', "Blinkit + Nature's Basket", [], { accountId: CC, paymentMode: 'card' }),
    exp(37, 4800, 'dining', 'Birthday dinner at Trèsind', [], { accountId: CC, paymentMode: 'card' }),
    exp(36, 2100, 'transport', 'Uber + metro recharge', [], { accountId: CASH, paymentMode: 'cash' }),
    exp(34, 649, 'entertainment', 'Netflix subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(34, 119, 'entertainment', 'Spotify subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(34, 999, 'other', 'Cult.fit gym membership', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(32, 5000, 'investments', 'PPFCF SIP — May instalment', ['sip', 'tax'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: SAVINGS,
      paymentMode: 'net'
    }),
    exp(30, 6800, 'shopping', 'Amazon sale — shoes & bags', [], { accountId: CC, paymentMode: 'card' }),
    exp(28, 3200, 'entertainment', 'Movie tickets + BookMyShow', [], { accountId: CC, paymentMode: 'card' }),
    exp(25, 800, 'medical', 'Apollo pharmacy', [], { accountId: CASH, paymentMode: 'cash' }),
    exp(22, 1800, 'dining', 'Swiggy weekend orders', [], { accountId: CC, paymentMode: 'card' }),
    exp(18, 1400, 'transport', 'Ola & auto fares', [], { accountId: CASH, paymentMode: 'cash' }),

    // ── June 2026 current month ──
    exp(13, 22000, 'rent', 'Monthly rent — June', ['emi'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: SAVINGS,
      paymentMode: 'net'
    }),
    exp(12, 1950, 'utilities', 'Electricity bill — June', [], { accountId: SAVINGS, paymentMode: 'upi' }),
    exp(11, 2800, 'groceries', 'Zepto + local kirana', [], { accountId: CC, paymentMode: 'card' }),
    exp(10, 1200, 'dining', 'Lunch with colleague', [], { accountId: CASH, paymentMode: 'cash' }),

    // Leh Ladakh trip (June 4–9)
    exp(9, 18500, 'transport', 'IndiGo flights — DEL-IXL return', ['leh-ladakh', 'vacation'], {
      accountId: SAVINGS,
      paymentMode: 'card'
    }),
    exp(8, 12000, 'other', 'Zostel Leh — 4 nights', ['leh-ladakh', 'vacation'], { accountId: CC, paymentMode: 'card' }),
    exp(7, 3500, 'transport', 'Shared taxi — Leh-Nubra-Pangong', ['leh-ladakh', 'vacation'], {
      accountId: CASH,
      paymentMode: 'cash'
    }),
    exp(7, 4200, 'dining', 'Meals & cafés during trip', ['leh-ladakh', 'vacation'], {
      accountId: CASH,
      paymentMode: 'cash'
    }),
    exp(6, 2800, 'entertainment', 'Rafting, Khardung La permit & activities', ['leh-ladakh', 'vacation'], {
      accountId: CASH,
      paymentMode: 'cash'
    }),

    exp(5, 649, 'entertainment', 'Netflix subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(5, 119, 'entertainment', 'Spotify subscription', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(5, 999, 'other', 'Cult.fit gym membership', ['subscription'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(4, 5000, 'investments', 'PPFCF SIP — June instalment', ['sip', 'tax'], {
      isRecurring: true,
      recurringIntervalDays: 30,
      accountId: SAVINGS,
      paymentMode: 'net'
    }),
    exp(3, 1900, 'groceries', 'Blinkit top-up post trip', [], { accountId: CC, paymentMode: 'card' }),
    exp(2, 2300, 'dining', 'Team lunch — catching up post vacation', [], { accountId: CC, paymentMode: 'card' }),
    exp(1, 700, 'transport', 'Uber to office', [], { accountId: CASH, paymentMode: 'cash' })
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
    },
    {
      id: 'demo-holding-nps',
      assetClass: 'nps',
      name: 'NPS Tier 1 — SBI Pension Funds',
      investedAmount: 360000,
      currentValue: 545000,
      assetMeta: {
        pran: '110123456789',
        tier: 'tier1',
        fundManager: 'SBI Pension Funds',
        monthlyContribution: 3000,
        npsChoiceType: 'auto',
        npsLifecycleFund: 'lc75',
        npsBirthYear: 1990
      },
      lastUpdatedAt: ago(7),
      createdAt: ago(3650),
      updatedAt: ago(7)
    },
    {
      id: 'demo-holding-ppf',
      assetClass: 'ppf',
      name: 'PPF Account — SBI',
      investedAmount: 613324,
      currentValue: 613324,
      assetMeta: {
        ppfOpeningDate: ago(1900),
        ppfBank: 'SBI',
        annualContribution: 100000,
        ppfTransactions: [
          { id: 'ppf-tx-1', type: 'deposit', date: ago(1883), amount: 50000, note: 'Annual contribution FY 2021-22' },
          { id: 'ppf-tx-2', type: 'interest', date: ago(1539), amount: 3200, note: 'Interest credit FY 2021-22' },
          { id: 'ppf-tx-3', type: 'deposit', date: ago(1536), amount: 75000, note: 'Annual contribution FY 2022-23' },
          { id: 'ppf-tx-4', type: 'interest', date: ago(1174), amount: 9100, note: 'Interest credit FY 2022-23' },
          { id: 'ppf-tx-5', type: 'deposit', date: ago(1170), amount: 100000, note: 'Annual contribution FY 2023-24' },
          { id: 'ppf-tx-6', type: 'interest', date: ago(808), amount: 16849, note: 'Interest credit FY 2023-24' },
          { id: 'ppf-tx-7', type: 'deposit', date: ago(805), amount: 100000, note: 'Annual contribution FY 2024-25' },
          { id: 'ppf-tx-8', type: 'interest', date: ago(443), amount: 25145, note: 'Interest credit FY 2024-25' },
          { id: 'ppf-tx-9', type: 'deposit', date: ago(440), amount: 100000, note: 'Annual contribution FY 2025-26' },
          { id: 'ppf-tx-10', type: 'interest', date: ago(78), amount: 34030, note: 'Interest credit FY 2025-26' },
          { id: 'ppf-tx-11', type: 'deposit', date: ago(75), amount: 100000, note: 'Annual contribution FY 2026-27' }
        ] as PpfTransaction[]
      },
      lastUpdatedAt: ago(75),
      createdAt: ago(1900),
      updatedAt: ago(75)
    },
    {
      id: 'demo-holding-epf',
      assetClass: 'epf',
      name: 'EPF Account — TCS',
      investedAmount: 820000,
      currentValue: 820000,
      assetMeta: {
        uan: '100987654321',
        epfBirthYear: 1990,
        epfEmployers: [
          {
            id: 'epf-emp-1',
            companyName: 'Wipro',
            basicSalary: 25000,
            employeeContribPct: 12,
            fromDate: new Date('2016-04-15').getTime(),
            toDate: new Date('2019-03-20').getTime()
          } as EpfEmployer,
          {
            id: 'epf-emp-2',
            companyName: 'Infosys',
            basicSalary: 40000,
            employeeContribPct: 12,
            fromDate: new Date('2019-04-01').getTime(),
            toDate: new Date('2023-09-30').getTime()
          } as EpfEmployer,
          {
            id: 'epf-emp-3',
            companyName: 'TCS',
            basicSalary: 60000,
            employeeContribPct: 12,
            fromDate: new Date('2023-10-01').getTime()
          } as EpfEmployer
        ],
        epfTransactions: [
          // Transfer in when joining TCS
          {
            id: 'epf-tx-1',
            type: 'transfer_in',
            date: ago(975),
            amount: 480000,
            note: 'Transfer from Infosys EPF account'
          } as EpfTransaction,
          // FY 2024-25 interest
          {
            id: 'epf-tx-2',
            type: 'interest',
            date: ago(443),
            amount: 41000,
            note: 'Interest credit FY 2024-25'
          } as EpfTransaction,
          // FY 2025-26 interest
          {
            id: 'epf-tx-3',
            type: 'interest',
            date: ago(78),
            amount: 46200,
            note: 'Interest credit FY 2025-26'
          } as EpfTransaction,
          // Monthly contributions — last 6 months (TCS: Basic ₹60,000 → Emp ₹7,200 + Emplr ₹2,202)
          {
            id: 'epf-tx-4',
            type: 'contribution',
            wagesMonth: '2026-05',
            date: ago(7),
            employeeAmount: 7200,
            employerAmount: 2202,
            pensionAmount: 4998
          } as EpfTransaction,
          {
            id: 'epf-tx-5',
            type: 'contribution',
            wagesMonth: '2026-04',
            date: ago(36),
            employeeAmount: 7200,
            employerAmount: 2202,
            pensionAmount: 4998
          } as EpfTransaction,
          {
            id: 'epf-tx-6',
            type: 'contribution',
            wagesMonth: '2026-03',
            date: ago(67),
            employeeAmount: 7200,
            employerAmount: 2202,
            pensionAmount: 4998
          } as EpfTransaction,
          {
            id: 'epf-tx-7',
            type: 'contribution',
            wagesMonth: '2026-02',
            date: ago(97),
            employeeAmount: 7200,
            employerAmount: 2202,
            pensionAmount: 4998
          } as EpfTransaction,
          {
            id: 'epf-tx-8',
            type: 'contribution',
            wagesMonth: '2026-01',
            date: ago(124),
            employeeAmount: 7200,
            employerAmount: 2202,
            pensionAmount: 4998
          } as EpfTransaction,
          {
            id: 'epf-tx-9',
            type: 'contribution',
            wagesMonth: '2025-12',
            date: ago(154),
            employeeAmount: 7200,
            employerAmount: 2202,
            pensionAmount: 4998
          } as EpfTransaction
        ]
      },
      lastUpdatedAt: ago(7),
      createdAt: new Date('2023-10-01').getTime(),
      updatedAt: ago(7)
    },
    // Vehicle — data as if fetched from vahandetails.com
    {
      id: 'demo-holding-vehicle',
      assetClass: 'vehicle' as const,
      name: 'Maruti Swift VXi',
      investedAmount: 750000,
      currentValue: 580000,
      lastUpdatedAt: ago(105),
      assetMeta: {
        vehicleRegNumber: 'KA03MN5678',
        vehicleMake: 'MARUTI SUZUKI',
        vehicleModel: 'SWIFT VXI',
        vehicleYear: 2021,
        vehicleFuelType: 'PETROL',
        vehicleColor: 'PEARL WHITE',
        vehicleType: 'Four Wheeler',
        vehicleRtoLocation: 'BENGALURU (SOUTH) RTO, Karnataka',
        vehicleRcStatus: 'ACTIVE',
        vehicleRcValidUpto: new Date('2036-06-14').getTime(),
        vehicleInsuranceCompany: 'HDFC ERGO General Insurance Co. Ltd.',
        vehicleInsuranceUpto: new Date('2026-08-20').getTime(),
        vehiclePuccUpto: new Date('2026-12-10').getTime(),
        vehicleFitnessUpto: new Date('2036-06-14').getTime(),
        vehicleRcFetchedAt: ago(105),
        vehicleChallanTotal: 1,
        vehicleChallanPending: 1,
        vehicleChallanPendingAmount: 500,
        vehicleChallanFetchedAt: ago(105)
      },
      createdAt: new Date('2021-06-15').getTime(),
      updatedAt: ago(105)
    },
    // Property
    {
      id: 'demo-holding-property',
      assetClass: 'property' as const,
      name: '2BHK Apartment — Koramangala',
      investedAmount: 6000000,
      currentValue: 8500000,
      lastUpdatedAt: ago(30),
      assetMeta: {
        propertyType: 'flat' as const,
        propertyCity: 'Bengaluru',
        propertyAreaSqft: 1050
      },
      notes: '#sample',
      createdAt: ago(1825),
      updatedAt: ago(30)
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

  // ── Accounts ─────────────────────────────────────────────────────────────
  const accounts: Account[] = [
    {
      id: 'demo-acc-hdfc-savings',
      name: 'HDFC Savings',
      type: 'bank',
      openingBalance: 250000,
      color: '#3b82f6',
      icon: 'ti-building-bank',
      includeInNetWorth: true,
      isArchived: false,
      createdAt: ago(365),
      updatedAt: ago(1)
    },
    {
      id: 'demo-acc-hdfc-cc',
      name: 'HDFC Regalia CC',
      type: 'credit_card',
      openingBalance: 0,
      color: '#ef4444',
      icon: 'ti-credit-card',
      includeInNetWorth: false,
      isArchived: false,
      createdAt: ago(365),
      updatedAt: ago(1)
    },
    {
      id: 'demo-acc-cash',
      name: 'Cash Wallet',
      type: 'cash',
      openingBalance: 5000,
      color: '#10b981',
      icon: 'ti-cash',
      includeInNetWorth: true,
      isArchived: false,
      createdAt: ago(90),
      updatedAt: ago(1)
    }
  ];
  await Promise.all(accounts.map((a) => accountsRepo.put(a)));

  // ── Income transactions ───────────────────────────────────────────────────
  // Salary on the 1st of each of the past 3 months
  const salaryDates = [ago(13), ago(43), ago(74)];
  const incomeExpenses: Expense[] = [
    ...salaryDates.map((d, i) => ({
      id: `demo-income-salary-${i}`,
      amount: 120000,
      categoryId: 'cat-inc-salary',
      description: 'Monthly salary credit',
      date: d,
      hashtags: ['sample'],
      isRecurring: true,
      recurringIntervalDays: 30,
      type: 'income' as const,
      accountId: 'demo-acc-hdfc-savings',
      source: 'manual' as const,
      createdAt: d,
      updatedAt: d
    })),
    {
      id: 'demo-income-freelance',
      amount: 35000,
      categoryId: 'cat-inc-freelance',
      description: 'Website redesign project',
      date: ago(20),
      hashtags: ['sample', 'freelance'],
      isRecurring: false,
      type: 'income' as const,
      accountId: 'demo-acc-hdfc-savings',
      source: 'manual' as const,
      createdAt: ago(20),
      updatedAt: ago(20)
    }
  ];
  await Promise.all(incomeExpenses.map((e) => expensesRepo.put(e)));

  // ── Transfer transactions ─────────────────────────────────────────────────
  const transfers: Expense[] = [
    {
      id: 'demo-transfer-cc-payment',
      amount: 18500,
      categoryId: 'cat-tr-cc-payment',
      description: 'HDFC CC bill payment',
      date: ago(8),
      hashtags: ['sample'],
      isRecurring: false,
      type: 'transfer' as const,
      accountId: 'demo-acc-hdfc-savings',
      toAccountId: 'demo-acc-hdfc-cc',
      source: 'manual' as const,
      createdAt: ago(8),
      updatedAt: ago(8)
    },
    {
      id: 'demo-transfer-savings',
      amount: 20000,
      categoryId: 'cat-tr-bank',
      description: 'Monthly SIP top-up transfer',
      date: ago(12),
      hashtags: ['sample'],
      isRecurring: false,
      type: 'transfer' as const,
      accountId: 'demo-acc-hdfc-savings',
      source: 'manual' as const,
      createdAt: ago(12),
      updatedAt: ago(12)
    }
  ];
  await Promise.all(transfers.map((t) => expensesRepo.put(t)));

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
    db.liabilities.clear(),
    db.insurance_policies.clear(),
    db.chip_insights.clear(),
    db.subscriptions.clear(),
    db.personal_ious.clear(),
    db.accounts.clear()
  ]);
  localStorage.removeItem(DEMO_SEED_KEY);
  localStorage.removeItem('penny_past_events');
  localStorage.removeItem('penny_cats_v2');
  window.location.reload();
}
