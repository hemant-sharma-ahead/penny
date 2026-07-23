import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, TextInput, OptionButton } from '@/components/ui';
import { EMPLOYMENT_OPTIONS } from '@/core/profile/employment';
import { isValidUsername } from '@/core/profile/username';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { checkUsername } from '@/core/identity/claim';
import { deriveAge } from '@/lib/date';
import { PATHS } from '@/router/paths';
import { useOnboardingDraft } from '@/context/OnboardingDraftContext';
import { OnboardingBack } from './OnboardingBack';

/** A short "where this lives" caption, same visual language as the existing "why we ask" captions —
 *  broad promise lives on the Privacy Promise screen; this is the specific, per-field reinforcement. */
function WhereCaption({ icon, color, children }: { icon: string; color: string; children: string }) {
  return (
    <p className="text-[10px] text-tertiary mt-1 flex items-start gap-1 leading-relaxed">
      <i className={`ti ${icon} mt-0.5 flex-shrink-0`} style={{ fontSize: 11, color }} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function LetUsKnowYouScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  // Drive inputs straight from the draft so going back/forward preserves everything.
  const { fullName = '', username = '', dob = '', employmentType, setDraft } = useOnboardingDraft();

  // Reached either fresh (Account Start → "Start fresh") or via "Exit Demo Mode" — in the latter case an
  // unlocked demo vault already exists, so the final step re-keys it instead of calling initialize() fresh.
  const cameFromDemoExit = !!(location.state as { fromDemoMode?: boolean } | null)?.fromDemoMode;
  useEffect(() => {
    if (cameFromDemoExit) setDraft({ fromDemoMode: true });
  }, [cameFromDemoExit, setDraft]);

  // On sync builds the username is the account handle (recovery anchor + sharing), so it's mandatory and
  // gets claimed at vault setup — so we check availability here to avoid a taken handle failing the claim.
  // On Phase-1-only builds it's cosmetic and stays optional.
  const usernameRequired = hasEntitlement('sync');
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const age = dob ? deriveAge(dob) : null;
  const dobValid = age !== null && age >= 13 && age <= 120;
  const usernameFilled = username.trim().length > 0;
  const usernameValid = usernameRequired ? isValidUsername(username) : username === '' || isValidUsername(username);
  // Allow 'idle' (e.g. offline — the claim is best-effort) but block a known-taken or mid-check handle.
  const usernameOk = usernameValid && (!usernameRequired || (availability !== 'taken' && availability !== 'checking'));
  const canContinue = fullName.trim().length > 0 && dobValid && !!employmentType && usernameOk;

  // Debounced availability check (sync builds). State is only set inside the timeout / onChange.
  useEffect(() => {
    if (!usernameRequired || !isValidUsername(username)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setAvailability('checking');
      void checkUsername(username)
        .then((r) => !cancelled && setAvailability(r.available ? 'available' : 'taken'))
        .catch(() => !cancelled && setAvailability('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, usernameRequired]);

  const handleContinue = () => {
    if (canContinue) navigate(PATHS.onboarding.lifeHousehold);
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
          <div>
            <TextInput
              label="Full name"
              required
              value={fullName}
              onChange={(v) => setDraft({ fullName: v })}
              placeholder="e.g. Aarav Sharma"
            />
            <WhereCaption icon="ti-device-mobile" color="var(--color-primary)">
              Stays on this device, encrypted — never sent to our servers.
            </WhereCaption>
          </div>

          <div>
            <TextInput
              label={usernameRequired ? 'Username' : 'Username (optional)'}
              required={usernameRequired}
              value={username}
              onChange={(v) => {
                setDraft({ username: v.toLowerCase() });
                setAvailability('idle');
              }}
              placeholder="e.g. aarav_s"
              error={
                usernameFilled && !usernameValid
                  ? '3–20 lowercase letters, numbers, or _'
                  : usernameRequired && availability === 'taken'
                    ? 'That handle is taken — try another'
                    : undefined
              }
              hint={
                usernameRequired
                  ? availability === 'checking'
                    ? 'Checking availability…'
                    : availability === 'available'
                      ? '✓ Available'
                      : 'Your unique handle — how others find you for sharing, and how you recover your account.'
                  : "You'll confirm this when you set up household sharing later."
              }
            />
            <WhereCaption icon="ti-world" color="var(--color-warning)">
              Public — how others find you for sharing, and how you recover your account.
            </WhereCaption>
          </div>

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
            <WhereCaption icon="ti-device-mobile" color="var(--color-primary)">
              Encrypted on-device. Only ever leaves as a 5-year age band.
            </WhereCaption>
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
            <WhereCaption icon="ti-device-mobile" color="var(--color-primary)">
              Stays on this device, encrypted — never sent to our servers.
            </WhereCaption>
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
