import type { PrivacyMode } from '@/context/PrivacyContext';

/**
 * Masks ₹ amounts in a free-text string (e.g. an activity summary) unless Privacy mode is Open,
 * mirroring how amounts are hidden elsewhere in the app. "Swiggy ₹340" → "Swiggy ₹•••".
 */
export function maskAmounts(text: string, mode: PrivacyMode): string {
  if (mode === 'open') return text;
  return text.replace(/₹\s?[\d,]+(\.\d+)?/g, '₹•••');
}
