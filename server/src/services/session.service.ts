import crypto from 'node:crypto';

import mongoose from 'mongoose';

import Session from '../models/session.model.ts';
import ApiError from '../utils/ApiError.ts';
import { decodeAccessToken } from '../config/jwt.ts';
import { recordAudit } from './audit.service.ts';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.ts';

/**
 * Phase 26A — session lifecycle.
 *
 * A session is the server-side half of an access token: the token's `jti` names
 * a row here, and `requireAuth` refuses a token whose row is missing, revoked or
 * expired. That is what makes sign-out real and a single device revocable
 * without touching any other session.
 *
 * Every function in this module takes `userId` as an explicit argument supplied
 * by the caller from `req.user.id` or from a user document the server already
 * loaded. No function ever accepts a userId, businessId or session owner from a
 * request body — a session is reachable only through its owner.
 */

/**
 * Local to this module, following `inventory.service.ts`, `product.service.ts`,
 * `audit.service.ts` and `users.service.ts`: every caller passes either the
 * string `req.user` carries or the ObjectId a document the server already loaded
 * holds, and the model casts whichever arrives.
 */
type IdLike = string | mongoose.Types.ObjectId;

/**
 * The session document, taken from the model itself rather than restated: this
 * is the SAME type `requireAuth` receives from `findActiveSessionByJti` and
 * hands back to `touchSession`, so a session can never be typed as one shape
 * where it is produced and another where it is consumed. Nothing is widened —
 * `_id`, `jti`, `deviceLabel`, `lastUsedAt`, `revokedAt`, `expiresAt` and the
 * timestamps are exactly the paths `models/session.model.ts` declares.
 */
type SessionDoc = mongoose.HydratedDocFromModel<typeof Session>;

/** The best-effort audit row written for each session-lifecycle change. */
type SessionAuditEvent = {
  businessId: IdLike;
  userId: IdLike;
  action: string;
  sessionId: IdLike | null;
  metadata: unknown;
};

/** The inputs `createSessionForToken` takes from login. */
type CreateSessionInput = {
  userId: IdLike;
  businessId: IdLike;
  token: string;
  deviceLabel?: unknown;
};

/** The owner-scoped input `revokeSessionById` takes from the HTTP layer. */
type RevokeSessionByIdInput = {
  userId: IdLike;
  businessId: IdLike;
  sessionId: unknown;
  now?: Date;
};

/** The token-scoped input `revokeSessionByJti` takes from the HTTP layer. */
type RevokeSessionByJtiInput = {
  userId: IdLike;
  businessId: IdLike;
  jti: string;
  now?: Date;
};

/** The user-scoped input `revokeAllSessions` takes. */
type RevokeAllSessionsInput = {
  userId: IdLike;
  businessId: IdLike;
  now?: Date;
};

/** 401 code for a token whose session is gone (revoked, expired, or unknown). */
export const SESSION_REVOKED_CODE = 'SESSION_REVOKED';
export const SESSION_REVOKED_MESSAGE = 'Session ended — please sign in again';

/**
 * AUTH-02 — 401 code for an EXPIRED access token whose session is still live.
 *
 * Deliberately distinct from SESSION_REVOKED: an expired token is recoverable
 * (the Firebase identity is untouched and a normal exchange can mint a fresh
 * session), whereas a revoked/unknown session is terminal. The two must never be
 * collapsed, which is why the code the target architecture requires is answered
 * here rather than reusing `INVALID_TOKEN` the way the pre-AUTH-02 middleware
 * did. Like SESSION_REVOKED it is a 401 — the request is still refused.
 */
export const SESSION_EXPIRED_CODE = 'SESSION_EXPIRED';
export const SESSION_EXPIRED_MESSAGE = 'Session expired — please sign in again';

/**
 * AUTH-02 — the Inventory session's ABSOLUTE lifetime: 14 days.
 *
 * This is the session's own boundary, not the token's. The access token lives
 * ~1 hour (`env.jwtExpiresIn`); the session row outlives many tokens so that
 * renewal (AUTH-03) has something to renew and so that a session cannot be made
 * immortal by renewing. The cap is anchored at creation and is NEVER extended by
 * a new token or a renewal; once it passes, the session is dead and the only way
 * forward is to authenticate through Firebase again and obtain a new session.
 */
