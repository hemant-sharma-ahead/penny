import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeAccentColor } from '~/theme/useModeAccentColor';
import { formatCurrency } from '@/lib/formatters';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { useGroupContext } from '~/context/GroupContext';
import { useGroupSummaries } from '~/features/groups/useGroupSummaries';
import { CreateGroupModal } from '~/features/groups/CreateGroupModal';
import { JoinGroupModal } from '~/features/groups/JoinGroupModal';

const TYPE_ICON: Record<string, string> = {
  family: 'ti-home',
  trip: 'ti-plane',
  roommates: 'ti-users',
  other: 'ti-users-group'
};

/**
 * RN port of apps/web-legacy/src/features/groups/HomeGroupsCard.tsx: the "Groups" card on the Personal
 * Home (Track E, screen 1) — lists each group with your balance + member/expense counts, and a New /
 * Join entry. Tapping a tile re-scopes the app to that group (Home then renders that group's
 * `GroupDashboard` instead — see `HomePage.tsx`). Web's `navigate(PATHS.app.home)` after switching
 * context is a no-op here (Home re-renders in place from `useGroupContext` — there's no separate route to
 * navigate to); web's "Claim to create" routes to Profile — this used to be a no-op tap here since
 * `Profile` didn't exist on mobile yet, but that route landed alongside Track 4's Onboarding pass and is
 * already used the same way by `ContextSwitcher.tsx`, so the stale reasoning was fixed (found via the
 * 2026-07-25 audit) rather than left as dead code.
 */
export function HomeGroupsCard() {
  const theme = useThemeColors();
  const accent = useModeAccentColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { groups, claimed, setContext } = useGroupContext();
  const { summaries } = useGroupSummaries(groups);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);

  // Surface whenever you're in groups (real or demo fixtures) — viewing balances/feed folds locally and
  // needs no claim. Creating/joining does need a real claim, so that's gated below.
  if (!hasEntitlement('sync') || groups.length === 0) return null;

  const activeGroups = groups.filter((g) => g.status === 'active');
  const shown = activeGroups.length > 0 ? activeGroups : groups;

  return (
    <View className="mb-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-primary">Groups</Text>
        <View className="flex-row items-center gap-2">
          {claimed ? (
            <>
              <Pressable onPress={() => setModal('create')} className="flex-row items-center gap-1">
                <Icon name="ti-plus" size={13} color={theme.primary} />
                <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                  New
                </Text>
              </Pressable>
              <Text className="text-xs text-tertiary">/</Text>
              <Pressable onPress={() => setModal('join')}>
                <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                  Join
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => navigation.navigate('Profile')} className="flex-row items-center gap-1">
              <Icon name="ti-user-plus" size={13} color={theme.primary} />
              <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                Claim to create
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <View className="bg-surface border border-theme rounded-2xl overflow-hidden">
        {shown.map((g, i) => {
          const s = summaries[g.id];
          const net = s?.myNet ?? 0;
          const settled = Math.abs(net) < 1;
          const owed = net > 0;
          const balColor = settled ? theme.textTertiary : owed ? theme.success : theme.danger;
          const balText = settled ? '₹0' : `${owed ? '+' : '−'}${formatCurrency(Math.abs(net))}`;
          const balSub = settled ? 'settled up' : owed ? "you're owed" : 'you owe';
          return (
            <Pressable
              key={g.id}
              onPress={() => setContext(g.id)}
              className="w-full flex-row items-center gap-3 px-4 py-3"
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.border } : undefined}
            >
              <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: accent }}>
                <Icon name={TYPE_ICON[g.type] ?? 'ti-users-group'} size={18} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                  {g.name || 'Group'}
                  {g.status === 'closed' && <Text className="text-[10px] text-tertiary font-normal"> · closed</Text>}
                </Text>
                <Text className="text-[11px] text-tertiary">
                  {s?.memberCount ?? 0} member{(s?.memberCount ?? 0) === 1 ? '' : 's'} · {s?.expenseCount ?? 0} expense
                  {(s?.expenseCount ?? 0) === 1 ? '' : 's'}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-bold" style={{ color: balColor }}>
                  {balText}
                </Text>
                <Text className="text-[10px] text-tertiary">{balSub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {modal === 'create' && <CreateGroupModal onClose={() => setModal(null)} />}
      {modal === 'join' && <JoinGroupModal onClose={() => setModal(null)} />}
    </View>
  );
}
