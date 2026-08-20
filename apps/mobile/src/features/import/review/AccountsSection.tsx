import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Button, SelectInput, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { BankLogo } from '~/components/shared/BankLogo';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, AccountType } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type {
  AccountResolutionOrSkip,
  AccountActionOrSkip,
  CardAccountMergeSuggestion
} from '@/core/import/importAccountResolution';
import { ACCOUNT_TYPE_META } from '@/core/accounts/meta';
import type { AccountInput } from '~/hooks/useAccountForm';
import type { RowTriage } from '../useImport';
import { suggestAccountMerges } from './accountMergeSuggestion';
import { Pill } from './Pill';

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'wallet', label: 'Wallet' }
];

interface AccountsSectionProps {
  accountResolutions: AccountResolutionOrSkip[];
  accounts: Account[];
  noAccountColumn: boolean;
  singleAccountId: string | null;
  setSingleAccountId: (id: string) => void;
  singleAccountCreate: { name: string; type: AccountType } | null;
  setSingleAccountCreate: (v: { name: string; type: AccountType } | null) => void;
  onUpdateAccount: (sourceName: string, suggestion: AccountActionOrSkip) => void;
  parsedRows: ParsedRow[];
  rowTriage: RowTriage[];
  /** Card→account merge suggestions (2026-08-14, redesign doc §9.7, Issue #9) — a debit/credit-card row
   *  sharing a Bank Name with another resolution. Visually distinct from the same-file/fuzzy suggestions
   *  (info-blue credit-card icon) since it's a different signal (shared bank identity + card type). */
  cardMergeSuggestions?: CardAccountMergeSuggestion[];
  onAcceptCardMerge?: (cardSourceName: string, targetSourceName: string, paymentMode: string) => void;
  onDismissCardMerge?: (cardSourceName: string) => void;
  /** Accepted card→account merges, keyed by the card's own source name, valued by its target's — see
   *  `useImport.ts`'s `cardMergeTargets` doc comment. A row whose sourceName is a key here shows a
   *  simplified read-only "merged into X" indicator instead of the normal paired match card. */
  cardMergeTargets?: Map<string, string>;
  onUnmergeCardAccount?: (cardSourceName: string) => void;
  /** Restricts which rows are actually RENDERED to just this set of source names (2026-08-14, manual-
   *  testing gap #2 — Accounts stage's Needs Review/Ready/Skipped bucket grouping). Merge-suggestion
   *  detection (`mergeSuggestions`/`cardMergeSuggestions`) deliberately still considers the FULL
   *  `accountResolutions` list regardless — a same-file merge pair can legitimately span two different
   *  buckets. Omit to render every row (unchanged behavior). */
  onlyRenderSourceNames?: Set<string>;
  /** Source names the user has explicitly CONFIRMED via the paired card's Confirm button (2026-08-20,
   *  item 41 flow redesign) — see `useImport.ts`'s `accountTouchedSourceNames` doc comment. Every row
   *  needs this now, not just an unconfirmed 'create' guess. */
  touchedSourceNames?: Set<string>;
  onAcknowledgeAccount?: (sourceName: string) => void;
  /** Creates a real `Account` immediately (2026-08-20, item 41 flow redesign) — backs the same-file
   *  merge-accept action below (`acceptMerge`), which used to defer to a `'create'` suggestion resolved
   *  at commit time; now creates the merged account right away and resolves both source rows straight to
   *  `'existing'`, since a per-row `'create'` kind no longer exists in the redesigned UI. See
   *  `useImport.ts`'s `createAccount` doc comment. */
  createAccount: (data: AccountInput, editing: Account | null) => Promise<Account>;
}

