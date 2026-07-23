// Envelope encryption (Track 2):
//   A single random Data Master Key (DMK) encrypts all user data and never changes.
//   It is wrapped independently by a passphrase-KEK (PBKDF2 600K) and a PIN-KEK
//   (PBKDF2 200K). Changing a factor re-wraps the DMK only — data is never re-encrypted.
//   The DMK lives in memory (non-extractable) only while unlocked.
//
// PIN policy: every PIN entry point (unlock, Open-mode re-auth, change-PIN check) shares
// one attempt counter and the same 5-attempt exponential-backoff lockout. The PIN is
// mandatory and can never be disabled. PIN changes are limited to once per 24h. Trivial
// PINs are rejected. An opt-in policy erases all data after N consecutive failures.

import { db } from '@/core/db/schema';
import { decrypt, deriveKey, generateMasterKey, generateSalt, unwrapKey, wrapKey } from './engine';
import { deriveRecoveryKeypair } from '@/core/identity/recovery';
import { keystore } from './keystore';
import { DAY_MS } from '@/lib/date';
import type { SecurityRecord } from '@/core/db/types';

const MK_ITERATIONS = 600_000; // passphrase-KEK
const KEK_ITERATIONS = 200_000; // PIN-KEK
const SESSION_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Default threshold for the opt-in "erase after N failed attempts" policy. */
export const WIPE_THRESHOLD = 10;

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateId(): string {
  return crypto.randomUUID();
}

async function firstRecord(): Promise<SecurityRecord | undefined> {
  return (await db.security.toArray())[0];
}

// Verify a candidate data key by decrypting one existing encrypted row. Used to
// confirm the passphrase during migration of a legacy (passphrase-derived) vault.
async function keyDecryptsExistingData(key: CryptoKey): Promise<boolean> {
  const rows = (await db.profile.toArray()) as { iv?: string; ciphertext?: string }[];
  const row = rows[0];
  if (!row?.iv || !row.ciphertext) return false; // nothing to verify against — fail closed
  try {
    await decrypt(key, base64ToBuffer(row.iv), base64ToBuffer(row.ciphertext));
    return true;
  } catch {
    return false;
  }
}

// Unwraps the DMK via the passphrase-KEK (or the legacy mkSalt fallback). Throws on a wrong passphrase.
// Shared by changePassphrase and consumePassphraseAttempt (forgot-PIN recovery + Open-mode-adjacent flows).
async function unwrapDmkWithPassphrase(
  passphrase: string,
  record: SecurityRecord,
  extractable: boolean
): Promise<CryptoKey> {
  if (record.encryptedMasterKeyByPassphrase && record.passphraseKekSalt) {
    const passKek = await deriveKey(passphrase, base64ToBuffer(record.passphraseKekSalt), MK_ITERATIONS);
    return unwrapKey(base64ToBuffer(record.encryptedMasterKeyByPassphrase), passKek, extractable);
  }
  if (record.mkSalt) {
    // Legacy vault — the DMK was derived from the passphrase; reconstruct and verify against real data.
    const candidate = await deriveKey(passphrase, base64ToBuffer(record.mkSalt), MK_ITERATIONS, extractable);
    if (!(await keyDecryptsExistingData(candidate))) throw new Error('wrong passphrase');
    return candidate;
  }
  throw new Error('no passphrase verifier on record');
}

// ─── Weak-PIN policy ──────────────────────────────────────────────────────────

const COMMON_WEAK_PINS = new Set(['123456', '654321', '121212', '112233', '123123', '696969', '789456']);

/** True if the PIN is not 6 digits, all-same, a straight ascending/descending run, or a well-known weak value. */
export function isWeakPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true; // all the same digit
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return true; // straight sequence
  return COMMON_WEAK_PINS.has(pin);
}

// ─── Destructive wipe (opt-in anti-theft) ─────────────────────────────────────

export async function wipeAllData(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
  keystore.lock();
}

export async function getWipeAfterAttempts(): Promise<number | null> {
  const record = await firstRecord();
  return record?.wipeAfterAttempts ?? null;
}

