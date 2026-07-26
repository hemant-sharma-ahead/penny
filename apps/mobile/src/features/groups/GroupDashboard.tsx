import { useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ListContainer, SectionLabel, EmptyState, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeAccentColor } from '~/theme/useModeAccentColor';
import { formatCurrency } from '@/lib/formatters';
import { profileRepo, groupMembersRepo } from '@/core/db/repositories';
import { groupBalances, groupFeed, syncGroup } from '@/core/groups/groupSync';
import type { Group, GroupEvent, GroupMember } from '@/core/db/types';
import { SharedExpenseComposer } from './SharedExpenseComposer';
import { SettleUpGroupModal } from './SettleUpGroupModal';
import { GroupMembersModal } from './GroupMembersModal';

const TYPE_ICON: Record<string, string> = {
  family: 'ti-home',
  trip: 'ti-plane',
  roommates: 'ti-users',
  other: 'ti-users-group'
};

/** RN port of apps/web-react/src/features/groups/GroupDashboard.tsx. `grid place-items-center`
 *  occurrences on web are single-cell centering here (`items-center justify-center`), not a real grid. */
export function GroupDashboard({ group }: { group: Group }) {
  const theme = useThemeColors();
  const accent = useModeAccentColor();
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [feed, setFeed] = useState<GroupEvent[]>([]);
  const [myId, setMyId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'settle' | 'members' | null>(null);
  const [settleWith, setSettleWith] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  const closed = group.status === 'closed';

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([groupBalances(group.id), groupMembersRepo.getAll(), groupFeed(group.id), profileRepo.getAll()]).then(
        ([bal, allMembers, groupEvents, profile]) => {
          if (cancelled) return;
          setBalances(bal);
          setMembers(allMembers.filter((m) => m.groupId === group.id && m.status === 'active'));
          setFeed(groupEvents);
          setMyId(profile[0]?.userId);
          setLoading(false);
        }
      );
    void load();
    // Pull the latest events in the background; ignore failures (offline / no worker configured).
    void syncGroup(group.id)
      .then(load)
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [group.id, refreshKey]);

  const myNet = myId ? (balances[myId] ?? 0) : 0;
  const nameFor = (userId: string) => members.find((m) => m.userId === userId)?.displayName ?? 'Member';

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
            const label = isMe
              ? { text: 'you', color: theme.textTertiary }
              : Math.abs(net) < 1
                ? { text: 'settled up', color: theme.textTertiary }
                : net > 0
                  ? { text: `owes you ${formatCurrency(net)}`, color: theme.success }
                  : { text: `you owe ${formatCurrency(-net)}`, color: theme.danger };
            return (
              <View key={m.id} className="px-4 py-3 flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-surface-2 items-center justify-center">
                  <Text className="text-xs font-semibold text-secondary">
                    {(m.displayName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>
                  {m.displayName}
                  {m.role !== 'member' && <Text className="text-[11px] text-tertiary font-normal"> · {m.role}</Text>}
                </Text>
                <Text className="text-xs font-semibold" style={{ color: label.color }}>
                  {label.text}
                </Text>
                {!closed && !isMe && Math.abs(net) >= 1 && (
                  <Pressable
                    onPress={() => {
                      setSettleWith(m.userId);
                      setModal('settle');
                    }}
                    className="rounded-lg border px-2 py-1"
                    style={{ borderColor: theme.border }}
                  >
                    <Text className="text-[11px] font-medium text-secondary">Settle up</Text>
                  </Pressable>
                )}
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
        renderItem={({ item }) => <FeedRow event={item} nameFor={nameFor} />}
      />

      {modal === 'add' && <SharedExpenseComposer group={group} onClose={() => setModal(null)} onSaved={bump} />}
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

function FeedRow({ event, nameFor }: { event: GroupEvent; nameFor: (id: string) => string }) {
  const theme = useThemeColors();
  if (event.type === 'settlement') {
    const p = event.payload as { from: string; to: string; amount: number };
    return (
      <View className="px-4 py-3 flex-row items-center gap-3 bg-surface border border-theme rounded-xl mb-2">
        <View
          className="w-9 h-9 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${theme.success}1f` }}
        >
          <Icon name="ti-check" size={17} color={theme.success} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-medium text-primary" numberOfLines={1}>
            {nameFor(p.from)} paid {nameFor(p.to)}
          </Text>
          <Text className="text-[11px] text-tertiary">settlement</Text>
        </View>
        <Text className="text-sm font-semibold text-primary">{formatCurrency(p.amount)}</Text>
      </View>
    );
  }
  const p = event.payload as { amount: number; payer: string; shares?: Record<string, number>; description?: string };
  const participants = p.shares ? Object.keys(p.shares).length : 0;
  return (
    <View className="px-4 py-3 flex-row items-center gap-3 bg-surface border border-theme rounded-xl mb-2">
      <View className="w-9 h-9 rounded-lg items-center justify-center bg-surface-2">
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
  );
}
