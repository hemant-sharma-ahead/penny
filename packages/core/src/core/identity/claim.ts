// Account claim flow (Phase 1.5 Track C): register this device's identity with the auth worker so
// later tracks (sync, groups) can authenticate. Gated behind the 'sync' entitlement in the UI.
//
// Model B: the server stores only identity metadata (userId, optional username, public keys). No
// personal data, no passphrase, no backup blob ever leaves the device here.
import { AUTH_BASE } from '@/core/net/apiBase';
import { ensureIdentityKeys, getPublicJwks } from '@/core/crypto/identityKeys';
import { getRecoveryVerifier } from '@/core/crypto/securityManager';
import { profileRepo } from '@/core/db/repositories';
import { isValidUsername } from '@/core/profile/username';
import { deriveRecoveryKeypair, signRecoveryChallenge } from './recovery';
import { signedFetch, SyncNotConfiguredError } from './signedFetch';
import { notifyProfileChanged } from './profileChangeBus';

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/** Thrown when a passphrase reclaim can't proceed (wrong passphrase, or the handle isn't recoverable). */
export class ReclaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReclaimError';
  }
}

export interface ClaimState {
  claimed: boolean;
  username?: string | undefined;
  deviceId?: string | undefined;
}

/**
 * Signal that the local profile's identity changed (claim / reclaim / handle change). Non-reactive
 * `useRepository` consumers (GroupContext, etc.) listen for this and reload — otherwise they'd show a
 * stale pre-claim profile until the next remount. Mirrors the `penny-events-updated` pattern.
 * Re-exported for existing consumers importing it from here — see `./profileChangeBus` for the actual
 * platform-split implementation (web: DOM `CustomEvent`; RN: in-memory listener set, no `window`).
 */
export { PROFILE_UPDATED_EVENT } from './profileChangeBus';

/** Thrown when the chosen username is already registered to another user. */
export class UsernameTakenError extends Error {
  readonly username: string;
  constructor(username: string) {
    super(`Username @${username} is already taken`);
    this.name = 'UsernameTakenError';
    this.username = username;
  }
}

/** Whether this device has claimed an account (has a deviceId), plus the current username. */
export async function getClaimState(): Promise<ClaimState> {
  const profile = (await profileRepo.getAll())[0];
  return { claimed: Boolean(profile?.deviceId), username: profile?.username, deviceId: profile?.deviceId };
}

/**
 * Deregister this account from the server: deletes the user + its devices, releasing the username
 * (deregister-on-erase). Call this while the device still holds its keys — i.e. BEFORE wiping data.
 * Best-effort: throws on failure so the caller can decide, but callers typically ignore it (the
 * server's inactivity GC reclaims the record if this couldn't run).
 */
export async function deregisterAccount(): Promise<void> {
  if (!AUTH_BASE) return;
  const res = await signedFetch('/account', { method: 'DELETE' });
  if (!res.ok) throw new Error(`Deregister failed: ${res.status}`);
}

/** Server-side availability check for a username. Format is validated locally first. */
export async function checkUsername(username: string): Promise<{ available: boolean; reason?: string }> {
  if (!AUTH_BASE) throw new SyncNotConfiguredError();
  if (!isValidUsername(username)) return { available: false, reason: 'invalid' };
  const res = await fetch(`${AUTH_BASE}/username/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });
  if (!res.ok) throw new Error(`Username check failed: ${res.status}`);
  return (await res.json()) as { available: boolean; reason?: string };
}

/**
 * Claim an account for this device: ensure identity keys → register userId + optional username +
 * public keys → persist deviceId/username locally → confirm the signed loop via /whoami.
 * Idempotent: re-running relabels/re-registers the same userId.
 */
export async function claimAccount(username?: string): Promise<{ userId: string; username: string | null }> {
  if (!AUTH_BASE) throw new SyncNotConfiguredError();
  const profile = (await profileRepo.getAll())[0];
  if (!profile?.userId) throw new Error('No profile/userId to claim');
  if (username && !isValidUsername(username)) throw new Error('Invalid username');

  await ensureIdentityKeys();
  const jwks = await getPublicJwks();
  if (!jwks) throw new Error('Identity keys missing after ensureIdentityKeys()');

  // Track F (F3): upload the passphrase-recovery verifier so this handle can be reclaimed after a wipe
  // without a backup. Null for vaults created before the feature (they fall back to Drive restore).
  const recovery = await getRecoveryVerifier();

  const deviceId = profile.deviceId ?? crypto.randomUUID();
  const res = await fetch(`${AUTH_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: profile.userId,
      username: username || undefined,
      // Keys travel as JSON strings (the worker stores them verbatim and safeParse()s them back;
      // matches the group-grant convention in groupsClient.ts).
      signing_key: JSON.stringify(jwks.signing), // account-level key = this (first) device's signing key
      device_id: deviceId,
      device_signing_key: JSON.stringify(jwks.signing),
      device_wrapping_key: JSON.stringify(jwks.wrapping),
      recovery_salt: recovery?.recoverySalt,
      recovery_pubkey: recovery?.recoveryPublicJwk
    })
  });
  if (res.status === 409) throw new UsernameTakenError(username ?? '');
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  const out = (await res.json()) as { user_id: string; username: string | null };

  await profileRepo.put({
    ...profile,
    username: username || profile.username,
    deviceId,
    updatedAt: Date.now()
  });

  // Confirm the challenge→sign→verify loop works end-to-end before reporting success.
  const whoami = await signedFetch('/whoami');
  if (!whoami.ok) throw new Error(`Post-claim /whoami failed: ${whoami.status}`);

  notifyProfileChanged();
  return { userId: out.user_id, username: out.username };
}

