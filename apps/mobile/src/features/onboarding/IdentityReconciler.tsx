import { useEffect, useState, type ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { claimAccount, getClaimState, UsernameTakenError } from '@/core/identity/claim';
import { signedFetch } from '@/core/identity/signedFetch';
import { getItem, removeItem } from '~/lib/storage';
import { RECONCILE_FLAG } from './AccountRecoveryScreen';
import { ChooseHandleScreen } from './ChooseHandleScreen';

/**
 * Post-restore identity reconciliation (Track F). Runs once after a restore (flagged by RECONCILE_FLAG),
 * now that the vault is unlocked and signed requests are possible. If the restored account is still on the
 * server, nothing happens. If it was deregistered (erase-all before this reinstall), we re-register the
 * restored identity; if the old handle was taken in the meantime, we surface ChooseHandleScreen (④) to
 * pick a new one. All restored data + keys are untouched — only the public handle may change.
 *
 * Platform note vs. web: the `pending` flag is read synchronously from `localStorage` there; `~/lib/
 * storage`'s AsyncStorage-backed equivalent is async, so this starts in `checking` state unconditionally
 * and reads the flag inside the effect instead of at render time.
 */
export function IdentityReconciler({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'checking' | 'done' | 'needs_handle'>('checking');
  const [oldHandle, setOldHandle] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = (await getItem(RECONCILE_FLAG)) === '1';
      await removeItem(RECONCILE_FLAG);
      if (!pending) {
        if (!cancelled) setPhase('done');
        return;
      }
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
  }, []);

  if (phase === 'checking') {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tertiary">
        <ActivityIndicator size="large" color="#00a86b" />
      </View>
    );
  }
  if (phase === 'needs_handle') {
    return <ChooseHandleScreen oldHandle={oldHandle} onDone={() => setPhase('done')} />;
  }
  return <>{children}</>;
}
