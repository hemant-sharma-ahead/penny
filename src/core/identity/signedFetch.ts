// Authenticated calls to the auth/sync/groups workers (Phase 1.5 Track C).
// The single choke point for signed requests — Tracks D and E reuse it.
//
// Flow: GET /challenge?user_id → sign `nonce\nMETHOD\npath\nsha256(body)` with the device signing
// key → attach x-penny-* headers → fetch. The signing-string construction + body hash MUST stay
// identical to the worker's workers/auth/src/lib/auth.ts.
import { AUTH_BASE } from '@/core/net/apiBase';
import { sign } from '@/core/crypto/engine';
import { getSigningKeypair } from '@/core/crypto/identityKeys';
import { profileRepo } from '@/core/db/repositories';

/** Thrown when no auth backend is configured (VITE_AUTH_PROXY / VITE_API_PROXY unset). */
export class SyncNotConfiguredError extends Error {
  constructor() {
    super('Sync backend not configured');
    this.name = 'SyncNotConfiguredError';
  }
}

/** Thrown when this device hasn't claimed an account (no userId/deviceId or identity keys). */
export class NotClaimedError extends Error {
  constructor(message = 'Account not claimed on this device') {
    super(message);
    this.name = 'NotClaimedError';
  }
}

/** Must match workers/auth/src/lib/auth.ts exactly. */
function buildSigningString(nonce: string, method: string, path: string, bodyHash: string): string {
  return [nonce, method.toUpperCase(), path, bodyHash].join('\n');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/**
 * Fetch an auth-worker endpoint with a signed request. `path` is relative to AUTH_BASE (e.g.
 * '/whoami'); a string `init.body` is hashed into the signature. Requires an unlocked session with
 * a claimed account (userId + deviceId + device signing key).
 */
export async function signedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!AUTH_BASE) throw new SyncNotConfiguredError();

  const profile = (await profileRepo.getAll())[0];
  const userId = profile?.userId;
  const deviceId = profile?.deviceId;
  if (!userId || !deviceId) throw new NotClaimedError();

  const signing = await getSigningKeypair();
  if (!signing) throw new NotClaimedError('Device identity keys missing');

  // 1. Obtain a single-use nonce bound to this user.
  const challengeRes = await fetch(`${AUTH_BASE}/challenge?user_id=${encodeURIComponent(userId)}`);
  if (!challengeRes.ok) throw new Error(`Challenge request failed: ${challengeRes.status}`);
  const { nonce } = (await challengeRes.json()) as { nonce: string };

  // 2. Sign nonce||method||path||bodyHash over the ACTUAL request pathname.
  const url = `${AUTH_BASE}${path}`;
  const method = (init.method ?? 'GET').toUpperCase();
  const bodyText = typeof init.body === 'string' ? init.body : '';
  const bodyHash = await sha256Hex(bodyText);
  const pathname = new URL(url).pathname;
  const signature = bufferToBase64(
    await sign(signing.privateKey, new TextEncoder().encode(buildSigningString(nonce, method, pathname, bodyHash)))
  );

  const headers = new Headers(init.headers);
  headers.set('x-penny-user', userId);
  headers.set('x-penny-device', deviceId);
  headers.set('x-penny-nonce', nonce);
  headers.set('x-penny-sig', signature);
  if (bodyText) headers.set('Content-Type', 'application/json');

  return fetch(url, { ...init, method, headers });
}
