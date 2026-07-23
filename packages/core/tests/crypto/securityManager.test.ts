import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { EncryptedRepository } from '@/core/db/repository';
import { keystore } from '@/core/crypto/keystore';
import { deriveKey, decrypt, generateSalt, wrapKey } from '@/core/crypto/engine';
import {
  initialize,
  unlock,
  changePin,
  changePassphrase,
  isSessionValid,
  isWeakPin,
  verifyPin
} from '@/core/crypto/securityManager';

const PASS = 'correct horse battery staple';
const PIN = '123456';

interface TestRecord {
  id: string;
  secret: string;
}
const repo = new EncryptedRepository<TestRecord>(db.profile as never);
const sample: TestRecord = { id: 'p1', secret: 'top-secret-value' };

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function securityRecord() {
  const rec = (await db.security.toArray())[0];
  if (!rec) throw new Error('no security record');
  return rec;
}

describe('securityManager — envelope encryption', () => {
  beforeEach(async () => {
    await db.security.clear();
    await db.profile.clear();
    keystore.lock();
  });

  it('initialize unlocks the keystore and round-trips encrypted data', async () => {
    await initialize(PASS, PIN);
    expect(keystore.isUnlocked()).toBe(true);
    await repo.put(sample);
    expect(await repo.get('p1')).toEqual(sample);
  });

  it('stores the DMK wrapped by BOTH the PIN and the passphrase', async () => {
    await initialize(PASS, PIN);
    const rec = await securityRecord();
    expect(rec.encryptedMasterKey).toBeTruthy();
    expect(rec.encryptedMasterKeyByPassphrase).toBeTruthy();
    expect(rec.kekSalt).toBeTruthy();
    expect(rec.passphraseKekSalt).toBeTruthy();
    expect(rec.mkSalt).toBeUndefined(); // new vaults are not legacy
  });

  it('unlock with the correct PIN restores access to data', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);
    keystore.lock();

    expect(await unlock(PIN)).toBe('ok');
    expect(keystore.isUnlocked()).toBe(true);
    expect(await isSessionValid()).toBe(true);
    expect(await repo.get('p1')).toEqual(sample);
  });

  it('unlock with the wrong PIN fails and does not unlock', async () => {
    await initialize(PASS, PIN);
    keystore.lock();
    expect(await unlock('000000')).toBe('wrong_pin');
    expect(keystore.isUnlocked()).toBe(false);
  });

  it('changePin: new PIN works, old PIN stops working, data survives', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);
    // Bypass the once-per-day limit for the test.
    const rec = await securityRecord();
    await db.security.update(rec.id, { pinChangedAt: Date.now() - 25 * 60 * 60 * 1000 });

    expect((await changePin(PIN, '948271')).status).toBe('ok');
    expect(await repo.get('p1')).toEqual(sample); // DMK unchanged, data intact

    keystore.lock();
    expect(await unlock(PIN)).toBe('wrong_pin'); // old PIN dead
    expect(await unlock('948271')).toBe('ok'); // new PIN works
    expect(await repo.get('p1')).toEqual(sample);
  });

  it('changePin with the wrong current PIN is rejected', async () => {
    await initialize(PASS, PIN);
    const rec = await securityRecord();
    await db.security.update(rec.id, { pinChangedAt: Date.now() - 25 * 60 * 60 * 1000 });
    expect((await changePin('000000', '948271')).status).toBe('wrong_pin');
  });

  it('changePassphrase: data survives, PIN still works, new passphrase wraps the SAME DMK', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);

    expect(await changePassphrase(PASS, 'a brand new passphrase')).toBe('ok');

    // Data untouched (no re-encryption) and PIN unlock still works.
    expect(await repo.get('p1')).toEqual(sample);
    keystore.lock();
    expect(await unlock(PIN)).toBe('ok');
    expect(await repo.get('p1')).toEqual(sample);

    // The new passphrase-wrapping unwraps to a key that decrypts the data.
    const rec = await securityRecord();
    const { passphraseKekSalt, encryptedMasterKeyByPassphrase } = rec;
    if (!passphraseKekSalt || !encryptedMasterKeyByPassphrase) throw new Error('passphrase wrapping missing');
    const passKek = await deriveKey('a brand new passphrase', b64ToBuf(passphraseKekSalt), 600_000);
    const wrapped = b64ToBuf(encryptedMasterKeyByPassphrase);
    const dmk = await crypto.subtle.unwrapKey(
      'raw',
      wrapped.slice(12),
      passKek,
      { name: 'AES-GCM', iv: wrapped.slice(0, 12) },
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const row = (await db.profile.toArray())[0] as unknown as { iv: string; ciphertext: string };
    const plaintext = await decrypt(dmk, b64ToBuf(row.iv), b64ToBuf(row.ciphertext));
    expect(JSON.parse(new TextDecoder().decode(plaintext))).toEqual(sample);
  });

  it('changePassphrase with the wrong current passphrase is rejected', async () => {
    await initialize(PASS, PIN);
    expect(await changePassphrase('not the passphrase', 'whatever')).toBe('wrong_passphrase');
  });

  it('migrates a legacy (passphrase-derived MK) vault without re-encrypting data', async () => {
    // Build a legacy vault: MK derived directly from the passphrase, wrapped by the PIN-KEK,
    // no passphrase-wrapping, mkSalt present.
    const mkSalt = generateSalt();
    const kekSalt = generateSalt();
    const legacyMkExtractable = await deriveKey(PASS, mkSalt, 600_000, true);
    const pinKek = await deriveKey(PIN, kekSalt, 200_000);
    const encryptedMasterKey = await wrapKey(legacyMkExtractable, pinKek);
    const now = Date.now();
    await db.security.put({
      id: crypto.randomUUID(),
      encryptedMasterKey: bufToB64(encryptedMasterKey),
      kekSalt: bufToB64(kekSalt),
      mkSalt: bufToB64(mkSalt),
      pinAttempts: 0,
      pinChangedAt: now,
      sessionExpiresAt: now + 1_000_000,
      createdAt: now,
      updatedAt: now
    });
    // Write data encrypted with the legacy MK (non-extractable runtime copy).
    keystore.setMasterKey(await deriveKey(PASS, mkSalt, 600_000, false));
    await repo.put(sample);

    // Migrate by changing the passphrase — must verify the old one and add the wrapping.
    expect(await changePassphrase(PASS, 'post-migration passphrase')).toBe('ok');

    const rec = await securityRecord();
    expect(rec.encryptedMasterKeyByPassphrase).toBeTruthy(); // wrapping now exists
    expect(rec.mkSalt).toBeUndefined(); // legacy salt cleared

    // Data still decryptable, and both factors still open the same vault.
    expect(await repo.get('p1')).toEqual(sample);
    keystore.lock();
    expect(await unlock(PIN)).toBe('ok'); // PIN wrapping untouched
    expect(await repo.get('p1')).toEqual(sample);
  });

  it('rejects a wrong passphrase when migrating a legacy vault', async () => {
    const mkSalt = generateSalt();
    const kekSalt = generateSalt();
    const legacyMk = await deriveKey(PASS, mkSalt, 600_000, true);
    const pinKek = await deriveKey(PIN, kekSalt, 200_000);
    const now = Date.now();
    await db.security.put({
      id: crypto.randomUUID(),
      encryptedMasterKey: bufToB64(await wrapKey(legacyMk, pinKek)),
      kekSalt: bufToB64(kekSalt),
      mkSalt: bufToB64(mkSalt),
      pinAttempts: 0,
      createdAt: now,
      updatedAt: now
    });
    keystore.setMasterKey(await deriveKey(PASS, mkSalt, 600_000, false));
    await repo.put(sample);

    expect(await changePassphrase('wrong legacy passphrase', 'new')).toBe('wrong_passphrase');
  });
});

