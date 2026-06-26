import { useMemo, useState } from 'react';
import { Card, StatBox, Banner, SectionLabel, ProgressBar, Toggle, Badge } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import type { Profile } from '@/core/db/types';
import type { TaxSummary } from '@/core/tax/calculator';
import { compareTaxRegimes, CURRENT_FY_CONFIG } from '@/core/calculators/taxRegime';
import { optimizeDirectTax, DONATION_TIERS, DEDUCTION_LIMITS } from '@/core/tax/optimizer';
import { suggestITR, ITR5_NOTE, HUF_ELIGIBILITY, type ITRAnswers } from '@/core/tax/itrAdvisor';
import type { useTaxDeductions } from '../deductions/useTaxDeductions';

interface Props {
  summary: TaxSummary;
  deductions: ReturnType<typeof useTaxDeductions>;
  profile: Profile | null;
  gross: number;
}

function Slider({
  label,
  value,
  max,
  onChange
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className="font-semibold text-primary tabular-nums">{formatCurrency(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={5000}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: 'var(--color-primary)' }}
      />
    </div>
  );
}

export function OptimizeTab({ summary, deductions, profile, gross }: Props) {
  const isSalaried = profile?.employmentType === 'salaried';
  const used80C = deductions.total80C;
  const used80D = deductions.total80D.self + deductions.total80D.parents;
  const usedNps = deductions.npsAmount;
  const homeLoanInterest = summary.sec24B.annualInterest;

  const opt = useMemo(
    () =>
      optimizeDirectTax({
        grossIncome: gross,
        isSalaried,
        used80C,
        used80D,
        usedNps,
        homeLoanInterest,
        hraExemption: 0,
        fyConfig: CURRENT_FY_CONFIG
      }),
    [gross, isSalaried, used80C, used80D, usedNps, homeLoanInterest]
  );

  // What-if simulator state, seeded from actuals.
  const [s80c, setS80c] = useState(Math.min(used80C, DEDUCTION_LIMITS.SEC_80C));
  const [s80d, setS80d] = useState(Math.min(used80D, DEDUCTION_LIMITS.SEC_80D));
  const [sNps, setSNps] = useState(Math.min(usedNps, DEDUCTION_LIMITS.NPS_80CCD_1B));

  const whatIf = useMemo(
    () =>
      compareTaxRegimes(
        {
          grossIncome: gross,
          isSalaried,
          deduction80C: s80c,
          deduction80D: s80d,
          homeLoanInterest,
          nps80ccd1b: sNps,
          hraExemption: 0,
          otherDeductions: 0
        },
        CURRENT_FY_CONFIG
      ),
    [gross, isSalaried, s80c, s80d, sNps, homeLoanInterest]
  );

  // ITR helper state.
  const [itr, setItr] = useState<ITRAnswers>({
    isHUF: false,
    hasBusinessOrProfession: false,
    isPresumptive: false,
    hasCapitalGains: summary.capGains.length > 0,
    multipleHouseProperties: false,
    incomeAbove50L: gross > 50_00_000,
    foreignAssetsOrIncome: false
  });
  const itrResult = suggestITR(itr);

  if (gross <= 0) {
    return (
      <Banner variant="info" icon="ti-bulb">
        Add your income (on the Footprint tab) to get personalised tax-saving suggestions, a regime recommendation, and
        an ITR-form pointer.
      </Banner>
    );
  }

  return (
    <>
      {/* Regime recommendation */}
      <Card className="flex flex-col gap-3">
        <SectionLabel className="">Best regime for you</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <StatBox
            tone={opt.recommendedRegime === 'new' ? 'info' : 'success'}
            label="Recommended"
            value={opt.recommendedRegime === 'new' ? 'New regime' : 'Old regime'}
          />
          <StatBox label="Saves vs the other" value={formatCurrency(Math.round(opt.regimeSaving))} sub="per year" />
        </div>
        {opt.notes.map((n) => (
          <Banner key={n} variant="info" icon="ti-info-circle">
            {n}
          </Banner>
        ))}
      </Card>

      {/* Deduction headroom */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionLabel className="">Deduction headroom</SectionLabel>
          {opt.deductionsHelp && opt.totalPotentialSaving > 0 && (
            <Badge label={`Save up to ${formatCurrency(opt.totalPotentialSaving)}`} color={STATUS.success} size="sm" />
          )}
        </div>
        {opt.headroom.map((h) => (
          <div key={h.section} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-primary font-medium">
                {h.section} · {formatCurrency(h.used)} / {formatCurrency(h.limit)}
              </span>
              {h.remaining > 0 ? (
                <span className="text-secondary">
                  {formatCurrency(h.remaining)} left
                  {h.potentialSaving > 0 && (
                    <span style={{ color: STATUS.success }}> · save {formatCurrency(h.potentialSaving)}</span>
                  )}
                </span>
              ) : (
                <span style={{ color: STATUS.success }}>Maxed ✓</span>
              )}
            </div>
            <ProgressBar value={h.limit > 0 ? (h.used / h.limit) * 100 : 0} />
            <span className="text-[10px] text-tertiary">{h.label}</span>
          </div>
        ))}
        {!opt.deductionsHelp && (
          <p className="text-[11px] text-tertiary">
            Marginal rate {formatPercent(opt.marginalRatePct)} — but you're on the new regime, so these don't reduce tax
            unless you switch.
          </p>
        )}
      </Card>

      {/* What-if simulator */}
      <Card className="flex flex-col gap-3">
        <SectionLabel className="">What if I invest more?</SectionLabel>
        <Slider label="80C (PPF/ELSS/EPF…)" value={s80c} max={DEDUCTION_LIMITS.SEC_80C} onChange={setS80c} />
        <Slider label="80D (health insurance)" value={s80d} max={DEDUCTION_LIMITS.SEC_80D} onChange={setS80d} />
        <Slider label="80CCD(1B) (extra NPS)" value={sNps} max={DEDUCTION_LIMITS.NPS_80CCD_1B} onChange={setSNps} />
        <div className="grid grid-cols-2 gap-3 pt-1">
          <StatBox size="sm" label="Old regime tax" value={formatCurrency(Math.round(whatIf?.old.totalTax ?? 0))} />
          <StatBox
            size="sm"
            label="New regime tax"
            value={whatIf?.new ? formatCurrency(Math.round(whatIf.new.totalTax)) : '—'}
          />
        </div>
        <Banner variant="success" icon="ti-coin">
          With these deductions, the <strong>{whatIf?.recommended === 'new' ? 'new' : 'old'} regime</strong> is cheaper
          {whatIf && whatIf.savings > 0 ? ` by ${formatCurrency(Math.round(whatIf.savings))}/yr` : ''}.
        </Banner>
      </Card>

      {/* 80G donations */}
      <Card className="flex flex-col gap-2">
        <SectionLabel className="">Donations (80G)</SectionLabel>
        <p className="text-[11px] text-secondary">
          Donations are deductible at 100% or 50%, some capped at 10% of adjusted gross income. Old regime only.
        </p>
        {DONATION_TIERS.map((t, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-t border-theme first:border-0">
            <span className="text-[11px] text-secondary">{t.examples}</span>
            <div className="flex flex-col items-end whitespace-nowrap">
              <Badge label={t.rate} color={t.rate === '100%' ? STATUS.success : STATUS.info} size="sm" />
              {t.limited && <span className="text-[9px] text-tertiary mt-0.5">10% GTI cap</span>}
            </div>
          </div>
        ))}
      </Card>

      {/* ITR helper */}
      <Card className="flex flex-col gap-3">
        <SectionLabel className="">Which ITR form?</SectionLabel>
        {(
          [
            ['hasBusinessOrProfession', 'Business / professional income'],
            ['isPresumptive', 'Using presumptive scheme (44AD/ADA)'],
            ['hasCapitalGains', 'Capital gains (stocks, property, gold)'],
            ['multipleHouseProperties', 'More than one house property'],
            ['incomeAbove50L', 'Total income above ₹50L'],
            ['foreignAssetsOrIncome', 'Foreign assets or income'],
            ['isHUF', 'Filing as a HUF']
          ] as [keyof ITRAnswers, string][]
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-secondary">{label}</span>
            <Toggle value={itr[key]} onChange={(v) => setItr((prev) => ({ ...prev, [key]: v }))} />
          </div>
        ))}
        <div className="rounded-xl p-3 bg-surface-2 border border-theme flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-primary">{itrResult.form}</span>
          </div>
          <p className="text-[11px] text-secondary">{itrResult.why}</p>
          <p className="text-[10px] text-tertiary">Can report: {itrResult.claimable.join(' · ')}</p>
        </div>
        <p className="text-[10px] text-tertiary">{ITR5_NOTE}</p>
      </Card>

      {/* HUF eligibility */}
      <Card className="flex flex-col gap-2">
        <SectionLabel className="">{HUF_ELIGIBILITY.title}</SectionLabel>
        <ul className="flex flex-col gap-1.5">
          {HUF_ELIGIBILITY.points.map((p) => (
            <li key={p} className="flex gap-2 text-[11px] text-secondary leading-relaxed">
              <i
                className="ti ti-point-filled flex-shrink-0 mt-0.5"
                style={{ fontSize: 12, color: STATUS.info }}
                aria-hidden="true"
              />
              {p}
            </li>
          ))}
        </ul>
        <Banner variant="success" icon="ti-users-group">
          {HUF_ELIGIBILITY.benefit}
        </Banner>
      </Card>

      {/* ITR upload — coming soon */}
      <Banner variant="info" icon="ti-file-upload">
        <strong>Coming soon:</strong> upload last year's ITR to get an automatic review of what you could have saved.
        For now, the suggestions above use your Penny data.
      </Banner>

      <div className="rounded-xl p-3 bg-surface-2 border border-theme">
        <p className="text-[10px] leading-relaxed text-tertiary">
          <strong>Note:</strong> Planning estimates, not filing advice. Saving figures assume the old regime and your
          marginal slab. Confirm eligibility and limits with a CA.
        </p>
      </div>
    </>
  );
}
