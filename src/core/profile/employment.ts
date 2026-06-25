import type { EmploymentType } from '@/core/db/types';

/** Employment options shown in onboarding and the profile editor. */
export const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string; icon: string }[] = [
  { value: 'salaried', label: 'Salaried', icon: 'ti-briefcase' },
  { value: 'self_employed', label: 'Self-employed', icon: 'ti-user-cog' },
  { value: 'business_owner', label: 'Business owner', icon: 'ti-building-store' },
  { value: 'student', label: 'Student', icon: 'ti-school' },
  { value: 'retired', label: 'Retired', icon: 'ti-beach' }
];

const LABELS: Record<EmploymentType, string> = Object.fromEntries(
  EMPLOYMENT_OPTIONS.map((o) => [o.value, o.label])
) as Record<EmploymentType, string>;

export function employmentLabel(type: EmploymentType): string {
  return LABELS[type];
}
