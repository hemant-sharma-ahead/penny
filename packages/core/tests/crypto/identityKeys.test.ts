import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import {
  deriveSharedWrappingKey,
  exportJwk,
  generateMasterKey,
  generateSigningKeypair,
  generateWrappingKeypair,
  importSigningPublicJwk,
  importWrappingPublicJwk,
  sign,
  unwrapKey,
  verify,
  wrapKey
} from '@/core/crypto/engine';
import { ensureIdentityKeys, getPublicJwks, getSigningKeypair, getWrappingKeypair } from '@/core/crypto/identityKeys';

const PASS = 'correct horse battery staple';
const PIN = '123456';

describe('engine — asymmetric primitives', () => {
  it('generates an ECDSA signing keypair and round-trips sign/verify', async () => {
    const { publicKey, privateKey } = await generateSigningKeypair();
    const data = new TextEncoder().encode('nonce||GET||/blob||abc');
    const sig = await sign(privateKey, data);

    expect(await verify(publicKey, sig, data)).toBe(true);
    // Tampered payload fails.
    expect(await verify(publicKey, sig, new TextEncoder().encode('tampered'))).toBe(false);
  });

  it('round-trips signing public JWK export/import', async () => {
    const { publicKey, privateKey } = await generateSigningKeypair();
    const jwk = await exportJwk(publicKey);
    const reimported = await importSigningPublicJwk(jwk);

    const data = new TextEncoder().encode('payload');
    const sig = await sign(privateKey, data);
    expect(await verify(reimported, sig, data)).toBe(true);
  });

  it('derives an identical shared KEK from both ECDH sides and wraps/unwraps a DMK', async () => {
    const alice = await generateWrappingKeypair();
    const bob = await generateWrappingKeypair();

    // Each side derives a KEK from their own private key + the peer's public key.
    const aliceKek = await deriveSharedWrappingKey(alice.privateKey, bob.publicKey);
    const bobKek = await deriveSharedWrappingKey(bob.privateKey, alice.publicKey);

    // Alice wraps a DMK to Bob; Bob unwraps it with his derived KEK.
    const dmk = await generateMasterKey(true);
    const wrapped = await wrapKey(dmk, aliceKek);
    const unwrapped = await unwrapKey(wrapped, bobKek, true);

    const rawA = await crypto.subtle.exportKey('raw', dmk);
    const rawB = await crypto.subtle.exportKey('raw', unwrapped);
    expect(new Uint8Array(rawB)).toEqual(new Uint8Array(rawA));
  });

  it('imports a wrapping public JWK usable as an ECDH peer key', async () => {
    const alice = await generateWrappingKeypair();
    const bob = await generateWrappingKeypair();
    const bobPubReimported = await importWrappingPublicJwk(await exportJwk(bob.publicKey));

    const kek1 = await deriveSharedWrappingKey(alice.privateKey, bob.publicKey);
    const kek2 = await deriveSharedWrappingKey(alice.privateKey, bobPubReimported);

    // Both KEKs are equivalent — encrypt with one, decrypt with the other via a wrapped key.
    const dmk = await generateMasterKey(true);
    const wrapped = await wrapKey(dmk, kek1);
    const unwrapped = await unwrapKey(wrapped, kek2, true);
    expect(new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped))).toEqual(
      new Uint8Array(await crypto.subtle.exportKey('raw', dmk))
    );
  });
});

describe('identityKeys — ensureIdentityKeys', () => {
  beforeEach(async () => {
    await Promise.all([db.security.clear(), db.device_keys.clear()]);
    keystore.lock();
    await initialize(PASS, PIN);
  });

  it('generates both keypairs on first call and persists them', async () => {
    expect(await getSigningKeypair()).toBeUndefined();
    expect(await getWrappingKeypair()).toBeUndefined();

    const keys = await ensureIdentityKeys();
    expect(keys.signing.publicKey).toBeInstanceOf(CryptoKey);
    expect(keys.wrapping.privateKey).toBeInstanceOf(CryptoKey);
    expect(await db.device_keys.count()).toBe(2);

    const pub = await getPublicJwks();
    expect(pub?.signing.crv).toBe('P-256');
    expect(pub?.wrapping.crv).toBe('P-256');
  });

  it('is idempotent — a second call returns the same keys without regenerating', async () => {
    const first = await ensureIdentityKeys();
    const firstJwks = await getPublicJwks();

    const second = await ensureIdentityKeys();
    const secondJwks = await getPublicJwks();

    expect(await db.device_keys.count()).toBe(2);
    expect(secondJwks).toEqual(firstJwks);

    // The reloaded signing key still verifies a signature from the first call's key.
    const data = new TextEncoder().encode('same-identity');
    const sig = await sign(first.signing.privateKey, data);
    expect(await verify(second.signing.publicKey, sig, data)).toBe(true);
  });
});
