import { View, Text } from 'react-native';
import type { InsurancePolicy } from '@/core/db/types';
import { formatCurrency, formatCompact } from '@/lib/formatters';
import { formatDateShort } from '@/lib/date';
import { startOfToday } from '@/lib/date';
import { getPolicyMeta } from '@/core/insurance/meta';
import { computeDueStatus, type DueState } from '@/core/insurance/premiumSchedule';
import { Card, Badge } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { ListRow, DueDateBadge } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';

interface PolicyCardProps {
  policy: InsurancePolicy;
  masked: boolean;
  onEdit: (p: InsurancePolicy) => void;
}

const FREQ_LABEL: Record<string, string> = { M: 'Monthly', Q: 'Quarterly', H: 'Half-yearly', A: 'Annual', S: 'Single' };

const STATE_NOTE: Record<
  DueState,
  { icon: string; tone: 'ok' | 'warn' | 'danger'; label: (s: ReturnType<typeof computeDueStatus>) => string }
> = {
  onTrack: { icon: 'ti-check', tone: 'ok', label: () => 'On track' },
  dueSoon: {
    icon: 'ti-clock',
    tone: 'warn',
    label: (s) => `Due in ${s?.daysUntilDue} ${s?.daysUntilDue === 1 ? 'day' : 'days'}`
  },
  grace: {
    icon: 'ti-alert-triangle',
    tone: 'warn',
    label: (s) => `Grace period — ${s?.graceDaysLeft} days left before lapse`
  },
  lapsed: {
    icon: 'ti-alert-octagon',
    tone: 'danger',
    label: (s) =>
      `Lapsed. Revive by ${s?.revivalDeadlineMs ? formatDateShort(s.revivalDeadlineMs) : '—'} — sum assured intact if revived.`
  },
  paidUp: { icon: 'ti-check', tone: 'ok', label: () => 'Paid up — cover continues without further premiums' }
};

const TONE_BG: Record<'ok' | 'warn' | 'danger', string> = {
  ok: 'rgba(16,185,129,.14)',
  warn: 'rgba(245,158,11,.14)',
  danger: 'rgba(239,68,68,.14)'
};
const TONE_COLOR: Record<'ok' | 'warn' | 'danger', string> = { ok: '#10b981', warn: '#d99a2b', danger: '#ef4444' };

/** Term/Life's due-date/grace-period/lapsed card (insurance-redesign-v4.html §⑥) — the 5-state
 *  treatment (On track/Due soon/Grace period/Lapsed/Paid up) with ULIP-aware revival-window messaging. */
function TermLifeCard({ policy, masked, onEdit }: PolicyCardProps) {
  const meta = getPolicyMeta(policy.type);
  const status = computeDueStatus(policy, startOfToday());
  const note = status ? STATE_NOTE[status.state] : null;

  return (
    <Card onPress={() => onEdit(policy)}>
      <View className="flex-row items-center gap-2.5">
        <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: `${meta.color}22` }}>
          <Icon name={meta.icon} size={15} color={meta.color} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-bold text-primary" numberOfLines={1}>
            {policy.planName || policy.insurer}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <Badge label={meta.label} color={meta.color} variant="solid" size="sm" />
            <Text className="text-[10px] text-tertiary" numberOfLines={1}>
              {policy.insurer} · {FREQ_LABEL[policy.paymentFrequency ?? 'A']}
            </Text>
          </View>
        </View>
        <Icon name="ti-chevron-right" size={14} color="#94a3b8" />
      </View>

      <View className="flex-row mt-2.5">
        <View className="flex-1">
          <Text className="text-[8.5px] uppercase text-tertiary">Sum assured</Text>
          <Text className="text-xs font-extrabold text-primary mt-0.5">
            {!masked ? formatCompact(policy.sumAssured ?? policy.coverageAmount) : '••••'}
          </Text>
        </View>
        <View className="flex-1 border-l border-theme pl-2">
          <Text className="text-[8.5px] uppercase text-tertiary">Premium</Text>
          <Text className="text-[10px] font-extrabold text-primary mt-0.5">
            {!masked && status
              ? `${formatCurrency(policy.annualPremium)}/yr`
              : !masked
                ? formatCurrency(policy.annualPremium)
                : '••••'}
          </Text>
        </View>
        {policy.nominees && (
          <View className="flex-1 border-l border-theme pl-2">
            <Text className="text-[8.5px] uppercase text-tertiary">Nominee</Text>
            <Text className="text-[10px] font-extrabold text-primary mt-0.5" numberOfLines={1}>
              {policy.nominees}
            </Text>
          </View>
        )}
      </View>

      {policy.startDate !== undefined && policy.endDate !== undefined && (
        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-[9.5px] text-tertiary">Cover duration</Text>
          <Text className="text-[9.5px] font-bold text-secondary">
            {policy.durationYears ? `${policy.durationYears} yrs total · ` : ''}till {formatDateShort(policy.endDate)}
          </Text>
        </View>
      )}

      {note && (
        <View
          className="flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 mt-2"
          style={{ backgroundColor: TONE_BG[note.tone] }}
        >
          <Icon name={note.icon} size={11} color={TONE_COLOR[note.tone]} />
          <Text className="text-[9.5px] flex-1" style={{ color: TONE_COLOR[note.tone] }}>
            {note.label(status)}
          </Text>
        </View>
      )}

      {policy.nextPremiumDueDate !== undefined && status && status.state !== 'paidUp' && (
        <View className="flex-row items-center justify-between pt-2 mt-2 border-t border-theme">
          <Text className="text-[9.5px] text-tertiary">Next due {formatDateShort(policy.nextPremiumDueDate)}</Text>
        </View>
      )}
    </Card>
  );
}

/** Health/Vehicle/Home/Travel/Other's simpler annual-renewal card — unchanged framing from before this
 *  redesign, restyled to the new visual language (icon-badge tint, pill type badge). */
function AnnualRenewalCard({ policy, masked, onEdit }: PolicyCardProps) {
  const meta = getPolicyMeta(policy.type);
  const theme = useThemeColors();

  return (
    <Card onPress={() => onEdit(policy)}>
      <ListRow
        icon={meta.icon}
        iconColor={meta.color}
        title={
          <>
            <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
              {policy.planName || policy.insurer}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge label={meta.label} color={meta.color} variant="solid" size="sm" />
              {policy.policyNumber && <Text className="text-[10px] text-tertiary">{policy.policyNumber}</Text>}
            </View>
          </>
        }
        subtitle={
          <View className="flex-row items-center gap-3 mt-1.5">
            <View>
              <Text className="text-[10px] text-tertiary">Coverage</Text>
              <Text className="text-xs font-semibold text-primary">
                {!masked ? formatCurrency(policy.coverageAmount) : '••••'}
              </Text>
            </View>
            <View className="w-px h-6" style={{ backgroundColor: theme.border }} />
            <View>
              <Text className="text-[10px] text-tertiary">Premium / yr</Text>
              <Text className="text-xs font-semibold text-primary">
                {!masked ? formatCurrency(policy.annualPremium) : '••••'}
              </Text>
            </View>
          </View>
        }
        right={
          <DueDateBadge dueDateMs={policy.renewalDate} nowMs={startOfToday()} warningDays={7} expiredLabel="Expired" />
        }
      />
    </Card>
  );
}

export function PolicyCard(props: PolicyCardProps) {
  return props.policy.type === 'term' || props.policy.type === 'life' ? (
    <TermLifeCard {...props} />
  ) : (
    <AnnualRenewalCard {...props} />
  );
}
