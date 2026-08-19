import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Text, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  ListContainer,
  SectionLabel,
  EmptyState,
  Button,
  Banner,
  Badge,
  ConfirmDialog,
  Modal,
  TextInput
} from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeAccentColor } from '~/theme/useModeAccentColor';
import { useToast } from '~/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';
import { profileRepo, groupMembersRepo } from '@/core/db/repositories';
import {
  appendGroupEvent,
  groupBalances,
  groupFeed,
  groupFlags,
  groupVoidedSettlementIds,
  syncGroup,
  type PendingFlag
} from '@/core/groups/groupSync';
import { clearExpenseFlag, flagSharedExpense, voidSettlement } from '@/core/groups/groupsService';
import type { SettlementPayload } from '@/core/groups/split';
import type { Group, GroupEvent, GroupMember } from '@/core/db/types';
import { SharedExpenseComposer } from './SharedExpenseComposer';
import { SettleUpGroupModal } from './SettleUpGroupModal';
import { GroupMembersModal } from './GroupMembersModal';
import { useServerActionError } from '~/hooks/useServerActionError';
import { tint } from '~/lib/color';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';

const TYPE_ICON: Record<string, string> = {
  family: 'ti-home',
  trip: 'ti-plane',
  roommates: 'ti-users',
  other: 'ti-users-group'
};

/** The most recent settlement event between `a` and `b` in `feed` (newest-first) — used to decide
 *  whether a now-settled pair's "settled up" should instead read "written off" (item 17). */
function latestSettlementBetween(
  feed: GroupEvent[],
  a: string,
  b: string
): { event: GroupEvent; payload: SettlementPayload } | undefined {
  for (const e of feed) {
    if (e.type !== 'settlement') continue;
    const p = e.payload as SettlementPayload;
    if ((p.from === a && p.to === b) || (p.from === b && p.to === a)) return { event: e, payload: p };
  }
  return undefined;
}

/** RN port of apps/web-react/src/features/groups/GroupDashboard.tsx. `grid place-items-center`
 *  occurrences on web are single-cell centering here (`items-center justify-center`), not a real grid. */
