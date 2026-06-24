import { useState } from 'react';
import type { Liability } from '@/core/db/types';
import { formatCurrency, formatMonthsDuration } from '@/lib/formatters';
import { deriveTenureMonths } from '@/core/loans/amortization';
import { getLoanMeta } from '@/core/loans/meta';
import { Card, Button, EmptyState, DetailRow, Badge } from '@/components/ui';
import { ListRow } from '@/components/shared';
import { AddLoanModal } from './AddLoanModal';

interface MyLoansTabProps {
  emiLoans: Liability[];
  mode: 'open' | 'safe' | 'privacy';
  saveLiability: (l: Liability) => Promise<unknown>;
  onPlanLoan: (l: Liability) => void;
}

function estimatedMonthsLeft(l: Liability): number | null {
  if (l.emiAmount) return deriveTenureMonths(l.outstandingAmount, l.interestRate, l.emiAmount);
  if (l.endDate) return Math.max(0, Math.round((l.endDate - Date.now()) / (30.44 * 24 * 60 * 60 * 1000)));
  return null;
}

export function MyLoansTab({ emiLoans, mode, saveLiability, onPlanLoan }: MyLoansTabProps) {
  const [showAddLoan, setShowAddLoan] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {emiLoans.length === 0 ? (
        <div className="py-8">
          <EmptyState
            icon="ti-building-bank"
            title="No loans tracked yet"
            description="Track your home, car, or personal loans to plan repayment."
            action={{ label: 'Add Loan', onClick: () => setShowAddLoan(true), icon: 'ti-plus' }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="secondary" fullWidth icon="ti-plus" onClick={() => setShowAddLoan(true)}>
            Add Loan
          </Button>
          {emiLoans.map((l) => {
            const meta = getLoanMeta(l.type);
            const monthsLeft = estimatedMonthsLeft(l);
            return (
              <Card key={l.id}>
                <ListRow
                  icon={meta.icon}
                  iconColor={meta.color}
                  iconSize="sm"
                  title={<p className="text-sm font-semibold text-primary leading-tight">{l.name}</p>}
                  subtitle={l.lenderName ? <p className="text-xs text-tertiary">{l.lenderName}</p> : undefined}
                  right={<Badge label={meta.label} color={meta.color} size="sm" rounded="md" />}
                />

                <div className="flex flex-col gap-1.5 mt-3">
                  <DetailRow
                    label="Outstanding"
                    value={mode === 'open' ? formatCurrency(l.outstandingAmount) : '••••'}
                    size="md"
                  />
                  {l.emiAmount && (
                    <DetailRow
                      label="EMI / month"
                      value={mode === 'open' ? formatCurrency(l.emiAmount) : '••••'}
                      size="md"
                    />
                  )}
                  <DetailRow label="Rate" value={`${l.interestRate}% p.a.`} size="md" />
                </div>

                {monthsLeft !== null && (
                  <DetailRow className="mt-2" label="Estimated remaining" value={formatMonthsDuration(monthsLeft)} />
                )}

                <Button
                  variant="secondary"
                  fullWidth
                  icon="ti-calculator"
                  className="mt-3"
                  onClick={() => onPlanLoan(l)}
                >
                  Plan this loan
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {showAddLoan && <AddLoanModal saveLiability={saveLiability} onClose={() => setShowAddLoan(false)} />}
    </div>
  );
}
