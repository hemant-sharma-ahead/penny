import { useState, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import { useGroupContext } from '~/context/GroupContext';
import { useGroupSummaries } from './useGroupSummaries';
import { CreateGroupModal } from './CreateGroupModal';
import { JoinGroupModal } from './JoinGroupModal';

const TYPE_ICON: Record<string, string> = {
  family: 'ti-home',
  trip: 'ti-plane',
  roommates: 'ti-users',
  other: 'ti-users-group'
};

/**
 * RN port of apps/web-legacy/src/features/groups/ContextSwitcher.tsx: the context bar under the app
 * header — shows the current scope (Personal or a group) and opens a menu to switch or create/join.
 * Rendered only when the `sync` entitlement is on (dark by default).
 *
 * Web's menu is a hand-rolled `fixed inset-0` dropdown (a full-screen click-catcher behind an
 * absolutely-positioned panel). RN has no DOM z-index stacking to lean on for that trick, so this
 * rebuilds it on the real ported `Modal` component instead — same "centered modal, never a hand-rolled
 * overlay" fix already applied to every other hand-rolled-overlay case in this migration (Portfolio,
 * Retirement, IPO, Expenses' AnalyticsTab). Web's `navigate(PATHS.app.home)` after switching context has
 * no mobile equivalent yet (no real nav stack outside `AuthGuard`'s temporary stand-in) — dropped, same
 * precedent as every other dropped cross-module navigation call in Track 4. Likewise, "Claim a username"
 * would `navigate(PATHS.app.profile)` on web; there's no Profile screen on mobile yet, so it's a no-op
 * placeholder here (closes the menu) until a real claim/profile screen exists.
 */
export function ContextSwitcher() {
  const theme = useThemeColors();
  const { activeContext, activeGroup, groups, claimed, setContext } = useGroupContext();
  const { summaries } = useGroupSummaries(groups);
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);

  const inGroup = activeContext !== 'personal' && activeGroup;
  const activeMembers = inGroup && activeGroup ? (summaries[activeGroup.id]?.members ?? []) : [];

  function choose(ctx: 'personal' | string) {
    setContext(ctx);
    setOpen(false);
  }

  return (
    <>
      <View
        className="flex-row items-center gap-2 px-4 py-2 border-b border-theme"
        style={inGroup ? { backgroundColor: 'rgba(99, 102, 241, 0.12)' } : undefined}
      >
        <Pressable onPress={() => setOpen(true)} className="flex-row items-center gap-2 flex-1">
          <View
            className="w-6 h-6 rounded-lg items-center justify-center"
            style={{ backgroundColor: inGroup ? '#6366f1' : theme.primary }}
          >
            <Icon
              name={inGroup && activeGroup ? (TYPE_ICON[activeGroup.type] ?? 'ti-users-group') : 'ti-user'}
              size={13}
              color="#fff"
            />
          </View>
          <Text className="text-sm font-semibold text-primary flex-1" numberOfLines={1}>
            {inGroup && activeGroup ? activeGroup.name || 'Group' : 'Personal'}
          </Text>
          <Icon name="ti-chevron-down" size={14} color={theme.textTertiary} />
        </Pressable>

        {/* Member avatar stack — a quick "who's in this group" cue (screen 3). */}
        {inGroup && activeMembers.length > 0 && (
          <View className="flex-row items-center">
            {activeMembers.slice(0, 4).map((m, i) => (
              <View
                key={m.userId}
                className="w-6 h-6 rounded-full items-center justify-center"
                style={{
                  backgroundColor: '#6366f1',
                  marginLeft: i === 0 ? 0 : -8,
                  borderWidth: 2,
                  borderColor: theme.surface
                }}
              >
                <Text className="text-[10px] font-semibold text-white">
                  {(m.displayName || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}
            {activeMembers.length > 4 && (
              <Text className="text-[10px] text-tertiary ml-1">+{activeMembers.length - 4}</Text>
            )}
          </View>
        )}
      </View>

      {open && (
        <Modal onClose={() => setOpen(false)} title="Switch context" scrollable>
          <View>
            <MenuRow
              icon="ti-user"
              label="Personal"
              active={activeContext === 'personal'}
              onPress={() => choose('personal')}
            />
            {groups.map((g) => (
              <MenuRow
                key={g.id}
                icon={TYPE_ICON[g.type] ?? 'ti-users-group'}
                label={g.name || 'Group'}
                active={g.id === activeContext}
                onPress={() => choose(g.id)}
                right={<BalancePill net={summaries[g.id]?.myNet ?? 0} />}
              />
            ))}
            {!claimed ? (
              <Pressable
                onPress={() => setOpen(false)}
                className="flex-row items-center gap-2.5 px-4 py-3 border-t border-theme"
              >
                <Icon name="ti-user-plus" size={16} color={theme.primary} />
                <Text className="text-sm font-semibold" style={{ color: theme.primary }}>
                  Claim a username to use Groups
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    setModal('create');
                  }}
                  className="flex-row items-center gap-2.5 px-4 py-3 border-t border-theme"
                >
                  <Icon name="ti-plus" size={16} color={theme.primary} />
                  <Text className="text-sm font-semibold" style={{ color: theme.primary }}>
                    Create a group
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    setModal('join');
                  }}
                  className="flex-row items-center gap-2.5 px-4 py-3 border-t border-theme"
                >
                  <Icon name="ti-link" size={16} color={theme.primary} />
                  <Text className="text-sm font-semibold" style={{ color: theme.primary }}>
                    Join with a link
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Modal>
      )}

      {modal === 'create' && <CreateGroupModal onClose={() => setModal(null)} />}
      {modal === 'join' && <JoinGroupModal onClose={() => setModal(null)} />}
    </>
  );
}

function MenuRow({
  icon,
  label,
  active,
  onPress,
  right
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
  right?: ReactNode;
}) {
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-2.5 px-4 py-3"
      style={active ? { backgroundColor: theme.surfaceSecondary } : undefined}
    >
      <View className="w-6 h-6 rounded-lg items-center justify-center bg-surface-2">
        <Icon name={icon} size={13} color={theme.textSecondary} />
      </View>
      <Text className="flex-1 text-sm font-medium text-primary" numberOfLines={1}>
        {label}
      </Text>
      {active ? <Icon name="ti-check" size={15} color={theme.primary} /> : right}
    </Pressable>
  );
}

/** Compact per-group balance pill for the switcher menu (positive = you're owed). */
function BalancePill({ net }: { net: number }) {
  const theme = useThemeColors();
  if (Math.abs(net) < 1) return <Text className="text-xs text-tertiary">₹0</Text>;
  const owed = net > 0;
  return (
    <Text className="text-xs font-semibold" style={{ color: owed ? theme.success : theme.danger }}>
      {owed ? '+' : '−'}
      {formatCurrency(Math.abs(net))}
    </Text>
  );
}
