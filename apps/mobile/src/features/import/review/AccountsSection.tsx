import { useMemo, useState, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Button, SelectInput, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, AccountType } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type {
  AccountResolutionOrSkip,
  AccountActionOrSkip,
  CardAccountMergeSuggestion
} from '@/core/import/importAccountResolution';
import type { RowTriage } from '../useImport';
import { suggestAccountMerges } from './accountMergeSuggestion';
import { Pill } from './Pill';

/** Same border-notched-label wrapper CategoryTile uses — label stays visible on the field's top border
 *  instead of a separate label row or a placeholder that vanishes once a value is set. */
function BorderLabelField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="relative" style={{ paddingTop: 8 }}>
      <View className="absolute left-2.5 px-1 bg-surface rounded z-10" style={{ top: -1 }}>
        <Text className="text-[9px] font-semibold text-tertiary">{label}</Text>
      </View>
      {children}
    </View>
  );
}

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
   *  sharing a Bank Name with another resolution. Visually distinct from the two existing merge types
   *  above (info-blue credit-card icon, not the green ✦ sparkle) since it's a different signal (shared
   *  bank identity + card type), not "these names look alike". */
  cardMergeSuggestions?: CardAccountMergeSuggestion[];
  onAcceptCardMerge?: (cardSourceName: string, targetSourceName: string, paymentMode: string) => void;
  onDismissCardMerge?: (cardSourceName: string) => void;
  /** Accepted card→account merges (code-review fix), keyed by the card's own source name, valued by its
   *  target's — see `useImport.ts`'s `cardMergeTargets` doc comment. When a row's sourceName is a key
   *  here, its `suggestion` (already live-mirrored from the target by `effectiveAccountResolutions`) is
   *  shown as a simplified read-only "merged into X" indicator instead of the normal editable kind-
   *  dropdown/conditional fields — editing THIS row's own fields would silently have no effect (the
   *  mirror always wins while merged), so those controls are never shown for it in the first place. */
  cardMergeTargets?: Map<string, string>;
  onUnmergeCardAccount?: (cardSourceName: string) => void;
  /** Restricts which rows are actually RENDERED to just this set of source names (2026-08-14, manual-
   *  testing gap #2 — Accounts stage's new Needs Review/Ready/Skipped bucket grouping). Merge-suggestion
   *  detection (`mergeSuggestions`/`cardMergeSuggestions`) deliberately still considers the FULL
   *  `accountResolutions` list regardless — a same-file merge pair can legitimately span two different
   *  buckets (e.g. one side already touched, one not), and filtering the detection input itself would
   *  silently miss those pairs. Omit to render every row (unchanged behavior). */
  onlyRenderSourceNames?: Set<string>;
  /** Source names the user has explicitly acted on (2026-08-14, manual-testing gap #2) — see
   *  `useImport.ts`'s `accountTouchedSourceNames` doc comment. Drives the "Looks good, use this"
   *  shortcut below; omit both this and `onAcknowledgeAccount` to hide it entirely (unchanged
   *  behavior). */
  touchedSourceNames?: Set<string>;
  onAcknowledgeAccount?: (sourceName: string) => void;
}

