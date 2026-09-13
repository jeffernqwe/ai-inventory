import bcrypt from 'bcryptjs';

import Business from '../models/business.model.ts';
import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { signAccessToken } from '../config/jwt.ts';
import { normalizeEmail } from '../utils/validate.ts';
import { assertActiveBusiness } from './business.service.js';
import { createSessionForToken, newSessionId } from './session.service.js';

const BCRYPT_ROUNDS = 10;
const OWNER_ROLE = 'OWNER';
const ACTIVE_STATUS = 'ACTIVE';

// Compared against when the email is unknown, so both failure branches take
// roughly the same time (reduces account-enumeration via timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-placeholder', BCRYPT_ROUNDS);

/** Public shape of a user document. Never includes passwordHash. */
export function toPublicUser(user) {
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

function isDuplicateKey(err) {
  return err?.code === 11000;
}

/**
 * Registration creates a Business and its OWNER user (spec §45 user flow:
 * Register -> Create Business -> Create OWNER user). The businessId on the user
 * always comes from the server-created Business document.
 */
export async function registerBusinessOwner({ businessName, name, email, password }) {
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
 * Phase 26A: the token is no longer the whole session. A login opens a
 * server-side session first and embeds its id as the token's `jti`, so the
 * token can be withdrawn. The session is written BEFORE the token is returned —
 * if the write fails the login fails, because a token naming no session would be
 * unusable anyway, and handing one out would be a silent half-login.
 */
export async function loginWithPassword({ email, password, deviceLabel }) {
  const normEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normEmail }).select('+passwordHash');

  const passwordOk = await bcrypt.compare(
    password,
    user?.passwordHash || DUMMY_HASH
  );

  if (!user || !passwordOk) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (user.status !== ACTIVE_STATUS) {
    throw new ApiError(403, 'This account is disabled. Contact an administrator.', 'ACCOUNT_DISABLED');
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
export async function changePassword(userId, { currentPassword, newPassword }) {
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
export async function updateMyName(userId, name) {
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
