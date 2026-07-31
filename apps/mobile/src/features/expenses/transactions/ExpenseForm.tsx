import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { View, Pressable, TextInput as RNTextInput, Image, ScrollView, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import type { ActiveEvent } from '~/context/EventModeContext';
import { accountsRepo, groupMembersRepo, profileRepo } from '@/core/db/repositories';
import { epochToDateInput, formatCurrency } from '@/lib/formatters';
import { dateInputToEpoch } from '@/lib/date';
import { projectedBalance } from '@/core/accounts/balanceCalculator';
import {
  Modal,
  Button,
  TextInput,
  DateInput,
  SegmentedControl,
  AmountInput,
  Banner,
  SelectInput,
  Toggle
} from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { captureReceiptPhoto, pickReceiptPhoto } from '~/lib/receiptImage';
import { ItemHistory } from '../../activity/components/ItemHistory';
import { CategoryPickerModal } from '../categories/CategoryPickerModal';
import type { CategoryManager } from '../categories/types';
import { AccountChips } from './AccountChips';
import { PaymentModeChips } from './PaymentModeChips';
import { couplePaymentToAccount } from './paymentModes';
import { tint } from '~/lib/color';

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
  onPress
}: {
  icon: string;
  label: string;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  const theme = useThemeColors();
  return (
    <Pressable onPress={onPress} className="items-center gap-1.5" style={{ width: 64 }}>
      <View
        className="w-11 h-11 rounded-full items-center justify-center border"
        style={{
          borderColor: active ? accent : theme.border,
          backgroundColor: active ? tint(accent, 12) : theme.surfaceSecondary
        }}
      >
        <Icon name={icon} size={18} color={active ? accent : theme.textTertiary} />
      </View>
      <Text
        className="text-[10px] font-medium leading-none"
        style={{ color: active ? theme.textPrimary : theme.textTertiary }}
      >
        {label}
      </Text>
    </Pressable>
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
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
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
  // inline in the Tags panel. Resets whenever the in-progress tag changes (see handleTagInputChange).
  const [pendingNewTagSetAside, setPendingNewTagSetAside] = useState(false);
  const [isRecurring, setIsRecurring] = useState(editing?.isRecurring ?? false);
  const [intervalDays, setIntervalDays] = useState(String(editing?.recurringIntervalDays ?? 30));
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [receipt, setReceipt] = useState<string | undefined>(editing?.receiptDataUrl);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(false);
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

  // Secondary-field disclosure (circular icons). Open if the field already has content on load.
  const initialTags = parseTags(tagInput);
  const [showTags, setShowTags] = useState(initialTags.length > 0);
  const [showReceipt, setShowReceipt] = useState(!!editing?.receiptDataUrl);

  // Optional IOU link (new expense/income only): an expense can be "lent to" someone (they owe you),
  // an income can be "borrowed from" someone (you owe them). The transaction itself is the money
  // movement; this seeds the matching IOU ledger entry. Direction follows the transaction type.
  const [iouEnabled, setIouEnabled] = useState(!!linkedIou);
  const [iouPerson, setIouPerson] = useState(linkedIou?.personName ?? '');
  const iouKind: 'lent' | 'borrowed' = type === 'income' ? 'borrowed' : 'lent';
  // Shown for new AND editing expense/income — editing prefills from the existing link so it can be changed or removed.
  const showIouSection = !!onSeedIou && (type === 'expense' || type === 'income');

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

  const initEditing = useRef(editing);

  // Scroll-to-focus refs for validation errors on conditionally-required panels — see `focusPanel()`.
  const scrollRef = useRef<ScrollView>(null);
  const tagsPanelRef = useRef<View>(null);
  const iouPanelRef = useRef<View>(null);
  const sharePanelRef = useRef<View>(null);
  const repeatPanelRef = useRef<View>(null);

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

  function handleTagInputChange(v: string) {
    setTagInput(v);
    const parts = v.split(/[\s,]+/);
    const next = (parts[parts.length - 1] ?? '').replace(/^#/, '').toLowerCase();
    if (next !== focusedTag) setPendingNewTagSetAside(false);
    setFocusedTag(next);
    if (errors.tags) setErrors((e) => ({ ...e, tags: false }));
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

  /** Scrolls a conditionally-required panel into view on validation error, matching web's own
   *  `focusPanel()` (`el.scrollIntoView({block: 'center'})`). RN has no `scrollIntoView` — this measures
   *  the panel relative to the Modal's forwarded `scrollRef` and scrolls to it directly. */
  function focusPanel(panelRef: RefObject<View | null>) {
    panelRef.current?.measureLayout(
      scrollRef.current as unknown as View,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }),
      () => {}
    );
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
    // Two-stage gate, matching web: block on the always-visible fields first (no panel to scroll to —
    // they're already on screen), then check the conditionally-required panels and scroll to whichever
    // one actually failed.
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
    navigation.navigate('Home', { screen: 'Accounts' });
  }

  const canTemplate = type !== 'transfer' && description.trim().length > 0 && categoryId.length > 0;

  async function handleAttachReceipt(source: 'camera' | 'library') {
    setReceiptBusy(true);
    try {
      const dataUrl = source === 'camera' ? await captureReceiptPhoto() : await pickReceiptPhoto();
      if (dataUrl) {
        setReceipt(dataUrl);
        setShowReceipt(true);
      }
    } finally {
      setReceiptBusy(false);
    }
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

  return (
    <>
      <Modal
        onClose={onClose}
        scrollable
        scrollRef={scrollRef}
        footer={
          <View className="gap-2.5">
            <View className="flex-row gap-3">
              {editing && (
                <Button variant="danger" onPress={() => editing && onDelete(editing.id).catch(() => {})}>
                  Delete
                </Button>
              )}
              <View className="flex-1">
                <Button variant="primary" fullWidth loading={saving} onPress={handleSave}>
                  {saveText}
                </Button>
              </View>
            </View>
            {(editing || canTemplate) && (
              <View className="flex-row justify-center gap-5">
                {editing && onDuplicate && (
                  <Button variant="ghost" size="sm" icon="ti-copy" onPress={() => onDuplicate(editing)}>
                    Duplicate
                  </Button>
                )}
                {onSaveTemplate && canTemplate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={templateSaved ? 'ti-check' : 'ti-bookmark'}
                    onPress={handleSaveTemplate}
                    disabled={templateSaved}
                  >
                    {templateSaved ? 'Saved as template' : 'Save as template'}
                  </Button>
                )}
              </View>
            )}
          </View>
        }
      >
        {/* Header: type switch (adding) / title (editing), left — close, right */}
        <View className="flex-row items-center gap-2">
          {editing ? (
            <Text className="text-base font-semibold text-primary flex-1">{titleText}</Text>
          ) : (
            <View className="flex-1">
              <SegmentedControl
                options={[
                  { value: 'expense' as const, label: 'Expense', icon: 'ti-arrow-down-circle', color: '#ef4444' },
                  { value: 'income' as const, label: 'Income', icon: 'ti-arrow-up-circle', color: '#10b981' },
                  { value: 'transfer' as const, label: 'Transfer', icon: 'ti-arrows-exchange', color: '#3b82f6' }
                ]}
                value={type}
                onChange={handleTypeChange}
              />
            </View>
          )}
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            className="w-8 h-8 items-center justify-center rounded-lg"
          >
            <Icon name="ti-x" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>

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
        />

        {cashWarningBalance !== null && (
          <Banner variant="warning">
            This makes {selectedAccount?.name ?? 'Cash'} go to {formatCurrency(cashWarningBalance)} — did you miss a
            cash withdrawal or pick the wrong account? You can still save.
          </Banner>
        )}

        {/* Description (first focus) + merchant suggestions */}
        <View>
          <RNTextInput
            autoFocus
            value={description}
            onChangeText={handleDescriptionChange}
            placeholder={type === 'transfer' ? 'e.g. Moving to savings' : 'What was this for?'}
            placeholderTextColor={theme.textTertiary}
            className="bg-surface-2 text-primary border w-full rounded-xl px-3 py-3 text-sm"
            style={{ borderColor: errors.desc ? theme.danger : theme.border }}
          />
          {showMemSuggestions && (
            <View className="mt-1.5 gap-1.5">
              {memSuggestions.map((mem) => {
                const cat = categories.find((c) => c.id === mem.categoryId);
                const acct = accounts.find((a) => a.id === mem.accountId);
                return (
                  <Pressable
                    key={mem.id}
                    onPress={() => applyMemory(mem)}
                    className="flex-row items-center gap-2 rounded-xl border border-theme bg-surface-2 px-3 py-2"
                  >
                    {cat && <Icon name={cat.icon} size={15} color={cat.color} />}
                    <View className="flex-1">
                      <Text className="text-xs font-medium text-primary" numberOfLines={1}>
                        {mem.description}
                      </Text>
                      <Text className="text-[11px] text-tertiary" numberOfLines={1}>
                        {[cat?.name, acct?.name, mem.paymentMode?.toUpperCase()].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text className="text-[11px] font-semibold" style={{ color: theme.primary }}>
                      Use
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Category + Date chips — a paired row on web (docs/features/expenses.md), not two stacked
            full-width rows; matches the flex-1-sibling pattern every other paired-field row in this
            file already uses. */}
        <View className="flex-row gap-2.5">
          {type !== 'transfer' && (
            <Pressable
              onPress={() => setShowCategoryPicker(true)}
              className="flex-1 flex-row items-center justify-between gap-2 rounded-xl border bg-surface-2 px-3 py-3"
              style={{ borderColor: errors.cat ? theme.danger : selectedCat ? selectedCat.color : theme.border }}
            >
              <View className="flex-row items-center gap-2 flex-1">
                <Icon
                  name={selectedCat ? selectedCat.icon : 'ti-layout-grid-add'}
                  size={17}
                  color={selectedCat ? selectedCat.color : theme.textTertiary}
                />
                <Text
                  className="text-sm font-medium flex-1"
                  numberOfLines={1}
                  style={{ color: selectedCat ? theme.textPrimary : theme.textTertiary }}
                >
                  {selectedCat?.name ?? 'Select category'}
                </Text>
              </View>
              <Icon name="ti-chevron-down" size={15} color={theme.textTertiary} />
            </Pressable>
          )}

          <View className="flex-1">
            <DateInput value={date} onChange={setDate} />
          </View>
        </View>

        {/* Account */}
        {type === 'transfer' ? (
          accounts.length === 0 ? (
            <Button variant="ghost" size="sm" icon="ti-plus" onPress={goToAccounts}>
              Add accounts to track where money moves
            </Button>
          ) : (
            <View className="gap-3">
              <View>
                <Text className="text-xs font-medium text-secondary mb-1">From account</Text>
                <AccountChips
                  accounts={accounts}
                  value={accountId}
                  onChange={setAccountId}
                  disabledId={toAccountId}
                  onAddAccount={goToAccounts}
                />
              </View>
              <View>
                <Text className="text-xs font-medium text-secondary mb-1">To account</Text>
                <AccountChips
                  accounts={accounts}
                  value={toAccountId}
                  onChange={setToAccountId}
                  disabledId={accountId}
                  onAddAccount={goToAccounts}
                />
              </View>
            </View>
          )
        ) : (
          <View>
            <Text className="text-xs font-medium text-secondary mb-1">Account</Text>
            <AccountChips
              accounts={accounts}
              value={accountId}
              onChange={handleAccountSelect}
              onAddAccount={goToAccounts}
            />
          </View>
        )}

        {/* Paid via */}
        {type !== 'transfer' && (
          <View>
            <Text className="text-xs font-medium text-secondary mb-1">Paid via</Text>
            <PaymentModeChips value={paymentMode} onChange={setPaymentMode} selectedAccount={selectedAccount} />
          </View>
        )}

        {/* Secondary actions — circular icon bar */}
        <View className="flex-row justify-center gap-2 pt-1">
          {type !== 'transfer' && (
            <ExtraCircle
              icon="ti-hash"
              label="Tags"
              active={showTags || activeTags.length > 0}
              accent={accent}
              onPress={() => setShowTags((v) => !v)}
            />
          )}
          {type !== 'transfer' && (
            <ExtraCircle
              icon="ti-camera"
              label="Receipt"
              active={showReceipt || !!receipt}
              accent={accent}
              onPress={() => setShowReceipt((v) => !v)}
            />
          )}
          {showIouSection && (
            <ExtraCircle
              icon="ti-users"
              label={iouKind === 'lent' ? 'Lent' : 'Borrowed'}
              active={iouEnabled}
              accent={accent}
              onPress={() => setIouEnabled((v) => !v)}
            />
          )}
          <ExtraCircle
            icon="ti-repeat"
            label="Repeat"
            active={isRecurring}
            accent={accent}
            onPress={() => setIsRecurring((v) => !v)}
          />
        </View>

        {/* Tags panel */}
        {type !== 'transfer' && showTags && (
          <View ref={tagsPanelRef} className="rounded-xl border border-theme bg-surface-3 p-3 gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-medium text-secondary">Tags</Text>
              <Pressable
                onPress={() => {
                  onClose();
                  navigation.navigate('Home', { screen: 'ManageTags' });
                }}
                className="flex-row items-center gap-0.5"
                hitSlop={4}
              >
                <Text className="text-xs font-semibold" style={{ color: theme.primaryDark }}>
                  Manage tags
                </Text>
                <Icon name="ti-chevron-right" size={12} color={theme.primaryDark} />
              </Pressable>
            </View>

            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <TextInput
                  placeholder="Search or create a tag"
                  value={tagInput}
                  onChange={handleTagInputChange}
                  error={errors.tags ? 'Add a tag — or turn Tags off' : undefined}
                />
              </View>
              {(isNewTagInProgress || matchingExistingTag) && (
                <Pressable
                  disabled={!isNewTagInProgress}
                  onPress={() => isNewTagInProgress && setPendingNewTagSetAside((v) => !v)}
                  className="flex-row items-center gap-1.5"
                  accessibilityLabel="Set aside — won't count toward daily living"
                >
                  <Icon
                    name={
                      isNewTagInProgress
                        ? pendingNewTagSetAside
                          ? 'ti-square-check-filled'
                          : 'ti-square'
                        : matchingExistingTag?.setAside
                          ? 'ti-square-check-filled'
                          : 'ti-square'
                    }
                    size={16}
                    color={isNewTagInProgress ? '#ec4899' : theme.textTertiary}
                  />
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: isNewTagInProgress ? theme.textPrimary : theme.textTertiary }}
                  >
                    Set aside
                  </Text>
                </Pressable>
              )}
            </View>

            {frequentTags.length > 0 && (
              <View>
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-1">Frequent</Text>
                <View className="flex-row flex-wrap gap-1">
                  {frequentTags.map((h) => (
                    <Button key={h.id} variant="secondary" size="sm" onPress={() => applyTagSuggestion(h.name)}>
                      #{h.name}
                      {h.setAside ? <Text style={{ color: '#ec4899' }}> •</Text> : ''}
                    </Button>
                  ))}
                </View>
              </View>
            )}
            {tagSuggestions.length > 0 && (
              <View className="flex-row flex-wrap gap-1">
                {tagSuggestions.map((s) => (
                  <Button key={s.id} variant="secondary" size="sm" onPress={() => applyTagSuggestion(s.name)}>
                    #{s.name}
                  </Button>
                ))}
              </View>
            )}
            {type === 'expense' && activeEvents.length > 0 && (
              <View className="flex-row flex-wrap gap-1.5">
                {activeEvents.map((ev) => {
                  const isTagged = activeTags.includes(ev.hashtag.toLowerCase());
                  return (
                    <Pressable
                      key={ev.id}
                      onPress={() => toggleEventTag(ev)}
                      className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border-2"
                      style={
                        isTagged
                          ? { borderColor: ev.color, backgroundColor: tint(ev.color, 9) }
                          : { borderColor: theme.border }
                      }
                    >
                      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
                      <Text
                        className="text-xs font-medium"
                        style={{ color: isTagged ? ev.color : theme.textSecondary }}
                      >
                        {ev.name}
                      </Text>
                      {ev.autoTag && !isTagged && <Text className="text-[9px] opacity-60">auto</Text>}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Receipt panel — camera or library, replacing web's hidden file-input trigger (no RN equivalent). */}
        {type !== 'transfer' && showReceipt && (
          <View className="rounded-xl border border-theme bg-surface-3 p-3">
            {receipt ? (
              <View className="flex-row items-center gap-3">
                <Pressable onPress={() => setViewingReceipt(true)}>
                  <Image
                    source={{ uri: receipt }}
                    className="w-14 h-14 rounded-lg border border-theme"
                    resizeMode="cover"
                  />
                </Pressable>
                <Button variant="ghost" size="sm" icon="ti-eye" onPress={() => setViewingReceipt(true)}>
                  View
                </Button>
                <Button variant="ghost" size="sm" icon="ti-trash" onPress={() => setReceipt(undefined)}>
                  Remove
                </Button>
              </View>
            ) : (
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="ti-camera"
                  loading={receiptBusy}
                  onPress={() => void handleAttachReceipt('camera')}
                >
                  Camera
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="ti-photo"
                  loading={receiptBusy}
                  onPress={() => void handleAttachReceipt('library')}
                >
                  Photo library
                </Button>
              </View>
            )}
          </View>
        )}

        {/* Lent / Borrowed panel */}
        {showIouSection && iouEnabled && (
          <View
            ref={iouPanelRef}
            className="rounded-xl border p-3 gap-2"
            style={{
              borderColor: errors.iouPerson ? theme.danger : theme.border,
              backgroundColor: theme.surfaceTertiary
            }}
          >
            <TextInput
              value={iouPerson}
              onChange={(v) => {
                setIouPerson(v);
                if (errors.iouPerson) setErrors((e) => ({ ...e, iouPerson: false }));
              }}
              placeholder="Person's name"
              error={errors.iouPerson ? 'Enter who this is with — you turned this on' : undefined}
            />
            {!errors.iouPerson && (
              <Text className="text-xs text-tertiary">
                {iouKind === 'lent'
                  ? "Adds a they-owe-you entry to this person's ledger."
                  : "Adds a you-owe-them entry to this person's ledger."}
              </Text>
            )}
            {/* RN has no `<datalist>` — web's native browser autocomplete only surfaces options that
             *  match what's typed, invisible until then; this filters the same way (case-insensitive,
             *  hidden while empty) instead of always showing every known person. */}
            {iouPerson.trim().length > 0 &&
              (() => {
                const q = iouPerson.trim().toLowerCase();
                const matches = (iouPersons ?? [])
                  .filter((p) => !p.isArchived && p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q)
                  .slice(0, 6);
                return (
                  matches.length > 0 && (
                    <View className="flex-row flex-wrap gap-1">
                      {matches.map((p) => (
                        <Button key={p.id} variant="secondary" size="sm" onPress={() => setIouPerson(p.name)}>
                          {p.name}
                        </Button>
                      ))}
                    </View>
                  )
                );
              })()}
          </View>
        )}

        {/* Share with a group (Track E, screen 8) — toggle → group + split-between + live "you're owed". */}
        {showShareSection && (
          <View
            ref={sharePanelRef}
            className="rounded-xl border p-3 gap-3"
            style={{ borderColor: errors.shareGroup ? theme.danger : theme.border }}
          >
            <View className="flex-row items-center gap-2">
              <Icon name="ti-users-group" size={18} color={theme.primary} />
              <Text className="text-sm font-medium text-secondary flex-1">Share with a group</Text>
              <Toggle
                value={shareEnabled}
                disabled={alreadyShared}
                onChange={(on) => {
                  setShareEnabled(on);
                  if (on && !shareGroupId && shareGroups[0]) setShareGroupId(shareGroups[0].id);
                }}
              />
            </View>

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
                  error={errors.shareGroup ? 'Pick a group — you turned this on' : undefined}
                />

                {alreadyShared ? (
                  <Text className="text-xs text-tertiary">Already shared to a group.</Text>
                ) : shareMembers.length > 0 ? (
                  (() => {
                    const amt = Number(amount) || 0;
                    const n = shareParticipants.size || shareMembers.length;
                    const perHead = n > 0 ? amt / n : 0;
                    const youIn = myUserId ? shareParticipants.has(myUserId) : true;
                    const youOwed = amt - (youIn ? perHead : 0);
                    return (
                      <>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 4 }}
                        >
                          {shareMembers.map((m) => {
                            const on = shareParticipants.has(m.userId);
                            return (
                              <Pressable
                                key={m.userId}
                                onPress={() =>
                                  setShareParticipants((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(m.userId)) next.delete(m.userId);
                                    else next.add(m.userId);
                                    return next;
                                  })
                                }
                                className="items-center gap-1"
                                style={{ width: 48, opacity: on ? 1 : 0.4 }}
                              >
                                <View
                                  className="w-8 h-8 rounded-full items-center justify-center"
                                  style={{
                                    backgroundColor: '#6366f1',
                                    borderWidth: on ? 2 : 0,
                                    borderColor: theme.primary
                                  }}
                                >
                                  <Text className="text-[11px] font-semibold text-white">
                                    {(m.userId === myUserId ? 'You' : m.displayName).charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                                <Text className="text-[9px] text-secondary" numberOfLines={1}>
                                  {m.userId === myUserId ? 'You' : m.displayName}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs text-secondary">{formatCurrency(perHead)} each · split equally</Text>
                          {youOwed > 0.99 && (
                            <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                              you&apos;re owed {formatCurrency(youOwed)}
                            </Text>
                          )}
                        </View>
                      </>
                    );
                  })()
                ) : (
                  <Text className="text-xs text-tertiary">
                    Records the full amount on your account and adds an equal split to the group.
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Recurring panel */}
        {isRecurring && (
          <View
            ref={repeatPanelRef}
            className="rounded-xl border p-3"
            style={{
              borderColor: errors.repeatInterval ? theme.danger : theme.border,
              backgroundColor: theme.surfaceTertiary
            }}
          >
            <TextInput
              label="Repeat every (days)"
              keyboardType="numeric"
              value={intervalDays}
              onChange={(v) => {
                setIntervalDays(v);
                if (errors.repeatInterval) setErrors((e) => ({ ...e, repeatInterval: false }));
              }}
              error={errors.repeatInterval ? 'Enter how often — you turned this on' : undefined}
            />
          </View>
        )}

        {/* History (editing) */}
        {editing && (
          <View className="border-t border-theme pt-3">
            <ItemHistory entityId={editing.id} />
          </View>
        )}
      </Modal>

      {/* Category picker — nested modal, above the form (RN Modals stack in mount order). */}
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

      {/* Full-size receipt view — web uses `window.open` (no RN equivalent); tap the thumbnail or "View"
          to see it full-size here, tap anywhere (Modal's backdrop) to dismiss. */}
      {viewingReceipt && receipt && (
        <Modal onClose={() => setViewingReceipt(false)} size="sm">
          <Pressable onPress={() => setViewingReceipt(false)}>
            <Image source={{ uri: receipt }} style={{ width: '100%', height: 420 }} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}
    </>
  );
}
