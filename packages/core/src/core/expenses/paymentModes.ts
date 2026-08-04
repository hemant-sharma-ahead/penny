import type { PaymentMode } from '@/core/db/types';

/**
 * The 5 built-in payment modes — seed data for the `payment_modes` store (see `PaymentMode`'s doc
 * comment). Real rows from the start (not a read-time-only merge) is what lets a default's icon/
 * colour/label actually be edited in place, the same way a default `ExpenseCategory` can be — seeded
 * once via `~/hooks/usePaymentModes.ts`, mirroring how `ALL_DEFAULT_CATEGORIES` is seeded.
 */
export const DEFAULT_PAYMENT_MODES: PaymentMode[] = [
  { id: 'cash', label: 'Cash', icon: 'ti-cash', color: '#22c55e', isDefault: true, createdAt: 0, updatedAt: 0 },
  { id: 'upi', label: 'UPI', icon: 'ti-qrcode', color: '#7c3aed', isDefault: true, createdAt: 0, updatedAt: 0 },
  {
    id: 'card',
    label: 'Card',
    icon: 'ti-credit-card',
    color: '#3b82f6',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'net',
    label: 'Net',
    icon: 'ti-building-bank',
    color: '#0ea5e9',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0
  },
  { id: 'wallet', label: 'Wallet', icon: 'ti-wallet', color: '#f97316', isDefault: true, createdAt: 0, updatedAt: 0 }
];

/**
 * A stable, deterministic slug for a manually-created payment mode (e.g. "Postal Order" → `postal
 * order` → `postal-order`) — same shape as the inferred rail ids (`neft`/`imps`/...) so lookups
 * stay a plain id comparison everywhere. Never collides with an existing mode: if the plain slug is
 * already taken, a numeric suffix is appended until it isn't. `existing` should be the full current
 * list (defaults + custom) — real rows now, no merge step needed.
 */
export function generatePaymentModeId(label: string, existing: PaymentMode[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mode';
  const taken = new Set(existing.map((m) => m.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
