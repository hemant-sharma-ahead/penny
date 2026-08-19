# Real-device testing pass — fixes & feature gaps

**Status:** 🚧 In progress — Phases 1-3 (21/24 items) ✅ done and committed (`e801e14`). Phase 4 (auto-refresh audit) next.

This is a living punch-list doc, not a phase/track plan in the usual `docs/plans/` sense — it
tracks a batch of real-device testing findings (bugs + feature gaps) rather than a single
architectural initiative. Kept here per the project's plan-file convention so the source list and
its status survive beyond the originating chat session. Two items (Groups redesign, new-user home
experience) are large enough to warrant their own follow-up plan docs once designed — see Phase 3
and Phase 6 below.

## Context

The app is in real-device testing. This doc works through a running punch list from that testing
(bugs, missing features, and two open-ended product questions) without regressing anything and
without re-touching the same area of the app twice. The list grew across the originating session
in three batches (items 1–18, then 19–20, then 21–27) — all three are folded into one plan below.

**Execution order:** overkill-feature removal first, then the quick/easy fixes, then moderate
feature work, then the genuinely big items (Groups redesign, app-wide auto-refresh audit, gesture
survey, new-user experience) last. The source list below is sorted in that pick-up order (not
original item number) and carries a **Status** column — flip it to ✅ as each item actually ships,
so this table stays the single source of truth for "what's left." Phases group items by subsystem
_within_ that ordering, so related files still only get touched once.

Ground rules for this work: no verification sweep / docs update until explicitly asked for at
commit time — each item is "fix it, done," iterated freely in between. Mockups precede any UI
change, built from existing components (no new pickers/dropdowns invented where one already
exists).

## Source list → execution order

| Order | #            | Item (paraphrased)                                                      | Phase   | Status      |
| ----- | ------------ | ----------------------------------------------------------------------- | ------- | ----------- |
| 1     | 1            | Privacy: drop Private mode + Open-mode timer (overkill removal — first) | 1       | ✅ Done     |
| 2     | 2            | Google Drive restore "undefined" error                                  | 1       | ✅ Done     |
| 3     | 4            | Restore-from-Drive button "never enables" (helper text)                 | 1       | ✅ Done     |
| 4     | 3            | "Belongs to another account" message wrong/undiscoverable               | 1       | ✅ Done     |
| 5     | 10           | Toast blocks app interactivity                                          | 1       | ✅ Done     |
| 6     | 19           | Transaction date disappears in multi-select mode                        | 1       | ✅ Done     |
| 7     | 27           | Expenses top icon bar reorder                                           | 1       | ✅ Done     |
| 8     | 25           | Analytics: reorder — Cash Flow last, Daily Routine before Set Aside     | 1       | ✅ Done     |
| 9     | 18           | Financial Health should prefill take-home from income data              | 1       | ✅ Done     |
| 10    | 20           | No bulk "remove hashtag" — only bulk-add exists                         | 1       | ✅ Done     |
| 11    | 21           | Tags must be case-insensitive; lowercase on save; migrate existing      | 2       | ✅ Done     |
| 12    | 26           | Filters popup: add tag filtering, above Category group                  | 2       | ✅ Done     |
| 13    | 7            | Duplicate person/IOU created on repeat name entry                       | 2       | ✅ Done     |
| 14    | 12           | Person-name suggestions while typing Lent/Borrowed                      | 2       | ✅ Done     |
| 15    | 8            | Delete/archive a person's IOU entry (see correction below)              | 2       | ✅ Done     |
| 16    | 11           | Bulk-add existing transactions into a person's IOU ledger               | 2       | ✅ Done     |
| 17    | 6            | Switch transaction type (expense↔income) after save                     | 2       | ✅ Done     |
| 18    | 17 (partial) | Cash-negative check in IOU forms + demo-data audit                      | 2       | ✅ Done     |
| 19    | 24           | Analytics: "Set Aside" groups don't expand like Daily Routine           | 2       | ✅ Done     |
| 20    | 22/23        | Subscriptions "seen N times" → transaction popup with count             | 2       | ✅ Done     |
| 21    | 9, 17 (rest) | Groups (multi-party) redesign — full track                              | 3       | ✅ Done |
| 22    | 14           | App-wide auto-refresh / stale-data audit                                | 4       | Not started |
| 23    | 5            | Mobile gesture survey                                                   | 5       | Not started |
| 24    | 15, 16       | New-user / progressive home experience — spec + mockup only             | 6       | Not started |
| —     | 13           | SMS tracking optimization                                               | Backlog | Not started |

