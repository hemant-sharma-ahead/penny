# Real-device testing pass — fixes & feature gaps

**Status:** 🚧 In progress — Phases 1 and 2 (all quick + moderate fixes, items 1-68 except item
42's perf half) ✅ done. Phases 1-3 (original numbering) committed at `e801e14`; everything since,
through this doc's latest update (items 28-68), is implemented in the working tree pending its own
commit. Remaining: item 42's Home perf half (Phase 3), and Phases 4-6 (auto-refresh audit, gesture
survey, new-user home experience spec) — all still not started.

This is a living punch-list doc, not a phase/track plan in the usual `docs/plans/` sense — it
tracks a batch of real-device testing findings (bugs + feature gaps) rather than a single
architectural initiative. Kept here per the project's plan-file convention so the source list and
its status survive beyond the originating chat session.

As originally intended, this doc has exactly two "done" phases — **Phase 1 (quick fixes)** and
**Phase 2 (moderate fixes)** — covering every item that's shipped, regardless of which testing
batch it was found in. The Groups (multi-party) redesign and the four mockup-gated 4th-batch
redesigns were briefly tracked as their own numbered phases (3 and 5) while in progress; now that
they're done, their content has been folded back into Phase 2 as subsections, consistent with how
every other batch of moderate work already lives there. The genuinely big, still-not-started items
(Home perf, the auto-refresh audit, the gesture survey, and the new-user home experience spec) are
now **Phases 3-6** (previously numbered 6-9 while Phases 3-5 were still separately in flight).
Three of those — the Groups redesign (now shipped, folded into Phase 2 below) and, separately, the
new-user home experience (Phase 6) — are large enough to have warranted (or still warrant) their
own follow-up plan docs once designed; the CSV import flow's own rethink already has one
(`docs/plans/csv-expense-import-redesign.md`, shipped 2026-08-14, referenced from Phase 2 below).

## Context

The app is in real-device testing. This doc works through a running punch list from that testing
(bugs, missing features, and several open-ended product questions) without regressing anything
and without re-touching the same area of the app twice. The list grew across several batches:
items 1-18, then 19-20, then 21-27 (all in Phase 1/2), then a 4th batch — items 28-43 — found once
the first batches were live on a real device running longer with real data volume, then a 5th
batch (45-48) and 6th batch (49-58) found while testing the 4th batch's fixes, then a 7th batch
(59-68) found in a later real-device testing session covering backup polish, a person-picker
keyboard bug, several small UI fixes, an IPO redesign, and a Cashew CSV import correctness bug.
**Item numbers never collide across batches** (each batch continues the count rather than
restarting it), but note items 15 and 16 (new-user home experience, Phase 6) are unrelated to the
nearby-numbered items from later batches.

