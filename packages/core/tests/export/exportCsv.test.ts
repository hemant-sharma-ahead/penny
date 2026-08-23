import { describe, expect, it } from 'vitest';
import { exportExpensesAsCsv } from '@/core/export/exportCsv.shared';
import type { Account, Expense, ExpenseCategory } from '@/core/db/types';

const CATEGORIES: ExpenseCategory[] = [
  { id: 'cat-groceries', name: 'Groceries', icon: 'ti-shopping-cart', color: '#000', isDefault: true, createdAt: 0 }
];

const ACCOUNTS: Account[] = [
  {
    id: 'acc-1',
    name: 'HDFC Savings',
    type: 'bank',
    openingBalance: 0,
    color: '#000',
    icon: 'ti-building-bank',
    includeInNetWorth: true
  }
];

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'e1',
    amount: 450,
    categoryId: 'cat-groceries',
    description: 'Groceries from DMart',
    date: new Date(2026, 5, 14).getTime(),
    hashtags: [],
    isRecurring: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe('exportExpensesAsCsv', () => {
  it('writes the original 8-column shape with blank Account/IOU Person/Shared To Group when no context is passed (frozen apps/web-react call shape)', () => {
    const csv = exportExpensesAsCsv([makeExpense({})], CATEGORIES);
    const [header, row] = csv.split('\n');
    expect(header).toBe(
      'Date,Amount,Description,Category,Type,PaymentMode,Tags,Notes,Account,IOU Person,Shared To Group'
    );
    expect(row).toBe('14/06/2026,450.00,Groceries from DMart,Groceries,expense,,,,,,');
  });

  it('resolves the Account column from accountId via the accounts lookup', () => {
    const csv = exportExpensesAsCsv([makeExpense({ accountId: 'acc-1' })], CATEGORIES, { accounts: ACCOUNTS });
    const [, row] = csv.split('\n');
    expect(row).toContain(',HDFC Savings,');
  });

  it('leaves the Account column blank when accountId has no match in the lookup', () => {
    const csv = exportExpensesAsCsv([makeExpense({ accountId: 'unknown-acc' })], CATEGORIES, { accounts: ACCOUNTS });
    const [, row] = csv.split('\n');
    expect(row?.split(',')[8]).toBe('');
  });

  it('resolves the IOU Person column from the expenseId → personName map', () => {
    const csv = exportExpensesAsCsv([makeExpense({ id: 'e1' })], CATEGORIES, {
      iouPersonByExpenseId: new Map([['e1', 'Rahul']])
    });
    const [, row] = csv.split('\n');
    expect(row?.split(',')[9]).toBe('Rahul');
  });

  it('leaves the IOU Person column blank when the expense has no ledger link', () => {
    const csv = exportExpensesAsCsv([makeExpense({ id: 'e1' })], CATEGORIES, {
      iouPersonByExpenseId: new Map([['some-other-id', 'Rahul']])
    });
    const [, row] = csv.split('\n');
    expect(row?.split(',')[9]).toBe('');
  });

  it('writes an informational "Shared to: X" note for a single shared group', () => {
    const csv = exportExpensesAsCsv([makeExpense({ shareWith: ['grp-1'] })], CATEGORIES, {
      groupNameById: new Map([['grp-1', 'Trip to Goa']])
    });
    const [, row] = csv.split('\n');
    expect(row).toContain('Shared to: Trip to Goa');
  });

  it('comma-joins multiple shared groups in the informational note', () => {
    const csv = exportExpensesAsCsv([makeExpense({ shareWith: ['grp-1', 'grp-2'] })], CATEGORIES, {
      groupNameById: new Map([
        ['grp-1', 'Trip to Goa'],
        ['grp-2', 'Flatmates']
      ])
    });
    const [, row] = csv.split('\n');
    expect(row?.endsWith('"Shared to: Trip to Goa, Flatmates"')).toBe(true);
  });

  it('drops an unresolvable group id from the note rather than showing a blank/garbage entry', () => {
    const csv = exportExpensesAsCsv([makeExpense({ shareWith: ['grp-1', 'grp-unknown'] })], CATEGORIES, {
      groupNameById: new Map([['grp-1', 'Trip to Goa']])
    });
    const [, row] = csv.split('\n');
    expect(row).toContain('Shared to: Trip to Goa');
    expect(row).not.toContain('undefined');
  });
});
