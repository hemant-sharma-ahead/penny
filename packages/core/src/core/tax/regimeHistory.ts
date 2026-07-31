// Per-financial-year direct-tax configuration for individuals below 60, FY2017-18 → FY2025-26.
// Powers multi-FY tax estimates and the Old-vs-New comparison. Estimates for planning — slab
// rates, the §87A rebate limit, standard deduction, cess and surcharge are modelled; marginal
// relief on the rebate/surcharge and special-rate incomes are not. Sources: Income Tax Dept,
// cleartax.in/s/income-tax-slabs.

export interface RegimeSlab {
  upTo: number | null; // null = no upper bound
  rate: number; // fraction, e.g. 0.05
}

export interface SurchargeBand {
  aboveIncome: number; // applies when total income exceeds this
  rate: number; // fraction
}

export interface RegimeConfig {
  slabs: RegimeSlab[];
  stdDeduction: number; // applied for salaried taxpayers
  rebateLimit: number; // §87A — taxable income ≤ this ⇒ tax nil (simplified, no marginal relief)
  allowsChapterVIA: boolean; // old regime allows 80C/80D/24B/etc.; new regime does not
}

export interface FYTaxConfig {
  fyStartYear: number; // 2025 ⇒ FY2025-26
  label: string; // "FY 2025-26 (AY 2026-27)"
  cessRate: number; // health & education cess
  surcharge: SurchargeBand[];
  /** Surcharge is capped at this rate under the new regime (post FY2023-24). */
  newRegimeSurchargeCap: number;
  old: RegimeConfig;
  new: RegimeConfig | null; // null before FY2020-21 (new regime did not exist)
}

// ── Old regime (stable across the window for individuals below 60) ──────────────
const OLD_SLABS: RegimeSlab[] = [
  { upTo: 2_50_000, rate: 0 },
  { upTo: 5_00_000, rate: 0.05 },
  { upTo: 10_00_000, rate: 0.2 },
  { upTo: null, rate: 0.3 }
];

const SURCHARGE_PRE_2019: SurchargeBand[] = [
  { aboveIncome: 50_00_000, rate: 0.1 },
  { aboveIncome: 1_00_00_000, rate: 0.15 }
];
const SURCHARGE_2019_ON: SurchargeBand[] = [
  { aboveIncome: 50_00_000, rate: 0.1 },
  { aboveIncome: 1_00_00_000, rate: 0.15 },
  { aboveIncome: 2_00_00_000, rate: 0.25 },
  { aboveIncome: 5_00_00_000, rate: 0.37 }
];

const oldRegime = (stdDeduction: number, rebateLimit: number): RegimeConfig => ({
  slabs: OLD_SLABS,
  stdDeduction,
  rebateLimit,
  allowsChapterVIA: true
});

const newRegime = (slabs: RegimeSlab[], stdDeduction: number, rebateLimit: number): RegimeConfig => ({
  slabs,
  stdDeduction,
  rebateLimit,
  allowsChapterVIA: false
});

// New-regime slab eras
const NEW_SLABS_2020: RegimeSlab[] = [
  { upTo: 2_50_000, rate: 0 },
  { upTo: 5_00_000, rate: 0.05 },
  { upTo: 7_50_000, rate: 0.1 },
  { upTo: 10_00_000, rate: 0.15 },
  { upTo: 12_50_000, rate: 0.2 },
  { upTo: 15_00_000, rate: 0.25 },
  { upTo: null, rate: 0.3 }
];
const NEW_SLABS_2023: RegimeSlab[] = [
  { upTo: 3_00_000, rate: 0 },
  { upTo: 6_00_000, rate: 0.05 },
  { upTo: 9_00_000, rate: 0.1 },
  { upTo: 12_00_000, rate: 0.15 },
  { upTo: 15_00_000, rate: 0.2 },
  { upTo: null, rate: 0.3 }
];
const NEW_SLABS_2024: RegimeSlab[] = [
  { upTo: 3_00_000, rate: 0 },
  { upTo: 7_00_000, rate: 0.05 },
  { upTo: 10_00_000, rate: 0.1 },
  { upTo: 12_00_000, rate: 0.15 },
  { upTo: 15_00_000, rate: 0.2 },
  { upTo: null, rate: 0.3 }
];
const NEW_SLABS_2025: RegimeSlab[] = [
  { upTo: 4_00_000, rate: 0 },
  { upTo: 8_00_000, rate: 0.05 },
  { upTo: 12_00_000, rate: 0.1 },
  { upTo: 16_00_000, rate: 0.15 },
  { upTo: 20_00_000, rate: 0.2 },
  { upTo: 24_00_000, rate: 0.25 },
  { upTo: null, rate: 0.3 }
];

