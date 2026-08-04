import type { BankPreset, BankPresetId } from './types';

/**
 * Initial per-bank column-mapping presets (docs/plans/bank-statement-import.md §4) — the header
 * names below are each bank's commonly published CSV/statement column names, used only as a
 * starting guess. The confirmation screen always shows the user the file's real headers next to
 * these and lets them fix any mismatch by hand (per the user's explicit preference: exact
 * preset-or-custom mapping, not fuzzy column detection) — so an imprecise guess here costs one
 * extra tap, never a silent misparse.
 */
export const BANK_PRESETS: BankPreset[] = [
  {
    id: 'hdfc',
    label: 'HDFC Bank',
    delimiter: ',',
    dateFormat: 'DD/MM/YY',
    mapping: {
      date: 'Date',
      narration: 'Narration',
      debit: 'Withdrawal Amt.',
      credit: 'Deposit Amt.',
      balance: 'Closing Balance'
    }
  },
  {
    id: 'icici',
    label: 'ICICI Bank',
    delimiter: ',',
    dateFormat: 'DD/MM/YYYY',
    mapping: {
      date: 'Transaction Date',
      narration: 'Transaction Remarks',
      debit: 'Withdrawal Amount (INR)',
      credit: 'Deposit Amount (INR)',
      balance: 'Balance (INR)'
    }
  },
  {
    id: 'kotak',
    label: 'Kotak Mahindra Bank',
    delimiter: ',',
    dateFormat: 'DD-MM-YYYY',
    mapping: {
      date: 'Transaction Date',
      narration: 'Description',
      debit: 'Debit',
      credit: 'Credit',
      balance: 'Balance'
    }
  },
  {
    id: 'sbi',
    label: 'State Bank of India',
    delimiter: ',',
    dateFormat: 'DD MMM YYYY',
    mapping: {
      date: 'Txn Date',
      narration: 'Description',
      debit: 'Debit',
      credit: 'Credit',
      balance: 'Balance'
    }
  },
  {
    id: 'indusind',
    label: 'IndusInd Bank',
    delimiter: ',',
    dateFormat: 'DD/MM/YYYY',
    mapping: {
      date: 'Date',
      narration: 'Particulars',
      debit: 'Debit',
      credit: 'Credit',
      balance: 'Balance'
    }
  },
  {
    id: 'hsbc',
    label: 'HSBC India',
    delimiter: ',',
    dateFormat: 'DD MMM YYYY',
    mapping: {
      date: 'Date',
      narration: 'Description',
      debit: 'Paid Out',
      credit: 'Paid In',
      balance: 'Balance'
    }
  },
  {
    id: 'bob',
    label: 'Bank of Baroda',
    delimiter: ',',
    dateFormat: 'DD-MM-YYYY',
    mapping: {
      date: 'Txn Date',
      narration: 'Description',
      debit: 'Debit',
      credit: 'Credit',
      balance: 'Balance'
    }
  }
];

export const CUSTOM_PRESET_ID: BankPresetId = 'custom';

export const EMPTY_CUSTOM_MAPPING: BankPreset = {
  id: 'custom',
  label: 'Custom',
  delimiter: ',',
  dateFormat: '',
  mapping: { date: '', narration: '', debit: '', credit: '', balance: '' }
};

export function getBankPreset(id: BankPresetId): BankPreset | undefined {
  return BANK_PRESETS.find((p) => p.id === id);
}

/** Case-insensitive, trimmed header match — not fuzzy (no scoring/similarity), just tolerant of
 *  whitespace/case differences a real export might have versus the preset's expected name. */
export function matchHeader(actualHeaders: string[], expected: string | undefined): string | undefined {
  if (!expected) return undefined;
  const norm = expected.trim().toLowerCase();
  return actualHeaders.find((h) => h.trim().toLowerCase() === norm);
}

/** Resolves a preset's expected column names against a real file's headers, leaving any field
 *  unresolved (undefined) if no exact case-insensitive match is found — the confirmation screen
 *  then prompts the user to pick it manually rather than guessing further. */
export function resolveMappingAgainstHeaders(preset: BankPreset, actualHeaders: string[]): ColumnMappingResolution {
  return {
    date: matchHeader(actualHeaders, preset.mapping.date),
    narration: matchHeader(actualHeaders, preset.mapping.narration),
    debit: matchHeader(actualHeaders, preset.mapping.debit),
    credit: matchHeader(actualHeaders, preset.mapping.credit),
    amount: matchHeader(actualHeaders, preset.mapping.amount),
    balance: matchHeader(actualHeaders, preset.mapping.balance)
  };
}

export interface ColumnMappingResolution {
  date?: string | undefined;
  narration?: string | undefined;
  debit?: string | undefined;
  credit?: string | undefined;
  amount?: string | undefined;
  balance?: string | undefined;
}
