import { describe, expect, it } from 'vitest';
import { DEFAULT_INFERRED_MODE, inferPaymentMode } from '@/core/bank-import/paymentModeInference';

describe('inferPaymentMode', () => {
  it('infers upi (an existing default mode)', () => {
    expect(inferPaymentMode('UPI-SWIGGY-123-YBL').id).toBe('upi');
  });

  it('infers distinct, creatable rail modes for NEFT/IMPS/RTGS/ACH rather than folding them into Net', () => {
    expect(inferPaymentMode('NEFT CR-ACME CORP').id).toBe('neft');
    expect(inferPaymentMode('IMPS-P2A-998877').id).toBe('imps');
    expect(inferPaymentMode('RTGS-XYZ-112233').id).toBe('rtgs');
    expect(inferPaymentMode('ACH CR/DIVIDEND INCOME/TCS LTD').id).toBe('ach');
  });

  it('infers cheque as its own creatable mode', () => {
    expect(inferPaymentMode('CHQ DEP 004521').id).toBe('cheque');
  });

  it('infers card for POS (an existing default mode)', () => {
    expect(inferPaymentMode('POS 998877 AMAZON').id).toBe('card');
  });

  it('infers cash for ATM (an existing default mode)', () => {
    expect(inferPaymentMode('ATM WDL MAIN ST').id).toBe('cash');
  });

  it('falls back to the default (Net) when no keyword matches', () => {
    expect(inferPaymentMode('SOME UNKNOWN NARRATION')).toEqual(DEFAULT_INFERRED_MODE);
  });
});
