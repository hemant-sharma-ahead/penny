import { useRef, useState } from 'react';
import { View, Pressable, TextInput as RNTextInput, Text } from 'react-native';
import type { Account, ExpenseCategory, Hashtag, Person } from '@/core/db/types';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import type { MerchantSuggestion } from '@/core/bank-import/merchantMemory';
import type { CashTransferSuggestion } from '@/core/bank-import/cashWithdrawalCodes';
import type { PossibleTransferSuggestion } from '@/core/bank-import/matcher';
import { prettifyMerchantKey } from '@/core/bank-import/normalization';
import { Modal, Button, Banner, SelectInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { CategoryPickerModal } from '~/features/expenses/categories/CategoryPickerModal';
import { ExtraCircle } from '~/components/shared/ExtraCircle';

interface BulkCategorizeModalProps {
  normalizedKey: string;
  /** Only the currently-checked rows in this merchant group — bulk-apply targets these; unchecked
   *  rows stay in the group for a later pass (docs/plans/bank-statement-import.md §7). */
  checkedRows: ParsedStatementRow[];
  totalInGroup: number;
  categories: ExpenseCategory[];
  hashtags: Hashtag[];
  /** For the Lent/Borrowed panel's autocomplete. Omit (or pass empty) to hide suggestions — the
   *  free-text field itself still works either way, same as `ExpenseForm`'s own IOU panel. */
  iouPersons?: Person[];
  suggestion?: MerchantSuggestion | undefined;
  /** Auto cash-withdrawal detection (2026-08-05) — checked per-row; a confident narration-code match
   *  (ATW, NWD, SELF, ...) pre-fills the "Mark as transfer" toggle below. */
  suggestCashTransferForRow: (rawNarration: string) => CashTransferSuggestion | null;
  /** Softer, amount/date-only cross-account suggestion (2026-08-05) — checked per-row only when the
   *  cash one didn't already fire. See `suggestPossibleTransfer`'s own doc comment for why it only
   *  ever returns a single confident candidate or nothing. */
  suggestPossibleTransferForRow: (row: ParsedStatementRow) => PossibleTransferSuggestion | null;
  /** Every account except the one currently being imported — the "Mark as transfer" toggle's account
   *  picker (2026-08-05, generalized from a cash-accounts-only picker: a transfer can go to any of the
   *  user's own accounts, not just cash — see the explicit user discussion on manual override capability). */
  accounts: Account[];
  cashAccounts: Account[];
  onApply: (fields: {
    description: string;
    categoryId: string;
    tags: string[];
    newTagSetAside?: Record<string, boolean>;
    iouPersonName?: string;
    /** Set instead of description/categoryId/tags/iouPersonName when the "Mark as transfer" toggle is
     *  on — `resolveMerchantGroup` builds every checked row as a Transfer with this account. */
    asTransferToAccountId?: string;
  }) => void;
  onClose: () => void;
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Bucket 3's bulk-categorize flow (mockup `#s5`) — a lighter, purpose-built modal, not a reused
 * per-row `ExpenseForm`, but deliberately mirroring its Category/Tags/Lent-Borrowed UI wherever the
 * bulk-shared nature of this screen allows it (per explicit 2026-08-03 user feedback that it should
 * "mimic the expense modal to whatever extent it could") — same category-picker tile, same Tags panel
 * (frequent tags/suggestions/Set Aside), same Lent/Borrowed panel, just applied once across every
 * checked occurrence instead of per-transaction. Amount/Date/Account still aren't bulk-shared fields —
 * they differ per occurrence and aren't editable here anyway.
 * **Payment mode is deliberately NOT one of the bulk-shared fields** — docs/plans/bank-statement-
 * import.md §7 lists the shared fields as category/description/tags only, and §8 says payment mode
 * is inferred per statement line from its own narration (different occurrences of the same merchant
 * can legitimately arrive via different rails — UPI one month, NEFT the next). The caller
 * (`useBankImport.ts`'s `resolveMerchantGroup`) resolves `inferPaymentMode(row.rawNarration)`
 * independently for each row when building its `Expense`, never one shared value for the group.
 * Pre-fills description/category from `suggestForMerchant()` when this merchant has been seen before
 * (§9b) — always an editable suggestion, never silently auto-applied.
 */
export function BulkCategorizeModal({
  normalizedKey,
  checkedRows,
  totalInGroup,
  categories,
  hashtags,
  iouPersons = [],
  suggestion,
  suggestCashTransferForRow,
  suggestPossibleTransferForRow,
  accounts,
  cashAccounts,
  onApply,
  onClose
}: BulkCategorizeModalProps) {
  const theme = useThemeColors();
  const descRef = useRef<RNTextInput>(null);
  // A merchant seen for the first time has no `MerchantSuggestion` yet — defaults to a generalized,
  // still-fully-editable description derived from the merchant key itself rather than starting blank.
  const [description, setDescription] = useState(suggestion?.description ?? prettifyMerchantKey(normalizedKey));
  const [categoryId, setCategoryId] = useState(suggestion?.categoryId ?? '');
  const [tagInput, setTagInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Auto transfer detection (2026-08-05, generalized from cash-only) — computed once per row: a
  // confident narration-code match (cash withdrawal) wins when present, otherwise falls back to the
  // softer cross-account amount/date suggestion. A group is almost always one uniform kind of
  // transaction (the same normalized merchant key), so "every row matches AND all point to the same
  // account" is the realistic bar for defaulting the toggle on rather than just offering it — the
  // toggle itself is ALWAYS available regardless (manual override must never be gated behind
  // detection, per explicit user discussion: sometimes the user is the only one who knows a payment
  // is really a transfer, e.g. one leg's bank hasn't even been imported yet).
  const transferSuggestions = checkedRows.map(
    (r) => suggestCashTransferForRow(r.rawNarration)?.toAccountId ?? suggestPossibleTransferForRow(r)?.account.id
  );
  const anyTransferMatch = transferSuggestions.some((id) => id !== undefined);
  const uniformTransferAccountId = (() => {
    if (checkedRows.length === 0) return undefined;
    const ids = new Set(transferSuggestions);
    return transferSuggestions.every((id) => id !== undefined) && ids.size === 1 ? transferSuggestions[0] : undefined;
  })();
  const [markAsTransfer, setMarkAsTransfer] = useState(() => uniformTransferAccountId !== undefined);
  const [transferAccountId, setTransferAccountId] = useState(() => uniformTransferAccountId ?? '');
  // Both panels start collapsed, toggled via the same `ExtraCircle` icon-row pattern as `ExpenseForm`
  // (an icon lights up once its panel is open or already has a value, same active-state rule).
  const [showTags, setShowTags] = useState(false);
  // Inline Set Aside choice for whichever new (not-yet-a-real-`Hashtag`) tag is currently being typed
  // — same mechanic as `ExpenseForm`'s Tags panel.
  const [pendingNewTagSetAside, setPendingNewTagSetAside] = useState(false);
  const [focusedTag, setFocusedTag] = useState('');
  const [showIouPanel, setShowIouPanel] = useState(false);
  const [iouPersonName, setIouPersonName] = useState('');

  const selectedCat = categories.find((c) => c.id === categoryId);
  // A merchant group's rows are overwhelmingly one direction in practice (the same merchant doesn't
  // usually pay you one month and charge you the next) — pick whichever the majority of the checked
  // rows actually are, same approach as the older `features/import/review/CategoryTile.tsx`.
  const pickerType: 'expense' | 'income' =
    checkedRows.filter((r) => r.direction === 'credit').length > checkedRows.length / 2 ? 'income' : 'expense';
  // Expense group → they owe you (lent); income group → you owe them (borrowed) — same convention as
  // `ExpenseForm`'s `iouKind`. Also doubles as the icon-row accent color (red for expense, green for
  // income), matching how amounts are colored everywhere else in this feature.
  const iouKind: 'lent' | 'borrowed' = pickerType === 'income' ? 'borrowed' : 'lent';
  const accent = pickerType === 'income' ? theme.success : theme.danger;
  const canApply = markAsTransfer
    ? checkedRows.length > 0 && transferAccountId.length > 0
    : description.trim().length > 0 && categoryId.length > 0 && checkedRows.length > 0;

  const activeTags = parseTags(tagInput);
  const tagParts = tagInput.split(/[\s,]+/);
  const lastWord = (tagParts[tagParts.length - 1] ?? '').replace(/^#/, '');
  const tagSuggestions =
    lastWord.length > 0
      ? hashtags.filter((h) => h.name.startsWith(lastWord) && !activeTags.includes(h.name)).slice(0, 5)
      : [];
  // Frequent tags — always visible, no typing required (top-5 by usage, minus ones already applied).
  const frequentTags = [...hashtags]
    .filter((h) => !activeTags.includes(h.name))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5);
  const matchingExistingTag = focusedTag ? hashtags.find((h) => h.name === focusedTag) : undefined;
  const isNewTagInProgress = focusedTag.length > 0 && !matchingExistingTag;

  const iouMatches =
    iouPersonName.trim().length > 0
      ? (() => {
          const q = iouPersonName.trim().toLowerCase();
          return iouPersons
            .filter((p) => !p.isArchived && p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q)
            .slice(0, 6);
        })()
      : [];

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

  function handleApply() {
    setTouched(true);
    if (!canApply) return;
    if (markAsTransfer) {
      onApply({ description: '', categoryId: '', tags: [], asTransferToAccountId: transferAccountId });
      return;
    }
    const tags = parseTags(tagInput);
    // The one tag currently being defined (if new) carries the inline Set Aside choice — same rule
    // `ExpenseForm` uses.
    const newTagSetAside =
      isNewTagInProgress && tags.includes(focusedTag) ? { [focusedTag]: pendingNewTagSetAside } : undefined;
    onApply({
      description: description.trim(),
      categoryId,
      tags,
      ...(newTagSetAside ? { newTagSetAside } : {}),
      ...(iouPersonName.trim() ? { iouPersonName: iouPersonName.trim() } : {})
    });
  }

  return (
    <>
      <Modal
        onClose={onClose}
        title={`Categorize · ${normalizedKey}`}
        scrollable
        onShow={() => descRef.current?.focus()}
        footer={
          <Button variant="primary" fullWidth disabled={!canApply} onPress={handleApply}>
            {`Apply to ${checkedRows.length} transaction${checkedRows.length === 1 ? '' : 's'}`}
          </Button>
        }
      >
        <Text className="text-xs text-tertiary -mt-1">
          {checkedRows.length} of {totalInGroup} selected
        </Text>

        <Banner variant="info">
          Applies to the {checkedRows.length} checked transaction{checkedRows.length === 1 ? '' : 's'} — each keeps its
          own date, amount, and payment mode (guessed per line from its own statement narration, not shared across the
          group).
        </Banner>

        {suggestion && (
          <View
            className="flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1"
            style={{ backgroundColor: theme.surfaceSecondary }}
          >
            <Icon name="ti-sparkles" size={12} color={theme.primary} />
            <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
              Remembered from last import
            </Text>
          </View>
        )}

        {/* "Mark as transfer" (2026-08-05, generalized from a cash-withdrawal-only toggle) — ALWAYS
            available, never gated behind auto-detection: sometimes only the user knows a payment is
            really a transfer (e.g. a UPI transfer to their own account at a bank they haven't imported
            a statement from yet — no narration code, no cross-account record to match against, nothing
            for either heuristic to find). Auto-detection only decides whether it starts pre-checked and
            which account is pre-filled; the manual override always exists regardless. Toggling this on
            replaces the whole category/tags/IOU flow below with a single account picker — a transfer
            doesn't have a category or tags. */}
        <Pressable
          onPress={() =>
            setMarkAsTransfer((v) => {
              const next = !v;
              if (next && !transferAccountId && cashAccounts.length === 1) {
                setTransferAccountId(cashAccounts[0]?.id ?? '');
              }
              return next;
            })
          }
          className="flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5"
          style={{ borderColor: theme.info, backgroundColor: markAsTransfer ? tint(theme.info, 8) : undefined }}
        >
          <Icon name={markAsTransfer ? 'ti-square-check-filled' : 'ti-square'} size={18} color={theme.info} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-primary">Mark as transfer</Text>
            <Text className="text-xs text-tertiary">
              {anyTransferMatch
                ? 'Looks like a transfer between your own accounts — confirm the account below.'
                : 'Treat these as a transfer between your own accounts instead of categorizing them.'}
            </Text>
          </View>
        </Pressable>

        {markAsTransfer ? (
          <SelectInput
            label="Transfer with account"
            value={transferAccountId}
            onChange={setTransferAccountId}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            hint={touched && !transferAccountId ? 'Pick which account this transfer involves.' : undefined}
          />
        ) : (
          <>
            <View className="gap-1">
              <Text className="text-xs font-medium text-secondary">Description</Text>
              <RNTextInput
                ref={descRef}
                value={description}
                onChangeText={setDescription}
                placeholder="What was this for?"
                placeholderTextColor={theme.textTertiary}
                className="bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm"
                style={{ borderColor: touched && !description.trim() ? theme.danger : theme.border }}
              />
            </View>

            <View className="gap-1">
              <Text className="text-xs font-medium text-secondary">Category</Text>
              <Pressable
                onPress={() => setShowCategoryPicker(true)}
                className="flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: touched && !categoryId ? theme.danger : selectedCat ? selectedCat.color : theme.border,
                  borderStyle: selectedCat ? 'solid' : 'dashed'
                }}
              >
                <View
                  className="w-7 h-7 rounded-lg items-center justify-center"
                  style={{ backgroundColor: selectedCat ? tint(selectedCat.color, 15) : theme.surfaceTertiary }}
                >
                  <Icon
                    name={selectedCat ? selectedCat.icon : 'ti-layout-grid-add'}
                    size={15}
                    color={selectedCat ? selectedCat.color : theme.textTertiary}
                  />
                </View>
                <Text
                  className="text-sm font-medium flex-1"
                  numberOfLines={1}
                  style={{ color: selectedCat ? theme.textPrimary : theme.textTertiary }}
                >
                  {selectedCat?.name ?? 'Choose a category…'}
                </Text>
                <Icon name="ti-chevron-right" size={14} color={theme.textTertiary} />
              </Pressable>
              {touched && !categoryId && (
                <Text className="text-xs" style={{ color: theme.danger }}>
                  Pick a category
                </Text>
              )}
            </View>

            {/* Secondary actions — same circular icon bar as `ExpenseForm`, toggling the two panels below.
            An icon lights up once its panel is open or already has a value, same active-state rule. */}
            <View className="flex-row justify-center gap-2 pt-1">
              <ExtraCircle
                icon="ti-hash"
                label="Tags"
                active={showTags || activeTags.length > 0}
                accent={accent}
                onPress={() => setShowTags((v) => !v)}
              />
              <ExtraCircle
                icon="ti-users"
                label={iouKind === 'lent' ? 'Lent' : 'Borrowed'}
                active={showIouPanel || iouPersonName.trim().length > 0}
                accent={accent}
                onPress={() => setShowIouPanel((v) => !v)}
              />
            </View>

            {/* Tags panel — mirrors `ExpenseForm`'s: search/create input + Set Aside toggle for a brand-new
            tag, frequent tags (top-5 by usage), and startsWith suggestions while typing. */}
            {showTags && (
              <View className="rounded-xl border border-theme bg-surface-3 p-3 gap-2">
                <Text className="text-xs font-medium text-secondary">Tags (optional)</Text>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <RNTextInput
                      value={tagInput}
                      onChangeText={handleTagInputChange}
                      placeholder="Search or create a tag"
                      placeholderTextColor={theme.textTertiary}
                      className="bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm"
                      style={{ borderColor: theme.border }}
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
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-1">
                      Frequent
                    </Text>
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
              </View>
            )}

            {/* Lent / Borrowed panel — bulk-shared across every checked occurrence: one person, applied to
            each transaction's own amount/date at commit time. Visibility now toggled by the
            `ExtraCircle` icon above, same as `ExpenseForm`'s own IOU panel. */}
            {showIouPanel && (
              <View
                className="rounded-xl border p-3 gap-2"
                style={{ borderColor: theme.border, backgroundColor: theme.surfaceTertiary }}
              >
                <RNTextInput
                  value={iouPersonName}
                  onChangeText={setIouPersonName}
                  placeholder="Person's name"
                  placeholderTextColor={theme.textTertiary}
                  className="bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm"
                  style={{ borderColor: theme.border }}
                />
                <Text className="text-xs text-tertiary">
                  {iouKind === 'lent'
                    ? `Adds a they-owe-you entry to this person's ledger for each of the ${checkedRows.length} checked transactions.`
                    : `Adds a you-owe-them entry to this person's ledger for each of the ${checkedRows.length} checked transactions.`}
                </Text>
                {iouMatches.length > 0 && (
                  <View className="flex-row flex-wrap gap-1">
                    {iouMatches.map((p) => (
                      <Button key={p.id} variant="secondary" size="sm" onPress={() => setIouPersonName(p.name)}>
                        {p.name}
                      </Button>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </Modal>

      {/* Category picker — nested modal, above the bulk-categorize form (RN Modals stack in mount
        order), same reuse as `ExpenseForm.tsx`'s statement-preset category tile. Select-only
        (`manager` omitted) — bulk-categorize never needs category creation/editing, only picking
        an existing one. */}
      {showCategoryPicker && (
        <CategoryPickerModal
          type={pickerType}
          categories={categories}
          selectedId={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}
    </>
  );
}
