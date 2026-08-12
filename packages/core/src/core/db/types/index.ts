// ─── Plain store types ────────────────────────────────────────────────────────

export interface PriceCache {
  id: string; // "{type}:{symbol}" e.g. "mf:120503" or "stock:RELIANCE"
  symbol: string;
  price: number;
  nav?: number;
  previousClose?: number | undefined;
  currency: string;
  fetchedAt: number; // epoch ms
}

export interface PrivacyStat {
  id: string;
  domain: string;
  callCount: number;
  lastCalledAt: number;
  totalBytesSent: number;
}

// ─── Encrypted store types ────────────────────────────────────────────────────

/** How the user earns — drives EPF visibility, tax deductions, and health benchmarks. */
export type EmploymentType = 'salaried' | 'self_employed' | 'business_owner' | 'student' | 'retired';

/** Local entitlement marker. Everyone is effectively full-access until pricing ships. */
export type Plan = 'free' | 'pro';

export interface Profile {
  id: string;
  displayName: string; // the user's full name (also used as the display name)
  currency: string; // default "INR"
  locale: string; // default "en-IN"
  onboardingComplete: boolean;
  // ── Identity & attributes (Track 2) ──
  userId?: string | undefined; // stable local identity anchor (UUID); "claimed" on the server at Phase 1.5 registration. Never keyed off the username string.
  username?: string | undefined; // provisional, optional; 3–20 lowercase alphanumeric/underscore. Reserved on the server only at registration.
  deviceId?: string | undefined; // random UUID for this device, assigned when the account is claimed (Phase 1.5 Track C). Rides backup/recovery.
  dob?: string | undefined; // ISO date (YYYY-MM-DD). Encrypted; only a 5-year age band is ever sent to the AI.
  avatarDataUrl?: string | undefined; // optional profile photo (compressed data URL); encrypted at rest, never leaves the device.
  employmentType?: EmploymentType | undefined;
  // ── Life & household (opt-in, encrypted) — powers personalized life-stage goals & guidance ──
  maritalStatus?: 'single' | 'married' | undefined;
  children?: number[] | undefined; // dependents' birth years (drives education-corpus timelines)
  homeOwner?: boolean | undefined;
  riskAppetite?: GoalRisk | undefined;
  plan?: Plan | undefined; // entitlement state; defaults to 'free' (full access in Phase 1)
  demoSeeded?: boolean | undefined; // true while sample/demo data is present. Rides backup, so the "Clear sample data" option survives restore (unlike the device-local localStorage flag).
  createdAt: number;
  updatedAt: number;
}

export type AssetClass = 'mf' | 'stock' | 'fd' | 'nps' | 'ppf' | 'epf' | 'gold' | 'vehicle' | 'property' | 'other';

// ─── PPF transaction ledger ───────────────────────────────────────────────────

export type PpfTransactionType = 'deposit' | 'interest' | 'withdrawal';

export interface PpfTransaction {
  id: string;
  type: PpfTransactionType;
  date: number; // epoch ms
  amount: number;
  note?: string;
  /** The statement row's own narration, when this transaction came from an import — kept separate
   *  from user-authored `note` so an import can never silently overwrite something the user typed.
   *  Same rationale as `EpfTransaction.sourceParticulars`. */
  sourceParticulars?: string;
  /** Import-batch identifier, when this transaction came from an import — provenance/traceability,
   *  same pattern as `EpfTransaction.sourceRef`. Absent for manually-entered transactions. */
  sourceRef?: string;
}

// ─── EPF employment + transaction ledger ─────────────────────────────────────

export interface EpfSalaryHike {
  fromDate: number; // epoch ms — 1st of the month the new salary applies
  basicSalary: number; // new basic + DA
}

/** A snapshot of EPFO's own stated balance as of a specific date — distinct from the transaction
 *  ledger below. Sourced from a passbook PDF's `OB Int. Updated upto`/`Closing Balance as on` rows
 *  (2026-08-07, EPF passbook import — see docs/plans/epf-passbook-import.md §5). Never derived —
 *  Penny's own computed running total (sum of transactions) is checked AGAINST this, not replaced
 *  by it, so a mismatch is visible rather than silently reconciled away. */
export interface EpfBalanceCheckpoint {
  asOfDate: number; // epoch ms
  employeeBalance: number;
  employerBalance: number;
  pensionBalance: number;
}

export interface EpfEmployer {
  id: string;
  companyName: string;
  basicSalary: number; // joining salary (basic + DA)
  employeeContribPct: number; // default 12; higher for VPF
  fromDate: number; // epoch ms — start of employment
  toDate?: number; // undefined = current employer
  /** Set `true` only once the user has explicitly confirmed "yes, still employed here" in response
   *  to the post-import prompt (docs/plans/epf-passbook-import.md §10.1) — importing a historical
   *  (non-latest) passbook FY is NOT itself evidence the employment is still ongoing, so a
   *  newly-created-or-extended-by-import employer with no `toDate` must ask rather than assume.
   *  Never set for an employer added via manual entry (that flow already asks "current employer?"
   *  implicitly by leaving `toDate` blank) — only relevant to disambiguate the import path. */
  currentEmploymentConfirmed?: boolean;
  /** "YYYY" financial-year start years for which a real passbook (or Excel export) has been
   *  imported for this employer — even one with ZERO contribution rows (found via real-device
   *  testing: a year with no contributions, e.g. after leaving mid-way through a prior year, is
   *  still real, authoritative EPFO data, not a gap to fill with a guess). `epfComputeAllMonths`
   *  treats any month within a confirmed FY that has no matching real transaction as a CONFIRMED
   *  zero, not the usual formula-based estimate. */
  confirmedFys?: number[];
  hikeTimeline?: EpfSalaryHike[]; // sorted ascending by fromDate
  // EPF passbook import (2026-08-07) — see docs/plans/epf-passbook-import.md §5. Never inferred —
  // populated only from a real parsed passbook's own header block.
  establishmentId?: string; // e.g. "TSTEST0000000001" — from the passbook's "Establishment ID/Name"
  /** e.g. "TSTEST00000000019999999" — from the passbook's "Member ID/Name". THE real matching key
   *  for "which employer does this PDF belong to" during import — company name alone is
   *  unreliable (e.g. rejoining the same employer later would otherwise be ambiguous). */
  memberId?: string;
  balanceCheckpoints?: EpfBalanceCheckpoint[];
  /** Set `true` only once the user has explicitly confirmed this employer's real joining date via
   *  the "New employer detected" import-time setup step (2026-08-11 follow-up round — see
   *  docs/plans/epf-passbook-import.md §10.9). Mirrors `currentEmploymentConfirmed`'s own
   *  convention: distinguishes a `fromDate` the user actually confirmed from one only ever
   *  auto-derived (originally from a contribution's deposit date, later from the earliest wage
   *  month — always just a prefill until confirmed). Once `true`, a LATER import that would push
   *  `fromDate` even earlier no longer silently moves it — see `epfReviewFlags.ts`'s
   *  `joiningDateContradiction` flag. Never set for a manually-added employer (no import ever
   *  happens for it, so there's nothing to confirm against). */
  joiningDateConfirmed?: boolean;
  /** Editable override for the "Estimated Gross Salary / CTC" stat (2026-08-11 follow-up round) —
   *  what percentage of Gross this employer's `basicSalary` represents. Defaults to 50 when unset,
   *  matching the common ~40-50% Indian payroll convention (and the Nov-2025 labour-code floor of
   *  50%) — always shown as a labelled estimate with its formula visible, never asserted as fact,
   *  since Penny has no way to know the real Gross/CTC split from EPF data alone. */
  basicToGrossPct?: number;
}

