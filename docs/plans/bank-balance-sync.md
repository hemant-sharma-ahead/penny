# Plan: Bank account balance sync (Penny ↔ real bank statement)

**Status as of 2026-08-09: all 8 stages (0–7) built.** This plan is now fully implemented, not a
proposal — §7 below has the per-stage detail — data model, checkpoint attachment + two-tier matching,
coverage tracking + the closed-loop sweep, the opening-balance anchor, the checkpoint-diff diagnostics
UI + unified "unverified account" badge, intra-day sequencing, inter-account-transfer refinements, and
(the final stage) the cash-withdrawal retroactive-transfer prompt. If you're resuming this work in a
new session (a bug fix, a follow-up refinement, or extending it further), read this document top to
bottom before touching any code, and treat the "Open questions" section (near the end, already fully
resolved) and each stage's own "✅ built" write-up as the record of what's real — don't re-litigate a
decision already made in discussion with the user. Nothing in this plan is uncommitted-but-designed
anymore; any further change here is a modification of real, working code, not a first build.

## Companion artifact — do not delete

**[`docs/plans/bank-balance-sync-simulation.html`](bank-balance-sync-simulation.html)** is a working
simulation built alongside this plan — 17 numbered sections, each walking a concrete, small,
hand-computed example (real ₹ amounts, real dates) through a specific scenario. It is the source of
truth for *why* each decision below was made, and should become the source of the actual unit-test
fixtures once building starts. **Never delete it, and never edit an already-numbered section's
conclusion without updating this plan to match** — if a new scenario is found during implementation,
add a new numbered section to it (following its existing style: a table walking the scenario, a
callout stating the finding) rather than editing an old one, then reference it from this plan.

Open it in a browser to see the actual worked numbers behind every decision below — this plan
summarizes conclusions; the HTML shows the arithmetic that produced them.

## 1. The goal

Today, Penny's account balance is always *derived* (`computeBalance()` — opening balance + sum of
recorded transactions) and never verified against reality beyond a single, soft, one-shot nudge after
a bank statement import. The goal: once a user has imported every real bank statement for an account,
**Penny's computed balance for that account should be provably, permanently correct** — not just
"probably fine." Scope: **bank accounts only** (not cash accounts — nothing external to check them
against; not credit cards — inverted sign convention, explicitly deferred, see §8).

The core insight the whole design rests on (§7 of the simulation): stop treating a bank statement's
balance column as a single end-of-import sanity check, and instead treat *every* statement row's own
stated balance as a permanent, immutable **checkpoint** attached to the specific transaction it
belongs to. Comparing Penny's own derived running balance against these checkpoints, transaction by
transaction, turns a vague "you're off by ₹320 somewhere" into a precise "the gap is strictly between
these two specific transactions."

## 2. Current architecture (baseline — what already exists, unchanged by this plan unless stated)

Read these before changing anything; this plan builds on top of all of it, doesn't replace it:

| Piece | File | What it does today |
|---|---|---|
| Fuzzy matcher | `packages/core/src/core/bank-import/matcher.ts` | `matchStatementRows()`: direction + ±3-day window + exact amount + narration-similarity tie-break. `referenced.add(expense.id)` prevents one existing expense being claimed twice **within a single import** (not across imports — that's the gap §17 closes). `suggestPossibleTransfer()`: cross-account transfer suggestion, dismissible-only, never auto-links. |
| Balance nudge | `packages/core/src/core/bank-import/balanceCheck.ts` | `checkBalanceAgainstStatement()`: one post-commit comparison of Penny's derived balance vs. the statement's own last stated balance, ±₹1 tolerance. Advisory only, never auto-corrects, never persisted anywhere. |
| Balance derivation | `packages/core/src/core/accounts/balanceCalculator.ts` | `computeBalance(accountId, openingBalance, txns)` — always derived, never stored. `delta()` handles `expense`/`income`/`transfer` (transfer debits `accountId`, credits `toAccountId`, from one shared record). |
| Cash-withdrawal transfer detection | `packages/core/src/core/bank-import/cashWithdrawalCodes.ts` | `suggestCashTransfer()` — narration-code-based (ATW, NWD, SELF, …), suggests marking a row as a Transfer. Only fires for **unmatched** rows building a new transaction — never re-examines a row that turned out to match an existing one (this is exactly §Finding-1's gap). |
| Commit flow | `apps/mobile/src/features/bank-import/useBankImport.ts` | For a matched pair, `linkRecord()` writes a **provenance record** to `bankStatementImportsRepo` (statement's own date/amount + `linkedTxnId`) — it never calls `expensesRepo.put()` on the matched `Expense` itself. Confirmed via code read, not assumption: **a matched transaction's own date/amount are never corrected today.** |
| Account model | `packages/core/src/core/db/types/index.ts` | `Account.openingBalance: number` — manual, static, no associated date. Implicitly "before every transaction that exists," which only holds as long as nobody backfills something earlier. |
| Transaction model | `packages/core/src/core/db/types/index.ts` | `Expense` — no balance/checkpoint field, no intra-day sequence field, `type: 'expense'\|'income'\|'transfer'`, `accountId`/`toAccountId`. |

## 3. Decisions made, in order, each traceable to a simulation section

Every one of these was explicitly discussed and settled with the user. Cite the simulation section
number in any future discussion of "why" — don't re-derive the reasoning from scratch.

1. **Scope is bank accounts only** — not cash (nothing to check against), not credit cards for now
   (inverted sign convention, would need explicit handling — §16).
2. **Cash withdrawals recorded via a bank statement should become Transfers to the cash account**,
   not plain expenses — this already mostly works via `cashWithdrawalCodes.ts` for *unmatched* rows;
   the gap is rows that instead **match an existing plain expense** — those need the same "looks like
   a transfer, convert it?" prompt retroactively (§17, Finding 1 originally raised before the
   simulation existed).
3. **A statement's balance column is the mechanism** — but only ever a bank's own real statement,
   never a third-party app's self-reported balance (MoneyView demonstrated concretely, §2b of the
   simulation: its own UI disagreed with its own listed transactions by ₹100 — not just imprecise,
   internally inconsistent).
4. **Per-transaction checkpoints, not a single end-of-import check** (§7) — attach the bank's own
   stated balance to the specific transaction it belongs to (call this a **checkpoint**), whenever a
   statement with a mapped balance column produces or matches that transaction. Compare Penny's own
   derived running balance against every checkpoint, not just the last one.
5. **A flat, unchanging diff from the very first checkpoint** signals a wrong opening balance; **a
   diff that steps in partway through and then holds constant** signals a single missing or duplicate
   transaction strictly between the last-agreeing and first-disagreeing checkpoints (§7b/7c/7d) — this
   distinction is the entire diagnostic value of the checkpoint model.
6. **Same-day, multiple transactions**: only reliable at end-of-day by default, since Penny doesn't
   track intra-day order (§7e). **Enhancement, not required for v1**: when *every* transaction on a
   given day is explained by one statement's own rows, assign each an explicit intra-day sequence
   (`reconciledSeq`, proposed) straight from the statement's own row order, enabling true intra-day
   checkpoints for that day (§9). Falls back to end-of-day the moment any transaction on that day
   isn't statement-explained.
7. **Matched transactions must have their date (and, for user-resolved fuzzy matches, amount)
   corrected to the statement's own value** on commit (§8) — confirmed via code read that this does
   *not* happen today. Required for day-bucketed checkpoints to mean anything; no confirmation dialog
   needed (confirming the match already was the decision).
8. **Retrospective imports work cleanly with this model precisely because checkpoints anchor to
   calendar dates, not import order** (§10b) — but any retrospective import must trigger a recompute
   of every checkpoint *after* it too, not just its own range, since opening balance and running
   totals are shared across an account's whole history.
9. **Two independent errors that net to zero are invisible to any balance check, at any granularity**
   (§10c) — a missing credit + a missing debit of the same amount. Only the review screen's row-by-row
   *existence* matching (not a balance/arithmetic check) can catch this. This is a genuine, permanent
   limit of the checkpoint idea, not a gap to engineer around — checkpoints are a strong complementary
   layer, never a replacement for reviewing the actual matched/new/possible rows.
10. **The opening-balance anchor can move backward** when an earlier statement than whatever set it
    is later found and imported (§14) — needs an explicit paired `openingBalanceAsOfDate`, not just a
    bare `openingBalance` number. Backfilling can also **reveal that the original anchor was itself
    wrong all along** (§14b) — a flat diff from "day one" only proves nothing's wrong if "day one" was
    itself statement-verified; if it was a typed-in guess, backfilling to an independently-verifiable
    earlier point is the only way to actually confirm or refute it.
11. **"Partial import" needs two different fixes** (§11): (a) a user deliberately excluding some rows
    during review needs a durable, visible record of what was skipped, not silence; (b) a statement
    file that only covers part of a period needs its actual min/max date range tracked per account,
    with a gap-detection check before the next import is allowed to proceed silently.
12. **A transaction near a statement's period boundary shouldn't be flagged as suspicious the moment
    the current statement doesn't explain it** (§12) — defer escalation until an *adjacent* period's
    import has also had the chance to explain it and failed to, using the same covered-date-range data
    as §11b.
13. **Inter-account transfers matter for reporting accuracy, not for the balance-sync guarantee
    itself** (§13) — an important correction made mid-discussion: each account's own balance
    reconciles fine against its own statement whether or not the two sides of a transfer are linked;
    linking only prevents double-counting in income/expense analytics. A genuine ambiguity exists when
    two same-bank accounts have coincidental same-day/same-amount activity — must surface as a choice,
    never auto-link (matches the existing `suggestPossibleTransfer` "dismissible-only" philosophy).
14. **Re-importing the exact same statement file twice is already safe by design** (§15) — confirmed
    via code read: `useBankImport.ts`'s `referenced.add(pair.expense.id)` prevents the same existing
    expense being claimed twice within one import, which naturally makes a full re-import land every
    row as "matched." A proactive pre-check against the covered-date-range list (§11b) is a nice-to-have
    convenience on top, not a correctness fix.
15. **Checkpointed transactions must be permanently excluded from fuzzy-matching against any future
    import** (§17) — the sharpest, most concrete finding, from a real example the user gave directly:
    a checkpointed 31-Mar ₹240 expense must never be offered as a candidate match for an unrelated
    April statement's own ₹240 row just because it falls within the ±3-day window. Two-tier matching
    (exact provenance lookup, then fuzzy-but-excluding-checkpointed) is the proposed mechanism.
16. **A boundary transaction must never be able to slip away silently forever** — resolved 2026-08-08,
    hardening §12's deferred-escalation idea after the user explicitly rejected leaving it
    open-ended ("we should not let anything slip away silently"). The gap: lone wolves (§12) are only
    ever computed *live*, during one specific import's own review screen — nothing re-checks a
    transaction left `'provisional'` there once an adjacent statement is later imported, unless the
    user happens to revisit that exact review flow again, which isn't a normal action. Fix: a **full
    derived sweep**, re-run after every import commits for an account, needing no new persisted
    tracking list at all — any expense dated within the union of `Account.coveredStatementRanges`
    (dates the account's own import history claims are fully explained) that has no corresponding
    `bankStatementImportsRepo` link is a standing, actionable gap, full stop, regardless of which
    import session first noticed (or missed) it. Same "always derived, never stored" philosophy the
    balance itself already follows. The in-review-screen `'provisional'`/`'escalated'` softening from
    §12 can stay as a softer in-the-moment hint (no reason to alarm someone with "escalated!" for
    something one adjacent import is about to resolve automatically) — it just stops being the *only*
    mechanism; the full sweep is the backstop. Surface for now: the Import History screen (already
    built, Stage 2). Once Stage 4's persistent "unverified account" badge exists, this sweep's
    findings should feed that SAME surface rather than maintaining two separate indicators
    long-term — don't let this become a second, competing "something's wrong with this account" signal.

## 4. Data model changes (proposed — none built yet)

All additive/optional; no Dexie schema version bump should be required (mirrors how `EpfTransaction`/
`PpfTransaction` gained provenance fields this same session without a bump).

```ts
// packages/core/src/core/db/types/index.ts

export interface Expense {
  // ...existing fields unchanged...

  /** GROUND TRUTH ONLY — the bank statement's own stated running balance immediately after this
   *  transaction, copied verbatim from a statement row with a mapped balance column. Set once, never
   *  recomputed, never guessed. Present only on transactions that came from, or were matched against,
   *  a bank-statement import that had a balance column mapped. Absent on every manually-entered /
   *  Cashew/MoneyView-imported / no-balance-column-statement transaction. THE marker of "checkpointed"
   *  — see reconciliation §4 below for what that gates. */
  statementBalance?: number;

  /** Intra-day order (1st, 2nd, 3rd… among that day's rows), set ONLY when every one of this
   *  account's transactions on this calendar day is explained by one statement's own rows (enables
   *  true intra-day checkpoints instead of end-of-day-only). Absent otherwise — never guessed. */
  reconciledSeq?: number;
}

export interface Account {
  // ...existing fields unchanged...

  /** The date `openingBalance` is "as of." Absent = legacy/implicit "before every transaction that
   *  exists" (today's behavior, preserved for existing accounts). Set explicitly once a bank
   *  statement import establishes or moves the anchor (first-ever import, or a later-discovered
   *  earlier statement — see plan §7 stage 3). */
  openingBalanceAsOfDate?: number;

  /** One entry per completed bank-statement import batch for this account — the file's own actual
   *  min/max transaction date (never assumed from a filename or the user's stated intent). Powers:
   *  gap-detection between imports, deferred lone-wolf escalation, and the re-import convenience
   *  check. Never removed once added (append-only history). */
  coveredStatementRanges?: { start: number; end: number; batchId: string; importedAt: number }[];
}
```

No change proposed to `bankStatementImportsRepo`'s own record shape yet — Stage 1 (below) may need a
normalized-key index on it for the Tier-1 exact-provenance lookup; revisit when building that stage.

## 5. Behavior changes (proposed — none built yet)

- **Two-tier matching** (§17): Tier 1 — normalize date+amount+narration, check
  `bankStatementImportsRepo` for an identical row already recorded; a hit means "already processed,"
  skip fuzzy logic entirely. Tier 2 — existing fuzzy matcher, with one added filter: any `Expense`
  that already has `statementBalance` set is removed from the candidate pool, in both the confident
  auto-match path and the "possible match" human-review path.
- **Correct date/amount on match** (§8): on commit, if a matched pair's dates differ, update the
  `Expense`'s own `date` to the statement row's date. For user-resolved "possible" matches with a
  close-but-not-exact amount, also correct the amount. No new confirmation dialog.
- **Attach checkpoints on commit** (§4/§7): whenever the confirmed column mapping includes a balance
  column, set `statementBalance` on every row this import touches — both newly-created rows and
  matched-and-enriched existing ones.
- **Cash-withdrawal retroactive transfer prompt** (§17 Finding 1): when a statement row carrying a
  cash-withdrawal narration code *matches* an existing plain expense (not just when building a new
  one), still surface the "looks like a transfer to your cash account — convert it?" prompt.
- **Covered-range tracking + continuity gate** (§11b): record each import batch's actual date range;
  before finalizing a new import, compare against existing ranges and warn on a gap (never block —
  a genuinely statement-free period is possible, e.g. a dormant account).
- **Skipped-row visibility** (§11a): track and durably display counts of matched / added / *excluded*
  rows per batch, not just matched/added.
- **Deferred lone-wolf escalation** (§12): a lone wolf dated within ~3 days of the current statement's
  coverage boundary gets a "provisional" status, not an immediate flag; escalate only once an adjacent
  period's import has also failed to explain it.
- **Opening-balance capture and anchor-shifting** (§10a/§14): on an account's first-ever bank-statement
  import, prompt to confirm/parse the true opening balance (per the user: **ask**, don't assume, even
  when parseable — parsing is a nice-to-have suggestion to prefill the prompt, not an auto-fill).
  On importing a statement earlier than the current `openingBalanceAsOfDate`, run an explicit
  anchor-shift flow: derive the new anchor value/date, leave everything at/after the old anchor
  untouched, and flag (never auto-resolve) any disagreement between the new anchor's implied value and
  the old one (§14b — this needs a human: real backfill defect, or was the original guess simply
  wrong).
- **Re-check forward after any retrospective import** (§10b): recompute checkpoint diffs for every
  date after a backfilled range, not just the newly-imported range itself.

## 6. UI/UX implications (high level only — no mockups yet, none should be built without one)

Per the project's standing rule, **every UI surface below needs a mockup in `docs/mockups/proposals/`
before any `apps/mobile` code**, grounded in the real current bank-import screens
(`apps/mobile/src/features/bank-import/`). Nothing below is approved for implementation yet — this is
a list of what will eventually need a mockup, not a spec for one:

- A visual marker on whichever transaction(s) represent a checkpoint diff's "last agreeing" /
  "first disagreeing" pair (§7b/§7c/§17) — likely a border or small badge on the transaction row.
- A gap-warning banner at import time when covered-date-ranges don't abut (§11b).
- A skipped-row count on the import commit confirmation and in batch history (§11a).
- The opening-balance confirm/anchor-shift prompt (§10a/§14) — likely reuses `PpfFields`-style inline
  form patterns already established for the PPF import flow's own missing-details gate, as a design
  reference, not a literal copy (different domain).
- The ambiguous-multi-candidate transfer choice (§13).
- Any copy distinguishing "flat from day one → check your opening balance" vs. "step partway through →
  look between these two dates" diagnostic messages (§7d vs §7b/7c).

## 7. Implementation layout — staged build order

Each stage should be independently buildable and testable before the next starts. Mirrors this
session's own EPF/PPF staging pattern (core logic + tests first, mockup for any UI piece, confirm with
user before implementation, full verification sweep only at commit time — not after every file).

**Stage 0 — Data model foundations — ✅ built 2026-08-08**
- Add `Expense.statementBalance`, `Expense.reconciledSeq`, `Account.openingBalanceAsOfDate`,
  `Account.coveredStatementRanges` to `packages/core/src/core/db/types/index.ts`.
- Update `docs/SCHEMA.md`.
- No behavior change yet — just the fields existing and round-tripping through `EncryptedRepository`.
- Confirmed no Dexie schema version bump needed, and not just by inference: `EncryptedRepository.put()`
  (`packages/core/src/core/db/repository.ts`) `JSON.stringify()`s the whole record and stores it as
  opaque ciphertext; `decryptRow()` `JSON.parse()`s it straight back. Dexie itself only ever sees
  `{ id, iv, ciphertext }` — it has no schema awareness of `Expense`/`Account`'s own fields at all, so
  an added optional field can never require a version bump for these encrypted stores, by construction.

**Stage 1 — Checkpoint attachment + two-tier matching — ✅ built 2026-08-08** (the core mechanism, §4/§17)
- Tier 1 exact-provenance lookup: `findProvenanceMatch()` (private helper, `matcher.ts`) — normalizes
  the incoming row's narration and checks `importRecords` (now threaded through `matchStatementRows()`
  as two new, backward-compatible, default-`[]` parameters) for an accountId+date+exact-amount+
  normalizedKey match. A hit resolves via the record's `linkedTxnId` looked up in `allExpenses`, and is
  pushed straight into `matched` — bypassing Tier 2 entirely, checkpoint-exclusion included.
