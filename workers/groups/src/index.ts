// Penny Groups Worker (Phase 1.5 Track E).
// Shared-ledger relay for Groups & Household OS: create groups, invite/join, relay wrapped key-grants,
// and append/fetch group events. CIPHERTEXT ONLY (Model B) — the server never sees the group name,
// member names, financial data, or Group Keys. Follows the Track A/C worker template.
//
// Auth: the same challenge/response signed-request scheme as workers/auth. This worker issues its own
// nonces (GET /challenge) in its own KV, and verifies signatures against the device signing key read
// from the auth worker's `devices` table via the read-only AUTH_DB binding. Every group route then adds
// a membership (and, where needed, a role) check. See workers/groups/README.md.

import { json, preflight } from './cors';
import { isRateLimited } from './ratelimit';
import { sha256Hex, verifyRequestSignature } from './lib/auth';
import {
  canAssignRole,
  canCloseGroup,
  canManageMembers,
  grantableEpochs,
  isGroupType,
  isHistoryVisibility,
  isInviteRedeemable,
  isRole,
  type GroupRole
} from './lib/membership';
import {
  appendEvent,
  bumpGroupEpoch,
  getDeviceSigningKey,
  getGroup,
  getInvite,
  getMember,
  getUserWrappingKey,
  incrementInviteUses,
  insertGroup,
  insertInvite,
  listEventsSince,
  listGrantsForUser,
  listMembers,
  putGrant,
  revokeInvite,
  setGroupStatus,
  setMemberRole,
  setMemberStatus,
  upsertMember
} from './groupsStore';

export interface Env {
  CACHE: KVNamespace;
  DB: D1Database;
  AUTH_DB: D1Database;
  EVENTS: R2Bucket;
}

const NONCE_TTL_SEC = 60;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return preflight();

    const url = new URL(req.url);
    // Normalize so this works standalone (`/group`) and under a future single gateway (`/groups/group`).
    // Signature verification uses the ORIGINAL url.pathname the client signed — see authenticate().
    const route = url.pathname.replace(/^\/groups(?=\/|$)/, '') || '/';
    if (route === '/health') return json({ status: 'ok', ts: Date.now() });

    const ip = req.headers.get('cf-connecting-ip') ?? 'anon';
    if (await isRateLimited(env.CACHE, ip)) return json({ error: 'rate_limited' }, 429);

    try {
      if (req.method === 'GET' && route === '/challenge') return await handleChallenge(url, env);

      const seg = route.split('/').filter(Boolean); // e.g. ['group', ':id', 'events']

      if (req.method === 'POST' && route === '/group') return await handleCreateGroup(req, env, url);
      if (req.method === 'POST' && route === '/invite/redeem') return await handleRedeem(req, env, url);
      if (req.method === 'POST' && route === '/invite/revoke') return await handleRevoke(req, env, url);

      if (seg[0] === 'group' && seg[1]) {
        const groupId = seg[1];
        if (req.method === 'GET' && seg.length === 2) return await handleGetGroup(req, env, url, groupId);
        if (req.method === 'POST' && seg[2] === 'invite') return await handleCreateInvite(req, env, url, groupId);
        if (req.method === 'GET' && seg[2] === 'members') return await handleListMembers(req, env, url, groupId);
        if (req.method === 'POST' && seg[2] === 'member') return await handleMemberChange(req, env, url, groupId);
        if (req.method === 'POST' && seg[2] === 'grant') return await handleGrant(req, env, url, groupId);
        if (req.method === 'GET' && seg[2] === 'grants') return await handleGetGrants(req, env, url, groupId);
        if (req.method === 'POST' && seg[2] === 'events') return await handleAppendEvents(req, env, url, groupId);
        if (req.method === 'GET' && seg[2] === 'events') return await handleGetEvents(req, env, url, groupId);
        if (req.method === 'POST' && seg[2] === 'close') return await handleClose(req, env, url, groupId, 'closed');
        if (req.method === 'POST' && seg[2] === 'reopen') return await handleClose(req, env, url, groupId, 'active');
      }
    } catch (err) {
      return json({ error: 'server_error', message: err instanceof Error ? err.message : 'unknown' }, 500);
    }

    return json({ error: 'not_found' }, 404);
  }
};

// ─── Challenge (unsigned) ──────────────────────────────────────────────────────

async function handleChallenge(url: URL, env: Env): Promise<Response> {
  const userId = url.searchParams.get('user_id');
  if (!userId) return json({ error: 'bad_request', message: 'user_id required' }, 400);
  const nonce = crypto.randomUUID();
  await env.CACHE.put(`challenge:${nonce}`, userId, { expirationTtl: NONCE_TTL_SEC });
  return json({ nonce, ttl: NONCE_TTL_SEC });
}

