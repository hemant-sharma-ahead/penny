import type { ExpenseCategory } from '@/core/db/types';
import { CATEGORY_MIGRATION_MAP } from '@/core/db/defaultCategories';
import type { ParsedRow } from './importParsers';
import type { CategoryResolution } from './importCategoryResolution';
import type { TransferPair } from './importTransferPairing';

/** Stable key for detecting duplicate transactions (date + amount + normalised description). */
export function dedupKey(date: number, amount: number, desc: string): string {
  return `${new Date(date).toISOString().slice(0, 10)}|${amount}|${desc.toLowerCase().trim()}`;
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
  { categoryId: string; categoryName: string; skip?: boolean; type?: 'transfer'; tag?: string }
>;

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
 *  gap the legacy pipeline had). */
export function buildResolvedPreviewRows(
  rows: ParsedRow[],
  categoryMap: ConfirmedCategoryMap,
  resolveAccountId: (row: ParsedRow) => string,
  existingKeys: Set<string>
): ResolvedPreviewRow[] {
  const seenInBatch = new Set<string>();
  return rows.map((row) => {
    const catKey = row.categoryName.trim() || 'Other';
    const resolved = categoryMap.get(catKey);
    const ref = dedupKey(row.date, row.amount, row.description);
    const duplicate = existingKeys.has(ref) || seenInBatch.has(ref);
    seenInBatch.add(ref);
    // Apply the source category's custom tag (if any) on top of the row's own parsed hashtags, rather
    // than overwriting them — and never duplicate a tag the row already carries.
    const hashtags =
      resolved?.tag && !row.hashtags.includes(resolved.tag) ? [...row.hashtags, resolved.tag] : row.hashtags;
    return {
      date: row.date,
      amount: row.amount,
      description: row.description,
      type: resolved?.type ?? row.type,
      ...(row.paymentMode && { paymentMode: row.paymentMode }),
      hashtags,
      ...(row.notes && { notes: row.notes }),
      categoryId: resolved?.categoryId ?? 'cat-other',
      categoryName: resolved?.categoryName ?? 'Other',
      accountId: resolveAccountId(row),
      skipped: !!resolved?.skip,
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
