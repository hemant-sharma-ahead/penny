import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { View, Pressable, TextInput as RNTextInput, Image, ScrollView, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type {
  Account,
  Expense,
  ExpenseCategory,
  Goal,
  GroupMember,
  GroupType,
  Hashtag,
  MerchantMemory,
  PaymentMode,
  Person,
  TransactionType
} from '@/core/db/types';
import type { ExpenseSeedIntent } from '@/core/iou/expenseLink';
import type { ExpenseGoalIntent } from '@/core/goals/goalLink';
import type { ActiveEvent } from '~/context/EventModeContext';
import { accountsRepo, groupMembersRepo, profileRepo } from '@/core/db/repositories';
import { IOU_MANDATORY_CATEGORY_IDS } from '@/core/db/defaultCategories';
import { getRiskColor } from '@/core/goals/meta';
import { epochToDateInput, formatCurrency } from '@/lib/formatters';
import { epochToTimeInput, combineDateTime, formatDate } from '@/lib/date';
import { projectedBalance } from '@/core/accounts/balanceCalculator';
import {
  Modal,
  Button,
  TextInput,
  DateInput,
  TimeInput,
  SegmentedControl,
  AmountInput,
  Banner,
  SelectInput,
  Toggle
} from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { captureReceiptPhoto, pickReceiptPhoto } from '~/lib/receiptImage';
import { ItemHistory } from '~/features/activity/components/ItemHistory';
import { CategoryPickerModal } from '~/features/expenses/categories/CategoryPickerModal';
import type { CategoryManager } from '~/features/expenses/categories/types';
import { AccountFormModal } from './AccountFormModal';
import { ExtraCircle } from './ExtraCircle';
import { useAccountForm, type AccountInput } from '~/hooks/useAccountForm';
import { AccountChips } from './AccountChips';
import { PaymentModeChips } from './PaymentModeChips';
import { couplePaymentToAccount } from './paymentModes';
import { inferPaymentMode } from '@/core/bank-import/paymentModeInference';
import { usePaymentModes } from '~/hooks/usePaymentModes';
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
  /** Existing goals (for the "Contribute to a goal" pill picker) — expense, income, and transfer alike,
   *  unlike the IOU section above (expense/income only). */
  goals?: Goal[];
  /** Seeds a goal contribution from a new expense/income/transfer. */
  onSeedGoal?: (expenseId: string, intent: ExpenseGoalIntent | null) => Promise<void>;
  /** When editing: the existing expense-seeded goal link for this transaction. */
  linkedGoal?: { goalId: string; goalName: string } | null | undefined;
  /** When editing: this transaction was resolved from a bank-statement import — shows a small audit-
   *  trail caption ("Matched from bank statement: `<raw narration>`, `<date>`"), mirroring the
   *  `goalPreset` caption below (docs/plans/bank-statement-import.md §10a's purpose #1). Read-only —
   *  purely informational, nothing here is editable or re-triggers the import flow. An ARRAY (not a
   *  single line) since 2026-08-09 — a cross-account transfer absorbed via `linkAsCrossAccountTransfer`
   *  legitimately carries one linked statement line per side, not just one; a plain expense/income still
   *  only ever has exactly one entry here, same as before. */
  linkedBankStatementLines?: { rawNarration: string; date: number }[] | undefined;
  /** Adds/edits an account from this form's own "+" tile (`AccountChips.tsx`) without leaving it. */
  saveAccount: (data: AccountInput, editing: Account | null) => Promise<Account>;
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
  /** Omitted when `goalPreset` is set — the category tile is locked/non-interactive there, so the
   *  category-management picker never opens and never needs it. */
  categoryManager?: CategoryManager;
  /** Feeds `CategoryPickerModal`'s "Frequent" quick-pick row when `categoryManager` is omitted (e.g.
   *  bank-import's statement-preset flow, which deliberately never builds a full manager) — without
   *  this, "Frequent" silently read off an always-empty count map and never rendered there (found
   *  2026-08-05; see `CategoryPickerModal.tsx`'s own `txnCountByCategory` prop doc). Ignored when
   *  `categoryManager` is provided — that already carries its own counts. */
  txnCountByCategory?: Map<string, number>;
  /** Opens this form scoped to one fixed goal (Goals screen's "Add contribution"/edit-linked-txn flow):
   *  hides the Goal/Lent-Borrowed sections entirely (goal is already fixed, not a separate choice this
   *  form makes), shows a small "Contributing to {name}" caption instead, restricts the type switch to
   *  Expense/Transfer (Income was never a valid shape for a goal contribution), and defaults the category
   *  to Savings/Transfer-bank + the description to "Contribution: {name}" — both still editable. Saving
   *  still goes through the normal `onSave`; the caller (`GoalsTab.tsx`) is responsible for also
   *  reconciling the linked `GoalContribution` since that's a different relationship than the Goal-tile
   *  picker's own `onSeedGoal` (which this prop deliberately doesn't touch). */
  goalPreset?: { goalId: string; goalName: string };
  /** Opens this form scoped to one bank-statement line (`features/bank-import/`'s review flow,
   *  docs/plans/bank-statement-import.md §8): locks Amount, Date, and (From-)Account — reusing the
   *  exact same visual components as the normal form (hero amount, DateInput, AccountChips), just
   *  non-interactive (`disabled`/`pointerEvents:'none'`), rather than a separate compact "locked
   *  fields" list — the form should look like the real Add-transaction popup, not a different screen
   *  (2026-08-03 redesign, per explicit user feedback). Time has no equivalent in a statement line at
   *  all, so it's hidden rather than shown-and-disabled. Payment mode is shown via the normal, still-
   *  editable `PaymentModeChips`, just pre-selected and captioned "guessed from statement". Category
   *  and Description are genuinely open, with Description pre-filled from merchant memory when
   *  available and always auto-focused (same convention as every other new-entry mode).
   *
   *  **Type and To-account are deliberately editable too (2026-08-05)** — a statement line's direction
   *  (debit/credit) is a fact from the file, but whether it's a plain expense/income or actually a
   *  transfer (a cash withdrawal, a move between the user's own accounts) is a judgment call the
   *  matcher/caller can suggest but not force. The header's type toggle offers exactly two options —
   *  `type` (the file's own direction, always `'expense'` or `'income'`, never `'transfer'` itself) and
   *  `'transfer'` — never a third, since flipping a debit into "income" or vice versa would misrepresent
   *  the statement fact. `suggestedType`/`toAccountId` seed the *initial* selection for a confident
   *  auto-detected match (e.g. an ATW/NWD-coded cash withdrawal); the user can still switch back.
   *  `handleSave()` reads Amount/Date/(From-)Account directly off this object (never local state, so
   *  there's no path for those three to disagree with what was shown as locked), but Type/To-account
   *  from local state, which already seeds from this object and tracks the user's own edits from there.
   *
   *  **Direction swap for a credit row marked Transfer (2026-08-05 fix)** — the locked statement
   *  account always renders in the *first* chip row and the picked account in the second, but which one
   *  is actually the schema's `accountId` (source) vs `toAccountId` (destination) depends on the row's
   *  own natural direction: for a debit (`type: 'expense'`), the locked account is the source, as the
   *  labels say. For a credit (`type: 'income'`), money arrived *into* the locked account, so it must be
   *  the destination — the first chip row is relabeled "To account" and the roles are swapped when
   *  building the final `Expense` (see `handleSave()`). Without this, marking a credit row as a transfer
   *  would record it backwards — found while designing the cross-account "possible internal transfer"
   *  suggestion, the first feature to actually exercise a credit-direction transfer (cash-withdrawal
   *  detection is debit-only).
   *  New-entry only (never combined with `editing`) — the caller (`useBankImport.ts`) always renders
   *  this on a fresh instance. */
  statementPreset?: StatementPresetInput;
  onClose: () => void;
}

