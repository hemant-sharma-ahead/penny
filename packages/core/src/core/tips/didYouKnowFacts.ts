// "Did You Know" tips content library (2026-08-16) — see docs/features/did-you-know-tips.md for the
// full design. Compiled from a whole-app sweep (three Explore passes) of genuinely non-obvious
// capabilities, curated for real surprise/value rather than volume. `curated: true` marks the ~39 tips
// that feed Tier 1 (contextual nudges) and Tier 2 (the rotating/daily card) — the rest exist only for
// Tier 3 ("Discover Penny", the full browsable hub). Two entries below are marked `[CORRECTED]` in their
// own comment because the user's own first-draft wording didn't match what the app actually does — the
// text here is the corrected version, not the original claim.
import { TAX_FACTS } from '../tax/taxFacts';
import type { DidYouKnowFact } from './types';

const CURATED_FACTS: DidYouKnowFact[] = [
  // Transactions
  {
    id: 't01',
    module: 'transactions',
    curated: true,
    text: 'Long-press any transaction to jump straight into multi-select — no need to tap a select icon first.'
  },
  {
    id: 't02',
    module: 'transactions',
    curated: true,
    text: 'Once you’ve selected multiple transactions, you can bulk-categorize, bulk-tag with a hashtag, bulk-change account/payment mode, or bulk-delete — all in one action.'
  },
  {
    id: 't03',
    module: 'transactions',
    curated: true,
    text: 'Save any transaction as a one-tap template ("Save as template" in the entry form) for things you log often.'
  },
  {
    id: 't04',
    module: 'transactions',
    curated: true,
    text: 'A recurring transaction never posts itself — it waits in a "due to log" inbox until you confirm it, so nothing appears without you noticing.'
  },
  {
    id: 't05',
    module: 'transactions',
    curated: true,
    text: 'Search matches hashtags too, not just the description — searching "goa" surfaces every Goa-tagged expense.'
  },
  // Categories
  {
    id: 't06',
    module: 'categories',
    curated: true,
    text: 'You can move every transaction from one or several categories into a single target category in one action, from Manage Categories → Select.'
  },
  {
    id: 't07',
    module: 'categories',
    curated: true,
    text: 'You can group your own custom categories under a custom parent group (e.g. "Kids" grouping School Fees + Toys + Activities), alongside Penny’s built-in groups.'
  },
  // Tags & Set Aside
  {
    id: 't08',
    module: 'tags',
    curated: true,
    text: 'You can create a tag just by typing its name while recording a transaction — no separate "create tag" step, no # required.'
  },
  {
    id: 't09',
    module: 'tags',
    curated: true,
    text: 'Tag something "Set Aside" (e.g. groceries bought for your parents) and it won’t clutter your daily-living totals — it still counts against that category’s budget, though.'
  },
  {
    id: 't10',
    module: 'tags',
    curated: true,
    text: 'Forgot to mark a tag Set Aside? Fix it once from Manage Tags and every past and future transaction with that tag is reclassified automatically.'
  },
  {
    id: 't11',
    module: 'tags',
    curated: true,
    text: 'Hiding a tag in Safe Mode and marking it Set Aside are two independent decisions — one doesn’t imply the other.'
  },
  // Events
  {
    id: 't12',
    module: 'events',
    curated: true,
    text: 'Create an event like "Goa Trip" with a date range, and every matching expense in that window gets auto-tagged — no manual tagging needed during the trip.'
  },
  {
    id: 't13',
    module: 'events',
    curated: true,
    text: 'An ordinary hashtag can be promoted into a tracked Event later, so its spending gets its own Analytics breakdown retroactively.'
  },
  // IOU / Lending
  {
    id: 't14',
    module: 'iou',
    curated: true,
    text: 'Tag an expense or income with a person’s name under Lending/Borrowing and Penny automatically creates (or reuses) an IOU ledger for them — no separate "add person" step.'
  },
  {
    id: 't15',
    module: 'iou',
    curated: true,
    text: 'Settling up with someone can also record the real money movement into an account, not just clear the IOU balance.'
  },
  // Import
  {
    id: 't16',
    module: 'import',
    curated: true,
    text: 'Once you categorize a merchant during a bank-statement import, Penny remembers it — your next statement pre-fills the same category, always editable.'
  },
  {
    id: 't17',
    module: 'import',
    curated: true,
    text: 'The everyday expense form learns from your history too: type a merchant you’ve used before and it one-tap-fills the category, account, and payment mode.'
  },
  {
    id: 't18',
    module: 'import',
    curated: true,
    text: 'You can teach Penny your bank’s cash-withdrawal codes and merchant-recognition rules yourself, from the Accounts screen header.'
  },
  // Analytics
  {
    id: 't19',
    module: 'analytics',
    curated: true,
    text: 'Analytics has Monthly, Annual, and All Time views — All Time gives clean lifetime totals with no confusing "vs last year" comparisons.'
  },
  {
    id: 't20',
    module: 'analytics',
    curated: true,
    text: 'Tap any category, group, or tag in Analytics to instantly see every transaction behind that number.'
  },
  // Budgets
  {
    id: 't21',
    module: 'budgets',
    curated: true,
    text: 'Budgets aren’t a separate tab — tap the target icon in the Transactions toolbar to set a monthly limit per category.'
  },
  // Backup & Restore
  {
    id: 't22',
    module: 'backup',
    curated: true,
    text: 'You can export your expenses as a CSV wrapped in a password-protected zip — a separate password from your Penny passphrase, so pick one you’ll remember.'
  },
  {
    id: 't23',
    module: 'backup',
    curated: true,
    text: 'Automatic backup can go to this device, Google Drive, or (iPhone) iCloud — fully encrypted end-to-end, unreadable without your passphrase, even by Google or us.'
  },
  {
    id: 't24',
    module: 'backup',
    curated: true,
    text: 'Lost your device with no backup file on hand? "Reclaim" gets your identity and group memberships back with just your username + passphrase — no file needed. (Your personal data itself still needs an actual backup to come back.)'
  },
  // Timeline
  {
    id: 't25',
    module: 'timeline',
    curated: true,
    text: 'Every action in the app is logged and viewable in the Timeline (Settings → Timeline), and almost anything can be undone — even long after the fact.'
  },
  {
    id: 't26',
    module: 'timeline',
    curated: true,
    // [CORRECTED] — the user's original draft implied a broader rollback; the code only ever restores
    // deletions since the marker, never edits or new entries. This is the corrected copy.
    text: 'You can drop a "Restore Point" marker in the Timeline, then later choose "Undo since" to bring back anything you deleted after that point. It only restores deletions — edits and new entries made after the marker stay as they are.'
  },
  {
    id: 't27',
    module: 'timeline',
    curated: true,
    text: 'The Timeline tracks a daily streak, celebrates milestones like your 100th transaction, and can generate a shareable weekly recap of your spending.'
  },
  // Safe Mode / Privacy
  {
    id: 't28',
    module: 'privacy',
    curated: true,
    text: 'You control exactly what’s hidden in Safe Mode from "Manage Safe Mode Visibility" — by default your income and sensitive categories are hidden, everyday spending stays visible.'
  },
  {
    id: 't29',
    module: 'privacy',
    curated: true,
    text: 'Open Mode (shows everything) always needs your PIN and reverts automatically — on a timer, or the instant you background the app.'
  },
  // Portfolio
  {
    id: 't30',
    module: 'portfolio',
    curated: true,
    text: 'You can track your EPF by uploading your own passbook PDF — Penny never asks for your EPFO login, and the numbers match your real passbook down to the rupee.'
  },
  {
    id: 't31',
    module: 'portfolio',
    curated: true,
    text: 'PPF actually matures 15 years after the end of the financial year you opened it in, not from your literal opening date — Penny calculates this correctly for you.'
  },
  {
    id: 't32',
    module: 'portfolio',
    curated: true,
    text: 'Enter just a vehicle’s registration number and Penny fetches its make/model and auto-depreciates its value using real insurance depreciation rates.'
  },
  {
    id: 't33',
    module: 'portfolio',
    curated: true,
    text: 'The Loan Payoff Planner shows — without touching your real data — how much a lump-sum prepayment or a small step-up in EMI would actually save you.'
  },
  // Goals & Financial Health
  {
    id: 't34',
    module: 'goals',
    curated: true,
    text: 'You can link any transaction — past or new — directly to a savings goal, right from the transaction form.'
  },
  {
    id: 't35',
    module: 'goals',
    curated: true,
    text: 'A goal can be marked as "already counted" toward your Safe-to-Spend figure, so money you’ve earmarked for it doesn’t look like idle spare cash.'
  },
  {
    id: 't36',
    module: 'goals',
    curated: true,
    // [CORRECTED] — no "6 months" gate exists; it triggers as soon as there's real expense data.
    text: 'Penny suggests an emergency-fund and retirement-corpus target as soon as you’ve logged real expenses — based on your actual numbers, not a generic rule of thumb, and it won’t guess before it has real data to work from.'
  },
  // Chip
  {
    id: 't37',
    module: 'chip',
    curated: true,
    text: 'Chip’s insight cards always show the real rupee cost of not acting — not just "you’re overspending," but what delaying actually costs you over time.'
  },
  {
    id: 't38',
    module: 'chip',
    curated: true,
    text: 'Everything Chip sees is stripped of names, exact account numbers, and exact age/income first — even we can’t see what you can.'
  },
  // Groups
  {
    id: 't39',
    module: 'groups',
    curated: true,
    text: 'A shared group can be settled up with just one member at a time, not just everyone at once.'
  }
];

