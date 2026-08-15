import { useMemo } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { Button } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, AccountType } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type {
  AccountResolutionOrSkip,
  AccountActionOrSkip,
  CardAccountMergeSuggestion
} from '@/core/import/importAccountResolution';
import type { RowTriage } from './useImport';
import { AccountsSection } from './review/AccountsSection';
import { BucketCard } from '~/components/shared/BucketCard';
import { useBucketExpansion } from '~/hooks/useBucketExpansion';

interface AccountsStageProps {
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
  cardMergeSuggestions: CardAccountMergeSuggestion[];
  onAcceptCardMerge: (cardSourceName: string, targetSourceName: string, paymentMode: string) => void;
  onDismissCardMerge: (cardSourceName: string) => void;
  /** Accepted card→account merges, keyed by card sourceName → target sourceName (code-review fix) —
   *  see `useImport.ts`'s `cardMergeTargets` doc comment. */
  cardMergeTargets: Map<string, string>;
  onUnmergeCardAccount: (cardSourceName: string) => void;
  /** Manual-testing gap #2 — drives the Needs Review/Ready split below. See `useImport.ts`'s
   *  `accountTouchedSourceNames` doc comment. */
  accountTouchedSourceNames: Set<string>;
  onAcknowledgeAccount: (sourceName: string) => void;
  accountsResolved: boolean;
  confirmedAccountCount: number;
  onNext: () => void;
}

type AccountBucketKey = 'needsReview' | 'ready' | 'skipped';

function bucketForAccount(
  r: AccountResolutionOrSkip,
  touchedSourceNames: Set<string>,
  cardMergeTargets: Map<string, string>
): AccountBucketKey {
  if (r.suggestion.kind === 'skip') return 'skipped';
  // A merged card fully tracks its target (see `cardMergeTargets`' own doc comment) — always decided,
  // regardless of whether IT was individually touched.
  if (cardMergeTargets.has(r.sourceName)) return 'ready';
  if (r.suggestion.kind === 'create' && !touchedSourceNames.has(r.sourceName)) return 'needsReview';
  return 'ready';
}

/**
 * New dedicated Accounts wizard stage (2026-08-14, CSV-import redesign Chunk A —
 * docs/plans/csv-expense-import-redesign.md §3/§9.7, mockup's "Accounts stage" section). Promotes
 * `AccountsSection.tsx`'s body out of `ReviewStep.tsx`'s nested accordion into its own full step —
 * same card visual as today, now the whole screen, plus the new card→account merge suggestion
 * (`cardMergeSuggestions`/`onAcceptCardMerge`/`onDismissCardMerge` — see `AccountsSection.tsx`'s own
 * doc comment for why it's visually distinct from the two existing merge types).
 *
 * Rows are grouped into Needs Review / Ready / Skipped bucket cards (2026-08-14, manual-testing gap
 * #2) — the same `BucketCard`/`useBucketExpansion` pattern Transactions stage already built, reused
 * here rather than a second bespoke implementation. `AccountsSection` itself still receives the FULL
 * `accountResolutions` list (merge-suggestion detection needs to see every row regardless of bucket —
 * see its own `onlyRenderSourceNames` doc comment) and is rendered once per bucket, each time scoped
 * down to just that bucket's own source names via that prop.
 *
 * "Continue" is gated on `anyAccountReady` — at least one account resolved (a 'skip' resolution counts
 * as immediately decided, same as 'existing' — manual-testing gap #1) — not on `accountsResolved`
 * (every account resolved), which was found to be wrong via real user testing 2026-08-15: unlike
 * Categories (no gate) and Transactions (blocks only when nothing at all is ready), Accounts had been
 * the sole "block until 100%" stage, with no argued rationale for the asymmetry and a write path that
 * already tolerates a mix of ready/not-ready accounts regardless.
 */
