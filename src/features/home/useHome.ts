import { useState, useEffect, useMemo } from 'react';
import { accountsRepo, expensesRepo, holdingsRepo, liabilitiesRepo } from '@/core/db/repositories';
import type { Holding, Liability } from '@/core/db/types';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { toMonthYearKey } from '@/lib/formatters';

export interface AccountBalance {
  id: string;
  name: string;
  balance: number;
  color: string;
  icon: string;
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

async function loadSummary(): Promise<HomeSummary> {
  const [liabilities, expenses, holdings, accs] = await Promise.all([
    liabilitiesRepo.getAll(),
    expensesRepo.getAll(),
    holdingsRepo.getAll(),
    accountsRepo.getAll()
  ]);

  const totalPortfolio = holdings.reduce((s, h) => s + (h.currentValue ?? h.investedAmount), 0);
  const totalLiabilitiesAmt = liabilities.reduce((s, l) => s + l.outstandingAmount, 0);

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
      icon: acc.icon
    }));

  const liquidAccs = accs.filter((a) => a.includeInNetWorth && !a.isArchived);
  const liquidFunds = liquidAccs.reduce((s, a) => s + computeBalance(a.id, a.openingBalance, expenses), 0);

  const ccAccs = accs.filter((a) => a.type === 'credit_card' && !a.isArchived);
  const creditCardAccounts: CreditCardAccount[] = ccAccs.map((a) => {
    const bal = computeBalance(a.id, a.openingBalance, expenses);
    return { id: a.id, name: a.name, outstanding: Math.max(0, -bal), color: a.color, icon: a.icon };
  });
  const totalCcOutstanding = creditCardAccounts.reduce((s, c) => s + c.outstanding, 0);
  const totalAssets = totalPortfolio + Math.max(0, liquidFunds);

  return {
    netWorth: totalAssets - totalLiabilitiesAmt - totalCcOutstanding,
    monthlyExpenses,
    accountBalances,
    totalPortfolio,
    liquidFunds: Math.max(0, liquidFunds),
    holdings,
    liabilities,
    creditCardAccounts
  };
}

export function useHome() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
    return groups;
  }, [summary]);

  const totalAssets = useMemo(() => assetGroups.reduce((s, g) => s + g.value, 0), [assetGroups]);

  const totalLiabilities = useMemo(
    () =>
      (summary?.liabilities?.reduce((s, l) => s + l.outstandingAmount, 0) ?? 0) +
      (summary?.creditCardAccounts?.reduce((s, c) => s + c.outstanding, 0) ?? 0),
    [summary]
  );

  return { summary, assetGroups, totalAssets, totalLiabilities };
}
