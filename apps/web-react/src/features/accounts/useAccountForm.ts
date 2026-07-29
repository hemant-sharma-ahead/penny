import { useState } from 'react';
import type { Account, AccountType } from '@/core/db/types';
import { ACCOUNT_TYPE_META } from '@/core/accounts/meta';
import { findDuplicateAccountName } from '@/core/accounts/accountValidation';
import { parseNumber } from '@/lib/formatters';
import type { AccountInput } from './useAccounts';

export interface AccountFormState {
  name: string;
  type: AccountType;
  openingBalance: string;
  color: string;
  icon: string;
  includeInNetWorth: boolean;
}

const DEFAULT_FORM: AccountFormState = {
  name: '',
  type: 'cash',
  openingBalance: '0',
  color: '#10b981',
  icon: 'ti-cash',
  includeInNetWorth: true
};

/** Owns the add/edit account form lifecycle and bridges to the save mutation. `accounts` is the
 *  current account list, used to reject a duplicate name (case-insensitive, trimmed) — no two
 *  accounts may ever share the same name (app-wide rule, see accountValidation.ts). */
export function useAccountForm(
  saveAccount: (data: AccountInput, editing: Account | null) => Promise<unknown>,
  accounts: Account[]
) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);

  const nameError = findDuplicateAccountName(form.name, accounts, editing?.id)
    ? 'An account with this name already exists'
    : undefined;

  function patch(updates: Partial<AccountFormState>) {
    setForm((f) => ({ ...f, ...updates }));
  }

  function selectType(type: AccountType) {
    const meta = ACCOUNT_TYPE_META[type];
    patch({ type, icon: meta.icon, color: meta.color, includeInNetWorth: type !== 'credit_card' });
  }

  function openAdd() {
    setEditing(null);
    setForm(DEFAULT_FORM);
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
      includeInNetWorth: acc.includeInNetWorth
    });
    setShowForm(true);
  }

  async function save() {
    const name = form.name.trim();
    if (!name || nameError) return;
    await saveAccount(
      {
        name,
        type: form.type,
        openingBalance: parseNumber(form.openingBalance),
        color: form.color,
        icon: form.icon,
        includeInNetWorth: form.includeInNetWorth
      },
      editing
    );
    setShowForm(false);
  }

  return {
    showForm,
    editing,
    form,
    nameError,
    patch,
    selectType,
    openAdd,
    openEdit,
    save,
    close: () => setShowForm(false)
  };
}