const label = (startYear: number): string =>
  `FY ${startYear}-${String(startYear + 1).slice(2)} (AY ${startYear + 1}-${String(startYear + 2).slice(2)})`;

/** Indexed by FY start year. */
export const FY_TAX_CONFIGS: Record<number, FYTaxConfig> = {
  2017: {
    fyStartYear: 2017,
    label: label(2017),
    cessRate: 0.03,
    surcharge: SURCHARGE_PRE_2019,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(0, 3_50_000),
    new: null
  },
  2018: {
    fyStartYear: 2018,
    label: label(2018),
    cessRate: 0.04,
    surcharge: SURCHARGE_PRE_2019,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(40_000, 3_50_000),
    new: null
  },
  2019: {
    fyStartYear: 2019,
    label: label(2019),
    cessRate: 0.04,
    surcharge: SURCHARGE_2019_ON,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(50_000, 5_00_000),
    new: null
  },
  2020: {
    fyStartYear: 2020,
    label: label(2020),
    cessRate: 0.04,
    surcharge: SURCHARGE_2019_ON,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(50_000, 5_00_000),
    new: newRegime(NEW_SLABS_2020, 0, 5_00_000)
  },
  2021: {
    fyStartYear: 2021,
    label: label(2021),
    cessRate: 0.04,
    surcharge: SURCHARGE_2019_ON,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(50_000, 5_00_000),
    new: newRegime(NEW_SLABS_2020, 0, 5_00_000)
  },
  2022: {
    fyStartYear: 2022,
    label: label(2022),
    cessRate: 0.04,
    surcharge: SURCHARGE_2019_ON,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(50_000, 5_00_000),
    new: newRegime(NEW_SLABS_2020, 0, 5_00_000)
  },
  2023: {
    fyStartYear: 2023,
    label: label(2023),
    cessRate: 0.04,
    surcharge: SURCHARGE_2019_ON,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(50_000, 5_00_000),
    new: newRegime(NEW_SLABS_2023, 50_000, 7_00_000)
  },
  2024: {
    fyStartYear: 2024,
    label: label(2024),
    cessRate: 0.04,
    surcharge: SURCHARGE_2019_ON,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(50_000, 5_00_000),
    new: newRegime(NEW_SLABS_2024, 75_000, 7_00_000)
  },
  2025: {
    fyStartYear: 2025,
    label: label(2025),
    cessRate: 0.04,
    surcharge: SURCHARGE_2019_ON,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(50_000, 5_00_000),
    new: newRegime(NEW_SLABS_2025, 75_000, 12_00_000)
  },
  // FY2026-27 carries forward the FY2025-26 structure pending Budget 2026.
  2026: {
    fyStartYear: 2026,
    label: label(2026),
    cessRate: 0.04,
    surcharge: SURCHARGE_2019_ON,
    newRegimeSurchargeCap: 0.25,
    old: oldRegime(50_000, 5_00_000),
    new: newRegime(NEW_SLABS_2025, 75_000, 12_00_000)
  }
};

/** The most recent FY we have data for. */
export const LATEST_FY_START = 2026;

/** Earliest FY we model (GST launch era). */
export const EARLIEST_FY_START = 2017;

const LATEST_CONFIG: FYTaxConfig = FY_TAX_CONFIGS[LATEST_FY_START] as FYTaxConfig;

export function fyConfigFor(fyStartYear: number): FYTaxConfig {
  return FY_TAX_CONFIGS[fyStartYear] ?? LATEST_CONFIG;
}
