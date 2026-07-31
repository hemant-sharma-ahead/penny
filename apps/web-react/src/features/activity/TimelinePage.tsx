import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, TabStrip, ListContainer, EmptyState, SearchInput } from '@/components/ui';
import { usePrivacy } from '@/context/PrivacyContext';
import { useToast } from '@/context/ToastContext';
import { logActivity, restoreDeletionsSince } from '@/core/db/activityLog';
import type { ActivityAction } from '@/core/db/types';
import { useActivityLog, groupByDay } from './useActivityLog';
import { ActivityRow } from './components/ActivityRow';
import { PrivacyReceipt } from './components/PrivacyReceipt';
import { MoneyStory } from './components/MoneyStory';

type TimelineTab = 'story' | 'timeline' | 'deleted';
type ActionFilter = 'all' | 'added' | 'edited' | 'deleted' | 'moved';

const ACTION_FILTERS: { value: ActionFilter; label: string; actions: ActivityAction[] }[] = [
  { value: 'all', label: 'All', actions: [] },
  { value: 'added', label: 'Added', actions: ['CREATE', 'IMPORT'] },
  { value: 'edited', label: 'Edited', actions: ['UPDATE', 'BULK_UPDATE'] },
  { value: 'deleted', label: 'Deleted', actions: ['DELETE', 'BULK_DELETE'] },
  { value: 'moved', label: 'Moved', actions: ['BULK_MOVE', 'MERGE'] }
];

export function TimelinePage() {
  const navigate = useNavigate();
  const { shouldMask } = usePrivacy();
  // Activity log mixes entries from every module without a live category/account reference to
  // resolve — treated as an aggregate/audit view: visible in Safe, hidden only in Privacy.
  const masked = shouldMask(false);
  const { entries, grouped, recentlyDeleted, loading, reload, restore } = useActivityLog();
  const { showToast } = useToast();
  const [tab, setTab] = useState<TimelineTab>('story');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');

  const filtering = query.trim().length > 0 || actionFilter !== 'all';
  const filteredGrouped = useMemo(() => {
    if (!filtering) return grouped;
    const q = query.trim().toLowerCase();
    const allowed = new Set(ACTION_FILTERS.find((f) => f.value === actionFilter)?.actions ?? []);
    const matched = entries.filter(
      (e) =>
        e.action !== 'CHECKPOINT' &&
        (actionFilter === 'all' || allowed.has(e.action)) &&
        (q === '' || e.summary.toLowerCase().includes(q))
    );
    return groupByDay(matched);
  }, [filtering, grouped, entries, query, actionFilter]);

  async function handleRestore(id: string) {
    setRestoringId(id);
    try {
      await restore(id);
    } finally {
      setRestoringId(null);
    }
  }

  async function setCheckpoint() {
    logActivity({
      action: 'CHECKPOINT',
      entityType: 'system',
      entityId: crypto.randomUUID(),
      summary: 'Restore point set'
    });
    await new Promise((r) => setTimeout(r, 150));
    reload();
    showToast({ message: 'Restore point set' });
  }

  async function handleRestoreSince(ts: number) {
    const n = await restoreDeletionsSince(ts);
    reload();
    showToast({ message: n > 0 ? `Restored ${n} item${n === 1 ? '' : 's'}` : 'Nothing to restore since then' });
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Timeline"
        subtitle="Every change you make, on your device"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg hover:text-primary"
            onClick={() => navigate(-1)}
          />
        }
        actions={
          <Button variant="ghost" size="sm" icon="ti-flag" onClick={() => void setCheckpoint()}>
            Restore point
          </Button>
        }
      />

      <TabStrip
        scrollable
        options={[
          { value: 'story', label: 'Story' },
          { value: 'timeline', label: 'Timeline' },
          { value: 'deleted', label: `Recently deleted${recentlyDeleted.length ? ` (${recentlyDeleted.length})` : ''}` }
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="flex-1 overflow-y-auto pb-6">
        {loading ? (
          <p className="text-sm text-tertiary text-center py-10">Loading…</p>
        ) : tab === 'story' ? (
          entries.length === 0 ? (
            <EmptyState
              icon="ti-sparkles"
              title="No story yet"
              description="Start tracking and Chip will narrate your week."
            />
          ) : (
            <MoneyStory entries={entries} masked={masked} />
          )
        ) : tab === 'timeline' ? (
          grouped.length === 0 ? (
            <EmptyState icon="ti-history" title="No activity yet" description="Your changes will show up here." />
          ) : (
            <>
              <PrivacyReceipt entries={entries} />
              <div className="px-4 pt-3 pb-1 flex flex-col gap-2">
                <SearchInput value={query} onChange={setQuery} placeholder="Search activity…" />
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                  {ACTION_FILTERS.map((f) => {
                    const active = actionFilter === f.value;
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setActionFilter(f.value)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                        style={
                          active
                            ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                            : {
                                backgroundColor: 'var(--color-surface-secondary)',
                                color: 'var(--color-text-secondary)',
                                border: '0.5px solid var(--color-border)'
                              }
                        }
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {filteredGrouped.length === 0 ? (
                <EmptyState
                  icon="ti-search-off"
                  title="No matching activity"
                  description="Try a different search or filter."
                />
              ) : (
                filteredGrouped.map((day) => (
                  <div key={day.label}>
                    <div className="px-4 py-2 bg-surface-2 border-b border-theme">
                      <span className="text-xs font-medium uppercase tracking-wide text-tertiary">{day.label}</span>
                    </div>
                    <ListContainer className="rounded-none border-x-0 border-t-0">
                      {day.items.map((e) =>
                        e.action === 'CHECKPOINT' ? (
                          <div key={e.id} className="flex items-center gap-2 px-4 py-1.5">
                            <div className="flex-1 border-t border-dashed border-theme" />
                            <i
                              className="ti ti-flag"
                              style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
                              aria-hidden="true"
                            />
                            <span className="text-[10px] text-tertiary">Restore point</span>
                            <button
                              type="button"
                              onClick={() => void handleRestoreSince(e.timestamp)}
                              className="text-[10px] font-semibold"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              Undo since
                            </button>
                            <div className="flex-1 border-t border-dashed border-theme" />
                          </div>
                        ) : (
                          <ActivityRow key={e.id} entry={e} masked={masked} />
                        )
                      )}
                    </ListContainer>
                  </div>
                ))
              )}
            </>
          )
        ) : recentlyDeleted.length === 0 ? (
          <EmptyState
            icon="ti-trash-off"
            title="Nothing to restore"
            description="Deleted items you can bring back appear here."
          />
        ) : (
          <div className="px-4 pt-3">
            <p className="text-[11px] text-tertiary mb-2">Tap Restore to bring an item back.</p>
            <ListContainer>
              {recentlyDeleted.map((e) => (
                <ActivityRow
                  key={e.id}
                  entry={e}
                  masked={masked}
                  onRestore={(id) => void handleRestore(id)}
                  restoring={restoringId === e.id}
                />
              ))}
            </ListContainer>
          </div>
        )}
      </div>
    </div>
  );
}
