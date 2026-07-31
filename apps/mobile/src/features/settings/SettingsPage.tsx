import { useEffect, useState, type ReactNode } from 'react';
import { View, Pressable, Image, ScrollView, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { PageHeader, Toggle, ConfirmDialog } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { useProfile } from '@/hooks/useProfile';
import { useSettings, OPEN_MODE_DURATIONS, type ModuleVisibility, type FontScale } from '~/context/SettingsContext';
import { type PersistedPrivacyMode } from '~/context/PrivacyContext';
import { useTheme, type ThemePreference } from '~/theme/ThemeProvider';
import { useToast } from '~/context/ToastContext';
import { wipeDemoData, isDemoSeeded } from '@/core/db/seedDemoData';
import { getWipeAfterAttempts, setWipeAfterAttempts, WIPE_THRESHOLD } from '@/core/crypto/securityManager';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

/**
 * RN port of apps/web-react/src/features/settings/SettingsPage.tsx. Deviations from the web version:
 * - Theme picker restored, driving mobile's own `ThemeProvider` (Track 3) instead of web's
 *   `SettingsContext`-owned `theme`/`data-theme` — same 4 choices (Light/Penny Blue/Dark/System), same
 *   swatch-preview grid, translated to `Pressable`+`View` swatches instead of web's `<button>`/CSS.
 * - Font-size picker restored (`FontScale`, ported into mobile's own `SettingsContext.tsx` this pass) —
 *   the persisted preference is real and this screen's `Aa` grid drives it, and (2026-07-26) now applies
 *   app-wide via `~/components/AppText.tsx` — see that file and `~/theme/fontScale.ts` for how (a
 *   NativeWind `cssInterop`-registered `Text` wrapper, swapped in everywhere via a scripted codemod, not
 *   a hand migration).
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

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'pennyBlue', label: 'Penny Blue' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
];

const FONT_SCALES: { value: FontScale; label: string; px: number }[] = [
  { value: 'small', label: 'S', px: 12 },
  { value: 'default', label: 'A', px: 16 },
  { value: 'large', label: 'A+', px: 20 },
  { value: 'xl', label: 'A++', px: 24 }
];

/** Miniature palette preview for a theme swatch — RN port of web's `ThemePreview` (brand palette =
 *  domain data, kept inline like web's version). */
function ThemePreview({ theme }: { theme: ThemePreference }) {
  const styles: Record<Exclude<ThemePreference, 'system'>, { bg: string; bar: string; ln: string }> = {
    light: { bg: '#ffffff', bar: '#00a86b', ln: '#e2e8f0' },
    pennyBlue: { bg: '#1F3864', bar: '#6ea8fe', ln: '#3b5488' },
    dark: { bg: '#0b1220', bar: '#00c47e', ln: '#243247' }
  };

  // Web's "System" swatch is a 135deg diagonal light/dark split (`linear-gradient(135deg,#fff 50%,
  // #0b1220 50%)`) rather than a flat gray fill — the flat version (found via the 2026-07-25 parity
  // sweep) looked like a fifth, unthemed color instead of "follows OS light/dark". `expo-linear-gradient`
  // (already a dependency, used by Home Stories) reproduces the same diagonal split.
  if (theme === 'system') {
    return (
      <LinearGradient
        colors={['#ffffff', '#ffffff', '#0b1220', '#0b1220']}
        locations={[0, 0.5, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: 40, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}
      >
        <View className="h-1.5 rounded-sm mx-1.5 mt-1.5" style={{ backgroundColor: '#00a86b' }} />
        <View className="h-1 rounded-sm mx-1.5 mt-1" style={{ backgroundColor: '#94a3b8' }} />
        <View className="h-1 rounded-sm mx-1.5 mt-0.5" style={{ backgroundColor: '#94a3b8', width: '60%' }} />
      </LinearGradient>
    );
  }

  const s = styles[theme];
  return (
    <View
      className="h-10 rounded-lg overflow-hidden mb-1.5"
      style={{ backgroundColor: s.bg, borderWidth: theme === 'light' ? 1 : 0, borderColor: '#e2e8f0' }}
    >
      <View className="h-1.5 rounded-sm mx-1.5 mt-1.5" style={{ backgroundColor: s.bar }} />
      <View className="h-1 rounded-sm mx-1.5 mt-1" style={{ backgroundColor: s.ln }} />
      <View className="h-1 rounded-sm mx-1.5 mt-0.5" style={{ backgroundColor: s.ln, width: '60%' }} />
    </View>
  );
}

// Icons + colours mirror the header's PrivacyModeSwitcher — keep the two in sync. Open is deliberately
// excluded — it can never be a persisted default, only a temporary elevation (see PrivacyContext).
function usePrivacyModes(): { mode: PersistedPrivacyMode; label: string; icon: string; color: string }[] {
  const theme = useThemeColors();
  // Same colors `~/components/privacy/PrivacyModeSwitcher.tsx`'s own `MODE` record uses (its header
  // switcher amber/violet/red) — these two previously used unrelated colors (`textSecondary`/`danger`),
  // a mismatch found via the 2026-07-25 parity sweep. `theme.privacy` is real now too (added the same
  // sweep, see tokens.ts) — no more `theme.info` standing in for violet.
  return [
    { mode: 'safe', label: 'Safe', icon: 'ti-eye-off', color: theme.warning },
    { mode: 'privacy', label: 'Private', icon: 'ti-shield-lock', color: theme.privacy }
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
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const theme = useThemeColors();
  const { profile } = useProfile();
  const {
    modules,
    fontScale,
    defaultPrivacyMode,
    openModeDurationMinutes,
    lockOnBackground,
    setModule,
    setFontScale,
    setDefaultPrivacyMode,
    setOpenModeDurationMinutes,
    setLockOnBackground
  } = useSettings();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const { showToast } = useToast();
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
  // off to the real account-start flow (Screen A, `AccountStartScreen`) rather than jumping straight to
  // `LetUsKnowYou` — that was a real bug (found via on-device testing, 2026-07-25): it skipped the
  // mandatory username+claim entry point entirely. Web's own `SettingsPage.tsx` has the same stale
  // `letUsKnowYou`-direct wiring, not yet fixed there either.
  //
  // Wrapped in try/catch/finally (2026-07-25, also found via on-device testing): a failed `wipeDemoData()`
  // used to leave `exiting` stuck at `true` forever, since it was never reset on the throw path — the
  // confirm dialog's "Continue" button stayed disabled/loading with no error shown and no way to retry.
  const handleExitDemoMode = async () => {
    setExiting(true);
    try {
      await wipeDemoData();
      navigation.navigate('OnboardingFlow', { screen: 'Start', params: { fromDemoMode: true } });
    } catch {
      showToast({ message: "Couldn't exit Demo Mode. Please try again." });
    } finally {
      setExiting(false);
      setConfirmExit(false);
    }
  };

  const name = profile?.displayName?.trim() || 'Your account';
  const initial = (profile?.displayName?.trim() || profile?.username || '?').charAt(0).toUpperCase();
  const handleLine = [profile?.username ? `@${profile.username}` : null, profile?.plan === 'free' ? 'Free plan' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader leading={<BackButton />} title="Settings" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4">
          {/* Profile hero */}
          <Pressable onPress={() => navigation.navigate('Profile')} className="flex-row items-center gap-3 py-4">
            {/* Web's `linear-gradient(135deg, var(--color-primary), #00c47e)`, not a flat fill — same
             *  flattened-gradient bug class as the System theme swatch/MoneyStory/demo-data button
             *  (2026-07-25 sweep), missed on this one (found in the 2026-07-26 re-sweep). */}
            <LinearGradient
              colors={[theme.primary, '#00c47e']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}
            >
              {profile?.avatarDataUrl ? (
                <Image source={{ uri: profile.avatarDataUrl }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <Text className="text-white text-xl font-bold">{initial}</Text>
              )}
            </LinearGradient>
            <View className="flex-1 min-w-0">
              <Text className="text-lg font-bold text-primary" numberOfLines={1}>
                {name}
              </Text>
              {handleLine ? <Text className="text-xs text-secondary">{handleLine}</Text> : null}
            </View>
            <View className="rounded-full px-3 py-1.5 border" style={{ borderColor: tint(theme.primary, 40) }}>
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

          {/* Appearance */}
          <SectionLabel>Appearance · Theme</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {THEMES.map((t) => {
              const on = themePreference === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setThemePreference(t.value)}
                  className="rounded-xl border p-1.5"
                  style={{ width: '23%', borderColor: on ? theme.primary : theme.border }}
                >
                  <ThemePreview theme={t.value} />
                  <Text
                    className="text-[9.5px] font-bold text-center"
                    style={{ color: on ? theme.primary : theme.textSecondary }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <SectionLabel>Text size</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {FONT_SCALES.map((s) => {
              const on = fontScale === s.value;
              return (
                <Pressable
                  key={s.value}
                  onPress={() => setFontScale(s.value)}
                  className="rounded-xl border items-center justify-end gap-1"
                  style={{
                    width: '23%',
                    height: 56,
                    paddingBottom: 6,
                    borderColor: on ? theme.primary : theme.border,
                    backgroundColor: on ? tint(theme.primary, 8) : 'transparent'
                  }}
                >
                  <Text
                    className="font-extrabold"
                    style={{ fontSize: s.px, color: on ? theme.primary : theme.textSecondary, lineHeight: s.px }}
                  >
                    Aa
                  </Text>
                  <Text className="text-[9px] font-bold text-tertiary">{s.label}</Text>
                </Pressable>
              );
            })}
          </View>

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
                    // Open mode is a distinct destructive-red risk indicator on web (`var(--color-open)`),
                    // not a plain warning — `theme.open` is the matching token (see PrivacyModeSwitcher.tsx).
                    backgroundColor: on ? theme.open : 'transparent',
                    borderColor: on ? theme.open : theme.border
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
