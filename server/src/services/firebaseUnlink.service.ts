/**
 * Phase 32L — the Firebase identity unlink boundary.
 *
 * This module answers ONE question, and deliberately not the question Phase 32H's
 * linking module answers:
 *
 *   "May THIS authenticated Inventory AI account stop authenticating through the
 *    Firebase identity it currently carries, and become a password account?"
 *
 * WHAT "UNLINK" MEANS HERE, precisely. Firebase-side provider unlinking
 * (`unlink()`, `unlinkProvider()`, "Disconnect Google") is performed by the
 * FIREBASE CLIENT SDK against the signed-in Firebase user; the Inventory AI server
 * has no part in it, cannot observe it, and offers no API for it. That is a
 * deliberate Phase 32L decision, not a gap: the Admin SDK's `providersToUnlink`
 * capability was runtime-verified and then explicitly kept out of this flow. What
 * the server owns is the half the client must never be trusted with — the decision
 * that a MongoDB user STOPS carrying a given `firebaseUid` — and that single act is
 * what flips the account's authentication authority.
 *
 * POLICY B, IN ONE SENTENCE. An account may leave Firebase authority only by
 * establishing a NEW local password in the same transition, so the account never
 * passes through a zero-authentication-method state. That is why `newPassword` is
 * a required input and why the old retained hash is REPLACED rather than
 * re-enabled: a Firebase-LINKED account still carries its legacy bcrypt hash
 * (Phase 32H deliberately does not delete it), and re-enabling it would silently
 * resurrect a credential the user may have abandoned — or, worse, one an attacker
 * still knows.
 *
 * WHAT THE CALLER MAY NOT SAY. `userId` and `businessId` arrive as ARGUMENTS from
 * the authenticated request context (`req.user`), never from a body. The identity
 * being detached is the uid of the token `verifyFirebaseIdToken` returns, so it is
 * a value Google's signature verified, and the account is `req.user.id`. So a body
 * carrying `firebaseUid`, `userId`, `businessId`, `role` or `status` is inert by
 * construction: there is no variable in this module holding a client-supplied
 * identity, tenant or role. This is the same shape as `linkFirebaseIdentity`, and
 * for the same reason.
 *
 * THE EMAIL IS NOT CONSULTED. Not compared, not used to find an account, not used
 * to resolve anything. Email is not an account-identity join key, and a caller who
 * presents a verified token whose address happens to match some other account's
 * gains nothing from that here.
 *
 * NOTHING HERE CHANGES A TENANT, A ROLE OR A STATUS. The authoritative write
 * touches exactly four fields — `firebaseUid`, `emailVerified`, `passwordHash` and
 * `passwordChangedAt` — so an unlink cannot move an account between businesses,
 * promote it, or re-enable it. `businessId` and `role` are read for the audit row
 * and never assigned.
 */

import type mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import User from '../models/user.model.ts';
import PasswordResetToken from '../models/passwordResetToken.model.ts';
import ApiError from '../utils/ApiError.ts';
import { throwValidation } from '../utils/errors.ts';
import { recordAudit } from './audit.service.ts';
import { error as logError } from '../utils/logger.ts';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.ts';
import { verifyFirebaseIdToken } from './firebase/index.ts';
import { FIREBASE_IDENTITY_CONFLICT_CODE } from './firebaseLink.service.ts';
import { newPasswordProblems } from './passwordReset.service.ts';
import { revokeAllSessions } from './session.service.ts';
import {
  FIREBASE_IDENTITY_NOT_LINKED,
  FIREBASE_REAUTHENTICATION_REQUIRED,
  authTimeIsFresh,
} from '../constants/firebase.ts';

/**
 * Local to this module, following `auth.service.ts`, `session.service.ts` and
 * `passwordReset.service.ts`: the controller passes the strings `req.user`
 * carries, and the model casts whichever arrives.
 */
type IdLike = string | mongoose.Types.ObjectId;

/** The unlink operation's inputs. `userId`/`businessId` are server-derived. */
type UnlinkIdentityInput = {
  userId: IdLike;
  businessId: IdLike;
  idToken: unknown;
  newPassword: unknown;
  /** Injectable so a boundary test can pin the freshness window exactly. */
  now?: Date;
};

/** The bcrypt cost, matching `auth.service.ts` and `passwordReset.service.ts`. */
const BCRYPT_ROUNDS = 10;

