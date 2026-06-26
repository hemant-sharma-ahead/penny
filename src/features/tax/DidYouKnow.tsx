import { useState } from 'react';
import { STATUS, tint, ink } from '@/lib/statusColors';
import { TAX_FACTS } from '@/core/tax/taxFacts';

/** A tappable "Did you know?" awareness card that cycles through tax facts. */
export function DidYouKnow() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * TAX_FACTS.length));
  const fact = TAX_FACTS[idx % TAX_FACTS.length];
  const color = STATUS.info;

  return (
    <button
      type="button"
      onClick={() => setIdx((i) => (i + 1) % TAX_FACTS.length)}
      className="rounded-xl border p-3 flex gap-2 text-left w-full"
      style={{ backgroundColor: tint(color, 12), borderColor: tint(color, 30) }}
      aria-label="Show another tax fact"
    >
      <i className="ti ti-bulb flex-shrink-0 mt-0.5" style={{ fontSize: 16, color }} aria-hidden="true" />
      <div className="flex flex-col gap-0.5" style={{ color: ink(color) }}>
        <span className="text-[10px] font-semibold uppercase tracking-wide">Did you know?</span>
        <span className="text-xs leading-relaxed">{fact}</span>
        <span className="text-[10px] opacity-70 mt-0.5">Tap for another</span>
      </div>
    </button>
  );
}
