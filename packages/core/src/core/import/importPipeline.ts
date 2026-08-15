import type { ExpenseCategory } from '@/core/db/types';
import { CATEGORY_MIGRATION_MAP } from '@/core/db/defaultCategories';
import type { ParsedRow } from './importParsers';
import type { CategoryResolution } from './importCategoryResolution';
import type { TransferPair } from './importTransferPairing';

/** Stable key for detecting duplicate transactions (date + amount + normalised description).
 *
 *  Uses the FULL epoch-ms `date`, not truncated to the day — found 2026-08-14 via a real MoneyView
 *  export: truncating to day-only meant any two genuinely distinct same-day, same-amount,
 *  same-description transactions (e.g. two separate ATM withdrawals an hour apart, two separate wallet
 *  top-ups minutes apart — confirmed 149 such (day, amount, description) collisions / 334 rows in one
 *  real 9,384-row file) collided under one key. Since `buildResolvedPreviewRows` below checks this key
 *  against BOTH existing DB expenses and earlier rows already seen in the same batch, the second/third
 *  same-day occurrence was silently dropped as an "already imported duplicate" of the first, despite
 *  never existing anywhere before — real data loss, not a display quirk. `Expense.date` already stores
 *  full epoch-ms precision and MoneyView's own export has second-level timestamps, so nothing about the
 *  underlying data forced day-only granularity; it was lost only in how this key was built. A genuine
 *  same-file duplicate (an export glitch producing the identical source row twice, the reason this
 *  batch-wide check exists at all — see this file's own 2026-07-28 note below) still shares the exact
 *  same source timestamp and is still caught; only distinct real transactions that happen to share a
 *  day/amount/description are no longer falsely conflated. */
export function dedupKey(date: number, amount: number, desc: string): string {
  return `${date}|${amount}|${desc.toLowerCase().trim()}`;
}

// ─── Legacy pipeline (apps/mobile's current import wizard) ─────────────────────
// Kept unchanged so apps/mobile keeps compiling and behaving exactly as it did before the 2026-07-28
// rewrite — mobile isn't ported to the new resolution-based flow below yet (per explicit sequencing:
// finalize + verify in apps/web-react first). Do not extend this section; new work goes in the
// resolution-based pipeline further down.

export interface PreviewRow extends ParsedRow {
  matchedCategoryId: string;
  matchedCategoryName: string;
  unrecognised: boolean;
  duplicate: boolean;
  sourceRef: string;
}

/** Resolves an imported category name to an existing category, falling back to "Other". */
export function matchCategory(
  name: string,
  categories: ExpenseCategory[]
): { id: string; name: string; unrecognised: boolean } {
  const lower = name.toLowerCase().trim();
  const fromMap = CATEGORY_MIGRATION_MAP[lower];
  if (fromMap) {
    const cat = categories.find((c) => c.id === fromMap);
    if (cat) return { id: cat.id, name: cat.name, unrecognised: false };
  }
  const direct = categories.find((c) => c.name.toLowerCase() === lower);
  if (direct) return { id: direct.id, name: direct.name, unrecognised: false };
  const other = categories.find((c) => c.id === 'cat-other');
  return { id: other?.id ?? 'cat-other', name: 'Other', unrecognised: true };
}

/** Enriches parsed rows with matched category + duplicate status against existing transaction keys. */
export function buildPreviewRows(
  rows: ParsedRow[],
  categories: ExpenseCategory[],
  existingKeys: Set<string>
): PreviewRow[] {
  return rows.map((row) => {
    const { id, name, unrecognised } = matchCategory(row.categoryName, categories);
    const ref = dedupKey(row.date, row.amount, row.description);
    return {
      ...row,
      matchedCategoryId: id,
      matchedCategoryName: name,
      unrecognised,
      duplicate: existingKeys.has(ref),
      sourceRef: ref
    };
  });
}

// ─── Resolution-based pipeline (apps/web-react's new import wizard, 2026-07-28) ────────────────────
// Category/account resolution now happens once per distinct source value (see
// importCategoryResolution.ts / importAccountResolution.ts), confirmed by the user before any row is
// built — never a silent per-row cat-other fallback. Also fixes in-batch dedup (the legacy pipeline
// above only ever checked against existing DB expenses, so two identical rows in the same uploaded
// file both imported — found 2026-07-28 via real Cashew/MoneyView sample exports).