**Execution order:** overkill-feature removal first, then the quick/easy fixes, then moderate
feature work, then the genuinely big items (Home perf, app-wide auto-refresh audit, gesture
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
| 21    | 9, 17 (rest) | Groups (multi-party) redesign — full track                              | 2       | ✅ Done     |
| 22    | 29           | ExpenseForm: discard-changes confirmation on close                       | 1       | ✅ Done     |
| 23    | 30           | Transactions: auto-scroll to newly-added transaction                    | 1       | ✅ Done     |
| 24    | 32, 36       | Shared TextInput ref-forwarding fix (PIN keypad autofocus) — see #63 for the PersonTypeahead correction | 1 | ✅ Done |
| 25    | 33           | App-wide 2-decimal-place currency formatting (now decided, see note)    | 1       | ✅ Done     |
| 26    | 34           | Transactions: hardware back exits select mode                           | 1       | ✅ Done     |
| 27    | 35           | Long-press-to-select latency (renderItem re-render scope)               | 1       | ✅ Done     |
| 28    | 37           | Tags missing from Manage Tags/Filter despite being used                 | 1       | ✅ Done     |
| 29    | 38           | Category rename: "Legal Transport" → "Legal Transport & Hotels"         | 1       | ✅ Done     |
| 30    | 39           | Notary Charges missing icon + audit all category icons                  | 1       | ✅ Done     |
| 31    | 40           | CSV import: backport "Show N more" from DuplicatesBucket.tsx to TileRowList.tsx | 1 | ✅ Done |
| 32    | 41 (tags)    | CSV import: tag suggestions during categorization (port BulkHashtagModal's pattern) | 1 | ✅ Done |
| 33    | 42 (default) | Transactions tab: default to current month instead of All-time          | 1       | ✅ Done     |
| 34    | 28           | Analytics Cash Flow card row layout — design approved (v5)              | 2       | ✅ Done     |
| 35    | 44           | Real per-bank icon/logo system, app-wide (Simple Icons for 4 banks + placeholder) | 2 | ✅ Done |
| 36    | 41 (flow)    | CSV import Accounts + Categorization redesign — design approved (v5)    | 2       | ✅ Done     |
| 37    | 43           | Month-filter UX — persistent scrub bar — design approved (v5)           | 2       | ✅ Done     |
| 38    | 31           | About Penny screen                                                      | 2       | ✅ Done     |
| —     | 45           | Manual-entry category suggestions never see CSV-imported history        | 2       | ✅ Done     |
| —     | 46           | Analytics: no Income card                                                | 2       | ✅ Done     |
| —     | 47           | Filter icon too similar to Select icon                                   | 1       | ✅ Done     |
| —     | 48           | "Maximum call stack size exceeded" crash on large CSV import commit     | 1       | ✅ Done     |
| —     | 49           | Account list redesign — grouped by type, tap-to-reveal actions, real bank logos+colors | 2 | ✅ Done |
| —     | 50           | Real HSBC bank logo (item 44 follow-up — was missed, not actually unavailable) | 1 | ✅ Done |
| —     | 51           | Analytics: Income section mis-grouping + cross-contaminated drill-downs | 1       | ✅ Done     |
| —     | 52           | Analytics: Income + Total Spent moved above the ring graph, all views   | 1       | ✅ Done     |
| —     | 53           | Analytics Cash Flow card: numbers row not vertically centered on icon   | 1       | ✅ Done     |
| —     | 54           | Month scrub bar: auto-scroll broken on RN-Web specifically               | 1       | ✅ Done     |
| —     | 55           | Backup/export: missing `await` on `File.write()` — 6 call sites          | 1       | ✅ Done     |
| —     | 56           | Backup: `accounts` + 7 other real tables missing from `BACKUP_STORES`   | 1       | ✅ Done     |
| —     | 57           | Backup: no override for the Drive foreign-blob state                    | 2       | ✅ Done     |
| —     | 58           | CSV import: tile-list (not just row-list) render caps missing            | 1       | ✅ Done     |
| —     | 59           | Transactions: first row's icon misaligned with its row (rail flex math) | 1       | ✅ Done     |
| —     | 60           | Add Account: Bank dropdown should list banks alphabetically              | 1       | ✅ Done     |
| —     | 61           | Automatic Drive backup firing on every change, not once/configured-day | 1       | ✅ Done     |
| —     | 62           | Backup timestamps missing time-of-day (date only)                       | 1       | ✅ Done     |
| —     | 63           | PersonTypeahead keyboard-dismiss bug — real root cause (corrects #24)   | 1       | ✅ Done     |
| —     | 64           | Groups: "unknown or revoked device" error when creating a new group     | 1       | ✅ Done     |
| —     | 65           | Description-suggestion row: tap-anywhere + show/apply the suggested amount | 2   | ✅ Done     |
| —     | 66           | Backup & Restore screen: colored provider icons + primary-button correction | 2   | ✅ Done     |
| —     | 67           | IPO tab: GMP edge-stripe RAG redesign + SME filter                       | 2       | ✅ Done     |
| —     | 68           | Cashew CSV import: linked transfers not imported + double-categorization + 2-entry balance-correction handling | 2 | ✅ Done |
| 39    | 42 (perf)    | Home: dedupe redundant full-table scans/decrypts + skeleton loading      | 3       | Not started |
| 40    | 14           | App-wide auto-refresh / stale-data audit                                | 4       | Not started |
| 41    | 5            | Mobile gesture survey                                                   | 5       | Not started |
| 42    | 15, 16       | New-user / progressive home experience — spec + mockup only             | 6       | Not started |
| —     | 13           | SMS tracking optimization                                               | Backlog | Not started |

---

## Phase 1 — Quick fixes — ✅ Complete

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

**2/3/4. Backup & Restore — undefined error, disabled-button copy, foreign-blob messaging**

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

**29. Discard-changes confirmation on closing the transaction popup**

- `ExpenseForm.tsx`: the X button, backdrop tap, and Android hardware back (`Modal.tsx`'s
  `onRequestClose`) all currently call `onClose` unconditionally — no comparison against the
  form's initial state. Added a dirty check (any field differs from its value when the form opened)
  and, if dirty, a confirmation (reusing the existing `ConfirmDialog`) with **Discard**/**Cancel**
  before actually closing. Applies to all three close paths identically.

**30. Auto-scroll to a newly-added transaction**

- `TransactionsSlice.tsx`'s `handleSaveExpense` → `closeForm()` previously only hid the modal, no
  scroll. `TransactionsTab.tsx` already held a `FlashList` ref (`listRef`) and already had a
  working scroll-to-item precedent (the bank-import checkpoint-highlight flow) — extended that same
  call to fire after a successful *new* transaction save (not edit).

**32. Shared TextInput ref-forwarding fix (PIN keypad autofocus)**

- Root cause: the shared `ui/TextInput` wrapper didn't forward a ref, so the app's own established
  fix for "autoFocus inside a native Modal doesn't reliably work" (`Modal`'s `onShow` prop + a ref →
  `.focus()`, already used by `ExpenseForm.tsx`'s description field) couldn't be applied anywhere
  that used the wrapped component instead of a raw `RNTextInput`. `PrivacyModeSwitcher.tsx`'s PIN
  step uses the wrapped `TextInput` with `autoFocus` but the surrounding `Modal` had no `onShow` —
  even adding `onShow` wouldn't have helped without a ref to focus. Fix: added ref-forwarding to
  the shared `ui/TextInput`, then applied the `onShow`+ref pattern to `PrivacyModeSwitcher.tsx`'s
  PIN field.
- Note: this same investigation originally also targeted `BulkAddToIouModal.tsx`'s
  `PersonTypeahead` keyboard-dismiss symptom (item 36) as a second instance of the same
  autoFocus-into-Modal race. On-device testing showed that theory didn't actually explain the
  PersonTypeahead bug — see **#63** below for the real root cause and its fix.

**33. App-wide 2-decimal-place currency formatting — now decided**

- Confirmed: whole-rupee rounding (`formatCurrency`, `toIndianGrouping`) was the app-wide
  convention at 590 call sites; `formatCurrencyDecimal` existed but was used nowhere. Per explicit
  decision, this became the new app-wide standard everywhere, not just Transactions. Verified tight
  layouts (`CashFlowTile`, `GlanceHeader`) still fit with the 2 extra characters (`.00`).

**34. Hardware back should exit select mode**

- `TransactionsTab.tsx`/`TransactionsSlice.tsx` had no `BackHandler` listener at all — back fell
  through to React Navigation's default (exiting the tab), stranding select-mode state. Added the
  same `BackHandler.addEventListener('hardwareBackPress', ...)` pattern already used in
  `ChangePinPage.tsx`/`ImportPage.tsx` — exits select mode and consumes the event while
  `selectMode` is true.

**35. Long-press-to-select latency**

- Root cause: `TransactionsTab.tsx`'s `renderItem` listed `selectMode`/`selectedIds` in its
  dependency array, so entering select mode changed `renderItem`'s identity and forced `FlashList`
  to re-render every currently mounted/recycled row, not just the pressed one. Fixed by scoping
  that re-render instead of touching the (already-faster-than-default) 350ms `delayLongPress`.

**37. Tags missing from Manage Tags/Filter despite being used elsewhere**

- Confirmed root cause: Manage Tags/Filter read from the `Hashtag` table while Analytics reads tag
  strings directly off live `Expense.hashtags[]` — a tag whose `Hashtag` row was never created (or
  got removed) while the string still lived on real expenses produced exactly this asymmetry. Fixed
  every tag-adding code path (including CSV/bank-import) to reliably upsert a `Hashtag` row, and
  wired `notifyTagsChanged()` into `useExpenses.ts`'s tag-mutating functions so Manage Tags/Filter
  and the Expenses screen's own `hashtagsRepo` state can't go stale relative to each other.

**38. Category rename**

- `defaultCategories.ts`: `cat-legal-transport`'s `name` field, `'Legal Transport'` →
  `'Legal Transport & Hotels'`.

**39. Notary Charges icon + category-icon audit**

- `cat-legal-notary`'s `icon` field was `'ti-stamp'`, which doesn't exist in the installed
  `@tabler/icons-react-native` package — `Icon.tsx` silently renders nothing for any unmatched
  name, by design, so this had never surfaced as an error. Fixed to a real icon name
  (`ti-rubber-stamp`); audited every other `icon:` field in `defaultCategories.ts` against the
  actual installed icon exports for the same never-noticed-gap risk.

**40. CSV import: backport the 60-row "Show more" pattern**

- `TileRowList.tsx`'s `RENDER_CAP = 60` had no escape — rows past 60 were simply never reachable.
  Ported `DuplicatesBucket.tsx`'s existing "Show N more" pattern (`INITIAL_RENDER_CAP`/
  `LOAD_MORE_BATCH`, both 60) into `TileRowList.tsx` verbatim.

**41 (tags only). CSV import: tag suggestions during categorization**

- `ImportCategorizeModal.tsx`'s tag field was a bare `TextInput` with zero suggestions. Threaded
  `hashtags` into it and ported `BulkHashtagModal.tsx`'s existing "Frequent" row (top-5 by
  `usageCount`) + live `startsWith` suggestion pattern.

**42 (default-month only). Transactions tab: default to current month**

- `useTransactionFilters.ts`'s `monthFilter` started `null` ("All time") — every open of the
  Expenses tab loaded, decrypted, filtered, and grouped the *entire* transaction history. Defaulted
  `monthFilter` to the current month instead — both a better default and a meaningful performance
  win at high transaction counts.

**47. Filter icon looked too similar to the Select icon**

- `TransactionsSlice.tsx`'s Filter button used `ti-adjustments-horizontal` (sliders), visually
  close to the Select button's `ti-list-check` at small size. Swapped to `ti-filter` (Tabler's real
  funnel-shaped icon). Left the two other `ti-adjustments-horizontal` usages alone
  (`AccountsPage.tsx`'s "Merchant recognition settings", `BankImportOverridesPage.tsx`'s empty
  state) — genuine settings icons, unrelated to this confusion.

**48. "Maximum call stack size exceeded" crash on a large (~9,000-row) CSV import commit**

- Pre-existing bug in the core encryption layer used by every encrypted write in the app.
  `packages/core/src/core/db/repository.ts`'s `bufferToBase64()` built its output via
  `btoa(String.fromCharCode(...bytes))`, spreading the entire byte array as individual function
  arguments — blows the JS call stack once the buffer is large enough. Reproduced directly (a
  synthetic 9,000-row `writeImportBatch` call threw the identical error before the fix), fixed by
  building the base64 string in safe-sized (32KB) chunks instead of one spread, confirmed all
  existing encryption/repository tests still pass (identical output), and added a permanent
  regression test (`tests/db/repository.test.ts`, a large-payload round-trip).

**50. Real HSBC bank logo**

- Item 44 (Phase 2 below) originally asserted only 3 of 12 preset banks had a CC0-licensed mark
  available (Simple Icons) — wrong for HSBC specifically, which Simple Icons does carry (slug
  `hsbc`); never actually checked before that claim was written. Verified the real path/color
  (`#DB0011`) against two independent CDN mirrors and added it to `BankLogo.tsx` (now 4 of 12
  presets have a real logo). Re-checked the remaining 8 — confirmed genuinely unavailable under any
  clear license; sourcing those from each bank's own official brand page remains its own separate
  follow-up.

**51. Analytics: Income section mis-grouping + cross-contaminated drill-downs**

- Root cause: `Loan EMI`/`Savings Transfer`/`Insurance Premium` are `applicableTo: 'expense'`
  categories, but some real income-type transactions carry them anyway (pre-existing data, from
  before the category picker enforced `applicableTo`). `buildIncomeData` grouped by the category's
  raw `groupKey()`, so those rows rendered under a "Financial" sub-group — the identical string
  `buildSetAsideData` uses for its own expense-side row — which both mislabeled the row and collided
  `expandedGroup` with the unrelated Set Aside row. Separately, the shared `viewGroup`/
  `viewCategory` drill-down callbacks had no `e.type` check at all, so "View all transactions in
  Financial" opened from *either* side could leak the *other* side's transactions into the popup.
- Fix: new `incomeGroupKey()` (`useExpenseAnalytics.ts`) — a category only ever gets its own row if
  it's itself `applicableTo: 'income'`; anything else folds into the fixed `'income'` bucket. New
  `viewIncomeGroup`/`viewIncomeCategory` (`AnalyticsSlice.tsx`), explicitly `e.type === 'income'`-
  scoped and wired only to `IncomeSection`; `viewGroup`/`viewCategory` now explicitly require
  `e.type === 'expense'` too, closing the leak in both directions.

**52. Analytics: Income + Total Spent moved above the ring graph**

- Per explicit request: in all three views (Monthly/Annual/All-time), `PulseCard` ("Total spent")
  now renders before `DailyLivingCard` (the ring), and `IncomeSection` now leads the whole view,
  ahead of even those two.

**53. Analytics Cash Flow card: numbers not centered on the account icon**

- The per-account row's outer `flex-row` used `items-start`; the icon+name column is taller than
  the single-line number row, so the numbers sat above the icon's true vertical center. Changed to
  `items-center`.

**54. Month scrub bar: auto-scroll broken on RN-Web**

- The previous fix (item 43 follow-up, `measureLayout` for a fresh same-tick read) resolved the
  original bug on-device but not on RN-Web — `measureLayout` is a native-bridge measurement call;
  react-native-web's shim for it doesn't reliably return scroll-aware coordinates. Dropped
  `measureLayout` entirely for the plain `onLayout`-cached offset (identical on every platform),
  deferring the read two `requestAnimationFrame` ticks instead of racing it with a same-tick native
  measurement call.

**55. Backup/export: missing `await` on `File.write()` — 6 call sites**

- `expo-file-system`'s `File.write()` is async (`Promise<void>`); 6 places called it without
  `await`, immediately followed by something that reads/shares/deletes that same file — a real race
  that can hand a still-writing/truncated file to the next step. Fixed in: `AutoBackupCard.tsx`
  (manual "This device" export), `localBackup.native.ts` (the silent daily on-device snapshot),
  `exportCsv.native.ts` (both plain CSV and password-protected ZIP), `PlannerResults.tsx` and
  `RetirementCard.tsx` (XLSX export), and `UnparsedMessagesPage.tsx` (SMS export).

**56. Backup: `accounts` + 7 other real tables missing from `BACKUP_STORES`**

- `BACKUP_STORES` (`backupManager.ts`) had silently drifted behind `schema.ts` — `accounts`,
  `activity_log`, `merchant_memory`, `transaction_templates`, `bank_cash_withdrawal_codes`,
  `sms_transactions`, `sms_account_mappings`, and `sms_excluded_senders` were never included in any
  backup. `accounts` is the severe one: every `Expense.accountId` references it, so restoring onto
  a wiped/new device brought back every transaction with zero accounts for them to belong to. All 8
  added; backward-compatible with older backup files.

**58. CSV import: tile-list render caps missing**

- Item 40 capped the ROWS inside one category tile (`TileRowList.tsx`) but never capped the number
  of TILES itself — `TransactionsStage.tsx`'s `needsInputGroups`/`stagedGroups`/`skippedGroups` each
  rendered as a plain, fully-unbounded `.map()` of tiles. Added the same "Show N more" pattern to
  all three (cap 25, smaller than `TileRowList`'s 60 since each tile is a much heavier component).
  Also capped `CarryForwardExcluded.tsx`'s row list, which had no cap at all.

**59. Transactions: first row's icon misaligned with its row**

- Root cause: `TransactionsTab.tsx`'s rail uses two equal `flex: 1` spacers around a fixed-size
  icon to keep it vertically centered against a variable-height row; the bottom spacer's flex value
  was previously collapsed to `0` for the last row overall (to hide the connecting line there),
  which broke the centering math for every row, most visibly the very first one seen on open. Fix:
  decoupled "is centered" from "is the line visible" — both spacers now keep `flex: 1` always, and
  only `backgroundColor` (`theme.border` vs `'transparent'`) toggles whether the connecting line is
  actually visible.

**60. Add Account: Bank dropdown should list banks alphabetically**

- `apps/mobile/src/lib/bankPresetLabels.ts`: `BANK_PRESET_OPTIONS` now
  `.sort((a, b) => a.label.localeCompare(b.label))`.

**61. Automatic Drive backup firing on every change, not once per configured day**

- `backupEngine.ts`'s `runNow(manual = false)` cloud branch previously pushed whenever
  `decision.push` was true AND (manual OR auto-backup enabled) — meaning every single data change
  queued an immediate push regardless of the user's configured 1–14 day frequency; the frequency
  setting was only ever honored on the *pull* side. Fix:
  `const push = manual ? decision.push : dueDaily && getAutoBackupEnabled();` — automatic
  (non-manual) pushes now only fire once the configured day boundary (`dueDaily`) has actually
  passed. Manual "Back up now" is unaffected — still pushes immediately on demand.

**62. Backup timestamps missing time-of-day**

- `AutoBackupCard.tsx`'s "Backed up ·"/"Last daily snapshot ·" captions used a date-only
  `formatDate`; switched to a new `formatDateTime` so the exact backup time is visible, not just
  the day.

**63. PersonTypeahead keyboard-dismiss bug — real root cause (corrects #24/#36)**

- Symptom: whenever setting a person for an IOU (Lent/Borrowed panel in `ExpenseForm.tsx`, or
  bulk-add in `BulkAddToIouModal.tsx`), typing into the person field would show the "create
  suggestion," then the keyboard would appear and immediately disappear, making it impossible to
  actually type a full query or select a suggestion.
- Item 24/36's original theory (a missing `onShow`+ref pattern for `autoFocus` inside a `Modal`)
  turned out not to be the actual cause once tested end-to-end. Real root cause:
  `PersonTypeahead.tsx`'s outer wrapper toggled `zIndex` between `50` and `undefined` depending on
  `showList`; on Android that style change forces the native view to be recreated at the rendering
  layer, which happened to land mid-keystroke while the soft keyboard's IME was still focused —
  dismissing it.
- Fix: `zIndex` is now a fixed `50` regardless of `showList` (only the dropdown's
  `display: 'flex'/'none'` toggles, no longer a conditional mount/unmount). Confirmed fixed in both
  usages — `ExpenseForm.tsx`'s Lent/Borrowed panel and `BulkAddToIouModal.tsx`.

**64. Groups: "unknown or revoked device" error when creating a new group**

- Root cause: `BackupPage.tsx`'s restore success paths (`handleImport()`, `handleCloudRestore()`)
  never set the `RECONCILE_FLAG` that `IdentityReconciler.tsx` checks to re-run `claimAccount()`
  after a restore — unlike the onboarding restore path (`AccountRecoveryScreen.tsx`), which already
  did. A device that restored a backup through Settings (not onboarding) kept a stale/mismatched
  device registration, and the Groups worker's `device.revoked` check on `/register` legitimately
  rejected it.
- Fix: both `BackupPage.tsx` success paths now call `await setItem(RECONCILE_FLAG, '1')` right
  before their existing `notifyAuthShouldRecheck()` call, so the next unlock re-claims the device
  identity, same as onboarding already did. A device already stuck in this state needs one more
  restore after the fix to actually heal (the fix only takes effect going forward) — confirmed
  working end-to-end on a real device.

Verification: `tsc -b` (both packages), scoped `eslint`, and the full `packages/core` vitest suite
all pass throughout. Full sweep (prettier, mobile-wide eslint, PII gate) still deferred to commit
time.

---

## Phase 2 — Moderate fixes (bounded, single-area, more design but not "big") — ✅ Complete

**21. Tag case normalization** _(done first in this phase — other items depended on clean tag data)_

- Manual entry, `BulkHashtagModal.tsx`, and `bulkAddHashtag` already lowercased on save. Gap fixed:
  CSV/bank-import's `parseTags()` (`packages/core/src/core/import/importParsers.ts`) now lowercases
  to match, as does Analytics' `buildHashtagSummary()` (previously grouped by raw string).
- One-time migration added: iterates `hashtagsRepo`/`expensesRepo`, lowercases `Hashtag.name` and
  every `Expense.hashtags[]` entry, merges duplicates that collapse to the same lowercase form
  (combining `usageCount`) — a boot-time repair pass following the existing
  `repairCategoryIcons()`/`reconcileDefaultCategories()` idempotent-repair pattern.

**26. Filter by tag**

- Added a "Tag" section to `FilterModal.tsx`, right after Account and before Category group. New
  `tagFilters: string[]` on `FilterState`; chips from `hashtagsRepo`, multi-select OR match —
  reuses the existing chip-section pattern already in this modal.

**7. Duplicate person on repeat name entry** _(done before 12/11 — they depended on this fix)_

- Root cause: `getOrCreatePerson` was independently reimplemented in `useIou.ts`, `useExpenses.ts`,
  and `useBankImport.ts` (`resolvePerson`), each matching against its own stale in-memory `persons`
  copy. Consolidated into one `packages/core` function that always does a fresh
  `personsRepo.getAll()` match; all three call sites now point at it.

**12. Person-name suggestions**

- Scope: personal IOU persons only (Groups is a separate, unreconciled data model). Aligned
  `ExpenseForm.tsx`'s Lent/Borrowed panel to the type-ahead pattern `PersonPicker.tsx` already uses
  in `EntryForm.tsx` — pills below the field as the user types, single-select, backed by item 7's
  fix. (See item 63 above for the later real fix to this component's keyboard-dismiss bug.)

**8. Delete/archive a person's IOU entry — corrected after user feedback**

- Verified: delete already existed, in more depth than first assumed. `useIou.ts`'s `removePerson`
  hard-deletes when a person has zero ledger entries, and silently auto-archived
  (`isArchived=true`, no user choice) when entries existed. `IouView.tsx`'s `purgePerson` (only
  reachable from the Archived section) hard-cascaded: deleted `ledger_entries` **and their linked
  `Expense` rows**, then the `Person` — fully unguarded, no confirmation, no balance check.
- Real gaps fixed:
  1. **Bug**: `purgePerson` deleted linked `Expense` rows — directly violated "transactions
     recorded should never be removed." Fixed to delete only the `Person` + its `ledger_entries`;
     linked `Expense` rows now stay (keeping their category, just losing the IOU person link).
  2. **Missing**: added a warning popup with an explicit **Archive** or **Delete permanently**
     choice when removing a person with settled history (balance ~0), replacing the old silent
     auto-archive. Delete uses the fixed, non-cascading purge from (1).
  3. **Missing guard**: added a block preventing permanent delete while a balance is still
     outstanding.
  4. No-history case (never had entries) already worked correctly as a direct hard delete — no
     change needed there.

**11. Bulk-add existing transactions to a person's IOU ledger**

- Reused the existing bulk-select pattern from `TransactionsSlice.tsx`. Flow: select transactions →
  pick one person (once, for the batch) → app auto-splits the selection by `type` (expense vs
  income) → for whichever direction(s) are present, one category choice for that direction
  (expense: Lending or Return Borrowed; income: Borrowed Money or Collected Money) → applies
  category + person + creates matching `ledger_entries` (reusing `seedIouFromExpense`'s linking
  logic) per direction-group. No per-row picker.

**6. Switch transaction type after save**

- `ExpenseForm.tsx`: type `SegmentedControl` now also renders in edit mode, scoped to Expense ⟷
  Income only (Transfer excluded — structurally needs two accounts). On switch, the category
  (type-scoped) clears and requires a re-pick. Blocked when the transaction has an IOU ledger link,
  is shared to a Group, or is linked to a Goal contribution.

**17 (partial) — cash-negative check in IOU forms**

- `ExpenseForm.tsx` already had a non-blocking `cashWarningBalance` check; added the same
  `projectedBalance()`-based warning to `EntryForm.tsx` (lend/borrow) and `SettleUpModal.tsx`
  (settle-up). Audited `seedDemoData.ts`'s simulated timeline for any point Cash goes negative and
  added a lightweight assertion so it can't silently regress.

**24. Set Aside not expanding**

- `DailyRoutineSection` and `SetAsideSection` were two differently-built components — only
  `DailyRoutineSection` had expand/collapse and nested categories. Rebuilt `SetAsideSection` to
  mirror `DailyRoutineSection`'s exact expand/collapse pattern (shared `expandedGroup` state).

**22/23. Subscriptions "seen N times" → transaction popup with count**

- `DetectedSubCard.tsx`'s "Seen N times" text is now wrapped in a `Pressable`; on tap, filters
  `expenses` by `normalize(e.description) === candidate.merchantCategory` and opens the existing
  `EntityTransactionsModal` (already used for Analytics' tag/category drill-down — no new modal).
  Count moved into `subtitle` (e.g. "12 transactions"); all current callers (Analytics'
  `viewGroup`/`viewCategory`/`viewTag`, plus the new Subscriptions caller) updated to pass it
  consistently.

Mockup covering this phase's earlier items: simplified Privacy switcher (Phase 1 carry-over),
edit-mode type toggle, person-suggestion pills, the delete/archive-person warning popup,
bulk-add-to-IOU flow, and the Tag filter section — reusing existing `SegmentedControl`,
`ConfirmDialog`, `Banner`, category picker, and bulk-action-bar/chip-section patterns.

### Groups (multi-party, Track E) redesign — full track

Originally tracked as its own phase while in progress (touching `GroupDashboard.tsx` /
`groupsService.ts` / `workers/groups` membership logic coherently as one track); folded back in
here now that it's shipped.

- **Orphaned shared transactions (9)**: deleting a personal `Expense` never touched `group_events`
  even when shared. The event schema already supported `expense_delete` tombstones — no caller
  ever emitted one. Wired `useExpenses.ts`'s delete path to emit one for every group the deleted
  transaction was shared to.
- **Remove/flag a transaction from a group (9)**: added a per-row action in `GroupDashboard.tsx`'s
  feed — the original recorder can delete/edit their own entry (`expense_edit`/`expense_delete`,
  both already supported by the fold engine); another member gets a lighter "flag as not needed"
  that notifies the recorder instead of unilaterally removing someone else's entry.
- **Admin-less group protection (9)**: added a server-side guard blocking a leave/role-change that
  would leave zero admins, unless it's the group's only remaining member (prompts them to
  close/delete instead).
- **Delete-when-empty for creator (9)**: added a real delete, creator-only, allowed only when the
  group has zero non-deleted `shared_expense` events (previously only `closeGroup`/`reopenGroup`
  existed).
- **Write-off / "never coming back" marking (17)**: added a `written_off` settlement variant
  (distinct from a real repayment), both in personal IOU and Groups.
- **Personal ledger → Group promotion (17)**: added a one-way "promote this person's ledger to a
  Group" action that creates a Group, invites that person, seeds it from ledger history, and
  archives (not deletes) the superseded personal ledger.
- **Static (non-app) members (17)**: added a lightweight "placeholder member" (name only, no
  account/invite) that participates in splits/balances but can't sync/confirm anything.
- **Settled-group historical lock (17)**: once a group is fully settled/closed, its historical
  `group_events` now lock from edit.
- **Per-person balance view (17)**: already implemented (`GroupDashboard.tsx`'s per-member "owes
  you"/"you owe" breakdown) — confirmed it stays visible with the above changes.

Mockup: one consolidated file (GroupDashboard feed row actions, delete-group flow, write-off
marking UI, promote-to-group flow, add-static-member UI) — reused `ConfirmDialog`, `Banner`,
existing member-list rows.

### Mockup-gated UI/UX redesigns (4th batch) — design approved (v5)

Five iterations (`docs/mockups/proposals/fourth-batch-redesigns-v1.html` through `-v5.html`),
originally tracked as their own phase while in progress; folded back in here now that they're
shipped.

**28. Analytics Cash Flow card — row layout**

- Final design: account icon stacked above a truncated account name in a narrow (~54px) left
  column, freeing the rest of the row for all 4 numbers (Initial/Income/Spend/Computed left) at
  real size in one row. Decimals always show (item 33).

**44. Real per-bank icon/logo system**

- No per-bank icon/logo system existed before this — only 4 generic icons, one per `AccountType`.
  Added real per-bank logos app-wide (every place `account.icon`/`account.color` render:
  `CashFlowTile`, `AccountsStrip.tsx`, `AccountChips.tsx` in `ExpenseForm.tsx`, and elsewhere),
  keyed off the already-existing-but-unused `Account.bankId` field.
- Sourcing: **Simple Icons** (CC0-licensed) covers 4 of 12 banks in `bankPresetLabels.ts` — HDFC
  Bank, ICICI Bank, Axis Bank, and (per item 50's follow-up) HSBC. The other 8 (SBI, IndusInd, Bank
  of Baroda, Yes Bank, PNB, Canara, IDFC First, plus "custom") need sourcing from official public
  brand pages — scoped as its own follow-up task; shipped the 4 real logos + an honest generic-icon
  placeholder (not a fabricated logo) for the rest.

**41 (flow). CSV import — Accounts & Categorization**

- Not re-litigating what `docs/plans/csv-expense-import-redesign.md` (shipped 2026-08-14) already
  decided (6-stage wizard split, in-memory-until-commit, CSV-import staying separate from
  bank-import, the bucket pattern).
- **Accounts stage**: dropped "New account" as a per-row kind option entirely — added a
  **"+ Create Account"** button at the top of the stage screen instead, opening the real
  `AccountFormModal`; a newly-created account immediately becomes available as a match target. Each
  row keeps the real side-by-side paired-card visual (`DuplicatesBucket.tsx` language) — the right
  side is a real dropdown/selector (bordered, chevron, real bank logo per item 44), pre-filled with
  a smart best-guess, changeable by tapping. Below the card: explicit **Confirm** (left) / **Skip**
  (right) while undecided; once confirmed, a green "✓ Confirmed" line plus a subtle "Skip" text link
  next to it (stays available even after confirming). **Confirm is now a required explicit tap for
  every row**, including a confident existing-account match — a deliberate behavior change from the
  prior auto-ready-with-no-confirm-step behavior. Applied identically to both Needs-Review and Ready
  bucket rows. Kept the real `BucketCard` count badges, unchanged.
- **Categorization — explicitly NOT redesigned**: kept today's real pattern as-is — the
  collapsible accordion tile per category (`CategoryTile.tsx`) with the existing "Categorize N
  selected ›" button opening the real `ImportCategorizeModal`. The one change: picking "Create"
  inside that modal now opens the real `CategoryEditorModal` instead of the old bespoke inline
  name+group fields.

**43. Month-filter UX — persistent scrub bar**

- Final design: a persistent horizontal month-chip strip below the top filter bar, no visible
  scrollbar track, scrolling all the way back to the user's actual earliest recorded transaction
  (a one-time `Math.min` scan over `expensesRepo.getAll()`'s dates, cached). A chip shows just the
  month name when its year matches the real current calendar year, else "Mon YYYY". A pinned
  **"All"** chip sits outside the scrollable strip (always reachable) so the classic unfiltered
  all-time view stays one tap away even though a month is now always active by default (item 42). A
  calendar-icon button at the strip's end opens the real `MonthPickerModal` for jumping further back
  than what's visible. (See item 54 above for a later RN-Web-specific auto-scroll follow-up fix.)

**31. About Penny screen**

- Content signed off (no build number — none exists anywhere in `app.json`, version-only via
  `expo-constants`; mission statement reused verbatim from onboarding's `PrivacyPromiseScreen.tsx`;
  a link into Privacy Promise content; a hand-maintained "what's new" changelog per version).
  Mockup: `docs/mockups/proposals/about-penny-v1.html`.
- New: `AboutPennyPage.tsx`, `whatsNew.ts` (the hand-maintained `{version, highlights}[]` array —
  update this at each release), `apps/mobile/src/lib/appVersion.ts` (shared `APP_VERSION`, factored
  out of `FeedbackPage.tsx`'s previously-local constant), `privacyPillars.ts` (mission/pillars
  factored out of `PrivacyPromiseScreen.tsx` so both screens can't drift), and a new
  `PrivacyPromisePage.tsx` — a real deviation from the original plan: the onboarding
  `PrivacyPromiseScreen` has no header/back button (built to be seen exactly once, pre-unlock), so
  linking an already-onboarded user there from Settings would strand them; this new screen is the
  same content with a proper back button instead. Routes (`AboutPenny`, `PrivacyPromise`)
  registered in `HomeStack.tsx`. Row added last in Settings' "Data & activity" card, after Discover
  Penny. Mobile-only — `apps/web-react` has no equivalent and is frozen; confirmed no parity gap.

### 5th batch: found while testing the above on-device

**45. Manual-entry category suggestion never sees CSV-imported history**

- Root cause: two entirely separate "remembered category" systems existed. `ExpenseForm.tsx`'s
  live suggestions came from `merchantMemoryRepo` (a Dexie table, populated by a one-time backfill
  plus an incremental update on every manual save). CSV import's own remembered-category logic was a
  totally different, AsyncStorage-backed mapping keyed on the CSV's category-column label, not the
  transaction description — `importWriter.ts`'s commit path never touched `merchantMemoryRepo` at
  all, so CSV-imported expenses were structurally invisible to `ExpenseForm`'s suggestion engine.
- Fix: wired `importWriter.ts` (and bank-import's commit path) to also call `buildMemory()`/upsert
  into `merchantMemoryRepo` for every committed row. Bumped the backfill version flag
  (`penny_merchant_memory_v2` → `v3`) so the one-time backfill re-ran once more, retroactively
  indexing already-imported history too.

**46. Analytics: no Income card**

- Confirmed income had zero category-wise visibility anywhere in Analytics — `buildGroupData`/
  `buildSetAsideData` both explicitly excluded `type !== 'expense'` before `classify()` ever ran, so
  income wasn't misclassified into Set Aside, it was just silently dropped entirely. Added an Income
  card to Monthly/Annual/All-time Analytics, mirroring `SetAsideSection`'s exact expand/collapse
  pattern grouped over the 15 default income categories, slotted right after `SetAsideSection`,
  before `HashtagsSection`, in all three views, sharing the same lifted `expandedGroup` state.

### 6th batch: found while testing Phases above on-device (account cards, Analytics, backup/restore, CSV import)

**49. Account list redesign**

- The gradient "mini card" pattern (`docs/DESIGN_GUIDELINES.md`'s "Identity-colour gradient mini
  card" section) was reported as not following the theme, wasting space, and still not using real
  bank icons in several places despite item 44 shipping. 7 mockup concepts explored
  (`docs/mockups/proposals/account-list-redesign-v1.html` through `-v3.html`) before landing on:
  cards grouped by account type (Bank Accounts / Cash & Wallets / Credit Cards), a flat bordered
  list row (gradient dropped entirely), a vertical `ti-dots-vertical` kebab beside the balance that
  tap-reveals exactly 3 action icons below (Import XOR Reconcile + Edit + Delete), and the real
  `includeInNetWorth` caption carried over unchanged. Whole-row tap still opens the transaction
  popup. `AccountList.tsx` rewritten; `docs/DESIGN_GUIDELINES.md`'s gradient section is now stale
  (flagged for the docs pass).
- Real per-bank logos in this redesign: HDFC/ICICI/Axis/HSBC (item 50); SBI/Kotak/IndusInd get
  their real official brand color tinting a generic fallback icon (SBI `#00B5EF`, Kotak `#ED1C24`,
  IndusInd `#98272A`) — never a fabricated logo mark.

**57. Backup: no override for the Drive foreign-blob state**

- The `foreign_blob` banner (item 3) only ever offered "Restore with my passphrase" — no way to say
  "keep this device's current data and stop offering me that old backup." Traced in
  `backupEngine.ts`: while `foreign_blob` is active, `runNow()`'s cycle always attempted a pull
  first, which threw before a push ever got a chance to run — no path to a fresh push other than
  resolving the state via restore. New `overwriteRemoteWithLocal()` (`backupEngine.ts`) skips the
  pull entirely and force-pushes this device's current export, exposed through the native
  `SyncProvider`. New destructive, confirm-gated "Overwrite Drive with this device's data instead"
  button in `AutoBackupCard.tsx`'s banner (mockup: `docs/mockups/proposals/
drive-foreign-blob-override-v1.html`).

### 7th batch: found in the follow-up real-device testing session (backup polish, IPO redesign, Cashew import)

**65. Description-suggestion row: tap-anywhere + show/apply the suggested amount**

- `ExpenseForm.tsx`'s merchant-memory suggestion rows previously required tapping a small trailing
  "Use" button; the row itself wasn't pressable, and the suggested amount was never shown or
  applied. Fix: the suggestion row itself is now the tap target (`applyMemory(mem)` fires on row
  press); the trailing "Use" text was replaced with the suggestion's formatted amount (when known);
  `applyMemory()` now also fills the Amount field from `mem.amount` (only if present), leaving it
  editable afterward. Backed by `MerchantMemory` gaining an `amount?: number` field, populated by
  `buildMemory()`/`buildMemoriesFromExpenses()` from the matching expense's real amount.

**66. Backup & Restore screen: colored provider icons + primary-button correction**

- Mockup: `docs/mockups/proposals/backup-icons-and-ipo-gmp-v1.html` (3 tiers explored for the
  icon/button treatment; the "moderate" tier was picked). New `BackupProviderLogo.tsx`
  (`DriveLogo`, `AppleLogo({size, dark})`, `DRIVE_BLUE`) renders real colored Drive/Apple marks in
  the Automatic Backup card's tap-to-reveal rows (device/Drive/iCloud) via `IconBadge`'s
  `iconElement` prop, replacing the flat monochrome icons. "Restore from Drive" and every "Back up
  now" button (device/Drive/iCloud) were promoted from secondary to `variant="primary"` styling —
  they were always primary actions, just styled as secondary; Drive's variant is additionally
  tinted `DRIVE_BLUE`. Drive's "Active" pill also tinted Drive-blue (a judgment call beyond the 3
  explicitly named buttons, flagged and kept without objection).

**67. IPO tab: GMP edge-stripe RAG redesign + SME filter**

- Same mockup file as item 66, IPO section (6 additional design options explored beyond the first 2
  per explicit request; the edge-stripe option was chosen). `IpoTab.tsx`'s `renderIpoCard()` gained
  a `ragTier(value, percent)` helper — red if GMP `< 0`, amber if `0%–8%`, green if `≥ 8%`, matching
  the explicit framing "higher the GMP, more likely the chance of profit" (a magnitude-scaled
  confidence gradient, not a plain sign split) — rendered as a colored left-edge stripe on the card
  (`Card.tsx` gained a `style` prop to support it) rather than the old plain-left-column GMP figure;
  GMP moved to a right-aligned RAG-colored text. Listed IPOs' listing-gain figure uses the same RAG
  tiering on the real outcome (`listingGain`) rather than the pre-listing GMP estimate.
- Filter: `ipoShowMainboardOnly` (boolean) replaced with `ipoBoardFilter: 'all' | 'mainboard' |
  'sme'` — the tab now has All/Mainboard/SME filters instead of just All/Mainboard.

**68. Cashew CSV import: linked transfers not imported + double-categorization + 2-entry balance-correction handling**

- Regression: transfer-pairing detection (`detectSelfAccountMovementPairs`) correctly identified
  linked transfer pairs during import, but they were silently dropped instead of committed as a
  single `type:'transfer'` row, and the same rows still appeared for manual categorization. Root
  cause took 3 fix rounds to fully close:
  1. Round 1 (`isLikelySelfAccountMovement`/`isLikelyCashWithdrawal`, `importCategoryResolution.ts`)
     — a real category-defaulting improvement, but not the actual cause of the reported "Balance
     Correction" case.
  2. Round 2 — new `releaseConfirmedPairsFromGroupSkip()` (`importPipeline.ts`) applied only at
     final commit time (`useImport.ts`'s `commitAndImport()`) — correct in isolation (passed unit
     tests against the extracted pure function) but didn't close the loop because the poisoning
     actually happened one layer earlier, in the *live* `rowActions` memo that drives what the
     categorization UI shows, not at commit.
  3. Round 3 (the fix that actually worked end-to-end) — applied
     `releaseConfirmedPairsFromGroupSkip()` at the live `rowActions` memo too, keyed on all
     `transferPairs` (not just confirmed ones), immediately after the per-group loop and before the
     account-skip pass. Verified against the user's real-file arithmetic: 1038 total rows, 16
     linked-transfer pairs, 7 "stragglers" (single-entry balance corrections, shown for user action
     rather than auto-imported), 1015 rows written, 16 of them as real `type:'transfer'` rows.
- Also addressed: Cashew records a transfer as **two** separate rows under a "Balance Correction"
  category (one debit, one credit); Penny's data model has no such split — a transfer is a single
  `Expense` row with a `toAccountId`. `applyConfirmedTransferPairs()` merges each detected pair into
  exactly one transfer row on import, rather than importing both halves.
- New tests: `packages/core/tests/import/importCategoryResolution.test.ts`,
  `cashewTransferRegression.test.ts`, additions to `importPipeline.test.ts` (asserting the exact
  1015/16 numbers above). Per explicit privacy instruction, no real content from the user's personal
  Cashew export was ever copied into any fixture/test/comment — synthetic data only, matching the
  existing `cashew-april-synthetic.csv` precedent.

---

## Phase 3 — Performance: Home cold-start + redundant data loading

No mockup needed — behavior/performance-only, no new UI.

**42 (perf only). Home: dedupe redundant full-table scans + skeleton loading**

- Confirmed: `useHome`, `useHomeStats`, and `useHealthScore` each independently call
  `expensesRepo.getAll()` on every cold Home load — 3x redundant full-table AES-decrypt of the same
  transactions before anything paints. On top of that, `useHome.ts`'s `loadSummary` calls
  `computeBalance()` (an O(total transactions) `.reduce()`) once per account for `accountBalances`,
  again for `calcLiquidFunds`, and again for credit-card accounts — roughly 3×N full O(M) scans for
  N accounts and M≈10,000 transactions, instead of one grouped pass.
- Fix: share a single `expensesRepo.getAll()` result across the three Home hooks (a shared load, or
  a short-lived in-memory cache) instead of three independent calls; replace the repeated per-account
  `computeBalance()` scans with one grouped pass over the transaction list.
- Separately: Home currently shows **nothing** (not a skeleton — the relevant sections are absent
  from the tree) while `summary`/stats are loading, which is what makes a slow load read as "blank."
  Add real skeleton states to `GlanceHeader`/`AccountsStrip`/`MoneyStatsCard`/`FinancialHealthCard`'s
  loading branches — this alone improves the *perceived* blank period independently of, and faster
  to ship than, the data-loading fix above.

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