/**
 * The two conflict-failure reasons, in the closed set the audit row records and
 * the server log names. Never returned — see `conflict()` below.
 */
const REASON_IDENTITY_MISMATCH = 'identity_mismatch';
const REASON_UNLINK_RACE = 'unlink_race';

/**
 * The refusal, with deliberately generic copy for the same reason Phase 32H's
 * linking conflict is generic: telling a caller WHY their presented identity was
 * not the one on their account would describe whether some other mapping exists.
 */
const FIREBASE_IDENTITY_CONFLICT_MESSAGE =
  'This sign-in does not match the one connected to this account. Please contact an administrator.';

/**
 * The recency refusal. Its copy is specific and actionable because the caller is
 * the owner of the account and the remedy is a step only they can take: prove the
 * authentication is recent, then retry with the token that proves it.
 *
 * NOT generic, and NOT a hint about another account — nothing here depends on any
 * other account. Phase 26B's uniform-202 reasoning does not apply: that endpoint
 * is unauthenticated and answers about a third party's address, while this one is
 * reached only by a caller already holding this account.
 */
const FIREBASE_REAUTHENTICATION_REQUIRED_MESSAGE =
  'For your security, please confirm your sign-in again before disconnecting.';

/** `nothing is linked` — the caller's own account carries no Firebase identity. */
const FIREBASE_IDENTITY_NOT_LINKED_MESSAGE =
  'This account is not connected to a sign-in provider.';

function conflict() {
  return new ApiError(409, FIREBASE_IDENTITY_CONFLICT_MESSAGE, FIREBASE_IDENTITY_CONFLICT_CODE);
}

function notLinked() {
  return new ApiError(409, FIREBASE_IDENTITY_NOT_LINKED_MESSAGE, FIREBASE_IDENTITY_NOT_LINKED);
}

/**
 * The recency refusal.
 *
 * ★ THE STATUS IS 409, NOT 401 AND NOT 403, AND THAT IS LOAD-BEARING.
 * `mobile/lib/client.ts` treats a **401 or 403** response to a request that
 * carried a token as SESSION LOSS and clears the client's session. This route is
 * authenticated, so every one of its responses is such a response — a 401 or 403
 * here would therefore sign the user out over a freshness check, which is the
 * exact hazard the `mobile/lib/client.ts` contract exists to prevent and the same
 * reason Phase 32H answers a bad Firebase credential with 400. 409 says what
 * actually happened, is outside the client's session-loss rule, and is a status
 * the unlink flow can retry from.
 *
 * The freeze record recommended 409 for this code; the implementation brief
 * permitted 403 "or the project's established status convention". The project's
 * established convention IS 409 here, so the freeze is honoured and the deviation
 * from the brief's example status is deliberate and recorded.
 */
function reauthenticationRequired() {
  return new ApiError(
    409,
    FIREBASE_REAUTHENTICATION_REQUIRED_MESSAGE,
    FIREBASE_REAUTHENTICATION_REQUIRED
  );
}

/**
 * Writes one unlink audit row, best-effort — the same reasoning
 * `firebaseLink.service.ts` and `session.service.ts` give: on success the
 * transition is already durable and a failed audit write cannot un-do it, so
 * failing the request over it would be strictly worse. On the CONFLICT path
 * nothing durable happened, so failing a refusal over its own audit row would turn
 * a safe 409 into a 500.
 *
 * `metadata` carries a `reason` and NOTHING ELSE on the conflict path, and on the
 * success path only `{ passwordEstablished: true }`. No Firebase UID is ever
 * written: the audit viewer is readable by every ADMIN of the business, and the
 * whole point of the identity design is that the uid stays server-side. No token,
 * no password, no hash, no `jti`, and no reset secret is in scope here either.
 */
async function auditUnlinkEvent({
  businessId,
  userId,
  action,
  metadata,
}: {
  businessId: IdLike;
  userId: IdLike;
  action: string;
  metadata: unknown;
}) {
  try {
    await recordAudit({
      businessId,
      userId,
      action,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: userId,
      metadata,
    });
  } catch (err) {
    console.error(
      `[firebase-unlink] audit record failed for ${action} (the unlink outcome is unaffected): ${(err as { message?: unknown }).message}`,
    );
  }
}

