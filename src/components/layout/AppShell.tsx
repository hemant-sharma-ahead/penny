import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsDrawer } from './SettingsDrawer';
import { PrivacyModeSwitcher } from '@/components/privacy/PrivacyModeSwitcher';
import { PennyWordmark } from '@/components/ui/PennyLogo';

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen flex justify-center" style={{ backgroundColor: 'var(--color-mode-bg, #f8fafc)' }}>
      <div
        className="relative w-full max-w-[430px] min-h-screen shadow-xl flex flex-col"
        style={{ backgroundColor: 'var(--color-mode-bg, #f8fafc)' }}
      >
        {/* Header — tinted bg + 2px solid mode-color bottom border */}
        <header
          className="flex items-center justify-between px-4 py-3 sticky top-0 z-40 transition-colors duration-300"
          style={{
            backgroundColor: 'var(--color-mode-header-bg, #ffffff)',
            borderBottom: '2px solid var(--color-mode-accent, #00a86b)'
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 -ml-1 flex-shrink-0"
              aria-label="Open settings"
            >
              <i className="ti ti-menu-2" style={{ fontSize: 20 }} aria-hidden="true" />
            </button>
            <PennyWordmark height={24} />
          </div>
          <PrivacyModeSwitcher />
        </header>

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

        <BottomNav />
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
