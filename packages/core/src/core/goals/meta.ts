/** Risk profile → accent colour for goal progress rings and badges. */
export const RISK_COLORS: Record<string, string> = {
  conservative: '#3b82f6',
  moderate: '#10b981',
  aggressive: '#ef4444'
};

/** Risk profile → assumed annual return (%) used for SIP projections. */
export const RISK_RETURNS: Record<string, number> = {
  conservative: 7,
  moderate: 11,
  aggressive: 14
};

export function getRiskColor(risk: string): string {
  return RISK_COLORS[risk] ?? '#10b981';
}

export function getRiskReturn(risk: string): number {
  return RISK_RETURNS[risk] ?? 11;
}

// ── Icon inference (2026-08-02 liquid-fill goal card) ──────────────────────────
// `Goal.icon` is only ever set for the 4 life-stage suggestion templates (Education/Home/Marriage/
// Retirement) — a manually-created goal (most goals) has none, since `GoalForm.tsx` has no icon picker.
// Every goal card needs an icon now, so a manual one falls back to a keyword guess from its name instead
// of going blank — same idea category auto-suggestion and event auto-tagging already use elsewhere.
// Order matters: first matching keyword group wins.
//
// 2026-08-02, expanded for the icon-fill gauge (`GoalCard.tsx`'s `IconFillGauge`) — every icon below was
// deliberately picked to have a Tabler "Filled" counterpart (`@tabler/icons-react-native`'s `Icon<Name>
// Filled` components), which the gauge needs to render a shape-correct liquid fill (not every Tabler icon
// ships one — `ti-beach`/`ti-target`/`ti-device-laptop`, used before this pass, don't, so all three were
// swapped for a filled-available equivalent: umbrella, flag, device-desktop).
const GOAL_ICON_KEYWORDS: { keywords: string[]; icon: string }[] = [
  { keywords: ['emergency', 'safety', 'buffer'], icon: 'ti-shield' },
  { keywords: ['medical', 'hospital', 'health', 'surgery', 'treatment'], icon: 'ti-medical-cross' },
  { keywords: ['legal', 'advocate', 'lawyer', 'court', 'litigation'], icon: 'ti-scale' },
  { keywords: ['renovation', 'remodel', 'repair', 'interior'], icon: 'ti-paint' },
  { keywords: ['trip', 'vacation', 'travel', 'goa', 'holiday', 'beach'], icon: 'ti-plane' },
  { keywords: ['home', 'house', 'flat', 'down payment'], icon: 'ti-home' },
  { keywords: ['car', 'bike', 'vehicle'], icon: 'ti-car' },
  { keywords: ['wedding', 'marriage'], icon: 'ti-heart' },
  { keywords: ['baby', 'child', 'children', 'kid'], icon: 'ti-baby-carriage' },
  { keywords: ['family'], icon: 'ti-user' },
  { keywords: ['education', 'college', 'school', 'course', 'tuition'], icon: 'ti-school' },
  { keywords: ['retirement'], icon: 'ti-umbrella' },
  { keywords: ['laptop', 'computer', 'desktop'], icon: 'ti-device-desktop' },
  { keywords: ['phone', 'mobile', 'gadget', 'electronics'], icon: 'ti-device-mobile' }
];

/** Plain fallback when no keyword matches — never leave a goal without an icon. Must have a Filled
 *  variant too (see above); `ti-target` didn't, `ti-flag` does and reads just as well as "a goal". */
export const DEFAULT_GOAL_ICON = 'ti-flag';

/** Guesses an icon from keywords in a goal's name. Exported mainly for tests; prefer {@link resolveGoalIcon}. */
export function inferGoalIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const { keywords, icon } of GOAL_ICON_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return icon;
  }
  return DEFAULT_GOAL_ICON;
}

/** The icon a goal card should render — an explicit `Goal.icon` (set by the suggestion templates)
 *  always wins; otherwise infer one from the name so a manually-created goal is never left blank. */
export function resolveGoalIcon(goal: { name: string; icon?: string }): string {
  return goal.icon ?? inferGoalIcon(goal.name);
}
