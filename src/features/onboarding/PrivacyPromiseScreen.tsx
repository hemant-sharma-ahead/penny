import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { ALLOWED_DOMAINS } from '@/core/ai-safety/piiScanner';
import { Button } from '@/components/ui';

const pillars = [
  {
    icon: 'ti-server-off',
    title: '0 bytes readable by us',
    detail: 'Our servers only ever see your handle and scrambled data they can’t unlock — never your real numbers.'
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
  },
  {
    icon: 'ti-cloud-lock',
    title: 'Your backup, your cloud',
    detail:
      'If you choose to back up, it goes to your own Google Drive or iCloud — never ours — and stays encrypted the whole way.'
  }
];

export function PrivacyPromiseScreen() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);

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

        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#00a86b] shrink-0"
            aria-label="Agree to Terms of Use and Privacy Policy"
          />
          <span className="text-xs text-secondary leading-relaxed">
            I agree to Penny&apos;s <span className="font-medium text-primary">Terms of Use</span> and{' '}
            <span className="font-medium text-primary">Privacy Policy</span>.
          </span>
        </label>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!agreed}
          onClick={() => navigate(PATHS.onboarding.privacyDemo)}
        >
          I&apos;m in — continue
        </Button>
      </div>
    </div>
  );
}
