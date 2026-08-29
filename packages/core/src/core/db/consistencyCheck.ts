/**
 * Referential-integrity consistency checker (2026-08-29, DB-structure review — see
 * `docs/ARCHITECTURE.md`'s matching decision entry). None of the "FK" relationships drawn in that
 * review's ER diagram are enforced by the database itself — every table but `expenses` is an opaque
 * encrypted blob, and even `expenses`' 5 indexed columns are plain values, not real SQL
 * `FOREIGN KEY` constraints. This is the cheap, low-risk alternative that was chosen over a full
 * per-field-encryption restructure: a scan, run after decryption, over the relationships that have
 * actually caused real bugs before (IOU's `purgePerson` cascading into `Expense` rows it shouldn't
 * have; `matcher.ts`'s reverted double-claim bug; orphaned `group_events` on expense delete).
 *
 * This never runs automatically in the app — it's a `vitest` regression gate (see
 * `tests/db/consistencyCheck.test.ts`) and, if ever wired up, a candidate for an on-device
 * "data health check" diagnostic. It only ever reports; it never repairs anything.
 */
import {
  accountsRepo,
  bankStatementImportsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  goalContributionsRepo,
  goalsRepo,
  groupMembersRepo,
  groupsRepo,
  ledgerEntriesRepo,
  personsRepo,
  smsTransactionsRepo
} from './repositories';

export interface OrphanedReference {
  /** The table holding the dangling reference. */
  table: string;
  /** The `id` of the record holding the dangling reference. */
  id: string;
  /** The field on that record that points nowhere. */
  field: string;
  /** The table the field is supposed to reference. */
  referencedTable: string;
  /** The id value that couldn't be found in `referencedTable`. */
  referencedId: string;
}

/**
 * Scans every FK-shaped relationship this codebase actually relies on (see the ER diagram in
 * `docs/ARCHITECTURE.md`'s 2026-08-29 decision entry) and reports any reference pointing at an id
 * that doesn't exist in the table it's supposed to reference. Read-only — never mutates anything.
 *
 * Deliberately NOT checked here (see that same decision entry for the reasoning): `hashtags`
 * (matched by name, not id — not a real FK to begin with), `ACTIVITY_LOG.entityId` (genuinely
 * polymorphic, can't be checked against one table), `bankId` fields (a shared enum, not a table
 * reference), and every table's own `categoryId`/`accountId`/`paymentMode` fields on
 * `subscriptions`/`transaction_templates`/`merchant_memory`/`sms_transactions` (secondary,
 * lower-risk conveniences — not part of any bug this checker was built to catch; add them here if
 * that changes).
 */
export async function findOrphanedReferences(): Promise<OrphanedReference[]> {
  const [
    expenses,
    accounts,
    categories,
    goals,
    goalContributions,
    persons,
    ledgerEntries,
    groups,
    groupMembers,
    bankStatementImports,
    smsTransactions
  ] = await Promise.all([
    expensesRepo.getAll(),
    accountsRepo.getAll(),
    expenseCategoriesRepo.getAll(),
    goalsRepo.getAll(),
    goalContributionsRepo.getAll(),
    personsRepo.getAll(),
    ledgerEntriesRepo.getAll(),
    groupsRepo.getAll(),
    groupMembersRepo.getAll(),
    bankStatementImportsRepo.getAll(),
    smsTransactionsRepo.getAll()
  ]);

  const accountIds = new Set(accounts.map((a) => a.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const expenseIds = new Set(expenses.map((e) => e.id));
  const goalIds = new Set(goals.map((g) => g.id));
  const personIds = new Set(persons.map((p) => p.id));
  const groupIds = new Set(groups.map((g) => g.id));

  const issues: OrphanedReference[] = [];
  const check = (
    table: string,
    id: string,
    field: string,
    referencedTable: string,
    referencedId: string | undefined,
    referencedSet: Set<string>
  ) => {
    if (referencedId !== undefined && !referencedSet.has(referencedId)) {
      issues.push({ table, id, field, referencedTable, referencedId });
    }
  };

  for (const e of expenses) {
    check('expenses', e.id, 'accountId', 'accounts', e.accountId, accountIds);
    check('expenses', e.id, 'toAccountId', 'accounts', e.toAccountId, accountIds);
    check('expenses', e.id, 'categoryId', 'expense_categories', e.categoryId, categoryIds);
  }

  for (const c of categories) {
    check('expense_categories', c.id, 'parentId', 'expense_categories', c.parentId, categoryIds);
  }

  for (const gc of goalContributions) {
    check('goal_contributions', gc.id, 'goalId', 'goals', gc.goalId, goalIds);
    check('goal_contributions', gc.id, 'linkedTxnId', 'expenses', gc.linkedTxnId, expenseIds);
  }

  for (const le of ledgerEntries) {
    check('ledger_entries', le.id, 'personId', 'persons', le.personId, personIds);
    check('ledger_entries', le.id, 'linkedTxnId', 'expenses', le.linkedTxnId, expenseIds);
  }

  for (const p of persons) {
    check('persons', p.id, 'promotedToGroupId', 'groups', p.promotedToGroupId, groupIds);
  }

  for (const gm of groupMembers) {
    check('group_members', gm.id, 'linkedPersonId', 'persons', gm.linkedPersonId, personIds);
  }

  for (const bsi of bankStatementImports) {
    check('bank_statement_imports', bsi.id, 'accountId', 'accounts', bsi.accountId, accountIds);
    check('bank_statement_imports', bsi.id, 'linkedTxnId', 'expenses', bsi.linkedTxnId, expenseIds);
  }

  for (const sms of smsTransactions) {
    check('sms_transactions', sms.id, 'accountId', 'accounts', sms.accountId, accountIds);
    check('sms_transactions', sms.id, 'linkedTxnId', 'expenses', sms.linkedTxnId, expenseIds);
  }

  return issues;
}
