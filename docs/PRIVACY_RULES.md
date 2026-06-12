# Penny — Privacy Rules & PII Anonymisation

This document defines the canonical PII rules for the Penny project. These rules are implemented in `src/core/ai-safety/buildUserContext.ts` and `src/core/ai-safety/piiScanner.ts`, and tested in `tests/pii-gate/piiGate.test.ts`.

**The CI PII gate blocks deployment if any test in `pii-gate/` fails. Never disable or weaken these tests.**

---

## The three permitted external domains

Penny's Phase 1 code may contact exactly three external domains:

1. `api.anthropic.com` — Chip AI (anonymised payload only)
2. `api.mfapi.in` — Mutual fund NAV data (scheme codes only, no user data)
3. `query.yahoofinance.com` — Stock prices (ticker symbols only, no user data)

Any outbound request to any other domain is a bug and will fail the CI PII gate test.

---

## PII categories

### Category 1 — Direct identifiers (STRIPPED ENTIRELY)
These are never included in any AI payload under any circumstances.

| Field | Example | Treatment |
|-------|---------|-----------|
| Full name | "Hemant Sharma" | Removed |
| PAN | "ABCDE1234F" | Removed. Only used for bureau API auth (Phase 2) — not stored in IndexedDB |
| Aadhaar | "1234 5678 9012" | Removed |
| Mobile number | "+91 98765 43210" | Removed |
| Email address | "user@example.com" | Removed |
| Home address | Any address string | Removed |
| Employer name | "Infosys" | Removed |
| IOU person names | "Raj", "Priya" | Removed — referred to as "IOU 1", "IOU 2" |

### Category 2 — Financial identifiers (STRIPPED or GENERALISED)
| Field | Treatment |
|-------|-----------|
| Bank account numbers | Stripped |
| Demat account numbers | Stripped |
| UPI IDs | Stripped |
| IFSC codes | Stripped |
| Insurance policy numbers | Stripped |
| Loan account numbers | Stripped |
| Bank names | Generalised: "HDFC" → "Bank A", "ICICI" → "Bank B" (mapping resets each call) |
| Lender names | Generalised: "HDFC Home Loans" → "Lender A" |
| Bureau names | Generalised: "CIBIL" → "Bureau A" |
| raw_report_encrypted | NEVER included — contains PAN and full tradelines |

### Category 3 — Quasi-identifiers (BANDED or GENERALISED)
| Field | Treatment |
|-------|-----------|
| Exact amounts | Banded to nearest ₹10K (net worth: ₹5L bands) |
| Date of birth | 5-year band: "29–35" |
| Exact dates | Month-year only: "June 2026" |
| Merchant names | Replaced with category: "Swiggy" → "Food delivery", unknown → first character only |
| Monthly income | Four brackets: <₹50K, ₹50K–1L, ₹1L–2L, >₹2L |

### Category 4 — Safe to send as-is (NOT PII)
These are public data points shared by millions of users — not personally identifying.

| Field | Rationale |
|-------|-----------|
| Fund names (e.g. "Parag Parikh Flexi Cap") | Public security — not personally identifying |
| Stock tickers (e.g. "RELIANCE.NS") | Public |
| Performance percentages | Calculated metrics, not raw data |
| Credit score (300–900 number) | Millions share similar scores — not identifying alone |
| Credit utilisation % | Percentage, not absolute value |
| Hard enquiries count | Count, not details |
| Subscription names (e.g. "Netflix", "Spotify") | Public services shared by millions |
| IOU direction + amount band | "lent ₹10K–20K range" — no counterparty name |
| Expense categories (not merchants) | "Food delivery", not "Swiggy" |

---

## Two-layer PII safety

**Layer 1 — `buildUserContext()` explicit construction:**  
Only explicitly whitelisted fields are included. No `...spread` of raw objects. Every field is a conscious inclusion.

**Layer 2 — `PII_PATTERNS.scan()` at runtime:**  
Before the payload is returned from `buildUserContext()`, it is scanned for known PII patterns:
- Indian PAN: `/[A-Z]{5}[0-9]{4}[A-Z]/`
- Indian mobile: `/[6-9]\d{9}/`
- Aadhaar-like: `/\b\d{4}\s?\d{4}\s?\d{4}\b/`
- Email: `/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/`
- Bank account numbers: `/\b\d{9,18}\b/` (with context check)

If Layer 1 has a bug, Layer 2 catches it. If `scan()` finds a flag, `buildUserContext()` throws before the payload reaches the Anthropic SDK.

---

## Special rules (added in TSD v1.1)

### IOU person names
- Stored in `personal_ious.person_name` (encrypted locally)
- NEVER sent to AI under any circumstances
- Referred to as "IOU 1", "IOU 2" etc. in AI context
- The `piiScanner` checks that no first/last names from the IOU store appear in any AI payload

### Credit bureau data
- `credit_profile.raw_report_encrypted` is NEVER included in any AI payload
- The raw report contains: full name, PAN, all tradelines with account numbers
- Only the numeric score (300–900), utilisation %, and credit age are sent

### PAN for bureau API (Phase 2)
- PAN is typed by the user during the bureau API auth flow
- It is NOT stored in IndexedDB in any form
- It is passed directly to the bureau aggregator API call and discarded
- It never enters `buildUserContext()`

---

## CI test coverage

`tests/pii-gate/piiGate.test.ts` covers:

1. Domain allowlist — any fetch to a non-permitted domain fails the test
2. Console scan — any `console.log`/`error`/`warn` containing PAN, phone, Aadhaar, or email patterns fails
3. `buildUserContext()` output — asserts zero PII flags from `piiScanner.scan()`
4. IOU person names are stripped (no real names in payload, only "IOU 1" etc.)
5. Credit score is sent without bureau name
6. `raw_report_encrypted` is never included in any AI payload
7. Subscription names are sent as-is (public services)
8. Subscription amounts are banded
9. Lender names are generalised
10. Bank names are generalised with per-call mapping reset
