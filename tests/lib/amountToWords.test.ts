import { describe, expect, it } from 'vitest';
import { amountToWords } from '@/lib/amountToWords';

describe('amountToWords', () => {
  it('handles zero and small numbers', () => {
    expect(amountToWords(0)).toBe('Zero');
    expect(amountToWords(7)).toBe('Seven');
    expect(amountToWords(19)).toBe('Nineteen');
    expect(amountToWords(20)).toBe('Twenty');
    expect(amountToWords(42)).toBe('Forty Two');
    expect(amountToWords(100)).toBe('One Hundred');
    expect(amountToWords(115)).toBe('One Hundred Fifteen');
  });

  it('groups by the Indian system (thousand / lakh / crore)', () => {
    expect(amountToWords(1_000)).toBe('One Thousand');
    expect(amountToWords(1_00_000)).toBe('One Lakh');
    expect(amountToWords(1_00_00_000)).toBe('One Crore');
    expect(amountToWords(1_23_456)).toBe('One Lakh Twenty Three Thousand Four Hundred Fifty Six');
    expect(amountToWords(12_34_56_789)).toBe(
      'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine'
    );
  });

  it('rounds paise and prefixes negatives', () => {
    expect(amountToWords(99.6)).toBe('One Hundred');
    expect(amountToWords(-500)).toBe('Minus Five Hundred');
  });
});
