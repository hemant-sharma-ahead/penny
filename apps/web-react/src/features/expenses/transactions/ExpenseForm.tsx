import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type {
  Account,
  Expense,
  ExpenseCategory,
  GroupMember,
  GroupType,
  Hashtag,
  MerchantMemory,
  Person,
  TransactionType
} from '@/core/db/types';
import type { ExpenseSeedIntent } from '@/core/iou/expenseLink';
import type { ActiveEvent } from '@/context/EventModeContext';
import { accountsRepo, groupMembersRepo, profileRepo } from '@/core/db/repositories';
import { epochToDateInput, formatCurrency } from '@/lib/formatters';
import { dateInputToEpoch } from '@/lib/date';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { Modal, Button, TextInput, SegmentedControl, AmountInput, Banner, SelectInput } from '@/components/ui';
import { projectedBalance } from '@/core/accounts/balanceCalculator';
import { CategoryPickerModal } from '../categories/CategoryPickerModal';
import type { CategoryManager } from '../categories/types';
import { AccountChips } from './AccountChips';
import { PaymentModeChips } from './PaymentModeChips';
import { couplePaymentToAccount } from './paymentModes';
import { fileToReceiptDataUrl } from '@/lib/image';
import { ItemHistory } from '../../activity/components/ItemHistory';

