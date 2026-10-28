// Shared core for the ROLE-BOUNDARY fixture: `seed:roles`, `cleanup:roles` and
// `verify:roles`.
//
// WHY THIS FIXTURE EXISTS. Every role guard in this project is proved by the
// automated suite (Phase 23 structurally, Phase 24 at runtime over the real
// routes), but nothing gave a human four working logins inside ONE tenant to
// look at the app with. The phone is where the client's own role gating is
// visible, and the suite cannot see the phone.
//
// WHY FOUR ROLES IN ONE TENANT. The question a person asks with these accounts
// is "what does STAFF see that MANAGER does not?", and the only way to answer it
// is against the SAME products, locations and history. Four separate tenants
// would make a missing button indistinguishable from an empty dataset.
//
// WHY NO EMAIL VERIFICATION CODE IS NEEDED — AND WHY THAT IS NOT A BYPASS.
// The identity is created (or refreshed) by the Firebase ADMIN SDK with
// `emailVerified: true`, which is exactly what the shipped AUTH-04 confirm
// step writes after a real code is redeemed
// (`updateUser(uid, { emailVerified: true })`). No route, no middleware and no
// environment value is opened up, and `EMAIL_NOT_VERIFIED` still applies to
// every other account: the only thing skipped is the round trip to a mailbox.
// The addresses are all in the reserved `example.invalid` domain, which can
// never receive mail, so no code could be delivered there anyway.
//
// THE BLAST RADIUS IS FOUR LITERAL ADDRESSES. Even if this module were run
// against the wrong Firebase project it could only create/update those four
// `.invalid` identities; it never enumerates, never deletes and never matches
// on a pattern. The DATABASE side is guarded separately and before any
// connection: `assertSeedTarget` for the seeder and `assertScopedCleanupTarget`
// for the teardown — two phrases in development, three in production, with
// `--database=` required to equal the resolved database. The four literal
// addresses are the whole blast radius in either mode.
//
// NOTHING HERE RUNS ON IMPORT: no `main()`, no connection, no write.

import AIConversation from '../../src/models/aiConversation.model.ts';
import AIMessage from '../../src/models/aiMessage.model.ts';
import AuditLog from '../../src/models/auditLog.model.ts';
import Business from '../../src/models/business.model.ts';
import User from '../../src/models/user.model.ts';
import { ROLES, ROLE_VALUES } from '../../src/constants/roles.ts';
import { SeedSafetyError } from '../perf/lib.mjs';

/** The phrase the seeder requires (`SEED_CONFIRM`). */
export const SEED_CONFIRM_PHRASE = 'seed-roles';

/** The phrase the teardown requires (`CLEANUP_CONFIRM`). */
export const CLEANUP_CONFIRM_PHRASE = 'cleanup:roles';

/** The fixture tenant's fingerprint. Every lookup and every delete is anchored here. */
export const ROLE_TEST_BUSINESS_NAME = 'ROLE TEST — role boundary fixture (do not use)';

/** The environment variable carrying the fixture's shared sign-in password. */
export const PASSWORD_ENV = 'ROLE_TEST_PASSWORD';

/**
 * The four accounts, one per role. The emails are ORDERED so the OWNER is first:
 * the tenant is identified by name AND by this owner address, and two independent
 * fingerprints are what make a cleanup unable to reach a tenant this script did
 * not create.
 *
 * `example.invalid` is a reserved TLD (RFC 2606): it can never resolve, never
 * accept mail, and can never be a real person's address.
 */
export const ACCOUNTS = Object.freeze([
  Object.freeze({ role: ROLES.OWNER, email: 'role-owner@example.invalid', name: 'Role Test Owner' }),
  Object.freeze({ role: ROLES.ADMIN, email: 'role-admin@example.invalid', name: 'Role Test Admin' }),
  Object.freeze({ role: ROLES.MANAGER, email: 'role-manager@example.invalid', name: 'Role Test Manager' }),
  Object.freeze({ role: ROLES.STAFF, email: 'role-staff@example.invalid', name: 'Role Test Staff' }),
]);

