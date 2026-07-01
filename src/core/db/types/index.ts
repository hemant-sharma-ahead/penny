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
  dob?: string | undefined; // ISO date (YYYY-MM-DD). Encrypted; only a 5-year age band is ever sent to the AI.
  employmentType?: EmploymentType | undefined;
  plan?: Plan | undefined; // entitlement state; defaults to 'free' (full access in Phase 1)
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
}

// ─── EPF employment + transaction ledger ─────────────────────────────────────

export interface EpfSalaryHike {
  fromDate: number; // epoch ms — 1st of the month the new salary applies
  basicSalary: number; // new basic + DA
}

export interface EpfEmployer {
  id: string;
  companyName: string;
  basicSalary: number; // joining salary (basic + DA)
  employeeContribPct: number; // default 12; higher for VPF
  fromDate: number; // epoch ms — start of employment
  toDate?: number; // undefined = current employer
  hikeTimeline?: EpfSalaryHike[]; // sorted ascending by fromDate
}

export type EpfTransactionType = 'contribution' | 'interest' | 'transfer_in' | 'withdrawal' | 'advance';

export interface EpfTransaction {
  id: string;
  type: EpfTransactionType;
  wagesMonth?: string; // "YYYY-MM" — salary month contributions relate to
  date: number; // epoch ms — date credited to EPF account
  employeeAmount?: number; // employee share (contribution type)
  employerAmount?: number; // employer share to EPF 3.67% (contribution type)
  pensionAmount?: number; // EPS 8.33% — informational only
  amount?: number; // interest / transfer_in / withdrawal / advance
  note?: string;
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
  currentAmount: number;
  targetDate: number;
  risk: GoalRisk;
  sipAmount?: number;
  icon?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  date: number;
  notes?: string;
  createdAt: number;
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
  mkSalt?: string; // legacy: salt the pre-envelope MK was derived from (used to verify the passphrase during migration)
  passphraseVerifier?: string; // legacy, unused
  pinAttempts: number;
  lockedUntil?: number;
  lastPinVerifiedAt?: number;
  pinChangedAt?: number;
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
  createdAt: number;
  updatedAt: number;
}