/**
 * The operator's view of a refused unlink. Server-side only.
 *
 * The reason is a fixed string from the closed set and the uid is an identifier an
 * operator needs in order to trace a mismatch — the same standing Phase 32H's
 * `logLinkConflict` gives its own collisions. No token material is in scope: the
 * ID token was consumed by the verifier and the verified identity carries no
 * credential.
 */
function logUnlinkConflict({
  reason,
  uid,
  businessId,
}: {
  reason: string;
  uid: string;
  businessId: IdLike;
}) {
  logError({
    type: 'firebase_identity_unlink_conflict',
    message: `[firebase-unlink] refused (${reason}): the verified identity (uid ${uid}) is not the one attached to a user in business ${String(businessId)}`,
  });
}

/**
 * Detaches the account's Firebase identity and establishes a new local password.
 *
 * THE CHECK ORDER IS THE DESIGN, and each step exists to make the next one
 * meaningful:
 *
 *   1. VERIFY the ID token — the only place an identity enters. Throws
 *      `FirebaseTokenError` / `FirebaseNotConfigured`, which the controller maps.
 *   2. LOAD the account from `userId` — the caller's own, from `req.user`.
 *   3. NOT LINKED — the account carries no `firebaseUid`, so there is nothing to
 *      detach. Answered before the identity is compared, because "you have no
 *      provider connected" is the more precise fact and must not be reported as a
 *      conflict with a mapping that does not exist.
 *   4. MISMATCH — the account carries a DIFFERENT `firebaseUid` than the verified
 *      token names. Refused, audited, never transferred or merged: the identity
 *      currently attached stays attached, and the presented one is not adopted.
 *   5. RECENCY — the signed `auth_time` must be inside
 *      `FIREBASE_REAUTH_WINDOW_SECONDS`. Checked from the VERIFIED CLAIM, never
 *      from `iat` (which moves on every hourly refresh and would happily accept a
 *      day-old authentication) and never from anything the client sent. Fails
 *      closed when the claim is absent. Nothing has been mutated at this point.
 *   6. PASSWORD — validated against the shared policy, then HASHED, before any
 *      write. Policy B makes this the last-method invariant: the new credential is
 *      fully prepared while the old authority is still in place, so the account can
 *      never be observed between the two.
 *   7. RESET TOKENS — every outstanding unspent reset token for this user is
 *      deleted BEFORE the authoritative write (Phase 32L R-3). Otherwise a link
 *      issued while the account was still a password account would survive the
 *      transition and could later overwrite the password just established.
 *   8. THE CONDITIONAL WRITE — one update, filtered on the expected identity, so a
 *      concurrent unlink/link cannot be raced into a half-applied account.
 *   9. SESSIONS + AUDIT.
 *
 * WHY THE WINDOW IS ENFORCED HERE RATHER THAN BY FIREBASE. Phase 32L measured
 * Firebase refusing `updatePassword` at a 390-second-old authentication while
 * ACCEPTING a provider unlink at the same age: Firebase does not gate unlinking on
 * recency. A client that reauthenticates is therefore doing something genuinely
 * useful, but it is not a control — the control is this check, reading a claim
 * Google signed.
 */