export const SESSION_ABSOLUTE_CAP_DAYS = 14;
export const SESSION_ABSOLUTE_CAP_MS = SESSION_ABSOLUTE_CAP_DAYS * 24 * 60 * 60 * 1000;

export const DEFAULT_DEVICE_LABEL = 'Unknown device';
/** Labels are display-only, so they are capped rather than rejected. */
const DEVICE_LABEL_MAX = 60;

/**
 * How stale `lastUsedAt` must be before a request rewrites it. Without this the
 * liveness check would add a write to every single authenticated request; with
 * it, at most one write per session per interval. Chosen to be far coarser than
 * it is useful (nobody needs second-accurate "last used") and far finer than the
 * token lifetime.
 */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/** Upper bound on the session list — a user has a handful of devices, not thousands. */
export const MAX_SESSIONS_RETURNED = 50;

/**
 * The most sessions one account may hold OPEN at once.
 *
 * WHY THIS EXISTS. A session is the only thing that makes a token revocable, and
 * until this bound nothing limited how many could exist: every sign-in, every
 * app reinstall and every Exchange mints one more row, and each stays usable for
 * the full 14-day absolute cap. Two consequences were real rather than
 * theoretical — a token stolen from one device stays live for a fortnight even
 * when the owner has since signed in elsewhere, and a forgotten test device can
 * hold a working credential indefinitely inside the cap. `revokeAllSessions`
 * answers both only by signing the owner out everywhere, which is the wrong
 * trade for a normal person with a phone and a tablet.
 *
 * WHY 20, AND WHY NOT A TIGHTER NUMBER. Telemetry is not the basis here because
 * none exists; the number is a bound, not a target. A shop's shared tablet, a
 * personal phone and a reinstall every so often sit far below it, so an ordinary
 * member never notices this rule fire. A cap small enough to act as a policy
 * ("three devices") would sign real people out of a device they still use, and a
 * member cannot see or choose which one — that is a product decision nobody has
 * made. 20 therefore bounds accumulation without ever becoming the reason
 * somebody is asked to sign in again.
 *
 * The cap is enforced at creation only. A renewal reuses its existing row and
 * cannot add to the count, and revoking the OLDEST row (rather than refusing the
 * newest login) keeps the device in the member's hand working.
 */
export const MAX_ACTIVE_SESSIONS_PER_USER = 20;

/** A fresh, unguessable session id. Random, never derived from the user or time. */
export function newSessionId() {
  return crypto.randomUUID();
}

/**
 * Writes one session-lifecycle audit row, best-effort.
 *
 * The session change is already durable by the time this runs and cannot be
 * un-done by an audit failure, so a failure is logged and swallowed — the same
 * idiom the inventory ledger uses for its own best-effort audit. No `jti` is
 * ever written to the trail: the audit viewer is readable by every ADMIN of the
 * business, and a jti is the one value that could be replayed with a stolen
 * token. The session `_id` is the public identifier and is safe here.
 */
async function auditSession({ businessId, userId, action, sessionId, metadata }: SessionAuditEvent) {
  try {
    await recordAudit({
      businessId,
      userId,
      action,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: sessionId,
      metadata,
    });
  } catch (err) {
    console.error(`[session] audit record failed for ${action} (session change preserved): ${(err as { message?: unknown }).message}`);
  }
}

/**
 * Coerces a client-supplied device label into a safe display string.
 *
 * Deliberately NOT a validation failure: the label is cosmetic, and rejecting a
 * login because a client sent a malformed label would turn a harmless field into
 * a lockout. The value is only ever echoed back to the same user in the session
 * list, and it never reaches a query filter or an authorization decision.
 */
export function normalizeDeviceLabel(value: unknown) {
  if (typeof value !== 'string') return DEFAULT_DEVICE_LABEL;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_DEVICE_LABEL;
  return trimmed.slice(0, DEVICE_LABEL_MAX);
}

/**
 * Persists the session for a token that was just signed.
 *
 * AUTH-02: `expiresAt` is the session's own ABSOLUTE cap — 14 days from now —
 * and is deliberately NOT derived from the token's `exp`. The two lifetimes mean
 * different things: the token is a short-lived (~1 hour) credential, while the
 * session is the long-lived server-side record that tokens reference. Deriving
 * one from the other would tie session longevity to the JWT lifetime and make
 * renewal impossible; the cap is set once, here, and never moved afterwards.
 *
 * `businessId` is used only for the audit row (sessions carry no tenant); it
 * comes from the user document login already loaded, never from a request.
 */
