import { useState, useEffect, useMemo } from 'react';
import { View, Pressable, ActivityIndicator, Text } from 'react-native';
import { Card, IconBadge, DetailRow, ProgressBar, Badge, Banner, StatBox } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { formatCurrency } from '@/lib/formatters';
import { DAY_MS } from '@/lib/date';
import { LIFECYCLE_FUNDS, getAllocationAtAge, findNpsSchemeCode, fetchNpsNav, getPfmLabel } from '@/core/nps';
import type { NpsLifecycleFund, NpsNavDetail, NpsPfmKey, NpsSchemeType } from '@/core/nps';
import { isBeforeFifth, ppfBuildCardData } from '@/core/portfolio/ppfCalculations';
import {
  EPF_RETIREMENT_AGE,
  epfMonthsBetween,
  epfMonthLabel,
  epfBuildCardData
} from '@/core/portfolio/epfCalculations';
import type { Holding } from '@/core/db/types';
import { ASSET_META } from '../shared/registry';
import {
  AllocationPills,
  PpfTransactionSheet,
  EpfTransactionSheet,
  EpfEmployerSheet,
  EpfAllTransactionsSheet,
  EpfSalaryHikeSheet
} from './RetirementSheets';

function nowMs(): number {
  return Date.now();
}

function staleDays(h: Holding): number {
  const ts = h.lastUpdatedAt ?? h.updatedAt;
  return Math.floor((Date.now() - ts) / DAY_MS);
}