interface Props {
  categories: ExpenseCategory[];
  hashtags: Hashtag[];
  editing: Expense | null;
  /** Seeds a NEW transaction (duplicate / template) when not editing. */
  prefill?: Partial<Expense> | null;
  activeEvents: ActiveEvent[];
  /** Current balance per account id — powers the soft cash-negative guard (Track E). */
  accountBalances?: Record<string, number>;
  /** Groups the user can share this expense into (Track E; empty when not sync-entitled). */
  shareGroups?: { id: string; name: string; type: GroupType }[];
  /** Mirror this expense into a group as an equal-split shared expense (optionally among a subset). */
  onShareToGroup?: ((expense: Expense, groupId: string, participants?: string[]) => Promise<void>) | undefined;
  initialType?: TransactionType;
  onSave: (expense: Expense, newTagSetAside?: Record<string, boolean>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Existing IOU people (for the optional Split/IOU suggestions). */
  iouPersons?: Person[];
  /** Seeds an IOU ledger entry from a new expense (lent to / borrowed from someone). */
  onSeedIou?: (expenseId: string, intent: ExpenseSeedIntent | null) => Promise<void>;
  /** When editing: the existing expense-seeded IOU link for this transaction (so it can be shown/removed). */
  linkedIou?: { personName: string } | null | undefined;
  searchMerchant: (type: TransactionType, query: string) => MerchantMemory[];
  onDuplicate?: (expense: Expense) => void;
  onSaveTemplate?: (t: {
    label: string;
    type: TransactionType;
    description: string;
    categoryId: string;
    amount?: number;
    accountId?: string;
    paymentMode?: string;
  }) => void;
  categoryManager: CategoryManager;
  onClose: () => void;
}

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

// A circular icon button with a caption below — the secondary-action style (Tags / Receipt / Lent / Repeat).
function ExtraCircle({
  icon,
  label,
  active,
  accent,
  onClick
}: {
  icon: string;
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5" style={{ flex: '0 0 64px' }}>
      <span
        className="w-11 h-11 rounded-full flex items-center justify-center border transition-colors"
        style={{
          borderColor: active ? accent : 'var(--color-border)',
          backgroundColor: active ? `${accent}1f` : 'var(--color-surface-secondary)'
        }}
      >
        <i
          className={`ti ${icon}`}
          style={{ fontSize: 18, color: active ? accent : 'var(--color-text-tertiary)' }}
          aria-hidden="true"
        />
      </span>
      <span
        className="text-[10px] font-medium leading-none"
        style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}
      >
        {label}
      </span>
    </button>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────────

export function ExpenseForm({
  categories,
  hashtags,
  editing,
  prefill,
  activeEvents,
  accountBalances,
  shareGroups = [],
  onShareToGroup,
  initialType,
  onSave,
  onDelete,
  iouPersons,
  onSeedIou,
  linkedIou,
  searchMerchant,
  onDuplicate,
  onSaveTemplate,
  categoryManager,
  onClose
}: Props) {
  const navigate = useNavigate();
  // Editing seeds from the record; a new entry may seed from a duplicate/template prefill.
  const seed = editing ?? prefill ?? null;
  const [type, setType] = useState<TransactionType>(seed?.type ?? initialType ?? 'expense');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(seed?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(seed?.toAccountId ?? '');
  const [amount, setAmount] = useState(seed?.amount != null ? String(seed.amount) : '');
  const [date, setDate] = useState(() => (editing ? epochToDateInput(editing.date) : epochToDateInput(Date.now())));
  const [categoryId, setCategoryId] = useState(seed?.categoryId ?? '');
  const [paymentMode, setPaymentMode] = useState(seed?.paymentMode ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [tagInput, setTagInput] = useState(() => {
    if (seed?.hashtags && seed.hashtags.length > 0) return seed.hashtags.join(' ') + (editing ? '' : ' ');
    const autoTags = activeEvents.filter((e) => e.autoTag).map((e) => e.hashtag.toLowerCase());
    return autoTags.length > 0 ? autoTags.join(' ') + ' ' : '';
  });
  // Set Aside choice for the tag currently being typed/selected, when it doesn't exist yet — shown
  // inline in the Tags panel. Resets whenever the in-progress tag changes (see the effect below).
  const [pendingNewTagSetAside, setPendingNewTagSetAside] = useState(false);
  const [isRecurring, setIsRecurring] = useState(editing?.isRecurring ?? false);
  const [intervalDays, setIntervalDays] = useState(String(editing?.recurringIntervalDays ?? 30));
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [receipt, setReceipt] = useState<string | undefined>(editing?.receiptDataUrl);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  // Merchant memory: once the user picks a suggestion (or there's nothing useful),
  // hide the type-ahead list until they edit the description again.
  const [memPicked, setMemPicked] = useState(false);

  // Validation highlighting on submit.
  const [errors, setErrors] = useState<{
    amount?: boolean;
    desc?: boolean;
    cat?: boolean;
    tags?: boolean;
    iouPerson?: boolean;
    shareGroup?: boolean;
    repeatInterval?: boolean;
  }>({});
  // Scroll-to-and-focus targets for the conditionally-required fields below — each toggle's field is
  // only required while that toggle is on (see handleSave).
  const tagsPanelRef = useRef<HTMLDivElement>(null);
  const iouPanelRef = useRef<HTMLDivElement>(null);
  const sharePanelRef = useRef<HTMLDivElement>(null);
  const repeatPanelRef = useRef<HTMLDivElement>(null);

  // Secondary-field disclosure (circular icons). Open if the field already has content on load.
  const initialTags = parseTags(tagInput);
  const [showTags, setShowTags] = useState(initialTags.length > 0);
  const [showReceipt, setShowReceipt] = useState(!!editing?.receiptDataUrl);

  // Optional IOU link (new expense/income only): an expense can be "lent to" someone (they owe you),
  // an income can be "borrowed from" someone (you owe them). The transaction itself is the money
  // movement; this seeds the matching IOU ledger entry. Direction follows the transaction type.
  const [iouEnabled, setIouEnabled] = useState(!!linkedIou);
  const [iouPerson, setIouPerson] = useState(linkedIou?.personName ?? '');
  // Optional per-item "Share with a group" (Track E, screen 8). Off by default in Personal; auto-on when
  // a linked vacation is active (screens 10–11) so logging an expense splits with companions in one save.
  const linkedTripGroupId = activeEvents.find((e) => e.subtype === 'immersive' && e.linkedGroupId)?.linkedGroupId;
  // Vacation Mode soft default for the category picker: lead with Travel picks + a "why" note, but
  // never restrict — every other group stays reachable by scrolling.
  const activeVacationEvent = activeEvents.find((e) => e.subtype === 'immersive');
  const defaultShareGroupId =
    editing?.shareWith?.[0] ??
    (linkedTripGroupId && shareGroups.some((g) => g.id === linkedTripGroupId) ? linkedTripGroupId : '');
  const [shareEnabled, setShareEnabled] = useState(!!defaultShareGroupId);
  const [shareGroupId, setShareGroupId] = useState(defaultShareGroupId);
  const [shareMembers, setShareMembers] = useState<GroupMember[]>([]);
  const [shareParticipants, setShareParticipants] = useState<Set<string>>(new Set());
  const [myUserId, setMyUserId] = useState<string | undefined>();
  const alreadyShared = !!editing?.shareWith?.length;
  const showShareSection = !!onShareToGroup && shareGroups.length > 0 && type === 'expense';

  // Load the selected group's active members (for the participant avatars + "you're owed" preview).
  // No-op while sharing is off / no group picked — the members UI is gated on `shareEnabled` anyway.
  // Family-type groups default to "just me" (visibility, not a split) — Indian family spend is
  // usually one-directional, not reciprocal. Trip/Roommates keep the existing "everyone splits" default.
  useEffect(() => {
    if (!shareEnabled || !shareGroupId) return;
    let cancelled = false;
    const isFamilyGroup = shareGroups.find((g) => g.id === shareGroupId)?.type === 'family';
    void Promise.all([groupMembersRepo.getAll(), profileRepo.getAll()]).then(([all, profile]) => {
      if (cancelled) return;
      const active = all.filter((m) => m.groupId === shareGroupId && m.status === 'active');
      const myId = profile[0]?.userId;
      setShareMembers(active);
      setMyUserId(myId);
      setShareParticipants(isFamilyGroup && myId ? new Set([myId]) : new Set(active.map((m) => m.userId)));
    });
    return () => {
      cancelled = true;
    };
  }, [shareEnabled, shareGroupId, shareGroups]);
  const iouKind: 'lent' | 'borrowed' = type === 'income' ? 'borrowed' : 'lent';
  // Shown for new AND editing expense/income — editing prefills from the existing link so it can be changed or removed.
  const showIouSection = !!onSeedIou && (type === 'expense' || type === 'income');

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

  const selectedCat = useMemo(
    () => (type !== 'transfer' ? categories.find((c) => c.id === categoryId) : undefined),
    [categoryId, categories, type]
  );

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);

  // Soft cash-negative guard (Track E): warn (non-blocking) when this entry would drive a CASH account
  // below ₹0 — usually a missed cash withdrawal or the wrong account. Save is still allowed.
  const cashWarningBalance = useMemo(() => {
    const amt = Number(amount) || 0;
    if (!accountBalances || amt <= 0 || !selectedAccount || selectedAccount.type !== 'cash') return null;
    if (type === 'income') return null; // income only increases the balance
    // Base excludes this entry's own current effect when editing, so it isn't double-counted.
    let base = accountBalances[selectedAccount.id] ?? selectedAccount.openingBalance;
    if (editing) base -= projectedBalance(selectedAccount.id, 0, [], editing);
    const projected = projectedBalance(selectedAccount.id, base, [], {
      accountId,
      toAccountId,
      amount: amt,
      type
    });
    return projected < 0 ? projected : null;
  }, [accountBalances, amount, selectedAccount, type, accountId, toAccountId, editing]);

  function handleAccountSelect(id: string) {
    setAccountId(id);
    setPaymentMode((prev) =>
      couplePaymentToAccount(
        accounts.find((a) => a.id === id),
        prev
      )
    );
  }

  function handleTypeChange(newType: TransactionType) {
    setType(newType);
    setCategoryId('');
    setPaymentMode('');
    setIsRecurring(false);
    setMemPicked(false);
    setErrors({});
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    setMemPicked(false); // re-open suggestions as the merchant text changes
    if (errors.desc) setErrors((e) => ({ ...e, desc: false }));
  }

  // Merchant memory: ranked type-ahead matches for the current description text
  // (one row per merchant+category). Nothing fills until the user taps a row.
  const memSuggestions = useMemo(
    () => (!editing && type !== 'transfer' && description.trim().length >= 2 ? searchMerchant(type, description) : []),
    [editing, type, description, searchMerchant]
  );
  const showMemSuggestions = !memPicked && memSuggestions.length > 0;

  function applyMemory(mem: MerchantMemory) {
    setDescription(mem.description);
    if (mem.categoryId) setCategoryId(mem.categoryId);
    const memAccount = mem.accountId ? accounts.find((a) => a.id === mem.accountId) : undefined;
    if (memAccount) {
      setAccountId(memAccount.id);
      setPaymentMode(couplePaymentToAccount(memAccount, mem.paymentMode ?? ''));
    } else if (mem.paymentMode) {
      setPaymentMode(couplePaymentToAccount(selectedAccount, mem.paymentMode));
    }
    setMemPicked(true);
    setErrors((e) => ({ ...e, desc: false, cat: false }));
  }

  const activeTags = parseTags(tagInput);
  const tagParts = tagInput.split(/[\s,]+/);
  const lastWord = (tagParts[tagParts.length - 1] ?? '').replace(/^#/, '');
  const tagSuggestions =
    lastWord.length > 0
      ? hashtags.filter((h) => h.name.startsWith(lastWord) && !activeTags.includes(h.name)).slice(0, 5)
      : [];

  // Frequent tags — always visible in the Tags panel, no typing required (top-5 by usage, minus ones
  // already on this transaction and ones already shown as an event pill below).
  const eventHashtagNames = new Set(activeEvents.map((e) => e.hashtag.toLowerCase()));
  const frequentTags = [...hashtags]
    .filter((h) => !activeTags.includes(h.name) && !eventHashtagNames.has(h.name))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5);

  // Tracks whichever tag the user most recently typed or tapped, independent of `lastWord` (which
  // goes blank right after a tap, since applyTagSuggestion appends a trailing space) — this is what
  // drives the Set Aside box: editable while defining a brand-new tag, read-only once it already exists.
  const [focusedTag, setFocusedTag] = useState('');
  const matchingExistingTag = focusedTag ? hashtags.find((h) => h.name === focusedTag) : undefined;
  const isNewTagInProgress = focusedTag.length > 0 && !matchingExistingTag;

  // Reset the pending choice right when the in-progress tag identity actually changes — driven by the
  // input events below, not a reactive effect (a new tag's Set Aside choice shouldn't carry over from
  // whatever tag was being typed a moment ago).
  function handleTagInputChange(v: string) {
    setTagInput(v);
    const parts = v.split(/[\s,]+/);
    const next = (parts[parts.length - 1] ?? '').replace(/^#/, '').toLowerCase();
    if (next !== focusedTag) setPendingNewTagSetAside(false);
    setFocusedTag(next);
  }

  function applyTagSuggestion(name: string) {
    const parts = tagInput.split(/[\s,]+/);
    parts[parts.length - 1] = name;
    setTagInput(parts.join(' ') + ' ');
    if (name !== focusedTag) setPendingNewTagSetAside(false);
    setFocusedTag(name);
  }

  function toggleEventTag(ev: ActiveEvent) {
    const tag = ev.hashtag.toLowerCase();
    if (activeTags.includes(tag)) {
      setTagInput(activeTags.filter((t) => t !== tag).join(' ') + ' ');
    } else {
      setTagInput((prev) => (prev.trim() ? prev.trim() + ' ' + tag + ' ' : tag + ' '));
    }
  }

  function focusPanel(ref: React.RefObject<HTMLDivElement | null>) {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')?.focus();
  }

  function handleSave() {
    const amt = parseFloat(amount);
    const nextErrors = {
      amount: isNaN(amt) || amt <= 0,
      desc: !description.trim(),
      cat: type !== 'transfer' && !categoryId,
      // Each of these is required only while its own toggle is on — off entirely, they're skipped.
      tags: type !== 'transfer' && showTags && activeTags.length === 0,
      iouPerson: showIouSection && iouEnabled && !iouPerson.trim(),
      shareGroup: showShareSection && shareEnabled && !shareGroupId,
      repeatInterval: isRecurring && !intervalDays.trim()
    };
    if (nextErrors.amount || nextErrors.desc || nextErrors.cat) {
      setErrors(nextErrors);
      return;
    }
    if (nextErrors.tags || nextErrors.iouPerson || nextErrors.shareGroup || nextErrors.repeatInterval) {
      setErrors(nextErrors);
      if (nextErrors.tags) focusPanel(tagsPanelRef);
      else if (nextErrors.iouPerson) focusPanel(iouPanelRef);
      else if (nextErrors.shareGroup) focusPanel(sharePanelRef);
      else focusPanel(repeatPanelRef);
      return;
    }
    setErrors({});
    setSaving(true);
    const now = Date.now();
    const base: Expense = {
      id: editing?.id ?? crypto.randomUUID(),
      amount: amt,
      categoryId: type === 'transfer' ? 'cat-tr-bank' : categoryId,
      description: description.trim(),
      date: dateInputToEpoch(date, editing?.date),
      hashtags: type === 'transfer' ? [] : parseTags(tagInput),
      isRecurring,
      ...(isRecurring && { recurringIntervalDays: parseInt(intervalDays, 10) || 30 }),
      ...(paymentMode && { paymentMode }),
      type,
      ...(accountId && { accountId }),
      ...(type === 'transfer' && toAccountId ? { toAccountId } : {}),
      ...(receipt && { receiptDataUrl: receipt }),
      ...(showShareSection && shareEnabled && shareGroupId
        ? { shareWith: [shareGroupId] }
        : editing?.shareWith
          ? { shareWith: editing.shareWith }
          : {}),
      source: editing?.source ?? 'manual',
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    };
    // Only mirror to the group when the link is newly added (avoid duplicate shared events on edit).
    const shareGroupTarget =
      showShareSection && shareEnabled && shareGroupId && !editing?.shareWith?.includes(shareGroupId)
        ? shareGroupId
        : null;
    const shareParticipantIds = shareParticipants.size > 0 ? [...shareParticipants] : undefined;
    const iouIntent: ExpenseSeedIntent | null =
      showIouSection && iouEnabled && iouPerson.trim()
        ? { personName: iouPerson.trim(), kind: iouKind, amount: amt, date: base.date, description: base.description }
        : null;
    // The one tag currently being defined (if new) carries the inline Set Aside choice; every other
    // new tag in this save defaults to off, same as saveExpenseWithHashtags already assumes.
    const newTagSetAside =
      isNewTagInProgress && base.hashtags.includes(focusedTag) ? { [focusedTag]: pendingNewTagSetAside } : undefined;

    onSave(base, newTagSetAside)
      // Reconcile the IOU link on every expense/income save: creates, updates, or (when toggled off) removes it.
      .then(() => (onSeedIou && showIouSection ? onSeedIou(base.id, iouIntent) : undefined))
      // Mirror into the group as an equal-split shared expense when newly shared.
      .then(() =>
        onShareToGroup && shareGroupTarget ? onShareToGroup(base, shareGroupTarget, shareParticipantIds) : undefined
      )
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function goToAccounts() {
    onClose();
    navigate(PATHS.app.accounts);
  }

  const canTemplate = type !== 'transfer' && description.trim().length > 0 && categoryId.length > 0;

  async function handleReceiptPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReceipt(await fileToReceiptDataUrl(file));
    setShowReceipt(true);
  }

  function handleSaveTemplate() {
    if (!onSaveTemplate || !canTemplate) return;
    const amt = parseFloat(amount);
    onSaveTemplate({
      label: description.trim().slice(0, 24),
      type,
      description: description.trim(),
      categoryId,
      ...(!isNaN(amt) && amt > 0 ? { amount: amt } : {}),
      ...(accountId && { accountId }),
      ...(paymentMode && { paymentMode })
    });
    setTemplateSaved(true);
  }

  const typeMeta = TYPE_META[type];
  const accent = typeMeta.color;
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const titleText = editing ? `Edit ${typeLabel}` : `Add ${typeLabel}`;
  const saveText = saving
    ? 'Saving…'
    : editing
      ? `Update ${typeLabel.toLowerCase()}`
      : `Add ${typeLabel.toLowerCase()}`;

  const dateLabel = (() => {
    const d = new Date(date);
    return isNaN(d.getTime()) ? 'Pick date' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  })();

  const chipClass =
    'flex-1 min-w-0 flex items-center justify-between gap-2 rounded-xl border bg-surface-2 px-3 py-3 text-sm font-medium';

  return (
    <>
      <Modal
        onClose={onClose}
        scrollable
        footer={
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-3">
              {editing && (
                <Button variant="danger" onClick={() => editing && onDelete(editing.id).catch(() => {})}>
                  Delete
                </Button>
              )}
              <Button variant="primary" fullWidth loading={saving} onClick={handleSave}>
                {saveText}
              </Button>
            </div>
            {(editing || canTemplate) && (
              <div className="flex justify-center gap-5">
                {editing && onDuplicate && (
                  <Button variant="ghost" size="sm" icon="ti-copy" onClick={() => onDuplicate(editing)}>
                    Duplicate
                  </Button>
                )}
                {onSaveTemplate && canTemplate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={templateSaved ? 'ti-check' : 'ti-bookmark'}
                    onClick={handleSaveTemplate}
                    disabled={templateSaved}
                  >
                    {templateSaved ? 'Saved as template' : 'Save as template'}
                  </Button>
                )}
              </div>
            )}
          </div>
        }
      >
        {/* Header: type switch (adding) / title (editing), left — close, right */}
        <div className="flex items-center gap-2 -mt-1">
          {editing ? (
            <h3 className="text-base font-semibold text-primary flex-1">{titleText}</h3>
          ) : (
            <div className="w-64">
              <SegmentedControl
                options={[
                  { value: 'expense' as const, label: 'Expense', icon: 'ti-arrow-down-circle', color: '#ef4444' },
                  { value: 'income' as const, label: 'Income', icon: 'ti-arrow-up-circle', color: '#10b981' },
                  { value: 'transfer' as const, label: 'Transfer', icon: 'ti-arrows-exchange', color: '#3b82f6' }
                ]}
                value={type}
                onChange={handleTypeChange}
              />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-tertiary hover:bg-surface-2 -mr-1 ml-auto flex-shrink-0"
          >
            <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
        </div>

        {/* Hero amount */}
        <AmountInput
          hero
          accentColor={accent}
          value={amount}
          onChange={(v) => {
            setAmount(v);
            if (errors.amount) setErrors((e) => ({ ...e, amount: false }));
          }}
          error={errors.amount ? 'Enter an amount' : undefined}
          autoFocus={false}
        />

        {cashWarningBalance !== null && (
          <Banner variant="warning">
            This makes {selectedAccount?.name ?? 'Cash'} go to {formatCurrency(cashWarningBalance)} — did you miss a
            cash withdrawal or pick the wrong account? You can still save.
          </Banner>
        )}

        {/* Description (first focus) + merchant suggestions */}
        <div>
          <input
            type="text"
            autoFocus
            className="input-surface border w-full rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            style={errors.desc ? { borderColor: 'var(--color-danger)' } : undefined}
            placeholder={type === 'transfer' ? 'e.g. Moving to savings' : 'What was this for?'}
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
          />
          {showMemSuggestions && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              {memSuggestions.map((mem) => {
                const cat = categories.find((c) => c.id === mem.categoryId);
                const acct = accounts.find((a) => a.id === mem.accountId);
                return (
                  <button
                    key={mem.id}
                    type="button"
                    onClick={() => applyMemory(mem)}
                    className="w-full flex items-center gap-2 rounded-xl border border-theme bg-surface-2 px-3 py-2 text-left"
                  >
                    {cat && (
                      <i className={`ti ${cat.icon}`} style={{ fontSize: 15, color: cat.color }} aria-hidden="true" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-medium text-primary truncate">{mem.description}</span>
                      <span className="block text-[11px] text-tertiary truncate">
                        {[cat?.name, acct?.name, mem.paymentMode?.toUpperCase()].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--color-primary)' }}>
                      Use
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Category + Date chips */}
        <div className="flex gap-2.5">
          {type !== 'transfer' && (
            <button
              type="button"
              onClick={() => setShowCategoryPicker(true)}
              className={chipClass}
              style={{
                borderColor: errors.cat
                  ? 'var(--color-danger)'
                  : selectedCat
                    ? selectedCat.color
                    : 'var(--color-border)'
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <i
                  className={`ti ${selectedCat ? selectedCat.icon : 'ti-layout-grid-add'}`}
                  style={{ fontSize: 17, color: selectedCat ? selectedCat.color : 'var(--color-text-tertiary)' }}
                  aria-hidden="true"
                />
                <span
                  className="truncate"
                  style={{ color: selectedCat ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}
                >
                  {selectedCat?.name ?? 'Select category'}
                </span>
              </span>
              <i
                className="ti ti-chevron-down text-tertiary flex-shrink-0"
                style={{ fontSize: 15 }}
                aria-hidden="true"
              />
            </button>
          )}
          <div className="relative flex-1 min-w-0">
            <div className={chipClass} style={{ borderColor: 'var(--color-border)' }}>
              <span className="flex items-center gap-2 min-w-0">
                <i
                  className="ti ti-calendar"
                  style={{ fontSize: 16, color: 'var(--color-text-secondary)' }}
                  aria-hidden="true"
                />
                <span className="truncate text-primary">{dateLabel}</span>
              </span>
              <i
                className="ti ti-chevron-down text-tertiary flex-shrink-0"
                style={{ fontSize: 15 }}
                aria-hidden="true"
              />
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Date"
            />
          </div>
        </div>

        {/* Account */}
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

        {/* Paid via */}
        {type !== 'transfer' && (
          <div>
            <label className="text-xs font-medium text-secondary">Paid via</label>
            <div className="mt-1">
              <PaymentModeChips value={paymentMode} onChange={setPaymentMode} selectedAccount={selectedAccount} />
            </div>
          </div>
        )}

        {/* Secondary actions — circular icon bar */}
        <div className="flex gap-2 justify-center pt-1">
          {type !== 'transfer' && (
            <ExtraCircle
              icon="ti-hash"
              label="Tags"
              active={showTags || activeTags.length > 0}
              accent={accent}
              onClick={() => setShowTags((v) => !v)}
            />
          )}
          {type !== 'transfer' && (
            <ExtraCircle
              icon="ti-camera"
              label="Receipt"
              active={showReceipt || !!receipt}
              accent={accent}
              onClick={() => setShowReceipt((v) => !v)}
            />
          )}
          {showIouSection && (
            <ExtraCircle
              icon="ti-users"
              label={iouKind === 'lent' ? 'Lent' : 'Borrowed'}
              active={iouEnabled}
              accent={accent}
              onClick={() => setIouEnabled((v) => !v)}
            />
          )}
          <ExtraCircle
            icon="ti-repeat"
            label="Repeat"
            active={isRecurring}
            accent={accent}
            onClick={() => setIsRecurring((v) => !v)}
          />
        </div>

        {/* Tags panel */}
        {type !== 'transfer' && showTags && (
          <div ref={tagsPanelRef} className="rounded-xl border border-theme bg-surface-3 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-secondary">Tags</span>
              <button
                type="button"
                onClick={() => navigate(PATHS.app.manageTags)}
                className="text-xs font-semibold flex items-center gap-0.5"
                style={{ color: 'var(--color-primary-dark, #007a4e)' }}
              >
                Manage tags
                <i className="ti ti-chevron-right" style={{ fontSize: 12 }} aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div style={{ flex: isNewTagInProgress || matchingExistingTag ? '0 0 75%' : '1 1 100%' }}>
                <TextInput
                  type="text"
                  placeholder="Search or create a tag"
                  value={tagInput}
                  onChange={(v) => {
                    handleTagInputChange(v);
                    if (errors.tags) setErrors((er) => ({ ...er, tags: false }));
                  }}
                  error={errors.tags ? 'Add a tag — or turn Tags off' : undefined}
                />
              </div>
              {(isNewTagInProgress || matchingExistingTag) && (
                <label
                  className="flex items-center gap-1.5 flex-shrink-0"
                  style={{ flex: '0 0 23%', cursor: isNewTagInProgress ? 'pointer' : 'default' }}
                >
                  <input
                    type="checkbox"
                    checked={isNewTagInProgress ? pendingNewTagSetAside : !!matchingExistingTag?.setAside}
                    disabled={!isNewTagInProgress}
                    onChange={(e) => isNewTagInProgress && setPendingNewTagSetAside(e.target.checked)}
                    className="w-4 h-4 flex-shrink-0"
                    style={{ accentColor: '#ec4899' }}
                    aria-label="Set aside — won't count toward daily living"
                  />
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: isNewTagInProgress ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}
                  >
                    Set aside
                  </span>
                </label>
              )}
            </div>

            {frequentTags.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-1">Frequent</p>
                <div className="flex flex-wrap gap-1">
                  {frequentTags.map((h) => (
                    <Button key={h.id} variant="secondary" size="sm" onClick={() => applyTagSuggestion(h.name)}>
                      #{h.name}
                      {h.setAside && (
                        <i
                          className="ti ti-point-filled"
                          style={{ fontSize: 8, color: '#ec4899' }}
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tagSuggestions.map((s) => (
                  <Button key={s.id} variant="secondary" size="sm" onClick={() => applyTagSuggestion(s.name)}>
                    #{s.name}
                  </Button>
                ))}
              </div>
            )}
            {type === 'expense' && activeEvents.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
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
            )}
          </div>
        )}

        {/* Receipt panel */}
        {type !== 'transfer' && showReceipt && (
          <div className="rounded-xl border border-theme bg-surface-3 p-3">
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleReceiptPick(e)}
            />
            {receipt ? (
              <div className="flex items-center gap-3">
                <img src={receipt} alt="Receipt" className="w-14 h-14 rounded-lg object-cover border border-theme" />
                <Button variant="ghost" size="sm" icon="ti-eye" onClick={() => window.open(receipt, '_blank')}>
                  View
                </Button>
                <Button variant="ghost" size="sm" icon="ti-trash" onClick={() => setReceipt(undefined)}>
                  Remove
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" icon="ti-camera" onClick={() => receiptInputRef.current?.click()}>
                Attach receipt
              </Button>
            )}
          </div>
        )}

        {/* Lent / Borrowed panel */}
        {showIouSection && iouEnabled && (
          <div
            ref={iouPanelRef}
            className="rounded-xl border p-3 flex flex-col gap-2"
            style={{
              borderColor: errors.iouPerson ? 'var(--color-danger)' : 'var(--color-border)',
              backgroundColor: 'var(--color-surface-3)'
            }}
          >
            <input
              className="input-surface w-full rounded-xl px-3 py-2.5 text-sm"
              style={errors.iouPerson ? { borderColor: 'var(--color-danger)' } : undefined}
              value={iouPerson}
              onChange={(e) => {
                setIouPerson(e.target.value);
                if (errors.iouPerson) setErrors((er) => ({ ...er, iouPerson: false }));
              }}
              placeholder="Person's name"
              list="iou-person-suggestions"
            />
            <datalist id="iou-person-suggestions">
              {(iouPersons ?? [])
                .filter((p) => !p.isArchived)
                .map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
            </datalist>
            {errors.iouPerson ? (
              <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
                Enter who this is with — you turned this on
              </p>
            ) : (
              <p className="text-xs text-tertiary">
                {iouKind === 'lent'
                  ? "Adds a they-owe-you entry to this person's ledger."
                  : "Adds a you-owe-them entry to this person's ledger."}
              </p>
            )}
          </div>
        )}

        {/* Share with a group (Track E, screen 8) — toggle → group + split-between + live "you're owed". */}
        {showShareSection && (
          <div
            ref={sharePanelRef}
            className="rounded-xl border p-3 flex flex-col gap-3"
            style={{ borderColor: errors.shareGroup ? 'var(--color-danger)' : 'var(--color-border)' }}
          >
            <label className="flex items-center gap-2 cursor-pointer">
              <i
                className="ti ti-users-group"
                style={{ color: 'var(--color-primary)', fontSize: 18 }}
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-secondary flex-1">Share with a group</span>
              <input
                type="checkbox"
                checked={shareEnabled}
                disabled={alreadyShared}
                onChange={(e) => {
                  const on = e.target.checked;
                  setShareEnabled(on);
                  if (on && !shareGroupId && shareGroups[0]) setShareGroupId(shareGroups[0].id);
                }}
                className="w-4 h-4 accent-[var(--color-primary)]"
              />
            </label>

            {shareEnabled && (
              <>
                <SelectInput
                  value={shareGroupId}
                  onChange={(v) => {
                    setShareGroupId(v);
                    if (errors.shareGroup) setErrors((er) => ({ ...er, shareGroup: false }));
                  }}
                  disabled={alreadyShared}
                  options={shareGroups.map((g) => ({ value: g.id, label: g.name }))}
                  {...(errors.shareGroup ? { error: 'Pick a group — you turned this on' } : {})}
                />

                {alreadyShared ? (
                  <p className="text-xs text-tertiary">Already shared to a group.</p>
                ) : shareMembers.length > 0 ? (
                  (() => {
                    const amt = Number(amount) || 0;
                    const n = shareParticipants.size || shareMembers.length;
                    const perHead = n > 0 ? amt / n : 0;
                    const youIn = myUserId ? shareParticipants.has(myUserId) : true;
                    const youOwed = amt - (youIn ? perHead : 0);
                    return (
                      <>
                        <div className="flex gap-1 overflow-x-auto scrollbar-none">
                          {shareMembers.map((m) => {
                            const on = shareParticipants.has(m.userId);
                            return (
                              <button
                                key={m.userId}
                                type="button"
                                onClick={() =>
                                  setShareParticipants((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(m.userId)) next.delete(m.userId);
                                    else next.add(m.userId);
                                    return next;
                                  })
                                }
                                className="flex flex-col items-center gap-1 w-[48px] flex-shrink-0"
                                style={{ opacity: on ? 1 : 0.4 }}
                              >
                                <span
                                  className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-semibold text-white ${on ? 'ring-2 ring-[var(--color-primary)] ring-offset-1' : ''}`}
                                  style={{ backgroundColor: 'var(--color-mode-accent, #6366f1)' }}
                                >
                                  {(m.userId === myUserId ? 'You' : m.displayName).charAt(0).toUpperCase()}
                                </span>
                                <span className="text-[9px] text-secondary truncate max-w-full">
                                  {m.userId === myUserId ? 'You' : m.displayName}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-secondary">{formatCurrency(perHead)} each · split equally</span>
                          {youOwed > 0.99 && (
                            <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                              you're owed {formatCurrency(youOwed)}
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <p className="text-xs text-tertiary">
                    Records the full amount on your account and adds an equal split to the group.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Recurring panel */}
        {isRecurring && (
          <div
            ref={repeatPanelRef}
            className="rounded-xl border p-3"
            style={{
              borderColor: errors.repeatInterval ? 'var(--color-danger)' : 'var(--color-border)',
              backgroundColor: 'var(--color-surface-3)'
            }}
          >
            <TextInput
              label="Repeat every (days)"
              type="number"
              inputMode="numeric"
              value={intervalDays}
              onChange={(v) => {
                setIntervalDays(v);
                if (errors.repeatInterval) setErrors((er) => ({ ...er, repeatInterval: false }));
              }}
              error={errors.repeatInterval ? 'Enter how often — you turned this on' : undefined}
            />
          </div>
        )}

        {/* History (editing) */}
        {editing && (
          <div className="border-t border-theme pt-3">
            <ItemHistory entityId={editing.id} />
          </div>
        )}
      </Modal>

      {/* Category picker — nested modal (z-70, above form) */}
      {showCategoryPicker && type !== 'transfer' && (
        <CategoryPickerModal
          type={type}
          categories={categories}
          selectedId={categoryId}
          manager={categoryManager}
          activeVacationEvent={activeVacationEvent ? { name: activeVacationEvent.name } : undefined}
          onSelect={(id) => {
            setCategoryId(id);
            setErrors((e) => ({ ...e, cat: false }));
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}
    </>
  );
}
