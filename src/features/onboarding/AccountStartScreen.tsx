import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { OnboardingBack } from './OnboardingBack';
import type { AccountTab } from './AccountRecoveryScreen';

/**
 * Screen A of the account-start flow (Track F). Opens on the Preview Dashboard's "Set up my account".
 * Three plain doors — new / restore / reclaim — each honest about what it recovers. Tapping a card opens
 * Screen B (AccountRecoveryScreen) with that tab pre-selected, so the user can still switch between them.
 */
interface Choice {
  tab: AccountTab;
  icon: string;
  tone: 'green' | 'indigo' | 'amber';
  title: string;
  detail: string;
}

const CHOICES: Choice[] = [
  {
    tab: 'new',
    icon: 'ti-sparkles',
    tone: 'green',
    title: 'Start fresh',
    detail: 'New to Penny — or starting over after erasing, with nothing to restore. Sets up a brand-new account.'
  },
  {
    tab: 'restore',
    icon: 'ti-cloud-download',
    tone: 'indigo',
    title: 'Restore from backup',
    detail:
      'Reinstalled or erased but have a backup? Bring back your data, groups & handle from Drive, iCloud, or a file. Needs your passphrase.'
  },
  {
    tab: 'reclaim',
    icon: 'ti-id-badge-2',
    tone: 'amber',
    title: 'Reclaim my handle',
    detail:
      'No backup? Recover your username with your passphrase. Handle & groups return; personal data needs a backup.'
  }
];

const TONE: Record<Choice['tone'], { bg: string; fg: string }> = {
  green: { bg: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', fg: 'var(--color-primary)' },
  indigo: { bg: 'color-mix(in srgb, #6366f1 12%, transparent)', fg: '#6366f1' },
  amber: { bg: 'color-mix(in srgb, var(--color-warning) 16%, transparent)', fg: 'var(--color-warning)' }
};

export function AccountStartScreen() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.simulatedDashboard} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-user-shield text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">How would you like to start?</h2>
          <p className="text-sm text-secondary">
            New to Penny, or coming back after a reinstall, a new device, or erasing your data?
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {CHOICES.map((c) => (
            <button
              key={c.tab}
              type="button"
              onClick={() => navigate(PATHS.onboarding.account, { state: { tab: c.tab } })}
              className="flex items-start gap-3 text-left bg-surface border border-theme rounded-2xl p-4 hover:border-[var(--color-primary)]"
            >
              <span
                className="w-11 h-11 rounded-xl grid place-items-center flex-shrink-0"
                style={{ backgroundColor: TONE[c.tone].bg, color: TONE[c.tone].fg }}
              >
                <i className={`ti ${c.icon}`} style={{ fontSize: 22 }} aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-bold text-primary">{c.title}</span>
                <span className="block text-xs text-secondary leading-relaxed mt-0.5">{c.detail}</span>
              </span>
              <i
                className="ti ti-chevron-right text-tertiary self-center"
                style={{ fontSize: 18 }}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
