import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { importBackup } from '@/core/backup/backupManager';
import { googleDriveBackup, isCloudBackupConfigured } from '@/core/backup/cloudBackup';
import { initialize, isWeakPin, wipeAllData } from '@/core/crypto/securityManager';
import { EncryptedRepository } from '@/core/db/repository';
import { db } from '@/core/db/schema';
import type { Profile } from '@/core/db/types';
import { reclaimAccount, ReclaimError } from '@/core/identity/claim';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { isValidUsername } from '@/core/profile/username';
import { PATHS } from '@/router/paths';
import { Button, TextInput } from '@/components/ui';
import { OnboardingBack } from './OnboardingBack';

export type AccountTab = 'new' | 'restore' | 'reclaim';

// Set before a restore so the post-unlock reconciler re-verifies the identity against the server and,
// if the account was deregistered and the handle got taken, prompts for a new one. See IdentityReconciler.
export const RECONCILE_FLAG = 'penny_reconcile_identity';

const TABS: { id: AccountTab; label: string }[] = [
  { id: 'new', label: 'Start fresh' },
  { id: 'restore', label: 'Restore' },
  { id: 'reclaim', label: 'Reclaim' }
];

/**
 * Screen B of the account-start flow (Track F). One screen, three tabs — new / restore / reclaim — with
 * the tab chosen on Screen A pre-selected. Restore brings everything back (no re-claim, no seed); reclaim
 * recovers the handle via passphrase (F3); "start fresh" continues into the new-user setup.
 */
export function AccountRecoveryScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialTab = (location.state as { tab?: AccountTab } | null)?.tab ?? 'new';
  const [tab, setTab] = useState<AccountTab>(initialTab);

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.start} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-6 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i
              className={`ti ${tab === 'new' ? 'ti-sparkles' : 'ti-user-shield'} text-white`}
              style={{ fontSize: 28 }}
              aria-hidden="true"
            />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-1">
            {tab === 'new' ? 'Set up your account' : 'Welcome back'}
          </h2>
          <p className="text-sm text-secondary">
            {tab === 'new'
              ? 'Create a new account in a couple of steps.'
              : 'Restore everything, or reclaim your handle.'}
          </p>
        </div>

        {/* Segmented tabs */}
        <div className="flex bg-surface-2 border border-theme rounded-xl p-1 gap-1 mb-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 text-[13px] font-semibold py-2 rounded-lg ${
                tab === t.id ? 'bg-surface text-[var(--color-primary)] shadow-sm' : 'text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'new' && <NewTab onContinue={() => navigate(PATHS.onboarding.letUsKnowYou)} />}
        {tab === 'restore' && <RestoreTab />}
        {tab === 'reclaim' && <ReclaimTab />}
      </div>
    </div>
  );
}

