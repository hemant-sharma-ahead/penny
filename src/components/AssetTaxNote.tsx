import { useState } from 'react';
import { STATUS, tint, ink } from '@/lib/statusColors';
import { ASSET_TAX_INFO, type AssetTaxTopic } from '@/core/tax/assetTaxInfo';

/**
 * A compact, collapsible "Tax on this" note for an asset class — contextual tax awareness shown
 * where the asset is tracked (Portfolio sub-tabs). Sourced from the shared `assetTaxInfo` module.
 */
export function AssetTaxNote({ topic }: { topic: AssetTaxTopic }) {
  const [open, setOpen] = useState(false);
  const info = ASSET_TAX_INFO[topic];
  const color = STATUS.info;

  return (
    <div className="rounded-xl border" style={{ backgroundColor: tint(color, 10), borderColor: tint(color, 25) }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-2.5 text-left"
        aria-expanded={open}
      >
        <i className="ti ti-receipt-tax flex-shrink-0" style={{ fontSize: 16, color }} aria-hidden="true" />
        <span className="text-xs font-semibold flex-1" style={{ color: ink(color) }}>
          {info.title}
        </span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 16, color }} aria-hidden="true" />
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 px-3 pb-3 pt-0.5">
          {info.points.map((p) => (
            <li key={p} className="flex gap-2 text-[11px] leading-relaxed" style={{ color: ink(color) }}>
              <i
                className="ti ti-point-filled flex-shrink-0 mt-0.5"
                style={{ fontSize: 11, color }}
                aria-hidden="true"
              />
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
