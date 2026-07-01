import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// AUTH_BASE is resolved from env at module load; mock the module so the client points at a test URL.
vi.mock('@/core/net/apiBase', () => ({ AUTH_BASE: 'https://auth.test' }));

import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import { profileRepo } from '@/core/db/repositories';
import { ensureIdentityKeys, getPublicJwks } from '@/core/crypto/identityKeys';
import { claimAccount, checkUsername, getClaimState, UsernameTakenError } from '@/core/identity/claim';
import { signedFetch } from '@/core/identity/signedFetch';
import { buildSigningString, sha256Hex, verifyRequestSignature } from '../../workers/auth/src/lib/auth';

const PASS = 'correct horse battery staple';
const PIN = '123456';

/** Route a mocked fetch by the request pathname suffix; returns JSON with the given status. */
function routedFetch(handlers: Record<string, (init: RequestInit | undefined) => { status?: number; body: unknown }>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url).pathname;
    const key = Object.keys(handlers).find((k) => path.endsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    const { status = 200, body } = handlers[key]!(init);
    return new Response(JSON.stringify(body), { status });
  });
}

beforeEach(async () => {
  await Promise.all([db.security.clear(), db.profile.clear(), db.device_keys.clear()]);
  keystore.lock();
  await initialize(PASS, PIN);
  await profileRepo.put({
    id: 'p1',
    displayName: 'Aarav',
    currency: 'INR',
    locale: 'en-IN',
    onboardingComplete: true,
    userId: 'user-uuid-1',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('checkUsername', () => {
  it('short-circuits invalid formats without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await checkUsername('ab')).toEqual({ available: false, reason: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns server availability for a valid format', async () => {
    vi.stubGlobal('fetch', routedFetch({ '/username/check': () => ({ body: { available: true } }) }));
    expect(await checkUsername('aarav_s')).toEqual({ available: true });
  });
});

describe('claimAccount', () => {
  it('registers userId + public keys + a device, and persists username/deviceId', async () => {
    let registerBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/register': (init) => {
          registerBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return { body: { user_id: 'user-uuid-1', username: 'aarav_s' } };
        },
        '/challenge': () => ({ body: { nonce: 'nonce-1', ttl: 60 } }),
        '/whoami': () => ({ body: { user_id: 'user-uuid-1', username: 'aarav_s' } })
      })
    );

    const out = await claimAccount('aarav_s');
    expect(out).toEqual({ user_id: 'user-uuid-1', username: 'aarav_s' });

    // Register payload carries the identity anchor + public JWKs + a device id.
    const jwks = await getPublicJwks();
    expect(registerBody).toMatchObject({
      user_id: 'user-uuid-1',
      username: 'aarav_s',
      device_signing_key: jwks!.signing,
      device_wrapping_key: jwks!.wrapping
    });
    expect(typeof registerBody!.device_id).toBe('string');

    // Local profile updated with username + deviceId.
    const state = await getClaimState();
    expect(state.claimed).toBe(true);
    expect(state.username).toBe('aarav_s');
    expect(state.deviceId).toBe(registerBody!.device_id);
  });

  it('surfaces a taken username as UsernameTakenError', async () => {
    vi.stubGlobal('fetch', routedFetch({ '/register': () => ({ status: 409, body: { error: 'username_taken' } }) }));
    await expect(claimAccount('taken_name')).rejects.toBeInstanceOf(UsernameTakenError);
  });
});

describe('signedFetch', () => {
  it('signs nonce||method||path||bodyHash verifiably against the device key', async () => {
    await ensureIdentityKeys();
    const profile = (await profileRepo.getAll())[0]!;
    await profileRepo.put({ ...profile, deviceId: 'device-1' });

    let signedHeaders: Headers | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/challenge?user_id=user-uuid-1')) {
          return new Response(JSON.stringify({ nonce: 'nonce-xyz', ttl: 60 }), { status: 200 });
        }
        signedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ user_id: 'user-uuid-1', username: null }), { status: 200 });
      })
    );

    const res = await signedFetch('/whoami');
    expect(res.ok).toBe(true);

    expect(signedHeaders!.get('x-penny-user')).toBe('user-uuid-1');
    expect(signedHeaders!.get('x-penny-device')).toBe('device-1');
    expect(signedHeaders!.get('x-penny-nonce')).toBe('nonce-xyz');

    // The signature verifies against the device's public signing key over the exact signing string.
    const jwks = await getPublicJwks();
    const bodyHash = await sha256Hex('');
    const ok = await verifyRequestSignature({
      publicJwk: jwks!.signing,
      signatureB64: signedHeaders!.get('x-penny-sig')!,
      nonce: 'nonce-xyz',
      method: 'GET',
      path: '/whoami',
      bodyHash
    });
    expect(ok).toBe(true);
    expect(buildSigningString('nonce-xyz', 'GET', '/whoami', bodyHash)).toBe(`nonce-xyz\nGET\n/whoami\n${bodyHash}`);
  });
});
