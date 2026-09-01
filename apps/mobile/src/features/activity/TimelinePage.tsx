import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, PageHeader, TabStrip, ListContainer, EmptyState, SearchInput, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { usePrivacy } from '~/context/PrivacyContext';
import { useToast } from '~/context/ToastContext';
import { logActivity, restoreDeletionsSince } from '@/core/db/activityLog';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import type { ActivityAction, ActivityLog } from '@/core/db/types';
import { useActivityLog, groupByDay } from './useActivityLog';
import { ActivityRow } from './components/ActivityRow';
import { PrivacyReceipt } from './components/PrivacyReceipt';
import { MoneyStory } from './components/MoneyStory';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';

type TimelineTab = 'story' | 'timeline' | 'deleted';
type ActionFilter = 'all' | 'added' | 'edited' | 'deleted' | 'moved';

const ACTION_FILTERS: { value: ActionFilter; label: string; actions: ActivityAction[] }[] = [
  { value: 'all', label: 'All', actions: [] },
  { value: 'added', label: 'Added', actions: ['CREATE', 'IMPORT'] },
  { value: 'edited', label: 'Edited', actions: ['UPDATE', 'BULK_UPDATE'] },
  { value: 'deleted', label: 'Deleted', actions: ['DELETE', 'BULK_DELETE', 'UNDO_IMPORT'] },
  { value: 'moved', label: 'Moved', actions: ['BULK_MOVE', 'MERGE'] }
];

/**
 * RN port of apps/web-react/src/features/activity/TimelinePage.tsx. `logActivity`/
 * `restoreDeletionsSince` (`@/core/db/activityLog`) are already platform-agnostic — no platform work
 * needed here.
 */
export function TimelinePage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const { shouldMask } = usePrivacy();
  // Activity log mixes entries from every module without a live category/account reference to
  // resolve — treated as an aggregate/audit view: visible in Safe, hidden only in Privacy.
  const masked = shouldMask(false);
  const { entries, grouped, recentlyDeleted, loading, reload, restore, undo } = useActivityLog();
  const { showToast } = useToast();
  const [tab, setTab] = useState<TimelineTab>('story');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<ActivityLog | null>(null);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  useDefaultHeaderBack('Timeline');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

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

  async function handleRestore(id: string, entry?: ActivityLog) {
    setRestoringId(id);
    try {
      await restore(id, entry);
      notifyTxnChanged();
    } finally {
      setRestoringId(null);
    }
  }

  /** Opens the confirmation dialog for undoing a whole import batch — the durable Timeline fallback for
   *  the immediate post-import Undo button, reachable well after the fact (see this file's doc comment
   *  and useActivityLog.ts's undo()), so it's gated behind a confirm step unlike DoneStep.tsx's
   *  immediate one. */
  function requestUndo(entry: ActivityLog) {
    setUndoTarget(entry);
  }

  async function handleConfirmUndo() {
    const entry = undoTarget;
    if (!entry) return;
    setUndoingId(entry.id);
    try {
      const count = await undo(entry.id);
      notifyTxnChanged();
      showToast({
        message: count > 0 ? `Removed ${count} transaction${count === 1 ? '' : 's'}` : 'Nothing to undo',
        variant: count > 0 ? 'success' : 'info'
      });
    } finally {
      setUndoingId(null);
      setUndoTarget(null);
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
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        subtitle="Every change you make, on your device"
        actions={
          <Button variant="ghost" size="sm" icon="ti-flag" onPress={() => void setCheckpoint()}>
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

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading ? (
          <Text className="text-sm text-tertiary text-center py-10">Loading…</Text>
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
              <View className="px-4 pt-3 pb-1 gap-2">
                <SearchInput value={query} onChange={setQuery} placeholder="Search activity…" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-1.5">
                    {ACTION_FILTERS.map((f) => {
                      const active = actionFilter === f.value;
                      return (
                        <Pressable
                          key={f.value}
                          onPress={() => setActionFilter(f.value)}
                          className="flex-shrink-0 px-3 py-1.5 rounded-full"
                          style={{
                            backgroundColor: active ? theme.primary : theme.surfaceSecondary,
                            borderWidth: 0.5,
                            borderColor: active ? theme.primary : theme.border
                          }}
                        >
                          <Text
                            className="text-xs font-medium"
                            style={{ color: active ? '#fff' : theme.textSecondary }}
                          >
                            {f.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
              {filteredGrouped.length === 0 ? (
                <EmptyState
                  icon="ti-search-off"
                  title="No matching activity"
                  description="Try a different search or filter."
                />
              ) : (
                filteredGrouped.map((day) => (
                  <View key={day.label}>
                    <View className="px-4 py-2 bg-surface-2 border-b border-theme">
                      <Text className="text-xs font-medium uppercase tracking-wide text-tertiary">{day.label}</Text>
                    </View>
                    <ListContainer className="rounded-none border-x-0 border-t-0">
                      {day.items.map((e) =>
                        e.action === 'CHECKPOINT' ? (
                          <View key={e.id} className="flex-row items-center gap-2 px-4 py-1.5">
                            <View className="flex-1 border-t border-dashed border-theme" />
                            <Icon name="ti-flag" size={11} color={theme.textTertiary} />
                            <Text className="text-[10px] text-tertiary">Restore point</Text>
                            <Pressable onPress={() => void handleRestoreSince(e.timestamp)}>
                              <Text className="text-[10px] font-semibold" style={{ color: theme.primary }}>
                                Undo since
                              </Text>
                            </Pressable>
                            <View className="flex-1 border-t border-dashed border-theme" />
                          </View>
                        ) : (
                          <ActivityRow
                            key={e.id}
                            entry={e}
                            masked={masked}
                            onUndo={() => requestUndo(e)}
                            undoing={undoingId === e.id}
                          />
                        )
                      )}
                    </ListContainer>
                  </View>
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
          <View className="px-4 pt-3">
            <Text className="text-[11px] text-tertiary mb-2">Tap Restore to bring an item back.</Text>
            <ListContainer>
              {recentlyDeleted.map((e) => (
                <ActivityRow
                  key={e.id}
                  entry={e}
                  masked={masked}
                  onRestore={(id) => void handleRestore(id, e)}
                  restoring={restoringId === e.id}
                />
              ))}
            </ListContainer>
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        isOpen={!!undoTarget}
        onClose={() => setUndoTarget(null)}
        onConfirm={() => void handleConfirmUndo()}
        title="Undo this import?"
        message={`This will delete ${undoTarget?.entityCount ?? 0} transaction${undoTarget?.entityCount === 1 ? '' : 's'} that were added by this import.`}
        confirmLabel="Undo import"
        confirmVariant="danger"
        loading={!!undoingId}
      />
    </SafeAreaView>
  );
}
