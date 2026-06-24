import type { InsurancePolicy } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { getPolicyMeta } from '@/core/insurance/meta';
import { Card } from '@/components/ui';
import { ListRow, DueDateBadge } from '@/components/shared';

interface PolicyCardProps {
  policy: InsurancePolicy;
  mode: 'open' | 'safe' | 'privacy';
  onEdit: (p: InsurancePolicy) => void;
}

export function PolicyCard({ policy, mode, onEdit }: PolicyCardProps) {
  const meta = getPolicyMeta(policy.type);

  return (
    <Card onClick={() => onEdit(policy)}>
      <ListRow
        icon={meta.icon}
        iconColor={meta.color}
        title={
          <>
            <p className="text-sm font-semibold truncate text-primary">{policy.insurer}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: meta.color }}
              >
                {meta.label}
              </span>
              {policy.policyNumber && <span className="text-[10px] text-tertiary">{policy.policyNumber}</span>}
            </div>
          </>
        }
        subtitle={
          <div className="flex items-center gap-3 mt-1.5">
            <div>
              <p className="text-[10px] text-tertiary">Coverage</p>
              <p className="text-xs font-semibold text-primary">
                {mode === 'open' ? formatCurrency(policy.coverageAmount) : '••••'}
              </p>
            </div>
            <div className="w-px h-6 border-r border-theme" />
            <div>
              <p className="text-[10px] text-tertiary">Premium / yr</p>
              <p className="text-xs font-semibold text-primary">
                {mode === 'open' ? formatCurrency(policy.annualPremium) : '••••'}
              </p>
            </div>
            {policy.nominees && (
              <>
                <div className="w-px h-6 border-r border-theme" />
                <div className="min-w-0">
                  <p className="text-[10px] text-tertiary">Nominee</p>
                  <p className="text-xs truncate text-secondary">{policy.nominees}</p>
                </div>
              </>
            )}
          </div>
        }
        right={
          <DueDateBadge
            dueDateMs={policy.renewalDate}
            nowMs={new Date().setHours(0, 0, 0, 0)}
            warningDays={7}
            expiredLabel="Expired"
          />
        }
      />
    </Card>
  );
}
