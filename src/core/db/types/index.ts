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

export type AssetClass = 'mf' | 'stock' | 'fd' | 'nps' | 'ppf' | 'gold' | 'other';

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
  source?: TransactionSource; // omitted on legacy records = 'manual'
  sourceRef?: string; // dedup key: hash(date+amount+description) for import; bank ref for sync
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
