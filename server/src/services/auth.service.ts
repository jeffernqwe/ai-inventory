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

/**
 * The TIMING EQUALIZER, and nothing else. Compared against when an account has
 * no stored hash, so an unknown address and a hashless account cost the same
 * bcrypt work as a real verification and cannot be told apart by response time.
 *
 * ★ PHASE 32K — IT IS NOT A CREDENTIAL, AND ITS TYPE DOES NOT SAY SO.
 * `bcrypt.hashSync` returns a VALID hash of a KNOWN string, so the old
 * `user?.passwordHash || DUMMY_HASH` idiom made this constant the comparison
 * TARGET for any account with no `passwordHash` — which meant the literal
 * `timing-equalizer-placeholder` was a working password for such an account and,
 * in `changePassword`, a working `currentPassword` with which to install a real
 * one. The hash stays, because the timing property is worth keeping; what
 * changed is that it is now only ever a target whose result is DISCARDED. See
 * `verifyPassword` below — the one reader of this constant, which cannot report
 * success for an account that holds no hash.
 */
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-placeholder', BCRYPT_ROUNDS);

/**
 * Verifies `password` against an account's STORED hash, timing-equalized.
 *
 * THE INVARIANT (Phase 32K): **no stored hash means no password.** The
 * comparison still runs when there is no hash — that is what equalizes the
 * timing of a hashless account against a real one — but its result can never be
 * `true`, so a placeholder that happens to be a valid bcrypt hash of a known
 * string can never be accepted as a credential.
 *
 * IT LIVES IN ONE FUNCTION ON PURPOSE. `|| DUMMY_HASH` appeared in two places
 * (login and change-password) and the same defect was in both, so a fix applied
 * to one of them would have looked complete. Routing every password comparison
 * through here is what makes "a placeholder is never a credential" a property of
 * the code rather than a rule two call sites must each remember.
 *
 * A falsy stored value (`undefined`, `null`, `''`) is treated as "no hash"
 * rather than passed to `bcrypt.compare`, which would reject an unparseable salt
 * and turn a forgotten field into a 500 instead of a clean refusal.
 */
async function verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean> {
  const hash = storedHash || null;
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && matches;
}

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
 * ★ PHASE 32K — Firebase is the authentication authority for this account, so
 * Inventory AI local password management does not apply to it.
 *
 * THE DECISION THIS ENCODES (Phase 32K). For every user carrying a `firebaseUid`
 * — whether Firebase-native (no hash at all) or Firebase-linked (a retained
 * hash) — Firebase owns the credential. Inventory AI never holds one that could
 * authenticate, so it must not offer to change one.
 *
 * WHY 409 AND NOT 401/403, which would be the obvious neighbours. The mobile
 * client's session-loss rule keys on the STATUS of a response to a request that
 * carried a token (`lib/client.ts`: `if (token && (res.status === 401 ||
 * res.status === 403)) sessionLostHandler?.(error)`), so a 403 here would sign a
 * user out of a perfectly valid session over a refusal that says nothing about
 * their session. 409 is also what the adjacent "this conflicts with the account's
 * current state" refusals already use (`EMAIL_IN_USE`,
 * `FIREBASE_IDENTITY_CONFLICT`), so a client needs one branch for the family.
 * The Phase 32H link route made the same move for the same reason.
 */
export const PASSWORD_NOT_APPLICABLE_CODE = 'PASSWORD_NOT_APPLICABLE';

/**
 * Provider-neutral on purpose: it names no Firebase, no uid, no token and no
 * internal field — a person reads it and knows only that their password lives
 * with whoever signs them in, which is exactly the actionable fact.
 */
const PASSWORD_NOT_APPLICABLE_MESSAGE =
  'Your password is managed by your sign-in provider, so it cannot be changed here.';

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

