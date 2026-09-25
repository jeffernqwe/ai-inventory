/**
 * Phase 32C — the Firebase exchange and registration domain logic.
 *
 * This is where a VERIFIED Firebase identity becomes an Inventory AI principal.
 * Two operations live here, and they are the only two places a `firebaseUid` is
 * ever written or read as a join key:
 *
 *   exchangeFirebaseSession()      — identity -> existing MongoDB user -> application session
 *   registerBusinessFromFirebase() — identity -> new Business + OWNER user (no session; the
 *                                    caller exchanges next, exactly as POST /api/auth/register
 *                                    issues no token today)
 *
 * THE CENTRAL SECURITY PROPERTY: `firebaseUid`, `email`, `businessId`, `role` and
 * `status` all come from the server. The uid and email are read from the value
 * `verifyFirebaseIdToken` returns — which is itself narrowed from a token whose
 * signature Google verified — and `businessId`, `role` and `status` are read from
 * the MongoDB `User` document the uid resolves to. NOTHING in this module reads an
 * identity, a tenant or a role from a request body, and the validators that feed it
 * do not even return such a field, so a body carrying `firebaseUid`, `businessId` or
 * `role` is inert by construction rather than by a check that could be removed.
 *
 * WHY THIS IS A SEPARATE MODULE FROM auth.service.ts. That service owns the
 * PASSWORD path: it compares a bcrypt hash and it is the only place a password is
 * ever read. This one never touches `passwordHash` at all — a Firebase-native
 * account has none. Keeping them apart means the password logic and the federated
 * logic cannot accidentally share a branch, and the legacy path stays byte-stable
 * while Firebase is added beside it (Phase 32A §10).
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO:
 *   * It does not import `firebase-admin`. It reaches Firebase only through
 *     `services/firebase/index.ts`, the Phase 32B boundary, so no controller,
 *     route or service here learns how the Admin SDK is initialized.
 *   * It does not link accounts. A verified identity whose email matches an
 *     existing password account is REFUSED, never merged — automatic linking
 *     without proof of ownership is an account-takeover vector, and the policy is
 *     an open owner decision (Phase 32A §14.4). See registerBusinessFromFirebase.
 *   * It does not enforce `emailVerified`. It persists the claim (§7.3) and makes
 *     no decision from it (Phase 32A §14.2).
 *   * It does not create a session for registration, and it does not create a
 *     second session mechanism anywhere: the exchange calls the SAME
 *     `newSessionId` / `signAccessToken` / `createSessionForToken` triple that
 *     `loginWithPassword` calls, so `expiresAt`, the device-label normalization,
 *     the TTL index and the SESSION_CREATED audit row all behave identically.
 */

import Business from '../models/business.model.ts';
import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { signAccessToken } from '../config/jwt.ts';
import { normalizeEmail } from '../utils/validate.ts';
import { error as logError } from '../utils/logger.ts';
import { assertActiveBusiness } from './business.service.ts';
import { createSessionForToken, newSessionId } from './session.service.ts';
import { verifyFirebaseIdToken } from './firebase/index.ts';

const OWNER_ROLE = 'OWNER';
const ACTIVE_STATUS = 'ACTIVE';

/** Matches the model's own validation; a longer name would fail the write. */
const NAME_MAX = 100;

/**
 * The identity resolved to no MongoDB user. Phase 32A §7.4 / §16.3.
 *
 * Status is 403 and the tension in the approved design is worth stating rather
 * than glossing: §7.4 says "**not a 404**: the identity is valid, it simply has no
 * tenant yet", and §16.3 calls it "a normal outcome ... **not an error status**".
 * Those two readings cannot both be satisfied by one status code, and this
 * implementation follows the Phase 32C brief, which names `REGISTRATION_REQUIRED`
 * among the application error codes to use under the existing `{error, message}`
 * envelope. 403 is also the code the two adjacent outcomes in this same flow
 * already use — `ACCOUNT_DISABLED` and `BUSINESS_NOT_ACTIVE` — so a client has one
 * branch that covers "you authenticated, but you may not proceed".
 *
 * If the owner prefers the §16.3 reading (a 200 carrying the outcome), the change
 * is one line in controllers/firebaseAuth.controller.ts and no caller of this
 * module is affected: the code string, not the status, is the contract.
 */
export const REGISTRATION_REQUIRED_CODE = 'REGISTRATION_REQUIRED';
const REGISTRATION_REQUIRED_MESSAGE =
  'This sign-in is not linked to an Inventory AI account yet. Create a business account to continue.';

// Copied verbatim from auth.service.ts. A disabled account must read identically
// whichever route it tried to sign in through — a user who could tell the two
// messages apart could tell which sign-in method their account "has".
const ACCOUNT_DISABLED_MESSAGE = 'This account is disabled. Contact an administrator.';

