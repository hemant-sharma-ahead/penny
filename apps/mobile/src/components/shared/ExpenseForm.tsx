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
  LedgerKind,
  MerchantMemory,
  PaymentMode,
  Person,
  TransactionSource,
  TransactionType
} from '@/core/db/types';
import type { ExpenseSeedIntent } from '@/core/iou/expenseLink';
import type { ExpenseGoalIntent } from '@/core/goals/goalLink';
import { kindForIouCategory } from '@/core/iou/ledger';
import type { ActiveEvent } from '~/context/EventModeContext';
import { useToast } from '~/context/ToastContext';
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
  Toggle,
  ConfirmDialog
} from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { captureReceiptPhoto, pickReceiptPhoto } from '~/lib/receiptImage';
import { ItemHistory } from '~/features/activity/components/ItemHistory';
import { CategoryPickerModal } from '~/features/expenses/categories/CategoryPickerModal';
import type { CategoryManager } from '~/features/expenses/categories/types';
import { AccountFormModal } from './AccountFormModal';
import { ExtraCircle } from './ExtraCircle';
import { PersonTypeahead } from './PersonTypeahead';
import { useAccountForm, type AccountInput } from '~/hooks/useAccountForm';
import { AccountChips } from './AccountChips';
import { PaymentModeChips } from './PaymentModeChips';
import { couplePaymentToAccount, defaultPaymentModeForAccount } from './paymentModes';
import { inferPaymentMode } from '@/core/expenses/paymentModeInference';
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
  /** When editing (and not a Transfer, and not `goalPreset`/`statementPreset`): enables the type
   *  `SegmentedControl` restricted to Expense ⟷ Income (item 6, docs/plans/real-device-testing-pass.md
   *  Phase 2 — Transfer is excluded from edit-mode switching entirely, it structurally needs two
   *  accounts, so a Transfer being edited keeps today's static-title behavior no matter what this prop
   *  says). When set to a non-empty string, the switch is blocked instead — both segments render dimmed
   *  and a `Banner` shows this exact explanatory sentence (e.g. "this transaction is linked to Raj's IOU
   *  ledger. Remove the link first if you need to switch it."). The caller (`TransactionsSlice.tsx`)
   *  computes this from whether the transaction has an IOU ledger link (any `ledger_entries` row with a
   *  matching `linkedTxnId`, not just expense-seeded ones), is shared to a Group (`shareWith.length > 0`),
   *  or backs a Goal contribution — checking all three since any one of them makes an in-place type
   *  switch unsafe (the linked record would silently disagree with the transaction's new type). */
  typeSwitchBlockReason?: string | null;
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
  /** Overrides the `TransactionSource` this form saves as — defaults to `'bank_sync'` when omitted
   *  (every pre-existing caller is Bank Statement Import, which never set this). Added so SMS
   *  Tracking's "New Pending" tile (docs/plans/sms-transaction-tracking.md §7) can reuse this exact
   *  same preset-mode form for its own commit-to-Expense step, passing `'sms'` instead — same reasoning
   *  as `paymentModeCandidate` above (a second, then third, consumer needing one more preset field
   *  rather than forking the whole form). */
  source?: TransactionSource;
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
  typeSwitchBlockReason,
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
  const { showToast } = useToast();
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

  // IOU link (new expense/income only): an expense can be "lent to" someone (they owe you), an income
  // can be "borrowed from" someone (you owe them) — or, for the 2 settlement categories, a repayment
  // of existing debt rather than a new one. The transaction itself is the money movement; this seeds
  // the matching IOU ledger entry.
  // 2026-08-26 (explicit user decision, following the split-vs-Groups discussion): the panel is no
  // longer a free-standing toggle a person could open for ANY category — IOU exists to track a real,
  // full-amount debt, and shared/partial costs under an unrelated category belong to "Share with a
  // group" instead (already category-independent, untouched by this change). So visibility is now
  // driven purely by `iouMandatory` below; there's nothing left to manually open/close.
  const [iouPerson, setIouPerson] = useState(linkedIou?.personName ?? '');
  // Lending / Borrowed Money / Collected Money / Return Borrowed (2026-08-06) — picking one of these
  // categories makes the person mandatory.
  const iouMandatory = IOU_MANDATORY_CATEGORY_IDS.has(categoryId);
  // `kind`/`settleDirection` come from the real category, via the one shared mapping
  // (`kindForIouCategory`, `core/iou/ledger.ts`) — NOT from the transaction's type alone. Deriving
  // from type only (`type === 'income' ? 'borrowed' : 'lent'`) was the bug found 2026-08-26: it
  // mislabeled a "Return Borrowed"-categorized expense as a brand-new "lent" entry instead of a
  // settlement, since it never looked at which of the 4 categories was actually picked. The legacy
  // (non-mandatory but still-linked) case below has no real IOU category to read, so it keeps the old
  // type-only guess — the best available signal for data that predates these 4 categories mattering.
  const { kind: iouKind, settleDirection: iouSettleDirection } = iouMandatory
    ? kindForIouCategory(categoryId)
    : { kind: (type === 'income' ? 'borrowed' : 'lent') as LedgerKind, settleDirection: undefined };
  // Legacy escape hatch: a transaction saved *before* this gating change can have a real
  // `linkedIou` (a person tagged under a non-IOU category, from when that was still allowed) — if the
  // panel only rendered for `iouMandatory`, editing that transaction and saving would silently drop the
  // existing link the moment its category isn't one of the 4, since the person field would never be on
  // screen to preserve it. Keeping the panel visible (but not mandatory) whenever a link already exists
  // avoids that silent data loss; the person is only ever *required* when `iouMandatory`.
  const iouPanelOpen = iouMandatory || !!linkedIou;
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

  // Discard-changes confirmation (item 29, docs/plans/real-device-testing-pass.md Phase 4) — the X
  // button, backdrop tap, and Android hardware back all used to call `onClose` unconditionally with no
  // check for unsaved edits. `formReady` flips true once the mount-time account fetch (and its
  // new-entry auto-select of the first account/payment-mode, see the effect below) has actually
  // resolved — the snapshot is captured only after that settles, specifically so that automatic default
  // doesn't itself register as a "change" and produce a false discard prompt the instant the form opens.
  const [formReady, setFormReady] = useState(false);
  const initialSnapshotRef = useRef<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Delete confirmation (real-device-testing-pass, item 1) — the Delete button used to call
  // `onDelete` immediately on press, Undo-toast only; every other destructive action in this app
  // (bulk delete, discard-changes above) confirms first, so this one-off was the odd one out. Fixed
  // here, not per-caller, since `ExpenseForm` has 6 independent callers that all get this for free.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /** Plain-value fingerprint of everything this form actually lets the user edit — deliberately omits
   *  pure UI disclosure toggles (`showTags`/`showReceipt`/`showGoalPanel`) and the
   *  group-member participant selection (`shareParticipants`), which populates from its own async
   *  members fetch on a similar timer to the account default above and isn't itself a field the user
   *  directly edits before this snapshot settles. */
  function currentSnapshot() {
    return JSON.stringify({
      type,
      accountId,
      toAccountId,
      amount,
      date,
      time,
      categoryId,
      paymentMode,
      description,
      tagInput,
      isRecurring,
      intervalDays,
      receipt: receipt ?? '',
      shareEnabled,
      shareGroupId,
      iouPerson,
      selectedGoalId: selectedGoalId ?? ''
    });
  }

  useEffect(() => {
    if (formReady && initialSnapshotRef.current === null) {
      initialSnapshotRef.current = currentSnapshot();
    }
    // currentSnapshot() intentionally isn't in this effect's own dependency list (it closes over every
    // field below, which is exactly what should re-trigger it) — the guard above ensures it only ever
    // actually assigns once per mount, the moment `formReady` first turns true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formReady,
    type,
    accountId,
    toAccountId,
    amount,
    date,
    time,
    categoryId,
    paymentMode,
    description,
    tagInput,
    isRecurring,
    intervalDays,
    receipt,
    shareEnabled,
    shareGroupId,
    iouPerson,
    selectedGoalId
  ]);

  /** Intercepts all three close paths (X button, `Modal`'s backdrop tap, Android hardware back via
   *  `Modal`'s `onRequestClose` — both of the latter two are wired through `Modal`'s single `onClose`
   *  prop) — shows a Discard/Cancel confirmation when the form is dirty instead of closing immediately. */
  function requestClose() {
    if (initialSnapshotRef.current !== null && initialSnapshotRef.current !== currentSnapshot()) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }

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
      // Closed accounts (2026-08-27) are hidden from every picker that assigns a NEW/edited
      // transaction — same treatment `!isArchived` already got, just a separate, distinct flag (see
      // `Account.isClosed`'s own doc comment for why the two aren't merged).
      const active = accs.filter((a) => !a.isArchived && !a.isClosed);
      setAccounts(active);
      if (!initEditing.current && active.length > 0) {
        // The user's chosen default account (2026-08-27) wins when set; falls back to the previous
        // "whichever account is first" behavior otherwise — same fallback, just no longer the only
        // option. Payment mode follows the SAME account via `defaultPaymentModeForAccount`
        // (cash→cash, credit card→card, bank/wallet→UPI) instead of the old cash-only special case.
        const first = active.find((a) => a.isDefault) ?? active[0];
        if (first) {
          setAccountId(first.id);
          setPaymentMode(defaultPaymentModeForAccount(first));
        }
      }
      setFormReady(true);
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
    // Pre-fills the most recent matching amount too (2026-08-22) — same "comes from the most recent
    // matching txn" convention as category/account/payment mode above. Still a plain editable
    // `AmountInput` afterward, not locked — the user can change it same as any other field.
    if (mem.amount != null) {
      setAmount(String(mem.amount));
      if (errors.amount) setErrors((e) => ({ ...e, amount: false }));
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
      // Only truly required for a mandatory category — the legacy-link case above shows the panel
      // without forcing the field, so clearing it (to remove a stale link) doesn't hit a validation wall.
      iouPerson: showIouSection && iouMandatory && !iouPerson.trim(),
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
      source: editing?.source ?? statementPreset?.source ?? (statementPreset ? 'bank_sync' : 'manual'),
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    };
    // Only mirror to the group when the link is newly added (avoid duplicate shared events on edit).
    const shareGroupTarget =
      showShareSection && shareEnabled && shareGroupId && !editing?.shareWith?.includes(shareGroupId)
        ? shareGroupId
        : null;
    const shareParticipantIds = shareParticipants.size > 0 ? [...shareParticipants] : undefined;
    // Gated on `iouPanelOpen` (mandatory category OR a pre-existing legacy link), not just whether
    // `iouPerson` happens to hold a value — a category that never made the panel mandatory in the first
    // place, and has no existing link either, must never seed an IOU entry, no matter what's sitting in
    // that state variable (e.g. left over from a category the user briefly picked, then changed away
    // from — `iouPerson` itself is intentionally not cleared on category change, same as `iouPanelOpen`
    // recomputing live off the current category is what actually decides whether it still applies).
    const iouIntent: ExpenseSeedIntent | null =
      showIouSection && iouPanelOpen && iouPerson.trim()
        ? {
            personName: iouPerson.trim(),
            kind: iouKind,
            ...(iouSettleDirection ? { settleDirection: iouSettleDirection } : {}),
            amount: amt,
            date: base.date,
            description: base.description
          }
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
        onClose={requestClose}
        scrollable
        scrollRef={scrollRef}
        onShow={() => descriptionRef.current?.focus()}
        footer={
          <View className="gap-2.5">
            <View className="flex-row gap-3">
              {editing && (
                <Button variant="danger" onPress={() => setShowDeleteConfirm(true)}>
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
            // Transfer stays static-title always (structurally needs two accounts — never offered as a
            // switch target). `goalPreset`/`statementPreset` editing (goal-contribution edit, bank-import
            // lone-wolf edit) also keeps the static title — both already have their own fixed type
            // semantics unrelated to this Expense⟷Income toggle. Otherwise (item 6): a real 2-option
            // toggle, dimmed + blocked with an explanatory `Banner` below when `typeSwitchBlockReason` is set.
            editing.type === 'transfer' || goalPreset || statementPreset ? (
              <Text className="text-base font-semibold text-primary flex-1">{titleText}</Text>
            ) : (
              <View className="flex-1">
                <SegmentedControl
                  options={[
                    {
                      value: 'expense' as const,
                      label: 'Expense',
                      icon: 'ti-arrow-down-circle',
                      color: '#ef4444',
                      disabled: !!typeSwitchBlockReason
                    },
                    {
                      value: 'income' as const,
                      label: 'Income',
                      icon: 'ti-arrow-up-circle',
                      color: '#10b981',
                      disabled: !!typeSwitchBlockReason
                    }
                  ]}
                  value={type}
                  onChange={handleTypeChange}
                />
              </View>
            )
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
            onPress={requestClose}
            accessibilityLabel="Close"
            className="w-8 h-8 items-center justify-center rounded-lg"
          >
            <Icon name="ti-x" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>

        {/* Blocked-switch explanation (item 6) — shown whenever the caller determined this transaction's
            type can't safely be switched (IOU-linked / shared-to-group / goal-linked), mirroring this
            file's own audit-trail/payment-mode-mismatch `Banner` convention above, just one level up
            (type, not a field). */}
        {editing && editing.type !== 'transfer' && !goalPreset && !statementPreset && typeSwitchBlockReason && (
          <Banner variant="info" icon="ti-info-circle">
            Type can&apos;t be changed — {typeSwitchBlockReason}
          </Banner>
        )}

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
          <View className="mb-1">
            <View className="flex-row items-center gap-2.5">
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
            {/* Category-cleared caption (item 6) — categories are type-scoped, so switching Expense⟷Income
                in edit mode clears the category and lands on the tile's own pre-existing dashed-border
                empty state above; this just names why. Derived, not stored — naturally disappears once a
                new category is picked (`categoryId` becomes truthy again) or the type is switched back to
                what it was originally (`editing.type`). */}
            {editing && editing.type !== 'transfer' && type !== editing.type && !categoryId && (
              <Text className="text-[11px] text-tertiary italic mt-1">Category cleared — pick one for {typeLabel}</Text>
            )}
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
                    {/* Most recent matching amount (2026-08-22) — shown so the tap's effect (also
                        pre-filling the amount, see `applyMemory`) isn't a surprise; the whole row has
                        always been the tap target (see `Pressable` above), this is display only. */}
                    {mem.amount != null && (
                      <Text className="text-[11px] font-semibold" style={{ color: theme.primary }}>
                        {formatCurrency(mem.amount)}
                      </Text>
                    )}
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

        {/* Paid via — also shown for transfers (item 7, 2026-08-29): a transfer still moves via a real
            rail (NEFT/UPI/cheque/cash), so there's no reason to hide the same picker used for
            expense/income. Reuses `PaymentModeChips` as-is (same component/props); positioned right
            after the From/To account rows above, per the approved mockup. */}
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

        {/* Secondary actions — circular icon bar */}
        <View className="flex-row justify-center gap-2 pt-1">
          {showIouSection && (
            // No longer a toggle (2026-08-26 — see this file's own `iouPanelOpen`/`iouMandatory` doc
            // comment above): always rendered so the row's set of circles stays visually stable, and
            // still tappable, but tapping it while inactive can't open anything anymore — instead it
            // explains why via the shared toast (`TrackingHeatmap.tsx`'s "touch has no hover" precedent
            // for exactly this — a brief explanatory tap-response standing in for a tooltip). A no-op
            // while already active (nothing to explain).
            <ExtraCircle
              icon="ti-users"
              label={iouKind === 'lent' ? 'Lent' : iouKind === 'borrowed' ? 'Borrowed' : 'Settled'}
              active={iouPanelOpen}
              locked={!iouPanelOpen}
              accent={accent}
              onPress={() => {
                if (iouPanelOpen) return;
                showToast({
                  message:
                    type === 'income'
                      ? 'Only enabled for Borrowed Money / Collected Money categories.'
                      : 'Only enabled for Lending / Return Borrowed categories.'
                });
              }}
            />
          )}
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

        {/* Lent / Borrowed panel — auto-opens whenever `iouMandatory` (no manual toggle anymore, see
            this file's own `iouPanelOpen`/`iouMandatory` doc comment above), since Lending/Borrowed
            Money/Collected Money/Return Borrowed exist specifically to record a money movement with a
            person (2026-08-06). Also opens (non-mandatory) for a pre-existing legacy link so it doesn't
            silently vanish on the next save.
            Person field (2026-08-18, item 12): now `PersonTypeahead` — the same type-ahead-dropdown
            pattern `PersonPicker.tsx` (the standalone IOU add-flow) uses, instead of a plain `TextInput`
            plus an always-visible row of plain-pill matches. The dropdown now only appears while the
            field is focused/typing (gated on internal `focused` state, not on `iouPerson` being
            non-empty), matches are live-filtered, and a "Create '<name>'" row shows when nothing exact
            matches — see `docs/mockups/proposals/iou-quick-fixes-v1.html` §2. Doesn't call
            `getOrCreatePerson` itself — selecting or typing here only sets `iouPerson`; the actual
            resolve-or-create still happens later, in `seedIouFromExpense` (`useExpenses.ts`), once the
            expense itself saves — unchanged architecture, purely a selection-UI change. */}
        {showIouSection && iouPanelOpen && (
          <View
            ref={iouPanelRef}
            className="rounded-xl border p-3 gap-2"
            style={{
              borderColor: errors.iouPerson ? theme.danger : theme.border,
              backgroundColor: theme.surfaceTertiary
            }}
          >
            <PersonTypeahead
              persons={iouPersons ?? []}
              query={iouPerson}
              onQueryChange={(v) => {
                setIouPerson(v);
                if (errors.iouPerson) setErrors((e) => ({ ...e, iouPerson: false }));
              }}
              onSelect={(p) => {
                setIouPerson(p.name);
                if (errors.iouPerson) setErrors((e) => ({ ...e, iouPerson: false }));
              }}
              placeholder="Person's name"
              error={errors.iouPerson}
            />
            {errors.iouPerson ? (
              // Only ever fires when `iouMandatory` — the legacy (non-mandatory) case never requires
              // the field, see `nextErrors.iouPerson`'s own comment.
              <Text className="text-xs" style={{ color: theme.danger }}>
                Enter who this is with — required for this category
              </Text>
            ) : (
              <Text className="text-xs text-tertiary">
                {iouMandatory
                  ? iouKind === 'lent'
                    ? "Adds a they-owe-you entry to this person's ledger."
                    : iouKind === 'borrowed'
                      ? "Adds a you-owe-them entry to this person's ledger."
                      : iouSettleDirection === 'they_paid_you'
                        ? 'Records that they paid you back — reduces what they owe you.'
                        : 'Records that you paid them back — reduces what you owe them.'
                  : 'This category no longer keeps a person linked by default — clear the name to remove the existing IOU link, or leave it to keep it.'}
              </Text>
            )}
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

        {/* History (editing), plus the audit trail directly above it (item 3 — moved down from just
            below the header 2026-08-29, so opening the popup lands on editable fields immediately
            instead of a read-only banner; docs/plans/bank-statement-import.md §10a's purpose #1).
            Was a cropped single-line icon+text row (found via user report 2026-08-06: long narrations
            got cut off, and it didn't follow the app's info/warning/success Banner convention at all)
            — now a proper `Banner`, full text wrapping, no truncation. The payment-mode mismatch note
            directly below it (also 2026-08-06) re-derives every render off the live `paymentMode`
            state, so fixing it via "Paid via" above removes this warning immediately — no separate
            dismiss/acknowledge action needed. Both banners are pure content/logic carried over as-is
            — only their position moved. */}
        {editing && (
          <View className="border-t border-theme pt-3 gap-2">
            {linkedBankStatementLines && linkedBankStatementLines.length > 0 && (
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
                    {paymentModeLabelById.get(paymentMode) ?? paymentMode}. Update &ldquo;Paid via&rdquo; above to fix.
                  </Banner>
                )}
              </View>
            )}
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

      {/* Discard-changes confirmation (item 29) — a third Modal stacked on top, same pattern as the
          receipt viewer/AccountFormModal above; `ConfirmDialog` itself no-ops (`return null`) while
          closed. */}
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
        title="Discard changes?"
        message="You have unsaved changes. Discard them?"
        confirmLabel="Discard"
        cancelLabel="Cancel"
        confirmVariant="danger"
      />

      {/* Delete confirmation (item 1) — same stacked-Modal pattern as discard above. */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          if (!editing) return;
          setDeleting(true);
          onDelete(editing.id)
            .catch(() => {})
            .finally(() => {
              setDeleting(false);
              setShowDeleteConfirm(false);
            });
        }}
        title="Delete transaction?"
        message="You can undo right after."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        loading={deleting}
      />
    </>
  );
}
