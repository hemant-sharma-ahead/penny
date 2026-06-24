import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account, Expense, ExpenseCategory, Hashtag, TransactionType } from '@/core/db/types';
import type { ActiveEvent } from '@/context/EventModeContext';
import { accountsRepo, expenseCategoriesRepo } from '@/core/db/repositories';
import { INTENT_GROUP_META } from '@/core/db/defaultCategories';
import { epochToDateInput } from '@/lib/formatters';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { Modal, Button, Toggle, TextInput, SegmentedControl } from '@/components/ui';

interface Props {
  categories: ExpenseCategory[];
  hashtags: Hashtag[];
  editing: Expense | null;
  activeEvents: ActiveEvent[];
  initialType?: TransactionType;
  onSave: (expense: Expense) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryCreated: () => void;
  onClose: () => void;
}

const CAT_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6b7280'];

const PAYMENT_MODES = [
  { id: 'cash', label: 'Cash', icon: 'ti-cash', color: '#22c55e' },
  { id: 'upi', label: 'UPI', icon: 'ti-qrcode', color: '#7c3aed' },
  { id: 'card', label: 'Card', icon: 'ti-credit-card', color: '#3b82f6' },
  { id: 'net', label: 'Net', icon: 'ti-building-bank', color: '#0ea5e9' },
  { id: 'wallet', label: 'Wallet', icon: 'ti-wallet', color: '#f97316' }
];

const TYPE_META: Record<TransactionType, { label: string; color: string; icon: string }> = {
  expense: { label: 'Expense', color: '#ef4444', icon: 'ti-arrow-down-circle' },
  income: { label: 'Income', color: '#10b981', icon: 'ti-arrow-up-circle' },
  transfer: { label: 'Transfer', color: '#3b82f6', icon: 'ti-arrows-exchange' }
};

function parseTags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);
}

// ── Account chips ─────────────────────────────────────────────────────────────

interface AccountChipsProps {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  showNone?: boolean;
  disabledId?: string;
  onAddAccount: () => void;
}