export type EpfTransactionType = 'contribution' | 'interest' | 'transfer_in' | 'withdrawal' | 'advance';

export interface EpfTransaction {
  id: string;
  type: EpfTransactionType;
  wagesMonth?: string; // "YYYY-MM" — salary month contributions relate to
  /** Which `EpfEmployer.id` this transaction belongs to — set at import time (the parser/import
   *  flow always knows exactly which employer's passbook a row came from). Exists specifically to
   *  handle a mid-month employer switch: two DIFFERENT employers can each have a real, legitimate
   *  contribution for the SAME `wagesMonth` (pro-rata, split across the switch), which a
   *  wagesMonth-only reconciliation key would otherwise see as one entry conflicting with the
   *  other. Optional — a manually-typed transaction (no employer picker exists for that flow
   *  today) or a transaction written before this field existed has no `employerId`; date-range
   *  containment against `EpfEmployer.fromDate`/`toDate` is the fallback attribution for those,
   *  same as before this field existed.
   *
   *  2026-08-11: stamped on EVERY import-created transaction type now (interest/transfer_in/
   *  withdrawal/advance too, not just `contribution`) — needed so a per-employer ledger view can
   *  scope ALL of an employer's transactions, not just its contributions. */
  employerId?: string;
  date: number; // epoch ms — date credited to EPF account
  employeeAmount?: number; // employee share (contribution type)
  employerAmount?: number; // employer share to EPF 3.67% (contribution type)
  pensionAmount?: number; // EPS 8.33% — informational only
  amount?: number; // interest / transfer_in / withdrawal / advance
  note?: string;
  // EPF passbook import (2026-08-07) — see docs/plans/epf-passbook-import.md §5.
  epfWages?: number; // the wage baseline this contribution's EPF share was calculated on
  epsWages?: number; // the wage baseline this contribution's EPS share was calculated on
  /** The passbook's own row label (e.g. "Cont. for Due-Month 122014", "TRANSFER IN - ...") — kept
   *  SEPARATE from `note` (user-authored free text) so imported provenance and manual annotation
   *  never collide or get silently overwritten by each other. */
  sourceParticulars?: string;
  /** Import-batch identifier — mirrors bank-import/CSV-import's own traceability pattern. Lets a
   *  row be identified as "came from a PDF import" at a glance, and backs the reconciliation
   *  matcher's dedup logic (see epfReconciliation.ts). */
  sourceRef?: string;
  /** Set `true` only when the user explicitly chose "Keep recorded" in the interest breakdown
   *  popup's mismatch banner (2026-08-xx) — an interest transaction whose recorded amount disagrees
   *  with Penny's fresh recalculation, where the user has confirmed the RECORDED figure (the real
   *  passbook's own value) is the one to trust, not Penny's math. `checkInterestMismatch` itself
   *  still reports the raw disagreement (never hides it), but `findAllReviewFlags` stops counting it
   *  as a "needs review" flag once acknowledged — same "computed on demand, dismissal tracked
   *  separately" pattern already used elsewhere in this app (e.g. `Account.dismissedVerificationFindings`). */
  interestMismatchAcknowledged?: boolean;
}

// ─── Asset metadata ───────────────────────────────────────────────────────────

