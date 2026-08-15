import { describe, expect, it } from 'vitest';
import {
  splitByCounterparty,
  shouldSplitByCounterparty,
  normalizeCounterparty,
  RESIDUAL_COUNTERPARTY_GROUP_KEY,
  RESIDUAL_COUNTERPARTY_LABEL
} from '@/core/import/importCounterpartySplit';
import type { DirectionalCategoryResolution } from '@/core/import/importCategoryResolution';
import type { ParsedRow } from '@/core/import/importParsers';
import type { Person } from '@/core/db/types';

function row(description: string, overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    date: 0,
    amount: 100,
    description,
    categoryName: 'A/c to A/c',
    type: 'expense',
    hashtags: [],
    ...overrides
  };
}

const parent: Pick<DirectionalCategoryResolution, 'key' | 'sourceName' | 'type' | 'suggestion'> = {
  key: 'A/c to A/c::expense',
  sourceName: 'A/c to A/c',
  type: 'expense',
  suggestion: { kind: 'transfer', categoryId: 'cat-tr-other', categoryName: 'Other Transfer', toAccountId: '' }
};

const persons: Person[] = [
  { id: 'p-1', name: 'Person A', createdAt: 0, updatedAt: 0 },
  { id: 'p-2', name: 'Person B', createdAt: 0, updatedAt: 0 }
];

describe('shouldSplitByCounterparty', () => {
  it('gates on transfer-suspect or IOU-suspect only', () => {
    expect(shouldSplitByCounterparty({ isTransferSuspect: true, isIouSuspect: false })).toBe(true);
    expect(shouldSplitByCounterparty({ isTransferSuspect: false, isIouSuspect: true })).toBe(true);
    expect(shouldSplitByCounterparty({ isTransferSuspect: false, isIouSuspect: false })).toBe(false);
  });
});

describe('normalizeCounterparty', () => {
  it('uppercases and strips reference-number noise/digits', () => {
    expect(normalizeCounterparty('Person A')).toBe('PERSON A');
    expect(normalizeCounterparty('person a')).toBe(normalizeCounterparty('Person A'));
  });

  it('returns empty for a purely numeric/reference-shaped candidate', () => {
    expect(normalizeCounterparty('88213')).toBe('');
  });
});

describe('splitByCounterparty', () => {
  it('splits one category into 2+ independently-resolvable counterparty groups', () => {
    const rows = [row('Person A'), row('Person A'), row('Person B'), row('Person B'), row('Person B')];
    const groups = splitByCounterparty(rows, parent, []);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const a = groups.find((g) => g.displayLabel === 'Person A');
    const b = groups.find((g) => g.displayLabel === 'Person B');
    expect(a?.count).toBe(2);
    expect(b?.count).toBe(3);
    // Independently resolvable — distinct group keys, distinct row-index sets.
    expect(a?.groupKey).not.toBe(b?.groupKey);
  });

  it('marks a normalized match against an existing Person record as high confidence', () => {
    const rows = [row('Person A'), row('Person A')];
    const groups = splitByCounterparty(rows, parent, persons);
    const group = groups[0];
    expect(group?.confidence).toBe('high');
    expect(group?.personMatch).toMatchObject({ personId: 'p-1', personName: 'Person A' });
    expect(group?.displayLabel).toBe('Person A');
  });

  it('falls back to a low-confidence editable candidate when no Person matches', () => {
    const rows = [row('XFR REF 88213'), row('XFR REF 88214')];
    const groups = splitByCounterparty(rows, parent, persons);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.confidence).toBe('low');
    expect(groups[0]?.personMatch).toBeUndefined();
    // Display label is a representative RAW sample, not the normalized/stripped key — a real name
    // (or reference text) is never shown mangled to the user.
    expect(groups[0]?.displayLabel).toBe('XFR REF 88213');
  });

  it('lands blank/generic self-transfer descriptions in the residual "(no clear person)" group', () => {
    const rows = [row(''), row('Self'), row('  ')];
    const groups = splitByCounterparty(rows, parent, persons);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.groupKey).toBe(RESIDUAL_COUNTERPARTY_GROUP_KEY);
    expect(groups[0]?.displayLabel).toBe(RESIDUAL_COUNTERPARTY_LABEL);
    expect(groups[0]?.confidence).toBe('residual');
    expect(groups[0]?.count).toBe(3);
  });

  it('only includes rows belonging to the given parent key (sourceName + direction)', () => {
    const rows = [
      row('Person A', { categoryName: 'A/c to A/c', type: 'expense' }),
      row('Person A', { categoryName: 'A/c to A/c', type: 'income' }), // different direction — excluded
      row('Person A', { categoryName: 'Some Other Category', type: 'expense' }) // different source — excluded
    ];
    const groups = splitByCounterparty(rows, parent, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(1);
  });

  it("inherits the parent resolution's suggestion as each group's starting suggestion", () => {
    const rows = [row('Person A')];
    const groups = splitByCounterparty(rows, parent, []);
    expect(groups[0]?.suggestion).toEqual(parent.suggestion);
  });

  describe('candidateIndices (code-review perf fix)', () => {
    it('produces the IDENTICAL result whether scanning every row or just a pre-filtered candidate list', () => {
      const rows = [
        row('Person A'),
        row('Other Category Row', { categoryName: 'Groceries' }), // not a candidate — would be excluded anyway
        row('Person A'),
        row('Person B'),
        row('Wrong Direction', { type: 'income' }) // not a candidate — would be excluded anyway
      ];
      const candidateIndices = [0, 2, 3]; // pre-filtered to exactly the rows matching `parent`
      const fullScan = splitByCounterparty(rows, parent, persons);
      const scoped = splitByCounterparty(rows, parent, persons, candidateIndices);
      expect(scoped).toEqual(fullScan);
    });

    it('still applies the sourceName/type filter defensively even if a candidate index does not actually match', () => {
      const rows = [row('Person A'), row('Wrong Category', { categoryName: 'Groceries' })];
      // Deliberately passes an index that does NOT belong to `parent` — must not corrupt the result.
      const groups = splitByCounterparty(rows, parent, persons, [0, 1]);
      expect(groups).toHaveLength(1);
      expect(groups[0]?.count).toBe(1);
    });

    it('an empty candidateIndices array yields zero groups, not a fall-through full scan', () => {
      const rows = [row('Person A'), row('Person A')];
      expect(splitByCounterparty(rows, parent, persons, [])).toEqual([]);
    });
  });
});
