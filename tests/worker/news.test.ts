import { describe, expect, it } from 'vitest';
import { NEWS_FEEDS, isKnownFeed } from '../../workers/api-proxy/src/news';

describe('isKnownFeed', () => {
  it('recognizes all 4 configured feed ids', () => {
    expect(isKnownFeed('et-markets')).toBe(true);
    expect(isKnownFeed('mint')).toBe(true);
    expect(isKnownFeed('rbi')).toBe(true);
    expect(isKnownFeed('sebi')).toBe(true);
  });

  it('rejects an unknown feed id', () => {
    expect(isKnownFeed('nope')).toBe(false);
  });
});

describe('NEWS_FEEDS', () => {
  it('has exactly 4 feeds, matching the client-side NEWS_SOURCES ids', () => {
    expect(Object.keys(NEWS_FEEDS).sort()).toEqual(['et-markets', 'mint', 'rbi', 'sebi']);
  });

  it('every feed URL is https', () => {
    for (const url of Object.values(NEWS_FEEDS)) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});