/**
 * RN port of apps/web-react/src/features/import/review/AccountsSection.tsx. Section 1 of the review
 * screen — one paired match-card per distinct source account name, or (when the file has no account
 * column) the existing single-account-picker fallback.
 *
 * 2026-08-20, item 41 flow redesign (docs/mockups/proposals/fourth-batch-redesigns-v5.html §2) — the
 * per-row "New account" kind option is gone entirely (a new account is only ever created via the
 * Accounts stage's top "+ Create Account" button, or immediately by a same-file merge-accept below); each
 * row is now `DuplicatesBucket.tsx`'s exact paired-card visual language (left plain `bg-surface-2` CSV
 * name, right `border-l border-dashed` matched-account dropdown) instead of a kind-pill + conditional
 * fields. Confirm is now a REQUIRED explicit tap for every row, including a confident 'existing' guess —
 * a deliberate behavior change from the prior auto-ready-on-pick model (see `useImport.ts`'s
 * `accountTouchedSourceNames` doc comment). The old dedicated "same account, written differently?" fuzzy-
 * match banner is folded into this new card directly — `r.fuzzyExistingMatch` now PRE-FILLS the matched-
 * account dropdown (still requiring the same Confirm tap) rather than needing its own separate accept
 * banner; the same-file merge banner (`isFirstOfMerge`) and the card→account merge banner (`cardMerge`)
 * are unrelated suggestion sources (spanning two rows, or requiring a distinct payment-mode side effect)
 * and are kept exactly as before, layered above the paired card.
 */
