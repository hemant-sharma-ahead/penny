import type { Account } from '@/core/db/types';

/**
 * App-wide rule: no two accounts may ever share the same (trimmed, case-insensitive) name — a
 * confirmed data-integrity gap found via the CSV import flow (silently creating a second "HDFC1234"
 * account instead of reusing the real one), but the rule applies everywhere an account gets created,
 * not just import. Returns the existing account with a matching name (excluding `excludeId`, so
 * editing an account's own name doesn't flag itself), or `undefined` if the name is free to use.
 */
export function findDuplicateAccountName(name: string, accounts: Account[], excludeId?: string): Account | undefined {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return undefined;
  return accounts.find((a) => a.id !== excludeId && a.name.trim().toLowerCase() === trimmed);
}