export interface ResolvedPreviewRow {
  date: number;
  amount: number;
  description: string;
  type: 'expense' | 'income' | 'transfer';
  paymentMode?: string;
  hashtags: string[];
  notes?: string;
  categoryId: string;
  categoryName: string;
  accountId: string;
  /** Set only when this row represents a MERGED confirmed transfer pair (see
   *  applyConfirmedTransferPairs below) — the destination account credited, matching Penny's native
   *  transfer model (Expense.toAccountId). Absent for a normal expense/income row, or a transfer-typed
   *  row that wasn't confidently paired (it still writes as an independent row, same as before). */
  toAccountId?: string;
  /** True if this row's category resolution was 'skip' — excluded from import, but still shown (dimmed)
   *  in the preview so the user can see what was left out and why. */
  skipped: boolean;
  /** True against an existing DB expense OR an earlier row in this same batch. */
  duplicate: boolean;
  sourceRef: string;
}

export type ConfirmedCategoryMap = Map<
  string,
  {
    categoryId: string;
    categoryName: string;
    skip?: boolean;
    type?: 'transfer';
    /** Destination account for a `type: 'transfer'` entry (2026-08-09) — see `CategoryAction`'s
     *  'transfer' variant doc comment. Absent/empty means the user hasn't picked one yet; a row built
     *  from such an entry writes with no `toAccountId` unless `applyConfirmedTransferPairs` below fills
     *  it in from an auto-detected same-file reciprocal row instead. */
    toAccountId?: string;
    tag?: string;
  }
>;

/** A per-row correction layered ON TOP of (never replacing) the source-category-name-level resolution
 *  above — added 2026-08-06 so a user can bulk-select an arbitrary subset of one CategoryTile's rows
 *  and either move just those to a different EXISTING category, or tag just those, without disturbing
 *  the rest of that source category's rows or its own group-level resolution. Keyed by the row's plain
 *  index into the `parsedRows` array (stable for a session — that array is append-only, never reordered
 *  or spliced; see `useImport.ts`). Both fields are independently optional and independently fall back
 *  to the group's own resolution when absent — a tag-only override doesn't force a category move, and a
 *  category-move override without an explicit tag still inherits the group's own tag. Deliberately
 *  narrower than a full `CategoryAction`: a row-level override only ever supports "move to this EXISTING
 *  category" (via the same `CategoryPickerModal` already used for group-level "Map Existing"), never
 *  'create'/'skip'/'transfer' — those remain exclusively group-level decisions. */
export interface RowOverride {
  categoryId?: string;
  categoryName?: string;
  tag?: string;
}

/** Builds the confirmed source-category-name → final-category map from the user's reviewed
 *  CategoryResolution list. 'create' actions must already have a real categoryId by this point (the
 *  category itself is created — deliberately, never silently — when the user confirms the resolution
 *  step; see the wizard hook). A 'transfer' resolution also overrides the row's `type` to `'transfer'`
 *  in buildResolvedPreviewRows below — a source category resolved as a transfer (e.g. "Balance
 *  Correction") must actually become a transfer transaction, not keep whatever sign-based
 *  expense/income type the parser guessed from the amount column.
 *
 *  `tags` (optional) is the per-source-category custom tag the user typed on its CategoryTile — e.g.
 *  "Jaipur Expenses" → "goa-trip" — applied to every one of that source category's transactions in
 *  buildResolvedPreviewRows below, independent of which category kind (existing/create/transfer/skip)
 *  it resolved to. Normalised here (trim, strip leading '#', lowercase) exactly like the manual
 *  hashtag input elsewhere in the app (see ExpenseForm.tsx's `parseTags`). */
