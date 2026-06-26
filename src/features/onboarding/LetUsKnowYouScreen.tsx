import { useNavigate } from 'react-router-dom';
import { Button, TextInput, OptionButton } from '@/components/ui';
import { EMPLOYMENT_OPTIONS } from '@/core/profile/employment';
import { isValidUsername } from '@/core/profile/username';
import { deriveAge } from '@/lib/date';
import { PATHS } from '@/router/paths';
import { useOnboardingDraft } from '@/context/OnboardingDraftContext';
import { OnboardingBack } from './OnboardingBack';

export function LetUsKnowYouScreen() {
  const navigate = useNavigate();
  // Drive inputs straight from the draft so going back/forward preserves everything.
  const { fullName = '', username = '', dob = '', employmentType, setDraft } = useOnboardingDraft();

  const age = dob ? deriveAge(dob) : null;
  const dobValid = age !== null && age >= 13 && age <= 120;
  const usernameValid = username === '' || isValidUsername(username);
  const canContinue = fullName.trim().length > 0 && dobValid && !!employmentType && usernameValid;

  const handleContinue = () => {
    if (canContinue) navigate(PATHS.onboarding.setupCredentials);
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.simulatedDashboard} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-6 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-user-heart text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">Let us know you</h2>
          <p className="text-secondary text-sm">
            A few details so Penny can personalise your numbers. This stays on your device.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <TextInput
            label="Full name"
            required
            value={fullName}
            onChange={(v) => setDraft({ fullName: v })}
            placeholder="e.g. Aarav Sharma"
          />

          <TextInput
            label="Username (optional)"
            value={username}
            onChange={(v) => setDraft({ username: v.toLowerCase() })}
            placeholder="e.g. aarav_s"
            error={!usernameValid ? '3–20 lowercase letters, numbers, or _' : undefined}
            hint="You'll confirm this when you set up household sharing later."
          />

          <div>
            <TextInput
              label="Date of birth"
              type="date"
              required
              value={dob}
              onChange={(v) => setDraft({ dob: v })}
              error={dob && !dobValid ? 'Enter a valid date of birth' : undefined}
            />
            <p className="text-[11px] text-tertiary mt-1 leading-relaxed">
              Used for your FIRE target, EPF/NPS projections, and the right tax slab. Only a 5-year age band is ever
              shared with Chip.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-secondary mb-1.5">
              What do you do? <span className="text-danger">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {EMPLOYMENT_OPTIONS.map((o) => (
                <OptionButton
                  key={o.value}
                  label={o.label}
                  icon={o.icon}
                  compact
                  selected={employmentType === o.value}
                  onClick={() => setDraft({ employmentType: o.value })}
                />
              ))}
            </div>
            <p className="text-[11px] text-tertiary mt-1.5">
              Tailors EPF visibility, tax deductions, and your health benchmarks.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <Button variant="primary" size="lg" fullWidth disabled={!canContinue} onClick={handleContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