---

## Phase 1 — Quick fixes (do first) — ✅ Complete

**1. Privacy mode → Safe/Open only** _(overkill removal)_

- `PrivacyContext.tsx`: dropped `'privacy'` from `PrivacyMode`; `PersistedPrivacyMode` collapsed to
  `'safe'` only. Removed the Open-mode countdown (`openModeExpiresAt`, the `setTimeout`/
  `formatCountdown` ticker in `PrivacyModeSwitcher.tsx`). Kept the `AppState`-background
  auto-revert-to-Safe safety net — independent safety behavior, not "the timer."
- `PrivacyModeSwitcher.tsx`: 2-item dropdown, no countdown badge, PIN + warning step for
  Safe→Open kept.
- `SettingsContext.tsx`/`SettingsPage.tsx`: removed the now-pointless default-mode picker and the
  `openModeDurationMinutes` setting infrastructure entirely (dead code without a timer).
- `SafeModeSettingsPage.tsx`: banner copy no longer references "Privacy Mode."
- Follow-up dead-code sweep also removed: `PrivacyContext.tsx`'s `setMode` wrapper (had become a
  no-op passthrough) and `loadDefaultPrivacyMode()` + its now-dead hydration `useEffect` (the
  function had already been reduced to a hardcoded `'safe'` return, making the effect a no-op).
- `packages/core`'s shared `privacyModeColors.ts` 3-mode type left untouched — `apps/web-react`
  (frozen) still legitimately uses `'privacy'`.
- Docs flagged as now-stale but **not fixed yet** (deferred to the documentation-maintenance pass
  at commit time): `docs/PRIVACY.md`, `docs/BRD.md`, `docs/ROADMAP.md`'s "Open mode timer —
  still open, not decided" line (now resolved), `docs/features/home.md`,
  `docs/features/cash-flow.md`.

**2/3/4. Backup & Restore**

- **2 — "undefined" error**: `googleDriveProvider.native.ts`'s `getAccessToken()` — wrapped the
  previously-unguarded `GoogleSignin.getTokens()` call; throws a real, readable `Error` now.
- **4 — button never enables**: added "Enter your passphrase above first" helper text under the
  Google Drive restore button in `BackupPage.tsx` when disabled.
- **3 — "belongs to another account"**: added a distinct `BackupStatus` value (`'foreign_blob'`)
  in `backupEngine.ts` with reworded copy explaining the real cause (fresh post-reinstall vault
  key vs. old Drive backup). `AutoBackupCard.tsx` shows a "Restore with my passphrase" CTA for that
  status; `BackupPage.tsx` implements it as a same-page scroll + passphrase-field autofocus.

**10. Toast blocking interactivity**

- Root cause confirmed on-device: Android Dialog-backed `Modal` windows intercept all touches
  regardless of `pointerEvents`. Fix: new `apps/mobile/src/lib/modalStack.ts` (open-modal counter);
  `ToastContext.tsx` now only wraps the toast in a real `<Modal>` when another modal is already
  open — otherwise it's a plain high-`zIndex` sibling `View` that lets taps pass through normally.

**19. Date missing in multi-select mode**

- `TransactionsTab.tsx`: hoisted the `dateLabel` header so it renders in the select-mode branch
  too, not just normal mode.

**27. Reorder Expenses top icon bar**

- `TransactionsSlice.tsx`: filter bar reordered to Budget → Month → Search → Filter → Select.

**25. Reorder Analytics sections**

- `AnalyticsTab.tsx`: `CashFlowTile` moved to the very end in all three views (Monthly/Annual/
  All-time); `DailyRoutineSection` now renders before `SetAsideSection`. Nothing else moved.

**18. Financial Health prefill**

