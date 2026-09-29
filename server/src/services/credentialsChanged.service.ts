/**
 * N-4 (Phase 32R) — the credential-change bridge.
 *
 * This module answers ONE question:
 *
 *   "A Firebase password change has just happened for the identity this account
 *    authenticates through. May this authenticated account now record that
 *    credential change, so that every Inventory AI session minted against the OLD
 *    credential is dead?"
 *
 * WHY IT EXISTS. A Firebase-native password reset completes entirely inside
 * Firebase: the credential changes there, and the Inventory AI server never learns
 * of it. Phase 32L's unlink path stamps `passwordChangedAt` and revokes sessions as
 * part of its own transaction, and the legacy 26B/27 reset flow does the same — but
 * a reset performed through the Firebase client SDK reaches no server code at all,
 * so without this bridge a successful password reset would silently leave every
 * previously issued Inventory AI session alive, including an attacker's.
 *
 * WHAT "CREDENTIALS CHANGED" MEANS HERE, precisely. The credential itself lives in
 * Firebase, and this service does NOT touch it, cannot verify that a reset ever
 * occurred, and does not attempt to. What it records is the local CONSEQUENCE:
 * `passwordChangedAt` is stamped so that every token issued before this instant
 * fails `authenticate.ts`'s `iat < passwordChangedAt` comparison, and
 * `revokeAllSessions` closes the same-second hole the stamp's integer-second
 * granularity leaves. The authority to do that comes from the two server-derived
 * facts below and from nothing else.
 *
 * WHAT THE CALLER MAY NOT SAY. There is no `userId`, `businessId`, `firebaseUid`,
 * `role`, `status`, session id or device field in this module's inputs — they
 * arrive only as ARGUMENTS from the authenticated request context, and the
 * validator (`validateCredentialsChanged`) returns only `{ problems, idToken }`.
 * So a body carrying any of those keys is INERT rather than validated-and-rejected:
 * there is no variable here holding a client-supplied identity, tenant or role, and
 * therefore no check that could later be deleted. The account is `req.user.id`; the
 * identity is `verifyFirebaseIdToken(idToken).uid`, a value Google's signature
 * verified; and the tenant used for the revocation is read from the FRESH document
 * the write returned, never from the request.
 *
 * WHY THE UID MUST MATCH, AND NOTHING ELSE MAY. The bridge revokes sessions and
 * invalidates tokens, so if a caller could name an arbitrary account it would be a
 * denial-of-service instrument — and if it could name an arbitrary identity it would
 * let a caller who holds one Firebase account act on another's. Requiring the
 * presented uid to EQUAL the uid already on the authenticated account makes both
 * impossible: the request can only affect the account that authenticated it, in the
 * tenant that account belongs to. It follows that the email is never consulted —
 * not compared, not used to find an account, not used to resolve anything — because
 * email is not an account-identity join key anywhere in this design.
 *
 * WHY RECENCY IS REQUIRED. Possession of a live Firebase ID token is not proof that
 * the user is the one acting: a token can be replayed from a stolen device. The
 * signed `auth_time` narrows that window to `FIREBASE_REAUTH_WINDOW_SECONDS`, read
 * from the VERIFIED CLAIM and never from `iat` (which the hourly refresh moves
 * while the authentication stays a day old — a fact Phase 32L pinned with its own
 * test) and never from anything the client sent. In the approved recovery sequence
 * this check is free: step 5 of the sequence signs in again with the NEW password,
 * so the token the bridge receives is seconds old by construction.
 *
 * NOTHING HERE CHANGES A TENANT, A ROLE OR A STATUS. The write touches exactly one
 * field, `passwordChangedAt`. In particular the retained bcrypt `passwordHash` of a
 * Firebase-linked account is deliberately NOT touched: Firebase owns that account's
 * credential (Phase 32E's guard refuses the legacy password route for any account
 * carrying a `firebaseUid`), so re-hashing or clearing the local hash here would
 * either resurrect a credential the user abandoned or destroy evidence, and neither
 * is this phase's business.
 */

import type mongoose from 'mongoose';

