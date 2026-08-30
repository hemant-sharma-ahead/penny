// Employer Detail popup (2026-08-30) — replaces the old behavior of tapping an employer row going
// straight into its transaction ledger. Real reported gap: "clicking on the tile opens all
// transactions popup... I think we should slightly change this and have a See All button. Clicking on
// the tile should open the company work details" — company identity, tenure, per-employer totals, and
// the full hike table now live HERE, reached by tapping the row; the transaction ledger is one explicit
// "See all transactions" tap away instead of the row's only destination.
//
// Takes `employerId`, not an `EpfEmployer` snapshot — always re-resolves the LIVE employer from
// `holding` by id on every render (2026-08-30 fix for a real "Save ratio doesn't work" report: the
// original version took a snapshot object captured at tap time, so a save made from a stacked child
// popup updated `holding` correctly but this modal kept rendering the STALE snapshot it was opened
// with). Renders nothing if the employer no longer exists (deleted from under it) rather than crashing.
import { useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal, Button, DetailRow, StatBox, DateInput, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { formatCompact, epochToDateInput } from '@/lib/formatters';
import {
  epfMonthLabel,
  epfMonthKeyOf,
  epfExperienceLabel,
  epfEmployerTotals,
  buildEpfHikeJourney,
  estimateGrossAndCtc,
  EPF_EMPLOYER_EPF_PCT,
  EPS_PCT,
  type EpfHikeJourneyPoint
} from '@/core/portfolio/epfCalculations';
import {
  getEpfBasicToGrossTable,
  lookupBasicToGrossPctForMonth,
  type EpfBasicToGrossTable
} from '@/core/portfolio/epfBasicToGrossRates';
import {
  getEpfIncomeTaxTable,
  estimateAnnualIncomeTax,
  isNewRegimeAvailable,
  type EpfIncomeTaxTable
} from '@/core/portfolio/epfIncomeTaxRates';
import type { Holding, EpfEmployer } from '@/core/db/types';
import { epfPendingTransferSuccessor } from './epfEmployerScoping';
import { EpfPendingTransferModal } from './EpfPendingTransferModal';

function nowMs(): number {
  return Date.now();
}

export function EpfEmployerDetailModal({
  holding,
  employerId,
  masked,
  onSave,
  onClose,
  onSeeAllTransactions,
  onAddHike
}: {
  holding: Holding;
  employerId: string;
  masked: boolean;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
  onSeeAllTransactions: () => void;
  onAddHike: () => void;
}) {
  const theme = useThemeColors();
  const allEmployers = holding.assetMeta?.epfEmployers ?? [];
  const allTransactions = holding.assetMeta?.epfTransactions ?? [];
  const employer = allEmployers.find((e) => e.id === employerId);

  // ── Editable exact dates ────────────────────────────────────────────────
  const [fromDraft, setFromDraft] = useState(() => (employer ? epochToDateInput(employer.fromDate) : ''));
  const [toDraft, setToDraft] = useState(() => (employer?.toDate ? epochToDateInput(employer.toDate) : ''));
  const [isCurrentDraft, setIsCurrentDraft] = useState(() => !employer?.toDate);
  const [savingDates, setSavingDates] = useState(false);

  const [showPendingTransfer, setShowPendingTransfer] = useState(false);
  const [hikeBreakdown, setHikeBreakdown] = useState<EpfHikeJourneyPoint | null>(null);
  const [hikeRatioDraft, setHikeRatioDraft] = useState('');
  const [savingHikeRatio, setSavingHikeRatio] = useState(false);
  // Fetched once — real reported gap: the CTC/Gross estimate always used ONE flat ratio regardless of
  // which year a hike happened in (see `epfBasicToGrossRates.ts`'s own doc comment for the real Nov
  // 2014 report this fixes). `null` just means the table hasn't loaded yet; `ratioForPoint` below
  // still works fine either way (falls back to the same flat default `estimateGrossAndCtc` always has).
  const [basicToGrossTable, setBasicToGrossTable] = useState<EpfBasicToGrossTable | null>(null);
  useEffect(() => {
    getEpfBasicToGrossTable()
      .then(setBasicToGrossTable)
      .catch(() => {});
  }, []);
  // Fetched once — real reported ask: "In Hand Monthly" should factor in real income tax, not just
  // employee EPF (see `epfIncomeTaxRates.ts`'s own doc comment for both regimes' full scope and every
  // simplification this makes). `null` just means the table hasn't loaded yet — the breakdown popup
  // simply doesn't show the In Hand row until it has.
  const [incomeTaxTable, setIncomeTaxTable] = useState<EpfIncomeTaxTable | null>(null);
  useEffect(() => {
    getEpfIncomeTaxTable()
      .then(setIncomeTaxTable)
      .catch(() => {});
  }, []);

  if (!employer) return null;

  const totals = epfEmployerTotals(employer, allEmployers, allTransactions);
  const journey = buildEpfHikeJourney(employer);
  const pendingSuccessor = epfPendingTransferSuccessor(employer, allEmployers, allTransactions);

  /** The ratio to use for a SPECIFIC hike point — an explicit per-employer override
   *  (`employer.basicToGrossPct`) always wins; otherwise looks up the FY-appropriate convention for
   *  that point's own date, not a single flat default applied to every point regardless of era. */
  function ratioForPoint(point: EpfHikeJourneyPoint): number | undefined {
    if (employer?.basicToGrossPct) return employer.basicToGrossPct;
    if (!basicToGrossTable) return undefined;
    return lookupBasicToGrossPctForMonth(basicToGrossTable, epfMonthKeyOf(point.date));
  }

  const datesChanged =
    fromDraft !== epochToDateInput(employer.fromDate) ||
    (isCurrentDraft ? !!employer.toDate : toDraft !== (employer.toDate ? epochToDateInput(employer.toDate) : ''));
  const fromMs = fromDraft ? new Date(`${fromDraft}T00:00:00`).getTime() : NaN;
  const toMs = toDraft ? new Date(`${toDraft}T00:00:00`).getTime() : NaN;
  const datesValid = Number.isFinite(fromMs) && (isCurrentDraft || (Number.isFinite(toMs) && toMs >= fromMs));

  async function handleSaveDates() {
    if (!employer || !datesValid || savingDates) return;
    setSavingDates(true);
    try {
      const base = { ...employer, fromDate: fromMs };
      const updatedEmp: EpfEmployer = isCurrentDraft
        ? (() => {
            const { toDate, ...withoutToDate } = base;
            void toDate;
            return withoutToDate;
          })()
        : { ...base, toDate: toMs };
      const updated: Holding = {
        ...holding,
        assetMeta: {
          ...holding.assetMeta,
          epfEmployers: allEmployers.map((e) => (e.id === employer.id ? updatedEmp : e))
        },
        updatedAt: Date.now()
      };
      await onSave(updated);
    } catch {
      // Leave the drafts as typed so the user can retry.
    } finally {
      setSavingDates(false);
    }
  }

  function openHikeBreakdown(point: EpfHikeJourneyPoint) {
    setHikeRatioDraft(String(ratioForPoint(point) ?? ''));
    setHikeBreakdown(point);
  }

  async function handleSaveHikeRatio() {
    if (!employer || savingHikeRatio) return;
    const pct = Number(hikeRatioDraft.trim());
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return;
    setSavingHikeRatio(true);
    try {
      const updated: Holding = {
        ...holding,
        assetMeta: {
          ...holding.assetMeta,
          epfEmployers: allEmployers.map((e) => (e.id === employer.id ? { ...e, basicToGrossPct: pct } : e))
        },
        updatedAt: Date.now()
      };
      await onSave(updated);
      setHikeBreakdown(null);
    } catch {
      // Leave the popup open so the user can retry.
    } finally {
      setSavingHikeRatio(false);
    }
  }

  return (
    <>
      <Modal onClose={onClose} title={employer.companyName} scrollable>
        <View className="-mt-2 gap-3">
          {/* Pending-transfer PILL only (2026-08-30) — the actual resolution flow moved out to its own
              `EpfPendingTransferModal`, reachable from here OR directly from the card tile's own
              identical pill. Keeping the flow in one place only, not duplicated. */}
          {pendingSuccessor && (
            <Pressable
              onPress={() => setShowPendingTransfer(true)}
              className="flex-row items-center gap-1.5 self-start px-2 py-1 rounded-full"
              style={{ backgroundColor: tint(theme.info, 15) }}
            >
              <Icon name="ti-transfer" size={11} color={theme.info} />
              <Text className="text-[10px] font-bold" style={{ color: theme.info }}>
                Pending transfer
              </Text>
              <Icon name="ti-chevron-right" size={10} color={theme.info} />
            </Pressable>
          )}

          <View className="gap-2">
            <View className="flex-row gap-2">
              <View className="flex-1">
                <DateInput label="Started" value={fromDraft} onChange={setFromDraft} maximumDate={new Date()} />
              </View>
              <View className="flex-1">
                <DateInput
                  label="Left"
                  value={isCurrentDraft ? '' : toDraft}
                  onChange={setToDraft}
                  disabled={isCurrentDraft}
                  placeholder={isCurrentDraft ? 'Present' : undefined}
                />
              </View>
            </View>
            <Pressable
              onPress={() => {
                setIsCurrentDraft((v) => !v);
                if (!isCurrentDraft) setToDraft('');
              }}
              className="flex-row items-center gap-1.5"
            >
              <View
                className="w-4 h-4 rounded items-center justify-center border"
                style={{
                  borderColor: isCurrentDraft ? theme.success : theme.border,
                  backgroundColor: isCurrentDraft ? theme.success : 'transparent'
                }}
              >
                {isCurrentDraft && <Icon name="ti-check" size={10} color="#fff" />}
              </View>
              <Text className="text-[11px] text-secondary">Current employer (no end date)</Text>
            </Pressable>
            <DetailRow
              label="Experience"
              value={epfExperienceLabel(
                fromMs || employer.fromDate,
                isCurrentDraft ? nowMs() : toMs || employer.toDate || nowMs()
              )}
              size="sm"
            />
            {employer.establishmentId && (
              <DetailRow label="Establishment ID" value={employer.establishmentId} size="sm" />
            )}
            {employer.memberId && <DetailRow label="Member ID" value={employer.memberId} size="sm" />}
            {datesChanged && (
              <Button
                variant="primary"
                size="sm"
                fullWidth
                loading={savingDates}
                disabled={savingDates || !datesValid}
                onPress={handleSaveDates}
              >
                Save dates
              </Button>
            )}
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <StatBox
                size="sm"
                label="Employee total"
                value={!masked ? `₹${totals.employeeTotal.toLocaleString('en-IN')}` : '••••'}
              />
            </View>
            <View className="flex-1">
              <StatBox
                size="sm"
                label="Employer total"
                value={!masked ? `₹${totals.employerTotal.toLocaleString('en-IN')}` : '••••'}
              />
            </View>
            <View className="flex-1">
              <StatBox
                size="sm"
                label="Pension total"
                valueColor={theme.textSecondary}
                value={!masked ? `₹${totals.pensionTotal.toLocaleString('en-IN')}` : '••••'}
              />
            </View>
            <View className="flex-1">
              <StatBox
                size="sm"
                label="Interest earned"
                valueColor={theme.success}
                value={!masked ? `₹${totals.interestEarned.toLocaleString('en-IN')}` : '••••'}
              />
            </View>
          </View>

          {journey.length > 0 && (
            <View>
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Salary hikes</Text>
                <Pressable
                  onPress={onAddHike}
                  className="flex-row items-center gap-0.5 px-1.5 py-1 rounded-lg border"
                  style={{ borderColor: '#378add30' }}
                >
                  <Icon name="ti-plus" size={10} color="#378add" />
                  <Text className="text-[10px] font-semibold" style={{ color: '#378add' }}>
                    Add
                  </Text>
                </Pressable>
              </View>
              <View className="rounded-xl bg-surface-2 px-3 pb-1 pt-1 border border-theme">
                <View className="flex-row items-center pb-1 border-b border-theme">
                  <Text className="flex-[1.3] text-[8px] font-bold text-tertiary uppercase">Month</Text>
                  <Text className="flex-1 text-[8px] font-bold text-tertiary uppercase text-right">Est CTC</Text>
                  <Text className="flex-1 text-[8px] font-bold text-tertiary uppercase text-right">Est Gross</Text>
                  <Text className="flex-1 text-[8px] font-bold text-tertiary uppercase text-right">Net Monthly</Text>
                </View>
                {journey.map((point, idx) => {
                  const monthlyEmployee = Math.round(point.basicSalary * (employer.employeeContribPct / 100));
                  const monthlyEmployerEpf = Math.round(point.basicSalary * EPF_EMPLOYER_EPF_PCT);
                  const monthlyEps = Math.round(point.basicSalary * EPS_PCT);
                  const gc = estimateGrossAndCtc(
                    point.basicSalary,
                    monthlyEmployee,
                    monthlyEmployerEpf,
                    monthlyEps,
                    ratioForPoint(point)
                  );
                  return (
                    <Pressable
                      key={`${employer.id}-journey-${idx}`}
                      onPress={() => openHikeBreakdown(point)}
                      className="flex-row items-center py-1.5 border-b border-dashed border-theme"
                    >
                      <View className="flex-[1.3]">
                        <Text className="text-[10px] font-semibold text-primary">{epfMonthLabel(point.date)}</Text>
                        <Text className="text-[8px] text-tertiary">
                          {point.isJoined
                            ? 'Joined'
                            : point.growthPct !== null && !masked
                              ? `+${point.growthPct.toFixed(1)}%`
                              : undefined}
                        </Text>
                      </View>
                      <Text className="flex-1 text-[10px] font-bold text-primary text-right tabular-nums">
                        {!masked ? formatCompact(gc.annualCtc) : '••••'}
                      </Text>
                      <Text className="flex-1 text-[10px] font-bold text-primary text-right tabular-nums">
                        {!masked ? formatCompact(gc.annualGross) : '••••'}
                      </Text>
                      <Text className="flex-1 text-[10px] font-bold text-primary text-right tabular-nums">
                        {!masked ? formatCompact(gc.netMonthly) : '••••'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Button variant="secondary" fullWidth icon="ti-list" onPress={onSeeAllTransactions}>
            See all transactions
          </Button>
        </View>
      </Modal>

      {showPendingTransfer && (
        <EpfPendingTransferModal
          holding={holding}
          employer={employer}
          onSave={onSave}
          onClose={() => setShowPendingTransfer(false)}
        />
      )}

      {hikeBreakdown &&
        (() => {
          const point = hikeBreakdown;
          const monthlyEmployee = Math.round(point.basicSalary * (employer.employeeContribPct / 100));
          const monthlyEmployerEpf = Math.round(point.basicSalary * EPF_EMPLOYER_EPF_PCT);
          const monthlyEps = Math.round(point.basicSalary * EPS_PCT);
          const gc = estimateGrossAndCtc(
            point.basicSalary,
            monthlyEmployee,
            monthlyEmployerEpf,
            monthlyEps,
            ratioForPoint(point)
          );
          // Real reported ask: "In Hand Monthly" should factor in real income tax, not just employee
          // EPF (`gc.netMonthly` only ever subtracted that). `null` while the table hasn't loaded yet.
          // Both regimes are computed (2026-08-30 fix — a real, direct question caught that the first
          // version only ever showed the New Regime, silently assuming that's what everyone was on
          // from FY2020-21 onward; a taxpayer can choose either every year since) — shown side by
          // side whenever the New Regime even existed yet for this point's own month, so neither one
          // is presented as the single, asserted answer.
          const pointMonth = epfMonthKeyOf(point.date);
          const newRegimeAvailable = incomeTaxTable ? isNewRegimeAvailable(incomeTaxTable, pointMonth) : false;
          const taxNew =
            incomeTaxTable && newRegimeAvailable
              ? estimateAnnualIncomeTax(gc.annualGross, incomeTaxTable, pointMonth, 'new')
              : null;
          const taxOld = incomeTaxTable
            ? estimateAnnualIncomeTax(gc.annualGross, incomeTaxTable, pointMonth, 'old')
            : null;
          const monthlyTaxNew = taxNew ? Math.round(taxNew.totalTax / 12) : null;
          const monthlyTaxOld = taxOld ? Math.round(taxOld.totalTax / 12) : null;
          const inHandNew = monthlyTaxNew !== null ? Math.max(0, gc.netMonthly - monthlyTaxNew) : null;
          const inHandOld = monthlyTaxOld !== null ? Math.max(0, gc.netMonthly - monthlyTaxOld) : null;
          return (
            <Modal onClose={() => setHikeBreakdown(null)} title={`${epfMonthLabel(point.date)} breakdown`} size="sm">
              <View className="-mt-2">
                <Text className="text-xs text-tertiary">
                  {employer.companyName} · Basic ₹{point.basicSalary.toLocaleString('en-IN')}/mo
                </Text>
              </View>
              <View className="flex-row gap-2 rounded-xl border p-3" style={{ borderColor: theme.border }}>
                <Icon name="ti-info-circle" size={15} color={theme.textTertiary} />
                <Text className="text-[11px] text-secondary flex-1 leading-relaxed">
                  Penny doesn&apos;t know your real Gross/CTC split for this point — this is an estimate using a{' '}
                  {gc.basicToGrossPct}% Basic-to-Gross ratio, the typical convention for {epfMonthLabel(point.date)}{' '}
                  (payroll structures commonly moved to a 50%-of-Gross floor once the Code on Wages 2019 took effect).
                  Edit it below if you know your real one; it applies to every point for {employer.companyName}, not
                  just this one.
                </Text>
              </View>
              <TextInput
                label="Basic is what % of Gross?"
                hint={`convention for this era: ${ratioForPoint(point) ?? gc.basicToGrossPct}%`}
                keyboardType="numeric"
                value={hikeRatioDraft}
                onChange={setHikeRatioDraft}
              />
              <View className="border-t border-theme" />
              <DetailRow
                label="Gross (monthly)"
                value={`₹${gc.basicSalary.toLocaleString('en-IN')} ÷ ${gc.basicToGrossPct}% = ₹${gc.estimatedGross.toLocaleString('en-IN')}`}
                size="sm"
              />
              <DetailRow
                label="CTC (monthly)"
                value={`Gross + EPF (₹${gc.monthlyEmployerEpf.toLocaleString('en-IN')}) + EPS (₹${gc.monthlyEps.toLocaleString('en-IN')}) + Gratuity (₹${gc.monthlyGratuityAccrual.toLocaleString('en-IN')}) = ₹${gc.estimatedCtc.toLocaleString('en-IN')}`}
                size="sm"
              />
              <DetailRow
                label={<Text className="font-semibold">Est. CTC (annual)</Text>}
                value={`₹${gc.estimatedCtc.toLocaleString('en-IN')} × 12 = ₹${gc.annualCtc.toLocaleString('en-IN')}`}
                size="sm"
              />
              <DetailRow
                label={<Text className="font-semibold">Est. Gross (annual)</Text>}
                value={`₹${gc.estimatedGross.toLocaleString('en-IN')} × 12 = ₹${gc.annualGross.toLocaleString('en-IN')}`}
                size="sm"
              />
              <DetailRow
                label={<Text className="font-semibold">Net Monthly</Text>}
                value={`Gross − Employee EPF (₹${gc.monthlyEmployeeContribution.toLocaleString('en-IN')}) = ₹${gc.netMonthly.toLocaleString('en-IN')}`}
                size="sm"
              />
              <Text className="text-[9.5px] text-tertiary leading-relaxed">
                Net Monthly doesn&apos;t subtract income tax — see In Hand Monthly below for that.
              </Text>
              {taxOld && monthlyTaxOld !== null && inHandOld !== null && (
                <>
                  <View className="border-t border-theme" />
                  {newRegimeAvailable && taxNew && monthlyTaxNew !== null && inHandNew !== null ? (
                    <>
                      <Text
                        className="text-[9.5px] font-extrabold uppercase tracking-wide"
                        style={{ color: theme.info }}
                      >
                        New regime
                      </Text>
                      <DetailRow
                        label="Income tax + cess (monthly)"
                        value={`₹${taxNew.taxableIncome.toLocaleString('en-IN')} taxable × slab = ₹${monthlyTaxNew.toLocaleString('en-IN')}`}
                        size="sm"
                      />
                      <DetailRow
                        label={<Text className="font-semibold">In Hand Monthly</Text>}
                        value={`Net Monthly − Tax (₹${monthlyTaxNew.toLocaleString('en-IN')}) = ₹${inHandNew.toLocaleString('en-IN')}`}
                        size="sm"
                      />
                      <Text
                        className="text-[9.5px] font-extrabold uppercase tracking-wide mt-1.5"
                        style={{ color: theme.warning }}
                      >
                        Old regime (no 80C/HRA/other deductions)
                      </Text>
                      <DetailRow
                        label="Income tax + cess (monthly)"
                        value={`₹${taxOld.taxableIncome.toLocaleString('en-IN')} taxable × slab = ₹${monthlyTaxOld.toLocaleString('en-IN')}`}
                        size="sm"
                      />
                      <DetailRow
                        label={<Text className="font-semibold">In Hand Monthly</Text>}
                        value={`Net Monthly − Tax (₹${monthlyTaxOld.toLocaleString('en-IN')}) = ₹${inHandOld.toLocaleString('en-IN')}`}
                        size="sm"
                      />
                      <Text className="text-[9.5px] text-tertiary leading-relaxed">
                        Both regimes were a genuine choice for this year — shown side by side rather than picking one
                        for you. Old Regime here assumes ZERO 80C/HRA/other deductions (Penny has no data on what
                        you&apos;d actually claim), so it&apos;s an upper bound on what an Old Regime filer would really
                        owe, not their real figure — labelled estimates either way, not your real payslip.
                      </Text>
                    </>
                  ) : (
                    <>
                      <DetailRow
                        label="Income tax + cess (monthly)"
                        value={`₹${taxOld.taxableIncome.toLocaleString('en-IN')} taxable × slab = ₹${monthlyTaxOld.toLocaleString('en-IN')}`}
                        size="sm"
                      />
                      <DetailRow
                        label={<Text className="font-semibold">In Hand Monthly</Text>}
                        value={`Net Monthly − Tax (₹${monthlyTaxOld.toLocaleString('en-IN')}) = ₹${inHandOld.toLocaleString('en-IN')}`}
                        size="sm"
                      />
                      <Text className="text-[9.5px] text-tertiary leading-relaxed">
                        The New Regime didn&apos;t exist yet for {epfMonthLabel(point.date)} — this was the only regime.
                        A labelled estimate, not your real payslip figure.
                      </Text>
                    </>
                  )}
                </>
              )}
              <Button
                variant="primary"
                fullWidth
                loading={savingHikeRatio}
                disabled={savingHikeRatio || Number(hikeRatioDraft) === gc.basicToGrossPct}
                onPress={handleSaveHikeRatio}
              >
                Save ratio
              </Button>
            </Modal>
          );
        })()}
    </>
  );
}
