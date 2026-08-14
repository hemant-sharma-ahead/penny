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
 *  `CategoryAction`'s doc comment) before it's importable — UNLESS every one of its rows already writes
 *  correctly some other way (2026-08-13 fix, see `fullyAutoResolvedTransferSources` below). Shared by
 *  every "N of M decided"/sort-order/row-triage computation across the review screen so they can never
 *  drift out of sync with each other.
 *
 *  @param fullyAutoResolvedTransferSources Source names whose 'transfer' resolution needs no explicit
 *    `toAccountId` because EVERY one of its rows is already either a duplicate (never written at all) or
 *    part of a CONFIRMED auto-detected transfer pair (written using the pair's own real destination
 *    account — see `applyConfirmedTransferPairs`, which ignores the category-level `toAccountId`
 *    entirely for a confirmed pair). Without this, a category whose rows auto-pair perfectly (e.g. "Self
 *    Transfer") would be permanently stuck "undecided" with zero way to fix it once the review redesign
 *    (2026-08-13, issue #4) stopped rendering a category tile for fully-paired rows at all — there'd be
 *    no visible `toAccountId` picker left anywhere. See `useImport.ts`'s own doc comment on this set. */
export function isCategoryResolutionDecided(
  resolution: CategoryResolution,
  touchedSources: Set<string>,
  fullyAutoResolvedTransferSources?: Set<string>
): boolean {
  const { suggestion, sourceName } = resolution;
  if (suggestion.kind === 'create') return touchedSources.has(sourceName);
  if (suggestion.kind === 'transfer') {
    return !!suggestion.toAccountId || !!fullyAutoResolvedTransferSources?.has(sourceName);
  }
  return true;
}

export type TransferCategoryOption = { id: string; name: string };

/** The pickable transfer categories for the 'transfer' resolution action's dropdown. */
export function transferCategoryOptions(): TransferCategoryOption[] {
  return DEFAULT_TRANSFER_CATEGORIES.map((c) => ({ id: c.id, name: c.name }));
}

// ─── Direction-aware resolution + counterparty-split support (2026-08-14, CSV-import redesign) ──────
// New, additive exports for apps/mobile's new Categories wizard stage
// (docs/plans/csv-expense-import-redesign.md §7/§9.4/§9.d). `apps/web-react`'s frozen `useImport.ts`
// calls `resolveCategories`/`isLikelyTransfer` directly — everything below is a NEW function/type
// alongside them, never a modification, so web's behavior is byte-for-byte unchanged. In particular,
// `isLikelyIouSuspect`/`isLikelyInvestmentMovement` below are deliberately their OWN keyword lists
// rather than additions to `TRANSFER_KEYWORDS` — extending that shared list would silently change what
// `resolveCategories()` (and therefore web) suggests for those category names too.

/** Keywords for source categories that read as a lend/borrow event (Issue #8) — kept separate from
 *  `TRANSFER_KEYWORDS` (see file-header comment above) even though both ultimately suggest a
 *  `kind: 'transfer'` default in `suggestForNameDirectional` below; the real reason to distinguish IOU
 *  from a plain transfer is `isIouSuspect` (below), which additionally gates the counterparty sub-split
 *  (`splitByCounterparty`, importCounterpartySplit.ts) toward the IOU-specific Lend/Borrow treatment
 *  Chunk B's `ImportCategorizeModal` panel needs, not just a same-name-shared boolean. */
const IOU_KEYWORDS = ['loan', 'lent', 'borrowed', 'borrow', 'lending', 'returned money', 'repaid', 'repayment'];

export function isLikelyIouSuspect(categoryName: string): boolean {
  const lower = categoryName.toLowerCase().trim();
  return IOU_KEYWORDS.some((k) => lower.includes(k));
}

/** Keywords for source categories that are really money moving INTO an investment vehicle Penny already
 *  tracks separately (Portfolio) — found 2026-08-14 (redesign doc §5/9.d) via a real MoneyView export:
 *  "Investments"/"Mutual Funds"/"Stocks"-labelled rows showed real amounts flowing out of a bank account
 *  with no special handling, materially inflating spend analytics with what's actually a transfer into
 *  an already-tracked asset. Flagged as transfer-suspect/needs-review by default (not silently a plain
 *  expense category) — no real Portfolio integration attempted here, explicitly out of scope (§12). */
const INVESTMENT_MOVEMENT_KEYWORDS = ['investment', 'mutual fund', 'stocks', 'stock market', 'equity', 'demat', 'sip'];

export function isLikelyInvestmentMovement(categoryName: string): boolean {
  const lower = categoryName.toLowerCase().trim();
  return INVESTMENT_MOVEMENT_KEYWORDS.some((k) => lower.includes(k));
}

/** Same suggestion logic as `suggestForName` (existing/create), except a source category that ISN'T
 *  already `isLikelyTransfer` but IS IOU- or investment-movement-suspect also defaults to
 *  `kind: 'transfer'` (reviewable, never silently a spend category) — the redesign's §7/§9.d fix. Kept
 *  as its own function (never touching `suggestForName` itself) so `resolveCategories()` — the function
 *  `apps/web-react` calls directly — keeps its exact original behavior for these category names. */
function suggestForNameDirectional(name: string, categories: ExpenseCategory[]): CategoryAction {
  if (!isLikelyTransfer(name) && (isLikelyIouSuspect(name) || isLikelyInvestmentMovement(name))) {
    const fallback = DEFAULT_TRANSFER_CATEGORIES.find((c) => c.id === 'cat-tr-other');
    return {
      kind: 'transfer',
      categoryId: fallback?.id ?? 'cat-tr-other',
      categoryName: fallback?.name ?? 'Other Transfer',
      toAccountId: ''
    };
  }
  return suggestForName(name, categories);
}

export interface DirectionalCategoryResolution {
  /** Stable identity for this resolution — `${sourceName}::${type}` — used everywhere as the grouping
   *  AND touched-tracking key, so the Issue #5 bug (one shared, mutable resolution object read by both
   *  an expense-direction and income-direction tile of the same source category name) is structurally
   *  impossible: each direction gets its own object, under its own key, from the start. */
  key: string;
  /** Raw source category name from the file (NOT unique on its own — see `key`). */
  sourceName: string;
  type: 'expense' | 'income' | 'transfer';
  count: number;
  suggestion: CategoryAction;
  /** Convenience flags, precomputed once here rather than re-derived by every UI consumer — also what
   *  `shouldSplitByCounterparty` (importCounterpartySplit.ts) gates on. */
  isTransferSuspect: boolean;
  isIouSuspect: boolean;
  isInvestmentMovement: boolean;
}

/** Direction-aware sibling of `resolveCategories()` — group key is `${sourceName}::${row.type}` instead
 *  of `sourceName` alone, mirroring the pattern `importTileGrouping.ts` already uses one layer up for
 *  the exact same reason. This is the real fix for Issue #5 (a shared `CategoryResolution` object,
 *  mutated in place, silently re-categorizing both an expense-direction and income-direction tile of the
 *  same source category name) — see the regression test in importCategoryResolution.test.ts proving two
 *  direction-tiles no longer share mutable state. `resolveCategories()` itself is untouched; this is a
 *  new function for apps/mobile's Categories wizard stage only. */
export function resolveCategoriesDirectional(
  rows: ParsedRow[],
  categories: ExpenseCategory[]
): DirectionalCategoryResolution[] {
  const counts = new Map<string, { sourceName: string; type: ParsedRow['type']; count: number }>();
  for (const row of rows) {
    const sourceName = row.categoryName.trim() || 'Other';
    const key = `${sourceName}::${row.type}`;
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { sourceName, type: row.type, count: 1 });
  }
  return Array.from(counts.entries())
    .map(([key, { sourceName, type, count }]) => ({
      key,
      sourceName,
      type,
      count,
      suggestion: suggestForNameDirectional(sourceName, categories),
      isTransferSuspect: isLikelyTransfer(sourceName),
      isIouSuspect: isLikelyIouSuspect(sourceName),
      isInvestmentMovement: isLikelyInvestmentMovement(sourceName)
    }))
    .sort((a, b) => b.count - a.count);
}

/** Direction-aware sibling of `isCategoryResolutionDecided` — takes a `touchedKeys`/
 *  `fullyAutoResolvedTransferKeys` set keyed by `DirectionalCategoryResolution.key`
 *  (`${sourceName}::${type}`) rather than plain `sourceName`, so "has this been touched" tracking can't
 *  regress into the same cross-direction bug at the touched-set layer. */
export function isDirectionalCategoryResolutionDecided(
  resolution: DirectionalCategoryResolution,
  touchedKeys: Set<string>,
  fullyAutoResolvedTransferKeys?: Set<string>
): boolean {
  if (resolution.suggestion.kind === 'create') return touchedKeys.has(resolution.key);
  if (resolution.suggestion.kind === 'transfer') {
    return !!resolution.suggestion.toAccountId || !!fullyAutoResolvedTransferKeys?.has(resolution.key);
  }
  return true;
}

/** Draft-category key (§3.1's "draft object, materialized only at commit" mechanic, extended to
 *  categories) — collapses multiple 'create' resolutions that would each independently create the
 *  "same" category (same suggested name + intent group) into ONE real category at commit time, mirroring
 *  `commitAndImport()`'s existing `createdAccountsByKey` dedup for accounts' own 'create' resolutions.
 *  Categories never needed this before the Categories-stage redesign — the old flow only ever had ONE
 *  resolution per source category name, so two different resolutions could never legitimately want "the
 *  same" new category. The counterparty sub-split (`splitByCounterparty`, importCounterpartySplit.ts)
 *  changes that: two different counterparty rows under one parent label (e.g. two distinct "no person
 *  match" groups under "A/c to A/c") can each independently choose 'create' with the same suggested
 *  name, and must collapse into one real category, not two duplicates. Chunk B's commit orchestration is
 *  expected to key its own `createdCategoryIds` map by this instead of by source name alone. */
export function draftCategoryKey(suggestion: Extract<CategoryAction, { kind: 'create' }>): string {
  return `${suggestion.suggestedName.trim().toLowerCase()}|${suggestion.suggestedIntentGroup}`;
}
