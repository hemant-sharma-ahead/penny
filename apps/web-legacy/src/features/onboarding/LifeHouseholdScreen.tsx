import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, LifeRow, OptionalSeg } from '@/components/ui';
import type { GoalRisk } from '@/core/db/types';
import { PATHS } from '@/router/paths';
import { useOnboardingDraft } from '@/context/OnboardingDraftContext';
import { OnboardingBack } from './OnboardingBack';

/**
 * "A bit more about you" — the same optional Life & household fields as Edit Profile, pulled forward
 * into setup so they actually get filled in (they already power the Home advisor's life-stage goal
 * suggestions, which otherwise silently degrade to just a generic Retirement goal).
 */
export function LifeHouseholdScreen() {
  const navigate = useNavigate();
  const { maritalStatus, homeOwner, riskAppetite, children: kids = [], setDraft } = useOnboardingDraft();
  const [childYear, setChildYear] = useState('');

  function addChild() {
    const yr = parseInt(childYear, 10);
    const thisYear = new Date().getFullYear();
    if (yr >= 1950 && yr <= thisYear && !kids.includes(yr)) {
      setDraft({ children: [...kids, yr].sort((a, b) => a - b) });
      setChildYear('');
    }
  }

  function skip() {
    navigate(PATHS.onboarding.addAccounts);
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.letUsKnowYou} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-6 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#6366f1' }}
          >
            <i className="ti ti-home-heart text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">A bit more about you</h2>
          <p className="text-secondary text-sm">
            Optional — unlocks personalised goals (a child's education corpus, a home fund, the right cover). Skip and
            add it later in Edit Profile any time.
          </p>
        </div>

        <div className="rounded-2xl bg-surface border border-theme px-4 mb-2">
          <LifeRow icon="ti-heart" label="Relationship">
            <OptionalSeg
              options={[
                { value: 'single', label: 'Single' },
                { value: 'married', label: 'Married' }
              ]}
              value={maritalStatus}
              onChange={(v) => setDraft({ maritalStatus: v as 'single' | 'married' | undefined })}
            />
          </LifeRow>
          <LifeRow icon="ti-home" label="Home">
            <OptionalSeg
              options={[
                { value: 'own', label: 'Own' },
                { value: 'rent', label: 'Rent' }
              ]}
              value={homeOwner === undefined ? undefined : homeOwner ? 'own' : 'rent'}
              onChange={(v) => setDraft({ homeOwner: v === undefined ? undefined : v === 'own' })}
            />
          </LifeRow>
          <LifeRow icon="ti-chart-line" label="Risk appetite">
            <OptionalSeg
              options={[
                { value: 'conservative', label: 'Low' },
                { value: 'moderate', label: 'Med' },
                { value: 'aggressive', label: 'High' }
              ]}
              value={riskAppetite}
              onChange={(v) => setDraft({ riskAppetite: v as GoalRisk | undefined })}
            />
          </LifeRow>
          <LifeRow icon="ti-baby-carriage" label="Children" alignTop>
            <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[220px]">
              {kids.map((yr, i) => (
                <span
                  key={`${yr}-${i}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-full pl-2.5 pr-1.5 py-1 bg-surface-2 text-secondary"
                >
                  {yr}
                  <button
                    type="button"
                    aria-label={`Remove ${yr}`}
                    onClick={() => setDraft({ children: kids.filter((_, idx) => idx !== i) })}
                    className="text-tertiary hover:text-danger"
                  >
                    <i className="ti ti-x" style={{ fontSize: 13 }} aria-hidden="true" />
                  </button>
                </span>
              ))}
              <input
                type="number"
                inputMode="numeric"
                value={childYear}
                onChange={(e) => setChildYear(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addChild()}
                onBlur={addChild}
                placeholder="Birth year"
                className="w-20 text-xs bg-surface-2 rounded-full px-2.5 py-1 border-none focus:outline-none"
              />
            </div>
          </LifeRow>
        </div>

        <p className="text-[10px] text-tertiary mt-1 mb-6 flex items-start gap-1 leading-relaxed">
          <i className="ti ti-device-mobile mt-0.5 flex-shrink-0" style={{ fontSize: 11 }} aria-hidden="true" />
          <span>
            Stored encrypted on your device, same as everything else here. Only ever leaves as a 5-year age band.
          </span>
        </p>

        <div className="mt-auto">
          <Button variant="primary" size="lg" fullWidth onClick={() => navigate(PATHS.onboarding.addAccounts)}>
            Continue
          </Button>
          <Button variant="ghost" size="lg" fullWidth onClick={skip}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}