export async function setWipeAfterAttempts(enabled: boolean): Promise<void> {
  const record = await firstRecord();
  if (!record) return;
  await db.security.update(record.id, {
    wipeAfterAttempts: enabled ? WIPE_THRESHOLD : undefined,
    updatedAt: Date.now()
  } as object);
}

// ─── Shared PIN attempt (unified lockout across all entry points) ─────────────

export interface PinCheckResult {
  status: 'ok' | 'wrong_pin' | 'locked_out' | 'wiped';
  attemptsRemaining: number;
  lockedUntil: number | null;
}

async function consumePinAttempt(
  pin: string,
  extractable: boolean
): Promise<{ result: PinCheckResult; dmk?: CryptoKey }> {
  const record = await firstRecord();
  if (!record) return { result: { status: 'wrong_pin', attemptsRemaining: MAX_ATTEMPTS, lockedUntil: null } };

  const now = Date.now();
  if (record.lockedUntil && record.lockedUntil > now) {
    return { result: { status: 'locked_out', attemptsRemaining: 0, lockedUntil: record.lockedUntil } };
  }

  try {
    const pinKek = await deriveKey(pin, base64ToBuffer(record.kekSalt), KEK_ITERATIONS);
    const dmk = await unwrapKey(base64ToBuffer(record.encryptedMasterKey), pinKek, extractable);
    await db.security.update(record.id, {
      pinAttempts: 0,
      lockedUntil: undefined,
      lastPinVerifiedAt: now,
      updatedAt: now
    } as object);
    return { result: { status: 'ok', attemptsRemaining: MAX_ATTEMPTS, lockedUntil: null }, dmk };
  } catch {
    const attempts = record.pinAttempts + 1;

    // Opt-in anti-theft: erase everything after N consecutive failures.
    if (record.wipeAfterAttempts && attempts >= record.wipeAfterAttempts) {
      await wipeAllData();
      return { result: { status: 'wiped', attemptsRemaining: 0, lockedUntil: null } };
    }

    const update: Partial<SecurityRecord> = { pinAttempts: attempts, updatedAt: now };
    let lockedUntil: number | null = null;
    if (attempts >= MAX_ATTEMPTS) {
      const backoffMs = Math.min(5 * 60 * 1000 * Math.pow(2, attempts - MAX_ATTEMPTS), DAY_MS);
      lockedUntil = now + backoffMs;
      update.lockedUntil = lockedUntil;
    }
    await db.security.update(record.id, update as object);
    return {
      result: {
        status: lockedUntil ? 'locked_out' : 'wrong_pin',
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts),
        lockedUntil
      }
    };
  }
}

// ─── Shared passphrase attempt (forgot-PIN recovery) — independent lockout from PIN's ────────

export interface PassphraseCheckResult {
  status: 'ok' | 'wrong_passphrase' | 'locked_out' | 'wiped';
  attemptsRemaining: number;
  lockedUntil: number | null;
}

async function consumePassphraseAttempt(
  passphrase: string,
  extractable: boolean
): Promise<{ result: PassphraseCheckResult; dmk?: CryptoKey }> {
  const record = await firstRecord();
  if (!record) return { result: { status: 'wrong_passphrase', attemptsRemaining: MAX_ATTEMPTS, lockedUntil: null } };

  const now = Date.now();
  if (record.passphraseLockedUntil && record.passphraseLockedUntil > now) {
    return { result: { status: 'locked_out', attemptsRemaining: 0, lockedUntil: record.passphraseLockedUntil } };
  }

  try {
    const dmk = await unwrapDmkWithPassphrase(passphrase, record, extractable);
    await db.security.update(record.id, {
      passphraseAttempts: 0,
      passphraseLockedUntil: undefined,
      updatedAt: now
    } as object);
    return { result: { status: 'ok', attemptsRemaining: MAX_ATTEMPTS, lockedUntil: null }, dmk };
  } catch {
    const attempts = (record.passphraseAttempts ?? 0) + 1;

    // Opt-in anti-theft: erase everything after N consecutive failures, same policy as PIN.
    if (record.wipeAfterAttempts && attempts >= record.wipeAfterAttempts) {
      await wipeAllData();
      return { result: { status: 'wiped', attemptsRemaining: 0, lockedUntil: null } };
    }

    const update: Partial<SecurityRecord> = { passphraseAttempts: attempts, updatedAt: now };
    let lockedUntil: number | null = null;
    if (attempts >= MAX_ATTEMPTS) {
      const backoffMs = Math.min(5 * 60 * 1000 * Math.pow(2, attempts - MAX_ATTEMPTS), DAY_MS);
      lockedUntil = now + backoffMs;
      update.passphraseLockedUntil = lockedUntil;
    }
    await db.security.update(record.id, update as object);
    return {
      result: {
        status: lockedUntil ? 'locked_out' : 'wrong_passphrase',
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts),
        lockedUntil
      }
    };
  }
}