- Tier 2 candidate-pool exclusion: one added clause (`e.statementBalance == null`) in the existing
  per-row `available` filter inside `matchStatementRows()`'s loop — deliberately scoped to that filter
  only, not to the `pool` variable lone-wolf detection also reads, since the plan's exclusion is about
  match-candidacy, not lone-wolf visibility (nothing in §17 asks for the latter).
- New file `packages/core/src/core/bank-import/checkpoint.ts`: `attachCheckpoint()` (new rows) and
  `reconcileMatchedExpense()` (matched pairs — date always corrected, amount corrected, checkpoint
  attached; returns `undefined` on a genuine no-op so the caller can skip the write). Both are pure,
  core-layer functions — `useBankImport.ts`'s commit flow just calls them and does the I/O.
- Wired into `useBankImport.ts`: `confirmMapping()` now passes `importRecords`/`overrides` (already
  loaded hook state) to `matchStatementRows()`; `commitAndImport()`'s matched-pairs loop now also calls
  `expensesRepo.put()` with `reconcileMatchedExpense()`'s result (today it only ever wrote a provenance
  record), and the new-rows loop passes every staged expense through `attachCheckpoint()` before saving.
- Tests (`packages/core/tests/bank-import/matcher.test.ts` + new `checkpoint.test.ts`, 13 new cases,
  98/98 bank-import tests and 765/765 whole-package tests passing): the exact "31-Mar ₹240 checkpointed
  vs. 2-Apr ₹240 unrelated" regression from §17 (plus a control case proving a *non*-checkpointed
  transaction still matches normally); re-import idempotency via Tier 1 even when the linked expense is
  already checkpointed (proving Tier 1 correctly bypasses Tier 2's exclusion, not just coincidentally
  avoiding it); a Tier-1-near-miss case (provenance recorded for a different amount) correctly falling
  through to Tier 2's exclusion instead of false-matching; `attachCheckpoint`'s three cases (sets/no
  balance column/no value that row); `reconcileMatchedExpense`'s six cases (no-op, date-only,
  amount-only, both + checkpoint, checkpoint-gated-off, already-identical-checkpoint no-op).

  **Adjustments made while implementing (deviating from the plan text, with reasoning):**
  1. **Amount correction implemented unconditionally, not special-cased to "user-resolved possible
     matches."** §8/decision-7 describe amount-correction as applying specifically to user-resolved
     fuzzy matches. In practice every *automatically*-produced pair (Tier 1's exact-provenance hit,
     Tier 2's confident auto-match) already requires an exact amount by construction (`isExactAmount`
     is baked into both), so applying the correction unconditionally to every matched pair is
     behaviorally identical to the plan's description — it's a no-op for the automatic paths and only
     ever actually changes anything for a manually reassigned/resolved pair — while avoiding the need
     to track "which tier/bucket produced this pair" as extra state through to commit time.
  2. **Checkpoint attachment (`statementBalance`) explicitly gated to `Account.type === 'bank'`** at
     the single call site in `useBankImport.ts`'s commit flow (`attachesCheckpoints = !!confirmedMapping
     ?.balance && account?.type === 'bank'`). The original Stage 1 bullet list didn't spell this out,
     but §10's Finding 2 (confirmed) explicitly requires it: "that exclusion needs to be explicit in
     Stage 1+ implementation, not assumed to fall out naturally." Gating at this one point is sufficient
     — since `statementBalance` can now only ever exist on a `bank` account's `Expense`, Tier 2's
     exclusion and the whole checkpoint mechanism automatically never engages for credit cards, with no
     separate gate needed inside `matcher.ts`/`checkpoint.ts` themselves.
  3. **Date/amount correction (§8) deliberately NOT gated by account type** — unlike checkpoint
     attachment, this is a general match-quality fix (a matched pair's date/amount should reflect
     ground truth regardless of which account it's on), independent of the bank-only-scoped balance-
     verification guarantee. `reconcileMatchedExpense()`'s `hasBalanceColumn` parameter only gates its
     `statementBalance` branch; its date/amount branches are unconditional.
  4. **`isExactAmount` promoted from a private helper to an exported one** in `matcher.ts`, so
     `checkpoint.ts` could reuse the exact same tolerance definition instead of redefining it.
  5. **No normalized-key index was needed** on `bankStatementImportsRepo`'s record shape (§4's "revisit
     when building this stage" note) — a plain linear `.find()` scan over the in-memory `importRecords`
     array passed into `matchStatementRows()` is more than adequate at the scale one account's import
     history actually reaches. Revisit only if that assumption stops holding.

**Stage 2 — Covered-date-range tracking + continuity gate — ✅ built 2026-08-08** (§11/§12)
- `Account.coveredStatementRanges` populated on every completed statement-import commit
  (`useBankImport.ts`'s `commitAndImport()`) — one `ImportBatchSummary` per batch (new named type,
  `packages/core/src/core/db/types/index.ts`), consolidating what §4's original sketch split across
  "the range" and "#2's counts" into one record, per this stage's own judgment call: `{ batchId, start,
  end, importedAt, fileName, matchedCount, addedCount, skippedCount, skippedRows }`. `start`/`end` are
  the file's own actual min/max transaction date (`parseResult.rows`), never assumed. One store, not
  two — `skippedRows` (narration/date/amount) lives on this same entry rather than a second parallel
  table, since `bankStatementImportsRepo`'s existing record shape requires a real `linkedTxnId`
  (`useExpenses.ts`/`merchantMemory.ts` both key off it) and a skipped row has no linked transaction by
  definition.
- New pure core module `packages/core/src/core/bank-import/coverage.ts`: `detectCoverageGap()` (§11b's
  table — adjacent/no-history → `null`, overlap → `null` per §15, a real gap → its own boundary dates,
  robust to incidental time-of-day noise via `daysBetween`) and `countSkippedRows()` (§11a's `N-M`
  arithmetic, extracted as its own tested unit rather than inlined).
- Gap-detection banner wired into `SetupStep.tsx`, in the exact slot the mockup specifies — right after
  the existing mapping-preview `Banner`, before "Continue to review" — reading a new `bi.coverageGap`
  memo off `useBankImport.ts` (computed from the live `mappingPreview`, so it's visible before the user
  even confirms the mapping). Advisory only; never blocks.
- Skipped-row count + breakdown now shown on `DoneStep.tsx`'s post-commit "Import complete" card (New /
  Confirmed matches / Excluded / Lone-wolf actions, plus the "N rows found · M handled, K skipped" line)
  — replacing the old one-line "N new · M linked" summary, matching mockup v2 §4 exactly.
- New screen `apps/mobile/src/features/bank-import/BankImportHistoryPage.tsx` (registered in
  `HomeStack.tsx` as `BankImportHistory: { accountId?: string } | undefined`), reachable from a new
  header icon on `AccountsPage.tsx` (next to Merchant recognition / Cash-withdrawal codes). List +
  batch-detail drill-in match mockup v2 §4 directly.
- Deferred lone-wolf escalation (§12): `LoneWolf` gained a `status: 'provisional' | 'escalated'` field;
  `deriveLoneWolves()`/`matchStatementRows()` both gained an `otherCoveredRanges` parameter (default
  `[]`, backward-compatible). A lone wolf away from either statement boundary escalates immediately
  (the §12 control case); one near a boundary stays `'provisional'` unless some OTHER already-completed
  import's own coverage (extended by the same ±3-day grace window) already reaches its date — meaning a
  second period has already had its chance and failed, which is when it escalates. `useBankImport.ts`
  threads `account?.coveredStatementRanges` into both the one-shot `matchStatementRows()` call and the
  live-reactive `loneWolves` memo. `LoneWolfBucket.tsx`'s copy/color now key off `status` instead of the
  old direct `nearEdge` check (no mockup existed for this specific review-screen tweak — kept minimal,
  reusing the bucket's existing visual language: `theme.info` for provisional, `theme.warning` for
  escalated).

  **Deviations from the plan text, with reasoning:**
  1. **Batch tracking applies to `credit_card` accounts too, not just `bank`.** The plan's Stage 2 bullet
     list didn't say either way, but the v2 mockup's own §1 note is explicit: "Import History itself
     still lists a credit card's import batches — matched/added/skipped counts are batch-level facts,
     not checkpoint facts." So `coveredStatementRanges` population, gap-detection, skipped-row tracking,
     and lone-wolf escalation are all built account-type-agnostic (any statement-importable account);
     only the pre-existing checkpoint mechanism (`Expense.statementBalance`, Stage 1) stays gated to
     `bank`.
  2. **Import History needed an account-picker step the mockup doesn't show.** The mockup's list/detail
     frames are already scoped to one account (a "HDFC Savings" subtitle), but the task's own entry-point
     instruction was "reachable from `AccountsPage.tsx` the same way as the existing header icon
     actions" — which are global, not per-row. Since `Account.coveredStatementRanges` is inherently
     per-account data, `BankImportHistoryPage` owns one extra "which account?" state itself (shown only
     when entered without an `accountId`, i.e. always today, via the header icon) before the mockup's own
     list/detail states — rather than adding a second, per-row entry point that would duplicate
     `AccountList.tsx`'s existing per-row "Import" action's place in the UI. `BankImportHistory`'s route
     param is `{ accountId?: string } | undefined` for this reason, not the plan's implicit assumption of
     a required `accountId`.
  3. **No separate "escalated a second time" persistence.** §12's mechanism is entirely re-derived live
     at each import's review step from `Account.coveredStatementRanges` (already durable) — nothing
     about a lone wolf's provisional/escalated status itself needs its own storage, since it's always a
     function of the account's already-persisted batch history at read time, same as `nearEdge` already
     was pre-Stage-2.

  **§3 decision #16 hardening pass — built 2026-08-08, additive to Stage 2, not a new stage number.**
  Closes the exact gap decision #16 names: `deriveLoneWolves()`'s `'provisional'`/`'escalated'`
  mechanism (left completely untouched by this pass) only ever runs live, during one specific import's
  own review screen — nothing re-checked a transaction left `'provisional'` there once an adjacent
  statement was later imported, unless the user happened to revisit that exact review flow again.
  - New pure function `findStandingCoverageGaps()` (`packages/core/src/core/bank-import/coverage.ts`,
    alongside `detectCoverageGap()`/`countSkippedRows()` — same file reads better than a new one once
    the actual shapes were in hand) — takes an account's own `coveredStatementRanges`, `Expense[]`, and
    `BankStatementImportRecord[]` (all three pre-scoped to one account by the caller; the function has
    no `accountId` parameter of its own and does no filtering), merges the covered ranges into their
    union via a new `mergeCoveredRanges()` helper (exported alongside it), and returns every expense
    dated inside that union with no `BankStatementImportRecord.linkedTxnId` pointing at it. Read-only
    diagnostic, no new mutable entity, same "always derived, never stored" philosophy `computeBalance()`
    itself already follows — needs no new persisted tracking list, exactly as decision #16 specifies.
  - Wired into `BankImportHistoryPage.tsx` (`apps/mobile/src/features/bank-import/`): `BatchListView`
    now re-derives `standingGaps` on every render from the *selected account's* full expense/import-
    record history (not scoped to any one batch — a standing gap isn't owned by a batch), and shows a
    `Banner` (`variant="warning"`) above the batch list when any are found. **Explicitly a placeholder
    surface** — decision #16 itself says this finding should eventually feed Stage 4's persistent
    "unverified account" badge (once that exists) rather than remaining its own separate indicator
    long-term; both the code comment at the call site and this write-up flag that intent so it isn't
    forgotten when Stage 4 is built.
  - Tests (`packages/core/tests/bank-import/coverage.test.ts`, 8 new cases: 3 for `mergeCoveredRanges`,
    5 for `findStandingCoverageGaps` — full file now 17/17 passing, whole bank-import suite 120/120): a
    gap expense inside a covered range with no link → flagged; a linked expense → not flagged; an
    expense outside any covered range entirely → not flagged (nothing claims to explain it); two
    overlapping covered ranges (e.g. from a re-import) → merged into one continuous union, with an
    expense sitting exactly at the overlap seam and another only reachable via the second range both
    correctly caught exactly once, not double-flagged or missed; no covered ranges at all → nothing
    flagged.
  - Deliberately does **not** touch `LoneWolf`/`'provisional'`/`'escalated'` at all, per decision #16's
    own instruction that the in-review-screen softening "can stay as a softer in-the-moment hint ... it
    just stops being the *only* mechanism; the full sweep is the backstop" — the two are complementary,
    read independently, one live/import-scoped and one full-history/always-on.

**Stage 3 — Opening-balance anchor + first-import/backfill flows — ✅ built 2026-08-09** (§10a/§14)
- New pure core module `packages/core/src/core/bank-import/openingBalanceAnchor.ts`:
  `isFirstEverImport()` (empty `coveredStatementRanges`), `currentAnchorDate()` (explicit
  `openingBalanceAsOfDate`, else the earliest covered range's own `start` — an unset date means the
  anchor was always implicit "before everything currently covered"), `isAnchorShiftImport()` (a new
  range starting before the current effective anchor; mutually exclusive with `isFirstEverImport` by
  construction), `deriveOpeningBalanceSuggestion()` (from the statement's own chronologically-first
  row: `suggestedOpeningBalance = firstRow.balance − signedAmount(firstRow)`, `undefined` when no
  Balance column was mapped or that row had no value), `rowsAsCandidateTxns()`, and
  `computeAnchorShiftCheck()` (§14a/§14b's disagreement check — projects forward from the new anchor
  across every transaction in `[newAnchorDate, oldAnchorDate)` using `delta()`, compares to the OLD
  `openingBalance` at ±₹1 tolerance). All pure, all reuse `balanceCalculator.ts`'s own `delta()` rather
  than reinventing debit/credit sign math.
- **Anchor-date convention, resolved** (the plan text originally left this as "your call"): the anchor
  date is the SAME calendar day as the anchor transaction's own date, not "the day before" — bank
  statements only carry day-level granularity, so there's no independently-real "day before" value to
  anchor to instead. "As of &lt;date&gt;" reads the standard accounting way (balance held at the very
  start of that day, before that day's own transactions post), matching the v2 mockup's own field
  label ("Opening balance, as of 1 Apr 2026" sitting directly against the first row's own date).
- **Trigger logic** lives in `useBankImport.ts`'s new `openingBalanceTrigger` memo, evaluated the
  moment a mapping produces a non-empty live preview (same timing as the existing `coverageGap`
  banner — visible before "Continue to review" is even tapped), gated to `account.type === 'bank'`
  (§3 decision 1/§16 Finding 2, same gate Stage 1's checkpoint attachment already uses).
- **UI**: new `OpeningBalancePrompt.tsx` (`apps/mobile/src/features/bank-import/`), rendered by
  `SetupStep.tsx` IN PLACE OF the plain "Continue to review" button whenever `openingBalanceTrigger`
  is set — grounded exactly in `docs/mockups/proposals/bank-balance-sync-v2.html` §5/§6 (both the
  parsed-prefill and manual-entry first-import states, the §14a clean single-button confirmation, and
  §14b's three-choice disagreement screen including "Accept"'s own follow-up confirmation frame before
  it actually proceeds). One documented extension beyond what the mockup itself depicts: an
  anchor-shift import whose earlier statement has no Balance column at all (so no suggestion is
  derivable) reuses the first-import flow's manual-entry pattern instead of having no path forward —
  not shown in v2's own §6 frames (both its worked examples assume a mapped Balance column).
- **Commit-time write**: nothing touches the real vault before `commitAndImport()` (§10b's commit
  model, unchanged) — each screen's choice stages a `PendingOpeningBalanceUpdate`
  (`apps/mobile/src/features/bank-import/types.ts`: `'move'` when the anchor's VALUE actually changes —
  first-import confirm, §14a clean shift, or §14b's "Accept"; `'pin'` when only the anchor's DATE is
  made explicit with its value untouched — §14b's "Keep original, flag for later" (with the
  disagreement recorded) and "Review rows first" (without it)). Applied inside the same
  `accountsRepo.put()` call that already writes the batch's own `coveredStatementRanges` entry.
  `'pin'` exists specifically to prevent a latent bug: once this batch's own earlier date range is
  appended to `coveredStatementRanges`, an account whose `openingBalanceAsOfDate` was still unset
  (implicit anchor) would otherwise have its EFFECTIVE anchor silently drift earlier next time
  `currentAnchorDate()` runs, without `openingBalance` itself ever having been confirmed for that
  earlier date — pinning the date explicitly (to what it already implicitly resolved to, right before
  this commit) makes that a no-op today and closes the gap for future imports.
- **§14b's "flag for later" persistence**: new `Account.anchorDisagreement` field (Stage 3 addition,
  additive/no schema bump, same reasoning as Stage 0's other fields) — `{ detectedAt,
  oldOpeningBalance, oldAnchorDate, impliedOldBalance, diff }`. Per the mockup's own "one status slot,
  two possible causes" design, this is meant to feed the SAME persistent account-level "unverified"
  surface a checkpoint mismatch would once Stage 4 builds it — Stage 3 only persists the fact; no
  dedicated banner UI reads this field yet (an explicit, documented Stage 4 dependency, same pattern as
  decision #16's own standing-gap banner placeholder from Stage 2).
- **Tests** (`packages/core/tests/bank-import/openingBalanceAnchor.test.ts`, 19 new cases — whole
  bank-import suite now 139/139, whole package 806/806): first-ever-import detection (empty vs.
  non-empty `coveredStatementRanges`); `currentAnchorDate`'s explicit-vs-implicit-fallback vs.
  first-import-undefined cases; anchor-shift trigger with both an explicit `openingBalanceAsOfDate`
  and the unset/earliest-covered-range fallback, plus the "at or after → doesn't trigger" and
  "mutually exclusive with first-import" cases; `deriveOpeningBalanceSuggestion`'s debit/credit
  derivation, same-day `rowIndex` tie-break, no-balance-column/empty-rows → `undefined`;
  `rowsAsCandidateTxns`'s debit→expense/credit→income mapping; and the exact §14a (agrees, diff `0`)
  and §14b (disagrees, diff exactly ₹2,000) simulation numbers, plus a sub-₹1 tolerance case and an
  unrelated-account-is-ignored case (proving `delta()`'s own filter is doing the work, not a
  reimplementation of it).
- **Deliberately deferred to Stage 4, not built here** (§10b's general "recompute forward" rule):
  `computeAnchorShiftCheck()`'s own doc comment is the documented hook/extension point — it is a
  narrow, self-contained calculation scoped to just the two anchor points (in scope for Stage 3 per
  this stage's own instructions), and does NOT attempt the general "recompute every checkpoint after
  any retrospective import" rule, which needs Stage 4's full checkpoint-diff-walking engine. Flagged
  explicitly so this isn't mistaken for "Stage 3 already does §10b in full" — it doesn't; Stage 4's
  diagnostic engine, once built, should re-run its own full recompute after any retrospective import
  rather than trusting this check's result as final.

**Stage 4 — Checkpoint-diff diagnostics UI — ✅ built 2026-08-09** (mockup v2 §2 was the exact,
implementation-ready spec — built exactly that, no freelanced design)

- **Diagnostic engine** — new pure core module `packages/core/src/core/bank-import/
  checkpointDiagnostics.ts`: `computeCheckpointDiagnostics(accountId, openingBalance, txns,
  toleranceRupees = 1)` walks an account's own transactions chronologically (sorted by `date`, then
  `reconciledSeq` when set on more than one same-day row, else stable array order — Stage 5 isn't built
  yet so `reconciledSeq` is rarely present today, but the sort already honors it once it is), reusing
  `balanceCalculator.ts`'s own `delta()` for the running-balance math rather than reinventing it.
  **Day-bucketing (§7e)**: same-calendar-day transactions are walked as ONE combined checkpoint at
  day's end — the comparison's `computedBalance` always reflects every transaction dated that day, not
  just the one checkpointed row; when a day has more than one checkpointed transaction, the last one in
  sorted order is the representative row shown/highlighted (documented simplification, not a guess:
  without Stage 5's intra-day sequencing there's no ground truth for which same-day statement row was
  truly last). **Sign convention** matches the simulation's own tables exactly: `diff = statementBalance
  − computedBalance` (not the reverse) — positive means the bank shows MORE than Penny does. Produces
  the full ordered `comparisons[]`, `verified` (no checkpoints yet, OR every one agrees within
  tolerance), and — on a mismatch — the exact last-agreeing/first-disagreeing pair plus which signature
  fired: `'steps-partway'` (an agreeing checkpoint existed before the gap) or `'flat-from-start'` (no
  checkpoint ever agreed, not even the first). Tested against the simulation's own §7a (happy path,
  13/13 agree)/§7b (missing transaction)/§7c (duplicate)/§7d (wrong opening balance) numbers as exact
  regressions, plus edge cases (no checkpoints at all, a checkpoint on an unrelated account, a
  transfer's credit side never itself becoming a checkpoint, sub-tolerance diffs).
- **Unifying the three signal sources into ONE badge** — new pure core module `core/bank-import/
  accountVerification.ts`: `computeAccountVerificationStatus()` checks this stage's own checkpoint
  mismatch, Stage 2's `findStandingCoverageGaps()` sweep, and Stage 3's `Account.anchorDisagreement`,
  and returns AT MOST ONE `activeFinding` (decision #9: never three competing indicators). **Priority
  when more than one fires at once** (a real judgment call, not spec'd by the plan text): checkpoint-
  mismatch > anchor-disagreement > standing-gap — most-precise/most-actionable first, the standing-gap
  sweep is explicitly the "backstop" per decision #16's own wording so it naturally sits last. Each
  finding still carries its OWN raw payload (never forced into identical copy) — core returns
  structured facts only; `apps/mobile`'s `verificationCopy.ts` composes the exact mockup wording per
  kind (matching this codebase's existing `coverage.ts`/`openingBalanceAnchor.ts` division of labor).
  `BankImportHistoryPage.tsx`'s standing-gap banner is KEPT (still useful in that screen's own narrower
  per-account-import-history context) but is no longer the only place a standing gap surfaces.
- **Dismiss, scoped to the specific finding** (decision #9) — new `Account.dismissedVerificationFindings?:
  { fingerprint, dismissedAt }[]` field (additive/optional, same pattern as every other field this plan
  has added). Each finding kind gets its own stable fingerprint of its identifying facts (`checkpoint:
  <lastAgreeingId>:<firstDisagreeingId>`, `standing-gap:<sorted expense ids>`, `anchor:<detectedAt>`) —
  dismissing one never silences a later, different finding on the same account, including a different
  finding of the SAME kind (e.g. a new checkpoint pair once the old gap is fixed). "Re-open" removes one
  specific dismissal. Tested: an account with only a standing gap / only an anchor disagreement / only a
  checkpoint mismatch each independently show the badge; dismissing a standing gap doesn't suppress a
  later unrelated checkpoint mismatch; a different checkpoint pair isn't silenced by an old dismissal;
  re-dismissing the same fingerprint stays muted.
- **UI** (`apps/mobile`, all reachable from the account list per mockup's Frame 1→4 chain):
  - `AccountList.tsx`: new `CHECKPOINT_ELIGIBLE = new Set(['bank'])` constant (`useAccountVerification.ts`,
    the single source of truth every Stage-4 consumer imports) gates the "Unverified" pill shown in
    place of the account-type pill — binary at list level, exactly per the mockup's own "the badge only
    ever means needs a look" note.
  - `AccountVerificationBanner.tsx` (new) — the account-detail snapshot banner, all 6 mockup states
    (loading / verified / never-imported / mismatch-collapsed / mismatch-expanded / dismissed), wrapped
    by `AccountDetailModal.tsx` (new) around the existing `EntityTransactionsModal` (which gained two
    new generic, bank-import-agnostic slots for this: `banner`/`footer` props, both `undefined`
    everywhere else it's used).
  - Transaction-list drill-in (Frame 3, `'steps-partway'` only): `TransactionsTab.tsx` gained an
    optional `checkpointHighlight` prop (marks + an optional divider + a scroll-to target, via
    `FlashList`'s own `scrollToItem` ref API) — omitted everywhere else, zero behavior change for every
    other caller. Renders a small `Badge` ("Last agreeing"/"First disagreeing"/"Still unexplained") and
    a tinted background on the marked rows.
  - `CheckpointTimelinePage.tsx` (new screen, registered in `HomeStack.tsx`) — the full ledger-style
    escape hatch (Frame 4), branching its own rendering per signature rather than being two separate
    routes.
  - `CheckOpeningBalancePage.tsx` (new screen, registered in `HomeStack.tsx`) — the "check your opening
    balance" destination (Frame 2b's second frame) for BOTH a `'flat-from-start'` checkpoint mismatch
    AND an anchor disagreement ("one status slot, two possible causes") — three honest actions (update
    the opening balance directly, jump to a fresh import, or dismiss), none auto-applied. Reuses the
    anchor-strip VISUAL pattern already established for Stage 3's `OpeningBalancePrompt.tsx`, but is a
    genuinely separate, standalone screen (different actions — this isn't an in-progress-import flow).
- **Scoped `npx tsc -b packages/core apps/mobile`**: clean, both projects. Full `packages/core` test
  suite: 822/822 passing (up from 806 pre-Stage-4).

  **Two fixes, made post-build 2026-08-09 (both narrow, no new signature category invented):**
  1. **`'flat-from-start'` had no secondary "view full data" path into `CheckpointTimelinePage`,
     unlike `'steps-partway'`.** `'steps-partway'` routes to the transaction-list drill-in (Frame 3)
     WITH a "View full reconciliation table" escape hatch (`AccountDetailModal.tsx`'s footer) into the
     timeline for anyone who wants the raw data anyway. `'flat-from-start'` correctly routes straight to
     `CheckOpeningBalancePage.tsx` as its primary destination, but that page had no equivalent secondary
     path — even though `CheckpointTimelinePage.tsx` already fully supports rendering the
     `'flat-from-start'` variant (it always has, via its own `signature === 'flat-from-start'` branch)
     when reached some other way. Fixed by adding the SAME "View full reconciliation table" ghost button
     (identical label/style) to `CheckOpeningBalancePage.tsx`, alongside its existing three actions —
     shown only when the active finding is a `checkpoint-mismatch` (not for an anchor-disagreement,
     which has no checkpoint timeline of its own to show).
  2. **`classifyMismatch()` never verified a `'flat-from-start'` diff actually STAYS flat.** It
     classified purely on the first disagreeing checkpoint being at index 0, without checking whether
     the diff then holds constant across every later checkpoint too — the actual definition of "flat"
     per simulation §7d ("a flat, unchanging diff from the very first checkpoint"). A diff of, say,
     +1,000 at the first checkpoint but +1,500 at a later one is a compound situation: the opening
     balance is still the right first thing to check, but there's evidently also a second, separate
     issue starting somewhere later that fixing the opening balance alone won't resolve. Fixed by adding
     `CheckpointMismatch.diffStaysConstant?: boolean` (`'flat-from-start'` only, `undefined` for
     `'steps-partway'`) — `true` when every comparison's diff matches the first one within tolerance,
     `false` otherwise — computed inline in `classifyMismatch()`. Wired into `verificationCopy.ts`'s
     `describeFinding()`/`describeDismissed()` (both the banner headline/detail and the dismissed-line
     copy branch on it, since claiming "constant" would otherwise be inaccurate when it's `false`) and
     into `CheckOpeningBalancePage.tsx`'s own inline caveat text, with a short, honest addition ("the gap
     size also changes later on, so there may be more than one issue") — matching this plan's own §8/§10c
     "known limitation" tone, not an alarm. **Deliberately does not add a third signature category** —
     still exactly the two the plan defines (`'flat-from-start'` / `'steps-partway'`), this is a
     refinement of one field within the existing `'flat-from-start'` case only.
  - **Tests**: Fix 1 has no mobile test to add — `apps/mobile` has zero existing test files/infrastructure
    (confirmed via a repo-wide search before deciding this), so per the task's own "use your judgment on
    what's actually testable" instruction, this stayed a UI-only change, not a new test harness. Fix 2:
    two new cases in `packages/core/tests/bank-import/checkpointDiagnostics.test.ts` (whole file now
    9/9, whole bank-import suite 156/156) — the existing §7d regression case gained a
    `diffStaysConstant === true` assertion (no new scenario needed, since §7d's own numbers already
    satisfy the "stays flat" case exactly); a new, clearly-labeled SYNTHETIC case (§7d has no
    compound-mismatch example of its own to reuse) bumps every checkpoint from 8-May onward by an extra
    +₹500 on top of the existing +₹1,000 opening-balance-driven offset, producing a diff that's flat at
    +1,000 through 3-May then steps to a new steady +1,500 from 8-May on — asserting `'flat-from-start'`
    still correctly fires (the very first checkpoint never agreed) with `diffStaysConstant: false`.

**Stage 5 — Intra-day sequencing — ✅ built 2026-08-09** (§9 — resolved 2026-08-08: build for v1, not
deferred)
- **Mechanism, clarified 2026-08-08** (the user asked directly how this would actually work, given
  bank statements only carry a date, never a time): `reconciledSeq` is derived from the statement's
  own row *position* for that calendar day (`ParsedStatementRow.rowIndex` already exists and already
  gives us this — banks always print a day's rows in true chronological order even though the date
  column itself has no time granularity), **never** from `Expense.date`'s time-of-day component,
  which isn't a meaningful signal for either manual entries (defaults to save-time, not event-time) or
  imported rows (no time column to read in the first place). Synthesizing a fake precise time would
  violate the "ground truth only, never invented" rule the whole checkpoint design follows — keep it a
  separate, explicit, per-day-scoped integer (1, 2, 3…) instead. Sort order for any
  checkpoint/display purpose: `date` (day-level) first, `reconciledSeq` as tie-break when present,
  stable fallback otherwise (already implemented by Stage 4's `buildComparisons` sort, unchanged here).
- **Day-completeness + sequence assignment** — new pure core module `packages/core/src/core/
  bank-import/reconciledSeq.ts`: `computeDaySequence(resolvedThisDay, otherUnexplainedCount)` returns
  `fullyExplained: false` (and assigns nothing) the moment `otherUnexplainedCount > 0` — i.e. any
  OTHER Penny transaction on that account/day this import didn't itself resolve (matched or newly
  created); otherwise assigns each resolved transaction a dense 1-based `reconciledSeq` sorted by the
  statement's own `ParsedStatementRow.rowIndex` (never date or insertion order). `groupResolutionsByDay`
  buckets a whole import's rows by calendar day; `countOtherUnexplainedByDay` computes the "other
  transactions" count per day from the account's existing transactions, excluding both this import's own
  resolved ids and anything this same commit is also deleting (a lone-wolf duplicate) — matches
  `Expense.reconciledSeq`'s own field doc comment ("explained by ONE statement's own rows"): mixing row
  order from two different statement files was deliberately never attempted, so completeness is always
  checked against a SINGLE import's own rows, not a cross-import union.
- **When it's assigned**: automatically, at commit — not something surfaced for the user to set during
  review. Wired into `useBankImport.ts`'s `commitAndImport()`, computed once (per calendar day this
  import's own rows touch) right after `attachesCheckpoints` is resolved and before either write loop
  runs, then merged into the same `expensesRepo.put()` each row already needed for Stage 1's checkpoint
  attachment / date-amount correction — no extra write pass. Gated by the same
  bank-account-and-mapped-balance-column condition as checkpoint attachment itself (a `reconciledSeq`
  with no checkpoint to order would be pointless).
- **Re-evaluated, not fixed forever**: the "re-check forward" hook (§10b's general rule) needed no
  separate mechanism — `computeDaySequence` always re-derives a day's sequence from scratch at every
  commit that touches it, never trusting a previously-stored value, so a day left unsequenced by one
  import (something on it still unaccounted for) automatically gets sequenced the moment a *later*
  import's own rows complete it (tested explicitly: import A leaves a manual leftover unsequenced;
  import B — a fuller re-import whose own rows now also explain that leftover — sequences the whole day
  from its own row order).
- **Known limitation, accepted, not solved in v1**: this trusts the statement's own printed row order
  as ground truth. Real exports occasionally batch same-settlement transactions (e.g. several UPI
  payments) in an order that isn't strictly chronological even in the bank's own printing. No manual
  reorder/override UI is planned for this edge case — proportionate given Stage 5 is explicitly an
  enhancement on top of the core guarantee, not required for it.
- **A real bug, found reviewing this stage's own build and fixed 2026-08-09** (not the harmless
  footnote it was first reported as): if a day was already fully sequenced by one import and a *later*,
  unrelated transaction (e.g. a plain manual entry never touched by any import) lands on that same day,
  `fullySequenced`'s original check only verified that the day's *checkpointed* entries still carried a
  `reconciledSeq` — it never noticed the new, unrelated arrival at all. The sort comparator pushes any
  entry without `reconciledSeq` to the end of its day regardless of its true position, so the new
  arrival's own effect on the running balance got applied AFTER, not at its real point in the day —
  silently corrupting every per-transaction comparison computed for whatever fell after where it truly
  belonged. In a hand-worked case this produced two per-transaction comparisons both off by the exact
  same amount, which `classifyMismatch` reads as `'flat-from-start'`/`diffStaysConstant: true` — a
  confident "go check your opening balance" verdict for an account with nothing actually wrong beyond
  same-day ordering Penny never had grounds to assume. **Fix**: `fullySequenced` now requires the WHOLE
  day (every entry, not just the checkpointed subset) to carry `reconciledSeq` — a day that's still
  genuinely fully explained already satisfies this by construction (§Stage 5's assignment rule is
  always all-or-nothing per day), so this only ever changes the outcome for the exact case that was
  broken. Locked in by a regression test that fails without the fix (verified by hand: reverting the
  fix reproduces the false 2-comparison result before restoring it) and passes with it (one safe
  end-of-day comparison, `verified: true`, no false alarm).
- **`checkpointDiagnostics.ts`'s `buildComparisons()` upgraded to actually consume `reconciledSeq`** —
  this is the actual payoff, per this stage's own instructions. Per calendar day, once EVERY transaction
  in that day's cluster carries a `reconciledSeq` (not just the checkpointed ones — see the fix above),
  each checkpointed transaction now gets its OWN comparison, in true intra-day order, with
  `computedBalance` reflecting the balance immediately after that specific transaction — not the whole
  day. The moment even one transaction that day lacks `reconciledSeq`, the pre-Stage-5 fallback applies
  unchanged: the whole cluster collapses to one end-of-day comparison, using the day's last checkpoint
  in sorted order as the representative row.
  Tested against the simulation's own §9 worked example numbers (₹4,200 carried in → −₹3,000 ATM
  withdrawal → +₹2,000 UPI refund → ₹3,200): a fully-sequenced version of that day produces 2 separate
  comparisons; a variant with the ATM checkpoint's own stated balance off by ₹100 (but the day's net
  still correct) demonstrates a genuine mid-day mismatch a pre-Stage-5 end-of-day check would have missed
  entirely; two regression tests confirm the exact pre-Stage-5 single end-of-day behavior is unchanged
  both when NO transaction that day has `reconciledSeq` and when only SOME (not all) of the day's
  checkpointed transactions do.
- Fallback to end-of-day-only (already Stage 1/4's default) when any transaction that day isn't
  statement-explained.
- **Tests**: `packages/core/tests/bank-import/reconciledSeq.test.ts` (11 new cases — day-completeness
  detection, sequence assignment by `rowIndex` not insertion/date order, `groupResolutionsByDay`,
  `countOtherUnexplainedByDay`'s exclusion rules, and the full re-check-forward two-import scenario) +
  5 new cases in `checkpointDiagnostics.test.ts` (whole bank-import suite now 171/171, whole package
  838/838). Scoped `npx tsc -b packages/core apps/mobile`: clean, both projects.

**Stage 6 — Inter-account transfer refinements — ✅ built 2026-08-09** (§13)
- **Verified the existing `suggestPossibleTransfer` flow against the exact HDFC→ICICI scenario from
  simulation §13** — confirmed already working correctly, no fix needed: HDFC imported first (a
  NEFT-out row with no candidate anywhere) correctly lands as a plain new expense via
  `matchStatementRows`; ICICI imported later (a NEFT-in row) correctly falls to `unmatched` in
  `matchStatementRows` itself (nothing on ICICI's own account matches it) while `suggestPossibleTransfer`
  correctly surfaces the HDFC expense as the transfer candidate. Also confirmed the realistic non-
  breaking wrinkle: a same-side ₹5 NEFT fee recorded alongside the ₹20,000 transfer leg never gets
  swept into the suggestion or confuses it — its amount is nowhere near `isCloseAmount`'s tolerance, so
  it's never even a candidate. All three cases are now regression tests, not just a one-time manual
  check (`packages/core/tests/bank-import/matcher.test.ts`, new
  `describe('the HDFC→ICICI two-import scenario …')`).
- **Investigated the actual current behavior for 2+ equally-plausible candidates**: before this stage,
  `suggestPossibleTransfer` already refused to guess — `candidates.length !== 1` returns `null` — so an
  ambiguous row silently surfaced as "no suggestion" (identical to the zero-candidate case) rather than
  picking one arbitrarily. Correct per §13's "never auto-link" rule, but the tie was being dropped
  entirely instead of surfaced as a choice, which is the actual gap this stage closes.
- **Built**: `matcher.ts`'s single-candidate logic was extracted into a shared private
  `findTransferCandidates()`, with `suggestPossibleTransfer()` now a thin 0-or-1 wrapper around it and a
  new sibling, `suggestAmbiguousTransferCandidates()`, returning the full tied set (2+) or `null` (not
  ambiguous) — a genuinely separate function rather than overloading one return type, so a caller can
  tell "no suggestion" and "an ambiguous choice to resolve" apart. Threaded through `useBankImport.ts`
  as a new `suggestAmbiguousTransferCandidatesFor(row)` accessor, mirroring `suggestPossibleTransferFor`.
- **UI** — new `AmbiguousTransferPickerModal.tsx` (`apps/mobile/src/features/bank-import/`), built
  exactly to `bank-balance-sync-v2.html` §7's "Which transaction is this transfer?" spec (statement-line
  card, radio-select candidate list showing each candidate's own account, "Link selected as transfer" /
  "Neither — keep both separate", no auto-pick). Wired into `PossibleBucket.tsx`'s existing "no match —
  add as new" flow (the only place in the review UI that stages a brand-new transaction one row at a
  time — confirmed by reading the actual call sites, not from memory: `BulkCategorizeModal.tsx`'s own
  `suggestPossibleTransferForRow` usage only ever primes a bulk group's "Mark as transfer" toggle
  default, with a full manual account picker already available regardless of ambiguity, so it was left
  unchanged). A new `routeRowForAdding()` helper in `PossibleBucket.tsx` centralizes the three-way gate
  (cash-account choice → ambiguous-transfer choice → straight to `ExpenseForm`), same precedence the
  pre-existing cash-vs-cross-account fallback already used (narration-code cash detection always wins
  when both apply). Cancelling the picker (backdrop/X) resolves the same as "Neither" — the row already
  left the "Possible matches" bucket before this gate runs, so there's no "still undecided" state to
  fall back to; the user can still manually mark it as a transfer inside `ExpenseForm` itself either way.
- **Tests** (`packages/core/tests/bank-import/matcher.test.ts`): new `describe('suggestAmbiguousTransferCandidates', …)`
  covering the two-same-bank-accounts genuine-ambiguity case (both candidates returned, neither picked),
  the single-candidate case returning `null` (not ambiguous — regression proving the common case is
  unaffected), and the zero-candidate case. Whole `bank-import` suite now 178/178 (up from 171/171),
  whole `packages/core` suite 845/845. Scoped `npx tsc -b packages/core apps/mobile`: clean, both
  projects (verified with `--force` too, not just an incremental no-op).

**Stage 7 — Cash-withdrawal retroactive-transfer prompt — ✅ built 2026-08-09** (§17 Finding 1, the
LAST stage — this plan is now fully implemented)
- **Core**: two new exports in `packages/core/src/core/bank-import/cashWithdrawalCodes.ts`, both pure:
  - `suggestRetroactiveCashTransfer(matchedExpense, rawNarration, bankId, codes, cashAccounts)` — a
    thin wrapper around the existing `suggestCashTransfer()` (the narration-code detection itself is
    unchanged/unduplicated), adding exactly the one guard that's meaningless for a brand-new row but
    essential for a matched one: returns `null` immediately when `matchedExpense.type === 'transfer'`
    already (nothing to convert — the regression case this stage's own tests must not break).
  - `applyCashTransferConversion(expense, toAccountId, now)` — the accept-path mutation: `{ ...expense,
    type: 'transfer', toAccountId, updatedAt: now }`. Deliberately touches nothing else
    (description/category/amount/date all stay exactly as originally recorded) — unlike a brand-new
    row being built from scratch, a matched row already has real, user-entered content worth
    preserving; only the mis-typed direction is being corrected.
- **Wiring** (`apps/mobile/src/features/bank-import/useBankImport.ts`): `suggestRetroactiveCashTransferFor(pair:
  MatchedItem)` (parallels `suggestCashTransferFor`, additionally short-circuits to `null` when there
  are zero cash accounts at all — a bare "convert" chip with nowhere to point `toAccountId` at isn't
  actionable from this lightweight inline affordance) and `convertMatchedPairToTransfer(statementRow,
  toAccountId)` (a new mutator alongside `reassignMatchedPair`/`resolvePossibleMatch`, updating the
  staged `matchedPairs` entry's own `expense` in place — nothing is written to the real vault until
  `commitAndImport()`, which already calls `reconcileMatchedExpense()` on every matched pair and
  preserves whatever `type`/`toAccountId` it finds there, so no change to the commit path itself was
  needed).
- **UI** (`MatchedBucket.tsx`, the confirmed "matched pair renders here" call site) — a small,
  dismissible-only inline chip below any matched-pair row whose statement narration carries a
  cash-withdrawal code and whose expense isn't already a transfer: "🔁 Looks like a transfer to your
  cash account — convert it?" with "Convert" / "Not now". Grounded in the exact same visual language
  `PossibleBucket.tsx`/`UnmatchedBucket.tsx` already use for the identical new-row suggestion (same
  warning-tint banner, same "which cash account?" `Modal`/`SelectInput` picker for the 2+-cash-accounts
  ambiguous case, reusing that exact pattern rather than inventing a new one). "Not now" is session-only
  UI state (a local `Set` of dismissed row indices, never persisted) — re-opening the import re-derives
  the suggestion fresh from the expense's own (still-unconverted) `type`, same "dismissible, never
  silenced forever" philosophy every other suggestion in this feature already follows.
- **Tests** (`packages/core/tests/bank-import/cashWithdrawalCodes.test.ts`, 6 new cases — whole
  bank-import suite now 184/184): the exact §17 Finding 1 scenario (05-Apr "ATW HDFC ATM" matching
  Cashew's existing "Cash withdrawal" plain expense → suggestion fires with the resolved cash account);
  accepting it converts the expense to `type: 'transfer'` with the correct `toAccountId`, leaving
  description/category/amount/date untouched; a non-cash-code narration never suggests anything
  (regression, the common case); an already-`type: 'transfer'` matched expense never re-suggests
  (nothing to convert); the 2+-cash-accounts ambiguous case still fires with an unresolved `toAccountId`
  for the caller to resolve; and the pre-existing unmatched/new-row `suggestCashTransfer()` path is
  unchanged (regression — this stage only adds a new sibling, never modifies the original). Scoped
  `npx tsc -b packages/core apps/mobile --force`: clean, both projects.

Stages 6 and 7 were small and independent of the checkpoint machinery — this is exactly why they were
buildable after Stage 5 without disturbing it, per this section's own original note.

**Post-implementation fix — transfer checkpoint cross-contamination — found + fixed 2026-08-09** (patches
Stage 1's `checkpoint.ts`, surfaced by its interaction with Stage 6's transfer-matching)

Found during a final review of this plan's completed work, after all 8 stages above were already built:
`checkpointDiagnostics.ts`'s `buildComparisons()` has always documented and assumed the invariant "a
checkpoint (`Expense.statementBalance`) is only ever meaningful relative to `expense.accountId`, never
`toAccountId`" — but Stage 1's `attachCheckpoint()`/`reconcileMatchedExpense()` never actually enforced
it at write time; they wrote `statementBalance` unconditionally whenever the confirmed mapping had a
balance column, with no check on which account was actually being imported.

For a `type: 'transfer'` expense there is only ONE `statementBalance` field but TWO sides
(`accountId`/`toAccountId`), potentially two unrelated banks each with their own running balance. Stage
6's own transfer-matching candidate pool explicitly includes `e.toAccountId === accountId`, so a transfer
checkpointed correctly during Bank A's own import (`accountId = 'hdfc'`) could legitimately be matched
AGAIN, months later, when Bank B (`toAccountId = 'icici'`) imports its own statement independently —
and `reconcileMatchedExpense` would then silently overwrite HDFC's already-correct checkpoint with
ICICI's own unrelated balance figure, corrupting `checkpointDiagnostics.ts`'s diffs for that account from
that point on with no error, no warning, nothing in the UI. The same risk applied to `attachCheckpoint()`
for a brand-new transfer row created during commit — `useBankImport.ts`'s new-transfer construction
assigns `accountId`/`toAccountId` based on the statement row's debit/credit direction, so a newly-created
transfer's own `accountId` is not always the currently-importing account.

**Fix**: both functions now take a required `currentAccountId: string` parameter and only write/update
`statementBalance` when `expense.accountId === currentAccountId` — never when this account is only the
`toAccountId` side. Threaded through from `useBankImport.ts`'s two call sites (`commitAndImport()`'s
matched-pairs loop and staged-new-transaction loop), both of which already had the hook's own `accountId`
parameter in scope. Date/amount correction in `reconcileMatchedExpense()` is unaffected by this guard —
that logic is direction-agnostic (both banks legitimately report the same real-world date/amount for the
same transfer) and still runs regardless of which side is being imported; only the checkpoint write is
gated. Both functions' doc comments now spell out the invariant explicitly, since it's an existing,
previously-unenforced assumption being closed here, not a new one.

**Tests** (`packages/core/tests/bank-import/checkpoint.test.ts`, 4 new cases): the actual corruption
scenario (a transfer checkpointed by HDFC's own import, later re-matched from ICICI's `toAccountId` side
— confirms `statementBalance` stays untouched at HDFC's original value even though ICICI's own mapping
has a balance column and the row carries one); the same scenario confirming date/amount correction still
applies despite the checkpoint guard; the non-buggy regression case (checkpointing from the transfer's
OWN `accountId` side, and the plain non-transfer case) still works exactly as before; and
`attachCheckpoint()`'s new-row equivalent (a newly-created transfer whose own `accountId` ends up being
the OTHER account per `useBankImport.ts`'s direction-dependent construction gets no checkpoint attached).
Scoped `npx tsc -b packages/core apps/mobile`: clean, both projects.

**Post-implementation fixes — three real bugs found via actual on-device testing — found + fixed
2026-08-09** (after importing `hdfc-statement-apr-may-synthetic.csv`, 13 rows, into a real HDFC Savings
account and confirming its opening balance)

1. **Standing-gap sweep flagged 100% of a batch that had just succeeded** (`coverage.ts`'s
   `findStandingCoverageGaps()`, surfaced via `accountVerification.ts`). Root cause traced to
   `apps/mobile`, not `packages/core`: `AccountsPage`/`AccountList` is a persistent screen inside
   `HomeStack` that never unmounts while `BankImportPage` is pushed on top of it for the import itself.
   `useAccountVerification.ts`'s own `useRepository(bankStatementImportsRepo)` loaded exactly once, on
   that first mount, and had no subscription to learn about later writes — unlike `accounts`/`txns`,
   which happened to stay fresh only because `useAccounts.ts`'s `notifyTxnChanged()`-driven `reload()`
   coincidentally refetches both accounts and expenses together. `bankStatementImportsRepo` had no
   equivalent notify/refresh pair at all (`useAccountsRefresh`/`useTagsRefresh`/`useGoalsRefresh`/
   `useCategoriesRefresh` all exist; a bank-imports one didn't). Net effect: `findStandingCoverageGaps()`
   ran with an `importRecords` snapshot from BEFORE the import, so every one of the 13 transactions this
   exact import had just linked looked unlinked, and all 13 (dated inside the covered range this same
   commit established) got flagged. **Fix**: added `notifyBankImportsChanged()`/`useBankImportsRefresh()`
   to `packages/core/src/hooks/useDataRefresh.ts`/`.native.ts` (identical shape to the four existing
   pairs); `useBankImport.ts`'s `commitAndImport()` now calls `notifyBankImportsChanged()` whenever
   `linkRecord()` wrote anything; `useAccountVerification.ts` now calls `useBankImportsRefresh(reloadImportRecords)`
   (the `reload` `useRepository()` already returns). New test:
   `packages/core/tests/bank-import/accountVerification.test.ts` — a same-batch scenario (9 matched + 4
   newly created, all with real `BankStatementImportRecord`s, all inside the batch's own new covered
   range) confirms zero findings when the caller passes correct, fresh data — pins the pure function's
   contract. The wiring bug itself is a React hook missing a cross-hook refresh subscription in
   `apps/mobile`, which has no test harness (no vitest config exists there) — no automated regression
   test could be written at that exact layer; the fix instead reuses the project's own existing,
   already-tested notify/subscribe pattern rather than inventing a new mechanism.
2. **Standing-gap drill-in mislabeled every row "First disagreeing"** — `TransactionsTab.tsx`'s
   `CheckpointRowMark` badge (`'agree'`/`'flag'`/`'still'`) is shared between Stage 4's checkpoint-mismatch
   drill-in and the standing-gap drill-in, but `'flag'`/`'still'` are checkpoint-mismatch-only concepts
   ("first/still disagreeing checkpoint") that don't apply to a standing gap, where every flagged
   transaction is an equal member of the same finding, not a first-vs-others distinction.
   `AccountDetailModal.tsx`'s `buildHighlight()` was marking every standing-gap expense `'flag'`, so every
   one rendered the checkpoint-mismatch case's copy. **Fix**: added a 4th `CheckpointRowMark` value,
   `'gap'`, with its own label ("No matching statement line", matching the finding's own banner copy) and
   the same solid/danger visual treatment `'flag'` had; `buildHighlight()`'s standing-gap branch now marks
   `'gap'` instead of `'flag'`.
3. **`DoneStep.tsx` still showed the old, pre-Stage-4 one-shot "Reconcile now ›" nudge**, which §10's
   "Finding 1 confirmed" decision above said should be fully retired in favor of Stage 4's persistent
   badge, not left running alongside it. Its own number was also wrong by exactly the just-confirmed
   opening-balance amount — a stale read of the account's PRE-Stage-3-confirm `openingBalance`, not a
   real discrepancy — but since the whole code path was supposed to no longer exist, the fix was removal,
   not a stale-read patch. Confirmed via grep that `checkBalanceAgainstStatement()` had exactly one
   caller (`useBankImport.ts`) and no test file existed for it, so it and its now-fully-dead source file
   `packages/core/src/core/bank-import/balanceCheck.ts` were both deleted. Also removed:
   `useBankImport.ts`'s `balanceNudge` state, its computation block (`findClosingBalance()` local helper
   included, also now dead), and its export; `DoneStep.tsx`'s nudge UI and `onReconcile` prop;
   `BankImportPage.tsx`'s corresponding `onReconcile={() => navigation.navigate('Accounts')}` wiring.

Scoped `npx tsc -b packages/core apps/mobile`: clean, both projects.
`npx vitest run tests/bank-import` (from `packages/core`): 190/190 passing.

**Post-implementation fix — checkpoint walk ignored the opening-balance anchor date, fabricating a
mismatch after a "keep + flag for later" backfill — found + fixed 2026-08-09** (confirmed via on-device
testing, fully root-caused in conversation before any code change)

`checkpointDiagnostics.ts`'s `buildComparisons()` has always walked EVERY transaction touching an
account, chronologically, starting the running balance at the raw `openingBalance` from the very first
transaction in the whole ledger — with no concept of Stage 3's `Account.openingBalanceAsOfDate` at all.
This was always safe before retrospective backfills existed, since the earliest transaction was always
at-or-after the opening-balance anchor by construction. It breaks the moment a user backfills an earlier
period and explicitly chooses NOT to shift the anchor (§14b's "keep the original, flag for later"
outcome) — now there are genuinely real transactions dated before the anchor, and the engine wrongly
applied the anchor's balance figure as if it covered them too.

**Confirmed, worked example** (actual on-device testing): account anchor ₹50,000 as of 2-Apr-2026
(already correctly verified against a real statement). A backfill for 5-Jan through 20-Mar was imported
and the user chose "keep the original ₹50,000, flag for later" when it disagreed by ₹2,000. The engine
then wrongly computed the running balance starting at ₹50,000 from 5-Jan onward (3 months before the
anchor actually applies), producing a bogus "flat-from-start, disagreed by ₹30,000, changes to ₹32,000
later" mismatch — pure artifact of applying the anchor 3 months too early. The account's real total
balance (via `computeBalance()`/`balanceCalculator.ts`, which correctly sums ALL transactions regardless
of date and was never part of this bug) was accurate the whole time.

**Fix**: `buildComparisons()`/`computeCheckpointDiagnostics()` now take an added
`openingBalanceAsOfDate: number | undefined` parameter — when set, any transaction dated strictly before
it is excluded from the comparison walk entirely (not just from being a checkpoint source, but from
contributing to the running-balance accumulation at all, since there is no verified baseline for that
earlier period once the user declined to move the anchor to cover it). `undefined` (an account that never
went through a backfill/anchor-shift, the common case) leaves behavior completely unchanged. Threaded
through the real call chain: `computeCheckpointDiagnostics()`'s own signature (new parameter inserted
before the existing `toleranceRupees`, which still defaults, so no existing positional caller broke);
`accountVerification.ts`'s `ComputeAccountVerificationStatusParams`/`computeAccountVerificationStatus()`
(new optional field, passed straight through); and both of `apps/mobile`'s direct call sites —
`useAccountVerification.ts` (previously did not read `Account.openingBalanceAsOfDate` at all) and
`CheckOpeningBalancePage.tsx`/`CheckpointTimelinePage.tsx` — now pass `account.openingBalanceAsOfDate`.
`computeBalance()`/`balanceCalculator.ts` was deliberately left untouched, per the fix's own scope.

With the fabricated checkpoint-mismatch gone, `accountVerification.ts`'s existing priority order
(checkpoint-mismatch > anchor-disagreement > standing-gap, unchanged by this fix) now correctly falls
through to the account's genuine, already-persisted `anchorDisagreement` finding instead — the user's
earlier "keep + flag for later" choice becomes visible again with no re-decision required, exactly as
before the bogus finding started masking it.

**Tests**: `packages/core/tests/bank-import/checkpointDiagnostics.test.ts` — reproduces the exact
confirmed scenario (pre-anchor checkpointed history + already-verified post-anchor history), confirms
`verified: true` with the fix; an inclusive-boundary case (a transaction dated exactly on the anchor date
is included); an explicit `undefined`-anchor-date regression case (behavior unchanged from before this
fix existed); and a sanity case isolating that the bug is specific to pre-anchor rows, not the post-anchor
math. The old (pre-fix) behavior was actually verified to fail this exact test — not just asserted — by
temporarily reverting `buildComparisons`'s new filter and re-running the suite (`comparisons.length`
came back 4, not the expected 2); the fix was then restored and the suite re-confirmed green.
`packages/core/tests/bank-import/accountVerification.test.ts` — a new case reproduces the same scenario
plus a real, undismissed `anchorDisagreement`: confirms the buggy pre-fix call shape (no
`openingBalanceAsOfDate`) still shows `checkpoint-mismatch` as `activeFinding` (pinning the priority order
itself is unchanged), and the fixed call shape correctly shows `anchor-disagreement` instead once the
fabricated mismatch is excluded.

Scoped `npx tsc -b packages/core apps/mobile`: clean, both projects.
`npx vitest run tests/bank-import` (from `packages/core`): 195/195 passing.

**Post-implementation fix — `anchorDisagreement` frozen forever + anchor date never moving on
"Keep"/"Review" — found + fixed 2026-08-09** (two bugs in the same area, found via on-device testing;
see `docs/mockups/proposals/bank-balance-sync-v3.html`'s `#optiond` section and its follow-up callout
for the design discussion that produced this fix)