- New `deriveRecentMonthlyIncome()` in `packages/core/src/core/health/scorer.ts` sums the most
  recently completed calendar month's `income`-type transactions, excluding the two IOU income
  categories (Borrowed Money, Collected Money — loan proceeds aren't real income). `useHealthScore.ts`
  persists the value via AsyncStorage; persisted value always wins, prefill only computed once.

**20. Bulk "remove tag"**

- `useExpenses.ts`: new `bulkRemoveHashtag` (symmetric to `bulkAddHashtag`, decrements
  `usageCount`). `BulkHashtagModal.tsx`: added an Add/Remove toggle; Remove mode only shows tags
  actually present across the current selection — no free-text entry.

Verification: `tsc -b` (both packages), scoped `eslint`, and the full `packages/core` vitest suite
(1112 tests) all pass. Full sweep (prettier, mobile-wide eslint, PII gate) still deferred to commit
time.

---

## Phase 2 — Moderate fixes (bounded, single-area, more design but not "big")

**21. Tag case normalization** _(do first in this phase — other items depend on clean tag data)_

- Manual entry, `BulkHashtagModal.tsx`, and `bulkAddHashtag` already lowercase on save. Gap: CSV/
  bank-import's `parseTags()` in `packages/core/src/core/import/importParsers.ts` doesn't
  lowercase — fix to match. Also fix Analytics' `buildHashtagSummary()` (groups by raw string
  today, no `.toLowerCase()`).
- One-time migration: iterate `hashtagsRepo`/`expensesRepo`, lowercase `Hashtag.name` and every
  `Expense.hashtags[]` entry, merge duplicates that collapse to the same lowercase form (combine
  `usageCount`). Follow the existing idempotent-repair pattern (`repairCategoryIcons()`/
  `reconcileDefaultCategories()` in `dedupeDemoCategories.ts`) — boot-time repair pass, not a
  versioned Dexie migration.

**26. Filter by tag**

- Add a "Tag" section to `FilterModal.tsx`, right after Account and before Category group. New
  `tagFilters: string[]` on `FilterState`; chips from `hashtagsRepo`, multi-select OR match.
  Reuses the existing chip-section pattern already in this modal.

**7. Duplicate person on repeat name entry** _(do before 12/11 — they depend on this fix)_

- Root cause: `getOrCreatePerson` is independently reimplemented in `useIou.ts`, `useExpenses.ts`,
  and `useBankImport.ts` (`resolvePerson`), each matching against its own stale in-memory
  `persons` copy. Consolidate into one `packages/core` function that always does a fresh
  `personsRepo.getAll()` match (mirroring `useBankImport.ts`'s already-correct pattern); point all
  three call sites at it.

**12. Person-name suggestions**

- Scope: personal IOU persons only (Groups is a separate, unreconciled data model — future item).
  `ExpenseForm.tsx`'s Lent/Borrowed panel uses a plain `TextInput` + suggestion chips off a
  possibly-stale prop. Align to the type-ahead pattern `PersonPicker.tsx` already uses in
  `EntryForm.tsx` — pills below the field as the user types, single-select, backed by item 7's fix.

**8. Delete/archive a person's IOU entry — corrected after user feedback**

- Verified: delete already exists, in more depth than first assumed. `useIou.ts`'s `removePerson`
  hard-deletes when a person has zero ledger entries, and silently auto-archives
  (`isArchived=true`, no user choice) when entries exist. `IouView.tsx`'s `purgePerson` (only
  reachable from the Archived section) hard-cascades: deletes `ledger_entries` **and their linked
  `Expense` rows**, then the `Person` — fully unguarded, no confirmation, no balance check; the
  only safety net today is an after-the-fact Undo toast.
- Real gaps against what was actually asked for:
  1. **Bug**: `purgePerson` deletes linked `Expense` rows — directly violates "transactions
     recorded should never be removed." Fix: it must delete only the `Person` + its
     `ledger_entries`; linked `Expense` rows stay (they keep their category, just lose the IOU
     person link).
  2. **Missing**: no confirmation popup exists anywhere (both paths are silent, Undo-only). Add:
     when a person with settled history (balance ~0) is removed, show a warning popup with an
     explicit **Archive** or **Delete permanently** choice, instead of today's silent auto-archive.
     Delete uses the fixed, non-cascading purge from (1).
  3. **Missing guard**: `purgePerson` has no balance check at all — an archived person with a real
     outstanding balance can be purged today with zero warning. Add a block (or at minimum a
     strong warning) preventing permanent delete while a balance is still outstanding.
  4. No-history case (never had entries) already works correctly as a direct hard delete — no
     change needed.

**11. Bulk-add existing transactions to a person's IOU ledger**

