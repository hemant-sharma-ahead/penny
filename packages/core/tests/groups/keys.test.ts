import { describe, expect, it } from 'vitest';
import { generateWrappingKeypair } from '@/core/crypto/engine';
import {
  decryptFromGroup,
  encryptForGroup,
  generateGroupKey,
  unwrapGroupKey,
  wrapGroupKeyFor
} from '@/core/groups/keys';

async function rawKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

describe('group key wrap / unwrap (grant round-trip)', () => {
  it('an owner wraps the Group Key to a member, who unwraps the identical key', async () => {
    const owner = await generateWrappingKeypair();
    const member = await generateWrappingKeypair();
    const groupKey = await generateGroupKey();

    // Owner wraps for the member (needs the member's wrapping public JWK).
    const grant = await wrapGroupKeyFor(groupKey, owner, await crypto.subtle.exportKey('jwk', member.publicKey));
    // The grant is self-describing — it carries the granter's wrapping public key.
    expect(grant.granterWrapPub.crv).toBe('P-256');

    // Member unwraps with their own wrapping private key.
    const recovered = await unwrapGroupKey(grant, member.privateKey);
    expect(await rawKey(recovered)).toEqual(await rawKey(groupKey));
  });

  it('a different member cannot unwrap a grant addressed to someone else', async () => {
    const owner = await generateWrappingKeypair();
    const member = await generateWrappingKeypair();
    const outsider = await generateWrappingKeypair();
    const groupKey = await generateGroupKey();

    const grant = await wrapGroupKeyFor(groupKey, owner, await crypto.subtle.exportKey('jwk', member.publicKey));
    await expect(unwrapGroupKey(grant, outsider.privateKey)).rejects.toBeDefined();
  });
});

describe('group event encryption', () => {
  it('encrypts an event with the Group Key and decrypts it back', async () => {
    const groupKey = await generateGroupKey();
    const event = { type: 'shared_expense', amount: 1200, payer: 'u1', participants: ['u1', 'u2'] };

    const blob = await encryptForGroup(groupKey, event);
    expect(typeof blob).toBe('string');
    expect(await decryptFromGroup(groupKey, blob)).toEqual(event);
  });

  it('a fresh IV per encryption produces distinct ciphertext for the same plaintext', async () => {
    const groupKey = await generateGroupKey();
    const a = await encryptForGroup(groupKey, { n: 1 });
    const b = await encryptForGroup(groupKey, { n: 1 });
    expect(a).not.toBe(b);
  });

  it('a different Group Key cannot decrypt the ciphertext', async () => {
    const k1 = await generateGroupKey();
    const k2 = await generateGroupKey();
    const blob = await encryptForGroup(k1, { secret: true });
    await expect(decryptFromGroup(k2, blob)).rejects.toBeDefined();
  });
});
