import { useState, useEffect, useMemo } from 'react';
import { Card, IconBadge, DetailRow, ProgressBar, Badge, Banner, StatBox } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { STATUS, tint } from '@/lib/statusColors';
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
import { ASSET_META } from '@/features/portfolio/holdings/shared/registry';
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
    const color = days >= 60 ? STATUS.danger : STATUS.warning;
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
      <Card className="flex flex-col gap-2.5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <button onClick={onEdit} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
            <IconBadge icon={assetMeta.icon} color={assetMeta.color} size="sm" bg={`${assetMeta.color}15`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary truncate">{holding.name}</p>
              <p className="text-xs text-tertiary mt-0.5">{assetMeta.label}</p>
            </div>
          </button>
          <button onClick={onEdit} className="text-right flex-shrink-0">
            <div className="flex items-center gap-1.5 justify-end">
              {showLiveCorpus && <Badge label="Live" color={STATUS.success} size="sm" rounded="md" />}
              {npsNavLoading && (
                <div
                  className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
                />
              )}
            </div>
            <p className="text-base font-bold text-primary tabular-nums">
              {!masked ? formatCurrency(displayValue) : '••••'}
            </p>
            {showLiveCorpus && !masked && (
              <p className="text-[10px] text-tertiary mt-0.5">
                {(holding.units ?? 0).toFixed(4)} units × ₹{npsNav?.nav.toFixed(4)}
              </p>
            )}
            {holding.assetClass === 'epf' && <p className="text-[10px] text-tertiary mt-0.5">corpus</p>}
          </button>
        </div>

        {/* ── NPS content ── */}
        {holding.assetClass === 'nps' && (
          <>
            <p className="text-xs text-secondary leading-relaxed">{npsDetailLine()}</p>

            {meta.npsChoiceType === 'active' && npsNav && (
              <div className="flex gap-3">
                {npsNav.oneYear != null && (
                  <div>
                    <p className="text-[9px] text-tertiary">1Y return</p>
                    <p
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: npsNav.oneYear >= 0 ? STATUS.success : STATUS.danger }}
                    >
                      {npsNav.oneYear >= 0 ? '+' : ''}
                      {npsNav.oneYear.toFixed(1)}%
                    </p>
                  </div>
                )}
                {npsNav.threeYear != null && (
                  <div>
                    <p className="text-[9px] text-tertiary">3Y return</p>
                    <p
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: npsNav.threeYear >= 0 ? STATUS.success : STATUS.danger }}
                    >
                      {npsNav.threeYear >= 0 ? '+' : ''}
                      {npsNav.threeYear.toFixed(1)}%
                    </p>
                  </div>
                )}
                {npsNav.fiveYear != null && (
                  <div>
                    <p className="text-[9px] text-tertiary">5Y return</p>
                    <p
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: npsNav.fiveYear >= 0 ? STATUS.success : STATUS.danger }}
                    >
                      {npsNav.fiveYear >= 0 ? '+' : ''}
                      {npsNav.fiveYear.toFixed(1)}%
                    </p>
                  </div>
                )}
                {npsNav.date && (
                  <div>
                    <p className="text-[9px] text-tertiary">NAV date</p>
                    <p className="text-xs text-secondary">{npsNav.date}</p>
                  </div>
                )}
              </div>
            )}

            {meta.npsChoiceType === 'auto' && lifecycleAlloc && (
              <div className="flex items-center justify-between">
                <AllocationPills
                  equity={lifecycleAlloc.equity}
                  corporate={lifecycleAlloc.corporate}
                  govt={lifecycleAlloc.govt}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewSchedule();
                  }}
                  className="text-[10px] font-medium ml-2 flex-shrink-0"
                  style={{ color: 'var(--color-primary)' }}
                >
                  View schedule →
                </button>
              </div>
            )}

            {meta.npsChoiceType === 'auto' && meta.npsLifecycleFund && !meta.npsBirthYear && (
              <p className="text-[10px] text-tertiary">Add your birth year to see current allocation →</p>
            )}

            {meta.pran && <p className="text-xs text-tertiary">PRAN: {meta.pran}</p>}
          </>
        )}

        {/* ── PPF content ── */}
        {holding.assetClass === 'ppf' && ppfData && (
          <>
            {/* Sub-line: bank + dates */}
            <p className="text-xs text-secondary">
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
            </p>

            {/* Maturity progress bar */}
            {ppfData.yearsElapsed != null && ppfData.yearsLeft != null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-tertiary">
                    {ppfData.yearsLeft > 0
                      ? `${Math.ceil(ppfData.yearsLeft)} yr${Math.ceil(ppfData.yearsLeft) !== 1 ? 's' : ''} to maturity`
                      : 'Matured'}
                  </p>
                  {ppfData.projected != null && !masked && (
                    <p className="text-xs font-semibold" style={{ color: '#8b5cf6' }}>
                      Proj. {formatCurrency(ppfData.projected)}
                    </p>
                  )}
                </div>
                <ProgressBar value={Math.min(100, (ppfData.yearsElapsed / 15) * 100)} color="#8b5cf6" animate />
              </div>
            )}

            {/* This FY bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-tertiary">This FY</p>
                <p className="text-[10px] text-secondary tabular-nums">
                  {!masked ? `₹${ppfData.fyDeposits.toLocaleString('en-IN')} / ₹1.5L` : `•••• / ₹1.5L`}
                  {ppfData.fyPct >= 100 && <span className="ml-1 font-bold text-success">✓ Full</span>}
                </p>
              </div>
              <ProgressBar
                value={ppfData.fyPct}
                color={ppfData.fyPct >= 100 ? STATUS.success : ppfData.fyPct >= 75 ? '#8b5cf6' : STATUS.warning}
                animate
              />
            </div>

            {/* April 5th tip */}
            {ppfData.showAprilTip && (
              <Banner variant="warning" icon="ti-calendar-event">
                Deposit before April 5 to earn interest for the full year
              </Banner>
            )}

            {/* Transaction list */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Transactions</p>
                <button
                  onClick={() => setShowPpfTxSheet(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}
                >
                  <i className="ti ti-plus" style={{ fontSize: 11 }} aria-hidden="true" />
                  Add
                </button>
              </div>

              {ppfData.sortedTxns.length === 0 ? (
                <p className="text-[11px] text-tertiary">No transactions yet. Tap Add to record your first deposit.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {ppfData.sortedTxns.slice(0, 5).map((tx) => {
                    const txColor = txTypeColor[tx.type] ?? 'var(--color-text-secondary)';
                    const showFifth = tx.type === 'deposit';
                    const before5 = isBeforeFifth(tx.date);
                    return (
                      <div key={tx.id} className="flex items-center gap-2">
                        <p className="text-[10px] text-tertiary w-10 flex-shrink-0 tabular-nums">
                          {new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                        <p className="text-[10px] flex-shrink-0" style={{ color: txColor }}>
                          {txTypeLabel[tx.type]}
                        </p>
                        <p className="text-[10px] font-medium text-primary flex-1 tabular-nums text-right">
                          {!masked ? `₹${tx.amount.toLocaleString('en-IN')}` : '••••'}
                        </p>
                        {showFifth && (
                          <span className="flex-shrink-0">
                            <Badge
                              label={before5 ? '≤5th' : '>5th'}
                              color={before5 ? STATUS.success : STATUS.warning}
                              size="sm"
                              rounded="md"
                            />
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {ppfData.sortedTxns.length > 5 && (
                    <p className="text-[10px] text-tertiary mt-0.5">
                      +{ppfData.sortedTxns.length - 5} more transactions
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── EPF content ── */}
        {holding.assetClass === 'epf' && epfData && (
          <>
            {/* Sub-line */}
            <p className="text-xs text-secondary">
              {[
                '8.25% p.a.',
                meta.uan ? `UAN ••••${meta.uan.slice(-4)}` : null,
                epfData.currentEmployer?.companyName ?? null
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <div className="border-t border-theme" />

            {/* Employment */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Employment</p>
                <button
                  onClick={() => setShowEpfEmpSheet(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: tint(STATUS.success), color: STATUS.success }}
                >
                  <i className="ti ti-plus" style={{ fontSize: 11 }} aria-hidden="true" />
                  Add
                </button>
              </div>
              {(meta.epfEmployers ?? []).length === 0 ? (
                <p className="text-[11px] text-tertiary">No employers added yet. Tap Add to start tracking.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[...(meta.epfEmployers ?? [])]
                    .sort((a, b) => {
                      // Current employer (no toDate) always first, then descending by fromDate
                      const aCurrent = !a.toDate ? 0 : 1;
                      const bCurrent = !b.toDate ? 0 : 1;
                      if (aCurrent !== bCurrent) return aCurrent - bCurrent;
                      return b.fromDate - a.fromDate;
                    })
                    .map((emp) => {
                      const hikeCount = (emp.hikeTimeline ?? []).length;
                      return (
                        <div
                          key={emp.id}
                          className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 bg-surface-2 border border-theme"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-primary truncate">
                              {emp.companyName}
                              {!emp.toDate && (
                                <span className="ml-1.5">
                                  <Badge label="Current" color={STATUS.success} size="sm" rounded="md" />
                                </span>
                              )}
                              {hikeCount > 0 && (
                                <span
                                  className="ml-1.5 text-[9px] font-medium px-1 py-0.5 rounded"
                                  style={{ backgroundColor: '#378add18', color: '#378add' }}
                                >
                                  {hikeCount} hike{hikeCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-tertiary mt-0.5">
                              {epfMonthLabel(emp.fromDate)} – {emp.toDate ? epfMonthLabel(emp.toDate) : 'present'}
                              {' · '}
                              {epfMonthsBetween(emp.fromDate, emp.toDate ?? nowMs())} months
                            </p>
                          </div>
                          <button
                            onClick={() => setEpfHikeEmpId(emp.id)}
                            className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-1 rounded-lg border flex-shrink-0"
                            style={{ color: '#378add', borderColor: '#378add30' }}
                          >
                            <i className="ti ti-plus" style={{ fontSize: 10 }} aria-hidden="true" />
                            Hike
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Corpus breakdown — 3-col stat grid */}
            {(epfData.employeeTotal > 0 || epfData.employerTotal > 0 || epfData.interestEarned > 0) && (
              <div className="grid grid-cols-3 gap-2">
                <StatBox
                  size="sm"
                  label="Employee total"
                  value={!masked ? `₹${epfData.employeeTotal.toLocaleString('en-IN')}` : '••••'}
                />
                <StatBox
                  size="sm"
                  label="Employer total"
                  value={!masked ? `₹${epfData.employerTotal.toLocaleString('en-IN')}` : '••••'}
                />
                <StatBox
                  size="sm"
                  label="Interest earned"
                  valueColor={STATUS.success}
                  value={!masked ? `₹${epfData.interestEarned.toLocaleString('en-IN')}` : '••••'}
                />
              </div>
            )}

            {/* Monthly contribution breakdown */}
            {epfData.currentEmployer && (
              <div className="rounded-xl p-3 flex flex-col gap-1.5 bg-surface-2">
                <p className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Monthly contribution</p>
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
                    <span style={{ color: '#94a3b8' }}>
                      {!masked ? `₹${epfData.monthlyEps.toLocaleString('en-IN')}` : '••••'}
                    </span>
                  }
                  size="md"
                />
                <DetailRow
                  label={<span className="font-semibold">Total to EPF/mo</span>}
                  value={!masked ? `₹${epfData.monthlyTotalEpf.toLocaleString('en-IN')}` : '••••'}
                  size="md"
                  className="border-t border-theme pt-1.5"
                />
                <p className="text-[10px] text-tertiary">
                  EPS goes to pension fund — not withdrawable, paid on retirement
                </p>
              </div>
            )}

            {/* Retirement projection */}
            {epfData.yearsToRetirement != null && epfData.projectedCorpus != null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-medium text-tertiary uppercase tracking-wide">
                    Retirement at {EPF_RETIREMENT_AGE}
                  </p>
                  <p className="text-[10px] text-tertiary">{epfData.yearsToRetirement} yrs away</p>
                </div>
                {!masked && (
                  <p className="text-sm font-bold" style={{ color: '#378add' }}>
                    {formatCurrency(epfData.projectedCorpus)}
                  </p>
                )}
                <div className="mt-1">
                  <ProgressBar
                    value={Math.min(100, ((EPF_RETIREMENT_AGE - epfData.yearsToRetirement) / EPF_RETIREMENT_AGE) * 100)}
                    color="#378add"
                  />
                </div>
              </div>
            )}
            {!meta.epfBirthYear && (
              <p className="text-[10px] text-tertiary">
                Add your birth year in Track EPF to see retirement projection →
              </p>
            )}

            {/* See all transactions row */}
            <div className="flex items-center justify-between pt-0.5">
              <button
                onClick={() => setShowEpfAllTxSheet(true)}
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: '#64748b' }}
              >
                <i className="ti ti-list" style={{ fontSize: 14 }} aria-hidden="true" />
                See all transactions
                {epfData.totalComputedMonths > 0 && (
                  <span className="text-[10px] font-normal text-tertiary">({epfData.totalComputedMonths} months)</span>
                )}
              </button>
              <button
                onClick={() => setShowEpfTxSheet(true)}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#64748b15', color: '#64748b' }}
              >
                <i className="ti ti-plus" style={{ fontSize: 11 }} aria-hidden="true" />
                Add
              </button>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-0.5 border-t border-theme mt-0.5">
          <p className="text-[10px] text-tertiary">{lastUpdatedText()}</p>
          <div className="flex items-center gap-1.5">
            {isStale && staleBadge()}
            <button onClick={onEdit} className="text-[10px] text-tertiary">
              Tap to edit
            </button>
          </div>
        </div>
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
    <div className="surface rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={cfg.icon} color={cfg.color} size="sm" bg={`${cfg.color}15`} />
          <p className="text-sm font-semibold text-primary">{label}</p>
        </div>
        <button
          onClick={onTrack}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
          style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
        >
          <i className="ti ti-plus" style={{ fontSize: 12 }} aria-hidden="true" />
          Track {label}
        </button>
      </div>
      <p className="text-xs text-secondary leading-relaxed">{cfg.description}</p>
    </div>
  );
}
