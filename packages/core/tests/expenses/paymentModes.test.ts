import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYMENT_MODES, generatePaymentModeId } from '@/core/expenses/paymentModes';

describe('DEFAULT_PAYMENT_MODES', () => {
  it('has exactly 5 built-ins, all flagged isDefault', () => {
    expect(DEFAULT_PAYMENT_MODES).toHaveLength(5);
    expect(DEFAULT_PAYMENT_MODES.every((m) => m.isDefault)).toBe(true);
  });
});

describe('generatePaymentModeId', () => {
  it('slugifies a plain label', () => {
    expect(generatePaymentModeId('Postal Order', [])).toBe('postal-order');
  });

  it('strips punctuation and collapses separators', () => {
    expect(generatePaymentModeId('  Crypto/Wallet!! ', [])).toBe('crypto-wallet');
  });

  it('appends a numeric suffix when the slug collides with an existing default', () => {
    expect(generatePaymentModeId('Cash', DEFAULT_PAYMENT_MODES)).toBe('cash-2');
  });

  it('appends a numeric suffix when the slug collides with an existing custom mode, and finds the next free one', () => {
    const existing = [
      ...DEFAULT_PAYMENT_MODES,
      {
        id: 'gift-card',
        label: 'Gift Card',
        icon: 'ti-gift',
        color: '#f97316',
        isDefault: false,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'gift-card-2',
        label: 'Gift Card',
        icon: 'ti-gift',
        color: '#f97316',
        isDefault: false,
        createdAt: 1,
        updatedAt: 1
      }
    ];
    expect(generatePaymentModeId('Gift Card', existing)).toBe('gift-card-3');
  });

  it('falls back to a generic slug when the label has no alphanumeric characters', () => {
    expect(generatePaymentModeId('!!!', [])).toBe('mode');
  });
});
