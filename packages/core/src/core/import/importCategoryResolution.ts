// Smart, non-silent category resolution for import (packages/core/src/core/import/). Handles a real
// gap found 2026-07-28: real exports (Cashew, MoneyView) mix genuine spending categories with
// inter-account bookkeeping rows ("Balance Correction", "A/c to A/c") that map to Penny's existing
// `type: 'transfer'` model instead of any spending category. A THIRD kind, found 2026-07-29, looks
// similar but isn't a transfer at all: MoneyView's "Cash Forward" (and similar carry-forward markers)
// have no second account to pair with — see `isLikelyCarryForward` below and `importCarryForward.ts` for
// their own per-account chronological handling. Resolution runs once per DISTINCT source category name
// (not per row) — a file with 200 "Groceries" rows gets one prompt, not 200 — and Penny never silently
// invents a category: every "create new" is an explicit, reviewable suggestion the user confirms or
// changes, never an automatic write.
import type { ExpenseCategory } from '@/core/db/types';
import { CATEGORY_MIGRATION_MAP, INTENT_GROUP_META, DEFAULT_TRANSFER_CATEGORIES } from '@/core/db/defaultCategories';
import type { ParsedRow } from './importParsers';

/** Keyword hints per intent group, used only to *suggest* a parent for a genuinely new category — the
 *  user always sees and can change the suggestion before anything is created. Order matters: checked
 *  top to bottom, first match wins, so more specific groups (e.g. `renovation`) should precede broader
 *  ones that could also match a shared word. */
const GROUP_KEYWORDS: [group: string, keywords: string[]][] = [
  ['renovation', ['renovation', 'contractor', 'furniture', 'tiles', 'cement', 'paint', 'granite', 'plumber']],
  ['legal', ['legal', 'court', 'advocate', 'notary', 'stamp duty', 'affidavit', 'filing', 'exemption']],
  ['health', ['medical', 'health', 'pharmacy', 'doctor', 'fitness', 'gym', 'hospital']],
  ['financial', ['emi', 'loan', 'insurance', 'sip', 'mutual fund', 'investment', 'saving', 'zerodha', 'kite', 'stock']],
  ['education', ['school', 'tuition', 'course', 'books', 'fee', 'exam']],
  ['family_giving', ['family', 'gift', 'donation', 'charity', 'occasion', 'religious', 'wedding']],
  ['travel', ['travel', 'flight', 'hotel', 'trip', 'vacation', 'leh', 'holiday']],
  ['sin_goods', ['alcohol', 'tobacco', 'cigarette', 'liquor', 'beer', 'wine']],
  [
    'home_utilities',
    ['rent', 'bill', 'electricity', 'water bill', 'gas bill', 'internet', 'mobile recharge', 'maintenance', 'wifi']
  ],
  ['lifestyle', ['shopping', 'entertainment', 'subscription', 'ott', 'movie', 'salon', 'grooming']],
  ['daily_living', ['food', 'dining', 'grocery', 'groceries', 'snack', 'restaurant', 'cafe', 'breakfast', 'fruit']]
];

/** Keywords for source categories that are really inter-account bookkeeping, not spending — see file
 *  header comment. Deliberately excludes carry-forward-style names (see `CARRY_FORWARD_KEYWORDS`/
 *  `isLikelyCarryForward` below) — those have no second account to pair with at all, so they're a
 *  different concept from a genuine two-sided transfer and are handled by `importCarryForward.ts`
 *  instead. */
const TRANSFER_KEYWORDS = [
  'balance correction',
  'a/c to a/c',
  'account to account',
  'cash in hand',
  'wallet top',
  'fund transfer',
  'self transfer',
  'transfer'
];

export function isLikelyTransfer(categoryName: string): boolean {
  const lower = categoryName.toLowerCase().trim();
  return TRANSFER_KEYWORDS.some((k) => lower.includes(k));
}

/** Keywords for source categories that are monthly carry-forward/continuity markers (MoneyView's
 *  "Cash Forward" et al) — real example from a sample export: a single `cash` account row, amount 530,
 *  category "Cash Forward", dated the very first timestamp in the file. These record leftover cash
 *  rolling from one calendar month into the next; they have NO counterpart account (unlike a real
 *  transfer, e.g. "Balance Correction"), so `isLikelyTransfer` never matches them and they must never be
 *  written as an unpaired `type: 'transfer'` row — `balanceCalculator.ts`'s `delta()` treats any unpaired
 *  transfer as a debit against its own account regardless of the source row's real direction, which would
 *  incorrectly DECREASE the account's balance for what is always actually an inflow. See
 *  `importCarryForward.ts` for the per-account "earliest occurrence only" handling this implies. */
const CARRY_FORWARD_KEYWORDS = ['cash forward', 'brought forward', 'carried forward', 'b/f', 'balance brought forward'];

export function isLikelyCarryForward(categoryName: string): boolean {
  const lower = categoryName.toLowerCase().trim();
  return CARRY_FORWARD_KEYWORDS.some((k) => lower.includes(k));
}

