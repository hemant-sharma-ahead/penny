import type { InsurancePolicy, InsuranceType } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { getPolicyMeta } from '@/core/insurance/meta';
import { Card, DetailRow } from '@/components/ui';

const COVER_TYPES: InsuranceType[] = ['term', 'life', 'health'];

interface CoverageSummaryProps {
  policies: InsurancePolicy[];
  totalAnnualPremium: number;
  masked: boolean;
}

export function CoverageSummary({ policies, totalAnnualPremium, masked }: CoverageSummaryProps) {
  return (
    <Card padding="sm" radius="md" className="mt-1">
      <p className="text-xs font-medium mb-2 text-secondary">Coverage summary</p>
      <div className="flex flex-col gap-1.5">
        {COVER_TYPES.map((t) => {
          const total = policies.filter((p) => p.type === t).reduce((s, p) => s + p.coverageAmount, 0);
          if (total === 0) return null;
          const m = getPolicyMeta(t);
          return (
            <DetailRow
              key={t}
              label={
                <span className="flex items-center gap-1.5">
                  <i className={`ti ${m.icon}`} style={{ fontSize: 12, color: m.color }} aria-hidden="true" />
                  {m.label} cover
                </span>
              }
              value={!masked ? formatCurrency(total) : '••••'}
            />
          );
        })}
        <DetailRow
          className="pt-1.5 mt-0.5 border-t border-theme"
          label="Total annual premium"
          value={!masked ? formatCurrency(totalAnnualPremium) : '••••'}
        />
      </div>
    </Card>
  );
}