- Reuse the existing bulk-select pattern from `TransactionsSlice.tsx`. Flow: select transactions →
  pick one person (once, for the batch) → app auto-splits the selection by `type` (expense vs
  income) → for whichever direction(s) are present, ask one category choice for that direction
  (expense: Lending or Return Borrowed; income: Borrowed Money or Collected Money) → apply
  category + person + create matching `ledger_entries` (reusing `seedIouFromExpense`'s linking
  logic) per direction-group. No per-row picker.

**6. Switch transaction type after save**

- `ExpenseForm.tsx`: type `SegmentedControl` only renders on add. Enable in edit mode too, scoped
  to Expense ⟷ Income only (Transfer excluded — structurally needs two accounts). On switch, clear
  the category (type-scoped) and require a re-pick. Block the switch when the transaction has an
  IOU ledger link, is shared to a Group, or is linked to a Goal contribution.

**17 (partial) — cash-negative check in IOU forms**

- `ExpenseForm.tsx` already has a non-blocking `cashWarningBalance` check; `EntryForm.tsx`
  (lend/borrow) and `SettleUpModal.tsx` (settle-up) have no equivalent. Add the same
  `projectedBalance()`-based warning to both. Audit `seedDemoData.ts`'s simulated timeline for any
  point Cash goes negative and add a lightweight assertion so it can't silently regress.

**24. Set Aside not expanding**

- `DailyRoutineSection` and `SetAsideSection` are two differently-built components — only
  `DailyRoutineSection` has expand/collapse (lifted `expandedGroup` state) and nested categories;
  `SetAsideSection` taps straight to the transactions modal. Rebuild `SetAsideSection` to mirror
  `DailyRoutineSection`'s exact expand/collapse pattern.

**22/23. Subscriptions "seen N times" → transaction popup with count**

- `DetectedSubCard.tsx`'s "Seen N times" text isn't pressable at all — wrap in `Pressable`. No
  transaction-id list exists on the subscription object, only `merchantCategory`; on tap, filter
  `expenses` by `normalize(e.description) === candidate.merchantCategory` (reusing `detector.ts`'s
  `normalize()`) and open the existing `EntityTransactionsModal` (already used for Analytics'
  tag/category drill-down — no new modal).
- Count: put it in `subtitle` (e.g. "12 transactions") rather than fighting over the single
  `statLabel`/`statValue` slot some callers already use for something else (e.g. account balance).
  Update all current callers (Analytics' `viewGroup`/`viewCategory`/`viewTag`, plus the new
  Subscriptions caller) to pass it consistently.

Mockup: one file covering — simplified Privacy switcher (Phase 1 carry-over), edit-mode type
toggle, person-suggestion pills, the new delete/archive-person warning popup, bulk-add-to-IOU
flow, and the new Tag filter section. All reuse existing `SegmentedControl`, `ConfirmDialog`,
`Banner`, category picker, and the bulk-action-bar/chip-section patterns already in the app.

---

## Phase 3 — Groups (multi-party, Track E) redesign

One full track — these all touch `GroupDashboard.tsx` / `groupsService.ts` / `workers/groups`
membership logic and are easier to design coherently together than piecemeal.

- **Orphaned shared transactions (9)**: deleting a personal `Expense` never touches `group_events`
  even when shared. The event schema already supports `expense_delete` tombstones (folded out
  already) — no caller ever emits one. Wire `useExpenses.ts`'s delete path to emit one for every
  group the deleted transaction was shared to.
- **Remove/flag a transaction from a group (9)**: per-row action in `GroupDashboard.tsx`'s feed —
  the original recorder can delete/edit their own entry (`expense_edit`/`expense_delete`, both
  already supported by the fold engine); another member gets a lighter "flag as not needed" that
  notifies the recorder instead of unilaterally removing someone else's entry.
- **Admin-less group protection (9)**: no check today prevents the last admin/owner from leaving
  or being demoted. Add a server-side guard blocking a leave/role-change that would leave zero
  admins, unless it's the group's only remaining member (prompt them to close/delete instead).
- **Delete-when-empty for creator (9)**: only `closeGroup`/`reopenGroup` (status flip) exist today.
  Add a real delete, creator-only, allowed only when the group has zero non-deleted
  `shared_expense` events.
- **Write-off / "never coming back" marking (17)**: add a `written_off` settlement variant
  (distinct from a real repayment), both in personal IOU and Groups.
- **Personal ledger → Group promotion (17)**: no bridge exists (`GroupMember.linkedPersonId` is
  reserved/unused). Design a one-way "promote this person's ledger to a Group" action that creates
  a Group, invites that person, seeds it from ledger history, and archives (not deletes) the
  superseded personal ledger.
