// One-time repair for tag case (2026-08-18, item 21 of docs/plans/real-device-testing-pass.md).
//
// Manual tag entry (ExpenseForm.tsx), BulkHashtagModal.tsx, and useExpenses.ts's bulkAddHashtag/
// bulkRemoveHashtag already lowercase a tag at the moment it's saved — but CSV/bank-import's
// parseTags() didn't (fixed alongside this migration, see importParsers.ts), so any tag that ever
// arrived via import could carry its original mixed case. That leaves two problems in an existing
// database: a `Hashtag` row like "Trip" sitting alongside "trip" (the picker/Manage Tags shows both,
// usage counts split across them), and an `Expense.hashtags[]` entry that still reads "Trip".
//
// This heals both: every `Hashtag.name` is lowercased, any two (or more) that collapse to the same
// lowercase form are merged into one (usageCount summed; `setAside`/`hideInSafeMode` OR'd together —
// either variant having opted in is enough to keep opting in), and every `Expense.hashtags[]` entry is
// lowercased + de-duplicated. Idempotent — a second run finds nothing to do. Follows the same
// boot-time-repair-pass pattern as `repairCategoryIcons()`/`reconcileDefaultCategories()` in
// dedupeDemoCategories.ts (safe to run every app start, cheap no-op once everything's already
// lowercase) rather than a versioned Dexie schema migration.
import { expensesRepo, hashtagsRepo } from './repositories';
import type { Hashtag } from './types';

/** Pick which of a group of same-lowercase-name hashtags survives the merge: prefer one whose name
 *  is already all-lowercase (most likely the "canonical" one users actually see day to day), else the
 *  earliest-created record, so the merge is deterministic across runs. */
function pickKeeper(group: Hashtag[]): Hashtag {
  const alreadyLower = group.find((h) => h.name === h.name.toLowerCase());
  if (alreadyLower) return alreadyLower;
  return group.reduce((oldest, h) => (h.createdAt < oldest.createdAt ? h : oldest));
}

export interface NormalizeHashtagCaseResult {
  /** Hashtag rows whose `name` was lowercased in place (no collision with another row). */
  hashtagsRenamed: number;
  /** Hashtag rows deleted because they collapsed into another row's lowercase form. */
  hashtagsMerged: number;
  /** Expense rows whose `hashtags[]` needed a lowercase/dedupe rewrite. */
  expensesUpdated: number;
}

/**
 * Lowercase every `Hashtag.name` and every `Expense.hashtags[]` entry, merging any hashtags that
 * collapse to the same lowercase form. Requires an unlocked session (encrypted repositories).
 */
export async function normalizeHashtagCase(): Promise<NormalizeHashtagCaseResult> {
  const hashtags = await hashtagsRepo.getAll();
  const groups = new Map<string, Hashtag[]>();
  for (const h of hashtags) {
    const key = h.name.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(h);
    else groups.set(key, [h]);
  }

  let hashtagsRenamed = 0;
  let hashtagsMerged = 0;

  for (const [lowerName, group] of groups) {
    if (group.length === 1) {
      const [only] = group as [Hashtag];
      if (only.name !== lowerName) {
        await hashtagsRepo.put({ ...only, name: lowerName });
        hashtagsRenamed++;
      }
      continue;
    }

    const keeper = pickKeeper(group);
    const usageCount = group.reduce((sum, h) => sum + h.usageCount, 0);
    const setAside = group.some((h) => h.setAside === true) ? true : keeper.setAside;
    const hideInSafeMode = group.some((h) => h.hideInSafeMode === true) ? true : keeper.hideInSafeMode;
    await hashtagsRepo.put({ ...keeper, name: lowerName, usageCount, setAside, hideInSafeMode });

    for (const h of group) {
      if (h.id === keeper.id) continue;
      await hashtagsRepo.delete(h.id);
      hashtagsMerged++;
    }
  }

  const expenses = await expensesRepo.getAll();
  let expensesUpdated = 0;
  for (const e of expenses) {
    if (e.hashtags.length === 0) continue;
    const lowered: string[] = [];
    for (const tag of e.hashtags) {
      const key = tag.toLowerCase();
      if (!lowered.includes(key)) lowered.push(key);
    }
    const changed = lowered.length !== e.hashtags.length || lowered.some((t, i) => t !== e.hashtags[i]);
    if (changed) {
      await expensesRepo.put({ ...e, hashtags: lowered });
      expensesUpdated++;
    }
  }

  return { hashtagsRenamed, hashtagsMerged, expensesUpdated };
}
