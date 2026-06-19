import { useState, useMemo, useEffect } from 'react';
import type { AssetClass, AssetMeta, EpfEmployer, Holding } from '@/core/db/types';
import { fetchMfNav, YF_BASE } from '@/core/db/priceCache';
import { fetchVehicleData } from '@/core/vehicle/rcClient';
import type { RcDetails } from '@/core/vehicle/rcClient';
import { NPS_FUND_MANAGERS, LIFECYCLE_FUNDS } from '@/core/nps';
import type { NpsChoiceType, NpsLifecycleFund, NpsPfmKey, NpsSchemeType } from '@/core/nps';
import { calcFdMaturity, calcRdMaturity } from '@/core/fd/fdCalculations';
import type { CompoundingFreq } from '@/core/fd/fdCalculations';

interface Props {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  lockAssetClass?: AssetClass;
  allowedClasses?: AssetClass[]; // when set, only these classes appear in the asset type selector
}

function nowMs(): number {
  return Date.now();
}

function ValidityBadge({ label, upto }: { label: string; upto: number }) {
  const days = Math.floor((upto - nowMs()) / (1000 * 60 * 60 * 24));
  const expired = days < 0;
  const soon = days >= 0 && days <= 30;
  const color = expired ? '#ef4444' : soon ? '#f59e0b' : '#10b981';
  const text = expired
    ? `${label} expired`
    : `${label} · ${new Date(upto).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}`;
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {text}
    </span>
  );
}

function ppfMaturityLabel(openingDateStr: string): { text: string } | null {
  if (!openingDateStr) return null;
  const openMs = new Date(openingDateStr).getTime();
  const maturityMs = openMs + 15 * 365.25 * 24 * 60 * 60 * 1000;
  const maturityDate = new Date(maturityMs);
  const yearsLeft = Math.max(0, Math.round((maturityMs - Date.now()) / (365.25 * 24 * 60 * 60 * 1000)));
  const suffix = yearsLeft > 0 ? ` · ${yearsLeft} yr${yearsLeft !== 1 ? 's' : ''} remaining` : ' · Matured';
  return { text: `Matures ${maturityDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}${suffix}` };
}

function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ASSET_CLASSES: { value: AssetClass; label: string; icon: string; color: string }[] = [
  { value: 'mf', label: 'Mutual Fund', icon: 'ti-chart-donut', color: '#6366f1' },
  { value: 'stock', label: 'Stock', icon: 'ti-trending-up', color: '#0ea5e9' },
  { value: 'fd', label: 'FD / RD', icon: 'ti-building-bank', color: '#f59e0b' },
  { value: 'nps', label: 'NPS', icon: 'ti-building-community', color: '#10b981' },
  { value: 'ppf', label: 'PPF', icon: 'ti-safe', color: '#8b5cf6' },
  { value: 'epf', label: 'EPF', icon: 'ti-building-factory', color: '#64748b' },
  { value: 'gold', label: 'Gold', icon: 'ti-coin', color: '#d97706' },
  { value: 'vehicle', label: 'Vehicle', icon: 'ti-car', color: '#3b82f6' },
  { value: 'property', label: 'Property', icon: 'ti-building', color: '#8b5cf6' },
  { value: 'other', label: 'Other', icon: 'ti-dots', color: '#6b7280' }
];

