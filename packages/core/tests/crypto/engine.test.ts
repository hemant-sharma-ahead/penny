import { describe, expect, it } from 'vitest';
import { decrypt, deriveKey, encrypt, generateSalt, unwrapKey, wrapKey } from '@/core/crypto/engine';

describe('deriveKey', () => {
  it('produces a CryptoKey', async () => {
    const salt = generateSalt();
    const key = await deriveKey('test-passphrase', salt, 1_000);
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it('is deterministic — same inputs produce equivalent keys', async () => {
    const salt = generateSalt();
    const iterations = 1_000;
    const secret = 'same-passphrase';

    const keyA = await deriveKey(secret, salt, iterations, true);
    const keyB = await deriveKey(secret, salt, iterations, true);

    const rawA = await crypto.subtle.exportKey('raw', keyA);
    const rawB = await crypto.subtle.exportKey('raw', keyB);

    expect(Buffer.from(rawA)).toEqual(Buffer.from(rawB));
  });

  it('different salts produce different keys', async () => {
    const saltA = generateSalt();
    const saltB = generateSalt();
    const iterations = 1_000;
    const secret = 'same-passphrase';

    const keyA = await deriveKey(secret, saltA, iterations, true);
    const keyB = await deriveKey(secret, saltB, iterations, true);

    const rawA = await crypto.subtle.exportKey('raw', keyA);
    const rawB = await crypto.subtle.exportKey('raw', keyB);

    expect(Buffer.from(rawA)).not.toEqual(Buffer.from(rawB));
  });

  it('non-extractable key cannot be exported', async () => {
    const salt = generateSalt();
    const key = await deriveKey('passphrase', salt, 1_000, false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });
});

describe('encrypt / decrypt round-trip', () => {
  it('decrypts back to original plaintext', async () => {
    const salt = generateSalt();
    const key = await deriveKey('passphrase', salt, 1_000);
    const original = new TextEncoder().encode('Hello Penny!');

    const { iv, ciphertext } = await encrypt(key, original);
    const decrypted = await decrypt(key, iv, ciphertext);

    expect(new TextDecoder().decode(decrypted)).toBe('Hello Penny!');
  });

  it('generates a unique IV on every encrypt call', async () => {
    const salt = generateSalt();
    const key = await deriveKey('passphrase', salt, 1_000);
    const plaintext = new TextEncoder().encode('same message');

    const { iv: ivA } = await encrypt(key, plaintext);
    const { iv: ivB } = await encrypt(key, plaintext);

    expect(Buffer.from(ivA)).not.toEqual(Buffer.from(ivB));
  });

  it('ciphertext differs even for identical plaintext due to random IV', async () => {
    const salt = generateSalt();
    const key = await deriveKey('passphrase', salt, 1_000);
    const plaintext = new TextEncoder().encode('identical');

    const { ciphertext: ctA } = await encrypt(key, plaintext);
    const { ciphertext: ctB } = await encrypt(key, plaintext);

    expect(Buffer.from(ctA)).not.toEqual(Buffer.from(ctB));
  });

  it('tampered ciphertext throws on decrypt', async () => {
    const salt = generateSalt();
    const key = await deriveKey('passphrase', salt, 1_000);
    const plaintext = new TextEncoder().encode('sensitive data');

    const { iv, ciphertext } = await encrypt(key, plaintext);

    // Flip one byte in the ciphertext
    const tampered = ciphertext.slice(0);
    new Uint8Array(tampered)[0] ^= 0xff;

    await expect(decrypt(key, iv, tampered)).rejects.toThrow();
  });

  it('wrong key throws on decrypt', async () => {
    const saltA = generateSalt();
    const saltB = generateSalt();
    const keyA = await deriveKey('passphrase-a', saltA, 1_000);
    const keyB = await deriveKey('passphrase-b', saltB, 1_000);
    const plaintext = new TextEncoder().encode('secret');

    const { iv, ciphertext } = await encrypt(keyA, plaintext);
    await expect(decrypt(keyB, iv, ciphertext)).rejects.toThrow();
  });
});

describe('wrapKey / unwrapKey', () => {
  it('unwraps to a usable key that can decrypt original data', async () => {
    const mkSalt = generateSalt();
    const kekSalt = generateSalt();

    const mk = await deriveKey('passphrase', mkSalt, 1_000, true);
    const kek = await deriveKey('123456', kekSalt, 1_000);

    const wrapped = await wrapKey(mk, kek);
    const unwrapped = await unwrapKey(wrapped, kek);

    // Encrypt with original MK, decrypt with unwrapped MK
    const plaintext = new TextEncoder().encode('test record');
    const { iv, ciphertext } = await encrypt(mk, plaintext);
    const decrypted = await decrypt(unwrapped, iv, ciphertext);

    expect(new TextDecoder().decode(decrypted)).toBe('test record');
  });

  it('wrong unwrapping key throws', async () => {
    const mkSalt = generateSalt();
    const kekSaltA = generateSalt();
    const kekSaltB = generateSalt();

    const mk = await deriveKey('passphrase', mkSalt, 1_000, true);
    const kekA = await deriveKey('correct-pin', kekSaltA, 1_000);
    const kekB = await deriveKey('wrong-pin', kekSaltB, 1_000);

    const wrapped = await wrapKey(mk, kekA);
    await expect(unwrapKey(wrapped, kekB)).rejects.toThrow();
  });
});
