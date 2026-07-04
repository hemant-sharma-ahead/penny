// Penny Auth/Identity Worker (Phase 1.5 Track C).
// Username claim + device registration + challenge/response signed-request auth. Stores identity
// metadata only (users + devices) — no financial data, no PII, no personal blob (Model B).
// Follows the Track A worker template (workers/api-proxy/). See workers/auth/README.md.

import { json, preflight } from './cors';
import { isRateLimited } from './ratelimit';
import { isValidUsername } from './lib/username';
import { sha256Hex, verifyRequestSignature } from './lib/auth';
import {
  deleteAccount,
  deleteStaleUsers,
  getDevice,
  getUser,
  touchUser,
  upsertDevice,
  upsertUser,
  userIdForUsername
} from './authStore';

export interface Env {
  CACHE: KVNamespace;
  DB: D1Database;
}

const NONCE_TTL_SEC = 60;
// Inactivity GC: reclaim accounts/usernames with no authenticated activity for this long (lost-device
// backstop — the deterministic path is deregister-on-erase). Deregister-on-erase covers the common case.
const INACTIVE_TTL_DAYS = 365;
const DAY_MS = 86_400_000;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return preflight();

    const url = new URL(req.url);
    // Route on a normalized path so this works both standalone (`/whoami`) and under a future
    // single gateway that forwards the full path unstripped (`/auth/whoami`). Signature
    // verification still uses the ORIGINAL url.pathname the client signed — see authenticate().
    const route = url.pathname.replace(/^\/auth(?=\/|$)/, '') || '/';
    if (route === '/health') return json({ status: 'ok', ts: Date.now() });

    const ip = req.headers.get('cf-connecting-ip') ?? 'anon';
    if (await isRateLimited(env.CACHE, ip)) return json({ error: 'rate_limited' }, 429);

    try {
      if (req.method === 'POST' && route === '/username/check') return await handleUsernameCheck(req, env, ip);
      if (req.method === 'POST' && route === '/register') return await handleRegister(req, env, ip);
      if (req.method === 'GET' && route === '/challenge') return await handleChallenge(url, env);
      if (req.method === 'GET' && route === '/whoami') return await handleWhoami(req, env, url);
      if (req.method === 'POST' && route === '/device') return await handleAddDevice(req, env, url);
      if (req.method === 'DELETE' && route === '/account') return await handleDeleteAccount(req, env, url);
    } catch (err) {
      // Never leak internals or PII.
      return json({ error: 'server_error', message: err instanceof Error ? err.message : 'unknown' }, 500);
    }

    return json({ error: 'not_found' }, 404);
  },

  // Inactivity garbage-collection (Cron) — reclaim orphaned accounts/usernames whose device keys are
  // permanently lost (no deregister-on-erase, no backup, no other device).
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await deleteStaleUsers(env.DB, Date.now() - INACTIVE_TTL_DAYS * DAY_MS);
  }
};

// ─── Unsigned endpoints ─────────────────────────────────────────────────────────

async function handleUsernameCheck(req: Request, env: Env, ip: string): Promise<Response> {
  if (await isRateLimited(env.CACHE, `check:${ip}`, 60, 60)) return json({ error: 'rate_limited' }, 429);
  const body = (await req.json().catch(() => null)) as { username?: unknown } | null;
  const username = typeof body?.username === 'string' ? body.username : '';
  if (!isValidUsername(username)) return json({ available: false, reason: 'invalid' });
  const taken = (await userIdForUsername(env.DB, username)) !== null;
  return json({ available: !taken });
}

async function handleRegister(req: Request, env: Env, ip: string): Promise<Response> {
  if (await isRateLimited(env.CACHE, `reg:${ip}`, 30, 60)) return json({ error: 'rate_limited' }, 429);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'bad_request' }, 400);

  const userId = str(body.user_id);
  const signingKey = str(body.signing_key);
  const deviceId = str(body.device_id);
  const deviceSigningKey = str(body.device_signing_key);
  const deviceWrappingKey = str(body.device_wrapping_key);
  if (!userId || !signingKey || !deviceId || !deviceSigningKey || !deviceWrappingKey) {
    return json({ error: 'bad_request', message: 'missing required fields' }, 400);
  }

  const username = str(body.username);
  if (username) {
    if (!isValidUsername(username)) return json({ error: 'invalid_username' }, 400);
    const holder = await userIdForUsername(env.DB, username);
    if (holder !== null && holder !== userId) return json({ error: 'username_taken' }, 409);
  }

  const now = Date.now();
  await upsertUser(env.DB, {
    userId,
    username: username || null,
    signingKey,
    kdfSalt: str(body.kdf_salt) || null,
    now
  });
  await upsertDevice(env.DB, {
    deviceId,
    userId,
    signingKey: deviceSigningKey,
    wrappingKey: deviceWrappingKey,
    label: str(body.label) || null,
    now
  });

  return json({ ok: true, user_id: userId, username: username || null });
}

