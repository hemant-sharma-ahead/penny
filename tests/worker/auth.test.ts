import { describe, expect, it } from 'vitest';
import { buildSigningString, sha256Hex, verifyRequestSignature } from '../../workers/auth/src/lib/auth';
import { isValidUsername } from '../../workers/auth/src/lib/username';

// Helpers mirroring what the client's signedFetch will do.
async function genKeypair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}
function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
async function signString(privateKey: CryptoKey, s: string): Promise<string> {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(s));
  return bufToB64(sig);
}

describe('buildSigningString', () => {
  it('is deterministic and newline-joined', () => {
    expect(buildSigningString('n1', 'get', '/whoami', 'abc')).toBe('n1\nGET\n/whoami\nabc');
  });
  it('separates fields so they cannot bleed together', () => {
    expect(buildSigningString('a', 'POST', '/device', 'h')).not.toBe(
      buildSigningString('aPOST', 'GET', '/device', 'h')
    );
  });
});

describe('sha256Hex', () => {
  it('hashes the empty string to the known SHA-256 digest', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('verifyRequestSignature', () => {
  const parts = { nonce: 'nonce-1', method: 'GET', path: '/whoami', bodyHash: 'e3b0' };

  it('accepts a genuine signature over the signing string', async () => {
    const { publicKey, privateKey } = await genKeypair();
    const publicJwk = await crypto.subtle.exportKey('jwk', publicKey);
    const signatureB64 = await signString(
      privateKey,
      buildSigningString(parts.nonce, parts.method, parts.path, parts.bodyHash)
    );

    expect(await verifyRequestSignature({ publicJwk, signatureB64, ...parts })).toBe(true);
  });

  it('rejects a signature when the body hash was tampered', async () => {
    const { publicKey, privateKey } = await genKeypair();
    const publicJwk = await crypto.subtle.exportKey('jwk', publicKey);
    const signatureB64 = await signString(
      privateKey,
      buildSigningString(parts.nonce, parts.method, parts.path, parts.bodyHash)
    );

    expect(await verifyRequestSignature({ publicJwk, signatureB64, ...parts, bodyHash: 'tampered' })).toBe(false);
  });

  it('rejects a signature from a different key', async () => {
    const signer = await genKeypair();
    const other = await genKeypair();
    const otherJwk = await crypto.subtle.exportKey('jwk', other.publicKey);
    const signatureB64 = await signString(
      signer.privateKey,
      buildSigningString(parts.nonce, parts.method, parts.path, parts.bodyHash)
    );

    expect(await verifyRequestSignature({ publicJwk: otherJwk, signatureB64, ...parts })).toBe(false);
  });

  it('returns false (never throws) on malformed input', async () => {
    const { publicKey } = await genKeypair();
    const publicJwk = await crypto.subtle.exportKey('jwk', publicKey);
    expect(await verifyRequestSignature({ publicJwk, signatureB64: 'not-base64!!', ...parts })).toBe(false);
  });
});

describe('isValidUsername (worker copy matches client)', () => {
  it('accepts 3–20 lowercase alphanumeric + underscore', () => {
    expect(isValidUsername('aarav_s')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('Has_Caps')).toBe(false);
  });
});