/** Every role must have exactly one account, or the fixture cannot prove the boundary. */
if (ROLE_VALUES.some((role) => !ACCOUNTS.some((account) => account.role === role))) {
  throw new Error('the role fixture must hold exactly one account per role');
}

/** The password, read from the environment. Never logged, never written to a file. */
export function readFixturePassword() {
  const password = process.env[PASSWORD_ENV];
  if (!password) {
    throw new SeedSafetyError(
      `${PASSWORD_ENV} is not set. Supply the fixture accounts' sign-in password through the ` +
        'environment — it is never written to a file or printed.',
    );
  }
  if (password.length < 8) {
    throw new SeedSafetyError(`${PASSWORD_ENV} must be at least 8 characters. Nothing was written.`);
  }
  return password;
}

/**
 * Create — or refresh — one VERIFIED Firebase identity with a known password.
 *
 * An existing identity is updated rather than refused, because re-running the
 * seeder is how the password is rotated and how an identity left in a odd state
 * (unverified, disabled) is repaired. Only the four literal addresses in
 * `ACCOUNTS` can reach this function.
 *
 * `emailVerified: true` is the same write the shipped confirm step performs after
 * a real 6-digit code is redeemed. Nothing else about verification changes.
 */
export async function ensureVerifiedIdentity(email, password) {
  const { getFirebaseAdminApp } = await import('../../src/services/firebase/adminApp.ts');
  const { getAuth } = await import('firebase-admin/auth');
  const auth = getAuth(getFirebaseAdminApp());

  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password, emailVerified: true, disabled: false });
    return { uid: existing.uid, created: false };
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  const created = await auth.createUser({ email, password, emailVerified: true, disabled: false });
  return { uid: created.uid, created: true };
}

/**
 * Resolve the fixture tenant, refusing every ambiguous state.
 *
 * Two fingerprints are consulted — the business NAME and the OWNER address — and
 * a disagreement between them is an error rather than something to pick a side
 * on. The same rule the demo seeder follows applies here: this tool may create a
 * tenant, and it may reuse the one it clearly created, but it must never guess
 * which of two candidates a person meant.
 */
/**
 * The fixture tenant's id, or a refusal — as a pure decision.
 *
 * WHY THE INTERSECTION. The old lookup UNIONED the business carrying the marker name with the
 * business the fixture OWNER points at. A real business that happened to share the name was
 * therefore returned, and the cleanup could delete it. Two independent fingerprints identify one
 * tenant only when they AGREE; a half-state is refused rather than guessed at. A supplied id is a
 * claim checked against that answer, never an input that widens it.
 */
export function roleFixtureTenantIdFrom({
  nameBusinessIds = [],
  ownerBusinessIds = [],
  claimedBusinessIds = [],
} = {}) {
  const unique = (ids) => [...new Set((ids ?? []).filter(Boolean).map(String))];
  const names = unique(nameBusinessIds);
  const owners = unique(ownerBusinessIds);
  const matched = names.filter((id) => owners.includes(id));

  if (matched.length > 1) {
    throw new SeedSafetyError(
      `${matched.length} businesses match both role-fixture fingerprints (${matched.join(', ')}). ` +
        'Refusing to guess which tenant was meant. Nothing was changed.',
    );
  }

  const resolved = matched[0] ?? null;
  if (!resolved && (names.length || owners.length)) {
    throw new SeedSafetyError(
      'the role fixture is in a half-state: its fingerprints disagree — the marker name and the ' +
        `fixture owner point at different businesses (name: ${names.join(', ') || '(none)'}; owner: ` +
        `${owners.join(', ') || '(none)'}). Refusing to guess at a repair. Nothing was changed.`,
    );
  }

  const claims = unique(claimedBusinessIds);
  if (claims.length > 1) {
    throw new SeedSafetyError(
      `${claims.length} business ids were supplied (${claims.join(', ')}); expected one. ` +
        'Nothing was changed.',
    );
  }
  if (claims.length === 1) {
    if (!resolved) {
      throw new SeedSafetyError(
        `--business=${claims[0]} names no role-fixture tenant. Create the fixture first; nothing ` +
          'was changed.',
      );
    }
    if (claims[0] !== resolved) {
      throw new SeedSafetyError(
        `--business=${claims[0]} does not name the role fixture (${resolved}). Nothing was changed.`,
      );
    }
  }

  return resolved;
}

