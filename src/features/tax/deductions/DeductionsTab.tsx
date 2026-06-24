import { DetailRow } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { LIMITS } from '@/core/tax/calculator';
import type { TaxSummary } from '@/core/tax/calculator';
import { DeductionBar } from './DeductionBar';
import { ManualInput } from './ManualInput';
import type { useTaxDeductions } from './useTaxDeductions';

interface DeductionsTabProps {
  summary: TaxSummary;
  deductions: ReturnType<typeof useTaxDeductions>;
}

export function DeductionsTab({ summary, deductions }: DeductionsTabProps) {
  const { sec24B } = summary;
  const { total80C, npsAmount, total80D } = deductions;

  return (
    <>
      {/* 80C */}
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <div>
          <p className="text-sm font-semibold text-primary">Section 80C</p>
          <p className="text-xs text-tertiary">Tax-saving investments (max ₹1,50,000)</p>
        </div>

        <DeductionBar used={total80C} limit={LIMITS.SEC_80C} label="80C utilisation" />

        {summary.inferred80C.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">From your data</p>
            {summary.inferred80C.map((item) => (
              <DetailRow
                key={item.label}
                label={
                  <span className="flex items-center gap-1">
                    <i className="ti ti-check text-emerald-500" style={{ fontSize: 11 }} aria-hidden="true" />
                    {item.label}
                  </span>
                }
                value={formatCurrency(item.amount)}
                size="md"
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Add your investments</p>
          <ManualInput label="PPF contribution" value={deductions.ppf} onChange={deductions.setPpf} />
          <ManualInput label="ELSS mutual funds" value={deductions.elss} onChange={deductions.setElss} />
          <ManualInput label="NPS (80C portion)" value={deductions.nps} onChange={deductions.setNps} />
          <ManualInput
            label="Other (ULIP, NSC, SSY, etc.)"
            value={deductions.other80C}
            onChange={deductions.setOther80C}
          />
        </div>
      </div>

      {/* NPS 80CCD(1B) additional */}
      {npsAmount > 0 && (
        <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4 flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">Section 80CCD(1B) — NPS bonus</p>
            <p className="text-xs text-tertiary">Additional ₹50,000 over 80C limit</p>
          </div>
          <DeductionBar used={Math.min(npsAmount, LIMITS.NPS_80CCD_1B)} limit={LIMITS.NPS_80CCD_1B} label="80CCD(1B)" />
        </div>
      )}

      {/* 80D */}
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <div>
          <p className="text-sm font-semibold text-primary">Section 80D</p>
          <p className="text-xs text-tertiary">Health insurance premiums (max ₹25,000 self + ₹25,000 parents)</p>
        </div>

        <DeductionBar used={total80D.self} limit={LIMITS.SEC_80D_SELF} label="Self & family" />

        {summary.inferred80DAmount > 0 && (
          <DetailRow
            label={
              <span className="flex items-center gap-1">
                <i className="ti ti-check text-emerald-500" style={{ fontSize: 11 }} aria-hidden="true" />
                Health insurance premium
              </span>
            }
            value={formatCurrency(summary.inferred80DAmount)}
            size="md"
          />
        )}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-2 text-tertiary">Parents</p>
          <DeductionBar used={total80D.parents} limit={LIMITS.SEC_80D_PARENTS} label="Parents' health insurance" />
          <div className="mt-2">
            <ManualInput
              label="Parents' health premium"
              value={deductions.parentsPremium}
              onChange={deductions.setParentsPremium}
            />
          </div>
        </div>
      </div>

      {/* 24B */}
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <div>
          <p className="text-sm font-semibold text-primary">Section 24B</p>
          <p className="text-xs text-tertiary">Home loan interest deduction (max ₹2,00,000)</p>
        </div>

        {sec24B.hasHomeLoan ? (
          <>
            <DeductionBar
              used={Math.min(sec24B.annualInterest, LIMITS.SEC_24B)}
              limit={LIMITS.SEC_24B}
              label="Home loan interest"
            />
            <p className="text-xs text-secondary">
              Estimated annual interest: {formatCurrency(sec24B.annualInterest)}
              {sec24B.annualInterest > LIMITS.SEC_24B && (
                <span className="text-amber-600"> (capped at ₹2L for self-occupied property)</span>
              )}
            </p>
          </>
        ) : (
          <p className="text-sm text-tertiary">
            No home loan found. Add one under Liabilities to track this deduction.
          </p>
        )}
      </div>

      {/* Old vs New regime note */}
      <div className="rounded-2xl p-4 bg-surface-2 border border-theme">
        <p className="text-xs font-semibold mb-1 text-secondary">Old vs. New Regime</p>
        <p className="text-xs leading-relaxed text-secondary">
          Deductions (80C/80D/24B) apply under the <strong>old tax regime</strong>. Under the new regime these are
          unavailable but slab rates are lower. Compare both before filing — this tool covers old-regime deductions
          only.
        </p>
      </div>
    </>
  );
}
