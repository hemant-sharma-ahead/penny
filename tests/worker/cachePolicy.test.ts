import { describe, expect, it } from 'vitest';
import { ttlFor, cacheKey, TTL } from '../../workers/api-proxy/src/lib/cachePolicy';

describe('ttlFor', () => {
  it('uses 15 min for Yahoo market/stock', () => {
    expect(ttlFor('yf', '/v8/finance/chart/^NSEI')).toBe(TTL.yf);
  });

  it('uses 24h for MF NAV but 1h for MF search', () => {
    expect(ttlFor('mfapi', '/mf/140088')).toBe(TTL.mfDefault);
    expect(ttlFor('mfapi', '/mf/search?q=parag')).toBe(TTL.mfSearch);
  });

  it('uses 1 week for the NPS scheme list, 1h for a NAV', () => {
    expect(ttlFor('nps', '/schemes')).toBe(TTL.npsSchemes);
    expect(ttlFor('nps', '/detailed/SM001')).toBe(TTL.npsDefault);
  });

  it('uses 15 min for IPO and a short fallback for unknown prefixes', () => {
    expect(ttlFor('ig', '/cloud/report/data-read/486')).toBe(TTL.ig);
    expect(ttlFor('whatever', '/x')).toBe(TTL.fallback);
  });
});

describe('cacheKey', () => {
  it('is deterministic and separates by path + query', () => {
    expect(cacheKey('yf', '/v8/finance/chart/^NSEI', '?range=1d')).toBe('proxy:yf:/v8/finance/chart/^NSEI?range=1d');
    expect(cacheKey('mfapi', '/mf/140088', '')).not.toBe(cacheKey('mfapi', '/mf/140089', ''));
  });
});