// ─── Initialize (first-time setup) ───────────────────────────────────────────

export async function initialize(passphrase: string, pin: string): Promise<void> {
  const kekSalt = generateSalt();
  const passphraseKekSalt = generateSalt();

  const pinKek = await deriveKey(pin, kekSalt, KEK_ITERATIONS);
  const passKek = await deriveKey(passphrase, passphraseKekSalt, MK_ITERATIONS);

  const dmk = await generateMasterKey(true); // extractable only long enough to wrap
  const encryptedMasterKey = await wrapKey(dmk, pinKek);
  const encryptedMasterKeyByPassphrase = await wrapKey(dmk, passKek);

  keystore.setMasterKey(await unwrapKey(encryptedMasterKey, pinKek, false));

  // Track F (F3): derive the passphrase-recovery keypair now (we hold the passphrase here) and stash the
  // salt + PUBLIC key so claim can register it as the account's recovery verifier.
  const recoverySalt = generateSalt(16);
  const { publicJwk: recoveryPublicJwk } = await deriveRecoveryKeypair(passphrase, recoverySalt);

  const now = Date.now();
  await db.security.put({
    id: generateId(),
    encryptedMasterKey: bufferToBase64(encryptedMasterKey),
    encryptedMasterKeyByPassphrase: bufferToBase64(encryptedMasterKeyByPassphrase),
    kekSalt: bufferToBase64(kekSalt),
    passphraseKekSalt: bufferToBase64(passphraseKekSalt),
    recoverySalt: bufferToBase64(recoverySalt),
    recoveryPublicJwk: JSON.stringify(recoveryPublicJwk),
    pinAttempts: 0,
    lastPinVerifiedAt: now,
    pinChangedAt: now,
    sessionExpiresAt: now + SESSION_MS,
    createdAt: now,
    updatedAt: now
  });
}

// ─── Demo Mode — throwaway vault + exit re-key ────────────────────────────────

/** Fixed, known credentials for the "Explore with Demo Data" vault — shown on-screen, never secret.
 *  Never run through isWeakPin (that only gates user-chosen PINs) — trivial on purpose since there's
 *  nothing to protect and nothing to remember; both are cleared the moment Demo Mode is exited. */
export const DEMO_PIN = '123456';
export const DEMO_PASSPHRASE = 'penny123456';

export type ExitDemoModeResult = 'ok' | 'weak_pin' | 'no_security_record';

/** Re-keys a Demo Mode vault (created moments earlier with DEMO_PIN/DEMO_PASSPHRASE) to the user's real
 *  credentials in one step, when they exit Demo Mode. Deliberately bypasses the once/24h throttle that
 *  changePin/changePassphrase enforce — that throttle protects a real, in-use vault from credential-
 *  cycling abuse, which doesn't apply to a vault that's seconds old and about to have all its data wiped.
 *  Re-wraps the SAME DMK for both new KEKs (mirrors initialize(), minus generating a fresh DMK — nothing
 *  encrypted under this one survives the exit anyway). */