export async function unlinkFirebaseIdentity({
  userId,
  businessId,
  idToken,
  newPassword,
  now = new Date(),
}: UnlinkIdentityInput) {
  // STEP 1 — the ONLY place this request's identity is established.
  const identity = await verifyFirebaseIdToken(idToken);

  // STEP 2 — the caller's own account. `firebaseUid` is selected because the whole
  // operation is about it. `passwordHash` is deliberately NOT selected: the write
  // below REPLACES it, and reading a credential the transition is about to discard
  // would be reading it for no purpose.
  const user = await User.findById(userId).select('name email role status businessId firebaseUid');
  if (!user) {
    // Unreachable in practice: `requireAuth` loaded this user for THIS request.
    // Handled rather than asserted because the account could have been removed
    // between the middleware and here, and a 401 is the honest answer to "there is
    // no longer an account to unlink".
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  // STEP 3 — nothing is connected. Distinct code, distinct message, no audit row:
  // no mapping changed hands, so there is nothing to record.
  if (!user.firebaseUid) {
    throw notLinked();
  }

  // STEP 4 — the presented identity is not the one attached. Refused, never
  // resolved.
  if (user.firebaseUid !== identity.uid) {
    await auditUnlinkEvent({
      businessId,
      userId: user._id,
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINK_CONFLICT,
      metadata: { reason: REASON_IDENTITY_MISMATCH },
    });
    logUnlinkConflict({ reason: REASON_IDENTITY_MISMATCH, uid: identity.uid, businessId });
    throw conflict();
  }

  // STEP 5 — recency, from the VERIFIED signed claim. No mutation has happened.
  if (!authTimeIsFresh(identity.authTime, now.getTime())) {
    throw reauthenticationRequired();
  }

  // STEP 6 — the new credential, validated and hashed BEFORE the transition.
  const passwordProblems = newPasswordProblems(newPassword);
  if (passwordProblems.length > 0) {
    throwValidation(passwordProblems);
  }
  const newPasswordHash = await bcrypt.hash(newPassword as string, BCRYPT_ROUNDS);

  // STEP 7 — R-3. Ordered BEFORE the authoritative write, because the property
  // being protected is "a reset link that predates this transition must not be
  // spendable after it". Deleting first means a token cannot survive into the
  // window in which the new password exists.
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });

  // STEP 8 — the authoritative transition: ONE conditional update.
  //
  // `firebaseUid: identity.uid` in the FILTER is what makes this safe rather than
  // merely atomic. Nothing is read, tested and then written — a concurrent link
  // that attached a different identity between step 2's read and this write causes
  // the filter to match NOTHING, so it cannot be silently overwritten.
  //
  // `$unset` rather than `$set: null`. The field carries a UNIQUE SPARSE index, and
  // an explicitly-null value is still a PRESENT value: the document would remain in
  // the index, and the second account ever unlinked would collide on `null`. Sparse
  // exists precisely so unlinked accounts are absent from the index, so clearing
  // must remove the field rather than blank it.
  //
  // `emailVerified: false` travels with the uid, mirroring linking and
  // `registerBusinessFromFirebase`, so the field describes the identity the account
  // actually carries. It is persisted and NOT enforced; nothing reads it.
  //
  // `passwordHash` + `passwordChangedAt` are written in the SAME update as the uid
  // removal, which is the last-method invariant made structural: there is no
  // instant at which the account has neither authority.
  const updated = await User.findOneAndUpdate(
    { _id: user._id, firebaseUid: identity.uid },
    {
      $unset: { firebaseUid: 1 },
      $set: {
        emailVerified: false,
        passwordHash: newPasswordHash,
        passwordChangedAt: now,
      },
    },
    { returnDocument: 'after', runValidators: true }
  );

  if (!updated) {
    // The conditional write matched nothing: a concurrent request changed this
    // account between the read above and here. Decided from the FRESH document
    // rather than assumed, so the caller gets the true answer.
    const current = await User.findById(user._id).select('firebaseUid');
    if (!current) {
      throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    if (!current.firebaseUid) {
      // A racing unlink completed first. The account IS now a password account —
      // but with the OTHER request's password, so this caller must not be told it
      // succeeded. "Nothing is connected" is the accurate answer.
      throw notLinked();
    }
    await auditUnlinkEvent({
      businessId,
      userId: user._id,
      action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINK_CONFLICT,
      metadata: { reason: REASON_UNLINK_RACE },
    });
    logUnlinkConflict({ reason: REASON_UNLINK_RACE, uid: identity.uid, businessId });
    throw conflict();
  }

  // STEP 9 — every Inventory AI session dies with the credential they were minted
  // against. The `passwordChangedAt` stamp alone already rejects tokens issued in
  // a strictly earlier second; `revokeAllSessions` closes the same-second hole and
  // keeps GET /api/auth/sessions honest. This says NOTHING about the Firebase
  // session — that survives, and ending it is the client's job.
  await revokeAllSessions({ userId: updated._id, businessId: updated.businessId, now });

  await auditUnlinkEvent({
    businessId,
    userId: updated._id,
    action: AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINKED,
    // The one fact worth recording beyond the event itself, and the only one that
    // is safe: a local password now authenticates this account. The detached uid is
    // absent on purpose.
    metadata: { passwordEstablished: true },
  });

  return { user: updated };
}

export default {
  unlinkFirebaseIdentity,
  FIREBASE_IDENTITY_NOT_LINKED,
  FIREBASE_REAUTHENTICATION_REQUIRED,
};