import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { verifyFirebaseIdToken } from './firebase/index.ts';
import { FIREBASE_IDENTITY_CONFLICT_CODE } from './firebaseLink.service.ts';
import { revokeAllSessions } from './session.service.ts';
import {
  FIREBASE_REAUTHENTICATION_REQUIRED,
  authTimeIsFresh,
} from '../constants/firebase.ts';

/**
 * Local to this module, following `auth.service.ts`, `session.service.ts` and
 * `firebaseUnlink.service.ts`: the controller passes the string `req.user` carries,
 * and the model casts whichever arrives.
 */
type IdLike = string | mongoose.Types.ObjectId;

/** The bridge's inputs. `userId` is server-derived; the token is the only caller input. */
type CredentialsChangedInput = {
  userId: IdLike;
  idToken: unknown;
  /** Injectable so a boundary test can pin the freshness window exactly. */
  now?: Date;
};

/**
 * The refusal for a presented identity that is not the one this account
 * authenticates through — which covers both "this account carries no Firebase
 * identity at all" and "it carries a different one".
 *
 * ONE code and ONE message for both, and the message names neither the account nor
 * the identity. The caller is the owner of the account, so the *fact* of a mismatch
 * is theirs to know; which mapping exists elsewhere is not. `FIREBASE_IDENTITY_CONFLICT`
 * is reused from Phase 32H rather than redeclared, so a client that already branches
 * on it needs no new branch and the two endpoints cannot drift apart.
 *
 * The coalescing is deliberate and differs from `unlinkFirebaseIdentity`, which keeps
 * `FIREBASE_IDENTITY_NOT_LINKED` distinct from its conflict because there "you have
 * no provider connected" is the outcome of a valid operation. Here it is not an
 * outcome at all: an account with no `firebaseUid` cannot have had a credential
 * change that this server should record, so it is the same refusal as a mismatch and
 * reporting it as a separate code would only describe which of two dead ends the
 * caller reached.
 */
const FIREBASE_IDENTITY_CONFLICT_MESSAGE =
  'This sign-in does not match the one connected to this account. Please contact an administrator.';

/**
 * The recency refusal — 409, never 401 or 403.
 *
 * ★ THE STATUS IS LOAD-BEARING. `mobile/lib/client.ts` treats a **401 or 403**
 * response to a request that carried a token as SESSION LOSS and clears the client's
 * session, and this route is authenticated, so every response it produces is such a
 * response. A 401 here would therefore sign the user out over a freshness check
 * rather than over a dead session — the exact hazard Phase 32H's 400-not-401 rule and
 * Phase 32L's 409 exist to prevent.
 *
 * 409 is also what the approved OD-9 marker lifecycle expects: the marker is KEPT on
 * this code because the revocation is still owed, and the next sign-in is the retry.
 */
const FIREBASE_REAUTHENTICATION_REQUIRED_MESSAGE =
  'For your security, please confirm your sign-in again.';

function conflict() {
  return new ApiError(409, FIREBASE_IDENTITY_CONFLICT_MESSAGE, FIREBASE_IDENTITY_CONFLICT_CODE);
}

function reauthenticationRequired() {
  return new ApiError(
    409,
    FIREBASE_REAUTHENTICATION_REQUIRED_MESSAGE,
    FIREBASE_REAUTHENTICATION_REQUIRED
  );
}

