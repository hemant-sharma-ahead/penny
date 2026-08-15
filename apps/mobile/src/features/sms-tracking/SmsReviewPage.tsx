import { useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SmsTransactionRecord } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { formatDateShort } from '@/lib/date';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import type { HomeStackParamList } from '~/navigation/HomeStack';
import { BucketCard, ExpenseForm } from '~/components/shared';
import { useBucketExpansion } from '~/hooks/useBucketExpansion';
import { useSmsTracking } from './useSmsTracking';
import { SmsTile } from './SmsTile';
import { ResolveAccountModal } from './ResolveAccountModal';
import { DuplicateSmsModal } from './DuplicateSmsModal';

type BucketKey = 'linked' | 'needsReview' | 'ready' | 'dismissed';

/** A large historical backfill could plausibly leave dozens of "New Pending" items at once — capped per
 *  CLAUDE.md's bulk-render rule. Needs Review realistically stays small (it's always a decision the user
 *  must make one at a time), but capped too for consistency/defense-in-depth. */
const RENDER_CAP = 30;

function SimpleRow({ record, muted, first }: { record: SmsTransactionRecord; muted?: boolean; first?: boolean }) {
  const theme = useThemeColors();
  return (
    <View className={`flex-row items-center gap-2 py-2 ${first ? '' : 'border-t border-theme'}`}>
      <Text
        className="text-xs flex-1 min-w-0"
        style={{ color: muted ? theme.textTertiary : theme.textPrimary, fontWeight: muted ? '400' : '600' }}
        numberOfLines={1}
      >
        {record.counterparty ?? record.sender}
      </Text>
      <Text className="text-xs" style={{ color: muted ? theme.textTertiary : theme.textSecondary }}>
        {record.amount != null ? formatCurrency(record.amount) : '—'}
      </Text>
      <Text className="text-[10px] text-tertiary">{formatDateShort(record.receivedAt)}</Text>
    </View>
  );
}

/**
 * SMS Review — the ongoing inbox-style review queue (plan §7, mockup §3), reusing `BucketCard.tsx`/
 * `useBucketExpansion.ts` unmodified for the 4-bucket shell. Each "Needs Review" tile branches on its own
 * `reviewReason`; "New Pending" tiles reuse `~/components/shared/ExpenseForm.tsx`'s `statementPreset`
 * mode (the same mechanism Bank Statement Import's own "add as new" flow already uses) for the actual
 * category/account/payment-mode edit + commit step.
 */
