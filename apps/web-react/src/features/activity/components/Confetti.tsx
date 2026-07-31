const COLORS = ['#00a86b', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4'];
const PIECES = Array.from({ length: 18 }, (_, i) => i);

/** Lightweight CSS confetti burst (no library). Render briefly on a celebration. */
export function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {PIECES.map((i) => {
        const left = (i * 53) % 100;
        const delay = (i % 6) * 0.12;
        const color = COLORS[i % COLORS.length];
        return (
          <span
            key={i}
            className="absolute top-0 w-1.5 h-2.5 rounded-[1px]"
            style={{
              left: `${left}%`,
              backgroundColor: color,
              animation: `confetti-fall 1.4s ease-in ${delay}s 1`
            }}
          />
        );
      })}
    </div>
  );
}
