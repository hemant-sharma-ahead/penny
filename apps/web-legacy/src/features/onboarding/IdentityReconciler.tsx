import { useEffect, useState, type ReactNode } from 'react';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { claimAccount, getClaimState, UsernameTakenError } from '@/core/identity/claim';
import { signedFetch } from '@/core/identity/signedFetch';
import { RECONCILE_FLAG } from './AccountRecoveryScreen';
import { ChooseHandleScreen } from './ChooseHandleScreen';

/**
 * Post-restore identity reconciliation (Track F). Runs once after a restore (flagged by RECONCILE_FLAG),
 * now that the vault is unlocked and signed requests are possible. If the restored account is still on the
 * server, nothing happens. If it was deregistered (erase-all before this reinstall), we re-register the
 * restored identity; if the old handle was taken in the meantime, we surface ChooseHandleScreen (④) to
 * pick a new one. All restored data + keys are untouched — only the public handle may change.
 */
export function IdentityReconciler({ children }: { children: ReactNode }) {
  const pending = typeof localStorage !== 'undefined' && localStorage.getItem(RECONCILE_FLAG) === '1';
  const [phase, setPhase] = useState<'checking' | 'done' | 'needs_handle'>(pending ? 'checking' : 'done');
  const [oldHandle, setOldHandle] = useState('');

  useEffect(() => {
    if (phase !== 'checking') return;
    let cancelled = false;
    (async () => {
      localStorage.removeItem(RECONCILE_FLAG);
      try {
        if (!hasEntitlement('sync')) return;
        const claim = await getClaimState();
        if (!claim.claimed || !claim.username) return;
        // Still registered? Then the restore was into a live account — nothing to do.
        const who = await signedFetch('/whoami').catch(() => null);
        if (who?.ok) return;
        // Account is gone (deregistered). Re-register the restored identity under the same handle.
        try {
          await claimAccount(claim.username);
        } catch (err) {
          if (err instanceof UsernameTakenError) {
            if (!cancelled) {
              setOldHandle(claim.username);
              setPhase('needs_handle');
            }
            return;
          }
          // Any other failure: don't block the app — the user can re-claim later from Profile.
        }
      } finally {
        if (!cancelled) setPhase((p) => (p === 'needs_handle' ? p : 'done'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (phase === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-3">
        <div className="w-8 h-8 border-2 border-[#00a86b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (phase === 'needs_handle') {
    return <ChooseHandleScreen oldHandle={oldHandle} onDone={() => setPhase('done')} />;
  }
  return <>{children}</>;
}
