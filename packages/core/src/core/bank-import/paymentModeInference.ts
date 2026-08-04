import type { PaymentMode } from '@/core/db/types';

export type PaymentModeCandidate = Pick<PaymentMode, 'id' | 'label' | 'icon' | 'color'>;

/**
 * Bank narrations often embed the payment rail as a keyword (UPI/NEFT/IMPS/RTGS/POS/ATM/cheque) —
 * this infers Penny's payment mode from that keyword, mirroring `core/goals/meta.ts`'s ordered,
 * first-match-wins `GOAL_ICON_KEYWORDS` technique. Some rails (UPI/POS→card/ATM→cash) map onto the
 * 5 built-in modes (`core/expenses/paymentModes.ts`); others (NEFT/IMPS/RTGS/Cheque) don't exist by
 * default and are genuinely new, creatable `PaymentMode`s — the caller (the import commit step) is
 * responsible for creating each one exactly once per batch via `paymentModesRepo`, not per
 * transaction (docs/plans/bank-statement-import.md §8).
 */
const PAYMENT_MODE_KEYWORDS: { keywords: string[]; mode: PaymentModeCandidate }[] = [
  { keywords: ['upi'], mode: { id: 'upi', label: 'UPI', icon: 'ti-qrcode', color: '#7c3aed' } },
  { keywords: ['neft'], mode: { id: 'neft', label: 'NEFT', icon: 'ti-building-bank', color: '#0ea5e9' } },
  { keywords: ['imps'], mode: { id: 'imps', label: 'IMPS', icon: 'ti-building-bank', color: '#06b6d4' } },
  { keywords: ['rtgs'], mode: { id: 'rtgs', label: 'RTGS', icon: 'ti-building-bank', color: '#0284c7' } },
  // ACH (dividend payouts, mutual fund redemptions/SIPs) — found missing 2026-08-03 running real
  // sample statements through this inferrer; previously fell through to the generic "Net" fallback.
  { keywords: ['ach'], mode: { id: 'ach', label: 'ACH', icon: 'ti-building-bank', color: '#38bdf8' } },
  { keywords: ['pos', 'swipe'], mode: { id: 'card', label: 'Card', icon: 'ti-credit-card', color: '#3b82f6' } },
  { keywords: ['atm'], mode: { id: 'cash', label: 'Cash', icon: 'ti-cash', color: '#22c55e' } },
  { keywords: ['chq', 'cheque', 'clg'], mode: { id: 'cheque', label: 'Cheque', icon: 'ti-writing', color: '#a855f7' } },
  {
    keywords: ['ecs', 'nach', 'mandate'],
    mode: { id: 'net', label: 'Net', icon: 'ti-building-bank', color: '#0ea5e9' }
  }
];

/** Fallback when no keyword matches — "Net" (generic bank transfer) is the least presumptive
 *  default for an unrecognized bank-statement line, since it came from the bank, not cash-in-hand. */
export const DEFAULT_INFERRED_MODE: PaymentModeCandidate = {
  id: 'net',
  label: 'Net',
  icon: 'ti-building-bank',
  color: '#0ea5e9'
};

export function inferPaymentMode(rawNarration: string): PaymentModeCandidate {
  const lower = rawNarration.toLowerCase();
  for (const { keywords, mode } of PAYMENT_MODE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return mode;
  }
  return DEFAULT_INFERRED_MODE;
}
