// Pure "remembered category" logic for the Expense Import review screen (issue #8 of
// docs/mockups/proposals/expense-import-review-redesign-v1.html) — mirrors Bank Import's
// `merchantMemory.ts` principle exactly: a prior resolution is always surfaced as an editable, one-tap
// suggestion, NEVER auto-applied to a fresh import's `CategoryResolution.suggestion`.
//
// This file is deliberately storage-agnostic (no AsyncStorage/localStorage import) so it can be unit
// tested here in packages/core — the actual persisted-JSON-blob storage lives in
// apps/mobile/src/features/import/importCategoryMemory.ts (AsyncStorage via `~/lib/storage`'s
// `getJSON`/`setJSON`, per explicit user decision: no new Dexie store for this), which is a thin wrapper
// around the two functions below.
import type { ExpenseCategory } from '@/core/db/types';
import type { CategoryResolution } from './importCategoryResolution';

export interface RememberedCategoryEntry {
  categoryId: string;
  categoryName: string;
  updatedAt: number;
}

export type CategoryMemoryMap = Record<string, RememberedCategoryEntry>;

/** Normalizes a source category name for lookup — trim + lowercase, same convention as
 *  `importAccountResolution.ts`'s account-name normalization. */
export function normalizeSourceName(sourceName: string): string {
  return sourceName.trim().toLowerCase();
}

/** For each of the given source names, looks up a remembered category — but only if that remembered
 *  `categoryId` still exists in `categories` (a remembered category may have since been deleted or
 *  renamed away; a dead id must never be suggested). Never mutates or reads any `CategoryResolution` —
 *  purely a side-channel suggestion for the UI to offer as an editable one-tap accept. */
export function computeRememberedSuggestions(
  sourceNames: string[],
  memory: CategoryMemoryMap,
  categories: ExpenseCategory[]
): Map<string, { categoryId: string; categoryName: string }> {
  const validCategoryIds = new Set(categories.map((c) => c.id));
  const result = new Map<string, { categoryId: string; categoryName: string }>();
  for (const sourceName of sourceNames) {
    const entry = memory[normalizeSourceName(sourceName)];
    if (entry && validCategoryIds.has(entry.categoryId)) {
      result.set(sourceName, { categoryId: entry.categoryId, categoryName: entry.categoryName });
    }
  }
  return result;
}

/** Merges every newly-confirmed 'existing'/'create' resolution into the memory map — 'skip'/'transfer'
 *  resolutions are never meaningful to remember as a reusable spending category. `resolveFinalCategory`
 *  must supply the REAL, final, post-creation category id/name for a given source name (so a 'create'
 *  resolution is remembered by the actual id the category was created with, never a preview
 *  placeholder) — see `useImport.ts`'s `commitAndImport`, the only call site with that final map
 *  available. Pure: returns the next map, doesn't persist it — the caller (mobile's own
 *  `importCategoryMemory.ts`) is responsible for writing it to storage. */
export function mergeRememberedCategories(
  existing: CategoryMemoryMap,
  resolutions: Pick<CategoryResolution, 'sourceName' | 'suggestion'>[],
  resolveFinalCategory: (sourceName: string) => { categoryId: string; categoryName: string } | undefined,
  now: number = Date.now()
): CategoryMemoryMap {
  const next: CategoryMemoryMap = { ...existing };
  for (const r of resolutions) {
    if (r.suggestion.kind !== 'existing' && r.suggestion.kind !== 'create') continue;
    const final = resolveFinalCategory(r.sourceName);
    if (!final) continue;
    next[normalizeSourceName(r.sourceName)] = {
      categoryId: final.categoryId,
      categoryName: final.categoryName,
      updatedAt: now
    };
  }
  return next;
}
