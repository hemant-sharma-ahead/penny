// All cryptographic operations use the Web Crypto API (SubtleCrypto).
// AES-256-GCM throughout. Every encrypt call generates a fresh random IV.
// Keys are non-extractable CryptoKey objects — never serialised to strings.

const PBKDF2_HASH = 'SHA-256';
const AES_KEY_LENGTH = 256;
const GCM_IV_LENGTH = 12; // bytes — 96-bit IV recommended for AES-GCM

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

// ─── Passphrase verifier ──────────────────────────────────────────────────────
// Derives a short verifier from the passphrase using a dedicated salt.
// Used to quickly check "is this the right passphrase?" without storing the passphrase itself.

export async function deriveVerifier(passphrase: string, salt: ArrayBuffer): Promise<string> {
  const key = await deriveKey(passphrase, salt, 100_000, true);
  const raw = await crypto.subtle.exportKey('raw', key);
  // Take the first 8 bytes as a compact verifier string
  return btoa(String.fromCharCode(...new Uint8Array(raw).slice(0, 8)));
}