export interface AssetMeta {
  // NPS
  pran?: string;
  tier?: 'tier1' | 'tier2';
  fundManager?: string;
  monthlyContribution?: number;
  // NPS extended (M11) — choice type + lifecycle + scheme for live NAV
  npsChoiceType?: 'active' | 'auto';
  npsLifecycleFund?: 'lc75' | 'lc50' | 'lc25' | 'blc';
  npsBirthYear?: number;
  npsPfm?: string;
  npsSchemeType?: 'E' | 'C' | 'G' | 'A';
  npsSchemeCode?: string;
  // PPF extended (M11)
  ppfOpeningDate?: number; // epoch ms — maturity = opening + 15 years
  ppfBank?: string; // SBI / HDFC / Post Office / ICICI etc.
  annualContribution?: number; // planned annual amount (used for projection)
  maturityYear?: number; // fallback if no opening date set
  ppfTransactions?: PpfTransaction[]; // embedded passbook ledger
  // EPF extended (M11)
  uan?: string;
  epfBirthYear?: number;
  epfEmployers?: EpfEmployer[];
  epfTransactions?: EpfTransaction[];
  // FD/RD extended (M11 step 65)
  fdSubType?: 'fd' | 'rd';
  fdBank?: string;
  fdStartDate?: number; // epoch ms — deposit / first installment date
  fdCompoundingFreq?: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly' | 'at_maturity';
  rdMonthlyInstallment?: number; // RD only — fixed monthly deposit amount
  rdTenureMonths?: number; // RD only — total tenure in months
  // Vehicle (M11 step 64) — RC data fetched from vahandetails.com
  vehicleRegNumber?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleFuelType?: string;
  vehicleColor?: string;
  vehicleType?: string;
  vehicleRtoLocation?: string;
  vehicleRcStatus?: string;
  vehicleRcValidUpto?: number;
  vehicleInsuranceCompany?: string;
  vehicleInsuranceUpto?: number;
  vehiclePuccUpto?: number;
  vehicleFitnessUpto?: number;
  vehicleRcFetchedAt?: number;
  vehicleEngineNo?: string;
  vehicleChassisNo?: string;
  vehicleRegDate?: string;
  vehicleManufactureLabel?: string;
  vehicleBodyType?: string;
  vehicleOwnerName?: string;
  vehiclePresentAddress?: string;
  vehiclePermanentAddress?: string;
  vehicleFinancer?: string;
  vehicleCubicCap?: string;
  vehicleSeatCap?: string;
  vehicleUnladenWeight?: string;
  vehicleGrossWeight?: string;
  vehicleNorms?: string;
  vehicleInsurancePolicyNo?: string;
  vehiclePuccNo?: string;
  vehicleChallanTotal?: number;
  vehicleChallanPending?: number;
  vehicleChallanPaid?: number;
  vehicleChallanDisposed?: number;
  vehicleChallanPendingAmount?: number;
  vehicleChallanFetchedAt?: number;
  /** True when the most recent challan fetch attempt failed. Independent of `vehicleChallanFetchedAt`
   *  — a prior successful fetch's data is left in place when a later refresh fails, so this can be
   *  true alongside real (now possibly stale) challan fields; VehicleDetailModal shows both together
   *  ("showing data from <date>, last refresh failed") rather than hiding the old data. Cleared
   *  (`false`) the next time a challan fetch succeeds. */
  vehicleChallanFetchFailed?: boolean;
  vehicleChallanRecords?: Array<{
    challanNo: string;
    date: string;
    amount: number;
    paymentStatus: string;
    challanStatus: string;
    offenceDetails: string;
    challanPlace: string;
    courtName: string;
    courtAddress: string;
    challanType: string;
    rto: string;
    state: string;
  }>;
  // Precious metals (M11 step 66)
  metalType?: 'gold' | 'silver';
  metalCategory?: 'jewellery' | 'coin' | 'bar' | 'digital' | 'other';
  metalKarat?: 14 | 18 | 22 | 24;
  metalPurity?: string;
  metalWeightGrams?: number;
  metalPurchasePricePerGram?: number;
  // Property (M11 step 64)
  propertyType?: 'flat' | 'house' | 'plot' | 'commercial';
  propertyAreaSqft?: number;
  propertyCity?: string;
  propertyPurchaseDate?: number; // epoch ms — mandatory at add time (PropertyModal), existing records may predate this
  // Mutual Fund (M11 step 68)
  mfFundHouse?: string;
  mfSchemeCategory?: string;
  mfSchemeType?: string;
}

export interface Holding {
  id: string;
  assetClass: AssetClass;
  name: string;
  symbol?: string;
  schemeCode?: string; // MFAPI scheme code
  units?: number;
  avgCostPrice?: number;
  currentPrice?: number;
  maturityDate?: number;
  interestRate?: number; // for FD
  investedAmount: number;
  currentValue?: number;
  notes?: string;
  lastUpdatedAt?: number; // epoch ms — when the value was last manually refreshed
  assetMeta?: AssetMeta; // class-specific metadata (NPS/PPF/EPF/vehicle/property)
  createdAt: number;
  updatedAt: number;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  isGroup?: boolean; // true ⇒ a user-created parent/grouping header, not selectable for a transaction
  parentId?: string; // for a leaf custom category, the id of its parent (isGroup) category
  intentGroup?: string; // e.g. 'daily_living', 'income', 'transfers'
  applicableTo?: 'expense' | 'income' | 'transfer'; // defaults to 'expense'
  createdAt: number;
  /** Safe Mode masks this category's amounts (transactions, budgets, analytics rows); undefined/false = visible. */
  hideInSafeMode?: boolean;
}

// Transaction direction — all new records should set this explicitly; legacy records implicitly 'expense'
export type TransactionType = 'expense' | 'income' | 'transfer';

// Where the record originated — used for deduplication and audit
export type TransactionSource = 'manual' | 'import' | 'sms' | 'bank_sync';