describe('securityManager — PIN policy', () => {
  beforeEach(async () => {
    await db.security.clear();
    await db.profile.clear();
    keystore.lock();
  });

  it('rejects trivial PINs and accepts non-obvious ones', () => {
    for (const weak of ['000000', '111111', '123456', '654321', '12345', 'abcdef', '121212']) {
      expect(isWeakPin(weak)).toBe(true);
    }
    expect(isWeakPin('839204')).toBe(false);
    expect(isWeakPin('907183')).toBe(false);
  });

  it('limits PIN changes to once per 24h', async () => {
    await initialize(PASS, PIN);
    // pinChangedAt was just set during initialize → too soon
    expect((await changePin(PIN, '948271')).status).toBe('too_soon');
  });

  it('after 24h, rejects weak/wrong new PINs and accepts a valid change', async () => {
    await initialize(PASS, PIN);
    const rec = await securityRecord();
    await db.security.update(rec.id, { pinChangedAt: Date.now() - 25 * 60 * 60 * 1000 });

    expect((await changePin(PIN, '111111')).status).toBe('weak_pin');
    expect((await changePin('000000', '948271')).status).toBe('wrong_pin');
    expect((await changePin(PIN, '948271')).status).toBe('ok');
  });

  it('Open-mode PIN checks share the same lockout as unlock', async () => {
    await initialize(PASS, PIN);
    keystore.lock();

    for (let i = 0; i < 4; i++) {
      const r = await verifyPin('000000');
      expect(r.status).toBe('wrong_pin');
      expect(r.attemptsRemaining).toBe(4 - i);
    }
    expect((await verifyPin('000000')).status).toBe('locked_out'); // 5th attempt
    // The shared counter now locks unlock too.
    expect(await unlock(PIN)).toBe('locked_out');
  });

  it('erases all data after the configured number of failed attempts', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);
    const rec = await securityRecord();
    await db.security.update(rec.id, { wipeAfterAttempts: 3 });
    keystore.lock();

    expect(await unlock('000000')).toBe('wrong_pin');
    expect(await unlock('000000')).toBe('wrong_pin');
    expect(await unlock('000000')).toBe('wiped'); // 3rd failure → wipe
    expect(await db.security.count()).toBe(0);
    expect(await db.profile.count()).toBe(0);
  });
});
