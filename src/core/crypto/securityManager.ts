// Three-key architecture:
//   passphrase → Master Key (PBKDF2, 600K iterations) — used directly for data encryption
//   PIN        → Key Encryption Key (PBKDF2, 200K iterations) — wraps/unwraps the MK
//
// On initialize: MK derived from passphrase, KEK derived from PIN, MK wrapped with KEK.
// On unlock: KEK re-derived from PIN, used to unwrap stored MK → loaded into keystore.
// MK never touches disk in unwrapped form.

import { db } from '@/core/db/schema';
import { deriveKey, deriveVerifier, generateSalt, unwrapKey, wrapKey } from './engine';
import { keystore } from './keystore';

const MK_ITERATIONS = 600_000;
const KEK_ITERATIONS = 200_000;

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

// ─── Initialize (first-time setup) ───────────────────────────────────────────

export async function initialize(passphrase: string, pin: string): Promise<void> {
  const mkSalt = generateSalt();
  const kekSalt = generateSalt();
  const verifierSalt = generateSalt();

  const mk = await deriveKey(passphrase, mkSalt, MK_ITERATIONS, true);
  const kek = await deriveKey(pin, kekSalt, KEK_ITERATIONS);
  const encryptedMasterKey = await wrapKey(mk, kek);
  const passphraseVerifier = await deriveVerifier(passphrase, verifierSalt);

  // Re-derive MK as non-extractable for runtime use
  const mkRuntime = await deriveKey(passphrase, mkSalt, MK_ITERATIONS, false);
  keystore.setMasterKey(mkRuntime);

  const now = Date.now();
  await db.security.put({
    id: generateId(),
    passphraseVerifier,
    encryptedMasterKey: bufferToBase64(encryptedMasterKey),
    kekSalt: bufferToBase64(kekSalt),
    mkSalt: bufferToBase64(mkSalt),
    pinAttempts: 0,
    lastPinVerifiedAt: now,
    pinChangedAt: now,
    sessionExpiresAt: now + 30 * 60 * 1000,
    createdAt: now,
    updatedAt: now
  });
}

// ─── Unlock (subsequent sessions) ────────────────────────────────────────────

export type UnlockResult = 'ok' | 'wrong_pin' | 'locked_out' | 'no_security_record';

export async function unlock(pin: string): Promise<UnlockResult> {
  const records = await db.security.toArray();
  const record = records[0];
  if (!record) return 'no_security_record';

  const now = Date.now();

  if (record.lockedUntil && record.lockedUntil > now) {
    return 'locked_out';
  }

  try {
    const kekSalt = base64ToBuffer(record.kekSalt);
    const kek = await deriveKey(pin, kekSalt, KEK_ITERATIONS);
    const encryptedMk = base64ToBuffer(record.encryptedMasterKey);
    const mk = await unwrapKey(encryptedMk, kek);

    keystore.setMasterKey(mk);

    await db.security.update(record.id, {
      pinAttempts: 0,
      lockedUntil: undefined,
      lastPinVerifiedAt: now,
      sessionExpiresAt: now + 30 * 60 * 1000,
      updatedAt: now
    } as object);

    return 'ok';
  } catch {
    // Wrong PIN — increment attempt counter and apply lockout if needed
    const attempts = record.pinAttempts + 1;
    const update: Partial<typeof record> = { pinAttempts: attempts, updatedAt: now };

    if (attempts >= 5) {
      // Exponential backoff: 5min, 10min, 20min, 40min, …
      const backoffMs = Math.min(5 * 60 * 1000 * Math.pow(2, attempts - 5), 24 * 60 * 60 * 1000);
      update.lockedUntil = now + backoffMs;
    }

    await db.security.update(record.id, update);
    return 'wrong_pin';
  }
}

// ─── Lockout state ───────────────────────────────────────────────────────────

export interface LockoutState {
  pinAttempts: number;
  lockedUntil: number | null;
}

export async function getLockoutState(): Promise<LockoutState | null> {
  const records = await db.security.toArray();
  const record = records[0];
  if (!record) return null;
  return {
    pinAttempts: record.pinAttempts,
    lockedUntil: record.lockedUntil ?? null
  };
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export async function isSessionValid(): Promise<boolean> {
  if (!keystore.isUnlocked()) return false;
  const records = await db.security.toArray();
  const record = records[0];
  if (!record?.sessionExpiresAt) return false;
  return record.sessionExpiresAt > Date.now();
}

export async function refreshSession(): Promise<void> {
  const records = await db.security.toArray();
  const record = records[0];
  if (!record) return;
  const now = Date.now();
  await db.security.update(record.id, {
    sessionExpiresAt: now + 30 * 60 * 1000,
    updatedAt: now
  });
}

export function lockSession(): void {
  keystore.lock();
}

export async function isOnboardingComplete(): Promise<boolean> {
  const count = await db.security.count();
  if (count === 0) return false;
  const records = await db.security.toArray();
  const record = records[0];
  if (!record) return false;
  // Check profile store too
  const profileCount = await db.profile.count();
  return profileCount > 0;
}

export async function isPinRotationDue(): Promise<boolean> {
  const records = await db.security.toArray();
  const record = records[0];
  if (!record?.pinChangedAt) return false;
  const daysSinceChange = (Date.now() - record.pinChangedAt) / (1000 * 60 * 60 * 24);
  return daysSinceChange >= 21;
}
