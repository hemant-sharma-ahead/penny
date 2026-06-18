// ─── Plain store types ────────────────────────────────────────────────────────

export interface PriceCache {
  id: string; // "{type}:{symbol}" e.g. "mf:120503" or "stock:RELIANCE"
  symbol: string;
  price: number;
  nav?: number;
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

export interface Profile {
  id: string;
  displayName: string;
  currency: string; // default "INR"
  locale: string; // default "en-IN"
  onboardingComplete: boolean;
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

export interface EpfEmployer {
  id: string;
  companyName: string;
  basicSalary: number; // monthly basic + DA
  employeeContribPct: number; // default 12; higher for VPF
  fromDate: number; // epoch ms — start of employment
  toDate?: number; // undefined = current employer
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
  // FD/RD extended (M11 step 65)
  fdSubType?: 'fd' | 'rd';
  fdBank?: string;
  fdStartDate?: number; // epoch ms — deposit / first installment date
  fdCompoundingFreq?: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly' | 'at_maturity';
  rdMonthlyInstallment?: number; // RD only — fixed monthly deposit amount
  rdTenureMonths?: number; // RD only — total tenure in months
  // EPF extended (M11)
  uan?: string;
  epfBirthYear?: number;
  epfEmployers?: EpfEmployer[];
  epfTransactions?: EpfTransaction[];
  // Vehicle (M11 step 64) — RC data fetched from vahandetails.com
  vehicleRegNumber?: string; // plate number — masked in safe/privacy mode
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleFuelType?: string;
  vehicleColor?: string;
  vehicleType?: string; // "Two Wheeler" / "Four Wheeler" etc.
  vehicleRtoLocation?: string;
  vehicleRcStatus?: string; // "ACTIVE" / "SUSPENDED"
  vehicleRcValidUpto?: number; // epoch ms
  vehicleInsuranceCompany?: string;
  vehicleInsuranceUpto?: number; // epoch ms
  vehiclePuccUpto?: number; // epoch ms
  vehicleFitnessUpto?: number; // epoch ms
  vehicleRcFetchedAt?: number; // epoch ms — when RC data was last fetched
  vehicleEngineNo?: string;
  vehicleChassisNo?: string;
  vehicleRegDate?: string; // registration date string
  vehicleManufactureLabel?: string; // e.g. "June 2017"
  vehicleBodyType?: string;
  vehicleOwnerName?: string;
  vehiclePresentAddress?: string;
  vehiclePermanentAddress?: string;
  vehicleFinancer?: string;
  vehicleCubicCap?: string; // engine CC
  vehicleSeatCap?: string;
  vehicleUnladenWeight?: string; // actual vehicle weight (kg)
  vehicleGrossWeight?: string; // GVW including load (kg)
  vehicleNorms?: string; // emission standard e.g. "BHARAT STAGE VI"
  vehicleInsurancePolicyNo?: string;
  vehiclePuccNo?: string;
  vehicleChallanTotal?: number;
  vehicleChallanPending?: number;
  vehicleChallanPaid?: number;
  vehicleChallanDisposed?: number;
  vehicleChallanPendingAmount?: number;
  vehicleChallanFetchedAt?: number; // epoch ms
  vehicleChallanRecords?: Array<{
    challanNo: string;
    date: string;
    amount: number;
    paymentStatus: string; // "UNPAID" | "DISPOSED" | "PAID"
    challanStatus: string; // "Virtual Court" | "Already Paid"
    offenceDetails: string;
    challanPlace: string;
    courtName: string;
    courtAddress: string;
    challanType: string; // "OFFLINE" | "ONLINE"
    rto: string;
    state: string;
  }>;
  // Property (M11 step 64)
  propertyType?: 'flat' | 'house' | 'plot' | 'commercial';
  propertyAreaSqft?: number;
  propertyCity?: string;
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
  parentId?: string; // subcategory prep — not used in UI yet
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

export type AssetType =
  | 'real_estate'
  | 'vehicle'
  | 'jewelry'
  | 'bank_account'
  | 'fixed_deposit'
  | 'ppf'
  | 'nps'
  | 'mutual_fund'
  | 'stock'
  | 'gold'
  | 'crypto'
  | 'other';

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  value: number;
  purchaseValue?: number;
  purchaseDate?: number;
  notes?: string;
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
  emiAmount?: number;
  emiDueDate?: number; // day of month 1-31
  startDate?: number;
  endDate?: number;
  lenderName?: string;
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

export interface SecurityRecord {
  id: string;
  passphraseVerifier: string; // PBKDF2-derived verifier, not the passphrase
  encryptedMasterKey: string; // MK wrapped with KEK, base64
  kekSalt: string; // base64
  mkSalt: string; // base64
  pinAttempts: number;
  lockedUntil?: number;
  lastPinVerifiedAt?: number;
  pinChangedAt?: number;
  sessionExpiresAt?: number;
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

export interface CreditProfile {
  id: string;
  scoreRange: string; // e.g. "750-800" — banded, not exact
  bureau?: string; // "CIBIL" | "Experian" | "Equifax" — generalised
  fetchedAt?: number;
  mostImpactfulAction?: string; // Chip suggestion, not raw bureau data
  createdAt: number;
  updatedAt: number;
}
