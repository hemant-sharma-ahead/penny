const SCORING_RULES: [string, string, string][] = [
  ['Emergency Fund', '20 pts', '6+ months of expenses'],
  ['Savings Rate', '20 pts', '30%+ of income saved'],
  ['Debt-to-Income', '20 pts', '≤20% of income on EMIs'],
  ['Insurance', '15 pts', 'Life + health coverage'],
  ['Goals on Track', '15 pts', 'All active goals progressing'],
  ['Diversification', '10 pts', '4+ asset classes']
];

/** Static reference card explaining how each health-score dimension is weighted. */
export function ScoringGuide() {
  return (
    <div className="rounded-2xl p-4 bg-surface-2 border border-theme">
      <p className="text-xs font-semibold mb-2 text-secondary">How it's scored</p>
      <div className="flex flex-col gap-1">
        {SCORING_RULES.map(([label, pts, target]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-secondary">{label}</span>
            <span className="text-[10px] flex-shrink-0 text-tertiary">
              {pts} · {target}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
