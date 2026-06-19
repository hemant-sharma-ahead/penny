// PII pattern definitions — imported by both runtime code and the CI gate test.
// Any string matching one of these patterns must NEVER reach an external API.

export const PII_PATTERNS: Record<string, RegExp> = {
  pan: /[A-Z]{5}[0-9]{4}[A-Z]/,
  aadhaar: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
  indianMobile: /\b[6-9]\d{9}\b/,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  upiId: /\b\w[\w.-]*@\w+\b/,
  ifsc: /\b[A-Z]{4}0[A-Z0-9]{6}\b/,
  accountNumber: /\b\d{9,18}\b/
};

export const ALLOWED_DOMAINS = [
  'api.anthropic.com',
  'api.mfapi.in',
  'query.yahoofinance.com',
  'webnodejs.investorgain.com',
  'npsnav.in',
  'backend.vahandetails.com'
];

export interface PiiScanResult {
  hasPii: boolean;
  matches: Array<{ pattern: string; value: string }>;
}

export function scanForPii(text: string): PiiScanResult {
  const matches: Array<{ pattern: string; value: string }> = [];

  for (const [name, pattern] of Object.entries(PII_PATTERNS)) {
    const match = pattern.exec(text);
    if (match) {
      matches.push({ pattern: name, value: match[0] });
    }
  }

  return { hasPii: matches.length > 0, matches };
}

export function isDomainAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
