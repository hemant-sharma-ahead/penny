import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, Image, ScrollView } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader, Toggle, ConfirmDialog } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useProfile } from '@/hooks/useProfile';
import { useSettings, OPEN_MODE_DURATIONS, type ModuleVisibility } from '~/context/SettingsContext';
import { type PersistedPrivacyMode } from '~/context/PrivacyContext';
import { wipeDemoData, isDemoSeeded } from '@/core/db/seedDemoData';
import { getWipeAfterAttempts, setWipeAfterAttempts, WIPE_THRESHOLD } from '@/core/crypto/securityManager';

/**
 * RN port of apps/web-legacy/src/features/settings/SettingsPage.tsx. Deviations from the web version:
 * - Theme picker + font-scale grid dropped entirely — mobile's `SettingsContext.tsx` deliberately never
 *   ported `theme`/`fontScale` (Track 3's own `ThemeProvider` already owns theme; font scaling has no
 *   mobile consumer yet). Nothing in this screen references either.
 * - "Contact & Feedback" and "Backup & Restore" nav rows restored once those modules were ported (see
 *   `FeedbackPage.tsx`/`~/features/backup/BackupPage.tsx`).
 * - Exit Demo Mode hands off to onboarding's "Let us know you" step by nested-navigating into the
 *   `OnboardingFlow` screen (`MainNavigator.tsx` re-mounts `OnboardingNavigator` for exactly this case —
 *   `wipeDemoData()` doesn't touch `security`/`profile`, so this is a real in-app nested navigation, not
 *   an `AuthGuard` re-check).
 * - Navigation route names ('SafeModeSettings', 'ManageTags', 'ChangePin', 'ChangePassphrase', 'Profile',
 *   'Timeline') are registered in `MainNavigator.tsx`.
 * Module grid: `grid-cols-5` → `flex-row flex-wrap`, established Track 4 pattern.
 */

interface ModuleDef {
  key: keyof ModuleVisibility;
  label: string;
  icon: string;
  color: string;
}

const MODULES: ModuleDef[] = [
  { key: 'portfolio', label: 'Portfolio', icon: 'ti-chart-pie', color: '#6366f1' },
  { key: 'goals', label: 'Goals', icon: 'ti-target', color: '#10b981' },
  { key: 'news', label: 'News', icon: 'ti-news', color: '#f59e0b' },
  { key: 'calc', label: 'Calc', icon: 'ti-math-function', color: '#f97316' }
];

// Icons + colours mirror the header's PrivacyModeSwitcher — keep the two in sync. Open is deliberately
// excluded — it can never be a persisted default, only a temporary elevation (see PrivacyContext).
function usePrivacyModes(): { mode: PersistedPrivacyMode; label: string; icon: string; color: string }[] {
  const theme = useThemeColors();
  return [
    { mode: 'safe', label: 'Safe', icon: 'ti-eye-off', color: theme.textSecondary },
    { mode: 'privacy', label: 'Private', icon: 'ti-shield-lock', color: theme.danger }
  ];
}

/** Local section label — mirrors web's own inline `SectionLabel` (not the shared `components/ui` one,
 *  which has no `danger` variant), so the Danger zone heading can render in the danger color. */
function SectionLabel({ children, danger }: { children: ReactNode; danger?: boolean }) {
  const theme = useThemeColors();
  return (
    <Text
      className="text-[11px] font-semibold uppercase tracking-wide mt-6 mb-2"
      style={{ color: danger ? theme.danger : theme.textTertiary }}
    >
      {children}
    </Text>
  );
}

