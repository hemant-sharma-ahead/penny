import { useMemo, useState, type ReactNode } from 'react';
import { Button, SelectInput, TextInput } from '@/components/ui';
import { STATUS, tint } from '@/lib/statusColors';
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
    <div className="relative pt-[7px]">
      <span className="absolute -top-0.5 left-2.5 px-1 text-[9px] font-semibold text-tertiary bg-surface rounded z-10">
        {label}
      </span>
      {children}
    </div>
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

/** Section 1 of the review screen — one dense row per distinct source account name, or (when the file
 *  has no account column) the existing single-account-picker fallback. See the approved mockup's
 *  "dense pill-row Accounts list" structure. */
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
    const existingType =
      accountResolutions.find((r) => r.sourceName === sourceA)?.suggestion.kind === 'create'
        ? (accountResolutions.find((r) => r.sourceName === sourceA)?.suggestion as { suggestedType: AccountType })
            .suggestedType
        : 'bank';
    onUpdateAccount(sourceA, { kind: 'create', suggestedName: mergedName, suggestedType: existingType });
    onUpdateAccount(sourceB, { kind: 'create', suggestedName: mergedName, suggestedType: existingType });
    setDismissedMerges((prev) => new Set(prev).add(`${sourceA}|${sourceB}`));
  }

  if (noAccountColumn) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-tertiary leading-relaxed">
          This file doesn't track which account each row belongs to — pick one account for all imported transactions.
        </p>
        {!wantNewAccount ? (
          <>
            <SelectInput
              value={singleAccountId ?? ''}
              onChange={(v) => setSingleAccountId(v)}
              options={accountOptions}
              placeholder="Choose an account"
            />
            <Button variant="ghost" size="sm" onClick={() => setWantNewAccount(true)}>
              + Create a new account instead
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
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
            <Button variant="ghost" size="sm" onClick={() => setWantNewAccount(false)}>
              Use an existing account instead
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
        // resolveAccounts always pre-fills a valid default (unlike categories, an account is never
        // stuck on a bare "Choose…" placeholder).
        const hasPendingSuggestion = !!isFirstOfMerge || !!fuzzy;
        const allDuplicate = !!stats && stats.ready === 0 && stats.attention === 0 && stats.duplicate > 0;
        const status: 'ready' | 'attention' | 'duplicate' = hasPendingSuggestion
          ? 'attention'
          : allDuplicate
            ? 'duplicate'
            : 'ready';
        const statusColor =
          status === 'attention' ? STATUS.warning : status === 'duplicate' ? STATUS.neutral : STATUS.success;

        const kindOptions = [
          { value: 'existing', label: 'Map existing' },
          { value: 'create', label: 'New account' }
        ];

        return (
          <div
            key={r.sourceName}
            className="rounded-xl overflow-hidden p-3 flex flex-col gap-2"
            style={{
              backgroundColor: tint(statusColor, status === 'ready' ? 10 : 20),
              border: `1.5px solid ${statusColor}`
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-primary truncate">
                {isFirstOfMerge ? `"${merge.sourceA}" & "${merge.sourceB}"` : `"${r.sourceName}"`}
              </span>
              <span className="text-[10.5px] text-tertiary flex-shrink-0">{r.count} rows</span>
            </div>

            {isFirstOfMerge && (
              <>
                <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
                  <i className="ti ti-sparkles" aria-hidden="true" /> Same account, written two ways?
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  <Pill active onClick={() => acceptMerge(merge.sourceA, merge.sourceB, merge.mergedName)}>
                    Merge &rarr; &quot;{merge.mergedName}&quot;
                  </Pill>
                  <Pill
                    onClick={() => setDismissedMerges((prev) => new Set(prev).add(`${merge.sourceA}|${merge.sourceB}`))}
                  >
                    Keep separate
                  </Pill>
                </div>
              </>
            )}

            {fuzzy && (
              <>
                <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
                  <i className="ti ti-sparkles" aria-hidden="true" /> Same account, written differently?
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  <Pill
                    active
                    onClick={() => {
                      onUpdateAccount(r.sourceName, {
                        kind: 'existing',
                        accountId: fuzzy.accountId,
                        accountName: fuzzy.accountName
                      });
                      setDismissedFuzzyMatches((prev) => new Set(prev).add(r.sourceName));
                    }}
                  >
                    Merge &rarr; &quot;{fuzzy.accountName}&quot;
                  </Pill>
                  <Pill onClick={() => setDismissedFuzzyMatches((prev) => new Set(prev).add(r.sourceName))}>
                    Keep separate
                  </Pill>
                </div>
              </>
            )}

            {/* Kind dropdown — pill-styled, same treatment as CategoryTile's Row 2 */}
            <SelectInput
              value={r.suggestion.kind}
              options={kindOptions}
              triggerClassName="!rounded-full !py-1.5 !text-xs !font-semibold text-center"
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
              <div className="grid grid-cols-[2fr_3fr] gap-2">
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
              </div>
            )}

            {stats && (
              <p className="text-[10.5px] text-secondary">
                <b style={{ color: 'var(--color-success)', fontWeight: 700 }}>{stats.ready} ready</b>
                {stats.attention > 0 && (
                  <>
                    <span className="text-tertiary mx-1.5">·</span>
                    <b style={{ color: 'var(--color-warning)', fontWeight: 700 }}>{stats.attention} attention</b>
                  </>
                )}
                {stats.duplicate > 0 && (
                  <>
                    <span className="text-tertiary mx-1.5">·</span>
                    <b className="text-tertiary" style={{ fontWeight: 700 }}>
                      {stats.duplicate} duplicate
                    </b>
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
