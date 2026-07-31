// Cross-engine crypto test vectors (Track 2 of the mobile migration).
//
// This file's job: prove that the primitives @penny/core's crypto engine relies on (PBKDF2, AES-256-GCM,
// the deterministic Ed25519-from-passphrase recovery derivation) produce IDENTICAL output whether run
// under Node/browser Web Crypto (what this Vitest suite exercises today) or react-native-quick-crypto's
// crypto.subtle polyfill (what apps/mobile runs on-device).
//
// IMPORTANT — honesty about what's actually verified here: react-native-quick-crypto is a native Nitro
// module. It cannot run inside this Node/Vitest process — there is no device or simulator in this
// environment. What this file DOES prove: the vectors below are internally consistent and correct against
// Node's Web Crypto implementation (the same engine.ts code apps/web-react runs). What still needs a human
// with a physical device or simulator: run these exact same fixed inputs through
// react-native-quick-crypto's crypto.subtle (e.g. temporarily log the outputs from a debug screen in
// apps/mobile, or write an equivalent test using a device-based test runner) and confirm they match the
// expected values hardcoded below. See docs/plans/mobile-migration.md Track 2's progress log.
//
// ECDSA (P-256) is NOT included as a fixed-signature vector: ECDSA signatures aren't deterministic unless
// RFC 6979 is used (neither Web Crypto nor quick-crypto do this by default), so a fixed expected signature
// isn't a meaningful cross-engine check. The existing tests/crypto/engine.test.ts already covers
// sign-then-verify round-trips; that's the right check for ECDSA, not a byte-for-byte vector.

import { describe, expect, it } from 'vitest';
import { deriveRecoveryKeypair } from '@/core/identity/recovery';

const FIXED_PASSPHRASE = 'correct horse battery staple';
const FIXED_SALT_BYTES = new TextEncoder().encode('penny-test-vector-salt-v1').buffer;
const PBKDF2_ITERATIONS = 600_000;

function hex(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('hex');
}

describe('cross-engine crypto vectors — verified here under Web Crypto; MUST be re-run on-device against react-native-quick-crypto before Track 2 is considered fully verified', () => {
  it('PBKDF2(SHA-256): fixed passphrase + salt + 600K iterations → fixed 256-bit key', async () => {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(FIXED_PASSPHRASE),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: FIXED_SALT_BYTES, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    // Computed once against Node's Web Crypto (the same implementation apps/web-react uses in a browser).
    expect(hex(bits)).toBe('082801ebffc2cd21fb5f89c5c691dcba73e1b44e629604bb45a83eb12ee9cffb');
  });

  it('AES-256-GCM: fixed key + fixed IV + fixed plaintext → fixed ciphertext', async () => {
    // Uses the PBKDF2 output above as the AES key, and a fixed (non-random) IV — engine.ts's real
    // `encrypt()` always generates a random IV, which is correct for production but not vector-testable;
    // this test calls crypto.subtle directly with fixed inputs to get a reproducible ciphertext.
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(FIXED_PASSPHRASE),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const keyBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: FIXED_SALT_BYTES, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    const aesKey = await crypto.subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const fixedIv = new Uint8Array(12).fill(7);
    const plaintext = new TextEncoder().encode('penny-cross-engine-test-vector');
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: fixedIv }, aesKey, plaintext);
    expect(hex(ciphertext)).toBe(
      'a3f63d2ad1377ce1230c74a46ae90014fc5093e7f552e8c0df98281d50b1c6dcfd5fc0385ca2471da94e8a680267'
    );

    // Round-trip: decrypting the fixed ciphertext with the same key/IV recovers the exact plaintext —
    // this is the part of the check that actually exercises engine.ts's own decrypt() shape.
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fixedIv }, aesKey, ciphertext);
    expect(new TextDecoder().decode(decrypted)).toBe('penny-cross-engine-test-vector');
  });

  it('deriveRecoveryKeypair (deterministic Ed25519 from passphrase): fixed passphrase + salt → fixed public key', async () => {
    // This is the ONE genuinely deterministic asymmetric-key vector in the whole crypto engine (per
    // packages/core/src/core/identity/recovery.ts's own doc comment) — same passphrase + salt always
    // yields the same keypair, so unlike ECDSA this DOES have a meaningful fixed expected output.
    const { publicJwk } = await deriveRecoveryKeypair(FIXED_PASSPHRASE, FIXED_SALT_BYTES);
    expect(publicJwk.kty).toBe('OKP');
    expect(publicJwk.crv).toBe('Ed25519');
    // Computed once against Node's Web Crypto — the value an on-device react-native-quick-crypto run
    // MUST reproduce exactly for Track 2 to be considered verified.
    expect(publicJwk.x).toBe('fvUfyBv4-NA5igpx853dfaW8MHeP0oxCTJ1rVkB5kWM');
  });
});