export async function createSessionForToken({ userId, businessId, token, deviceLabel }: CreateSessionInput) {
  const payload = decodeAccessToken(token);
  if (!payload?.jti) {
    throw new ApiError(500, 'The access token carries no session id', 'SESSION_ID_REQUIRED');
  }
  const session = await Session.create({
    userId,
    jti: payload.jti,
    deviceLabel: normalizeDeviceLabel(deviceLabel),
    expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_CAP_MS),
  });
  await auditSession({
    businessId,
    userId,
    action: AUDIT_ACTIONS.SESSION_CREATED,
    sessionId: session._id,
    metadata: { deviceLabel: session.deviceLabel },
  });
  await enforceSessionCap({ userId, businessId });
  return session;
}

/**
 * Revokes the open sessions beyond `MAX_ACTIVE_SESSIONS_PER_USER`, oldest first.
 *
 * NEWEST-FIRST ORDER IS THE POINT. The session just created is the newest, so it
 * survives; the rows that fall past the cap are the ones nobody has used for
 * longest. Revoking on `createdAt` rather than an idle interval is deliberate —
 * a member cannot see an idle clock, but they can see that the oldest device is
 * the one that had to sign in again.
 *
 * BEST-EFFORT BY CONSTRUCTION, exactly like the audit write above it. The login
 * has already succeeded and its session is durable; failing the sign-in because
 * a cleanup query timed out would turn a housekeeping rule into a lockout. A
 * failure is logged and the next login tries again.
 *
 * Returns the ids it revoked, so the tests can assert the effect rather than
 * infer it from a count.
 */
async function enforceSessionCap({ userId, businessId, now = new Date() }: RevokeAllSessionsInput) {
  try {
    const active = await Session.find({ userId, revokedAt: null, expiresAt: { $gt: now } })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id deviceLabel')
      .lean();
    if (active.length <= MAX_ACTIVE_SESSIONS_PER_USER) return [];

    const excess = active.slice(MAX_ACTIVE_SESSIONS_PER_USER);
    const ids = excess.map((entry) => entry._id);
    await Session.updateMany(
      { _id: { $in: ids }, revokedAt: null },
      { $set: { revokedAt: now } }
    );
    for (const entry of excess) {
      await auditSession({
        businessId,
        userId,
        action: AUDIT_ACTIONS.SESSION_REVOKED,
        sessionId: entry._id,
        metadata: { deviceLabel: entry.deviceLabel, reason: 'session-cap' },
      });
    }
    return ids;
  } catch (err) {
    console.error(
      `[session] cap enforcement failed (login preserved, ${MAX_ACTIVE_SESSIONS_PER_USER} is the intended bound): ${(err as { message?: unknown }).message}`
    );
    return [];
  }
}

/**
 * The liveness lookup used by requireAuth. Returns the session only when it is
 * still usable — never revoked and not past its own expiry. A null return is the
 * single "no" answer; callers do not distinguish the reasons, so a caller cannot
 * accidentally leak which one applied.
 */
export async function findActiveSessionByJti(jti: unknown, now: Date = new Date()) {
  if (typeof jti !== 'string' || jti.length === 0) return null;
  return Session.findOne({ jti, revokedAt: null, expiresAt: { $gt: now } });
}

/**
 * Opportunistically records that a session was used. Best-effort: a failure here
 * is a cosmetic timestamp, and must never fail an otherwise-authorized request.
 * The conditional filter also makes concurrent requests safe — whichever wins
 * writes, the rest match nothing.
 */
export async function touchSession(session: SessionDoc, now: Date = new Date()) {
  const last = session.lastUsedAt ? session.lastUsedAt.getTime() : 0;
  if (now.getTime() - last < LAST_USED_WRITE_INTERVAL_MS) return;
  const staleBefore = new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS);
  try {
    await Session.updateOne(
      { _id: session._id, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: staleBefore } }] },
      { $set: { lastUsedAt: now } }
    );
  } catch (err) {
    console.error(`[session] lastUsedAt update failed for session ${String(session._id)}: ${(err as { message?: unknown }).message}`);
  }
}

/**
 * This user's open sessions, newest first. Scoped to `userId` — another user's
 * sessions are not filtered out afterwards, they are never in the query.
 */