export function SmsReviewPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'SmsReview'>>();
  useDefaultHeaderBack('SmsReview');
  const sms = useSmsTracking();
  const { isExpanded, toggle } = useBucketExpansion<BucketKey>('needsReview');

  const [resolvingAccountFor, setResolvingAccountFor] = useState<SmsTransactionRecord | null>(null);
  const [viewingDuplicateFor, setViewingDuplicateFor] = useState<SmsTransactionRecord | null>(null);
  const [categorizing, setCategorizing] = useState<SmsTransactionRecord | null>(null);

  const visibleReady = sms.ready.slice(0, RENDER_CAP);
  const visibleLinked = sms.linked.slice(0, RENDER_CAP);
  const visibleDismissed = sms.dismissed.slice(0, RENDER_CAP);

  const categorizingType = categorizing?.direction === 'credit' ? 'income' : 'expense';
  const categorizingCategorySuggestion = categorizing
    ? sms.suggestCategoryForCounterparty(categorizing.counterparty, categorizingType)
    : undefined;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 9 }}>
        <BucketCard
          dotColor={theme.success}
          title="Linked"
          count={sms.linked.length}
          expanded={isExpanded('linked')}
          onToggle={() => toggle('linked')}
        >
          {sms.linked.length === 0 ? (
            <Text className="text-xs text-tertiary py-1">Nothing linked yet.</Text>
          ) : (
            <>
              {visibleLinked.map((r, i) => (
                <SimpleRow key={r.id} record={r} first={i === 0} />
              ))}
              {sms.linked.length > RENDER_CAP && (
                <Text className="text-[10px] text-tertiary text-center mt-1">
                  +{sms.linked.length - RENDER_CAP} more
                </Text>
              )}
            </>
          )}
        </BucketCard>

        <BucketCard
          dotColor={theme.warning}
          title="Needs Review"
          count={sms.needsReview.length}
          expanded={isExpanded('needsReview')}
          onToggle={() => toggle('needsReview')}
        >
          {sms.needsReview.length === 0 ? (
            <Text className="text-xs text-tertiary py-1">Nothing needs your attention right now.</Text>
          ) : (
            sms.needsReview.slice(0, RENDER_CAP).map((r) => {
              if (r.reviewReason === 'ambiguous_account') {
                return (
                  <SmsTile
                    key={r.id}
                    title={`${r.sender} SMS`}
                    note="no account yet"
                    badgeLabel="Ambiguous account"
                    badgeIcon="ti-help-circle"
                    actions={[
                      { label: 'Resolve', onPress: () => setResolvingAccountFor(r) },
                      { label: 'Ignore', variant: 'ghost', onPress: () => void sms.dismiss(r) }
                    ]}
                  />
                );
              }
              if (r.reviewReason === 'possible_duplicate_sms') {
                return (
                  <SmsTile
                    key={r.id}
                    title={`${r.amount != null ? formatCurrency(r.amount) : '—'} · ${r.counterparty ?? r.sender}`}
                    badgeLabel="Possible duplicate SMS"
                    badgeIcon="ti-copy"
                    actions={[
                      { label: 'These are different', onPress: () => void sms.resolveDuplicateSms(r, 'different') },
                      { label: 'View both', variant: 'ghost', onPress: () => setViewingDuplicateFor(r) }
                    ]}
                  />
                );
              }
              // 'possible_match' or 'reconciled_date_conflict' — both route to the dedicated side-by-side screen.
              return (
                <SmsTile
                  key={r.id}
                  title={`${r.amount != null ? formatCurrency(r.amount) : '—'} · ${r.counterparty ?? r.sender}`}
                  badgeLabel={
                    r.reviewReason === 'reconciled_date_conflict' ? 'Reconciled date conflict' : 'Possible match'
                  }
                  badgeIcon={r.reviewReason === 'reconciled_date_conflict' ? 'ti-alert-triangle' : 'ti-git-compare'}
                  actions={[
                    {
                      label: r.reviewReason === 'reconciled_date_conflict' ? 'Review ›' : 'Review match ›',
                      full: true,
                      onPress: () => navigation.navigate('SmsPossibleMatch', { recordId: r.id })
                    }
                  ]}
                />
              );
            })
          )}
        </BucketCard>

        <BucketCard
          dotColor={theme.info}
          title="New Pending"
          count={sms.ready.length}
          expanded={isExpanded('ready')}
          onToggle={() => toggle('ready')}
        >
          {sms.ready.length === 0 ? (
            <Text className="text-xs text-tertiary py-1">No new transactions waiting.</Text>
          ) : (
            <>
              {visibleReady.map((r) => (
                <SmsTile
                  key={r.id}
                  title={`"${r.counterparty ?? r.sender}"`}
                  badgeLabel={sms.accountsById.get(r.accountId ?? '')?.name ?? 'Unknown account'}
                  badgeIcon="ti-building-bank"
                  actions={[
                    { label: 'Categorize ›', onPress: () => setCategorizing(r) },
                    { label: 'Skip', variant: 'ghost', onPress: () => void sms.dismiss(r) }
                  ]}
                />
              ))}
              {sms.ready.length > RENDER_CAP && (
                <Text className="text-[10px] text-tertiary text-center mt-1">
                  +{sms.ready.length - RENDER_CAP} more — category/account/payment-mode pre-filled, all editable before
                  commit.
                </Text>
              )}
            </>
          )}
        </BucketCard>

        <BucketCard
          dotColor={theme.neutral}
          title="Ignored / Dismissed"
          count={sms.dismissed.length}
          expanded={isExpanded('dismissed')}
          onToggle={() => toggle('dismissed')}
        >
          {sms.dismissed.length === 0 ? (
            <Text className="text-xs text-tertiary py-1">Nothing dismissed.</Text>
          ) : (
            <>
              {visibleDismissed.map((r, i) => (
                <SimpleRow key={r.id} record={r} muted first={i === 0} />
              ))}
              {sms.dismissed.length > RENDER_CAP && (
                <Text className="text-[10px] text-tertiary text-center mt-1">
                  +{sms.dismissed.length - RENDER_CAP} more
                </Text>
              )}
            </>
          )}
        </BucketCard>
      </ScrollView>

      {resolvingAccountFor && (
        <ResolveAccountModal
          sms={sms}
          sender={resolvingAccountFor.sender}
          onClose={() => setResolvingAccountFor(null)}
          onPick={(accountId) => {
            void sms.resolveAmbiguousAccount(resolvingAccountFor, accountId);
            setResolvingAccountFor(null);
          }}
        />
      )}

      {viewingDuplicateFor && (
        <DuplicateSmsModal
          record={viewingDuplicateFor}
          others={(viewingDuplicateFor.possibleDuplicateSmsIds ?? [])
            .map((id) => sms.needsReview.find((r) => r.id === id) ?? sms.ready.find((r) => r.id === id))
            .filter((r): r is SmsTransactionRecord => !!r)}
          onSame={() => {
            void sms.resolveDuplicateSms(viewingDuplicateFor, 'same');
            setViewingDuplicateFor(null);
          }}
          onClose={() => setViewingDuplicateFor(null)}
        />
      )}

      {categorizing && (
        <ExpenseForm
          categories={sms.categories}
          hashtags={sms.hashtags}
          editing={null}
          activeEvents={[]}
          saveAccount={sms.saveAccountForForm}
          searchMerchant={() => []}
          statementPreset={{
            amount: categorizing.amount ?? 0,
            date: categorizing.date ?? categorizing.receivedAt,
            accountId: categorizing.accountId ?? '',
            type: categorizingType,
            paymentMode: categorizing.paymentModeGuess ?? '',
            source: 'sms',
            ...(categorizing.counterparty && { descriptionSuggestion: categorizing.counterparty }),
            ...(categorizingCategorySuggestion && { categorySuggestion: categorizingCategorySuggestion })
          }}
          onSave={async (expense, newTagSetAside) => {
            await sms.commitReady(categorizing, expense, newTagSetAside);
            setCategorizing(null);
          }}
          onDelete={async () => {}}
          onClose={() => setCategorizing(null)}
        />
      )}
    </SafeAreaView>
  );
}
