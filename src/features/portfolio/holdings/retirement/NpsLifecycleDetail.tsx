import { LIFECYCLE_FUNDS } from '@/core/nps';
import type { NpsLifecycleFund } from '@/core/nps';

// Modal showing the PFRDA lifecycle-fund glide path (equity/corporate/govt
// allocation by age), highlighting the user's current age row.
export function NpsLifecycleDetail({
  fund,
  birthYearStr,
  onClose
}: {
  fund: NpsLifecycleFund;
  birthYearStr: string;
  onClose: () => void;
}) {
  const config = LIFECYCLE_FUNDS[fund];
  const birthYear = parseInt(birthYearStr, 10);
  const currentAge = !isNaN(birthYear) ? new Date().getFullYear() - birthYear : null;
  const currentAgeRow = currentAge != null ? Math.max(35, Math.min(55, currentAge)) : null;

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center px-4"
      style={{ paddingTop: 56, paddingBottom: 72 }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[430px] rounded-2xl max-h-full overflow-y-auto bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 px-4 py-3 border-b border-theme flex items-start justify-between gap-3 bg-surface">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${config.color}18`, color: config.color }}
              >
                {config.shortLabel}
              </span>
              <p className="text-sm font-semibold text-primary">{config.label}</p>
            </div>
            <p className="text-xs text-secondary mt-0.5 leading-snug">{config.description}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-tertiary"
            style={{ backgroundColor: 'var(--color-surface-secondary)' }}
          >
            <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4">
          {currentAge != null && (
            <p className="text-xs text-secondary mb-3">
              Your age: <strong className="text-primary">{currentAge}</strong>
              {currentAge < 35 && ' — PFRDA schedule starts at 35'}
              {currentAge > 55 && ' — PFRDA schedule ends at 55'}
            </p>
          )}
          <div className="rounded-xl overflow-hidden border border-theme">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                  <th className="text-left px-3 py-2 font-semibold text-tertiary">Age</th>
                  <th className="text-right px-2 py-2 font-semibold" style={{ color: '#0ea5e9' }}>
                    Equity
                  </th>
                  <th className="text-right px-2 py-2 font-semibold" style={{ color: '#d97706' }}>
                    Corp.
                  </th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: '#10b981' }}>
                    Govt.
                  </th>
                </tr>
              </thead>
              <tbody>
                {config.table.map((row) => {
                  const isCurrent = row.age === currentAgeRow;
                  return (
                    <tr
                      key={row.age}
                      style={
                        isCurrent
                          ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }
                          : undefined
                      }
                    >
                      <td className="px-3 py-1.5">
                        <span className={isCurrent ? 'font-bold text-primary' : 'text-secondary'}>
                          {row.age}
                          {isCurrent && ' ← you'}
                        </span>
                      </td>
                      <td className="text-right px-2 py-1.5 tabular-nums font-medium" style={{ color: '#0ea5e9' }}>
                        {row.equity}%
                      </td>
                      <td className="text-right px-2 py-1.5 tabular-nums font-medium" style={{ color: '#d97706' }}>
                        {row.corporate}%
                      </td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-medium" style={{ color: '#10b981' }}>
                        {row.govt}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-tertiary leading-relaxed">
            Source: PFRDA lifecycle fund circular. Ages below 35 use the 35-year allocation; ages above 55 use the
            55-year allocation.
          </p>
        </div>
      </div>
    </div>
  );
}