function Row({
  icon,
  label,
  sub,
  trailing,
  onPress,
  danger
}: {
  icon: string;
  label: string;
  sub?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const theme = useThemeColors();
  const inner = (
    <>
      <Icon name={icon} size={19} color={danger ? theme.danger : theme.textSecondary} />
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-medium" style={{ color: danger ? theme.danger : theme.textPrimary }}>
          {label}
        </Text>
        {sub && <Text className="text-[11px] text-tertiary">{sub}</Text>}
      </View>
      {trailing}
    </>
  );
  const cls = 'flex-row items-center gap-3 py-3.5 border-t border-theme';
  return onPress ? (
    <Pressable onPress={onPress} className={cls}>
      {inner}
    </Pressable>
  ) : (
    <View className={cls}>{inner}</View>
  );
}

export function SettingsPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const theme = useThemeColors();
  const { profile } = useProfile();
  const {
    modules,
    defaultPrivacyMode,
    openModeDurationMinutes,
    lockOnBackground,
    setModule,
    setDefaultPrivacyMode,
    setOpenModeDurationMinutes,
    setLockOnBackground
  } = useSettings();
  const privacyModes = usePrivacyModes();
  const [wipeEnabled, setWipeEnabled] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    void getWipeAfterAttempts().then((n) => setWipeEnabled(n != null));
  }, []);

  const toggleWipe = (value: boolean) => {
    setWipeEnabled(value);
    void setWipeAfterAttempts(value);
  };

  // Only ever shown while still on the throwaway Demo Mode vault (see the render guard below) — hands
  // off to the same real-setup sequence as web's "Exit Demo Mode", not just a data wipe.
  const handleExitDemoMode = async () => {
    setExiting(true);
    await wipeDemoData();
    navigation.navigate('OnboardingFlow', { screen: 'LetUsKnowYou', params: { fromDemoMode: true } });
  };

  const name = profile?.displayName?.trim() || 'Your account';
  const initial = (profile?.displayName?.trim() || profile?.username || '?').charAt(0).toUpperCase();
  const handleLine = [profile?.username ? `@${profile.username}` : null, profile?.plan === 'free' ? 'Free plan' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-tertiary">
      <PageHeader leading={<BackButton />} title="Settings" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4">
          {/* Profile hero */}
          <Pressable onPress={() => navigation.navigate('Profile')} className="flex-row items-center gap-3 py-4">
            <View
              className="w-14 h-14 rounded-full items-center justify-center overflow-hidden"
              style={{ backgroundColor: theme.primary }}
            >
              {profile?.avatarDataUrl ? (
                <Image source={{ uri: profile.avatarDataUrl }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <Text className="text-white text-xl font-bold">{initial}</Text>
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-lg font-bold text-primary" numberOfLines={1}>
                {name}
              </Text>
              {handleLine && <Text className="text-xs text-secondary">{handleLine}</Text>}
            </View>
            <View className="rounded-full px-3 py-1.5 border" style={{ borderColor: theme.primary }}>
              <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                Edit
              </Text>
            </View>
          </Pressable>

          {/* Modules */}
          <SectionLabel>Modules</SectionLabel>
          <View className="flex-row flex-wrap gap-2.5">
            {MODULES.map((m) => {
              const on = modules[m.key];
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setModule(m.key, !on)}
                  accessibilityState={{ selected: on }}
                  className="items-center gap-1.5"
                  style={{ width: 56 }}
                >
                  <View
                    className="w-12 h-12 rounded-2xl items-center justify-center border"
                    style={{
                      backgroundColor: on ? m.color : theme.surface,
                      borderColor: on ? m.color : theme.border
                    }}
                  >
                    <Icon name={m.icon} size={20} color={on ? '#fff' : theme.textTertiary} />
                  </View>
                  <Text
                    className="text-[9px] font-medium text-center leading-tight"
                    style={{ color: on ? theme.textSecondary : theme.textTertiary }}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-[11px] text-tertiary mt-2.5">
            Tap to show / hide. Home, Expenses &amp; Chip are always on.
          </Text>

          {/* Privacy */}
          <SectionLabel>Privacy</SectionLabel>
          <Text className="text-xs text-secondary mb-2">Default mode when the app opens</Text>
          <View className="flex-row gap-2">
            {privacyModes.map(({ mode, label, icon, color }) => {
              const on = defaultPrivacyMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setDefaultPrivacyMode(mode)}
                  className="flex-1 py-2.5 rounded-xl border flex-row items-center justify-center gap-1.5"
                  style={{ backgroundColor: on ? color : 'transparent', borderColor: on ? color : theme.border }}
                >
                  <Icon name={icon} size={16} color={on ? '#fff' : theme.textSecondary} />
                  <Text className="text-xs font-bold" style={{ color: on ? '#fff' : theme.textSecondary }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-xs text-secondary mt-4 mb-2">
            Open mode duration — how long "Open" lasts before it auto-reverts. Open is never a starting state; it's
            always a temporary switch (from the header) that resets on its own, on backgrounding, or on relaunch.
          </Text>
          <View className="flex-row gap-1.5">
            {OPEN_MODE_DURATIONS.map((minutes) => {
              const on = openModeDurationMinutes === minutes;
              return (
                <Pressable
                  key={minutes}
                  onPress={() => setOpenModeDurationMinutes(minutes)}
                  className="flex-1 py-2 rounded-xl border items-center"
                  style={{
                    backgroundColor: on ? theme.warning : 'transparent',
                    borderColor: on ? theme.warning : theme.border
                  }}
                >
                  <Text className="text-xs font-bold" style={{ color: on ? '#fff' : theme.textSecondary }}>
                    {minutes}m
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Row
            icon="ti-eye-off"
            label="Manage Safe Mode visibility"
            sub="Choose what stays hidden in Safe Mode"
            onPress={() => navigation.navigate('SafeModeSettings')}
            trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
          />
          <Row
            icon="ti-hash"
            label="Manage tags"
            sub="Set aside tags from your daily living total"
            onPress={() => navigation.navigate('ManageTags')}
            trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
          />

          {/* Security */}
          <SectionLabel>Security</SectionLabel>
          <Row
            icon="ti-lock"
            label="Change PIN"
            onPress={() => navigation.navigate('ChangePin')}
            trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
          />
          <Row
            icon="ti-key"
            label="Change passphrase"
            onPress={() => navigation.navigate('ChangePassphrase')}
            trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
          />
          <Row
            icon="ti-lock-square"
            label="Lock when backgrounded"
            sub="Require unlock on return"
            trailing={
              <Toggle
                value={lockOnBackground}
                onChange={setLockOnBackground}
                accessibilityLabel="Lock when backgrounded"
              />
            }
          />

          {/* Data & activity */}
          <SectionLabel>Data &amp; activity</SectionLabel>
          <Row
            icon="ti-history"
            label="Timeline"
            sub="Activity, undo & restore"
            onPress={() => navigation.navigate('Timeline')}
            trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
          />
          <Row
            icon="ti-database-export"
            label="Backup & Restore"
            onPress={() => navigation.navigate('Backup')}
            trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
          />
          <Row
            icon="ti-message-circle"
            label="Contact & Feedback"
            onPress={() => navigation.navigate('Feedback')}
            trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
          />

          {/* Danger zone */}
          <SectionLabel danger>Danger zone</SectionLabel>
          <Row
            icon="ti-trash-x"
            label={`Erase after ${WIPE_THRESHOLD} failed unlocks`}
            sub="Irreversible — no recovery"
            danger
            trailing={
              <Toggle value={wipeEnabled} onChange={toggleWipe} accessibilityLabel="Erase after failed attempts" />
            }
          />
          {(profile?.demoSeeded || isDemoSeeded()) && (
            <Pressable
              onPress={() => setConfirmExit(true)}
              disabled={exiting}
              className="mt-3 py-3 rounded-xl border items-center"
              style={{ borderColor: theme.danger, opacity: exiting ? 0.4 : 1 }}
            >
              <Text className="text-sm font-bold" style={{ color: theme.danger }}>
                Exit Demo Mode
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <ConfirmDialog
        isOpen={confirmExit}
        onClose={() => setConfirmExit(false)}
        onConfirm={() => void handleExitDemoMode()}
        title="Ready to make it yours?"
        message="We'll clear this sample data and walk you through setting up your real account — your accounts, a few personal details, and your own PIN and passphrase."
        confirmLabel="Continue"
        cancelLabel="Not yet"
        confirmVariant="primary"
        loading={exiting}
      />
    </SafeAreaView>
  );
}