/** Best-guess intent group for a brand-new category, purely from its name. Falls back to 'other' —
 *  always overridable by the user before the category is actually created. */
export function suggestIntentGroup(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  for (const [group, keywords] of GROUP_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return group;
  }
  return 'other';
}

export function intentGroupLabel(group: string): string {
  return INTENT_GROUP_META[group]?.label ?? 'Other';
}

/** Every intent group, for the "create new category" group picker. */
export function allIntentGroups(): { key: string; label: string }[] {
  return Object.entries(INTENT_GROUP_META).map(([key, meta]) => ({ key, label: meta.label }));
}

export type CategoryAction =
  | { kind: 'existing'; categoryId: string; categoryName: string }
  /** `toAccountId` is the destination account this transfer credits — required (may start `''` until
   *  the user picks one; see `isCategoryResolutionDecided` below), same "required but starts blank"
   *  convention as `AccountAction`'s 'existing'/'create' variants. Found missing entirely on-device
   *  2026-08-09: marking a source category as a transfer only ever asked for a transfer CATEGORY
   *  (bucket label like "Other Transfer"/"Credit Card Payment" from `DEFAULT_TRANSFER_CATEGORIES`), never
   *  a destination account — `buildResolvedPreviewRows`/`writeImportBatch` then wrote an unpaired
   *  `type: 'transfer'` row with no `toAccountId` unless `detectTransferPairs` happened to auto-pair it
   *  with a reciprocal row for a DIFFERENT account already present in the same file. `balanceCalculator
   *  .ts`'s `delta()` only credits `toAccountId === accountId`, so an unset `toAccountId` silently debited
   *  the source account with the money never landing anywhere. */
  | { kind: 'transfer'; categoryId: string; categoryName: string; toAccountId: string }
  | { kind: 'create'; suggestedName: string; suggestedIntentGroup: string }
  | { kind: 'skip' };

export interface CategoryResolution {
  sourceName: string;
  /** How many parsed rows carry this exact source category name. */
  count: number;
  suggestion: CategoryAction;
}

/** One suggested resolution per distinct source category name — never a silent match-to-cat-other;
 *  an unrecognised category always suggests 'create' (reviewable) rather than quietly falling back. */
function suggestForName(name: string, categories: ExpenseCategory[]): CategoryAction {
  if (isLikelyTransfer(name)) {
    const fallback = DEFAULT_TRANSFER_CATEGORIES.find((c) => c.id === 'cat-tr-other');
    return {
      kind: 'transfer',
      categoryId: fallback?.id ?? 'cat-tr-other',
      categoryName: fallback?.name ?? 'Other Transfer',
      // No confident guess exists for WHICH account this transfers to — always starts blank and must be
      // explicitly picked by the user (see isCategoryResolutionDecided below), never silently defaulted.
      toAccountId: ''
    };
  }
  const lower = name.toLowerCase().trim();
  const fromMap = CATEGORY_MIGRATION_MAP[lower];
  if (fromMap) {
    const cat = categories.find((c) => c.id === fromMap);
    if (cat) return { kind: 'existing', categoryId: cat.id, categoryName: cat.name };
  }
  const direct = categories.find((c) => c.name.toLowerCase() === lower);
  if (direct) return { kind: 'existing', categoryId: direct.id, categoryName: direct.name };
  return { kind: 'create', suggestedName: name, suggestedIntentGroup: suggestIntentGroup(name) };
}

/** Groups parsed rows by their distinct source category name and suggests a resolution for each —
 *  the input to the wizard's "resolve categories" step. */
export function resolveCategories(rows: ParsedRow[], categories: ExpenseCategory[]): CategoryResolution[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.categoryName.trim() || 'Other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([sourceName, count]) => ({ sourceName, count, suggestion: suggestForName(sourceName, categories) }))
    .sort((a, b) => b.count - a.count);
}

/** True once a resolution needs no further user action before it can be safely imported — 'existing'/
 *  'skip' are confident from the start; 'create' only becomes decided once the user has explicitly
 *  reviewed its tile (even if they leave it as 'create' — see the "N of M decided" convention this
 *  mirrors); 'transfer' additionally needs a destination account picked (2026-08-09 fix, see
 *  `CategoryAction`'s doc comment) before it's importable. Shared by every "N of M decided"/sort-order/
 *  row-triage computation across the review screen so they can never drift out of sync with each other. */
export function isCategoryResolutionDecided(resolution: CategoryResolution, touchedSources: Set<string>): boolean {
  const { suggestion, sourceName } = resolution;
  if (suggestion.kind === 'create') return touchedSources.has(sourceName);
  if (suggestion.kind === 'transfer') return !!suggestion.toAccountId;
  return true;
}

export type TransferCategoryOption = { id: string; name: string };

/** The pickable transfer categories for the 'transfer' resolution action's dropdown. */
export function transferCategoryOptions(): TransferCategoryOption[] {
  return DEFAULT_TRANSFER_CATEGORIES.map((c) => ({ id: c.id, name: c.name }));
}
