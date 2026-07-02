import { useEffect, useState } from 'react';
import { Banner, Button, Modal, TextInput } from '@/components/ui';
import { AUTH_BASE } from '@/core/net/apiBase';
import { isValidUsername } from '@/core/profile/username';
import { checkUsername, claimAccount, getClaimState, UsernameTakenError } from '@/core/identity/claim';

// Gated "Account & Sync" entry point (Phase 1.5 Track C). Rendered only when the caller has already
// checked hasEntitlement('sync'), so it's invisible in normal Phase-1 builds. Lets a device claim
// its account (register identity + optional username). Real sync value arrives in Track D.
export function AccountSyncSection() {
  const [state, setState] = useState<{ claimed: boolean; username?: string | undefined } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void getClaimState().then((s) => setState({ claimed: s.claimed, username: s.username }));
  }, []);

  if (!AUTH_BASE) {
    return (
      <SectionShell>
        <p className="text-[11px] text-tertiary">Sync isn't configured for this build.</p>
      </SectionShell>
    );
  }
  if (!state) return null;

  return (
    <SectionShell>
      {state.claimed ? (
        <Banner variant="success">
          ✓ Account claimed{state.username ? ` as @${state.username}` : ''} on this device.
        </Banner>
      ) : (
        <>
          <p className="text-[13px] text-secondary">
            Claim your account to sync across devices and share with your household (coming soon).
          </p>
          <Button variant="primary" size="lg" fullWidth onClick={() => setModalOpen(true)}>
            Claim your account
          </Button>
        </>
      )}
      {modalOpen && (
        <ClaimModal
          onClose={() => setModalOpen(false)}
          onClaimed={(username) => {
            setState({ claimed: true, username });
            setModalOpen(false);
          }}
        />
      )}
    </SectionShell>
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-theme">
      <p className="text-sm font-medium text-secondary">Account &amp; Sync</p>
      {children}
    </div>
  );
}

function ClaimModal({ onClose, onClaimed }: { onClose: () => void; onClaimed: (username?: string) => void }) {
  const [username, setUsername] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const formatValid = isValidUsername(username);

  function onUsernameChange(v: string) {
    setUsername(v.toLowerCase());
    setAvailable(null); // reset stale availability as the user types
    setError(undefined);
  }

  // Debounced availability check — all state updates happen inside the async callback.
  useEffect(() => {
    if (!username || !isValidUsername(username)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setChecking(true);
      void checkUsername(username)
        .then((r) => !cancelled && setAvailable(r.available))
        .catch(() => !cancelled && setAvailable(null))
        .finally(() => !cancelled && setChecking(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username]);

  const canClaim = !claiming && formatValid && available === true;

  async function handleClaim() {
    setClaiming(true);
    setError(undefined);
    try {
      await claimAccount(username);
      onClaimed(username);
    } catch (err) {
      setError(
        err instanceof UsernameTakenError
          ? 'That username is already taken — try another.'
          : 'Could not claim your account. Please try again.'
      );
      setClaiming(false);
    }
  }

  return (
    <Modal
      title="Claim your account"
      onClose={onClose}
      level={2}
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canClaim}
          loading={claiming}
          onClick={() => void handleClaim()}
        >
          {claiming ? 'Claiming…' : 'Claim'}
        </Button>
      }
    >
      {error && <Banner variant="danger">{error}</Banner>}
      <p className="text-[13px] text-secondary">
        Pick a username — it's your public sharing handle for Groups (it can never decrypt your data). Claiming it turns
        on backup & sharing for this account.
      </p>
      <TextInput
        label="Username"
        value={username}
        onChange={onUsernameChange}
        placeholder="e.g. aarav_s"
        error={!formatValid ? '3–20 lowercase letters, numbers, or _' : undefined}
        hint={
          checking
            ? 'Checking availability…'
            : available === true
              ? '✓ Available'
              : available === false
                ? 'Already taken — try another'
                : undefined
        }
      />
    </Modal>
  );
}
