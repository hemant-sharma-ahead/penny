import type { NpsLifecycleFund } from './npsTypes';

export interface AllocationRow {
  age: number;
  equity: number;
  corporate: number;
  govt: number;
}

export interface LifecycleFundConfig {
  key: NpsLifecycleFund;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  table: AllocationRow[];
}

function clamp(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}

// LC-75 Aggressive — anchors: ≤35: 75/10/15, 45: 35/20/45, 50: 20/20/60, ≥55: 15/10/75
function lc75Table(): AllocationRow[] {
  return Array.from({ length: 21 }, (_, i) => {
    const age = 35 + i;
    let e: number, c: number, g: number;
    if (age <= 45) {
      e = 75 - (age - 35) * 4;
      c = 10 + (age - 35) * 1;
      g = 15 + (age - 35) * 3;
    } else if (age <= 50) {
      e = 35 - (age - 45) * 3;
      c = 20;
      g = 45 + (age - 45) * 3;
    } else {
      e = 20 - (age - 50) * 1;
      c = 20 - (age - 50) * 2;
      g = 60 + (age - 50) * 3;
    }
    return { age, equity: clamp(e), corporate: clamp(c), govt: clamp(g) };
  });
}

// LC-50 Moderate (default) — E-2/C-1/G+3 per year, anchors: ≤35: 50/30/20, ≥55: 10/10/80
function lc50Table(): AllocationRow[] {
  return Array.from({ length: 21 }, (_, i) => {
    const age = 35 + i;
    const y = Math.min(age - 35, 20);
    return { age, equity: clamp(50 - y * 2), corporate: clamp(30 - y * 1), govt: clamp(20 + y * 3) };
  });
}

// LC-25 Conservative — E-1/C-2/G+3 per year, anchors: ≤35: 25/45/30, ≥55: 5/5/90
function lc25Table(): AllocationRow[] {
  return Array.from({ length: 21 }, (_, i) => {
    const age = 35 + i;
    const y = Math.min(age - 35, 20);
    return { age, equity: clamp(25 - y * 1), corporate: clamp(45 - y * 2), govt: clamp(30 + y * 3) };
  });
}

// BLC Balanced (introduced Oct 2024) — frozen 50/30/20 until 45, then tapers to 35/10/55 at 55
function blcTable(): AllocationRow[] {
  return Array.from({ length: 21 }, (_, i) => {
    const age = 35 + i;
    let e: number, c: number, g: number;
    if (age <= 45) {
      e = 50;
      c = 30;
      g = 20;
    } else if (age <= 50) {
      e = 50 - (age - 45) * 2;
      c = 30 - (age - 45) * 2;
      g = 20 + (age - 45) * 4;
    } else {
      e = 40 - (age - 50) * 1;
      c = 20 - (age - 50) * 2;
      g = 40 + (age - 50) * 3;
    }
    return { age, equity: clamp(e), corporate: clamp(c), govt: clamp(g) };
  });
}

export const LIFECYCLE_FUNDS: Record<NpsLifecycleFund, LifecycleFundConfig> = {
  lc75: {
    key: 'lc75',
    label: 'LC-75 Aggressive',
    shortLabel: 'Aggressive',
    description:
      'Starts at 75% equity at age 35, tapering to 15% by 55. Best for young investors with high risk tolerance.',
    color: '#ef4444',
    table: lc75Table()
  },
  lc50: {
    key: 'lc50',
    label: 'LC-50 Moderate',
    shortLabel: 'Moderate',
    description: 'Starts at 50% equity with 30% corporate bonds. PFRDA default — balanced growth and stability.',
    color: '#f59e0b',
    table: lc50Table()
  },
  lc25: {
    key: 'lc25',
    label: 'LC-25 Conservative',
    shortLabel: 'Conservative',
    description: 'Starts at 25% equity with 45% corporate bonds. Low volatility, prioritises capital preservation.',
    color: '#10b981',
    table: lc25Table()
  },
  blc: {
    key: 'blc',
    label: 'BLC Balanced',
    shortLabel: 'Balanced',
    description: 'Introduced Oct 2024. Holds 50% equity until age 45, then gradually shifts to 35% equity by 55.',
    color: '#6366f1',
    table: blcTable()
  }
};

export function getAllocationAtAge(fund: NpsLifecycleFund, age: number): AllocationRow {
  const table = LIFECYCLE_FUNDS[fund].table;
  // Table covers ages 35–55; clamp outside that range
  const idx = Math.max(0, Math.min(20, age - 35));
  return table[idx] ?? table[table.length - 1] ?? { age: 55, equity: 0, corporate: 0, govt: 0 };
}
