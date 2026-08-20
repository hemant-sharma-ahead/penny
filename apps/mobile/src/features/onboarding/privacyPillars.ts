import { ALLOWED_DOMAINS } from '@/core/ai-safety/piiScanner';

/**
 * The mission statement + 5 pillars shown on onboarding's `PrivacyPromiseScreen.tsx` — extracted here
 * 2026-08-20 so Settings' read-only `PrivacyPromisePage.tsx` (reached from `AboutPennyPage.tsx`) can
 * render the exact same content instead of a hand-copied duplicate that could drift out of sync.
 */
export const PRIVACY_MISSION_STATEMENT = 'We built Penny for people who want wealth tools without surveillance.';

export interface PrivacyPillar {
  icon: string;
  title: string;
  detail: string;
}

export const PRIVACY_PILLARS: PrivacyPillar[] = [
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
