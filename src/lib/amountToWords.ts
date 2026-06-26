// Indian-system amount-in-words (crore / lakh / thousand / hundred).
// Used by the AmountInput primitive to render a confidence-building helper
// beneath the field (e.g. 1,00,000 → "One Lakh"). Money/number domain — keep
// any future number-word helpers here rather than in formatters.ts.

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Words for an integer 0–999 (no leading/trailing spaces). */
function twoOrThreeDigits(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)] ?? '';
    const o = ONES[n % 10] ?? '';
    return o ? `${t} ${o}` : t;
  }
  const h = ONES[Math.floor(n / 100)] ?? '';
  const rest = n % 100;
  return rest ? `${h} Hundred ${twoOrThreeDigits(rest)}` : `${h} Hundred`;
}

/**
 * Converts a number to Indian-system words. Paise are dropped (rounded).
 * Negative values are prefixed "Minus". Returns "Zero" for 0.
 */
export function amountToWords(value: number): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? 'Minus ' : '';
  let n = Math.abs(Math.round(value));
  if (n === 0) return 'Zero';

  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  const hundreds = n;

  if (crore) parts.push(`${amountToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoOrThreeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoOrThreeDigits(thousand)} Thousand`);
  if (hundreds) parts.push(twoOrThreeDigits(hundreds));

  return sign + parts.join(' ');
}
