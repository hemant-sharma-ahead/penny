import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { AmountInput, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import { formatDate } from '@/lib/date';
import type { UseBankImportReturn } from './useBankImport';

interface OpeningBalancePromptProps {
  bi: UseBankImportReturn;
}

/** A `Card`-shaped container with a colored accent border — `Card` itself has no `style` prop (theme
 *  border only), so every accent-bordered card in this feature (`PossibleBucket.tsx`,
 *  `BulkCategorizeModal.tsx`, etc.) builds its own `View` with `Card`'s own base classes instead. */
function AccentCard({ borderColor, children }: { borderColor: string; children: ReactNode }) {
  return (
    <View className="bg-surface border rounded-xl p-3.5" style={{ borderColor }}>
      {children}
    </View>
  );
}

/**
 * Opening-balance confirm (§10a, first-ever import) / anchor-shift (§14a clean, §14b disagreement)
 * flow — docs/mockups/proposals/bank-balance-sync-v2.html §5/§6 is the exact spec this follows.
 * Rendered by `SetupStep.tsx` IN PLACE OF the plain "Continue to review" button whenever
 * `bi.openingBalanceTrigger` is set — every branch below ends in its own button that both stages the
 * account write (nothing touches the real vault until `commitAndImport()`, unchanged) and proceeds.
 */
export function OpeningBalancePrompt({ bi }: OpeningBalancePromptProps) {
  const theme = useThemeColors();

  // ── §10a: first-ever import ─────────────────────────────────────────────────────────────────────
  if (bi.openingBalanceTrigger === 'first-import') {
    const hasSuggestion = bi.openingBalanceSuggestion !== undefined;
    const asOfDate = bi.effectiveAsOfDate;
    const amountValue =
      bi.openingBalanceOverrideText ||
      (hasSuggestion ? String(bi.openingBalanceSuggestion?.suggestedOpeningBalance ?? '') : '');
    return (
      <AccentCard borderColor={theme.primary}>
        <View className="flex-row items-center gap-1.5 mb-1.5">
          <Icon name="ti-anchor" size={14} color={theme.primary} />
          <Text className="text-xs font-extrabold text-primary">Confirm opening balance</Text>
        </View>
        <Text className="text-[11px] text-secondary leading-relaxed mb-2.5">
          First statement ever imported for this account.{' '}
          {hasSuggestion
            ? `What was the real balance immediately before this statement's first row${asOfDate ? ` (${formatDate(asOfDate)})` : ''}?`
            : "This file's header doesn't state a balance — enter it from your passbook or a recent statement."}
        </Text>
        <AmountInput
          label={`Opening balance, as of ${asOfDate ? formatDate(asOfDate) : '—'}`}
          value={amountValue}
          onChange={bi.setOpeningBalanceOverrideText}
          placeholder={hasSuggestion ? undefined : 'e.g. 25000'}
          showWords={false}
        />
        <Button
          variant="primary"
          fullWidth
          disabled={bi.effectiveOpeningBalance === null}
          onPress={bi.confirmOpeningBalanceAndProceed}
          className="mt-2.5"
        >
          Continue to review
        </Button>
      </AccentCard>
    );
  }

  if (bi.openingBalanceTrigger !== 'anchor-shift') return null;

  // ── §14: anchor-shift, but no derivable suggestion — manual entry first ─────────────────────────
  // Not depicted in the v2 mockup (both its §6 examples assume a Balance column was mapped), a
  // straightforward, documented extension of the same first-import manual-entry pattern above so an
  // anchor-shift import lacking a Balance column doesn't have no path forward at all.
  if (!bi.openingBalanceSuggestion && !bi.anchorShiftCheck) {
    return (
      <AccentCard borderColor={theme.primary}>
        <View className="flex-row items-center gap-1.5 mb-1.5">
          <Icon name="ti-anchor" size={14} color={theme.primary} />
          <Text className="text-xs font-extrabold text-primary">Confirm this earlier opening balance</Text>
        </View>
        <Text className="text-[11px] text-secondary leading-relaxed mb-2.5">
          This statement starts earlier than anything already imported for this account, but its file has no balance
          column — enter the real balance as of{' '}
          {bi.effectiveAsOfDate ? formatDate(bi.effectiveAsOfDate) : 'its first row'} from your passbook or a recent
          statement.
        </Text>
        <AmountInput
          label={`Opening balance, as of ${bi.effectiveAsOfDate ? formatDate(bi.effectiveAsOfDate) : '—'}`}
          value={bi.openingBalanceOverrideText}
          onChange={bi.setOpeningBalanceOverrideText}
          placeholder="e.g. 25000"
          showWords={false}
        />
      </AccentCard>
    );
  }

  const check = bi.anchorShiftCheck;
  if (!check) return null;

  // ── §14a: clean case — the numbers agree, nothing downstream needs to change ────────────────────
  if (check.agrees) {
    return (
      <AccentCard borderColor={theme.primary}>
        <View className="flex-row items-center gap-1.5 mb-2">
          <Icon name="ti-anchor" size={14} color={theme.primary} />
          <Text className="text-xs font-extrabold text-primary">Opening-balance anchor moves earlier</Text>
        </View>
        <View className="flex-row items-center gap-2 mb-2">
          <View className="flex-1">
            <Text className="text-[9px] text-tertiary">Was</Text>
            <Text className="text-xs font-bold text-primary">{formatCurrency(check.oldOpeningBalance)}</Text>
            <Text className="text-[9px] text-tertiary">as of {formatDate(check.oldAnchorDate)}</Text>
          </View>
          <Icon name="ti-arrow-right" size={14} color={theme.textTertiary} />
          <View className="flex-1">
            <Text className="text-[9px] text-tertiary">Now</Text>
            <Text className="text-xs font-bold text-primary">{formatCurrency(check.newOpeningBalance)}</Text>
            <Text className="text-[9px] text-tertiary">as of {formatDate(check.newAnchorDate)}</Text>
          </View>
        </View>
        <View className="flex-row gap-1.5">
          <Icon name="ti-circle-check" size={13} color={theme.success} />
          <Text className="flex-1 text-[10.5px] leading-relaxed" style={{ color: theme.success }}>
            The newly-backfilled activity lands exactly back on your existing {formatDate(check.oldAnchorDate)} figure —
            nothing after that date needs to change.
          </Text>
        </View>
        <Button variant="primary" fullWidth onPress={bi.confirmOpeningBalanceAndProceed} className="mt-2.5">
          Continue to review
        </Button>
      </AccentCard>
    );
  }

  // ── §14b: disagreement — never auto-resolved, three choices ─────────────────────────────────────
  // Once "Accept" has been tapped, `pendingOpeningBalanceUpdate` is already staged — show the mockup's
  // own follow-up confirmation frame with its own "Continue to review" instead of the three choices.
  // Plain truthiness (not a `.kind`/`.reference` check — `PendingOpeningBalanceUpdate` is a flat shape
  // now, no discriminant) is sufficient to detect "Accept was just tapped, still needs its own
  // Continue-to-review tap": "Keep"/"Review rows first" (`flagAnchorDisagreement`/`deferAnchorDecision`)
  // both call `confirmMapping()` themselves immediately, which flips `step` to `'review'` and unmounts
  // `SetupStep`/this component entirely — so a non-null `pendingOpeningBalanceUpdate` reachable at this
  // exact render (still on `'setup'`, still in the `'anchor-shift'` + disagreement branch) can only ever
  // be the Accept path's own staged value.
  if (bi.pendingOpeningBalanceUpdate) {
    return (
      <AccentCard borderColor={theme.success}>
        <View className="flex-row gap-1.5">
          <Icon name="ti-circle-check" size={14} color={theme.success} />
          <Text className="flex-1 text-[10.5px] leading-relaxed" style={{ color: theme.success }}>
            Opening balance updated to {formatCurrency(check.newOpeningBalance)} as of {formatDate(check.oldAnchorDate)}
            . Recomputing every checkpoint since — this may take a moment on a long history.
          </Text>
        </View>
        <Button variant="primary" fullWidth onPress={bi.confirmMapping} className="mt-2.5">
          Continue to review
        </Button>
      </AccentCard>
    );
  }

  return (
    <AccentCard borderColor={theme.danger}>
      <View className="flex-row items-center gap-1.5 mb-2">
        <Icon name="ti-alert-triangle" size={14} color={theme.danger} />
        <Text className="text-xs font-extrabold text-primary">This backfill disagrees with your existing anchor</Text>
      </View>
      <Text className="text-[11px] text-secondary leading-relaxed mb-2.5">
        Your account's {formatDate(check.oldAnchorDate)} opening balance is{' '}
        <Text className="font-bold text-primary">{formatCurrency(check.oldOpeningBalance)}</Text>. But this
        newly-imported statement implies it should have been{' '}
        <Text className="font-bold text-primary">{formatCurrency(check.impliedOldBalance)}</Text> — a{' '}
        <Text className="font-bold" style={{ color: theme.danger }}>
          {formatCurrency(Math.abs(check.diff))}
        </Text>{' '}
        disagreement.
      </Text>
      <Button variant="secondary" fullWidth onPress={bi.deferAnchorDecision} className="mb-1.5">
        Review the new import's rows first
      </Button>
      <Button variant="secondary" fullWidth onPress={bi.acceptAnchorShift} className="mb-1.5">
        {`Accept — shift everything by ${formatCurrency(Math.abs(check.diff))}`}
      </Button>
      <Button variant="ghost" fullWidth onPress={bi.flagAnchorDisagreement}>
        {`Keep the original ${formatCurrency(check.oldOpeningBalance)}, flag for later`}
      </Button>
    </AccentCard>
  );
}