export function toConfirmedCategoryMap(
  resolutions: CategoryResolution[],
  createdCategoryIds: Map<string, string>,
  tags?: Map<string, string>
): ConfirmedCategoryMap {
  const map: ConfirmedCategoryMap = new Map();
  for (const r of resolutions) {
    const rawTag = tags?.get(r.sourceName);
    const tag = rawTag?.trim().replace(/^#/, '').toLowerCase() || undefined;
    if (r.suggestion.kind === 'existing') {
      map.set(r.sourceName, {
        categoryId: r.suggestion.categoryId,
        categoryName: r.suggestion.categoryName,
        ...(tag && { tag })
      });
    } else if (r.suggestion.kind === 'transfer') {
      map.set(r.sourceName, {
        categoryId: r.suggestion.categoryId,
        categoryName: r.suggestion.categoryName,
        type: 'transfer',
        ...(r.suggestion.toAccountId && { toAccountId: r.suggestion.toAccountId }),
        ...(tag && { tag })
      });
    } else if (r.suggestion.kind === 'create') {
      const id = createdCategoryIds.get(r.sourceName);
      if (id) map.set(r.sourceName, { categoryId: id, categoryName: r.suggestion.suggestedName, ...(tag && { tag }) });
    } else {
      map.set(r.sourceName, { categoryId: '', categoryName: r.sourceName, skip: true, ...(tag && { tag }) });
    }
  }
  return map;
}

/** Enriches parsed rows with the user-confirmed category + account, and duplicate status against BOTH
 *  existing DB expenses and earlier rows already seen in this same batch (fixes the in-batch dedup
 *  gap the legacy pipeline had).
 *
 *  @param rowOverrides Optional per-row corrections (2026-08-06), keyed by index into `rows` — see
 *    `RowOverride`'s doc comment. A present override's `categoryId`/`categoryName` wins over the
 *    group-level resolution entirely (including its `skip`/`type: 'transfer'`, since a row-level move
 *    always resolves to a normal category); its `tag` is layered onto the row's hashtags in place of
 *    (not in addition to) the group's own tag when set, so a bulk-tag action on a subset doesn't also
 *    inherit whatever tag the rest of the group has. */
export function buildResolvedPreviewRows(
  rows: ParsedRow[],
  categoryMap: ConfirmedCategoryMap,
  resolveAccountId: (row: ParsedRow) => string,
  existingKeys: Set<string>,
  rowOverrides?: Map<number, RowOverride>
): ResolvedPreviewRow[] {
  const seenInBatch = new Set<string>();
  return rows.map((row, i) => {
    const catKey = row.categoryName.trim() || 'Other';
    const resolved = categoryMap.get(catKey);
    const override = rowOverrides?.get(i);
    const ref = dedupKey(row.date, row.amount, row.description);
    const duplicate = existingKeys.has(ref) || seenInBatch.has(ref);
    seenInBatch.add(ref);
    // Apply whichever tag actually governs this row (the override's own tag if it set one, else the
    // group's) on top of the row's own parsed hashtags, rather than overwriting them — and never
    // duplicate a tag the row already carries.
    const effectiveTag = override?.tag ?? resolved?.tag;
    const hashtags =
      effectiveTag && !row.hashtags.includes(effectiveTag) ? [...row.hashtags, effectiveTag] : row.hashtags;
    return {
      date: row.date,
      amount: row.amount,
      description: row.description,
      // An override always means "move to this existing category" — never 'transfer' — so it also
      // overrides the group's own `type: 'transfer'` back to the row's natural expense/income type.
      type: override?.categoryId ? row.type : (resolved?.type ?? row.type),
      // The category-level "transfer" resolution's own chosen destination account (2026-08-09 fix) —
      // dropped along with `type` when a row-level override reverts this row to a normal category, and
      // may still be overwritten below by `applyConfirmedTransferPairs` if this row also happens to be
      // part of an auto-detected same-file reciprocal pair (that source is more precise: a real paired
      // row's own accountId, not just the category-wide destination the user picked once for every row
      // under this source category).
      ...(!override?.categoryId && resolved?.type === 'transfer' && resolved.toAccountId
        ? { toAccountId: resolved.toAccountId }
        : {}),
      ...(row.paymentMode && { paymentMode: row.paymentMode }),
      hashtags,
      ...(row.notes && { notes: row.notes }),
      categoryId: override?.categoryId ?? resolved?.categoryId ?? 'cat-other',
      categoryName: override?.categoryName ?? resolved?.categoryName ?? 'Other',
      accountId: resolveAccountId(row),
      skipped: override ? false : !!resolved?.skip,
      duplicate,
      sourceRef: ref
    };
  });
}

/** Collapses each CONFIRMED transfer pair's two independently-resolved rows into ONE row that matches
 *  Penny's native transfer model — a single `Expense` with `accountId` (source, debited) and
 *  `toAccountId` (destination, credited); see `Expense.toAccountId` and balanceCalculator.ts's
 *  `delta()`. Before this, the import pipeline wrote both legs of a transfer as independent
 *  expense/income rows, which double-debited both accounts instead of debiting one and crediting the
 *  other — a real balance-accuracy bug (see importWriter.test.ts's computeBalance regression test).
 *
 *  `rows` must be index-aligned with the ORIGINAL `parsedRows` array (exactly what
 *  `buildResolvedPreviewRows` returns) — `pairs[].outgoingIndex`/`incomingIndex` are indices into that
 *  same array. Only rows belonging to a pair in `pairs` are collapsed; every other row (including
 *  either leg of a pair NOT passed here — e.g. one that involves a duplicate/skipped row, filtered out
 *  by the caller) passes through unchanged and keeps writing as an independent row, same as before.
 *
 *  The merged row takes the OUTGOING leg's date/description/category/notes/hashtags/payment mode (in
 *  most real exports both legs share the same narrative — see importTransferPairing.ts's
 *  `sameNarrative` check) and the pair's own (epsilon-normalised) `amount`. */
export function applyConfirmedTransferPairs(rows: ResolvedPreviewRow[], pairs: TransferPair[]): ResolvedPreviewRow[] {
  const collapsedIndices = new Set<number>();
  const merged: ResolvedPreviewRow[] = [];

  for (const pair of pairs) {
    const outgoing = rows[pair.outgoingIndex];
    const incoming = rows[pair.incomingIndex];
    if (!outgoing || !incoming) continue;
    collapsedIndices.add(pair.outgoingIndex);
    collapsedIndices.add(pair.incomingIndex);
    merged.push({
      ...outgoing,
      type: 'transfer',
      amount: pair.amount,
      toAccountId: incoming.accountId
    });
  }

  rows.forEach((row, i) => {
    if (!collapsedIndices.has(i)) merged.push(row);
  });

  return merged;
}

// ─── Row-index-keyed pipeline (2026-08-14, CSV-import redesign Chunk B, apps/mobile only) ────────────
// `buildResolvedPreviewRows` above is keyed by source CATEGORY NAME (`ConfirmedCategoryMap`) — correct
// for the flow apps/web-react's frozen `useImport.ts` still uses, but genuinely insufficient for the new
// Categories-stage model (`resolveCategoriesDirectional`/`splitByCounterparty`,
// importCategoryResolution.ts/importCounterpartySplit.ts): two rows sharing the same raw source category
// name can now resolve completely differently (different direction, or a different detected
// counterparty), which a per-name map cannot represent at all. `buildResolvedPreviewRows` itself is
// untouched below — this is a NEW, additive sibling, used exclusively by apps/mobile's new Categories/
// Transactions wizard stages.

export interface RowAction {
  categoryId: string;
  categoryName: string;
  skip?: boolean;
  type?: 'transfer';
  toAccountId?: string;
  tag?: string;
}

/** Row-index-keyed sibling of `buildResolvedPreviewRows` — identical shape/behavior otherwise (same
 *  dedup-against-DB-and-batch check, same `RowOverride` precedence, same tag-layering rule), just reads
 *  each row's resolution from `rowActions.get(i)` instead of `categoryMap.get(row.categoryName)`. */
export function buildResolvedPreviewRowsByIndex(
  rows: ParsedRow[],
  rowActions: Map<number, RowAction>,
  resolveAccountId: (row: ParsedRow) => string,
  existingKeys: Set<string>,
  rowOverrides?: Map<number, RowOverride>
): ResolvedPreviewRow[] {
  const seenInBatch = new Set<string>();
  return rows.map((row, i) => {
    const resolved = rowActions.get(i);
    const override = rowOverrides?.get(i);
    const ref = dedupKey(row.date, row.amount, row.description);
    const duplicate = existingKeys.has(ref) || seenInBatch.has(ref);
    seenInBatch.add(ref);
    const effectiveTag = override?.tag ?? resolved?.tag;
    const hashtags =
      effectiveTag && !row.hashtags.includes(effectiveTag) ? [...row.hashtags, effectiveTag] : row.hashtags;
    return {
      date: row.date,
      amount: row.amount,
      description: row.description,
      type: override?.categoryId ? row.type : (resolved?.type ?? row.type),
      ...(!override?.categoryId && resolved?.type === 'transfer' && resolved.toAccountId
        ? { toAccountId: resolved.toAccountId }
        : {}),
      ...(row.paymentMode && { paymentMode: row.paymentMode }),
      hashtags,
      ...(row.notes && { notes: row.notes }),
      categoryId: override?.categoryId ?? resolved?.categoryId ?? 'cat-other',
      categoryName: override?.categoryName ?? resolved?.categoryName ?? 'Other',
      accountId: resolveAccountId(row),
      skipped: override ? false : !!resolved?.skip,
      duplicate,
      sourceRef: ref
    };
  });
}
