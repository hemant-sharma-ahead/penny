import type { Expense, MerchantMemory, TransactionType } from '@/core/db/types';

// Local merchant memory (Track 6): remembers the category/account/payment last
// used for a merchant so the Add-transaction form can auto-fill the next match.
// Pure helpers only — Dexie access stays in the repository/hook layer.

/**
 * Normalises a raw description into a stable merchant key: lowercased, trimmed,
 * inner whitespace collapsed, surrounding punctuation stripped. Returns '' for
 * blank input.
 */
export function normalizeMerchant(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * Store id for a merchant memory record — keyed by type + merchant + category so
 * a merchant logged under different categories keeps a record per category (each
 * surfaces as its own ranked suggestion). Empty when description/category blank.
 */
export function memoryKey(type: TransactionType, description: string, categoryId: string): string {
  const norm = normalizeMerchant(description);
  return norm && categoryId ? `${type}::${norm}::${categoryId}` : '';
}

/**
 * Builds the memory record to persist after an expense/income is saved, or null
 * when the transaction isn't a useful memory (transfer, blank description, or no
 * category). `usageCount` increments from the previous record for that exact
 * (merchant + category) mapping.
 */
export function buildMemory(expense: Expense, previous?: MerchantMemory): MerchantMemory | null {
  const type = expense.type ?? 'expense';
  if (type === 'transfer') return null;
  const id = memoryKey(type, expense.description, expense.categoryId);
  if (!id) return null;
  return {
    id,
    description: expense.description.trim(),
    type,
    categoryId: expense.categoryId,
    ...(expense.accountId && { accountId: expense.accountId }),
    ...(expense.paymentMode && { paymentMode: expense.paymentMode }),
    usageCount: (previous?.usageCount ?? 0) + 1,
    updatedAt: Date.now()
  };
}

/**
 * Derives merchant memories from existing transaction history — used for the
 * one-time backfill so suggestions work from day one. One record per (merchant +
 * category); category/account/payment come from the most recent matching txn and
 * `usageCount` is the number of matches.
 */
export function buildMemoriesFromExpenses(expenses: Expense[]): MerchantMemory[] {
  const byKey = new Map<string, { latest: Expense; count: number }>();
  for (const e of expenses) {
    const type = e.type ?? 'expense';
    if (type === 'transfer') continue;
    const id = memoryKey(type, e.description, e.categoryId);
    if (!id) continue;
    const cur = byKey.get(id);
    if (!cur) {
      byKey.set(id, { latest: e, count: 1 });
    } else {
      cur.count += 1;
      if (e.date > cur.latest.date) cur.latest = e;
    }
  }
  return [...byKey.entries()].map(([id, { latest, count }]) => ({
    id,
    description: latest.description.trim(),
    type: latest.type ?? 'expense',
    categoryId: latest.categoryId,
    ...(latest.accountId && { accountId: latest.accountId }),
    ...(latest.paymentMode && { paymentMode: latest.paymentMode }),
    usageCount: count,
    updatedAt: latest.updatedAt
  }));
}

/**
 * Type-ahead search over remembered merchants: substring match on the normalized
 * description, ranked by usage then recency. Returns the top `limit` mappings —
 * a merchant used under multiple categories yields one row per category.
 */
export function searchMerchantMemories(
  memories: MerchantMemory[],
  type: TransactionType,
  query: string,
  limit = 4
): MerchantMemory[] {
  const q = normalizeMerchant(query);
  if (!q) return [];
  return memories
    .filter((m) => m.type === type && normalizeMerchant(m.description).includes(q))
    .sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
