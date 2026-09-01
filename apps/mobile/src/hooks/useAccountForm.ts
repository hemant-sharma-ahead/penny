import { useRef, useState } from 'react';
import type { Account, AccountType, BankPresetId } from '@/core/db/types';
import { ACCOUNT_TYPE_META } from '@/core/accounts/meta';
import { findDuplicateAccountName } from '@/core/accounts/accountValidation';
import { findPreviousDefaultAccount } from '@/core/accounts/accountDefaults';
import { parseNumber } from '@/lib/formatters';

/** The data an add/edit account save mutation needs — shared shape so both `features/accounts/` (the
 *  Accounts page) and `features/expenses/` (the inline "+ Add account" in `ExpenseForm.tsx`) can each
 *  provide their own `saveAccount` implementation without importing one another's feature module. */
export interface AccountInput {
  name: string;
  type: AccountType;
  openingBalance: number;
  color: string;
  icon: string;
  includeInNetWorth: boolean;
  /** Which bank this account belongs to (docs/plans/sms-transaction-tracking.md §3) — optional, feeds
   *  SMS Tracking's account-resolution matching. Omitted entirely (never an explicit empty string)
   *  when unset, so a plain `...data` spread onto `Account` never writes a bogus `bankId`. */
  bankId?: BankPresetId;
  /** Last 4 digits of this account's own number (never a card's) — see `Account.last4`'s own doc
   *  comment for the full rationale. Optional, same treatment as `bankId` above. */
  last4?: string;
  /** Bank/Credit Card/Wallet only (never Cash, already the implicit fallback) — see `Account.isDefault`/
   *  `Account.isClosed`'s own doc comments. Always sent (not omitted like `bankId`/`last4` above) since
   *  `false` is just as meaningful as `true` for a plain boolean field. */
  isDefault: boolean;
  isClosed: boolean;
}

export interface AccountFormState {
  name: string;
  type: AccountType;
  openingBalance: string;
  color: string;
  icon: string;
  includeInNetWorth: boolean;
  /** Empty string = unset — converted to `undefined` in `save()` below, never persisted as `''`. */
  bankId: BankPresetId | '';
  last4: string;
  isDefault: boolean;
  isClosed: boolean;
}

const DEFAULT_FORM: AccountFormState = {
  name: '',
  type: 'cash',
  openingBalance: '0',
  color: '#10b981',
  icon: 'ti-cash',
  includeInNetWorth: true,
  bankId: '',
  last4: '',
  isDefault: false,
  isClosed: false
};

/** Owns the add/edit account form lifecycle and bridges to the save mutation. `accounts` is the
 *  current account list, used to reject a duplicate name (case-insensitive, trimmed) — no two
 *  accounts may ever share the same name (app-wide rule, see accountValidation.ts). */
