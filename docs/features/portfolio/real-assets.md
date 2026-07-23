# Real Assets (Vehicles & Property)

## What it is

Penny's Real Assets sub-tab tracks physical assets that form a significant part of many Indian households' net worth: vehicles and property. Vehicles get automatic current value calculation via IRDA depreciation rates. Property values are manually maintained. Both contribute to your overall net worth.

## User-facing capabilities

- **Vehicles:** Enter a vehicle registration number and auto-fetch make, model, registration date, and fuel type from the RC database.
- See your vehicle's current depreciated value calculated automatically using IRDA insurance depreciation rates.
- Log traffic challans (date, amount, violation type, payment status) against each vehicle.
- A 90-day staleness indicator prompts you to review and update the vehicle's current value if it hasn't been updated recently.
- **Property:** Add property holdings with type (residential, commercial, plot, agricultural), area in sq ft, purchase price, and purchase date.
- Manually update the current market value of each property at any time.
- A 90-day staleness indicator prompts you to review property values that may be outdated.
- Both vehicle and property values roll up into your total net worth.

## How it works

**Vehicles:**

- RC lookup via [vahandetails.com](https://vahandetails.com) — fetches make, model, registration date, fuel type by registration number.
- IRDA depreciation model: current value = `purchasePrice × (1 − depreciationRate)`, where the rate depends on vehicle age and category (two-wheeler, private car, commercial, etc.).
- Challans stored in `assetMeta.vehicleChallans[]` as an array of challan records (date, amount, violation type, status).
- `assetMeta` fields: `vehicleRegistrationNumber`, `vehicleMake`, `vehicleModel`, `vehicleYear`, `vehicleFuelType`, `vehicleCategory`, `vehicleChallans[]`.
- Key file: `src/core/vehicle/rcClient.ts` — vahandetails.com integration.
- **Two independent masking rules apply to vehicles.** Amounts (purchase price, current value, challan amounts) follow the Portfolio Safe Mode toggle (`shouldMask(!safeModeVisibility.portfolio)`), same as every other holding. PII fields — registration number, owner name, address, engine/chassis number, insurance policy number, PUC certificate number — stay hidden whenever privacy mode isn't Open (`mode !== 'open'`), **regardless** of the Portfolio toggle; they're identity data, not a "sensitive amount," and the existing conservative behaviour was kept unchanged rather than folded into Safe Mode's "visible by default" rule. `VehicleCard.tsx` and `VehicleDetailModal.tsx` receive both `mode` (real `PrivacyMode`, for PII) and `masked` (the resolved Portfolio toggle, for amounts) as separate props for this reason.

**Property:**

- Manual entry only — no external API for valuation.
- Address is intentionally not stored (privacy). Only asset type, area, purchase price, and current value are persisted.
- `assetMeta` fields: `propertyType`, `areaSqFt`, `purchasePrice`, `currentValue` (manually updated).

**Staleness indicator:** Both vehicles and property show a warning badge if `updatedAt` is more than 90 days in the past, prompting the user to review the current value.

**Key file:** `src/features/portfolio/PortfolioPage.tsx` — Real Assets sub-tab, vehicle and property cards, staleness logic.

**Privacy note:** Property address is never stored, only asset type, area, and value. This is a deliberate privacy design decision.

## Current limitations

- Vehicle depreciation uses IRDA insurance category rates, which reflect insured value — not actual second-hand market resale value (which varies by condition, mileage, and demand).
- Property valuation is fully manual — no integration with real estate platforms.
- RC lookup depends on vahandetails.com availability; failures require manual entry of vehicle details.
- Challan payment integration is not available — status must be updated manually.
- No support for leased vehicles or mortgaged properties (liability side not linked to asset).

## Planned improvements

- **Phase 2:** Real estate estimated market value via housing.com or Magicbricks API, keyed by pin code and property type.
- **Phase 2:** Challan payment status sync (Parivahan/state RTO integration).
- **Phase 2:** Link mortgage liability to a property asset so net equity is shown directly.

## Ideas welcome

- Would an estimated resale value (from platforms like CarDekho or OLX) be more useful than the IRDA depreciation model?
- How should Penny handle jointly owned property — should it support a percentage ownership field?
- Are there other physical asset categories (farm equipment, boats, art, collectibles) you'd want to track?
- Would you want to store property documents (sale deed, khata) as encrypted attachments, or is that too much complexity?
