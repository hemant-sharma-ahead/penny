// The four `IOU_MANDATORY_CATEGORY_IDS` (packages/core/src/core/db/defaultCategories.ts), described
// once here so every surface that lets a user pick one of them — `BulkAddToIouModal.tsx`'s two-step
// wizard, `EntryForm.tsx`'s "Add IOU" popup (2026-08-26) — shows the same label/icon/subtitle instead
// of drifting independently. Label/icon/color are read live off the real `ExpenseCategory` array by
// each caller (never hardcoded) — only the person-specific subtitle copy, which isn't category data,
// lives here as a fallback alongside the fallback label/icon for when a category lookup misses.
export interface IouCategoryChoice {
  categoryId: string;
  /** Which money direction this category represents — 'expense' (money out) or 'income' (money in) —
   *  so callers can derive a `LedgerEntry`'s kind/settlement direction from the picked category alone. */
  direction: 'expense' | 'income';
  fallbackLabel: string;
  fallbackIcon: string;
  subtitle: (personName: string) => string;
}

// Individual named choices (rather than only ever indexing into an array — this codebase forbids
// non-null assertions, and `noUncheckedIndexedAccess` would otherwise make every `array[i]` read
// `T | undefined`) so `IOU_ALL_CHOICES` below can be built by direct reference, not indexing.
const LENDING: IouCategoryChoice = {
  categoryId: 'cat-lending',
  direction: 'expense',
  fallbackLabel: 'Lending',
  fallbackIcon: 'ti-arrow-up-right',
  subtitle: (n) => `You're giving ${n} money`
};

const RETURN_BORROWED: IouCategoryChoice = {
  categoryId: 'cat-return-borrowed',
  direction: 'expense',
  fallbackLabel: 'Return Borrowed',
  fallbackIcon: 'ti-corner-down-left',
  subtitle: (n) => `Paying ${n} back`
};

const BORROWED_MONEY: IouCategoryChoice = {
  categoryId: 'cat-inc-borrowed',
  direction: 'income',
  fallbackLabel: 'Borrowed Money',
  fallbackIcon: 'ti-arrow-down-left',
  subtitle: (n) => `${n} gave you money`
};

const COLLECTED_MONEY: IouCategoryChoice = {
  categoryId: 'cat-collected-money',
  direction: 'income',
  fallbackLabel: 'Collected Money',
  fallbackIcon: 'ti-corner-up-right',
  subtitle: (n) => `${n} paid you back`
};

export const IOU_EXPENSE_CHOICES: IouCategoryChoice[] = [LENDING, RETURN_BORROWED];
export const IOU_INCOME_CHOICES: IouCategoryChoice[] = [BORROWED_MONEY, COLLECTED_MONEY];

/** All four, in the order they should read as one 2×2 grid (`EntryForm.tsx`'s "Add IOU" popup): the
 *  two "create new debt" categories first, then the two "settle existing debt" categories. */
export const IOU_ALL_CHOICES: IouCategoryChoice[] = [LENDING, BORROWED_MONEY, RETURN_BORROWED, COLLECTED_MONEY];

/** The default choice for a brand-new "Add IOU" entry, and a non-`undefined` fallback for callers
 *  that look one up by id from `IOU_ALL_CHOICES` (avoids an `array[0]` non-null assertion, forbidden
 *  in this codebase, when the lookup can never actually miss in practice). */
export const IOU_DEFAULT_CHOICE: IouCategoryChoice = LENDING;