export function RetirementCard({
  holding,
  onEdit,
  onSave,
  onViewSchedule,
  masked
}: {
  holding: Holding;
  onEdit: () => void;
  onSave: (h: Holding) => Promise<void>;
  onViewSchedule: () => void;
  masked: boolean;
}) {
  const theme = useThemeColors();
  const meta = holding.assetMeta ?? {};
  const days = staleDays(holding);
  const isStale = days >= 30;

  // NPS active choice: resolve scheme code + fetch NAV
  const [npsNav, setNpsNav] = useState<NpsNavDetail | null>(null);
  const shouldFetchNav =
    holding.assetClass === 'nps' && meta.npsChoiceType === 'active' && !!meta.npsPfm && !!meta.npsSchemeType;
  const [npsNavLoading, setNpsNavLoading] = useState(shouldFetchNav);

  useEffect(() => {
    if (holding.assetClass !== 'nps' || meta.npsChoiceType !== 'active') return;
    if (!meta.npsPfm || !meta.npsSchemeType) return;
    const tier = meta.tier === 'tier2' ? 'II' : 'I';
    findNpsSchemeCode(meta.npsPfm as NpsPfmKey, meta.npsSchemeType as NpsSchemeType, tier)
      .then((code) => (code ? fetchNpsNav(code) : null))
      .then((nav) => {
        setNpsNav(nav);
        setNpsNavLoading(false);
      });
  }, [holding.assetClass, meta.npsChoiceType, meta.npsPfm, meta.npsSchemeType, meta.tier]);

  const liveCorpus = npsNav && holding.units ? holding.units * npsNav.nav : null;

  // Lifecycle allocation for auto choice
  const lifecycleAlloc = useMemo(() => {
    if (holding.assetClass !== 'nps' || meta.npsChoiceType !== 'auto') return null;
    if (!meta.npsLifecycleFund || !meta.npsBirthYear) return null;
    const age = new Date().getFullYear() - meta.npsBirthYear;
    return getAllocationAtAge(meta.npsLifecycleFund as NpsLifecycleFund, age);
  }, [holding.assetClass, meta.npsChoiceType, meta.npsLifecycleFund, meta.npsBirthYear]);

  // PPF state
  const [showPpfTxSheet, setShowPpfTxSheet] = useState(false);

  // PPF computed values — Date.now() lives inside ppfBuildCardData (module-level)
  const ppfData = useMemo(
    () => (holding.assetClass === 'ppf' ? ppfBuildCardData(holding.assetMeta ?? {}, holding.investedAmount) : null),
    [holding.assetClass, holding.investedAmount, holding.assetMeta]
  );

  // EPF state
  const [showEpfTxSheet, setShowEpfTxSheet] = useState(false);
  const [showEpfEmpSheet, setShowEpfEmpSheet] = useState(false);
  const [showEpfAllTxSheet, setShowEpfAllTxSheet] = useState(false);
  const [epfHikeEmpId, setEpfHikeEmpId] = useState<string | null>(null);

  const epfData = useMemo(
    () => (holding.assetClass === 'epf' ? epfBuildCardData(holding.assetMeta ?? {}) : null),
    [holding.assetClass, holding.assetMeta]
  );

  function staleBadge() {
    if (days < 30) return null;
    const color = days >= 60 ? theme.danger : theme.warning;
    const label = days >= 60 ? 'Overdue' : 'Update due';
    return <Badge label={label} color={color} size="sm" rounded="md" />;
  }

  function lastUpdatedText() {
    if (days === 0) return 'Updated today';
    if (days === 1) return 'Updated yesterday';
    return `Updated ${days}d ago`;
  }

  function npsDetailLine(): string {
    if (meta.npsChoiceType === 'auto') {
      const parts: string[] = [meta.tier === 'tier2' ? 'Tier II' : 'Tier I', 'Auto / Lifecycle'];
      if (meta.npsLifecycleFund)
        parts.push(LIFECYCLE_FUNDS[meta.npsLifecycleFund as NpsLifecycleFund]?.shortLabel ?? '');
      if (meta.monthlyContribution) parts.push(`₹${meta.monthlyContribution.toLocaleString('en-IN')}/mo`);
      return parts.filter(Boolean).join(' · ');
    }
    const parts: string[] = [meta.tier === 'tier2' ? 'Tier II' : 'Tier I', 'Active Choice'];
    if (meta.npsPfm) parts.push(getPfmLabel(meta.npsPfm));
    if (meta.npsSchemeType) parts.push(`Scheme ${meta.npsSchemeType}`);
    if (meta.monthlyContribution) parts.push(`₹${meta.monthlyContribution.toLocaleString('en-IN')}/mo`);
    return parts.filter(Boolean).join(' · ');
  }

  const assetMeta = ASSET_META[holding.assetClass];
  const showLiveCorpus = liveCorpus != null;
  const displayValue =
    holding.assetClass === 'epf' && epfData != null
      ? epfData.corpus
      : showLiveCorpus
        ? liveCorpus
        : holding.investedAmount;

  const txTypeLabel: Record<string, string> = { deposit: 'Deposit', interest: 'Interest', withdrawal: 'Withdrawal' };
  const txTypeColor: Record<string, string> = { deposit: '#8b5cf6', interest: '#10b981', withdrawal: '#f59e0b' };

  return (
    <>
      <Card className="gap-2.5">
        {/* Header row */}
        <View className="flex-row items-start justify-between gap-2">
          <Pressable onPress={onEdit} className="flex-row items-center gap-2.5 flex-1">
            <IconBadge icon={assetMeta.icon} color={assetMeta.color} size="sm" bg={`${assetMeta.color}15`} />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                {holding.name}
              </Text>
              <Text className="text-xs text-tertiary mt-0.5">{assetMeta.label}</Text>
            </View>
          </Pressable>
          <Pressable onPress={onEdit} className="items-end">
            <View className="flex-row items-center gap-1.5">
              {showLiveCorpus && <Badge label="Live" color={theme.success} size="sm" rounded="md" />}
              {npsNavLoading && <ActivityIndicator size="small" color={theme.primary} />}
            </View>
            <Text className="text-base font-bold text-primary tabular-nums">
              {!masked ? formatCurrency(displayValue) : '••••'}
            </Text>
            {showLiveCorpus && !masked && (
              <Text className="text-[10px] text-tertiary mt-0.5">
                {(holding.units ?? 0).toFixed(4)} units × ₹{npsNav?.nav.toFixed(4)}
              </Text>
            )}
            {holding.assetClass === 'epf' && <Text className="text-[10px] text-tertiary mt-0.5">corpus</Text>}
          </Pressable>
        </View>

        {/* ── NPS content ── */}
        {holding.assetClass === 'nps' && (
          <>
            <Text className="text-xs text-secondary leading-relaxed">{npsDetailLine()}</Text>

            {meta.npsChoiceType === 'active' && npsNav && (
              <View className="flex-row gap-3">
                {npsNav.oneYear != null && (
                  <View>
                    <Text className="text-[9px] text-tertiary">1Y return</Text>
                    <Text
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: npsNav.oneYear >= 0 ? theme.success : theme.danger }}
                    >
                      {npsNav.oneYear >= 0 ? '+' : ''}
                      {npsNav.oneYear.toFixed(1)}%
                    </Text>
                  </View>
                )}
                {npsNav.threeYear != null && (
                  <View>
                    <Text className="text-[9px] text-tertiary">3Y return</Text>
                    <Text
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: npsNav.threeYear >= 0 ? theme.success : theme.danger }}
                    >
                      {npsNav.threeYear >= 0 ? '+' : ''}
                      {npsNav.threeYear.toFixed(1)}%
                    </Text>
                  </View>
                )}
                {npsNav.fiveYear != null && (
                  <View>
                    <Text className="text-[9px] text-tertiary">5Y return</Text>
                    <Text
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: npsNav.fiveYear >= 0 ? theme.success : theme.danger }}
                    >
                      {npsNav.fiveYear >= 0 ? '+' : ''}
                      {npsNav.fiveYear.toFixed(1)}%
                    </Text>
                  </View>
                )}
                {npsNav.date && (
                  <View>
                    <Text className="text-[9px] text-tertiary">NAV date</Text>
                    <Text className="text-xs text-secondary">{npsNav.date}</Text>
                  </View>
                )}
              </View>
            )}

            {meta.npsChoiceType === 'auto' && lifecycleAlloc && (
              <View className="flex-row items-center justify-between">
                <AllocationPills
                  equity={lifecycleAlloc.equity}
                  corporate={lifecycleAlloc.corporate}
                  govt={lifecycleAlloc.govt}
                />
                <Pressable onPress={onViewSchedule} className="ml-2">
                  <Text className="text-[10px] font-medium" style={{ color: theme.primary }}>
                    View schedule →
                  </Text>
                </Pressable>
              </View>
            )}

            {meta.npsChoiceType === 'auto' && meta.npsLifecycleFund && !meta.npsBirthYear && (
              <Text className="text-[10px] text-tertiary">Add your birth year to see current allocation →</Text>
            )}

            {meta.pran && <Text className="text-xs text-tertiary">PRAN: {meta.pran}</Text>}
          </>
        )}

        {/* ── PPF content ── */}
        {holding.assetClass === 'ppf' && ppfData && (
          <>
            <Text className="text-xs text-secondary">
              {[
                '7.1% p.a.',
                meta.ppfBank,
                meta.ppfOpeningDate
                  ? `Opened ${new Date(meta.ppfOpeningDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
                  : null,
                ppfData.maturityMs
                  ? `Matures ${new Date(ppfData.maturityMs).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
                  : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>

            {ppfData.yearsElapsed != null && ppfData.yearsLeft != null && (
              <View>
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-[10px] text-tertiary">
                    {ppfData.yearsLeft > 0
                      ? `${Math.ceil(ppfData.yearsLeft)} yr${Math.ceil(ppfData.yearsLeft) !== 1 ? 's' : ''} to maturity`
                      : 'Matured'}
                  </Text>
                  {ppfData.projected != null && !masked && (
                    <Text className="text-xs font-semibold" style={{ color: '#8b5cf6' }}>
                      Proj. {formatCurrency(ppfData.projected)}
                    </Text>
                  )}
                </View>
                <ProgressBar value={Math.min(100, (ppfData.yearsElapsed / 15) * 100)} color="#8b5cf6" />
              </View>
            )}

            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-[10px] text-tertiary">This FY</Text>
                <Text className="text-[10px] text-secondary tabular-nums">
                  {!masked ? `₹${ppfData.fyDeposits.toLocaleString('en-IN')} / ₹1.5L` : `•••• / ₹1.5L`}
                  {ppfData.fyPct >= 100 && <Text className="ml-1 font-bold text-success"> ✓ Full</Text>}
                </Text>
              </View>
              <ProgressBar
                value={ppfData.fyPct}
                color={ppfData.fyPct >= 100 ? theme.success : ppfData.fyPct >= 75 ? '#8b5cf6' : theme.warning}
              />
            </View>

            {ppfData.showAprilTip && (
              <Banner variant="warning" icon="ti-calendar-event">
                Deposit before April 5 to earn interest for the full year
              </Banner>
            )}

            <View>
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Transactions</Text>
                <Pressable
                  onPress={() => setShowPpfTxSheet(true)}
                  className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#8b5cf615' }}
                >
                  <Icon name="ti-plus" size={11} color="#8b5cf6" />
                  <Text className="text-[10px] font-semibold" style={{ color: '#8b5cf6' }}>
                    Add
                  </Text>
                </Pressable>
              </View>

              {ppfData.sortedTxns.length === 0 ? (
                <Text className="text-[11px] text-tertiary">
                  No transactions yet. Tap Add to record your first deposit.
                </Text>
              ) : (
                <View className="gap-1">
                  {ppfData.sortedTxns.slice(0, 5).map((tx) => {
                    const txColor = txTypeColor[tx.type] ?? theme.textSecondary;
                    const showFifth = tx.type === 'deposit';
                    const before5 = isBeforeFifth(tx.date);
                    return (
                      <View key={tx.id} className="flex-row items-center gap-2">
                        <Text className="text-[10px] text-tertiary w-10 tabular-nums">
                          {new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Text>
                        <Text className="text-[10px]" style={{ color: txColor }}>
                          {txTypeLabel[tx.type]}
                        </Text>
                        <Text className="text-[10px] font-medium text-primary flex-1 tabular-nums text-right">
                          {!masked ? `₹${tx.amount.toLocaleString('en-IN')}` : '••••'}
                        </Text>
                        {showFifth && (
                          <Badge
                            label={before5 ? '≤5th' : '>5th'}
                            color={before5 ? theme.success : theme.warning}
                            size="sm"
                            rounded="md"
                          />
                        )}
                      </View>
                    );
                  })}
                  {ppfData.sortedTxns.length > 5 && (
                    <Text className="text-[10px] text-tertiary mt-0.5">
                      +{ppfData.sortedTxns.length - 5} more transactions
                    </Text>
                  )}
                </View>
              )}
            </View>
          </>
        )}

        {/* ── EPF content ── */}
        {holding.assetClass === 'epf' && epfData && (
          <>
            <Text className="text-xs text-secondary">
              {[
                '8.25% p.a.',
                meta.uan ? `UAN ••••${meta.uan.slice(-4)}` : null,
                epfData.currentEmployer?.companyName ?? null
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>

            <View className="border-t border-theme" />

            {/* Employment */}
            <View>
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Employment</Text>
                <Pressable
                  onPress={() => setShowEpfEmpSheet(true)}
                  className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: tint(theme.success) }}
                >
                  <Icon name="ti-plus" size={11} color={theme.success} />
                  <Text className="text-[10px] font-semibold" style={{ color: theme.success }}>
                    Add
                  </Text>
                </Pressable>
              </View>
              {(meta.epfEmployers ?? []).length === 0 ? (
                <Text className="text-[11px] text-tertiary">No employers added yet. Tap Add to start tracking.</Text>
              ) : (
                <View className="gap-1.5">
                  {[...(meta.epfEmployers ?? [])]
                    .sort((a, b) => {
                      const aCurrent = !a.toDate ? 0 : 1;
                      const bCurrent = !b.toDate ? 0 : 1;
                      if (aCurrent !== bCurrent) return aCurrent - bCurrent;
                      return b.fromDate - a.fromDate;
                    })
                    .map((emp) => {
                      const hikeCount = (emp.hikeTimeline ?? []).length;
                      return (
                        <View
                          key={emp.id}
                          className="flex-row items-center justify-between gap-2 rounded-xl px-3 py-2 bg-surface-2 border border-theme"
                        >
                          <View className="flex-1">
                            <View className="flex-row items-center flex-wrap gap-1.5">
                              <Text className="text-xs font-medium text-primary" numberOfLines={1}>
                                {emp.companyName}
                              </Text>
                              {!emp.toDate && <Badge label="Current" color={theme.success} size="sm" rounded="md" />}
                              {hikeCount > 0 && (
                                <Text
                                  className="text-[9px] font-medium px-1 py-0.5 rounded"
                                  style={{ backgroundColor: '#378add18', color: '#378add' }}
                                >
                                  {hikeCount} hike{hikeCount !== 1 ? 's' : ''}
                                </Text>
                              )}
                            </View>
                            <Text className="text-[10px] text-tertiary mt-0.5">
                              {epfMonthLabel(emp.fromDate)} – {emp.toDate ? epfMonthLabel(emp.toDate) : 'present'}
                              {' · '}
                              {epfMonthsBetween(emp.fromDate, emp.toDate ?? nowMs())} months
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => setEpfHikeEmpId(emp.id)}
                            className="flex-row items-center gap-0.5 px-1.5 py-1 rounded-lg border"
                            style={{ borderColor: '#378add30' }}
                          >
                            <Icon name="ti-plus" size={10} color="#378add" />
                            <Text className="text-[10px] font-semibold" style={{ color: '#378add' }}>
                              Hike
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                </View>
              )}
            </View>

            {/* Corpus breakdown — 3-col stat grid */}
            {(epfData.employeeTotal > 0 || epfData.employerTotal > 0 || epfData.interestEarned > 0) && (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <StatBox
                    size="sm"
                    label="Employee total"
                    value={!masked ? `₹${epfData.employeeTotal.toLocaleString('en-IN')}` : '••••'}
                  />
                </View>
                <View className="flex-1">
                  <StatBox
                    size="sm"
                    label="Employer total"
                    value={!masked ? `₹${epfData.employerTotal.toLocaleString('en-IN')}` : '••••'}
                  />
                </View>
                <View className="flex-1">
                  <StatBox
                    size="sm"
                    label="Interest earned"
                    valueColor={theme.success}
                    value={!masked ? `₹${epfData.interestEarned.toLocaleString('en-IN')}` : '••••'}
                  />
                </View>
              </View>
            )}

            {/* Monthly contribution breakdown */}
            {epfData.currentEmployer && (
              <View className="rounded-xl p-3 gap-1.5 bg-surface-2">
                <Text className="text-[10px] font-medium text-tertiary uppercase tracking-wide">
                  Monthly contribution
                </Text>
                <DetailRow
                  label={`Employee (${epfData.currentEmployer.employeeContribPct}%)`}
                  value={!masked ? `₹${epfData.monthlyEmployee.toLocaleString('en-IN')}` : '••••'}
                  size="md"
                />
                <DetailRow
                  label="Employer → EPF (3.67%)"
                  value={!masked ? `₹${epfData.monthlyEmployerEpf.toLocaleString('en-IN')}` : '••••'}
                  size="md"
                />
                <DetailRow
                  label="Employer → EPS pension (8.33%)"
                  value={
                    <Text style={{ color: '#94a3b8' }}>
                      {!masked ? `₹${epfData.monthlyEps.toLocaleString('en-IN')}` : '••••'}
                    </Text>
                  }
                  size="md"
                />
                <DetailRow
                  label={<Text className="font-semibold">Total to EPF/mo</Text>}
                  value={!masked ? `₹${epfData.monthlyTotalEpf.toLocaleString('en-IN')}` : '••••'}
                  size="md"
                  className="border-t border-theme pt-1.5"
                />
                <Text className="text-[10px] text-tertiary">
                  EPS goes to pension fund — not withdrawable, paid on retirement
                </Text>
              </View>
            )}

            {/* Retirement projection */}
            {epfData.yearsToRetirement != null && epfData.projectedCorpus != null && (
              <View>
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-[10px] font-medium text-tertiary uppercase tracking-wide">
                    Retirement at {EPF_RETIREMENT_AGE}
                  </Text>
                  <Text className="text-[10px] text-tertiary">{epfData.yearsToRetirement} yrs away</Text>
                </View>
                {!masked && (
                  <Text className="text-sm font-bold" style={{ color: '#378add' }}>
                    {formatCurrency(epfData.projectedCorpus)}
                  </Text>
                )}
                <View className="mt-1">
                  <ProgressBar
                    value={Math.min(100, ((EPF_RETIREMENT_AGE - epfData.yearsToRetirement) / EPF_RETIREMENT_AGE) * 100)}
                    color="#378add"
                  />
                </View>
              </View>
            )}
            {!meta.epfBirthYear && (
              <Text className="text-[10px] text-tertiary">
                Add your birth year in Track EPF to see retirement projection →
              </Text>
            )}

            {/* See all transactions row */}
            <View className="flex-row items-center justify-between pt-0.5">
              <Pressable onPress={() => setShowEpfAllTxSheet(true)} className="flex-row items-center gap-1.5">
                <Icon name="ti-list" size={14} color="#64748b" />
                <Text className="text-xs font-semibold" style={{ color: '#64748b' }}>
                  See all transactions
                </Text>
                {epfData.totalComputedMonths > 0 && (
                  <Text className="text-[10px] font-normal text-tertiary">({epfData.totalComputedMonths} months)</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setShowEpfTxSheet(true)}
                className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#64748b15' }}
              >
                <Icon name="ti-plus" size={11} color="#64748b" />
                <Text className="text-[10px] font-semibold" style={{ color: '#64748b' }}>
                  Add
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Footer */}
        <View className="flex-row items-center justify-between pt-0.5 border-t border-theme mt-0.5">
          <Text className="text-[10px] text-tertiary">{lastUpdatedText()}</Text>
          <View className="flex-row items-center gap-1.5">
            {isStale && staleBadge()}
            <Pressable onPress={onEdit}>
              <Text className="text-[10px] text-tertiary">Tap to edit</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      {/* PPF transaction sheet */}
      {showPpfTxSheet && (
        <PpfTransactionSheet
          holding={holding}
          onSave={async (updated) => {
            await onSave(updated);
            setShowPpfTxSheet(false);
          }}
          onClose={() => setShowPpfTxSheet(false)}
        />
      )}

      {/* EPF transaction sheet */}
      {showEpfTxSheet && (
        <EpfTransactionSheet
          holding={holding}
          onSave={async (updated) => {
            await onSave(updated);
            setShowEpfTxSheet(false);
          }}
          onClose={() => setShowEpfTxSheet(false)}
        />
      )}

      {/* EPF salary hike sheet */}
      {epfHikeEmpId && (
        <EpfSalaryHikeSheet
          holding={holding}
          empId={epfHikeEmpId}
          onSave={async (updated) => {
            await onSave(updated);
            setEpfHikeEmpId(null);
          }}
          onClose={() => setEpfHikeEmpId(null)}
        />
      )}

      {/* EPF employer sheet */}
      {showEpfEmpSheet && (
        <EpfEmployerSheet
          holding={holding}
          onSave={async (updated) => {
            await onSave(updated);
            setShowEpfEmpSheet(false);
          }}
          onClose={() => setShowEpfEmpSheet(false)}
        />
      )}

      {/* EPF all transactions sheet */}
      {showEpfAllTxSheet && (
        <EpfAllTransactionsSheet
          holding={holding}
          onAddTransaction={() => {
            setShowEpfAllTxSheet(false);
            setShowEpfTxSheet(true);
          }}
          onClose={() => setShowEpfAllTxSheet(false)}
        />
      )}
    </>
  );
}

// ─── Retirement card type configs ────────────────────────────────────────────

const RETIREMENT_CARD_CONFIG: Record<'nps' | 'ppf' | 'epf', { icon: string; color: string; description: string }> = {
  nps: {
    icon: 'ti-building-community',
    color: '#10b981',
    description: 'National Pension System — market-linked returns, tax-free on maturity (80CCD)'
  },
  ppf: {
    icon: 'ti-safe',
    color: '#8b5cf6',
    description: 'Public Provident Fund — 7.1% guaranteed, 15-yr lock-in, fully tax-free'
  },
  epf: {
    icon: 'ti-building-factory',
    color: '#64748b',
    description: 'Employee Provident Fund — 8.25% p.a., employee + employer contribution, tax-free'
  }
};

export function RetirementUntrackedCard({ type, onTrack }: { type: 'nps' | 'ppf' | 'epf'; onTrack: () => void }) {
  const cfg = RETIREMENT_CARD_CONFIG[type];
  const label = type.toUpperCase();
  return (
    <View className="bg-surface rounded-2xl px-4 py-3 border border-theme">
      <View className="flex-row items-center justify-between gap-2 mb-1.5">
        <View className="flex-row items-center gap-2.5">
          <IconBadge icon={cfg.icon} color={cfg.color} size="sm" bg={`${cfg.color}15`} />
          <Text className="text-sm font-semibold text-primary">{label}</Text>
        </View>
        <Pressable
          onPress={onTrack}
          className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: `${cfg.color}15` }}
        >
          <Icon name="ti-plus" size={12} color={cfg.color} />
          <Text className="text-xs font-semibold" style={{ color: cfg.color }}>
            {`Track ${label}`}
          </Text>
        </Pressable>
      </View>
      <Text className="text-xs text-secondary leading-relaxed">{cfg.description}</Text>
    </View>
  );
}
