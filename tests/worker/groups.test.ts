import { describe, expect, it } from 'vitest';
import {
  canAssignRole,
  canCloseGroup,
  canManageMembers,
  clampInviteExpiry,
  grantableEpochs,
  isGroupType,
  isHistoryVisibility,
  isInviteRedeemable,
  isRole,
  type InviteRow
} from '../../workers/groups/src/lib/membership';
import { buildSigningString, sha256Hex, verifyRequestSignature } from '../../workers/groups/src/lib/auth';

function invite(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    token_hash: 'a'.repeat(64),
    group_id: 'g1',
    role: 'member',
    expires_at: 10_000,
    max_uses: 1,
    uses: 0,
    revoked: 0,
    created_by: 'u1',
    created_at: 0,
    ...overrides
  };
}

describe('role checks', () => {
  it('only owner/admin manage members and close the group', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('member')).toBe(false);
    expect(canCloseGroup('owner')).toBe(true);
    expect(canCloseGroup('member')).toBe(false);
  });

  it('an owner may assign any role; an admin may only touch plain members', () => {
    expect(canAssignRole('owner', 'admin')).toBe(true);
    expect(canAssignRole('owner', 'owner')).toBe(true);
    expect(canAssignRole('admin', 'member')).toBe(true);
    expect(canAssignRole('admin', 'admin')).toBe(false);
    expect(canAssignRole('member', 'member')).toBe(false);
  });
});

describe('validators', () => {
  it('accepts known group types / visibilities / roles and rejects junk', () => {
    expect(isGroupType('trip')).toBe(true);
    expect(isGroupType('spaceship')).toBe(false);
    expect(isHistoryVisibility('full')).toBe(true);
    expect(isHistoryVisibility('sometimes')).toBe(false);
    expect(isRole('owner')).toBe(true);
    expect(isRole('root')).toBe(false);
  });
});

describe('invite redeemability', () => {
  const now = 5_000;
  it('accepts a fresh, unexpired, unrevoked invite with uses left', () => {
    expect(isInviteRedeemable(invite(), now)).toBe(true);
  });
  it('rejects revoked / expired / exhausted invites', () => {
    expect(isInviteRedeemable(invite({ revoked: 1 }), now)).toBe(false);
    expect(isInviteRedeemable(invite({ expires_at: now - 1 }), now)).toBe(false);
    expect(isInviteRedeemable(invite({ uses: 1, max_uses: 1 }), now)).toBe(false);
  });
  it('allows a multi-use invite until uses hit max', () => {
    expect(isInviteRedeemable(invite({ max_uses: 3, uses: 2 }), now)).toBe(true);
    expect(isInviteRedeemable(invite({ max_uses: 3, uses: 3 }), now)).toBe(false);
  });
});

describe('grantableEpochs (history visibility)', () => {
  it('from_join grants only the current epoch', () => {
    expect(grantableEpochs(3, 'from_join')).toEqual([3]);
  });
  it('full grants every epoch up to current', () => {
    expect(grantableEpochs(3, 'full')).toEqual([1, 2, 3]);
    expect(grantableEpochs(1, 'full')).toEqual([1]);
  });
});

describe('clampInviteExpiry', () => {
  const now = 1_000_000;
  it('floors to 5 min and caps at 30 days', () => {
    expect(clampInviteExpiry(now + 1_000, now)).toBe(now + 5 * 60_000); // too short → floored
    expect(clampInviteExpiry(now + 999 * 24 * 60 * 60_000, now)).toBe(now + 30 * 24 * 60 * 60_000); // capped
  });
  it('passes a reasonable TTL through', () => {
    const wanted = now + 60 * 60_000; // 1h
    expect(clampInviteExpiry(wanted, now)).toBe(wanted);
  });
});

describe('signed-request verification (shared with auth worker)', () => {
  async function genKeypair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  }
  async function signString(privateKey: CryptoKey, s: string): Promise<string> {
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(s));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  }

  it('accepts a genuine signature over a POST body and rejects tampering', async () => {
    const { publicKey, privateKey } = await genKeypair();
    const publicJwk = await crypto.subtle.exportKey('jwk', publicKey);
    const bodyHash = await sha256Hex(JSON.stringify({ type: 'trip' }));
    const parts = { nonce: 'n', method: 'POST', path: '/group', bodyHash };
    const signatureB64 = await signString(privateKey, buildSigningString(parts.nonce, parts.method, parts.path, parts.bodyHash));

    expect(await verifyRequestSignature({ publicJwk, signatureB64, ...parts })).toBe(true);
    expect(await verifyRequestSignature({ publicJwk, signatureB64, ...parts, path: '/group/other' })).toBe(false);
  });
});