function AccountChips({ accounts, value, onChange, showNone, disabledId, onAddAccount }: AccountChipsProps) {
  if (accounts.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon="ti-plus"
        style={{ color: 'var(--color-primary)' }}
        onClick={onAddAccount}
      >
        Add account to track balance
      </Button>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {showNone && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-[64px]"
          style={
            value === ''
              ? { borderColor: '#6b7280', backgroundColor: 'var(--color-surface-secondary)' }
              : { borderColor: 'transparent', backgroundColor: 'var(--color-surface-secondary)' }
          }
        >
          <i className="ti ti-circle-off" style={{ fontSize: 18, color: '#6b7280' }} aria-hidden="true" />
          <span className="text-[9px] font-medium leading-tight text-secondary">None</span>
        </button>
      )}
      {accounts.map((acc) => {
        const isSelected = value === acc.id;
        const isDisabled = acc.id === disabledId;
        return (
          <button
            key={acc.id}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(isSelected && showNone ? '' : acc.id)}
            className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-[64px]"
            style={{
              opacity: isDisabled ? 0.35 : 1,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              borderColor: isSelected ? acc.color : 'transparent',
              backgroundColor: 'var(--color-surface-secondary)'
            }}
          >
            <i className={`ti ${acc.icon}`} style={{ fontSize: 18, color: acc.color }} aria-hidden="true" />
            <span className="text-[9px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
              {acc.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────────

export function ExpenseForm({
  categories,
  hashtags,
  editing,
  activeEvents,
  initialType,
  onSave,
  onDelete,
  onCategoryCreated,
  onClose
}: Props) {
  const navigate = useNavigate();
  const [type, setType] = useState<TransactionType>(editing?.type ?? initialType ?? 'expense');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(editing?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [date, setDate] = useState(() => (editing ? epochToDateInput(editing.date) : epochToDateInput(Date.now())));
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [paymentMode, setPaymentMode] = useState(editing?.paymentMode ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [tagInput, setTagInput] = useState(() => {
    if (editing) return editing.hashtags.join(' ');
    const autoTags = activeEvents.filter((e) => e.autoTag).map((e) => e.hashtag.toLowerCase());
    return autoTags.length > 0 ? autoTags.join(' ') + ' ' : '';
  });
  const [isRecurring, setIsRecurring] = useState(editing?.isRecurring ?? false);
  const [intervalDays, setIntervalDays] = useState(String(editing?.recurringIntervalDays ?? 30));
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('ti-dots');
  const [newCatColor, setNewCatColor] = useState('#6b7280');
  const [savingCat, setSavingCat] = useState(false);

  const initEditing = useRef(editing);

  useEffect(() => {
    accountsRepo.getAll().then((accs) => {
      const active = accs.filter((a) => !a.isArchived);
      setAccounts(active);
      if (!initEditing.current && active.length > 0) {
        const first = active[0];
        if (first) {
          setAccountId(first.id);
          if (first.type === 'cash') setPaymentMode('cash');
        }
      }
    });
  }, []);

  const applicableCategories = useMemo(() => {
    if (type === 'income') return categories.filter((c) => c.applicableTo === 'income');
    if (type === 'transfer') return [];
    return categories.filter((c) => !c.applicableTo || c.applicableTo === 'expense');
  }, [categories, type]);

  const groupedCategories = useMemo(() => {
    const byGroup = new Map<string, ExpenseCategory[]>();
    for (const cat of applicableCategories) {
      const group = cat.intentGroup ?? 'other';
      const arr = byGroup.get(group) ?? [];
      arr.push(cat);
      byGroup.set(group, arr);
    }
    return Object.entries(INTENT_GROUP_META)
      .filter(([g]) => (type === 'income' ? g === 'income' : g !== 'income' && g !== 'transfers'))
      .flatMap(([group, meta]) => {
        const cats = byGroup.get(group) ?? [];
        return cats.length > 0 ? [{ group, label: meta.label, color: meta.color, cats }] : [];
      });
  }, [applicableCategories, type]);

  const selectedCat = useMemo(
    () => (type !== 'transfer' ? applicableCategories.find((c) => c.id === categoryId) : undefined),
    [categoryId, applicableCategories, type]
  );

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);

  function isPaymentModeDisabled(modeId: string): boolean {
    if (!selectedAccount) return false;
    if (selectedAccount.type === 'cash') return modeId !== 'cash';
    return modeId === 'cash';
  }

  function handleAccountSelect(id: string) {
    setAccountId(id);
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;
    if (acc.type === 'cash') {
      setPaymentMode('cash');
    } else if (paymentMode === 'cash') {
      setPaymentMode('');
    }
  }

  function handleTypeChange(newType: TransactionType) {
    setType(newType);
    setCategoryId('');
    setPaymentMode('');
    setIsRecurring(false);
  }

  const activeTags = parseTags(tagInput);
  const tagParts = tagInput.split(/[\s,]+/);
  const lastWord = (tagParts[tagParts.length - 1] ?? '').replace(/^#/, '');
  const tagSuggestions =
    lastWord.length > 0
      ? hashtags.filter((h) => h.name.startsWith(lastWord) && !activeTags.includes(h.name)).slice(0, 5)
      : [];

  function applyTagSuggestion(name: string) {
    const parts = tagInput.split(/[\s,]+/);
    parts[parts.length - 1] = name;
    setTagInput(parts.join(' ') + ' ');
  }

  function toggleEventTag(ev: ActiveEvent) {
    const tag = ev.hashtag.toLowerCase();
    if (activeTags.includes(tag)) {
      setTagInput(activeTags.filter((t) => t !== tag).join(' ') + ' ');
    } else {
      setTagInput((prev) => (prev.trim() ? prev.trim() + ' ' + tag + ' ' : tag + ' '));
    }
  }

  function handleSave() {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || !description.trim()) return;
    if (type !== 'transfer' && !categoryId) return;
    setSaving(true);
    const now = Date.now();
    const base: Expense = {
      id: editing?.id ?? crypto.randomUUID(),
      amount: amt,
      categoryId: type === 'transfer' ? 'cat-tr-bank' : categoryId,
      description: description.trim(),
      date: new Date(date).getTime(),
      hashtags: type === 'transfer' ? [] : parseTags(tagInput),
      isRecurring,
      ...(isRecurring && { recurringIntervalDays: parseInt(intervalDays, 10) || 30 }),
      ...(paymentMode && { paymentMode }),
      type,
      ...(accountId && { accountId }),
      ...(type === 'transfer' && toAccountId ? { toAccountId } : {}),
      source: editing?.source ?? 'manual',
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    };
    onSave(base)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  async function handleCreateCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setSavingCat(true);
    const newCat: ExpenseCategory = {
      id: `cat-custom-${crypto.randomUUID().slice(0, 8)}`,
      name,
      icon: newCatIcon || 'ti-dots',
      color: newCatColor,
      isDefault: false,
      intentGroup: 'other',
      applicableTo: 'expense',
      createdAt: Date.now()
    };
    try {
      await expenseCategoriesRepo.put(newCat);
      setCategoryId(newCat.id);
      onCategoryCreated();
      setShowNewCat(false);
      setShowCategoryPicker(false);
      setNewCatName('');
      setNewCatIcon('ti-dots');
      setNewCatColor('#6b7280');
    } finally {
      setSavingCat(false);
    }
  }

  function goToAccounts() {
    onClose();
    navigate(PATHS.app.accounts);
  }

  const typeMeta = TYPE_META[type];
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const titleText = editing ? `Edit ${typeLabel}` : `Add ${typeLabel}`;
  const saveText = saving ? 'Saving…' : editing ? 'Update' : `Add ${typeLabel}`;

  return (
    <>
      {/* ── Main form modal ── */}
      <Modal
        onClose={onClose}
        title={titleText}
        scrollable
        footer={
          <div className="flex gap-3">
            {editing && (
              <Button variant="danger" fullWidth onClick={() => editing && onDelete(editing.id).catch(() => {})}>
                Delete
              </Button>
            )}
            <Button color={typeMeta.color} fullWidth loading={saving} onClick={handleSave}>
              {saveText}
            </Button>
          </div>
        }
      >
        {/* Type selector (only when adding new) */}
        {!editing && (
          <SegmentedControl
            options={[
              { value: 'expense' as const, label: 'Expense', icon: 'ti-arrow-down-circle', color: '#ef4444' },
              { value: 'income' as const, label: 'Income', icon: 'ti-arrow-up-circle', color: '#10b981' },
              { value: 'transfer' as const, label: 'Transfer', icon: 'ti-arrows-exchange', color: '#3b82f6' }
            ]}
            value={type}
            onChange={handleTypeChange}
          />
        )}

        {/* ── Amount row: [Category chip] + [Amount] + [Date] ── */}
        <div className="flex gap-2 items-end">
          {/* Category chip (expense/income only) */}
          {type !== 'transfer' && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-secondary">Category</span>
              <button
                type="button"
                onClick={() => setShowCategoryPicker(true)}
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border-2 transition-colors w-[68px]"
                style={{
                  minHeight: '58px',
                  borderColor: selectedCat ? selectedCat.color : 'var(--color-border)',
                  backgroundColor: 'var(--color-surface-secondary)'
                }}
              >
                {selectedCat ? (
                  <i
                    className={`ti ${selectedCat.icon}`}
                    style={{ fontSize: 18, color: selectedCat.color }}
                    aria-hidden="true"
                  />
                ) : (
                  <i
                    className="ti ti-layout-grid-add"
                    style={{ fontSize: 18, color: 'var(--color-text-tertiary)' }}
                    aria-hidden="true"
                  />
                )}
                <span
                  className="text-[8px] font-medium text-center leading-tight line-clamp-2 break-words w-full"
                  style={{ color: selectedCat ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}
                >
                  {selectedCat?.name ?? 'Select'}
                </span>
              </button>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <TextInput
              label="Amount (₹)"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={setAmount}
              autoFocus
            />
          </div>

          <div className="w-[142px] flex-shrink-0">
            <TextInput label="Date" type="date" value={date} onChange={setDate} />
          </div>
        </div>

        {/* ── Account section ── */}
        {type === 'transfer' ? (
          accounts.length === 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="ti-plus"
              style={{ color: '#3b82f6' }}
              onClick={goToAccounts}
            >
              Add accounts to track where money moves
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">From account</label>
                <div className="mt-1">
                  <AccountChips
                    accounts={accounts}
                    value={accountId}
                    onChange={setAccountId}
                    disabledId={toAccountId}
                    onAddAccount={goToAccounts}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">To account</label>
                <div className="mt-1">
                  <AccountChips
                    accounts={accounts}
                    value={toAccountId}
                    onChange={setToAccountId}
                    disabledId={accountId}
                    onAddAccount={goToAccounts}
                  />
                </div>
              </div>
            </div>
          )
        ) : (
          <div>
            <label className="text-xs font-medium text-secondary">Account</label>
            <div className="mt-1">
              <AccountChips
                accounts={accounts}
                value={accountId}
                onChange={handleAccountSelect}
                onAddAccount={goToAccounts}
              />
            </div>
          </div>
        )}

        {/* ── Payment mode ── */}
        <div>
          <label className="text-xs font-medium text-secondary">Payment mode</label>
          <div className="mt-1 flex gap-2 overflow-x-auto pb-0.5">
            {PAYMENT_MODES.map((m) => {
              const disabled = isPaymentModeDisabled(m.id);
              const active = paymentMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setPaymentMode((prev) => (prev === m.id ? '' : m.id))}
                  className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-[58px]"
                  style={{
                    opacity: disabled ? 0.3 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    borderColor: active && !disabled ? m.color : 'transparent',
                    backgroundColor: 'var(--color-surface-secondary)'
                  }}
                >
                  <i className={`ti ${m.icon}`} style={{ fontSize: 18, color: m.color }} aria-hidden="true" />
                  <span className="text-[9px] font-medium leading-tight text-secondary">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <TextInput
          label="Description"
          type="text"
          placeholder={type === 'transfer' ? 'e.g. Moving to savings' : 'What was this for?'}
          value={description}
          onChange={setDescription}
        />

        {/* Active event chips (expense only) */}
        {type === 'expense' && activeEvents.length > 0 && (
          <div>
            <label className="text-xs font-medium text-secondary">Active events</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {activeEvents.map((ev) => {
                const isTagged = activeTags.includes(ev.hashtag.toLowerCase());
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => toggleEventTag(ev)}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border-2 transition-colors"
                    style={
                      isTagged
                        ? { borderColor: ev.color, backgroundColor: `${ev.color}18`, color: ev.color }
                        : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    {ev.name}
                    {ev.autoTag && !isTagged && <span className="text-[9px] opacity-60">auto</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tags (expense/income) */}
        {type !== 'transfer' && (
          <div>
            <TextInput
              label="Tags"
              type="text"
              placeholder="emi groceries travel"
              value={tagInput}
              onChange={setTagInput}
            />
            {tagSuggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tagSuggestions.map((s) => (
                  <Button key={s.id} variant="secondary" size="sm" onClick={() => applyTagSuggestion(s.name)}>
                    #{s.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recurring toggle */}
        <div className={`grid gap-3 ${isRecurring ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="text-xs font-medium text-secondary">Recurring</label>
            <div className="mt-1 flex items-center justify-between rounded-xl border border-theme px-3 py-3">
              <span className="text-xs text-tertiary">Bills, EMIs</span>
              <Toggle value={isRecurring} onChange={setIsRecurring} aria-label="Toggle recurring" />
            </div>
          </div>
          {isRecurring && (
            <TextInput
              label="Every (days)"
              type="number"
              inputMode="numeric"
              value={intervalDays}
              onChange={setIntervalDays}
            />
          )}
        </div>
      </Modal>

      {/* ── Category picker — nested modal (z-70, above form) ── */}
      {showCategoryPicker && (
        <Modal nested onClose={() => setShowCategoryPicker(false)} title="Select category" scrollable>
          {groupedCategories.map(({ group, label, color, cats }) => (
            <div key={group}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
                  {label}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {cats.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(cat.id);
                      setShowCategoryPicker(false);
                    }}
                    className="flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition-colors"
                    style={
                      categoryId === cat.id
                        ? { borderColor: cat.color, backgroundColor: 'var(--color-surface-secondary)' }
                        : { borderColor: 'transparent', backgroundColor: 'var(--color-surface-secondary)' }
                    }
                  >
                    <i className={`ti ${cat.icon}`} style={{ fontSize: 16, color: cat.color }} aria-hidden="true" />
                    <span className="text-[8px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
                      {cat.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* New category (expense only) */}
          {type === 'expense' &&
            (showNewCat ? (
              <div className="bg-surface-2 rounded-xl p-3 flex flex-col gap-2.5 border border-theme">
                <TextInput placeholder="Category name" value={newCatName} onChange={setNewCatName} autoFocus />
                <TextInput
                  label="Icon name (Tabler)"
                  placeholder="ti-star, ti-home, ti-bolt…"
                  value={newCatIcon}
                  onChange={setNewCatIcon}
                />
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-secondary flex-shrink-0">Colour</p>
                  {CAT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCatColor(c)}
                      className="w-6 h-6 rounded-full border-2 flex-shrink-0 transition-transform"
                      style={{
                        backgroundColor: c,
                        borderColor: newCatColor === c ? 'var(--color-text-primary)' : 'transparent',
                        transform: newCatColor === c ? 'scale(1.2)' : 'scale(1)'
                      }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" fullWidth onClick={() => setShowNewCat(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    fullWidth
                    color={newCatColor}
                    loading={savingCat}
                    disabled={!newCatName.trim()}
                    onClick={() => void handleCreateCategory()}
                  >
                    {savingCat ? 'Creating…' : 'Create'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" icon="ti-plus" onClick={() => setShowNewCat(true)}>
                New category
              </Button>
            ))}
        </Modal>
      )}
    </>
  );
}