// ─── Group routes ──────────────────────────────────────────────────────────────

async function handleCreateGroup(req: Request, env: Env, url: URL): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;

  const body = safeParse(bodyText);
  const type = body?.type;
  const encName = str(body?.enc_name);
  const historyVisibility = body?.history_visibility ?? 'from_join';
  if (!isGroupType(type) || !encName || !isHistoryVisibility(historyVisibility)) {
    return json({ error: 'bad_request', message: 'type, enc_name, history_visibility required' }, 400);
  }

  const groupId = crypto.randomUUID();
  const now = Date.now();
  await insertGroup(env.DB, { groupId, type, encName, ownerId: auth.userId, historyVisibility, now });
  await upsertMember(env.DB, { groupId, userId: auth.userId, role: 'owner', now });
  return json({ ok: true, group_id: groupId, key_epoch: 1 });
}

async function handleGetGroup(req: Request, env: Env, url: URL, groupId: string): Promise<Response> {
  const auth = await authenticate(req, env, url, '');
  if ('error' in auth) return auth.error;
  const member = await getMember(env.DB, groupId, auth.userId);
  if (!member || member.status !== 'active') return json({ error: 'forbidden' }, 403);
  const group = await getGroup(env.DB, groupId);
  if (!group) return json({ error: 'not_found' }, 404);
  return json({
    group_id: group.group_id,
    type: group.type,
    enc_name: group.enc_name,
    owner_id: group.owner_id,
    key_epoch: group.key_epoch,
    history_visibility: group.history_visibility,
    status: group.status,
    role: member.role
  });
}

async function handleCreateInvite(req: Request, env: Env, url: URL, groupId: string): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;
  const member = await requireRole(env, groupId, auth.userId, canManageMembers);
  if ('error' in member) return member.error;

  const body = safeParse(bodyText);
  const tokenHash = str(body?.token_hash);
  const role = isRole(body?.role) ? (body?.role as GroupRole) : 'member';
  const expiresAt = num(body?.expires_at);
  const maxUses = Math.max(1, Math.min(50, num(body?.max_uses) || 1));
  if (!/^[0-9a-f]{64}$/.test(tokenHash) || !expiresAt) {
    return json({ error: 'bad_request', message: 'token_hash (sha256 hex) + expires_at required' }, 400);
  }
  // An admin can never mint an invite that grants a role above their own reach.
  if (!canAssignRole(member.role, role)) return json({ error: 'forbidden', message: 'cannot invite at that role' }, 403);

  await insertInvite(env.DB, { tokenHash, groupId, role, expiresAt, maxUses, createdBy: auth.userId, now: Date.now() });
  return json({ ok: true });
}

async function handleRedeem(req: Request, env: Env, url: URL): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;

  const body = safeParse(bodyText);
  const tokenHash = str(body?.token_hash);
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return json({ error: 'bad_request', message: 'token_hash required' }, 400);

  const invite = await getInvite(env.DB, tokenHash);
  if (!invite || !isInviteRedeemable(invite, Date.now())) return json({ error: 'invalid_invite' }, 410);
  const group = await getGroup(env.DB, invite.group_id);
  if (!group || group.status !== 'active') return json({ error: 'invalid_invite' }, 410);

  const now = Date.now();
  await upsertMember(env.DB, { groupId: invite.group_id, userId: auth.userId, role: invite.role, now });
  await incrementInviteUses(env.DB, tokenHash);

  // Return group meta so the joiner can render the group immediately; the Group Key arrives later as a
  // wrapped grant (an admin wraps it to this member's device wrapping key — see GET /group/:id/grants).
  return json({
    ok: true,
    group_id: group.group_id,
    type: group.type,
    enc_name: group.enc_name,
    owner_id: group.owner_id,
    key_epoch: group.key_epoch,
    history_visibility: group.history_visibility,
    role: invite.role
  });
}

async function handleRevoke(req: Request, env: Env, url: URL): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;
  const body = safeParse(bodyText);
  const tokenHash = str(body?.token_hash);
  const groupId = str(body?.group_id);
  if (!tokenHash || !groupId) return json({ error: 'bad_request' }, 400);
  const member = await requireRole(env, groupId, auth.userId, canManageMembers);
  if ('error' in member) return member.error;
  await revokeInvite(env.DB, tokenHash, groupId);
  return json({ ok: true });
}