**Bug 1 — the anchor-disagreement finding was a frozen snapshot, unlike every sibling mechanism.**
`Account.anchorDisagreement` was written once, at the original anchor-shift import's commit time
(`{detectedAt, oldOpeningBalance, oldAnchorDate, impliedOldBalance, diff}`), and nothing ever re-derived
or invalidated it afterward — unlike a checkpoint mismatch (`computeCheckpointDiagnostics()`, walks the
CURRENT transactions fresh, every single call). **Confirmed on-device, end to end**: chose "Keep
₹50,000, flag" on a disagreeing anchor-shift import → later re-imported the CORRECTED Jan–Mar statement
(the real ₹35,000 salary instead of an erroneous ₹37,000) → the review screen correctly matched 6 of 7
rows and flagged the stale ₹37,000 entry for deletion → deleted it, recorded the correct ₹35,000 in its
place. At this point the ledger was genuinely fixed — a fresh check would show ₹0 diff at the boundary.
But the account still showed "Re-open ›", and reopening it still showed the exact same stale
₹52,000/₹2,000 numbers from *before* the correction.

**Bug 2 — the anchor DATE only ever moved on the "Accept" branch.** Regardless of which of the three
§14b choices was picked ("Accept — shift", "Keep the original, flag", "Review the new import's rows
first"), only "Accept" actually moved `Account.openingBalanceAsOfDate` back to the new, earlier anchor
date at commit time. "Keep"/"Review" left it pinned at the OLD (later) date while committing
transactions dated BEFORE it. Since `computeBalance()` sums ALL of an account's transactions regardless
of date on top of `openingBalance`, this silently inflated the account's real displayed balance by the
ENTIRE backfilled period's net effect — not just the disagreement amount. (A related, already-fixed
artifact of the same root gap: `checkpointDiagnostics.ts`'s comparison WALK briefly fabricated a bogus
mismatch by applying the anchor's balance too early, fixed in the entry above this one — that fix
covered the diagnostic *read* path; this bug is the *write* path that produced the wrong date in the
first place.)

