import { describe, it, expect } from 'vitest';
import { computeMood } from '@/core/sentiment/aggregate';
import type { ScoredHeadline } from '@/core/sentiment/types';

function make(label: ScoredHeadline['label']): ScoredHeadline {
  const score = label === 'positive' ? 2 : label === 'negative' ? -2 : 0;
  return { score, label, matched: [] };
}

describe('computeMood', () => {
  it('returns quiet for no headlines', () => {
    const m = computeMood([]);
    expect(m.skew).toBe('quiet');
    expect(m.total).toBe(0);
  });

  it('counts positive/negative/neutral', () => {
    const m = computeMood([make('positive'), make('positive'), make('negative'), make('neutral')]);
    expect(m.positive).toBe(2);
    expect(m.negative).toBe(1);
    expect(m.neutral).toBe(1);
    expect(m.total).toBe(4);
    expect(m.net).toBe(1);
  });

  it('leans positive when positives clearly dominate', () => {
    const m = computeMood([make('positive'), make('positive'), make('positive'), make('neutral')]);
    expect(m.skew).toBe('positive');
    expect(m.label).toMatch(/positive/i);
  });

  it('leans negative when negatives clearly dominate', () => {
    const m = computeMood([make('negative'), make('negative'), make('negative'), make('neutral')]);
    expect(m.skew).toBe('negative');
  });

  it('is quiet when almost all headlines are neutral', () => {
    const scored = [make('neutral'), make('neutral'), make('neutral'), make('neutral'), make('positive')];
    // signal share = 1/5 = 0.2 → not below the 0.2 quiet threshold, so this should NOT be quiet.
    const m = computeMood(scored);
    expect(m.total).toBe(5);
    // one more neutral pushes signal share below 0.2 → quiet
    const m2 = computeMood([...scored, make('neutral')]);
    expect(m2.skew).toBe('quiet');
  });

  it('is mixed on a near-even split', () => {
    const m = computeMood([make('positive'), make('positive'), make('negative'), make('negative')]);
    expect(m.skew).toBe('mixed');
  });
});
