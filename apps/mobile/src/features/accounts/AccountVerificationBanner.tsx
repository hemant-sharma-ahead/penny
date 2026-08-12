import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { AccountVerificationFinding, AccountVerificationStatus } from '@/core/bank-import/accountVerification';
import { formatDate } from '@/lib/date';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import { Button } from '~/components/ui';
import { tint } from '~/lib/color';
import { describeDismissed, describeFinding } from './verificationCopy';

interface AccountVerificationBannerProps {
  /** Still computing (import records not yet loaded) — Frame 2a. */
  loading: boolean;
  /** Eligible for the feature but has no statement import history at all — Frame 2c, distinguished
   *  from "verified" per the mockup's own note (silence at list level is the same for both; conflating
   *  them here would be dishonest about what's actually been checked). */
  neverImported: boolean;
  status: AccountVerificationStatus;
  /** The latest covered-range end date, for the "Verified through …" line (Frame 2b, state "verified"). */
  verifiedThroughDate?: number;
  /** When `status.dismissedFinding` is set, the matching dismissal record's own timestamp. */
  dismissedAt?: number;
  onImportStatement: () => void;
  /** `'steps-partway'` checkpoint mismatches, and the standing-gap finding (view the flagged rows). */
  onInvestigate: (finding: AccountVerificationFinding) => void;
  /** `'flat-from-start'` checkpoint mismatches AND anchor disagreements — "one status slot, two
   *  possible causes" (docs/plans/bank-balance-sync.md §7 Stage 3's own note on this). */
  onCheckOpeningBalance: (finding: AccountVerificationFinding) => void;
  onDismiss: (fingerprint: string) => void;
  onReopen: (fingerprint: string) => void;
  /** Verified state only (found + fixed 2026-08-09, on-device feedback) — every OTHER state here already
   *  has a tappable link through to more detail ("Import a statement ›", "Re-open ›"); "Verified" was the
   *  one dead end, with no way to actually browse the checkpoint history that backs the claim. */
  onViewTable: () => void;
}

/**
 * The account-detail snapshot banner (docs/plans/bank-balance-sync.md §7 Stage 4, mockup
 * `bank-balance-sync-v2.html` Frame 2) — same slot in `EntityTransactionsModal` every time, content
 * driven entirely by the unified `AccountVerificationStatus` (`core/bank-import/accountVerification.ts`).
 * Six states: loading / verified / never-imported / mismatch-collapsed / mismatch-expanded / dismissed.
 */
export function AccountVerificationBanner({
  loading,
  neverImported,
  status,
  verifiedThroughDate,
  dismissedAt,
  onImportStatement,
  onInvestigate,
  onCheckOpeningBalance,
  onDismiss,
  onReopen,
  onViewTable
}: AccountVerificationBannerProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <View className="gap-1.5">
        <View className="h-11 rounded-xl" style={{ backgroundColor: theme.surfaceSecondary }} />
        <Text className="text-[10px] text-tertiary text-center">Checking against your bank statement…</Text>
      </View>
    );
  }

  if (neverImported) {
    return (
      <View className="flex-row items-start gap-1.5">
        <Icon name="ti-info-circle" size={13} color={theme.textTertiary} />
        <Text className="flex-1 text-[11px] text-secondary leading-relaxed">
          No bank statement imported yet — this balance is Penny's own running total, not yet checked against your bank.{' '}
          <Text style={{ color: theme.info, fontWeight: '700' }} onPress={onImportStatement}>
            Import a statement ›
          </Text>
        </Text>
      </View>
    );
  }

  const finding = status.activeFinding;
  if (finding) {
    const copy = describeFinding(finding);
    const isCollapsible =
      finding.kind === 'checkpoint-mismatch' && finding.checkpointMismatch?.signature === 'steps-partway';

    if (isCollapsible && !expanded) {
      return (
        <Pressable
          onPress={() => setExpanded(true)}
          className="flex-row items-start gap-2 rounded-xl border p-2.5"
          style={{ backgroundColor: tint(theme.danger, 8), borderColor: tint(theme.danger, 25) }}
          accessibilityLabel="Balance mismatch, tap to see details"
        >
          <Icon name="ti-alert-triangle" size={14} color={theme.danger} />
          <Text className="flex-1 text-[11px] leading-relaxed" style={{ color: theme.danger }}>
            {copy.headline}
          </Text>
          <Icon name="ti-chevron-down" size={13} color={theme.textTertiary} />
        </Pressable>
      );
    }

    return (
      <View className="gap-2.5">
        <View
          className="gap-1.5 rounded-xl border p-2.5"
          style={{ backgroundColor: tint(theme.danger, 8), borderColor: tint(theme.danger, 25) }}
        >
          <View className="flex-row items-start gap-2">
            <Icon name="ti-alert-triangle" size={14} color={theme.danger} />
            <Text className="flex-1 text-[11px] leading-relaxed" style={{ color: theme.danger }}>
              {copy.headline}
            </Text>
          </View>
          <Text className="text-[10.5px] text-secondary leading-relaxed">{copy.detail}</Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={copy.action === 'investigate' ? 'ti-search' : 'ti-anchor'}
            onPress={() => (copy.action === 'investigate' ? onInvestigate(finding) : onCheckOpeningBalance(finding))}
            className="flex-1"
          >
            {copy.actionLabel}
          </Button>
          <Button variant="ghost" size="sm" onPress={() => onDismiss(finding.fingerprint)} className="flex-1">
            I've reviewed this, dismiss
          </Button>
        </View>
      </View>
    );
  }

  const dismissed = status.dismissedFinding;
  if (dismissed) {
    return (
      <View
        className="flex-row items-start gap-2 rounded-xl border p-2.5"
        style={{ backgroundColor: theme.surfaceSecondary, borderColor: theme.border }}
      >
        <Icon name="ti-check" size={14} color={theme.textTertiary} />
        <Text className="flex-1 text-[11px] text-secondary leading-relaxed">
          {describeDismissed(dismissed, dismissedAt)}{' '}
          <Text style={{ color: theme.info, fontWeight: '700' }} onPress={() => onReopen(dismissed.fingerprint)}>
            Re-open ›
          </Text>
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name="ti-circle-check" size={13} color={theme.success} />
      <Text className="text-[11px]" style={{ color: theme.success }}>
        {verifiedThroughDate ? `Verified through ${formatDate(verifiedThroughDate)}` : 'Verified'}{' '}
        <Text style={{ color: theme.info, fontWeight: '700' }} onPress={onViewTable}>
          View table ›
        </Text>
      </Text>
    </View>
  );
}