// Copied verbatim from auth.service.ts's registration path, for the same reason:
// a duplicate email is one fact, and it reads the same on both registration routes.
const EMAIL_IN_USE_MESSAGE = 'An account with this email already exists';

/**
 * The service payloads. Both `deviceLabel` and `name` stay `unknown` because they
 * are deliberately NOT validated — `normalizeDeviceLabel` coerces the first and
 * `resolveDisplayName` coerces the second, so a malformed value can never fail the
 * request. Neither reaches a query filter or an authorization decision.
 */
type ExchangePayload = {
  idToken: unknown;
  deviceLabel?: unknown;
};

type RegisterPayload = {
  idToken: unknown;
  businessName: string;
  name?: unknown;
};

/**
 * The duplicate-key field name from a MongoDB E11000, or null.
 *
 * Needed because the two unique indexes on `users` mean two entirely different
 * things. `email` colliding is an ordinary 409 the client already handles;
 * `firebaseUid` colliding is the Phase 32A §7.4 hard-error case — the signature of
 * a compromised or misconfigured mapping, which "must never be auto-resolved".
 * Reporting the second as the first would hide exactly the condition an operator
 * needs to see.
 *
 * Phase 32H exports it: the linking boundary writes the same `firebaseUid` field
 * and hits the same E11000 when two accounts race for one identity, so it must
 * read the collision the same way rather than grow a second interpretation of it.
 */
export function duplicateKeyField(err: unknown): string | null {
  const pattern = (err as { keyPattern?: Record<string, unknown> } | null)?.keyPattern;
  if (!pattern || typeof pattern !== 'object') return null;
  return Object.keys(pattern)[0] ?? null;
}

/**
 * The display name for a newly registered account.
 *
 * `name` comes from the request because it is PROFILE TEXT, not identity — the
 * same standing as `businessName`, and the model requires a non-empty value. The
 * fallback chain exists because Phase 32A §7.3 requires it: a Google account with
 * an empty `displayName` must still produce a valid write, so the local-part of
 * the (verified) email is used rather than letting the model reject the insert.
 *
 * The name is deliberately NOT read from a token claim: `VerifiedFirebaseIdentity`
 * exposes four fields and a display name is not one of them, so a future claim
 * cannot silently become an input to this write.
 */
function resolveDisplayName(name: unknown, email: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed) return trimmed.slice(0, NAME_MAX);
  const localPart = email.split('@')[0] ?? '';
  return localPart.slice(0, NAME_MAX) || 'Owner';
}

/**
 * Exchanges a verified Firebase ID token for an Inventory AI application session.
 *
 * Mirrors `loginWithPassword` step for step after the identity is established —
 * status, then tenant liveness, then session, in that order — so a disabled user
 * cannot bypass either gate by choosing a different sign-in method, and the
 * response the client receives is the same envelope with the same field names.
 *
 * `user.businessId` is passed to `createSessionForToken` for the SESSION_CREATED
 * audit row only; sessions carry no tenant (Phase 26A). It comes from the loaded
 * document, never from the request.
 *
 * RE-EXCHANGE IS INTENDED (Phase 32A §8.4). This function is idempotent with
 * respect to everything except session creation: calling it twice with fresh
 * tokens from one live Firebase session opens two sessions, which is exactly what
 * a client recovering from an expired application JWT should get, and both are
 * individually revocable through the Phase 26A routes.
 */
export async function exchangeFirebaseSession({ idToken, deviceLabel }: ExchangePayload) {
  // The ONLY place this request's identity is established. Throws
  // FirebaseTokenError (rejected token) or FirebaseNotConfigured (no service
  // account) — neither is an ApiError, and the controller maps both.
  const identity = await verifyFirebaseIdToken(idToken);

  const user = await User.findOne({ firebaseUid: identity.uid });
  if (!user) {
    throw new ApiError(403, REGISTRATION_REQUIRED_MESSAGE, REGISTRATION_REQUIRED_CODE);
  }
  if (user.status !== ACTIVE_STATUS) {
    throw new ApiError(403, ACCOUNT_DISABLED_MESSAGE, 'ACCOUNT_DISABLED');
  }
  // Phase 07B / H2, unchanged and reused rather than reimplemented: the tenant
  // must exist and be ACTIVE. Runs after the status check so the response never
  // reveals whether an identity merely belongs to an inactive business.
  await assertActiveBusiness(user.businessId);

  const jti = newSessionId();
  const token = signAccessToken(user._id, jti);
  const session = await createSessionForToken({
    userId: user._id,
    businessId: user.businessId,
    token,
    deviceLabel,
  });
  return { token, user, session };
}