- **Static (non-app) members (17)**: add a lightweight "placeholder member" (name only, no
  account/invite) that participates in splits/balances but can't sync/confirm anything — closest
  precedent is the personal-IOU `Person`, reusable/extendable rather than a new entity.
- **Settled-group historical lock (17)**: once a group is fully settled/closed, lock its
  historical `group_events` from edit — build alongside the `expense_edit` feature above.
- **Per-person balance view (17)**: already implemented (`GroupDashboard.tsx`'s per-member "owes
  you"/"you owe" breakdown) — just confirm it stays visible once other Group changes land.

Mockup: one consolidated file (GroupDashboard feed row actions, delete-group flow, write-off
marking UI, promote-to-group flow, add-static-member UI) — reuse `ConfirmDialog`, `Banner`,
existing member-list rows.

---

## Phase 4 — App-wide auto-refresh audit

- Current mechanism: hand-rolled pub/sub, `useTxnRefresh`/`notifyTxnChanged`
  (`packages/core/src/hooks/useTxnRefresh.ts`) — not React Query/live-query. There's precedent for
  this exact bug class already fixed once (`useExpenses.ts`'s `saveExpenseWithHashtags` was
  silently missing the broadcast until a 2026-08-10 fix).
- Audit every mutation path that writes a transaction, ledger entry, or group event — confirm it
  calls `notifyTxnChanged()` (or the Groups equivalent). `GroupDashboard.tsx` is fully decoupled
  from this bus today (own `bump()`/`useEffect` reload only) — the concrete cause of "IOU tab
  needs pull-to-refresh after categorizing elsewhere," and likely other Group/IOU staleness too.
  Wire Groups into the same bus (or a dedicated `useGroupRefresh` if warranted). Produce the
  specific list of gaps found before fixing, so nothing gets missed silently.

No mockup needed — behavior-only.

---

## Phase 5 — Mobile gesture survey (item 5)

Deliverable: a findings list for review, not a blanket implementation.

- **Swipe-to-switch-tabs**: not a drop-in — `MainTabs.tsx` uses `@react-navigation/bottom-tabs`,
  no built-in swipe support. Would need a custom pan-gesture layer or a navigator swap — biggest-
  effort item here; decide separately once the rest is seen.
- **Extend `SwipeableRow`** (only on Transactions-tab rows today) to IOU ledger rows and Group
  feed rows — small, reuses an existing component.
- **Swipe-down-to-dismiss** on modals (currently tap-outside/back-button only).
- Nothing else gesture-based exists today (`usePullToRefresh` is vertical-only; the retirement
  chart's drag-to-scrub is a single-purpose responder) — most other "mobile feel" work would be
  net-new, not extending something already there.

---

## Phase 6 — New-user / home experience (items 15, 16) — spec + mockup only

This round produces the design, not code.

- **Threshold recommendation (15)**: gate on 3 completed months of recorded expense history
  (existing `expenseMonthSpan()` helper, not calendar-time-since-signup). Below that bar, Home
  shows a progress state ("2/3 months tracked") instead of today's zero-value empty-state prompts.
  The emergency-fund _target_ (6–9 months saved) is a separate, already-correct number — don't
  conflate the two.
- **Item 16 spec**: the progressive leveling path — track expenses (+ tagging) → IOU →
  subscriptions → goals → investing → EPF → (≥3 months history) net worth/retirement/health score
  on Home. Cover what's visible at each level, which "Did You Know" nudges point to the next
  level, how bank-statement import is surfaced as the fast-start path, and whether a dedicated
  "learn about Penny" screen is needed beyond the existing Discover Penny hub.
- Output: one written spec + one consolidated mockup file, all states with in-page anchor nav.
  Implementation is a separate future plan once reviewed.

---

## Backlog (not this round)

- **Item 13, SMS tracking optimization** — flagged explicitly as "don't lose this"; logged here
  and in `docs/ROADMAP.md`'s backlog during the end-of-task doc pass, not acted on yet.

---

## Verification

No sweep until explicitly requested at commit time. When that point comes: `tsc -b` for
`packages/core`+`apps/mobile`, scoped `eslint`, `prettier --write`, full `vitest`, PII gate — not
run in between items/phases. Manual on-device verification covers UI/behavior checks; no
automated screenshot/visual verification per the project's working-style rule.
