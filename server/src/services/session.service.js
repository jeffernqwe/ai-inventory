import crypto from 'node:crypto';

import mongoose from 'mongoose';

import Session from '../models/session.model.ts';
import ApiError from '../utils/ApiError.js';
import { decodeAccessToken } from '../config/jwt.js';
import { recordAudit } from './audit.service.js';
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

/** 401 code for a token whose session is gone (revoked, expired, or unknown). */
export const SESSION_REVOKED_CODE = 'SESSION_REVOKED';
export const SESSION_REVOKED_MESSAGE = 'Session ended — please sign in again';

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
async function auditSession({ businessId, userId, action, sessionId, metadata }) {
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
    console.error(`[session] audit record failed for ${action} (session change preserved): ${err.message}`);
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
export function normalizeDeviceLabel(value) {
  if (typeof value !== 'string') return DEFAULT_DEVICE_LABEL;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_DEVICE_LABEL;
  return trimmed.slice(0, DEVICE_LABEL_MAX);
}

/**
 * Persists the session for a token that was just signed.
 *
 * `expiresAt` is read back from the token's own `exp` claim rather than
 * recomputed from the configured lifetime, so the row and the JWT expire at the
 * same instant by construction — there is no second implementation of the
 * duration format to drift.
 *
 * `businessId` is used only for the audit row (sessions carry no tenant); it
 * comes from the user document login already loaded, never from a request.
 */
export async function createSessionForToken({ userId, businessId, token, deviceLabel }) {
  const payload = decodeAccessToken(token);
  if (!payload?.jti || !payload?.exp) {
    throw new ApiError(500, 'The access token carries no session id', 'SESSION_ID_REQUIRED');
  }
  const session = await Session.create({
    userId,
    jti: payload.jti,
    deviceLabel: normalizeDeviceLabel(deviceLabel),
    expiresAt: new Date(payload.exp * 1000),
  });
  await auditSession({
    businessId,
    userId,
    action: AUDIT_ACTIONS.SESSION_CREATED,
    sessionId: session._id,
    metadata: { deviceLabel: session.deviceLabel },
  });
  return session;
}

/**
 * The liveness lookup used by requireAuth. Returns the session only when it is
 * still usable — never revoked and not past its own expiry. A null return is the
 * single "no" answer; callers do not distinguish the reasons, so a caller cannot
 * accidentally leak which one applied.
 */
export async function findActiveSessionByJti(jti, now = new Date()) {
  if (typeof jti !== 'string' || jti.length === 0) return null;
  return Session.findOne({ jti, revokedAt: null, expiresAt: { $gt: now } });
}

/**
 * Opportunistically records that a session was used. Best-effort: a failure here
 * is a cosmetic timestamp, and must never fail an otherwise-authorized request.
 * The conditional filter also makes concurrent requests safe — whichever wins
 * writes, the rest match nothing.
 */
export async function touchSession(session, now = new Date()) {
  const last = session.lastUsedAt ? session.lastUsedAt.getTime() : 0;
  if (now.getTime() - last < LAST_USED_WRITE_INTERVAL_MS) return;
  const staleBefore = new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS);
  try {
    await Session.updateOne(
      { _id: session._id, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: staleBefore } }] },
      { $set: { lastUsedAt: now } }
    );
  } catch (err) {
    console.error(`[session] lastUsedAt update failed for session ${String(session._id)}: ${err.message}`);
  }
}

/**
 * This user's open sessions, newest first. Scoped to `userId` — another user's
 * sessions are not filtered out afterwards, they are never in the query.
 */
export async function listActiveSessions(userId, now = new Date()) {
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
export async function revokeSessionById({ userId, businessId, sessionId, now = new Date() }) {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new ApiError(404, 'Session not found', 'NOT_FOUND');
  }
  const session = await Session.findOneAndUpdate(
    { _id: sessionId, userId, revokedAt: null },
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
export async function revokeSessionByJti({ userId, businessId, jti, now = new Date() }) {
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
export async function revokeAllSessions({ userId, businessId, now = new Date() }) {
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
export function toPublicSession(session, currentJti) {
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