/** See `statementPreset` prop doc comment above. */
export interface StatementPresetInput {
  amount: number;
  date: number; // epoch ms
  accountId: string;
  /** The statement line's own natural direction — always `'expense'` or `'income'`, matching its
   *  debit/credit — never `'transfer'` itself (see the `statementPreset` prop doc comment). */
  type: TransactionType;
  /** Initial type selection, if different from `type` — set to `'transfer'` to suggest (not force) a
   *  confident auto-detected match. Omit to just default to `type` as before. */
  suggestedType?: TransactionType;
  /** Initial "To account" when suggesting a transfer — left unset when ambiguous (e.g. more than one
   *  cash account exists), requiring the user to pick. Always the *other* account regardless of the
   *  statement row's own debit/credit direction — `handleSave()` decides which schema role (source vs
   *  destination) this and the locked account actually play, see the direction-swap note below. */
  toAccountId?: string;
  /** Short, user-visible explanation for why Transfer was suggested (e.g. "Might be the other side of
   *  a transfer with HDFC Savings — recorded there as ...") — shown next to the type toggle only while
   *  `type === 'transfer'`. Omit for a suggestion that's already self-explanatory (e.g. a narration-
   *  code cash-withdrawal match, obvious from the "guessed from statement" payment-mode caption) —
   *  primarily for the fuzzier cross-account amount/date suggestion, where the "why" isn't otherwise
   *  visible anywhere in the form. */
  suggestionNote?: string;
  /** From `inferPaymentMode()`'s `.id` — still user-editable via the normal `PaymentModeChips`, just
   *  pre-filled. */
  paymentMode: string;
  /** The full candidate (`{id,label,icon,color}`) `paymentMode` came from, when it might not exist as
   *  a real `PaymentMode` row yet (some inferred rails — NEFT/IMPS/RTGS/Cheque — aren't among the 5
   *  built-ins and are only actually created once per import batch, at commit — see
   *  `useBankImport.ts`'s `commitAndImport`). Threaded through to `PaymentModeChips` as its
   *  `pendingCandidate` prop so the chip still shows the real label/icon/color pre-commit instead of
   *  rendering with nothing selected. Omit when `paymentMode` is already one of the 5 built-ins or
   *  already a real row — `PaymentModeChips` merges it in only if not already present. */
  paymentModeCandidate?: Pick<PaymentMode, 'id' | 'label' | 'icon' | 'color'>;
  descriptionSuggestion?: string;
  categorySuggestion?: string;
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
  goals,
  onSeedGoal,
  linkedGoal,
  linkedBankStatementLines,
  saveAccount,
  searchMerchant,
  onDuplicate,
  onSaveTemplate,
  categoryManager,
  txnCountByCategory,
  goalPreset,
  statementPreset,
  onClose
}: Props) {
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  // Editing seeds from the record; a new entry may seed from a duplicate/template prefill.
  const seed = editing ?? prefill ?? null;
  const [type, setType] = useState<TransactionType>(
    seed?.type ?? statementPreset?.suggestedType ?? statementPreset?.type ?? initialType ?? 'expense'
  );
  // A goal contribution defaults to Savings (or the transfer bank category once a destination account
  // is picked) — never left blank the way a normal transaction's category is, since there's always one
  // obviously-correct answer here and the picker itself is locked/non-interactive (see below).
  const goalDefaultCategoryId = (t: TransactionType) => (t === 'transfer' ? 'cat-tr-bank' : 'cat-savings');
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Inline "+ Add account" (AccountChips.tsx's own tile) — opens Add Account without leaving this
  // form. Merges the new/edited record straight into this form's own `accounts` state (fetched once on
  // mount, see the effect below) rather than re-fetching, and auto-selects a newly created account for
  // the single-account case (skipped for transfer's two separate From/To pickers — no reliable way to
  // know which of the two the "+" was tapped from, so the user picks it manually there, one extra tap).
  const [accountFormSaving, setAccountFormSaving] = useState(false);
  const accountForm = useAccountForm(async (data, editingAccount) => {
    setAccountFormSaving(true);
    try {
      const record = await saveAccount(data, editingAccount);
      setAccounts((prev) => (editingAccount ? prev.map((a) => (a.id === record.id ? record : a)) : [...prev, record]));
      if (!editingAccount && type !== 'transfer') setAccountId(record.id);
      return record;
    } finally {
      setAccountFormSaving(false);
    }
  }, accounts);
  const [accountId, setAccountId] = useState(seed?.accountId ?? statementPreset?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(seed?.toAccountId ?? statementPreset?.toAccountId ?? '');
  const [amount, setAmount] = useState(
    seed?.amount != null ? String(seed.amount) : statementPreset ? String(statementPreset.amount) : ''
  );
  const [date, setDate] = useState(() =>
    editing
      ? epochToDateInput(editing.date)
      : statementPreset
        ? epochToDateInput(statementPreset.date)
        : epochToDateInput(Date.now())
  );
  const [time, setTime] = useState(() => epochToTimeInput(editing ? editing.date : Date.now()));
  const [categoryId, setCategoryId] = useState(
    seed?.categoryId ??
      (goalPreset
        ? goalDefaultCategoryId(seed?.type ?? initialType ?? 'expense')
        : (statementPreset?.categorySuggestion ?? ''))
  );
  const [paymentMode, setPaymentMode] = useState(seed?.paymentMode ?? statementPreset?.paymentMode ?? '');
  // Payment-mode mismatch note (2026-08-06) — re-derived live off the CURRENT `paymentMode` state (not
  // a frozen snapshot from import time), so picking a different chip in "Paid via" below makes the
  // warning disappear immediately, no separate "mark as fixed" step needed.
  const { modes: allPaymentModesForLabels } = usePaymentModes();
  const paymentModeLabelById = useMemo(
    () => new Map(allPaymentModesForLabels.map((m) => [m.id, m.label])),
    [allPaymentModesForLabels]
  );
  // Payment-mode inference stays scoped to THIS account's own leg — for a cross-account transfer with
  // two linked lines, that's always the first one (the source side, whose narration is what
  // `paymentMode`/`inferPaymentMode` actually describes here; the destination side's own narration
  // belongs to the OTHER bank's own transaction, shown for audit-trail purposes only, see the caption
  // below).
  const impliedPaymentMode = useMemo(
    () => (linkedBankStatementLines?.[0] ? inferPaymentMode(linkedBankStatementLines[0].rawNarration) : null),
    [linkedBankStatementLines]
  );
  const paymentModeMismatch = !!impliedPaymentMode && !!paymentMode && paymentMode !== impliedPaymentMode.id;
  const [description, setDescription] = useState(
    seed?.description ??
      (goalPreset ? `Contribution: ${goalPreset.goalName}` : (statementPreset?.descriptionSuggestion ?? ''))
  );
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
    goal?: boolean;
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
  // `showIouPanel` is a pure UI disclosure toggle (mirrors `showTags`/`showReceipt`) — collapsing it
  // does not clear `iouPerson`, so the ExtraCircle below stays highlighted whenever a person is filled
  // in, even while the panel itself is collapsed.
  const [showIouPanel, setShowIouPanel] = useState(!!linkedIou);
  const [iouPerson, setIouPerson] = useState(linkedIou?.personName ?? '');
  const iouKind: 'lent' | 'borrowed' = type === 'income' ? 'borrowed' : 'lent';
  // Lending / Borrowed Money / Collected Money / Return Borrowed (2026-08-06, explicit user decision) —
  // picking one of these categories makes the person mandatory, not just a manual toggle someone might
  // never open before an otherwise-silent validation failure on Save. `iouPanelOpen` (used for
  // rendering + the toggle's disabled state) is `showIouPanel` OR'd with this; the underlying manual
  // toggle state itself is untouched, so switching away from a mandatory category reverts to whatever
  // it was before, same as any other optional panel.
  const iouMandatory = IOU_MANDATORY_CATEGORY_IDS.has(categoryId);
  const iouPanelOpen = showIouPanel || iouMandatory;
  // See `StatementPresetInput`'s doc comment ("Direction swap for a credit row marked Transfer") —
  // true only when a credit statement row (money arriving into the locked account) has been switched
  // to Transfer, in which case the locked account plays the *destination* role, not the source.
  const isCreditDirectionTransfer = type === 'transfer' && statementPreset?.type === 'income';
  // Shown for new AND editing expense/income — editing prefills from the existing link so it can be changed or removed.
  const showIouSection = !!onSeedIou && (type === 'expense' || type === 'income');

  // Optional goal link (expense, income, AND transfer — unlike IOU above): this transaction counts
  // toward a goal's progress. Single-select pill row (Cashew's own `SelectObjective` shape — see the
  // 2026-08-01 mockup research), not free-text like IOU's person field, since goals already exist as a
  // fixed, user-managed list rather than being created ad hoc from this form.
  // `showGoalPanel` is a pure UI disclosure toggle (mirrors `showTags`/`showReceipt`) — collapsing it
  // does not clear `selectedGoalId`, so the ExtraCircle below stays highlighted whenever a goal is
  // picked, even while the panel itself is collapsed.
  const [showGoalPanel, setShowGoalPanel] = useState(!!linkedGoal);
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(linkedGoal?.goalId);
  const showGoalSection = !!onSeedGoal;

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
  const descriptionRef = useRef<RNTextInput>(null);
  const tagsPanelRef = useRef<View>(null);
  const iouPanelRef = useRef<View>(null);
  const goalPanelRef = useRef<View>(null);
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
  // Swapped the same way `handleSave()` does for a credit row marked Transfer — the account that would
  // actually go negative is whichever one is really paying out, not always the locked statement account.
  const effectiveFromAccountId = isCreditDirectionTransfer ? toAccountId : accountId;
  const effectiveToAccountId = isCreditDirectionTransfer ? accountId : toAccountId;
  const cashWarningBalance = useMemo(() => {
    const amt = Number(amount) || 0;
    const payingAccount = accounts.find((a) => a.id === effectiveFromAccountId);
    if (!accountBalances || amt <= 0 || !payingAccount || payingAccount.type !== 'cash') return null;
    if (type === 'income') return null; // income only increases the balance
    let base = accountBalances[payingAccount.id] ?? payingAccount.openingBalance;
    if (editing) base -= projectedBalance(payingAccount.id, 0, [], editing);
    const projected = projectedBalance(payingAccount.id, base, [], {
      accountId: effectiveFromAccountId,
      toAccountId: effectiveToAccountId,
      amount: amt,
      type
    });
    return projected < 0 ? projected : null;
  }, [accountBalances, amount, accounts, type, effectiveFromAccountId, effectiveToAccountId, editing]);

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
    setCategoryId(goalPreset ? goalDefaultCategoryId(newType) : '');
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
    const amt = statementPreset ? statementPreset.amount : parseFloat(amount);
    const nextErrors = {
      amount: isNaN(amt) || amt <= 0,
      desc: !description.trim(),
      cat: type !== 'transfer' && !categoryId,
      // Each of these is required only while its own toggle is on — off entirely, they're skipped.
      tags: type !== 'transfer' && showTags && activeTags.length === 0,
      iouPerson: showIouSection && iouPanelOpen && !iouPerson.trim(),
      goal: showGoalSection && showGoalPanel && !selectedGoalId,
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
    if (
      nextErrors.tags ||
      nextErrors.iouPerson ||
      nextErrors.goal ||
      nextErrors.shareGroup ||
      nextErrors.repeatInterval
    ) {
      setErrors(nextErrors);
      if (nextErrors.tags) focusPanel(tagsPanelRef);
      else if (nextErrors.iouPerson) focusPanel(iouPanelRef);
      else if (nextErrors.goal) focusPanel(goalPanelRef);
      else if (nextErrors.shareGroup) focusPanel(sharePanelRef);
      else focusPanel(repeatPanelRef);
      return;
    }
    setErrors({});
    setSaving(true);
    const now = Date.now();
    // In statementPreset mode, Amount/Date/(From-)Account are locked/read-only in the UI (no rendered
    // control ever mutates their state away from the preset) — reading them directly off the preset
    // here as well, rather than trusting local state to have stayed in sync, guarantees the saved
    // Expense can never disagree with what the user was actually shown as locked. Type and To-account
    // are the two fields statementPreset mode deliberately leaves editable (2026-08-05, so a
    // statement row can be marked as a transfer) — those two always read from local state, which
    // already seeds from the preset at mount (see `useState` initializers above) and tracks further
    // edits from here.
    const resolvedDate = statementPreset ? statementPreset.date : combineDateTime(date, time);
    const resolvedAccountId = statementPreset ? statementPreset.accountId : accountId;
    const resolvedToAccountId = toAccountId;
    const resolvedType = type;
    // Direction swap for a credit row marked Transfer — see `StatementPresetInput`'s doc comment.
    // `resolvedAccountId` is always the locked statement account; when it's really the destination
    // (money arrived here), the schema's `accountId`/`toAccountId` (source/destination) must swap.
    const finalAccountId = isCreditDirectionTransfer ? resolvedToAccountId : resolvedAccountId;
    const finalToAccountId = isCreditDirectionTransfer ? resolvedAccountId : resolvedToAccountId;
    const base: Expense = {
      id: editing?.id ?? crypto.randomUUID(),
      amount: amt,
      categoryId: resolvedType === 'transfer' ? 'cat-tr-bank' : categoryId,
      description: description.trim(),
      date: resolvedDate,
      hashtags: resolvedType === 'transfer' ? [] : parseTags(tagInput),
      isRecurring,
      ...(isRecurring && { recurringIntervalDays: parseInt(intervalDays, 10) || 30 }),
      ...(paymentMode && { paymentMode }),
      type: resolvedType,
      ...(finalAccountId && { accountId: finalAccountId }),
      ...(resolvedType === 'transfer' && finalToAccountId ? { toAccountId: finalToAccountId } : {}),
      ...(receipt && { receiptDataUrl: receipt }),
      ...(showShareSection && shareEnabled && shareGroupId
        ? { shareWith: [shareGroupId] }
        : editing?.shareWith
          ? { shareWith: editing.shareWith }
          : {}),
      source: editing?.source ?? (statementPreset ? 'bank_sync' : 'manual'),
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    };
    // Only mirror to the group when the link is newly added (avoid duplicate shared events on edit).
    const shareGroupTarget =
      showShareSection && shareEnabled && shareGroupId && !editing?.shareWith?.includes(shareGroupId)
        ? shareGroupId
        : null;
    const shareParticipantIds = shareParticipants.size > 0 ? [...shareParticipants] : undefined;
    // Saved whenever the field is filled, regardless of whether its panel is currently collapsed —
    // same as tags (parsed from `tagInput` above without checking `showTags`).
    const iouIntent: ExpenseSeedIntent | null =
      showIouSection && iouPerson.trim()
        ? { personName: iouPerson.trim(), kind: iouKind, amount: amt, date: base.date, description: base.description }
        : null;
    const goalIntent: ExpenseGoalIntent | null =
      showGoalSection && selectedGoalId ? { goalId: selectedGoalId, amount: amt, date: base.date } : null;
    // The one tag currently being defined (if new) carries the inline Set Aside choice; every other
    // new tag in this save defaults to off, same as saveExpenseWithHashtags already assumes.
    const newTagSetAside =
      isNewTagInProgress && base.hashtags.includes(focusedTag) ? { [focusedTag]: pendingNewTagSetAside } : undefined;

    onSave(base, newTagSetAside)
      // Reconcile the IOU link on every expense/income save: creates, updates, or (when toggled off) removes it.
      .then(() => (onSeedIou && showIouSection ? onSeedIou(base.id, iouIntent) : undefined))
      // Reconcile the goal link on every save: creates, updates, or (when toggled off) removes it.
      .then(() => (onSeedGoal && showGoalSection ? onSeedGoal(base.id, goalIntent) : undefined))
      // Mirror into the group as an equal-split shared expense when newly shared.
      .then(() =>
        onShareToGroup && shareGroupTarget ? onShareToGroup(base, shareGroupTarget, shareParticipantIds) : undefined
      )
      .catch(() => {})
      .finally(() => setSaving(false));
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
        onShow={() => descriptionRef.current?.focus()}
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
        {/* Header: type switch (adding) / title (editing), left — close, right. statementPreset mode
            (2026-08-05) gets a real 2-option toggle too, not static "Add {type}" text — see
            `StatementPresetInput`'s doc comment for why it's restricted to exactly
            [statementPreset.type, 'transfer'] rather than the full 3-way switch. */}
        <View className="flex-row items-center gap-2">
          {editing ? (
            <Text className="text-base font-semibold text-primary flex-1">{titleText}</Text>
          ) : statementPreset ? (
            <View className="flex-1">
              <SegmentedControl
                options={[
                  statementPreset.type === 'income'
                    ? { value: 'income' as const, label: 'Income', icon: 'ti-arrow-up-circle', color: '#10b981' }
                    : { value: 'expense' as const, label: 'Expense', icon: 'ti-arrow-down-circle', color: '#ef4444' },
                  { value: 'transfer' as const, label: 'Transfer', icon: 'ti-arrows-exchange', color: '#3b82f6' }
                ]}
                value={type}
                onChange={handleTypeChange}
              />
            </View>
          ) : (
            <View className="flex-1">
              <SegmentedControl
                options={
                  goalPreset
                    ? [
                        { value: 'expense' as const, label: 'Expense', icon: 'ti-arrow-down-circle', color: '#ef4444' },
                        { value: 'transfer' as const, label: 'Transfer', icon: 'ti-arrows-exchange', color: '#3b82f6' }
                      ]
                    : [
                        { value: 'expense' as const, label: 'Expense', icon: 'ti-arrow-down-circle', color: '#ef4444' },
                        { value: 'income' as const, label: 'Income', icon: 'ti-arrow-up-circle', color: '#10b981' },
                        { value: 'transfer' as const, label: 'Transfer', icon: 'ti-arrows-exchange', color: '#3b82f6' }
                      ]
                }
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

        {statementPreset?.suggestionNote && type === 'transfer' && (
          <View className="flex-row items-center gap-1.5 -mt-1.5">
            <Icon name="ti-sparkles" size={13} color={theme.info} />
            <Text className="text-xs text-tertiary flex-1">{statementPreset.suggestionNote}</Text>
          </View>
        )}

        {goalPreset && (
          <View className="flex-row items-center gap-1.5 -mt-1.5">
            <Icon name="ti-target" size={13} color={theme.info} />
            <Text className="text-xs font-semibold" style={{ color: theme.info }}>
              Contributing to {goalPreset.goalName}
            </Text>
          </View>
        )}

        {/* Audit trail (docs/plans/bank-statement-import.md §10a's purpose #1) — read-only, editing
            only (a brand-new entry has no import link yet). Was a cropped single-line icon+text row
            (found via user report 2026-08-06: long narrations got cut off, and it didn't follow the
            app's info/warning/success Banner convention at all) — now a proper `Banner`, full text
            wrapping, no truncation. The payment-mode mismatch note directly below it (also 2026-08-06)
            re-derives every render off the live `paymentMode` state, so fixing it via "Paid via" below
            removes this warning immediately — no separate dismiss/acknowledge action needed. */}
        {editing && linkedBankStatementLines && linkedBankStatementLines.length > 0 && (
          <View className="gap-2">
            <Banner variant="info" icon="ti-building-bank">
              {linkedBankStatementLines.length === 1 ? (
                <>
                  Matched from bank statement: &ldquo;{linkedBankStatementLines[0]?.rawNarration}&rdquo;,{' '}
                  {formatDate(linkedBankStatementLines[0]?.date ?? 0)}
                </>
              ) : (
                // A cross-account transfer absorbed via `linkAsCrossAccountTransfer` (found + fixed
                // 2026-08-09) — carries one linked statement line per side, not just one; showing only
                // the first was the exact on-device bug report ("only showed the statement for HDFC").
                <>
                  Matched from both sides of this transfer:
                  {linkedBankStatementLines.map((line, i) => (
                    <Text key={i}>
                      {'\n'}&ldquo;{line.rawNarration}&rdquo;, {formatDate(line.date)}
                    </Text>
                  ))}
                </>
              )}
            </Banner>
            {paymentModeMismatch && impliedPaymentMode && (
              <Banner variant="warning">
                Statement suggests {impliedPaymentMode.label} · recorded as{' '}
                {paymentModeLabelById.get(paymentMode) ?? paymentMode}. Update &ldquo;Paid via&rdquo; below to fix.
              </Banner>
            )}
          </View>
        )}

        {/* Category + Amount, combined — the amount hero moved beside the category picker instead of
            sitting centered above it with empty space either side (found via on-device review: shifting
            amount right frees up real estate on the left worth using, not leaving blank). Transfer has
            no category, so it keeps the original centered hero on its own. In `goalPreset` mode the tile
            is locked (no picker) — there's always one obviously-correct default (Savings/Transfer-bank),
            so a full category-management picker isn't "necessary" here the way it is for a normal
            transaction. `statementPreset` locks the amount (via `AmountInput`'s own `disabled`, keeping
            the exact same hero look, just non-editable) but leaves category fully interactive — this
            reuses the real form's own layout instead of a separate compact "locked fields" list, per
            explicit user feedback that the statement-preset form "should look like the expense popup". */}
        {type !== 'transfer' ? (
          <View className="flex-row items-center gap-2.5 mb-1">
            <Pressable
              onPress={() => !goalPreset && setShowCategoryPicker(true)}
              disabled={!!goalPreset}
              className="items-start gap-1.5 rounded-2xl border px-3 py-3"
              style={{
                width: 108,
                borderColor: errors.cat ? theme.danger : selectedCat ? selectedCat.color : theme.border,
                borderStyle: selectedCat ? 'solid' : 'dashed',
                backgroundColor: theme.surfaceSecondary
              }}
            >
              <View
                className="w-8 h-8 rounded-lg items-center justify-center"
                style={{ backgroundColor: selectedCat ? tint(selectedCat.color, 15) : theme.surfaceTertiary }}
              >
                <Icon
                  name={selectedCat ? selectedCat.icon : 'ti-layout-grid-add'}
                  size={16}
                  color={selectedCat ? selectedCat.color : theme.textTertiary}
                />
              </View>
              <Text
                className="text-xs font-medium"
                numberOfLines={1}
                style={{ color: selectedCat ? theme.textPrimary : theme.textTertiary }}
              >
                {selectedCat?.name ?? 'Select category'}
              </Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <AmountInput
                hero
                heroAlign="right"
                accentColor={accent}
                value={amount}
                onChange={(v) => {
                  setAmount(v);
                  if (errors.amount) setErrors((e) => ({ ...e, amount: false }));
                }}
                error={errors.amount ? 'Enter an amount' : undefined}
                disabled={!!statementPreset}
              />
            </View>
          </View>
        ) : (
          <AmountInput
            hero
            accentColor={accent}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              if (errors.amount) setErrors((e) => ({ ...e, amount: false }));
            }}
            error={errors.amount ? 'Enter an amount' : undefined}
            disabled={!!statementPreset}
          />
        )}

        {cashWarningBalance !== null && (
          <Banner variant="warning">
            This makes {selectedAccount?.name ?? 'Cash'} go to {formatCurrency(cashWarningBalance)} — did you miss a
            cash withdrawal or pick the wrong account? You can still save.
          </Banner>
        )}

        {/* Description (first focus) + merchant suggestions */}
        <View>
          <RNTextInput
            ref={descriptionRef}
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

        {/* Date + Time — equal-width fields; defaults to right now, but time is user-editable (an entry
            logged later than it happened, or backdated, should reflect when it actually occurred).
            `statementPreset` locks Date (via `DateInput`'s own `disabled`, same box, non-interactive) —
            Time isn't part of a statement line at all, so it's hidden rather than shown-and-disabled. */}
        <View className="flex-row items-center gap-2.5">
          <View style={{ flex: 1 }}>
            <DateInput value={date} onChange={setDate} disabled={!!statementPreset} />
          </View>
          {!statementPreset && (
            <View style={{ flex: 1 }}>
              <TimeInput value={time} onChange={setTime} />
            </View>
          )}
        </View>

        {/* Account — `statementPreset` locks the statement's own ("From", for a transfer) account to
            the same `AccountChips` row, just non-interactive: the whole point is the user sees the
            real, familiar chip row with the right one already selected, not a separate compact
            "locked field" list. "To account" is a different story (2026-08-05): marking a statement
            row as a transfer is exactly the point of that toggle existing at all in statementPreset
            mode (see the header above), so the To-account picker must stay interactive regardless —
            only the statement's own side of the transfer is a fixed fact from the file. */}
        <View>
          {type === 'transfer' ? (
            accounts.length === 0 ? (
              <Button variant="ghost" size="sm" icon="ti-plus" onPress={accountForm.openAdd}>
                Add accounts to track where money moves
              </Button>
            ) : (
              <View className="gap-3">
                <View
                  pointerEvents={statementPreset ? 'none' : 'auto'}
                  style={statementPreset ? { opacity: 0.6 } : undefined}
                >
                  <Text className="text-xs font-medium text-secondary mb-1">
                    {isCreditDirectionTransfer ? 'To account' : 'From account'}
                  </Text>
                  <AccountChips
                    accounts={accounts}
                    value={accountId}
                    onChange={setAccountId}
                    disabledId={toAccountId}
                    onAddAccount={accountForm.openAdd}
                  />
                </View>
                <View>
                  <Text className="text-xs font-medium text-secondary mb-1">
                    {isCreditDirectionTransfer ? 'From account' : 'To account'}
                  </Text>
                  <AccountChips
                    accounts={accounts}
                    value={toAccountId}
                    onChange={setToAccountId}
                    disabledId={accountId}
                    onAddAccount={accountForm.openAdd}
                  />
                </View>
              </View>
            )
          ) : (
            <View
              pointerEvents={statementPreset ? 'none' : 'auto'}
              style={statementPreset ? { opacity: 0.6 } : undefined}
            >
              <Text className="text-xs font-medium text-secondary mb-1">Account</Text>
              <AccountChips
                accounts={accounts}
                value={accountId}
                onChange={handleAccountSelect}
                onAddAccount={accountForm.openAdd}
              />
            </View>
          )}
        </View>

        {/* Paid via */}
        {type !== 'transfer' && (
          <View>
            <Text className="text-xs font-medium text-secondary mb-1">
              Paid via
              {statementPreset && (
                <Text className="text-xs font-medium" style={{ color: theme.primary }}>
                  {' '}
                  · guessed from statement
                </Text>
              )}
            </Text>
            <PaymentModeChips
              value={paymentMode}
              onChange={setPaymentMode}
              selectedAccount={selectedAccount}
              pendingCandidate={statementPreset?.paymentModeCandidate}
            />
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
          {showGoalSection && (
            <ExtraCircle
              icon="ti-target"
              label="Goal"
              active={showGoalPanel || !!selectedGoalId}
              accent={accent}
              onPress={() => setShowGoalPanel((v) => !v)}
            />
          )}
          {showIouSection && (
            <ExtraCircle
              icon="ti-users"
              label={iouKind === 'lent' ? 'Lent' : 'Borrowed'}
              active={iouPanelOpen || iouPerson.trim().length > 0}
              disabled={iouMandatory}
              accent={accent}
              onPress={() => setShowIouPanel((v) => !v)}
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

        {/* Goal panel — single-select pill row (Cashew's own `SelectObjective` shape), not free-text
            like the IOU panel below, since goals already exist as a fixed, user-managed list. */}
        {showGoalSection && showGoalPanel && (
          <View ref={goalPanelRef} className="rounded-xl border border-theme bg-surface-3 p-3 gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-medium text-secondary">Goal</Text>
              <Pressable
                onPress={() => {
                  onClose();
                  navigation.navigate('Goals');
                }}
              >
                <Text className="text-xs font-medium" style={{ color: theme.primary }}>
                  Manage goals ›
                </Text>
              </Pressable>
            </View>
            {errors.goal && <Text style={{ color: theme.danger }}>Pick a goal — you turned this on</Text>}
            {(goals?.length ?? 0) === 0 ? (
              <Text className="text-xs text-tertiary">No goals yet — create one from the Goals tab.</Text>
            ) : (
              <View className="flex-row flex-wrap gap-1.5">
                {goals?.map((g) => {
                  const isSelected = selectedGoalId === g.id;
                  const goalColor = getRiskColor(g.risk);
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => {
                        setSelectedGoalId(isSelected ? undefined : g.id);
                        if (errors.goal) setErrors((e) => ({ ...e, goal: false }));
                      }}
                      className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-full border-2"
                      style={
                        isSelected
                          ? { borderColor: goalColor, backgroundColor: tint(goalColor, 9) }
                          : { borderColor: theme.border }
                      }
                    >
                      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: goalColor }} />
                      <Text
                        className="text-xs font-medium"
                        style={{ color: isSelected ? goalColor : theme.textSecondary }}
                      >
                        {g.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

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

        {/* Lent / Borrowed panel — auto-opens (and can't be collapsed, see the `ExtraCircle` above)
            whenever `iouMandatory`, since Lending/Borrowed Money/Collected Money/Return Borrowed exist
            specifically to record a money movement with a person (2026-08-06). */}
        {showIouSection && iouPanelOpen && (
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
              error={
                errors.iouPerson
                  ? iouMandatory
                    ? 'Enter who this is with — required for this category'
                    : 'Enter who this is with — you turned this on'
                  : undefined
              }
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

      {/* Category picker — nested modal, above the form (RN Modals stack in mount order). Never opens in
          `goalPreset` mode (the tile is locked, `showCategoryPicker` can't become true). `categoryManager`
          is optional — `CategoryPickerModal` itself already supports an undefined `manager` as a
          select-only picker (its own "Omit for a select-only picker" doc comment), which is exactly what
          `statementPreset` mode uses: category management (create/edit/move) isn't needed there, only
          plain selection, so callers like `features/bank-import/` aren't forced to build a full
          `CategoryManager` just to let the tile open. */}
      {showCategoryPicker && type !== 'transfer' && (
        <CategoryPickerModal
          type={type}
          categories={categories}
          selectedId={categoryId}
          manager={categoryManager}
          txnCountByCategory={txnCountByCategory}
          activeVacationEvent={
            activeVacationEvent ? { id: activeVacationEvent.id, name: activeVacationEvent.name } : undefined
          }
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

      {/* Inline "+ Add account" (AccountChips.tsx's "+" tile) — a second Modal stacked on top of this
          one; RN's Modal already supports this (see components/ui/Modal.tsx's doc comment), so no new
          pattern was needed. */}
      {accountForm.showForm && <AccountFormModal form={accountForm} saving={accountFormSaving} />}
    </>
  );
}
