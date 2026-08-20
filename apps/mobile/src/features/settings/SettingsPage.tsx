import { useEffect, useState, type ReactNode } from 'react';
import { View, Pressable, Image, ScrollView, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Toggle, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { useProfile } from '@/hooks/useProfile';
import { useSettings, type FontScale } from '~/context/SettingsContext';
import { type PersistedPrivacyMode } from '~/context/PrivacyContext';
import { useTheme, type ThemePreference } from '~/theme/ThemeProvider';
import { useToast } from '~/context/ToastContext';
import { wipeDemoData, isDemoSeeded } from '@/core/db/seedDemoData';
import { getWipeAfterAttempts, setWipeAfterAttempts, WIPE_THRESHOLD } from '@/core/crypto/securityManager';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';

/**
 * RN port of apps/web-react/src/features/settings/SettingsPage.tsx. Deviations from the web version:
 * - Theme picker restored, driving mobile's own `ThemeProvider` (Track 3) instead of web's
 *   `SettingsContext`-owned `theme`/`data-theme` — swatch-preview grid, translated to `Pressable`+`View`
 *   swatches instead of web's `<button>`/CSS. 3 choices (Light/Dark/System) as of 2026-07-31 — Penny
 *   Blue was removed as a selectable theme (see `ThemeProvider.tsx`'s migration note).
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
 * - **2026-08-01 Calculators relocation**: the "Modules" section (Portfolio/Goals tab-hide toggles +
 *   Calc's Home-tile toggle) was removed entirely — Portfolio/Goals are now always-on tabs
 *   (`MainTabs.tsx`), and Calc's toggle became meaningless once Calculators moved out of Home into
 *   contextual entry points across Tax Awareness/Portfolio/Goals (see `docs/ARCHITECTURE.md`).
 * - **2026-08-01 redesign**: flat hairline-divided rows → `bg-surface` rounded cards (the "Grouped
 *   cards + section labels" pattern `docs/DESIGN_GUIDELINES.md` already described but this screen never
 *   actually built), one accent colour per section instead of uniform gray icons, and reordered so the
 *   most-touched controls (Privacy default/Safe Mode visibility/Manage tags/Timeline) sit in a
 *   "Frequent" group right after Profile — Appearance (set-and-forget) moved down. A glanceable,
 *   display-only status-pill strip (Privacy/Theme/PIN) sits under Profile — no `onPress` at all, not a
 *   shortcut, just a summary; every real control is still the same short scroll below it. Approved via
 *   `docs/mockups/proposals/settings-redesign-v2.html` after two rounds — see that file's legend for the
 *   full rationale and what changed between v1/v2 (mockup review flagged: no popups from the pill row,
 *   Theme and Text Size stay two separate rows not one, nothing dropped from the real screen).
 * - **2026-08-01 Appearance follow-up**: the Theme/Text Size rows in the redesign above still rendered
 *   as their v2-mockup form (a live-palette swatch grid + a 4-box "Aa" grid) — on-device review found
 *   that busy/dated next to the rest of the card. Replaced with a single compact row each (icon + current
 *   value + an inline `CompactSegmentedControl`), per "Option 3" of
 *   `docs/mockups/proposals/settings-appearance-refresh-v1.html` — a live-theme-preview swatch grid and
 *   an iOS-style text-size slider were both mocked up and passed over for this denser, plainer option.
 *   `ThemePreview` (the mini rendered-palette swatch) was deleted, since nothing renders it anymore.
 */

const THEMES: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'ti-sun' },
  { value: 'dark', label: 'Dark', icon: 'ti-moon' },
  { value: 'system', label: 'System', icon: 'ti-device-desktop' }
];

const FONT_SCALES: { value: FontScale; label: string; px: number }[] = [
  { value: 'small', label: 'S', px: 12 },
  { value: 'default', label: 'A', px: 16 },
  { value: 'large', label: 'A+', px: 20 },
  { value: 'xl', label: 'A++', px: 24 }
];