/**
 * Creates the Business and its OWNER user for a verified Firebase identity.
 *
 * Firebase already created the authentication identity CLIENT-side (Phase 32A
 * §8.2 step 1), so this route must not create one: it accepts no password, and the
 * `firebaseUid` it stores is the uid of the token it just verified. No token is
 * issued here — this mirrors `POST /api/auth/register`, which also returns 201 and
 * no token, and the client exchanges next.
 *
 * THE ORPHAN CASE IS THE DESIGNED ONE. If this fails after Firebase succeeded, a
 * Firebase account exists with no MongoDB user. That is intrinsic to federated
 * registration and cannot be eliminated client-side; it is made self-healing
 * instead, because the exchange answers REGISTRATION_REQUIRED for a valid identity
 * with no record, so the user retries signup and the orphan is adopted (§8.2).
 * Creating the Business is rolled back on failure, exactly as
 * `registerBusinessOwner` does, so the retry starts from a clean slate.
 *
 * ACCOUNT LINKING IS REFUSED, NOT IMPLEMENTED. A verified identity whose email
 * already belongs to a MongoDB user answers 409 EMAIL_IN_USE and nothing is
 * written. Merging the two would need proof that the caller owns both, and the
 * policy is an open owner decision (§14.4); refusing is the only option that
 * cannot be an account-takeover vector, and it matches what today's register
 * route already answers for the same email.
 */
export async function registerBusinessFromFirebase({ idToken, businessName, name }: RegisterPayload) {
  const identity = await verifyFirebaseIdToken(idToken);

  // `email` is nullable in the verified identity (a phone-auth token carries
  // none) but is REQUIRED and unique on the User model, so an identity without one
  // cannot have a tenant. Reported as a validation problem under `idToken` —
  // reusing the existing VALIDATION_ERROR code rather than inventing a
  // Firebase-specific one for a condition the client fixes by using a provider
  // that supplies an address.
  const email = normalizeEmail(identity.email);
  if (!email) {
    const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.fields = [
      {
        field: 'idToken',
        message: 'the verified Firebase identity carries no email address',
      },
    ];
    throw err;
  }

  const alreadyRegistered = await User.exists({ email });
  if (alreadyRegistered) {
    throw new ApiError(409, EMAIL_IN_USE_MESSAGE, 'EMAIL_IN_USE');
  }

  const business = await Business.create({ name: businessName });

  let user;
  try {
    user = await User.create({
      businessId: business._id,
      name: resolveDisplayName(name, email),
      email,
      // ★ From the VERIFIED token payload and from nowhere else. This assignment
      //   is the whole reason the exchange can trust the join key later.
      firebaseUid: identity.uid,
      // Persisted, not enforced (Phase 32A §14.2).
      emailVerified: identity.emailVerified,
      role: OWNER_ROLE,
      status: ACTIVE_STATUS,
    });
  } catch (err) {
    // Registration is atomic from the client's perspective: undo the business if
    // the user could not be created. Awaited and swallowed — the original error
    // is what the caller must see, and an orphaned business is the lesser failure.
    await Business.deleteOne({ _id: business._id }).catch(() => {});

    if (duplicateKeyField(err) === 'firebaseUid') {
      // Phase 32A §7.4: "Treat as a hard error and audit it — this is the
      // signature of a compromised or misconfigured mapping, never something to
      // auto-resolve." Deliberately NOT EMAIL_IN_USE: the two mean opposite
      // things, and answering the ordinary code would hide the security event.
      //
      // The disposition differs from §7.4 in one respect, and it is deliberate:
      // the record is a structured SERVER LOG rather than an AuditLog row.
      // `recordAudit` requires a businessId, and the only business in scope is
      // the one being rolled back above — attributing a security event to a
      // tenant that never existed would put a false trail in front of the
      // ADMIN-readable audit viewer, which is worse than the missing row. The
      // uid is included because the log is server-side and the uid is the value
      // an operator needs to trace the collision; it is an identifier, not a
      // credential, and no token material reaches this line.
      logError({
        type: 'firebase_identity_collision',
        message: `[firebase] registration refused: the verified identity is already linked to a MongoDB user (uid ${identity.uid}, business ${String(business._id)} rolled back)`,
      });
      // The underlying driver error is attached as `cause` so the operator can
      // still see the E11000 that produced this. It is safe to carry: the global
      // error handler reads `status`, `code`, `message`, `fields` and `applied`
      // and never `cause`, so nothing about it reaches the client.
      throw new Error('The verified Firebase identity is already linked to another account', {
        cause: err,
      });
    }

    if (duplicateKeyField(err) === 'email') {
      // A race with a concurrent registration that passed the pre-check above.
      throw new ApiError(409, EMAIL_IN_USE_MESSAGE, 'EMAIL_IN_USE');
    }
    throw err;
  }

  return { user, business };
}

export default { exchangeFirebaseSession, registerBusinessFromFirebase, REGISTRATION_REQUIRED_CODE };
