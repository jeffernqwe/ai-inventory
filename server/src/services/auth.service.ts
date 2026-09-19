import type mongoose from 'mongoose';

import bcrypt from 'bcryptjs';

import Business from '../models/business.model.ts';
import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { signAccessToken } from '../config/jwt.ts';
import { normalizeEmail } from '../utils/validate.ts';
import { assertActiveBusiness } from './business.service.ts';
import { createSessionForToken, newSessionId } from './session.service.ts';

const BCRYPT_ROUNDS = 10;
const OWNER_ROLE = 'OWNER';
const ACTIVE_STATUS = 'ACTIVE';

// Compared against when the email is unknown, so both failure branches take
// roughly the same time (reduces account-enumeration via timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-placeholder', BCRYPT_ROUNDS);

/**
 * Phase 32E — the legacy password route refusing an account that Firebase owns.
 *
 * WHY THIS EXISTS. Inventory AI is mid-migration: `passwordHash` is still written
 * by registration and still verified here, while `firebaseUid` marks an account
 * whose credential is held by Firebase. An account can carry BOTH — the Phase 32A
 * §9.1 lazy migration writes `firebaseUid` onto an account that keeps its hash —
 * and from that moment the bcrypt hash is a second, independently valid credential
 * for the same identity. Nothing keeps the two in step: `changePassword` below
 * rewrites the hash without telling Firebase anything, so a user who changes their
 * password here leaves a Firebase password behind that still works.
 *
 * THE BYPASS THIS CLOSES. Without the guard, the mobile client's legacy fallback
 * (which fires whenever Firebase refuses the credentials) would authenticate a
 * Firebase-linked account through that retained hash — so a wrong Firebase password
 * would not matter, and the Firebase credential would be decorative. The client
 * cannot be trusted to prevent this and is not asked to: it cannot even SEE the
 * difference, because `auth/invalid-credential` is deliberately ambiguous — Firebase
 * returns it for "no such user" and "wrong password" alike, to stop enumeration. The
 * distinction is therefore made here, where the `firebaseUid` is readable.
 *
 * PLACEMENT IS THE WHOLE DESIGN, and every line below it depends on the order:
 *
 *   1. AFTER the password comparison. A caller who has not proved the legacy
 *      password gets the ordinary 401 and learns nothing — so this is NOT an
 *      account-enumeration oracle. Only someone who already holds a working
 *      credential for the account is told that the account is Firebase-linked.
 *   2. AFTER the status check. A disabled account answers ACCOUNT_DISABLED on this
 *      route exactly as it always has, so the migration changes nothing about how
 *      disablement is reported.
 *   3. BEFORE `assertActiveBusiness` and the session write. No session is created,
 *      so the refusal cannot leave a half-login behind. Without a session there is
 *      nothing to revoke and nothing for `requireAuth` to admit.
 *
 * 403, not 401: the credential WAS correct — the caller authenticated, and is
 * being told they must present it through a different door. It is also the status
 * the adjacent "you authenticated but may not proceed" outcomes already use
 * (`ACCOUNT_DISABLED`, `BUSINESS_NOT_ACTIVE`, `REGISTRATION_REQUIRED`), so a client
 * needs one branch for the family rather than a second one for this case.
 *
 * THE LEGACY ROUTE IS NOT REMOVED, AND NOBODY IS LOCKED OUT. The route keeps
 * working for every account that has no `firebaseUid` — which today is every
 * account — and a Firebase-linked account signs in through
 * `POST /api/auth/firebase/exchange`, the route that already exists for it. What
 * the account loses is only the second, unmanaged credential.
 */
export const FIREBASE_SIGN_IN_REQUIRED_CODE = 'FIREBASE_SIGN_IN_REQUIRED';

/**
 * THE COPY NAMES NO SCREEN, deliberately. It is tempting to write "use the
 * Firebase sign-in button", but Phase 32E signs in through this same email and
 * password form — there is no separate control to point at — and the later
 * provider phases will add one. Naming a credential rather than a control is
 * therefore accurate in both worlds: the caller typed a password that verified
 * against this account's retained hash, so the actionable fact is that the
 * password that owns the account is Firebase's, not this one.
 */
const FIREBASE_SIGN_IN_REQUIRED_MESSAGE =
  'This account signs in with Firebase. Enter your Firebase password to continue.';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const ACCOUNT_DISABLED_MESSAGE = 'This account is disabled. Contact an administrator.';

/**
 * Local to this module, following `inventory.service.ts`, `product.service.ts`,
 * `audit.service.ts` and `users.service.ts`: every caller passes either the
 * string `req.user` carries or the ObjectId a document the server already loaded
 * holds, and the model casts whichever arrives.
 */
type IdLike = string | mongoose.Types.ObjectId;

/**
 * The user document, derived from the model itself rather than restated: this is
 * the same type `users.service.ts` receives from its own queries and hands to
 * `toPublicUser` below, so the public DTO cannot be checked against one shape
 * where it is produced and another where it is consumed.
 */
type UserDoc = mongoose.HydratedDocFromModel<typeof User>;

/** The validated registration payload (`validateRegister`). */
type RegisterPayload = {
  businessName: string;
  name: string;
  email: string;
  password: string;
};

