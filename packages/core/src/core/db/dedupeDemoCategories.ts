// One-time cleanup for demo databases seeded before the demo seed reused the real default categories.
//
// The old demo seed minted a parallel set of `demo-cat-*` categories (Groceries, Dining, Transport,
// Rent, Medical, Utilities, Investments, Shopping, Entertainment, Other) that DUPLICATED the real
// defaults (`cat-groceries`, `cat-food`, …) — so the category picker showed each twice. The seed now
// reuses the defaults; this migration heals databases that already have the legacy duplicates by
// remapping every reference (expenses, budgets, templates, merchant memory) to the canonical default
// and deleting the orphaned `demo-cat-*` categories. Meaning is preserved — only the duplicate id goes.

import {
  budgetsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  merchantMemoryRepo,
  transactionTemplatesRepo
} from './repositories';
import type { ExpenseCategory } from './types';

/** Demo category KEY → canonical default category id (used by the demo seed). */
export const DEMO_CAT_DEFAULT_ID = {
  groceries: 'cat-groceries',
  dining: 'cat-food',
  transport: 'cat-transport',
  utilities: 'cat-bills',
  rent: 'cat-rent',
  medical: 'cat-health',
  shopping: 'cat-shopping',
  entertainment: 'cat-entertainment',
  investments: 'cat-sip',
  other: 'cat-other'
} as const;

export type DemoCatKey = keyof typeof DEMO_CAT_DEFAULT_ID;

/** Legacy `demo-cat-*` id → canonical default id, for healing already-seeded databases. */
export const LEGACY_DEMO_CAT_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(DEMO_CAT_DEFAULT_ID).map(([key, defaultId]) => [`demo-cat-${key}`, defaultId])
);

/**
 * Remap any records still pointing at a legacy `demo-cat-*` category to the canonical default, then
 * delete the orphaned demo categories. Idempotent — a second run finds nothing to do. Requires an
 * unlocked session (encrypted repositories).
 */
export async function dedupeDemoCategories(): Promise<{ remapped: number; removed: number }> {
  const alias = LEGACY_DEMO_CAT_ALIAS;
  let remapped = 0;

  const expenses = await expensesRepo.getAll();
  for (const e of expenses) {
    const to = alias[e.categoryId];
    if (to) {
      await expensesRepo.put({ ...e, categoryId: to });
      remapped++;
    }
  }

  const budgets = await budgetsRepo.getAll();
  for (const b of budgets) {
    const to = alias[b.categoryId];
    if (to) await budgetsRepo.put({ ...b, categoryId: to });
  }

  const templates = await transactionTemplatesRepo.getAll();
  for (const t of templates) {
    const to = alias[t.categoryId];
    if (to) await transactionTemplatesRepo.put({ ...t, categoryId: to });
  }

  const memories = await merchantMemoryRepo.getAll();
  for (const m of memories) {
    const to = alias[m.categoryId];
    if (to) await merchantMemoryRepo.put({ ...m, categoryId: to });
  }

  let removed = 0;
  for (const demoId of Object.keys(alias)) {
    if (await expenseCategoriesRepo.get(demoId)) {
      await expenseCategoriesRepo.delete(demoId);
      removed++;
    }
  }

  return { remapped, removed };
}

/**
 * Icons that exist in the Tabler SVG set but NOT the shipped webfont — they render blank. Changing a
 * default's icon definition doesn't reach records already seeded in a user's DB (the additive seed only
 * inserts missing categories), so this repairs stored icons in place. Keyed by the bad icon string, so
 * it fixes any category (default or custom) that happens to use one.
 */
export const MISSING_ICON_REPLACEMENTS: Record<string, string> = {
  'ti-fork': 'ti-tools-kitchen-2', // e.g. Food on Trip
  'ti-piggy-bank': 'ti-pig-money' // e.g. Savings Transfer
};

/** Replace any stored category icon that's missing from the webfont with its valid equivalent. */
export async function repairCategoryIcons(): Promise<number> {
  const cats = await expenseCategoriesRepo.getAll();
  let fixed = 0;
  for (const c of cats) {
    const good = MISSING_ICON_REPLACEMENTS[c.icon];
    if (good) {
      await expenseCategoriesRepo.put({ ...c, icon: good });
      fixed++;
    }
  }
  return fixed;
}

/**
 * Reconcile default categories whose definition CHANGED after they were already seeded — the additive
 * seed only inserts missing categories, never updates existing ones. Each rule only applies when the
 * stored fields still match `from`, so a user's own edits to a default are never clobbered.
 */
const RECONCILE_RULES: Array<{ id: string; from: Partial<ExpenseCategory>; to: Partial<ExpenseCategory> }> = [
  // "Dividends & Interest" split → "Dividends" (a separate "Interest" category is seeded alongside).
  { id: 'cat-inc-dividends', from: { name: 'Dividends & Interest' }, to: { name: 'Dividends' } },
  // Fuel moved from Travel to Daily Living; the trip-specific one is now cat-trip-fuel.
  { id: 'cat-fuel', from: { intentGroup: 'travel' }, to: { intentGroup: 'daily_living', name: 'Fuel' } }
];

/** Apply the reconcile rules. Returns how many records were updated. */
export async function reconcileDefaultCategories(): Promise<number> {
  let updated = 0;
  for (const rule of RECONCILE_RULES) {
    const existing = await expenseCategoriesRepo.get(rule.id);
    if (!existing) continue;
    const matches = (Object.keys(rule.from) as Array<keyof ExpenseCategory>).every((k) => existing[k] === rule.from[k]);
    if (!matches) continue;
    await expenseCategoriesRepo.put({ ...existing, ...rule.to });
    updated++;
  }
  return updated;
}
