// Fuzzy "same account, written two ways?" merge suggestion for the import review screen's Accounts
// section — pairs two SOURCE names from the SAME uploaded file (e.g. "HDFC1234" and "HDFC-x1234")
// that likely refer to the same real-world account. This is a nice-to-have UI suggestion (its absence
// must never block import), not a rule the rest of the app depends on.
//
// Pure platform-agnostic logic (no RN/DOM APIs) — ported verbatim from
// apps/web-react/src/features/import/review/accountMergeSuggestion.ts. The `normalize()` heuristic
// itself lives in packages/core/src/core/import/importAccountResolution.ts since it's also used there
// to fuzzy-match a source name against REAL EXISTING accounts, not just other source names in this file.
import { normalize } from '@/core/import/importAccountResolution';

export interface AccountMergeSuggestion {
  sourceA: string;
  sourceB: string;
  /** The longer of the two source names, used as-is for the suggested merged account name. */
  mergedName: string;
}

/** One suggestion per pair of distinct source names that normalise to the same value. Each source
 *  name is used in at most one suggestion. */
export function suggestAccountMerges(sourceNames: string[]): AccountMergeSuggestion[] {
  const suggestions: AccountMergeSuggestion[] = [];
  const used = new Set<string>();

  for (let i = 0; i < sourceNames.length; i++) {
    const a = sourceNames[i];
    if (!a || used.has(a)) continue;
    for (let j = i + 1; j < sourceNames.length; j++) {
      const b = sourceNames[j];
      if (!b || used.has(b) || a === b) continue;
      if (normalize(a) !== normalize(b)) continue;

      suggestions.push({ sourceA: a, sourceB: b, mergedName: a.length >= b.length ? a : b });
      used.add(a);
      used.add(b);
      break;
    }
  }

  return suggestions;
}
