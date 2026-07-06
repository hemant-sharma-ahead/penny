import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Button, Toggle, ConfirmDialog } from '@/components/ui';
import { useProfile } from '@/hooks/useProfile';
import {
  useSettings,
  OPEN_MODE_DURATIONS,
  type FontScale,
  type ModuleVisibility,
  type Theme
} from '@/context/SettingsContext';
import { type PersistedPrivacyMode } from '@/context/PrivacyContext';
import { wipeDemoData, isDemoSeeded } from '@/core/db/seedDemoData';
import { getWipeAfterAttempts, setWipeAfterAttempts, WIPE_THRESHOLD } from '@/core/crypto/securityManager';
import { PATHS } from '@/router/paths';

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

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'blue', label: 'Penny Blue' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
];

const FONT_SCALES: { value: FontScale; label: string; px: number }[] = [
  { value: 'small', label: 'S', px: 12 },
  { value: 'default', label: 'A', px: 16 },
  { value: 'large', label: 'A+', px: 20 },
  { value: 'xl', label: 'A++', px: 24 }
];

// Icons + colours mirror the header's PrivacyModeSwitcher — keep the two in sync. Open is deliberately
// excluded here — it can never be a persisted default, only a temporary elevation (see PrivacyContext).
const PRIVACY_MODES: { mode: PersistedPrivacyMode; label: string; icon: string; color: string }[] = [
  { mode: 'safe', label: 'Safe', icon: 'ti-eye-off', color: 'var(--color-safe)' },
  { mode: 'privacy', label: 'Private', icon: 'ti-shield-lock', color: 'var(--color-privacy)' }
];

/** Miniature palette preview for a theme swatch (brand palette = domain data, kept inline). */
function ThemePreview({ theme }: { theme: Theme }) {
  const styles: Record<Theme, { bg: string; bar: string; ln: string }> = {
    light: { bg: '#ffffff', bar: '#00a86b', ln: '#e2e8f0' },
    blue: { bg: '#1F3864', bar: '#6ea8fe', ln: '#3b5488' },
    dark: { bg: '#0b1220', bar: '#00c47e', ln: '#243247' },
    system: { bg: 'linear-gradient(135deg,#fff 50%,#0b1220 50%)', bar: '#00a86b', ln: '#94a3b8' }
  };
  const s = styles[theme];
  return (
    <div
      className="h-10 rounded-lg overflow-hidden mb-1.5"
      style={{ background: s.bg, border: theme === 'light' ? '1px solid var(--color-border)' : 'none' }}
    >
      <div className="h-1.5 rounded-sm mx-1.5 mt-1.5" style={{ background: s.bar }} />
      <div className="h-1 rounded-sm mx-1.5 mt-1" style={{ background: s.ln }} />
      <div className="h-1 rounded-sm mx-1.5 mt-0.5" style={{ background: s.ln, width: '60%' }} />
    </div>
  );
}

