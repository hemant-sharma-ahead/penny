// "Tax X-ray" — the levies hidden inside everyday money moves. Each scenario takes an amount (and
// an optional variant) and returns a breakdown of the taxes/charges embedded in it. Pure.
//
// All figures are awareness ESTIMATES with typical values; stamp duty, road tax, state VAT and
// excise vary by state, and broker/exchange charges vary by broker. Clearly labelled in the UI.

export interface LevyLine {
  label: string;
  amount: number;
  /** A charge that isn't a government tax (e.g. brokerage, making charges) — shown but tallied separately. */
  isCharge?: boolean;
  note?: string;
}

export interface ScenarioResult {
  /** Total government tax/levy embedded. */
  totalTax: number;
  /** Non-tax charges (brokerage, making, etc.). */
  totalCharges: number;
  lines: LevyLine[];
  /** totalTax as a % of the input amount. */
  effectivePct: number;
  takeaway: string;
}

export interface ScenarioVariant {
  key: string;
  label: string;
}

export interface TaxScenario {
  id: string;
  title: string;
  icon: string; // tabler icon name
  blurb: string;
  amountLabel: string;
  defaultAmount: number;
  variants?: ScenarioVariant[];
  defaultVariant?: string;
  compute: (amount: number, variant?: string) => ScenarioResult;
}

const pctOf = (amount: number, pct: number) => (amount * pct) / 100;
const sum = (lines: LevyLine[], charge: boolean) =>
  lines.filter((l) => Boolean(l.isCharge) === charge).reduce((s, l) => s + l.amount, 0);

function result(amount: number, lines: LevyLine[], takeaway: string): ScenarioResult {
  const totalTax = sum(lines, false);
  const totalCharges = sum(lines, true);
  return {
    totalTax,
    totalCharges,
    lines,
    effectivePct: amount > 0 ? (totalTax / amount) * 100 : 0,
    takeaway
  };
}

// ── Fuel ────────────────────────────────────────────────────────────────────
function fuel(amount: number): ScenarioResult {
  // Petrol/diesel sit outside GST: central excise + state VAT ≈ half the pump price.
  const excise = pctOf(amount, 25);
  const vat = pctOf(amount, 23);
  const dealer = pctOf(amount, 4);
  const base = amount - excise - vat - dealer;
  return result(
    amount,
    [
      { label: 'Base price (refinery + freight)', amount: Math.max(0, base), isCharge: true },
      { label: 'Central excise duty', amount: excise, note: 'Fixed per-litre levy' },
      { label: 'State VAT', amount: vat, note: 'Varies by state' },
      { label: 'Dealer commission', amount: dealer, isCharge: true }
    ],
    'Roughly half of every rupee at the pump is tax.'
  );
}

// ── Dining ──────────────────────────────────────────────────────────────────
function dining(amount: number): ScenarioResult {
  const gst = (amount * 5) / 105; // 5% GST, tax-inclusive bill
  return result(
    amount,
    [
      { label: 'Food & service', amount: amount - gst, isCharge: true },
      { label: 'GST @ 5%', amount: gst, note: 'Restaurant GST (no input credit)' }
    ],
    'Restaurants charge 5% GST on the bill.'
  );
}

// ── Property purchase ─────────────────────────────────────────────────────────
function property(amount: number, variant = 'ready'): ScenarioResult {
  const stamp = pctOf(amount, 6); // ~5–7% by state
  const registration = pctOf(amount, 1);
  const lines: LevyLine[] = [
    { label: 'Stamp duty', amount: stamp, note: '~5–7%, varies by state' },
    { label: 'Registration charge', amount: registration, note: '~1%' }
  ];
  if (variant === 'under_construction') {
    lines.push({ label: 'GST @ 5%', amount: pctOf(amount, 5), note: 'Under-construction, non-affordable' });
  }
  return result(
    amount,
    lines,
    variant === 'under_construction'
      ? 'Under-construction homes add 5% GST on top of stamp duty & registration.'
      : 'Buying a ready home costs ~7% extra in stamp duty & registration.'
  );
}

// ── Vehicle purchase ───────────────────────────────────────────────────────────
const VEHICLE_GST: Record<string, number> = { small: 18, luxury: 40, two_wheeler: 18 };
function vehicle(amount: number, variant = 'small'): ScenarioResult {
  const gstRate = VEHICLE_GST[variant] ?? 18;
  const gst = (amount * gstRate) / (100 + gstRate); // ex-showroom is GST-inclusive
  const roadTax = pctOf(amount, 8); // one-time state road tax, ~6–12%
  const registration = pctOf(amount, 1);
  return result(
    amount,
    [
      {
        label: `GST @ ${gstRate}%`,
        amount: gst,
        note: variant === 'luxury' ? 'Luxury/large vehicle slab' : 'In the ex-showroom price'
      },
      { label: 'Road tax (one-time)', amount: roadTax, note: '~6–12%, varies by state' },
      { label: 'Registration & fees', amount: registration }
    ],
    'A big slice of a vehicle’s on-road price is GST + state road tax.'
  );
}