export function GroupDashboard({ group }: { group: Group }) {
  const theme = useThemeColors();
  const accent = useModeAccentColor();
  const onError = useServerActionError();
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [feed, setFeed] = useState<GroupEvent[]>([]);
  const [flags, setFlags] = useState<PendingFlag[]>([]);
  const [voidedIds, setVoidedIds] = useState<Set<string>>(new Set());
  const [myId, setMyId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'settle' | 'members' | null>(null);
  const [editEvent, setEditEvent] = useState<GroupEvent | null>(null);
  const [settleWith, setSettleWith] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);
  const closed = group.status === 'closed';

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([
        groupBalances(group.id),
        groupMembersRepo.getAll(),
        groupFeed(group.id),
        groupFlags(group.id),
        groupVoidedSettlementIds(group.id),
        profileRepo.getAll()
      ]).then(([bal, allMembers, groupEvents, pendingFlags, voided, profile]) => {
        if (cancelled) return;
        setBalances(bal);
        setMembers(allMembers.filter((m) => m.groupId === group.id && m.status === 'active'));
        setFeed(groupEvents);
        setFlags(pendingFlags);
        setVoidedIds(voided);
        setMyId(profile[0]?.userId);
        setLoading(false);
      });
    void load();
    // Pull the latest events in the background; ignore failures (offline / no worker configured).
    void syncGroup(group.id)
      .then(load)
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [group.id, refreshKey]);

  // Pull-to-refresh handler — unlike `bump()` (a fire-and-forget re-trigger of the effect above, whose
  // own `syncGroup` call is background-only), this awaits the real network sync directly so the
  // RefreshControl spinner stays up for the actual round trip, not just a re-read of already-cached
  // local data. A failed/offline sync surfaces via `usePullToRefresh`'s own catch, same as everywhere
  // else; the effect's independent background sync that `bump()` still triggers afterwards is a
  // harmless redundant retry, not a correctness issue.
  const refresh = useCallback(async () => {
    await syncGroup(group.id);
    bump();
  }, [group.id, bump]);
  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const myNet = myId ? (balances[myId] ?? 0) : 0;
  const nameFor = (userId: string) => members.find((m) => m.userId === userId)?.displayName ?? 'Member';

  // A flag on MY OWN row (I'm the recorder) — the dashboard-top aggregate nudge, mirroring the
  // "fires only when a real, already-true condition exists" Did-You-Know rule (item 9).
  const pendingFlagsOnMyRows = flags.filter((f) => {
    const ev = feed.find(
      (e) => e.type !== 'settlement' && (e.payload as { expenseId?: string }).expenseId === f.expenseId
    );
    return ev?.authorId === myId;
  }).length;

  async function handleUndoWriteOff(settlementId: string) {
    try {
      await voidSettlement(group.id, settlementId);
      bump();
    } catch (err) {
      onError(err, 'Could not undo the write-off');
    }
  }

  const header = (
    <View className="gap-4 pb-2">
      {/* Group header */}
      <View className="flex-row items-center gap-3">
        <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: accent }}>
          <Icon name={TYPE_ICON[group.type] ?? 'ti-users-group'} size={22} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-primary" numberOfLines={1}>
            {group.name || 'Group'}
          </Text>
          <Text className="text-xs text-tertiary">
            {members.length} member{members.length === 1 ? '' : 's'}
            {closed && ' · closed'}
          </Text>
        </View>
        <Pressable
          onPress={() => setModal('members')}
          accessibilityLabel="Group settings"
          className="w-9 h-9 items-center justify-center rounded-lg"
        >
          <Icon name="ti-settings" size={19} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Your balance */}
      <View className="bg-surface border border-theme rounded-2xl p-4 items-center">
        <Text className="text-xs text-secondary">Your balance in this group</Text>
        <Text
          className="text-3xl font-bold mt-1"
          style={{ color: myNet > 0 ? theme.success : myNet < -0.99 ? theme.danger : theme.textPrimary }}
        >
          {Math.abs(myNet) < 1 ? '₹0' : formatCurrency(Math.abs(myNet))}
        </Text>
        <Text className="text-xs text-tertiary mt-0.5">
          {Math.abs(myNet) < 1 ? 'all settled up' : myNet > 0 ? "you're owed" : 'you owe'}
        </Text>
      </View>

      {/* Pending-flags aggregate nudge (item 9) — only when a real, already-true condition exists. */}
      {pendingFlagsOnMyRows > 0 && (
        <Banner variant="warning" icon="ti-flag">
          {pendingFlagsOnMyRows} of your shared expenses {pendingFlagsOnMyRows === 1 ? 'was' : 'were'} flagged as not
          needed — review below.
        </Banner>
      )}

      {/* Actions */}
      {closed ? (
        <Text className="text-center text-xs text-tertiary -mt-1">
          This group is settled &amp; closed — reopen it from settings to add more.
        </Text>
      ) : (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button icon="ti-plus" fullWidth onPress={() => setModal('add')}>
              Add expense
            </Button>
          </View>
          <View className="flex-1">
            <Button
              variant="ghost"
              fullWidth
              onPress={() => {
                setSettleWith(undefined);
                setModal('settle');
              }}
            >
              Settle up
            </Button>
          </View>
        </View>
      )}

      {/* Members */}
      <View>
        <SectionLabel>Members</SectionLabel>
        <ListContainer>
          {members.map((m) => {
            const net = balances[m.userId] ?? 0;
            const isMe = m.userId === myId;
            const settled = Math.abs(net) < 1;
            const lastSettlement = !isMe && myId ? latestSettlementBetween(feed, myId, m.userId) : undefined;
            const settlementId = lastSettlement?.payload.id;
            const isVoided = settlementId ? voidedIds.has(settlementId) : false;
            const writtenOff = settled && !isMe && lastSettlement?.payload.kind === 'write_off' && !isVoided;
            const label = isMe
              ? { text: 'you', color: theme.textTertiary }
              : writtenOff
                ? { text: 'written off', color: theme.textTertiary }
                : settled
                  ? { text: 'settled up', color: theme.textTertiary }
                  : net > 0
                    ? { text: `owes you ${formatCurrency(net)}`, color: theme.success }
                    : { text: `you owe ${formatCurrency(-net)}`, color: theme.danger };
            return (
              <View key={m.id} className="px-4 py-3 flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-surface-3 items-center justify-center">
                  <Text className="text-xs font-semibold text-secondary">
                    {(m.displayName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1 flex-row items-center gap-1.5 flex-wrap">
                  <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                    {m.displayName}
                    {m.role !== 'member' && <Text className="text-[11px] text-tertiary font-normal"> · {m.role}</Text>}
                  </Text>
                  {m.accountless && <Badge label="No account" color={theme.textTertiary} size="sm" />}
                </View>
                <View className="items-end gap-1">
                  <View className="flex-row items-center gap-1">
                    {writtenOff && <Icon name="ti-eraser" size={10} color={label.color} />}
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: label.color, fontStyle: writtenOff ? 'italic' : undefined }}
                    >
                      {label.text}
                    </Text>
                  </View>
                  {!closed && !isMe && writtenOff && settlementId && (
                    <Pressable onPress={() => void handleUndoWriteOff(settlementId)}>
                      <Text className="text-[11px] font-medium" style={{ color: theme.primary }}>
                        Undo write-off
                      </Text>
                    </Pressable>
                  )}
                  {!closed && !isMe && !writtenOff && Math.abs(net) >= 1 && (
                    <Pressable
                      onPress={() => {
                        setSettleWith(m.userId);
                        setModal('settle');
                      }}
                      className="rounded-lg border px-2 py-1"
                      style={{ borderColor: theme.border }}
                    >
                      <Text className="text-[11px] font-medium text-secondary">
                        {m.accountless ? 'Record for them' : 'Settle up'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </ListContainer>
      </View>

      <SectionLabel>Shared expenses</SectionLabel>
      {loading && <Text className="text-sm text-tertiary px-1">Loading…</Text>}
      {!loading && feed.length === 0 && (
        <EmptyState icon="ti-receipt" title="No shared expenses yet" description="Add one to start splitting costs." />
      )}
    </View>
  );

  return (
    <>
      {/*
       * FlashList, not a plain `.map()` in a `ListContainer` — the shared-expense feed grows unbounded
       * over a group's lifetime (flagged as a real jank risk in the 2026-07-26 parity sweep), unlike the
       * Members list above it (naturally bounded by group size, left as-is). FlashList recycles rows
       * instead of FlatList's mount/unmount-on-scroll (see TransactionsTab.tsx for the full diagnosis).
       * Everything above "Shared expenses" becomes the `ListHeaderComponent`; each feed row is its own
       * rounded card (not the hairline-divided single box `ListContainer` draws — neither list type has a
       * single wrapping element to hang that technique on, same tradeoff already made for Loans'/Import's
       * schedule/preview lists).
       */}
      <FlashList
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96 }}
        data={feed}
        keyExtractor={(e: GroupEvent) => e.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <FeedRow
            event={item}
            nameFor={nameFor}
            group={group}
            myId={myId}
            flag={flags.find((f) => f.expenseId === (item.payload as { expenseId?: string }).expenseId)}
            voided={item.type === 'settlement' ? voidedIds.has((item.payload as SettlementPayload).id ?? '') : false}
            onEdit={setEditEvent}
            onChanged={bump}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      />

      {modal === 'add' && <SharedExpenseComposer group={group} onClose={() => setModal(null)} onSaved={bump} />}
      {editEvent && (
        <SharedExpenseComposer
          group={group}
          editEvent={editEvent}
          onClose={() => setEditEvent(null)}
          onSaved={() => {
            setEditEvent(null);
            bump();
          }}
        />
      )}
      {modal === 'settle' && (
        <SettleUpGroupModal
          group={group}
          initialCounterpart={settleWith}
          onClose={() => setModal(null)}
          onSaved={bump}
        />
      )}
      {modal === 'members' && <GroupMembersModal group={group} onClose={() => setModal(null)} onChanged={bump} />}
    </>
  );
}

function FeedRow({
  event,
  nameFor,
  group,
  myId,
  flag,
  voided,
  onEdit,
  onChanged
}: {
  event: GroupEvent;
  nameFor: (id: string) => string;
  group: Group;
  myId?: string;
  flag?: PendingFlag;
  /** For a settlement row: whether this write-off has already been undone. Ignored otherwise. */
  voided: boolean;
  onEdit: (event: GroupEvent) => void;
  onChanged: () => void;
}) {
  const theme = useThemeColors();
  const { showToast } = useToast();
  const onError = useServerActionError();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canAct = group.status === 'active';

  if (event.type === 'settlement') {
    const p = event.payload as SettlementPayload;
    const isWriteOff = p.kind === 'write_off';
    const canUndo = canAct && isWriteOff && !voided && !!p.id && (p.from === myId || p.to === myId);
    const iconColor = isWriteOff ? theme.neutral : theme.success;
    return (
      <View className="px-4 py-3 bg-surface border border-theme rounded-xl mb-2">
        <View className="flex-row items-center gap-3">
          <View
            className="w-9 h-9 rounded-lg items-center justify-center"
            style={{ backgroundColor: tint(iconColor, 12) }}
          >
            <Icon name={isWriteOff ? 'ti-eraser' : 'ti-check'} size={17} color={iconColor} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-primary" numberOfLines={1}>
              {isWriteOff
                ? `${nameFor(p.to)} wrote off ${nameFor(p.from)}'s balance`
                : `${nameFor(p.from)} paid ${nameFor(p.to)}`}
            </Text>
            <Text className="text-[11px] text-tertiary">
              {isWriteOff ? `write-off${voided ? ' · undone' : ' · no money moved'}` : 'settlement'}
            </Text>
          </View>
          <Text
            className="text-sm font-semibold"
            style={{
              color: isWriteOff ? theme.textTertiary : theme.textPrimary,
              fontStyle: isWriteOff ? 'italic' : undefined
            }}
          >
            {formatCurrency(p.amount)}
          </Text>
        </View>
        {canUndo && (
          <View className="flex-row justify-end mt-1.5">
            <Pressable
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void voidSettlement(group.id, p.id as string)
                  .then(onChanged)
                  .catch((err: unknown) => onError(err, 'Could not undo the write-off'))
                  .finally(() => setBusy(false));
              }}
            >
              <Text className="text-[11px] font-medium" style={{ color: theme.primary }}>
                Undo write-off
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  const p = event.payload as {
    expenseId: string;
    amount: number;
    payer: string;
    shares?: Record<string, number>;
    description?: string;
  };
  const participants = p.shares ? Object.keys(p.shares).length : 0;
  const isRecorder = event.authorId === myId;

  async function handleDelete() {
    setBusy(true);
    try {
      await appendGroupEvent(group.id, 'expense_delete', { expenseId: p.expenseId });
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      onError(err, 'Could not delete the expense');
    } finally {
      setBusy(false);
    }
  }

  async function handleFlag() {
    setBusy(true);
    try {
      await flagSharedExpense(group.id, p.expenseId, flagNote.trim() || undefined);
      setFlagOpen(false);
      setFlagNote('');
      showToast({ message: 'Flagged — the recorder will see it next time they sync.' });
      onChanged();
    } catch (err) {
      onError(err, 'Could not flag the expense');
    } finally {
      setBusy(false);
    }
  }

  async function handleKeep() {
    try {
      await clearExpenseFlag(group.id, p.expenseId);
      onChanged();
    } catch (err) {
      onError(err, 'Could not clear the flag');
    }
  }

  return (
    <View className="px-4 py-3 bg-surface border border-theme rounded-xl mb-2">
      <View className="flex-row items-center gap-3">
        <View className="w-9 h-9 rounded-lg items-center justify-center bg-surface-3">
          <Icon name="ti-receipt" size={17} color={theme.textSecondary} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-medium text-primary" numberOfLines={1}>
            {p.description || 'Shared expense'}
          </Text>
          <Text className="text-[11px] text-tertiary" numberOfLines={1}>
            {nameFor(p.payer)} paid{participants ? ` · split ${participants} ways` : ''}
          </Text>
        </View>
        <Text className="text-sm font-semibold text-primary">{formatCurrency(p.amount)}</Text>
      </View>

      {/* Direct trailing icon-button pair for the recorder; a single, lighter flag for anyone else
          (item 9) — mirrors IouView.tsx's Archived-row Restore/Trash pair, no new overflow-menu
          pattern invented. Hidden once the group is closed (nothing here can change anymore). */}
      {canAct && (
        <View className="flex-row justify-end gap-1.5 mt-1.5">
          {isRecorder ? (
            <>
              <Pressable
                accessibilityLabel="Edit expense"
                onPress={() => onEdit(event)}
                className="w-6 h-6 rounded-md items-center justify-center bg-surface-2"
              >
                <Icon name="ti-pencil" size={12} color={theme.textSecondary} />
              </Pressable>
              <Pressable
                accessibilityLabel="Delete expense"
                onPress={() => setConfirmDelete(true)}
                className="w-6 h-6 rounded-md items-center justify-center bg-surface-2"
              >
                <Icon name="ti-trash" size={12} color={theme.danger} />
              </Pressable>
            </>
          ) : (
            !flag && (
              <Pressable
                accessibilityLabel="Flag as not needed"
                onPress={() => setFlagOpen(true)}
                className="w-6 h-6 rounded-md items-center justify-center bg-surface-2"
              >
                <Icon name="ti-flag" size={12} color={theme.warning} />
              </Pressable>
            )
          )}
        </View>
      )}

      {/* Durable, sync-carried flag state (no push-notification infra exists in this app). */}
      {flag &&
        (isRecorder ? (
          <View
            className="mt-2 rounded-lg border p-2 flex-row items-center gap-1.5"
            style={{ borderColor: tint(theme.warning, 35), backgroundColor: tint(theme.warning, 10) }}
          >
            <Icon name="ti-flag" size={12} color={theme.warning} />
            <Text className="flex-1 text-[10.5px] leading-relaxed" style={{ color: theme.textPrimary }}>
              {nameFor(flag.byAuthorId)} flagged this as not needed{flag.note ? ` — "${flag.note}"` : ''}
            </Text>
            {canAct && (
              <View className="flex-row gap-2.5">
                <Pressable onPress={() => void handleKeep()}>
                  <Text className="text-[10.5px] font-bold text-secondary">Keep</Text>
                </Pressable>
                <Pressable onPress={() => setConfirmDelete(true)}>
                  <Text className="text-[10.5px] font-bold" style={{ color: theme.danger }}>
                    Delete
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View
            className="mt-2 rounded-lg border p-2 flex-row items-center gap-1.5"
            style={{ borderColor: tint(theme.warning, 35), backgroundColor: tint(theme.warning, 10) }}
          >
            <Icon name="ti-flag" size={12} color={theme.warning} />
            <Text className="flex-1 text-[10.5px] leading-relaxed" style={{ color: theme.textPrimary }}>
              {flag.byAuthorId === myId
                ? `You flagged this — waiting on ${nameFor(event.authorId)}`
                : `${nameFor(flag.byAuthorId)} flagged this as not needed`}
            </Text>
          </View>
        ))}

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete this expense?"
        message={`This can't be undone. "${p.description || 'This expense'}" (${formatCurrency(
          p.amount
        )}) is removed from the shared ledger and everyone's balance recalculates.`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={() => void handleDelete()}
        onClose={() => setConfirmDelete(false)}
      />

      {flagOpen && (
        <Modal
          onClose={() => setFlagOpen(false)}
          title="Flag as not needed?"
          footer={
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="secondary" fullWidth onPress={() => setFlagOpen(false)} disabled={busy}>
                  Cancel
                </Button>
              </View>
              <View className="flex-1">
                <Button fullWidth loading={busy} onPress={() => void handleFlag()}>
                  Flag it
                </Button>
              </View>
            </View>
          }
        >
          <View className="gap-3">
            <Text className="text-sm text-secondary leading-relaxed">
              {nameFor(p.payer)} will see this next time they sync. It doesn&apos;t remove the expense — they can delete
              it themselves, or dismiss your flag.
            </Text>
            <TextInput
              label="Note (optional)"
              value={flagNote}
              onChange={setFlagNote}
              placeholder='e.g. "already refunded"'
            />
          </View>
        </Modal>
      )}
    </View>
  );
}