/**
 * The validated login payload (`validateLogin`). `deviceLabel` stays `unknown`
 * because it is deliberately NOT validated — `normalizeDeviceLabel` coerces
 * anything it is given, and a malformed label must never be able to fail a login.
 */
type LoginPayload = {
  email: string;
  password: string;
  deviceLabel?: unknown;
};

/** The validated password-change payload (`validateChangePassword`). */
type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

/** Public shape of a user document. Never includes passwordHash. */
export function toPublicUser(user: UserDoc) {
  return {
    id: String(user._id),
    businessId: String(user.businessId),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

function isDuplicateKey(err: unknown) {
  return (err as { code?: unknown } | null | undefined)?.code === 11000;
}

/**
 * Registration creates a Business and its OWNER user (spec §45 user flow:
 * Register -> Create Business -> Create OWNER user). The businessId on the user
 * always comes from the server-created Business document.
 */
export async function registerBusinessOwner({ businessName, name, email, password }: RegisterPayload) {
  const normEmail = normalizeEmail(email);

  const alreadyRegistered = await User.exists({ email: normEmail });
  if (alreadyRegistered) {
    throw new ApiError(409, 'An account with this email already exists', 'EMAIL_IN_USE');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const business = await Business.create({ name: businessName });

  let user;
  try {
    user = await User.create({
      businessId: business._id,
      name: name.trim(),
      email: normEmail,
      passwordHash,
      role: OWNER_ROLE,
      status: ACTIVE_STATUS,
    });
  } catch (err) {
    // Registration is atomic from the client's perspective: undo the business if
    // the user could not be created (e.g. a duplicate-email race on the index).
    await Business.deleteOne({ _id: business._id }).catch(() => {});
    if (isDuplicateKey(err)) {
      throw new ApiError(409, 'An account with this email already exists', 'EMAIL_IN_USE');
    }
    throw err;
  }

  return { user, business };
}

/**
 * Login. Generic 401 for unknown email / wrong password (never reveals which);
 * DISABLED accounts are rejected with 403. On success returns a signed access
 * token, the public user, and the session row the token names.
 *
 * Phase 32E: DISABLED and FIREBASE-LINKED accounts are rejected with 403. The
 * Firebase refusal is the one thing this phase changes here — the guard sits
 * after both checks above it, so nothing about how a wrong password or a
 * disabled account is reported has moved. See
 * {@link FIREBASE_SIGN_IN_REQUIRED_CODE}.
 *
 * Phase 26A: the token is no longer the whole session. A login opens a
 * server-side session first and embeds its id as the token's `jti`, so the
 * token can be withdrawn. The session is written BEFORE the token is returned —
 * if the write fails the login fails, because a token naming no session would be
 * unusable anyway, and handing one out would be a silent half-login.
 */
export async function loginWithPassword({ email, password, deviceLabel }: LoginPayload) {
  const normEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normEmail }).select('+passwordHash');

  const passwordOk = await bcrypt.compare(
    password,
    user?.passwordHash || DUMMY_HASH
  );

  if (!user || !passwordOk) {
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS');
  }
  if (user.status !== ACTIVE_STATUS) {
    throw new ApiError(403, ACCOUNT_DISABLED_MESSAGE, 'ACCOUNT_DISABLED');
  }
  // Phase 32E: the credentials are valid, but this account's credential is held by
  // Firebase, so the retained bcrypt hash must not be a second way in. Sits after
  // the two checks above and before every side effect — see the constant's comment
  // for why each position is load-bearing.
  if (user.firebaseUid) {
    throw new ApiError(403, FIREBASE_SIGN_IN_REQUIRED_MESSAGE, FIREBASE_SIGN_IN_REQUIRED_CODE);
  }
  // Phase 07B / H2: the credentials are valid, but the tenant must be present
  // and ACTIVE. SUSPENDED / ARCHIVED / deleted businesses cannot log in. This
  // runs after the password check so the response never reveals whether an
  // email merely exists in an inactive business.
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
 * Password change (Phase 15). The current password is verified against the
 * stored hash FIRST — nothing changes on a wrong password. On success the hash
 * is replaced and passwordChangedAt is stamped with now, which invalidates
 * every JWT issued before that moment (requireAuth compares the token's iat
 * second: iat < changedAtSec → 401 SESSION_INVALIDATED). No new token is
 * issued here — the client signs in again with the new password, and that
 * fresh token's iat is at or after changedAtSec, so it is never rejected.
 */
export async function changePassword(userId: IdLike, { currentPassword, newPassword }: ChangePasswordPayload) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }
  const passwordOk = await bcrypt.compare(currentPassword, user.passwordHash || DUMMY_HASH);
  if (!passwordOk) {
    throw new ApiError(400, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.passwordHash = passwordHash;
  user.passwordChangedAt = new Date();
  await user.save();
  return { changedAt: user.passwordChangedAt };
}

/**
 * Profile name update (Phase 15). The user id comes exclusively from the
 * authenticated session (req.user.id) — never from the client. Returns the
 * updated user document for the public DTO.
 */
export async function updateMyName(userId: IdLike, name: string) {
  const user = await User.findByIdAndUpdate(
    userId,
    { name },
    { returnDocument: 'after', runValidators: true }
  );
  if (!user) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }
  return user;
}

export default { registerBusinessOwner, loginWithPassword, changePassword, updateMyName, toPublicUser };
