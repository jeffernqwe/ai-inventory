import bcrypt from 'bcryptjs';

import Business from '../models/business.model.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { signAccessToken } from '../config/jwt.js';
import { normalizeEmail } from '../utils/validate.js';

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
 * token plus the public user.
 */
export async function loginWithPassword({ email, password }) {
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

  const token = signAccessToken(user._id);
  return { token, user };
}

export default { registerBusinessOwner, loginWithPassword, toPublicUser };
