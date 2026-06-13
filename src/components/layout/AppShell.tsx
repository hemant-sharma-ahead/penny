import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsDrawer } from './SettingsDrawer';
import { PrivacyBadge } from '@/components/privacy/PrivacyBadge';
import { PennyWordmark } from '@/components/ui/PennyLogo';

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen flex justify-center bg-slate-100">
      <div className="relative w-full max-w-[430px] min-h-screen bg-white shadow-xl flex flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 -ml-1"
              aria-label="Open settings"
            >
              <i className="ti ti-menu-2" style={{ fontSize: 20 }} aria-hidden="true" />
            </button>
            <PennyWordmark height={24} />
          </div>
          <PrivacyBadge />
        </header>

        {/* Page content — scrollable, padded above bottom nav */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          <Outlet />
        </main>

        <BottomNav />
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
