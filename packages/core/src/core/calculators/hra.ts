// HRA (House Rent Allowance) exemption calculator — pure, on-device.
//
// Section 10(13A): the exempt portion of HRA is the LEAST of three amounts:
//   1. Actual HRA received
//   2. 50% of (Basic + DA) for metro cities, else 40%
//   3. Rent paid minus 10% of (Basic + DA)
// All inputs are annual amounts. "Salary" for this purpose = Basic + DA.

export interface HraInput {
  basicSalary: number; // annual Basic + DA
  hraReceived: number; // annual HRA received
  rentPaid: number; // annual rent paid
  isMetro: boolean; // Delhi, Mumbai, Kolkata, Chennai = metro (50%)
}

export interface HraResult {
  exemption: number; // exempt portion (least of the three)
  taxableHra: number; // HRA received minus exemption
  actualHra: number; // rule 1
  percentOfBasic: number; // rule 2
  rentMinus10Pct: number; // rule 3 (floored at 0)
}

export function calcHraExemption(input: HraInput): HraResult | null {
  const { basicSalary, hraReceived, rentPaid, isMetro } = input;

  if (basicSalary <= 0 || hraReceived < 0 || rentPaid < 0) return null;

  const actualHra = hraReceived;
  const percentOfBasic = basicSalary * (isMetro ? 0.5 : 0.4);
  const rentMinus10Pct = Math.max(0, rentPaid - basicSalary * 0.1);

  const exemption = Math.min(actualHra, percentOfBasic, rentMinus10Pct);
  const taxableHra = Math.max(0, hraReceived - exemption);

  return { exemption, taxableHra, actualHra, percentOfBasic, rentMinus10Pct };
}