function SectionLabel({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-wide mt-6 mb-2 ${danger ? 'text-danger' : 'text-tertiary'}`}
    >
      {children}
    </p>
  );
}

/** A borderless flat row (Option B): lead icon + label(+sub) + trailing control. */
function Row({
  icon,
  label,
  sub,
  trailing,
  onClick,
  danger
}: {
  icon: string;
  label: string;
  sub?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const inner = (
    <>
      <i
        className={`ti ${icon} w-6 text-center flex-shrink-0`}
        style={{ fontSize: 19, color: danger ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-medium ${danger ? 'text-danger' : 'text-primary'}`}>{label}</span>
        {sub && <span className="block text-[11px] text-tertiary">{sub}</span>}
      </span>
      {trailing}
    </>
  );
  const cls = 'w-full flex items-center gap-3 py-3.5 border-t border-theme text-left first:border-t-0';
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const {
    modules,
    fontScale,
    theme,
    defaultPrivacyMode,
    openModeDurationMinutes,
    lockOnBackground,
    setModule,
    setFontScale,
    setTheme,
    setDefaultPrivacyMode,
    setOpenModeDurationMinutes,
    setLockOnBackground
  } = useSettings();
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

  // Only ever shown while still on the throwaway Demo Mode vault (see the render guard below) — so
  // this must hand off to the same real-setup sequence as DemoModeBanner's "Exit Demo Mode", not just
  // wipe the data. Otherwise the user is left permanently on the known demo PIN/passphrase with no
  // profile details, having never been asked to set real credentials.
  const handleExitDemoMode = async () => {
    setExiting(true);
    await wipeDemoData();
    navigate(PATHS.onboarding.letUsKnowYou, { state: { fromDemoMode: true } });
  };

  const name = profile?.displayName?.trim() || 'Your account';
  const initial = (profile?.displayName?.trim() || profile?.username || '?').charAt(0).toUpperCase();
  const handleLine = [profile?.username ? `@${profile.username}` : null, profile?.plan === 'free' ? 'Free plan' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Settings"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg hover:text-primary"
            onClick={() => navigate(-1)}
          />
        }
      />

      <div className="px-4 pb-8">
        {/* Profile hero */}
        <button
          type="button"
          onClick={() => navigate(PATHS.app.profile)}
          className="w-full flex items-center gap-3 py-4 text-left"
        >
          <span
            className="w-14 h-14 rounded-full grid place-items-center text-white text-xl font-bold flex-shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), #00c47e)' }}
          >
            {profile?.avatarDataUrl ? (
              <img src={profile.avatarDataUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-lg font-bold text-primary truncate">{name}</span>
            {handleLine && <span className="block text-xs text-secondary">{handleLine}</span>}
          </span>
          <span
            className="text-xs font-semibold rounded-full px-3 py-1.5 border"
            style={{
              color: 'var(--color-primary)',
              borderColor: 'color-mix(in srgb, var(--color-primary) 40%, transparent)'
            }}
          >
            Edit
          </span>
        </button>

        {/* Modules */}
        <SectionLabel>Modules</SectionLabel>
        <div className="grid grid-cols-5 gap-2.5">
          {MODULES.map((m) => {
            const on = modules[m.key];
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setModule(m.key, !on)}
                aria-pressed={on}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className="w-12 h-12 rounded-2xl grid place-items-center border transition-colors"
                  style={
                    on
                      ? { backgroundColor: m.color, color: '#fff', borderColor: m.color }
                      : {
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-tertiary)',
                          borderColor: 'var(--color-border)'
                        }
                  }
                >
                  <i className={`ti ${m.icon}`} style={{ fontSize: 20 }} aria-hidden="true" />
                </span>
                <span
                  className={`text-[9px] font-medium text-center leading-tight ${on ? 'text-secondary' : 'text-tertiary'}`}
                >
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-tertiary mt-2.5">Tap to show / hide. Home, Expenses &amp; Chip are always on.</p>

        {/* Appearance */}
        <SectionLabel>Appearance · Theme</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((t) => {
            const on = theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTheme(t.value)}
                className="rounded-xl border p-1.5 text-center transition-colors"
                style={{
                  borderColor: on ? 'var(--color-primary)' : 'var(--color-border)',
                  boxShadow: on ? '0 0 0 3px color-mix(in srgb, var(--color-primary) 14%, transparent)' : 'none'
                }}
              >
                <ThemePreview theme={t.value} />
                <span className={`text-[9.5px] font-bold ${on ? 'text-primary' : 'text-secondary'}`}>{t.label}</span>
              </button>
            );
          })}
        </div>

        <SectionLabel>Text size</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {FONT_SCALES.map((s) => {
            const on = fontScale === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setFontScale(s.value)}
                className="rounded-xl border flex flex-col items-center justify-end gap-1 transition-colors"
                style={{
                  height: 56,
                  paddingBottom: 6,
                  borderColor: on ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: on ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
                  color: on ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                }}
              >
                <span className="font-extrabold leading-none" style={{ fontSize: s.px }}>
                  Aa
                </span>
                <span className="text-[9px] font-bold text-tertiary">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Privacy */}
        <SectionLabel>Privacy</SectionLabel>
        <p className="text-xs text-secondary mb-2">Default mode when the app opens</p>
        <div className="flex gap-2">
          {PRIVACY_MODES.map(({ mode, label, icon, color }) => {
            const on = defaultPrivacyMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setDefaultPrivacyMode(mode)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5"
                style={
                  on
                    ? { backgroundColor: color, color: '#fff', borderColor: color }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                }
              >
                <i className={`ti ${icon}`} style={{ fontSize: 16 }} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-secondary mt-4 mb-2">
          Open mode duration — how long "Open" lasts before it auto-reverts. Open is never a starting state; it's always
          a temporary switch (from the header) that resets on its own, on backgrounding, or on relaunch.
        </p>
        <div className="flex gap-1.5">
          {OPEN_MODE_DURATIONS.map((minutes) => {
            const on = openModeDurationMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                onClick={() => setOpenModeDurationMinutes(minutes)}
                className="flex-1 py-2 rounded-xl text-xs font-bold border transition-colors"
                style={
                  on
                    ? { backgroundColor: 'var(--color-open)', color: '#fff', borderColor: 'var(--color-open)' }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                }
              >
                {minutes}m
              </button>
            );
          })}
        </div>

        <Row
          icon="ti-eye-off"
          label="Manage Safe Mode visibility"
          sub="Choose what stays hidden in Safe Mode"
          onClick={() => navigate(PATHS.app.safeMode)}
          trailing={<Chevron />}
        />

        {/* Security */}
        <SectionLabel>Security</SectionLabel>
        <Row icon="ti-lock" label="Change PIN" onClick={() => navigate(PATHS.app.changePin)} trailing={<Chevron />} />
        <Row
          icon="ti-key"
          label="Change passphrase"
          onClick={() => navigate(PATHS.app.changePassphrase)}
          trailing={<Chevron />}
        />
        <Row
          icon="ti-lock-square"
          label="Lock when backgrounded"
          sub="Require unlock on return"
          trailing={
            <Toggle value={lockOnBackground} onChange={setLockOnBackground} aria-label="Lock when backgrounded" />
          }
        />

        {/* Data & activity */}
        <SectionLabel>Data &amp; activity</SectionLabel>
        <Row
          icon="ti-history"
          label="Timeline"
          sub="Activity, undo & restore"
          onClick={() => navigate(PATHS.app.timeline)}
          trailing={<Chevron />}
        />
        <Row
          icon="ti-database-export"
          label="Backup & Restore"
          onClick={() => navigate(PATHS.app.backup)}
          trailing={<Chevron />}
        />
        <Row
          icon="ti-message-circle"
          label="Contact & Feedback"
          onClick={() => navigate(PATHS.app.feedback)}
          trailing={<Chevron />}
        />

        {/* Danger zone */}
        <SectionLabel danger>Danger zone</SectionLabel>
        <Row
          icon="ti-trash-x"
          label={`Erase after ${WIPE_THRESHOLD} failed unlocks`}
          sub="Irreversible — no recovery"
          danger
          trailing={<Toggle value={wipeEnabled} onChange={toggleWipe} aria-label="Erase after failed attempts" />}
        />
        {(profile?.demoSeeded || isDemoSeeded()) && (
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            disabled={exiting}
            className="w-full mt-3 py-3 rounded-xl text-sm font-bold border transition-colors disabled:opacity-40"
            style={{ backgroundColor: 'transparent', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
          >
            Exit Demo Mode
          </button>
        )}
      </div>

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
    </div>
  );
}

function Chevron() {
  return <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 17 }} aria-hidden="true" />;
}