/**
 * Records that the authenticated account's credential changed in Firebase.
 *
 * THE CHECK ORDER IS THE DESIGN, and each step exists to make the next one
 * meaningful. Nothing is mutated before step 5:
 *
 *   1. VERIFY the ID token — the only place an identity enters this module. Throws
 *      `FirebaseTokenError` / `FirebaseNotConfigured`, which the controller maps.
 *   2. LOAD the account from `userId` (the caller's own, from `req.user`). Only
 *      `firebaseUid` is selected, because the identity comparison is the entire use
 *      this module has for the document.
 *   3. IDENTITY — the presented uid must EQUAL the account's. Refused otherwise,
 *      never resolved, and nothing is written. `!user.firebaseUid` takes the same
 *      path: an account with no Firebase authority has no Firebase credential change
 *      for this server to record.
 *   4. RECENCY — the signed `auth_time` must be inside the window. Fails closed when
 *      the claim is absent, so a token the verifier could not date is refused rather
 *      than trusted.
 *   5. THE CONDITIONAL WRITE — ONE update, filtered on the expected identity, so a
 *      concurrent unlink or relink between the read above and this line cannot be
 *      silently clobbered: such a change makes the filter match NOTHING and the
 *      caller is answered from a fresh document rather than from an assumption.
 *   6. REVOKE — every open session for this user, the caller's own included.
 *      `revokeAllSessions` has no caller exception, and this module deliberately
 *      adds none: the temporary recovery-context session is ordinary, and its
 *      revocation is the point of the operation rather than a cost of it. The
 *      `SESSIONS_REVOKED_ALL` audit row is written by that helper — see the note on
 *      audit below.
 *
 * WHY THE REVOCATION IS NOT BEST-EFFORT. The stamp and the revocation are the two
 * halves of one guarantee; a stamp without the revocation would leave a session
 * minted inside the same second alive, which is precisely the hole the helper
 * exists to close. So a failure here propagates and the caller sees an error, and
 * the retry is safe because both operations are idempotent — a second stamp of the
 * same instant and a second revocation of already-revoked rows change nothing.
 *
 * AUDIT. This module writes no row of its own, and that is a decision rather than an
 * omission. The transition it performs is already recorded: `revokeAllSessions`
 * writes `SESSIONS_REVOKED_ALL` with `{ sessionsRevoked }` through the existing
 * best-effort path. It follows that a bridge invocation and a "sign out everywhere"
 * are indistinguishable in the trail, which is the one observability gap this phase
 * knowingly leaves — recorded for the owner rather than papered over with a second
 * row that would double-count the same event.
 */
export async function applyCredentialsChanged({
  userId,
  idToken,
  now = new Date(),
}: CredentialsChangedInput) {
  // STEP 1 — the ONLY place this request's identity is established.
  const identity = await verifyFirebaseIdToken(idToken);

  // STEP 2 — the caller's own account.
  const user = await User.findById(userId).select('firebaseUid');
  if (!user) {
    // Unreachable in practice: `requireAuth` loaded this user for THIS request.
    // Handled rather than asserted because the account could have been removed
    // between the middleware and here, and a 401 is the honest answer to "there is
    // no longer an account to record this against".
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  // STEP 3 — the presented identity must be the one this account authenticates
  // through. Checked BEFORE the freshness rule so that a caller presenting an
  // unrelated identity is told the truth about the identity rather than being sent
  // to reauthenticate against an account that will still refuse them.
  if (!user.firebaseUid || user.firebaseUid !== identity.uid) {
    throw conflict();
  }

  // STEP 4 — recency, from the VERIFIED signed claim. Nothing has been mutated.
  if (!authTimeIsFresh(identity.authTime, now.getTime())) {
    throw reauthenticationRequired();
  }

  // STEP 5 — the authoritative write: ONE conditional update, one field.
  //
  // `firebaseUid: identity.uid` in the FILTER is what makes this safe rather than
  // merely atomic. Nothing is read, tested and then written: a concurrent unlink
  // that detached this identity causes the filter to match NOTHING, so the stamp
  // cannot land on an account that no longer authenticates through the identity
  // whose credential changed.
  //
  // `$set` of `passwordChangedAt` ALONE. `passwordHash` is deliberately absent — see
  // the module header — and so are `businessId`, `role` and `status`, which are read
  // for the revocation below and never assigned, so this operation cannot move a
  // tenant, change a role or re-enable an account.
  const updated = await User.findOneAndUpdate(
    { _id: user._id, firebaseUid: identity.uid },
    { $set: { passwordChangedAt: now } },
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
    throw conflict();
  }

  // STEP 6 — every Inventory AI session dies with the credential they were minted
  // against, this one included. The `passwordChangedAt` stamp alone already rejects
  // tokens issued in a strictly earlier second; `revokeAllSessions` closes the
  // same-second hole and keeps `GET /api/auth/sessions` honest. It writes the
  // `SESSIONS_REVOKED_ALL` audit row itself.
  //
  // `updated.businessId` rather than anything from the request: the revocation is
  // scoped to the tenant the FRESH document actually belongs to.
  await revokeAllSessions({ userId: updated._id, businessId: updated.businessId, now });

  return { changedAt: now };
}

export default { applyCredentialsChanged };
