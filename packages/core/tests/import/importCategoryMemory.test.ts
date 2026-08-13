import { describe, expect, it } from 'vitest';
import {
  computeRememberedSuggestions,
  mergeRememberedCategories,
  normalizeSourceName,
  type CategoryMemoryMap
} from '@/core/import/importCategoryMemory';
import type { CategoryResolution } from '@/core/import/importCategoryResolution';
import type { ExpenseCategory } from '@/core/db/types';

const categories: ExpenseCategory[] = [
  { id: 'cat-food', name: 'Food & Dining', icon: 'ti-food', color: '#fff', isDefault: true, createdAt: 0 },
  { id: 'cat-travel', name: 'Travel', icon: 'ti-plane', color: '#fff', isDefault: true, createdAt: 0 }
];

describe('normalizeSourceName', () => {
  it('trims and lowercases', () => {
    expect(normalizeSourceName('  Swiggy Order  ')).toBe('swiggy order');
  });
});

describe('computeRememberedSuggestions', () => {
  it('suggests a remembered category for a matching (normalized) source name', () => {
    const memory: CategoryMemoryMap = {
      'swiggy order': { categoryId: 'cat-food', categoryName: 'Food & Dining', updatedAt: 1 }
    };
    const result = computeRememberedSuggestions(['Swiggy Order'], memory, categories);
    expect(result.get('Swiggy Order')).toEqual({ categoryId: 'cat-food', categoryName: 'Food & Dining' });
  });

  it('is case/whitespace-insensitive on the lookup key', () => {
    const memory: CategoryMemoryMap = {
      'swiggy order': { categoryId: 'cat-food', categoryName: 'Food & Dining', updatedAt: 1 }
    };
    const result = computeRememberedSuggestions(['  SWIGGY ORDER  '], memory, categories);
    expect(result.get('  SWIGGY ORDER  ')).toEqual({ categoryId: 'cat-food', categoryName: 'Food & Dining' });
  });

  it('never suggests a remembered category whose id no longer exists (deleted/renamed since)', () => {
    const memory: CategoryMemoryMap = {
      'swiggy order': { categoryId: 'cat-deleted', categoryName: 'Ghost', updatedAt: 1 }
    };
    const result = computeRememberedSuggestions(['Swiggy Order'], memory, categories);
    expect(result.has('Swiggy Order')).toBe(false);
  });

  it('omits a source name with no remembered entry at all', () => {
    const result = computeRememberedSuggestions(['Brand New Merchant'], {}, categories);
    expect(result.size).toBe(0);
  });
});

describe('mergeRememberedCategories', () => {
  it('remembers an "existing" resolution by its final category', () => {
    const resolutions: Pick<CategoryResolution, 'sourceName' | 'suggestion'>[] = [
      { sourceName: 'Uber', suggestion: { kind: 'existing', categoryId: 'cat-travel', categoryName: 'Travel' } }
    ];
    const next = mergeRememberedCategories(
      {},
      resolutions,
      () => ({ categoryId: 'cat-travel', categoryName: 'Travel' }),
      123
    );
    expect(next.uber).toEqual({ categoryId: 'cat-travel', categoryName: 'Travel', updatedAt: 123 });
  });

  it('remembers a "create" resolution using the REAL post-creation category id, not a placeholder', () => {
    const resolutions: Pick<CategoryResolution, 'sourceName' | 'suggestion'>[] = [
      {
        sourceName: 'Zomato',
        suggestion: { kind: 'create', suggestedName: 'Zomato', suggestedIntentGroup: 'daily_living' }
      }
    ];
    const next = mergeRememberedCategories(
      {},
      resolutions,
      () => ({ categoryId: 'cat-new-real-id', categoryName: 'Zomato' }),
      100
    );
    expect(next.zomato).toEqual({ categoryId: 'cat-new-real-id', categoryName: 'Zomato', updatedAt: 100 });
  });

  it('skips "skip" and "transfer" resolutions — never meaningful to remember', () => {
    const resolutions: Pick<CategoryResolution, 'sourceName' | 'suggestion'>[] = [
      { sourceName: 'A/c to A/c', suggestion: { kind: 'skip' } },
      {
        sourceName: 'Balance Correction',
        suggestion: { kind: 'transfer', categoryId: 'cat-tr', categoryName: 'Other Transfer', toAccountId: 'acc-1' }
      }
    ];
    const next = mergeRememberedCategories({}, resolutions, () => ({ categoryId: 'x', categoryName: 'y' }));
    expect(Object.keys(next)).toHaveLength(0);
  });

  it('skips a resolution when resolveFinalCategory returns undefined (e.g. a "create" whose category never actually got created)', () => {
    const resolutions: Pick<CategoryResolution, 'sourceName' | 'suggestion'>[] = [
      { sourceName: 'Ghost', suggestion: { kind: 'create', suggestedName: 'Ghost', suggestedIntentGroup: 'other' } }
    ];
    const next = mergeRememberedCategories({}, resolutions, () => undefined);
    expect(Object.keys(next)).toHaveLength(0);
  });

  it('preserves unrelated existing entries while merging in new ones', () => {
    const existing: CategoryMemoryMap = {
      swiggy: { categoryId: 'cat-food', categoryName: 'Food & Dining', updatedAt: 1 }
    };
    const resolutions: Pick<CategoryResolution, 'sourceName' | 'suggestion'>[] = [
      { sourceName: 'Uber', suggestion: { kind: 'existing', categoryId: 'cat-travel', categoryName: 'Travel' } }
    ];
    const next = mergeRememberedCategories(
      existing,
      resolutions,
      () => ({ categoryId: 'cat-travel', categoryName: 'Travel' }),
      5
    );
    expect(next.swiggy).toEqual({ categoryId: 'cat-food', categoryName: 'Food & Dining', updatedAt: 1 });
    expect(next.uber).toEqual({ categoryId: 'cat-travel', categoryName: 'Travel', updatedAt: 5 });
  });
});
