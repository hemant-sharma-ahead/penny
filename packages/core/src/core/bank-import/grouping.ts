import type { BankNarrationOverride } from '@/core/db/types';
import { normalizeNarration } from './normalization';
import type { ParsedStatementRow } from './types';

export interface MerchantGroup {
  normalizedKey: string;
  rows: ParsedStatementRow[];
}

/**
 * Groups "not yet logged" statement rows by normalized merchant key (docs/plans/bank-statement-import.md
 * §7) — e.g. "ZOMATO · 7 transactions" — for the bulk-categorization UI. Sorted largest-group-first
 * so the biggest time-saver surfaces at the top.
 */
export function groupUnmatchedByMerchant(
  rows: ParsedStatementRow[],
  overrides: BankNarrationOverride[] = []
): MerchantGroup[] {
  const groups = new Map<string, ParsedStatementRow[]>();
  for (const row of rows) {
    const key = normalizeNarration(row.rawNarration, overrides);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .map(([normalizedKey, groupRows]) => ({ normalizedKey, rows: groupRows }))
    .sort((a, b) => b.rows.length - a.rows.length);
}
