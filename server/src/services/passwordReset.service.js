/**
 * Phase 26B-2 — password recovery.
 *
 * Two operations, and the split between them is the whole design:
 *
 *   requestPasswordReset({ email })  — issue a single-use link, by email.
 *   resetPassword({ token, newPassword }) — spend that link, once, to replace
 *                                      one user's password.
 *
 * Three properties are load-bearing and none of them is incidental:
 *
 *   1. ONLY THE HASH IS PERSISTED. The raw token is generated here, handed to
 *      the mail layer inside a URL, and then forgotten. It is never written to
 *      the database, never logged, never placed in audit metadata, never
 *      returned to a caller and never included in an error message.
 *
 *   2. THE CLAIM IS ATOMIC. `resetPassword` spends the token with ONE
 *      conditional `findOneAndUpdate` before doing anything else, so two
 *      concurrent uses cannot both succeed. Once that update matches, the token
 *      is spent for good: no later failure releases it (see the fail-closed note
 *      on resetPassword).
 *
 *   3. REJECTION IS GENERIC. Unknown, expired, already-used, disabled-user and
 *      inactive-business all produce one code and one message, so the endpoint
 *      cannot be used to probe whether an account exists, is disabled, or
 *      belongs to a suspended tenant.
 *
 * ERRORS. This is the domain layer, so nothing here carries an HTTP status: the
 * error types below expose a stable `code` (and, for a bad password, `problems`)
 * and the Phase 26B-3 controller decides what to answer. The two mail error
 * types are re-used from the Phase 26B-1 boundary rather than re-invented —
 * `MAIL_NOT_CONFIGURED` / `MAIL_UNAVAILABLE` are namespaced so a delivery
 * failure can never be mistaken for an authentication failure.
 *
 * The mail layer is reached through its public interface only
 * (`services/mail/index.js`), which is the boundary that keeps Resend — or any
 * other transport — out of this file. The one exception is `mailConfig`, the
 * config reader of the same layer: the reset URL lives there and `index.js`
 * deliberately does not re-export it (approved decision D2). `mailConfig.js`
 * cannot reach a provider, so the transport boundary is intact either way.
 */

import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';

import PasswordResetToken from '../models/passwordResetToken.model.js';
import User from '../models/user.model.js';
import { normalizeEmail } from '../utils/validate.js';
import { recordAudit } from './audit.service.js';
import { assertActiveBusiness } from './business.service.js';
import { revokeAllSessions } from './session.service.js';
import { sendPasswordResetEmail, isMailConfigured, MailNotConfigured } from './mail/index.js';
import { mailConfig } from './mail/mailConfig.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long a reset link stays usable. Reported to the user from this variable. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** The one code every token rejection carries — see the generic-rejection rule. */
export const INVALID_RESET_TOKEN_CODE = 'INVALID_RESET_TOKEN';
// Reuses the project-wide validation code so the Phase 26B-3 controller maps it
// to the same 400 + field problems every other endpoint produces.
export const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

// Deliberately says nothing about WHICH of the six rejection reasons applied.
const INVALID_RESET_TOKEN_MESSAGE =
  'This password reset link is invalid or has expired. Please request a new one.';

/** 256 bits of entropy. base64url so the token is URL-safe with no escaping. */
const TOKEN_BYTES = 32;

// Duplicated per service, exactly as services/auth.service.js and
// services/users.service.js already do.
const BCRYPT_ROUNDS = 10;

// Mirrors utils/validate.js passwordProblems, which is module-private there and
// cannot be imported. The drift is closed by a boundary test that compares this
// against the PUBLIC validateChangePassword output at 7/8/72/73 — see
// test/phase26b-password-recovery.test.mjs.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

const ACTIVE_STATUS = 'ACTIVE';

// ---------------------------------------------------------------------------
// Errors (domain layer — a code, never an HTTP status)
// ---------------------------------------------------------------------------

/**
 * A password-recovery failure. Carries `code` and, when the failure is a bad
 * password rather than a bad token, a `problems` array in the same
 * `{ field, message }` shape every other validator in this project produces.
 */
export class PasswordResetError extends Error {
  constructor(code, message, { problems } = {}) {
    super(message);
    this.name = 'PasswordResetError';
    this.code = code;
    if (problems) this.problems = problems;
  }
}

function invalidResetToken() {
  return new PasswordResetError(INVALID_RESET_TOKEN_CODE, INVALID_RESET_TOKEN_MESSAGE);
}

// ---------------------------------------------------------------------------
// Token helpers — pure, so they are unit-testable without a database
// ---------------------------------------------------------------------------

