import type { BankStatementImportRecord, Expense } from '@/core/db/types';

export interface MerchantSuggestion {
  categoryId: string;
  description: string;
  paymentMode?: string | undefined;
  /** How many prior resolved statement lines share this merchant key — shown as "seen N times". */
  usageCount: number;
}

/**
 * Derives a "last used" suggestion for a normalized merchant key by looking at every previously
 * resolved statement line sharing that key and reading the category/description off the
 * transaction it resolved to. Global across all accounts (docs/plans/bank-statement-import.md
 * §9b). Always surfaced as an editable suggestion — never auto-applied. No second table: this
 * queries the one consolidated `bank_statement_imports` store, joined against `expenses` in
 * memory, rather than maintaining its own memory table.
 */
export function suggestForMerchant(
  normalizedKey: string,
  records: BankStatementImportRecord[],
  expensesById: Map<string, Expense>
): MerchantSuggestion | undefined {
  const matches = records
    .filter((r) => r.normalizedKey === normalizedKey)
    .map((r) => expensesById.get(r.linkedTxnId))
    .filter((e): e is Expense => !!e)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const [latest] = matches;
  if (!latest) return undefined;

  return {
    categoryId: latest.categoryId,
    description: latest.description,
    paymentMode: latest.paymentMode,
    usageCount: matches.length
  };
}
