import { describe, expect, it } from 'vitest';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { calcTxnCountByCategory } from '@/core/expenses/filterAndAggregate';
import { buildParentCategoryMap, groupKey, groupMeta } from '@/core/expenses/categoryGroups';

function cat(over: Partial<ExpenseCategory>): ExpenseCategory {
  return {
    id: 'cat-x',
    name: 'X',
    icon: 'ti-dots',
    color: '#000',
    isDefault: false,
    createdAt: 0,
    ...over
  };
}

function txn(categoryId: string): Expense {
  return {
    id: crypto.randomUUID(),
    amount: 100,
    categoryId,
    description: 'd',
    date: Date.now(),
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    source: 'manual',
    createdAt: 0,
    updatedAt: 0
  };
}

describe('calcTxnCountByCategory', () => {
  it('counts all transactions per category (any type)', () => {
    const counts = calcTxnCountByCategory([txn('a'), txn('a'), txn('b')]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.get('c')).toBeUndefined();
  });
});

describe('groupKey', () => {
  it('prefers a custom parent over the fixed intent group', () => {
    expect(groupKey(cat({ parentId: 'catgrp-1', intentGroup: 'daily_living' }))).toBe('catgrp-1');
  });

  it('falls back to intent group, then to "other"', () => {
    expect(groupKey(cat({ intentGroup: 'health' }))).toBe('health');
    expect(groupKey(cat({}))).toBe('other');
  });
});

describe('groupMeta', () => {
  const parent = cat({ id: 'catgrp-1', name: 'Side Business', color: '#abc', isGroup: true });
  const parentMap = buildParentCategoryMap([parent, cat({ id: 'cat-child', parentId: 'catgrp-1' })]);

  it('uses the parent category name + color for custom groups', () => {
    expect(groupMeta('catgrp-1', parentMap)).toEqual({ label: 'Side Business', color: '#abc' });
  });

  it('uses the fixed intent group meta for built-in keys', () => {
    expect(groupMeta('daily_living', parentMap).label).toBe('Daily Living');
  });

  it('falls back to Other for unknown keys', () => {
    expect(groupMeta('nope', parentMap)).toEqual({ label: 'Other', color: '#6b7280' });
  });
});

describe('buildParentCategoryMap', () => {
  it('includes only categories flagged isGroup', () => {
    const map = buildParentCategoryMap([
      cat({ id: 'catgrp-1', isGroup: true }),
      cat({ id: 'cat-leaf' })
    ]);
    expect(map.has('catgrp-1')).toBe(true);
    expect(map.has('cat-leaf')).toBe(false);
  });
});
