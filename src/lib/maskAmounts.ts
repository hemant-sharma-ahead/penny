/**
 * Masks ₹ amounts in a free-text string (e.g. an activity summary) when `masked` is true,
 * mirroring how amounts are hidden elsewhere in the app. "Swiggy ₹340" → "Swiggy ₹•••".
 * The activity log mixes entries from every module, so callers resolve `masked` the same way
 * as other aggregate/summary views (`shouldMask(false)` — visible in Safe, hidden in Privacy)
 * rather than per-category, since a log entry doesn't carry a live category reference.
 */
export function maskAmounts(text: string, masked: boolean): string {
  if (!masked) return text;
  return text.replace(/₹\s?[\d,]+(\.\d+)?/g, '₹•••');
}
