// Gratuity calculator — pure, on-device.
//
// Payment of Gratuity Act formula for covered employees:
//   gratuity = (15 / 26) × last drawn monthly salary (Basic + DA) × years of service
// A part-year of more than 6 months counts as a full year. The statutory tax-free
// ceiling is ₹20,00,000. Eligibility normally requires 5 years of continuous service.

export const GRATUITY_TAX_FREE_CAP = 20_00_000;
export const GRATUITY_MIN_YEARS = 5;

export interface GratuityInput {
  lastMonthlySalary: number; // Basic + DA, per month
  serviceYears: number;
  serviceMonths: number; // 0–11
}

export interface GratuityResult {
  gratuity: number; // payable amount (after the cap)
  uncappedGratuity: number; // formula output before the cap
  isCapped: boolean;
  roundedYears: number; // years used in the formula after the >6-month rule
  eligible: boolean; // met the 5-year minimum
}

export function calcGratuity(input: GratuityInput): GratuityResult | null {
  const { lastMonthlySalary, serviceYears, serviceMonths } = input;
  if (lastMonthlySalary <= 0 || serviceYears < 0 || serviceMonths < 0) return null;
  if (serviceYears === 0 && serviceMonths === 0) return null;

  const totalMonths = Math.round(serviceYears) * 12 + Math.round(serviceMonths);
  const wholeYears = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  // More than 6 months in the final year rounds up.
  const roundedYears = remMonths > 6 ? wholeYears + 1 : wholeYears;

  const uncappedGratuity = (15 / 26) * lastMonthlySalary * roundedYears;
  const gratuity = Math.min(uncappedGratuity, GRATUITY_TAX_FREE_CAP);

  return {
    gratuity,
    uncappedGratuity,
    isCapped: uncappedGratuity > GRATUITY_TAX_FREE_CAP,
    roundedYears,
    eligible: roundedYears >= GRATUITY_MIN_YEARS
  };
}
