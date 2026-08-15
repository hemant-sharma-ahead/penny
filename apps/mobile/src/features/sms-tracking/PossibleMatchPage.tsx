import { useState, type ReactNode } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useNavigation, useRoute, type ParamListBase, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { formatCurrency } from '@/lib/formatters';
import { formatDate } from '@/lib/date';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import type { HomeStackParamList } from '~/navigation/HomeStack';
import { useSmsTracking } from './useSmsTracking';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual entry',
  import: 'CSV import',
  bank_sync: 'Bank Statement Import',
  sms: 'SMS Tracking'
};

function Col({
  label,
  icon,
  children,
  tone
}: {
  label: string;
  icon: string;
  children: ReactNode;
  tone?: string | undefined;
}) {
  const theme = useThemeColors();
  const color = tone ?? theme.textTertiary;
  return (
    <View
      className="flex-1 rounded-xl p-2.5"
      style={{ backgroundColor: tone ? tint(color, 8) : theme.surfaceSecondary }}
    >
      <View className="flex-row items-center gap-1 mb-1.5">
        <Icon name={icon} size={9} color={color} />
        <Text className="text-[8.5px] font-extrabold uppercase tracking-wide" style={{ color }}>
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Field({ label, value, sub }: { label: string; value: ReactNode; sub?: boolean }) {
  const theme = useThemeColors();
  return (
    <View className="mb-1.5">
      <Text className="text-[8.5px] uppercase tracking-wide text-tertiary">{label}</Text>
      <Text
        className="text-xs font-bold mt-0.5"
        style={{ color: sub ? theme.textSecondary : theme.textPrimary, fontWeight: sub ? '500' : '700' }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * "Possible match" side-by-side screen (plan §4, mockup §4) — its own dedicated screen, not a modal
 * squeezed onto an existing one, reached from a Needs Review tile's "Possible match"/"Reconciled date
 * conflict" action. Same paired-column visual language as Bank Import's `MatchedBucket`/`PossibleBucket`
 * tiles, scaled up with richer per-side detail. No silent default, no auto-timeout accept.
 */
export function PossibleMatchPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'SmsPossibleMatch'>>();
  useDefaultHeaderBack('SmsPossibleMatch');
  const sms = useSmsTracking();
  const [candidateIndex, setCandidateIndex] = useState(0);

  const record = sms.needsReview.find((r) => r.id === route.params.recordId);

  if (!record) {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-xs text-tertiary text-center">
            This item was already resolved or no longer needs review.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const candidateIds = record.possibleMatchExpenseIds ?? [];
  const candidateId = candidateIds[Math.min(candidateIndex, candidateIds.length - 1)];
  const candidate = candidateId ? sms.expensesById.get(candidateId) : undefined;
  const isReconciled = record.reviewReason === 'reconciled_date_conflict';
  const accountName = sms.accountsById.get(record.accountId ?? '')?.name ?? 'Unknown account';

  if (!candidate) {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-xs text-tertiary text-center">
            The recorded transaction this SMS matched no longer exists.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {isReconciled ? (
          <Banner variant="warning" className="mb-3">
            This looks like a reconciled transaction from {formatDate(candidate.date)} — the SMS says{' '}
            {record.date != null ? formatDate(record.date) : 'a different date'}. Same transaction?
          </Banner>
        ) : (
          <Text className="text-xs text-secondary mb-3">Is this the same transaction?</Text>
        )}

        {candidateIds.length > 1 && (
          <Text className="text-[10px] text-tertiary text-center mb-2">
            Candidate {candidateIndex + 1} of {candidateIds.length}
            {candidateIndex < candidateIds.length - 1 ? ' — ' : ''}
            {candidateIndex < candidateIds.length - 1 && (
              <Text style={{ color: theme.info, fontWeight: '700' }} onPress={() => setCandidateIndex((i) => i + 1)}>
                see next ›
              </Text>
            )}
          </Text>
        )}

        <View className="flex-row gap-2">
          <Col label="Already recorded" icon="ti-receipt" tone={isReconciled ? theme.success : undefined}>
            <Field
              label="Date"
              value={
                <>
                  {formatDate(candidate.date)}
                  {isReconciled && <Text style={{ color: theme.success }}> · Reconciled ✓</Text>}
                </>
              }
            />
            <Field label="Amount" value={formatCurrency(candidate.amount)} />
            <Field label="Description" value={candidate.description} />
            <Field label="Account" value={accountName} sub />
            <Field label="Source" value={SOURCE_LABELS[candidate.source ?? 'manual'] ?? 'Manual entry'} sub />
          </Col>
          <Col label="From SMS" icon="ti-message-2" tone={theme.warning}>
            <Field label="Date" value={record.date != null ? formatDate(record.date) : '—'} sub={false} />
            <Field label="Amount" value={record.amount != null ? formatCurrency(record.amount) : '—'} />
            <Field label="Merchant text" value={record.counterparty ?? '—'} />
            <Field label="Sender" value={record.sender} sub />
            <Field label="Payment mode" value={`${record.paymentModeGuess ?? '—'} (guessed)`} sub />
          </Col>
        </View>

        <View className="gap-2 mt-4">
          <Button
            variant="primary"
            fullWidth
            onPress={() => {
              void sms.resolvePossibleMatch(record, { kind: 'link', expenseId: candidate.id });
              navigation.goBack();
            }}
          >
            {isReconciled ? `Yes, link (date stays ${formatDate(candidate.date)})` : 'Yes, same transaction — link'}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onPress={() => {
              void sms.resolvePossibleMatch(record, { kind: 'separate' });
              navigation.goBack();
            }}
          >
            {isReconciled ? 'No — treat as separate' : 'No — keep as a separate transaction'}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