/**
 * The provider-neutral capability block on the public user DTO (Phase 32K).
 *
 * WHY IT EXISTS. The client must know whether local password management applies
 * before it offers it, and it must NOT be told why: `firebaseUid` is the mapping
 * this server derives authorization and identity from, so publishing it would
 * hand out the join key the whole Firebase design keeps server-side. `password`
 * is the only fact a screen needs — "may this account change a password here?" —
 * and it is expressed without naming a provider, so adding Facebook or Apple
 * later changes nothing about this contract.
 *
 * `password: false` DOES NOT MEAN "no credential exists". A Firebase-LINKED
 * account still retains its legacy hash (Phase 32H deliberately does not delete
 * it); it means the local password cannot authenticate, so it is not a password
 * a person can manage. That is the fact Phase 32K's boundary turns on.
 *
 * Exported so the two surfaces that publish a user — `toPublicUser` and
 * `requireAuth`'s `req.user` — compute it in one place rather than each carrying
 * a copy free to drift.
 */
export function authMethodsFor(user: { firebaseUid?: string | null }) {
  return { password: !user.firebaseUid };
}

/**
 * Public shape of a user document. Never includes passwordHash.
 *
 * Phase 32K adds `authMethods` — see `authMethodsFor` for why it carries a
 * capability rather than the `firebaseUid` behind it.
 */
export function toPublicUser(user: UserDoc) {
  return {
    id: String(user._id),
    businessId: String(user.businessId),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    authMethods: authMethodsFor(user),
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

  // Phase 32K: timing-equalized by `verifyPassword`, which cannot accept the
  // placeholder for an account with no stored hash. An unknown address and a
  // hashless account both compare against the equalizer and both fail.
  const passwordOk = await verifyPassword(password, user?.passwordHash);

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
 * stored hash — nothing changes on a wrong password. On success the hash
 * is replaced and passwordChangedAt is stamped with now, which invalidates
 * every JWT issued before that moment (requireAuth compares the token's iat
 * second: iat < changedAtSec → 401 SESSION_INVALIDATED). No new token is
 * issued here — the client signs in again with the new password, and that
 * fresh token's iat is at or after changedAtSec, so it is never rejected.
 *
 * ★ PHASE 32K CHANGED WHAT COMES FIRST. The order is now: load the account,
 * refuse a Firebase-owned one, then verify the current password. Until this
 * phase this function reached the bcrypt comparison unconditionally, which made
 * `user.passwordHash || DUMMY_HASH` the comparison target and let the timing
 * equalizer — a valid hash of a KNOWN string — be submitted as the "current
 * password" of any hashless account in order to install a real one. Both halves
 * of that are closed: `verifyPassword` cannot accept the placeholder, and a
 * Firebase-owned account is refused before a password is even considered.
 */
export async function changePassword(userId: IdLike, { currentPassword, newPassword }: ChangePasswordPayload) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }
  // ★ PHASE 32K — Firebase owns this account's credential, so there is no
  // Inventory AI password to change. See PASSWORD_NOT_APPLICABLE_CODE.
  //
  // PLACED BEFORE THE CURRENT-PASSWORD COMPARISON, and the position is
  // load-bearing rather than tidy. Placed after it, a Firebase-NATIVE account
  // (no hash) would fail the comparison first and report 400
  // INVALID_CURRENT_PASSWORD, while a Firebase-LINKED account (hash retained)
  // would verify and report 409 — two different answers to one question, decided
  // by whether a now-inert hash happens to still be on the document. Refusing
  // first makes the boundary the same for both states.
  //
  // It is not an enumeration oracle: the caller is authenticated as this very
  // account, so there is no fact here they do not already hold. And it sits
  // ahead of every effect below — no hash is rewritten, `passwordChangedAt` is
  // not stamped, and no session is revoked — so a refused attempt leaves the
  // account exactly as it was.
  if (user.firebaseUid) {
    throw new ApiError(409, PASSWORD_NOT_APPLICABLE_MESSAGE, PASSWORD_NOT_APPLICABLE_CODE);
  }
  // Phase 32K: the same equalizer, and the same invariant — an account with no
  // stored hash has no current password, so the placeholder cannot be used to
  // install one. This was the second half of the DUMMY_HASH defect.
  const passwordOk = await verifyPassword(currentPassword, user.passwordHash);
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

export default {
  registerBusinessOwner,
  loginWithPassword,
  changePassword,
  updateMyName,
  toPublicUser,
  authMethodsFor,
  PASSWORD_NOT_APPLICABLE_CODE,
};
