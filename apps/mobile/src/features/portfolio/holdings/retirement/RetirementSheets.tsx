import { useState, useMemo } from 'react';
import { View, Pressable, Text } from 'react-native';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { Modal, Button, TextInput, DateInput, SegmentedControl, DetailRow, AmountInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { epochToDateInput } from '@/lib/formatters';
import { LIFECYCLE_FUNDS } from '@/core/nps';
import type { NpsLifecycleFund } from '@/core/nps';
import { isBeforeFifth } from '@/core/portfolio/ppfCalculations';
import {
  EPF_EMPLOYER_EPF_PCT,
  EPS_PCT,
  epfCurrentEmployer,
  epfLatestSalary,
  epfComputeAllMonths
} from '@/core/portfolio/epfCalculations';
import type { EpfMonthEntry } from '@/core/portfolio/epfCalculations';
import type {
  Holding,
  EpfEmployer,
  EpfSalaryHike,
  EpfTransaction,
  EpfTransactionType,
  PpfTransaction,
  PpfTransactionType
} from '@/core/db/types';

/**
 * Web's EPF month-only fields use native `<input type="month">`, which structurally can't accept
 * malformed input. RN's `DateInput` only supports day-granularity `YYYY-MM-DD`, so these stay plain
 * `TextInput`s — this validator is the RN equivalent of the browser's built-in constraint, surfaced via
 * the shared `TextInput`'s `error` prop instead of silently letting a bad value flow into
 * `new Date(\`${month}-01\`).getTime()` downstream (found via the 2026-07-26 parity sweep).
 */
function monthFieldError(value: string, min?: string, max?: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return 'Enter as YYYY-MM, e.g. 2026-06';
  if (min && value < min) return `Must be on or after ${min}`;
  if (max && value > max) return `Must be on or before ${max}`;
  return undefined;
}

export function AllocationPills({ equity, corporate, govt }: { equity: number; corporate: number; govt: number }) {
  return (
    <View className="flex-row gap-1.5 flex-wrap">
      <Text
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#0ea5e915', color: '#0ea5e9' }}
      >
        E {equity}%
      </Text>
      <Text
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#f59e0b15', color: '#d97706' }}
      >
        C {corporate}%
      </Text>
      <Text
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#10b98115', color: '#10b981' }}
      >
        G {govt}%
      </Text>
    </View>
  );
}

// ─── NpsScheduleSheet ─────────────────────────────────────────────────────────

export function NpsScheduleSheet({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const theme = useThemeColors();
  const meta = holding.assetMeta ?? {};
  const fund = meta.npsLifecycleFund as NpsLifecycleFund | undefined;
  if (!fund || !LIFECYCLE_FUNDS[fund]) return null;

  const config = LIFECYCLE_FUNDS[fund];
  const currentYear = new Date().getFullYear();
  const userAge = meta.npsBirthYear ? currentYear - meta.npsBirthYear : null;
  const currentAgeRow = userAge != null ? Math.max(35, Math.min(55, userAge)) : null;

  return (
    <Modal onClose={onClose} title={config.label} scrollable>
      <View className="flex-row items-center gap-2 -mt-2">
        <Text
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: tint(config.color, 10), color: config.color }}
        >
          {config.shortLabel}
        </Text>
        <Text className="text-xs text-secondary leading-snug flex-1">{config.description}</Text>
      </View>
      {userAge != null && (
        <Text className="text-xs text-secondary">
          Your age: <Text className="text-primary font-bold">{userAge}</Text>
          {userAge < 35 && ' — PFRDA schedule starts at 35 (current allocation: max equity)'}
          {userAge > 55 && ' — PFRDA schedule ends at 55 (current allocation: min equity)'}
        </Text>
      )}
      <View className="rounded-xl overflow-hidden border border-theme">
        <View className="flex-row px-3 py-2 bg-surface-2">
          <Text className="flex-1 text-xs font-semibold text-tertiary">Age</Text>
          <Text className="flex-1 text-right text-xs font-semibold" style={{ color: '#0ea5e9' }}>
            Equity
          </Text>
          <Text className="flex-1 text-right text-xs font-semibold" style={{ color: '#d97706' }}>
            Corp.
          </Text>
          <Text className="flex-1 text-right text-xs font-semibold" style={{ color: '#10b981' }}>
            Govt.
          </Text>
        </View>
        {config.table.map((row) => {
          const isCurrent = row.age === currentAgeRow;
          return (
            <View
              key={row.age}
              className="flex-row px-3 py-2 border-t border-theme"
              style={isCurrent ? { backgroundColor: tint(theme.primary, 8) } : undefined}
            >
              <Text
                className="flex-1 text-xs tabular-nums"
                style={{
                  color: isCurrent ? theme.textPrimary : theme.textSecondary,
                  fontWeight: isCurrent ? '700' : '400'
                }}
              >
                {row.age}
                {isCurrent && ' ← you'}
              </Text>
              <Text className="flex-1 text-right text-xs font-medium tabular-nums" style={{ color: '#0ea5e9' }}>
                {row.equity}%
              </Text>
              <Text className="flex-1 text-right text-xs font-medium tabular-nums" style={{ color: '#d97706' }}>
                {row.corporate}%
              </Text>
              <Text className="flex-1 text-right text-xs font-medium tabular-nums" style={{ color: '#10b981' }}>
                {row.govt}%
              </Text>
            </View>
          );
        })}
      </View>
      <Text className="text-[10px] text-tertiary leading-relaxed">
        Source: PFRDA lifecycle fund circular. Ages below 35 use the 35-year allocation; ages above 55 use the 55-year
        allocation.
      </Text>
    </Modal>
  );
}

