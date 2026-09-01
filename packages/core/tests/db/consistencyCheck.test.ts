import { beforeEach, describe, expect, it } from 'vitest';
import { findOrphanedReferences } from '@/core/db/consistencyCheck';
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
} from '@/core/db/repositories';
import { db } from '@/core/db/schema';
import { deriveKey, generateSalt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import type {
  Account,
  BankStatementImportRecord,
  Expense,
  ExpenseCategory,
  Goal,
  GoalContribution,
  Group,
  GroupMember,
  LedgerEntry,
  Person,
  SmsTransactionRecord
} from '@/core/db/types';

async function setupKeystore() {
  const salt = generateSalt();
  const mk = await deriveKey('test-passphrase', salt, 1_000);
  keystore.setMasterKey(mk);
}

const account: Account = {
  id: 'acc-1',
  name: 'Cash',
  type: 'cash',
  openingBalance: 0,
  color: '#000',
  icon: 'ti-wallet',
  includeInNetWorth: true
};

const category: ExpenseCategory = {
  id: 'cat-1',
  name: 'Food',
  icon: 'ti-burger',
  color: '#f00',
  isDefault: true,
  createdAt: 0
};

const expense: Expense = {
  id: 'exp-1',
  amount: 100,
  categoryId: category.id,
  description: 'Lunch',
  date: 0,
  hashtags: [],
  isRecurring: false,
  accountId: account.id,
  createdAt: 0,
  updatedAt: 0
};

const goal: Goal = {
  id: 'goal-1',
  name: 'Trip',
  targetAmount: 10000,
  currentAmount: 0,
  targetDate: 0,
  risk: 'moderate'
};

const person: Person = { id: 'person-1', name: 'Alex', createdAt: 0, updatedAt: 0 };

const group: Group = {
  id: 'group-1',
  type: 'family',
  name: 'Home',
  role: 'owner',
  status: 'active',
  ownerId: 'user-1',
  keyEpoch: 1,
  historyVisibility: 'full',
  joinedAt: 0,
  createdAt: 0,
  updatedAt: 0
};

describe('findOrphanedReferences', () => {
  beforeEach(async () => {
    // Clear the raw tables directly (bypassing every repo, same convention every other test file in
    // this suite uses) — never via getAll()+delete(), which would try to decrypt each table's
    // leftover rows under whatever key this test happens to set up, not the key they were originally
    // written under.
    await Promise.all([
      db.accounts.clear(),
      db.expense_categories.clear(),
      db.expenses.clear(),
      db.goals.clear(),
      db.goal_contributions.clear(),
      db.persons.clear(),
      db.ledger_entries.clear(),
      db.groups.clear(),
      db.group_members.clear(),
      db.bank_statement_imports.clear(),
      db.sms_transactions.clear()
    ]);
    await setupKeystore();
  });

  it('reports no issues on a fully consistent dataset', async () => {
    await accountsRepo.put(account);
    await expenseCategoriesRepo.put(category);
    await expensesRepo.put(expense);
    await goalsRepo.put(goal);
    await personsRepo.put(person);
    await groupsRepo.put(group);

    const contribution: GoalContribution = {
      id: 'gc-1',
      goalId: goal.id,
      amount: 500,
      date: 0,
      origin: 'expense',
      linkedTxnId: expense.id,
      createdAt: 0,
      updatedAt: 0
    };
    const ledgerEntry: LedgerEntry = {
      id: 'le-1',
      personId: person.id,
      kind: 'lent',
      amount: 200,
      date: 0,
      origin: 'expense',
      linkedTxnId: expense.id,
      createdAt: 0,
      updatedAt: 0
    };
    const groupMember: GroupMember = {
      id: `${group.id}:user-1`,
      groupId: group.id,
      userId: 'user-1',
      displayName: 'Alex',
      role: 'owner',
      status: 'active',
      linkedPersonId: person.id,
      joinedAt: 0,
      createdAt: 0,
      updatedAt: 0
    };
    const bankImport: BankStatementImportRecord = {
      id: 'bsi-1',
      batchId: 'batch-1',
      accountId: account.id,
      rawNarration: 'SWIGGY',
      normalizedKey: 'SWIGGY',
      date: 0,
      amount: 100,
      type: 'expense',
      linkedTxnId: expense.id,
      createdAt: 0
    };
    const sms: SmsTransactionRecord = {
      id: 'sms-1',
      contentHash: 'hash-1',
      sender: 'VM-HDFCBK',
      receivedAt: 0,
      accountId: account.id,
      status: 'linked',
      linkedTxnId: expense.id
    };

    await goalContributionsRepo.put(contribution);
    await ledgerEntriesRepo.put(ledgerEntry);
    await groupMembersRepo.put(groupMember);
    await bankStatementImportsRepo.put(bankImport);
    await smsTransactionsRepo.put(sms);

    expect(await findOrphanedReferences()).toEqual([]);
  });

  it('catches a dangling reference on every relationship it checks, and nothing else', async () => {
    // Deliberately do NOT seed accounts/categories/goals/persons/groups — every reference below
    // points at an id that doesn't exist anywhere.
    await expensesRepo.put({ ...expense, accountId: 'ghost-account', categoryId: 'ghost-category' });
    await expenseCategoriesRepo.put({ ...category, parentId: 'ghost-parent-category' });
    await goalContributionsRepo.put({
      id: 'gc-orphan',
      goalId: 'ghost-goal',
      amount: 1,
      date: 0,
      origin: 'manual',
      linkedTxnId: 'ghost-expense',
      createdAt: 0,
      updatedAt: 0
    });
    await ledgerEntriesRepo.put({
      id: 'le-orphan',
      personId: 'ghost-person',
      kind: 'lent',
      amount: 1,
      date: 0,
      origin: 'manual',
      linkedTxnId: 'ghost-expense',
      createdAt: 0,
      updatedAt: 0
    });
    await personsRepo.put({ ...person, promotedToGroupId: 'ghost-group' });
    await groupMembersRepo.put({
      id: 'gm-orphan',
      groupId: 'ghost-group',
      userId: 'user-1',
      displayName: 'Ghost',
      role: 'member',
      status: 'active',
      linkedPersonId: 'ghost-person-2',
      joinedAt: 0,
      createdAt: 0,
      updatedAt: 0
    });
    await bankStatementImportsRepo.put({
      id: 'bsi-orphan',
      batchId: 'batch-1',
      accountId: 'ghost-account-2',
      rawNarration: 'X',
      normalizedKey: 'X',
      date: 0,
      amount: 1,
      type: 'expense',
      linkedTxnId: 'ghost-expense-2',
      createdAt: 0
    });
    await smsTransactionsRepo.put({
      id: 'sms-orphan',
      contentHash: 'hash-2',
      sender: 'VM-HDFCBK',
      receivedAt: 0,
      accountId: 'ghost-account-3',
      status: 'linked',
      linkedTxnId: 'ghost-expense-3'
    });

    const issues = await findOrphanedReferences();
    const byTableField = issues.map((i) => `${i.table}.${i.field}`).sort();

    expect(byTableField).toEqual(
      [
        'bank_statement_imports.accountId',
        'bank_statement_imports.linkedTxnId',
        'expense_categories.parentId',
        'expenses.accountId',
        'expenses.categoryId',
        'goal_contributions.goalId',
        'goal_contributions.linkedTxnId',
        'group_members.linkedPersonId',
        'ledger_entries.linkedTxnId',
        'ledger_entries.personId',
        'persons.promotedToGroupId',
        'sms_transactions.accountId',
        'sms_transactions.linkedTxnId'
      ].sort()
    );
  });

  it('does not flag an optional reference left undefined', async () => {
    // `toAccountId` (transfers only) and every other optional FK-shaped field should be silently
    // skipped when absent — only a PRESENT-but-dangling value is ever a real issue.
    const { accountId: _accountId, ...expenseWithoutAccount } = expense;
    void _accountId;
    await expensesRepo.put({ ...expenseWithoutAccount, categoryId: category.id });
    await expenseCategoriesRepo.put(category);

    expect(await findOrphanedReferences()).toEqual([]);
  });
});
