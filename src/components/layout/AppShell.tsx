import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { PrivacyModeSwitcher } from '@/components/privacy/PrivacyModeSwitcher';
import { RemindersBell } from '@/components/reminders/RemindersBell';
import { DemoModeBanner } from '@/components/demo/DemoModeBanner';
import { PennyWordmark } from '@/components/ui/PennyLogo';
import { SyncProvider } from '@/core/sync/SyncProvider';
import { GroupProvider } from '@/context/GroupContext';
import { ContextSwitcher } from '@/features/groups/ContextSwitcher';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { PATHS } from '@/router/paths';

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  // Forced PIN reset (reached via SessionGate's "Forgot PIN?" after exhausting attempts) must be
  // genuinely non-dismissible — hide the two chrome elements that would otherwise let someone
  // navigate away without finishing it. ChangePinPage itself blocks the browser back button.
  const pinResetForced =
    location.pathname === PATHS.app.changePin &&
    !!(location.state as { forcedPinReset?: boolean } | null)?.forcedPinReset;

  return (
    <SyncProvider>
      <GroupProvider>
        <div className="min-h-screen flex justify-center" style={{ backgroundColor: 'var(--color-mode-bg, #f8fafc)' }}>
          <div
            className="relative w-full max-w-[430px] min-h-screen shadow-xl flex flex-col"
            style={{ backgroundColor: 'var(--color-mode-bg, #f8fafc)' }}
          >
            {!pinResetForced && <DemoModeBanner />}

            {/* Header — tinted bg + 2px solid mode-color bottom border */}
            <header
              className="flex items-center justify-between px-4 py-3 sticky top-0 z-40 transition-colors duration-300"
              style={{
                backgroundColor: 'var(--color-mode-header-bg, #ffffff)',
                borderBottom: '2px solid var(--color-mode-accent, #00a86b)'
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                {!pinResetForced && (
                  <button
                    onClick={() => navigate(PATHS.app.settings)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 -ml-1 flex-shrink-0"
                    aria-label="Open settings"
                  >
                    <i className="ti ti-menu-2" style={{ fontSize: 20 }} aria-hidden="true" />
                  </button>
                )}
                <PennyWordmark height={24} />
              </div>
              <div className="flex items-center gap-1">
                <PrivacyModeSwitcher />
                <RemindersBell />
              </div>
            </header>

            {/* Context bar (Personal / group switcher) — dark until the `sync` entitlement is on */}
            {hasEntitlement('sync') && <ContextSwitcher />}

            {/* Page content — tinted background so cards pop off it */}
            <main
              className="flex-1 overflow-y-auto transition-colors duration-300"
              style={{
                backgroundColor: 'var(--color-mode-bg, #f8fafc)',
                paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))'
              }}
            >
              <Outlet />
            </main>

            {!pinResetForced && <BottomNav />}
          </div>
        </div>
      </GroupProvider>
    </SyncProvider>
  );
}