async function handleListMembers(req: Request, env: Env, url: URL, groupId: string): Promise<Response> {
  const auth = await authenticate(req, env, url, '');
  if ('error' in auth) return auth.error;
  const me = await getMember(env.DB, groupId, auth.userId);
  if (!me || me.status !== 'active') return json({ error: 'forbidden' }, 403);

  const members = await listMembers(env.DB, groupId);
  // Attach each member's wrapping public key (from auth devices) so an admin can wrap key-grants.
  const withKeys = await Promise.all(
    members.map(async (m) => ({
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      joined_at: m.joined_at,
      left_at: m.left_at,
      wrapping_key: await getUserWrappingKey(env.AUTH_DB, m.user_id)
    }))
  );
  return json({ members: withKeys });
}

async function handleMemberChange(req: Request, env: Env, url: URL, groupId: string): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;
  const me = await getMember(env.DB, groupId, auth.userId);
  if (!me) return json({ error: 'forbidden' }, 403);
  const myRole = me.role as GroupRole;

  const body = safeParse(bodyText);
  const action = str(body?.action); // 'leave' | 'set_role' | 'remove'
  const targetUserId = str(body?.user_id) || auth.userId;

  if (action === 'leave') {
    if (targetUserId !== auth.userId) return json({ error: 'forbidden' }, 403);
    await setMemberStatus(env.DB, groupId, auth.userId, 'left', Date.now());
    return json({ ok: true });
  }

  // Managing another member requires an admin/owner, and role changes obey the hierarchy.
  if (!canManageMembers(myRole)) return json({ error: 'forbidden' }, 403);
  if (action === 'remove') {
    await setMemberStatus(env.DB, groupId, targetUserId, 'left', Date.now());
    return json({ ok: true });
  }
  if (action === 'set_role') {
    const role = body?.role;
    if (!isRole(role) || !canAssignRole(myRole, role)) return json({ error: 'forbidden' }, 403);
    await setMemberRole(env.DB, groupId, targetUserId, role);
    return json({ ok: true });
  }
  return json({ error: 'bad_request', message: 'unknown action' }, 400);
}

async function handleGrant(req: Request, env: Env, url: URL, groupId: string): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;
  const me = await requireRole(env, groupId, auth.userId, canManageMembers);
  if ('error' in me) return me.error;

  const body = safeParse(bodyText);
  const userId = str(body?.user_id);
  const grants = Array.isArray(body?.grants) ? (body?.grants as unknown[]) : [];
  if (!userId || grants.length === 0) return json({ error: 'bad_request', message: 'user_id + grants[] required' }, 400);

  const group = await getGroup(env.DB, groupId);
  if (!group) return json({ error: 'not_found' }, 404);
  const allowed = new Set(grantableEpochs(group.key_epoch, group.history_visibility as 'full' | 'from_join'));

  const now = Date.now();
  for (const g of grants) {
    const grant = g as { key_epoch?: unknown; wrapped_key?: unknown };
    const keyEpoch = num(grant.key_epoch);
    const wrappedKey = str(grant.wrapped_key);
    if (!keyEpoch || !wrappedKey || !allowed.has(keyEpoch)) continue; // skip epochs the policy forbids
    await putGrant(env.DB, { groupId, userId, keyEpoch, wrappedKey, now });
  }
  return json({ ok: true });
}

async function handleGetGrants(req: Request, env: Env, url: URL, groupId: string): Promise<Response> {
  const auth = await authenticate(req, env, url, '');
  if ('error' in auth) return auth.error;
  const me = await getMember(env.DB, groupId, auth.userId);
  if (!me || me.status !== 'active') return json({ error: 'forbidden' }, 403);
  const grants = await listGrantsForUser(env.DB, groupId, auth.userId);
  return json({ grants: grants.map((g) => ({ key_epoch: g.key_epoch, wrapped_key: g.wrapped_key })) });
}

async function handleAppendEvents(req: Request, env: Env, url: URL, groupId: string): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;
  const me = await getMember(env.DB, groupId, auth.userId);
  if (!me || me.status !== 'active') return json({ error: 'forbidden' }, 403);
  const group = await getGroup(env.DB, groupId);
  if (!group) return json({ error: 'not_found' }, 404);
  if (group.status !== 'active') return json({ error: 'group_closed' }, 409);

  const body = safeParse(bodyText);
  const events = Array.isArray(body?.events) ? (body?.events as unknown[]) : [];
  if (events.length === 0) return json({ error: 'bad_request', message: 'events[] required' }, 400);

  const now = Date.now();
  const assigned: { event_id: string; seq: number }[] = [];
  for (const e of events) {
    const ev = e as { event_id?: unknown; key_epoch?: unknown; lamport?: unknown; ciphertext?: unknown };
    const eventId = str(ev.event_id);
    const keyEpoch = num(ev.key_epoch);
    const lamport = num(ev.lamport);
    const ciphertext = str(ev.ciphertext); // base64(iv||AES-GCM ciphertext) — opaque to the server
    if (!eventId || !keyEpoch || !ciphertext) continue;

    const { seq, deduped } = await appendEvent(env.DB, {
      groupId,
      eventId,
      authorId: auth.userId,
      keyEpoch,
      r2Key: (s) => `gevent/${groupId}/${s}`,
      lamport,
      now
    });
    if (!deduped) await env.EVENTS.put(`gevent/${groupId}/${seq}`, ciphertext);
    assigned.push({ event_id: eventId, seq });
  }
  return json({ ok: true, assigned });
}

