import { useState, type ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeAccentColor } from '~/theme/useModeAccentColor';
import { tint } from '~/lib/color';
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
 * RN port of apps/web-react/src/features/groups/ContextSwitcher.tsx: shows the current scope (Personal
 * or a group) and opens a menu to switch or create/join. Rendered only when the `sync` entitlement is on.
 *
 * **`variant` (2026-07-31 chrome consolidation, `inline` replaced `floating` 2026-08-01)**: since
 * "Personal ▾" only ever matters on Home (every other screen is always personal-scoped), this no longer
 * lives in `MainTabs`' shared chrome as a full-width bar shown on every tab. `variant="bar"` (the
 * default) keeps the original full-width bar-with-border look, still used by `GroupsSmokeTestScreen`'s
 * manual test harness. `variant="inline"` renders with no background/border/shadow at all, sized to sit
 * directly in `MainTabs`' global header center slot on the Home tab — the header's own background is
 * already the immersive, theme-matching surface, so the switcher doesn't need its own. The modal/switch
 * logic itself is identical either way.
 *
 * Web's menu is a hand-rolled `fixed inset-0` dropdown (a full-screen click-catcher behind an
 * absolutely-positioned panel). RN has no DOM z-index stacking to lean on for that trick, so this
 * rebuilds it on the real ported `Modal` component instead — same "centered modal, never a hand-rolled
 * overlay" fix already applied to every other hand-rolled-overlay case in this migration (Portfolio,
 * Retirement, IPO, Expenses' AnalyticsTab). Web's `navigate(PATHS.app.home)`/`navigate(PATHS.app.profile)`
 * post-switch/claim navigation, dropped earlier in Track 4 for lack of a real nav stack, are now wired to
 * the real `MainNavigator`/`MainTabs` routes (`Profile` screen exists since Onboarding; `MainTabs`'
 * nested `Home` tab is reached via the standard nested-navigate form).
 */
export function ContextSwitcher({ variant = 'bar' }: { variant?: 'bar' | 'inline' }) {
  const theme = useThemeColors();
  const accent = useModeAccentColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { activeContext, activeGroup, groups, claimed, setContext } = useGroupContext();
  const { summaries } = useGroupSummaries(groups);
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);

  const inGroup = activeContext !== 'personal' && activeGroup;
  const activeMembers = inGroup && activeGroup ? (summaries[activeGroup.id]?.members ?? []) : [];

  function choose(ctx: 'personal' | string) {
    setContext(ctx);
    setOpen(false);
    navigation.navigate('MainTabs', { screen: 'Home' });
  }

  const inline = variant === 'inline';

  return (
    <>
      <View
        className={
          inline ? 'flex-row items-center gap-2' : 'flex-row items-center gap-2 px-4 py-2 border-b border-theme'
        }
        style={!inline && inGroup ? { backgroundColor: tint(accent, 12) } : undefined}
      >
        <Pressable onPress={() => setOpen(true)} className={`flex-row items-center gap-2 ${inline ? '' : 'flex-1'}`}>
          <View
            className="w-6 h-6 rounded-lg items-center justify-center"
            style={{ backgroundColor: inGroup ? accent : theme.primary }}
          >
            <Icon
              name={inGroup && activeGroup ? (TYPE_ICON[activeGroup.type] ?? 'ti-users-group') : 'ti-user'}
              size={13}
              color="#fff"
            />
          </View>
          <Text
            className={`text-sm font-semibold text-primary ${inline ? '' : 'flex-1'}`}
            numberOfLines={1}
            style={inline ? { maxWidth: 120 } : undefined}
          >
            {inGroup && activeGroup ? activeGroup.name || 'Group' : 'Personal'}
          </Text>
          <Icon name="ti-chevron-down" size={14} color={theme.textTertiary} />
        </Pressable>

        {/* Member avatar stack — a quick "who's in this group" cue (screen 3). Skipped for `inline`:
            the header center slot is too narrow to fit it alongside the label + chevron. */}
        {!inline && inGroup && activeMembers.length > 0 && (
          <View className="flex-row items-center">
            {activeMembers.slice(0, 4).map((m, i) => (
              <View
                key={m.userId}
                className="w-6 h-6 rounded-full items-center justify-center"
                style={{
                  backgroundColor: accent,
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
                suffix={g.status === 'closed' ? ' · closed' : g.status === 'left' ? ' · you left' : undefined}
                active={g.id === activeContext}
                onPress={() => choose(g.id)}
                right={<BalancePill net={summaries[g.id]?.myNet ?? 0} />}
              />
            ))}
            {!claimed ? (
              <Pressable
                onPress={() => {
                  setOpen(false);
                  navigation.navigate('MainTabs', { screen: 'Home', params: { screen: 'Profile' } });
                }}
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
  suffix,
  active,
  onPress,
  right
}: {
  icon: string;
  label: string;
  /** " · closed" / " · you left" — same inline status suffix as HomeGroupsCard's group list, so
   *  switching into a closed/left group from this menu doesn't look identical to an active one until
   *  the dashboard itself loads. */
  suffix?: string;
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
      <View className="w-6 h-6 rounded-lg items-center justify-center bg-surface-3">
        <Icon name={icon} size={13} color={theme.textSecondary} />
      </View>
      <Text className="flex-1 text-sm font-medium text-primary" numberOfLines={1}>
        {label}
        {suffix && <Text className="text-[11px] text-tertiary font-normal">{suffix}</Text>}
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
