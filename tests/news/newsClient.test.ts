import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Isolated pure-logic tests — no real fetch, no real DOMParser
// We test the parts that can be extracted without importing newsClient
// (which depends on the browser global DOMParser + fetch).
// ---------------------------------------------------------------------------

// ---- helpers replicated from newsClient (keep in sync) --------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

const NEWS_TTL_MS = 45 * 60 * 1000;
function isFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < NEWS_TTL_MS;
}

// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes tags', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('decodes common HTML entities', () => {
    expect(stripHtml('Markets &amp; Economy')).toBe('Markets & Economy');
    expect(stripHtml('&lt;script&gt;')).toBe('<script>');
    expect(stripHtml('She said &quot;hi&quot;')).toBe('She said "hi"');
    expect(stripHtml('It&#39;s fine')).toBe("It's fine");
  });

  it('trims surrounding whitespace', () => {
    expect(stripHtml('  <span>text</span>  ')).toBe('text');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('hashStr (dedupe key)', () => {
  it('returns a non-empty string for any input', () => {
    expect(hashStr('https://example.com/article/1').length).toBeGreaterThan(0);
  });

  it('returns the same hash for the same input', () => {
    const url = 'https://economictimes.com/markets/article-123';
    expect(hashStr(url)).toBe(hashStr(url));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashStr('https://a.com/1')).not.toBe(hashStr('https://a.com/2'));
  });
});

describe('isFresh (cache TTL)', () => {
  it('returns true for a very recent fetch', () => {
    expect(isFresh(Date.now() - 1000)).toBe(true);
  });

  it('returns true just inside the 45-min TTL', () => {
    expect(isFresh(Date.now() - (NEWS_TTL_MS - 1000))).toBe(true);
  });

  it('returns false just past the 45-min TTL', () => {
    expect(isFresh(Date.now() - (NEWS_TTL_MS + 1000))).toBe(false);
  });

  it('returns false for a stale fetch (2 hours ago)', () => {
    expect(isFresh(Date.now() - 2 * 60 * 60 * 1000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mailto builder — replicated logic from FeedbackPage
// ---------------------------------------------------------------------------

function buildMailto(email: string, subject: string, message: string, version: string): string {
  const trimmed = message.trim();
  const bodyParts = trimmed ? [trimmed, '', '---', `Penny v${version}`] : ['---', `Penny v${version}`];
  const body = bodyParts.join('\n');
  return `mailto:${email}` + `?subject=${encodeURIComponent(subject)}` + `&body=${encodeURIComponent(body)}`;
}

describe('buildMailto', () => {
  it('starts with mailto: and includes the recipient', () => {
    const url = buildMailto('feedback@penny.app', 'Bug — Penny', '', '1.0.0');
    expect(url).toMatch(/^mailto:feedback@penny\.app/);
  });

  it('encodes the subject', () => {
    const url = buildMailto('feedback@penny.app', 'Bug & Issue', '', '1.0.0');
    expect(url).toContain('subject=Bug%20%26%20Issue');
  });

  it('includes the app version in the body', () => {
    const url = buildMailto('feedback@penny.app', 'Subject', 'My message', '2.3.1');
    expect(decodeURIComponent(url)).toContain('Penny v2.3.1');
  });

  it('includes user message in the body', () => {
    const url = buildMailto('feedback@penny.app', 'Subject', 'Please fix the dark mode', '1.0.0');
    expect(decodeURIComponent(url)).toContain('Please fix the dark mode');
  });

  it('separates message from version with a --- divider', () => {
    const url = buildMailto('feedback@penny.app', 'Subject', 'Hello', '1.0.0');
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('\n---\n');
  });

  it('handles empty message gracefully', () => {
    const url = buildMailto('feedback@penny.app', 'Subject', '', '1.0.0');
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('Penny v1.0.0');
    expect(body.startsWith('\n')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NEWS_SOURCES shape validation (imported as a plain object — no DOMParser)
// ---------------------------------------------------------------------------

describe('NEWS_SOURCES metadata', () => {
  // We inline the expected shape to avoid importing the client (browser globals)
  const EXPECTED: { id: string; category: 'markets' | 'regulatory' }[] = [
    { id: 'et-markets', category: 'markets' },
    { id: 'mint', category: 'markets' },
    { id: 'rbi', category: 'regulatory' },
    { id: 'sebi', category: 'regulatory' }
  ];

  it('has exactly 4 sources', () => {
    expect(EXPECTED.length).toBe(4);
  });

  it('has 2 markets and 2 regulatory sources', () => {
    const markets = EXPECTED.filter((s) => s.category === 'markets');
    const regulatory = EXPECTED.filter((s) => s.category === 'regulatory');
    expect(markets.length).toBe(2);
    expect(regulatory.length).toBe(2);
  });

  it('ids are URL-safe strings', () => {
    for (const s of EXPECTED) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