// ─── PpfTransactionSheet ──────────────────────────────────────────────────────

export function PpfTransactionSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const [txType, setTxType] = useState<PpfTransactionType>('deposit');
  const [txDate, setTxDate] = useState(() => epochToDateInput(Date.now()));
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
      ...(txNote.trim() && { note: txNote.trim() })
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
    <Modal onClose={onClose} title="Add PPF transaction" scrollable>
      <SegmentedControl
        options={(['deposit', 'interest', 'withdrawal'] as PpfTransactionType[]).map((t) => ({
          value: t,
          label: typeConfig[t].label,
          color: typeConfig[t].color
        }))}
        value={txType}
        onChange={setTxType}
      />

      <View>
        <DateInput label="Date" value={txDate} onChange={setTxDate} />
        {showFifthHint && (
          <View className="mt-1 flex-row items-center gap-1">
            <Icon
              name={beforeFifth ? 'ti-circle-check' : 'ti-alert-triangle'}
              size={13}
              color={beforeFifth ? '#10b981' : '#f59e0b'}
            />
            <Text className="text-xs font-medium" style={{ color: beforeFifth ? '#10b981' : '#f59e0b' }}>
              {beforeFifth ? 'Before 5th — earns interest this month' : 'After 5th — interest starts next month'}
            </Text>
          </View>
        )}
      </View>

      <AmountInput label="Amount" placeholder="0" value={txAmount} onChange={setTxAmount} autoFocus />

      <TextInput label="Note (optional)" placeholder="e.g. Annual lump sum" value={txNote} onChange={setTxNote} />

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onPress={handleAdd}
        disabled={saving || !txAmount || parseFloat(txAmount) <= 0}
        loading={saving}
      >
        {saving ? 'Saving…' : 'Add transaction'}
      </Button>
    </Modal>
  );
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

/**
 * Web renders this as a hand-rolled `fixed` full-height panel (below the app header/bottom-nav z-index
 * tiers) rather than the shared Modal — a browse/list surface, not a form dialog. RN has no `fixed`
 * positioning equivalent and no other full-page sheet primitive exists in this codebase yet, so it's
 * rebuilt on the shared centered `Modal` (scrollable) instead, with the filter pills and "Add" action
 * folded into the body since `Modal`'s title slot is a plain string.
 */
