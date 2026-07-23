import { TextInput, DetailRow } from '@/components/ui';
import type { MfSearchResult, MfSchemeDetail } from '@/core/portfolio/mfApiClient';

interface MfFieldsProps {
  editing: boolean;
  mfQuery: string;
  setMfQuery: (v: string) => void;
  schemeCode: string;
  setSchemeCode: (v: string) => void;
  mfResults: MfSearchResult[];
  mfSearching: boolean;
  mfDropdownOpen: boolean;
  setMfDropdownOpen: (v: boolean) => void;
  schemeDetail: MfSchemeDetail | null;
  setSchemeDetail: (v: MfSchemeDetail | null) => void;
  name: string;
  setName: (v: string) => void;
  units: string;
  setUnits: (v: string) => void;
  avgCostPrice: string;
  setAvgCostPrice: (v: string) => void;
  fetchedPrice: number | null;
  setFetchedPrice: (v: number | null) => void;
  priceFetching: boolean;
}

// Mutual-fund fields: fund search (MFAPI.in) or a plain scheme-code field when
// editing, live NAV indicator, units/avg-NAV inputs, and a computed value row.
export function MfFields({
  editing,
  mfQuery,
  setMfQuery,
  schemeCode,
  setSchemeCode,
  mfResults,
  mfSearching,
  mfDropdownOpen,
  setMfDropdownOpen,
  schemeDetail,
  setSchemeDetail,
  name,
  setName,
  units,
  setUnits,
  avgCostPrice,
  setAvgCostPrice,
  fetchedPrice,
  setFetchedPrice,
  priceFetching
}: MfFieldsProps) {
  return (
    <>
      {/* Search — only when adding new; editing shows plain scheme code field */}
      {!editing ? (
        <div className="relative">
          <label className="text-xs font-medium text-secondary">Search fund</label>
          <div className="mt-1 relative">
            <input
              type="text"
              className="w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] input-surface pr-16"
              placeholder="e.g. Parag Parikh, Axis Bluechip…"
              value={mfQuery}
              onChange={(e) => {
                setMfQuery(e.target.value);
                if (!e.target.value) {
                  setSchemeCode('');
                  setMfDropdownOpen(false);
                }
              }}
            />
            {mfSearching && (
              <i
                className="ti ti-loader-2 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-tertiary"
                style={{ fontSize: 16 }}
              />
            )}
            {schemeCode && !mfSearching && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-tertiary px-1 py-0.5"
                onClick={() => {
                  setSchemeCode('');
                  setMfQuery('');
                  setMfDropdownOpen(false);
                  setName('');
                  setFetchedPrice(null);
                  setSchemeDetail(null);
                }}
              >
                Clear
              </button>
            )}
          </div>
          {mfDropdownOpen && mfResults.length > 0 && !schemeCode && (
            <div
              className="absolute z-10 mt-1 w-full rounded-xl border border-theme overflow-hidden shadow-lg"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              {mfResults.map((r) => (
                <button
                  key={r.schemeCode}
                  type="button"
                  className="w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 border-b border-theme last:border-0"
                  style={{ backgroundColor: 'var(--color-surface)' }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-secondary)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface)')
                  }
                  onClick={() => {
                    setSchemeCode(String(r.schemeCode));
                    setMfQuery(r.schemeName);
                    if (!name) setName(r.schemeName);
                    setMfDropdownOpen(false);
                  }}
                >
                  <p className="text-xs text-primary leading-snug truncate">{r.schemeName}</p>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#6366f115', color: '#6366f1' }}
                  >
                    {r.schemeCode}
                  </span>
                </button>
              ))}
            </div>
          )}
          {schemeCode && (
            <div className="mt-1 flex flex-col gap-0.5">
              <p className="text-[10px] text-tertiary">Code: {schemeCode}</p>
              {schemeDetail?.schemeCategory && (
                <p className="text-[10px] text-secondary">
                  {schemeDetail.schemeCategory}
                  {schemeDetail.fundHouse ? ` · ${schemeDetail.fundHouse}` : ''}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <TextInput
          label="MFAPI scheme code"
          hint="e.g. 120503 for PPFAS"
          type="text"
          inputMode="numeric"
          placeholder="Leave blank to enter price manually"
          value={schemeCode}
          onChange={setSchemeCode}
        />
      )}

      {/* Live NAV */}
      {schemeCode && (
        <div className="flex items-center gap-1.5 px-0.5">
          {priceFetching ? (
            <>
              <i className="ti ti-loader-2 animate-spin text-tertiary" style={{ fontSize: 12 }} />
              <span className="text-[11px] text-tertiary">Fetching NAV…</span>
            </>
          ) : fetchedPrice !== null ? (
            <>
              <i className="ti ti-check" style={{ fontSize: 12, color: '#10b981' }} />
              <span className="text-[11px] text-secondary">
                Current NAV: <strong className="text-primary">₹{fetchedPrice.toFixed(4)}</strong>
              </span>
            </>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Units held"
          type="number"
          inputMode="decimal"
          placeholder="0.000"
          value={units}
          onChange={setUnits}
        />
        <TextInput
          label="Avg NAV (₹)"
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={avgCostPrice}
          onChange={setAvgCostPrice}
        />
      </div>

      {/* Computed current value */}
      {fetchedPrice !== null && parseFloat(units) > 0 && (
        <DetailRow
          label="Current value (units × NAV)"
          value={`₹${(parseFloat(units) * fetchedPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          size="md"
        />
      )}
    </>
  );
}
