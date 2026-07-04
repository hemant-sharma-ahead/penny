// Account claim flow (Phase 1.5 Track C): register this device's identity with the auth worker so
// later tracks (sync, groups) can authenticate. Gated behind the 'sync' entitlement in the UI.
//
// Model B: the server stores only identity metadata (userId, optional username, public keys). No
// personal data, no passphrase, no backup blob ever leaves the device here.
import { AUTH_BASE } from '@/core/net/apiBase';
import { ensureIdentityKeys, getPublicJwks } from '@/core/crypto/identityKeys';
import { profileRepo } from '@/core/db/repositories';
import { isValidUsername } from '@/core/profile/username';
import { signedFetch, SyncNotConfiguredError } from './signedFetch';

export interface ClaimState {
  claimed: boolean;
  username?: string | undefined;
  deviceId?: string | undefined;
}

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
      device_wrapping_key: JSON.stringify(jwks.wrapping)
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

  return { userId: out.user_id, username: out.username };
}