export function AccountsStage({
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
  cardMergeSuggestions,
  onAcceptCardMerge,
  onDismissCardMerge,
  cardMergeTargets,
  onUnmergeCardAccount,
  accountTouchedSourceNames,
  onAcknowledgeAccount,
  accountsResolved,
  confirmedAccountCount,
  onNext
}: AccountsStageProps) {
  const theme = useThemeColors();
  const sourceAccountCount = accountResolutions.length;

  const buckets = useMemo(() => {
    const needsReview: string[] = [];
    const ready: string[] = [];
    const skipped: string[] = [];
    for (const r of accountResolutions) {
      const bucket = bucketForAccount(r, accountTouchedSourceNames, cardMergeTargets);
      (bucket === 'needsReview' ? needsReview : bucket === 'ready' ? ready : skipped).push(r.sourceName);
    }
    return {
      needsReview: new Set(needsReview),
      ready: new Set(ready),
      skipped: new Set(skipped)
    };
  }, [accountResolutions, accountTouchedSourceNames, cardMergeTargets]);

  const defaultExpandedBucket: AccountBucketKey | null =
    buckets.needsReview.size > 0
      ? 'needsReview'
      : buckets.ready.size > 0
        ? 'ready'
        : buckets.skipped.size > 0
          ? 'skipped'
          : null;
  const { isExpanded, toggle } = useBucketExpansion<AccountBucketKey>(defaultExpandedBucket);

  /** "Continue" gate — loosened 2026-08-15 (real user report: blocking on `accountsResolved`, i.e.
   *  requiring EVERY account resolved, was wrong; Categories has no gate at all and Transactions only
   *  blocks when NOTHING is ready — Accounts was the sole "block until 100%" outlier, and the
   *  commit/write path already fully tolerates a mix of ready/not-ready accounts via
   *  `notReadyAccountSourceNames` — see `useImport.ts`'s `commitAndImport` doc comment). Only blocks
   *  when there is truly nothing to proceed with; a `noAccountColumn` file always has exactly one
   *  "account" so ready-or-not there collapses to the same check `accountsResolved` already does. */
  const anyAccountReady = noAccountColumn ? accountsResolved : buckets.ready.size > 0;

  function renderSection(sourceNames: Set<string>) {
    return (
      <AccountsSection
        accountResolutions={accountResolutions}
        accounts={accounts}
        noAccountColumn={noAccountColumn}
        singleAccountId={singleAccountId}
        setSingleAccountId={setSingleAccountId}
        singleAccountCreate={singleAccountCreate}
        setSingleAccountCreate={setSingleAccountCreate}
        onUpdateAccount={onUpdateAccount}
        parsedRows={parsedRows}
        rowTriage={rowTriage}
        cardMergeSuggestions={cardMergeSuggestions}
        onAcceptCardMerge={onAcceptCardMerge}
        onDismissCardMerge={onDismissCardMerge}
        cardMergeTargets={cardMergeTargets}
        onUnmergeCardAccount={onUnmergeCardAccount}
        touchedSourceNames={accountTouchedSourceNames}
        onAcknowledgeAccount={onAcknowledgeAccount}
        onlyRenderSourceNames={sourceNames}
      />
    );
  }

  return (
    <View className="flex-1">
      <View className="px-4 pt-3 pb-2 border-b border-theme bg-surface gap-1">
        <Text className="text-[11.5px] font-bold text-primary">Accounts</Text>
        <Text className="text-[10.5px] text-tertiary">
          {noAccountColumn
            ? 'One account for the whole file'
            : accountsResolved
              ? `${sourceAccountCount} source account${sourceAccountCount !== 1 ? 's' : ''} → ${confirmedAccountCount} confirmed`
              : `${sourceAccountCount} source account${sourceAccountCount !== 1 ? 's' : ''} · needs a decision`}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 12, paddingBottom: 16, gap: 12 }}>
        {noAccountColumn ? (
          renderSection(new Set())
        ) : (
          <>
            {buckets.needsReview.size > 0 && (
              <BucketCard
                dotColor={theme.warning}
                title="Needs Review"
                count={buckets.needsReview.size}
                expanded={isExpanded('needsReview')}
                onToggle={() => toggle('needsReview')}
              >
                {renderSection(buckets.needsReview)}
              </BucketCard>
            )}

            {buckets.ready.size > 0 && (
              <BucketCard
                dotColor={theme.success}
                title="Ready"
                count={buckets.ready.size}
                expanded={isExpanded('ready')}
                onToggle={() => toggle('ready')}
              >
                {renderSection(buckets.ready)}
              </BucketCard>
            )}

            {buckets.skipped.size > 0 && (
              <BucketCard
                dotColor={theme.textTertiary}
                title="Skipped"
                count={buckets.skipped.size}
                expanded={isExpanded('skipped')}
                onToggle={() => toggle('skipped')}
              >
                {renderSection(buckets.skipped)}
              </BucketCard>
            )}
          </>
        )}

        {!accountsResolved && (
          <Text className="text-center text-[10.5px] text-tertiary" style={{ marginTop: -4 }}>
            {anyAccountReady
              ? 'You can continue now — any account still needing a decision will have its transactions skipped for later'
              : 'Resolve at least one account above to continue'}
          </Text>
        )}

        <Button variant="primary" disabled={!anyAccountReady} onPress={onNext}>
          Continue
        </Button>
      </ScrollView>
    </View>
  );
}
