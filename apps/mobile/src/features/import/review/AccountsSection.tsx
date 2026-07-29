import { useMemo, useState, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Button, SelectInput, TextInput } from '~/components/ui';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, AccountType } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type { AccountResolution, AccountAction } from '@/core/import/importAccountResolution';
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
  accountResolutions: AccountResolution[];
  accounts: Account[];
  noAccountColumn: boolean;
  singleAccountId: string | null;
  setSingleAccountId: (id: string) => void;
  singleAccountCreate: { name: string; type: AccountType } | null;
  setSingleAccountCreate: (v: { name: string; type: AccountType } | null) => void;
  onUpdateAccount: (sourceName: string, suggestion: AccountAction) => void;
  parsedRows: ParsedRow[];
  rowTriage: RowTriage[];
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
  rowTriage
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
        const stats = statsByAccount.get(r.sourceName);
        const merge = mergeSuggestions.find(
          (m) =>
            (m.sourceA === r.sourceName || m.sourceB === r.sourceName) &&
            !dismissedMerges.has(`${m.sourceA}|${m.sourceB}`)
        );
        const isFirstOfMerge = merge && merge.sourceA === r.sourceName;
        const fuzzy =
          r.suggestion.kind === 'create' && !dismissedFuzzyMatches.has(r.sourceName) ? r.fuzzyExistingMatch : undefined;

        // Same 3-way vocabulary as CategoryTile: an outstanding merge/fuzzy suggestion not yet
        // accepted-or-dismissed is a real pending decision, so it counts as 'attention' even though
        // resolveAccounts always pre-fills a valid default.
        const hasPendingSuggestion = !!isFirstOfMerge || !!fuzzy;
        const allDuplicate = !!stats && stats.ready === 0 && stats.attention === 0 && stats.duplicate > 0;
        const status: 'ready' | 'attention' | 'duplicate' = hasPendingSuggestion
          ? 'attention'
          : allDuplicate
            ? 'duplicate'
            : 'ready';
        const statusColor =
          status === 'attention' ? theme.warning : status === 'duplicate' ? theme.neutral : theme.success;

        const kindOptions = [
          { value: 'existing', label: 'Map existing' },
          { value: 'create', label: 'New account' }
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
                    onPress={() => setDismissedMerges((prev) => new Set(prev).add(`${merge.sourceA}|${merge.sourceB}`))}
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

            {/* Kind dropdown — pill-styled, same treatment as CategoryTile's Row 2 */}
            <SelectInput
              value={r.suggestion.kind}
              options={kindOptions}
              triggerClassName="!rounded-full !py-1.5 justify-center"
              onChange={(kind) => {
                if (kind === 'create') {
                  onUpdateAccount(r.sourceName, { kind: 'create', suggestedName: r.sourceName, suggestedType: 'bank' });
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
