import type { InsurerCategory, InsurerMemory } from '@/core/db/types';

// Local "remembered custom insurer" suggestions (insurance-redesign-v4.html §⑤) — mirrors
// `core/expenses/merchantMemory.ts`'s exact normalize/key/build/search shape, scoped by
// `InsurerCategory` instead of `TransactionType`. Pure helpers only — Dexie/repo access stays in the
// hook layer (`useInsurance.ts`).

/** Normalises a raw insurer name into a stable key: lowercased, trimmed, inner whitespace collapsed,
 *  surrounding punctuation stripped. Returns '' for blank input. */
export function normalizeInsurerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Store id for an insurer memory record — `${category}::${normalizedName}`, empty when name is blank. */
export function insurerMemoryKey(category: InsurerCategory, name: string): string {
  const norm = normalizeInsurerName(name);
  return norm ? `${category}::${norm}` : '';
}

/** Builds the memory record to persist after a policy with a custom "Other" insurer is saved, or null
 *  when the name is blank. `usageCount` increments from the previous record for that exact
 *  (category + name) mapping. */
export function buildInsurerMemory(
  category: InsurerCategory,
  name: string,
  previous?: InsurerMemory
): InsurerMemory | null {
  const id = insurerMemoryKey(category, name);
  if (!id) return null;
  return {
    id,
    name: name.trim(),
    category,
    usageCount: (previous?.usageCount ?? 0) + 1,
    updatedAt: Date.now()
  };
}

/** All remembered suggestions for a category, ranked by usage then recency — shown as tappable chips
 *  under "Other" (insurance-redesign-v4.html §⑤'s "Used before — tap to reuse"). */
export function insurerSuggestionsForCategory(
  memories: InsurerMemory[],
  category: InsurerCategory,
  limit = 6
): InsurerMemory[] {
  return memories
    .filter((m) => m.category === category)
    .sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/** Type-ahead search over remembered insurers: substring match on the normalized name, ranked by usage
 *  then recency. Mirrors `searchMerchantMemories`. */
export function searchInsurerMemories(
  memories: InsurerMemory[],
  category: InsurerCategory,
  query: string,
  limit = 5
): InsurerMemory[] {
  const q = normalizeInsurerName(query);
  if (!q) return [];
  return memories
    .filter((m) => m.category === category && normalizeInsurerName(m.name).includes(q))
    .sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