export interface Expense {
  id: string;
  amount: number;
  categoryId: string;
  description: string;
  date: number; // epoch ms
  hashtags: string[];
  isRecurring: boolean;
  recurringIntervalDays?: number;
  paymentMode?: string;
  notes?: string;
  type?: TransactionType; // omitted on legacy records = 'expense'
  accountId?: string; // which account this transaction belongs to
  toAccountId?: string; // transfers only: destination account
  source?: TransactionSource; // omitted on legacy records = 'manual'
  sourceRef?: string; // dedup key: hash(date+amount+description) for import; bank ref for sync
  receiptDataUrl?: string; // local encrypted receipt photo (compressed JPEG data URL); never sent to AI
  /** Groups this transaction is shared into (Phase 1.5 Track E). Each id also has a mirrored group
   *  `shared_expense` event; this keeps the personal↔group link so shares can be shown/undone. */
  shareWith?: string[];
  /** GROUND TRUTH ONLY (docs/plans/bank-balance-sync.md §4/§7) — the bank statement's own stated
   *  running balance immediately after this transaction, copied verbatim from a statement row with a
   *  mapped balance column. Set once, at bank-statement-import commit time, never recomputed, never
   *  guessed. Present only on transactions that came from, or were matched against, a bank-statement
   *  import that had a balance column mapped — scoped to `Account.type === 'bank'` only (credit cards
   *  are explicitly out of scope, inverted sign convention, see plan §3/§16). Absent on every
   *  manually-entered / Cashew/MoneyView-imported / no-balance-column-statement transaction. THE
   *  marker of "checkpointed" — gates two-tier matching's Tier 2 candidate-pool exclusion
   *  (`core/bank-import/matcher.ts`, plan §5/§17): a checkpointed transaction is never offered as a
   *  fuzzy-match candidate for a different import's row. */
  statementBalance?: number;
  /** Intra-day order (1st, 2nd, 3rd… among that day's statement rows) — plan §4/§9 (Stage 5, not yet
   *  built as of this field's addition). Set ONLY when every one of this account's transactions on
   *  this calendar day is explained by one statement's own rows (enables true intra-day checkpoints
   *  instead of end-of-day-only). Absent otherwise — never guessed. Field added ahead of its own
   *  logic per plan §7's Stage 0 grouping; no reader exists yet. */
  reconciledSeq?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'wallet';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number; // balance before any recorded transactions
  color: string;
  icon: string; // Tabler icon class e.g. 'ti-wallet'
  includeInNetWorth: boolean; // cash + bank = yes, credit card = no (it's a liability)
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  /** Safe Mode masks this account's balance; undefined/false = visible. */
  hideInSafeMode?: boolean;
  /** The date `openingBalance` is "as of" (docs/plans/bank-balance-sync.md §4/§10a/§14) — epoch ms.
   *  Absent = legacy/implicit "before every transaction that exists" (today's behavior, preserved
   *  unchanged for every existing account). Set explicitly once a bank-statement import establishes
   *  or moves the anchor (first-ever import, or a later-discovered earlier statement — plan §7
   *  Stage 3, not yet built as of this field's addition). */
  openingBalanceAsOfDate?: number;
  /** One entry per completed statement-import batch for this account (docs/plans/bank-balance-sync.md
   *  §4/§11a/§11b, plan §7 Stage 2 — built 2026-08-08). Applies to any statement-importable account
   *  (`bank` AND `credit_card`) — this is batch-level history, not the checkpoint/balance-sync
   *  guarantee itself, which stays bank-only (see `ImportBatchSummary`'s own doc comment). Powers
   *  gap-detection between imports, deferred lone-wolf escalation, the re-import convenience check, and
   *  the Import History screen. Never removed once added (append-only history). */
  coveredStatementRanges?: ImportBatchSummary[];
  /** Immutable historical reference for a still-possibly-disagreeing anchor shift (Stage 3, redesigned
   *  2026-08-09 to fix the "frozen forever" bug, then again same day to fix a SECOND bug — see
   *  openingBalanceAnchor.ts's `recomputeAnchorAgreement` doc comment for both). Three facts worth
   *  permanently remembering: what the OLD anchor was, what the backfill's OWN un-back-derived claim was
   *  (`newOpeningBalance` — this account's own `openingBalance` field is NOT this value once "Keep"/
   *  "Review" is chosen; see `backDerivedOpeningBalance`'s doc comment), and when this was first detected
   *  (for a stable fingerprint). The actual comparison (`impliedOldBalance`/`diff`/`agrees`) is NEVER
   *  stored — always recomputed live from current transactions, so a later corrective import/edit/delete
   *  that actually fixes the ledger makes the finding disappear on its own, instead of a stale, frozen
   *  number surviving the fix. */
  anchorReference?: {
    oldOpeningBalance: number;
    oldAnchorDate: number;
    newOpeningBalance: number;
    detectedAt: number;
  };
  /** Balance-verification findings (docs/plans/bank-balance-sync.md §9 Q1's resolved decision, §7
   *  Stage 4) the user explicitly acknowledged via the persistent "unverified account" badge's "I've
   *  reviewed this, dismiss" action (`core/bank-import/accountVerification.ts`'s unification of the
   *  checkpoint-diff mismatch, the standing-gap sweep, and an anchor disagreement into ONE indicator).
   *  Scoped to the SPECIFIC finding via a stable fingerprint of its own identifying facts (which
   *  checkpoint pair / which standing-gap expense set / which anchor-disagreement event) — never a
   *  blanket per-account silence, so a NEW, different finding of any of the three kinds still surfaces
   *  even if an earlier, unrelated one was dismissed (its fingerprint won't match any entry here).
   *  Never cleared automatically — a "Re-open" action (`bank-balance-sync-v2.html` Frame 2f) removes a
   *  specific entry; the underlying condition resolving on its own (e.g. the missing transaction gets
   *  added later) also makes an entry's fingerprint stop recomputing at all, at which point it's simply
   *  never surfaced again (this array is never proactively pruned for that case — a stale, no-longer-
   *  matching fingerprint sitting here forever is harmless, never re-matched by construction). */
  dismissedVerificationFindings?: { fingerprint: string; dismissedAt: number }[];
  /** Full Ledger's "not mine, stop flagging this" action (`docs/plans/bank-reconciliation-ledger.md`
   *  Phase 1) for a still-unresolved skipped statement row. Keyed the same way
   *  `dismissedVerificationFindings` is — a stable fingerprint of the row's own identifying facts
   *  (`batchId` + normalized narration + date + amount), never a blanket per-account silence. A
   *  fingerprint that later stops matching anything (e.g. the row gets resolved by a later import
   *  after all) is simply never looked up again — harmless, never proactively pruned, same convention
   *  as `dismissedVerificationFindings`. */
  dismissedSkippedRows?: { fingerprint: string; dismissedAt: number }[];
}

/**
 * One completed statement-import batch's own record, attached to `Account.coveredStatementRanges`
 * (docs/plans/bank-balance-sync.md §4/§7 Stage 2). Deliberately one consolidated record rather than a
 * second parallel store — `start`/`end` power gap-detection and deferred lone-wolf escalation,
 * `matchedCount`/`addedCount`/`skippedCount`/`skippedRows` power the commit confirmation and the Import
 * History screen's list + batch-detail drill-in. Built for every statement import (`bank` and
 * `credit_card` accounts alike) — only the checkpoint mechanism itself (`Expense.statementBalance`) is
 * gated to `bank` accounts.
 */
export interface ImportBatchSummary {
  /** Shared with the same-batch `BankStatementImportRecord`s written for its matched/new rows. */
  batchId: string;
  /** The statement file's own actual min transaction date — never assumed from a filename or the
   *  user's stated intent. */
  start: number;
  /** The statement file's own actual max transaction date. */
  end: number;
  /** When this batch was committed (epoch ms) — distinct from `start`/`end`, which are the statement's
   *  own dates, not the import event's own timing. */
  importedAt: number;
  /** The uploaded file's own name, shown in Import History. */
  fileName: string;
  /** Statement rows the matcher confirmed against an existing transaction — an automatic confident
   *  match, or a user-resolved "possible match". */
  matchedCount: number;
  /** Statement rows that became a brand-new transaction. */
  addedCount: number;
  /** Statement rows seen in the file but left unresolved at commit time — an unconfirmed "possible
   *  match", or an unmatched row never added (§11a: a durable, visible record of what was skipped, not
   *  silence). */
  skippedCount: number;
  /** One entry per skipped row — just enough to identify it in the Import History batch-detail
   *  drill-in. Was purely "a read-only historical record, never re-parsed/re-actionable" (§11a) —
   *  reversed 2026-08-10 (`docs/plans/bank-reconciliation-ledger.md`): the Full Ledger view treats a
   *  still-unresolved entry here as live, checking at render time whether a LATER import already
   *  caught it (via `normalizeNarration` + date/amount, never a stored link) before showing it as
   *  unresolved. `direction` is optional only because historical batches committed before this field
   *  existed lack it — the ledger falls back to an unsigned, neutral rendering for those rather than
   *  guessing a sign. Deliberately `'debit' | 'credit'` inline rather than importing
   *  `bank-import/types.ts`'s `StatementLineDirection` — this file is a dependency-free leaf every
   *  other core module imports FROM, never the reverse.
   *
   *  `rowIndex` (added 2026-08-11) — the ORIGINAL statement file's own 1-based line number
   *  (`ParsedStatementRow.rowIndex`, previously only used for the rejected-rows report, now persisted
   *  end-to-end). Two genuinely separate real transactions can legitimately share identical
   *  narration/date/amount (e.g. two same-day, same-merchant purchases) — `rowIndex` is what tells
   *  them apart, since it's tied to a specific physical file line rather than a value that can
   *  collide. Only ever compared against `BankStatementImportRecord.sourceRowIndex` WITHIN THE SAME
   *  `batchId` (a different import's own row numbering starts over from 1 and has no relationship to
   *  this one) — cross-batch resolution stays value-based, same as before. Optional because entries
   *  committed before this field existed lack it; those fall back to the old value-based matching,
   *  same ambiguity as always (a documented, accepted limitation for legacy data only). */
  skippedRows: {
    rawNarration: string;
    date: number;
    amount: number;
    direction?: 'debit' | 'credit';
    rowIndex?: number;
  }[];
}