function NewTab({ onContinue }: { onContinue: () => void }) {
  return (
    <div>
      <p className="text-sm text-secondary leading-relaxed mb-6">
        We'll ask for a few basics, then set your passphrase and PIN to create your encrypted vault. Nothing leaves your
        device.
      </p>
      <Button variant="primary" size="lg" fullWidth onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}

function RestoreTab() {
  const cloudEnabled = isCloudBackupConfigured() && hasEntitlement('cloud_backup');
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState<null | 'file' | 'cloud'>(null);
  const [error, setError] = useState('');

  function goToApp() {
    // Flag a post-unlock identity reconcile (handle may have been taken if the account was deregistered).
    localStorage.setItem(RECONCILE_FLAG, '1');
    window.location.href = PATHS.app.home;
  }

  async function restoreFromFile() {
    if (!file || !passphrase || busy) return;
    setBusy('file');
    setError('');
    try {
      await importBackup(await file.text(), passphrase);
      goToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setBusy(null);
    }
  }

  async function restoreFromCloud() {
    if (!passphrase || busy) return;
    setBusy('cloud');
    setError('');
    try {
      const text = await googleDriveBackup.fetchLatest();
      if (!text) {
        setError('No Penny backup found in your Drive.');
        setBusy(null);
        return;
      }
      await importBackup(text, passphrase);
      goToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setBusy(null);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-secondary mb-1">Passphrase</label>
      <TextInput type="password" value={passphrase} onChange={setPassphrase} placeholder="Your backup passphrase" />

      <div className="mt-4">
        {cloudEnabled && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!passphrase || busy !== null}
            loading={busy === 'cloud'}
            onClick={() => void restoreFromCloud()}
          >
            <i className="ti ti-brand-google-drive" aria-hidden="true" /> Restore from Google Drive
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,.penny"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          variant={cloudEnabled ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          className={cloudEnabled ? 'mt-3' : ''}
          onClick={() => fileRef.current?.click()}
        >
          <i className="ti ti-file-upload" aria-hidden="true" /> {file ? file.name : 'Choose a backup file'}
        </Button>
        {file && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-3"
            disabled={!passphrase || busy !== null}
            loading={busy === 'file'}
            onClick={() => void restoreFromFile()}
          >
            Restore from file
          </Button>
        )}
      </div>

      {error && <p className="text-danger text-sm mt-4 text-center">{error}</p>}
      <div className="mt-4 flex items-start gap-2 text-xs text-secondary bg-info-subtle rounded-xl px-3 py-2.5">
        <i className="ti ti-info-circle text-info mt-0.5" aria-hidden="true" />
        <span>
          Restores your profile, data, groups &amp; handle. If your handle was taken while you were away, we'll ask you
          to pick a new one — your data stays safe.
        </span>
      </div>
    </div>
  );
}

function ReclaimTab() {
  const [username, setUsername] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pinTooWeak = pin.length === 6 && isWeakPin(pin);
  const canSubmit =
    isValidUsername(username) &&
    passphrase.length > 0 &&
    pin.length === 6 &&
    !pinTooWeak &&
    pin === confirmPin &&
    !busy;

  async function handleReclaim() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    let vaultCreated = false;
    try {
      await initialize(passphrase, pin);
      vaultCreated = true;
      const now = Date.now();
      const repo = new EncryptedRepository<Profile>(db.profile as never);
      await repo.put({
        id: crypto.randomUUID(),
        displayName: '',
        currency: 'INR',
        locale: 'en-IN',
        onboardingComplete: true,
        userId: crypto.randomUUID(), // placeholder — reclaimAccount swaps in the recovered userId
        username,
        plan: 'free',
        createdAt: now,
        updatedAt: now
      });
      await reclaimAccount(username, passphrase);
      window.location.href = PATHS.app.home;
    } catch (err) {
      if (vaultCreated) await wipeAllData().catch(() => undefined);
      setError(
        err instanceof ReclaimError ? err.message : 'Reclaim failed. Check your handle and passphrase, then retry.'
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Username"
        value={username}
        onChange={(v) => setUsername(v.toLowerCase())}
        placeholder="e.g. aarav_s"
        error={username.length > 0 && !isValidUsername(username) ? '3–20 lowercase letters, numbers, or _' : undefined}
      />
      <TextInput
        label="Passphrase"
        type="password"
        value={passphrase}
        onChange={setPassphrase}
        placeholder="Your original passphrase"
      />
      <TextInput
        label="New 6-digit PIN"
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        onChange={(v) => setPin(v.replace(/\D/g, ''))}
        placeholder="Quick unlock on this device"
        inputClassName="text-center tracking-widest text-lg"
        error={pinTooWeak ? 'Choose a less predictable PIN' : undefined}
      />
      <TextInput
        label="Confirm PIN"
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={confirmPin}
        onChange={(v) => setConfirmPin(v.replace(/\D/g, ''))}
        placeholder="Repeat your PIN"
        inputClassName="text-center tracking-widest text-lg"
        error={confirmPin.length === 6 && pin !== confirmPin ? "PINs don't match" : undefined}
      />

      {error && <p className="text-danger text-sm text-center">{error}</p>}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="mt-1"
        disabled={!canSubmit}
        loading={busy}
        onClick={() => void handleReclaim()}
      >
        {busy ? 'Reclaiming…' : 'Reclaim account'}
      </Button>
      <div className="flex items-start gap-2 text-xs text-secondary bg-warning-subtle rounded-xl px-3 py-2.5">
        <i className="ti ti-alert-triangle text-warning mt-0.5" aria-hidden="true" />
        <span>
          Handle &amp; groups come back. Personal data &amp; group history need a backup or a re-share from a member.
        </span>
      </div>
    </div>
  );
}
