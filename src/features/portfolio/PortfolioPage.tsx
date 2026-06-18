import { useState, useMemo, useEffect } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { holdingsRepo } from '@/core/db/repositories';
import { fetchMfNav, fetchStockPrice } from '@/core/db/priceCache';
import { useRepository } from '@/hooks/useRepository';
import type {
  AssetClass,
  AssetMeta,
  EpfEmployer,
  EpfTransaction,
  EpfTransactionType,
  Holding,
  PpfTransaction,
  PpfTransactionType
} from '@/core/db/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { HoldingForm } from './HoldingForm';
import { useIpos } from '@/core/ipo/useIpos';
import { fetchIpoSubscription } from '@/core/ipo/ipoClient';
import type { IpoItem, IpoStatus, IpoSubDetail } from '@/core/ipo/ipoTypes';
import { LIFECYCLE_FUNDS, getAllocationAtAge, findNpsSchemeCode, fetchNpsNav, getPfmLabel } from '@/core/nps';
import type { NpsNavDetail, NpsPfmKey, NpsSchemeType, NpsLifecycleFund } from '@/core/nps';

// ─── Asset metadata ───────────────────────────────────────────────────────────

const ASSET_META: Record<AssetClass, { label: string; icon: string; color: string }> = {
  mf: { label: 'Mutual Funds', icon: 'ti-chart-donut', color: '#6366f1' },
  stock: { label: 'Stocks', icon: 'ti-trending-up', color: '#0ea5e9' },
  fd: { label: 'FD / RD', icon: 'ti-building-bank', color: '#f59e0b' },
  nps: { label: 'NPS', icon: 'ti-building-community', color: '#10b981' },
  ppf: { label: 'PPF', icon: 'ti-safe', color: '#8b5cf6' },
  epf: { label: 'EPF', icon: 'ti-building-factory', color: '#64748b' },
  gold: { label: 'Gold', icon: 'ti-coin', color: '#d97706' },
  other: { label: 'Other', icon: 'ti-dots', color: '#6b7280' }
};

const ASSET_ORDER: AssetClass[] = ['mf', 'stock', 'fd', 'nps', 'ppf', 'epf', 'gold', 'other'];

// ─── Holdings sub-tabs ────────────────────────────────────────────────────────

type HoldingsSubTab = 'stocks' | 'mf' | 'fixed_income' | 'precious_metals' | 'retirement' | 'real_assets';

interface HoldingsSubTabConfig {
  key: HoldingsSubTab;
  label: string;
  assetClasses: AssetClass[];
  icon: string;
  emptyMessage: string;
}

const HOLDINGS_SUBTABS: HoldingsSubTabConfig[] = [
  {
    key: 'stocks',
    label: 'Stocks',
    assetClasses: ['stock'],
    icon: 'ti-trending-up',
    emptyMessage: 'No stocks yet. Tap + to track your equity holdings.'
  },
  {
    key: 'mf',
    label: 'Mutual Funds',
    assetClasses: ['mf'],
    icon: 'ti-chart-donut',
    emptyMessage: 'No mutual funds yet. Tap + to add your MF holdings.'
  },
  {
    key: 'fixed_income',
    label: 'Fixed Income',
    assetClasses: ['fd'],
    icon: 'ti-building-bank',
    emptyMessage: 'No FDs or RDs yet. Tap + to track your fixed deposits.'
  },
  {
    key: 'precious_metals',
    label: 'Metals',
    assetClasses: ['gold'],
    icon: 'ti-coin',
    emptyMessage: 'No gold holdings yet. Tap + to track your precious metals.'
  },
  {
    key: 'retirement',
    label: 'Retirement',
    assetClasses: ['nps', 'ppf', 'epf'],
    icon: 'ti-shield-check',
    emptyMessage: 'No retirement accounts yet. Tap + to add NPS, PPF, or EPF.'
  },
  {
    key: 'real_assets',
    label: 'Real Assets',
    assetClasses: ['other'],
    icon: 'ti-home',
    emptyMessage: 'No real assets yet. Vehicles and property tracking coming soon.'
  }
];

// ─── IPO sub-tabs ─────────────────────────────────────────────────────────────

const IPO_SUBTAB_ORDER: IpoStatus[] = ['upcoming', 'open', 'closed', 'listed'];

