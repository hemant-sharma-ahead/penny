# Penny — Database Schema

All stores use Dexie.js (IndexedDB). All primary keys are UUIDs (not auto-increment — required for future cross-device sync).

Encrypted stores use `EncryptedRepository<T>` which wraps Dexie and transparently encrypts fields on write and decrypts on read via the in-memory Master Key.

---

## Encrypted stores

### `profile`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| profile_id | string | Always the single-user UUID |
| age_band | string | e.g. "29–35" — never exact DOB |
| monthly_income_band | string | e.g. "₹1L–2L" — one of 4 brackets |
| risk_appetite | 'conservative' \| 'moderate' \| 'aggressive' | |
| primary_goal | string | e.g. "Retirement" |
| onboarding_complete | boolean | AuthGuard checks this |
| privacy_mode | 'safe' \| 'privacy' \| 'open' | Persisted preference |
| inactivity_lock_minutes | number | Default: 30 |
| pin_last_changed_at | number | Unix timestamp — 21-day rotation |
| created_at | number | Unix timestamp |

### `holdings`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | FK → profile |
| type | 'mf' \| 'stock' \| 'fd' \| 'nps' \| 'ppf' \| 'gold' | |
| name | string | Fund name or stock ticker |
| units | number | For MF/stocks |
| avg_cost | number | Per unit |
| current_value | number | Updated from price cache |
| purchase_date | number | Unix timestamp |
| is_virtual | boolean | Simulated holding (onboarding demo) |
| chip_score | number | 0–100, last Chip evaluation |
| chip_score_breakdown | string | JSON: dimension scores |
| chip_last_evaluated | number | Unix timestamp |

### `expenses`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | FK → profile |
| amount | number | |
| category_id | string | FK → expense_categories |
| merchant | string | e.g. "Swiggy" (shown locally only, stripped for AI) |
| notes | string | Free text, hashtags parsed from here |
| date | number | Unix timestamp |
| payment_method | string | |
| is_recurring | boolean | |
| subscription_id | string \| null | FK → subscriptions |
| created_at | number | |

### `expense_categories`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| name | string | e.g. "Food", "EMI" |
| icon | string | Tabler icon name |
| parent_id | string \| null | Self-referencing for subcategories |
| is_system | boolean | System defaults vs user-created |
| color | string | Hex color for UI |

### `budgets`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| category_id | string | FK → expense_categories |
| monthly_limit | number | |
| alert_at_pct | number | Default: 80 (alert at 80% used) |
| month_year | string | "2026-06" format |

### `hashtags`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| tag | string | e.g. "emi", "tax", "travel" |
| expense_ids | string[] | Array of expense UUIDs |

### `goals`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| type | string | "Retirement", "House", "Emergency", "Education", etc. |
| name | string | User-given name |
| target_amount | number | |
| target_date | number | Unix timestamp |
| current_amount | number | Updated from holdings/assets |
| risk_appetite | 'conservative' \| 'moderate' \| 'aggressive' | |
| chip_required_sip | number | Chip-calculated monthly SIP |
| created_at | number | |

### `goal_contributions`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| goal_id | string | FK → goals |
| amount | number | |
| date | number | Unix timestamp |
| source | string | e.g. "MF SIP", "Manual" |

### `assets`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| type | 'property' \| 'vehicle' \| 'savings' \| 'other' | |
| name | string | |
| current_value | number | |
| purchase_value | number | |
| purchase_date | number | Unix timestamp |
| last_valued_at | number | Unix timestamp |

### `liabilities`
22-field store covering all 12 liability types.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| type | 'home_loan' \| 'car_loan' \| 'personal_loan' \| 'education_loan' \| 'credit_card' \| 'bnpl' \| 'gold_loan' \| 'lap' \| 'las' \| 'overdraft' \| 'informal' \| 'rental_deposit' | |
| name | string | e.g. "HDFC Home Loan" (shown locally, generalised for AI) |
| outstanding_amount | number | |
| emi_amount | number | |
| interest_rate | number | Annual % |
| is_credit_reported | boolean | |
| is_secured | boolean | |
| is_revolving | boolean | For credit cards/OD |
| original_principal | number \| null | For amortisation |
| disbursement_date | number \| null | Unix timestamp |
| tenure_months | number \| null | |
| interest_type | 'fixed' \| 'floating' \| null | |
| prepayment_penalty_pct | number \| null | |
| credit_limit | number \| null | Revolving only |
| payment_day | number \| null | EMI due date (1–31) |
| last_statement_date | number \| null | |
| next_due_date | number \| null | |
| lender_name | string | Shown locally, generalised for AI |
| created_at | number | |
| updated_at | number | |

