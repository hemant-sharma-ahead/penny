import { describe, it, expect } from 'vitest';
import { tagEntities } from '@/core/sentiment/tagEntities';

const syms = (text: string) => tagEntities(text).map((m) => m.symbol);

describe('tagEntities — basic matching', () => {
  it('matches a company by name', () => {
    expect(syms('Reliance Industries posts record quarterly profit')).toContain('RELIANCE');
  });

  it('matches by alias', () => {
    expect(syms('HUL results beat estimates')).toContain('HINDUNILVR');
    expect(syms('TCS wins large deal')).toContain('TCS');
  });

  it('returns sector alongside the symbol', () => {
    const m = tagEntities('Infosys raises guidance');
    expect(m[0]).toMatchObject({ symbol: 'INFY', sector: 'IT' });
  });

  it('tags multiple companies in one headline', () => {
    const s = syms('TCS and Infosys lead IT rally');
    expect(s).toContain('TCS');
    expect(s).toContain('INFY');
  });
});

describe('tagEntities — precision (no false positives)', () => {
  it('does not match short aliases inside unrelated words', () => {
    // "itc" must not fire on "switch"; "sbi" must not fire on random text
    expect(syms('New switch rules announced')).not.toContain('ITC');
    expect(syms('A big win for the economy')).toEqual([]);
  });

  it('prefers the longer alias — "SBI Life" does not also match bare SBI', () => {
    const s = syms('SBI Life reports strong premium growth');
    expect(s).toContain('SBILIFE');
    expect(s).not.toContain('SBIN');
  });

  it('matches bare SBI when it stands alone', () => {
    expect(syms('SBI cuts home loan rates')).toContain('SBIN');
  });

  it('dedupes repeated mentions to one entry per symbol', () => {
    const m = tagEntities('Reliance up as Reliance Jio adds users');
    expect(m.filter((x) => x.symbol === 'RELIANCE')).toHaveLength(1);
  });

  it('returns empty for a headline with no known companies', () => {
    expect(syms('RBI holds repo rate steady')).toEqual([]);
  });
});
