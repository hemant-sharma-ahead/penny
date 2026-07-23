// All cryptographic operations use the Web Crypto API (SubtleCrypto).
// AES-256-GCM throughout. Every encrypt call generates a fresh random IV.
// Keys are non-extractable CryptoKey objects — never serialised to strings.

const PBKDF2_HASH = 'SHA-256';
const AES_KEY_LENGTH = 256;
const GCM_IV_LENGTH = 12; // bytes — 96-bit IV recommended for AES-GCM
const EC_CURVE = 'P-256'; // NIST P-256 for both signing (ECDSA) and wrapping (ECDH)
const ECDSA_HASH = 'SHA-256';

// ─── Key derivation ───────────────────────────────────────────────────────────

export async function deriveKey(
  secret: string,
  salt: ArrayBuffer,
  iterations: number,
  extractable = false
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, [
    'deriveKey'
  ]);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    extractable,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

export function generateSalt(byteLength = 32): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(byteLength)).buffer as ArrayBuffer;
}

// ─── Random data key (envelope encryption) ────────────────────────────────────
// The Data Master Key is random, not derived from any secret. Generate it
// extractable only when it must be wrapped; load a non-extractable copy at runtime.

export function generateMasterKey(extractable = false): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: AES_KEY_LENGTH }, extractable, [
    'encrypt',
    'decrypt',
    'wrapKey',
    'unwrapKey'
  ]);
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────────

export interface EncryptResult {
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
}

export async function encrypt(key: CryptoKey, plaintext: BufferSource): Promise<EncryptResult> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH)).buffer as ArrayBuffer;
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv, ciphertext };
}

export async function decrypt(key: CryptoKey, iv: ArrayBuffer, ciphertext: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

// ─── Key wrapping (MK ↔ KEK) ─────────────────────────────────────────────────

export async function wrapKey(keyToWrap: CryptoKey, wrappingKey: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH)).buffer as ArrayBuffer;
  const wrapped = await crypto.subtle.wrapKey('raw', keyToWrap, wrappingKey, { name: 'AES-GCM', iv });
  // Prepend IV to wrapped key so unwrapKey can extract it
  const combined = new Uint8Array(GCM_IV_LENGTH + wrapped.byteLength);
  combined.set(new Uint8Array(iv), 0);
  combined.set(new Uint8Array(wrapped), GCM_IV_LENGTH);
  return combined.buffer;
}

export async function unwrapKey(
  wrappedWithIv: ArrayBuffer,
  unwrappingKey: CryptoKey,
  extractable = false
): Promise<CryptoKey> {
  const iv = wrappedWithIv.slice(0, GCM_IV_LENGTH);
  const wrapped = wrappedWithIv.slice(GCM_IV_LENGTH);
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    unwrappingKey,
    { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    extractable,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

// ─── Asymmetric keys (device identity — Phase 1.5 Track B) ─────────────────────
// Two P-256 keypairs per device:
//   • signing (ECDSA)  — authenticates requests to the sync/groups workers by signing
//                        nonce||method||path||bodyHash (Track C). Verified server-side.
//   • wrapping (ECDH)  — receives the DMK during device pairing (Track C) and Group Keys
//                        during grants (Track E), via an ECDH-derived AES-GCM KEK.
// Generated extractable so both JWKs can be persisted (DMK-encrypted at rest) and ride
// recovery; the same trade-off the DMK itself uses.

export function generateSigningKeypair(extractable = true): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: EC_CURVE }, extractable, ['sign', 'verify']);
}

export function generateWrappingKeypair(extractable = true): Promise<CryptoKeyPair> {
  // Only the private key carries usages for ECDH; the public key has none.
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: EC_CURVE }, extractable, ['deriveKey', 'deriveBits']);
}

export function sign(privateKey: CryptoKey, data: BufferSource): Promise<ArrayBuffer> {
  return crypto.subtle.sign({ name: 'ECDSA', hash: ECDSA_HASH }, privateKey, data);
}

export function verify(publicKey: CryptoKey, signature: BufferSource, data: BufferSource): Promise<boolean> {
  return crypto.subtle.verify({ name: 'ECDSA', hash: ECDSA_HASH }, publicKey, signature, data);
}

// ─── JWK export / import ────────────────────────────────────────────────────────
// JWK is the persisted form for asymmetric keys (stored DMK-encrypted, uploaded as public).

export function exportJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key) as Promise<JsonWebKey>;
}

export function importSigningPublicJwk(jwk: JsonWebKey, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: EC_CURVE }, extractable, ['verify']);
}

export function importSigningPrivateJwk(jwk: JsonWebKey, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: EC_CURVE }, extractable, ['sign']);
}

export function importWrappingPublicJwk(jwk: JsonWebKey, extractable = false): Promise<CryptoKey> {
  // A public ECDH key has no key usages.
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: EC_CURVE }, extractable, []);
}

export function importWrappingPrivateJwk(jwk: JsonWebKey, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: EC_CURVE }, extractable, [
    'deriveKey',
    'deriveBits'
  ]);
}

// ─── ECDH shared KEK ────────────────────────────────────────────────────────────
// Derives an AES-256-GCM key-encryption-key from our wrapping private key + a peer's
// wrapping public key. Both sides derive the identical KEK, then wrapKey/unwrapKey the
// payload (DMK or Group Key). Used by Tracks C (device pairing) and E (group grants).

export function deriveSharedWrappingKey(privateKey: CryptoKey, peerPublicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  );
}

// ─── Passphrase verifier ──────────────────────────────────────────────────────
// Derives a short verifier from the passphrase using a dedicated salt.
// Used to quickly check "is this the right passphrase?" without storing the passphrase itself.

export async function deriveVerifier(passphrase: string, salt: ArrayBuffer): Promise<string> {
  const key = await deriveKey(passphrase, salt, 100_000, true);
  const raw = await crypto.subtle.exportKey('raw', key);
  // Take the first 8 bytes as a compact verifier string
  return btoa(String.fromCharCode(...new Uint8Array(raw).slice(0, 8)));
}
