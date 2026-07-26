const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
// Strength gradient (weak→strong) — domain data, not a status token.
const STRENGTH_COLORS = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600'];

/** Five-bar passphrase strength meter driven by a zxcvbn score (0–4). */
export function PassphraseStrengthMeter({ score }: { score: number }) {
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? STRENGTH_COLORS[score] : 'bg-[var(--color-border)]'}`}
          />
        ))}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-secondary">{STRENGTH_LABELS[score]}</span>
        {score < 3 && <span className="text-xs text-warning">Need a stronger passphrase</span>}
      </div>
    </div>
  );
}
