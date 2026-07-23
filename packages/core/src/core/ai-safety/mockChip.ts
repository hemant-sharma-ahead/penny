// Simulated Chip responses for Phase 1 (no Anthropic API key needed).
// In Phase 1+Chip (M8): flip CHIP_MODE to 'real' and wire buildUserContext() → SDK.

export const CHIP_MODE: 'mock' | 'real' = 'mock';

export interface ChipMessage {
  role: 'user' | 'chip';
  content: string;
  timestamp: number;
}

export interface ChipInsightSeed {
  id: string;
  moduleTag: string;
  headline: string;
  reasoning: string;
  consequence?: string;
  actionLabel?: string;
}

// Default insights seeded into chip_insights on first app load
export const DEFAULT_INSIGHTS: ChipInsightSeed[] = [
  {
    id: 'insight-001',
    moduleTag: 'Portfolio',
    headline: 'Start your first SIP today',
    reasoning: 'Investors who start SIPs early benefit from rupee cost averaging and compounding over time.',
    consequence: 'Delaying by 1 year on a ₹5,000/month SIP at 12% CAGR costs ~₹1.2L over 20 years.',
    actionLabel: 'Add holding'
  },
  {
    id: 'insight-002',
    moduleTag: 'Tax',
    headline: '₹1.5L 80C limit — have you used it?',
    reasoning:
      'ELSS, PPF, and LIC premiums all count toward your 80C deduction. Most salaried individuals leave money on the table.',
    consequence: 'Unused 80C at the 30% tax slab costs ₹46,800 in taxes that could have been saved.',
    actionLabel: 'Track 80C'
  },
  {
    id: 'insight-003',
    moduleTag: 'Insurance',
    headline: 'Your term cover may be underweight',
    reasoning: 'Rule of thumb: term cover = 15–20× annual income. Add your policies to see where you stand.',
    consequence: 'Underinsurance leaves dependents exposed to income replacement risk.',
    actionLabel: 'Add policy'
  }
];

// Context-aware mock responses for the Chip chat tab
const RESPONSES: Record<string, string[]> = {
  portfolio: [
    'Looking at a typical portfolio, diversification across equity, debt, and gold tends to reduce volatility without sacrificing long-term returns. ELSS funds give you the added benefit of 80C deductions.',
    'For long-term goals (10+ years), a larger equity allocation makes sense. For goals under 3 years, consider liquid funds or FDs to protect your corpus.',
    'SIP investments benefit from rupee cost averaging — you buy more units when markets fall and fewer when they rise, smoothing out your average cost over time.'
  ],
  expenses: [
    'Tracking expenses by category is the first step to understanding where your money actually goes. Most people underestimate discretionary spending by 20–30%.',
    'The 50/30/20 rule is a useful starting point: 50% needs, 30% wants, 20% savings. Adjust based on your income level and goals.',
    'Subscription creep is real — small recurring charges add up. A monthly audit of all subscriptions is worth 15 minutes of your time.'
  ],
  goals: [
    'Breaking a large goal into monthly SIP targets makes it feel achievable. The SIP calculator can show you exactly how much to invest each month.',
    'Emergency fund first, then goals. 6 months of expenses in a liquid fund is the foundation everything else sits on.',
    'For goals under 3 years (like a vacation or down payment), avoid equity exposure — market timing risk is too high at shorter horizons.'
  ],
  general: [
    "That's a good question. Based on general financial principles, I'd suggest looking at your overall asset allocation first before making specific decisions.",
    'The most important financial habit is consistency — regular small actions (SIPs, expense tracking, annual insurance review) compound over time.',
    "I'd be happy to help you think through this. Could you tell me more about your specific situation so I can give you more relevant guidance?",
    'Good financial decisions are usually about trade-offs between risk, return, and liquidity. What matters most to you for this particular goal?',
    'Without seeing your complete financial picture, I can offer general guidance: diversify, keep emergency funds liquid, and review your insurance coverage annually.'
  ]
};

function detectContext(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('portfolio') ||
    lower.includes('sip') ||
    lower.includes('mutual fund') ||
    lower.includes('stock') ||
    lower.includes('invest')
  )
    return 'portfolio';
  if (lower.includes('expense') || lower.includes('spend') || lower.includes('budget') || lower.includes('subscri'))
    return 'expenses';
  if (lower.includes('goal') || lower.includes('target') || lower.includes('save') || lower.includes('dream'))
    return 'goals';
  return 'general';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export async function getMockResponse(message: string): Promise<string> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 600));
  const context = detectContext(message);
  const pool = RESPONSES[context] ?? RESPONSES['general'] ?? [];
  return pickRandom(pool);
}
