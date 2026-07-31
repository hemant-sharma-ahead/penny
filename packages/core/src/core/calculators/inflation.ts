// Inflation / future cost calculator — pure, on-device.
//
// Shows both directions of inflation's effect over a horizon:
//   • futureCost   — what something costing ₹X today will cost in N years.
//   • erodedValue  — what ₹X today will be worth (purchasing power) in N years.

export interface InflationInput {
  currentCost: number;
  inflationPct: number;
  years: number;
}

export interface InflationResult {
  futureCost: number; // ₹X today → cost after N years
  increase: number; // futureCost − currentCost
  erodedValue: number; // purchasing power of ₹X after N years, in today's money
  purchasingPowerLost: number; // currentCost − erodedValue
}

export function calcInflation(input: InflationInput): InflationResult | null {
  const { currentCost, inflationPct, years } = input;
  if (currentCost <= 0 || inflationPct < 0 || years <= 0) return null;

  const factor = Math.pow(1 + inflationPct / 100, years);
  const futureCost = currentCost * factor;
  const erodedValue = currentCost / factor;

  return {
    futureCost,
    increase: futureCost - currentCost,
    erodedValue,
    purchasingPowerLost: currentCost - erodedValue
  };
}