/** RN port of apps/web-react/src/features/import/review/AccountsSection.tsx. Section 1 of the review
 *  screen — one dense row per distinct source account name, or (when the file has no account column)
 *  the existing single-account-picker fallback. */
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
  onAcknowledgeAccount
}: AccountsSectionProps) {
  const theme = useThemeColors();
  const [wantNewAccount, setWantNewAccount] = useState(false);
  const [dismissedMerges, setDismissedMerges] = useState<Set<string>>(new Set());
  const [dismissedFuzzyMatches, setDismissedFuzzyMatches] = useState<Set<string>>(new Set());
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

  function acceptMerge(sourceA: string, sourceB: string, mergedName: string) {
    const aRes = accountResolutions.find((r) => r.sourceName === sourceA);
    const existingType = aRes?.suggestion.kind === 'create' ? aRes.suggestion.suggestedType : 'bank';
    onUpdateAccount(sourceA, { kind: 'create', suggestedName: mergedName, suggestedType: existingType });
    onUpdateAccount(sourceB, { kind: 'create', suggestedName: mergedName, suggestedType: existingType });
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
        const fuzzy =
          r.suggestion.kind === 'create' && !dismissedFuzzyMatches.has(r.sourceName) ? r.fuzzyExistingMatch : undefined;
        const cardMerge = cardMergeSuggestions.find((c) => c.cardSourceName === r.sourceName);
        const mergedIntoName = cardMergeTargets?.get(r.sourceName);

        // Same 3-way vocabulary as CategoryTile: an outstanding merge/fuzzy suggestion not yet
        // accepted-or-dismissed is a real pending decision, so it counts as 'attention' even though
        // resolveAccounts always pre-fills a valid default. An already-merged card is always 'ready' —
        // there's nothing left pending on its own row (it fully tracks its target).
        const hasPendingSuggestion = !mergedIntoName && (!!isFirstOfMerge || !!fuzzy || !!cardMerge);
        const allDuplicate = !!stats && stats.ready === 0 && stats.attention === 0 && stats.duplicate > 0;
        const isSkipped = r.suggestion.kind === 'skip';
        const status: 'ready' | 'attention' | 'duplicate' | 'skipped' = isSkipped
          ? 'skipped'
          : hasPendingSuggestion
            ? 'attention'
            : allDuplicate
              ? 'duplicate'
              : 'ready';
        const statusColor =
          status === 'attention'
            ? theme.warning
            : status === 'duplicate' || status === 'skipped'
              ? theme.neutral
              : theme.success;

        const kindOptions = [
          { value: 'existing', label: 'Map existing' },
          { value: 'create', label: 'New account' },
          { value: 'skip', label: 'Skip this account' }
        ];

        return (
          <View
            key={r.sourceName}
            className="rounded-xl overflow-hidden p-3 gap-2"
            style={{
              backgroundColor: tint(statusColor, status === 'ready' ? 10 : 20),
              borderWidth: 1.5,
              borderColor: statusColor
            }}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-xs font-bold text-primary flex-1" numberOfLines={1}>
                {isFirstOfMerge ? `"${merge.sourceA}" & "${merge.sourceB}"` : `"${r.sourceName}"`}
              </Text>
              <Text className="text-[10.5px] text-tertiary flex-shrink-0">{r.count} rows</Text>
            </View>

            {mergedIntoName ? (
              // Already merged (code-review fix) — a simplified read-only indicator + Unmerge action,
              // never this row's own editable kind/name fields (editing them would silently have no
              // effect while `effectiveAccountResolutions` keeps live-mirroring the target — see
              // `useImport.ts`'s `cardMergeTargets` doc comment).
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-1.5 flex-1">
                  <Icon name="ti-link" size={12} color={theme.success} />
                  <Text
                    className="text-[10.5px] font-semibold flex-1"
                    style={{ color: theme.success }}
                    numberOfLines={1}
                  >
                    Merged into &quot;{mergedIntoName}&quot;
                  </Text>
                </View>
                <Pill onPress={() => onUnmergeCardAccount?.(r.sourceName)}>Unmerge</Pill>
              </View>
            ) : (
              <>
                {isFirstOfMerge && (
                  <>
                    <View className="flex-row items-center gap-1">
                      <Text className="text-[10px]" style={{ color: theme.success }}>
                        ✦ Same account, written two ways?
                      </Text>
                    </View>
                    <View className="flex-row gap-1.5 flex-wrap">
                      <Pill active onPress={() => acceptMerge(merge.sourceA, merge.sourceB, merge.mergedName)}>
                        Merge → &quot;{merge.mergedName}&quot;
                      </Pill>
                      <Pill
                        onPress={() =>
                          setDismissedMerges((prev) => new Set(prev).add(`${merge.sourceA}|${merge.sourceB}`))
                        }
                      >
                        Keep separate
                      </Pill>
                    </View>
                  </>
                )}

                {fuzzy && (
                  <>
                    <View className="flex-row items-center gap-1">
                      <Text className="text-[10px]" style={{ color: theme.success }}>
                        ✦ Same account, written differently?
                      </Text>
                    </View>
                    <View className="flex-row gap-1.5 flex-wrap">
                      <Pill
                        active
                        onPress={() => {
                          onUpdateAccount(r.sourceName, {
                            kind: 'existing',
                            accountId: fuzzy.accountId,
                            accountName: fuzzy.accountName
                          });
                          setDismissedFuzzyMatches((prev) => new Set(prev).add(r.sourceName));
                        }}
                      >
                        Merge → &quot;{fuzzy.accountName}&quot;
                      </Pill>
                      <Pill onPress={() => setDismissedFuzzyMatches((prev) => new Set(prev).add(r.sourceName))}>
                        Keep separate
                      </Pill>
                    </View>
                  </>
                )}

                {/* Card→account merge suggestion (2026-08-14, redesign doc §9.7) — deliberately a
                 *  DIFFERENT visual (info-blue credit-card icon, not the green ✦ used above) since the
                 *  signal here is "shares a Bank Name + is a card row", not name-similarity. Independent
                 *  per card — no bulk "merge all cards on this bank" (confirmed 2026-08-14,
                 *  post-mockup-review). */}
                {cardMerge && (
                  <>
                    <View className="flex-row items-center gap-1.5">
                      <Icon name="ti-credit-card" size={12} color={theme.info} />
                      <Text className="text-[10px]" style={{ color: theme.info }}>
                        Looks like a card on your &quot;{cardMerge.targetSourceName}&quot; account?
                      </Text>
                    </View>
                    <View className="flex-row gap-1.5 flex-wrap">
                      <Pill
                        active
                        onPress={() =>
                          onAcceptCardMerge?.(
                            cardMerge.cardSourceName,
                            cardMerge.targetSourceName,
                            cardMerge.paymentMode
                          )
                        }
                      >
                        Merge → &quot;{cardMerge.targetSourceName}&quot;
                      </Pill>
                      <Pill onPress={() => onDismissCardMerge?.(cardMerge.cardSourceName)}>
                        Keep as separate account
                      </Pill>
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
                  </>
                )}

                {/* Kind dropdown — pill-styled, same treatment as CategoryTile's Row 2 */}
                <SelectInput
                  value={r.suggestion.kind}
                  options={kindOptions}
                  triggerClassName="!rounded-full !py-1.5 justify-center"
                  onChange={(kind) => {
                    if (kind === 'create') {
                      onUpdateAccount(r.sourceName, {
                        kind: 'create',
                        suggestedName: r.sourceName,
                        suggestedType: 'bank'
                      });
                    } else if (kind === 'skip') {
                      onUpdateAccount(r.sourceName, { kind: 'skip' });
                    } else {
                      const first = accounts[0];
                      onUpdateAccount(r.sourceName, {
                        kind: 'existing',
                        accountId: first?.id ?? '',
                        accountName: first?.name ?? ''
                      });
                    }
                  }}
                />

                {/* "Skip this account" (2026-08-14, manual-testing gap #1) — excludes this source
                 *  account and every one of its rows from the import entirely; never needs a category
                 *  resolved, since nothing from it will ever be written. */}
                {isSkipped && (
                  <View
                    className="rounded-lg px-2 py-1.5 flex-row items-center gap-1.5"
                    style={{ backgroundColor: tint(theme.textTertiary, 10) }}
                  >
                    <Icon name="ti-player-skip-forward" size={11} color={theme.textTertiary} />
                    <Text className="text-[9.5px] text-tertiary flex-1">
                      This account&apos;s {r.count} row{r.count !== 1 ? 's' : ''} will be excluded from the import.
                    </Text>
                  </View>
                )}

                {/* "Looks good, use this" (2026-08-14, manual-testing gap #2) — accepts an unconfirmed
                 *  'create' suggestion reviewed-and-accepted-as-is, without editing any field, so it can
                 *  move out of the Accounts stage's new "Needs Review" bucket. Mirrors
                 *  `CategoryResolutionRow`'s identical shortcut. */}
                {r.suggestion.kind === 'create' &&
                  touchedSourceNames &&
                  onAcknowledgeAccount &&
                  !touchedSourceNames.has(r.sourceName) && (
                    <Pill onPress={() => onAcknowledgeAccount(r.sourceName)}>Looks good, use this</Pill>
                  )}

                {/* Conditional fields — border-notched labels, same convention as CategoryTile's Row 3 */}
                {r.suggestion.kind === 'existing' && (
                  <BorderLabelField label="Existing account">
                    <SelectInput
                      value={r.suggestion.accountId}
                      onChange={(v) => {
                        const a = accounts.find((x) => x.id === v);
                        onUpdateAccount(r.sourceName, { kind: 'existing', accountId: v, accountName: a?.name ?? v });
                      }}
                      options={accountOptions}
                    />
                  </BorderLabelField>
                )}
                {r.suggestion.kind === 'create' && (
                  <View className="flex-row gap-2">
                    <View style={{ flex: 2 }}>
                      <BorderLabelField label="Type">
                        <SelectInput
                          value={r.suggestion.suggestedType}
                          onChange={(v) =>
                            onUpdateAccount(r.sourceName, {
                              kind: 'create',
                              suggestedName: (r.suggestion as { suggestedName: string }).suggestedName,
                              suggestedType: v as AccountType
                            })
                          }
                          options={ACCOUNT_TYPE_OPTIONS}
                        />
                      </BorderLabelField>
                    </View>
                    <View style={{ flex: 3 }}>
                      <BorderLabelField label="New account name">
                        <TextInput
                          value={r.suggestion.suggestedName}
                          onChange={(v) =>
                            onUpdateAccount(r.sourceName, {
                              kind: 'create',
                              suggestedName: v,
                              suggestedType: (r.suggestion as { suggestedType: AccountType }).suggestedType
                            })
                          }
                        />
                      </BorderLabelField>
                    </View>
                  </View>
                )}
              </>
            )}

            {stats && (
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
            )}
          </View>
        );
      })}
    </View>
  );
}
