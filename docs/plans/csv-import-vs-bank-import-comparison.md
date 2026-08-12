# CSV expense import vs. bank statement import — comparison & proposal

**Status: proposal only, nothing implemented.** Per your request — compare the two, suggest improvements,
you'll review and finalize before anything gets built. No mockups, no code changes yet.

## The two features, in one line each

- **`apps/mobile/src/features/import/`** — the older, general-purpose importer: upload a CSV from Cashew,
  YNAB, MoneyView, or a custom format, get expenses. Ported from `apps/web-react` (exists on both
  platforms). Roughly half the size of bank-import in every dimension (files, LOC, core modules).
- **`apps/mobile/src/features/bank-import/`** — the newer, bank-specific importer this whole
  `bank-balance-sync` effort has been extending. Mobile-only (no web-react equivalent). Built with
  reconciliation, balance-verification, and transfer-detection as first-class concerns from day one.

## Side-by-side

| | CSV import (`import/`) | Bank import (`bank-import/`) |
|---|---|---|
| **Format presets** | 4 (Penny, YNAB, Cashew, MoneyView) + Custom | 7 real Indian banks |
| **Manual mapping step** | Only for "Custom" — known presets skip straight to review, no chance to correct a wrong guess | Always shown, pre-filled, always confirmable |
| **Preset drift detection** | None — a preset whose real export format changed (confirmed: real MoneyView has ~16 columns, the preset only reads ~5) silently drops the rest, no warning | Header-row detection + explicit mapping catches this by construction |
| **Duplicate detection** | Exact match only (`date\|amount\|lowercased description`) — a re-worded re-export, or a manually-entered expense with different wording, silently double-imports | Real fuzzy matcher — ±3-day window, amount tolerance, narration-similarity tie-break, three-bucket outcome (matched/possible/unmatched) |
| **Bulk actions** | Per-category-tile only | Cross-bucket |
| **Multi-account splitting from one file** | **Yes** — if an account column is mapped, distinct values become separate resolvable accounts. A genuine capability bank-import lacks entirely. | No — one file always maps to the one account being imported |
| **Balance/checkpoint awareness** | **None.** New accounts get `openingBalance: 0` hardcoded, no prompt, ever. | The entire point of this session's work — checkpoints, opening-balance capture, anchor-shift, gap detection, the persistent verification badge |
| **Transfer handling** | Automatic-or-nothing pairing, or a manual "transfer" category with **no destination-account picker at all** (the bug just fixed) | Explicit picker, ambiguous-candidate handling (ties never auto-resolved) |
| **Import history** | None — only a generic Timeline entry | Dedicated `BankImportHistoryPage.tsx` |
| **Rejected/malformed rows** | Genuinely good — shows the row's full original raw columns, inline fixer (this is a real strength worth keeping either way) | Comparable, less raw-data-forward |
| **Docs currency** | Stale in two places: doesn't mention MoneyView's real column count; "no bank statement auto-import" limitation line predates bank-import's existence | Current |

## My actual recommendation, not just a list

The evidence points somewhere more specific than "improve CSV import feature by feature": **the date-parsing bug you just found exists as two independently-maintained implementations of the same problem** — `bank-import/csvParser.ts`'s own date-format detection, and `import/importMatcher.ts`'s `parseFlexibleDate` (the one that just had the exact locale-guessing bug fixed). That's not a coincidence, it's what happens when two features do the same fundamental job (turn a tabular file into transactions) with separate codebases. The same class of bug can reappear in one path after being fixed in the other — which is exactly the kind of duplicated-capability signal worth treating as a redesign question, not two separate patch queues.

Bank-import's balance/checkpoint machinery is **already conditionally gated** — `attachesCheckpoints` only fires for `account.type === 'bank'` with a mapped balance column (Stage 1). That means bank-import already gracefully degrades to "just import rows, no balance opinions" for anything else — which is functionally everything CSV-import does today. The one genuine capability CSV-import has that bank-import lacks — splitting one file across multiple accounts via an account-identifying column — is a well-scoped, addable feature, not a reason the two need to stay separate systems.

**My recommendation: don't bring CSV-import up to parity feature-by-feature. Retire it, and fold its one genuinely distinct capability (multi-account splitting) into bank-import instead**, making bank-import the one importer for any tabular file — a real bank statement, a Cashew export, a MoneyView export, anything. Concretely:

1. Add multi-account-column resolution to bank-import (the one real gap between them).
2. Point `import`'s entry point at bank-import instead, keep its format presets (Cashew/YNAB/MoneyView) as additional entries in bank-import's preset list alongside the 7 banks.
3. Backport CSV-import's one real strength — the rejected-row raw-column inline fixer — into bank-import's own rejected-row handling.
4. Retire `import/` once migrated. Its own web-react twin stays frozen and untouched either way, per the existing legacy rule.

This is a bigger call than a UI tweak, so it deserves your explicit sign-off before any mockup work starts — happy to instead do the narrower, feature-by-feature backport (fuzzy matching, mapping-confirm step, opening-balance prompt, import history added to CSV-import directly) if you'd rather keep them separate. My honest read is unification is less total work and permanently closes the "two places doing the same job" gap, but it's a real product decision, not just an engineering one.

## What's NOT in scope for this proposal

- The real MoneyView multi-sub-account interleaving (bank account + debit card + cash pseudo-account in one export) — flagged, not solved here either way; whichever direction you pick, that's a follow-on design question once the base importer (unified or not) is settled.
- Any actual mockup or code change — this document is the comparison you asked for, nothing more.