/** A fresh, unguessable reset token. Random, never derived from the user or time. */
export function generateResetToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/** The only form of the token that may ever be persisted or compared. */
export function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * Appends the token to the configured reset page. `&` is used when the base
 * already carries a query string, so a base like `https://app/reset?lang=en`
 * still produces a valid link. base64url needs no escaping; encoding anyway
 * costs nothing and keeps the URL correct if the token alphabet ever changes.
 */
export function buildResetUrl(base, rawToken) {
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}token=${encodeURIComponent(rawToken)}`;
}

/**
 * The shared password policy, reported under `newPassword`. Exported so the
 * boundary test can hold it against utils/validate.js's public validator.
 */
export function newPasswordProblems(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length === 0) {
    problems.push({ field: 'newPassword', message: 'password is required' });
  } else if (password.length < PASSWORD_MIN) {
    problems.push({
      field: 'newPassword',
      message: `password must be at least ${PASSWORD_MIN} characters`,
    });
  } else if (password.length > PASSWORD_MAX) {
    problems.push({
      field: 'newPassword',
      message: `password must be at most ${PASSWORD_MAX} characters`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Audit — best-effort, like the session lifecycle's own writer
// ---------------------------------------------------------------------------

/**
 * Writes one password-recovery audit row, best-effort.
 *
 * By the time this runs the token is issued or the password is already changed;
 * neither can be un-done by a failed audit write, so failing the request over it
 * would be strictly worse — the same idiom session.service.js uses. `metadata`
 * is deliberately omitted: `entityType: USER` plus `entityId`/`userId` already
 * identify the account, the audit viewer populates the actor, and there is no
 * remaining fact worth recording that is not either redundant or a credential.
 * The raw token, its hash and the new password are never in scope here.
 */
async function auditPasswordReset({ businessId, userId, action }) {
  try {
    await recordAudit({
      businessId,
      userId,
      action,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: userId,
    });
  } catch (err) {
    console.error(
      `[password-reset] audit record failed for ${action} (the reset itself is unaffected): ${err.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * Issue a reset link for `email`, if that account may receive one.
 *
 * ENUMERATION RESISTANCE IS STRUCTURAL, not a rule the caller must remember.
 * Four different situations — unknown email, DISABLED user, user whose business
 * is missing/SUSPENDED/ARCHIVED, and nothing at all — take the same silent exit,
 * and the function's return value is unconditional (`undefined`). There is no
 * field a controller could accidentally reflect and no branch it could report
 * on, so "we sent you a link" and "no such account" are indistinguishable from
 * outside. Returning `{ sent: false }` would put that leak one careless
 * `res.json` away; returning nothing removes the possibility.
 *
 * KNOWN LIMITATION (not claimed as fixed): the success path does more work than
 * the silent exit, so a timing side channel exists in principle. No delay is
 * injected to mask it, because unmeasured timing noise is not a security
 * control. Recorded here so it is not mistaken for coverage.
 *
 * `requestedByIp` is deliberately NOT a parameter. The model forbids an IP
 * field, the audit row has no place for one, and per-IP throttling is the route
 * layer's job (Phase 07B's rate limiter already has the address). An accepted
 * but unused argument is exactly what later gets persisted "because it was
 * there".
 */
export async function requestPasswordReset({ email } = {}) {
  const now = new Date();
  const { resetUrl } = mailConfig();

  // Checked BEFORE a credential is minted. A server that could not deliver the
  // link must not accumulate tokens it can never hand out — and the operator
  // needs the misconfiguration to surface here, not as a mail failure after the
  // fact. isMailConfigured() never throws and covers an empty/unsupported
  // MAIL_PROVIDER and a provider missing its own configuration.
  if (!isMailConfigured()) {
    throw new MailNotConfigured(
      'Password recovery is disabled on this server because email delivery is not configured.',
    );
  }
  if (!resetUrl) {
    throw new MailNotConfigured(
      'PASSWORD_RESET_URL is not set, so password-recovery email is disabled on this server.',
    );
  }

  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) return;
  if (user.status !== ACTIVE_STATUS) return;
  try {
    await assertActiveBusiness(user.businessId);
  } catch {
    // Fails closed and silently, so a suspended tenant is indistinguishable
    // from an unknown address.
    return;
  }

  const rawToken = generateResetToken();
  const token = await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashResetToken(rawToken),
    // The same constant that is printed in the email, so the stated lifetime
    // and the enforced one cannot drift apart.
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000),
  });

  // One active token per user. Deleting by `_id: { $lt: token._id }` rather than
  // by "everything that is not mine" is what makes this converge instead of
  // cancelling out: with a not-equal filter, an A-insert/B-insert/A-delete/
  // B-delete interleaving deletes BOTH and leaves the user with no working link.
  // Ordered by `_id`, the newer token can never be removed by the older request.
  //
  // This is convergence, NOT a transaction: two operations, no session. Two
  // concurrent requests settle with at most one unused token, and in a rare
  // same-second interleaving ACROSS processes they may settle with zero (both
  // links dead, the user simply asks again) — never with two live tokens, which
  // is the property that matters. A partial unique index would make it absolute
  // and was deliberately not added.
  await PasswordResetToken.deleteMany({
    userId: user._id,
    usedAt: null,
    _id: { $lt: token._id },
  });

  // Written once the token durably exists and BEFORE the send, so the row means
  // "a reset was requested and a single-use token was issued" — true in every
  // case where it exists, including a delivery failure that follows. That is why
  // there is no `delivered` field: under the mail layer's throw-based contract
  // it would be a constant, carrying no information.
  await auditPasswordReset({
    businessId: user.businessId,
    userId: user._id,
    action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
  });

  // Errors propagate unchanged: MailDeliveryError / MailNotConfigured reach the
  // caller with their own MAIL_* code, so the transport failure stays tellable
  // from an authentication failure.
  await sendPasswordResetEmail({
    to: user.email,
    resetUrl: buildResetUrl(resetUrl, rawToken),
    expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
  });
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Spend a reset link and replace the password it points at.
 *
 * ORDER IS THE SECURITY ARGUMENT, at two points marked below.
 *
 * FAIL-CLOSED. Once the claim at step 3 matches, the token is spent. No later
 * failure — a missing user, an invalid account, a failed `user.save()`, a failed
 * session revocation, a failed cleanup — restores `usedAt`. There is no code
 * path in this file that unsets it. A partially completed reset is therefore
 * never replayable, and the cost of that guarantee is explicit and accepted: the
 * user must request another link. A failed reset is recoverable by asking again;
 * a replayable token after a partial failure is not recoverable at all.
 */
