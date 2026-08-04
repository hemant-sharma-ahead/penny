import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  accountsRepo,
  expensesRepo,
  holdingsRepo,
  ledgerEntriesRepo,
  liabilitiesRepo,
  netWorthSnapshotsRepo,
  personsRepo
} from '@/core/db/repositories';
import type { Holding, Liability } from '@/core/db/types';
import { calcLiquidFunds, computeBalance } from '@/core/accounts/balanceCalculator';
import { signedAmount } from '@/core/iou/ledger';
import { calcInvestableCorpus } from '@/core/calculators/retirementProjection';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';
import { useAccountsRefresh } from '@/hooks/useDataRefresh';
import { toMonthYearKey } from '@/lib/formatters';

export interface AccountBalance {
  id: string;
  name: string;
  balance: number;
  color: string;
  icon: string;
  hideInSafeMode?: boolean;
}

export interface CreditCardAccount {
  id: string;
  name: string;
  outstanding: number;
  color: string;
  icon: string;
}

export interface HomeSummary {
  netWorth: number;
  monthlyExpenses: number;
  accountBalances: AccountBalance[];
  totalPortfolio: number;
  liquidFunds: number;
  holdings: Holding[];
  liabilities: Liability[];
  creditCardAccounts: CreditCardAccount[];
  /** Net IOU: (owed to you) − (you owe). Positive = a receivable asset; negative = a payable liability. */
  netIou: number;
  /** Investable corpus — a deliberately smaller, different figure than `netWorth`: mf/stock/fd/nps/ppf/
   *  epf/gold holdings + liquid funds, excluding vehicle/property/other (that equity can't fund a
   *  4%-withdrawal retirement). Powers the Home Retirement Corpus card — see
   *  `core/calculators/retirementProjection.ts`'s `calcInvestableCorpus()`. */
  investableCorpus: number;
}

export interface AssetGroup {
  ac: string;
  value: number;
  meta: { label: string; short: string; color: string; icon: string };
}

const HOLDING_META: Record<string, { label: string; short: string; color: string; icon: string }> = {
  mf: { label: 'Mutual Funds', short: 'MF', color: '#6366f1', icon: 'ti-chart-donut' },
  stock: { label: 'Stocks', short: 'Stocks', color: '#0ea5e9', icon: 'ti-trending-up' },
  fd: { label: 'FD / RD', short: 'FD/RD', color: '#f59e0b', icon: 'ti-building-bank' },
  nps: { label: 'NPS', short: 'NPS', color: '#10b981', icon: 'ti-building-community' },
  // No IconSafe in @tabler/icons-react-native (flagged during the Home-widgets port) — falls back to no
  // glyph via Icon.tsx's graceful-degradation, same as web would show a missing icon.
  ppf: { label: 'PPF', short: 'PPF', color: '#8b5cf6', icon: 'ti-safe' },
  epf: { label: 'EPF', short: 'EPF', color: '#64748b', icon: 'ti-building-factory' },
  gold: { label: 'Gold', short: 'Gold', color: '#d97706', icon: 'ti-coin' },
  vehicle: { label: 'Vehicles', short: 'Vehicles', color: '#3b82f6', icon: 'ti-car' },
  property: { label: 'Property', short: 'Property', color: '#8b5cf6', icon: 'ti-building' },
  other: { label: 'Other', short: 'Other', color: '#6b7280', icon: 'ti-dots' }
};
const ASSET_CLASS_ORDER = ['mf', 'stock', 'fd', 'nps', 'ppf', 'epf', 'gold', 'vehicle', 'property', 'other'];
const FALLBACK_HOLDING_META = { label: 'Other', short: 'Other', color: '#6b7280', icon: 'ti-dots' };
const LIQUID_META = { label: 'Liquid Funds', short: 'Liquid', color: '#06b6d4', icon: 'ti-building-bank' };
const IOU_META = { label: 'Owed to You', short: 'IOU', color: '#14b8a6', icon: 'ti-users' };

