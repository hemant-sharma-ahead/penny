// Metadata for the calculators reachable from a contextual entry point (Portfolio's Retirement/Fixed
// Income sections, Goals' tab strip) — icon/color/title for each row + its detail Modal's header.
//
// **2026-08-01 relocation**: this used to also drive a searchable generic "Calculators" hub screen on
// Home (`searchCalculators`, `keywords`) — removed along with that screen. Tax Regime/HRA moved into
// Tax Awareness's own `CalculatorsPillar` earlier and don't need an entry here (imported as components
// directly, no registry lookup); Capital Gains stays Tax-only (`CapitalGainsTab`, computed from real
// transactions — the generic scratch version was deleted, unused once the hub was gone); Inflation
// dissolved into an inline helper on Goals' target-amount field (`GoalForm.tsx`) instead of a
// standalone detail screen. `id` values are internal only now (no `?calc=` deep link to keep URL-safe).

export type CalculatorId = 'fire' | 'sip-swp' | 'fd-rd' | 'lumpsum' | 'gratuity' | 'ssy';

export interface CalculatorMeta {
  id: CalculatorId;
  title: string;
  subtitle: string;
  icon: string; // Tabler icon name (outline)
  color: string;
}

export const CALCULATORS: CalculatorMeta[] = [
  {
    id: 'fire',
    title: 'FIRE Calculator',
    subtitle: 'Corpus to retire early & years to financial independence',
    icon: 'ti-flame',
    color: '#f97316'
  },
  {
    id: 'sip-swp',
    title: 'SIP & SWP Planner',
    subtitle: 'Build a corpus with a step-up SIP, then draw a monthly income (SWP)',
    icon: 'ti-arrows-up-down',
    color: '#10b981'
  },
  {
    id: 'fd-rd',
    title: 'FD / RD Maturity',
    subtitle: 'Fixed & recurring deposit maturity and interest',
    icon: 'ti-building-bank',
    color: '#14b8a6'
  },
  {
    id: 'lumpsum',
    title: 'Lumpsum & CAGR',
    subtitle: 'Future value of a one-time investment, or its annualised return',
    icon: 'ti-coin',
    color: '#06b6d4'
  },
  {
    id: 'gratuity',
    title: 'Gratuity',
    subtitle: 'End-of-service gratuity under the Payment of Gratuity Act',
    icon: 'ti-cash-banknote',
    color: '#f59e0b'
  },
  {
    id: 'ssy',
    title: 'Sukanya Samriddhi (SSY)',
    subtitle: 'Girl-child savings scheme maturity at 21 years',
    icon: 'ti-baby-carriage',
    color: '#d946ef'
  }
];

export function getCalculator(id: CalculatorId): CalculatorMeta {
  const meta = CALCULATORS.find((c) => c.id === id);
  if (!meta) throw new Error(`Unknown calculator id: ${id}`);
  return meta;
}
