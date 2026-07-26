import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ui';
import { useProfile } from '@/hooks/useProfile';
import { wipeDemoData } from '@/core/db/seedDemoData';
import { PATHS } from '@/router/paths';

/**
 * Persistent strip shown for as long as the vault is a throwaway Demo Mode one (profile.demoSeeded).
 * "Exit Demo Mode" wipes the sample data and hands off to the real-setup flow (Let us know you →
 * Life & household → Accounts → Backup → real vault), which re-keys the vault via exitDemoMode().
 */
export function DemoModeBanner() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [exiting, setExiting] = useState(false);

  if (!profile?.demoSeeded) return null;

  async function handleExit() {
    setExiting(true);
    await wipeDemoData();
    navigate(PATHS.onboarding.letUsKnowYou, { state: { fromDemoMode: true } });
  }

  return (
    <>
      <div
        className="flex items-center gap-2 px-4 py-2 text-white flex-shrink-0"
        style={{ background: 'linear-gradient(90deg, #7c3aed, #9333ea)' }}
      >
        <i className="ti ti-flask" style={{ fontSize: 12 }} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold leading-tight">Demo Mode</p>
          <p className="text-[10px] opacity-85 leading-tight">Exploring with sample data</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[10px] font-bold rounded-lg px-2.5 py-1.5 flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
        >
          Exit Demo Mode
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void handleExit()}
        title="Ready to make it yours?"
        message="We'll clear this sample data and walk you through setting up your real account — your accounts, a few personal details, and your own PIN and passphrase."
        confirmLabel="Continue"
        cancelLabel="Not yet"
        confirmVariant="primary"
        loading={exiting}
      />
    </>
  );
}