function NpsLifecycleDetail({
  fund,
  birthYearStr,
  onClose
}: {
  fund: NpsLifecycleFund;
  birthYearStr: string;
  onClose: () => void;
}) {
  const config = LIFECYCLE_FUNDS[fund];
  const birthYear = parseInt(birthYearStr, 10);
  const currentAge = !isNaN(birthYear) ? new Date().getFullYear() - birthYear : null;
  const currentAgeRow = currentAge != null ? Math.max(35, Math.min(55, currentAge)) : null;

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center px-4"
      style={{ paddingTop: 56, paddingBottom: 72 }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[430px] rounded-2xl max-h-full overflow-y-auto bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 px-4 py-3 border-b border-theme flex items-start justify-between gap-3 bg-surface">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${config.color}18`, color: config.color }}
              >
                {config.shortLabel}
              </span>
              <p className="text-sm font-semibold text-primary">{config.label}</p>
            </div>
            <p className="text-xs text-secondary mt-0.5 leading-snug">{config.description}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-tertiary"
            style={{ backgroundColor: 'var(--color-surface-secondary)' }}
          >
            <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4">
          {currentAge != null && (
            <p className="text-xs text-secondary mb-3">
              Your age: <strong className="text-primary">{currentAge}</strong>
              {currentAge < 35 && ' — PFRDA schedule starts at 35'}
              {currentAge > 55 && ' — PFRDA schedule ends at 55'}
            </p>
          )}
          <div className="rounded-xl overflow-hidden border border-theme">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                  <th className="text-left px-3 py-2 font-semibold text-tertiary">Age</th>
                  <th className="text-right px-2 py-2 font-semibold" style={{ color: '#0ea5e9' }}>
                    Equity
                  </th>
                  <th className="text-right px-2 py-2 font-semibold" style={{ color: '#d97706' }}>
                    Corp.
                  </th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: '#10b981' }}>
                    Govt.
                  </th>
                </tr>
              </thead>
              <tbody>
                {config.table.map((row) => {
                  const isCurrent = row.age === currentAgeRow;
                  return (
                    <tr
                      key={row.age}
                      style={
                        isCurrent
                          ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }
                          : undefined
                      }
                    >
                      <td className="px-3 py-1.5">
                        <span className={isCurrent ? 'font-bold text-primary' : 'text-secondary'}>
                          {row.age}
                          {isCurrent && ' ← you'}
                        </span>
                      </td>
                      <td className="text-right px-2 py-1.5 tabular-nums font-medium" style={{ color: '#0ea5e9' }}>
                        {row.equity}%
                      </td>
                      <td className="text-right px-2 py-1.5 tabular-nums font-medium" style={{ color: '#d97706' }}>
                        {row.corporate}%
                      </td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-medium" style={{ color: '#10b981' }}>
                        {row.govt}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-tertiary leading-relaxed">
            Source: PFRDA lifecycle fund circular. Ages below 35 use the 35-year allocation; ages above 55 use the
            55-year allocation.
          </p>
        </div>
      </div>
    </div>
  );
}

export function HoldingForm({ editing, onSave, onDelete, onClose, lockAssetClass, allowedClasses }: Props) {
  const [assetClass, setAssetClass] = useState<AssetClass>(
    editing?.assetClass ?? lockAssetClass ?? allowedClasses?.[0] ?? 'mf'
  );
  const [name, setName] = useState(editing?.name ?? '');
  const [investedAmount, setInvestedAmount] = useState(() => {
    if (!editing) return '';
    // For RD, the form field shows monthly installment, not total committed
    if (
      (editing.assetMeta?.fdSubType ?? editing.assetClass) === 'rd' &&
      editing.assetMeta?.rdMonthlyInstallment != null
    )
      return String(editing.assetMeta.rdMonthlyInstallment);
    return String(editing.investedAmount);
  });
  const [currentValue, setCurrentValue] = useState(editing?.currentValue != null ? String(editing.currentValue) : '');
  const [schemeCode, setSchemeCode] = useState(editing?.schemeCode ?? '');
  const [symbol, setSymbol] = useState(editing?.symbol ?? '');
  // MF fund search (MFAPI.in)
  const [mfQuery, setMfQuery] = useState(editing?.name ?? '');
  const [mfResults, setMfResults] = useState<Array<{ schemeCode: string; schemeName: string }>>([]);
  const [mfSearching, setMfSearching] = useState(false);
  const [schemeDetail, setSchemeDetail] = useState<{
    fundHouse: string;
    schemeCategory: string;
    schemeType: string;
  } | null>(
    editing?.assetMeta?.mfFundHouse
      ? {
          fundHouse: editing.assetMeta.mfFundHouse ?? '',
          schemeCategory: editing.assetMeta.mfSchemeCategory ?? '',
          schemeType: editing.assetMeta.mfSchemeType ?? ''
        }
      : null
  );
  const [mfDropdownOpen, setMfDropdownOpen] = useState(false);
  // Live price — shared for MF (NAV) and stock (chart price)
  const [fetchedPrice, setFetchedPrice] = useState<number | null>(null);
  const [priceFetching, setPriceFetching] = useState(false);
  const [stockFetchAttempted, setStockFetchAttempted] = useState(false);
  const [fetchedName, setFetchedName] = useState('');
  const [units, setUnits] = useState(editing?.units != null ? String(editing.units) : '');
  const [avgCostPrice, setAvgCostPrice] = useState(editing?.avgCostPrice != null ? String(editing.avgCostPrice) : '');
  const [interestRate, setInterestRate] = useState(editing?.interestRate != null ? String(editing.interestRate) : '');
  const [maturityDate, setMaturityDate] = useState(() =>
    editing?.maturityDate != null ? epochToDateInput(editing.maturityDate) : ''
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');

  // NPS fields
  const [npsTier, setNpsTier] = useState<'tier1' | 'tier2'>(editing?.assetMeta?.tier ?? 'tier1');
  const [npsPran, setNpsPran] = useState(editing?.assetMeta?.pran ?? '');
  const [npsMonthly, setNpsMonthly] = useState(
    editing?.assetMeta?.monthlyContribution != null ? String(editing.assetMeta.monthlyContribution) : ''
  );
  // NPS extended (choice, lifecycle, scheme)
  const [npsChoiceType, setNpsChoiceType] = useState<NpsChoiceType>(editing?.assetMeta?.npsChoiceType ?? 'auto');
  const [npsLifecycleFund, setNpsLifecycleFund] = useState<NpsLifecycleFund>(
    editing?.assetMeta?.npsLifecycleFund ?? 'lc50'
  );
  const [npsBirthYear, setNpsBirthYear] = useState(
    editing?.assetMeta?.npsBirthYear != null ? String(editing.assetMeta.npsBirthYear) : ''
  );
  const [npsPfm, setNpsPfm] = useState<NpsPfmKey | ''>((editing?.assetMeta?.npsPfm as NpsPfmKey | undefined) ?? '');
  const [npsSchemeType, setNpsSchemeType] = useState<NpsSchemeType | ''>(editing?.assetMeta?.npsSchemeType ?? '');
  const [showNpsSchedule, setShowNpsSchedule] = useState(false);

  // PPF fields
  const [ppfOpeningDate, setPpfOpeningDate] = useState(() =>
    editing?.assetMeta?.ppfOpeningDate != null ? epochToDateInput(editing.assetMeta.ppfOpeningDate) : ''
  );
  const [ppfBank, setPpfBank] = useState(editing?.assetMeta?.ppfBank ?? '');
  const [ppfAnnual, setPpfAnnual] = useState(
    editing?.assetMeta?.annualContribution != null ? String(editing.assetMeta.annualContribution) : ''
  );

  // EPF fields
  const [epfUan, setEpfUan] = useState(editing?.assetMeta?.uan ?? '');
  const [epfBirthYear, setEpfBirthYear] = useState(
    editing?.assetMeta?.epfBirthYear != null ? String(editing.assetMeta.epfBirthYear) : ''
  );
  const [epfCompany, setEpfCompany] = useState(() => {
    const cur = editing?.assetMeta?.epfEmployers?.find((e) => !e.toDate);
    return cur?.companyName ?? '';
  });
  const [epfBasicSalary, setEpfBasicSalary] = useState(() => {
    const cur = editing?.assetMeta?.epfEmployers?.find((e) => !e.toDate);
    return cur?.basicSalary != null ? String(cur.basicSalary) : '';
  });
  const [epfJoiningDate, setEpfJoiningDate] = useState(() => {
    const cur = editing?.assetMeta?.epfEmployers?.find((e) => !e.toDate);
    return cur?.fromDate != null ? epochToDateInput(cur.fromDate) : '';
  });
  const epfEmployeePct = (() => {
    const cur = editing?.assetMeta?.epfEmployers?.find((e) => !e.toDate);
    return cur?.employeeContribPct ?? 12;
  })();

  // FD/RD states
  const [fdSubType, setFdSubType] = useState<'fd' | 'rd'>(editing?.assetMeta?.fdSubType ?? 'fd');
  const [fdBank, setFdBank] = useState(editing?.assetMeta?.fdBank ?? '');
  const [fdStartDate, setFdStartDate] = useState(() =>
    editing?.assetMeta?.fdStartDate != null ? epochToDateInput(editing.assetMeta.fdStartDate) : ''
  );
  const [fdCompoundingFreq, setFdCompoundingFreq] = useState<CompoundingFreq>(
    editing?.assetMeta?.fdCompoundingFreq ?? 'quarterly'
  );
  const [rdTenureMonths, setRdTenureMonths] = useState(
    editing?.assetMeta?.rdTenureMonths != null ? String(editing.assetMeta.rdTenureMonths) : ''
  );

  // Precious metal states
  const [metalType, setMetalType] = useState<'gold' | 'silver'>(editing?.assetMeta?.metalType ?? 'gold');
  const [metalCategory, setMetalCategory] = useState<'jewellery' | 'coin' | 'bar' | 'digital' | 'other'>(
    editing?.assetMeta?.metalCategory ?? 'jewellery'
  );
  const [metalKarat, setMetalKarat] = useState<14 | 18 | 22 | 24>(editing?.assetMeta?.metalKarat ?? 22);
  const [metalPurity, setMetalPurity] = useState(editing?.assetMeta?.metalPurity ?? '999');
  const [metalWeightGrams, setMetalWeightGrams] = useState(
    editing?.assetMeta?.metalWeightGrams != null ? String(editing.assetMeta.metalWeightGrams) : ''
  );
  const [metalPurchasePrice, setMetalPurchasePrice] = useState(
    editing?.assetMeta?.metalPurchasePricePerGram != null ? String(editing.assetMeta.metalPurchasePricePerGram) : ''
  );

  // Vehicle states — reg number lookup flow
  const [vehicleRegInput, setVehicleRegInput] = useState(editing?.assetMeta?.vehicleRegNumber ?? '');
  const [vehicleFetching, setVehicleFetching] = useState(false);
  const [vehicleFetchError, setVehicleFetchError] = useState('');
  const [vehicleChallanSnapshot, setVehicleChallanSnapshot] = useState<
    import('@/core/vehicle/rcClient').ChallanSummary | null
  >(null);
  const [vehicleRcSnapshot, setVehicleRcSnapshot] = useState<RcDetails | null>(
    editing?.assetMeta?.vehicleRegNumber
      ? {
          regNumber: editing.assetMeta.vehicleRegNumber,
          make: editing.assetMeta.vehicleMake ?? '',
          model: editing.assetMeta.vehicleModel ?? '',
          manufactureMonthYear: '',
          year: editing.assetMeta.vehicleYear ?? null,
          fuelType: editing.assetMeta.vehicleFuelType ?? '',
          color: editing.assetMeta.vehicleColor ?? '',
          vehicleType: editing.assetMeta.vehicleType ?? '',
          bodyType: '',
          rtoLocation: editing.assetMeta.vehicleRtoLocation ?? '',
          rcStatus: editing.assetMeta.vehicleRcStatus ?? '',
          regDate: '',
          engineNo: '',
          chassisNo: '',
          rcValidUpto: editing.assetMeta.vehicleRcValidUpto ?? null,
          fitnessUpto: editing.assetMeta.vehicleFitnessUpto ?? null,
          insuranceCompany: editing.assetMeta.vehicleInsuranceCompany ?? '',
          insurancePolicyNo: '',
          insuranceUpto: editing.assetMeta.vehicleInsuranceUpto ?? null,
          puccNo: '',
          puccUpto: editing.assetMeta.vehiclePuccUpto ?? null,
          salePriceRaw: null,
          fetchedAt: editing.assetMeta.vehicleRcFetchedAt ?? nowMs(),
          ownerName: '',
          presentAddress: '',
          permanentAddress: '',
          financer: '',
          cubicCap: '',
          seatCap: '',
          unladenWeight: '',
          grossWeight: '',
          norms: ''
        }
      : null
  );

  // Property states
  const [propertyType, setPropertyType] = useState<'flat' | 'house' | 'plot' | 'commercial' | ''>(
    editing?.assetMeta?.propertyType ?? ''
  );
  const [propertyAreaSqft, setPropertyAreaSqft] = useState(
    editing?.assetMeta?.propertyAreaSqft != null ? String(editing.assetMeta.propertyAreaSqft) : ''
  );
  const [propertyCity, setPropertyCity] = useState(editing?.assetMeta?.propertyCity ?? '');

  const [saving, setSaving] = useState(false);

  // Live FD/RD preview — recomputes whenever form inputs change
  const fdPreview = useMemo(() => {
    if (assetClass !== 'fd') return null;
    const principal = parseFloat(investedAmount) || 0;
    const rate = parseFloat(interestRate) || 0;
    if (principal <= 0 || rate <= 0 || !fdStartDate) return null;

    if (fdSubType === 'fd') {
      if (!maturityDate) return null;
      const startMs = new Date(fdStartDate).getTime();
      const matMs = new Date(maturityDate).getTime();
      if (isNaN(startMs) || isNaN(matMs) || matMs <= startMs) return null;
      return calcFdMaturity(principal, rate, startMs, matMs, fdCompoundingFreq);
    } else {
      const tenure = parseInt(rdTenureMonths, 10);
      if (isNaN(tenure) || tenure <= 0) return null;
      const startMs = new Date(fdStartDate).getTime();
      if (isNaN(startMs)) return null;
      return calcRdMaturity(principal, rate, tenure, startMs);
    }
  }, [
    assetClass,
    fdSubType,
    investedAmount,
    interestRate,
    fdStartDate,
    maturityDate,
    fdCompoundingFreq,
    rdTenureMonths
  ]);

  // MF fund search — debounced 400ms via MFAPI.in (CORS-safe, no API key)
  useEffect(() => {
    interface MfSearchResult {
      schemeCode: string;
      schemeName: string;
    }
    if (assetClass !== 'mf' || mfQuery.trim().length < 2 || !!schemeCode) {
      const t = setTimeout(() => {
        setMfResults([]);
        setMfDropdownOpen(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(async () => {
      setMfSearching(true);
      try {
        const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(mfQuery.trim())}`);
        if (!res.ok) {
          setMfResults([]);
          setMfDropdownOpen(false);
          return;
        }
        const json = (await res.json()) as MfSearchResult[];
        const results = json.slice(0, 8);
        setMfResults(results);
        setMfDropdownOpen(results.length > 0);
      } catch {
        setMfResults([]);
        setMfDropdownOpen(false);
      } finally {
        setMfSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [assetClass, mfQuery, schemeCode]);

  // Fetch MF scheme detail (fund house, category, type) from MFAPI.in when a scheme is selected
  useEffect(() => {
    if (assetClass !== 'mf' || !schemeCode.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        interface MfDetailResp {
          meta?: { fund_house?: string; scheme_category?: string; scheme_type?: string };
        }
        const res = await fetch(`https://api.mfapi.in/mf/${schemeCode.trim()}`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as MfDetailResp;
        const m = json.meta;
        if (!m || cancelled) return;
        setSchemeDetail({
          fundHouse: m.fund_house ?? '',
          schemeCategory: m.scheme_category ?? '',
          schemeType: m.scheme_type ?? ''
        });
      } catch {
        /* leave existing detail */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetClass, schemeCode]);

  // Live price fetch — MF NAV via MFAPI.in, stock price via Yahoo Finance chart API
  // All setState calls inside setTimeout to satisfy react-hooks/set-state-in-effect
  useEffect(() => {
    interface YfChartMeta {
      regularMarketPrice?: number;
      shortName?: string;
      longName?: string;
    }
    interface YfChartResp {
      chart?: { result?: Array<{ meta?: YfChartMeta }> };
    }

    if (assetClass === 'mf') {
      const sc = schemeCode.trim();
      if (!sc) {
        const t = setTimeout(() => {
          setFetchedPrice(null);
          setPriceFetching(false);
        }, 0);
        return () => clearTimeout(t);
      }
      const t = setTimeout(async () => {
        setPriceFetching(true);
        try {
          const nav = await fetchMfNav(sc);
          setFetchedPrice(nav);
        } catch {
          setFetchedPrice(null);
        } finally {
          setPriceFetching(false);
        }
      }, 300);
      return () => clearTimeout(t);
    }

    if (assetClass === 'stock') {
      const sym = symbol.trim().toUpperCase();
      if (!sym) {
        const t = setTimeout(() => {
          setFetchedPrice(null);
          setPriceFetching(false);
          setStockFetchAttempted(false);
          setFetchedName('');
        }, 0);
        return () => clearTimeout(t);
      }
      const t = setTimeout(async () => {
        setStockFetchAttempted(false);
        setPriceFetching(true);
        try {
          const yfSymbol = sym.endsWith('.NS') || sym.endsWith('.BO') ? sym : `${sym}.NS`;
          const res = await fetch(`${YF_BASE}/v8/finance/chart/${yfSymbol}?interval=1d&range=1d`);
          if (!res.ok) {
            setFetchedPrice(null);
            return;
          }
          const json = (await res.json()) as YfChartResp;
          const meta = json.chart?.result?.[0]?.meta;
          const price = meta?.regularMarketPrice ?? null;
          const sname = meta?.longName ?? meta?.shortName ?? '';
          setFetchedPrice(typeof price === 'number' ? price : null);
          setFetchedName(sname);
        } catch {
          setFetchedPrice(null);
          setFetchedName('');
        } finally {
          setPriceFetching(false);
          setStockFetchAttempted(true);
        }
      }, 700);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setFetchedPrice(null);
    }, 0);
    return () => clearTimeout(t);
  }, [assetClass, schemeCode, symbol]);

  function handleSave() {
    const invested = parseFloat(investedAmount) || 0;
    const effectiveName =
      name.trim() ||
      (assetClass === 'vehicle' ? vehicleRegInput.trim() : '') ||
      (assetClass === 'stock' ? fetchedName || symbol.trim().replace(/\.(NS|BO)$/i, '') : '');
    const requiresAmount =
      assetClass !== 'vehicle' &&
      assetClass !== 'property' &&
      assetClass !== 'fd' &&
      assetClass !== 'gold' &&
      assetClass !== 'mf' &&
      assetClass !== 'stock';
    if (!effectiveName || (requiresAmount && (isNaN(invested) || invested <= 0))) return;
    if (assetClass === 'gold' && (parseFloat(metalWeightGrams) <= 0 || parseFloat(metalPurchasePrice) <= 0)) return;
    setSaving(true);
    const now = Date.now();
    const parsedUnits = parseFloat(units) || undefined;
    const parsedAvgCost = parseFloat(avgCostPrice) || undefined;
    const parsedCurrentValue = parseFloat(currentValue) || undefined;

    const holding: Holding = {
      id: editing?.id ?? crypto.randomUUID(),
      assetClass,
      name: effectiveName,
      investedAmount: invested,
      lastUpdatedAt: now,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    };

    if (parsedCurrentValue !== undefined) holding.currentValue = parsedCurrentValue;
    const notesVal = notes.trim();
    if (notesVal) holding.notes = notesVal;

    if (assetClass === 'mf') {
      const sc = schemeCode.trim();
      if (sc) holding.schemeCode = sc;
      if (parsedUnits !== undefined) holding.units = parsedUnits;
      if (parsedAvgCost !== undefined) holding.avgCostPrice = parsedAvgCost;
      holding.investedAmount = (parsedUnits ?? 0) * (parsedAvgCost ?? 0);
      if (fetchedPrice !== null) {
        holding.currentPrice = fetchedPrice;
        if (parsedUnits !== undefined) holding.currentValue = parsedUnits * fetchedPrice;
      }
      if (schemeDetail) {
        holding.assetMeta = {
          ...(holding.assetMeta ?? {}),
          mfFundHouse: schemeDetail.fundHouse,
          mfSchemeCategory: schemeDetail.schemeCategory,
          mfSchemeType: schemeDetail.schemeType
        };
      }
    } else if (assetClass === 'stock') {
      const sym = symbol.trim().toUpperCase();
      if (sym) holding.symbol = sym;
      if (parsedUnits !== undefined) holding.units = parsedUnits;
      if (parsedAvgCost !== undefined) holding.avgCostPrice = parsedAvgCost;
      holding.investedAmount = (parsedUnits ?? 0) * (parsedAvgCost ?? 0);
      if (fetchedPrice !== null) {
        holding.currentPrice = fetchedPrice;
        if (parsedUnits !== undefined) holding.currentValue = parsedUnits * fetchedPrice;
      }
    } else if (assetClass === 'fd') {
      const rate = parseFloat(interestRate);
      if (!isNaN(rate) && rate > 0) holding.interestRate = rate;
      const meta: AssetMeta = { ...(editing?.assetMeta ?? {}) };
      meta.fdSubType = fdSubType;
      if (fdBank.trim()) meta.fdBank = fdBank.trim();
      if (fdStartDate) meta.fdStartDate = new Date(fdStartDate).getTime();
      if (fdSubType === 'fd') {
        if (maturityDate) holding.maturityDate = new Date(maturityDate).getTime();
        meta.fdCompoundingFreq = fdCompoundingFreq;
      } else {
        // RD — maturity date auto-computed; investedAmount = monthly installment
        const tenure = parseInt(rdTenureMonths, 10);
        if (!isNaN(tenure) && tenure > 0) {
          meta.rdTenureMonths = tenure;
          meta.rdMonthlyInstallment = parseFloat(investedAmount) || 0;
          if (fdStartDate) {
            const ms = new Date(fdStartDate).getTime() + tenure * 30.4375 * 24 * 3600 * 1000;
            holding.maturityDate = Math.round(ms);
          }
        }
        // investedAmount for RD = total committed (installment × tenure)
        const rdInstallment = parseFloat(investedAmount) || 0;
        const tenure2 = parseInt(rdTenureMonths, 10) || 0;
        holding.investedAmount = rdInstallment * tenure2;
      }
      // Snapshot currentValue from live preview so portfolio totals are accurate
      if (fdPreview)
        holding.currentValue = fdPreview.isMatured
          ? fdPreview.maturityAmount
          : 'accruedAmount' in fdPreview
            ? fdPreview.accruedAmount
            : fdPreview.totalDeposited;
      holding.assetMeta = meta;
    } else if (assetClass === 'gold') {
      const wt = parseFloat(metalWeightGrams) || 0;
      const pp = parseFloat(metalPurchasePrice) || 0;
      holding.units = wt; // weight in grams
      holding.avgCostPrice = pp; // purchase price per gram
      holding.investedAmount = wt * pp;
      const meta: AssetMeta = { ...(editing?.assetMeta ?? {}) };
      meta.metalType = metalType;
      meta.metalCategory = metalCategory;
      meta.metalWeightGrams = wt;
      meta.metalPurchasePricePerGram = pp;
      if (metalType === 'gold') {
        meta.metalKarat = metalKarat;
        delete meta.metalPurity;
      } else {
        meta.metalPurity = metalPurity;
        delete meta.metalKarat;
      }
      holding.assetMeta = meta;
    } else if (assetClass === 'nps') {
      const meta: AssetMeta = { tier: npsTier, npsChoiceType };
      if (npsPran.trim()) meta.pran = npsPran.trim();
      const monthly = parseFloat(npsMonthly);
      if (!isNaN(monthly) && monthly > 0) meta.monthlyContribution = monthly;
      const birthYear = parseInt(npsBirthYear, 10);
      if (!isNaN(birthYear) && birthYear > 1940 && birthYear < 2010) meta.npsBirthYear = birthYear;

      if (npsChoiceType === 'auto') {
        meta.npsLifecycleFund = npsLifecycleFund;
        if (npsPfm) {
          meta.npsPfm = npsPfm;
          meta.fundManager = NPS_FUND_MANAGERS.find((m) => m.key === npsPfm)?.label ?? npsPfm;
        }
      } else {
        // active choice
        if (npsPfm) meta.npsPfm = npsPfm;
        if (npsSchemeType) meta.npsSchemeType = npsSchemeType;
        if (parsedUnits !== undefined) holding.units = parsedUnits;
      }
      holding.assetMeta = meta;
    } else if (assetClass === 'ppf') {
      const meta: AssetMeta = { ...(editing?.assetMeta ?? {}) };
      if (ppfOpeningDate) meta.ppfOpeningDate = new Date(ppfOpeningDate).getTime();
      if (ppfBank.trim()) meta.ppfBank = ppfBank.trim();
      const annual = parseFloat(ppfAnnual);
      if (!isNaN(annual) && annual > 0) meta.annualContribution = annual;
      holding.assetMeta = meta;
    } else if (assetClass === 'epf') {
      const meta: AssetMeta = { ...(editing?.assetMeta ?? {}) };
      if (epfUan.trim()) meta.uan = epfUan.trim();
      const by = parseInt(epfBirthYear, 10);
      if (!isNaN(by) && by > 1940 && by < 2010) meta.epfBirthYear = by;

      const existingEmployers: EpfEmployer[] = [...(editing?.assetMeta?.epfEmployers ?? [])];
      const currentIdx = existingEmployers.findIndex((e) => !e.toDate);
      const basic = parseFloat(epfBasicSalary);
      const empPct = epfEmployeePct;

      if (epfCompany.trim() && !isNaN(basic) && basic > 0) {
        const currentEmp = currentIdx >= 0 ? existingEmployers[currentIdx] : undefined;
        const emp: EpfEmployer = {
          id: currentEmp?.id ?? crypto.randomUUID(),
          companyName: epfCompany.trim(),
          basicSalary: basic,
          employeeContribPct: empPct,
          fromDate: epfJoiningDate ? new Date(epfJoiningDate).getTime() : Date.now()
        };
        if (currentIdx >= 0) {
          existingEmployers[currentIdx] = emp;
        } else {
          existingEmployers.push(emp);
        }
      }

      meta.epfEmployers = existingEmployers;
      holding.assetMeta = meta;
    } else if (assetClass === 'vehicle') {
      const meta: AssetMeta = { ...(editing?.assetMeta ?? {}) };
      const rc = vehicleRcSnapshot;
      if (rc) {
        meta.vehicleRegNumber = rc.regNumber;
        meta.vehicleMake = rc.make;
        meta.vehicleModel = rc.model;
        if (rc.year) meta.vehicleYear = rc.year;
        meta.vehicleFuelType = rc.fuelType;
        meta.vehicleColor = rc.color;
        meta.vehicleType = rc.vehicleType;
        meta.vehicleRtoLocation = rc.rtoLocation;
        meta.vehicleRcStatus = rc.rcStatus;
        if (rc.rcValidUpto) meta.vehicleRcValidUpto = rc.rcValidUpto;
        meta.vehicleInsuranceCompany = rc.insuranceCompany;
        if (rc.insuranceUpto) meta.vehicleInsuranceUpto = rc.insuranceUpto;
        if (rc.puccUpto) meta.vehiclePuccUpto = rc.puccUpto;
        if (rc.fitnessUpto) meta.vehicleFitnessUpto = rc.fitnessUpto;
        meta.vehicleRcFetchedAt = rc.fetchedAt;
        if (rc.engineNo) meta.vehicleEngineNo = rc.engineNo;
        if (rc.chassisNo) meta.vehicleChassisNo = rc.chassisNo;
        if (rc.regDate) meta.vehicleRegDate = rc.regDate;
        if (rc.manufactureMonthYear) meta.vehicleManufactureLabel = rc.manufactureMonthYear;
        if (rc.bodyType) meta.vehicleBodyType = rc.bodyType;
        if (rc.ownerName) meta.vehicleOwnerName = rc.ownerName;
        if (rc.presentAddress) meta.vehiclePresentAddress = rc.presentAddress;
        if (rc.permanentAddress) meta.vehiclePermanentAddress = rc.permanentAddress;
        if (rc.financer) meta.vehicleFinancer = rc.financer;
        if (rc.cubicCap) meta.vehicleCubicCap = rc.cubicCap;
        if (rc.seatCap) meta.vehicleSeatCap = rc.seatCap;
        if (rc.unladenWeight) meta.vehicleUnladenWeight = rc.unladenWeight;
        if (rc.grossWeight) meta.vehicleGrossWeight = rc.grossWeight;
        if (rc.norms) meta.vehicleNorms = rc.norms;
        if (rc.insurancePolicyNo) meta.vehicleInsurancePolicyNo = rc.insurancePolicyNo;
        if (rc.puccNo) meta.vehiclePuccNo = rc.puccNo;
      } else if (vehicleRegInput.trim()) {
        meta.vehicleRegNumber = vehicleRegInput.trim().toUpperCase();
      }
      const ch = vehicleChallanSnapshot;
      if (ch) {
        meta.vehicleChallanTotal = ch.total;
        meta.vehicleChallanPending = ch.pending;
        meta.vehicleChallanPaid = ch.paid;
        meta.vehicleChallanDisposed = ch.disposed;
        meta.vehicleChallanPendingAmount = ch.pendingAmount;
        meta.vehicleChallanFetchedAt = ch.fetchedAt;
        if (ch.records.length > 0) meta.vehicleChallanRecords = ch.records;
      }
      holding.assetMeta = meta;
    } else if (assetClass === 'property') {
      const meta: AssetMeta = { ...(editing?.assetMeta ?? {}) };
      if (propertyType) meta.propertyType = propertyType;
      const sqft = parseFloat(propertyAreaSqft);
      if (!isNaN(sqft) && sqft > 0) meta.propertyAreaSqft = sqft;
      if (propertyCity.trim()) meta.propertyCity = propertyCity.trim();
      holding.assetMeta = meta;
    }

    onSave(holding)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!editing) return;
    onDelete(editing.id).catch(() => {});
  }

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center px-4"
      style={{ paddingTop: 56, paddingBottom: 72 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-[430px] rounded-2xl p-5 flex flex-col gap-4 overflow-y-auto bg-surface"
        style={{ maxHeight: '100%' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">
            {editing
              ? assetClass === 'nps'
                ? 'Edit NPS'
                : assetClass === 'ppf'
                  ? 'Edit PPF'
                  : assetClass === 'epf'
                    ? 'Edit EPF'
                    : assetClass === 'vehicle'
                      ? 'Edit Vehicle'
                      : assetClass === 'property'
                        ? 'Edit Property'
                        : assetClass === 'fd'
                          ? 'Edit Fixed Income'
                          : assetClass === 'gold'
                            ? 'Edit Precious Metal'
                            : assetClass === 'mf'
                              ? 'Edit Mutual Fund'
                              : assetClass === 'stock'
                                ? 'Edit Stock'
                                : 'Edit holding'
              : lockAssetClass === 'nps' || assetClass === 'nps'
                ? 'Track NPS'
                : lockAssetClass === 'ppf' || assetClass === 'ppf'
                  ? 'Track PPF'
                  : lockAssetClass === 'epf' || assetClass === 'epf'
                    ? 'Track EPF'
                    : assetClass === 'vehicle'
                      ? 'Track Vehicle'
                      : assetClass === 'property'
                        ? 'Track Property'
                        : assetClass === 'fd'
                          ? 'Track Fixed Income'
                          : assetClass === 'gold'
                            ? 'Track Precious Metal'
                            : lockAssetClass === 'mf'
                              ? 'Add Mutual Fund'
                              : lockAssetClass === 'stock'
                                ? 'Add Stock'
                                : 'Add holding'}
          </h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-tertiary"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Asset class — hidden when editing an existing holding or opened from a typed card */}
        {!lockAssetClass && !editing && (
          <div>
            <label className="text-xs font-medium text-secondary">Asset type</label>
            {(() => {
              const filtered = allowedClasses
                ? allowedClasses.flatMap((cls) => {
                    const ac = ASSET_CLASSES.find((a) => a.value === cls);
                    return ac ? [ac] : [];
                  })
                : ASSET_CLASSES;
              if (filtered.length <= 2) {
                return (
                  <div className="mt-1 flex rounded-xl overflow-hidden border border-theme">
                    {filtered.map((ac) => (
                      <button
                        key={ac.value}
                        type="button"
                        onClick={() => setAssetClass(ac.value)}
                        className="flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                        style={
                          assetClass === ac.value
                            ? { backgroundColor: ac.color, color: '#fff' }
                            : { color: 'var(--color-text-secondary)' }
                        }
                      >
                        <i className={`ti ${ac.icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
                        {ac.label}
                      </button>
                    ))}
                  </div>
                );
              }
              return (
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {filtered.map((ac) => (
                    <button
                      key={ac.value}
                      type="button"
                      onClick={() => setAssetClass(ac.value)}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors"
                      style={
                        assetClass === ac.value
                          ? { borderColor: ac.color, backgroundColor: `${ac.color}10` }
                          : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-secondary)' }
                      }
                    >
                      <i
                        className={`ti ${ac.icon}`}
                        style={{
                          fontSize: 18,
                          color: assetClass === ac.value ? ac.color : 'var(--color-text-tertiary)'
                        }}
                        aria-hidden="true"
                      />
                      <span
                        className="text-[9px] font-medium text-center leading-tight"
                        style={{ color: assetClass === ac.value ? ac.color : 'var(--color-text-secondary)' }}
                      >
                        {ac.label.split(' ')[0] ?? ac.label}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Name — hidden for vehicle (RC fetch), stock (Yahoo Finance), and mf (MFAPI search) */}
        {assetClass !== 'vehicle' && assetClass !== 'stock' && assetClass !== 'mf' && (
          <div>
            <label className="text-xs font-medium text-secondary">Name</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
              placeholder={
                assetClass === 'fd'
                  ? 'e.g. SBI FD 7.1%'
                  : assetClass === 'nps'
                    ? 'e.g. My NPS Account'
                    : assetClass === 'ppf'
                      ? 'e.g. PPF Account'
                      : assetClass === 'epf'
                        ? 'e.g. EPF Account'
                        : assetClass === 'property'
                          ? 'e.g. 2BHK Whitefield'
                          : 'e.g. Gold holdings'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* MF-specific */}
        {assetClass === 'mf' && (
          <>
            {/* Search — only when adding new; editing shows plain scheme code field */}
            {!editing ? (
              <div className="relative">
                <label className="text-xs font-medium text-secondary">Search fund</label>
                <div className="mt-1 relative">
                  <input
                    type="text"
                    className="w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface pr-16"
                    placeholder="e.g. Parag Parikh, Axis Bluechip…"
                    value={mfQuery}
                    onChange={(e) => {
                      setMfQuery(e.target.value);
                      if (!e.target.value) {
                        setSchemeCode('');
                        setMfDropdownOpen(false);
                      }
                    }}
                  />
                  {mfSearching && (
                    <i
                      className="ti ti-loader-2 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-tertiary"
                      style={{ fontSize: 16 }}
                    />
                  )}
                  {schemeCode && !mfSearching && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-tertiary px-1 py-0.5"
                      onClick={() => {
                        setSchemeCode('');
                        setMfQuery('');
                        setMfDropdownOpen(false);
                        setName('');
                        setFetchedPrice(null);
                        setSchemeDetail(null);
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {mfDropdownOpen && mfResults.length > 0 && !schemeCode && (
                  <div
                    className="absolute z-10 mt-1 w-full rounded-xl border border-theme overflow-hidden shadow-lg"
                    style={{ backgroundColor: 'var(--color-surface)' }}
                  >
                    {mfResults.map((r) => (
                      <button
                        key={r.schemeCode}
                        type="button"
                        className="w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 border-b border-theme last:border-0"
                        style={{ backgroundColor: 'var(--color-surface)' }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-secondary)')
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface)')
                        }
                        onClick={() => {
                          setSchemeCode(String(r.schemeCode));
                          setMfQuery(r.schemeName);
                          if (!name) setName(r.schemeName);
                          setMfDropdownOpen(false);
                        }}
                      >
                        <p className="text-xs text-primary leading-snug truncate">{r.schemeName}</p>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: '#6366f115', color: '#6366f1' }}
                        >
                          {r.schemeCode}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {schemeCode && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    <p className="text-[10px] text-tertiary">Code: {schemeCode}</p>
                    {schemeDetail?.schemeCategory && (
                      <p className="text-[10px] text-secondary">
                        {schemeDetail.schemeCategory}
                        {schemeDetail.fundHouse ? ` · ${schemeDetail.fundHouse}` : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-secondary">
                  MFAPI scheme code <span className="font-normal text-tertiary">(e.g. 120503 for PPFAS)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="Leave blank to enter price manually"
                  value={schemeCode}
                  onChange={(e) => setSchemeCode(e.target.value)}
                />
              </div>
            )}

            {/* Live NAV */}
            {schemeCode && (
              <div className="flex items-center gap-1.5 px-0.5">
                {priceFetching ? (
                  <>
                    <i className="ti ti-loader-2 animate-spin text-tertiary" style={{ fontSize: 12 }} />
                    <span className="text-[11px] text-tertiary">Fetching NAV…</span>
                  </>
                ) : fetchedPrice !== null ? (
                  <>
                    <i className="ti ti-check" style={{ fontSize: 12, color: '#10b981' }} />
                    <span className="text-[11px] text-secondary">
                      Current NAV: <strong className="text-primary">₹{fetchedPrice.toFixed(4)}</strong>
                    </span>
                  </>
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Units held</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="0.000"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">Avg NAV (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="0.00"
                  value={avgCostPrice}
                  onChange={(e) => setAvgCostPrice(e.target.value)}
                />
              </div>
            </div>

            {/* Computed current value */}
            {fetchedPrice !== null && parseFloat(units) > 0 && (
              <div
                className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                style={{ backgroundColor: 'var(--color-surface-secondary)' }}
              >
                <span className="text-xs text-secondary">Current value (units × NAV)</span>
                <span className="text-sm font-bold text-primary">
                  ₹{(parseFloat(units) * fetchedPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
          </>
        )}

        {/* Stock-specific */}
        {assetClass === 'stock' && (
          <>
            <div>
              <label className="text-xs font-medium text-secondary">NSE symbol</label>
              <div className="mt-1 relative">
                <input
                  type="text"
                  className="w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface uppercase pr-8"
                  placeholder="e.g. RELIANCE, INFY, TCS, HDFCBANK"
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value.toUpperCase());
                    setStockFetchAttempted(false);
                    setFetchedPrice(null);
                    setFetchedName('');
                  }}
                />
                {priceFetching && (
                  <i
                    className="ti ti-loader-2 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-tertiary"
                    style={{ fontSize: 16 }}
                  />
                )}
              </div>
              {!priceFetching && fetchedPrice !== null && (
                <p className="mt-1 text-[11px]" style={{ color: '#10b981' }}>
                  <i className="ti ti-check" style={{ fontSize: 10 }} /> Current price:{' '}
                  <strong>
                    ₹{fetchedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </p>
              )}
              {!priceFetching && fetchedName && <p className="mt-0.5 text-[11px] text-secondary">{fetchedName}</p>}
              {!priceFetching && stockFetchAttempted && fetchedPrice === null && symbol.trim().length >= 1 && (
                <p className="mt-1 text-[11px] text-tertiary">
                  Symbol not found on NSE — try with .BO suffix for BSE (e.g. RELIANCE.BO)
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Shares held</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="0"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">Avg buy price (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="0.00"
                  value={avgCostPrice}
                  onChange={(e) => setAvgCostPrice(e.target.value)}
                />
              </div>
            </div>

            {/* Computed current value */}
            {fetchedPrice !== null && parseFloat(units) > 0 && (
              <div
                className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                style={{ backgroundColor: 'var(--color-surface-secondary)' }}
              >
                <span className="text-xs text-secondary">Current value (shares × price)</span>
                <span className="text-sm font-bold text-primary">
                  ₹{(parseFloat(units) * fetchedPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
          </>
        )}

        {/* FD/RD-specific */}
        {assetClass === 'fd' && (
          <div className="flex flex-col gap-3">
            {/* FD / RD toggle */}
            <div>
              <label className="text-xs font-medium text-secondary">Type</label>
              <div className="mt-1 flex rounded-xl overflow-hidden border border-theme">
                {(['fd', 'rd'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => !editing && setFdSubType(t)}
                    disabled={!!editing}
                    className="flex-1 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed"
                    style={
                      fdSubType === t
                        ? { backgroundColor: 'var(--color-primary)', color: '#fff', opacity: editing ? 0.7 : 1 }
                        : { color: 'var(--color-text-secondary)', opacity: editing ? 0.4 : 1 }
                    }
                  >
                    {t === 'fd' ? 'Fixed Deposit' : 'Recurring Deposit'}
                  </button>
                ))}
              </div>
            </div>

            {/* Bank */}
            <div>
              <label className="text-xs font-medium text-secondary">
                Bank / Institution <span className="font-normal text-tertiary">(optional)</span>
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                placeholder="e.g. SBI, HDFC, Post Office"
                value={fdBank}
                onChange={(e) => setFdBank(e.target.value)}
              />
            </div>

            {/* Start date + interest rate */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">
                  {fdSubType === 'rd' ? 'First installment date' : 'Deposit date'}
                </label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  value={fdStartDate}
                  onChange={(e) => setFdStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">Interest rate (%)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="7.1"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                />
              </div>
            </div>

            {fdSubType === 'fd' ? (
              /* FD-specific */
              <>
                <div>
                  <label className="text-xs font-medium text-secondary">Principal amount (₹)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                    placeholder="0"
                    value={investedAmount}
                    onChange={(e) => setInvestedAmount(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-secondary">Compounding</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                      value={fdCompoundingFreq}
                      onChange={(e) => setFdCompoundingFreq(e.target.value as CompoundingFreq)}
                    >
                      <option value="quarterly">Quarterly (default)</option>
                      <option value="monthly">Monthly</option>
                      <option value="half-yearly">Half-yearly</option>
                      <option value="yearly">Yearly</option>
                      <option value="at_maturity">At maturity</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary">Maturity date</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                      value={maturityDate}
                      onChange={(e) => setMaturityDate(e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              /* RD-specific */
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary">Monthly installment (₹)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                    placeholder="5000"
                    value={investedAmount}
                    onChange={(e) => setInvestedAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">Tenure (months)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                    placeholder="24"
                    value={rdTenureMonths}
                    onChange={(e) => setRdTenureMonths(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Live preview */}
            {fdPreview && (
              <div
                className="rounded-xl p-3 flex flex-col gap-1 border border-theme"
                style={{ backgroundColor: 'var(--color-surface-secondary)' }}
              >
                {fdSubType === 'fd' ? (
                  <>
                    <p className="text-[11px] text-tertiary">Projected maturity amount</p>
                    <p className="text-base font-bold text-primary">
                      ₹{fdPreview.maturityAmount.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[11px]" style={{ color: '#10b981' }}>
                      +₹{fdPreview.totalInterest.toLocaleString('en-IN')} interest (
                      {(
                        ((fdPreview.maturityAmount - (parseFloat(investedAmount) || 0)) /
                          (parseFloat(investedAmount) || 1)) *
                        100
                      ).toFixed(1)}
                      %)
                    </p>
                    {'daysRemaining' in fdPreview && fdPreview.daysRemaining > 0 && (
                      <p className="text-[10px] text-tertiary">{fdPreview.daysRemaining} days remaining</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-tertiary">Projected maturity amount</p>
                    <p className="text-base font-bold text-primary">
                      ₹{fdPreview.maturityAmount.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[11px]" style={{ color: '#10b981' }}>
                      +₹{fdPreview.totalInterest.toLocaleString('en-IN')} interest over {rdTenureMonths} months
                    </p>
                    <p className="text-[10px] text-tertiary">
                      Total committed: ₹
                      {((parseFloat(investedAmount) || 0) * (parseInt(rdTenureMonths, 10) || 0)).toLocaleString(
                        'en-IN'
                      )}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* NPS-specific */}
        {assetClass === 'nps' && (
          <>
            {/* Choice type toggle */}
            <div>
              <label className="text-xs font-medium text-secondary">Investment choice</label>
              <div className="mt-1 flex rounded-xl overflow-hidden border border-theme">
                {(['auto', 'active'] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setNpsChoiceType(choice)}
                    className="flex-1 py-2.5 text-xs font-medium transition-colors"
                    style={
                      npsChoiceType === choice
                        ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                        : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }
                    }
                  >
                    {choice === 'auto' ? 'Auto / Lifecycle' : 'Active Choice'}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Choice: lifecycle fund selector — pills + contextual description */}
            {npsChoiceType === 'auto' && (
              <div>
                <label className="text-xs font-medium text-secondary">Lifecycle fund</label>
                <div className="mt-1 flex gap-1.5 flex-wrap">
                  {(Object.values(LIFECYCLE_FUNDS) as (typeof LIFECYCLE_FUNDS)[keyof typeof LIFECYCLE_FUNDS][]).map(
                    (fund) => {
                      const isSelected = npsLifecycleFund === fund.key;
                      return (
                        <button
                          key={fund.key}
                          type="button"
                          onClick={() => setNpsLifecycleFund(fund.key as NpsLifecycleFund)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border"
                          style={
                            isSelected
                              ? { backgroundColor: fund.color, color: '#fff', borderColor: fund.color }
                              : {
                                  backgroundColor: 'var(--color-surface-secondary)',
                                  color: 'var(--color-text-secondary)',
                                  borderColor: 'var(--color-border)'
                                }
                          }
                        >
                          {fund.shortLabel}
                        </button>
                      );
                    }
                  )}
                </div>
                {/* Selected fund description + schedule link */}
                {(() => {
                  const selected = LIFECYCLE_FUNDS[npsLifecycleFund];
                  return (
                    <div className="mt-2 px-1">
                      <p className="text-xs leading-snug" style={{ color: selected.color }}>
                        {selected.description}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowNpsSchedule(true)}
                        className="mt-1 text-xs font-medium underline underline-offset-2"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        See year-by-year allocation →
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Active Choice: fund manager + scheme type + tier + units */}
            {npsChoiceType === 'active' && (
              <>
                <div>
                  <label className="text-xs font-medium text-secondary">Fund manager</label>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {NPS_FUND_MANAGERS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setNpsPfm(npsPfm === m.key ? '' : (m.key as NpsPfmKey))}
                        className="px-2.5 py-2 rounded-xl text-[11px] font-medium text-left leading-tight transition-colors border"
                        style={
                          npsPfm === m.key
                            ? {
                                backgroundColor: 'var(--color-primary)',
                                color: '#fff',
                                borderColor: 'var(--color-primary)'
                              }
                            : {
                                backgroundColor: 'var(--color-surface-secondary)',
                                color: 'var(--color-text-secondary)',
                                borderColor: 'var(--color-border)'
                              }
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-secondary">Scheme type</label>
                    <div className="mt-1 grid grid-cols-4 rounded-xl overflow-hidden border border-theme">
                      {(['E', 'C', 'G', 'A'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNpsSchemeType(t)}
                          className="py-2 text-xs font-semibold transition-colors"
                          style={
                            npsSchemeType === t
                              ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                              : { color: 'var(--color-text-secondary)' }
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary">Tier</label>
                    <div className="mt-1 grid grid-cols-2 rounded-xl overflow-hidden border border-theme">
                      {(['tier1', 'tier2'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNpsTier(t)}
                          className="py-2 text-xs font-semibold transition-colors"
                          style={
                            npsTier === t
                              ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                              : { color: 'var(--color-text-secondary)' }
                          }
                        >
                          {t === 'tier1' ? 'Tier I' : 'Tier II'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">Units held</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                    placeholder="0.0000"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                  />
                  <p className="mt-1 text-[10px] text-tertiary">
                    NAV is auto-fetched from npsnav.in — live corpus shown on the card
                  </p>
                </div>
              </>
            )}

            {/* Common NPS fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Birth year</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="e.g. 1985"
                  value={npsBirthYear}
                  onChange={(e) => setNpsBirthYear(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">
                  PRAN <span className="font-normal text-tertiary">(opt.)</span>
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="12-digit"
                  value={npsPran}
                  onChange={(e) => setNpsPran(e.target.value)}
                />
              </div>
            </div>
            {npsChoiceType === 'auto' && (
              <>
                <div>
                  <label className="text-xs font-medium text-secondary">
                    Fund manager <span className="font-normal text-tertiary">(optional)</span>
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {NPS_FUND_MANAGERS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setNpsPfm(npsPfm === m.key ? '' : (m.key as NpsPfmKey))}
                        className="px-2.5 py-2 rounded-xl text-[11px] font-medium text-left leading-tight transition-colors border"
                        style={
                          npsPfm === m.key
                            ? {
                                backgroundColor: 'var(--color-primary)',
                                color: '#fff',
                                borderColor: 'var(--color-primary)'
                              }
                            : {
                                backgroundColor: 'var(--color-surface-secondary)',
                                color: 'var(--color-text-secondary)',
                                borderColor: 'var(--color-border)'
                              }
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">Tier</label>
                  <div className="mt-1 grid grid-cols-2 rounded-xl overflow-hidden border border-theme">
                    {(['tier1', 'tier2'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNpsTier(t)}
                        className="py-2 text-xs font-semibold transition-colors"
                        style={
                          npsTier === t
                            ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                            : { color: 'var(--color-text-secondary)' }
                        }
                      >
                        {t === 'tier1' ? 'Tier I' : 'Tier II'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-secondary">Monthly contribution (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                placeholder="0"
                value={npsMonthly}
                onChange={(e) => setNpsMonthly(e.target.value)}
              />
            </div>
          </>
        )}

        {/* PPF-specific */}
        {assetClass === 'ppf' && (
          <div className="flex flex-col gap-3">
            {/* Opening date + derived maturity */}
            <div>
              <label className="text-xs font-medium text-secondary">Account opening date</label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                value={ppfOpeningDate}
                onChange={(e) => setPpfOpeningDate(e.target.value)}
              />
              {ppfOpeningDate && ppfMaturityLabel(ppfOpeningDate) && (
                <p className="mt-1 text-xs" style={{ color: '#8b5cf6' }}>
                  {ppfMaturityLabel(ppfOpeningDate)?.text}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Annual contribution (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="e.g. 150000"
                  value={ppfAnnual}
                  onChange={(e) => setPpfAnnual(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">
                  Bank / Institution <span className="font-normal text-tertiary">(optional)</span>
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="e.g. SBI"
                  value={ppfBank}
                  onChange={(e) => setPpfBank(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-tertiary -mt-1">
              Transactions (deposits, interest, withdrawals) are added from the PPF card after saving.
            </p>
          </div>
        )}

        {/* EPF-specific */}
        {assetClass === 'epf' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">
                  UAN <span className="font-normal text-tertiary">(optional)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="12-digit UAN"
                  value={epfUan}
                  onChange={(e) => setEpfUan(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">
                  Birth year <span className="font-normal text-tertiary">(optional)</span>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="e.g. 1990"
                  value={epfBirthYear}
                  onChange={(e) => setEpfBirthYear(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary">Current employer</label>
              <input
                type="text"
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                placeholder="e.g. TCS, Infosys, Wipro"
                value={epfCompany}
                onChange={(e) => setEpfCompany(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Basic + DA (₹/mo)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="e.g. 60000"
                  value={epfBasicSalary}
                  onChange={(e) => setEpfBasicSalary(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">Joining date</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  value={epfJoiningDate}
                  onChange={(e) => setEpfJoiningDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-tertiary -mt-1">
              Add previous employers and transaction history from the EPF card after saving.
            </p>
          </div>
        )}

        {/* Precious metal fields */}
        {assetClass === 'gold' && (
          <div className="flex flex-col gap-3">
            {/* Gold / Silver toggle */}
            <div>
              <label className="text-xs font-medium text-secondary">Metal</label>
              <div className="mt-1 flex rounded-xl overflow-hidden border border-theme">
                {(['gold', 'silver'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => !editing && setMetalType(m)}
                    disabled={!!editing}
                    className="flex-1 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed"
                    style={
                      metalType === m
                        ? {
                            backgroundColor: m === 'gold' ? '#d97706' : '#94a3b8',
                            color: '#fff',
                            opacity: editing ? 0.7 : 1
                          }
                        : { color: 'var(--color-text-secondary)', opacity: editing ? 0.4 : 1 }
                    }
                  >
                    {m === 'gold' ? '🥇 Gold' : '🥈 Silver'}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-medium text-secondary">Category</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(['jewellery', 'coin', 'bar', 'digital', 'other'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setMetalCategory(cat)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                    style={
                      metalCategory === cat
                        ? {
                            backgroundColor: 'var(--color-primary)',
                            color: '#fff',
                            borderColor: 'var(--color-primary)'
                          }
                        : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                    }
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Karat (gold) or Purity (silver) */}
            {metalType === 'gold' ? (
              <div>
                <label className="text-xs font-medium text-secondary">Karat</label>
                <div className="mt-1 flex gap-2">
                  {([14, 18, 22, 24] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setMetalKarat(k)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors"
                      style={
                        metalKarat === k
                          ? { backgroundColor: '#d97706', color: '#fff', borderColor: '#d97706' }
                          : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                      }
                    >
                      {k}K
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-secondary">Purity</label>
                <div className="mt-1 flex gap-2">
                  {(['999', '925', '800', 'other'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMetalPurity(p)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors"
                      style={
                        metalPurity === p
                          ? { backgroundColor: '#94a3b8', color: '#fff', borderColor: '#94a3b8' }
                          : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                      }
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Weight + Purchase price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Weight (grams)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="0.00"
                  value={metalWeightGrams}
                  onChange={(e) => setMetalWeightGrams(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">Purchase price (₹/g)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="0.00"
                  value={metalPurchasePrice}
                  onChange={(e) => setMetalPurchasePrice(e.target.value)}
                />
              </div>
            </div>

            {/* Invested amount preview */}
            {parseFloat(metalWeightGrams) > 0 && parseFloat(metalPurchasePrice) > 0 && (
              <div
                className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                style={{ backgroundColor: 'var(--color-surface-secondary)' }}
              >
                <span className="text-xs text-secondary">Total invested</span>
                <span className="text-sm font-bold text-primary">
                  ₹
                  {(parseFloat(metalWeightGrams) * parseFloat(metalPurchasePrice)).toLocaleString('en-IN', {
                    maximumFractionDigits: 0
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Vehicle fields — plate number lookup */}
        {assetClass === 'vehicle' && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-secondary">Registration number</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface font-mono uppercase"
                  placeholder="e.g. MH12AB1234"
                  value={vehicleRegInput}
                  onChange={(e) => {
                    setVehicleRegInput(e.target.value.toUpperCase());
                    setVehicleFetchError('');
                    if (vehicleRcSnapshot) setVehicleRcSnapshot(null);
                  }}
                />
                <button
                  type="button"
                  disabled={vehicleFetching || vehicleRegInput.trim().length < 6}
                  onClick={async () => {
                    setVehicleFetching(true);
                    setVehicleFetchError('');
                    try {
                      const { rc, challans } = await fetchVehicleData(vehicleRegInput.trim());
                      setVehicleRcSnapshot(rc);
                      setVehicleChallanSnapshot(challans);
                      setVehicleRegInput(rc.regNumber);
                      const autoName = [rc.make, rc.model, rc.year ? String(rc.year) : ''].filter(Boolean).join(' ');
                      if (autoName) setName(autoName);
                      // salePriceRaw = ex-showroom purchase price
                      if (rc.salePriceRaw && rc.salePriceRaw > 0) {
                        if (!investedAmount) setInvestedAmount(String(rc.salePriceRaw));
                        // Estimate depreciated current value (IRDA IDV method)
                        if (!currentValue && rc.year) {
                          const yearsOld = new Date().getFullYear() - rc.year;
                          const deprRates = [0.05, 0.15, 0.3, 0.4, 0.5];
                          const rate = yearsOld <= 0 ? 0 : (deprRates[Math.min(yearsOld - 1, 4)] ?? 0.5);
                          const estimated = Math.round(rc.salePriceRaw * (1 - rate));
                          setCurrentValue(String(estimated));
                        }
                      }
                    } catch (e) {
                      setVehicleFetchError(e instanceof Error ? e.message : 'Could not fetch vehicle details');
                    } finally {
                      setVehicleFetching(false);
                    }
                  }}
                  className="flex-shrink-0 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: '#3b82f6' }}
                >
                  {vehicleFetching ? '…' : 'Fetch'}
                </button>
              </div>
              {vehicleFetchError && <p className="text-[11px] text-red-500 mt-1">{vehicleFetchError}</p>}
            </div>

            {/* Fetched RC details preview */}
            {vehicleRcSnapshot && (
              <div className="rounded-xl p-3 flex flex-col gap-2 bg-surface-2 border border-theme">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-primary">
                    {vehicleRcSnapshot.make} {vehicleRcSnapshot.model}
                    {vehicleRcSnapshot.year ? ` · ${vehicleRcSnapshot.year}` : ''}
                  </p>
                  <span
                    className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: vehicleRcSnapshot.rcStatus === 'ACTIVE' ? '#10b98115' : '#ef444415',
                      color: vehicleRcSnapshot.rcStatus === 'ACTIVE' ? '#10b981' : '#ef4444'
                    }}
                  >
                    {vehicleRcSnapshot.rcStatus}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {vehicleRcSnapshot.fuelType && (
                    <p className="text-[10px] text-tertiary">
                      Fuel: <span className="text-secondary">{vehicleRcSnapshot.fuelType}</span>
                    </p>
                  )}
                  {vehicleRcSnapshot.color && (
                    <p className="text-[10px] text-tertiary">
                      Colour: <span className="text-secondary">{vehicleRcSnapshot.color}</span>
                    </p>
                  )}
                  {vehicleRcSnapshot.rtoLocation && (
                    <p className="text-[10px] text-tertiary col-span-2">
                      RTO: <span className="text-secondary">{vehicleRcSnapshot.rtoLocation}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-theme">
                  {vehicleRcSnapshot.insuranceUpto && (
                    <ValidityBadge label="Insurance" upto={vehicleRcSnapshot.insuranceUpto} />
                  )}
                  {vehicleRcSnapshot.puccUpto && <ValidityBadge label="PUC" upto={vehicleRcSnapshot.puccUpto} />}
                  {vehicleRcSnapshot.rcValidUpto && <ValidityBadge label="RC" upto={vehicleRcSnapshot.rcValidUpto} />}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Property fields */}
        {assetClass === 'property' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Type</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value as typeof propertyType)}
                >
                  <option value="">Select…</option>
                  <option value="flat">Flat</option>
                  <option value="house">House</option>
                  <option value="plot">Plot</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">Area (sqft)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="e.g. 1200"
                  value={propertyAreaSqft}
                  onChange={(e) => setPropertyAreaSqft(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary">City</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                placeholder="e.g. Bangalore"
                value={propertyCity}
                onChange={(e) => setPropertyCity(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Balance / invested amount — hidden for vehicle, fd, gold, mf, stock (auto-computed from units × price) */}
        {assetClass !== 'vehicle' &&
          assetClass !== 'fd' &&
          assetClass !== 'gold' &&
          assetClass !== 'mf' &&
          assetClass !== 'stock' && (
            <div>
              <label className="text-xs font-medium text-secondary">
                {assetClass === 'nps' || assetClass === 'ppf' || assetClass === 'epf'
                  ? 'Current corpus / balance (₹)'
                  : assetClass === 'property'
                    ? 'Purchase price (₹)'
                    : 'Amount invested (₹)'}
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                placeholder="0"
                value={investedAmount}
                onChange={(e) => setInvestedAmount(e.target.value)}
              />
            </div>
          )}

        {/* Current value — not for retirement, vehicle, fd, gold, mf, stock (all auto-calculated) */}
        {assetClass !== 'nps' &&
          assetClass !== 'ppf' &&
          assetClass !== 'epf' &&
          assetClass !== 'vehicle' &&
          assetClass !== 'fd' &&
          assetClass !== 'gold' &&
          assetClass !== 'mf' &&
          assetClass !== 'stock' && (
            <div>
              <label className="text-xs font-medium text-secondary">
                {assetClass === 'property' ? 'Current market value (₹)' : 'Current value (₹)'}
                {assetClass !== 'property' && (
                  <span className="font-normal text-tertiary"> — optional, fetched automatically for MF/stocks</span>
                )}
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                placeholder={assetClass === 'property' ? 'e.g. 6500000' : 'Leave blank to use invested amount'}
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
              />
              {assetClass === 'property' && (
                <p className="text-[10px] text-tertiary mt-1">
                  You can update this anytime from the card — a staleness reminder appears after 90 days.
                </p>
              )}
            </div>
          )}

        {/* Notes — hidden for vehicle */}
        {assetClass !== 'vehicle' && (
          <div>
            <label className="text-xs font-medium text-secondary">Notes (optional)</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
              placeholder="e.g. held in Zerodha, SBI Kolar branch"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}

        {showNpsSchedule && (
          <NpsLifecycleDetail
            fund={npsLifecycleFund}
            birthYearStr={npsBirthYear}
            onClose={() => setShowNpsSchedule(false)}
          />
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          {editing && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Saving…' : editing ? 'Update' : 'Add holding'}
          </button>
        </div>
      </div>
    </div>
  );
}