export async function findRoleTestBusiness({ businessIds = [] } = {}) {
  const byName = await Business.find({ name: ROLE_TEST_BUSINESS_NAME }).select('_id').lean();
  const byOwner = await User.find({ email: ACCOUNTS[0].email }).select('businessId').lean();
  return roleFixtureTenantIdFrom({
    nameBusinessIds: byName.map((business) => business._id),
    ownerBusinessIds: byOwner.map((user) => user.businessId),
    claimedBusinessIds: businessIds,
  });
}

/**
 * Create the fixture tenant and its four users, or bring an existing one back to
 * the shape it must have.
 *
 * Only ever WRITES users of this tenant. It never deletes a user, never moves one
 * to another `businessId` and never re-points a `firebaseUid`: identity linkage
 * is not something a fixture may change as a side effect.
 */
export async function ensureRoleTestTenant() {
  const password = readFixturePassword();
  const existingId = await findRoleTestBusiness();

  let businessId = existingId;
  let businessCreated = false;

  if (!businessId) {
    const business = await Business.create({ name: ROLE_TEST_BUSINESS_NAME, status: 'ACTIVE' });
    businessId = String(business._id);
    businessCreated = true;
  } else {
    const business = await Business.findById(businessId).select('name status').lean();
    if (!business) {
      throw new SeedSafetyError(
        `the role fixture's business ${businessId} does not exist. Refusing to guess at a repair.`,
      );
    }
    if (business.status !== 'ACTIVE') {
      throw new SeedSafetyError(
        `the role fixture's business status is ${business.status}. Set it to ACTIVE deliberately.`,
      );
    }
  }

  const identities = [];
  const users = {};

  for (const account of ACCOUNTS) {
    const identity = await ensureVerifiedIdentity(account.email, password);

    // The identity is resolved by the Firebase UID first and by email second,
    // because BOTH are join keys that can already exist in the wrong shape:
    //  * a user carrying this uid in another business would mean the fixture is
    //    about to move a tenant, which it must never do;
    //  * a user carrying this email with a DIFFERENT uid is the F-50 state — an
    //    address whose identity was replaced — and guessing at it is how a login
    //    becomes permanently unusable.
    const byUid = await User.findOne({ firebaseUid: identity.uid })
      .select('_id businessId email firebaseUid role')
      .lean();
    const byEmail = await User.findOne({ email: account.email })
      .select('_id businessId email firebaseUid role')
      .lean();

    const found = byUid ?? byEmail;

    if (found && String(found.businessId) !== String(businessId)) {
      throw new SeedSafetyError(
        `"${account.email}" already belongs to business ${String(found.businessId)}, not to the ` +
          `role fixture (${businessId}). Refusing to move an account between tenants. Nothing was written.`,
      );
    }
    if (byEmail && byEmail.firebaseUid && byEmail.firebaseUid !== identity.uid) {
      throw new SeedSafetyError(
        `"${account.email}" already has a different Firebase identity linked in MongoDB. ` +
          'Refusing to re-point it — that is the F-50 state and needs a deliberate repair.',
      );
    }

    let user = found;
    if (user) {
      user = await User.findByIdAndUpdate(
        user._id,
        {
          businessId,
          name: account.name,
          role: account.role,
          status: 'ACTIVE',
          firebaseUid: identity.uid,
          emailVerified: true,
        },
        { returnDocument: 'after' },
      )
        .select('_id businessId email firebaseUid role status')
        .lean();
    } else {
      user = await User.create({
        businessId,
        name: account.name,
        email: account.email,
        role: account.role,
        status: 'ACTIVE',
        firebaseUid: identity.uid,
        emailVerified: true,
        // A Firebase-native account holds no server password. It is the same
        // shape registration writes, and it keeps the legacy login route from
        // accepting these addresses.
        passwordHash: undefined,
      });
      user = {
        _id: user._id,
        businessId: user.businessId,
        email: user.email,
        firebaseUid: user.firebaseUid,
        role: user.role,
        status: user.status,
      };
    }

    users[account.role] = {
      id: String(user._id),
      email: account.email,
      name: account.name,
      role: account.role,
      status: user.status,
    };
    identities.push({ ...account, uid: identity.uid, identityCreated: identity.created });
  }

  // Prove the tenant's shape rather than trusting the loop above: exactly one
  // user per role, all ACTIVE, all linked. A fixture that silently holds two
  // STAFF accounts would make "the STAFF view" ambiguous.
  const holders = await User.find({ businessId }).select('role status firebaseUid email').lean();
  const problems = [];
  for (const role of ROLE_VALUES) {
    const matching = holders.filter((user) => user.role === role);
    if (matching.length !== 1) {
      problems.push(`${matching.length} ${role} account(s), expected exactly 1`);
    }
    if (matching[0] && matching[0].status !== 'ACTIVE') {
      problems.push(`${matching[0].email} is ${matching[0].status}`);
    }
    if (matching[0] && !matching[0].firebaseUid) {
      problems.push(`${matching[0].email} has no firebaseUid`);
    }
  }
  if (holders.length !== ROLE_VALUES.length) {
    problems.push(`${holders.length} users in the tenant, expected ${ROLE_VALUES.length}`);
  }
  if (problems.length) {
    throw new SeedSafetyError(
      `the role fixture is not in the shape it must have: ${problems.join('; ')}.`,
    );
  }

  return {
    businessId: String(businessId),
    businessName: ROLE_TEST_BUSINESS_NAME,
    businessCreated,
    users,
    identities,
  };
}