export function useAccountForm(
  saveAccount: (data: AccountInput, editing: Account | null) => Promise<Account>,
  accounts: Account[]
) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);
  // Fires once, only for a brand-new (never editing) account — see `openAddWithType` — then clears
  // itself. A ref rather than state since setting it never needs to trigger a re-render.
  const onCreatedRef = useRef<((acc: Account) => void) | null>(null);

  const nameError = findDuplicateAccountName(form.name, accounts, editing?.id)
    ? 'An account with this name already exists'
    : undefined;

  function patch(updates: Partial<AccountFormState>) {
    setForm((f) => ({ ...f, ...updates }));
  }

  function selectType(type: AccountType) {
    const meta = ACCOUNT_TYPE_META[type];
    patch({
      type,
      icon: meta.icon,
      color: meta.color,
      includeInNetWorth: type !== 'credit_card',
      // Default/Closed only ever apply to Bank/Credit Card/Wallet — switching to Cash clears both
      // rather than leaving a stale `true` silently attached to a type that never shows the toggle.
      ...(type === 'cash' && { isDefault: false, isClosed: false })
    });
  }

  /** Default and Closed are mutually exclusive on the SAME account — a closed account can't also be
   *  the default, and vice versa. Turning one on here always clears the other; unlike the
   *  cross-account swap below, this never needs a confirmation (it's a direct consequence of the
   *  field you just touched on the account you're already editing, not a surprise change to a
   *  different one). */
  function setIsDefault(value: boolean) {
    patch({ isDefault: value, ...(value && { isClosed: false }) });
  }
  function setIsClosed(value: boolean) {
    patch({ isClosed: value, ...(value && { isDefault: false }) });
  }

  function openAdd() {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  }

  /** Same as `openAdd`, but pre-seeds the type (and its icon/color/net-worth default via `selectType`'s
   *  own logic) instead of leaving it at `DEFAULT_FORM`'s `'cash'` — used by the Accounts empty state's
   *  "or import a bank statement" secondary action, which needs a brand-new account created as `'bank'`
   *  with no type-picker step in between. `onCreated` fires once, after a successful save, with the
   *  created record — e.g. to hand off straight into Bank Import's setup screen. */
  function openAddWithType(type: AccountType, onCreated?: (acc: Account) => void) {
    const meta = ACCOUNT_TYPE_META[type];
    setEditing(null);
    setForm({ ...DEFAULT_FORM, type, icon: meta.icon, color: meta.color, includeInNetWorth: type !== 'credit_card' });
    onCreatedRef.current = onCreated ?? null;
    setShowForm(true);
  }

  function openEdit(acc: Account) {
    setEditing(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      openingBalance: String(acc.openingBalance),
      color: acc.color,
      icon: acc.icon,
      includeInNetWorth: acc.includeInNetWorth,
      bankId: acc.bankId ?? '',
      last4: acc.last4 ?? '',
      isDefault: acc.isDefault ?? false,
      isClosed: acc.isClosed ?? false
    });
    setShowForm(true);
  }

  /** Set only when `save()` finds a DIFFERENT account currently holding `isDefault` — the account
   *  that would lose it, pending the user's explicit confirmation (`confirmDefaultSwap`/
   *  `cancelDefaultSwap` below) before anything is actually written. */
  const [pendingDefaultSwap, setPendingDefaultSwap] = useState<Account | null>(null);

  async function doSave() {
    const name = form.name.trim();
    if (!name || nameError) return undefined;
    const wasEditing = editing;
    const trimmedLast4 = form.last4.trim();
    const swapTarget = pendingDefaultSwap;
    const record = await saveAccount(
      {
        name,
        type: form.type,
        openingBalance: parseNumber(form.openingBalance),
        color: form.color,
        icon: form.icon,
        includeInNetWorth: form.includeInNetWorth,
        isDefault: form.isDefault,
        isClosed: form.isClosed,
        ...(form.bankId && { bankId: form.bankId }),
        ...(trimmedLast4 && { last4: trimmedLast4 })
      },
      editing
    );
    // Cross-account `isDefault` exclusivity — clear it from whichever OTHER account previously held
    // it, via the SAME injected `saveAccount` callback (see this file's own module doc comment on
    // `findPreviousDefaultAccount`'s import for why this can't live inside any one feature's
    // `saveAccount` implementation instead). The confirm popup already got the user's explicit
    // go-ahead before `doSave()` was ever reached for this case — see `save()` below.
    if (swapTarget) {
      await saveAccount(
        {
          name: swapTarget.name,
          type: swapTarget.type,
          openingBalance: swapTarget.openingBalance,
          color: swapTarget.color,
          icon: swapTarget.icon,
          includeInNetWorth: swapTarget.includeInNetWorth,
          isDefault: false,
          isClosed: swapTarget.isClosed ?? false,
          ...(swapTarget.bankId && { bankId: swapTarget.bankId }),
          ...(swapTarget.last4 && { last4: swapTarget.last4 })
        },
        swapTarget
      );
    }
    setPendingDefaultSwap(null);
    setShowForm(false);
    if (!wasEditing && onCreatedRef.current) {
      onCreatedRef.current(record);
      onCreatedRef.current = null;
    }
    return record;
  }

  async function save() {
    if (form.isDefault) {
      const other = findPreviousDefaultAccount(accounts, { id: editing?.id ?? '', isDefault: true });
      if (other) {
        // Held for `confirmDefaultSwap()`/`cancelDefaultSwap()` below — the caller (`AccountFormModal.tsx`)
        // shows a confirm popup naming `other` instead of saving immediately, since this is a change to
        // a DIFFERENT account than the one currently being edited.
        setPendingDefaultSwap(other);
        return undefined;
      }
    }
    return doSave();
  }

  /** User confirmed the cross-account swap popup — proceeds with the save that `save()` held back. */
  function confirmDefaultSwap() {
    return doSave();
  }

  /** User cancelled the swap popup — nothing is saved, the form stays open exactly as it was. */
  function cancelDefaultSwap() {
    setPendingDefaultSwap(null);
  }

  return {
    showForm,
    editing,
    form,
    nameError,
    patch,
    selectType,
    setIsDefault,
    setIsClosed,
    pendingDefaultSwap,
    confirmDefaultSwap,
    cancelDefaultSwap,
    openAdd,
    openAddWithType,
    openEdit,
    save,
    close: () => setShowForm(false)
  };
}
