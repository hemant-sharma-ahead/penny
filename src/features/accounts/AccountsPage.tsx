import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountsRepo, expensesRepo } from '@/core/db/repositories';
import type { Account, AccountType, Expense } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { usePrivacy } from '@/context/PrivacyContext';
import { PATHS } from '@/router/paths';

const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: string; color: string }> = {
  cash: { label: 'Cash', icon: 'ti-cash', color: '#10b981' },
  bank: { label: 'Bank', icon: 'ti-building-bank', color: '#3b82f6' },
  credit_card: { label: 'Credit Card', icon: 'ti-credit-card', color: '#ef4444' },
  wallet: { label: 'Wallet', icon: 'ti-wallet', color: '#8b5cf6' }
};

interface AccountFormState {
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

const TYPE_OPTIONS: { type: AccountType; label: string; icon: string; color: string }[] = [
  { type: 'cash', label: 'Cash', icon: 'ti-cash', color: '#10b981' },
  { type: 'bank', label: 'Bank', icon: 'ti-building-bank', color: '#3b82f6' },
  { type: 'credit_card', label: 'Credit Card', icon: 'ti-credit-card', color: '#ef4444' },
  { type: 'wallet', label: 'Wallet', icon: 'ti-wallet', color: '#8b5cf6' }
];

export function AccountsPage() {
  const navigate = useNavigate();
  const { mode } = usePrivacy();
  const masked = mode !== 'open';

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txns, setTxns] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([accountsRepo.getAll(), expensesRepo.getAll()]).then(([accs, exps]) => {
      setAccounts(accs.filter((a) => !a.isArchived).sort((a, b) => a.createdAt - b.createdAt));
      setTxns(exps);
    });
  }, []);

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

  async function handleSave() {
    const name = form.name.trim();
    if (!name) return;
    const openingBalance = parseFloat(form.openingBalance) || 0;
    setSaving(true);
    const now = Date.now();
    if (editing) {
      const updated: Account = {
        ...editing,
        name,
        type: form.type,
        openingBalance,
        color: form.color,
        icon: form.icon,
        includeInNetWorth: form.includeInNetWorth,
        updatedAt: now
      };
      await accountsRepo.put(updated);
      setAccounts((prev) => prev.map((a) => (a.id === editing.id ? updated : a)));
    } else {
      const acc: Account = {
        id: crypto.randomUUID(),
        name,
        type: form.type,
        openingBalance,
        color: form.color,
        icon: form.icon,
        includeInNetWorth: form.includeInNetWorth,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      await accountsRepo.put(acc);
      setAccounts((prev) => [...prev, acc]);
    }
    setSaving(false);
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    await accountsRepo.delete(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setDeletingId(null);
  }

  function onTypeSelect(type: AccountType) {
    const meta = ACCOUNT_TYPE_META[type];
    setForm((f) => ({
      ...f,
      type,
      icon: meta.icon,
      color: meta.color,
      includeInNetWorth: type !== 'credit_card'
    }));
  }

  const totalBalance = accounts.reduce((sum, acc) => {
    if (!acc.includeInNetWorth) return sum;
    return sum + computeBalance(acc.id, acc.openingBalance, txns);
  }, 0);

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme flex items-center gap-3">
        <button
          onClick={() => navigate(PATHS.app.expenses)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
        <h2 className="text-xl font-semibold text-primary flex-1">Accounts</h2>
        <button
          onClick={openAdd}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
          aria-label="Add account"
        >
          <i className="ti ti-plus" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-3 flex-1">
        {/* Total balance */}
        {accounts.length > 0 && (
          <div className="surface rounded-2xl px-4 py-4">
            <p className="text-xs text-tertiary font-medium uppercase tracking-wide mb-1">Total Balance</p>
            <p className="text-2xl font-bold text-primary">{masked ? '••••••' : formatCurrency(totalBalance)}</p>
            <p className="text-xs text-tertiary mt-0.5">
              Across {accounts.length} account{accounts.length !== 1 ? 's' : ''} in net worth
            </p>
          </div>
        )}

        {/* Account list */}
        {accounts.length === 0 ? (
          <div className="surface rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
            <i className="ti ti-wallet text-tertiary" style={{ fontSize: 36 }} aria-hidden="true" />
            <p className="text-sm text-secondary">No accounts yet</p>
            <p className="text-xs text-tertiary">Add a cash wallet or bank account to start tracking balances.</p>
            <button
              onClick={openAdd}
              className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Add first account
            </button>
          </div>
        ) : (
          <div className="surface rounded-xl overflow-hidden divide-y divide-theme">
            {accounts.map((acc) => {
              const meta = ACCOUNT_TYPE_META[acc.type];
              const balance = computeBalance(acc.id, acc.openingBalance, txns);
              const isNeg = balance < 0;
              return (
                <div key={acc.id} className="px-4 py-3.5 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: acc.color + '20' }}
                  >
                    <i className={`ti ${acc.icon}`} style={{ fontSize: 20, color: acc.color }} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary truncate">{acc.name}</p>
                    <p className="text-xs text-tertiary">{meta.label}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className="text-sm font-semibold"
                      style={{
                        color: masked ? 'var(--color-text-primary)' : isNeg ? '#ef4444' : 'var(--color-text-primary)'
                      }}
                    >
                      {masked ? '••••' : formatCurrency(balance)}
                    </p>
                    {acc.includeInNetWorth && <p className="text-[10px] text-tertiary">in net worth</p>}
                  </div>
                  <button
                    onClick={() => openEdit(acc)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-tertiary hover:text-primary hover:bg-surface-2 flex-shrink-0"
                  >
                    <i className="ti ti-pencil" style={{ fontSize: 16 }} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setDeletingId(acc.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-tertiary hover:text-red-500 hover:bg-surface-2 flex-shrink-0"
                  >
                    <i className="ti ti-trash" style={{ fontSize: 16 }} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-sm bg-surface rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
            <h3 className="text-base font-semibold text-primary">{editing ? 'Edit account' : 'Add account'}</h3>

            {/* Type selector */}
            <div className="grid grid-cols-4 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const active = form.type === opt.type;
                return (
                  <button
                    key={opt.type}
                    onClick={() => onTypeSelect(opt.type)}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active ? opt.color + '15' : 'var(--color-surface)',
                      borderColor: active ? opt.color : 'var(--color-border)',
                      color: active ? opt.color : 'var(--color-text-secondary)'
                    }}
                  >
                    <i className={`ti ${opt.icon}`} style={{ fontSize: 20 }} aria-hidden="true" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wide">Account name</label>
              <input
                className="input-surface border rounded-xl px-3 py-2.5 text-sm"
                placeholder={
                  form.type === 'cash'
                    ? 'e.g. Wallet, Petty Cash'
                    : form.type === 'bank'
                      ? 'e.g. HDFC Savings, SBI Current'
                      : form.type === 'credit_card'
                        ? 'e.g. HDFC Regalia, Amex Gold'
                        : 'e.g. Paytm, PhonePe'
                }
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            {/* Opening balance */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wide">
                {editing ? 'Opening balance' : 'Current balance'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tertiary font-medium">₹</span>
                <input
                  className="input-surface border rounded-xl pl-7 pr-3 py-2.5 text-sm w-full"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.openingBalance}
                  onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
                />
              </div>
              <p className="text-xs text-tertiary">
                {form.type === 'credit_card'
                  ? 'Enter outstanding amount owed (will show as negative balance)'
                  : 'Balance before any transactions you record in Penny'}
              </p>
            </div>

            {/* Include in net worth */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form.includeInNetWorth}
                  onChange={(e) => setForm((f) => ({ ...f, includeInNetWorth: e.target.checked }))}
                />
                <div
                  className="w-10 h-6 rounded-full transition-colors"
                  style={{ backgroundColor: form.includeInNetWorth ? 'var(--color-primary)' : 'var(--color-border)' }}
                />
                <div
                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
                  style={{ left: form.includeInNetWorth ? '22px' : '4px' }}
                />
              </div>
              <span className="text-sm text-primary">Include in net worth</span>
            </label>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border border-theme text-sm font-medium text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-[2] py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeletingId(null)} />
          <div className="relative w-full max-w-sm bg-surface rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
            <h3 className="text-base font-semibold text-primary">Delete account?</h3>
            <p className="text-sm text-secondary">
              The account will be removed. Transactions linked to it will remain but will show no account.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-3 rounded-xl border border-theme text-sm font-medium text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="flex-[2] py-3 rounded-xl text-sm font-semibold text-white bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