async function loadSummary(): Promise<HomeSummary> {
  const [liabilities, expenses, holdings, accs, ledgerEntries, persons] = await Promise.all([
    liabilitiesRepo.getAll(),
    expensesRepo.getAll(),
    holdingsRepo.getAll(),
    accountsRepo.getAll(),
    ledgerEntriesRepo.getAll(),
    personsRepo.getAll()
  ]);

  const totalPortfolio = holdings.reduce((s, h) => s + (h.currentValue ?? h.investedAmount), 0);
  const totalLiabilitiesAmt = liabilities.reduce((s, l) => s + l.outstandingAmount, 0);
  // Net IOU: lent (asset) − borrowed (liability), net of settlements. Offsets the cash movement
  // that lend/borrow transactions make, so net worth stays correct end-to-end. Only count entries for
  // ACTIVE persons — deleting an IOU soft-archives the person (entries kept for integrity), and archived
  // balances must not linger in net worth (matches the IOU tab totals).
  const activePersonIds = new Set(persons.filter((p) => !p.isArchived).map((p) => p.id));
  const netIou = ledgerEntries.reduce((s, e) => (activePersonIds.has(e.personId) ? s + signedAmount(e) : s), 0);

  const thisMonth = toMonthYearKey();
  const monthlyExpenses = expenses
    .filter((e) => toMonthYearKey(new Date(e.date)) === thisMonth && (!e.type || e.type === 'expense'))
    .reduce((s, e) => s + e.amount, 0);

  const accountBalances: AccountBalance[] = accs
    .filter((a) => !a.isArchived)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((acc) => ({
      id: acc.id,
      name: acc.name,
      balance: computeBalance(acc.id, acc.openingBalance, expenses),
      color: acc.color,
      icon: acc.icon,
      ...(acc.hideInSafeMode !== undefined ? { hideInSafeMode: acc.hideInSafeMode } : {})
    }));

  const liquidFunds = calcLiquidFunds(accs, expenses);

  const ccAccs = accs.filter((a) => a.type === 'credit_card' && !a.isArchived);
  const creditCardAccounts: CreditCardAccount[] = ccAccs.map((a) => {
    const bal = computeBalance(a.id, a.openingBalance, expenses);
    return { id: a.id, name: a.name, outstanding: Math.max(0, -bal), color: a.color, icon: a.icon };
  });
  const totalCcOutstanding = creditCardAccounts.reduce((s, c) => s + c.outstanding, 0);
  const totalAssets = totalPortfolio + liquidFunds;
  const netWorth = totalAssets - totalLiabilitiesAmt - totalCcOutstanding + netIou;
  const investableCorpus = calcInvestableCorpus(holdings, liquidFunds);

  // Fire-and-forget: capture this month's snapshot the first time Home loads in a new calendar month
  // (never backfilled synthetically — see NetWorthSnapshot's doc comment). Guarded by a real read, not a
  // local flag, so it stays correct across app reinstalls/multiple devices restoring the same backup.
  void captureMonthlySnapshotIfNeeded(investableCorpus, netWorth);

  return {
    netWorth,
    monthlyExpenses,
    accountBalances,
    totalPortfolio,
    liquidFunds,
    holdings,
    liabilities,
    creditCardAccounts,
    netIou,
    investableCorpus
  };
}

async function captureMonthlySnapshotIfNeeded(investableCorpus: number, netWorth: number): Promise<void> {
  const monthKey = toMonthYearKey();
  const existing = await netWorthSnapshotsRepo.getAll();
  if (existing.some((s) => s.monthKey === monthKey)) return;
  const now = Date.now();
  await netWorthSnapshotsRepo.put({ id: crypto.randomUUID(), monthKey, investableCorpus, netWorth, capturedAt: now });
}

/** RN port of apps/web-react/src/features/home/useHome.ts (no group dependency here — the web
 *  HomePage's activeGroup branch lives outside this hook; this port is personal-only). Mobile-only
 *  addition (`apps/web-react` is frozen): `investableCorpus` + the monthly `NetWorthSnapshot` capture,
 *  both added for the Retirement Corpus card — see `useRetirementProjection.ts`. */
export function useHome() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  const reload = useCallback(() => {
    loadSummary()
      .then((s) => setSummary(s))
      .catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);
  useTxnRefresh(reload);
  // Settings → Safe Mode edits accounts through a separately-mounted repo instance; reload here too.
  useAccountsRefresh(reload);

  const assetGroups = useMemo<AssetGroup[]>(() => {
    if (!summary) return [];
    const map = new Map<string, number>();
    for (const h of summary.holdings) {
      map.set(h.assetClass, (map.get(h.assetClass) ?? 0) + (h.currentValue ?? h.investedAmount));
    }
    const groups: AssetGroup[] = [];
    if (summary.liquidFunds > 0) {
      groups.push({ ac: 'liquid', value: summary.liquidFunds, meta: LIQUID_META });
    }
    ASSET_CLASS_ORDER.filter((ac) => (map.get(ac) ?? 0) > 0).forEach((ac) => {
      groups.push({ ac, value: map.get(ac) ?? 0, meta: HOLDING_META[ac] ?? FALLBACK_HOLDING_META });
    });
    // Net positive IOU is a receivable asset; a net payable is folded into liabilities instead.
    if (summary.netIou > 0) {
      groups.push({ ac: 'iou', value: summary.netIou, meta: IOU_META });
    }
    return groups;
  }, [summary]);

  const totalAssets = useMemo(() => assetGroups.reduce((s, g) => s + g.value, 0), [assetGroups]);

  const totalLiabilities = useMemo(
    () =>
      (summary?.liabilities?.reduce((s, l) => s + l.outstandingAmount, 0) ?? 0) +
      (summary?.creditCardAccounts?.reduce((s, c) => s + c.outstanding, 0) ?? 0) +
      // A net payable (you owe more than you're owed) counts as a liability.
      Math.max(0, -(summary?.netIou ?? 0)),
    [summary]
  );

  return { summary, assetGroups, totalAssets, totalLiabilities };
}
