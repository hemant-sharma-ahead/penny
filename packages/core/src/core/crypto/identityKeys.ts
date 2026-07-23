// Device identity keypairs (Phase 1.5 Track B).
//
// Every synced device holds two P-256 keypairs, generated LAZILY at claim (Track C) so
// non-sync users pay nothing:
//   • signing (ECDSA)  — authenticates requests to the sync/groups workers.
//   • wrapping (ECDH)  — receives the DMK during device pairing and Group Keys during grants.
//
// Both are stored in the `device_keys` table (DMK-encrypted at rest, so they ride recovery).
// Key material is generated extractable only to export the JWKs for storage; the live
// CryptoKeys re-imported for use are non-extractable.
import {
  exportJwk,
  generateSigningKeypair,
  generateWrappingKeypair,
  importSigningPrivateJwk,
  importSigningPublicJwk,
  importWrappingPrivateJwk,
  importWrappingPublicJwk
} from './engine';
import { deviceKeysRepo } from '../db/repositories';
import type { DeviceKey } from '../db/types';

export interface IdentityKeys {
  signing: CryptoKeyPair;
  wrapping: CryptoKeyPair;
}

async function loadKeypair(kind: DeviceKey['kind']): Promise<CryptoKeyPair | undefined> {
  const record = await deviceKeysRepo.get(kind);
  if (!record) return undefined;
  if (kind === 'sign') {
    return {
      publicKey: await importSigningPublicJwk(record.publicJwk),
      privateKey: await importSigningPrivateJwk(record.privateJwk)
    };
  }
  return {
    publicKey: await importWrappingPublicJwk(record.publicJwk),
    privateKey: await importWrappingPrivateJwk(record.privateJwk)
  };
}

async function persistKeypair(kind: DeviceKey['kind'], pair: CryptoKeyPair): Promise<void> {
  const now = Date.now();
  await deviceKeysRepo.put({
    id: kind,
    kind,
    publicJwk: await exportJwk(pair.publicKey),
    privateJwk: await exportJwk(pair.privateKey),
    createdAt: now,
    updatedAt: now
  });
}

/**
 * Ensure both device keypairs exist, generating and persisting them on first call.
 * Idempotent: returns the existing keys on subsequent calls without regenerating.
 * The single entry point for identity-key creation — Track C's claim flow calls this.
 */
export async function ensureIdentityKeys(): Promise<IdentityKeys> {
  let signing = await loadKeypair('sign');
  if (!signing) {
    signing = await generateSigningKeypair();
    await persistKeypair('sign', signing);
  }

  let wrapping = await loadKeypair('wrap');
  if (!wrapping) {
    wrapping = await generateWrappingKeypair();
    await persistKeypair('wrap', wrapping);
  }

  return { signing, wrapping };
}

/** The device's ECDSA signing keypair, or undefined if identity keys were never generated. */
export function getSigningKeypair(): Promise<CryptoKeyPair | undefined> {
  return loadKeypair('sign');
}

/** The device's ECDH wrapping keypair, or undefined if identity keys were never generated. */
export function getWrappingKeypair(): Promise<CryptoKeyPair | undefined> {
  return loadKeypair('wrap');
}

/**
 * The public JWKs uploaded to the worker at register/pairing (Track C).
 * Returns undefined if identity keys were never generated.
 */
export async function getPublicJwks(): Promise<{ signing: JsonWebKey; wrapping: JsonWebKey } | undefined> {
  const [sign, wrap] = await Promise.all([deviceKeysRepo.get('sign'), deviceKeysRepo.get('wrap')]);
  if (!sign || !wrap) return undefined;
  return { signing: sign.publicJwk, wrapping: wrap.publicJwk };
}
