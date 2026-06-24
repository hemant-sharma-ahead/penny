import { useState } from 'react';
import { Button, TextInput, SegmentedControl, OptionButton } from '@/components/ui';
import { NPS_FUND_MANAGERS, LIFECYCLE_FUNDS } from '@/core/nps';
import type { NpsChoiceType, NpsLifecycleFund, NpsPfmKey, NpsSchemeType } from '@/core/nps';
import { NpsLifecycleDetail } from './NpsLifecycleDetail';

interface NpsFieldsProps {
  npsChoiceType: NpsChoiceType;
  setNpsChoiceType: (v: NpsChoiceType) => void;
  npsLifecycleFund: NpsLifecycleFund;
  setNpsLifecycleFund: (v: NpsLifecycleFund) => void;
  npsPfm: NpsPfmKey | '';
  setNpsPfm: (v: NpsPfmKey | '') => void;
  npsSchemeType: NpsSchemeType | '';
  setNpsSchemeType: (v: NpsSchemeType | '') => void;
  npsTier: 'tier1' | 'tier2';
  setNpsTier: (v: 'tier1' | 'tier2') => void;
  npsBirthYear: string;
  setNpsBirthYear: (v: string) => void;
  npsPran: string;
  setNpsPran: (v: string) => void;
  npsMonthly: string;
  setNpsMonthly: (v: string) => void;
  units: string;
  setUnits: (v: string) => void;
}

// NPS fields: auto (lifecycle) vs active choice, fund manager / scheme type /
// tier, plus common birth-year, PRAN and monthly contribution. Owns the
// lifecycle-schedule modal.
export function NpsFields({
  npsChoiceType,
  setNpsChoiceType,
  npsLifecycleFund,
  setNpsLifecycleFund,
  npsPfm,
  setNpsPfm,
  npsSchemeType,
  setNpsSchemeType,
  npsTier,
  setNpsTier,
  npsBirthYear,
  setNpsBirthYear,
  npsPran,
  setNpsPran,
  npsMonthly,
  setNpsMonthly,
  units,
  setUnits
}: NpsFieldsProps) {
  const [showNpsSchedule, setShowNpsSchedule] = useState(false);

  return (
    <>
      {/* Choice type toggle */}
      <div>
        <label className="text-xs font-medium text-secondary">Investment choice</label>
        <div className="mt-1">
          <SegmentedControl
            options={[
              { value: 'auto', label: 'Auto / Lifecycle' },
              { value: 'active', label: 'Active Choice' }
            ]}
            value={npsChoiceType}
            onChange={(v) => setNpsChoiceType(v as NpsChoiceType)}
          />
        </div>
      </div>

      {/* Auto Choice: lifecycle fund selector — pills + contextual description */}
      {npsChoiceType === 'auto' && (
        <div>
          <label className="text-xs font-medium text-secondary">Lifecycle fund</label>
          <div className="mt-1">
            <SegmentedControl
              options={(Object.values(LIFECYCLE_FUNDS) as (typeof LIFECYCLE_FUNDS)[keyof typeof LIFECYCLE_FUNDS][]).map(
                (fund) => ({ value: fund.key, label: fund.shortLabel, color: fund.color })
              )}
              value={npsLifecycleFund}
              onChange={(v) => setNpsLifecycleFund(v as NpsLifecycleFund)}
            />
          </div>
          {/* Selected fund description + schedule link */}
          {(() => {
            const selected = LIFECYCLE_FUNDS[npsLifecycleFund];
            return (
              <div className="mt-2 px-1">
                <p className="text-xs leading-snug" style={{ color: selected.color }}>
                  {selected.description}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 px-0 underline underline-offset-2"
                  style={{ color: 'var(--color-primary)' }}
                  onClick={() => setShowNpsSchedule(true)}
                >
                  See year-by-year allocation →
                </Button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Active Choice: fund manager + scheme type + tier + units */}
      {npsChoiceType === 'active' && (
        <>
          <div>
            <label className="text-xs font-medium text-secondary">Fund manager</label>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {NPS_FUND_MANAGERS.map((m) => (
                <OptionButton
                  key={m.key}
                  label={m.label}
                  selected={npsPfm === m.key}
                  onClick={() => setNpsPfm(npsPfm === m.key ? '' : (m.key as NpsPfmKey))}
                  compact
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-secondary">Scheme type</label>
              <div className="mt-1">
                <SegmentedControl
                  options={(['E', 'C', 'G', 'A'] as const).map((t) => ({ value: t, label: t }))}
                  value={npsSchemeType}
                  onChange={(v) => setNpsSchemeType(v as NpsSchemeType)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary">Tier</label>
              <div className="mt-1">
                <SegmentedControl
                  options={[
                    { value: 'tier1', label: 'Tier I' },
                    { value: 'tier2', label: 'Tier II' }
                  ]}
                  value={npsTier}
                  onChange={(v) => setNpsTier(v as 'tier1' | 'tier2')}
                />
              </div>
            </div>
          </div>
          <TextInput
            label="Units held"
            type="number"
            inputMode="decimal"
            placeholder="0.0000"
            value={units}
            onChange={setUnits}
            hint="NAV is auto-fetched from npsnav.in — live corpus shown on the card"
          />
        </>
      )}

      {/* Common NPS fields */}
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Birth year"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 1985"
          value={npsBirthYear}
          onChange={setNpsBirthYear}
        />
        <TextInput label="PRAN" hint="opt." placeholder="12-digit" value={npsPran} onChange={setNpsPran} />
      </div>
      {npsChoiceType === 'auto' && (
        <>
          <div>
            <label className="text-xs font-medium text-secondary">
              Fund manager <span className="font-normal text-tertiary">(optional)</span>
            </label>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {NPS_FUND_MANAGERS.map((m) => (
                <OptionButton
                  key={m.key}
                  label={m.label}
                  selected={npsPfm === m.key}
                  onClick={() => setNpsPfm(npsPfm === m.key ? '' : (m.key as NpsPfmKey))}
                  compact
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-secondary">Tier</label>
            <div className="mt-1">
              <SegmentedControl
                options={[
                  { value: 'tier1', label: 'Tier I' },
                  { value: 'tier2', label: 'Tier II' }
                ]}
                value={npsTier}
                onChange={(v) => setNpsTier(v as 'tier1' | 'tier2')}
              />
            </div>
          </div>
        </>
      )}
      <TextInput
        label="Monthly contribution (₹)"
        type="number"
        inputMode="decimal"
        placeholder="0"
        value={npsMonthly}
        onChange={setNpsMonthly}
      />

      {showNpsSchedule && (
        <NpsLifecycleDetail
          fund={npsLifecycleFund}
          birthYearStr={npsBirthYear}
          onClose={() => setShowNpsSchedule(false)}
        />
      )}
    </>
  );
}
