import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { PrivacyBadge } from '@/components/privacy/PrivacyBadge';

export function AppShell() {
  return (
    <div className="min-h-screen flex justify-center bg-slate-100">
      <div className="relative w-full max-w-[430px] min-h-screen bg-white shadow-xl flex flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 sticky top-0 z-40">
          <span className="text-lg font-semibold text-slate-800">Penny</span>
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
    </div>
  );
}