/**
 * The fixture's rows that live OUTSIDE `TENANT_DATA_COLLECTIONS`: the governance
 * trail and any assistant conversation started while the fixture was in use.
 *
 * They are removed here rather than by adding them to the shared performance list,
 * because the performance tenant never asks the assistant anything and a cleanup
 * that claims "0 remaining" while leaving audit rows behind would be reporting on
 * a shorter list than the one it removed from. Scoped by `businessId`, so no other
 * tenant can be reached.
 */
export async function clearRoleFixtureExtras(businessId) {
  const conversations = await AIConversation.find({ businessId }).select('_id').lean();
  const conversationIds = conversations.map((conversation) => conversation._id);
  const messages = conversationIds.length
    ? await AIMessage.deleteMany({ conversationId: { $in: conversationIds } })
    : { deletedCount: 0 };
  const ais = await AIConversation.deleteMany({ businessId });
  const audits = await AuditLog.deleteMany({ businessId });
  return {
    removed: (messages.deletedCount ?? 0) + (ais.deletedCount ?? 0) + (audits.deletedCount ?? 0),
    counts: {
      ai_messages: messages.deletedCount ?? 0,
      ai_conversations: ais.deletedCount ?? 0,
      audit_logs: audits.deletedCount ?? 0,
    },
  };
}

/** Count the same rows `clearRoleFixtureExtras` removes — the verification half. */
export async function countRoleFixtureExtras(businessId) {
  const conversations = await AIConversation.find({ businessId }).select('_id').lean();
  const conversationIds = conversations.map((conversation) => conversation._id);
  return (
    (conversationIds.length ? await AIMessage.countDocuments({ conversationId: { $in: conversationIds } }) : 0) +
    conversationIds.length +
    (await AuditLog.countDocuments({ businessId }))
  );
}

export default {
  SEED_CONFIRM_PHRASE,
  CLEANUP_CONFIRM_PHRASE,
  ROLE_TEST_BUSINESS_NAME,
  PASSWORD_ENV,
  ACCOUNTS,
  roleFixtureTenantIdFrom,
  readFixturePassword,
  ensureVerifiedIdentity,
  findRoleTestBusiness,
  ensureRoleTestTenant,
  clearRoleFixtureExtras,
  countRoleFixtureExtras,
};