export interface Budget {
  id: string;
  categoryId: string;
  monthYear: string; // "YYYY-MM"
  limitAmount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Hashtag {
  id: string;
  name: string; // without #
  usageCount: number;
  /** Transactions carrying this tag are excluded from daily-living analytics (health score, budgets'
   *  category totals are unaffected — this only changes the routine-vs-set-aside split), reported as
   *  their own line rather than folded into a category. Set once per tag, not per transaction. */
  setAside?: boolean | undefined;
  /** Independent of `setAside` — Safe Mode masks any transaction carrying this tag when true. Defaults
   *  to mirroring `setAside` at creation time but is separately editable (financial classification and
   *  privacy visibility are different questions). */
  hideInSafeMode?: boolean | undefined;
  createdAt: number;
}

// ─── Merchant memory (Track 6) ──────────────────────────────────────────────
// Remembers the category/account/payment last used for a given merchant so the
// Add-transaction form can auto-fill on the next matching entry. Local precursor
// to the Phase-2 AI categoriser. Encrypted store; id = `${type}::${normalizedDescription}`.
export interface MerchantMemory {
  id: string; // `${type}::${normalizedDescription}` — see core/expenses/merchantMemory.ts
  description: string; // last raw (trimmed) description, for display
  type: TransactionType;
  categoryId: string;
  accountId?: string;
  paymentMode?: string;
  usageCount: number;
  updatedAt: number;
}

// ─── Transaction templates (Track 6, Step 10) ───────────────────────────────
// User-saved quick-add presets ("Coffee ₹120", "Auto fare") for one-tap entry.
// Encrypted store; amount optional so a template can prompt for it on use.
export interface TransactionTemplate {
  id: string;
  label: string; // chip label, e.g. "Coffee"
  type: TransactionType;
  description: string;
  categoryId: string;
  amount?: number;
  accountId?: string;
  paymentMode?: string;
  createdAt: number;
}

export type GoalRisk = 'conservative' | 'moderate' | 'aggressive';

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  /**
   * Baseline saved before/outside of tracked contributions — set once via `GoalForm`'s "Already saved"
   * field, never auto-incremented afterward (2026-08-01 goal-transaction linking). The amount actually
   * shown to the user ("₹X of ₹Y saved") is this baseline **plus** the sum of that goal's
   * `GoalContribution`s — computed live, the same way IOU's net balance is never a stored/denormalized
   * total either (see `core/iou/ledger.ts`'s `netBalance`). Mutating this field directly after creation
   * would silently double-count against real contributions.
   */
  currentAmount: number;
  targetDate: number;
  risk: GoalRisk;
  sipAmount?: number;
  icon?: string;
  notes?: string;
  /** Groups this goal is shared into (Phase 1.5 Track E) — joint/household goals. */
  shareWith?: string[];
  /** How the goal was created. `suggested` = created from a Home advisor "Set as goal" nudge. */
  source?: 'manual' | 'suggested';
  /** Whether this goal's saved amount (baseline + contributions) is treated as already spoken-for money
   *  when computing "Safe to spend" (Home/Expenses/Cash Flow) — i.e. excluded from what's shown as
   *  available. Undefined/true = counts (the default for every goal, new or existing); explicitly false
   *  only for a goal the user personally decides should still read as spendable. See
   *  `core/goals/progress.ts`'s `effectiveSaved`/`goalReservedAmount`. */
  countsTowardSafeToSpend?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  date: number;
  notes?: string;
  /** 'expense' when seeded by a linked Expense/Income/Transfer transaction; 'manual' for a contribution
   *  logged with no transaction behind it. Mirrors `LedgerEntry.origin` (IOU's equivalent field). */
  origin: 'manual' | 'expense';
  /**
   * The account transaction (Expense for a contribution from one account, Transfer for a contribution
   * moved between two) recording this contribution's real money movement, if any. Linked both ways —
   * deleting either the transaction or this contribution cascades to the other. Mirrors
   * `LedgerEntry.linkedTxnId`.
   */
  linkedTxnId?: string;
  createdAt: number;
  updatedAt: number;
}

export type LiabilityType =
  | 'home_loan'
  | 'car_loan'
  | 'personal_loan'
  | 'education_loan'
  | 'credit_card'
  | 'bnpl'
  | 'gold_loan'
  | 'lap'
  | 'las'
  | 'overdraft'
  | 'informal'
  | 'rental_deposit';

