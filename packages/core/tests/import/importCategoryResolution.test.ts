import { describe, expect, it } from 'vitest';
import {
  isLikelyTransfer,
  isLikelyCarryForward,
  suggestIntentGroup,
  resolveCategories
} from '@/core/import/importCategoryResolution';
import type { ExpenseCategory } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';

describe('isLikelyTransfer', () => {
  it('flags real inter-account bookkeeping category names from the sample exports', () => {
    expect(isLikelyTransfer('Balance Correction')).toBe(true);
    expect(isLikelyTransfer('A/c to A/c')).toBe(true);
    expect(isLikelyTransfer('Cash In Hand')).toBe(true);
  });

  it('does not flag genuine spending categories', () => {
    expect(isLikelyTransfer('Groceries')).toBe(false);
    expect(isLikelyTransfer('Dining & Café')).toBe(false);
  });

  it('no longer flags "Cash Forward" — it is a carry-forward marker, not a two-sided transfer (2026-07-29 fix)', () => {
    expect(isLikelyTransfer('Cash Forward')).toBe(false);
  });
});

describe('isLikelyCarryForward', () => {
  it('flags carry-forward/continuity markers from real MoneyView exports', () => {
    expect(isLikelyCarryForward('Cash Forward')).toBe(true);
    expect(isLikelyCarryForward('Brought Forward')).toBe(true);
    expect(isLikelyCarryForward('Balance Brought Forward')).toBe(true);
    expect(isLikelyCarryForward('B/F')).toBe(true);
  });

  it('does not flag genuine spending categories or real transfers', () => {
    expect(isLikelyCarryForward('Groceries')).toBe(false);
    expect(isLikelyCarryForward('Balance Correction')).toBe(false);
  });
});

describe('suggestIntentGroup', () => {
  it('suggests a sensible group from keywords in real sample category names', () => {
    expect(suggestIntentGroup('Mutual fund investment')).toBe('financial');
    expect(suggestIntentGroup('Parents Medical Expenses')).toBe('health');
    expect(suggestIntentGroup('Jaipur Travel')).toBe('travel');
  });

  it('falls back to other for a name matching no keyword', () => {
    expect(suggestIntentGroup('Xyzzy')).toBe('other');
  });
});

const categories: ExpenseCategory[] = [
  { id: 'cat-food', name: 'Dining & Café', icon: 'ti-food', color: '#fff', isDefault: true, createdAt: 0 },
  { id: 'cat-other', name: 'Other', icon: 'ti-dots', color: '#fff', isDefault: true, createdAt: 0 }
];

function row(categoryName: string): ParsedRow {
  return { date: 0, amount: 1, description: 'x', categoryName, type: 'expense', hashtags: [] };
}

describe('resolveCategories', () => {
  it('groups by distinct source category name, most frequent first', () => {
    const rows = [row('Dining'), row('Dining'), row('Travel')];
    const result = resolveCategories(rows, categories);
    expect(result[0]?.sourceName).toBe('Dining');
    expect(result[0]?.count).toBe(2);
    expect(result[1]?.sourceName).toBe('Travel');
    expect(result[1]?.count).toBe(1);
  });

  it('suggests "existing" when the migration map resolves the name', () => {
    const result = resolveCategories([row('dining & cafe')], categories);
    expect(result[0]?.suggestion).toMatchObject({ kind: 'existing', categoryId: 'cat-food' });
  });

  it('suggests "transfer" for a transfer-like source category, never a silent cat-other match', () => {
    const result = resolveCategories([row('Balance Correction')], categories);
    expect(result[0]?.suggestion.kind).toBe('transfer');
  });

  it('no longer suggests "transfer" for "Cash Forward" — falls through to the normal "create" suggestion instead', () => {
    const result = resolveCategories([row('Cash Forward')], categories);
    expect(result[0]?.suggestion).toMatchObject({ kind: 'create', suggestedName: 'Cash Forward' });
  });

  it('suggests "create" (never a silent fallback) for a genuinely unrecognised category', () => {
    const result = resolveCategories([row('Some Random App-Specific Label')], categories);
    expect(result[0]?.suggestion).toMatchObject({ kind: 'create', suggestedName: 'Some Random App-Specific Label' });
  });
});
