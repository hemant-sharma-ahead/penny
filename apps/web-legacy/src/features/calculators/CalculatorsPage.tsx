import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { CALCULATORS, getCalculator, searchCalculators, type CalculatorId } from './calculatorRegistry';
import { FireCalculator } from './FireCalculator';
import { HraCalculator } from './HraCalculator';
import { SipSwpCalculator } from './SipSwpCalculator';
import { TaxRegimeCalculator } from './TaxRegimeCalculator';
import { FdRdCalculator } from './FdRdCalculator';
import { LumpsumCalculator } from './LumpsumCalculator';
import { CapitalGainsCalculator } from './CapitalGainsCalculator';
import { GratuityCalculator } from './GratuityCalculator';
import { SsyCalculator } from './SsyCalculator';
import { InflationCalculator } from './InflationCalculator';

function renderCalculator(id: CalculatorId) {
  switch (id) {
    case 'fire':
      return <FireCalculator />;
    case 'hra':
      return <HraCalculator />;
    case 'sip-swp':
      return <SipSwpCalculator />;
    case 'tax-regime':
      return <TaxRegimeCalculator />;
    case 'fd-rd':
      return <FdRdCalculator />;
    case 'lumpsum':
      return <LumpsumCalculator />;
    case 'capital-gains':
      return <CapitalGainsCalculator />;
    case 'gratuity':
      return <GratuityCalculator />;
    case 'ssy':
      return <SsyCalculator />;
    case 'inflation':
      return <InflationCalculator />;
    default:
      return null;
  }
}

export function CalculatorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');

  const activeId = searchParams.get('calc');
  const active = activeId ? getCalculator(activeId) : undefined;

  const results = useMemo(() => searchCalculators(query), [query]);

  const open = (id: CalculatorId) => setSearchParams({ calc: id });
  const back = () => setSearchParams({});

  // ── Detail view ────────────────────────────────────────────────────────────────
  if (active) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-4 pb-3 border-b border-theme flex items-center gap-3">
          <button
            onClick={back}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 text-secondary"
            aria-label="Back to calculators"
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${active.color}1a`, color: active.color }}
            >
              <i className={`ti ${active.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-primary truncate">{active.title}</h2>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">{renderCalculator(active.id)}</div>
      </div>
    );
  }

  // ── Searchable list view ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Calculators">
        <p className="text-xs mt-0.5 text-tertiary">On-device calculations — nothing leaves your phone</p>
      </PageHeader>

      <div className="px-4 py-3 border-b border-theme">
        <div className="relative flex items-center">
          <i className="ti ti-search absolute left-3 text-tertiary" style={{ fontSize: 16 }} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search calculators…"
            className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] input-surface"
            aria-label="Search calculators"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 flex flex-col gap-2.5">
        {results.length === 0 && (
          <div className="text-center py-12 text-tertiary">
            <i className="ti ti-search-off" style={{ fontSize: 32 }} aria-hidden="true" />
            <p className="text-sm mt-2">No calculators match "{query}"</p>
          </div>
        )}

        {results.map((c) => (
          <button
            key={c.id}
            onClick={() => open(c.id)}
            className="surface rounded-2xl p-3.5 flex items-center gap-3 text-left transition-colors hover:bg-surface-2"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${c.color}1a`, color: c.color }}
            >
              <i className={`ti ${c.icon}`} style={{ fontSize: 20 }} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">{c.title}</p>
              <p className="text-xs text-tertiary leading-snug">{c.subtitle}</p>
            </div>
            <i
              className="ti ti-chevron-right text-tertiary flex-shrink-0"
              style={{ fontSize: 16 }}
              aria-hidden="true"
            />
          </button>
        ))}

        {query.trim() === '' && (
          <p className="text-[11px] text-center text-tertiary mt-2">{CALCULATORS.length} calculators available</p>
        )}
      </div>
    </div>
  );
}
