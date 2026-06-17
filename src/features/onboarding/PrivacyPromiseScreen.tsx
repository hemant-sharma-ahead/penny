import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { ALLOWED_DOMAINS } from '@/core/ai-safety/piiScanner';

const pillars = [
  {
    icon: 'ti-server-off',
    title: '0 bytes to servers',
    detail: 'Your financial data never leaves your device. No cloud sync, no backup service, no analytics.'
  },
  {
    icon: 'ti-world-check',
    title: `${ALLOWED_DOMAINS.length} permitted domains`,
    detail: ALLOWED_DOMAINS.join(' · ')
  },
  {
    icon: 'ti-eye-off',
    title: '0 trackers',
    detail: 'No analytics SDK, no crash reporter, no ad pixel. Nothing that phones home without your knowledge.'
  },
  {
    icon: 'ti-lock',
    title: 'AES-256-GCM encryption',
    detail: 'Everything sensitive is encrypted on your device using your passphrase before it touches storage.'
  }
];

export function PrivacyPromiseScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-surface px-6 py-10">
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-shield-check text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">Our privacy promise</h2>
          <p className="text-secondary text-sm">
            We built Penny for people who want wealth tools without surveillance.
          </p>
        </div>

        <div className="flex flex-col gap-3 mb-8">
          {pillars.map((p) => (
            <div key={p.title} className="flex items-start gap-3 bg-surface-2 rounded-xl p-4 border border-theme">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                <i className={`ti ${p.icon} text-white`} style={{ fontSize: 18 }} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">{p.title}</p>
                <p className="text-xs text-secondary mt-0.5 leading-relaxed">{p.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate(PATHS.onboarding.setupCredentials)}
          className="w-full py-3.5 rounded-xl font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          I'm in — set up my vault
        </button>
      </div>
    </div>
  );
}
