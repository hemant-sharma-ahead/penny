import { describe, expect, it } from 'vitest';
import { parsePath, upstreamUrl, isKnownPrefix } from '../../workers/api-proxy/src/lib/upstreams';

describe('parsePath', () => {
  it('splits prefix and rest', () => {
    expect(parsePath('/yf/v8/finance/chart/^NSEI')).toEqual({ prefix: 'yf', rest: '/v8/finance/chart/^NSEI' });
    expect(parsePath('/mfapi/mf/140088')).toEqual({ prefix: 'mfapi', rest: '/mf/140088' });
  });

  it('handles a bare prefix with no rest', () => {
    expect(parsePath('/yf')).toEqual({ prefix: 'yf', rest: '' });
  });

  it('returns null for root', () => {
    expect(parsePath('/')).toBeNull();
  });
});

describe('upstreamUrl', () => {
  it('builds the full upstream URL with query', () => {
    expect(upstreamUrl('yf', '/v8/finance/chart/^NSEI', '?range=1d')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/^NSEI?range=1d'
    );
    expect(upstreamUrl('nps', '/schemes', '')).toBe('https://npsnav.in/api/schemes');
  });

  it('returns null for an unknown prefix', () => {
    expect(upstreamUrl('nope', '/x', '')).toBeNull();
    expect(isKnownPrefix('nope')).toBe(false);
    expect(isKnownPrefix('ig')).toBe(true);
  });
});