// ── Gold / silver ──────────────────────────────────────────────────────────────
function gold(amount: number, variant = 'jewellery'): ScenarioResult {
  // `amount` = metal value (before making). Jewellery adds making charges.
  const makingPct = variant === 'jewellery' ? 12 : 2;
  const making = pctOf(amount, makingPct);
  const gstMetal = pctOf(amount, 3); // 3% GST on gold/silver value
  const gstMaking = pctOf(making, 5); // 5% GST on making charges
  const hallmark = variant === 'jewellery' ? 45 : 0;
  return result(
    amount,
    [
      { label: 'Making charges', amount: making, isCharge: true, note: `~${makingPct}% of metal value` },
      { label: 'GST @ 3% (metal)', amount: gstMetal },
      { label: 'GST @ 5% (making)', amount: gstMaking },
      ...(hallmark ? [{ label: 'Hallmarking', amount: hallmark, isCharge: true } as LevyLine] : [])
    ],
    'Gold carries 3% GST; jewellery adds making charges and a little more GST. Selling later may attract capital-gains tax.'
  );
}

// ── Equity (stocks) ──────────────────────────────────────────────────────────
function equity(amount: number, variant = 'buy'): ScenarioResult {
  // Typical discount-broker delivery trade. Brokerage 0 for delivery.
  const stt = variant === 'buy' ? pctOf(amount, 0.1) : pctOf(amount, 0.1); // 0.1% delivery, both legs
  const exchange = pctOf(amount, 0.00297); // NSE
  const sebi = pctOf(amount, 0.0001);
  const stamp = variant === 'buy' ? pctOf(amount, 0.015) : 0; // buy side only
  const dp = variant === 'sell' ? 15.34 : 0; // depository charge on sell
  const brokerage = 0; // delivery — most discount brokers
  const gst = pctOf(exchange + sebi + brokerage + dp, 18);
  const lines: LevyLine[] = [
    { label: 'STT @ 0.1%', amount: stt, note: 'Securities Transaction Tax (delivery)' },
    { label: 'Exchange txn charge', amount: exchange },
    { label: 'SEBI turnover fee', amount: sebi },
    ...(stamp ? [{ label: 'Stamp duty @ 0.015%', amount: stamp } as LevyLine] : []),
    ...(dp ? [{ label: 'Depository (DP) charge', amount: dp, isCharge: true } as LevyLine] : []),
    { label: 'GST @ 18% on charges', amount: gst }
  ];
  return result(
    amount,
    lines,
    'Even “zero-brokerage” delivery trades carry STT, stamp duty, exchange/SEBI fees and GST.'
  );
}

// ── Interest (FD / savings) ─────────────────────────────────────────────────────
function interest(amount: number): ScenarioResult {
  const tds = pctOf(amount, 10); // 10% with PAN, above the threshold
  return result(
    amount,
    [{ label: 'TDS @ 10%', amount: tds, note: 'Above ₹40,000 (₹50,000 for seniors); 20% without PAN' }],
    'Banks deduct 10% TDS, but interest is fully taxable at your slab — so at 30% you owe more when filing.'
  );
}

export const TAX_SCENARIOS: TaxScenario[] = [
  {
    id: 'fuel',
    title: 'Fill fuel',
    icon: 'ti-gas-station',
    blurb: 'Petrol / diesel at the pump',
    amountLabel: 'Amount paid at the pump',
    defaultAmount: 1000,
    compute: fuel
  },
  {
    id: 'dining',
    title: 'Eat out',
    icon: 'ti-tools-kitchen-2',
    blurb: 'A restaurant bill',
    amountLabel: 'Restaurant bill',
    defaultAmount: 2000,
    compute: dining
  },
  {
    id: 'property',
    title: 'Buy a home',
    icon: 'ti-home',
    blurb: 'Stamp duty, registration & GST',
    amountLabel: 'Property value',
    defaultAmount: 80_00_000,
    variants: [
      { key: 'ready', label: 'Ready / resale' },
      { key: 'under_construction', label: 'Under-construction' }
    ],
    defaultVariant: 'ready',
    compute: property
  },
  {
    id: 'vehicle',
    title: 'Buy a vehicle',
    icon: 'ti-car',
    blurb: 'GST, cess, road tax & registration',
    amountLabel: 'Ex-showroom price',
    defaultAmount: 10_00_000,
    variants: [
      { key: 'small', label: 'Small car / 18%' },
      { key: 'luxury', label: 'Luxury / 40%' },
      { key: 'two_wheeler', label: 'Two-wheeler' }
    ],
    defaultVariant: 'small',
    compute: vehicle
  },
  {
    id: 'gold',
    title: 'Buy gold',
    icon: 'ti-diamond',
    blurb: 'GST + making charges',
    amountLabel: 'Metal value (before making)',
    defaultAmount: 1_00_000,
    variants: [
      { key: 'jewellery', label: 'Jewellery' },
      { key: 'coins_bars', label: 'Coins / bars' }
    ],
    defaultVariant: 'jewellery',
    compute: gold
  },
  {
    id: 'equity',
    title: 'Trade stocks',
    icon: 'ti-chart-candle',
    blurb: 'STT, stamp, exchange, DP & GST',
    amountLabel: 'Trade value',
    defaultAmount: 1_00_000,
    variants: [
      { key: 'buy', label: 'Buy (delivery)' },
      { key: 'sell', label: 'Sell (delivery)' }
    ],
    defaultVariant: 'buy',
    compute: equity
  },
  {
    id: 'interest',
    title: 'Earn FD interest',
    icon: 'ti-building-bank',
    blurb: 'TDS + slab tax',
    amountLabel: 'Interest earned',
    defaultAmount: 50_000,
    compute: interest
  }
];
