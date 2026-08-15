/**
 * Shared literal between `smsCapture.native.ts` and `smsCapture.web.ts` (docs/plans/
 * sms-transaction-tracking.md §2) — per CLAUDE.md's platform-suffixed-file rule, a literal identical
 * across every variant belongs in an unsuffixed sibling like this one, never copy-pasted
 * independently into each `.native.ts`/`.web.ts` file.
 */
export const SMS_CAPTURE_NOT_SUPPORTED_MESSAGE = 'SMS capture is Android-only — not available on this platform';
