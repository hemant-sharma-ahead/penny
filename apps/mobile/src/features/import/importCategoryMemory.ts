import { getJSON, setJSON } from '~/lib/storage';
import {
  computeRememberedSuggestions,
  mergeRememberedCategories,
  type CategoryMemoryMap
} from '@/core/import/importCategoryMemory';
import type { CategoryResolution } from '@/core/import/importCategoryResolution';
import type { ExpenseCategory } from '@/core/db/types';

const STORAGE_KEY = 'penny_import_category_memory_v1';

/**
 * AsyncStorage-backed "remembered category" persistence for the Expense Import review screen
 * (2026-08-13, review redesign issue #8 — decided: AsyncStorage, not a new Dexie store, since this is
 * a small non-sensitive UI preference, same convention `apps/mobile/src/hooks/usePaymentModes.ts` uses
 * for its own one-time-seed flag). The actual matching/merge logic is storage-agnostic and lives in
 * `packages/core/src/core/import/importCategoryMemory.ts` (unit-tested there) — this file is just the
 * thin read/write wrapper around it, mirroring Bank Import's `merchantMemory.ts` doc-comment principle:
 * a remembered suggestion is always surfaced as an editable one-tap accept, NEVER auto-applied.
 */
export async function getRememberedCategoryMemory(): Promise<CategoryMemoryMap> {
  return (await getJSON<CategoryMemoryMap>(STORAGE_KEY)) ?? {};
}

/** Loads the persisted memory and computes which of `sourceNames` have a still-valid suggestion (its
 *  remembered `categoryId` must still exist in `categories`) — see `computeRememberedSuggestions`'s doc
 *  comment in packages/core for the "dead id" guard. */
export async function loadRememberedSuggestions(
  sourceNames: string[],
  categories: ExpenseCategory[]
): Promise<Map<string, { categoryId: string; categoryName: string }>> {
  const memory = await getRememberedCategoryMemory();
  return computeRememberedSuggestions(sourceNames, memory, categories);
}

/** Persists every newly-confirmed 'existing'/'create' resolution — see `mergeRememberedCategories`'s
 *  doc comment for exactly which resolutions are meaningful to remember. Called fire-and-forget from
 *  `useImport.ts`'s `commitAndImport()` — must never block or delay the actual import write. */
export async function rememberCategoryChoices(
  resolutions: Pick<CategoryResolution, 'sourceName' | 'suggestion'>[],
  resolveFinalCategory: (sourceName: string) => { categoryId: string; categoryName: string } | undefined
): Promise<void> {
  const existing = await getRememberedCategoryMemory();
  const next = mergeRememberedCategories(existing, resolutions, resolveFinalCategory);
  await setJSON(STORAGE_KEY, next);
}