async function handleGetEvents(req: Request, env: Env, url: URL, groupId: string): Promise<Response> {
  const auth = await authenticate(req, env, url, '');
  if ('error' in auth) return auth.error;
  const me = await getMember(env.DB, groupId, auth.userId);
  if (!me || me.status !== 'active') return json({ error: 'forbidden' }, 403);

  const since = parseInt(url.searchParams.get('since') ?? '0', 10) || 0;
  const rows = await listEventsSince(env.DB, groupId, since);
  const events = await Promise.all(
    rows.map(async (r) => {
      const obj = await env.EVENTS.get(r.r2_key);
      const ciphertext = obj ? await obj.text() : null;
      return {
        seq: r.seq,
        event_id: r.event_id,
        author_id: r.author_id,
        key_epoch: r.key_epoch,
        lamport: r.lamport,
        created_at: r.created_at,
        ciphertext
      };
    })
  );
  return json({ events });
}

async function handleClose(req: Request, env: Env, url: URL, groupId: string, status: 'closed' | 'active'): Promise<Response> {
  const bodyText = await req.text();
  const auth = await authenticate(req, env, url, bodyText);
  if ('error' in auth) return auth.error;
  const me = await requireRole(env, groupId, auth.userId, canCloseGroup);
  if ('error' in me) return me.error;
  await setGroupStatus(env.DB, groupId, status, Date.now());
  // A close/reopen bumps the epoch on close so post-close membership can't decrypt new activity later.
  if (status === 'closed') await bumpGroupEpoch(env.DB, groupId, Date.now());
  return json({ ok: true, status });
}

// ─── Auth + membership helpers ─────────────────────────────────────────────────

interface AuthOk {
  userId: string;
}
interface AuthErr {
  error: Response;
}

/**
 * Verify a signed request. Consumes the single-use nonce from this worker's KV, loads the device's
 * public signing key from the auth DB (AUTH_DB), and verifies the signature over
 * nonce||method||path||sha256(body). `bodyText` must be the exact raw body the client hashed.
 */
async function authenticate(req: Request, env: Env, url: URL, bodyText: string): Promise<AuthOk | AuthErr> {
  const userId = req.headers.get('x-penny-user');
  const deviceId = req.headers.get('x-penny-device');
  const nonce = req.headers.get('x-penny-nonce');
  const signatureB64 = req.headers.get('x-penny-sig');
  if (!userId || !deviceId || !nonce || !signatureB64) {
    return { error: json({ error: 'unauthorized', message: 'missing auth headers' }, 401) };
  }

  const nonceKey = `challenge:${nonce}`;
  const nonceUser = await env.CACHE.get(nonceKey);
  if (nonceUser === null || nonceUser !== userId) {
    return { error: json({ error: 'unauthorized', message: 'invalid or expired nonce' }, 401) };
  }
  await env.CACHE.delete(nonceKey);

  const device = await getDeviceSigningKey(env.AUTH_DB, deviceId);
  if (!device || device.userId !== userId || device.revoked) {
    return { error: json({ error: 'unauthorized', message: 'unknown or revoked device' }, 401) };
  }

  const bodyHash = await sha256Hex(bodyText);
  const publicJwk = safeParse(device.signingKey) as JsonWebKey | null;
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

  return { userId };
}

/** Load the caller's active membership and enforce a role predicate; returns the member row or a 403. */
async function requireRole(
  env: Env,
  groupId: string,
  userId: string,
  predicate: (role: GroupRole) => boolean
): Promise<{ role: GroupRole } | AuthErr> {
  const member = await getMember(env.DB, groupId, userId);
  if (!member || member.status !== 'active') return { error: json({ error: 'forbidden' }, 403) };
  const role = member.role as GroupRole;
  if (!predicate(role)) return { error: json({ error: 'forbidden', message: 'insufficient role' }, 403) };
  return { role };
}

// ─── helpers ─────────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function safeParse(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
