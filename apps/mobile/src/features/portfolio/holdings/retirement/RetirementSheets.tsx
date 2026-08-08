import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import {
  Modal,
  Button,
  TextInput,
  DateInput,
  SegmentedControl,
  DetailRow,
  AmountInput,
  Banner,
  ProgressBar
} from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { epochToDateInput } from '@/lib/formatters';
import { LIFECYCLE_FUNDS } from '@/core/nps';
import type { NpsLifecycleFund } from '@/core/nps';
import { isBeforeFifth, ppfDepositsForFy, PPF_MAX_ANNUAL } from '@/core/portfolio/ppfCalculations';
import { getPpfRateTable, type PpfRateTable } from '@/core/portfolio/ppfInterestRates';
import {
  EPF_EMPLOYER_EPF_PCT,
  EPS_PCT,
  epfCurrentEmployer,
  epfLatestSalary,
  epfComputeAllMonths
} from '@/core/portfolio/epfCalculations';
import type { EpfMonthEntry } from '@/core/portfolio/epfCalculations';
import { getEpfRateTable, type EpfRateTable } from '@/core/portfolio/epfInterestRates';
import { getInterestRateForFy, type EpfInterestMonthTrace } from '@/core/portfolio/epfInterestCalculator';
import { computeEpfInterestOnDemand, dateToFyStartYear, fyLabel, recordedInterestTotal } from './epfInterestOnDemand';
import {
  findAllReviewFlags,
  checkWageDiscrepancy,
  checkInterestMismatch,
  type EpfInterestMismatchFlag,
  type EpfWageDiscrepancyFlag
} from './epfReviewFlags';
import { EPF_TX_LABELS, EPF_TX_COLORS } from './epfTxLabels';
import { findAllPpfReviewFlags } from './ppfReviewFlags';
import { PPF_TX_LABELS, PPF_TX_COLORS } from './ppfTxLabels';
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
  onClose,
  initialType,
  initialDate,
  editing,
  onDelete
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
  /** Pre-selects the type pill — used by the FY-end "interest not recorded" nudge banner's own
   *  "+ Add" (mirrors `EpfTransactionSheet`'s identical props). Ignored when `editing` is set. */
  initialType?: PpfTransactionType;
  /** Pre-fills the date field — the nudge banner passes that FY's own March 31. Ignored when
   *  `editing` is set. */
  initialDate?: number;
  /** Editing an existing transaction instead of adding a new one — every field prefills from it, and
   *  Save replaces that transaction by id in `ppfTransactions[]` instead of appending. `undefined`/
   *  `null` for every other entrypoint on this sheet (the card's own "+ Add", the FY-end nudge
   *  banners), which keep today's add behaviour unchanged. */
  editing?: PpfTransaction | null;
  /** Removes `editing` from `ppfTransactions[]` — only rendered (Delete button shown) when `editing`
   *  is set. Matches this app's own established convention (`PpfModal`/`EntryForm`'s `FormModal`
   *  usage elsewhere): delete is IMMEDIATE on press, no confirmation dialog. */
  onDelete?: (id: string) => void;
}) {
  const [txType, setTxType] = useState<PpfTransactionType>(editing?.type ?? initialType ?? 'deposit');
  const [txDate, setTxDate] = useState(() => epochToDateInput(editing?.date ?? initialDate ?? Date.now()));
  const [txAmount, setTxAmount] = useState(editing ? String(editing.amount) : '');
  const [txNote, setTxNote] = useState(editing?.note ?? '');
  const [saving, setSaving] = useState(false);

  const dateMs = txDate ? new Date(txDate).getTime() : 0;
  const beforeFifth = isBeforeFifth(dateMs);
  const showFifthHint = txType === 'deposit' && txDate !== '';

  function handleSave() {
    const amt = parseFloat(txAmount);
    if (isNaN(amt) || amt <= 0) return;
    setSaving(true);
    const existing = holding.assetMeta?.ppfTransactions ?? [];
    const txns = editing
      ? existing.map((t) => {
          if (t.id !== editing.id) return t;
          const updatedTxn: PpfTransaction = { ...t, type: txType, date: dateMs, amount: amt };
          if (txNote.trim()) {
            updatedTxn.note = txNote.trim();
          } else {
            delete updatedTxn.note;
          }
          return updatedTxn;
        })
      : [
          ...existing,
          {
            id: crypto.randomUUID(),
            type: txType,
            date: dateMs,
            amount: amt,
            ...(txNote.trim() && { note: txNote.trim() })
          }
        ];
    const updated: Holding = {
      ...holding,
      assetMeta: { ...holding.assetMeta, ppfTransactions: txns },
      updatedAt: Date.now()
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (editing && onDelete) onDelete(editing.id);
  }

  const typeConfig: Record<PpfTransactionType, { label: string; color: string }> = {
    deposit: { label: 'Deposit', color: '#8b5cf6' },
    interest: { label: 'Interest credited', color: '#10b981' },
    withdrawal: { label: 'Withdrawal', color: '#f59e0b' }
  };

  const canSave = !saving && !!txAmount && parseFloat(txAmount) > 0;

  return (
    <Modal onClose={onClose} title={editing ? 'Edit PPF transaction' : 'Add PPF transaction'} scrollable>
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

      {editing && onDelete ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="danger" size="lg" fullWidth onPress={handleDelete}>
              Delete
            </Button>
          </View>
          <View className="flex-1">
            <Button variant="primary" size="lg" fullWidth onPress={handleSave} disabled={!canSave} loading={saving}>
              {saving ? 'Saving…' : 'Update'}
            </Button>
          </View>
        </View>
      ) : (
        <Button variant="primary" size="lg" fullWidth onPress={handleSave} disabled={!canSave} loading={saving}>
          {saving ? 'Saving…' : 'Add transaction'}
        </Button>
      )}
    </Modal>
  );
}