export function AccountsSection({
  accountResolutions,
  accounts,
  noAccountColumn,
  singleAccountId,
  setSingleAccountId,
  singleAccountCreate,
  setSingleAccountCreate,
  onUpdateAccount,
  parsedRows,
  rowTriage,
  cardMergeSuggestions = [],
  onAcceptCardMerge,
  onDismissCardMerge,
  cardMergeTargets,
  onUnmergeCardAccount,
  onlyRenderSourceNames,
  touchedSourceNames,
  onAcknowledgeAccount,
  createAccount
}: AccountsSectionProps) {
  const theme = useThemeColors();
  const [wantNewAccount, setWantNewAccount] = useState(false);
  const [dismissedMerges, setDismissedMerges] = useState<Set<string>>(new Set());
  const [openPickerKey, setOpenPickerKey] = useState<string | null>(null);
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  const statsByAccount = useMemo(() => {
    const stats = new Map<string, { ready: number; attention: number; duplicate: number }>();
    parsedRows.forEach((row, i) => {
      if (!row.account) return;
      const bucket = stats.get(row.account) ?? { ready: 0, attention: 0, duplicate: 0 };
      const triage = rowTriage[i] ?? 'ready';
      bucket[triage]++;
      stats.set(row.account, bucket);
    });
    return stats;
  }, [parsedRows, rowTriage]);

  const mergeSuggestions = useMemo(
    () => suggestAccountMerges(accountResolutions.map((r) => r.sourceName)),
    [accountResolutions]
  );

  /** Resolves a card-merge target's raw CSV `sourceName` (`CardAccountMergeSuggestion.targetSourceName`,
   *  or `cardMergeTargets`' live pointer — both are deliberately the target row's RAW source name, per
   *  `suggestCardAccountMerges()`'s 2026-08-14 design decision, "show regardless of the bank row's own
   *  resolution state") to that row's CURRENT resolved display name, when it has one — read at render
   *  time from `accountResolutions` (this component's live, possibly-just-updated prop) rather than
   *  baked into the suggestion object, since the target row's resolution can change as the user makes
   *  decisions elsewhere in this same list. Falls back to the raw source name exactly as before when the
   *  target is still unresolved (or was skipped) — a real bug fix: a target row that's already an
   *  'existing' match (possibly via fuzzy-matching to a differently-spelled real account, e.g. CSV
   *  "HDFC-x8112" → real "HDFC XX8112") used to show the raw CSV name in the merge banner/label instead
   *  of the real account name. */
  function resolveMergeTargetDisplayName(sourceName: string): string {
    const target = accountResolutions.find((r) => r.sourceName === sourceName);
    if (!target) return sourceName;
    if (target.suggestion.kind === 'existing') return target.suggestion.accountName;
    if (target.suggestion.kind === 'create') return target.suggestion.suggestedName;
    return sourceName;
  }

  /** Accepts a same-file "written two ways" merge suggestion — 2026-08-20, item 41 flow redesign: since
   *  a per-row 'create' kind no longer exists, this now creates the merged account for real, IMMEDIATELY
   *  (via the shared `createAccount`, same as the "+ Create Account" button), and resolves BOTH source
   *  rows straight to 'existing' pointing at it — never leaves either row sitting in a half-resolved
   *  'create' state with no way to reach Confirm. */
  async function acceptMerge(sourceA: string, sourceB: string, mergedName: string) {
    const aRes = accountResolutions.find((r) => r.sourceName === sourceA);
    const existingType = aRes?.suggestion.kind === 'create' ? aRes.suggestion.suggestedType : 'bank';
    const meta = ACCOUNT_TYPE_META[existingType];
    const record = await createAccount(
      {
        name: mergedName,
        type: existingType,
        openingBalance: 0,
        color: meta.color,
        icon: meta.icon,
        includeInNetWorth: existingType !== 'credit_card'
      },
      null
    );
    onUpdateAccount(sourceA, { kind: 'existing', accountId: record.id, accountName: record.name });
    onUpdateAccount(sourceB, { kind: 'existing', accountId: record.id, accountName: record.name });
    setDismissedMerges((prev) => new Set(prev).add(`${sourceA}|${sourceB}`));
  }

  if (noAccountColumn) {
    return (
      <View className="gap-2">
        <Text className="text-xs text-tertiary leading-relaxed">
          This file doesn&apos;t track which account each row belongs to — pick one account for all imported
          transactions.
        </Text>
        {!wantNewAccount ? (
          <>
            <SelectInput
              value={singleAccountId ?? ''}
              onChange={(v) => setSingleAccountId(v)}
              options={accountOptions}
              placeholder="Choose an account"
            />
            <Button variant="ghost" size="sm" onPress={() => setWantNewAccount(true)}>
              + Create a new account instead
            </Button>
          </>
        ) : (
          <View className="gap-2">
            <TextInput
              label="New account name"
              value={singleAccountCreate?.name ?? ''}
              onChange={(v) => setSingleAccountCreate({ name: v, type: singleAccountCreate?.type ?? 'bank' })}
            />
            <SelectInput
              label="Type"
              value={singleAccountCreate?.type ?? 'bank'}
              onChange={(v) =>
                setSingleAccountCreate({ name: singleAccountCreate?.name ?? '', type: v as AccountType })
              }
              options={ACCOUNT_TYPE_OPTIONS}
            />
            <Button variant="ghost" size="sm" onPress={() => setWantNewAccount(false)}>
              Use an existing account instead
            </Button>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="gap-2">
      {accountResolutions.map((r) => {
        if (onlyRenderSourceNames && !onlyRenderSourceNames.has(r.sourceName)) return null;
        const stats = statsByAccount.get(r.sourceName);
        const merge = mergeSuggestions.find(
          (m) =>
            (m.sourceA === r.sourceName || m.sourceB === r.sourceName) &&
            !dismissedMerges.has(`${m.sourceA}|${m.sourceB}`)
        );
        const isFirstOfMerge = merge && merge.sourceA === r.sourceName;
        const cardMerge = cardMergeSuggestions.find((c) => c.cardSourceName === r.sourceName);
        const mergedIntoName = cardMergeTargets?.get(r.sourceName);
        const isSkipped = r.suggestion.kind === 'skip';

        // Assigned to a local const first — TS control-flow narrowing on `r.suggestion.kind` doesn't
        // survive into the `.find()` callback's nested closure otherwise (a known TS limitation; a plain
        // local variable's narrowed type does survive).
        const rowSuggestion = r.suggestion;
        const matchedAccount =
          rowSuggestion.kind === 'existing' ? accounts.find((a) => a.id === rowSuggestion.accountId) : undefined;
        // Smart best-guess prefill (2026-08-20) — folds the old separate "same account, written
        // differently?" banner directly into the paired card: a normalized-fuzzy match against a real
        // existing account, shown as the dropdown's pre-filled value even though nothing's been picked
        // yet. Still requires the same Confirm tap as any other pick — never auto-applied.
        const fuzzyMatch = rowSuggestion.kind === 'create' ? r.fuzzyExistingMatch : undefined;
        const fuzzyGuessAccount =
          !matchedAccount && fuzzyMatch ? accounts.find((a) => a.id === fuzzyMatch.accountId) : undefined;
        const displayedAccount = matchedAccount ?? fuzzyGuessAccount;
        const confirmed = !!matchedAccount && !!touchedSourceNames?.has(r.sourceName);

        function handleConfirm() {
          if (!displayedAccount) return;
          if (!matchedAccount) {
            onUpdateAccount(r.sourceName, {
              kind: 'existing',
              accountId: displayedAccount.id,
              accountName: displayedAccount.name
            });
          }
          // 2026-08-20, on-device feedback — Confirm now absorbs what the removed "Keep as separate
          // account" button used to do: resolving this row via the dropdown (its own Confirm) already
          // achieves "don't merge with the card-suggested account", so explicitly dismiss any pending
          // card-merge suggestion here too, rather than leaving it to linger/reappear for this row.
          if (cardMerge) {
            onDismissCardMerge?.(cardMerge.cardSourceName);
          }
          onAcknowledgeAccount?.(r.sourceName);
        }

        function handleSkip() {
          setOpenPickerKey(null);
          onUpdateAccount(r.sourceName, { kind: 'skip' });
        }

        // "Map instead" (un-skip) — returns to the unmatched pick-required state rather than trying to
        // restore whatever suggestion existed before Skip was tapped (overwritten by then), so the user
        // always re-confirms a real pick rather than silently reviving a stale guess.
        function handleUnskip() {
          onUpdateAccount(r.sourceName, { kind: 'create', suggestedName: r.sourceName, suggestedType: 'bank' });
        }

        if (mergedIntoName) {
          // Already merged into another account's own resolution (code-review fix) — a simplified
          // read-only indicator + Unmerge action, never this row's own match card (editing it would
          // silently have no effect while `effectiveAccountResolutions` keeps live-mirroring the target).
          return (
            <View
              key={r.sourceName}
              className="rounded-xl border overflow-hidden bg-surface p-3 gap-2"
              style={{ borderColor: theme.success }}
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-xs font-bold text-primary flex-1" numberOfLines={1}>
                  &quot;{r.sourceName}&quot;
                </Text>
                <Text className="text-[10.5px] text-tertiary flex-shrink-0">{r.count} rows</Text>
              </View>
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-1.5 flex-1">
                  <Icon name="ti-link" size={12} color={theme.success} />
                  <Text
                    className="text-[10.5px] font-semibold flex-1"
                    style={{ color: theme.success }}
                    numberOfLines={1}
                  >
                    Merged into &quot;{resolveMergeTargetDisplayName(mergedIntoName)}&quot;
                  </Text>
                </View>
                <Pill onPress={() => onUnmergeCardAccount?.(r.sourceName)}>Unmerge</Pill>
              </View>
            </View>
          );
        }

        if (isSkipped) {
          return (
            <View
              key={r.sourceName}
              className="rounded-xl border overflow-hidden bg-surface"
              style={{ borderColor: theme.border }}
            >
              <View className="p-2.5 bg-surface-2">
                <Text className="text-[8.5px] font-extrabold uppercase tracking-wide text-tertiary">CSV account</Text>
                <Text className="text-xs font-bold text-primary mt-0.5" numberOfLines={1}>
                  {r.sourceName}
                </Text>
                <Text className="text-[9px] text-tertiary mt-0.5">{r.count} rows</Text>
              </View>
              <View
                className="flex-row items-center gap-1.5 px-2.5 py-2 border-t border-theme"
                style={{ backgroundColor: tint(theme.textTertiary, 10) }}
              >
                <Icon name="ti-player-skip-forward" size={12} color={theme.textTertiary} />
                <Text className="flex-1 text-[9.5px] text-tertiary">
                  This account&apos;s {r.count} row{r.count !== 1 ? 's' : ''} will be excluded from the import.
                </Text>
                <Pressable onPress={handleUnskip} hitSlop={6}>
                  <Text className="text-[9.5px] font-bold" style={{ color: theme.primary }}>
                    Map instead
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }

        return (
          <View
            key={r.sourceName}
            className="rounded-xl border overflow-hidden bg-surface"
            style={{ borderColor: confirmed ? theme.border : theme.warning }}
          >
            {isFirstOfMerge && (
              <View className="p-3 gap-2 border-b border-dashed border-theme">
                <Text className="text-[10px]" style={{ color: theme.success }}>
                  ✦ Same account, written two ways? &quot;{merge.sourceA}&quot; &amp; &quot;{merge.sourceB}&quot;
                </Text>
                <View className="flex-row gap-1.5 flex-wrap">
                  <Pill active onPress={() => void acceptMerge(merge.sourceA, merge.sourceB, merge.mergedName)}>
                    Merge → &quot;{merge.mergedName}&quot;
                  </Pill>
                  <Pill
                    onPress={() => setDismissedMerges((prev) => new Set(prev).add(`${merge.sourceA}|${merge.sourceB}`))}
                  >
                    Keep separate
                  </Pill>
                </View>
              </View>
            )}

            {/* Paired match card (2026-08-20, item 41 flow redesign) — DuplicatesBucket.tsx's exact
             *  visual language: left plain bg-surface-2 (CSV account), right border-l border-dashed
             *  (matched account, a bordered chevron-down pill). */}
            <View className="flex-row">
              <View className="flex-1 p-2.5 bg-surface-2">
                <Text className="text-[8.5px] font-extrabold uppercase tracking-wide text-tertiary">CSV account</Text>
                <Text className="text-xs font-bold text-primary mt-0.5" numberOfLines={1}>
                  {r.sourceName}
                </Text>
                <Text className="text-[9px] text-tertiary mt-0.5">{r.count} rows</Text>
              </View>
              <View className="flex-1 p-2.5 border-l border-dashed border-theme">
                <Text className="text-[8.5px] font-extrabold uppercase tracking-wide text-tertiary mb-1">
                  Matched account
                </Text>
                <Pressable
                  onPress={() => setOpenPickerKey((k) => (k === r.sourceName ? null : r.sourceName))}
                  className="flex-row items-center gap-1.5 rounded-lg border px-2 py-1.5"
                  style={{
                    borderColor: displayedAccount ? theme.border : theme.warning,
                    borderStyle: displayedAccount ? 'solid' : 'dashed',
                    backgroundColor: theme.surfaceTertiary
                  }}
                >
                  {displayedAccount ? (
                    <View
                      className="w-[18px] h-[18px] rounded-md items-center justify-center"
                      style={{ backgroundColor: displayedAccount.color }}
                    >
                      <BankLogo account={displayedAccount} size={10} color="#fff" />
                    </View>
                  ) : (
                    <View
                      className="w-[18px] h-[18px] rounded-md items-center justify-center border border-dashed"
                      style={{ borderColor: theme.textTertiary }}
                    >
                      <Icon name="ti-help-circle" size={10} color={theme.textTertiary} />
                    </View>
                  )}
                  <Text
                    className="flex-1 text-[10.5px] font-bold"
                    numberOfLines={1}
                    style={{ color: displayedAccount ? theme.textPrimary : theme.warning }}
                  >
                    {displayedAccount?.name ?? 'Choose account…'}
                  </Text>
                  <Icon name="ti-chevron-down" size={10} color={theme.textTertiary} />
                </Pressable>
              </View>
            </View>

            {openPickerKey === r.sourceName && (
              <View className="rounded-lg border border-theme overflow-hidden mx-2.5 mb-2.5">
                {accounts.length === 0 ? (
                  <Text className="text-xs text-tertiary p-2.5">
                    No accounts yet — use &quot;+ Create Account&quot; above.
                  </Text>
                ) : (
                  accounts.map((a, i) => (
                    <Pressable
                      key={a.id}
                      onPress={() => {
                        onUpdateAccount(r.sourceName, { kind: 'existing', accountId: a.id, accountName: a.name });
                        setOpenPickerKey(null);
                      }}
                      className="flex-row items-center gap-2 px-2.5 py-2"
                      style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.border }}
                    >
                      <View
                        className="w-[18px] h-[18px] rounded-md items-center justify-center"
                        style={{ backgroundColor: a.color }}
                      >
                        <BankLogo account={a} size={10} color="#fff" />
                      </View>
                      <Text className="flex-1 text-[10.5px] font-medium text-primary" numberOfLines={1}>
                        {a.name}
                      </Text>
                      {a.id === displayedAccount?.id && <Icon name="ti-check" size={12} color={theme.primary} />}
                    </Pressable>
                  ))
                )}
              </View>
            )}

            {/* Card→account merge suggestion (2026-08-14, redesign doc §9.7; repositioned 2026-08-20 per
             *  on-device feedback) — now sits below the paired card, above the action row, so the CSV/
             *  matched-account resolution is always seen before the merge offer. The old dedicated "Keep
             *  as separate account" pill is gone: the row's own Confirm action (below) already resolves
             *  this row to the picked/matched account instead of the merge target, and now explicitly
             *  dismisses this suggestion too (see `handleConfirm`) — so there's no separate dismiss button
             *  needed here. */}
            {cardMerge && (
              <View className="px-2.5 py-2 gap-1.5 border-t border-dashed border-theme">
                <View className="flex-row items-center gap-1.5">
                  <Icon name="ti-credit-card" size={12} color={theme.info} />
                  <Text className="text-[10px] flex-1" style={{ color: theme.info }}>
                    Looks like a card on your &quot;{resolveMergeTargetDisplayName(cardMerge.targetSourceName)}
                    &quot; account?
                  </Text>
                </View>
                <View
                  className="flex-row items-center gap-1.5 rounded-lg px-2 py-1.5"
                  style={{ backgroundColor: tint(theme.info, 12) }}
                >
                  <Icon name="ti-info-circle" size={11} color={theme.info} />
                  <Text className="text-[9.5px] flex-1" style={{ color: theme.info }}>
                    Merging sets this row&apos;s payment mode to {cardMerge.paymentMode} instead of creating a new
                    account
                  </Text>
                </View>
              </View>
            )}

            {confirmed ? (
              <View className="flex-row items-center justify-between px-2.5 py-2 border-t border-dashed border-theme">
                <View className="flex-row items-center gap-1.5">
                  <Icon name="ti-check" size={13} color={theme.success} />
                  <Text className="text-[10.5px] font-bold" style={{ color: theme.success }}>
                    Confirmed
                  </Text>
                </View>
                <Pressable onPress={handleSkip} hitSlop={6}>
                  <Text className="text-[10px] font-semibold" style={{ color: theme.textTertiary }}>
                    Skip
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="flex-row gap-2 px-2.5 py-2 border-t border-dashed border-theme">
                {/* 2026-08-20, on-device feedback — Skip on the left, Confirm next, and (when this row has
                 *  a pending card-merge suggestion) Merge to Confirm's right as a third action — no longer
                 *  its own separate button row under the banner. Uneven flex weights (not equal thirds) so
                 *  "Skip" isn't given more width than its short label needs while "Merge → '<name>'" (the
                 *  longest label in the row) gets the extra space instead of wrapping to a second line,
                 *  which would otherwise grow this row's height unevenly across the three buttons. */}
                <Button variant="secondary" size="sm" style={{ flex: cardMerge ? 0.7 : 1 }} onPress={handleSkip}>
                  Skip
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  style={{ flex: 1 }}
                  disabled={!displayedAccount}
                  onPress={handleConfirm}
                >
                  Confirm
                </Button>
                {cardMerge && (
                  <Button
                    variant="primary"
                    size="sm"
                    color={theme.info}
                    style={{ flex: 1.4 }}
                    onPress={() =>
                      onAcceptCardMerge?.(cardMerge.cardSourceName, cardMerge.targetSourceName, cardMerge.paymentMode)
                    }
                  >
                    Merge → &quot;{resolveMergeTargetDisplayName(cardMerge.targetSourceName)}&quot;
                  </Button>
                )}
              </View>
            )}

            {stats && (
              <View className="px-2.5 pb-2">
                <Text className="text-[10.5px] text-secondary">
                  <Text style={{ color: theme.success, fontWeight: '700' }}>{stats.ready} ready</Text>
                  {stats.attention > 0 && (
                    <>
                      <Text className="text-tertiary"> · </Text>
                      <Text style={{ color: theme.warning, fontWeight: '700' }}>{stats.attention} attention</Text>
                    </>
                  )}
                  {stats.duplicate > 0 && (
                    <>
                      <Text className="text-tertiary"> · </Text>
                      <Text className="text-tertiary" style={{ fontWeight: '700' }}>
                        {stats.duplicate} duplicate
                      </Text>
                    </>
                  )}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
