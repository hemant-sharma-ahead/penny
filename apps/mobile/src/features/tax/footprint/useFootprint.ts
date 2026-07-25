import { useEffect, useMemo, useState } from 'react';
import { expensesRepo, expenseCategoriesRepo } from '@/core/db/repositories';
import type { Expense, ExpenseCategory, Profile } from '@/core/db/types';
import { useSettings } from '~/context/SettingsContext';
import { detectRecurringIncome } from '@/core/cashflow/incomeDetector';
import { computeCapitalGainsTax, type TaxSummary } from '@/core/tax/calculator';
import { estimateIndirectTax, type IndirectTaxBreakdown } from '@/core/tax/indirectTax';
import { sumFyIncome, annualiseRecurringIncome } from '@/core/tax/footprint';
import { compareTaxRegimes, recommendedRegimeTax } from '@/core/calculators/taxRegime';
import { fyConfigFor } from '@/core/tax/regimeHistory';
import { fyStartYearOf, fyWindow, selectableFYs, type FYOption } from '@/core/tax/fy';
import {
  computeWaterfall,
  defaultEpf,
  DEFAULT_PROFESSIONAL_TAX,
  type IncomeWaterfall
} from '@/core/tax/incomeWaterfall';
import { useTaxDeductions } from '../deductions/useTaxDeductions';

export interface FootprintData {
  waterfall: IncomeWaterfall;
  indirect: IndirectTaxBreakdown;
  gainsTax: number;
  /** Computed direct tax before any manual correction — used for the Adjust hint. */
  computedDirectTax: number;
  directOverridden: boolean;
  recommendedRegime: 'old' | 'new';
  grossSource: 'override' | 'transactions' | 'recurring' | 'none';
  fyOptions: FYOption[];
  fyStartYear: number;
  setFYStartYear: (y: number) => void;
  isCurrentFY: boolean;
  loading: boolean;
}

type Deductions = ReturnType<typeof useTaxDeductions>;

/**
 * RN port of apps/web-legacy/src/features/tax/footprint/useFootprint.ts — unchanged logic. Assembles
 * the income waterfall for the selected financial year: derives gross (FY income transactions →
 * annualised recurring → manual override), applies EPF/statutory levies and the regime-based direct tax
 * (all overridable), estimates indirect tax from that FY's spending, and reconciles consumed money into
 * direct tax / indirect tax / real consumption.
 */
export function useFootprint(
  summary: TaxSummary | null,
  deductions: Deductions,
  profile: Profile | null
): FootprintData {
  const { taxGrossIncomeOverride, taxDirectOverride, taxEpfOverride, taxStatutoryOverride } = useSettings();
  const [nowMs] = useState(() => Date.now());
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);

  const currentFYStart = Math.min(fyStartYearOf(nowMs), 2026);
  const [fyStartYear, setFYStartYear] = useState(currentFYStart);

  useEffect(() => {
    let cancelled = false;
    Promise.all([expensesRepo.getAll(), expenseCategoriesRepo.getAll()])
      .then(([exp, cats]) => {
        if (cancelled) return;
        setExpenses(exp);
        setCategories(cats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo<FootprintData>(() => {
    const loading = !summary || !expenses || !categories;
    const exp = expenses ?? [];
    const catMap = new Map((categories ?? []).map((c) => [c.id, c]));
    const fyConfig = fyConfigFor(fyStartYear);
    const window = fyWindow(fyStartYear);

    // ── Gross income source ────────────────────────────────────────────────────
    const fyIncome = sumFyIncome(exp, window);
    const recurringIncome = annualiseRecurringIncome(detectRecurringIncome(exp, nowMs));
    let gross = 0;
    let grossSource: FootprintData['grossSource'] = 'none';
    if (taxGrossIncomeOverride !== null) {
      gross = taxGrossIncomeOverride;
      grossSource = 'override';
    } else if (fyIncome > 0) {
      gross = fyIncome;
      grossSource = 'transactions';
    } else if (recurringIncome > 0) {
      gross = recurringIncome;
      grossSource = 'recurring';
    }

    // ── Direct tax (regime engine for the selected FY) ─────────────────────────
    const regime = compareTaxRegimes(
      {
        grossIncome: gross,
        isSalaried: profile?.employmentType === 'salaried',
        deduction80C: deductions.total80C,
        deduction80D: deductions.total80D.self + deductions.total80D.parents,
        homeLoanInterest: summary?.sec24B.annualInterest ?? 0,
        nps80ccd1b: deductions.npsAmount,
        hraExemption: 0,
        otherDeductions: 0
      },
      fyConfig
    );
    const computedDirectTax = regime ? recommendedRegimeTax(regime) : 0;
    const directOverridden = taxDirectOverride !== null;
    const incomeTax = directOverridden ? (taxDirectOverride as number) : computedDirectTax;

    // ── Spend → indirect tax (for the selected FY) ─────────────────────────────
    const indirect = estimateIndirectTax(exp, catMap, window);

    // ── Statutory savings/levies ───────────────────────────────────────────────
    const epf = taxEpfOverride !== null ? taxEpfOverride : defaultEpf(gross);
    const statutory = taxStatutoryOverride !== null ? taxStatutoryOverride : gross > 0 ? DEFAULT_PROFESSIONAL_TAX : 0;

    const waterfall = computeWaterfall({
      gross,
      epfEmployee: epf,
      professionalTax: statutory,
      lwf: 0,
      incomeTax,
      trackedSpend: indirect.totalSpend,
      indirectTax: indirect.totalTax
    });

    const gainsTax = summary ? computeCapitalGainsTax(summary).totalTax : 0;

    return {
      waterfall,
      indirect,
      gainsTax,
      computedDirectTax,
      directOverridden,
      recommendedRegime: regime?.recommended ?? 'new',
      grossSource,
      fyOptions: selectableFYs(nowMs),
      fyStartYear,
      setFYStartYear,
      isCurrentFY: fyStartYear === currentFYStart,
      loading
    };
  }, [
    summary,
    expenses,
    categories,
    deductions,
    profile,
    taxGrossIncomeOverride,
    taxDirectOverride,
    taxEpfOverride,
    taxStatutoryOverride,
    fyStartYear,
    currentFYStart,
    nowMs
  ]);
}