// ─── PpfInfoModal ─────────────────────────────────────────────────────────────

interface PpfInfoModalSection {
  icon: string;
  label: string;
  body: ReactNode;
  example?: ReactNode;
}

interface PpfInfoModalPersonal {
  variant: 'eligible' | 'pending';
  icon: string;
  text: string;
}

/**
 * Small centered educational reference card — this app's first "i" info-icon → modal pattern
 * (ppf-card-redesign-v1.html §4). Deliberately neutral/slate throughout, never amber — this is
 * general PPF education, not a flag about the user's own account (that's what the card's "Needs
 * attention" banner is for; conflating the two would blur "here's how PPF works" with "here's a
 * problem with your account"). Reuses the shared `Modal` in its default compact (non-scrollable)
 * mode rather than inventing a tooltip/popover primitive — none exists anywhere in this app
 * (`apps/mobile/src/components/ui/` checked), and `docs/DESIGN_GUIDELINES.md` requires centered
 * modals, never bottom sheets/popovers.
 */
export function PpfInfoModal({
  title,
  sections,
  personal,
  onClose
}: {
  title: string;
  sections: PpfInfoModalSection[];
  personal?: PpfInfoModalPersonal | undefined;
  onClose: () => void;
}) {
  const theme = useThemeColors();
  return (
    <Modal onClose={onClose} title={title} size="sm">
      <View className="-mt-2 gap-3">
        {sections.map((s, i) => (
          <View key={i} className="gap-1">
            <View className="flex-row items-center gap-1.5">
              <Icon name={s.icon} size={12} color="#8b5cf6" />
              <Text className="text-[9.5px] font-extrabold uppercase tracking-wide" style={{ color: '#8b5cf6' }}>
                {s.label}
              </Text>
            </View>
            <Text className="text-[11px] text-secondary leading-relaxed">{s.body}</Text>
            {s.example !== undefined && (
              <View className="mt-0.5 rounded-lg p-2 bg-surface-2">
                <Text className="text-[10px] text-secondary leading-relaxed">{s.example}</Text>
              </View>
            )}
          </View>
        ))}
        {personal && (
          <View
            className="mt-0.5 rounded-xl px-2.5 py-2 flex-row items-center gap-1.5"
            style={{
              backgroundColor: personal.variant === 'eligible' ? tint(theme.success, 12) : theme.surfaceSecondary
            }}
          >
            <Icon
              name={personal.icon}
              size={13}
              color={personal.variant === 'eligible' ? theme.success : theme.textSecondary}
            />
            <Text
              className="text-[10.5px] font-semibold flex-1 leading-relaxed"
              style={{ color: personal.variant === 'eligible' ? theme.success : theme.textSecondary }}
            >
              {personal.text}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── PpfAllTransactionsSheet ─────────────────────────────────────────────────

/**
 * Mirrors `EpfAllTransactionsSheet`'s FY-band grouping (most recent FY first, each band its own
 * `ppfDepositsForFy()`-powered progress bar) — see ppf-card-redesign-v1.html §3. Two deliberate
 * divergences from EPF's exact shape, both explained in the mockup's own footer:
 * 1. No All/Interest/Transfers `SegmentedControl` — PPF's volume per year (1-2 deposits + 1 interest)
 *    is far lower than EPF's, so a filter would be UI for a problem PPF doesn't have.
 * 2. No repeated "N need review" count in this header — that count already has one legible home, the
 *    card's own consolidated "Needs attention" banner (`RetirementCard.tsx`); repeating it here would
 *    recreate the exact "same signal, multiple mechanisms" problem the redesign was meant to fix.
 * Flagged interest rows still carry their warning icon (same `findAllPpfReviewFlags` check as the
 * card, so the two can never disagree). Every row (flagged or not) is tappable — opens
 * `PpfTransactionSheet` in edit mode, prefilled from that transaction, with a Delete button — the
 * flag itself isn't a correction flow, just a reason someone might specifically want to tap that row
 * to fix it, which generic edit already covers for free.
 */
export function PpfAllTransactionsSheet({
  holding,
  onAddTransaction,
  onSave,
  onClose
}: {
  holding: Holding;
  onAddTransaction: () => void;
  /** Persists an edited/deleted transaction — same `onSave`-style holding update every other sheet
   *  in this file already uses. */
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const theme = useThemeColors();
  // Which transaction (if any) is open for edit/delete in the nested `PpfTransactionSheet`.
  const [editingTxn, setEditingTxn] = useState<PpfTransaction | null>(null);
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.portfolio);

  // Fetched once — used only for the flagged-row warning icon (the exact same `findAllPpfReviewFlags`
  // call as `RetirementCard.tsx`'s own count, so the two can never disagree). A null table just means
  // no flags can be computed yet (never shown as 0 flags, see below).
  const [rateTable, setRateTable] = useState<PpfRateTable | null>(null);
  useEffect(() => {
    getPpfRateTable()
      .then(setRateTable)
      .catch(() => {});
  }, []);

  const txns = useMemo(() => holding.assetMeta?.ppfTransactions ?? [], [holding.assetMeta?.ppfTransactions]);

  const reviewFlags = useMemo(() => findAllPpfReviewFlags(txns, rateTable), [txns, rateTable]);
  const flaggedTxnIds = useMemo(() => new Set(reviewFlags.map((f) => f.txnId)), [reviewFlags]);

  // `useState` lazy initializer, not a bare `dateToFyStartYear(Date.now())` call (2026-08-08 lint
  // fix) — `Date.now()` is an impure call the newer `react-hooks/purity` rule flags anywhere in the
  // render body, including inside `useMemo` (its callback still runs during render). A `useState`
  // initializer is the accepted escape hatch for one-time impure reads. Computed once per mount is
  // fine here: the financial year this depends on only ever changes once a year, well outside this
  // sheet's lifetime — the setter is intentionally never called.
  const [currentFy] = useState(() => dateToFyStartYear(Date.now()));

  type PpfFyGroup = { fyStartYear: number; txns: PpfTransaction[] };

  const fyGroups = useMemo<PpfFyGroup[]>(() => {
    const groups = new Map<number, PpfTransaction[]>();
    for (const t of txns) {
      const fy = dateToFyStartYear(t.date);
      if (!groups.has(fy)) groups.set(fy, []);
      groups.get(fy)?.push(t);
    }
    return [...groups.entries()]
      .map(([fyStartYear, fyTxns]) => ({ fyStartYear, txns: fyTxns }))
      .sort((a, b) => b.fyStartYear - a.fyStartYear);
  }, [txns]);

  return (
    <>
      <Modal onClose={onClose} title="PPF Transactions" scrollable>
        <View className="-mt-2 flex-row items-center justify-between">
          <Text className="text-[10px] text-tertiary">
            {txns.length} transaction{txns.length !== 1 ? 's' : ''} · {fyGroups.length} year
            {fyGroups.length !== 1 ? 's' : ''}
          </Text>
          {/* Neutral "Add" here (was purple on the card) — matches EPF's own neutral pop-up Add pill;
            the card keeps purple exclusively for its own primary "Add" action. */}
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

        {fyGroups.length === 0 && (
          <Text className="text-center text-sm text-tertiary mt-8">No transactions to show.</Text>
        )}

        {fyGroups.map((group) => {
          const isCurrentFy = group.fyStartYear === currentFy;
          const fyDeposits = ppfDepositsForFy(txns, group.fyStartYear);
          const fyPct = Math.min(100, (fyDeposits / PPF_MAX_ANNUAL) * 100);
          const isMaxed = fyPct >= 100;
          // Current, still-open FY keeps the card's own This-FY tile language (blue in progress, green
          // once full — still actionable, you can still deposit before the year closes). Past, closed
          // FYs render the same bar muted instead — historical record, not something to act on, so they
          // deliberately don't borrow the actionable blue/green language.
          const barColor = isCurrentFy ? (isMaxed ? theme.success : theme.info) : theme.textTertiary;
          return (
            <View key={group.fyStartYear}>
              <View className="py-2 px-2 rounded-lg flex-row items-center justify-between bg-surface-2">
                <Text className="text-xs font-bold" style={{ color: '#8b5cf6' }}>
                  {fyLabel(group.fyStartYear)}
                </Text>
                <Text className="text-[10px] text-tertiary">
                  {group.txns.length} transaction{group.txns.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View className="py-2 gap-1 border-b border-theme">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[9px] text-tertiary">
                    {isCurrentFy ? 'This FY deposits' : "Year's deposits"}
                  </Text>
                  <Text
                    className="text-[9px] tabular-nums"
                    style={isMaxed ? { color: theme.success, fontWeight: '700' } : { color: theme.textTertiary }}
                  >
                    {!masked ? `₹${fyDeposits.toLocaleString('en-IN')} / ₹1.5L` : '•••• / ₹1.5L'}
                    {isMaxed && (isCurrentFy ? ' ✓ Full' : ' ✓')}
                  </Text>
                </View>
                <ProgressBar value={fyPct} color={barColor} />
              </View>

              {[...group.txns]
                .sort((a, b) => b.date - a.date)
                .map((tx) => {
                  const isDeposit = tx.type === 'deposit';
                  const before5 = isDeposit ? isBeforeFifth(tx.date) : null;
                  // Deposit icon recolors amber for an after-5th deposit (misses that month's interest
                  // accrual) — same signal as the "≤5th"/">5th" text below, just also on the icon.
                  const iconColor = isDeposit
                    ? before5
                      ? PPF_TX_COLORS.deposit
                      : theme.warning
                    : PPF_TX_COLORS[tx.type];
                  const isFlagged = tx.type === 'interest' && flaggedTxnIds.has(tx.id);
                  return (
                    <Pressable
                      key={tx.id}
                      onPress={() => setEditingTxn(tx)}
                      className="py-2.5 flex-row items-center gap-3 border-b border-theme"
                    >
                      <View
                        className="w-7 h-7 rounded-full items-center justify-center"
                        style={{ backgroundColor: tint(iconColor, 12) }}
                      >
                        <Icon
                          name={isDeposit ? 'ti-arrow-down' : tx.type === 'interest' ? 'ti-percentage' : 'ti-minus'}
                          size={13}
                          color={iconColor}
                        />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5 flex-wrap">
                          <Text className="text-xs font-semibold" style={{ color: PPF_TX_COLORS[tx.type] }}>
                            {PPF_TX_LABELS[tx.type]}
                          </Text>
                          {isFlagged && <Icon name="ti-alert-triangle" size={11} color={theme.warning} />}
                        </View>
                        <Text className="text-[10px] text-tertiary">
                          {new Date(tx.date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                          {isDeposit && ` · ${before5 ? '≤5th' : '>5th'}`}
                          {tx.type === 'interest' && ` · ${fyLabel(dateToFyStartYear(tx.date))}`}
                          {tx.note && ` · ${tx.note}`}
                        </Text>
                      </View>
                      <Text className="text-xs font-bold tabular-nums" style={{ color: PPF_TX_COLORS[tx.type] }}>
                        {!masked ? `₹${tx.amount.toLocaleString('en-IN')}` : '••••'}
                      </Text>
                      <Icon name="ti-chevron-right" size={12} color={theme.textTertiary} />
                    </Pressable>
                  );
                })}
            </View>
          );
        })}
      </Modal>

      {/* Edit/delete an existing PPF transaction — same `PpfTransactionSheet` used to add one, in
          edit mode. Nested above the transactions list Modal, same pattern every other sheet in this
          file uses for a secondary popup. */}
      {editingTxn && (
        <PpfTransactionSheet
          holding={holding}
          editing={editingTxn}
          onSave={async (updated) => {
            await onSave(updated);
            setEditingTxn(null);
          }}
          onDelete={(id) => {
            const updated: Holding = {
              ...holding,
              assetMeta: {
                ...holding.assetMeta,
                ppfTransactions: (holding.assetMeta?.ppfTransactions ?? []).filter((t) => t.id !== id)
              },
              updatedAt: Date.now()
            };
            void onSave(updated);
            setEditingTxn(null);
          }}
          onClose={() => setEditingTxn(null)}
        />
      )}
    </>
  );
}

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
  onSave,
  onClose
}: {
  holding: Holding;
  onAddTransaction: () => void;
  /** Writes a corrected interest transaction back onto the holding — see the interest breakdown
   *  popup's "Update to ₹…" action below. Threaded through from `RetirementCard.tsx`'s own `onSave`,
   *  same as every other sheet in this file. */
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const theme = useThemeColors();
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.portfolio);
  const [filter, setFilter] = useState<'all' | 'interest' | 'transfer'>('all');
  const [selectedMonth, setSelectedMonth] = useState<EpfMonthEntry | null>(null);
  const [selectedInterestTxn, setSelectedInterestTxn] = useState<EpfTransaction | null>(null);
  const [correctingInterest, setCorrectingInterest] = useState(false);
  const [addingHike, setAddingHike] = useState(false);
  // Fetched once — used to show each interest row's applicable rate (doc §10.5). Never required for the
  // rest of the sheet to work; a null table just means no rate tag is shown yet.
  const [rateTable, setRateTable] = useState<EpfRateTable | null>(null);
  useEffect(() => {
    getEpfRateTable()
      .then(setRateTable)
      .catch(() => {});
  }, []);

  const allMonths = useMemo(
    () => epfComputeAllMonths(holding.assetMeta?.epfEmployers ?? [], holding.assetMeta?.epfTransactions ?? []),
    [holding.assetMeta?.epfEmployers, holding.assetMeta?.epfTransactions]
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

  // Recomputed fresh every time the popup opens — never read from a stored field (doc §10.5: an
  // interest transaction's rate/trace must always reflect the FY + whatever contributions are
  // CURRENTLY logged, so it never goes stale if those are edited later).
  const interestBreakdown = useMemo(() => {
    if (!selectedInterestTxn || !rateTable) return null;
    const fy = dateToFyStartYear(selectedInterestTxn.date);
    const employers = holding.assetMeta?.epfEmployers ?? [];
    const transactions = holding.assetMeta?.epfTransactions ?? [];
    const result = computeEpfInterestOnDemand(employers, transactions, rateTable, fy);
    const ratePct = getInterestRateForFy(rateTable, fy);
    return { fy, result, ratePct };
  }, [selectedInterestTxn, rateTable, holding.assetMeta?.epfEmployers, holding.assetMeta?.epfTransactions]);

  // Writes the freshly-recomputed employee/employer split back onto the mismatched transaction —
  // same shape the "calculate it for me" assistant already writes in `EpfTransactionSheet` (recorded
  // `employeeAmount`/`employerAmount`, `amount` as their sum) since it's the same "recomputed EPF
  // interest for one FY" result either way.
  async function handleCorrectInterest() {
    if (!selectedInterestTxn || !interestBreakdown || correctingInterest) return;
    const { employeeInterest, employerInterest } = interestBreakdown.result;
    setCorrectingInterest(true);
    try {
      const updatedTxn: EpfTransaction = {
        ...selectedInterestTxn,
        employeeAmount: employeeInterest,
        employerAmount: employerInterest,
        amount: employeeInterest + employerInterest
      };
      const updated: Holding = {
        ...holding,
        assetMeta: {
          ...holding.assetMeta,
          epfTransactions: (holding.assetMeta?.epfTransactions ?? []).map((t) =>
            t.id === selectedInterestTxn.id ? updatedTxn : t
          )
        },
        updatedAt: Date.now()
      };
      await onSave(updated);
      setSelectedInterestTxn(null);
    } catch {
      // Leave the popup open, still showing the mismatch, so the user can retry.
    } finally {
      setCorrectingInterest(false);
    }
  }

  // "Needs review" flags (Task 2) — the exact same function powers the row badges below AND
  // `RetirementCard`'s own card-level count, so the two can never disagree with each other.
  const reviewFlags = useMemo(
    () =>
      findAllReviewFlags(holding.assetMeta?.epfEmployers ?? [], holding.assetMeta?.epfTransactions ?? [], rateTable),
    [holding.assetMeta?.epfEmployers, holding.assetMeta?.epfTransactions, rateTable]
  );
  const interestMismatchTxnIds = useMemo(
    () =>
      new Set(
        reviewFlags.filter((f): f is EpfInterestMismatchFlag => f.kind === 'interestMismatch').map((f) => f.txnId)
      ),
    [reviewFlags]
  );
  const wageDiscrepancyMonths = useMemo(
    () =>
      new Set(
        reviewFlags.filter((f): f is EpfWageDiscrepancyFlag => f.kind === 'wageDiscrepancy').map((f) => f.wagesMonth)
      ),
    [reviewFlags]
  );

  // The real transaction (if any) behind the tapped month, and whether it disagrees with its
  // employer's CURRENT salary model — powers the wage-discrepancy note/action in the contribution
  // breakdown popup below (Task 2b). `null` for an estimated (non-real) month, which by construction
  // can never disagree with the very model that generated it.
  const selectedMonthRealTxn = useMemo(
    () =>
      selectedMonth
        ? ((holding.assetMeta?.epfTransactions ?? []).find(
            (t) => t.type === 'contribution' && t.wagesMonth === selectedMonth.month
          ) ?? null)
        : null,
    [selectedMonth, holding.assetMeta?.epfTransactions]
  );
  const selectedMonthWageFlag = useMemo(
    () =>
      selectedMonthRealTxn ? checkWageDiscrepancy(selectedMonthRealTxn, holding.assetMeta?.epfEmployers ?? []) : null,
    [selectedMonthRealTxn, holding.assetMeta?.epfEmployers]
  );

  /** "Possible unrecorded salary hike" action (Task 2b, higher-than-predicted case only) — appends a
   *  new `EpfSalaryHike` back-calculated from the real employee amount, sorted into the employer's
   *  timeline, via the same `onSave` plumbing every other write in this sheet already uses. Never
   *  silently written — only reachable by an explicit tap. */
  async function handleAddHikeFromDiscrepancy() {
    if (!selectedMonth || !selectedMonthWageFlag || addingHike) return;
    const { employer, realAmount } = selectedMonthWageFlag;
    setAddingHike(true);
    try {
      const backCalculatedBasic = Math.round(realAmount / (employer.employeeContribPct / 100));
      const newHike: EpfSalaryHike = {
        fromDate: new Date(`${selectedMonth.month}-01T00:00:00`).getTime(),
        basicSalary: backCalculatedBasic
      };
      const updatedTimeline = [...(employer.hikeTimeline ?? []), newHike].sort((a, b) => a.fromDate - b.fromDate);
      const updated: Holding = {
        ...holding,
        assetMeta: {
          ...holding.assetMeta,
          epfEmployers: (holding.assetMeta?.epfEmployers ?? []).map((e) =>
            e.id === employer.id ? { ...e, hikeTimeline: updatedTimeline } : e
          )
        },
        updatedAt: Date.now()
      };
      await onSave(updated);
      setSelectedMonth(null);
    } catch {
      // Leave the popup open, still showing the discrepancy, so the user can retry.
    } finally {
      setAddingHike(false);
    }
  }

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
              .map((tx) => {
                // Interest rows are tappable for a rate + month-by-month breakdown (doc §10.5) — every
                // other non-contribution type stays display-only, unchanged from before.
                const isInterest = tx.type === 'interest';
                const txFy = dateToFyStartYear(tx.date);
                const ratePct = isInterest && rateTable ? getInterestRateForFy(rateTable, txFy) : null;
                const displayAmount = isInterest ? recordedInterestTotal(tx) : (tx.amount ?? 0);
                return (
                  <Pressable
                    key={tx.id}
                    onPress={isInterest ? () => setSelectedInterestTxn(tx) : undefined}
                    className="py-2.5 flex-row items-center gap-3 border-b border-theme"
                  >
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
                      <View className="flex-row items-center gap-1.5 flex-wrap">
                        <Text className="text-xs font-semibold" style={{ color: EPF_TX_COLORS[tx.type] }}>
                          {EPF_TX_LABELS[tx.type]}
                        </Text>
                        {ratePct !== null && (
                          <Text
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: tint(theme.success, 15), color: theme.success }}
                          >
                            {ratePct}% p.a.
                          </Text>
                        )}
                        {/* "Needs review" badge (Task 2a) — distinct from the green rate-tag pill
                            above so the two are never confused at a glance. */}
                        {interestMismatchTxnIds.has(tx.id) && (
                          <Icon name="ti-alert-triangle" size={11} color={theme.warning} />
                        )}
                      </View>
                      <Text className="text-[10px] text-tertiary">
                        {new Date(tx.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                        {isInterest && ` · ${fyLabel(txFy)}`}
                        {tx.note && ` · ${tx.note}`}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Text className="text-xs font-bold tabular-nums" style={{ color: EPF_TX_COLORS[tx.type] }}>
                        {!masked ? `₹${displayAmount.toLocaleString('en-IN')}` : '••••'}
                      </Text>
                      {isInterest && <Icon name="ti-chevron-right" size={12} color={theme.textTertiary} />}
                    </View>
                  </Pressable>
                );
              })}

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
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-xs font-medium text-primary">{entry.month}</Text>
                      {/* "Needs review" badge (Task 2b) — a real month whose recorded amount
                          disagrees with the employer's current salary model. */}
                      {wageDiscrepancyMonths.has(entry.month) && (
                        <Icon name="ti-alert-triangle" size={11} color={theme.warning} />
                      )}
                    </View>
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

          {/* Wage-discrepancy note/action (Task 2b) — only for a REAL month whose recorded amount
              disagrees with what the employer's CURRENT salary model would predict. Never a general
              edit-transaction-amount UI (out of scope, see docs/plans/epf-passbook-import.md §9) —
              "higher" gets an explicit opt-in action to add a hike; "lower" is explanation-only. */}
          {selectedMonthWageFlag && (
            <>
              <Banner variant="warning" icon="ti-alert-triangle">
                {masked
                  ? 'This month looks off vs. the current salary record — amounts hidden while masked.'
                  : selectedMonthWageFlag.direction === 'higher'
                    ? `This month's recorded employee contribution (₹${selectedMonthWageFlag.realAmount.toLocaleString('en-IN')}) is higher than ${selectedMonthWageFlag.employer.companyName}'s current salary record would predict (₹${Math.round(selectedMonthWageFlag.predictedAmount).toLocaleString('en-IN')}) — possibly an unrecorded salary hike.`
                    : `This month's recorded employee contribution (₹${selectedMonthWageFlag.realAmount.toLocaleString('en-IN')}) looks lower than ${selectedMonthWageFlag.employer.companyName}'s current salary record would predict (₹${Math.round(selectedMonthWageFlag.predictedAmount).toLocaleString('en-IN')}) — either a salary hike was added since this was recorded, or this was a partial month (e.g. you joined/left ${selectedMonthWageFlag.employer.companyName} partway through it).`}
              </Banner>
              {selectedMonthWageFlag.direction === 'higher' && !masked && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={addingHike}
                  disabled={addingHike}
                  onPress={handleAddHikeFromDiscrepancy}
                >
                  {addingHike
                    ? 'Adding…'
                    : `Add hike: ₹${Math.round(
                        selectedMonthWageFlag.realAmount / (selectedMonthWageFlag.employer.employeeContribPct / 100)
                      ).toLocaleString('en-IN')}/mo`}
                </Button>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Interest rate + month-by-month breakdown popup (doc §10.5) — same nested-Modal pattern as the
          contribution breakdown above, styled uniformly whether the entry was typed manually, produced
          by the "calculate it for me" assistant, or reconciled from an import. */}
      {selectedInterestTxn && (
        <Modal
          onClose={() => setSelectedInterestTxn(null)}
          title={`Interest — ${fyLabel(dateToFyStartYear(selectedInterestTxn.date))}`}
          scrollable
        >
          {interestBreakdown?.ratePct != null ? (
            <View
              className="flex-row items-center gap-2 rounded-xl p-2.5 border -mt-2"
              style={{ backgroundColor: tint(theme.success, 10), borderColor: tint(theme.success, 25) }}
            >
              <Icon name="ti-percentage" size={15} color={theme.success} />
              <Text className="text-[10.5px] text-secondary flex-1 leading-relaxed">
                Rate used: <Text className="font-bold text-primary">{interestBreakdown.ratePct}% p.a.</Text> — EPFO's
                declared rate for {fyLabel(interestBreakdown.fy)}.
              </Text>
            </View>
          ) : (
            <Text className="text-xs text-tertiary -mt-2">Rate not available for this financial year yet.</Text>
          )}

          {interestBreakdown && (
            <>
              <Text className="text-[10px] font-medium text-tertiary uppercase tracking-wide">
                Month-by-month (employee share)
              </Text>
              {interestBreakdown.result.employeeTrace.map((m: EpfInterestMonthTrace) => (
                <DetailRow
                  key={m.month}
                  label={`${new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} · opening ₹${Math.round(m.openingBalance).toLocaleString('en-IN')}`}
                  value={!masked ? `₹${Math.round(m.interest).toLocaleString('en-IN')}` : '••••'}
                />
              ))}
              <DetailRow
                label={<Text className="font-semibold">Total employee interest</Text>}
                value={!masked ? `₹${interestBreakdown.result.employeeInterest.toLocaleString('en-IN')}` : '••••'}
                size="md"
                className="border-t border-theme pt-1.5"
              />
              <DetailRow
                label={<Text style={{ color: theme.textTertiary }}>+ employer-EPF interest</Text>}
                value={
                  <Text style={{ color: theme.textTertiary }}>
                    {!masked ? `₹${interestBreakdown.result.employerInterest.toLocaleString('en-IN')}` : '••••'}
                  </Text>
                }
              />
              {(() => {
                // Shared with the row badge + card-level count (Task 2a) — `checkInterestMismatch`
                // is the single source of truth for "does this recorded interest agree with a fresh
                // recalculation", so this banner can never disagree with either of those.
                const check = checkInterestMismatch(
                  selectedInterestTxn,
                  holding.assetMeta?.epfEmployers ?? [],
                  holding.assetMeta?.epfTransactions ?? [],
                  rateTable
                );
                if (!check) return null;
                const { recorded, recomputed: recomputedTotal, mismatched } = check;
                const agrees = !mismatched;
                return (
                  <>
                    <Banner
                      variant={agrees ? 'info' : 'warning'}
                      icon={agrees ? 'ti-info-circle' : 'ti-alert-triangle'}
                    >
                      {masked
                        ? 'Recorded and recalculated amounts hidden while masked.'
                        : agrees
                          ? `Recorded amount is ₹${recorded.toLocaleString('en-IN')} — matches Penny's recalculation exactly.`
                          : `Recorded amount is ₹${recorded.toLocaleString('en-IN')}; Penny's fresh recalculation gives ₹${recomputedTotal.toLocaleString('en-IN')}. Contributions may have been edited since this was recorded.`}
                    </Banner>
                    {/* Actionable correction alongside the informational banner above (kept — still
                        correct and useful) — only shown when there's actually a mismatch to fix and
                        the real numbers aren't hidden by masking. */}
                    {!agrees && !masked && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={correctingInterest}
                        disabled={correctingInterest}
                        onPress={handleCorrectInterest}
                      >
                        {correctingInterest ? 'Updating…' : `Update to ₹${recomputedTotal.toLocaleString('en-IN')}`}
                      </Button>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

// ─── EpfTransactionSheet ─────────────────────────────────────────────────────

export function EpfTransactionSheet({
  holding,
  onSave,
  onClose,
  initialType,
  initialDate
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
  /** Pre-selects the type pill instead of the default `'contribution'` — used by the FY-end
   *  interest nudge banner's inline "+ Add" to open straight into the `'interest'` type. */
  initialType?: EpfTransactionType;
  /** epoch ms — pre-fills "Date of credit" instead of `Date.now()`, e.g. the nudge banner's FY-end
   *  date (31 March). */
  initialDate?: number;
}) {
  const theme = useThemeColors();
  const currentEmp = epfCurrentEmployer(holding.assetMeta?.epfEmployers ?? []);
  const basic = currentEmp?.basicSalary ?? 0;
  const empPct = (currentEmp?.employeeContribPct ?? 12) / 100;

  const [txType, setTxType] = useState<EpfTransactionType>(initialType ?? 'contribution');
  const [txDate, setTxDate] = useState(() => epochToDateInput(initialDate ?? Date.now()));
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
  const isInterest = txType === 'interest';

  // "Want me to calculate it for you?" (doc §6.3/§10's "calculate it for you" section, user's own
  // wording) — opt-in, inside this existing form, never automatic. Pre-fills `amount`; the user still
  // has to review and tap Save, matching this codebase's "always reviewable, never silently invented"
  // rule for any computed-on-behalf-of-the-user value.
  const [rateTable, setRateTable] = useState<EpfRateTable | null>(null);
  useEffect(() => {
    getEpfRateTable()
      .then(setRateTable)
      .catch(() => {});
  }, []);
  const [calcState, setCalcState] = useState<'idle' | 'calculated' | 'unavailable'>('idle');
  const [calcRatePct, setCalcRatePct] = useState<number | null>(null);
  const [calcResult, setCalcResult] = useState<{ employeeInterest: number; employerInterest: number } | null>(null);
  const targetFyStartYear = txDate ? dateToFyStartYear(new Date(txDate).getTime()) : null;

  // Reset once the type or the effective FY changes — an earlier "calculated for FY X" claim shouldn't
  // linger against a different date/type. Done during render (the "adjusting state when a prop
  // changes" pattern), not inside a `useEffect`, so it never triggers an extra commit/paint.
  const calcKey = `${txType}:${targetFyStartYear ?? ''}`;
  const [lastCalcKey, setLastCalcKey] = useState(calcKey);
  if (calcKey !== lastCalcKey) {
    setLastCalcKey(calcKey);
    setCalcState('idle');
    setCalcResult(null);
  }

  function handleCalculateInterest() {
    if (!rateTable || targetFyStartYear === null) return;
    const employers = holding.assetMeta?.epfEmployers ?? [];
    const transactions = holding.assetMeta?.epfTransactions ?? [];
    const result = computeEpfInterestOnDemand(employers, transactions, rateTable, targetFyStartYear);
    const rate = getInterestRateForFy(rateTable, targetFyStartYear);
    if (!result.rateFullyConfirmed || rate === null) {
      setCalcState('unavailable');
      return;
    }
    setAmount(String(result.employeeInterest + result.employerInterest));
    setCalcRatePct(rate);
    setCalcResult({ employeeInterest: result.employeeInterest, employerInterest: result.employerInterest });
    setCalcState('calculated');
  }

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
      // Preserve the employee/employer split from the "calculate it for me" assistant (needed for the
      // interest-breakdown popup's own recorded-vs-recomputed comparison) — but only while the saved
      // amount still matches the calculated total; if the user tweaked it afterward, fall back to the
      // legacy single-figure shape rather than saving a stale, now-inconsistent split.
      if (
        txType === 'interest' &&
        calcResult &&
        Math.abs(tx.amount - (calcResult.employeeInterest + calcResult.employerInterest)) < 1
      ) {
        tx.employeeAmount = calcResult.employeeInterest;
        tx.employerAmount = calcResult.employerInterest;
      }
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
        <View className="gap-2">
          {isInterest && (
            <View
              className="rounded-xl p-3 gap-2 border"
              style={{ backgroundColor: tint('#64748b', 8), borderColor: tint('#64748b', 25) }}
            >
              {calcState === 'calculated' ? (
                <View className="flex-row gap-2">
                  <Icon name="ti-circle-check" size={15} color={theme.success} />
                  <Text className="text-[10.5px] text-secondary flex-1 leading-relaxed">
                    Calculated using {targetFyStartYear !== null ? fyLabel(targetFyStartYear) : ''}&apos;s {calcRatePct}
                    % rate and your logged contributions.{' '}
                    <Text onPress={handleCalculateInterest} style={{ color: '#64748b', fontWeight: '700' }}>
                      Recalculate
                    </Text>
                  </Text>
                </View>
              ) : calcState === 'unavailable' ? (
                <View className="flex-row gap-2">
                  <Icon name="ti-info-circle" size={15} color={theme.textSecondary} />
                  <Text className="text-[10.5px] text-secondary flex-1 leading-relaxed">
                    Rate for {targetFyStartYear !== null ? fyLabel(targetFyStartYear) : 'this year'} hasn&apos;t been
                    declared by EPFO yet — we&apos;ll never guess. Check back once it&apos;s ratified, or enter the
                    amount manually if you already know it.
                  </Text>
                </View>
              ) : (
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    <Icon name="ti-calculator" size={15} color="#64748b" />
                    <Text className="text-[10.5px] text-secondary flex-1 leading-relaxed">
                      Correctly computing EPF interest needs the year&apos;s declared rate and a month-by-month accrual
                      — most people never log it accurately by hand.
                    </Text>
                  </View>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={handleCalculateInterest}
                    disabled={
                      !rateTable || targetFyStartYear === null || (holding.assetMeta?.epfEmployers?.length ?? 0) === 0
                    }
                  >
                    Want me to calculate it for you?
                  </Button>
                </View>
              )}
            </View>
          )}
          <AmountInput label="Amount" placeholder="0" value={amount} onChange={setAmount} autoFocus={!isInterest} />
          {calcState === 'calculated' && (
            <Text className="text-[10px] -mt-1" style={{ color: '#64748b' }}>
              Pre-filled — review before saving, edit if needed
            </Text>
          )}
        </View>
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
