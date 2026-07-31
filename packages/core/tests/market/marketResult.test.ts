import { describe, expect, it } from 'vitest';
import { buildTickerResult, TICKER_CONFIGS } from '@/core/market/marketDataClient';

const nifty = TICKER_CONFIGS.find((c) => c.id === 'nifty50')!;

describe('buildTickerResult', () => {
  it('computes a positive change %', () => {
    const r = buildTickerResult(nifty, 110, 100);
    expect(r.price).toBe(110);
    expect(r.previousClose).toBe(100);
    expect(r.changePct).toBeCloseTo(10);
    expect(r.id).toBe('nifty50');
  });

  it('computes a negative change %', () => {
    expect(buildTickerResult(nifty, 90, 100).changePct).toBeCloseTo(-10);
  });

  it('is null change when price or previousClose is missing, or prevClose is 0', () => {
    expect(buildTickerResult(nifty, null, 100).changePct).toBeNull();
    expect(buildTickerResult(nifty, 110, null).changePct).toBeNull();
    expect(buildTickerResult(nifty, 110, 0).changePct).toBeNull();
  });
});
