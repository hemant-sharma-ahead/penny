# Fixed Income (FD & RD)

## What it is
Penny tracks Fixed Deposits (FD) and Recurring Deposits (RD) with auto-calculated maturity values and accrued interest. You enter the deposit details once, and Penny continuously computes how much your deposit is worth today without you having to do the math.

## User-facing capabilities
- Add Fixed Deposits with bank name, principal, interest rate, start date, maturity date, and compounding frequency.
- See the accrued interest earned so far, the projected maturity amount, and how many days remain to maturity.
- Add Recurring Deposits with bank name, monthly installment, tenure, and interest rate.
- See total principal committed (installment × tenure), accrued value today, and projected maturity amount.
- Edit or delete any FD or RD entry.
- All FD and RD values roll up into your total net worth.

## How it works
**FD calculation:**
- Formula: `A = P × (1 + r/n)^(n×t)` where P = principal, r = annual rate, n = compounding periods per year, t = years elapsed.
- Compounding frequency options: monthly, quarterly, half-yearly, yearly, at-maturity.
- `currentValue` is recalculated live on every read — it is not stored in the database. This ensures the value is always up-to-date without needing scheduled jobs.

**RD calculation:**
- Uses iterative quarterly compounding (Indian bank standard): each installment earns interest from its individual deposit date to maturity.
- The calculation iterates over each installment deposited so far and compounds it to the current date.
- Total accrued value = sum of compounded value of each paid installment to date.

**Data model:**
- `assetClass: 'fd'` for both FD and RD records.
- `fdSubType: 'fd' | 'rd'` distinguishes the two.
- FD fields: `fdBank`, `fdStartDate`, `interestRate`, `maturityDate`, compounding frequency.
- RD fields: `fdBank`, `fdStartDate`, `interestRate`, `rdMonthlyInstallment`, `rdTenureMonths`.
- `currentValue` is not stored — always computed on read.

**Key files:**
- `src/features/portfolio/PortfolioPage.tsx` — Fixed Income sub-tab, FD/RD card rendering.
- `src/core/fd/fdCalculations.ts` — `calcFdMaturity()` and `calcRdMaturity()` functions.

## Current limitations
- Interest rates are entered manually — no integration with bank APIs or rate aggregators.
- Pre-mature withdrawal scenarios (with penalty rate) are not modelled.
- Tax-saver FD (5-year, 80C eligible) is not flagged separately; it appears the same as a regular FD.
- TDS deduction on FD interest is not calculated or shown.
- No alert or notification when an FD is approaching maturity.

## Planned improvements
- **Phase 2:** FD rate comparison tool — show which banks currently offer the best rates for a given tenure.
- **Phase 2:** Tax-saver FD (80C) flagging with lock-in period enforcement.
- **Phase 2:** TDS calculation display (10% above ₹40K interest per year, or ₹50K for senior citizens).
- **Phase 2:** Maturity reminder notifications.

## Ideas welcome
- Would a "should I break this FD early?" calculator (comparing penalty vs reinvestment benefit) be useful?
- How should Penny handle FD renewals — as a new entry, or as a continuation of the same record with a renewal history?
- Are there other fixed income instruments (corporate bonds, G-Secs, T-Bills, Post Office schemes) you'd want to track here?
- Would a consolidated tax estimate across all FDs for the current FY (interest earned subject to TDS) be helpful at tax time?