const IPO_SUBTAB_META: Record<IpoStatus, { label: string; icon: string; emptyMessage: string }> = {
  upcoming: { label: 'Upcoming', icon: 'ti-calendar-event', emptyMessage: 'No upcoming IPOs right now.' },
  open: { label: 'Open', icon: 'ti-door-enter', emptyMessage: 'No IPOs are currently open for subscription.' },
  closed: { label: 'Closed', icon: 'ti-clock-hour-4', emptyMessage: 'No closed IPOs awaiting listing.' },
  listed: { label: 'Listed', icon: 'ti-list-check', emptyMessage: 'No recently listed IPOs.' }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effectiveValue(h: Holding): number {
  return h.currentValue ?? h.investedAmount;
}

function formatLastUpdated(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Updated just now';
  return `Updated ${new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function formatIpoDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const close = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  close.setHours(0, 0, 0, 0);
  const diff = Math.ceil((close.getTime() - today.getTime()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

function staleDays(h: Holding): number {
  const ts = h.lastUpdatedAt ?? h.updatedAt;
  return Math.floor((Date.now() - ts) / 86_400_000);
}

// ─── NPS allocation pills ─────────────────────────────────────────────────────

function AllocationPills({ equity, corporate, govt }: { equity: number; corporate: number; govt: number }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#0ea5e915', color: '#0ea5e9' }}
      >
        E {equity}%
      </span>
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#f59e0b15', color: '#d97706' }}
      >
        C {corporate}%
      </span>
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#10b98115', color: '#10b981' }}
      >
        G {govt}%
      </span>
    </div>
  );
}

// ─── NpsScheduleSheet ─────────────────────────────────────────────────────────

function NpsScheduleSheet({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const meta = holding.assetMeta ?? {};
  const fund = meta.npsLifecycleFund as NpsLifecycleFund | undefined;
  if (!fund || !LIFECYCLE_FUNDS[fund]) return null;

  const config = LIFECYCLE_FUNDS[fund];
  const currentYear = new Date().getFullYear();
  const userAge = meta.npsBirthYear ? currentYear - meta.npsBirthYear : null;
  const currentAgeRow = userAge != null ? Math.max(35, Math.min(55, userAge)) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="relative w-full rounded-t-2xl max-h-[88vh] overflow-y-auto bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
            <p className="text-xs text-secondary mt-1 leading-snug">{config.description}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-tertiary"
            style={{ backgroundColor: 'var(--color-surface-secondary)' }}
          >
            <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
          </button>
        </div>

        {/* Table */}
        <div className="p-4">
          {userAge != null && (
            <p className="text-xs text-secondary mb-3">
              Your age: <strong className="text-primary">{userAge}</strong>
              {userAge < 35 && ' — PFRDA schedule starts at 35 (current allocation: max equity)'}
              {userAge > 55 && ' — PFRDA schedule ends at 55 (current allocation: min equity)'}
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
                      <td className="px-3 py-2">
                        <span className={isCurrent ? 'font-bold text-primary' : 'text-secondary'}>
                          {row.age}
                          {isCurrent && ' ← you'}
                        </span>
                      </td>
                      <td className="text-right px-2 py-2 tabular-nums font-medium" style={{ color: '#0ea5e9' }}>
                        {row.equity}%
                      </td>
                      <td className="text-right px-2 py-2 tabular-nums font-medium" style={{ color: '#d97706' }}>
                        {row.corporate}%
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums font-medium" style={{ color: '#10b981' }}>
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

// ─── PPF helpers ─────────────────────────────────────────────────────────────

const PPF_RATE = 0.071;
const PPF_MAX_ANNUAL = 150_000;

function ppfMaturityMs(openingMs: number): number {
  const d = new Date(openingMs);
  d.setFullYear(d.getFullYear() + 15);
  return d.getTime();
}

function ppfProjectedCorpus(balanceNow: number, annualContrib: number, yearsLeft: number): number {
  if (yearsLeft <= 0) return balanceNow;
  const r = PPF_RATE;
  // year-end compounding: balance grows + annual contributions
  return balanceNow * Math.pow(1 + r, yearsLeft) + annualContrib * ((Math.pow(1 + r, yearsLeft) - 1) / r);
}

function ppfFyStart(): Date {
  const now = new Date();
  return now.getMonth() >= 3 ? new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1);
}

function ppfThisYearDeposits(txns: PpfTransaction[]): number {
  const fyStart = ppfFyStart().getTime();
  return txns.filter((t) => t.type === 'deposit' && t.date >= fyStart).reduce((s, t) => s + t.amount, 0);
}

function isBeforeFifth(dateMs: number): boolean {
  return new Date(dateMs).getDate() <= 5;
}

function epochToDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayDateInput(): string {
  return epochToDateInput(Date.now());
}

interface PpfCardData {
  sortedTxns: PpfTransaction[];
  maturityMs: number | null;
  yearsLeft: number | null;
  yearsElapsed: number | null;
  projected: number | null;
  fyDeposits: number;
  fyPct: number;
  showAprilTip: boolean;
}

function ppfBuildCardData(meta: AssetMeta, balance: number): PpfCardData {
  const now = Date.now();
  const txns: PpfTransaction[] = meta.ppfTransactions ?? [];
  const sortedTxns = [...txns].sort((a, b) => b.date - a.date);
  const maturityMs = meta.ppfOpeningDate ? ppfMaturityMs(meta.ppfOpeningDate) : null;
  const yearsLeft = maturityMs ? Math.max(0, (maturityMs - now) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const yearsElapsed = meta.ppfOpeningDate
    ? Math.min(15, (now - meta.ppfOpeningDate) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const annualContrib = meta.annualContribution ?? 0;
  const projected =
    yearsLeft != null && annualContrib > 0 ? ppfProjectedCorpus(balance, annualContrib, Math.ceil(yearsLeft)) : null;
  const fyDeposits = ppfThisYearDeposits(txns);
  const fyPct = Math.min(100, (fyDeposits / PPF_MAX_ANNUAL) * 100);
  const nowMonth = new Date(now).getMonth();
  const showAprilTip = (nowMonth === 2 || nowMonth === 3) && fyDeposits === 0;
  return { sortedTxns, maturityMs, yearsLeft, yearsElapsed, projected, fyDeposits, fyPct, showAprilTip };
}

// ─── PpfTransactionSheet ──────────────────────────────────────────────────────

function PpfTransactionSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const [txType, setTxType] = useState<PpfTransactionType>('deposit');
  const [txDate, setTxDate] = useState(() => todayDateInput());
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [saving, setSaving] = useState(false);

  const dateMs = txDate ? new Date(txDate).getTime() : 0;
  const beforeFifth = isBeforeFifth(dateMs);
  const showFifthHint = txType === 'deposit' && txDate !== '';

  function handleAdd() {
    const amt = parseFloat(txAmount);
    if (isNaN(amt) || amt <= 0) return;
    setSaving(true);
    const newTx: PpfTransaction = {
      id: crypto.randomUUID(),
      type: txType,
      date: dateMs,
      amount: amt,
      note: txNote.trim() || undefined
    };
    const existing = holding.assetMeta?.ppfTransactions ?? [];
    const updated: Holding = {
      ...holding,
      assetMeta: { ...holding.assetMeta, ppfTransactions: [...existing, newTx] },
      updatedAt: Date.now()
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  const typeConfig: Record<PpfTransactionType, { label: string; color: string }> = {
    deposit: { label: 'Deposit', color: '#8b5cf6' },
    interest: { label: 'Interest credited', color: '#10b981' },
    withdrawal: { label: 'Withdrawal', color: '#f59e0b' }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-end" onClick={onClose}>
      <div
        className="relative w-full rounded-t-2xl p-5 flex flex-col gap-4 bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">Add PPF transaction</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-tertiary"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Transaction type pills */}
        <div className="flex gap-2">
          {(['deposit', 'interest', 'withdrawal'] as PpfTransactionType[]).map((t) => {
            const cfg = typeConfig[t];
            const active = txType === t;
            return (
              <button
                key={t}
                onClick={() => setTxType(t)}
                className="flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                style={
                  active
                    ? { backgroundColor: cfg.color, color: '#fff', borderColor: cfg.color }
                    : {
                        backgroundColor: 'var(--color-surface-secondary)',
                        color: 'var(--color-text-secondary)',
                        borderColor: 'var(--color-border)'
                      }
                }
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium text-secondary">Date</label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
          />
          {showFifthHint && (
            <p
              className="mt-1 text-xs font-medium flex items-center gap-1"
              style={{ color: beforeFifth ? '#10b981' : '#f59e0b' }}
            >
              <i
                className={`ti ${beforeFifth ? 'ti-circle-check' : 'ti-alert-triangle'}`}
                style={{ fontSize: 13 }}
                aria-hidden="true"
              />
              {beforeFifth ? 'Before 5th — earns interest this month' : 'After 5th — interest starts next month'}
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-medium text-secondary">Amount (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
            placeholder="0"
            value={txAmount}
            onChange={(e) => setTxAmount(e.target.value)}
            autoFocus
          />
        </div>

        {/* Note */}
        <div>
          <label className="text-xs font-medium text-secondary">
            Note <span className="font-normal text-tertiary">(optional)</span>
          </label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
            placeholder="e.g. Annual lump sum"
            value={txNote}
            onChange={(e) => setTxNote(e.target.value)}
          />
        </div>

        <button
          onClick={handleAdd}
          disabled={saving || !txAmount || parseFloat(txAmount) <= 0}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {saving ? 'Saving…' : 'Add transaction'}
        </button>
      </div>
    </div>
  );
}

// ─── EPF helpers ─────────────────────────────────────────────────────────────

const EPF_RATE = 0.0825;
const EPF_EMPLOYER_EPF_PCT = 0.0367;
const EPS_PCT = 0.0833;
const EPF_RETIREMENT_AGE = 58;

function epfCurrentEmployer(employers: EpfEmployer[]): EpfEmployer | null {
  return employers.find((e) => !e.toDate) ?? null;
}

function epfMonthsBetween(fromMs: number, toMs: number): number {
  const f = new Date(fromMs);
  const t = new Date(toMs);
  return Math.max(0, (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth());
}

function epfNowMs(): number {
  return Date.now();
}

function epfMonthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

// ── EPF computed months (auto-generated from employment history) ──────────────

interface EpfMonthEntry {
  month: string; // "YYYY-MM"
  fyLabel: string; // "FY 2025-26"
  fyStartYear: number;
  companyName: string;
  empAmount: number;
  eplrEpfAmount: number;
  epsAmount: number;
  proRata?: { workedDays: number; totalDays: number }; // present only for partial months
}

function epfMonthToFy(month: string): { label: string; startYear: number } {
  const [y, m] = month.split('-').map(Number);
  const s = m >= 4 ? y : y - 1;
  return { label: `FY ${s}-${String(s + 1).slice(2)}`, startYear: s };
}

function epfComputeAllMonths(employers: EpfEmployer[]): EpfMonthEntry[] {
  const entries: EpfMonthEntry[] = [];
  const now = new Date();
  for (const emp of employers) {
    const from = new Date(emp.fromDate);
    const to = emp.toDate ? new Date(emp.toDate) : now;
    let y = from.getFullYear();
    let mo = from.getMonth() + 1;
    const toY = to.getFullYear();
    const toMo = to.getMonth() + 1;
    while (y < toY || (y === toY && mo <= toMo)) {
      const month = `${y}-${String(mo).padStart(2, '0')}`;
      const fy = epfMonthToFy(month);
      const daysInMonth = new Date(y, mo, 0).getDate();
      // Pro-rata: joining month starts from join day; last month ends on last working day
      const isFirstMonth = y === from.getFullYear() && mo === from.getMonth() + 1;
      const isLastMonth = y === toY && mo === toMo;
      let workedDays = daysInMonth;
      if (isFirstMonth && from.getDate() > 1) workedDays = daysInMonth - (from.getDate() - 1);
      if (isLastMonth && to.getDate() < daysInMonth) workedDays = Math.min(workedDays, to.getDate());
      const fraction = workedDays / daysInMonth;
      const isPartial = workedDays < daysInMonth;
      entries.push({
        month,
        fyLabel: fy.label,
        fyStartYear: fy.startYear,
        companyName: emp.companyName,
        empAmount: Math.round(emp.basicSalary * (emp.employeeContribPct / 100) * fraction),
        eplrEpfAmount: Math.round(emp.basicSalary * EPF_EMPLOYER_EPF_PCT * fraction),
        epsAmount: Math.round(emp.basicSalary * EPS_PCT * fraction),
        ...(isPartial && { proRata: { workedDays, totalDays: daysInMonth } })
      });
      mo++;
      if (mo > 12) {
        mo = 1;
        y++;
      }
    }
  }
  return entries.sort((a, b) => b.month.localeCompare(a.month));
}

interface EpfCardData {
  currentEmployer: EpfEmployer | null;
  monthlyEmployee: number;
  monthlyEmployerEpf: number;
  monthlyEps: number;
  monthlyTotalEpf: number;
  yearsToRetirement: number | null;
  projectedCorpus: number | null;
  totalComputedMonths: number;
}

function epfBuildCardData(meta: AssetMeta, balance: number): EpfCardData {
  const now = Date.now();
  const employers = meta.epfEmployers ?? [];
  const currentEmp = epfCurrentEmployer(employers);
  const basic = currentEmp?.basicSalary ?? 0;
  const empPct = (currentEmp?.employeeContribPct ?? 12) / 100;

  const monthlyEmployee = Math.round(basic * empPct);
  const monthlyEmployerEpf = Math.round(basic * EPF_EMPLOYER_EPF_PCT);
  const monthlyEps = Math.round(basic * EPS_PCT);
  const monthlyTotalEpf = monthlyEmployee + monthlyEmployerEpf;

  let yearsToRetirement: number | null = null;
  let projectedCorpus: number | null = null;
  if (meta.epfBirthYear) {
    const age = new Date(now).getFullYear() - meta.epfBirthYear;
    const yrs = EPF_RETIREMENT_AGE - age;
    if (yrs > 0) {
      yearsToRetirement = yrs;
      const r = EPF_RATE / 12;
      const n = yrs * 12;
      projectedCorpus = balance * Math.pow(1 + r, n) + (monthlyTotalEpf * (Math.pow(1 + r, n) - 1)) / r;
    }
  }

  const totalComputedMonths = employers.reduce(
    (sum, emp) => sum + epfMonthsBetween(emp.fromDate, emp.toDate ?? now),
    0
  );
  return {
    currentEmployer: currentEmp,
    monthlyEmployee,
    monthlyEmployerEpf,
    monthlyEps,
    monthlyTotalEpf,
    yearsToRetirement,
    projectedCorpus,
    totalComputedMonths
  };
}

const EPF_TX_LABELS: Record<EpfTransactionType, string> = {
  contribution: 'Contribution',
  interest: 'Interest credit',
  transfer_in: 'Transfer in',
  withdrawal: 'Withdrawal',
  advance: 'Advance'
};
const EPF_TX_COLORS: Record<EpfTransactionType, string> = {
  contribution: '#64748b',
  interest: '#10b981',
  transfer_in: '#0ea5e9',
  withdrawal: '#f59e0b',
  advance: '#f59e0b'
};

// ─── EpfAllTransactionsSheet ─────────────────────────────────────────────────

function EpfAllTransactionsSheet({
  holding,
  onAddTransaction,
  onClose
}: {
  holding: Holding;
  onAddTransaction: () => void;
  onClose: () => void;
}) {
  const { mode } = usePrivacy();
  const [filter, setFilter] = useState<'all' | 'interest' | 'transfer'>('all');
  const [selectedMonth, setSelectedMonth] = useState<EpfMonthEntry | null>(null);

  const allMonths = useMemo(
    () => epfComputeAllMonths(holding.assetMeta?.epfEmployers ?? []),
    [holding.assetMeta?.epfEmployers]
  );

  const nonContribTxns = useMemo(
    () => (holding.assetMeta?.epfTransactions ?? []).filter((tx) => tx.type !== 'contribution'),
    [holding.assetMeta?.epfTransactions]
  );

  type FYGroup = {
    label: string;
    startYear: number;
    months: EpfMonthEntry[];
    otherTxns: EpfTransaction[];
    totalEmployee: number;
    totalEmployerEpf: number;
  };

  const fyGroups = useMemo(() => {
    const groups = new Map<string, FYGroup>();

    if (filter === 'all') {
      for (const m of allMonths) {
        if (!groups.has(m.fyLabel)) {
          groups.set(m.fyLabel, {
            label: m.fyLabel,
            startYear: m.fyStartYear,
            months: [],
            otherTxns: [],
            totalEmployee: 0,
            totalEmployerEpf: 0
          });
        }
        const g = groups.get(m.fyLabel);
        if (!g) continue;
        g.months.push(m);
        g.totalEmployee += m.empAmount;
        g.totalEmployerEpf += m.eplrEpfAmount;
      }
    }

    for (const tx of nonContribTxns) {
      if (filter === 'interest' && tx.type !== 'interest') continue;
      if (filter === 'transfer' && tx.type !== 'transfer_in') continue;
      const d = new Date(tx.date);
      const mo = d.getMonth() + 1;
      const yr = d.getFullYear();
      const s = mo >= 4 ? yr : yr - 1;
      const fyLabel = `FY ${s}-${String(s + 1).slice(2)}`;
      if (!groups.has(fyLabel)) {
        groups.set(fyLabel, {
          label: fyLabel,
          startYear: s,
          months: [],
          otherTxns: [],
          totalEmployee: 0,
          totalEmployerEpf: 0
        });
      }
      groups.get(fyLabel)?.otherTxns.push(tx);
    }

    return [...groups.values()].sort((a, b) => b.startYear - a.startYear);
  }, [allMonths, nonContribTxns, filter]);

  return (
    <>
      {/* Sheet — stays below app header (z-40) and bottom nav (z-50) */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-[430px] flex flex-col z-30"
        style={{ top: 48, bottom: 64, backgroundColor: 'var(--color-surface-tertiary)' }}
      >
        {/* Sheet header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-theme bg-surface flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-primary">EPF Transactions</h3>
            <p className="text-[10px] text-tertiary">
              {allMonths.length} months · {holding.assetMeta?.epfEmployers?.length ?? 0} employers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onAddTransaction}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full"
              style={{ backgroundColor: '#64748b15', color: '#64748b' }}
            >
              <i className="ti ti-plus" style={{ fontSize: 12 }} aria-hidden="true" />
              Add
            </button>
            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-tertiary"
            >
              <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="px-4 py-2.5 flex gap-2 border-b border-theme bg-surface flex-shrink-0">
          {(['all', 'interest', 'transfer'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
              style={
                filter === f
                  ? { backgroundColor: '#64748b', color: '#fff', borderColor: '#64748b' }
                  : {
                      backgroundColor: 'var(--color-surface-secondary)',
                      color: 'var(--color-text-secondary)',
                      borderColor: 'var(--color-border)'
                    }
              }
            >
              {f === 'all' ? 'All' : f === 'interest' ? 'Interest' : 'Transfers'}
            </button>
          ))}
        </div>

        {/* FY grouped list */}
        <div className="flex-1 overflow-y-auto">
          {fyGroups.length === 0 && <p className="text-center text-sm text-tertiary mt-16">No transactions to show.</p>}
          {fyGroups.map((group) => (
            <div key={group.label}>
              {/* FY sticky header */}
              <div className="px-4 py-2 flex items-center justify-between sticky top-0 z-10 border-b border-theme bg-surface-2">
                <p className="text-xs font-bold text-primary">{group.label}</p>
                {filter === 'all' && group.months.length > 0 && (
                  <p className="text-[10px] text-tertiary tabular-nums">
                    {group.months.length} months
                    {mode === 'open' && ` · ₹${(group.totalEmployee + group.totalEmployerEpf).toLocaleString('en-IN')}`}
                  </p>
                )}
              </div>

              {/* Interest / transfer / other stored transactions */}
              {[...group.otherTxns]
                .sort((a, b) => b.date - a.date)
                .map((tx) => (
                  <div key={tx.id} className="px-4 py-2.5 flex items-center gap-3 border-b border-theme">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${EPF_TX_COLORS[tx.type]}18` }}
                    >
                      <i
                        className={`ti ${tx.type === 'interest' ? 'ti-percentage' : tx.type === 'transfer_in' ? 'ti-arrows-exchange' : 'ti-minus'}`}
                        style={{ fontSize: 13, color: EPF_TX_COLORS[tx.type] }}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: EPF_TX_COLORS[tx.type] }}>
                        {EPF_TX_LABELS[tx.type]}
                      </p>
                      <p className="text-[10px] text-tertiary">
                        {new Date(tx.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                        {tx.note && ` · ${tx.note}`}
                      </p>
                    </div>
                    <p
                      className="text-xs font-bold tabular-nums flex-shrink-0"
                      style={{ color: EPF_TX_COLORS[tx.type] }}
                    >
                      {mode === 'open' ? `₹${(tx.amount ?? 0).toLocaleString('en-IN')}` : '••••'}
                    </p>
                  </div>
                ))}

              {/* Auto-computed monthly contribution rows */}
              {filter === 'all' &&
                group.months.map((entry) => (
                  <button
                    key={entry.month}
                    onClick={() => setSelectedMonth(entry)}
                    className="w-full px-4 py-2 flex items-center gap-3 border-b border-theme text-left active:bg-surface-2"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#64748b10' }}
                    >
                      <i
                        className="ti ti-building-factory-2"
                        style={{ fontSize: 12, color: '#64748b' }}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-primary">{entry.month}</p>
                      <p className="text-[10px] text-tertiary">{entry.companyName}</p>
                    </div>
                    <div className="text-right flex-shrink-0 flex items-center gap-1.5">
                      {mode === 'open' ? (
                        <div className="text-right">
                          <p className="text-xs font-semibold text-primary tabular-nums">
                            ₹{(entry.empAmount + entry.eplrEpfAmount).toLocaleString('en-IN')}
                          </p>
                          <p className="text-[9px] text-tertiary tabular-nums">
                            ₹{entry.empAmount.toLocaleString('en-IN')} + ₹{entry.eplrEpfAmount.toLocaleString('en-IN')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs font-medium text-primary">••••</p>
                      )}
                      <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 12 }} aria-hidden="true" />
                    </div>
                  </button>
                ))}
            </div>
          ))}
          <div className="h-4" />
        </div>
      </div>

      {/* Contribution breakdown detail popup */}
      {selectedMonth && (
        <div
          className="fixed inset-0 flex items-center justify-center p-6"
          style={{ zIndex: 45, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSelectedMonth(null)}
        >
          <div className="surface rounded-2xl p-4 w-full max-w-[320px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-primary">{selectedMonth.month}</p>
                <p className="text-[10px] text-tertiary">
                  {selectedMonth.companyName}
                  {selectedMonth.proRata && (
                    <span
                      className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-semibold"
                      style={{ backgroundColor: '#f59e0b18', color: '#f59e0b' }}
                    >
                      Pro-rata {selectedMonth.proRata.workedDays}/{selectedMonth.proRata.totalDays} days
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedMonth(null)}
                className="w-8 h-8 flex items-center justify-center text-tertiary"
              >
                <i className="ti ti-x" style={{ fontSize: 16 }} aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-secondary">Employee contribution</span>
                <span className="text-xs font-semibold text-primary tabular-nums">
                  {mode === 'open' ? `₹${selectedMonth.empAmount.toLocaleString('en-IN')}` : '••••'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-secondary">Employer → EPF (3.67%)</span>
                <span className="text-xs font-semibold text-primary tabular-nums">
                  {mode === 'open' ? `₹${selectedMonth.eplrEpfAmount.toLocaleString('en-IN')}` : '••••'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-secondary">Employer → EPS (8.33%)</span>
                <span className="text-xs font-medium tabular-nums" style={{ color: '#94a3b8' }}>
                  {mode === 'open' ? `₹${selectedMonth.epsAmount.toLocaleString('en-IN')}` : '••••'}
                </span>
              </div>
              <div className="border-t border-theme pt-1.5 mt-0.5 flex justify-between items-center">
                <span className="text-xs font-semibold text-secondary">Total to EPF</span>
                <span className="text-xs font-bold text-primary tabular-nums">
                  {mode === 'open'
                    ? `₹${(selectedMonth.empAmount + selectedMonth.eplrEpfAmount).toLocaleString('en-IN')}`
                    : '••••'}
                </span>
              </div>
              <p className="text-[10px] text-tertiary pt-0.5">EPS goes to pension — not withdrawable</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── EpfTransactionSheet ─────────────────────────────────────────────────────

function EpfTransactionSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const currentEmp = epfCurrentEmployer(holding.assetMeta?.epfEmployers ?? []);
  const basic = currentEmp?.basicSalary ?? 0;
  const empPct = (currentEmp?.employeeContribPct ?? 12) / 100;

  const [txType, setTxType] = useState<EpfTransactionType>('contribution');
  const [txDate, setTxDate] = useState(() => todayDateInput());
  const [wagesMonth, setWagesMonth] = useState(() => {
    const d = new Date(Date.now());
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [empAmount, setEmpAmount] = useState(() => (basic > 0 ? String(Math.round(basic * empPct)) : ''));
  const [emplrAmount, setEmplrAmount] = useState(() =>
    basic > 0 ? String(Math.round(basic * EPF_EMPLOYER_EPF_PCT)) : ''
  );
  const [epsAmount, setEpsAmount] = useState(() => (basic > 0 ? String(Math.round(basic * EPS_PCT)) : ''));
  const [amount, setAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [saving, setSaving] = useState(false);

  const isContribution = txType === 'contribution';

  function canSave() {
    if (isContribution) return parseFloat(empAmount) > 0 || parseFloat(emplrAmount) > 0;
    return parseFloat(amount) > 0;
  }

  function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    const tx: EpfTransaction = { id: crypto.randomUUID(), type: txType, date: new Date(txDate).getTime() };
    if (isContribution) {
      tx.wagesMonth = wagesMonth;
      const ea = parseFloat(empAmount);
      const era = parseFloat(emplrAmount);
      const epa = parseFloat(epsAmount);
      if (!isNaN(ea) && ea > 0) tx.employeeAmount = ea;
      if (!isNaN(era) && era > 0) tx.employerAmount = era;
      if (!isNaN(epa) && epa > 0) tx.pensionAmount = epa;
    } else {
      tx.amount = parseFloat(amount);
    }
    if (txNote.trim()) tx.note = txNote.trim();

    const updated: Holding = {
      ...holding,
      assetMeta: {
        ...holding.assetMeta,
        epfTransactions: [...(holding.assetMeta?.epfTransactions ?? []), tx]
      },
      updatedAt: Date.now()
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  const TYPE_PILLS: { type: EpfTransactionType; label: string }[] = [
    { type: 'contribution', label: 'Contribution' },
    { type: 'interest', label: 'Interest' },
    { type: 'transfer_in', label: 'Transfer in' },
    { type: 'withdrawal', label: 'Withdrawal' },
    { type: 'advance', label: 'Advance' }
  ];

  return (
    <div
      className="fixed inset-0 z-70 flex items-end"
      style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto bg-surface">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">Add EPF transaction</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-tertiary"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Type pills */}
        <div className="flex gap-2 flex-wrap">
          {TYPE_PILLS.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => setTxType(type)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={
                txType === type
                  ? { backgroundColor: '#64748b', color: '#fff', borderColor: '#64748b' }
                  : {
                      backgroundColor: 'var(--color-surface-secondary)',
                      color: 'var(--color-text-secondary)',
                      borderColor: 'var(--color-border)'
                    }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Wages month — contribution only */}
        {isContribution && (
          <div>
            <label className="text-xs font-medium text-secondary">Wages month</label>
            <input
              type="month"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
              value={wagesMonth}
              onChange={(e) => setWagesMonth(e.target.value)}
            />
          </div>
        )}

        {/* Date of credit */}
        <div>
          <label className="text-xs font-medium text-secondary">Date of credit</label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
          />
        </div>

        {/* Contribution amounts */}
        {isContribution ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Employee share (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="0"
                  value={empAmount}
                  onChange={(e) => setEmpAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary">Employer to EPF (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                  placeholder="0"
                  value={emplrAmount}
                  onChange={(e) => setEmplrAmount(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary">
                EPS pension (₹) <span className="font-normal text-tertiary">(optional — info only)</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
                placeholder="0"
                value={epsAmount}
                onChange={(e) => setEpsAmount(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-secondary">Amount (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* Note */}
        <div>
          <label className="text-xs font-medium text-secondary">
            Note <span className="font-normal text-tertiary">(optional)</span>
          </label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
            placeholder="e.g. Transfer from previous employer"
            value={txNote}
            onChange={(e) => setTxNote(e.target.value)}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !canSave()}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: '#64748b' }}
        >
          {saving ? 'Saving…' : 'Add transaction'}
        </button>
      </div>
    </div>
  );
}

// ─── EpfEmployerSheet ─────────────────────────────────────────────────────────

function EpfEmployerSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const [company, setCompany] = useState('');
  const [basic, setBasic] = useState('');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [empPct, setEmpPct] = useState('12');
  const [saving, setSaving] = useState(false);

  const canSave = company.trim() && parseFloat(basic) > 0 && fromMonth && toMonth;

  function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const emp: EpfEmployer = {
      id: crypto.randomUUID(),
      companyName: company.trim(),
      basicSalary: parseFloat(basic),
      employeeContribPct: parseFloat(empPct) || 12,
      fromDate: new Date(`${fromMonth}-01`).getTime(),
      toDate: new Date(`${toMonth}-01`).getTime()
    };
    const updated: Holding = {
      ...holding,
      assetMeta: {
        ...holding.assetMeta,
        epfEmployers: [...(holding.assetMeta?.epfEmployers ?? []), emp]
      },
      updatedAt: Date.now()
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  return (
    <div
      className="fixed inset-0 z-70 flex items-end"
      style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto bg-surface">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">Add previous employer</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-tertiary"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-secondary">Company name</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
            placeholder="e.g. Wipro, Infosys"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium text-secondary">Basic + DA salary (₹/mo)</label>
          <input
            type="number"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
            placeholder="e.g. 35000"
            value={basic}
            onChange={(e) => setBasic(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-secondary">From</label>
            <input
              type="month"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-secondary">To</label>
            <input
              type="month"
              className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-secondary">Employee contribution %</label>
          <input
            type="number"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
            placeholder="12"
            value={empPct}
            onChange={(e) => setEmpPct(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-tertiary">Default 12%. Can be higher if you opted for VPF.</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: '#64748b' }}
        >
          {saving ? 'Saving…' : 'Add employer'}
        </button>
      </div>
    </div>
  );
}

// ─── RetirementCard ───────────────────────────────────────────────────────────

function RetirementCard({
  holding,
  onEdit,
  onSave,
  onViewSchedule,
  mode
}: {
  holding: Holding;
  onEdit: () => void;
  onSave: (h: Holding) => Promise<void>;
  onViewSchedule: () => void;
  mode: string;
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

  // EPF computed values — Date.now() lives inside epfBuildCardData (module-level)
  const epfData = useMemo(
    () => (holding.assetClass === 'epf' ? epfBuildCardData(holding.assetMeta ?? {}, holding.investedAmount) : null),
    [holding.assetClass, holding.investedAmount, holding.assetMeta]
  );

  function staleBadge() {
    if (days < 30) return null;
    const color = days >= 60 ? '#ef4444' : '#f59e0b';
    const label = days >= 60 ? 'Overdue' : 'Update due';
    return (
      <span
        className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {label}
      </span>
    );
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
  const displayValue = showLiveCorpus ? liveCorpus : holding.investedAmount;

  const txTypeLabel: Record<string, string> = { deposit: 'Deposit', interest: 'Interest', withdrawal: 'Withdrawal' };
  const txTypeColor: Record<string, string> = { deposit: '#8b5cf6', interest: '#10b981', withdrawal: '#f59e0b' };

  return (
    <>
      <div className="surface rounded-2xl p-4 flex flex-col gap-2.5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <button onClick={onEdit} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${assetMeta.color}15` }}
            >
              <i
                className={`ti ${assetMeta.icon}`}
                style={{ fontSize: 18, color: assetMeta.color }}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary truncate">{holding.name}</p>
              <p className="text-xs text-tertiary mt-0.5">{assetMeta.label}</p>
            </div>
          </button>
          <button onClick={onEdit} className="text-right flex-shrink-0">
            <div className="flex items-center gap-1.5 justify-end">
              {showLiveCorpus && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded"
                  style={{ backgroundColor: '#10b98118', color: '#10b981' }}
                >
                  Live
                </span>
              )}
              {npsNavLoading && (
                <div
                  className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
                />
              )}
            </div>
            <p className="text-base font-bold text-primary tabular-nums">
              {mode === 'open' ? formatCurrency(displayValue) : '••••'}
            </p>
            {showLiveCorpus && mode === 'open' && (
              <p className="text-[10px] text-tertiary mt-0.5">
                {(holding.units ?? 0).toFixed(4)} units × ₹{npsNav?.nav.toFixed(4)}
              </p>
            )}
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
                      style={{ color: npsNav.oneYear >= 0 ? '#10b981' : '#ef4444' }}
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
                      style={{ color: npsNav.threeYear >= 0 ? '#10b981' : '#ef4444' }}
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
                      style={{ color: npsNav.fiveYear >= 0 ? '#10b981' : '#ef4444' }}
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
                  {ppfData.projected != null && mode === 'open' && (
                    <p className="text-xs font-semibold" style={{ color: '#8b5cf6' }}>
                      Proj. {formatCurrency(ppfData.projected)}
                    </p>
                  )}
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-surface-3">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (ppfData.yearsElapsed / 15) * 100)}%`,
                      backgroundColor: '#8b5cf6'
                    }}
                  />
                </div>
              </div>
            )}

            {/* This FY bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-tertiary">This FY</p>
                <p className="text-[10px] text-secondary tabular-nums">
                  {mode === 'open' ? `₹${ppfData.fyDeposits.toLocaleString('en-IN')} / ₹1.5L` : `•••• / ₹1.5L`}
                  {ppfData.fyPct >= 100 && (
                    <span className="ml-1 font-bold" style={{ color: '#10b981' }}>
                      ✓ Full
                    </span>
                  )}
                </p>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-surface-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${ppfData.fyPct}%`,
                    backgroundColor: ppfData.fyPct >= 100 ? '#10b981' : ppfData.fyPct >= 75 ? '#8b5cf6' : '#f59e0b'
                  }}
                />
              </div>
            </div>

            {/* April 5th tip */}
            {ppfData.showAprilTip && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: '#f59e0b12' }}>
                <i
                  className="ti ti-calendar-event flex-shrink-0 mt-0.5"
                  style={{ fontSize: 13, color: '#f59e0b' }}
                  aria-hidden="true"
                />
                <p className="text-[11px] leading-snug" style={{ color: '#d97706' }}>
                  Deposit before April 5 to earn interest for the full year
                </p>
              </div>
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
                          {mode === 'open' ? `₹${tx.amount.toLocaleString('en-IN')}` : '••••'}
                        </p>
                        {showFifth && (
                          <span
                            className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0"
                            style={
                              before5
                                ? { backgroundColor: '#10b98112', color: '#10b981' }
                                : { backgroundColor: '#f59e0b12', color: '#d97706' }
                            }
                          >
                            {before5 ? '≤5th' : '>5th'}
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

            {/* Employment history */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Employment history</p>
                <button
                  onClick={() => setShowEpfEmpSheet(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#64748b15', color: '#64748b' }}
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
                    .sort((a, b) => a.fromDate - b.fromDate)
                    .map((emp) => (
                      <div key={emp.id} className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-primary truncate">
                            {emp.companyName}
                            {!emp.toDate && (
                              <span
                                className="ml-1.5 text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded"
                                style={{ backgroundColor: '#10b98115', color: '#10b981' }}
                              >
                                Current
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-tertiary">
                            {epfMonthLabel(emp.fromDate)} – {emp.toDate ? epfMonthLabel(emp.toDate) : 'present'}
                            {' · '}
                            {epfMonthsBetween(emp.fromDate, emp.toDate ?? epfNowMs())} months
                          </p>
                        </div>
                        <p className="text-[10px] text-secondary tabular-nums flex-shrink-0">
                          ₹{emp.basicSalary.toLocaleString('en-IN')}/mo
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Monthly contribution breakdown */}
            {epfData.currentEmployer && (
              <div className="rounded-xl p-3 flex flex-col gap-1.5 bg-surface-2">
                <p className="text-[10px] font-medium text-tertiary uppercase tracking-wide">Monthly contribution</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-secondary">
                    Employee ({epfData.currentEmployer.employeeContribPct}%)
                  </span>
                  <span className="text-xs font-medium text-primary tabular-nums">
                    {mode === 'open' ? `₹${epfData.monthlyEmployee.toLocaleString('en-IN')}` : '••••'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-secondary">Employer → EPF (3.67%)</span>
                  <span className="text-xs font-medium text-primary tabular-nums">
                    {mode === 'open' ? `₹${epfData.monthlyEmployerEpf.toLocaleString('en-IN')}` : '••••'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-secondary">Employer → EPS pension (8.33%)</span>
                  <span className="text-xs font-medium tabular-nums" style={{ color: '#94a3b8' }}>
                    {mode === 'open' ? `₹${epfData.monthlyEps.toLocaleString('en-IN')}` : '••••'}
                  </span>
                </div>
                <div className="border-t border-theme pt-1.5 flex justify-between items-center">
                  <span className="text-xs font-semibold text-secondary">Total to EPF/mo</span>
                  <span className="text-xs font-bold text-primary tabular-nums">
                    {mode === 'open' ? `₹${epfData.monthlyTotalEpf.toLocaleString('en-IN')}` : '••••'}
                  </span>
                </div>
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
                {mode === 'open' && (
                  <p className="text-sm font-bold" style={{ color: '#64748b' }}>
                    {formatCurrency(epfData.projectedCorpus)}
                  </p>
                )}
                <div className="mt-1 h-1.5 rounded-full overflow-hidden bg-surface-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, ((EPF_RETIREMENT_AGE - epfData.yearsToRetirement) / EPF_RETIREMENT_AGE) * 100)}%`,
                      backgroundColor: '#64748b'
                    }}
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
      </div>

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

function RetirementUntrackedCard({ type, onTrack }: { type: 'nps' | 'ppf' | 'epf'; onTrack: () => void }) {
  const cfg = RETIREMENT_CARD_CONFIG[type];
  const label = type.toUpperCase();
  return (
    <div className="surface rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${cfg.color}15` }}
          >
            <i className={`ti ${cfg.icon}`} style={{ fontSize: 16, color: cfg.color }} aria-hidden="true" />
          </div>
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

// ─── DetailRow (IPO modal) ────────────────────────────────────────────────────

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-xs text-tertiary mb-0.5">{label}</p>
      <p className="text-sm font-medium text-primary" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
    </div>
  );
}

// ─── IpoDetailModal ───────────────────────────────────────────────────────────

function IpoDetailModal({ ipo, onClose }: { ipo: IpoItem; onClose: () => void }) {
  const [subDetail, setSubDetail] = useState<IpoSubDetail | null>(null);
  // initialise to true so the spinner shows immediately — effect only calls setState in async callbacks
  const [subLoading, setSubLoading] = useState(() => ipo.status !== 'upcoming');

  useEffect(() => {
    if (ipo.status === 'upcoming') return;
    fetchIpoSubscription(ipo.id)
      .then((d) => setSubDetail(d))
      .finally(() => setSubLoading(false));
  }, [ipo.id, ipo.status]);

  const catColor = ipo.category === 'mainboard' ? '#6366f1' : '#f59e0b';
  const catLabel = ipo.category === 'mainboard' ? 'Mainboard' : 'SME';
  const safeGmpPct = isNaN(ipo.gmpPercent) ? 0 : ipo.gmpPercent;
  const minInvestment = ipo.price && ipo.lotSize ? ipo.price * ipo.lotSize : null;
  const statusMeta: Record<IpoStatus, { label: string; color: string }> = {
    upcoming: { label: 'Upcoming', color: '#f59e0b' },
    open: { label: 'Open', color: '#10b981' },
    closed: { label: 'Closed', color: '#6b7280' },
    listed: { label: 'Listed', color: '#6366f1' }
  };
  const sm = statusMeta[ipo.status];
  const lastRow = subDetail?.rows[subDetail.rows.length - 1];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-theme">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-primary leading-snug">{ipo.name}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${catColor}18`, color: catColor }}
                >
                  {catLabel}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${sm.color}18`, color: sm.color }}
                >
                  {sm.label}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-tertiary"
              style={{ backgroundColor: 'var(--color-surface-secondary)' }}
              aria-label="Close"
            >
              <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-5">
          {/* Offer details — 4-col */}
          {(ipo.price ?? ipo.lotSize ?? ipo.issueSize) && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Offer Details</p>
              <div className="grid grid-cols-4 gap-2">
                {ipo.price ? <DetailRow label="Price" value={`₹${ipo.price}/sh`} /> : null}
                {ipo.lotSize ? <DetailRow label="Lot Size" value={`${ipo.lotSize} sh`} /> : null}
                {minInvestment ? <DetailRow label="Min Invest" value={formatCurrency(minInvestment)} /> : null}
                {ipo.issueSize ? <DetailRow label="Issue Size" value={ipo.issueSize} /> : null}
              </div>
            </div>
          )}

          {/* Timeline — 4-col */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Timeline</p>
            {(ipo.openDate ?? ipo.closeDate ?? ipo.boaDate ?? ipo.listingDate) ? (
              <div className="grid grid-cols-4 gap-2">
                {ipo.openDate ? <DetailRow label="Opens" value={formatIpoDate(ipo.openDate)} /> : null}
                {ipo.closeDate ? <DetailRow label="Closes" value={formatIpoDate(ipo.closeDate)} /> : null}
                {ipo.boaDate ? <DetailRow label="Allotment" value={formatIpoDate(ipo.boaDate)} /> : null}
                {ipo.listingDate ? <DetailRow label="Listing" value={formatIpoDate(ipo.listingDate)} /> : null}
              </div>
            ) : (
              <p className="text-sm text-tertiary">Dates not announced yet</p>
            )}
          </div>

          {/* GMP — non-listed */}
          {ipo.status !== 'listed' && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">
                Grey Market Premium
              </p>
              {ipo.gmpValue !== null ? (
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-2xl font-bold tabular-nums"
                    style={{
                      color: ipo.gmpValue > 0 ? '#10b981' : ipo.gmpValue < 0 ? '#ef4444' : 'var(--color-text-tertiary)'
                    }}
                  >
                    ₹{Math.abs(ipo.gmpValue)}
                  </span>
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{
                      color: safeGmpPct > 0 ? '#10b981' : safeGmpPct < 0 ? '#ef4444' : 'var(--color-text-tertiary)'
                    }}
                  >
                    ({safeGmpPct > 0 ? '+' : ''}
                    {safeGmpPct.toFixed(1)}%)
                  </span>
                  {ipo.status === 'upcoming' && <span className="text-xs text-tertiary">est.</span>}
                </div>
              ) : (
                <p className="text-sm text-tertiary">Not available</p>
              )}
            </div>
          )}

          {/* Listing performance — listed only */}
          {ipo.status === 'listed' && (ipo.listingPrice !== null || ipo.listingGain !== null || safeGmpPct !== 0) && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">
                Listing Performance
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ipo.listingPrice ? <DetailRow label="List Price" value={`₹${ipo.listingPrice}`} /> : null}
                {ipo.listingGain !== null ? (
                  <DetailRow
                    label="Listing Gain"
                    value={`${ipo.listingGain >= 0 ? '+' : ''}${ipo.listingGain.toFixed(1)}%`}
                    valueColor={ipo.listingGain >= 0 ? '#10b981' : '#ef4444'}
                  />
                ) : null}
                {safeGmpPct !== 0 ? (
                  <DetailRow label="GMP Was" value={`~${safeGmpPct > 0 ? '+' : ''}${safeGmpPct.toFixed(1)}%`} />
                ) : null}
              </div>
            </div>
          )}

          {/* Subscription — open / closed / listed */}
          {ipo.status !== 'upcoming' && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Subscription</p>

              {subLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
                    style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
                  />
                  <span className="text-xs text-tertiary">Fetching subscription data…</span>
                </div>
              ) : lastRow ? (
                <>
                  {/* Category breakdown — latest day */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <DetailRow label="QIB" value={lastRow.qib} />
                    <DetailRow label="HNI ≥₹10L" value={lastRow.niiBig} />
                    <DetailRow label="HNI <₹10L" value={lastRow.niiSmall} />
                    <DetailRow label="Retail" value={lastRow.rii} />
                    <DetailRow label="Overall" value={lastRow.total} valueColor="var(--color-primary)" />
                    {lastRow.emp !== '—' && <DetailRow label="Employee" value={lastRow.emp} />}
                  </div>

                  {/* Day-wise table */}
                  {(subDetail?.rows.length ?? 0) > 0 && (
                    <div className="rounded-xl overflow-hidden border border-theme">
                      <table className="w-full text-xs table-fixed">
                        <colgroup>
                          <col style={{ width: '28%' }} />
                          <col style={{ width: '18%' }} />
                          <col style={{ width: '18%' }} />
                          <col style={{ width: '18%' }} />
                          <col style={{ width: '18%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                            <th className="text-left px-2 py-1.5 font-semibold text-tertiary">Day</th>
                            <th className="text-right px-1 py-1.5 font-semibold text-tertiary">QIB</th>
                            <th className="text-right px-1 py-1.5 font-semibold text-tertiary">HNI</th>
                            <th className="text-right px-1 py-1.5 font-semibold text-tertiary">Retail</th>
                            <th className="text-right px-2 py-1.5 font-semibold text-tertiary">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subDetail?.rows.map((row, i) => {
                            const isLast = i === (subDetail?.rows.length ?? 0) - 1;
                            return (
                              <tr
                                key={row.seq}
                                style={
                                  isLast
                                    ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }
                                    : undefined
                                }
                              >
                                <td className="text-left px-2 py-1.5">
                                  <div className="font-medium text-primary">Day {row.seq}</div>
                                  <div className="text-[10px] text-tertiary">{row.bidDate}</div>
                                </td>
                                <td className="text-right px-1 py-1.5 tabular-nums text-primary">{row.qib}</td>
                                <td className="text-right px-1 py-1.5 tabular-nums text-primary">{row.nii}</td>
                                <td className="text-right px-1 py-1.5 tabular-nums text-primary">{row.rii}</td>
                                <td
                                  className="text-right px-2 py-1.5 tabular-nums font-semibold"
                                  style={{ color: 'var(--color-primary)' }}
                                >
                                  {row.total}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-tertiary">No subscription data available</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {ipo.detailPath && (
          <div className="px-4 pb-4">
            <a
              href={`https://investorgain.com${ipo.detailPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-medium text-secondary border border-theme"
              style={{ backgroundColor: 'var(--color-surface-secondary)' }}
            >
              View on InvestorGain
              <i className="ti ti-external-link" style={{ fontSize: 14 }} aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PortfolioPage ────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const { mode } = usePrivacy();
  const { items: holdings, save: saveHolding, remove: removeHolding } = useRepository(holdingsRepo);

  const [activeTab, setActiveTab] = useState<'holdings' | 'allocation' | 'ipo'>('holdings');
  const [holdingsSubTab, setHoldingsSubTab] = useState<HoldingsSubTab>('stocks');
  const [ipoSubTab, setIpoSubTab] = useState<IpoStatus>('upcoming');
  const [ipoShowMainboardOnly, setIpoShowMainboardOnly] = useState(false);
  const [selectedIpo, setSelectedIpo] = useState<IpoItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [presetAssetClass, setPresetAssetClass] = useState<AssetClass | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleHolding, setScheduleHolding] = useState<Holding | null>(null);
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());

  const ipos = useIpos();

  const totalInvested = useMemo(() => holdings.reduce((s, h) => s + h.investedAmount, 0), [holdings]);
  const totalCurrent = useMemo(() => holdings.reduce((s, h) => s + effectiveValue(h), 0), [holdings]);
  const overallReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  const grouped = useMemo(() => {
    const map = new Map<AssetClass, Holding[]>();
    for (const h of holdings) {
      const arr = map.get(h.assetClass) ?? [];
      arr.push(h);
      map.set(h.assetClass, arr);
    }
    return ASSET_ORDER.filter((ac) => map.has(ac)).map((ac) => ({
      assetClass: ac,
      meta: ASSET_META[ac],
      items: map.get(ac) ?? []
    }));
  }, [holdings]);

  const allocation = useMemo(() => {
    if (totalCurrent === 0) return [];
    return ASSET_ORDER.filter((ac) => grouped.some((g) => g.assetClass === ac)).map((ac) => {
      const value = holdings.filter((h) => h.assetClass === ac).reduce((s, h) => s + effectiveValue(h), 0);
      return {
        assetClass: ac,
        meta: ASSET_META[ac],
        value,
        pct: (value / totalCurrent) * 100
      };
    });
  }, [grouped, holdings, totalCurrent]);

  // Holdings filtered per sub-tab
  const activeSubTabConfig = HOLDINGS_SUBTABS.find((t) => t.key === holdingsSubTab) ?? HOLDINGS_SUBTABS[0];
  const subTabHoldings = useMemo(
    () => holdings.filter((h) => activeSubTabConfig.assetClasses.includes(h.assetClass)),
    [holdings, activeSubTabConfig]
  );

  // Count per sub-tab for badges
  const subTabCounts = useMemo(() => {
    const counts: Partial<Record<HoldingsSubTab, number>> = {};
    for (const tab of HOLDINGS_SUBTABS) {
      counts[tab.key] = holdings.filter((h) => tab.assetClasses.includes(h.assetClass)).length;
    }
    return counts;
  }, [holdings]);

  function openAdd() {
    setPresetAssetClass(null);
    setEditingHolding(null);
    setShowForm(true);
  }

  function openAddRetirement(ac: AssetClass) {
    setPresetAssetClass(ac);
    setEditingHolding(null);
    setShowForm(true);
  }

  function openEdit(h: Holding) {
    setPresetAssetClass(null);
    setEditingHolding(h);
    setShowForm(true);
  }

  async function handleSave(holding: Holding) {
    await saveHolding(holding);
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    await removeHolding(id);
    setShowForm(false);
  }

  function handleRefreshPrices() {
    setRefreshing(true);
    const updates: Promise<void>[] = holdings
      .filter((h) => (h.assetClass === 'mf' && h.schemeCode) || (h.assetClass === 'stock' && h.symbol))
      .map((h) => {
        if (h.assetClass === 'mf' && h.schemeCode) {
          return fetchMfNav(h.schemeCode).then((nav) => {
            if (nav === null) return;
            return saveHolding({
              ...h,
              currentPrice: nav,
              ...(h.units != null ? { currentValue: h.units * nav } : {}),
              updatedAt: Date.now()
            });
          });
        }
        if (h.assetClass === 'stock' && h.symbol) {
          return fetchStockPrice(h.symbol).then((price) => {
            if (price === null) return;
            return saveHolding({
              ...h,
              currentPrice: price,
              ...(h.units != null ? { currentValue: h.units * price } : {}),
              updatedAt: Date.now()
            });
          });
        }
        return Promise.resolve();
      });

    Promise.all(updates)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }

  const hasLivePriceRefresh = holdings.some(
    (h) => (h.assetClass === 'mf' && h.schemeCode) || (h.assetClass === 'stock' && h.symbol)
  );
  const ipoSubList = ipos[ipoSubTab];
  const activeIpoMeta = IPO_SUBTAB_META[ipoSubTab];
  const ipoFilteredList = ipoShowMainboardOnly ? ipoSubList.filter((i) => i.category === 'mainboard') : ipoSubList;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-primary">Portfolio</h2>
          {activeTab !== 'ipo' && hasLivePriceRefresh && (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-theme text-secondary disabled:opacity-50"
            >
              <i
                className={`ti ti-refresh ${refreshing ? 'animate-spin' : ''}`}
                style={{ fontSize: 13 }}
                aria-hidden="true"
              />
              {refreshing ? 'Fetching…' : 'Refresh prices'}
            </button>
          )}
        </div>
        {activeTab !== 'ipo' && holdings.length > 0 && (
          <div className="flex items-baseline gap-3 mt-1">
            <p className="text-sm text-secondary">{mode === 'open' ? formatCurrency(totalCurrent) : '••••'}</p>
            <span className={`text-xs font-medium ${overallReturn >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {overallReturn >= 0 ? '+' : ''}
              {formatPercent(overallReturn)}
            </span>
          </div>
        )}
      </div>

      {/* Main tabs */}
      <div className="flex px-4 border-b border-theme">
        {(['holdings', 'allocation', 'ipo'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={
              activeTab === tab
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }
            }
          >
            {tab === 'ipo' ? 'IPO' : tab === 'allocation' ? 'Allocation' : 'Holdings'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Holdings tab ── */}
        {activeTab === 'holdings' && (
          <div className="flex flex-col h-full">
            {/* Holdings sub-tab bar — 2 rows: 4 on top, 2 on bottom */}
            <div className="flex flex-col gap-1.5 px-4 pt-2.5 pb-2 border-b border-theme">
              {[HOLDINGS_SUBTABS.slice(0, 3), HOLDINGS_SUBTABS.slice(3)].map((row, rowIdx) => (
                <div key={rowIdx} className="flex gap-1.5">
                  {row.map((tab) => {
                    const count = subTabCounts[tab.key] ?? 0;
                    const isActive = holdingsSubTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setHoldingsSubTab(tab.key)}
                        className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-1"
                        style={
                          isActive
                            ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                            : {
                                backgroundColor: 'var(--color-surface-secondary)',
                                color: 'var(--color-text-secondary)'
                              }
                        }
                      >
                        {tab.label}
                        {count > 0 && (
                          <span
                            className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none"
                            style={
                              isActive
                                ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }
                                : {
                                    backgroundColor: 'var(--color-surface-tertiary)',
                                    color: 'var(--color-text-tertiary)'
                                  }
                            }
                          >
                            {count > 9 ? '9+' : count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Sub-tab content */}
            {holdingsSubTab === 'retirement' ? (
              /* Retirement — always show 3 fixed cards (NPS / PPF / EPF) */
              <div className="px-4 py-3 flex flex-col gap-3">
                {(['nps', 'ppf', 'epf'] as const).map((ac) => {
                  const h = subTabHoldings.find((x) => x.assetClass === ac);
                  return h ? (
                    <RetirementCard
                      key={h.id}
                      holding={h}
                      onEdit={() => openEdit(h)}
                      onSave={saveHolding}
                      onViewSchedule={() => setScheduleHolding(h)}
                      mode={mode}
                    />
                  ) : (
                    <RetirementUntrackedCard key={ac} type={ac} onTrack={() => openAddRetirement(ac)} />
                  );
                })}
              </div>
            ) : subTabHoldings.length === 0 ? (
              <div className="p-10 text-center">
                <i
                  className={`ti ${activeSubTabConfig.icon} text-tertiary`}
                  style={{ fontSize: 44 }}
                  aria-hidden="true"
                />
                <p className="text-sm mt-3 text-tertiary">{activeSubTabConfig.emptyMessage}</p>
              </div>
            ) : (
              /* Standard holding list */
              <div className="py-2">
                {(() => {
                  // Group stocks by symbol for consolidated view
                  const stockGroups = (() => {
                    const stockHoldings = subTabHoldings.filter(h => h.assetClass === 'stock');
                    if (stockHoldings.length === 0) return new Map<string, typeof stockHoldings>();
                    const map = new Map<string, typeof stockHoldings>();
                    for (const h of stockHoldings) {
                      const key = (h.symbol ?? h.name).toUpperCase();
                      const arr = map.get(key) ?? [];
                      arr.push(h);
                      map.set(key, arr);
                    }
                    return map;
                  })();
                  const renderedStockSymbols = new Set<string>();

                  // Group MF holdings by schemeCode (or name) for consolidated view
                  const mfGroups = (() => {
                    const mfHoldings = subTabHoldings.filter(h => h.assetClass === 'mf');
                    if (mfHoldings.length === 0) return new Map<string, typeof mfHoldings>();
                    const map = new Map<string, typeof mfHoldings>();
                    for (const h of mfHoldings) {
                      const key = (h.schemeCode ?? h.name).toString();
                      const arr = map.get(key) ?? [];
                      arr.push(h);
                      map.set(key, arr);
                    }
                    return map;
                  })();
                  const renderedMfSchemes = new Set<string>();

                  return subTabHoldings.map((h) => {
                    const current = effectiveValue(h);
                    const gain = current - h.investedAmount;
                    const gainPct = h.investedAmount > 0 ? (gain / h.investedAmount) * 100 : 0;
                    const meta = ASSET_META[h.assetClass];
                    const gainColor = gain >= 0 ? '#10b981' : '#ef4444';

                    if (h.assetClass === 'stock') {
                      const symKey = (h.symbol ?? h.name).toUpperCase();
                      if (renderedStockSymbols.has(symKey)) return null;
                      renderedStockSymbols.add(symKey);

                      const lots = stockGroups.get(symKey) ?? [h];
                      const totalUnits = lots.reduce((s, l) => s + (l.units ?? 0), 0);
                      const totalInvested = lots.reduce((s, l) => s + l.investedAmount, 0);
                      const weightedAvg = totalUnits > 0 ? totalInvested / totalUnits : 0;
                      const totalCurrent = lots.reduce((s, l) => s + effectiveValue(l), 0);
                      const livePrice = lots.find(l => l.currentPrice != null)?.currentPrice ?? null;
                      const totalGain = totalCurrent - totalInvested;
                      const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
                      const totalGainColor = totalGain >= 0 ? '#10b981' : '#ef4444';
                      const ticker = h.symbol ? h.symbol.replace(/\.(NS|BO)$/i, '') : null;
                      const displayName = ticker ?? h.name;
                      const companyName = h.name !== displayName ? h.name : '';
                      const isMultiLot = lots.length > 1;
                      const isExpanded = expandedSymbols.has(symKey);

                      const handleGroupTap = () => {
                        if (isMultiLot) {
                          setExpandedSymbols(prev => {
                            const next = new Set(prev);
                            if (next.has(symKey)) next.delete(symKey); else next.add(symKey);
                            return next;
                          });
                        } else {
                          openEdit(lots[0]);
                        }
                      };

                      return (
                        <div key={symKey} className="border-b border-theme">
                          {/* Aggregated header card */}
                          <button onClick={handleGroupTap} className="w-full px-4 py-3 text-left">
                            <div className="flex items-start gap-3">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: `${meta.color}15` }}
                              >
                                <i className={`ti ${meta.icon}`} style={{ fontSize: 18, color: meta.color }} aria-hidden="true" />
                              </div>
                              <div className="flex-1 min-w-0">
                                {/* Row 1: ticker + value */}
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="text-sm font-semibold text-primary tracking-wide truncate">{displayName}</p>
                                    {isMultiLot && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
                                        {lots.length} lots
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm font-semibold text-primary flex-shrink-0">
                                    {mode === 'open' ? formatCurrency(totalCurrent) : '••••'}
                                  </p>
                                </div>
                                {/* Row 2: company name + gain */}
                                <div className="flex items-baseline justify-between gap-2 mt-0.5">
                                  {companyName ? (
                                    <p className="text-xs text-secondary truncate">{companyName}</p>
                                  ) : <span />}
                                  <p className="text-xs font-medium flex-shrink-0" style={{ color: totalGainColor }}>
                                    {mode === 'open'
                                      ? `${totalGain >= 0 ? '+' : '−'}${formatCurrency(Math.abs(totalGain))} · ${totalGain >= 0 ? '+' : ''}${formatPercent(totalGainPct)}`
                                      : '••••'}
                                  </p>
                                </div>
                                {/* Row 3: info strip */}
                                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                  <span className="text-[10px] text-tertiary">{totalUnits} shares</span>
                                  {weightedAvg > 0 && (
                                    <>
                                      <span className="text-[9px] text-tertiary">·</span>
                                      <span className="text-[10px] text-tertiary">
                                        Avg {mode === 'open' ? `₹${weightedAvg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '••••'}
                                      </span>
                                    </>
                                  )}
                                  {livePrice != null && (
                                    <>
                                      <span className="text-[9px] text-tertiary">·</span>
                                      <span className="text-[10px] font-medium" style={{ color: meta.color }}>
                                        {mode === 'open' ? `₹${livePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '••••'}
                                        <span className="ml-0.5 opacity-60 text-[9px]">live</span>
                                      </span>
                                    </>
                                  )}
                                  {isMultiLot && (
                                    <span className="ml-auto text-[10px] text-tertiary flex items-center gap-0.5">
                                      <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 11 }} />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>

                          {/* Lot breakdown — visible when expanded */}
                          {isMultiLot && isExpanded && (
                            <div className="mx-4 mb-3 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                              {lots.map((lot, idx) => {
                                const lotCurrent = effectiveValue(lot);
                                const lotGain = lotCurrent - lot.investedAmount;
                                const lotGainPct = lot.investedAmount > 0 ? (lotGain / lot.investedAmount) * 100 : 0;
                                const lotGainColor = lotGain >= 0 ? '#10b981' : '#ef4444';
                                return (
                                  <button
                                    key={lot.id}
                                    onClick={() => openEdit(lot)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-theme last:border-0"
                                  >
                                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-secondary bg-surface">
                                      {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-primary">
                                        {lot.units} shares
                                        {lot.avgCostPrice != null && (
                                          <span className="text-tertiary"> · Avg {mode === 'open' ? `₹${lot.avgCostPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '••••'}</span>
                                        )}
                                      </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-xs font-medium text-primary">{mode === 'open' ? formatCurrency(lotCurrent) : '••••'}</p>
                                      <p className="text-[10px]" style={{ color: lotGainColor }}>
                                        {lotGain >= 0 ? '+' : '−'}{formatPercent(Math.abs(lotGainPct))}
                                      </p>
                                    </div>
                                    <i className="ti ti-pencil text-tertiary flex-shrink-0" style={{ fontSize: 13 }} />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (h.assetClass === 'mf') {
                      const schemeKey = (h.schemeCode ?? h.name).toString();
                      if (renderedMfSchemes.has(schemeKey)) return null;
                      renderedMfSchemes.add(schemeKey);

                      const lots = mfGroups.get(schemeKey) ?? [h];
                      const totalUnits = lots.reduce((s, l) => s + (l.units ?? 0), 0);
                      const totalInvested = lots.reduce((s, l) => s + l.investedAmount, 0);
                      const weightedAvg = totalUnits > 0 ? totalInvested / totalUnits : 0;
                      const totalCurrent = lots.reduce((s, l) => s + effectiveValue(l), 0);
                      const liveNav = lots.find(l => l.currentPrice != null)?.currentPrice ?? null;
                      const mfGain = totalCurrent - totalInvested;
                      const mfGainPct = totalInvested > 0 ? (mfGain / totalInvested) * 100 : 0;
                      const gainColor = mfGain >= 0 ? '#10b981' : '#ef4444';
                      const isMultiLot = lots.length > 1;
                      const isExpanded = expandedSymbols.has(schemeKey);
                      const mfSchemeCategory = h.assetMeta?.mfSchemeCategory ?? '';
                      const mfFundHouse = h.assetMeta?.mfFundHouse ?? '';

                      const handleGroupTap = () => {
                        if (isMultiLot) {
                          setExpandedSymbols(prev => {
                            const next = new Set(prev);
                            if (next.has(schemeKey)) next.delete(schemeKey); else next.add(schemeKey);
                            return next;
                          });
                        } else {
                          openEdit(lots[0]);
                        }
                      };

                      return (
                        <div key={schemeKey} className="border-b border-theme">
                          {/* Aggregated header card */}
                          <button onClick={handleGroupTap} className="w-full px-4 py-3 text-left">
                            <div className="flex items-start gap-3">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: `${meta.color}15` }}
                              >
                                <i className={`ti ${meta.icon}`} style={{ fontSize: 18, color: meta.color }} aria-hidden="true" />
                              </div>
                              <div className="flex-1 min-w-0">
                                {/* Row 1: fund name + value */}
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="text-xs font-semibold text-primary truncate">{h.name}</p>
                                    {isMultiLot && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
                                        {lots.length} SIPs
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm font-semibold text-primary flex-shrink-0">
                                    {mode === 'open' ? formatCurrency(totalCurrent) : '••••'}
                                  </p>
                                </div>
                                {/* Row 2: category/fund house + gain */}
                                <div className="flex items-baseline justify-between gap-2 mt-0.5">
                                  {mfSchemeCategory ? (
                                    <p className="text-xs text-secondary truncate">
                                      {mfSchemeCategory}
                                      {mfFundHouse ? ` · ${mfFundHouse}` : ''}
                                    </p>
                                  ) : <span />}
                                  <p className="text-xs font-medium flex-shrink-0" style={{ color: gainColor }}>
                                    {mode === 'open'
                                      ? `${mfGain >= 0 ? '+' : '−'}${formatCurrency(Math.abs(mfGain))} · ${mfGain >= 0 ? '+' : ''}${formatPercent(mfGainPct)}`
                                      : '••••'}
                                  </p>
                                </div>
                                {/* Row 3: info strip */}
                                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                  <span className="text-[10px] text-tertiary">{totalUnits.toFixed(3)} units</span>
                                  {weightedAvg > 0 && (
                                    <>
                                      <span className="text-[9px] text-tertiary">·</span>
                                      <span className="text-[10px] text-tertiary">
                                        Avg NAV {mode === 'open' ? `₹${weightedAvg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '••••'}
                                      </span>
                                    </>
                                  )}
                                  {liveNav != null && (
                                    <>
                                      <span className="text-[9px] text-tertiary">·</span>
                                      <span className="text-[10px] font-medium" style={{ color: meta.color }}>
                                        NAV {mode === 'open' ? `₹${liveNav.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '••••'}
                                        <span className="ml-0.5 opacity-60 text-[9px]">live</span>
                                      </span>
                                    </>
                                  )}
                                  {isMultiLot && (
                                    <span className="ml-auto text-[10px] text-tertiary flex items-center gap-0.5">
                                      <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 11 }} />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>

                          {/* Lot breakdown — visible when expanded */}
                          {isMultiLot && isExpanded && (
                            <div className="mx-4 mb-3 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                              {lots.map((lot, idx) => {
                                const lotCurrent = effectiveValue(lot);
                                const lotGain = lotCurrent - lot.investedAmount;
                                const lotGainPct = lot.investedAmount > 0 ? (lotGain / lot.investedAmount) * 100 : 0;
                                const lotGainColor = lotGain >= 0 ? '#10b981' : '#ef4444';
                                return (
                                  <button
                                    key={lot.id}
                                    onClick={() => openEdit(lot)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-theme last:border-0"
                                  >
                                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-secondary bg-surface">
                                      {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-primary">
                                        {(lot.units ?? 0).toFixed(3)} units
                                        {lot.avgCostPrice != null && (
                                          <span className="text-tertiary"> · NAV {mode === 'open' ? `₹${lot.avgCostPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '••••'}</span>
                                        )}
                                      </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-xs font-medium text-primary">{mode === 'open' ? formatCurrency(lotCurrent) : '••••'}</p>
                                      <p className="text-[10px]" style={{ color: lotGainColor }}>
                                        {lotGain >= 0 ? '+' : '−'}{formatPercent(Math.abs(lotGainPct))}
                                      </p>
                                    </div>
                                    <i className="ti ti-pencil text-tertiary flex-shrink-0" style={{ fontSize: 13 }} />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    /* Generic card for all other asset classes */
                    return (
                      <button
                        key={h.id}
                        onClick={() => openEdit(h)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-theme"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${meta.color}15` }}
                        >
                          <i className={`ti ${meta.icon}`} style={{ fontSize: 18, color: meta.color }} aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-primary">{h.name}</p>
                          <p className="text-xs mt-0.5 text-tertiary">
                            Invested: {mode === 'open' ? formatCurrency(h.investedAmount) : '••••'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-primary">
                            {mode === 'open' ? formatCurrency(current) : '••••'}
                          </p>
                          <p className="text-xs font-medium" style={{ color: gainColor }}>
                            {gain >= 0 ? '+' : ''}{formatPercent(gainPct)}
                          </p>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── Allocation tab ── */}
        {activeTab === 'allocation' && (
          <div className="px-4 py-4">
            {allocation.length === 0 ? (
              <p className="text-sm text-center mt-8 text-tertiary">Add holdings to see your allocation.</p>
            ) : (
              <>
                {/* Stacked bar */}
                <div className="h-3 rounded-full overflow-hidden flex mb-4">
                  {allocation.map((a) => (
                    <div key={a.assetClass} style={{ width: `${a.pct}%`, backgroundColor: a.meta.color }} />
                  ))}
                </div>

                {/* Breakdown rows */}
                <div className="flex flex-col gap-3">
                  {allocation.map((a) => (
                    <div key={a.assetClass} className="rounded-xl p-3 surface">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center"
                            style={{ backgroundColor: `${a.meta.color}18` }}
                          >
                            <i
                              className={`ti ${a.meta.icon}`}
                              style={{ fontSize: 13, color: a.meta.color }}
                              aria-hidden="true"
                            />
                          </div>
                          <span className="text-sm font-medium text-primary">{a.meta.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-primary">
                            {mode === 'open' ? formatCurrency(a.value) : '••••'}
                          </span>
                          <span className="text-xs ml-2 text-tertiary">{formatPercent(a.pct, 0)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-surface-3">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${a.pct}%`, backgroundColor: a.meta.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary footer */}
                <div className="mt-4 rounded-xl p-3 flex justify-between text-xs bg-surface-2">
                  <span className="text-secondary">
                    Total invested:{' '}
                    <span className="font-medium text-primary">
                      {mode === 'open' ? formatCurrency(totalInvested) : '••••'}
                    </span>
                  </span>
                  <span className="text-secondary">
                    Current:{' '}
                    <span className="font-medium text-primary">
                      {mode === 'open' ? formatCurrency(totalCurrent) : '••••'}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── IPO tab ── */}
        {activeTab === 'ipo' && (
          <div>
            {/* Sub-tabs + refresh */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-theme">
              <div className="flex gap-1.5">
                {IPO_SUBTAB_ORDER.map((key) => {
                  const { label } = IPO_SUBTAB_META[key];
                  const count = ipos[key].length;
                  return (
                    <button
                      key={key}
                      onClick={() => setIpoSubTab(key)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                      style={
                        ipoSubTab === key
                          ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                          : { backgroundColor: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)' }
                      }
                    >
                      {label}
                      {count > 0 && (
                        <span
                          className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none"
                          style={
                            ipoSubTab === key
                              ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }
                              : {
                                  backgroundColor: 'var(--color-surface-tertiary)',
                                  color: 'var(--color-text-tertiary)'
                                }
                          }
                        >
                          {count > 9 ? '9+' : count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={ipos.refresh}
                disabled={ipos.refreshing || ipos.loading}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-theme text-secondary disabled:opacity-40 ml-2 flex-shrink-0"
                aria-label="Refresh IPO data"
              >
                <i
                  className={`ti ti-refresh ${ipos.refreshing ? 'animate-spin' : ''}`}
                  style={{ fontSize: 13 }}
                  aria-hidden="true"
                />
                {ipos.refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {/* Last updated */}
            {ipos.lastUpdated && (
              <p className="text-[10px] text-tertiary px-4 pt-1.5 pb-0.5">
                {formatLastUpdated(ipos.lastUpdated)} · investorgain.com
              </p>
            )}

            {/* Mainboard / All filter */}
            {ipoSubList.length > 0 && (
              <div className="flex items-center px-4 pt-2.5 pb-0.5">
                {(['all', 'mainboard'] as const).map((f) => {
                  const active = f === 'all' ? !ipoShowMainboardOnly : ipoShowMainboardOnly;
                  return (
                    <button
                      key={f}
                      onClick={() => setIpoShowMainboardOnly(f === 'mainboard')}
                      className="px-3 py-1 text-xs font-medium border border-theme first:rounded-l-full last:rounded-r-full -mr-px"
                      style={
                        active
                          ? {
                              backgroundColor: 'var(--color-primary)',
                              color: '#fff',
                              borderColor: 'var(--color-primary)',
                              zIndex: 1
                            }
                          : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }
                      }
                    >
                      {f === 'all' ? 'All' : 'Mainboard'}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Content */}
            {ipos.loading && ipos.all.length === 0 ? (
              <div className="p-10 text-center">
                <div
                  className="w-6 h-6 border-2 rounded-full animate-spin mx-auto"
                  style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
                />
                <p className="text-sm mt-3 text-tertiary">Fetching IPO data…</p>
              </div>
            ) : ipoFilteredList.length === 0 ? (
              <div className="p-10 text-center">
                <i className={`ti ${activeIpoMeta.icon} text-tertiary`} style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm mt-3 text-tertiary">
                  {ipoShowMainboardOnly && ipoSubList.length > 0
                    ? 'No mainboard IPOs in this category.'
                    : activeIpoMeta.emptyMessage}
                </p>
              </div>
            ) : (
              <div className="px-4 py-3 flex flex-col gap-3">
                {ipoFilteredList.map((ipo) => {
                  const catColor = ipo.category === 'mainboard' ? '#6366f1' : '#f59e0b';
                  const catLabel = ipo.category === 'mainboard' ? 'MAIN' : 'SME';
                  const closingDays = daysUntil(ipo.closeDate);
                  const safeGmpPct = isNaN(ipo.gmpPercent) ? 0 : ipo.gmpPercent;
                  const gmpColor =
                    ipo.gmpValue !== null && ipo.gmpValue > 0
                      ? '#10b981'
                      : ipo.gmpValue !== null && ipo.gmpValue < 0
                        ? '#ef4444'
                        : 'var(--color-text-tertiary)';

                  return (
                    <button
                      key={ipo.id}
                      className="surface rounded-xl p-3.5 text-left w-full"
                      onClick={() => setSelectedIpo(ipo)}
                    >
                      <div className="flex gap-3">
                        {/* Left column: name, price/lot, subscription, GMP/gain */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          {/* Name + category badge inline */}
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-primary leading-snug">{ipo.name}</p>
                            <span
                              className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded flex-shrink-0"
                              style={{ backgroundColor: `${catColor}18`, color: catColor }}
                            >
                              {catLabel}
                            </span>
                          </div>

                          {/* Price · Lot · Issue size */}
                          {(ipo.price || ipo.lotSize || ipo.issueSize) && (
                            <p className="text-xs text-secondary">
                              {[
                                ipo.price ? `₹${ipo.price}/sh` : null,
                                ipo.lotSize ? `Lot ${ipo.lotSize}` : null,
                                ipo.issueSize ?? null
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}

                          {/* Subscription — open and closed */}
                          {(ipo.status === 'open' || ipo.status === 'closed') && ipo.subscription && (
                            <p className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                              {ipo.subscription} subscribed
                            </p>
                          )}

                          {/* GMP row (upcoming/open/closed) or listing gain (listed) */}
                          {ipo.status === 'listed' ? (
                            ipo.listingGain !== null && (
                              <p
                                className="text-xs font-semibold"
                                style={{ color: ipo.listingGain >= 0 ? '#10b981' : '#ef4444' }}
                              >
                                Listed {ipo.listingGain >= 0 ? '+' : ''}
                                {ipo.listingGain.toFixed(1)}%
                              </p>
                            )
                          ) : (
                            <p className="text-xs">
                              <span className="text-tertiary">GMP: </span>
                              {ipo.gmpValue !== null ? (
                                <span className="font-medium" style={{ color: gmpColor }}>
                                  ₹{Math.abs(ipo.gmpValue)} ({safeGmpPct > 0 ? '+' : ''}
                                  {safeGmpPct.toFixed(1)}%)
                                  {ipo.status === 'upcoming' && (
                                    <span className="text-tertiary font-normal text-[10px] ml-1">est.</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-tertiary">—</span>
                              )}
                            </p>
                          )}
                        </div>

                        {/* Right column: dates stacked, right-aligned */}
                        <div className="flex flex-col gap-1 text-right flex-shrink-0 items-end">
                          {ipo.status === 'upcoming' &&
                            (ipo.openDate ? (
                              <p className="text-xs text-tertiary whitespace-nowrap">
                                {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                              </p>
                            ) : (
                              <p className="text-xs text-tertiary">Dates TBA</p>
                            ))}

                          {ipo.status === 'open' && (
                            <>
                              <p className="text-xs text-tertiary whitespace-nowrap">
                                {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                              </p>
                              {closingDays !== null && (
                                <p className="text-xs font-semibold" style={{ color: '#10b981' }}>
                                  {closingDays === 0 ? 'Closes today' : `${closingDays}d left`}
                                </p>
                              )}
                            </>
                          )}

                          {ipo.status === 'closed' && (
                            <>
                              <p className="text-xs text-tertiary whitespace-nowrap">
                                {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                              </p>
                              {ipo.boaDate && (
                                <p className="text-xs text-tertiary whitespace-nowrap">
                                  Allotment: {formatIpoDate(ipo.boaDate)}
                                </p>
                              )}
                              {ipo.listingDate && (
                                <p className="text-xs text-tertiary whitespace-nowrap">
                                  Listing: {formatIpoDate(ipo.listingDate)}
                                </p>
                              )}
                            </>
                          )}

                          {ipo.status === 'listed' && (
                            <>
                              {ipo.listingDate && (
                                <p className="text-xs text-tertiary whitespace-nowrap">
                                  Listed: {formatIpoDate(ipo.listingDate)}
                                </p>
                              )}
                              {ipo.listingPrice && (
                                <p className="text-xs text-tertiary whitespace-nowrap">At: ₹{ipo.listingPrice}</p>
                              )}
                              {safeGmpPct !== 0 && (
                                <p className="text-xs text-tertiary whitespace-nowrap">
                                  GMP was: ~{safeGmpPct > 0 ? '+' : ''}
                                  {safeGmpPct.toFixed(1)}%
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB — add holding (hidden on IPO tab and Retirement sub-tab which has its own Track buttons) */}
      {activeTab !== 'ipo' && !(activeTab === 'holdings' && holdingsSubTab === 'retirement') && (
        <button
          onClick={openAdd}
          className="fixed w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white z-10"
          style={{
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            right: '1rem',
            backgroundColor: 'var(--color-primary)'
          }}
          aria-label="Add holding"
        >
          <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
        </button>
      )}

      {showForm && (
        <HoldingForm
          editing={editingHolding}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setShowForm(false)}
          lockAssetClass={presetAssetClass ?? undefined}
          allowedClasses={!editingHolding ? ['stock', 'mf'] : undefined}
        />
      )}

      {selectedIpo && <IpoDetailModal ipo={selectedIpo} onClose={() => setSelectedIpo(null)} />}

      {scheduleHolding && <NpsScheduleSheet holding={scheduleHolding} onClose={() => setScheduleHolding(null)} />}
    </div>
  );
}