/** The fuller catalogue — everything else genuinely user-facing the research turned up, shown only in
 *  the "Discover Penny" hub. Not curated (never fed to Tier 1 nudges or Tier 2's rotating/daily card). */
const CATALOGUE_FACTS: DidYouKnowFact[] = [
  {
    id: 'x01',
    module: 'transactions',
    curated: false,
    text: 'Swipe left on any transaction to duplicate it, share it to a group, or delete it.'
  },
  {
    id: 'x02',
    module: 'transactions',
    curated: false,
    text: 'You can duplicate a transaction two ways — swipe it, or open it for edit and tap Duplicate.'
  },
  {
    id: 'x03',
    module: 'transactions',
    curated: false,
    text: 'Filter by payment-mode mismatch to see transactions where the recorded payment mode disagrees with your bank statement’s own wording.'
  },
  {
    id: 'x04',
    module: 'transactions',
    curated: false,
    text: 'Filters aren’t just category and account — you can also filter by event, goal, or category group.'
  },
  {
    id: 'x05',
    module: 'transactions',
    curated: false,
    text: 'You can skip a single occurrence of a recurring transaction without affecting the rest of the series.'
  },
  {
    id: 'x06',
    module: 'categories',
    curated: false,
    text: 'The category picker shows your top-used categories first, so common picks never need scrolling.'
  },
  {
    id: 'x07',
    module: 'categories',
    curated: false,
    text: 'During an active Vacation, the category picker leads with travel-related categories automatically.'
  },
  { id: 'x08', module: 'categories', curated: false, text: 'You can customize any custom category’s icon and color.' },
  {
    id: 'x09',
    module: 'categories',
    curated: false,
    text: 'Deleting a category also deletes its budget for that category.'
  },
  {
    id: 'x10',
    module: 'tags',
    curated: false,
    text: 'The Tags panel shows your most-used tags first — no typing required.'
  },
  {
    id: 'x11',
    module: 'events',
    curated: false,
    text: 'There are two kinds of events — a background "Event" hashtag you tag manually, and a "Vacation" with a date range that auto-tags for you.'
  },
  {
    id: 'x12',
    module: 'events',
    curated: false,
    text: 'Shrinking a Vacation’s date range asks whether to keep or unlink expenses that fall outside the new dates.'
  },
  {
    id: 'x13',
    module: 'events',
    curated: false,
    text: 'Link a Vacation to a group and Penny automatically defaults new expenses to being shared with that group.'
  },
  {
    id: 'x14',
    module: 'events',
    curated: false,
    text: 'A past event can be reactivated instead of creating a new one.'
  },
  {
    id: 'x15',
    module: 'iou',
    curated: false,
    text: 'Money you’ve lent or borrowed doesn’t count against your daily-living spending — it shows up in its own Lending & IOU bucket.'
  },
  {
    id: 'x16',
    module: 'import',
    curated: false,
    text: 'You can always manually mark bank-statement rows as a transfer between your own accounts, even if Penny didn’t auto-detect it.'
  },
  {
    id: 'x17',
    module: 'import',
    curated: false,
    text: 'If Penny notices two account names in your file are really the same account, it’ll suggest merging them.'
  },
  {
    id: 'x18',
    module: 'import',
    curated: false,
    text: 'The first time merchant memory runs, Penny builds it from your entire existing history — so suggestions work from day one.'
  },
  {
    id: 'x19',
    module: 'analytics',
    curated: false,
    text: 'Analytics’ Annual view highlights your "Biggest Movers" — categories that changed the most vs. your recent average.'
  },
  {
    id: 'x20',
    module: 'analytics',
    curated: false,
    text: 'Analytics projects your likely month-end total based on your pace so far, right from the current month view.'
  },
  {
    id: 'x21',
    module: 'analytics',
    curated: false,
    text: 'The annual income/spend chart projects the rest of the year from your recent average, so you’re not staring at empty months.'
  },
  {
    id: 'x22',
    module: 'analytics',
    curated: false,
    text: 'Expenses shared into a Family-type group are automatically kept out of your daily-living total, regardless of category.'
  },
  {
    id: 'x23',
    module: 'analytics',
    curated: false,
    text: 'Analytics flags when a category runs noticeably above its recent average, right in the monthly view.'
  },
  {
    id: 'x24',
    module: 'backup',
    curated: false,
    text: 'Even with no cloud destination configured, Penny quietly keeps a private daily backup snapshot on your own device.'
  },
  {
    id: 'x25',
    module: 'backup',
    curated: false,
    text: 'If your username gets claimed by someone else while you’re away, Penny detects the conflict when you come back and helps you pick a new one.'
  },
  {
    id: 'x26',
    module: 'backup',
    curated: false,
    text: 'Resetting Penny tries to release your username from the server first, and warns you if that fails, so you don’t get stranded unable to reclaim it later.'
  },
  {
    id: 'x27',
    module: 'privacy',
    curated: false,
    text: 'You can turn on an auto-wipe after 10 failed unlock attempts, from Settings’ danger zone — off by default.'
  },
  {
    id: 'x28',
    module: 'timeline',
    curated: false,
    text: 'Every individual deleted item can be restored on its own from "Recently deleted," with or without ever setting a Restore Point.'
  },
  {
    id: 'x29',
    module: 'timeline',
    curated: false,
    text: 'You can undo an entire import batch from the Timeline, long after it happened — not just right after importing.'
  },
  {
    id: 'x30',
    module: 'timeline',
    curated: false,
    text: 'The Timeline has an "On this day" section that resurfaces what you were doing on this date in a past year.'
  },
  {
    id: 'x31',
    module: 'timeline',
    curated: false,
    text: 'The Timeline shows a quick "Privacy Receipt" — how many changes happened today, and a reminder that all of it stayed on your device.'
  },
  {
    id: 'x32',
    module: 'privacy',
    curated: false,
    text: 'Switching to Open Mode always asks for your PIN and warns you to check no one’s watching first.'
  },
  {
    id: 'x33',
    module: 'privacy',
    curated: false,
    text: 'Switching to Privacy Mode also turns off Chip entirely, since there’s nothing safe to analyze.'
  },
  {
    id: 'x34',
    module: 'privacy',
    curated: false,
    text: 'You can require the app to re-lock every single time it’s backgrounded, not just after a timeout.'
  },
  {
    id: 'x35',
    module: 'onboarding',
    curated: false,
    text: 'On Android, Penny can detect bank SMS and turn them into transactions automatically — find it under Settings → SMS Tracking.'
  },
  {
    id: 'x36',
    module: 'onboarding',
    curated: false,
    text: 'The bell icon in the header reminds you about upcoming bills, subscriptions, and EMIs before they’re due.'
  },
  {
    id: 'x37',
    module: 'onboarding',
    curated: false,
    text: 'The optional "a bit more about you" questions during setup power more personalized goal suggestions later.'
  },
  {
    id: 'x38',
    module: 'onboarding',
    curated: false,
    text: 'New here? Demo Mode seeds sample data so you can explore before adding your own — exit anytime from Settings.'
  },
  {
    id: 'x39',
    module: 'groups',
    curated: false,
    text: 'Shared groups support 4 ways to split a bill — equal, unequal, percentage, or shares.'
  },
  {
    id: 'x40',
    module: 'groups',
    curated: false,
    text: 'Group invites use end-to-end encrypted key exchange — even the server never sees what’s inside a shared group.'
  },
  {
    id: 'x41',
    module: 'groups',
    curated: false,
    text: 'A settled/closed group can be reopened later to add more expenses.'
  },
  {
    id: 'x42',
    module: 'portfolio',
    curated: false,
    text: 'Searching a stock or mutual fund by name auto-fills its fund house, exchange, and category for you.'
  },
  {
    id: 'x43',
    module: 'portfolio',
    curated: false,
    text: 'You can re-import your own previously-exported EPF Excel file, alongside real passbook PDFs, in the same picker.'
  },
  {
    id: 'x44',
    module: 'portfolio',
    curated: false,
    text: 'When logging EPF interest, tap "Want me to calculate it for you?" and Penny runs the real accrual math for you.'
  },
  {
    id: 'x45',
    module: 'portfolio',
    curated: false,
    text: 'EPF export produces one combined workbook across every employer and year, unlike EPFO’s own one-at-a-time download.'
  },
  {
    id: 'x46',
    module: 'portfolio',
    curated: false,
    text: 'Penny estimates your gross salary and CTC per employer from your EPF contributions.'
  },
  {
    id: 'x47',
    module: 'portfolio',
    curated: false,
    text: 'Penny calculates exactly how much you’re allowed to withdraw from PPF each year, even for a brand-new account.'
  },
  {
    id: 'x48',
    module: 'portfolio',
    curated: false,
    text: 'Missing PPF’s ₹500/year minimum makes the account dormant — reviving it costs a penalty per missed year. Penny flags this before it happens.'
  },
  {
    id: 'x49',
    module: 'portfolio',
    curated: false,
    text: 'Depositing into PPF before the 5th of the month vs. after changes whether that month earns interest — Penny badges this on each entry.'
  },
  {
    id: 'x50',
    module: 'portfolio',
    curated: false,
    text: 'Penny automatically totals your coverage across every active life/health policy, so you always know your real total cover.'
  },
  {
    id: 'x51',
    module: 'portfolio',
    curated: false,
    text: 'The insurance renewal tracker warns you 30/60/90 days before a policy expires.'
  },
  {
    id: 'x52',
    module: 'portfolio',
    curated: false,
    text: 'You can export a loan’s full repayment schedule as an Excel file.'
  },
  {
    id: 'x53',
    module: 'portfolio',
    curated: false,
    text: 'Penny can track non-EMI borrowings too — credit card debt, BNPL, informal loans, rental deposits.'
  },
  {
    id: 'x54',
    module: 'portfolio',
    curated: false,
    text: 'Gold and silver holdings are valued live, automatically adjusted for purity (karat) — not just weight × a flat price.'
  },
  {
    id: 'x55',
    module: 'portfolio',
    curated: false,
    text: 'Penny never stores your property’s address — a deliberate privacy choice, not a missing feature.'
  },
  {
    id: 'x56',
    module: 'portfolio',
    curated: false,
    text: 'The IPO tracker shows live grey-market premium and subscription multiples for open IPOs.'
  },
  {
    id: 'x57',
    module: 'goals',
    curated: false,
    text: 'Chip can tell you, from your real contribution history, roughly when you’ll hit any goal at your current pace.'
  },
  {
    id: 'x58',
    module: 'goals',
    curated: false,
    text: 'Working backwards from a target amount and date, Penny can tell you exactly how much SIP you’d need.'
  },
  {
    id: 'x59',
    module: 'goals',
    curated: false,
    text: 'Your Financial Health Score is built from 6 real factors — emergency fund, savings rate, debt-to-income, insurance, goals on track, and diversification.'
  },
  {
    id: 'x60',
    module: 'goals',
    curated: false,
    text: 'An "Emergency fund" goal counts toward your Emergency Fund score even if the money isn’t sitting in a dedicated savings account.'
  }
];

/** Tax facts, folded in as their own module (2026-08-16) — `taxFacts.ts` stays the single source of
 *  truth for the actual strings (unchanged), just now consumed through this shared library instead of a
 *  Tax-only component. Never curated (Tax's own screen filters to `module: 'tax'` directly and doesn't
 *  need the cross-module curated pool). */
const TAX_MODULE_FACTS: DidYouKnowFact[] = TAX_FACTS.map((text, i) => ({
  id: `tax${String(i + 1).padStart(2, '0')}`,
  module: 'tax' as const,
  curated: false,
  text
}));

export const DID_YOU_KNOW_FACTS: DidYouKnowFact[] = [...CURATED_FACTS, ...CATALOGUE_FACTS, ...TAX_MODULE_FACTS];
