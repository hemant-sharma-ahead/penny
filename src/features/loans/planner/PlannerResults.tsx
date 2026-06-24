import { formatCurrency, formatMonthsDuration } from '@/lib/formatters';
import { buildLoanPlanExport } from '@/core/loans/planExport';
import { Card, Button, SectionLabel } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
import type { usePlanner } from './usePlanner';

interface CompareRowProps {
  label: string;
  original: string;
  withPlan: string;
  saving?: boolean;
}
function CompareRow({ label, original, withPlan, saving }: CompareRowProps) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-theme last:border-0">
      <span className="flex-1 text-xs text-secondary">{label}</span>
      <span className="w-24 text-right text-xs font-medium text-primary">{original}</span>
      <span
        className="w-24 text-right text-xs font-semibold"
        style={{ color: saving ? STATUS.success : 'var(--color-primary)' }}
      >
        {withPlan}
      </span>
    </div>
  );
}

interface PlannerResultsProps {
  planner: ReturnType<typeof usePlanner>;
  mode: 'open' | 'safe' | 'privacy';
}

export function PlannerResults({ planner, mode }: PlannerResultsProps) {
  const { planParams, baseline, result, interestSaved, monthsSaved, hasAccelerators } = planner;
  const masked = mode !== 'open';

  async function downloadXlsx() {
    if (result.rows.length === 0) return;
    // Lazy-load xlsx (~hundreds of KB) only when the user actually exports.
    const { utils, writeFile } = await import('xlsx');
    const data = buildLoanPlanExport(planParams, baseline, result, interestSaved, monthsSaved);

    const wb = utils.book_new();
    const ws1 = utils.aoa_to_sheet(data.summaryRows);
    utils.book_append_sheet(wb, ws1, 'Summary');

    const ws2 = utils.aoa_to_sheet([data.scheduleHeader, ...data.scheduleRows]);
    ws2['!cols'] = data.scheduleColWidths.map((wch) => ({ wch }));
    utils.book_append_sheet(wb, ws2, 'Schedule');

    writeFile(wb, data.filename);
  }

  return (
    <>
      {/* Summary card */}
      <div>
        <SectionLabel>Summary</SectionLabel>
        <Card>
          <div className="flex items-center gap-2 pb-1.5 mb-0.5">
            <span className="flex-1" />
            <span className="w-24 text-right text-[10px] font-semibold text-tertiary uppercase">Original</span>
            <span className="w-24 text-right text-[10px] font-semibold text-tertiary uppercase">With plan</span>
          </div>
          <CompareRow
            label="Tenure"
            original={formatMonthsDuration(baseline.actualTenureMonths)}
            withPlan={formatMonthsDuration(result.actualTenureMonths)}
          />
          <CompareRow
            label="Total interest"
            original={masked ? '••••' : formatCurrency(baseline.totalInterest)}
            withPlan={masked ? '••••' : formatCurrency(result.totalInterest)}
          />
          <CompareRow
            label="Total paid"
            original={masked ? '••••' : formatCurrency(baseline.totalEmiPaid)}
            withPlan={masked ? '••••' : formatCurrency(result.totalEmiPaid + result.totalPrepayment)}
          />
          {result.totalPrepayment > 0 && (
            <CompareRow
              label="Total prepayment"
              original="—"
              withPlan={masked ? '••••' : formatCurrency(result.totalPrepayment)}
            />
          )}
          {hasAccelerators && (
            <>
              <CompareRow
                label="Interest saved"
                original="—"
                withPlan={masked ? '••••' : formatCurrency(interestSaved)}
                saving
              />
              <CompareRow label="Months saved" original="—" withPlan={formatMonthsDuration(monthsSaved)} saving />
            </>
          )}

          <Button variant="primary" fullWidth onClick={downloadXlsx} icon="ti-table-down" className="mt-4">
            Download XLSX
          </Button>
        </Card>
      </div>

      {/* Amortization table */}
      <div>
        <SectionLabel>Amortization Schedule</SectionLabel>
        <div className="surface rounded-2xl overflow-hidden">
          <div
            className="grid text-[10px] font-semibold text-tertiary uppercase px-3 py-2 border-b border-theme bg-surface-2"
            style={{ gridTemplateColumns: '2rem 4.5rem 1fr 1fr 1fr 1fr' }}
          >
            <span>#</span>
            <span>Date</span>
            <span className="text-right">EMI</span>
            <span className="text-right">Principal</span>
            <span className="text-right">Interest</span>
            <span className="text-right">Balance</span>
          </div>

          {result.rows.map((r) => (
            <div key={r.month}>
              <div
                className="grid text-xs px-3 py-2 border-b border-theme last:border-0"
                style={{
                  gridTemplateColumns: '2rem 4.5rem 1fr 1fr 1fr 1fr',
                  backgroundColor: r.prepayment > 0 ? 'var(--color-surface-secondary)' : undefined
                }}
              >
                <span className="text-tertiary">{r.month}</span>
                <span className="text-tertiary truncate">{r.date}</span>
                <span className="text-right text-primary font-medium">{masked ? '••' : formatCurrency(r.emi)}</span>
                <span className="text-right text-secondary">{masked ? '••' : formatCurrency(r.principal)}</span>
                <span className="text-right" style={{ color: STATUS.danger }}>
                  {masked ? '••' : formatCurrency(r.interest)}
                </span>
                <span className="text-right text-primary">{masked ? '••' : formatCurrency(r.closingBalance)}</span>
              </div>
              {r.prepayment > 0 && (
                <div
                  className="flex items-center justify-between px-3 py-1 border-b border-theme"
                  style={{ backgroundColor: 'var(--color-surface-secondary)' }}
                >
                  <span className="text-[10px] font-medium" style={{ color: STATUS.success }}>
                    <i className="ti ti-arrow-down-circle mr-1" style={{ fontSize: 11 }} aria-hidden="true" />
                    Prepayment
                  </span>
                  <span className="text-[10px] font-semibold" style={{ color: STATUS.success }}>
                    {masked ? '••••' : `− ${formatCurrency(r.prepayment)}`}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
