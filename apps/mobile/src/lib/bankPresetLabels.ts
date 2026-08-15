import type { BankPresetId } from '@/core/db/types';

/**
 * Display labels for `BankPresetId` — shared by the account-edit screen's bank picker
 * (`~/components/shared/AccountFormModal.tsx`) and the SMS Tracking sender-mapping list
 * (`~/features/sms-tracking/`), so both surfaces show the same bank names for the same id. A small,
 * mobile-only `lib/` constant rather than duplicating `core/sms-import/smsAccountMatch.ts`'s own
 * module-private `BANK_LABELS` (that one exists for a different purpose — fuzzy `Account.name` matching
 * — and isn't exported for reuse). `'custom'` is deliberately excluded from the picker's options (see
 * `BANK_PRESET_OPTIONS` below) — SMS parsing has no template bucket for "custom", so offering it in the
 * account-edit picker would silently create an `Account.bankId` that can never actually resolve any SMS.
 */
export const BANK_PRESET_LABELS: Record<BankPresetId, string> = {
  hdfc: 'HDFC Bank',
  icici: 'ICICI Bank',
  kotak: 'Kotak Bank',
  sbi: 'SBI',
  indusind: 'IndusInd Bank',
  hsbc: 'HSBC',
  bob: 'Bank of Baroda',
  axis: 'Axis Bank',
  yesbank: 'Yes Bank',
  pnb: 'PNB',
  canara: 'Canara Bank',
  idfcfirst: 'IDFC FIRST Bank',
  custom: 'Other / custom'
};

/** Picker-ready options, `'custom'` excluded — see doc comment above. */
export const BANK_PRESET_OPTIONS: { value: BankPresetId; label: string }[] = (
  Object.keys(BANK_PRESET_LABELS) as BankPresetId[]
)
  .filter((id) => id !== 'custom')
  .map((value) => ({ value, label: BANK_PRESET_LABELS[value] }));
