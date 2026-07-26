import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View, Text } from 'react-native';
import { formatCurrency } from '@/lib/formatters';
import { fetchIpoSubscription } from '@/core/ipo/ipoClient';
import type { IpoItem, IpoStatus, IpoSubDetail } from '@/core/ipo/ipoTypes';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { Modal, StatBox } from '~/components/ui';
import { tint } from '~/lib/color';
import { formatIpoDate } from './ipoHelpers';

// ─── IpoDetailModal ───────────────────────────────────────────────────────────

export function IpoDetailModal({ ipo, onClose }: { ipo: IpoItem; onClose: () => void }) {
  const theme = useThemeColors();
  const [subDetail, setSubDetail] = useState<IpoSubDetail | null>(null);
  // initialise to true so the spinner shows immediately — effect only calls setState in async callbacks
  const [subLoading, setSubLoading] = useState(() => ipo.status !== 'upcoming');

  useEffect(() => {
    if (ipo.status === 'upcoming') return;
    fetchIpoSubscription(ipo.id)
      .then((d) => setSubDetail(d))
      .finally(() => setSubLoading(false));
  }, [ipo.id, ipo.status]);

  const catColor = ipo.category === 'mainboard' ? '#6366f1' : theme.warning;
  const catLabel = ipo.category === 'mainboard' ? 'Mainboard' : 'SME';
  const safeGmpPct = !ipo.gmpPercent || isNaN(ipo.gmpPercent) ? 0 : ipo.gmpPercent;
  const minInvestment = ipo.price && ipo.lotSize ? ipo.price * ipo.lotSize : null;
  const statusMeta: Record<IpoStatus, { label: string; color: string }> = {
    upcoming: { label: 'Upcoming', color: theme.warning },
    open: { label: 'Open', color: theme.success },
    closed: { label: 'Closed', color: theme.neutral },
    listed: { label: 'Listed', color: '#6366f1' }
  };
  const sm = statusMeta[ipo.status];
  const lastRow = subDetail?.rows[subDetail.rows.length - 1];

  const footer = ipo.detailPath ? (
    <Pressable
      onPress={() => Linking.openURL(`https://investorgain.com${ipo.detailPath}`)}
      className="flex-row items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-theme bg-surface-2"
    >
      <Text className="text-sm font-medium text-secondary">View on InvestorGain</Text>
      <Icon name="ti-external-link" size={14} color={theme.textSecondary} />
    </Pressable>
  ) : undefined;

  return (
    <Modal onClose={onClose} scrollable footer={footer}>
      {/* Header — custom (title badges alongside name), not the plain Modal `title` prop */}
      <View className="flex-row items-start justify-between gap-3 -mt-1">
        <View className="flex-1 gap-1.5">
          <Text className="text-base font-bold text-primary leading-snug">{ipo.name}</Text>
          <View className="flex-row items-center gap-2 flex-wrap">
            <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${catColor}18` }}>
              <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: catColor }}>
                {catLabel}
              </Text>
            </View>
            <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${sm.color}18` }}>
              <Text className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: sm.color }}>
                {sm.label}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          className="w-7 h-7 rounded-full items-center justify-center bg-surface-2"
          accessibilityLabel="Close"
        >
          <Icon name="ti-x" size={14} color={theme.textTertiary} />
        </Pressable>
      </View>

      {/* Offer details */}
      {(ipo.price ?? ipo.lotSize ?? ipo.issueSize) && (
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Offer Details</Text>
          <View className="flex-row flex-wrap gap-2">
            {ipo.price ? <StatBox size="sm" className="w-[47%]" label="Price" value={`₹${ipo.price}/sh`} /> : null}
            {ipo.lotSize ? (
              <StatBox size="sm" className="w-[47%]" label="Lot Size" value={`${ipo.lotSize} sh`} />
            ) : null}
            {minInvestment ? (
              <StatBox size="sm" className="w-[47%]" label="Min Invest" value={formatCurrency(minInvestment)} />
            ) : null}
            {ipo.issueSize ? <StatBox size="sm" className="w-[47%]" label="Issue Size" value={ipo.issueSize} /> : null}
          </View>
        </View>
      )}

      {/* Timeline */}
      <View>
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Timeline</Text>
        {(ipo.openDate ?? ipo.closeDate ?? ipo.boaDate ?? ipo.listingDate) ? (
          <View className="flex-row flex-wrap gap-2">
            {ipo.openDate ? (
              <StatBox size="sm" className="w-[47%]" label="Opens" value={formatIpoDate(ipo.openDate)} />
            ) : null}
            {ipo.closeDate ? (
              <StatBox size="sm" className="w-[47%]" label="Closes" value={formatIpoDate(ipo.closeDate)} />
            ) : null}
            {ipo.boaDate ? (
              <StatBox size="sm" className="w-[47%]" label="Allotment" value={formatIpoDate(ipo.boaDate)} />
            ) : null}
            {ipo.listingDate ? (
              <StatBox size="sm" className="w-[47%]" label="Listing" value={formatIpoDate(ipo.listingDate)} />
            ) : null}
          </View>
        ) : (
          <Text className="text-sm text-tertiary">Dates not announced yet</Text>
        )}
      </View>

      {/* GMP — non-listed */}
      {ipo.status !== 'listed' && (
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">
            Grey Market Premium
          </Text>
          {ipo.gmpValue !== null ? (
            <View className="flex-row items-baseline gap-2">
              <Text
                className="text-2xl font-bold"
                style={{
                  color: ipo.gmpValue > 0 ? theme.success : ipo.gmpValue < 0 ? theme.danger : theme.textTertiary
                }}
              >
                ₹{Math.abs(ipo.gmpValue)}
              </Text>
              <Text
                className="text-sm font-semibold"
                style={{ color: safeGmpPct > 0 ? theme.success : safeGmpPct < 0 ? theme.danger : theme.textTertiary }}
              >
                ({safeGmpPct > 0 ? '+' : ''}
                {safeGmpPct.toFixed(1)}%)
              </Text>
              {ipo.status === 'upcoming' && <Text className="text-xs text-tertiary">est.</Text>}
            </View>
          ) : (
            <Text className="text-sm text-tertiary">Not available</Text>
          )}
        </View>
      )}

      {/* Listing performance — listed only */}
      {ipo.status === 'listed' && (ipo.listingPrice !== null || ipo.listingGain !== null || safeGmpPct !== 0) && (
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">
            Listing Performance
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {ipo.listingPrice ? (
              <StatBox size="sm" className="w-[31%]" label="List Price" value={`₹${ipo.listingPrice}`} />
            ) : null}
            {ipo.listingGain !== null ? (
              <StatBox
                size="sm"
                className="w-[31%]"
                label="Listing Gain"
                value={`${ipo.listingGain >= 0 ? '+' : ''}${ipo.listingGain.toFixed(1)}%`}
                valueColor={ipo.listingGain >= 0 ? theme.success : theme.danger}
              />
            ) : null}
            {safeGmpPct !== 0 ? (
              <StatBox
                size="sm"
                className="w-[31%]"
                label="GMP Was"
                value={`~${safeGmpPct > 0 ? '+' : ''}${safeGmpPct.toFixed(1)}%`}
              />
            ) : null}
          </View>
        </View>
      )}

      {/* Subscription — open / closed / listed */}
      {ipo.status !== 'upcoming' && (
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Subscription</Text>

          {subLoading ? (
            <View className="flex-row items-center gap-2 py-2">
              <ActivityIndicator size="small" color={theme.primary} />
              <Text className="text-xs text-tertiary">Fetching subscription data…</Text>
            </View>
          ) : lastRow ? (
            <>
              {/* Category breakdown — latest day */}
              <View className="flex-row flex-wrap gap-2 mb-3">
                <StatBox size="sm" className="w-[31%]" label="QIB" value={lastRow.qib} />
                <StatBox size="sm" className="w-[31%]" label="HNI ≥₹10L" value={lastRow.niiBig} />
                <StatBox size="sm" className="w-[31%]" label="HNI <₹10L" value={lastRow.niiSmall} />
                <StatBox size="sm" className="w-[31%]" label="Retail" value={lastRow.rii} />
                <StatBox
                  size="sm"
                  className="w-[31%]"
                  label="Overall"
                  value={lastRow.total}
                  valueColor={theme.primary}
                />
                {lastRow.emp !== '—' && <StatBox size="sm" className="w-[31%]" label="Employee" value={lastRow.emp} />}
              </View>

              {/* Day-wise table */}
              {(subDetail?.rows.length ?? 0) > 0 && (
                <View className="rounded-xl overflow-hidden border border-theme">
                  <View className="flex-row px-2 py-1.5 bg-surface-2">
                    <Text className="flex-[2] text-[11px] font-semibold text-tertiary">Day</Text>
                    <Text className="flex-1 text-right text-[11px] font-semibold text-tertiary">QIB</Text>
                    <Text className="flex-1 text-right text-[11px] font-semibold text-tertiary">HNI</Text>
                    <Text className="flex-1 text-right text-[11px] font-semibold text-tertiary">Retail</Text>
                    <Text className="flex-1 text-right text-[11px] font-semibold text-tertiary">Total</Text>
                  </View>
                  {subDetail?.rows.map((row, i) => {
                    const isLast = i === (subDetail?.rows.length ?? 0) - 1;
                    return (
                      <View
                        key={row.seq}
                        className="flex-row px-2 py-1.5 border-t border-theme"
                        style={isLast ? { backgroundColor: tint(theme.primary, 8) } : undefined}
                      >
                        <View className="flex-[2]">
                          <Text className="text-xs font-medium text-primary">Day {row.seq}</Text>
                          <Text className="text-[10px] text-tertiary">{row.bidDate}</Text>
                        </View>
                        <Text className="flex-1 text-right text-xs text-primary">{row.qib}</Text>
                        <Text className="flex-1 text-right text-xs text-primary">{row.nii}</Text>
                        <Text className="flex-1 text-right text-xs text-primary">{row.rii}</Text>
                        <Text className="flex-1 text-right text-xs font-semibold" style={{ color: theme.primary }}>
                          {row.total}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <Text className="text-sm text-tertiary">No subscription data available</Text>
          )}
        </View>
      )}
    </Modal>
  );
}
