/**
 * Hand-maintained "What's new" highlights for `AboutPennyPage.tsx`, one entry per shipped version.
 *
 * *** UPDATE THIS AT EVERY VERSION BUMP *** — add a new entry (matching `app.json`'s `expo.version`,
 * the same value `~/lib/appVersion.ts`'s `APP_VERSION` reads) with 3-5 real, user-facing highlights.
 * Older entries are kept for history but only the entry matching the current `APP_VERSION` is ever
 * rendered in-app. This is a deliberate one-place, statically-maintained list (not generated from
 * commits/changelogs) — the user explicitly chose to own upkeep of this file per release.
 */
export interface WhatsNewEntry {
  version: string;
  highlights: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '1.4.0',
    highlights: [
      'Privacy mode simplified — tap the icon to switch straight between Safe and Open, no menu.',
      'Bank statement import now recognizes SBI, HDFC, ICICI, Axis, and HSBC SMS formats.',
      'Groups: real multi-party expense splitting and tracking.',
      'Dozens of smaller fixes and polish from real-device testing.'
    ]
  }
];