/** Friendlier text for the Text size row's current-value sub-label — `FONT_SCALES`' own `label` field
 *  stays the short "S/A/A+/A++" used on the compact segmented control itself. */
const FONT_SCALE_NAMES: Record<FontScale, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
  xl: 'Extra large'
};

/** One accent colour per section (not per row) — reused by that section's `Row` icons
 *  *and* the matching status pill above, so the pill visually cross-references where its control lives.
 *  Decorative variety per-row would fight "colour is wayfinding, not decoration" (`DESIGN_GUIDELINES.md`
 *  §1) since these rows don't carry distinct app-wide meaning the way, say, income/expense colours do. */
function useSectionColors() {
  const theme = useThemeColors();
  return { frequent: theme.warning, security: theme.privacy, appearance: theme.info, data: theme.neutral };
}

// Icons + colours mirror the header's PrivacyModeSwitcher — keep the two in sync. Open is deliberately
// excluded — it can never be a persisted default, only a temporary elevation (see PrivacyContext).
// 2026-08-18: Private mode was removed app-wide, so the persisted default is always 'safe' now — this
// still returns a (single-item) list rather than a hardcoded object so the `StatusPill` lookup below
// didn't need reshaping.
function usePrivacyModes(): { mode: PersistedPrivacyMode; label: string; icon: string; color: string }[] {
  const theme = useThemeColors();
  return [{ mode: 'safe', label: 'Safe', icon: 'ti-eye-off', color: theme.warning }];
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

/** A `bg-surface` rounded card grouping `Row` children — the "Grouped cards + section
 *  labels" pattern from `docs/DESIGN_GUIDELINES.md` §3. */
function Card({ children, borderColor }: { children: ReactNode; borderColor?: string }) {
  const theme = useThemeColors();
  return (
    <View
      className="rounded-2xl overflow-hidden border"
      style={{ backgroundColor: theme.surface, borderColor: borderColor ?? theme.border }}
    >
      {children}
    </View>
  );
}

function Row({
  icon,
  color,
  label,
  sub,
  trailing,
  onPress,
  danger,
  first
}: {
  icon: string;
  /** Icon badge accent — defaults to the section's shared colour via caller; ignored (→ danger red)
   *  when `danger` is set. */
  color?: string;
  label: string;
  sub?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  /** First row in its `Card` — skips the top divider so it doesn't double up with the card's own border. */
  first?: boolean;
}) {
  const theme = useThemeColors();
  const badgeColor = danger ? theme.danger : (color ?? theme.textSecondary);
  const inner = (
    <>
      <View
        className="w-8 h-8 rounded-lg items-center justify-center shrink-0"
        style={{ backgroundColor: tint(badgeColor, 10) }}
      >
        <Icon name={icon} size={16} color={badgeColor} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-medium" style={{ color: danger ? theme.danger : theme.textPrimary }}>
          {label}
        </Text>
        {sub && <Text className="text-[11px] text-tertiary">{sub}</Text>}
      </View>
      {trailing}
    </>
  );
  const cls = `flex-row items-center gap-3 py-3 px-3 ${first ? '' : 'border-t border-theme'}`;
  return onPress ? (
    <Pressable onPress={onPress} className={cls}>
      {inner}
    </Pressable>
  ) : (
    <View className={cls}>{inner}</View>
  );
}

/** Display-only summary chip — deliberately has no `onPress`. It's a glance at current state (Privacy/
 *  Theme/PIN), not a shortcut; the real controls are the short scroll immediately below. Reviewed and
 *  confirmed via mockup: adding a tap action here would read as a hidden shortcut/popup, which is
 *  exactly what this redesign was asked to avoid. */
function StatusPill({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  const theme = useThemeColors();
  return (
    <View
      className="flex-1 rounded-xl border items-center py-2.5"
      style={{ borderColor: theme.border, backgroundColor: theme.surface }}
    >
      <View
        className="w-6 h-6 rounded-lg items-center justify-center mb-1"
        style={{ backgroundColor: tint(color, 10) }}
      >
        <Icon name={icon} size={13} color={color} />
      </View>
      <Text className="text-[8px] font-bold uppercase tracking-wide text-tertiary">{label}</Text>
      <Text className="text-[11px] font-bold text-primary mt-0.5">{value}</Text>
    </View>
  );
}

/** A compact inline segmented control for a `Row`'s `trailing` slot (Theme/Text size) — icon-only or
 *  short-label segments in a fixed-width pill, filled `theme.primary` on the active one. Mockup-approved
 *  ("Option 3 — single compact rows", `settings-appearance-refresh-v1.html`) over redrawing a live theme
 *  preview or a slider: collapses Theme/Text size to one row each instead of their own multi-line block. */
function CompactSegmentedControl<T extends string>({
  options,
  value,
  onChange
}: {
  options: { value: T; icon?: string; label?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useThemeColors();
  return (
    <View className="flex-row bg-surface-2 rounded-xl p-1 gap-0.5" style={{ width: 152 }}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className="flex-1 items-center justify-center py-1.5 rounded-lg"
            style={{ backgroundColor: on ? theme.primary : 'transparent' }}
          >
            {opt.icon && <Icon name={opt.icon} size={13} color={on ? '#fff' : theme.textSecondary} />}
            {opt.label && (
              <Text className="text-[8.5px] font-bold" style={{ color: on ? '#fff' : theme.textSecondary }}>
                {opt.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsPage() {
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const theme = useThemeColors();
  const sectionColor = useSectionColors();
  const { profile } = useProfile();
  const { fontScale, lockOnBackground, setFontScale, setLockOnBackground } = useSettings();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const { showToast } = useToast();
  const privacyModes = usePrivacyModes();
  const [wipeEnabled, setWipeEnabled] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  useDefaultHeaderBack('Settings');

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

  const activePrivacyMode = privacyModes[0];
  const activeTheme = THEMES.find((t) => t.value === themePreference) ?? THEMES[0];

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
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

          {/* Exit Demo Mode — right below the profile, not styled as a destructive/danger action (it
           *  isn't one — it's "leave demo mode", not "delete your data"). Same violet as the global
           *  DemoModeBanner strip (MainTabs.tsx), which this screen intentionally doesn't show its own
           *  copy of — see docs/mockups/proposals/demo-mode-banner-v1.html. */}
          {(profile?.demoSeeded || isDemoSeeded()) && (
            <Pressable onPress={() => setConfirmExit(true)} disabled={exiting} className="mb-3">
              <LinearGradient
                colors={['#7c3aed', '#9333ea']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: exiting ? 0.4 : 1 }}
              >
                <Text className="text-sm font-bold text-white">Exit Demo Mode</Text>
              </LinearGradient>
            </Pressable>
          )}

          {/* Status strip — display-only, deliberately not pressable (see StatusPill's doc comment) */}
          <View className="flex-row gap-2 mb-1">
            <StatusPill
              icon={activePrivacyMode.icon}
              color={activePrivacyMode.color}
              label="Privacy"
              value={activePrivacyMode.label}
            />
            <StatusPill
              icon={activeTheme.icon}
              color={sectionColor.appearance}
              label="Theme"
              value={activeTheme.label}
            />
            <StatusPill icon="ti-lock" color={sectionColor.security} label="PIN" value="Set" />
          </View>

          {/* Frequent — the controls you actually touch often, right after Profile */}
          <SectionLabel>Frequent</SectionLabel>
          <Card>
            {/* 2026-08-18: the default-privacy-mode picker and Open-mode auto-revert-duration picker
             *  were both removed here — Private mode is gone app-wide and the persisted default is
             *  always 'safe' now, and Open mode no longer has a fixed-duration timer to configure (see
             *  PrivacyContext.tsx's doc comment) — only the header's Safe/Open switcher remains. */}
            <Row
              first
              icon="ti-eye-off"
              color={sectionColor.frequent}
              label="Manage Safe Mode visibility"
              sub="Choose what stays hidden in Safe Mode"
              onPress={() => navigation.navigate('SafeModeSettings')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
            <Row
              icon="ti-hash"
              color={sectionColor.frequent}
              label="Manage tags"
              sub="Set aside tags from your daily living total"
              onPress={() => navigation.navigate('ManageTags')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
            <Row
              icon="ti-history"
              color={sectionColor.frequent}
              label="Timeline"
              sub="Activity, undo & restore"
              onPress={() => navigation.navigate('Timeline')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
          </Card>

          {/* Security */}
          <SectionLabel>Security</SectionLabel>
          <Card>
            <Row
              first
              icon="ti-lock"
              color={sectionColor.security}
              label="Change PIN"
              onPress={() => navigation.navigate('ChangePin')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
            <Row
              icon="ti-key"
              color={sectionColor.security}
              label="Change passphrase"
              onPress={() => navigation.navigate('ChangePassphrase')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
            <Row
              icon="ti-lock-square"
              color={sectionColor.security}
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
          </Card>

          {/* Appearance — set-and-forget, so it moved down from directly-under-Profile. Theme/Text size
              collapsed to one compact row each (2026-08-01, "Option 3" of settings-appearance-refresh-v1.html)
              — a live-palette-preview swatch grid and a slider were both considered and passed over in
              favour of this denser, plainer treatment. */}
          <SectionLabel>Appearance</SectionLabel>
          <Card>
            <Row
              first
              icon={activeTheme.icon}
              color={sectionColor.appearance}
              label="Theme"
              sub={activeTheme.label}
              trailing={
                <CompactSegmentedControl
                  options={THEMES.map((t) => ({ value: t.value, icon: t.icon }))}
                  value={themePreference}
                  onChange={setThemePreference}
                />
              }
            />
            <Row
              icon="ti-text-size"
              color={sectionColor.appearance}
              label="Text size"
              sub={FONT_SCALE_NAMES[fontScale]}
              trailing={
                <CompactSegmentedControl
                  options={FONT_SCALES.map((s) => ({ value: s.value, label: s.label }))}
                  value={fontScale}
                  onChange={setFontScale}
                />
              }
            />
          </Card>

          {/* Data & activity */}
          <SectionLabel>Data &amp; activity</SectionLabel>
          <Card>
            <Row
              first
              icon="ti-database-export"
              color={sectionColor.data}
              label="Backup & Restore"
              onPress={() => navigation.navigate('Backup')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
            <Row
              icon="ti-message-circle"
              color={sectionColor.data}
              label="Contact & Feedback"
              onPress={() => navigation.navigate('Feedback')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
            <Row
              icon="ti-message-2"
              color={sectionColor.data}
              label="SMS Tracking"
              sub="Android — detect bank SMS and turn them into transactions"
              onPress={() => navigation.navigate('SmsTrackingSettings')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
            <Row
              icon="ti-bulb"
              color={sectionColor.data}
              label="Discover Penny"
              sub="Tips and lesser-known things Penny can do"
              onPress={() => navigation.navigate('DiscoverTips')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
            <Row
              icon="ti-info-circle"
              color={sectionColor.data}
              label="About Penny"
              sub="Version, what's new & our privacy promise"
              onPress={() => navigation.navigate('AboutPenny')}
              trailing={<Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />}
            />
          </Card>

          {/* Danger zone */}
          <SectionLabel danger>Danger zone</SectionLabel>
          <Card borderColor={tint(theme.danger, 30)}>
            <Row
              first
              icon="ti-trash-x"
              label={`Erase after ${WIPE_THRESHOLD} failed unlocks`}
              sub="Irreversible — no recovery"
              danger
              trailing={
                <Toggle value={wipeEnabled} onChange={toggleWipe} accessibilityLabel="Erase after failed attempts" />
              }
            />
          </Card>
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