export function EpfAllTransactionsSheet({
  holding,
  onAddTransaction,
  onClose
}: {
  holding: Holding;
  onAddTransaction: () => void;
  onClose: () => void;
}) {
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.portfolio);
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
      <Modal onClose={onClose} title="EPF Transactions" scrollable>
        <View className="-mt-2 flex-row items-center justify-between">
          <Text className="text-[10px] text-tertiary">
            {allMonths.length} months · {holding.assetMeta?.epfEmployers?.length ?? 0} employers
          </Text>
          {/* Matches web's custom slate pill (not the shared Button's generic secondary variant) — the
           *  consistent EPF-actions accent used throughout this file. */}
          <Button
            variant="ghost"
            size="sm"
            icon="ti-plus"
            color="#64748b15"
            textColor="#64748b"
            onPress={onAddTransaction}
          >
            Add
          </Button>
        </View>

        <SegmentedControl
          options={[
            { value: 'all' as const, label: 'All', color: '#64748b' },
            { value: 'interest' as const, label: 'Interest', color: '#64748b' },
            { value: 'transfer' as const, label: 'Transfers', color: '#64748b' }
          ]}
          value={filter}
          onChange={setFilter}
        />

        {fyGroups.length === 0 && (
          <Text className="text-center text-sm text-tertiary mt-8">No transactions to show.</Text>
        )}

        {fyGroups.map((group) => (
          <View key={group.label}>
            <View className="py-2 px-2 rounded-lg flex-row items-center justify-between bg-surface-2">
              <Text className="text-xs font-bold text-primary">{group.label}</Text>
              {filter === 'all' && group.months.length > 0 && (
                <Text className="text-[10px] text-tertiary tabular-nums">
                  {group.months.length} months
                  {!masked && ` · ₹${(group.totalEmployee + group.totalEmployerEpf).toLocaleString('en-IN')}`}
                </Text>
              )}
            </View>

            {[...group.otherTxns]
              .sort((a, b) => b.date - a.date)
              .map((tx) => (
                <View key={tx.id} className="py-2.5 flex-row items-center gap-3 border-b border-theme">
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={{ backgroundColor: tint(EPF_TX_COLORS[tx.type], 10) }}
                  >
                    <Icon
                      name={
                        tx.type === 'interest'
                          ? 'ti-percentage'
                          : tx.type === 'transfer_in'
                            ? 'ti-arrows-exchange'
                            : 'ti-minus'
                      }
                      size={13}
                      color={EPF_TX_COLORS[tx.type]}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-semibold" style={{ color: EPF_TX_COLORS[tx.type] }}>
                      {EPF_TX_LABELS[tx.type]}
                    </Text>
                    <Text className="text-[10px] text-tertiary">
                      {new Date(tx.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                      {tx.note && ` · ${tx.note}`}
                    </Text>
                  </View>
                  <Text className="text-xs font-bold tabular-nums" style={{ color: EPF_TX_COLORS[tx.type] }}>
                    {!masked ? `₹${(tx.amount ?? 0).toLocaleString('en-IN')}` : '••••'}
                  </Text>
                </View>
              ))}

            {filter === 'all' &&
              group.months.map((entry) => (
                <Pressable
                  key={entry.month}
                  onPress={() => setSelectedMonth(entry)}
                  className="py-2 flex-row items-center gap-3 border-b border-theme"
                >
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={{ backgroundColor: '#64748b10' }}
                  >
                    <Icon name="ti-building-factory-2" size={12} color="#64748b" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-medium text-primary">{entry.month}</Text>
                    <Text className="text-[10px] text-tertiary">{entry.companyName}</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    {!masked ? (
                      <View className="items-end">
                        <Text className="text-xs font-semibold text-primary tabular-nums">
                          ₹{(entry.empAmount + entry.eplrEpfAmount).toLocaleString('en-IN')}
                        </Text>
                        <Text className="text-[9px] text-tertiary tabular-nums">
                          ₹{entry.empAmount.toLocaleString('en-IN')} + ₹{entry.eplrEpfAmount.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-xs font-medium text-primary">••••</Text>
                    )}
                    <Icon name="ti-chevron-right" size={12} color="#94a3b8" />
                  </View>
                </Pressable>
              ))}
          </View>
        ))}
      </Modal>

      {/* Contribution breakdown detail popup — web builds this as its own `fixed inset-0` overlay
          (never converted to use Modal even though the rest of this file does); rebuilt here on the
          shared Modal, nested above the transactions list Modal. */}
      {selectedMonth && (
        <Modal onClose={() => setSelectedMonth(null)} title={selectedMonth.month} size="sm">
          <View className="-mt-2">
            <Text className="text-[10px] text-tertiary">
              {selectedMonth.companyName}
              {selectedMonth.proRata && (
                <Text className="text-[9px] font-semibold" style={{ color: '#f59e0b' }}>
                  {'  '}Pro-rata {selectedMonth.proRata.workedDays}/{selectedMonth.proRata.totalDays} days
                </Text>
              )}
            </Text>
          </View>
          <DetailRow
            label="Employee contribution"
            value={!masked ? `₹${selectedMonth.empAmount.toLocaleString('en-IN')}` : '••••'}
            size="md"
          />
          <DetailRow
            label="Employer → EPF (3.67%)"
            value={!masked ? `₹${selectedMonth.eplrEpfAmount.toLocaleString('en-IN')}` : '••••'}
            size="md"
          />
          <DetailRow
            label="Employer → EPS (8.33%)"
            value={
              <Text style={{ color: '#94a3b8' }}>
                {!masked ? `₹${selectedMonth.epsAmount.toLocaleString('en-IN')}` : '••••'}
              </Text>
            }
            size="md"
          />
          <DetailRow
            label={<Text className="font-semibold">Total to EPF</Text>}
            value={
              !masked ? `₹${(selectedMonth.empAmount + selectedMonth.eplrEpfAmount).toLocaleString('en-IN')}` : '••••'
            }
            size="md"
            className="border-t border-theme pt-1.5 mt-0.5"
          />
          <Text className="text-[10px] text-tertiary pt-0.5">EPS goes to pension — not withdrawable</Text>
        </Modal>
      )}
    </>
  );
}

// ─── EpfTransactionSheet ─────────────────────────────────────────────────────

export function EpfTransactionSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const theme = useThemeColors();
  const currentEmp = epfCurrentEmployer(holding.assetMeta?.epfEmployers ?? []);
  const basic = currentEmp?.basicSalary ?? 0;
  const empPct = (currentEmp?.employeeContribPct ?? 12) / 100;

  const [txType, setTxType] = useState<EpfTransactionType>('contribution');
  const [txDate, setTxDate] = useState(() => epochToDateInput(Date.now()));
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
    <Modal onClose={onClose} title="Add EPF transaction" scrollable>
      <View className="flex-row gap-2 flex-wrap">
        {TYPE_PILLS.map(({ type, label }) => {
          const active = txType === type;
          return (
            <Pressable
              key={type}
              onPress={() => setTxType(type)}
              className="px-3 py-1.5 rounded-full border"
              style={
                active
                  ? { backgroundColor: '#64748b', borderColor: '#64748b' }
                  : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }
              }
            >
              <Text className="text-xs font-medium" style={{ color: active ? '#fff' : theme.textSecondary }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isContribution && (
        <TextInput
          label="Wages month (YYYY-MM)"
          value={wagesMonth}
          onChange={setWagesMonth}
          placeholder="e.g. 2026-06"
          error={monthFieldError(wagesMonth)}
        />
      )}

      <DateInput label="Date of credit" value={txDate} onChange={setTxDate} />

      {isContribution ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <AmountInput label="Employee share" placeholder="0" value={empAmount} onChange={setEmpAmount} />
            </View>
            <View className="flex-1">
              <AmountInput label="Employer to EPF" placeholder="0" value={emplrAmount} onChange={setEmplrAmount} />
            </View>
          </View>
          <AmountInput
            label="EPS pension (₹) (optional — info only)"
            placeholder="0"
            value={epsAmount}
            onChange={setEpsAmount}
          />
        </View>
      ) : (
        <AmountInput label="Amount" placeholder="0" value={amount} onChange={setAmount} autoFocus />
      )}

      <TextInput
        label="Note (optional)"
        placeholder="e.g. Transfer from previous employer"
        value={txNote}
        onChange={setTxNote}
      />

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onPress={handleSave}
        disabled={saving || !canSave()}
        loading={saving}
        color="#64748b"
      >
        {saving ? 'Saving…' : 'Add transaction'}
      </Button>
    </Modal>
  );
}

// ─── EpfSalaryHikeSheet ───────────────────────────────────────────────────────

export function EpfSalaryHikeSheet({
  holding,
  empId,
  onSave,
  onClose
}: {
  holding: Holding;
  empId: string;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const emp = (holding.assetMeta?.epfEmployers ?? []).find((e) => e.id === empId);
  const [hikeMonth, setHikeMonth] = useState('');
  const [hikeBasic, setHikeBasic] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave =
    !!hikeMonth &&
    !monthFieldError(
      hikeMonth,
      new Date(emp?.fromDate ?? 0).toISOString().slice(0, 7),
      emp?.toDate ? new Date(emp.toDate).toISOString().slice(0, 7) : undefined
    ) &&
    parseFloat(hikeBasic) > 0;

  function handleSave(id: string, ts: number) {
    if (!canSave || !emp) return;
    setSaving(true);
    const hikeMs = new Date(`${hikeMonth}-01T00:00:00`).getTime();
    const newHike: EpfSalaryHike = { fromDate: hikeMs, basicSalary: parseFloat(hikeBasic) };
    const updatedHikes = [...(emp.hikeTimeline ?? []), newHike].sort((a, b) => a.fromDate - b.fromDate);
    const updatedEmp: EpfEmployer = { ...emp, hikeTimeline: updatedHikes };
    const updated: Holding = {
      ...holding,
      assetMeta: {
        ...holding.assetMeta,
        epfEmployers: (holding.assetMeta?.epfEmployers ?? []).map((e) => (e.id === empId ? updatedEmp : e))
      },
      updatedAt: ts,
      id
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  if (!emp) return null;

  const minMonth = new Date(emp.fromDate).toISOString().slice(0, 7);
  const maxMonth = emp.toDate ? new Date(emp.toDate).toISOString().slice(0, 7) : undefined;

  return (
    <Modal onClose={onClose} title="Add Salary Hike">
      <Text className="text-xs text-tertiary -mt-2">{emp.companyName}</Text>

      <TextInput
        label="Effective from (YYYY-MM)"
        value={hikeMonth}
        onChange={setHikeMonth}
        placeholder="e.g. 2026-04"
        autoFocus
        error={monthFieldError(hikeMonth, minMonth, maxMonth)}
      />

      <AmountInput
        label="New basic + DA salary (₹/mo)"
        placeholder={`Current: ₹${epfLatestSalary(emp).toLocaleString('en-IN')}`}
        value={hikeBasic}
        onChange={setHikeBasic}
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button variant="secondary" size="lg" fullWidth onPress={onClose}>
            Cancel
          </Button>
        </View>
        <View className="flex-1">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSave || saving}
            loading={saving}
            onPress={() => handleSave(holding.id, Date.now())}
          >
            {saving ? 'Saving…' : 'Save Hike'}
          </Button>
        </View>
      </View>
    </Modal>
  );
}

// ─── EpfEmployerSheet ─────────────────────────────────────────────────────────

export function EpfEmployerSheet({
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

  const canSave =
    !!company.trim() &&
    parseFloat(basic) > 0 &&
    !!fromMonth &&
    !!toMonth &&
    !monthFieldError(fromMonth) &&
    !monthFieldError(toMonth, fromMonth || undefined);

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
    <Modal onClose={onClose} title="Add previous employer" scrollable>
      <TextInput
        label="Company name"
        placeholder="e.g. Wipro, Infosys"
        value={company}
        onChange={setCompany}
        autoFocus
      />

      <AmountInput label="Basic + DA salary (₹/mo)" placeholder="e.g. 35000" value={basic} onChange={setBasic} />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextInput
            label="From (YYYY-MM)"
            value={fromMonth}
            onChange={setFromMonth}
            placeholder="e.g. 2018-06"
            error={monthFieldError(fromMonth)}
          />
        </View>
        <View className="flex-1">
          <TextInput
            label="To (YYYY-MM)"
            value={toMonth}
            onChange={setToMonth}
            placeholder="e.g. 2022-05"
            error={monthFieldError(toMonth, fromMonth || undefined)}
          />
        </View>
      </View>

      <View>
        <TextInput
          label="Employee contribution %"
          keyboardType="decimal-pad"
          placeholder="12"
          value={empPct}
          onChange={setEmpPct}
        />
        <Text className="mt-1 text-[11px] text-tertiary">Default 12%. Can be higher if you opted for VPF.</Text>
      </View>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onPress={handleSave}
        disabled={saving || !canSave}
        loading={saving}
        color="#64748b"
      >
        {saving ? 'Saving…' : 'Add employer'}
      </Button>
    </Modal>
  );
}