export interface Liability {
  id: string;
  type: LiabilityType;
  name: string;
  principalAmount: number;
  outstandingAmount: number;
  interestRate: number;
  emiAmount?: number | undefined;
  emiDueDate?: number; // day of month 1-31
  startDate?: number;
  endDate?: number;
  lenderName?: string | undefined;
  prepaymentPenalty?: number; // percentage
  ltvRatio?: number; // for gold loan / LAP
  creditLimit?: number; // for credit card / OD
  utilizationAmount?: number; // for credit card / OD
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type InsuranceType = 'term' | 'health' | 'vehicle' | 'home' | 'travel' | 'life' | 'other';

export interface InsurancePolicy {
  id: string;
  type: InsuranceType;
  insurer: string;
  policyNumber?: string;
  coverageAmount: number;
  annualPremium: number;
  renewalDate: number;
  sumInsured?: number;
  nominees?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChipInsight {
  id: string;
  moduleTag: string;
  headline: string;
  reasoning: string;
  consequence?: string; // "what if I do nothing?"
  actionLabel?: string;
  actionPayload?: string; // JSON string
  isRead: boolean;
  isMock: boolean;
  generatedAt: number;
  createdAt: number;
}

export interface AiCallLog {
  id: string;
  endpoint: string;
  anonymisedPayloadHash: string; // SHA-256 of the payload, not the payload itself
  tokensUsed?: number;
  responseTimeMs?: number;
  success: boolean;
  calledAt: number;
}

export type ActivityAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'MERGE'
  | 'BULK_DELETE'
  | 'BULK_MOVE'
  | 'BULK_UPDATE'
  | 'IMPORT'
  | 'UNDO_IMPORT' // reverses an IMPORT entry (packages/core/src/core/import/importWriter.ts's undoImportBatch, 2026-08-06) — its own dated, restorable Timeline entry, not a silent mutation of the original
  | 'RESTORE'
  | 'CHECKPOINT';

// Audit trail of user-initiated data changes (Pre-Phase 1.5, Track 4). Encrypted store.
// Powers the Timeline: undo/restore, per-item history, diffs, streaks, and the privacy receipt.
export interface ActivityLog {
  id: string;
  timestamp: number; // epoch ms
  action: ActivityAction;
  entityType: string; // e.g. 'expense', 'account', 'goal', 'holding'
  entityId: string; // affected record id (or a synthetic id for bulk actions)
  summary: string; // human-readable, e.g. 'Deleted expense: Swiggy ₹340'
  actor?: string; // who performed it; unused in Phase 1 (always self) — powers the Phase 1.5 household feed
  snapshot?: string; // JSON of the deleted record(s) — enables Undo / Recently Deleted restore
  cascade?: string; // JSON [{ entityType, record }] of other-type records deleted alongside (e.g. an expense's linked IOU entries) — restored together for atomic Undo
  diff?: string; // JSON { field: [before, after] } for UPDATE — beautiful diffs + future revert
  entityCount?: number; // number of records affected (bulk actions)
  restorePointId?: string; // groups entries under a named checkpoint (restore points / rewind)
  restored?: boolean; // true once a deleted entry has been restored (hides it from Recently Deleted)
  // Links this entry back to the ORIGINAL entry it reverses/is a reversal of (2026-08-06, undoImportBatch
  // v2) — e.g. an 'UNDO_IMPORT' entry's relatedLogId points at the 'IMPORT' entry it reversed, and vice
  // versa once that IMPORT entry's own `restored` flag is flipped back to false by a later re-restore of
  // the UNDO_IMPORT entry. Lets the Timeline render "Undid import: removed 800 transactions" as its own
  // real, dated entry — reusing restoreActivity()'s existing snapshot/restore machinery — instead of
  // silently mutating the original IMPORT entry in place with no visible trace of when Undo happened.
  relatedLogId?: string;
}

// Envelope encryption (Track 2): a random Data Master Key (DMK) encrypts all data
// and is wrapped independently by a PIN-derived KEK and a passphrase-derived KEK.
// Changing a factor re-wraps the DMK only — data is never re-encrypted.
export interface SecurityRecord {
  id: string;
  encryptedMasterKey: string; // DMK wrapped by the PIN-KEK, base64
  kekSalt: string; // salt for the PIN-KEK, base64
  encryptedMasterKeyByPassphrase?: string; // DMK wrapped by the passphrase-KEK, base64 (added lazily for migrated vaults)
  passphraseKekSalt?: string; // salt for the passphrase-KEK, base64
  // Track F (F3): passphrase-recovery verifier material. Both non-secret (a salt + a PUBLIC key), kept
  // here so claim can upload them; re-derived when the passphrase changes. See core/identity/recovery.ts.
  recoverySalt?: string; // salt for the recovery keypair KDF, base64
  recoveryPublicJwk?: string; // Ed25519 recovery PUBLIC key, JSON string
  mkSalt?: string; // legacy: salt the pre-envelope MK was derived from (used to verify the passphrase during migration)
  passphraseVerifier?: string; // legacy, unused
  pinAttempts: number;
  lockedUntil?: number;
  lastPinVerifiedAt?: number;
  pinChangedAt?: number;
  // Forgot-PIN recovery: a SEPARATE attempt counter/lockout for passphrase verification, shared by
  // unlockWithPassphrase() and resetPinWithPassphrase() — kept independent of pinAttempts/lockedUntil so
  // exhausting one factor never blocks the other (that would trap a user who forgot their PIN and is
  // trying to use the escape hatch). A successful passphrase verification resets pinAttempts/lockedUntil.
  passphraseAttempts?: number;
  passphraseLockedUntil?: number;
  // Rate-limits changePassphrase() to once/24h, same policy as pinChangedAt. Not checked by
  // resetPinWithPassphrase (an emergency recovery path, not a routine passphrase change).
  passphraseChangedAt?: number;
  sessionExpiresAt?: number;
  wipeAfterAttempts?: number; // opt-in: erase all data after this many consecutive failed PIN attempts (undefined = off)
  createdAt: number;
  updatedAt: number;
}

export type SubscriptionStatus = 'active' | 'trial' | 'cancelled' | 'unknown';

export interface Subscription {
  id: string;
  merchantCategory: string; // generalised, not raw merchant name
  detectedAmount: number;
  intervalDays: number;
  status: SubscriptionStatus;
  trialEndsAt?: number;
  lastChargedAt?: number;
  confirmedByUser: boolean;
  createdAt: number;
  updatedAt: number;
}

export type IouDirection = 'lent' | 'borrowed';

/**
 * @deprecated Legacy flat IOU record (Phase 1). Superseded by {@link Person} + {@link LedgerEntry}
 * (Phase 1.5 Track 1). Retained only for the one-time `penny_iou_v2` migration backfill and for
 * restoring legacy backups; do not create new records of this shape.
 */
export interface PersonalIou {
  id: string;
  direction: IouDirection;
  amount: number;
  description: string;
  date: number;
  dueDate?: number;
  isSettled: boolean;
  settledAt?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A counterparty in the IOU ledger. Name/phone are Category 1 PII — encrypted at rest and never
 * sent raw to AI (use {@link assignOrdinalLabels}). A person is a pairwise relationship (you ↔ them);
 * net balance is derived from their {@link LedgerEntry} rows, never stored.
 */
export interface Person {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  /** Future group-sync hook (Phase 1.5 Track E): links this local person to a real group member. */
  linkedMemberId?: string;
  /** Soft-archive when a person still has ledger entries but should drop off the active list. */
  isArchived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type LedgerKind = 'lent' | 'borrowed' | 'settlement';
export type SettleDirection = 'they_paid_you' | 'you_paid_them';
export type LedgerOrigin = 'manual' | 'expense' | 'migration';

/**
 * One entry in a person's running ledger. `amount` is always positive; the sign of its
 * contribution to the net balance derives from `kind` (lent `+`, borrowed `−`) and, for
 * settlements, from `settleDirection`. Partial settlement is a first-class `settlement` entry —
 * there is no `isSettled` boolean; a person is "settled" when their derived net ≈ 0.
 */
export interface LedgerEntry {
  id: string;
  personId: string;
  kind: LedgerKind;
  amount: number;
  date: number;
  dueDate?: number;
  description?: string;
  notes?: string;
  /** settlement-only: who paid whom. */
  settleDirection?: SettleDirection;
  origin: LedgerOrigin;
  /**
   * The account transaction (Expense for lent / you-paid-them, Income for borrowed / they-paid-you)
   * recording this entry's real money movement, if any. Linked both ways — deleting either the
   * transaction or this entry cascades to the other.
   */
  linkedTxnId?: string;
  /** future group-sync hook (Phase 1.5 Track E): the server-side id once this entry syncs. */
  remoteId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreditProfile {
  id: string;
  scoreRange: string; // e.g. "750-800" — banded, not exact
  bureau?: string; // "CIBIL" | "Experian" | "Equifax" — generalised
  fetchedAt?: number;
  mostImpactfulAction?: string; // Chip suggestion, not raw bureau data
  createdAt: number;
  updatedAt: number;
}

// ─── Sync / identity crypto (Phase 1.5 Track B) ────────────────────────────────
// These stores hold the client-side cryptographic material the backend tracks (C/D/E)
// depend on. All are DMK-encrypted like every other store and ride recovery via BACKUP_STORES.

export type DeviceKeyKind = 'sign' | 'wrap';

/**
 * This device's identity keypair, one record per kind (`id` = kind). `sign` is an ECDSA P-256
 * keypair (authenticates worker requests); `wrap` is an ECDH P-256 keypair (receives the DMK
 * during device pairing and Group Keys during grants). Generated lazily at claim.
 */
export interface DeviceKey {
  id: string; // = kind ('sign' | 'wrap')
  kind: DeviceKeyKind;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  createdAt: number;
  updatedAt: number;
}

/**
 * A per-group AES-256-GCM key at a given rotation epoch. `id` is composite `${groupId}:${keyEpoch}`
 * so every epoch coexists — a long-offline member can still decrypt old-epoch events after a
 * key rotation (Phase 1.5 Track E).
 */
export interface GroupKey {
  id: string; // composite `${groupId}:${keyEpoch}`
  groupId: string;
  keyEpoch: number;
  jwk: JsonWebKey; // AES-256-GCM Group Key
  createdAt: number;
  updatedAt: number;
}

/**
 * Bookmarks the sync position for a scope so pulls resume where they left off.
 * `version` drives optimistic concurrency on the personal blob; `seq` tracks the group-event
 * sequence (Phase 1.5 Track E).
 */
export interface SyncCursor {
  id: string; // = scope
  scope: string; // e.g. 'personal-blob', `group:${groupId}`
  version?: number;
  seq?: number;
  remoteTag?: string; // Track D: the cloud file's change token (Drive headRevisionId / mtime) at last sync
  pushedAt?: number; // Track D: latest activity timestamp included in the last successful push
  lastBackupAt?: number; // Track D: epoch ms of the last successful backup (cloud upload or local snapshot)
  createdAt: number;
  updatedAt: number;
}

// ─── Groups & Household OS (Phase 1.5 Track E) ─────────────────────────────────
// Local decrypted mirrors of the server-relayed (ciphertext-only, Model B) group data. Balances are
// never stored — they are derived by folding {@link GroupEvent} rows (event-sourced projection).
// All three stores are DMK-encrypted like every other store and ride recovery via BACKUP_STORES.

export type GroupType = 'family' | 'trip' | 'roommates' | 'other';
export type GroupStatus = 'active' | 'closed';
/** `full` = a joiner can decrypt all prior epochs; `from_join` = only the epoch active at join onward. */
export type GroupHistoryVisibility = 'full' | 'from_join';
export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupMemberStatus = 'active' | 'left' | 'muted';

/** A group the user belongs to (local mirror). `role`/`status` are this user's own membership. */
export interface Group {
  id: string; // = server group_id
  type: GroupType;
  name: string;
  role: GroupRole;
  status: GroupStatus;
  ownerId: string;
  keyEpoch: number;
  historyVisibility: GroupHistoryVisibility;
  joinedAt: number;
  createdAt: number;
  updatedAt: number;
}

/** A member of a group. `linkedPersonId` bridges to a local {@link Person} (reuses Track 1 IOU). */
export interface GroupMember {
  id: string; // composite `${groupId}:${userId}`
  groupId: string;
  userId: string;
  displayName: string;
  role: GroupRole;
  status: GroupMemberStatus;
  linkedPersonId?: string;
  joinedAt: number;
  leftAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type GroupEventType =
  | 'shared_expense'
  | 'expense_edit'
  | 'expense_delete'
  | 'settlement'
  | 'member_joined'
  | 'member_left'
  | 'group_closed'
  | 'group_reopened';

/**
 * One entry in a group's append-only shared ledger (local mirror of the R2 event blob). `seq` is the
 * server-assigned total order (undefined until synced); `lamport` is the client logical clock used to
 * break ties. Balances fold over these — see `src/core/groups/split.ts`. `payload` is type-specific
 * (e.g. a `shared_expense` carries payer/participants/split); it is decrypted from the epoch GroupKey.
 */
export interface GroupEvent {
  id: string; // = eventId (client-generated UUID)
  groupId: string;
  seq?: number;
  lamport: number;
  authorId: string;
  keyEpoch: number;
  type: GroupEventType;
  payload: unknown;
  createdAt: number;
  updatedAt: number;
}

// ─── Bank Statement Import ──────────────────────────────────────────────────
// A deliberately separate parser/matching module (core/bank-import/) — NOT sharing code with the
// multi-app CSV importer (core/import/), per an explicit decision to keep bank-statement parsing
// independent so each can evolve without risking regressions in the other. See
// docs/plans/bank-statement-import.md for the full requirements this schema implements.

/** One resolved bank-statement line (matched to an existing transaction, or newly recorded). One
 *  table serves three purposes (docs/plans/bank-statement-import.md §10a), not two: (1) audit
 *  trail — a recorded Expense's linking record can show "matched from bank statement: `<rawNarration>`,
 *  `<date>`"; (2) merchant-memory backing store (§9b) — queried globally by `normalizedKey`, joined
 *  against `linkedTxnId`'s Expense for a category/description suggestion, no second table; (3)
 *  dedup — a re-uploaded, overlapping-range statement can recognize lines already resolved. Only
 *  written at final commit (§10b) — a discarded/abandoned review leaves no trace here. */
export interface BankStatementImportRecord {
  id: string;
  batchId: string; // groups every row committed from one import session
  accountId: string;
  rawNarration: string;
  normalizedKey: string; // see core/bank-import/normalization.ts
  date: number; // epoch ms — statement line's date (most statements carry no time-of-day)
  amount: number;
  type: TransactionType;
  /** The Expense/transfer this line resolved to — either an existing one it matched, or one newly
   *  created during this import. */
  linkedTxnId: string;
  createdAt: number;
  /** The ORIGINAL statement file's own 1-based line number this record resolved (added 2026-08-11) —
   *  see `ImportBatchSummary.skippedRows`' own doc comment on `rowIndex` for the full rationale (two
   *  genuinely separate transactions can share identical narration/date/amount; this is what tells
   *  them apart). Set at commit time from `ParsedStatementRow.rowIndex` for every record — both a
   *  live-matched/newly-added row AND a later "resolve"/"relink" (Full Ledger Phase 2) action, which
   *  carries the original skipped entry's own `rowIndex` forward onto the new record it creates.
   *  Optional because records written before this field existed lack it. */
  sourceRowIndex?: number;
}

/** A manual override for the normalization heuristic (core/bank-import/normalization.ts) — always
 *  wins over its automatic keyword-stripping guess. Keyed on a stable keyword/substring the user
 *  types directly (not a full raw line — reference numbers change every transaction). Global
 *  across all accounts; managed from the Accounts page's normalization-override screen (in scope
 *  from v1, docs/plans/bank-statement-import.md §9a). */
export interface BankNarrationOverride {
  id: string;
  keyword: string; // as typed by the user; matched case-insensitively as a substring
  normalizedKey: string; // uppercased, trimmed
  createdAt: number;
  updatedAt: number;
}

/** A narration code/keyword (ATW, NWD, SELF, ...) that identifies a bank statement line as a cash
 *  withdrawal — matched case-insensitively as a whole-word token against the raw narration during
 *  review, so it can be auto-classified as a Transfer to the user's cash account instead of a plain
 *  expense (docs/plans/bank-statement-import.md's transfer-marking work, 2026-08-05). `bankId` is a
 *  loose string rather than importing `BankPresetId` (matching this file's existing convention of not
 *  depending on `core/bank-import/`'s types) — expected to be a real `BankPresetId` value, or the
 *  literal `'any'` for a bank-agnostic code that applies regardless of which preset is active (NFS,
 *  the National Financial Switch interbank ATM network marker, and SELF, the RBI-mandated self-
 *  withdrawal narration convention, are both real across virtually every Indian bank — see
 *  `BANK_CASH_WITHDRAWAL_CODE_SEEDS` in `packages/core/src/core/bank-import/cashWithdrawalCodes.ts`
 *  for the researched defaults and their confidence notes). Seeded once (`isDefault: true`), fully
 *  user-editable/extensible from Settings — codes vary by bank and this is deliberately not
 *  presented as exhaustive or fully verified. */
export interface BankCashWithdrawalCode {
  id: string;
  bankId: string;
  code: string;
  label: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * A creatable payment mode (`Expense.paymentMode` string values are drawn from this set). The 5
 * built-in ones (cash/upi/card/net/wallet, `core/expenses/paymentModes.ts`'s
 * `DEFAULT_PAYMENT_MODES`) are seeded as real rows once (`~/hooks/usePaymentModes.ts`, mirroring
 * how `ALL_DEFAULT_CATEGORIES` is seeded) — real rows from the start, not a read-time-only merge,
 * is what lets a default's icon/colour/label actually be edited, same as a default
 * `ExpenseCategory`. `isDefault` gates deletability the same way `ExpenseCategory.isDefault` does
 * (editable, never deletable) — everything else is a full custom mode. `id` is a stable,
 * deterministic slug (e.g. `'neft'`, `'cheque'`) rather than a random UUID, so "does this mode
 * already exist" is a plain id lookup — this is what lets Bank Statement Import
 * (docs/plans/bank-statement-import.md §8) create a rail-specific mode (NEFT/IMPS/RTGS/Cheque)
 * exactly once, the first time it's needed, rather than per transaction. */
export interface PaymentMode {
  id: string;
  label: string;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Retirement Corpus (Home hero + FIRE Calculator) ────────────────────────
// One shared plan powers both Home's "Retirement Corpus" card and the FIRE Calculator — editing
// either place updates both. See core/calculators/retirementProjection.ts for the projection math and
// docs/features/home.md for the feature writeup.

/**
 * The user's single, shared retirement plan (a singleton — same `items[0] ?? null` pattern as
 * {@link Profile}, see `useRetirementPlan()`). Unlike Profile, there's no onboarding step that seeds
 * this row, so `useRetirementPlan()` lazily creates it with sensible defaults the first time it's read.
 */
export interface RetirementPlan {
  id: string;
  retirementAge: number;
  expectedReturnPct: number;
  inflationPct: number;
  swrPct: number;
  monthlyInvestment: number;
  /** undefined = derive live from trailing actual spend (see useHomeStats's `livingThisMonth`); an
   *  explicit number once the user edits it in the Retirement drill-down or FIRE Calculator — same
   *  "user's own input always wins over the derived default" override pattern FireCalculator already
   *  used for age. */
  monthlyExpenseOverride?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * One monthly point-in-time snapshot of net worth composition, captured at most once per calendar
 * month (first app-open in a new month — see `useHome.ts`). Builds up a real historical line for the
 * Home Retirement Corpus chart over time; Penny is local-only with no linked-account history, but
 * cash/bank/wallet balances are exactly reconstructable for any past date via `computeBalance()` —
 * holdings are not (no historical price series stored), so this is captured going forward only, never
 * backfilled synthetically.
 */
export interface NetWorthSnapshot {
  id: string;
  /** 'YYYY-MM', one row per calendar month. */
  monthKey: string;
  investableCorpus: number;
  netWorth: number;
  capturedAt: number;
}
