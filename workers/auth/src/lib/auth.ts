// Pure signed-request logic — no Cloudflare bindings, only Web Crypto (available in Workers and
// the test/Node runtime). The client mirrors buildSigningString + the SHA-256 body hash exactly in
// src/core/identity/signedFetch.ts; keep the two constructions in lockstep.

const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ECDSA_SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

/**
 * The exact byte string a request signature covers. Joined with newlines so no field can bleed into
 * the next. `path` is the URL pathname (no query); `bodyHash` is the hex SHA-256 of the raw body
 * ('' for bodyless GETs).
 */
export function buildSigningString(nonce: string, method: string, path: string, bodyHash: string): string {
  return [nonce, method.toUpperCase(), path, bodyHash].join('\n');
}

/** Hex SHA-256 of a UTF-8 string (the request body, or '' for a bodyless request). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/**
 * Verify an ECDSA P-256 (SHA-256) signature over buildSigningString(...) against a device's public
 * JWK. `signatureB64` is base64 of the raw IEEE-P1363 signature that Web Crypto's sign() produces.
 * Returns false (never throws) on any malformed input.
 */
export async function verifyRequestSignature(params: {
  publicJwk: JsonWebKey;
  signatureB64: string;
  nonce: string;
  method: string;
  path: string;
  bodyHash: string;
}): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('jwk', params.publicJwk, ECDSA_PARAMS, false, ['verify']);
    const data = new TextEncoder().encode(
      buildSigningString(params.nonce, params.method, params.path, params.bodyHash)
    );
    return await crypto.subtle.verify(ECDSA_SIGN, key, base64ToBuffer(params.signatureB64), data);
  } catch {
    return false;
  }
}

/** The exact byte string a recovery (reclaim) signature covers — binds the proof to the handle + nonce. */
export function buildRecoveryString(username: string, nonce: string): string {
  return ['recover', username, nonce].join('\n');
}

/**
 * Verify an Ed25519 signature over buildRecoveryString(...) against a user's stored recovery public
 * JWK (Track F, F3, scheme A). The client re-derives the keypair from KDF(passphrase, recovery_salt),
 * so a valid signature proves knowledge of the passphrase without the server ever seeing it. Returns
 * false (never throws) on any malformed input.
 */
export async function verifyRecoverySignature(params: {
  publicJwk: JsonWebKey;
  signatureB64: string;
  username: string;
  nonce: string;
}): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('jwk', params.publicJwk, { name: 'Ed25519' }, false, ['verify']);
    const data = new TextEncoder().encode(buildRecoveryString(params.username, params.nonce));
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, base64ToBuffer(params.signatureB64), data);
  } catch {
    return false;
  }
}
