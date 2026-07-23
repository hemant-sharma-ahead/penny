import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ListContainer, PageHeader, SearchInput, Toggle } from '@/components/ui';
import { useRepository } from '@/hooks/useRepository';
import { notifyTagsChanged } from '@/hooks/useDataRefresh';
import { hashtagsRepo } from '@/core/db/repositories';

/**
 * The only place an *existing* tag's "Set aside" classification can be changed — changing it
 * retroactively reclassifies every past transaction carrying that tag, so it deliberately doesn't
 * live one accidental tap away in the Add Expense form (which only offers this choice for a tag
 * being created for the first time). Also the fix for "I can't remember what tags I've made" — every
 * tag ever used is browsable here, sorted by how often it's used.
 */
export function ManageTagsPage() {
  const navigate = useNavigate();
  const { items: hashtags, save: saveHashtag, loading } = useRepository(hashtagsRepo);
  const [search, setSearch] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? hashtags.filter((h) => h.name.includes(q)) : hashtags;
    return [...list].sort((a, b) => b.usageCount - a.usageCount);
  }, [hashtags, search]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Manage Tags"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg hover:text-primary"
            onClick={() => navigate(-1)}
          />
        }
      />

      <div className="px-4 py-4 flex flex-col gap-4 flex-1">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tags…" />

        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">Set aside</span>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-label="What does Set aside mean?"
              className="text-tertiary"
            >
              <i className="ti ti-info-circle" style={{ fontSize: 14 }} aria-hidden="true" />
            </button>
          </div>
          <p className="text-xs text-secondary mb-2 leading-relaxed">
            This is the only place to change an <b>existing</b> tag's classification — changing it here retroactively
            affects every past transaction that carries the tag, which is why the Add Expense form only lets you set
            this once, when a tag is first created.
          </p>
          {showInfo && (
            <div className="rounded-xl bg-surface-3 px-3.5 py-3 mb-3">
              <p className="text-xs text-secondary leading-relaxed">
                Transactions tagged with a "Set aside" tag don't count toward your daily living total or health score —
                use it for money spent on someone else's behalf, gifts, or anything that shouldn't skew your everyday
                spending picture. Budgets are unaffected (a tagged expense still counts against its category's budget —
                this only changes the routine/set-aside split). Independent of whether the tag is hidden in Safe Mode
                (Settings → Safe Mode → Tags).
              </p>
            </div>
          )}

          {loading ? (
            <p className="text-xs text-tertiary">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-tertiary">{search ? 'No matching tags.' : 'No tags yet.'}</p>
          ) : (
            <ListContainer>
              {filtered.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-[9px] grid place-items-center flex-shrink-0 bg-surface-2">
                    <i className="ti ti-hash" style={{ fontSize: 14, color: '#ec4899' }} aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-primary truncate">#{h.name}</span>
                    <span className="block text-[11px] text-tertiary">
                      {h.usageCount} transaction{h.usageCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <Toggle
                    value={!!h.setAside}
                    onChange={(setAside) =>
                      // Turning Set Aside on defaults Safe Mode visibility to match, same smart default as a
                      // brand-new tag gets — still independently editable in Settings → Safe Mode → Tags.
                      void saveHashtag({
                        ...h,
                        setAside,
                        hideInSafeMode: setAside ? true : h.hideInSafeMode
                      }).then(notifyTagsChanged)
                    }
                    aria-label={`Set aside #${h.name}`}
                  />
                </div>
              ))}
            </ListContainer>
          )}
        </div>
      </div>
    </div>
  );
}
