import type {
  Account,
  Budget,
  ChipInsight,
  EmploymentType,
  EpfEmployer,
  EpfTransaction,
  Expense,
  Goal,
  GoalContribution,
  Holding,
  InsurancePolicy,
  LedgerEntry,
  Liability,
  Person,
  PpfTransaction,
  Subscription
} from './types';
import {
  accountsRepo,
  activityLogRepo,
  budgetsRepo,
  chipInsightsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  goalContributionsRepo,
  goalsRepo,
  holdingsRepo,
  insurancePoliciesRepo,
  invalidateAllRepositoryCaches,
  ledgerEntriesRepo,
  liabilitiesRepo,
  personsRepo,
  profileRepo,
  subscriptionsRepo
} from './repositories';
import { db } from './schema';
import { ALL_DEFAULT_CATEGORIES } from './defaultCategories';
import { DEMO_CAT_DEFAULT_ID, type DemoCatKey } from './dedupeDemoCategories';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { seedGroupFixtures } from './seedGroupFixtures';
import {
  DEMO_SEED_KEY,
  isDemoSeededSync,
  markDemoSeeded,
  clearDemoSeedMarkers,
  persistDemoPastEvents
} from './seedDemoStorage';

// Re-exported for existing consumers (SettingsPage/ProfilePage import both from here) — the actual
// localStorage/AsyncStorage split lives in `./seedDemoStorage` (see that file's `.native.ts` sibling).
export { DEMO_SEED_KEY };
export const isDemoSeeded = isDemoSeededSync;

/**
 * Persist the "sample data present" marker on the profile too, so it rides the encrypted backup and the
 * "Clear sample data" option survives a restore (the localStorage flag is device-local and isn't restored).
 */
async function setProfileDemoFlag(seeded: boolean): Promise<void> {
  const profile = (await profileRepo.getAll())[0];
  if (profile) await profileRepo.put({ ...profile, demoSeeded: seeded, updatedAt: Date.now() });
}