export async function exitDemoMode(newPassphrase: string, newPin: string): Promise<ExitDemoModeResult> {
  if (isWeakPin(newPin)) return 'weak_pin';
  const record = await firstRecord();
  if (!record) return 'no_security_record';

  const dmk = await unwrapDmkWithPassphrase(DEMO_PASSPHRASE, record, true);

  const newKekSalt = generateSalt();
  const newPassphraseKekSalt = generateSalt();
  const newPinKek = await deriveKey(newPin, newKekSalt, KEK_ITERATIONS);
  const newPassKek = await deriveKey(newPassphrase, newPassphraseKekSalt, MK_ITERATIONS);
  const rewrappedByPin = await wrapKey(dmk, newPinKek);
  const rewrappedByPassphrase = await wrapKey(dmk, newPassKek);

  keystore.setMasterKey(await unwrapKey(rewrappedByPin, newPinKek, false));

  // Track F (F3): recovery keypair is passphrase-derived, so a new passphrase means a new keypair —
  // same as changePassphrase. A claimed account re-uploads it via claimAccount() after this resolves.
  const newRecoverySalt = generateSalt(16);
  const { publicJwk: newRecoveryPublicJwk } = await deriveRecoveryKeypair(newPassphrase, newRecoverySalt);

  const now = Date.now();
  await db.security.update(record.id, {
    encryptedMasterKey: bufferToBase64(rewrappedByPin),
    kekSalt: bufferToBase64(newKekSalt),
    encryptedMasterKeyByPassphrase: bufferToBase64(rewrappedByPassphrase),
    passphraseKekSalt: bufferToBase64(newPassphraseKekSalt),
    recoverySalt: bufferToBase64(newRecoverySalt),
    recoveryPublicJwk: JSON.stringify(newRecoveryPublicJwk),
    mkSalt: undefined,
    pinChangedAt: now,
    passphraseChangedAt: now,
    pinAttempts: 0,
    lockedUntil: undefined,
    passphraseAttempts: 0,
    passphraseLockedUntil: undefined,
    sessionExpiresAt: now + SESSION_MS,
    updatedAt: now
  } as object);
  return 'ok';
}

/**
 * The account's passphrase-recovery verifier (salt + PUBLIC key), or null if this vault predates the
 * feature. Uploaded to the server by the claim flow (Track F, F3). Non-secret — safe to hand out.
 */
export async function getRecoveryVerifier(): Promise<{ recoverySalt: string; recoveryPublicJwk: string } | null> {
  const record = await firstRecord();
  if (!record?.recoverySalt || !record?.recoveryPublicJwk) return null;
  return { recoverySalt: record.recoverySalt, recoveryPublicJwk: record.recoveryPublicJwk };
}

// ─── Unlock with PIN ──────────────────────────────────────────────────────────

export type UnlockResult = 'ok' | 'wrong_pin' | 'locked_out' | 'wiped' | 'no_security_record';

export async function unlock(pin: string): Promise<UnlockResult> {
  const record = await firstRecord();
  if (!record) return 'no_security_record';

  const { result, dmk } = await consumePinAttempt(pin, false);
  if (result.status === 'ok' && dmk) {
    keystore.setMasterKey(dmk);
    const now = Date.now();
    await db.security.update(record.id, { sessionExpiresAt: now + SESSION_MS, updatedAt: now } as object);
    return 'ok';
  }
  return result.status;
}

// ─── Verify PIN (Open-mode re-auth) — shares the unified lockout ──────────────

export async function verifyPin(pin: string): Promise<PinCheckResult> {
  const { result } = await consumePinAttempt(pin, false);
  return result;
}

// ─── Change PIN — re-wrap the DMK with a new PIN-KEK (no data re-encryption) ──

export interface ChangePinResult {
  status: 'ok' | 'wrong_pin' | 'locked_out' | 'wiped' | 'weak_pin' | 'too_soon' | 'no_security_record';
  attemptsRemaining?: number;
  lockedUntil?: number | null;
  nextChangeAllowedAt?: number;
}