/**
 * Reclaim a handle after a wipe using only username + passphrase (Track F, F3, scheme A). Proves
 * ownership by signing a server nonce with the passphrase-derived recovery key, then binds THIS device
 * under the recovered account's existing userId. Requires a vault to already be initialized (the same
 * passphrase) so this device has a DMK + identity keys — the caller runs `initialize()` first.
 *
 * Recovers IDENTITY + group MEMBERSHIP only. Personal data (and group *history*) need a backup or a
 * co-member re-grant — the server can't decrypt anything (Model B / E2EE).
 */
export async function reclaimAccount(
  username: string,
  passphrase: string
): Promise<{ userId: string; username: string }> {
  if (!AUTH_BASE) throw new SyncNotConfiguredError();
  if (!isValidUsername(username)) throw new ReclaimError('Invalid username');

  // 1. Start: fetch this handle's recovery salt + a single-use nonce.
  const startRes = await fetch(`${AUTH_BASE}/recover/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });
  if (startRes.status === 404) {
    throw new ReclaimError("This handle can't be reclaimed with a passphrase. Restore a backup instead.");
  }
  if (!startRes.ok) throw new ReclaimError(`Reclaim failed: ${startRes.status}`);
  const { recovery_salt, nonce } = (await startRes.json()) as { recovery_salt: string; nonce: string };

  // 2. Re-derive the recovery keypair from the passphrase + the server's salt and sign the challenge.
  const { privateKey } = await deriveRecoveryKeypair(passphrase, base64ToBuffer(recovery_salt));
  const signature = await signRecoveryChallenge(privateKey, username, nonce);

  // 3. Register this device under the recovered account.
  await ensureIdentityKeys();
  const jwks = await getPublicJwks();
  if (!jwks) throw new ReclaimError('Identity keys missing after ensureIdentityKeys()');
  const deviceId = crypto.randomUUID();
  const finishRes = await fetch(`${AUTH_BASE}/recover/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      nonce,
      signature,
      device_id: deviceId,
      device_signing_key: JSON.stringify(jwks.signing),
      device_wrapping_key: JSON.stringify(jwks.wrapping)
    })
  });
  if (finishRes.status === 401) throw new ReclaimError('Wrong passphrase for this handle.');
  if (!finishRes.ok) throw new ReclaimError(`Reclaim failed: ${finishRes.status}`);
  const out = (await finishRes.json()) as { user_id: string; username: string };

  // 4. Adopt the recovered identity locally (same userId → group memberships still apply).
  const profile = (await profileRepo.getAll())[0];
  if (!profile) throw new ReclaimError('No local profile to attach the recovered identity to');
  await profileRepo.put({ ...profile, userId: out.user_id, username, deviceId, updatedAt: Date.now() });

  // 5. Confirm the signed loop works end-to-end with the freshly-bound device.
  const whoami = await signedFetch('/whoami');
  if (!whoami.ok) throw new ReclaimError(`Post-reclaim /whoami failed: ${whoami.status}`);

  notifyProfileChanged();
  return { userId: out.user_id, username };
}