**Fix, in one coherent redesign** (bigger than either bug alone, but the two are really the same
underlying issue: something about this feature was designed to compute once and freeze, in a codebase
where every sibling mechanism recomputes fresh from source data every time):

- `Account.anchorDisagreement` → **renamed to `Account.anchorReference`**
  (`packages/core/src/core/db/types/index.ts`), storing ONLY the two facts worth permanently
  remembering — the OLD anchor's own `{oldOpeningBalance, oldAnchorDate}` and `detectedAt` (for a stable
  fingerprint). `impliedOldBalance`/`diff`/`agrees` are NEVER stored anymore.
- New `openingBalanceAnchor.ts` exports: `AnchorReference` (the persisted shape), `backDerivedOpeningBalance()`
  (pure algebra on an `AnchorShiftCheck` — `newOpeningBalance - diff` — the value to persist as the
  account's own opening balance at the new anchor date when the OLD anchor is still trusted, so
  projecting forward reproduces the OLD anchor's own value exactly), and `recomputeAnchorAgreement()`
  (the LIVE re-check — re-runs `computeAnchorShiftCheck()` against CURRENT `Expense[]`, windowed to
  `[currentAnchorDate, oldAnchorDate)`, every time verification status is computed).
- `accountVerification.ts`'s `anchorDisagreement` param renamed to `anchorReference`
  (`Account['anchorReference']`); the finding is now only pushed when `!recomputeAnchorAgreement(...).agrees`
  — so a resolved disagreement simply stops appearing, with no explicit "clear" step needed.
  `AccountVerificationFinding.anchorDisagreement` (the UI-facing shape) is UNCHANGED — every existing
  consumer (`CheckOpeningBalancePage.tsx`, `verificationCopy.ts`) kept working without modification.
- `useBankImport.ts`: `flagAnchorDisagreement()` (§14b "Keep") now stages
  `{openingBalance: backDerivedOpeningBalance(anchorShiftCheck), openingBalanceAsOfDate:
  anchorShiftCheck.newAnchorDate, reference: {...}}` — the anchor DATE always moves now, only the VALUE
  differs from "Accept". `deferAnchorDecision()` (§14b "Review rows first") now simply delegates to
  `flagAnchorDisagreement()` — behaviorally identical, a conservative no-active-trust default that still
  must move the anchor correctly. `apps/mobile/src/features/bank-import/types.ts`'s
  `PendingOpeningBalanceUpdate` collapsed from a `'move'`/`'pin'` discriminated union to one flat
  `{openingBalance, openingBalanceAsOfDate, reference?}` shape, since the distinction no longer exists —
  every branch always writes both fields. The commit-time write in `commitAndImport()` now explicitly
  clears a stale prior `anchorReference` when a fresh decision carries none (an "Accept"/first-import
  confirm made after an earlier flagged disagreement must not leave that old flag behind silently).
- **`CheckpointTimelinePage.tsx` extended, not duplicated** — per the user's own proposed direction
  ("two self-consistent halves, one explicit boundary marker", `bank-balance-sync-v3.html`'s `#optiond`):
  since the anchor DATE now always sits at the true earliest transaction date (even across a flagged
  disagreement), a single `computeCheckpointDiagnostics()` call over the whole ledger already naturally
  walks through both the backfilled period and the original period continuously — no need for two
  separate table cards. One new divider row, `AnchorBoundaryDivider`, renders at
  `account.anchorReference.oldAnchorDate`, reading the boundary's live diff via a new shared
  `apps/mobile/src/features/accounts/useOpeningBalanceResolution.ts` hook (extracted from
  `CheckOpeningBalancePage.tsx`'s own update/dismiss actions, so both screens share one write path, not
  two copies). Two small section labels ("Before … (this backfill)" / "… onward (already verified)")
  bracket the divider, matching the mockup's own two-labeled-segments layout. Unresolved: the checklist
  of three possible causes (① a missed transaction — only shown when `coverage.ts`'s own
  `detectCoverageGap()`/`mergeCoveredRanges()` confirm a real gap between the two statements' own covered
  ranges; ② an error in the earlier statement itself; ③ less likely, the original figure was wrong) plus
  "Update to ₹X" / "Keep ₹Y ✓ (already flagged)" buttons. Resolved (diff now `0`, e.g. after a corrective
  re-import): a compact "✓ This gap has been resolved" line instead — the concrete fix for the exact bug
  reproduced above.
  - **The "Update" write formula is NOT symmetric with the checkpoint-mismatch case** (a correction made
    mid-implementation, after the naive "just reuse `CheckOpeningBalancePage.tsx`'s existing function
    verbatim" approach was checked against the new architecture and found to reintroduce the double-count
    bug): for a `'flat-from-start'` checkpoint mismatch, `implied.impliedBalance` is already expressed AT
    THE ACCOUNT'S CURRENT ANCHOR DATE, so writing it straight into `openingBalance` is correct as-is. For
    an `'anchor-disagreement'` finding, `implied.impliedBalance` is expressed AT THE OLD ANCHOR'S OWN
    DATE — writing it directly into `openingBalance` while `openingBalanceAsOfDate` stays at the NEW,
    earlier date would silently reintroduce the exact double-counting bug this whole fix exists to close.
    "Update" for an anchor-disagreement instead computes `account.openingBalance + finding.anchorDisagreement.diff`
    (algebraically: undoes exactly the back-derivation `backDerivedOpeningBalance()` applied at import
    time) and leaves `openingBalanceAsOfDate` untouched. The button's own label still reads the
    old-anchor-dated `implied.impliedBalance` (more intuitive for a user to read) — only the underlying
    WRITE uses the corrected formula. `useOpeningBalanceResolution.ts`'s `update()` branches on
    `finding.kind` for exactly this reason.
- The "View full reconciliation table" gate (`AccountDetailModal.tsx`'s footer,
  `CheckOpeningBalancePage.tsx`) extended from `'checkpoint-mismatch'`-only to also include
  `'anchor-disagreement'` — an anchor-only account (no checkpoint-mismatch of its own) can now reach the
  same timeline and see its own boundary divider. `CheckpointTimelinePage.tsx`'s bottom action bar
  (previously gated entirely on `diagnostics.mismatch`, hiding its actions for a pure-anchor-disagreement
  account with otherwise-clean checkpoints) now also shows "Check opening balance" when there's no
  checkpoint mismatch but there IS a live anchor-disagreement finding.

**Tests**: `packages/core/tests/bank-import/openingBalanceAnchor.test.ts` — new cases for
`backDerivedOpeningBalance()` (the §14b "Keep" numeric case, and a no-op case when there was no
disagreement) and `recomputeAnchorAgreement()` (reproduces the exact §14b disagreement numbers via a
real `Expense[]` fixture; confirms the `[newAnchorDate, oldAnchorDate)` windowing is inclusive/exclusive
correctly; ignores unrelated accounts; and — the actual regression for the bug above — returns
`agrees: true` once a corrective transaction is added to the fixture, proving the LIVE recompute, not a
frozen snapshot, drives the result). `packages/core/tests/bank-import/accountVerification.test.ts` —
every existing test using the old `anchorDisagreement` param updated to `anchorReference` (each now
supplies a real `openingBalance`/`openingBalanceAsOfDate`/`accountTxns` fixture consistent with a LIVE
recompute, rather than an arbitrary already-computed object); new regression tests reproducing the exact
on-device bug directly (an `anchorReference` still set, but `accountTxns` now reconciling cleanly ⇒ no
`anchor-disagreement` finding at all) and confirming a before/after transition (a disagreeing ledger,
then the same ledger with one corrective edit, computed fresh both times ⇒ the finding present, then
gone, on the very next call — no stale snapshot survives). Whole `packages/core` suite: 872/872 passing.
Scoped `npx tsc -b packages/core apps/mobile --force`: clean, both projects.

**Follow-up fix, found reviewing the above build before it shipped — found + fixed 2026-08-09**: the
"always move the anchor" fix above has a real side effect nobody had traced through yet. Once `Keep`/
`Review` moves `Account.openingBalance`/`openingBalanceAsOfDate` to the new, earlier, back-derived anchor
(so `computeBalance()`'s total stays correct), that back-derived value is only calibrated to reproduce the
OLD anchor's own balance at `oldAnchorDate` — NOT to match the backfilled statement's own originally-
imported checkpoints along the way (those were calibrated to the backfill's own, different, implied
opening balance). `computeCheckpointDiagnostics()` walking the FULL ledger from the new anchor therefore
made every checkpoint inside the disputed window disagree by a flat, fabricated amount — a SECOND,
spurious `'checkpoint-mismatch'` finding for the exact same root cause the `anchor-disagreement` finding
already owns. Per the one-badge priority order (checkpoint-mismatch > anchor-disagreement), the fabricated
finding would WIN, routing the user to `CheckOpeningBalancePage`'s checkpoint-mismatch "Update" formula
(wrong for this case) instead of the correct anchor-disagreement one — reintroducing a version of the
exact confusion this whole fix exists to close, just one layer deeper.

Fix: `accountVerification.ts` now computes checkpoint-mismatch detection using the OLD, still-
independently-trusted anchor (`anchorReference.oldOpeningBalance`/`oldAnchorDate`) instead of the account's
own current (back-derived) fields, whenever an `anchorReference` is active — exactly reconstructing what
mismatch-detection looked like before the disputed window existed. This is scoped ENTIRELY to the
badge/finding computation; the account's real stored fields (used by `computeBalance()` and by
`CheckpointTimelinePage.tsx`'s own full-ledger display, which deliberately still wants to show the
complete two-halves table) are untouched. New regression test in `accountVerification.test.ts` reproduces
the exact scenario (a checkpointed row inside the disputed window that disagrees against the new anchor
but not the old one) and confirms no fabricated checkpoint-mismatch fires while the genuine
anchor-disagreement still does. Two pre-existing tests that had encoded the old (incomplete) behavior as
their expected result were updated to match the corrected behavior, not reverted. Whole `packages/core`
suite re-verified after this follow-up: 873/873 passing; scoped `tsc -b`: clean.

**Known, accepted display-only redundancy, not yet addressed**: `CheckpointTimelinePage.tsx`'s own full-
ledger diagnostic call (used only for the continuous timeline display, unaffected by the fix above) can
still independently classify the disputed window as its own `'flat-from-start'` checkpoint-mismatch for
display purposes — meaning the page can show both the "Flat from the very first checkpoint" banner/CTA
*and* the new anchor-boundary divider on the same screen for the same root cause. Not a correctness bug
(tapping either path still lands on the correctly-fixed `CheckOpeningBalancePage` computation), just
duplicated narration on one screen — worth a small follow-up to suppress the redundant banner/CTA when the
mismatch's own `firstDisagreeing` date falls before an active `anchorReference.oldAnchorDate`.

**Post-implementation fix — duplicated debit from an unconverted cross-account transfer leg — found +
fixed 2026-08-09** (confirmed via on-device repro, not a guess; patches Stage 6's own
`suggestPossibleTransfer()`/`suggestAmbiguousTransferCandidates()` — the matching logic itself is
unchanged, only what accepting a suggestion actually *does* with it)

**Repro**: import `hdfc-statement-jun-synthetic.csv` first — a ₹20,000 debit "NEFT TO ICICI" with no
ICICI-side counterpart in Penny yet, so it's correctly recorded as a plain `type: 'expense'` on the HDFC
account. Then import `icici-statement-jun-synthetic.csv` — a ₹20,000 credit "NEFT FROM HDFC".
`suggestPossibleTransfer()` correctly finds the HDFC expense as the likely other leg — but per that
function's own doc comment (accurate at the time, describing a deliberately deferred feature): "Never
touches the candidate's own account/type — accepting this suggestion only marks *this* row as a transfer;
the other leg stays whatever it already was." Accepting the suggestion created a BRAND-NEW `Expense`
(`type: 'transfer'`, `accountId: HDFC`, `toAccountId: ICICI`) instead — the original HDFC expense was
never touched. Result: TWO records both debiting HDFC ₹20,000 for the same real-world transfer. ICICI
itself was fine (one correct +₹20,000 credit), but HDFC's own already-verified 10-June checkpoint — which
expected exactly one −₹20,000 debit that day — now saw a phantom extra one it couldn't account for,
flagging a previously-verified account as unverified.

**Fix**: promotes the cross-account transfer suggestion from "a hint for creating a new record" to
"absorb and convert the existing candidate in place" — the deferred half of the feature the doc comment
already named. New core function `convertCandidateToTransfer(candidate, currentAccountId, now)`
(`matcher.ts`, next to `suggestPossibleTransfer`/`suggestAmbiguousTransferCandidates`) converts the
EXISTING candidate expense into the transfer, handling both directions depending on the candidate's own
recorded type (mirrors `cashWithdrawalCodes.ts`'s `applyCashTransferConversion()` in spirit, generalized to
two directions instead of one):
- `candidate.type === 'expense'` (or unset) — the candidate is already the SOURCE leg (money already left
  its `accountId`); only `type`/`toAccountId` change, `accountId` untouched. Same shape as
  `applyCashTransferConversion`.
- `candidate.type === 'income'` — the candidate is already the DESTINATION leg; `accountId` is
  REASSIGNED to the currently-importing account (the real source), and `toAccountId` becomes the
  candidate's own original `accountId`.

Nothing else about the expense (amount, date, description, category, hashtags, an existing
`statementBalance` from its OWN prior import) is touched in either branch.

`apps/mobile/src/features/bank-import/useBankImport.ts` gets a new `linkAsCrossAccountTransfer(statementRow,
candidate)` mutator — converts the candidate and stages it directly into `matchedPairs` (removing the row
from `unmatchedRows`/`possibleItems`), same "nothing written until `commitAndImport()`" staging model as
every other bucket mutator. `PossibleBucket.tsx` gains a new inline "Link these ›" chip (same warning-
tinted visual language as `MatchedBucket.tsx`'s existing Stage-7 retroactive-cash-transfer chip, not a new
pattern) offered wherever `suggestPossibleTransferFor()` finds a single confident candidate for a row about
to fall through to "add as new" — accepting it calls `linkAsCrossAccountTransfer()` directly, no
`ExpenseForm` involved (there's nothing left to fill in). Dismissing ("Not the same, add separately")
falls through to the unchanged add-as-new flow. The ambiguous multi-candidate picker
(`AmbiguousTransferPickerModal`, reached via `suggestAmbiguousTransferCandidatesFor`) now routes its own
`onPick` through the same `linkAsCrossAccountTransfer()` call instead of prefilling a note into a new
record; its "Neither — keep both separate" outcome is unchanged. `BulkCategorizeModal.tsx`'s bulk
"mark as transfer" flow for a merchant GROUP of several rows is explicitly out of scope — a genuinely
different, less precise scenario (many rows to one destination account, not a 1:1 candidate match) — and
still creates fresh records as it does today.

**Reasoned-through, not silently decided**: the income-candidate branch's `accountId` reassignment means
that if the candidate already carries its own `statementBalance` (attached by its OWN prior import on its
ORIGINAL account), that checkpoint stays attached but is now misattributed once `accountId` changes —
`checkpointDiagnostics.ts`'s filter (`txn.accountId === accountId && txn.statementBalance !== undefined`)
would stop matching it for the original account's own diagnostics and start matching it for the newly-
assigned account's diagnostics instead, where the stored value doesn't actually mean anything (it was the
ORIGINAL account's own bank-reported balance, not the newly-assigned account's). This is a real, narrow
edge case — it only bites when the absorbed candidate was itself already checkpointed by its own prior
statement import — left as-is per this fix's own explicit scope (a pure type/account-field conversion,
touching nothing else) rather than silently deciding to strip the value; a follow-up should address it
directly if it's ever hit in practice (candidate: clear `statementBalance` when `accountId` is reassigned).

**Tests**: `packages/core/tests/bank-import/matcher.test.ts` — `convertCandidateToTransfer` cases for both
branches (source/destination), the unset-`type`-defaults-to-expense case, and confirming an existing
`statementBalance` is preserved untouched in both branches. No `apps/mobile` hook/component-test harness
exists for this feature (established pattern this session) — the UI wiring is verified by careful code
tracing, not an automated test, and manual on-device verification is still needed before considering this
closed.

**Two follow-up corrections, found reviewing the above build before it shipped — found + fixed 2026-08-09**:

1. **Wrong bucket entirely.** The chip above landed only in `PossibleBucket.tsx` (Bucket 2 — ambiguous
   SAME-account ties). But `matchStatementRows()` only ever produces a Bucket-2 item when the row already
   found a same-account candidate — a cross-account transfer's other leg essentially never does (that's
   the whole reason it needs the softer, separate cross-account heuristic in the first place). The real
   HDFC/ICICI repro's ICICI row has ZERO same-account candidates, so it goes straight to `unmatchedRows`
   (Bucket 3) — and `UnmatchedBucket.tsx` has no individual single-row path at all, only
   `BulkCategorizeModal` (used even for a merchant group of size 1). The fix as first built literally never
   fired for the actual reported bug. Corrected by adding the same chip directly to `UnmatchedBucket.tsx`'s
   per-merchant-group card, shown only for a size-1 group with exactly one confident candidate (a genuine
   multi-row group still falls through to the ordinary bulk flow, unchanged, same documented scope line as
   before) — bypassing `BulkCategorizeModal`/`ExpenseForm` entirely when accepted.

2. **A more serious, separate bug this exposed, also affecting the already-shipped Stage 7 cash-transfer
   chip.** `reconcileMatchedExpense()` (`checkpoint.ts`) only ever compares an `Expense` against the
   STATEMENT ROW's own date/amount/balance to decide whether anything "changed" — it has no way to see a
   type/account-field conversion already baked into the expense object it's handed, since neither
   `convertMatchedPairToTransfer` (Stage 7, cash) nor the new `linkAsCrossAccountTransfer` ever touch
   date/amount/checkpoint. For a MATCHED pair, date/amount already agreed by definition (that's what made
   it a match) — so `reconcileMatchedExpense()` returns `undefined` ("no-op"), and `commitAndImport()`'s
   own `if (toWrite) await expensesRepo.put(toWrite)` guard skips the write entirely. **The conversion was
   silently discarded at commit time in the common case** — the review screen shows it as accepted, but the
   database keeps the original, unconverted record forever. This is not new to this fix — it was already
   live in the shipped Stage 7 retroactive-cash-transfer chip (`MatchedBucket.tsx`), just never triggered
   in a way anyone happened to notice (would only be caught by re-opening the transaction later and finding
   it still isn't a transfer).

   Fixed by adding `MatchedItem.alreadyConverted?: boolean`, set by both `convertMatchedPairToTransfer` and
   `linkAsCrossAccountTransfer`, and having `commitAndImport()`'s matched-pairs loop force a write whenever
   it's set, regardless of what `reconcileMatchedExpense()` itself concludes. This means the Stage 7 cash-
   transfer chip needs re-verifying on-device too — it's very plausible it never actually worked in
   practice despite being "built and verified" back at Stage 7.

Re-verified after both corrections: `tsc -b apps/mobile packages/core --force` clean; `eslint`/`prettier`
clean on every touched file; whole `packages/core` suite 877/877 passing (unaffected — these two
corrections are entirely in `apps/mobile`, no core logic changed).

**Third follow-up, found via on-device testing after the link actually worked — found + fixed
2026-08-09**: opening the newly-linked transfer's edit form only showed "Matched from bank statement" for
the HDFC side, not ICICI's. Root cause: `useExpenses.ts`'s `bankImportLinkByTxn` map was built on the
explicit, previously-true assumption "a transaction can only ever be linked from one batch's one row, so
first-write-wins is fine" — which stopped being true the moment `linkAsCrossAccountTransfer` started
absorbing an existing expense as a transfer's other leg: the SAME shared `Expense` now legitimately carries
TWO `BankStatementImportRecord`s, one from each side's own import, and `!map.has(...)`-guarded first-write-
wins was silently keeping only whichever was encountered first.

Fixed by changing `bankImportLinkByTxn` to `Map<string, {rawNarration, date}[]>` (collecting every record,
not just the first) and threading the array through `ExpenseForm.tsx` (`linkedBankStatementLines`, renamed
from the old singular `linkedBankStatementLine`) — a plain expense/income still only ever has exactly one
entry and renders identically to before; a cross-account transfer now shows both linked statement lines
under "Matched from both sides of this transfer." Payment-mode-mismatch detection
(`paymentModeMismatchTxnIds`) and `ExpenseForm`'s own implied-payment-mode inference both now explicitly
use only the FIRST linked line (this account's own leg) — documented as an intentional choice, not an
oversight, since payment-mode inference is scoped to one bank's own narration, not the transfer as a whole.

Re-verified: `tsc -b` clean, `eslint`/`prettier` clean on every touched file (`useExpenses.ts`,
`TransactionsSlice.tsx`, `ExpenseForm.tsx`), full `npm run build` — only the same 3 pre-existing,
unrelated `apps/web-react` errors remain.

**A fourth, genuinely significant bug — found via on-device re-test 2026-08-09**: fresh account, backfilled
Jan–Mar with the same-first-row-off-by-₹2,000 fixture, chose "Keep ₹50,000, flag for later" — and the
account immediately showed **verified**, no finding at all, regardless of the real disagreement.

Root cause: `recomputeAnchorAgreement()` (added earlier the same day to fix the "frozen forever" bug) was
projecting forward from the account's own CURRENT `openingBalance` — but that field is
`backDerivedOpeningBalance()`'s output, which is *defined* to be exactly the value that reproduces
`oldOpeningBalance` when walked through this same window. Using it as the live check's own starting point
made `agrees` **tautologically always `true`** — the "Keep, flag" choice could never show a disagreement
immediately after being made, no matter how large the real gap was. A genuine, embarrassing algebra bug in
the redesign meant to fix the *previous* bug in this exact area.

Fixed by adding a THIRD field to `Account.anchorReference`: `newOpeningBalance` — the backfill's own
un-back-derived claim (`AnchorShiftCheck.newOpeningBalance` at the moment the disagreement was first
flagged), frozen independently of whatever the account's real, back-derived `openingBalance` becomes.
`recomputeAnchorAgreement()` now projects forward from `reference.newOpeningBalance`, never from the
account's own field — an independent claim to actually check current transactions against, not something
guaranteed to already agree with itself. `useBankImport.ts`'s `flagAnchorDisagreement()` now writes this
third field; `useOpeningBalanceResolution.ts`'s "Update" formula needed no change (verified algebraically —
it already only reads the live `diff`, never re-derives from the account's own field directly). Every
existing `anchorReference` test fixture updated to include the new field with the value that was already
implicit in each test's own math; added a dedicated regression test that explicitly demonstrates the
tautology (feeding the back-derived value in produces a wrong `agrees: true`; feeding the correct
`newOpeningBalance` in produces the correct `agrees: false`) so this specific class of bug can't silently
reappear.

Re-verified: `tsc -b` clean, `eslint`/`prettier` clean, whole `packages/core` suite 878/878 passing, full
`npm run build` — only the same 3 pre-existing, unrelated `apps/web-react` errors remain. **Still needs a
fresh on-device re-test** of the exact repro (fresh account → backfill with the off-by-₹2,000 fixture →
"Keep, flag" → confirm the account now correctly shows the anchor-disagreement finding, not verified).

**Reconciliation table redesign — direct on-device feedback, 2026-08-09**: `CheckpointTimelinePage.tsx`'s
table only ever showed Penny's own running balance and the diff — never the bank's own stated balance
being compared against, never the amount that actually moved between checkpoints, and no explicit opening
balance to anchor the walk. Iterated through several mockup rounds (`docs/mockups/proposals/
reconciliation-table-columns-v1.html`, kept updated in place across rounds per this session's own
established pattern) before landing on: an "Opening balance" header card at the top of the table; each
row's transaction amount shown as a small colored subtext under its description; Statement and Penny
balances stacked in one "Balance" column (Statement on top, always `theme.textPrimary`; Penny below,
always `theme.primary`) with a one-time two-dot legend stated once above the table, never repeated per row;
Diff kept as its own final column with its own INDEPENDENT green/red (agrees/disagrees) — deliberately
never reusing the Statement/Penny color pairing, so the two meanings never collide on the same row. New
`txnDetailById` map (replacing the old `descriptionById`) uses `delta(accountId, e)` so a transfer's own
amount is always signed correctly relative to whichever account this screen is for. No core logic changes
— `CheckpointComparison.statementBalance` was already computed, just never rendered.

Re-verified: `tsc -b` clean, `eslint`/`prettier` clean, whole `packages/core` suite unaffected (878/878,
mobile-only change), full `npm run build` — only the same 3 pre-existing `apps/web-react` errors remain.
Needs on-device visual confirmation — this is a real layout change to a shipped screen.

**A fifth bug in this same area — `Account.openingBalance` going stale after a corrective re-import, found
via the reconciliation table redesign above surfacing it visually — found + fixed 2026-08-09**: chose
"Keep, flag" on the off-by-₹2,000 backfill, then separately re-imported the corrected statement (fixing
the actual erroneous transaction). The badge correctly went quiet (per the earlier live-recompute fix) —
but the reconciliation table showed a flat ₹2,000 gap on EVERY row, both before and after the boundary.

Root cause: `Account.openingBalance` was written ONCE, at the original "Keep, flag" commit, back-derived
specifically to make `computeBalance()` reproduce the trusted old anchor GIVEN the transactions that
existed at that moment (the erroneous ones). A later corrective re-import (fixing the transactions) never
revisits that field at all — it's just a normal statement re-import into an already-covered range, with no
reason to think it needs to touch the account's own anchor fields. So `Account.openingBalance` stayed
frozen at a value calibrated for data that no longer exists, silently understating the account's real
total by ₹2,000 in `computeBalance()` — Accounts list, Home net worth, everywhere — while the badge,
correctly using the live-recomputed check, insisted everything was fine.

Confirmed algebraically (and by the user directly) that this isn't a "recalculate" operation needing new
logic: `backDerivedOpeningBalance()` applied to a FRESH `recomputeAnchorAgreement()` result is the exact
same formula that produced the original value, just re-run against current transactions instead of a
frozen snapshot — the same principle already applied to the finding itself, just never extended to the
stored value that finding exists to protect.

Fixed in `useAccountVerification.ts` (the one hook every account-verification consumer's parent screen
already mounts) with a `useEffect`: for every `CHECKPOINT_ELIGIBLE` account with an `anchorReference` set,
recomputes the check fresh against current transactions every time `accounts`/`txns` change; if the
back-derived value has drifted from what's stored, corrects it; once the check fully agrees, also clears
`anchorReference` (nothing left to track — the reference and the account's own real value have converged).
No user decision involved (that already happened at "Keep") — purely bookkeeping consistency, safe to do
silently, self-terminating (the write itself changes nothing further to correct on the next pass).

This closes the user's own explicit requirement: "verified" must mean every checkpoint AND the anchor
itself are ALL actually at diff 0 — already true of `computeAccountVerificationStatus()`'s own logic
(no active finding requires zero checkpoint-mismatch, zero anchor-disagreement, zero standing-gap
simultaneously), but only trustworthy once the underlying stored data it reads never goes stale — which
is exactly what this fix closes.

No new core logic — reuses `backDerivedOpeningBalance()`/`recomputeAnchorAgreement()` verbatim, both
already fully tested. No `apps/mobile` hook test harness exists (established pattern this session) to
cover the write side-effect itself; confidence rests on both formulas already being core-tested and this
being a straightforward new call site, not new logic — manual on-device re-test still needed for the
actual repro (backfill off by ₹2,000 → Keep, flag → corrective re-import → confirm the reconciliation
table now shows ₹0 everywhere, not a residual flat gap).

Re-verified: `tsc -b` clean, `eslint`/`prettier` clean, whole `packages/core` suite unaffected (878/878,
no core changes), full `npm run build` — only the same 3 pre-existing `apps/web-react` errors remain.

**Extended to the Home screen — 2026-08-10**: the open question from `bank-balance-sync-v3.html` ("whether
the account-list badge should stop being binary") turned into a different, higher-value question first —
whether the badge should exist anywhere OTHER than the Accounts screen at all, since a user only discovers
an unverified account by specifically opening it. Resolved: yes — Home's `AccountsStrip` now shows the same
binary indicator (icon-only, `ti-alert-triangle`/`theme.danger`, no room for the "Unverified" label text at
this tile size), plus a header-level echo next to the "Accounts" label so it's visible even when the
flagged tile is scrolled out of the horizontal strip. Stayed strictly binary here regardless of whatever
richer treatment the Accounts screen's own badge eventually gets — a 120pt tile has no room for more.

`CHECKPOINT_ELIGIBLE` moved from `apps/mobile/src/features/accounts/useAccountVerification.ts` to
`packages/core/src/core/bank-import/accountVerification.ts` — it's a business-logic fact (which account
types this feature applies to), not a UI constant, and `features/home/` needed it without a
feature-to-feature cross-import (this repo's own ESLint-enforced architecture rule). `useHome.ts` computes
`needsAttention` per account via the PURE `computeAccountVerificationStatus()` directly — deliberately not
by mounting `useAccountVerification()` a second time, since that hook also owns the self-correcting
`openingBalance` write from the previous entry; running it concurrently from two persistently-mounted
screens would be wasteful and needlessly hard to reason about. Reads are cheap and safe to duplicate;
that write stays singular, owned by the Accounts screen alone. New `useBankImportsRefresh(reload)`
subscription in `useHome.ts` — same missing-refresh bug class already found once in `useAccountVerification.ts`
for this exact repo, closed here before it could recur.

Re-verified: `tsc -b` clean, `eslint`/`prettier` clean on every touched file, whole `packages/core` suite
878/878 passing, full `npm run build` — only the same 3 pre-existing `apps/web-react` errors remain. Needs
on-device visual confirmation.

## 8. Known, accepted limitations (be upfront about these — don't oversell the guarantee)

- **Two offsetting errors within a never-reconciled period are invisible to any balance check, at any
  granularity** (§10c) — a missing credit + a missing debit of the same amount nets to zero. The review
  screen's row-by-row existence matching is the only defense; checkpoints are a complementary layer,
  not a substitute for it.
- **A bank reissuing a corrected version of an already-checkpointed statement isn't handled** (§17) —
  would come in as a duplicate rather than a correction. Known gap; would need an explicit
  "re-verify this period" action, not automatic handling.
- **Same-day transactions only get true intra-day checkpoints when the whole day is statement-explained**
  (§7e/§9) — otherwise end-of-day-only, by design, not a bug.
- **Credit cards are out of scope** — inverted balance sign convention would need explicit handling,
  not assumed to "just work" if this is ever extended there (§16).

## 9. Open questions — resolved 2026-08-08

All three original open questions are now resolved. Recorded here for traceability rather than
deleted — do not re-litigate these without a new, explicit reason.

1. **Mismatch handling severity — resolved: never a hard block on the mismatch itself. A persistent,
   localized "unverified" account state instead.** Decision, with rationale (this is Claude's
   recommendation, adopted by the user after asking for an opinion, not a user-originated design):
   - Consistent with the project's own established philosophy — `balanceCheck.ts` today already
     "never auto-corrects, only nudges" (§2), and decision #9 in §3 frames checkpoints as a
     complementary diagnostic layer, never a gatekeeper.
   - A hard block has a real failure mode: some causes of a mismatch can't be resolved on the spot
     (a transaction pending clearance, an untraceable historical rounding difference, a duplicate
     needing research) — blocking commit entirely would hold the *entire* batch hostage over one
     unresolved row, including the (usually large) majority of rows that are completely fine.
   - The checkpoint model's actual value is precision (§7b/7c: "the gap is strictly between these two
     transactions," not "somewhere in this statement") — that precision belongs on a **persistent,
     specific, localized flag on the account** (e.g. "Balance mismatch between 25-Apr and 3-May,
     ₹120 — tap to investigate"), not a one-time blocking dialog. It should be visible wherever the
     account's balance is shown (not buried in a settings screen), without blocking normal use of the
     account in the meantime (viewing balance, adding transactions).
   - Needs an explicit "I've reviewed this, dismiss" action so a genuinely-irresolvable small
     historical variance doesn't become a permanent, un-closeable nag — mirrors how real
     bank-reconciliation tools let a small variance be knowingly written off.
   - The one thing that SHOULD still block commit, unrelated to balance mismatches: finishing the
     review screen itself (no unresolved "possible match" left undecided) — a "finish reviewing"
     gate, not a "your balance disagrees" gate.
   - Still worth a final look once the actual mockup (§10 below) makes the account-level "unverified"
     surface concrete — a badge that looks naggy in practice could change this.
2. **Stage 5 (intra-day sequencing) — resolved: yes, build it for v1.** Not deferred.
3. **Exact visual treatment for every §6 UI item — resolved: yes, mockups wanted before any code.**
   See §10 below — mockup work is the very next step, ahead of any Stage 0-7 implementation.

## 10. Mockup phase (current step — 2026-08-08)

Per the user's explicit request: **no implementation code until mockups exist and are approved.**
Mockups should be grounded in the real current screens (`apps/mobile/src/features/bank-import/`,
Accounts list/detail), and should prioritize making it easy for the user to *make decisions and
correct things* — not just look good. Track progress of this phase here as it happens; update this
section (don't just rely on chat history) so a resumed session knows exactly what's been shown and
decided.

**Status: first mockup pass delivered, not yet reviewed/approved by the user.**
[`docs/mockups/proposals/bank-balance-sync-v1.html`](../mockups/proposals/bank-balance-sync-v1.html)
covers all 7 §6 surfaces in one gallery, grounded in `DoneStep.tsx`/`SetupStep.tsx`/`PossibleBucket.tsx`/
`MatchedBucket.tsx`/`MappingEditModal.tsx`, `AccountList.tsx`/`AccountsPage.tsx`/`ReconcileModal.tsx`, and
`EntityTransactionsModal.tsx`, using §7b/7c/7d/§11a/§11b/§13/§14/§14b's exact numbers — no invented data.

- Included an accurate "current (today)" frame (`DoneStep.tsx`'s existing one-shot nudge banner).
- Presented 3 structurally distinct directions **for surfaces 1+2 specifically** (the checkpoint-diff
  marker + persistent account-level "unverified" state) — Direction A (inline row markers only, lightest
  touch), Direction B (dedicated Reconciliation card + a new full checkpoint-timeline screen, most
  literal/explicit), Direction C (hybrid: compact 2-row snapshot + drill into the existing transaction
  list, reusing `EntityTransactionsModal`) — with Direction C recommended. Surfaces 3–7 (gap banner,
  skipped-row count + a new Import History screen, opening-balance confirm, anchor-shift incl. §14b,
  ambiguous-transfer picker) were each shown once, on the grounds that their design space is narrower and
  mostly reuses existing `Banner`/`Modal`/inline-form patterns.
- Findings surfaced alongside the mockup (not yet acted on, pending user response):
  1. Today's `DoneStep.tsx` "Reconcile now ›" nudge is a dead end for bank accounts — it navigates to
     Accounts but `ReconcileModal` only opens for `cash`/`wallet` types. Direction C's persistent
     "unverified" surface is proposed to replace this nudge outright, fixing the dead end as a side effect.
  2. `AccountList.tsx`'s `STATEMENT_IMPORTABLE` set includes `credit_card` alongside `bank`, but this plan
     (§3 decision 1, §8) scopes checkpoints to bank accounts only — worth confirming none of the new
     surfaces should render on a credit-card account yet.
  3. "Import history" (surface 7's batch list) has no existing screen to ground in — proposed as a new
     screen reachable the same way as the existing "Merchant recognition"/"Cash-withdrawal codes" header
     actions on `AccountsPage`, flagged as new IA rather than a refactor of something real.
**Decided 2026-08-08:**
- **Direction C (hybrid) approved** for surfaces 1+2 — compact "last agreeing / first disagreeing"
  snapshot banner (reusing `EntityTransactionsModal`'s stat-row slot), tap-through highlights those
  exact two rows in the account's existing transaction list, with a "view full table" escape hatch
  into Direction B's timeline idea for anyone who wants the fuller view. Surfaces 3–7's single-direction
  treatment is also accepted as-is — no alternate directions requested for those.
- **Finding 1 confirmed**: replacing `DoneStep.tsx`'s dead-end "Reconcile now ›" nudge with Direction
  C's persistent surface is approved, not a separate fix to schedule.
- **Finding 2 confirmed**: none of these new surfaces should render for `credit_card` accounts, only
  `bank` — `AccountList.tsx`'s `STATEMENT_IMPORTABLE` set including `credit_card` is a pre-existing,
  separate fact about statement import in general and does NOT mean credit cards should get any part
  of this balance-sync feature; that exclusion needs to be explicit in Stage 1+ implementation, not
  assumed to fall out naturally.
- **Finding 3 confirmed**: the new "Import History" screen is approved as new IA.
- **v2 delivered 2026-08-08**:
  [`docs/mockups/proposals/bank-balance-sync-v2.html`](../mockups/proposals/bank-balance-sync-v2.html) —
  the finished, implementation-ready spec (v1 kept intact, not edited). Turns the approved Direction C
  into the full connected interaction chain (account list → detail snapshot, in all 6 states: loading /
  verified / never-imported / mismatch-collapsed / mismatch-expanded / dismissed → drill-in transaction
  list with the two rows highlighted → full checkpoint-timeline escape hatch), and brings surfaces 3–7
  (gap banner, skipped-row count + new Import History screen incl. batch detail drill-in, opening-balance
  confirm, anchor-shift incl. §14b's three outcomes, ambiguous-transfer incl. the "neither" outcome) up
  to the same state-complete, exact-copy level of detail.
  - **One real gap found and fixed while building v2, not just a restatement**: v1's §5 showed the two
    diagnostic-copy signatures (steps-in-partway vs. flat-from-day-one) side by side as reference text but
    never wired either to an actual "Investigate" destination. Steps-in-partway has a real two-row window
    to drill into (Direction C's transaction-list flow, as designed) — but flat-from-day-one has no such
    window (every checkpoint disagrees, including the first), so it needed its own branch: a dedicated
    "Check opening balance" destination reusing the anchor-shift surface's own visual pattern (§14) rather
    than forcing it through the transaction-list drill-in where it doesn't fit. Both branches are now fully
    specified in v2's Frame 2b.
  - **Also resolved in v2**: the account-list badge is binary ("needs a look" vs. not — verified and
    never-imported look identical at list level, deliberately, since neither needs action); the account
    *detail* view is where all distinct states become legible. A dismissed mismatch shows a muted
    acknowledgement line rather than reverting to silence (stays honest/legible, never a silent revert to
    "looks the same as verified"). An anchor disagreement that's "flagged for later" reuses the exact same
    persistent-badge slot as a checkpoint mismatch, with different copy — one status slot, two possible
    causes, not two parallel indicators to keep in sync.
  - **Next**: user review of v2; once approved, Stage 0 implementation (data model fields) can start per
    §7's staged build order.

## 11. Cross-references

- Simulation/checker: [`bank-balance-sync-simulation.html`](bank-balance-sync-simulation.html) (17 sections)
- On-device test scenarios (2026-08-09): [`bank-balance-sync-test-scenarios.html`](bank-balance-sync-test-scenarios.html)
  — 6 synthetic CSV fixtures (`packages/core/tests/fixtures/*-synthetic.csv`: Cashew, MoneyView, 3
  HDFC statements, 1 ICICI statement) + a recommended import order covering every stage end to end,
  including the retrospective-backfill/anchor-shift disagreement variant and a dedicated step
  verifying the post-Stage-7 transfer-checkpoint fix specifically. Use this for real on-device
  verification before committing — everything up to now has only been code review + unit tests.
- Matching engine: `packages/core/src/core/bank-import/matcher.ts`
- Balance check: the old one-shot `balanceCheck.ts`/`checkBalanceAgainstStatement()` nudge was fully
  removed 2026-08-09 (superseded by Stage 4's persistent "unverified account" badge — see the
  post-implementation fixes entry above); `computeAccountVerificationStatus()`
  (`packages/core/src/core/bank-import/accountVerification.ts`) is the current mechanism
- Balance derivation: `packages/core/src/core/accounts/balanceCalculator.ts`
- Cash-withdrawal detection: `packages/core/src/core/bank-import/cashWithdrawalCodes.ts`
- Commit flow: `apps/mobile/src/features/bank-import/useBankImport.ts`
- Data model: `packages/core/src/core/db/types/index.ts` (`Expense`, `Account`)
- Design guidelines (for Stage 4/6 mockups): `docs/DESIGN_GUIDELINES.md`
- Once building starts, add/update `docs/features/` documentation for whichever feature area owns
  bank-import (check current `docs/features/` structure at that time — not yet cross-referenced here
  since this plan was written before any file was touched).