export async function changePin(currentPin: string, newPin: string): Promise<ChangePinResult> {
  const record = await firstRecord();
  if (!record) return { status: 'no_security_record' };

  // Rate-limit: at most one PIN change per 24h.
  if (record.pinChangedAt && Date.now() - record.pinChangedAt < DAY_MS) {
    return { status: 'too_soon', nextChangeAllowedAt: record.pinChangedAt + DAY_MS };
  }
  if (isWeakPin(newPin)) return { status: 'weak_pin' };

  // Verify the current PIN — this counts toward the unified lockout.
  const { result, dmk } = await consumePinAttempt(currentPin, true);
  if (result.status !== 'ok' || !dmk) {
    return {
      status: result.status === 'ok' ? 'wrong_pin' : result.status,
      attemptsRemaining: result.attemptsRemaining,
      lockedUntil: result.lockedUntil
    };
  }

  const newKekSalt = generateSalt();
  const newPinKek = await deriveKey(newPin, newKekSalt, KEK_ITERATIONS);
  const rewrapped = await wrapKey(dmk, newPinKek);
  keystore.setMasterKey(await unwrapKey(rewrapped, newPinKek, false));

  const now = Date.now();
  await db.security.update(record.id, {
    encryptedMasterKey: bufferToBase64(rewrapped),
    kekSalt: bufferToBase64(newKekSalt),
    pinChangedAt: now,
    pinAttempts: 0,
    lockedUntil: undefined,
    updatedAt: now
  } as object);
  return { status: 'ok' };
}

// ─── Change Passphrase — re-wrap the DMK with a new passphrase-KEK ────────────

export type ChangePassphraseResult = 'ok' | 'wrong_passphrase' | 'too_soon' | 'no_security_record';

export async function changePassphrase(
  currentPassphrase: string,
  newPassphrase: string
): Promise<ChangePassphraseResult> {
  const record = await firstRecord();
  if (!record) return 'no_security_record';

  // Rate-limit: at most one passphrase change per 24h, same policy as PIN changes. Does not apply to
  // resetPinWithPassphrase — that's an emergency recovery path, not a routine change.
  if (record.passphraseChangedAt && Date.now() - record.passphraseChangedAt < DAY_MS) {
    return 'too_soon';
  }

  let dmk: CryptoKey;
  try {
    dmk = await unwrapDmkWithPassphrase(currentPassphrase, record, true);
  } catch {
    return 'wrong_passphrase';
  }

  const newPassphraseKekSalt = generateSalt();
  const newPassKek = await deriveKey(newPassphrase, newPassphraseKekSalt, MK_ITERATIONS);
  const rewrapped = await wrapKey(dmk, newPassKek);

  // Track F (F3): the recovery keypair is derived from the passphrase, so a change re-derives it. We
  // update the LOCAL verifier here; a claimed account must re-upload it to the server (the caller does
  // this via claimAccount() after a successful change — see ChangePassphrasePage).
  const newRecoverySalt = generateSalt(16);
  const { publicJwk: newRecoveryPublicJwk } = await deriveRecoveryKeypair(newPassphrase, newRecoverySalt);

  const now = Date.now();
  await db.security.update(record.id, {
    encryptedMasterKeyByPassphrase: bufferToBase64(rewrapped),
    passphraseKekSalt: bufferToBase64(newPassphraseKekSalt),
    recoverySalt: bufferToBase64(newRecoverySalt),
    recoveryPublicJwk: JSON.stringify(newRecoveryPublicJwk),
    mkSalt: undefined, // legacy derivation no longer used once migrated
    passphraseChangedAt: now,
    updatedAt: now
  } as object);
  return 'ok';
}

// ─── Unlock with passphrase (forgot-PIN recovery) ─────────────────────────────

export type UnlockWithPassphraseResult = 'ok' | 'wrong_passphrase' | 'locked_out' | 'wiped' | 'no_security_record';

/** Unlocks the session by proving the passphrase instead of the PIN — the entry point for the
 *  lock-screen "Forgot PIN?" flow. Independent of the PIN lockout: works even when pinAttempts is
 *  exhausted. On success, also clears the PIN lockout (the caller is expected to route straight to
 *  resetting the PIN — see ChangePinPage's forced-reset mode). */
export async function unlockWithPassphrase(passphrase: string): Promise<UnlockWithPassphraseResult> {
  const record = await firstRecord();
  if (!record) return 'no_security_record';

  const { result, dmk } = await consumePassphraseAttempt(passphrase, false);
  if (result.status === 'ok' && dmk) {
    keystore.setMasterKey(dmk);
    const now = Date.now();
    await db.security.update(record.id, {
      sessionExpiresAt: now + SESSION_MS,
      pinAttempts: 0,
      lockedUntil: undefined,
      updatedAt: now
    } as object);
    return 'ok';
  }
  return result.status;
}