export async function resetPassword({ token, newPassword } = {}) {
  const now = new Date();

  // ★ 1. Policy FIRST, before the token is touched. Claiming and then rejecting
  //    would make one fat-fingered password cost the user another email
  //    round-trip, and would let a caller burn a valid link at will.
  const problems = newPasswordProblems(newPassword);
  if (problems.length > 0) {
    throw new PasswordResetError(VALIDATION_ERROR_CODE, 'The new password is not acceptable.', {
      problems,
    });
  }

  const raw = typeof token === 'string' ? token.trim() : '';
  if (!raw) throw invalidResetToken();

  // ★ 2. The atomic claim — the entire single-use guarantee, in one conditional
  //    update. A concurrent second attempt matches nothing because the first
  //    already set `usedAt`. `expiresAt` is filtered here rather than trusted to
  //    the TTL sweep, which runs eventually (~60s) and cannot be depended on.
  //    Unknown, expired and already-used all fail the same filter and so produce
  //    the same answer.
  const claim = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashResetToken(raw), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { returnDocument: 'after' }
  );
  if (!claim) throw invalidResetToken();

  // ---- The token is SPENT from here on. Nothing below releases it. ----

  const user = await User.findById(claim.userId);
  if (!user) throw invalidResetToken();
  // Never ACCOUNT_DISABLED: that would turn this endpoint into a probe for
  // whether an account is disabled.
  if (user.status !== ACTIVE_STATUS) throw invalidResetToken();
  try {
    await assertActiveBusiness(user.businessId);
  } catch {
    // Never BUSINESS_NOT_ACTIVE — a suspended tenant must not be tellable here.
    throw invalidResetToken();
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  // The same `now` the token was stamped with, read once, so `usedAt`,
  // `passwordChangedAt` and the revocation are coherent.
  user.passwordChangedAt = now;
  await user.save();

  // End every session. The passwordChangedAt stamp alone already rejects tokens
  // issued in a strictly earlier second (requireAuth compares, then rejects with
  // SESSION_INVALIDATED before it ever looks at the session), so this is not what
  // makes the ordinary old token fail. It closes the SAME-SECOND hole — a token
  // minted in the same second as the change survives the strict `<` comparison,
  // which is correct for a fresh login after a change-password but wrong here,
  // where nobody is authenticated — and it keeps GET /api/auth/sessions honest,
  // since that screen lists rows with revokedAt === null and would otherwise show
  // every device as active on a session-none-of-them-can-use.
  await revokeAllSessions({ userId: user._id, businessId: user.businessId, now });

  // Completing a reset invalidates every other outstanding link for this user.
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });

  await auditPasswordReset({
    businessId: user.businessId,
    userId: user._id,
    action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
  });

  return { changedAt: user.passwordChangedAt };
}

export default {
  PASSWORD_RESET_TTL_MINUTES,
  INVALID_RESET_TOKEN_CODE,
  VALIDATION_ERROR_CODE,
  PasswordResetError,
  generateResetToken,
  hashResetToken,
  buildResetUrl,
  newPasswordProblems,
  requestPasswordReset,
  resetPassword,
};