async function handleChallenge(url: URL, env: Env): Promise<Response> {
  const userId = url.searchParams.get('user_id');
  if (!userId) return json({ error: 'bad_request', message: 'user_id required' }, 400);
  const nonce = crypto.randomUUID();
  await env.CACHE.put(`challenge:${nonce}`, userId, { expirationTtl: NONCE_TTL_SEC });
  return json({ nonce, ttl: NONCE_TTL_SEC });
}

// ─── Signed endpoints ────────────────────────────────────────────────────────────

async function handleWhoami(req: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(req, env, url, '');
  if ('error' in auth) return auth.error;
  const user = await getUser(env.DB, auth.userId);
  if (!user) return json({ error: 'unknown_user' }, 404);
  return json({ user_id: user.user_id, username: user.username });
}

async function handleAddDevice(req: Request, env: Env, url: URL): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;

  const body = safeParse(bodyText);
  const deviceId = str(body?.device_id);
  const deviceSigningKey = str(body?.device_signing_key);
  const deviceWrappingKey = str(body?.device_wrapping_key);
  if (!deviceId || !deviceSigningKey || !deviceWrappingKey) {
    return json({ error: 'bad_request', message: 'missing device fields' }, 400);
  }

  await upsertDevice(env.DB, {
    deviceId,
    userId: auth.userId,
    signingKey: deviceSigningKey,
    wrappingKey: deviceWrappingKey,
    label: str(body?.label) || null,
    now: Date.now()
  });
  return json({ ok: true, device_id: deviceId });
}

/** Deregister this account: delete the user + all its devices, releasing the username. Signed. */
async function handleDeleteAccount(req: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(req, env, url, '');
  if ('error' in auth) return auth.error;
  await deleteAccount(env.DB, auth.userId);
  return json({ ok: true });
}

// ─── Signed-request verification ─────────────────────────────────────────────────

interface AuthOk {
  userId: string;
}
interface AuthErr {
  error: Response;
}

/**
 * Verify a signed request. Consumes the single-use nonce from KV, loads the device's public key,
 * and verifies the signature over nonce||method||path||sha256(body). `bodyText` must be the exact
 * raw body the client hashed ('' for a bodyless GET).
 */
async function authenticate(req: Request, env: Env, url: URL, bodyText: string): Promise<AuthOk | AuthErr> {
  const userId = req.headers.get('x-penny-user');
  const deviceId = req.headers.get('x-penny-device');
  const nonce = req.headers.get('x-penny-nonce');
  const signatureB64 = req.headers.get('x-penny-sig');
  if (!userId || !deviceId || !nonce || !signatureB64) {
    return { error: json({ error: 'unauthorized', message: 'missing auth headers' }, 401) };
  }

  // Single-use nonce: it must exist, belong to this user, and is deleted on read.
  const nonceKey = `challenge:${nonce}`;
  const nonceUser = await env.CACHE.get(nonceKey);
  if (nonceUser === null || nonceUser !== userId) {
    return { error: json({ error: 'unauthorized', message: 'invalid or expired nonce' }, 401) };
  }
  await env.CACHE.delete(nonceKey);

  const device = await getDevice(env.DB, deviceId);
  if (!device || device.user_id !== userId || device.revoked_at !== null) {
    return { error: json({ error: 'unauthorized', message: 'unknown or revoked device' }, 401) };
  }

  const bodyHash = await sha256Hex(bodyText);
  const publicJwk = safeParse(device.signing_key) as JsonWebKey | null;
  const ok =
    publicJwk !== null &&
    (await verifyRequestSignature({
      publicJwk,
      signatureB64,
      nonce,
      method: req.method,
      path: url.pathname,
      bodyHash
    }));
  if (!ok) return { error: json({ error: 'unauthorized', message: 'bad signature' }, 401) };

  // Liveness for the inactivity GC (best-effort — never fail the request on this).
  await touchUser(env.DB, userId, Date.now()).catch(() => undefined);

  return { userId };
}

// ─── helpers ─────────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function safeParse(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