export async function listActiveSessions(userId: IdLike, now: Date = new Date()) {
  return Session.find({ userId, revokedAt: null, expiresAt: { $gt: now } })
    // `_id` is the tiebreaker so two sessions opened in the same millisecond
    // still have a stable order.
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_SESSIONS_RETURNED);
}

/**
 * Ends one session by its OWNER. `userId` is part of the filter, not a check
 * performed after the write, so revoking another user's session is impossible
 * by construction rather than by assertion — the update simply matches nothing
 * and the caller sees the same 404 as an unknown id (which is also why no
 * existence information leaks).
 *
 * `businessId` is used only for the audit row.
 */
export async function revokeSessionById({ userId, businessId, sessionId, now = new Date() }: RevokeSessionByIdInput) {
  // The guard is the real check and is unchanged. The assertion below is only
  // what tells the checker, and it is erased at runtime: reaching the filter
  // means `isValidObjectId` already accepted this value, which is the one
  // property a query on `_id` needs. `sessionId` itself stays `unknown` because
  // it arrives straight from `req.params`, exactly as it did before.
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new ApiError(404, 'Session not found', 'NOT_FOUND');
  }
  const session = await Session.findOneAndUpdate(
    { _id: sessionId as IdLike, userId, revokedAt: null },
    { $set: { revokedAt: now } },
    { returnDocument: 'after' }
  );
  if (!session) {
    throw new ApiError(404, 'Session not found', 'NOT_FOUND');
  }
  await auditSession({
    businessId,
    userId,
    action: AUDIT_ACTIONS.SESSION_REVOKED,
    sessionId: session._id,
    metadata: { deviceLabel: session.deviceLabel },
  });
  return session;
}

/** Ends the session the current request is authenticated with (sign out). */
export async function revokeSessionByJti({ userId, businessId, jti, now = new Date() }: RevokeSessionByJtiInput) {
  const session = await Session.findOneAndUpdate(
    { userId, jti, revokedAt: null },
    { $set: { revokedAt: now } },
    { returnDocument: 'after' }
  );
  // Nothing matched when the session was already gone (a double sign-out, or a
  // race with "sign out everywhere"). That is not an error and is not audited:
  // recording an event that did not happen would be a false trail.
  if (!session) return null;
  await auditSession({
    businessId,
    userId,
    action: AUDIT_ACTIONS.SESSION_LOGGED_OUT,
    sessionId: session._id,
    metadata: { deviceLabel: session.deviceLabel },
  });
  return session;
}

/**
 * Ends every open session for this user ("sign out everywhere"), the current one
 * included. Returns how many were ended.
 */
export async function revokeAllSessions({ userId, businessId, now = new Date() }: RevokeAllSessionsInput) {
  const result = await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } });
  const revoked = result.modifiedCount ?? 0;
  if (revoked > 0) {
    await auditSession({
      businessId,
      userId,
      action: AUDIT_ACTIONS.SESSIONS_REVOKED_ALL,
      sessionId: null,
      metadata: { sessionsRevoked: revoked },
    });
  }
  return revoked;
}

/**
 * Public shape of one session. A strict allowlist: the `jti` is never exposed —
 * it is the one value that, combined with a stolen token, would let a caller
 * impersonate the session, and the client has no use for it. `current` tells the
 * client which row is its own, which is how it identifies itself without ever
 * seeing a session id it did not already hold.
 */
export function toPublicSession(session: SessionDoc, currentJti?: string) {
  return {
    id: String(session._id),
    current: Boolean(currentJti) && session.jti === currentJti,
    deviceLabel: session.deviceLabel || DEFAULT_DEVICE_LABEL,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt ?? null,
    expiresAt: session.expiresAt,
  };
}

export default {
  SESSION_REVOKED_CODE,
  SESSION_REVOKED_MESSAGE,
  SESSION_EXPIRED_CODE,
  SESSION_EXPIRED_MESSAGE,
  SESSION_ABSOLUTE_CAP_DAYS,
  SESSION_ABSOLUTE_CAP_MS,
  DEFAULT_DEVICE_LABEL,
  MAX_SESSIONS_RETURNED,
  newSessionId,
  normalizeDeviceLabel,
  createSessionForToken,
  findActiveSessionByJti,
  touchSession,
  listActiveSessions,
  revokeSessionById,
  revokeSessionByJti,
  revokeAllSessions,
  toPublicSession,
};
