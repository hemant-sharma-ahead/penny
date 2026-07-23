import { describe, it, expect } from 'vitest';
import { scoreHeadline } from '@/core/sentiment/scoreHeadline';
import { tokenize } from '@/core/sentiment/normalize';

describe('tokenize', () => {
  it('lowercases and splits on non-word chars', () => {
    expect(tokenize('Sensex JUMPS 500 pts!')).toEqual(['sensex', 'jumps', '500', 'pts']);
  });

  it('preserves contractions for negation', () => {
    expect(tokenize("doesn't rise")).toEqual(["doesn't", 'rise']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('scoreHeadline — basic polarity', () => {
  it('scores a clearly positive headline positive', () => {
    const r = scoreHeadline('Nifty surges to record high on strong earnings');
    expect(r.label).toBe('positive');
    expect(r.score).toBeGreaterThan(0);
    expect(r.matched.length).toBeGreaterThan(0);
  });

  it('scores a clearly negative headline negative', () => {
    const r = scoreHeadline('Sensex plunges as banks tumble on fraud probe');
    expect(r.label).toBe('negative');
    expect(r.score).toBeLessThan(0);
  });

  it('scores a factual headline neutral', () => {
    const r = scoreHeadline('RBI to announce monetary policy on Friday');
    expect(r.label).toBe('neutral');
    expect(r.score).toBe(0);
  });
});

describe('scoreHeadline — strong verbs weigh more', () => {
  it('gives a directional verb (surge=2) more weight than an ordinary word (gain=1)', () => {
    expect(scoreHeadline('stock surges').score).toBeGreaterThan(scoreHeadline('stock gains').score);
  });
});

describe('scoreHeadline — negation', () => {
  it('flips polarity when a negator precedes a positive word', () => {
    const plain = scoreHeadline('markets rise');
    const negated = scoreHeadline('markets do not rise');
    expect(plain.label).toBe('positive');
    expect(negated.score).toBeLessThan(plain.score);
    expect(negated.label).not.toBe('positive');
  });

  it('does not let a negator bleed past the effect window', () => {
    // "not" is far (>3 tokens) from "gains", so it should not flip it.
    const r = scoreHeadline('not a b c d gains');
    expect(r.label).toBe('positive');
  });
});

describe('scoreHeadline — intensifiers', () => {
  it('amplifies the next sentiment word', () => {
    const plain = scoreHeadline('stock falls');
    const strong = scoreHeadline('stock falls sharply');
    // "sharply" comes after "falls" here, so also test the natural order:
    const strong2 = scoreHeadline('stock sharply falls');
    expect(strong2.score).toBeLessThan(plain.score);
    expect(strong).toBeDefined();
  });
});

describe('scoreHeadline — expanded lexicon coverage', () => {
  it('reads "crumbling" as negative', () => {
    expect(scoreHeadline('Mag 7 stocks are crumbling under AI pressure').label).toBe('negative');
  });

  it('reads "magnificent" as positive', () => {
    expect(scoreHeadline('A magnificent year for Indian equities').label).toBe('positive');
  });

  it('reads "weaken" / "struggle" as negative', () => {
    expect(scoreHeadline('Rupee weakens as exporters struggle').label).toBe('negative');
  });
});

describe('scoreHeadline — explainability', () => {
  it('reports matched terms with polarity', () => {
    const r = scoreHeadline('profit jumps but costs rise');
    const terms = r.matched.map((m) => m.term);
    expect(terms).toContain('jumps');
    expect(r.matched.every((m) => m.polarity === 'positive' || m.polarity === 'negative')).toBe(true);
  });
});
