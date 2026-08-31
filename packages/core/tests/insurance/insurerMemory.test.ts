import { describe, expect, it } from 'vitest';
import {
  normalizeInsurerName,
  insurerMemoryKey,
  buildInsurerMemory,
  insurerSuggestionsForCategory,
  searchInsurerMemories
} from '@/core/insurance/insurerMemory';
import type { InsurerMemory } from '@/core/db/types';

describe('normalizeInsurerName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeInsurerName('  Universal   Sompo General ')).toBe('universal sompo general');
  });

  it('strips surrounding punctuation but keeps inner characters', () => {
    expect(normalizeInsurerName('*Shriram General*')).toBe('shriram general');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeInsurerName('   ')).toBe('');
  });
});

describe('insurerMemoryKey', () => {
  it('namespaces by category', () => {
    expect(insurerMemoryKey('general', 'Universal Sompo General')).toBe('general::universal sompo general');
    expect(insurerMemoryKey('life', 'Universal Sompo General')).toBe('life::universal sompo general');
  });

  it('is empty for a blank name', () => {
    expect(insurerMemoryKey('general', '  ')).toBe('');
  });
});

describe('buildInsurerMemory', () => {
  it('creates a new memory with usageCount 1', () => {
    const m = buildInsurerMemory('general', 'Universal Sompo General');
    expect(m).toMatchObject({
      id: 'general::universal sompo general',
      name: 'Universal Sompo General',
      category: 'general',
      usageCount: 1
    });
  });

  it('increments usageCount from a previous record', () => {
    const prev: InsurerMemory = {
      id: 'general::universal sompo general',
      name: 'Universal Sompo General',
      category: 'general',
      usageCount: 3,
      updatedAt: 0
    };
    const m = buildInsurerMemory('general', 'Universal Sompo General', prev);
    expect(m?.usageCount).toBe(4);
  });

  it('returns null for a blank name', () => {
    expect(buildInsurerMemory('general', '   ')).toBeNull();
  });
});

describe('insurerSuggestionsForCategory / searchInsurerMemories', () => {
  const memories: InsurerMemory[] = [
    { id: 'general::a', name: 'Universal Sompo General', category: 'general', usageCount: 5, updatedAt: 100 },
    { id: 'general::b', name: 'Shriram General', category: 'general', usageCount: 2, updatedAt: 200 },
    { id: 'life::c', name: 'Some Life Co', category: 'life', usageCount: 9, updatedAt: 50 }
  ];

  it('scopes suggestions to the given category, ranked by usage then recency', () => {
    const out = insurerSuggestionsForCategory(memories, 'general');
    expect(out.map((m) => m.name)).toEqual(['Universal Sompo General', 'Shriram General']);
  });

  it('searches within a category by substring', () => {
    expect(searchInsurerMemories(memories, 'general', 'shri').map((m) => m.name)).toEqual(['Shriram General']);
    expect(searchInsurerMemories(memories, 'life', 'shri')).toEqual([]);
  });

  it('returns empty for a blank query', () => {
    expect(searchInsurerMemories(memories, 'general', '  ')).toEqual([]);
  });
});