### `insurance_policies`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| type | 'health' \| 'life' \| 'term' \| 'vehicle' \| 'home' \| 'travel' \| 'other' | |
| insurer | string | |
| policy_number | string | Encrypted, never shown in logs |
| coverage_amount | number | |
| annual_premium | number | |
| renewal_date | number | Unix timestamp |
| nominees | string | Free text |
| notes | string | |

### `chip_insights`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| module | 'portfolio' \| 'expenses' \| 'goals' \| 'insurance' \| 'net_worth' \| 'subscriptions' \| 'iou' \| 'credit' | |
| insight_type | string | e.g. "underperforming_fund", "insurance_gap" |
| headline | string | Plain-language, specific to user's data |
| reasoning | string | 2–3 lines with numbers |
| do_nothing_consequence | string | Always populated — ₹ consequence |
| recommendation | string | |
| alternative | string \| null | |
| confidence | number | 0–1 |
| urgency | 'high' \| 'medium' \| 'low' | |
| chip_score_before | number \| null | |
| requires_action | boolean | |
| status | 'pending' \| 'approved' \| 'dismissed' \| 'snoozed' | |
| created_at | number | |

### `ai_call_log`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| logged_at | number | Unix timestamp — logged BEFORE the call |
| model | string | e.g. "claude-sonnet-4-6" |
| task_type | string | e.g. "portfolio_analysis", "conversation" |
| anonymised_payload_summary | string | What was sent (categories only, no values) |
| pii_scan_result | 'clean' \| 'flagged' | Result of PII scanner |
| pii_flag_count | number | Should always be 0 |
| input_tokens | number \| null | Filled after response |
| output_tokens | number \| null | |
| response_summary | string \| null | |

### `security`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK (single record) |
| wrapped_master_key | string | AES-KW wrapped MK, base64 |
| passphrase_salt | string | Base64, 32 bytes |
| pin_salt | string | Base64, 32 bytes |
| pbkdf2_iterations_mk | number | Default: 600000 |
| pbkdf2_iterations_kek | number | Default: 200000 |
| pin_hash | string | PBKDF2 hash for PIN verification (not the key) |
| pin_last_changed_at | number | Unix timestamp |
| failed_pin_attempts | number | 0–5, resets on success |
| locked_until | number \| null | Unix timestamp for lockout expiry |

### `subscriptions`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| name | string | e.g. "Netflix", "Spotify" (public, safe for AI) |
| category | string | |
| amount | number | |
| currency | string | Default: "INR" |
| billing_cycle | 'monthly' \| 'quarterly' \| 'annual' | |
| billing_day | number | Day of month (1–31) |
| next_billing_date | number | Unix timestamp |
| trial_end_date | number \| null | Alert 7 days and 1 day before |
| status | 'active' \| 'paused' \| 'cancelled' \| 'trial' | |
| usage_last_detected | number \| null | Phase 2: SMS detection |
| cancellation_difficulty | 'easy' \| 'medium' \| 'hard' | |
| price_at_start | number | For creep detection |
| detection_confidence | number | 0–1 |
| confirmed_by_user | boolean | |

### `personal_ious`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| direction | 'lent' \| 'borrowed' | |
| person_name | string | PII — NEVER sent to AI |
| amount | number | |
| date | number | Unix timestamp |
| status | 'outstanding' \| 'partial' \| 'settled' | |
| amount_returned | number | Default: 0 |
| charge_interest | boolean | Opt-in opportunity cost calculation |
| linked_expense_ids | string[] | |
| linked_group_id | string \| null | Phase 1.5 |
| notes | string | |

### `credit_profile`
| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | PK |
| profile_id | string | |
| score | number | 300–900 |
| bureau | string | e.g. "CIBIL" (generalised to "Bureau A" for AI) |
| score_date | number | Unix timestamp |
| payment_history_pct | number | % of on-time payments |
| credit_utilisation_pct | number | Sent to AI as-is (not PII) |
| credit_age_months | number | |
| hard_enquiries_12m | number | |
| chip_analysis | string \| null | Cached Chip advice |
| raw_report_encrypted | string \| null | NEVER sent to AI — contains PAN and tradelines |

---

## Plain stores (no encryption)

### `price_cache`
| Field | Type | Notes |
|-------|------|-------|
| id | string | Ticker symbol or scheme code (PK) |
| type | 'mf' \| 'stock' | |
| name | string | Fund/company name |
| price | number | Current NAV or LTP |
| day_change_pct | number | |
| source | 'mfapi' \| 'yahoo' | |
| fetched_at | number | Unix timestamp |

### `privacy_stats`
| Field | Type | Notes |
|-------|------|-------|
| id | string | Always "stats" (single record) |
| total_ai_calls | number | Lifetime count |
| ai_calls_this_week | number | |
| bytes_sent_to_anthropic | number | Approximate |
| domain_calls | Record<string, number> | Per-domain call count |
| days_since_install | number | |
| last_updated | number | Unix timestamp |
