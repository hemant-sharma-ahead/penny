// Passphrase-based account recovery (Track F, F3, scheme A).
//
// A per-account Ed25519 keypair is DETERMINISTICALLY derived from the user's passphrase + a random
// per-account salt: seed = PBKDF2(passphrase, recoverySalt) → Ed25519 keypair. The PUBLIC half is the
// server-stored "recovery verifier" (see workers/auth). Because it's derived, nothing needs to persist
// to survive a wipe — the passphrase re-derives the exact same keypair, so a reinstalled device can
// prove ownership of its handle by signing a fresh server nonce. The server never sees the passphrase
// or a password-equivalent (Model B intact); a DB leak yields only a public key.
//
// This is INDEPENDENT of the DMK-wrapping derivation (distinct salt + this dedicated seed), so the
// recovery verifier reveals nothing about the data key.

const RECOVERY_ITERATIONS = 600_000; // match the passphrase-KEK strength (brute-force resistance)

// ASN.1/DER prefix for an Ed25519 PKCS#8 private key wrapping a raw 32-byte seed (RFC 8410).
// Full key = this 16-byte prefix + the 32-byte seed.
const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
]);

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export interface RecoveryKeypair {
  /** Public JWK to upload as the account's recovery verifier (OKP / Ed25519). */
  publicJwk: JsonWebKey;
  /** Live signing key for proving ownership during reclaim. */
  privateKey: CryptoKey;
}

/**
 * Derive the account's Ed25519 recovery keypair from the passphrase + salt. Deterministic: the same
 * (passphrase, salt) always yields the same keypair, so it survives a wipe without being stored.
 */
export async function deriveRecoveryKeypair(passphrase: string, salt: ArrayBuffer): Promise<RecoveryKeypair> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const seedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: RECOVERY_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256 // 32-byte Ed25519 seed
  );

  const pkcs8 = new Uint8Array(ED25519_PKCS8_PREFIX.length + 32);
  pkcs8.set(ED25519_PKCS8_PREFIX);
  pkcs8.set(new Uint8Array(seedBits), ED25519_PKCS8_PREFIX.length);

  // Extractable so we can export the public half; the key is ephemeral (re-derived on demand).
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  if (!jwk.x) throw new Error('Ed25519 export missing public component');
  const publicJwk: JsonWebKey = { kty: 'OKP', crv: 'Ed25519', x: jwk.x };
  return { publicJwk, privateKey };
}

/** The exact string a reclaim signature covers — MUST match the worker's buildRecoveryString(). */
export function buildRecoveryString(username: string, nonce: string): string {
  return ['recover', username, nonce].join('\n');
}

/** Sign the reclaim challenge with the recovery private key; returns base64 of the raw signature. */
export async function signRecoveryChallenge(privateKey: CryptoKey, username: string, nonce: string): Promise<string> {
  const data = new TextEncoder().encode(buildRecoveryString(username, nonce));
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, data);
  return bufferToBase64(sig);
}
