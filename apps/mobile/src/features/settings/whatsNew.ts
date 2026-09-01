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
    version: '1.5.2',
    highlights: [
      'CSV import shows a loading indicator on large files instead of appearing to freeze.',
      'Cash-withdrawal imports now show a clear card per account, instead of one vague "multiple accounts" entry.',
      'Exporting your data now includes account names and lending/borrowing info.',
      'Custom CSV import can now map more fields — tags, payment mode, bank name, and account type.',
      'Leaving a group now keeps its past history visible instead of deleting it.'
    ]
  },
  {
    version: '1.5.1',
    highlights: [
      "Fixed a bug where typing a person's name for lending/borrowing could dismiss the keyboard mid-word.",
      'Automatic Drive backups now respect your chosen frequency instead of backing up on every change; backup times now show alongside the date.',
      'Fixed a "revoked device" error that could block creating a new group after restoring a backup.',
      'Cashew CSV import: transfers between your own accounts now import correctly instead of being skipped.',
      'IPO tracker redesigned with color-coded GMP indicators and a new SME filter.'
    ]
  },
  {
    version: '1.5.0',
    highlights: [
      'Account screen redesigned — grouped by type, tap the balance for actions, more real bank logos and colors.',
      'Backup & restore reliability fixes — Drive and on-device backups now include accounts and more of your data, plus a new "Overwrite Drive" option when an old backup doesn\'t match this device.',
      'New About Penny screen and a dedicated Privacy Promise page.',
      'Analytics: fixed an Income-section grouping bug, reordered sections so Income leads, and smoother month-filter scrolling.'
    ]
  },
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
