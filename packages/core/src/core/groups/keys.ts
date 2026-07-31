// Group crypto (Phase 1.5 Track E, E1).
//
// Every group has a per-epoch AES-256-GCM **Group Key** that encrypts the group name and all event
// bodies. The key never touches the server: it is generated on the owner's device, and shared to each
// member by wrapping it to that member's ECDH **wrapping** public key (reusing Track B's
// `deriveSharedWrappingKey`) — the same envelope pattern as device pairing (Track C).
//
// A grant is self-describing: it carries the granter's wrapping public JWK, so the recipient derives
// the identical shared KEK from (their wrapping private key, granter's wrapping public key) and unwraps.
// The server relays the grant blob opaquely (Model B). Every epoch's key is persisted in `group_keys`
// (DMK-encrypted at rest) so a long-offline member can still decrypt old-epoch events after a rotation.
import {
  decrypt,
  deriveSharedWrappingKey,
  encrypt,
  exportJwk,
  generateMasterKey,
  importWrappingPublicJwk,
  unwrapKey,
  wrapKey
} from '@/core/crypto/engine';
import { getWrappingKeypair } from '@/core/crypto/identityKeys';
import { groupKeysRepo } from '@/core/db/repositories';

/** The opaque grant envelope the server relays. `wrapped` is base64(iv||wrappedGroupKey). */
export interface GroupKeyGrant {
  granterWrapPub: JsonWebKey; // granter's ECDH wrapping public JWK
  wrapped: string; // base64(iv || AES-GCM-wrapped Group Key)
}

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ─── Key generation + persistence ───────────────────────────────────────────────

/** A fresh, extractable Group Key for a new epoch. Extractable so it can be exported (persist) and
 *  re-wrapped (grants); it lives only in memory and DMK-encrypted at rest, same as device keys. */
export function generateGroupKey(): Promise<CryptoKey> {
  return generateMasterKey(true);
}

/** Persist a Group Key for `${groupId}:${epoch}` (idempotent upsert). */
export async function persistGroupKey(groupId: string, keyEpoch: number, key: CryptoKey): Promise<void> {
  const now = Date.now();
  const existing = await groupKeysRepo.get(`${groupId}:${keyEpoch}`);
  await groupKeysRepo.put({
    id: `${groupId}:${keyEpoch}`,
    groupId,
    keyEpoch,
    jwk: await exportJwk(key),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
}

/** Load a persisted Group Key (extractable, so it can encrypt/decrypt and be re-wrapped for members). */
export async function loadGroupKey(groupId: string, keyEpoch: number): Promise<CryptoKey | undefined> {
  const record = await groupKeysRepo.get(`${groupId}:${keyEpoch}`);
  if (!record) return undefined;
  return crypto.subtle.importKey('jwk', record.jwk, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
    'wrapKey',
    'unwrapKey'
  ]);
}

/** Generate + persist a Group Key for a brand-new group (epoch 1). Returns the key. */
export async function createGroupKey(groupId: string, keyEpoch = 1): Promise<CryptoKey> {
  const key = await generateGroupKey();
  await persistGroupKey(groupId, keyEpoch, key);
  return key;
}

// ─── Wrap / unwrap (pure — no repo, so it unit-tests directly) ─────────────────────

/**
 * Wrap `groupKey` for a member, given our wrapping keypair and the member's wrapping public JWK.
 * Both sides derive the same AES-GCM KEK from ECDH; we wrap the raw Group Key under it.
 */
export async function wrapGroupKeyFor(
  groupKey: CryptoKey,
  ownWrappingKeyPair: CryptoKeyPair,
  peerWrappingPublicJwk: JsonWebKey
): Promise<GroupKeyGrant> {
  const peerPub = await importWrappingPublicJwk(peerWrappingPublicJwk);
  const kek = await deriveSharedWrappingKey(ownWrappingKeyPair.privateKey, peerPub);
  const wrapped = await wrapKey(groupKey, kek);
  return {
    granterWrapPub: await exportJwk(ownWrappingKeyPair.publicKey),
    wrapped: bufToB64(wrapped)
  };
}

/**
 * Unwrap a Group Key from a grant using our wrapping private key + the granter's wrapping public key
 * (carried in the grant). Returns an extractable AES-GCM key so it can be persisted + re-wrapped.
 */
export async function unwrapGroupKey(grant: GroupKeyGrant, ownWrappingPrivateKey: CryptoKey): Promise<CryptoKey> {
  const granterPub = await importWrappingPublicJwk(grant.granterWrapPub);
  const kek = await deriveSharedWrappingKey(ownWrappingPrivateKey, granterPub);
  return unwrapKey(b64ToBuf(grant.wrapped), kek, true);
}

/**
 * Wrap our stored Group Key at `keyEpoch` for a member — the repo-bound path the grant flow uses.
 * Loads our wrapping keypair + the epoch key, then delegates to the pure `wrapGroupKeyFor`.
 */
export async function wrapStoredGroupKeyFor(
  groupId: string,
  keyEpoch: number,
  peerWrappingPublicJwk: JsonWebKey
): Promise<GroupKeyGrant> {
  const [wrapping, key] = await Promise.all([getWrappingKeypair(), loadGroupKey(groupId, keyEpoch)]);
  if (!wrapping) throw new Error('Device wrapping keys missing — claim the account first');
  if (!key) throw new Error(`No Group Key for ${groupId}:${keyEpoch}`);
  return wrapGroupKeyFor(key, wrapping, peerWrappingPublicJwk);
}

/** Redeem a grant: unwrap with our device wrapping key and persist the Group Key locally. */
export async function redeemGroupKeyGrant(groupId: string, keyEpoch: number, grant: GroupKeyGrant): Promise<CryptoKey> {
  const wrapping = await getWrappingKeypair();
  if (!wrapping) throw new Error('Device wrapping keys missing — claim the account first');
  const key = await unwrapGroupKey(grant, wrapping.privateKey);
  await persistGroupKey(groupId, keyEpoch, key);
  return key;
}

// ─── Event / name encryption ──────────────────────────────────────────────────────

/** Encrypt a JSON-serialisable value with a Group Key → base64(iv || ciphertext), opaque to the server. */
export async function encryptForGroup(groupKey: CryptoKey, value: unknown): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const { iv, ciphertext } = await encrypt(groupKey, plaintext);
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(new Uint8Array(iv), 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return bufToB64(combined.buffer);
}

/** Decrypt a base64(iv || ciphertext) blob produced by {@link encryptForGroup}. */
export async function decryptFromGroup<T = unknown>(groupKey: CryptoKey, blobB64: string): Promise<T> {
  const combined = new Uint8Array(b64ToBuf(blobB64));
  const iv = combined.slice(0, 12).buffer;
  const ciphertext = combined.slice(12).buffer;
  const plaintext = await decrypt(groupKey, iv, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
