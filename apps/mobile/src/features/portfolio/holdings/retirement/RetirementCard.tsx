import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Pressable, ActivityIndicator, Text, Platform } from 'react-native';
import { Card, IconBadge, DetailRow, ProgressBar, Badge, StatBox, Button, Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
import { tint, ink } from '~/lib/color';
import { formatCurrency, formatCompact } from '@/lib/formatters';
import { DAY_MS } from '@/lib/date';
import { LIFECYCLE_FUNDS, getAllocationAtAge, findNpsSchemeCode, fetchNpsNav, getPfmLabel } from '@/core/nps';
import type { NpsLifecycleFund, NpsNavDetail, NpsPfmKey, NpsSchemeType } from '@/core/nps';
import { ppfBuildCardData, ppfWithdrawalEligibility } from '@/core/portfolio/ppfCalculations';
import {
  EPF_RETIREMENT_AGE,
  EPF_EMPLOYER_EPF_PCT,
  EPS_PCT,
  epfMonthsBetween,
  epfMonthLabel,
  epfMonthKeyOf,
  epfBuildCardData,
  epfComputeAllMonths,
  epfLastRealEvidenceMs,
  estimateGrossAndCtc,
  buildEpfHikeJourney
} from '@/core/portfolio/epfCalculations';
import { getEpfRateTable, type EpfRateTable } from '@/core/portfolio/epfInterestRates';
import { getPpfRateTable, type PpfRateTable } from '@/core/portfolio/ppfInterestRates';
import { buildEpfExcelExport, type EpfExcelExportInput } from '@/core/portfolio/epfExcelExport';
import type { Holding, EpfEmployer } from '@/core/db/types';
import { ASSET_META } from '../shared/registry';
import {
  AllocationPills,
  PpfTransactionSheet,
  PpfAllTransactionsSheet,
  PpfInfoModal,
  EpfTransactionSheet,
  EpfEmployerSheet,
  EpfAllTransactionsSheet,
  EpfSalaryHikeSheet,
  EpfMonthEdgeConfirm
} from './RetirementSheets';
import { findMissingInterestFys, findEmployersNeedingEmploymentConfirmation, fyLabel } from './epfInterestOnDemand';
import { findAllReviewFlags } from './epfReviewFlags';
import { pickAndParseEpfFiles, type EpfImportFile } from './epfImportLogic';
import { EpfImportFlow } from './EpfImportFlow';
import { EpfEmployerPickerSheet } from './EpfEmployerPickerSheet';
import { PpfImportFlow } from './PpfImportFlow';
import { findMissingPpfInterestFys } from './ppfInterestOnDemand';
import { findAllPpfReviewFlags } from './ppfReviewFlags';

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
  const [showPpfAllTxSheet, setShowPpfAllTxSheet] = useState(false);
  // Opens `PpfImportFlow` in its own initial "pick a file" step (mirrors bank-import's
  // `SetupStep.tsx`: a Penny screen shown FIRST, with an explicit upload action, never the OS file
  // picker firing the instant "Import" is tapped) — the flow owns picking/parsing the file itself.
  const [showPpfImport, setShowPpfImport] = useState(false);
  // Which FY's nudge banner opened the transaction sheet, if any — mirrors EPF's `epfNudgeFy`.
  const [ppfNudgeFy, setPpfNudgeFy] = useState<number | null>(null);
  // Fetched once — used for the FY-end nudge's "is this year's interest actually missing" check and
  // the "N need review" card-level count/row badges. A null table just means neither can be computed
  // yet (never shown as "0 missing"/"0 need review", see the JSX below).
  const [ppfRateTable, setPpfRateTable] = useState<PpfRateTable | null>(null);
  // Which of the three "i" info-icon modals is open, if any — This-FY deposit rules, Withdrawal
  // rules, Maturity options (ppf-card-redesign-v1.html §4 + this session's Maturity-tile addition,
  // same visual pattern reused verbatim, no new mockup needed for that third one). Mutually
  // exclusive by construction — only one Pressable "i" can be tapped at a time.
  const [showPpfThisFyInfo, setShowPpfThisFyInfo] = useState(false);
  const [showPpfWithdrawInfo, setShowPpfWithdrawInfo] = useState(false);
  const [showPpfMaturityInfo, setShowPpfMaturityInfo] = useState(false);

  useEffect(() => {
    if (holding.assetClass !== 'ppf') return;
    getPpfRateTable()
      .then(setPpfRateTable)
      .catch(() => {});
  }, [holding.assetClass]);

  // PPF computed values — Date.now() lives inside ppfBuildCardData (module-level)
  const ppfData = useMemo(
    () => (holding.assetClass === 'ppf' ? ppfBuildCardData(holding.assetMeta ?? {}, holding.investedAmount) : null),
    [holding.assetClass, holding.investedAmount, holding.assetMeta]
  );

  const ppfMissingInterestFys = useMemo(
    () =>
      holding.assetClass === 'ppf' ? findMissingPpfInterestFys(meta.ppfTransactions ?? [], meta.ppfOpeningDate) : [],
    [holding.assetClass, meta.ppfTransactions, meta.ppfOpeningDate]
  );

  const ppfReviewFlags = useMemo(
    () => (holding.assetClass === 'ppf' ? findAllPpfReviewFlags(meta.ppfTransactions ?? [], ppfRateTable) : []),
    [holding.assetClass, meta.ppfTransactions, ppfRateTable]
  );

  // Partial-withdrawal eligibility + max withdrawable amount — powers the Withdrawal tile
  // (ppf-card-redesign-v1.html §2/§4, round 3). `null` only when the opening date is unknown at all,
  // same guard the tile itself uses to decide whether to render.
  const ppfWithdrawal = useMemo(
    () =>
      holding.assetClass === 'ppf' ? ppfWithdrawalEligibility(meta.ppfTransactions ?? [], meta.ppfOpeningDate) : null,
    [holding.assetClass, meta.ppfTransactions, meta.ppfOpeningDate]
  );

  // EPF state
  const [showEpfTxSheet, setShowEpfTxSheet] = useState(false);
  const [showEpfEmpSheet, setShowEpfEmpSheet] = useState(false);
  const [showEpfAllTxSheet, setShowEpfAllTxSheet] = useState(false);
  // Per-employer ledger (2026-08-11 follow-up round) — `null` means the all-employers view (today's
  // behavior, still the fallback for a 0-1 employer holding). Tapping an employer row directly sets
  // this straight away; "See all transactions" goes through `showEpfEmployerPicker` first whenever
  // there's genuine ambiguity (2+ employers) — mirrors EPFO's own "select Member ID" model.
  const [epfLedgerEmployer, setEpfLedgerEmployer] = useState<EpfEmployer | null>(null);
  const [showEpfEmployerPicker, setShowEpfEmployerPicker] = useState(false);
  const [epfHikeEmpId, setEpfHikeEmpId] = useState<string | null>(null);
  // Which employers currently have their hike-history list expanded inline (Set, not a single id —
  // a long career can have multiple employers each with their own hikes, so more than one open at
  // once shouldn't be artificially blocked).
  const [expandedHikeEmpIds, setExpandedHikeEmpIds] = useState<Set<string>>(new Set());
  // Which FY's nudge banner opened the transaction sheet, if any — lets the sheet pre-select
  // `'interest'` and pre-fill that FY's end date (31 March). `null` for every other "+ Add"
  // entrypoint on this card, which keeps today's defaults (contribution, today's date).
  const [epfNudgeFy, setEpfNudgeFy] = useState<number | null>(null);
  const [epfImportFiles, setEpfImportFiles] = useState<EpfImportFile[] | null>(null);
  const [epfExporting, setEpfExporting] = useState(false);
  const [confirmingEmpId, setConfirmingEmpId] = useState<string | null>(null);
  // "Are you still working at X?" → "No" (2026-08-xx fix) — opens the LWD-confirm modal below instead
  // of silently guessing a leaving date.
  const [confirmingLwdEmpId, setConfirmingLwdEmpId] = useState<string | null>(null);
  // Fetched once — used only for the "N need review" card-level count (doc §10.6/Task 2). A null
  // table just means the count can't be computed yet (never shown as 0, see the JSX below).
  const [epfRateTable, setEpfRateTable] = useState<EpfRateTable | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (holding.assetClass !== 'epf') return;
    getEpfRateTable()
      .then(setEpfRateTable)
      .catch(() => {});
  }, [holding.assetClass]);

  const epfData = useMemo(
    () => (holding.assetClass === 'epf' ? epfBuildCardData(holding.assetMeta ?? {}) : null),
    [holding.assetClass, holding.assetMeta]
  );

  const epfMissingInterestFys = useMemo(
    () =>
      holding.assetClass === 'epf' ? findMissingInterestFys(meta.epfEmployers ?? [], meta.epfTransactions ?? []) : [],
    [holding.assetClass, meta.epfEmployers, meta.epfTransactions]
  );

  const epfEmployersNeedingConfirmation = useMemo(
    () =>
      holding.assetClass === 'epf'
        ? findEmployersNeedingEmploymentConfirmation(meta.epfEmployers ?? [], meta.epfTransactions ?? [])
        : [],
    [holding.assetClass, meta.epfEmployers, meta.epfTransactions]
  );

  const epfReviewFlagCount = useMemo(
    () =>
      holding.assetClass === 'epf'
        ? findAllReviewFlags(meta.epfEmployers ?? [], meta.epfTransactions ?? [], epfRateTable).length
        : 0,
    [holding.assetClass, meta.epfEmployers, meta.epfTransactions, epfRateTable]
  );

  async function handleEpfImportPress() {
    const files = await pickAndParseEpfFiles();
    if (files) setEpfImportFiles(files);
  }

  /** Tapping an employer row directly opens ITS OWN scoped ledger, no picker needed. */
  function handleOpenEmployerLedger(emp: EpfEmployer) {
    setEpfLedgerEmployer(emp);
    setShowEpfAllTxSheet(true);
  }

  /** "See all transactions" — skips the picker entirely for the common 0-1 employer case (today's
   *  unscoped view, unchanged); only genuinely ambiguous (2+ employers) cases go through
   *  `EpfEmployerPickerSheet` first. */
  function handleSeeAllEpfTransactions() {
    const employers = meta.epfEmployers ?? [];
    if (employers.length >= 2) {
      setShowEpfEmployerPicker(true);
      return;
    }
    setEpfLedgerEmployer(employers[0] ?? null);
    setShowEpfAllTxSheet(true);
  }

  function toggleHikeHistory(empId: string) {
    setExpandedHikeEmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) {
        next.delete(empId);
      } else {
        next.add(empId);
      }
      return next;
    });
  }

  /** "Are you still working at X?" card prompt (doc §10.1/Task 1), "Yes" branch — confirms the
   *  current employment is real (sets `currentEmploymentConfirmed`, leaving `toDate` unset). Wrapped
   *  in `useCallback` (unlike this card's other inline handlers) — a plain nested function here trips
   *  the React Compiler's purity check on `Date.now()` as a false positive once an id derived from
   *  the `.map()` below flows into it; wrapping it removes the ambiguity.
   *
   *  2026-08-xx fix — "No" no longer silently bounds `toDate` to a guessed FY-end date here. It now
   *  opens `confirmingLwdEmpId`'s modal instead (below), which reuses `EpfMonthEdgeConfirm` to ask for
   *  the REAL last working day with a live pro-rata consistency check — real reported gap: "when 'Are
   *  you still working' is answered with No, the LWD should also be asked," not silently assumed to
   *  be the FY's own March 31st. */
  const handleEmploymentConfirm = useCallback(
    async (empId: string) => {
      if (confirmingEmpId) return;
      const emp = (meta.epfEmployers ?? []).find((e) => e.id === empId);
      if (!emp) return;
      setConfirmingEmpId(empId);
      try {
        const updatedEmp: EpfEmployer = { ...emp, currentEmploymentConfirmed: true };
        const updated: Holding = {
          ...holding,
          assetMeta: {
            ...holding.assetMeta,
            epfEmployers: (meta.epfEmployers ?? []).map((e) => (e.id === empId ? updatedEmp : e))
          },
          updatedAt: Date.now()
        };
        await onSave(updated);
      } catch {
        // Leave the prompt showing so the user can retry.
      } finally {
        setConfirmingEmpId(null);
      }
    },
    [confirmingEmpId, meta.epfEmployers, holding, onSave]
  );

  async function handleEpfExport() {
    if (!epfData || epfExporting) return;
    setEpfExporting(true);
    try {
      const rateTable = await getEpfRateTable();
      const exportInput: EpfExcelExportInput = {
        ...(meta.uan && { uan: meta.uan }),
        ...(meta.epfBirthYear && { epfBirthYear: meta.epfBirthYear }),
        employers: meta.epfEmployers ?? [],
        transactions: meta.epfTransactions ?? [],
        corpus: {
          employeeTotal: epfData.employeeTotal,
          employerTotal: epfData.employerTotal,
          interestEarned: epfData.interestEarned,
          projectedCorpus: epfData.projectedCorpus,
          yearsToRetirement: epfData.yearsToRetirement
        },
        rateTable,
        generatedAt: Date.now()
      };
      const data = buildEpfExcelExport(exportInput);
      const { utils, write } = await import('xlsx');
      const workbook = utils.book_new();
      for (const sheet of data.sheets) {
        const ws = utils.aoa_to_sheet(sheet.rows);
        if (sheet.colWidths) ws['!cols'] = sheet.colWidths.map((wch) => ({ wch }));
        utils.book_append_sheet(workbook, ws, sheet.name);
      }
      // See `PlannerResults.tsx`'s `downloadXlsx()` doc comment for why this exact
      // write→Uint8Array→Blob(web)/File(native) shape is needed — reused verbatim here.
      const bytes = new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);

      if (Platform.OS === 'web') {
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const { File, Paths } = await import('expo-file-system');
        const file = new File(Paths.cache, data.filename);
        // `File.write()` is async — see `AutoBackupCard.tsx`'s fix note (2026-08-21) for the full
        // writeup of this missing-`await` bug, found independently in several native export flows.
        await file.write(bytes);
        const Sharing = await import('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      showToast({ message: `Couldn't export EPF statement: ${detail}` });
    } finally {
      setEpfExporting(false);
    }
  }

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

  return (
    <>
      <Card className="gap-2.5">
        {/* Header row */}
        <View className="flex-row items-start justify-between gap-2">
          <Pressable onPress={onEdit} className="flex-row items-center gap-2.5 flex-1">
            <IconBadge icon={assetMeta.icon} color={assetMeta.color} size="sm" bg={tint(assetMeta.color, 8)} />
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

            {/* Two-up stat tiles — maturity + This-FY, each in its own bordered box with a coloured
                top edge (ppf-card-redesign-v1.html §2), replacing the old back-to-back stacked bars
                that read as one continuous purple ribbon with no visual seam between two unrelated
                metrics (a 15-yr lock-in vs an annual ₹1.5L ceiling). This-FY's bar is blue while in
                progress, green only on completion — it never turns purple, so it can never be
                mistaken for the maturity bar. */}
            <View className="flex-row gap-2">
              {ppfData.yearsElapsed != null && ppfData.yearsLeft != null && (
                <View
                  className="flex-1 rounded-xl bg-surface-2 p-2.5 border-t-[3px]"
                  style={{ borderTopColor: '#8b5cf6' }}
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-[8.5px] font-bold text-tertiary uppercase tracking-wide">Maturity</Text>
                    <Pressable onPress={() => setShowPpfMaturityInfo(true)} hitSlop={8}>
                      <Icon name="ti-info-circle" size={12} color={theme.textTertiary} />
                    </Pressable>
                  </View>
                  <Text className="text-xs font-extrabold text-primary mb-1.5">
                    {ppfData.yearsLeft > 0
                      ? `${Math.ceil(ppfData.yearsLeft)} yr${Math.ceil(ppfData.yearsLeft) !== 1 ? 's' : ''} left`
                      : 'Matured'}
                  </Text>
                  <ProgressBar value={Math.min(100, (ppfData.yearsElapsed / 15) * 100)} color="#8b5cf6" animate />
                  {ppfData.projected != null && (
                    <Text className="text-[9px] text-secondary mt-1.5">
                      {!masked ? `Proj. ${formatCurrency(ppfData.projected)}` : 'Proj. ••••'}
                    </Text>
                  )}
                </View>
              )}

              <View
                className="flex-1 rounded-xl bg-surface-2 p-2.5 border-t-[3px]"
                style={{ borderTopColor: ppfData.fyPct >= 100 ? theme.success : theme.info }}
              >
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-[8.5px] font-bold text-tertiary uppercase tracking-wide">This FY</Text>
                  <Pressable onPress={() => setShowPpfThisFyInfo(true)} hitSlop={8}>
                    <Icon name="ti-info-circle" size={12} color={theme.textTertiary} />
                  </Pressable>
                </View>
                <Text className="text-xs font-extrabold text-primary mb-1.5 tabular-nums">
                  {!masked ? `₹${ppfData.fyDeposits.toLocaleString('en-IN')} / ₹1.5L` : '•••• / ₹1.5L'}
                </Text>
                <ProgressBar value={ppfData.fyPct} color={ppfData.fyPct >= 100 ? theme.success : theme.info} animate />
                {ppfData.fyPct >= 100 ? (
                  <Text className="text-[9px] font-bold mt-1.5" style={{ color: theme.success }}>
                    ✓ Full for this year
                  </Text>
                ) : (
                  ppfData.showAprilTip && (
                    <Text className="text-[9px] font-semibold mt-1.5" style={{ color: theme.warning }}>
                      Deposit by Apr 5 for full-year interest
                    </Text>
                  )
                )}
              </View>
            </View>

            {/* Withdrawal tile — full-width, own teal accent, below the two-up row
                (ppf-card-redesign-v1.html §2/§4, round-3 final placement). Always shown regardless of
                account age, per the mockup's own reasoning: conditionally hiding it for a young
                account would wrongly imply the RULE itself doesn't exist yet, when it's a fixed fact
                about PPF worth knowing early. Powered by `ppfWithdrawalEligibility()` — `null` only
                when the opening date is unknown at all, same guard the tile uses to decide whether to
                render. Masks the same way the This-FY tile's amount does — only the digits, never the
                " available" suffix. */}
            {ppfWithdrawal && (
              <View className="rounded-xl bg-surface-2 p-2.5 border-t-[3px]" style={{ borderTopColor: '#0d9488' }}>
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-[8.5px] font-bold text-tertiary uppercase tracking-wide">Withdrawal</Text>
                  <Pressable onPress={() => setShowPpfWithdrawInfo(true)} hitSlop={8}>
                    <Icon name="ti-info-circle" size={12} color={theme.textTertiary} />
                  </Pressable>
                </View>
                {ppfWithdrawal.eligible ? (
                  <>
                    <Text className="text-xs font-extrabold mb-1" style={{ color: '#0d9488' }}>
                      {!masked ? `${formatCurrency(ppfWithdrawal.maxWithdrawable)} available` : '•••• available'}
                    </Text>
                    <Text className="text-[9px] font-bold" style={{ color: '#0d9488' }}>
                      ✓ Eligible — one partial withdrawal allowed this FY
                    </Text>
                  </>
                ) : (
                  <>
                    <Text className="text-xs font-extrabold text-primary mb-1">
                      Available from {fyLabel(ppfWithdrawal.eligibleFromFy)}
                    </Text>
                    <Text className="text-[9px] text-secondary">Partial withdrawal opens after 6 full years</Text>
                  </>
                )}
              </View>
            )}

            {/* Consolidated "needs attention" banner — merges the old N stacked per-FY
                missing-interest banners + the squeezed "N need review" pill into one amber banner
                (ppf-card-redesign-v1.html §1/§2). Missing years become tappable chips (still
                pre-filling the transaction sheet to that FY's own 31 March on tap, exactly as
                before) instead of N nearly-identical banners; the review count becomes a second line
                in the same banner instead of a pill wedged beside the section label. Nothing here is
                a new calculation — same `findMissingPpfInterestFys`/`findAllPpfReviewFlags` inputs
                the old JSX already read, purely a layout/grouping change. */}
            {(ppfMissingInterestFys.length > 0 || ppfReviewFlags.length > 0) && (
              <View
                className="rounded-xl border p-3 gap-1.5"
                style={{ backgroundColor: tint(theme.warning, 12), borderColor: tint(theme.warning, 30) }}
              >
                <View className="flex-row items-start gap-2">
                  <Icon name="ti-alert-triangle" size={16} color={theme.warning} />
                  <Text
                    className="text-xs font-bold leading-relaxed flex-1"
                    style={{ color: ink(theme.warning, theme.textPrimary) }}
                  >
                    {ppfMissingInterestFys.length > 0
                      ? `${ppfMissingInterestFys.length} year${ppfMissingInterestFys.length !== 1 ? 's' : ''} of interest not recorded`
                      : `${ppfReviewFlags.length} recorded amount${ppfReviewFlags.length !== 1 ? 's' : ''} need${ppfReviewFlags.length === 1 ? 's' : ''} review`}
                  </Text>
                </View>
                {ppfMissingInterestFys.length > 0 && (
                  <View className="flex-row flex-wrap gap-1.5 ml-6">
                    {ppfMissingInterestFys.map((fy) => (
                      <Pressable
                        key={fy}
                        onPress={() => {
                          setPpfNudgeFy(fy);
                          setShowPpfTxSheet(true);
                        }}
                        className="flex-row items-center gap-1 px-2 py-1 rounded-full"
                        style={{ backgroundColor: tint(theme.warning, 25) }}
                      >
                        <Icon name="ti-plus" size={9} color={theme.warning} />
                        <Text className="text-[9.5px] font-bold" style={{ color: theme.warning }}>
                          {fyLabel(fy)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {ppfMissingInterestFys.length > 0 && ppfReviewFlags.length > 0 && (
                  <View className="flex-row items-start gap-1 ml-6">
                    <Icon name="ti-corner-down-right" size={11} color={theme.warning} />
                    <Text
                      className="text-[9.5px] flex-1 leading-relaxed"
                      style={{ color: ink(theme.warning, theme.textPrimary) }}
                    >
                      {ppfReviewFlags.length} recorded amount{ppfReviewFlags.length !== 1 ? 's' : ''} look
                      {ppfReviewFlags.length === 1 ? 's' : ''} different from Penny&apos;s recalculation — see the
                      flagged row below
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View className="flex-row items-center justify-between">
              <Text className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Transactions</Text>
              <View className="flex-row items-center gap-1.5">
                {/* Import statement — card-level action, same reasoning as EPF's own (an import may
                    create the holding AND add transactions, not just one or the other). Recolored
                    neutral/ghost here (was filled purple) — purple is reserved for the one truly
                    primary action on this card, Add. */}
                <Pressable
                  onPress={() => setShowPpfImport(true)}
                  className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#64748b15' }}
                >
                  <Icon name="ti-file-upload" size={11} color="#64748b" />
                  <Text className="text-[10px] font-semibold" style={{ color: '#64748b' }}>
                    Import
                  </Text>
                </Pressable>
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
            </View>

            {/* No inline transaction list on the card anymore — every individual transaction lives
                only in `PpfAllTransactionsSheet` now (ppf-card-redesign-v1.html's mockup frames still
                show a capped 5-row list under this row; that part is deliberately NOT built — see this
                task's own scope note). Shown once there's at least one transaction, mirroring EPF's
                own always-shown "See all transactions" row. */}
            {ppfData.sortedTxns.length === 0 ? (
              <Text className="text-[11px] text-tertiary">
                No transactions yet. Tap Add to record your first deposit.
              </Text>
            ) : (
              <Pressable onPress={() => setShowPpfAllTxSheet(true)} className="flex-row items-center gap-1.5">
                <Icon name="ti-list" size={14} color="#64748b" />
                <Text className="text-xs font-semibold" style={{ color: '#64748b' }}>
                  See all transactions
                </Text>
                <Text className="text-[10px] font-normal text-tertiary">
                  ({ppfData.sortedTxns.length} transaction{ppfData.sortedTxns.length !== 1 ? 's' : ''})
                </Text>
              </Pressable>
            )}
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

            {/* Import passbook PDF / previously-exported .xlsx, and Export the combined statement —
                doc §10.1 Direction A + §11's export action. Deliberately card-level, not nested inside
                either the Employment or Transactions sub-flows, since one import can touch both (a new
                employer AND its transactions) — see this file's own doc comment on why. */}
            <View className="flex-row gap-2 -mt-0.5">
              <Button
                variant="ghost"
                size="sm"
                icon="ti-file-upload"
                color="#64748b15"
                textColor="#64748b"
                onPress={handleEpfImportPress}
              >
                Import
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="ti-file-download"
                color="#64748b15"
                textColor="#64748b"
                loading={epfExporting}
                onPress={handleEpfExport}
              >
                Export
              </Button>
            </View>

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
                      const hikes = emp.hikeTimeline ?? [];
                      const hikeCount = hikes.length;
                      const hikesExpanded = expandedHikeEmpIds.has(emp.id);
                      return (
                        <View key={emp.id} className="rounded-xl bg-surface-2 border border-theme overflow-hidden">
                          <View className="flex-row items-center justify-between gap-2 px-3 py-2">
                            {/* Tapping the row opens THIS employer's own scoped ledger directly (2026-08-11
                                follow-up round) — mirrors EPFO's own "select Member ID → view that
                                passbook" model. The nested "Hike" and hike-toggle Pressables below still
                                capture their own taps first via RN's normal responder chain. */}
                            <Pressable className="flex-1" onPress={() => handleOpenEmployerLedger(emp)}>
                              <View className="flex-row items-center flex-wrap gap-1.5">
                                <Text className="text-xs font-medium text-primary" numberOfLines={1}>
                                  {emp.companyName}
                                </Text>
                                {!emp.toDate && <Badge label="Current" color={theme.success} size="sm" rounded="md" />}
                                {hikeCount > 0 && (
                                  <Pressable
                                    onPress={() => toggleHikeHistory(emp.id)}
                                    className="flex-row items-center gap-0.5 px-1 py-0.5 rounded"
                                    style={{ backgroundColor: '#378add18' }}
                                  >
                                    <Text className="text-[9px] font-medium" style={{ color: '#378add' }}>
                                      {hikesExpanded ? 'Hide hikes' : `${hikeCount} hike${hikeCount !== 1 ? 's' : ''}`}
                                    </Text>
                                    <Icon
                                      name={hikesExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}
                                      size={9}
                                      color="#378add"
                                    />
                                  </Pressable>
                                )}
                              </View>
                              <Text className="text-[10px] text-tertiary mt-0.5">
                                {epfMonthLabel(emp.fromDate)} – {emp.toDate ? epfMonthLabel(emp.toDate) : 'present'}
                                {' · '}
                                {epfMonthsBetween(emp.fromDate, emp.toDate ?? nowMs())} months
                              </Text>
                            </Pressable>
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
                            <Icon name="ti-chevron-right" size={13} color={theme.textTertiary} />
                          </View>
                          {/* Hike journey (2026-08-xx, revised to a single table per direct
                              feedback on the first card-based layout) — Month Year / Est CTC / Est
                              Gross / Net Monthly, in that column order, for every salary point (the
                              joining basic, plus every real hike). CTC and Gross are shown ANNUAL —
                              the conventional way both are quoted in India ("12 LPA") — matching the
                              same convention already used at the ledger header's own stat tiles;
                              Net Monthly stays monthly. */}
                          {hikesExpanded && hikeCount > 0 && (
                            <View className="px-3 pb-2 pt-1 border-t border-theme">
                              <View className="flex-row items-center pb-1 border-b border-theme">
                                <Text className="flex-[1.3] text-[8px] font-bold text-tertiary uppercase">Month</Text>
                                <Text className="flex-1 text-[8px] font-bold text-tertiary uppercase text-right">
                                  Est CTC
                                </Text>
                                <Text className="flex-1 text-[8px] font-bold text-tertiary uppercase text-right">
                                  Est Gross
                                </Text>
                                <Text className="flex-1 text-[8px] font-bold text-tertiary uppercase text-right">
                                  Net Monthly
                                </Text>
                              </View>
                              {buildEpfHikeJourney(emp).map((point, idx) => {
                                const monthlyEmployee = Math.round(point.basicSalary * (emp.employeeContribPct / 100));
                                const monthlyEmployerEpf = Math.round(point.basicSalary * EPF_EMPLOYER_EPF_PCT);
                                const monthlyEps = Math.round(point.basicSalary * EPS_PCT);
                                const gc = estimateGrossAndCtc(
                                  point.basicSalary,
                                  monthlyEmployee,
                                  monthlyEmployerEpf,
                                  monthlyEps,
                                  emp.basicToGrossPct
                                );
                                return (
                                  <View
                                    key={`${emp.id}-journey-${idx}`}
                                    className="flex-row items-center py-1.5 border-b border-dashed border-theme"
                                  >
                                    <View className="flex-[1.3]">
                                      <Text className="text-[10px] font-semibold text-primary">
                                        {epfMonthLabel(point.date)}
                                      </Text>
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
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                </View>
              )}
            </View>

            {/* "Are you still working here?" prompt — one per employer left "current" purely
                because an import had no later employer to bound its `toDate` against (doc
                §10.1/Task 1's root-cause fix: a strictly-past-FY import is NOT itself evidence of
                ongoing employment). Deliberately distinct icon/tone from the FY-end interest nudge
                below so the two are never confused, though both share the warning tint. Not
                `<Banner>` — needs two inline `Pressable` actions, same reason as the FY-end nudge. */}
            {epfEmployersNeedingConfirmation.map(({ employer }) => (
              <View
                key={employer.id}
                className="rounded-xl border p-3 gap-2"
                style={{ backgroundColor: tint(theme.warning, 12), borderColor: tint(theme.warning, 30) }}
              >
                <View className="flex-row items-center gap-2">
                  <Icon name="ti-briefcase" size={16} color={theme.warning} />
                  <Text
                    className="text-xs leading-relaxed flex-1"
                    style={{ color: ink(theme.warning, theme.textPrimary) }}
                  >
                    Are you still working at <Text style={{ fontWeight: '700' }}>{employer.companyName}</Text>?
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      disabled={confirmingEmpId === employer.id}
                      onPress={() => setConfirmingLwdEmpId(employer.id)}
                    >
                      No
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      color={theme.warning}
                      loading={confirmingEmpId === employer.id}
                      disabled={confirmingEmpId === employer.id}
                      onPress={() => handleEmploymentConfirm(employer.id)}
                    >
                      Yes
                    </Button>
                  </View>
                </View>
              </View>
            ))}

            {/* Corpus breakdown — 4-col stat grid. Pension/EPS is informational only (not part of
                `corpus` — see `EpfCardData.pensionTotal`'s doc comment), shown muted like the
                Monthly Contribution box's own EPS row below. */}
            {(epfData.employeeTotal > 0 ||
              epfData.employerTotal > 0 ||
              epfData.pensionTotal > 0 ||
              epfData.interestEarned > 0) && (
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
                    label="Pension Total"
                    valueColor={theme.textSecondary}
                    value={!masked ? `₹${epfData.pensionTotal.toLocaleString('en-IN')}` : '••••'}
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

            {/* FY-end interest nudge — one banner per past, fully-closed FY with no `interest`
                transaction logged, not just the latest (doc §10.3's "never silently drop something the
                user should know about" rule). Not `<Banner>` here — `Banner.tsx` always wraps
                `children` in a `<Text>`, and this needs a `Pressable` action alongside the message
                (same reason/precedent as `ProfilePage.tsx`'s backup nudge) — manually replicates
                `Banner`'s warning-variant tint/border instead. Carries its own inline "+ Add" pill
                (rather than pointing at one of the card's other two ambiguous "+Add" buttons) that
                opens the transaction sheet pre-selected to `interest` with that FY's end date (31
                March) pre-filled. */}
            {epfMissingInterestFys.map((fy) => (
              <View
                key={fy}
                className="rounded-xl border p-3 flex-row items-center gap-2"
                style={{ backgroundColor: tint(theme.warning, 12), borderColor: tint(theme.warning, 30) }}
              >
                <Icon name="ti-calendar-event" size={16} color={theme.warning} />
                <Text
                  className="text-xs leading-relaxed flex-1"
                  style={{ color: ink(theme.warning, theme.textPrimary) }}
                >
                  <Text style={{ fontWeight: '700' }}>{fyLabel(fy)}</Text> interest not recorded yet — add it, or import
                  your passbook PDF.
                </Text>
                <Pressable
                  onPress={() => {
                    setEpfNudgeFy(fy);
                    setShowEpfTxSheet(true);
                  }}
                  className="flex-row items-center gap-1 px-2 py-1 rounded-full"
                  style={{ backgroundColor: tint(theme.warning, 25) }}
                >
                  <Icon name="ti-plus" size={11} color={theme.warning} />
                  <Text className="text-[10px] font-semibold" style={{ color: theme.warning }}>
                    Add
                  </Text>
                </Pressable>
              </View>
            ))}

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

            {/* See all transactions row — the "N need review" pill (Task 2's card-level count,
                summing both the interest-mismatch and wage-discrepancy flags from
                `findAllReviewFlags`, the exact same function powering each row's own badge in
                `EpfAllTransactionsSheet`) opens straight into that same sheet. */}
            <View className="flex-row items-center justify-between pt-0.5">
              <Pressable onPress={handleSeeAllEpfTransactions} className="flex-row items-center gap-1.5">
                <Icon name="ti-list" size={14} color="#64748b" />
                <Text className="text-xs font-semibold" style={{ color: '#64748b' }}>
                  See all transactions
                </Text>
                {epfData.totalComputedMonths > 0 && (
                  <Text className="text-[10px] font-normal text-tertiary">({epfData.totalComputedMonths} months)</Text>
                )}
                {epfReviewFlagCount > 0 && (
                  <View
                    className="flex-row items-center gap-1 px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: tint(theme.warning, 15) }}
                  >
                    <Icon name="ti-alert-triangle" size={9} color={theme.warning} />
                    <Text className="text-[9px] font-bold" style={{ color: theme.warning }}>
                      {epfReviewFlagCount} need review
                    </Text>
                  </View>
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

      {/* PPF statement import flow — pick file → mapping confirm → review → (conditional)
          missing-details gate → done (mockup ppf-statement-import-v1.html). */}
      {showPpfImport && <PpfImportFlow holding={holding} onSave={onSave} onClose={() => setShowPpfImport(false)} />}

      {/* PPF transaction sheet — pre-seeded to `interest`/that FY's 31 March when opened from the
          FY-end nudge banner's own "+ Add" (`ppfNudgeFy` non-null); every other entrypoint on this
          card leaves it `null`, keeping today's defaults (deposit, today's date). */}
      {showPpfTxSheet && (
        <PpfTransactionSheet
          holding={holding}
          initialType={ppfNudgeFy != null ? 'interest' : undefined}
          initialDate={ppfNudgeFy != null ? new Date(ppfNudgeFy + 1, 2, 31).getTime() : undefined}
          onSave={async (updated) => {
            await onSave(updated);
            setShowPpfTxSheet(false);
            setPpfNudgeFy(null);
          }}
          onClose={() => {
            setShowPpfTxSheet(false);
            setPpfNudgeFy(null);
          }}
        />
      )}

      {/* PPF all-transactions sheet — the card's "See all transactions" row's only entry point now
          that the card no longer shows any inline transaction list (ppf-card-redesign-v1.html). Also
          the only entry point for editing/deleting an individual PPF transaction — `onSave` threaded
          through so the sheet's own row-tap → edit/delete flow can persist directly, same plumbing
          every other sheet in this file already uses. */}
      {showPpfAllTxSheet && (
        <PpfAllTransactionsSheet
          holding={holding}
          onAddTransaction={() => {
            setShowPpfAllTxSheet(false);
            setShowPpfTxSheet(true);
          }}
          onSave={onSave}
          onClose={() => setShowPpfAllTxSheet(false)}
        />
      )}

      {/* PPF "i" info-icon modals — This-FY deposit rules (5th-of-month timing + ₹500
          minimum/penalty), Withdrawal rules (partial-withdrawal eligibility/cap), and Maturity
          options (the 3 choices at year 15) — ppf-card-redesign-v1.html §4, plus the Maturity one
          added this session using the identical established pattern (no new mockup needed for it,
          same visual treatment approved twice already). All three are neutral/slate education, never
          amber — that's what the "Needs attention" banner above is for. */}
      {showPpfThisFyInfo && (
        <PpfInfoModal
          title="This FY deposit rules"
          onClose={() => setShowPpfThisFyInfo(false)}
          sections={[
            {
              icon: 'ti-clock-hour-4',
              label: 'Interest timing',
              body: (
                <>
                  Deposit <Text style={{ fontWeight: '700' }}>on or before the 5th</Text> of a month and it starts
                  earning interest that same month. After the 5th, it only starts earning from the{' '}
                  <Text style={{ fontWeight: '700' }}>following month</Text>.
                </>
              ),
              example: (
                <>
                  e.g. deposit on 3 Aug → earns interest from August.{'\n'}Deposit on 15 Aug → earns interest only from
                  September.
                </>
              )
            },
            {
              icon: 'ti-alert-circle',
              label: 'Minimum & penalties',
              body: (
                <>
                  PPF needs at least <Text style={{ fontWeight: '700' }}>₹500 deposited every financial year</Text> to
                  stay active. Miss a year and the account goes <Text style={{ fontWeight: '700' }}>inactive</Text> — no
                  deposits or loans against it until revived.
                </>
              ),
              example: (
                <>
                  Reviving costs a <Text style={{ fontWeight: '700' }}>₹50 penalty</Text> +{' '}
                  <Text style={{ fontWeight: '700' }}>₹500 arrears</Text> per missed year. A 2-year gap = ₹100 penalty +
                  ₹1,000 arrears = ₹1,100 to reactivate.
                </>
              )
            }
          ]}
        />
      )}

      {showPpfWithdrawInfo && (
        <PpfInfoModal
          title="Partial withdrawal rules"
          onClose={() => setShowPpfWithdrawInfo(false)}
          sections={[
            {
              icon: 'ti-calendar-time',
              label: 'Eligibility',
              body: (
                <>
                  Opens up from the <Text style={{ fontWeight: '700' }}>7th financial year</Text> of the account — i.e.
                  once it&apos;s completed <Text style={{ fontWeight: '700' }}>6 full years</Text>. One withdrawal
                  allowed per financial year.
                </>
              )
            },
            {
              icon: 'ti-percentage',
              label: 'How much',
              body: (
                <>
                  Capped at <Text style={{ fontWeight: '700' }}>50%</Text> of whichever is LOWER: the balance at the end
                  of the <Text style={{ fontWeight: '700' }}>4th year before</Text> the withdrawal year, or the balance
                  at the end of the year <Text style={{ fontWeight: '700' }}>right before</Text> it.
                </>
              )
            }
          ]}
          personal={
            ppfWithdrawal
              ? ppfWithdrawal.eligible
                ? {
                    variant: 'eligible',
                    icon: 'ti-circle-check',
                    text: `Your account has completed ${Math.floor(ppfData?.yearsElapsed ?? 0)} years — you're eligible now.`
                  }
                : {
                    variant: 'pending',
                    icon: 'ti-hourglass',
                    text: `Your account has completed ${Math.floor(ppfData?.yearsElapsed ?? 0)} years — eligible from year 7 (~${Math.max(1, Math.ceil(6 - (ppfData?.yearsElapsed ?? 0)))} more years).`
                  }
              : undefined
          }
        />
      )}

      {showPpfMaturityInfo && (
        <PpfInfoModal
          title="At maturity (15 years)"
          onClose={() => setShowPpfMaturityInfo(false)}
          sections={[
            {
              icon: 'ti-list-check',
              label: 'Your 3 options',
              body: (
                <>
                  <Text style={{ fontWeight: '700' }}>(a) Withdraw &amp; close</Text> — take the full balance tax-free
                  and close the account.
                  {'\n\n'}
                  <Text style={{ fontWeight: '700' }}>(b) Extend with contributions</Text> — submit{' '}
                  <Text style={{ fontWeight: '700' }}>Form H (Form 4) within 1 year</Text> of the maturity date to keep
                  depositing and keep claiming the 80C deduction for another 5-year block.
                  {'\n\n'}
                  <Text style={{ fontWeight: '700' }}>(c) Extend without contributions</Text> (the default if you do
                  nothing) — the balance keeps earning interest and one withdrawal per year is still allowed, but no
                  further deposits are accepted.
                </>
              )
            },
            {
              icon: 'ti-alert-circle',
              label: 'Miss the 1-year window?',
              body: (
                <>
                  Missing the 1-year Form H window <Text style={{ fontWeight: '700' }}>permanently forfeits</Text> the
                  ability to make fresh contributions for that particular 5-year block — you can still fall back to the
                  without-contribution extension.
                </>
              )
            }
          ]}
        />
      )}

      {/* EPF transaction sheet — pre-seeded to `interest`/that FY's 31 March when opened from the
          FY-end nudge banner's own "+ Add" (`epfNudgeFy` non-null); every other entrypoint on this
          card leaves both `undefined`, keeping today's defaults (contribution, today's date). */}
      {showEpfTxSheet && (
        <EpfTransactionSheet
          holding={holding}
          initialType={epfNudgeFy != null ? 'interest' : undefined}
          initialDate={epfNudgeFy != null ? new Date(epfNudgeFy + 1, 2, 31).getTime() : undefined}
          onSave={async (updated) => {
            await onSave(updated);
            setShowEpfTxSheet(false);
            setEpfNudgeFy(null);
          }}
          onClose={() => {
            setShowEpfTxSheet(false);
            setEpfNudgeFy(null);
          }}
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

      {/* EPF all transactions sheet — scoped to `epfLedgerEmployer` when set (2026-08-11 follow-up
          round's per-employer ledger); `undefined` keeps the all-employers view. */}
      {showEpfAllTxSheet && (
        <EpfAllTransactionsSheet
          holding={holding}
          employerFilter={epfLedgerEmployer ?? undefined}
          onAddTransaction={() => {
            setShowEpfAllTxSheet(false);
            setShowEpfTxSheet(true);
          }}
          onSave={onSave}
          onClose={() => {
            setShowEpfAllTxSheet(false);
            setEpfLedgerEmployer(null);
          }}
        />
      )}

      {/* "Choose employer" picker — only reachable via "See all transactions" with 2+ employers. */}
      {showEpfEmployerPicker && (
        <EpfEmployerPickerSheet
          employers={meta.epfEmployers ?? []}
          transactions={meta.epfTransactions ?? []}
          onSelect={(emp) => {
            setShowEpfEmployerPicker(false);
            handleOpenEmployerLedger(emp);
          }}
          onClose={() => setShowEpfEmployerPicker(false)}
        />
      )}

      {/* "Are you still working at X?" → "No" (2026-08-xx fix) — asks for the REAL last working day
          instead of silently guessing the FY's own March 31st, reusing the exact same
          date-field + pro-rata-consistency form the row-level edge confirm already uses. */}
      {confirmingLwdEmpId &&
        (() => {
          const emp = (meta.epfEmployers ?? []).find((e) => e.id === confirmingLwdEmpId);
          if (!emp) return null;
          const transactions = meta.epfTransactions ?? [];
          const lastEvidenceMs = epfLastRealEvidenceMs(emp, meta.epfEmployers ?? [], transactions);
          const monthEntry = lastEvidenceMs
            ? (epfComputeAllMonths([emp], transactions).find((m) => m.month === epfMonthKeyOf(lastEvidenceMs)) ?? null)
            : null;
          // No real evidence at all to anchor a pro-rata check against (shouldn't happen — this
          // prompt only ever fires for an employer with SOME real contribution evidence, per
          // `findEmployersNeedingEmploymentConfirmation`'s own gate) — fail safe rather than render a
          // broken form.
          if (!monthEntry) return null;
          return (
            <Modal onClose={() => setConfirmingLwdEmpId(null)} title="Last working day" size="sm">
              <EpfMonthEdgeConfirm
                holding={holding}
                employer={emp}
                month={monthEntry}
                edge="end"
                onSave={onSave}
                onDone={() => setConfirmingLwdEmpId(null)}
              />
            </Modal>
          );
        })()}

      {/* EPF passbook/Excel import flow — batch summary → sequential review → done (doc §10.4). */}
      {epfImportFiles && (
        <EpfImportFlow
          holding={holding}
          files={epfImportFiles}
          onSave={onSave}
          onClose={() => setEpfImportFiles(null)}
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

export function RetirementUntrackedCard({
  type,
  onTrack,
  onSave
}: {
  type: 'nps' | 'ppf' | 'epf';
  onTrack: () => void;
  /** Only needed for the EPF case's "or import passbook PDF" shortcut (doc §10.1) — a first-ever
   *  import creates a brand-new EPF holding directly, skipping manual UAN/company/basic-salary entry. */
  onSave?: (holding: Holding) => Promise<void>;
}) {
  const cfg = RETIREMENT_CARD_CONFIG[type];
  const label = type.toUpperCase();
  const [epfImportFiles, setEpfImportFiles] = useState<EpfImportFile[] | null>(null);
  const [showPpfImport, setShowPpfImport] = useState(false);

  async function handleImportPress() {
    const files = await pickAndParseEpfFiles();
    if (files) setEpfImportFiles(files);
  }

  return (
    <View className="bg-surface rounded-2xl px-4 py-3 border border-theme">
      <View className="flex-row items-center justify-between gap-2 mb-1.5">
        <View className="flex-row items-center gap-2.5">
          <IconBadge icon={cfg.icon} color={cfg.color} size="sm" bg={tint(cfg.color, 8)} />
          <Text className="text-sm font-semibold text-primary">{label}</Text>
        </View>
        <Pressable
          onPress={onTrack}
          className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: tint(cfg.color, 8) }}
        >
          <Icon name="ti-plus" size={12} color={cfg.color} />
          <Text className="text-xs font-semibold" style={{ color: cfg.color }}>
            {`Track ${label}`}
          </Text>
        </Pressable>
      </View>
      <Text className="text-xs text-secondary leading-relaxed">{cfg.description}</Text>
      {type === 'epf' && onSave && (
        <Pressable onPress={handleImportPress} className="items-end mt-1.5">
          <Text className="text-[10px] font-semibold" style={{ color: cfg.color }}>
            or import passbook PDF →
          </Text>
        </Pressable>
      )}
      {type === 'ppf' && onSave && (
        <Pressable onPress={() => setShowPpfImport(true)} className="items-end mt-1.5">
          <Text className="text-[10px] font-semibold" style={{ color: cfg.color }}>
            or import statement →
          </Text>
        </Pressable>
      )}

      {epfImportFiles && (
        <EpfImportFlow
          holding={null}
          files={epfImportFiles}
          onSave={async (h) => {
            if (onSave) await onSave(h);
          }}
          onClose={() => setEpfImportFiles(null)}
        />
      )}

      {showPpfImport && (
        <PpfImportFlow
          holding={null}
          onSave={async (h) => {
            if (onSave) await onSave(h);
          }}
          onClose={() => setShowPpfImport(false)}
        />
      )}
    </View>
  );
}
