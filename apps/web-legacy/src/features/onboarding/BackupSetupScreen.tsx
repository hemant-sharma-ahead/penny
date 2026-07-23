import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { getProvider } from '@/core/sync/providers';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { PATHS } from '@/router/paths';
import { useOnboardingDraft, type BackupChoice } from '@/context/OnboardingDraftContext';
import { OnboardingBack } from './OnboardingBack';

interface Option {
  value: BackupChoice;
  icon: string;
  title: string;
  detail: string;
  disabled?: boolean;
}

/**
 * Surfaced during setup (not just as a later nudge) because Model B means a lost device with no
 * backup is unrecoverable, by design — this is the single most consequential thing to get across.
 * Only records the choice here; the live Google Drive connect flow itself runs post-setup on the real
 * Backup page (SyncProvider isn't mounted this early) — SetupCredentialsScreen routes there next if
 * "Google Drive" was picked.
 */
export function BackupSetupScreen() {
  const navigate = useNavigate();
  const { backupChoice, setDraft } = useOnboardingDraft();

  const driveAvailable = hasEntitlement('cloud_backup') && getProvider('google-drive').isAvailable();
  const icloudAvailable = getProvider('icloud').isAvailable();

  const options: Option[] = [
    {
      value: 'local',
      icon: 'ti-device-mobile',
      title: 'This device only',
      detail: 'No off-device copy — a lost phone means lost data.'
    },
    {
      value: 'google-drive',
      icon: 'ti-brand-google-drive',
      title: 'Google Drive',
      detail: driveAvailable
        ? "Encrypted before it leaves your device — Penny can't read it either."
        : 'Google Drive activates once configured for this build.',
      disabled: !driveAvailable
    },
    {
      value: 'icloud',
      icon: 'ti-brand-apple',
      title: 'iCloud',
      detail: icloudAvailable
        ? 'Encrypted, synced via your iCloud account.'
        : 'Available in the Penny app (native) — coming soon.',
      disabled: !icloudAvailable
    }
  ];

  const selected: BackupChoice = backupChoice ?? 'google-drive';

  function handleContinue() {
    setDraft({ backupChoice: selected });
    navigate(PATHS.onboarding.setupCredentials);
  }

  function skip() {
    setDraft({ backupChoice: 'skip' });
    navigate(PATHS.onboarding.setupCredentials);
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.addAccounts} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-6 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-warning)' }}
          >
            <i className="ti ti-cloud-lock text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">Back up your data</h2>
          <p className="text-secondary text-sm">
            Your data lives only on this device unless you back it up. Takes a minute — you can change this any time in
            Settings.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 mb-4">
          {options.map((o) => {
            const isSelected = selected === o.value;
            return (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onClick={() => setDraft({ backupChoice: o.value })}
                className={`flex items-center gap-3 text-left rounded-2xl border p-3.5 disabled:opacity-55 ${
                  isSelected ? 'border-[var(--color-primary)]' : 'border-theme'
                }`}
                style={
                  isSelected
                    ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)' }
                    : undefined
                }
              >
                <span className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center flex-shrink-0">
                  <i className={`ti ${o.icon} text-secondary`} style={{ fontSize: 16 }} aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-primary">{o.title}</span>
                  <span className="block text-[11px] text-tertiary leading-relaxed mt-0.5">{o.detail}</span>
                </span>
                <span
                  className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                  style={
                    isSelected
                      ? {
                          borderColor: 'var(--color-primary)',
                          backgroundColor: 'var(--color-primary)',
                          boxShadow: 'inset 0 0 0 3px #fff'
                        }
                      : { borderColor: 'var(--color-border)' }
                  }
                />
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-tertiary mb-6 flex items-start gap-1 leading-relaxed">
          <i
            className="ti ti-cloud-lock mt-0.5 flex-shrink-0"
            style={{ fontSize: 11, color: 'var(--color-info)' }}
            aria-hidden="true"
          />
          <span>
            Optional — goes to your own Google Drive or iCloud, still fully encrypted. We never hold a copy ourselves,
            either way.
          </span>
        </p>

        <div className="mt-auto flex flex-col gap-2.5">
          <Button variant="primary" size="lg" fullWidth onClick={handleContinue}>
            {selected === 'local' ? 'Continue' : `Continue with ${selected === 'google-drive' ? 'Drive' : 'iCloud'}`}
          </Button>
          <Button variant="ghost" size="lg" fullWidth onClick={skip}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}
