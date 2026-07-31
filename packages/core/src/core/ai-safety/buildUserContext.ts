// The ONLY path from raw user data to the Anthropic API.
// Every field is anonymised before leaving this function.
// Phase 1: returns a stub context (mock Chip). Phase 1+Chip: wires real DB data.

import { scanForPii } from './piiScanner';

export interface UserContext {
  // Financial snapshot — all amounts banded to nearest ₹10K
  netWorthBand: string; // e.g. "₹10L–₹20L"
  monthlyExpenseBand: string;
  savingsRatePct: number; // rounded to nearest 5%

  // Portfolio — no names, classes only
  assetClasses: string[]; // e.g. ["mf", "fd", "gold"]
  holdingCount: number;

  // Goals — count only, no names
  goalCount: number;
  goalsOnTrack: number;

  // Insurance — types only, no insurer names
  insuranceTypes: string[];

  // Debt — types and banded amounts, no lender names
  liabilityTypes: string[];
  totalLiabilityBand: string;

  // Screen context
  currentModule: string;
}

function bandAmount(amount: number): string {
  const lakh = 100_000;
  const crore = 10_000_000;
  const band = Math.floor(amount / 10_000) * 10_000;
  if (band >= crore) return `₹${(band / crore).toFixed(1)}Cr+`;
  if (band >= lakh) return `₹${Math.floor(band / lakh)}L–₹${Math.floor(band / lakh) + 1}L`;
  return `₹${Math.floor(band / 1_000)}K–₹${Math.floor(band / 1_000) + 1}K`;
}

// Stub implementation — returns safe mock context for Phase 1.
// Phase 1+Chip: replace with real DB reads via EncryptedRepository.
export function buildUserContext(currentModule = 'home'): UserContext {
  const ctx: UserContext = {
    netWorthBand: bandAmount(1_500_000),
    monthlyExpenseBand: bandAmount(45_000),
    savingsRatePct: 30,
    assetClasses: ['mf', 'fd'],
    holdingCount: 5,
    goalCount: 2,
    goalsOnTrack: 1,
    insuranceTypes: ['term', 'health'],
    liabilityTypes: ['home_loan'],
    totalLiabilityBand: bandAmount(2_000_000),
    currentModule
  };

  // Runtime PII guard — throws if any field accidentally contains PII.
  // The CI gate (piiGate.test.ts) also checks this statically.
  const serialised = JSON.stringify(ctx);
  const result = scanForPii(serialised);
  if (result.hasPii) {
    throw new Error(`PII detected in UserContext: ${result.matches.map((m) => m.pattern).join(', ')}`);
  }

  return ctx;
}