export async function seedDemoData(employmentType: EmploymentType = 'salaried'): Promise<void> {
  if (isDemoSeeded()) return;

  const persona = PERSONAS[employmentType] ?? PERSONAS.salaried;

  const now = Date.now();
  const DAY = 86_400_000;
  const ago = (d: number) => now - d * DAY;
  const from = (d: number) => now + d * DAY;

  // Multi-year history span (Track 1 closing deliverable): seed continuous data from Jan 2017 → today
  // so cash-flow, net-worth, and tax screens render years of real history and shake out bugs across
  // every screen. The most recent DETAILED_MONTHS are fully detailed; older months carry only the
  // core recurring rows (salary, rent, SIP, bills, staples) — keeps the seed a sane size while still
  // giving genuine multi-year depth.
  const nowYear = new Date(now).getFullYear();
  const nowMonth = new Date(now).getMonth();
  const monthsAgoOf = (ms: number) => {
    const d = new Date(ms);
    return (nowYear - d.getFullYear()) * 12 + (nowMonth - d.getMonth());
  };
  const HISTORY_MONTHS = monthsAgoOf(new Date(2017, 0, 1).getTime()); // ≈ 113 as of mid-2026
  const DETAILED_MONTHS = 12;
  // Older history is cheaper (≈5%/yr inflation): scales a present-day amount back `mb` months.
  const grow = (amount: number, mb: number) => Math.max(1, Math.round(amount * Math.pow(1 / 1.05, mb / 12)));

  // ── Expense categories ─────────────────────────────────────────────────────
  // Reuse the REAL default categories (seeded idempotently by id) instead of a parallel `demo-cat-*`
  // set — otherwise the picker shows every staple twice (Groceries, Rent, Transport…). Demo rows
  // reference default ids through `catId`; the key→default map lives in dedupeDemoCategories.ts.
  await Promise.all(ALL_DEFAULT_CATEGORIES.map((c) => expenseCategoriesRepo.put({ ...c })));

  const catId = (key: DemoCatKey): string => DEMO_CAT_DEFAULT_ID[key];

  // ── Expenses ───────────────────────────────────────────────────────────────
  const CC = 'demo-acc-hdfc-cc';
  const SAVINGS = 'demo-acc-hdfc-savings';
  const CASH = 'demo-acc-cash';

  const exp = (
    daysAgo: number,
    amount: number,
    catKey: DemoCatKey,
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

  // Anchor a transaction to a calendar day in a month `monthsBack` ago.
  const monthAnchor = (monthsBack: number, day: number): number => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - monthsBack, day); // (month, day) sets both — avoids overflow
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  };
  const daysAgoOn = (monthsBack: number, day: number) => Math.round((now - monthAnchor(monthsBack, day)) / DAY);
  const TODAY_DOM = new Date(now).getDate();

  // Scale everyday-spend amounts by persona. Keep all amounts positive & rounded.
  const s = persona.expenseScale;
  const scale = (amount: number) => Math.max(1, Math.round(amount * s));
  const med = persona.medicalScale ?? s; // retired bumps medical specifically
  const scaleMed = (amount: number) => Math.max(1, Math.round(amount * med));

  // ~9 months of continuous, realistic usage (mb = months back; 8 → 0 = current).
  // Recurring series MUST keep a single STABLE description across months so the
  // cash-flow forecaster collapses them into one series (not one per month).
  // Only the CURRENT month's instance is flagged isRecurring (the live series the
  // forecaster projects forward); older months are plain history.
  const expenses: Expense[] = [];
  // Small deterministic month-to-month wobble so totals look organic but stay stable.
  const wobble = (mb: number) => (mb * 137) % 1800;

  for (let mb = HISTORY_MONTHS; mb >= 0; mb--) {
    const recurring = mb === 0 ? { isRecurring: true, recurringIntervalDays: 30 } : {};
    // For the current month, don't seed rows dated in the future.
    const due = (day: number) => mb !== 0 || day <= TODAY_DOM;
    // Older months carry only the core recurring rows + staples; recent months get full detail.
    const detailed = mb < DETAILED_MONTHS;

    // Rent — stable description, recurring on current month only. Omitted for personas without rent.
    if (persona.rent && due(3)) {
      expenses.push(
        exp(daysAgoOn(mb, 3), grow(persona.rent.amount, mb), 'rent', persona.rent.description, ['emi'], {
          accountId: SAVINGS,
          paymentMode: 'net',
          ...recurring
        })
      );
    }
    // SIP — stable description, recurring on current month only. Omitted for personas without a SIP.
    if (persona.sip && due(5)) {
      expenses.push(
        exp(daysAgoOn(mb, 5), persona.sip.amount, 'investments', persona.sip.description, ['sip', 'tax'], {
          accountId: SAVINGS,
          paymentMode: 'net',
          ...recurring
        })
      );
    }
    // Utilities — varies, not recurring.
    if (due(7)) {
      expenses.push(
        exp(daysAgoOn(mb, 7), grow(scale(1800), mb) + (wobble(mb) % 500), 'utilities', 'Electricity & water bill', [], {
          accountId: SAVINGS,
          paymentMode: 'upi'
        })
      );
    }
    // Groceries — monthly staple (kept across all history).
    if (due(9)) {
      expenses.push(
        exp(daysAgoOn(mb, 9), grow(scale(4800), mb) + wobble(mb), 'groceries', 'Monthly grocery run', [], {
          accountId: CC,
          paymentMode: 'card'
        })
      );
    }
    // Dining staple (kept across all history).
    if (due(12)) {
      expenses.push(
        exp(daysAgoOn(mb, 12), grow(scale(1200), mb) + (wobble(mb) % 2600), 'dining', 'Weekend dining out', [], {
          accountId: CC,
          paymentMode: 'card'
        })
      );
    }
    // Monthly ATM cash withdrawal (savings → cash) so the cash account never runs negative — a real
    // person tops up cash before spending it. Sized a little above the monthly cash spend below.
    if (due(16)) {
      expenses.push(
        exp(daysAgoOn(mb, 16), grow(scale(2500), mb), 'other', 'ATM cash withdrawal', [], {
          type: 'transfer',
          accountId: SAVINGS,
          toAccountId: CASH,
          categoryId: 'cat-tr-bank',
          paymentMode: 'net'
        })
      );
    }
    // Transport staple (kept across all history). The wobble must be run through `scale()` too, not
    // added flat — a flat 0-1199 addition is a fixed ₹ amount regardless of persona, so it doesn't
    // shrink for a low-`expenseScale` persona the way the rest of the row does. That mismatch let the
    // Student persona's (`expenseScale` 0.35) wobbled spend (up to ~₹1514) exceed the ATM withdrawal
    // below (~₹875 at that scale) often enough to drive Cash negative — confirmed by simulation
    // (`docs/plans/real-device-testing-pass.md` item 17). Scaling the wobble too keeps its ratio to the
    // withdrawal constant across every persona.
    if (due(15)) {
      expenses.push(
        exp(daysAgoOn(mb, 15), grow(scale(900), mb) + scale(wobble(mb) % 1200), 'transport', 'Cabs & fuel', [], {
          accountId: CASH,
          paymentMode: 'cash'
        })
      );
    }

    if (!detailed) continue; // older months stop here — keeps the multi-year seed a sane size

    // Extra recurring expense (e.g. co-working) — stable description, recurring on current month only.
    if (persona.extraRecurringExpense && due(4)) {
      const e = persona.extraRecurringExpense;
      expenses.push(
        exp(daysAgoOn(mb, 4), e.amount, e.catKey, e.description, [], {
          accountId: SAVINGS,
          paymentMode: 'net',
          ...recurring
        })
      );
    }
    // Subscription history (NOT recurring — the subscriptions store feeds the
    // forecast; these stable-description rows are just history the detector reads).
    for (const sub of persona.subscriptionHistory) {
      if (due(6)) {
        expenses.push(
          exp(daysAgoOn(mb, 6), sub.amount, sub.catKey, sub.description, ['subscription'], {
            accountId: CC,
            paymentMode: 'card'
          })
        );
      }
    }
    if (persona.gymHistory && due(8)) {
      expenses.push(
        exp(daysAgoOn(mb, 8), persona.gymHistory.amount, 'other', persona.gymHistory.description, ['subscription'], {
          accountId: CC,
          paymentMode: 'card'
        })
      );
    }
    // Quick-commerce groceries — second grocery row (recent months only).
    if (due(20)) {
      expenses.push(
        exp(daysAgoOn(mb, 20), scale(2200) + (wobble(mb) % 1200), 'groceries', 'Quick commerce top-ups', [], {
          accountId: CC,
          paymentMode: 'card'
        })
      );
    }
    // Food-delivery dining — second dining row (recent months only).
    if (due(24)) {
      expenses.push(
        exp(daysAgoOn(mb, 24), scale(700) + (wobble(mb) % 900), 'dining', 'Swiggy & Zomato orders', [], {
          accountId: CC,
          paymentMode: 'card'
        })
      );
    }
    // Occasional rows — vary by month so not every month carries them.
    if (mb % 2 === 0 && due(18)) {
      expenses.push(
        exp(daysAgoOn(mb, 18), scale(3500) + (wobble(mb) % 3000), 'shopping', 'Apparel & accessories', [], {
          accountId: CC,
          paymentMode: 'card'
        })
      );
    }
    if (mb % 3 === 0 && due(22)) {
      expenses.push(
        exp(daysAgoOn(mb, 22), scaleMed(800) + (wobble(mb) % 900), 'medical', 'Pharmacy & checkup', [], {
          accountId: SAVINGS,
          paymentMode: 'upi'
        })
      );
    }
    if (mb % 2 === 1 && due(26)) {
      expenses.push(
        exp(daysAgoOn(mb, 26), scale(1200) + (wobble(mb) % 1500), 'entertainment', 'Movies & events', [], {
          accountId: CC,
          paymentMode: 'card'
        })
      );
    }
  }

  // Recurring bills that are currently DUE to log (for the auto-post inbox): the
  // latest occurrence is ~33 days ago with a 30-day cadence, so the next one is
  // overdue and surfaces in the "due to log" inbox until confirmed. Bills vary per persona.
  for (const b of persona.dueBills) {
    expenses.push(
      exp(93, b.amount, 'utilities', b.desc, [], { accountId: SAVINGS, paymentMode: 'upi' }),
      exp(63, b.amount, 'utilities', b.desc, [], { accountId: SAVINGS, paymentMode: 'upi' }),
      exp(33, b.amount, 'utilities', b.desc, [], {
        accountId: SAVINGS,
        paymentMode: 'upi',
        isRecurring: true,
        recurringIntervalDays: 30
      })
    );
  }

  // Leh Ladakh vacation (current month) — explicit ago()-based dates so the
  // demo-event-leh past event (ago 9 → ago 4) keeps matching these rows.
  expenses.push(
    // Pull cash for the trip up front so the trip's cash spends below never drive Cash negative.
    exp(10, scale(12000), 'other', 'ATM withdrawal for trip', ['leh-ladakh', 'vacation'], {
      type: 'transfer',
      accountId: SAVINGS,
      toAccountId: CASH,
      categoryId: 'cat-tr-bank',
      paymentMode: 'net'
    }),
    exp(9, scale(18500), 'transport', 'IndiGo flights — DEL-IXL return', ['leh-ladakh', 'vacation'], {
      accountId: SAVINGS,
      paymentMode: 'card'
    }),
    exp(8, scale(12000), 'other', 'Zostel Leh — 4 nights', ['leh-ladakh', 'vacation'], {
      accountId: CC,
      paymentMode: 'card'
    }),
    exp(7, scale(3500), 'transport', 'Shared taxi — Leh-Nubra-Pangong', ['leh-ladakh', 'vacation'], {
      accountId: CASH,
      paymentMode: 'cash'
    }),
    exp(7, scale(4200), 'dining', 'Meals & cafés during trip', ['leh-ladakh', 'vacation'], {
      accountId: CASH,
      paymentMode: 'cash'
    }),
    exp(6, scale(2800), 'entertainment', 'Rafting, Khardung La permit & activities', ['leh-ladakh', 'vacation'], {
      accountId: CASH,
      paymentMode: 'cash'
    })
  );

  // Amazon Prime annual renewal — one-off, ~1 month ago. NOT recurring.
  if (persona.amazonPrime) {
    expenses.push(
      exp(40, 1499, 'shopping', 'Amazon Prime annual renewal', ['subscription'], {
        accountId: CC,
        paymentMode: 'card'
      })
    );
  }

  await Promise.all(expenses.map((e) => expensesRepo.put(e)));

  // ── Budgets (current month) ─────────────────────────────────────────────────
  const monthYear = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const budgets: Budget[] = [
    {
      id: 'demo-budget-groceries',
      categoryId: catId('groceries'),
      monthYear,
      limitAmount: scale(6000),
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    {
      id: 'demo-budget-dining',
      categoryId: catId('dining'),
      monthYear,
      limitAmount: scale(3500),
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    {
      id: 'demo-budget-transport',
      categoryId: catId('transport'),
      monthYear,
      limitAmount: scale(3000),
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    {
      id: 'demo-budget-entertainment',
      categoryId: catId('entertainment'),
      monthYear,
      limitAmount: scale(3000),
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    {
      id: 'demo-budget-shopping',
      categoryId: catId('shopping'),
      monthYear,
      limitAmount: scale(4000),
      createdAt: ago(5),
      updatedAt: ago(5)
    }
  ];
  await Promise.all(budgets.map((b) => budgetsRepo.put(b)));

  // ── Holdings ────────────────────────────────────────────────────────────────
  const holdings = persona.holdings({ ago, from });
  await Promise.all(holdings.map((h) => holdingsRepo.put(h)));

  // ── Goals ────────────────────────────────────────────────────────────────────
  const goals: Goal[] = [
    {
      id: 'demo-goal-emergency',
      name: 'Emergency Fund',
      targetAmount: 300000,
      // Baseline only — the demo's ₹20,000 in goalContributions below adds to this at display time
      // (2026-08-01 goal-transaction linking; total shown is still ₹1,20,000, unchanged).
      currentAmount: 100000,
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
      // Baseline only — see the Emergency Fund goal's comment above (total shown still ₹30,000).
      currentAmount: 20000,
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
      // Baseline only — see the Emergency Fund goal's comment above (total shown still ₹17,00,000).
      currentAmount: 1650000,
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

  // Goal contributions (a few for each goal) — all 'manual' origin (no linked transaction) since this
  // is historical demo data, not a live expense/income being seeded.
  const goalContributions: GoalContribution[] = [
    {
      id: 'demo-gc-1',
      goalId: 'demo-goal-emergency',
      amount: 10000,
      date: ago(60),
      origin: 'manual',
      createdAt: ago(60),
      updatedAt: ago(60)
    },
    {
      id: 'demo-gc-2',
      goalId: 'demo-goal-emergency',
      amount: 10000,
      date: ago(30),
      origin: 'manual',
      createdAt: ago(30),
      updatedAt: ago(30)
    },
    {
      id: 'demo-gc-3',
      goalId: 'demo-goal-europe',
      amount: 5000,
      date: ago(60),
      origin: 'manual',
      createdAt: ago(60),
      updatedAt: ago(60)
    },
    {
      id: 'demo-gc-4',
      goalId: 'demo-goal-europe',
      amount: 5000,
      date: ago(30),
      origin: 'manual',
      createdAt: ago(30),
      updatedAt: ago(30)
    },
    {
      id: 'demo-gc-5',
      goalId: 'demo-goal-home',
      amount: 25000,
      date: ago(60),
      origin: 'manual',
      createdAt: ago(60),
      updatedAt: ago(60)
    },
    {
      id: 'demo-gc-6',
      goalId: 'demo-goal-home',
      amount: 25000,
      date: ago(30),
      origin: 'manual',
      createdAt: ago(30),
      updatedAt: ago(30)
    }
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
  const subscriptions = persona.subscriptions({ ago });
  await Promise.all(subscriptions.map((sub) => subscriptionsRepo.put(sub)));

  // ── IOUs (person-centric ledger) ────────────────────────────────────────────
  // Showcases every Track-1 surface: owed-to-you, you-owe, settled history,
  // overdue, partial settlement, and an expense-seeded entry ("from expense").
  const ledgerPersons: Person[] = [
    { id: 'demo-person-rohan', name: 'Rohan Mehra', createdAt: ago(60), updatedAt: ago(3) },
    { id: 'demo-person-asha', name: 'Asha Verma', createdAt: ago(40), updatedAt: ago(12) },
    { id: 'demo-person-karthik', name: 'Karthik Rao', createdAt: ago(50), updatedAt: ago(5) },
    { id: 'demo-person-priya', name: 'Priya Nair', createdAt: ago(30), updatedAt: ago(20) },
    // Older relationships with multi-year, fully-settled history.
    { id: 'demo-person-vivek', name: 'Vivek Iyer', createdAt: ago(1400), updatedAt: ago(900) },
    { id: 'demo-person-meera', name: 'Meera Joshi', createdAt: ago(1100), updatedAt: ago(60) }
  ];
  await Promise.all(ledgerPersons.map((p) => personsRepo.put(p)));

  // A demo expense that seeds an IOU entry (renders the "from expense" badge in the ledger).
  const splitExpense: Expense = {
    id: 'demo-exp-iou-dinner',
    amount: 2400,
    categoryId: 'cat-food',
    description: 'Dinner at Toit (split with Rohan)',
    date: ago(6),
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    source: 'manual',
    createdAt: ago(6),
    updatedAt: ago(6)
  };
  await expensesRepo.put(splitExpense);

  const ledgerEntries: LedgerEntry[] = [
    // Rohan — net +₹7,700 owes you (two loans, a part payment, and a split from the dinner expense)
    {
      id: 'demo-le-rohan-1',
      personId: 'demo-person-rohan',
      kind: 'lent',
      amount: 3000,
      date: ago(45),
      description: 'Shared grocery run',
      origin: 'manual',
      createdAt: ago(45),
      updatedAt: ago(45)
    },
    {
      id: 'demo-le-rohan-2',
      personId: 'demo-person-rohan',
      kind: 'lent',
      amount: 8500,
      date: ago(8),
      description: 'Medical bill cover',
      origin: 'manual',
      createdAt: ago(8),
      updatedAt: ago(8)
    },
    {
      id: 'demo-le-rohan-3',
      personId: 'demo-person-rohan',
      kind: 'settlement',
      amount: 5000,
      date: ago(3),
      settleDirection: 'they_paid_you',
      description: 'Part payment',
      origin: 'manual',
      createdAt: ago(3),
      updatedAt: ago(3)
    },
    {
      id: 'demo-le-rohan-4',
      personId: 'demo-person-rohan',
      kind: 'lent',
      amount: 1200,
      date: ago(6),
      description: 'Dinner at Toit (your half)',
      origin: 'expense',
      linkedTxnId: 'demo-exp-iou-dinner',
      createdAt: ago(6),
      updatedAt: ago(6)
    },
    // Asha — you owe ₹2,000
    {
      id: 'demo-le-asha-1',
      personId: 'demo-person-asha',
      kind: 'borrowed',
      amount: 2000,
      date: ago(12),
      description: 'Cab fare when wallet was empty',
      origin: 'manual',
      createdAt: ago(12),
      updatedAt: ago(12)
    },
    // Karthik — settled up (loan fully repaid)
    {
      id: 'demo-le-karthik-1',
      personId: 'demo-person-karthik',
      kind: 'lent',
      amount: 1500,
      date: ago(40),
      description: 'Movie tickets',
      origin: 'manual',
      createdAt: ago(40),
      updatedAt: ago(40)
    },
    {
      id: 'demo-le-karthik-2',
      personId: 'demo-person-karthik',
      kind: 'settlement',
      amount: 1500,
      date: ago(5),
      settleDirection: 'they_paid_you',
      origin: 'manual',
      createdAt: ago(5),
      updatedAt: ago(5)
    },
    // Priya — owes ₹4,000, overdue (due date passed)
    {
      id: 'demo-le-priya-1',
      personId: 'demo-person-priya',
      kind: 'lent',
      amount: 4000,
      date: ago(30),
      dueDate: ago(10),
      description: 'Concert tickets',
      origin: 'manual',
      createdAt: ago(30),
      updatedAt: ago(30)
    },
    // Vivek — old, fully settled (a lend repaid in two parts years ago)
    {
      id: 'demo-le-vivek-1',
      personId: 'demo-person-vivek',
      kind: 'lent',
      amount: 12000,
      date: ago(1380),
      description: 'Bike down-payment help',
      origin: 'manual',
      createdAt: ago(1380),
      updatedAt: ago(1380)
    },
    {
      id: 'demo-le-vivek-2',
      personId: 'demo-person-vivek',
      kind: 'settlement',
      amount: 6000,
      date: ago(1200),
      settleDirection: 'they_paid_you',
      description: 'First instalment',
      origin: 'manual',
      createdAt: ago(1200),
      updatedAt: ago(1200)
    },
    {
      id: 'demo-le-vivek-3',
      personId: 'demo-person-vivek',
      kind: 'settlement',
      amount: 6000,
      date: ago(905),
      settleDirection: 'they_paid_you',
      description: 'Cleared the rest',
      origin: 'manual',
      createdAt: ago(905),
      updatedAt: ago(905)
    },
    // Meera — long-running on-and-off, currently you owe ₹1,500 (borrowed, partly repaid over the years)
    {
      id: 'demo-le-meera-1',
      personId: 'demo-person-meera',
      kind: 'borrowed',
      amount: 5000,
      date: ago(1050),
      description: 'Flight ticket she booked',
      origin: 'manual',
      createdAt: ago(1050),
      updatedAt: ago(1050)
    },
    {
      id: 'demo-le-meera-2',
      personId: 'demo-person-meera',
      kind: 'settlement',
      amount: 3500,
      date: ago(700),
      settleDirection: 'you_paid_them',
      description: 'Paid most of it back',
      origin: 'manual',
      createdAt: ago(700),
      updatedAt: ago(700)
    }
  ];
  await Promise.all(ledgerEntries.map((e) => ledgerEntriesRepo.put(e)));

  // ── Liabilities ───────────────────────────────────────────────────────────
  const liabilities = persona.liabilities({ ago, from });
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
  persistDemoPastEvents(demoPastEvents);

  // Groups & Household OS demo (Track E) — only when the sync feature is enabled for this build.
  // Seeds Family/spouse/closed-trip/ongoing-trip groups + links the Leh & Goa events to their groups.
  if (hasEntitlement('sync')) await seedGroupFixtures(now);

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
      openingBalance: 8000,
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
  const incomeExpenses: Expense[] = persona.income({ monthAnchor, ago, historyMonths: HISTORY_MONTHS });
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

  markDemoSeeded();
  await setProfileDemoFlag(true);
}

// ─── Per-persona configuration ──────────────────────────────────────────────
//
// Drives the parts of the seed that differ by employment type. Income is the
// headline: each persona has a distinct, realistic set of streams. Invariants
// preserved across all personas:
//  1. Recurring series use a single STABLE description across months.
//  2. Only the current month's instance (mb === 0) is flagged isRecurring.
//  3. Subscription-history expense rows are NOT isRecurring (the subscriptions
//     store feeds the forecast — flagging the expenses double-counts).
//  4. A "currently DUE" recurring bill block surfaces in the auto-post inbox.
//  5. Suggestible income repeats monthly with a STABLE description, NOT recurring.

const SAVINGS_ACC = 'demo-acc-hdfc-savings';

interface IncomeCtx {
  monthAnchor: (monthsBack: number, day: number) => number;
  ago: (d: number) => number;
  /** How many months of history to seed (Jan 2017 → today). */
  historyMonths: number;
}

// Net monthly salary credit across the career arc, aligned to the EPF employer history seeded below
// (Wipro → Infosys → TCS). Company 1 hikes each April, company 2 each July, company 3 each April.
const SALARY_ARC: Array<{ from: string; net: number }> = [
  { from: '2017-01', net: 45000 }, // Wipro
  { from: '2017-04', net: 49000 },
  { from: '2018-04', net: 53000 },
  { from: '2019-04', net: 76000 }, // → Infosys (switch bump); July hikes
  { from: '2019-07', net: 82000 },
  { from: '2020-07', net: 89000 },
  { from: '2021-07', net: 97000 },
  { from: '2022-07', net: 106000 },
  { from: '2023-10', net: 110000 }, // → TCS (switch); April hikes
  { from: '2024-04', net: 115000 },
  { from: '2025-04', net: 118000 },
  { from: '2026-04', net: 120000 } // current run-rate — matches the live recurring salary row
];

/** Net monthly salary for the month containing `ms`, per the career arc above. */
function salaryFor(ms: number): number {
  const d = new Date(ms);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  let net = SALARY_ARC[0]?.net ?? 45000;
  for (const seg of SALARY_ARC) {
    if (seg.from <= key) net = seg.net;
    else break;
  }
  return net;
}
interface AssetCtx {
  ago: (d: number) => number;
  from: (d: number) => number;
}
interface SubCtx {
  ago: (d: number) => number;
}

interface PersonaConfig {
  expenseScale: number;
  medicalScale?: number;
  rent?: { amount: number; description: string };
  sip?: { amount: number; description: string };
  extraRecurringExpense?: { amount: number; description: string; catKey: 'utilities' | 'other' };
  subscriptionHistory: Array<{ amount: number; description: string; catKey: 'entertainment' | 'other' }>;
  gymHistory?: { amount: number; description: string };
  amazonPrime: boolean;
  dueBills: Array<{ desc: string; amount: number }>;
  income: (ctx: IncomeCtx) => Expense[];
  holdings: (ctx: AssetCtx) => Holding[];
  liabilities: (ctx: AssetCtx) => Liability[];
  subscriptions: (ctx: SubCtx) => Subscription[];
}

// Helper to build an income row with consistent defaults.
const incomeRow = (
  id: string,
  amount: number,
  categoryId: string,
  description: string,
  date: number,
  opts?: { recurring?: boolean; hashtags?: string[] }
): Expense => ({
  id,
  amount,
  categoryId,
  description,
  date,
  hashtags: ['sample', ...(opts?.hashtags ?? [])],
  isRecurring: opts?.recurring ?? false,
  ...(opts?.recurring ? { recurringIntervalDays: 30 } : {}),
  type: 'income' as const,
  accountId: SAVINGS_ACC,
  source: 'manual' as const,
  createdAt: date,
  updatedAt: date
});

// ── Shared holding builders ──────────────────────────────────────────────────

const ppfHolding = (ago: (d: number) => number, invested: number, value: number): Holding => ({
  id: 'demo-holding-ppf',
  assetClass: 'ppf',
  name: 'PPF Account — SBI',
  investedAmount: invested,
  currentValue: value,
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
});

const npsHolding = (ago: (d: number) => number): Holding => ({
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
});

const epfHolding = (ago: (d: number) => number): Holding => ({
  id: 'demo-holding-epf',
  assetClass: 'epf',
  name: 'EPF Account — TCS',
  investedAmount: 820000,
  currentValue: 820000,
  assetMeta: {
    uan: '100987654321', // pii-ignore: fabricated demo data
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
      {
        id: 'epf-tx-1',
        type: 'transfer_in',
        date: ago(975),
        amount: 480000,
        note: 'Transfer from Infosys EPF account'
      } as EpfTransaction,
      {
        id: 'epf-tx-2',
        type: 'interest',
        date: ago(443),
        amount: 41000,
        note: 'Interest credit FY 2024-25'
      } as EpfTransaction,
      {
        id: 'epf-tx-3',
        type: 'interest',
        date: ago(78),
        amount: 46200,
        note: 'Interest credit FY 2025-26'
      } as EpfTransaction,
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
});

const goldHolding = (ago: (d: number) => number): Holding => ({
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
});

const vehicleHolding = (ago: (d: number) => number): Holding => ({
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
});

const propertyHolding = (ago: (d: number) => number): Holding => ({
  id: 'demo-holding-property',
  assetClass: 'property' as const,
  name: '2BHK Apartment — Koramangala',
  investedAmount: 6000000,
  currentValue: 8500000,
  lastUpdatedAt: ago(30),
  assetMeta: { propertyType: 'flat' as const, propertyCity: 'Bengaluru', propertyAreaSqft: 1050 },
  notes: '#sample',
  createdAt: ago(1825),
  updatedAt: ago(30)
});

const mfHolding = (ago: (d: number) => number, invested: number, value: number): Holding => ({
  id: 'demo-holding-mf',
  assetClass: 'mf',
  name: 'Parag Parikh Flexi Cap Fund — Direct Growth',
  schemeCode: '122639',
  units: Math.round((value / 198.42) * 100) / 100,
  avgCostPrice: 160.02,
  currentPrice: 198.42,
  investedAmount: invested,
  currentValue: value,
  createdAt: ago(180),
  updatedAt: ago(1)
});

const stockHolding = (ago: (d: number) => number): Holding => ({
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
});

const fdHolding = (
  ago: (d: number) => number,
  from: (d: number) => number,
  invested: number,
  value: number
): Holding => ({
  id: 'demo-holding-fd',
  assetClass: 'fd',
  name: 'SBI Fixed Deposit',
  investedAmount: invested,
  currentValue: value,
  interestRate: 7.5,
  maturityDate: from(180),
  createdAt: ago(185),
  updatedAt: ago(1)
});

const homeLoanLiability = (ago: (d: number) => number, from: (d: number) => number): Liability => ({
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
});

const PERSONAS: Record<EmploymentType, PersonaConfig> = {
  // ── Salaried ────────────────────────────────────────────────────────────────
  salaried: {
    expenseScale: 1.0,
    rent: { amount: 22000, description: 'Monthly rent' },
    sip: { amount: 5000, description: 'Parag Parikh Flexi Cap SIP' },
    subscriptionHistory: [
      { amount: 649, description: 'Netflix subscription', catKey: 'entertainment' },
      { amount: 119, description: 'Spotify subscription', catKey: 'entertainment' }
    ],
    gymHistory: { amount: 999, description: 'Cult.fit gym membership' },
    amazonPrime: true,
    dueBills: [
      { desc: 'Mobile postpaid bill', amount: 799 },
      { desc: 'Broadband bill', amount: 1199 }
    ],
    income: ({ monthAnchor, ago, historyMonths }) => {
      const rows: Expense[] = [];
      // Monthly salary credit across the whole career arc — stable description so the forecaster
      // collapses it into one series; amount steps with role/CTC + annual hikes; recurring only now.
      for (let mb = historyMonths; mb >= 0; mb--) {
        const anchor = monthAnchor(mb, 1);
        rows.push(
          incomeRow(`demo-income-salary-${mb}`, salaryFor(anchor), 'cat-inc-salary', 'Monthly salary credit', anchor, {
            recurring: mb === 0
          })
        );
        // Annual Diwali bonus (~0.6× a month's salary) every October — seasonal income spikes.
        if (new Date(anchor).getMonth() === 9) {
          const bonusAnchor = monthAnchor(mb, 15);
          rows.push(
            incomeRow(
              `demo-income-bonus-${mb}`,
              Math.round(salaryFor(bonusAnchor) * 0.6),
              'cat-inc-salary',
              'Diwali bonus',
              bonusAnchor
            )
          );
        }
      }
      // A recent one-off freelance project (suggestible, NOT recurring).
      rows.push(
        incomeRow('demo-income-freelance', 35000, 'cat-inc-freelance', 'Website redesign project', ago(20), {
          hashtags: ['freelance']
        })
      );
      return rows;
    },
    holdings: ({ ago, from }) => [
      mfHolding(ago, 50000, 62008),
      stockHolding(ago),
      fdHolding(ago, from, 100000, 107500),
      goldHolding(ago),
      npsHolding(ago),
      ppfHolding(ago, 613324, 613324),
      epfHolding(ago),
      vehicleHolding(ago),
      propertyHolding(ago)
    ],
    liabilities: ({ ago, from }) => [homeLoanLiability(ago, from)],
    subscriptions: ({ ago }) => defaultSubscriptions(ago)
  },

  // ── Self-employed ─────────────────────────────────────────────────────────
  self_employed: {
    expenseScale: 1.0,
    rent: { amount: 20000, description: 'Monthly rent' },
    sip: { amount: 8000, description: 'Parag Parikh Flexi Cap SIP' },
    extraRecurringExpense: { amount: 6000, description: 'Co-working space', catKey: 'other' },
    subscriptionHistory: [
      { amount: 649, description: 'Netflix subscription', catKey: 'entertainment' },
      { amount: 119, description: 'Spotify subscription', catKey: 'entertainment' }
    ],
    gymHistory: { amount: 999, description: 'Cult.fit gym membership' },
    amazonPrime: true,
    dueBills: [
      { desc: 'Mobile postpaid bill', amount: 799 },
      { desc: 'Broadband bill', amount: 1199 }
    ],
    income: ({ monthAnchor, historyMonths }) => {
      const rows: Expense[] = [];
      // Recurring monthly retainer — stable description, recurring on current month only.
      for (let mb = historyMonths; mb >= 0; mb--) {
        rows.push(
          incomeRow(
            `demo-income-retainer-${mb}`,
            55000,
            'cat-inc-freelance',
            'Monthly retainer — Orbit Design',
            monthAnchor(mb, 1),
            {
              recurring: mb === 0
            }
          )
        );
      }
      // Irregular client invoices — varying amounts, NOT recurring (truly irregular).
      const invoiceAmounts = [62000, 48000, 90000, 40000, 71000, 55000, 83000, 0, 67000];
      for (let mb = 8; mb >= 0; mb--) {
        const amt = invoiceAmounts[8 - mb] ?? 0;
        if (amt > 0) {
          rows.push(
            incomeRow(`demo-income-invoice-${mb}`, amt, 'cat-inc-freelance', 'Client invoice', monthAnchor(mb, 14))
          );
        }
      }
      // One-off GST refund.
      rows.push(incomeRow('demo-income-gst-refund', 12000, 'cat-inc-cashback', 'GST refund', monthAnchor(3, 20)));
      return rows;
    },
    // MF, stock, FD, gold, NPS, PPF — NO EPF (no employer).
    holdings: ({ ago, from }) => [
      mfHolding(ago, 50000, 62008),
      stockHolding(ago),
      fdHolding(ago, from, 100000, 107500),
      goldHolding(ago),
      npsHolding(ago),
      ppfHolding(ago, 613324, 613324)
    ],
    liabilities: ({ ago, from }) => [
      {
        id: 'demo-liability-business',
        type: 'personal_loan', // no dedicated business type in the union; closest fit
        name: 'Business Loan — ICICI Bank',
        principalAmount: 1000000,
        outstandingAmount: 800000,
        interestRate: 12.5,
        emiAmount: 18000,
        emiDueDate: 7,
        lenderName: 'ICICI Bank',
        startDate: ago(540),
        endDate: from(1260),
        notes: '#sample',
        createdAt: ago(540),
        updatedAt: ago(30)
      }
    ],
    subscriptions: ({ ago }) => defaultSubscriptions(ago)
  },

  // ── Business owner ──────────────────────────────────────────────────────────
  business_owner: {
    expenseScale: 1.4,
    rent: { amount: 35000, description: 'Monthly rent' },
    sip: { amount: 15000, description: 'Parag Parikh Flexi Cap SIP' },
    subscriptionHistory: [
      { amount: 649, description: 'Netflix subscription', catKey: 'entertainment' },
      { amount: 119, description: 'Spotify subscription', catKey: 'entertainment' }
    ],
    gymHistory: { amount: 999, description: 'Cult.fit gym membership' },
    amazonPrime: true,
    dueBills: [
      { desc: 'Mobile postpaid bill', amount: 999 },
      { desc: 'Broadband bill', amount: 1499 }
    ],
    income: ({ monthAnchor, historyMonths }) => {
      const rows: Expense[] = [];
      // Business drawings — recurring monthly, stable description.
      for (let mb = historyMonths; mb >= 0; mb--) {
        rows.push(
          incomeRow(`demo-income-drawings-${mb}`, 150000, 'cat-inc-other', 'Business drawings', monthAnchor(mb, 1), {
            recurring: mb === 0
          })
        );
      }
      // Two one-off profit distributions a few months apart (₹200000 each).
      rows.push(
        incomeRow('demo-income-profit-1', 200000, 'cat-inc-other', 'Profit distribution', monthAnchor(6, 10)),
        incomeRow('demo-income-profit-2', 200000, 'cat-inc-other', 'Profit distribution', monthAnchor(2, 10))
      );
      return rows;
    },
    // Larger portfolio: bigger MF, 2 stocks, large FD, gold, PPF, second property.
    holdings: ({ ago, from }) => [
      mfHolding(ago, 1200000, 1488000),
      stockHolding(ago),
      {
        id: 'demo-holding-stock-2',
        assetClass: 'stock',
        name: 'Reliance Industries Ltd',
        symbol: 'RELIANCE.NS',
        units: 50,
        avgCostPrice: 2450,
        currentPrice: 2980,
        investedAmount: 122500,
        currentValue: 149000,
        createdAt: ago(200),
        updatedAt: ago(1)
      },
      fdHolding(ago, from, 1500000, 1612500),
      goldHolding(ago),
      ppfHolding(ago, 613324, 613324),
      propertyHolding(ago),
      {
        id: 'demo-holding-property-2',
        assetClass: 'property' as const,
        name: 'Commercial Shop — Indiranagar',
        investedAmount: 9000000,
        currentValue: 12500000,
        lastUpdatedAt: ago(30),
        assetMeta: { propertyType: 'commercial' as const, propertyCity: 'Bengaluru', propertyAreaSqft: 600 },
        notes: '#sample',
        createdAt: ago(1460),
        updatedAt: ago(30)
      }
    ],
    liabilities: ({ ago, from }) => [
      homeLoanLiability(ago, from),
      {
        id: 'demo-liability-business',
        type: 'personal_loan', // no dedicated business type in the union; closest fit
        name: 'Business Loan — HDFC Bank',
        principalAmount: 3000000,
        outstandingAmount: 2500000,
        interestRate: 11.5,
        emiAmount: 55000,
        emiDueDate: 10,
        lenderName: 'HDFC Bank',
        startDate: ago(730),
        endDate: from(1825),
        notes: '#sample',
        createdAt: ago(730),
        updatedAt: ago(30)
      }
    ],
    subscriptions: ({ ago }) => defaultSubscriptions(ago)
  },

  // ── Student ───────────────────────────────────────────────────────────────
  student: {
    expenseScale: 0.35,
    rent: { amount: 7000, description: 'PG / hostel rent' },
    sip: { amount: 1000, description: 'Nifty 50 Index SIP' },
    // Fewer/cheaper subscriptions — only Spotify student in history; cheap gym.
    subscriptionHistory: [{ amount: 59, description: 'Spotify student subscription', catKey: 'entertainment' }],
    gymHistory: { amount: 500, description: 'Neighbourhood gym' },
    amazonPrime: false,
    dueBills: [{ desc: 'Mobile prepaid recharge', amount: 299 }],
    income: ({ monthAnchor, historyMonths }) => {
      const rows: Expense[] = [];
      for (let mb = historyMonths; mb >= 0; mb--) {
        rows.push(
          incomeRow(`demo-income-pocket-${mb}`, 8000, 'cat-inc-gift', 'Pocket money', monthAnchor(mb, 1), {
            recurring: mb === 0
          })
        );
        rows.push(
          incomeRow(`demo-income-parttime-${mb}`, 6000, 'cat-inc-other', 'Part-time job — Café', monthAnchor(mb, 3), {
            recurring: mb === 0
          })
        );
        // Tuition income — monthly stable description, NOT recurring (suggestible).
        rows.push(incomeRow(`demo-income-tuition-${mb}`, 4000, 'cat-inc-other', 'Tuition income', monthAnchor(mb, 8)));
      }
      rows.push(incomeRow('demo-income-scholarship', 10000, 'cat-inc-other', 'Scholarship credit', monthAnchor(4, 12)));
      return rows;
    },
    // Minimal: one small MF + small FD. NO NPS/PPF/EPF/gold/property.
    holdings: ({ ago, from }) => [mfHolding(ago, 15000, 18200), fdHolding(ago, from, 10000, 10750)],
    liabilities: ({ ago, from }) => [
      {
        id: 'demo-liability-education',
        type: 'education_loan',
        name: 'Education Loan — SBI',
        principalAmount: 500000,
        outstandingAmount: 400000,
        interestRate: 9.5,
        emiAmount: 3500,
        emiDueDate: 5,
        lenderName: 'SBI',
        startDate: ago(540),
        endDate: from(2190),
        notes: '#sample',
        createdAt: ago(540),
        updatedAt: ago(30)
      }
    ],
    // Only the Music sub + cheap gym.
    subscriptions: ({ ago }) => [
      {
        id: 'demo-sub-spotify',
        merchantCategory: 'Music',
        detectedAmount: 59,
        intervalDays: 30,
        status: 'active',
        lastChargedAt: ago(5),
        confirmedByUser: true,
        createdAt: ago(180),
        updatedAt: ago(5)
      },
      {
        id: 'demo-sub-gym',
        merchantCategory: 'Fitness',
        detectedAmount: 500,
        intervalDays: 30,
        status: 'active',
        lastChargedAt: ago(60),
        confirmedByUser: false,
        createdAt: ago(240),
        updatedAt: ago(60)
      }
    ]
  },

  // ── Retired ─────────────────────────────────────────────────────────────────
  retired: {
    expenseScale: 0.8,
    medicalScale: 2.0, // medical higher for retirees
    // No rent — owns home. No SIP.
    subscriptionHistory: [
      { amount: 649, description: 'Netflix subscription', catKey: 'entertainment' },
      { amount: 119, description: 'Spotify subscription', catKey: 'entertainment' }
    ],
    amazonPrime: true,
    dueBills: [
      { desc: 'Mobile postpaid bill', amount: 699 },
      { desc: 'Electricity bill', amount: 1400 }
    ],
    income: ({ monthAnchor, historyMonths }) => {
      const rows: Expense[] = [];
      // Pension — recurring monthly, stable description.
      for (let mb = historyMonths; mb >= 0; mb--) {
        rows.push(
          incomeRow(`demo-income-pension-${mb}`, 45000, 'cat-inc-other', 'Pension credit', monthAnchor(mb, 1), {
            recurring: mb === 0
          })
        );
        // Rental income — monthly stable description, NOT recurring (suggestible).
        rows.push(incomeRow(`demo-income-rental-${mb}`, 18000, 'cat-inc-rental', 'Rental income', monthAnchor(mb, 5)));
      }
      // FD interest payout — quarterly one-offs.
      rows.push(
        incomeRow('demo-income-fdint-1', 22000, 'cat-inc-dividends', 'FD interest payout', monthAnchor(6, 18)),
        incomeRow('demo-income-fdint-2', 22000, 'cat-inc-dividends', 'FD interest payout', monthAnchor(3, 18)),
        incomeRow('demo-income-fdint-3', 22000, 'cat-inc-dividends', 'FD interest payout', monthAnchor(0, 18)),
        incomeRow('demo-income-dividend', 8000, 'cat-inc-dividends', 'Dividend payout', monthAnchor(2, 22))
      );
      return rows;
    },
    // Conservative: large FD, balanced MF, matured PPF, gold. No active EPF/NPS.
    holdings: ({ ago, from }) => [
      fdHolding(ago, from, 2000000, 2150000),
      mfHolding(ago, 400000, 462000),
      ppfHolding(ago, 1500000, 1620000),
      goldHolding(ago)
    ],
    liabilities: () => [],
    subscriptions: ({ ago }) => defaultSubscriptions(ago)
  }
};

// Default subscriptions store (Netflix, Spotify, Amazon Prime, gym).
function defaultSubscriptions(ago: (d: number) => number): Subscription[] {
  return [
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
}

// Wipes all seeded financial tables + demo localStorage markers, but does NOT reload or navigate —
// callers decide what happens next. Used by reseedForEmployment (re-seeds after), by SettingsPage's
// "Exit Demo Mode" and DemoModeBanner (both hand off to the real-setup sequence afterward).
export async function wipeDemoData(): Promise<void> {
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
    db.persons.clear(),
    db.ledger_entries.clear(),
    db.accounts.clear(),
    db.merchant_memory.clear(),
    // Track E group fixtures
    db.groups.clear(),
    db.group_members.clear(),
    db.group_events.clear(),
    db.group_keys.clear()
  ]);
  // Bypasses every `EncryptedRepository` above (raw `RowStore.clear()`) — see
  // `invalidateAllRepositoryCaches()`'s own doc comment for why this is required here.
  invalidateAllRepositoryCaches();
  // Clears the demo-seeded marker + dismissal/one-time-init markers so a re-seed surfaces inbox
  // suggestions cleanly (see `./seedDemoStorage` for the localStorage/AsyncStorage split).
  clearDemoSeedMarkers();
  await setProfileDemoFlag(false);
}

// Re-seed demo data for a new employment type — used when the user changes
// employment on the Profile page while still on demo data. Bails out (returns
// false) if the user has touched any real financial data: seeding never writes
// activity logs, and profile edits log entityType 'profile', so any non-profile
// log entry means the user has created/edited/deleted real records.
export async function reseedForEmployment(employmentType: EmploymentType): Promise<boolean> {
  if (!isDemoSeeded()) return false;
  const logs = await activityLogRepo.getAll();
  if (logs.some((l) => l.entityType !== 'profile')) return false;
  await wipeDemoData();
  await seedDemoData(employmentType);
  return true;
}