/** Lockout state for the passphrase-recovery attempt counter — independent of PIN's. */
export interface PassphraseLockoutState {
  passphraseAttempts: number;
  lockedUntil: number | null;
}

export async function getPassphraseLockoutState(): Promise<PassphraseLockoutState | null> {
  const record = await firstRecord();
  if (!record) return null;
  return { passphraseAttempts: record.passphraseAttempts ?? 0, lockedUntil: record.passphraseLockedUntil ?? null };
}

// ─── Reset PIN with passphrase (forgot-PIN recovery) ──────────────────────────

export interface ResetPinResult {
  status: 'ok' | 'wrong_passphrase' | 'locked_out' | 'wiped' | 'weak_pin' | 'no_security_record';
  attemptsRemaining?: number;
  lockedUntil?: number | null;
}

/** Sets a brand-new PIN by proving the passphrase instead of the current (forgotten) PIN. Not
 *  rate-limited by the once/24h PIN-change throttle — this is the emergency recovery path, and
 *  throttling it would trap someone who just regained access. Shares the passphrase attempt
 *  counter with unlockWithPassphrase (same threat surface). */
export async function resetPinWithPassphrase(passphrase: string, newPin: string): Promise<ResetPinResult> {
  const record = await firstRecord();
  if (!record) return { status: 'no_security_record' };
  if (isWeakPin(newPin)) return { status: 'weak_pin' };

  const { result, dmk } = await consumePassphraseAttempt(passphrase, true);
  if (result.status !== 'ok' || !dmk) {
    return {
      status: result.status === 'ok' ? 'wrong_passphrase' : result.status,
      attemptsRemaining: result.attemptsRemaining,
      lockedUntil: result.lockedUntil
    };
  }

  const newKekSalt = generateSalt();
  const newPinKek = await deriveKey(newPin, newKekSalt, KEK_ITERATIONS);
  const rewrapped = await wrapKey(dmk, newPinKek);
  keystore.setMasterKey(await unwrapKey(rewrapped, newPinKek, false));

  const now = Date.now();
  await db.security.update(record.id, {
    encryptedMasterKey: bufferToBase64(rewrapped),
    kekSalt: bufferToBase64(newKekSalt),
    pinChangedAt: now,
    pinAttempts: 0,
    lockedUntil: undefined,
    sessionExpiresAt: now + SESSION_MS,
    updatedAt: now
  } as object);
  return { status: 'ok' };
}

// ─── Lockout state ───────────────────────────────────────────────────────────

export interface LockoutState {
  pinAttempts: number;
  lockedUntil: number | null;
}

export async function getLockoutState(): Promise<LockoutState | null> {
  const record = await firstRecord();
  if (!record) return null;
  return { pinAttempts: record.pinAttempts, lockedUntil: record.lockedUntil ?? null };
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export async function isSessionValid(): Promise<boolean> {
  if (!keystore.isUnlocked()) return false;
  const record = await firstRecord();
  if (!record?.sessionExpiresAt) return false;
  return record.sessionExpiresAt > Date.now();
}

export async function refreshSession(): Promise<void> {
  const record = await firstRecord();
  if (!record) return;
  const now = Date.now();
  await db.security.update(record.id, { sessionExpiresAt: now + SESSION_MS, updatedAt: now });
}

export function lockSession(): void {
  keystore.lock();
}

export async function isOnboardingComplete(): Promise<boolean> {
  const count = await db.security.count();
  if (count === 0) return false;
  const record = await firstRecord();
  if (!record) return false;
  const profileCount = await db.profile.count();
  return profileCount > 0;
}

export async function isPinRotationDue(): Promise<boolean> {
  const record = await firstRecord();
  if (!record?.pinChangedAt) return false;
  const daysSinceChange = (Date.now() - record.pinChangedAt) / DAY_MS;
  return daysSinceChange >= 21;
}
