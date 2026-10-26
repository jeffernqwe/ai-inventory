// `CLEANUP_CONFIRM=cleanup:roles npm run cleanup:roles`
//
// Remove the role-boundary fixture: its tenant, its four accounts and their
// sessions — and nothing else.
//
// SCOPED BY BUSINESSID, NOT BY A QUERY. Every delete is filtered by the one
// `businessId` this script resolved from the fixture's own fingerprints (the
// business name AND the owner address, and it refuses if those disagree). A wrong
// id matches nothing and the verification step reports exactly that, so another
// tenant cannot be reached even if this were handed the wrong value.
//
// THE FIREBASE IDENTITIES ARE KEPT BY DEFAULT, AND THAT ORDER IS DELIBERATE.
// roadmap §27BB (F-50) records the trap: a MongoDB user whose Firebase identity
// was deleted can neither sign in nor register, and nothing in the application
// can repair it. Deleting the DATABASE rows while leaving the identities behind
// orphans nothing and frees every address — the safe direction. `--delete-firebase`
// removes the four identities too, but only AFTER the database rows are gone and
// only after re-querying that no user still references them; the four addresses
// are literal, so no other login can be reached.
//
// Usage:
//   CLEANUP_CONFIRM=cleanup:roles npm run cleanup:roles
//   CLEANUP_CONFIRM=cleanup:roles npm run cleanup:roles -- --delete-firebase
//   CLEANUP_CONFIRM=cleanup:roles npm run cleanup:roles -- --database=inventoryai_prod_db
//
// Safe to run when nothing was ever seeded: it reports that and exits 0.

import 'dotenv/config';
import mongoose from 'mongoose';

import env, { DATABASE_NAMES } from '../src/config/env.ts';
import {
  SeedSafetyError,
  assertSafeTarget,
  countTenantLeftovers,
  removeTenant,
} from './perf/lib.mjs';
import {
  ACCOUNTS,
  clearRoleFixtureExtras,
  countRoleFixtureExtras,
  findRoleTestBusiness,
} from './role-test/lib.mjs';
import PasswordResetToken from '../src/models/passwordResetToken.model.ts';
import Session from '../src/models/session.model.ts';
import User from '../src/models/user.model.ts';

const COMMAND = 'cleanup:roles';

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

async function main() {
  const deleteFirebase = process.argv.includes('--delete-firebase');
  const production = env.mongodbDbName === DATABASE_NAMES.production;

  // A DESTRUCTIVE command reads its phrase from CLEANUP_CONFIRM, not the SEED_CONFIRM
  // a seeder export would satisfy — the two families must not share a habitual export.
  // Without `--database=` the guard is development-only; WITH it, the named database
  // (production included) is accepted. It runs before a connection is opened either way.
  assertSafeTarget(env, COMMAND, {
    confirmPhrase: 'cleanup:roles',
    confirmEnvVar: 'CLEANUP_CONFIRM',
    database: argValue('--database'),
  });

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const businessId = await findRoleTestBusiness();
  if (!businessId) {
    console.log(`[${COMMAND}] nothing to clean — no role fixture tenant exists in ${env.mongodbDbName}.`);
    await mongoose.disconnect();
    return;
  }

  const users = await User.find({ businessId }).select('_id email role').lean();
  console.log(`[${COMMAND}] database  : ${env.mongodbDbName}${production ? '   (PRODUCTION)' : ''}`);
  console.log(`[${COMMAND}] tenant    : ${businessId}`);
  for (const user of users) {
    console.log(`[${COMMAND}]   ${user.role.padEnd(7)} ${user.email}`);
  }

  // Sessions and reset tokens are keyed by USER, not by business, so they would
  // otherwise linger after the users are removed (harmless — the user lookup
  // fails first — but a fixture that leaves rows behind is not clean).
  const userIds = users.map((user) => user._id);
  if (userIds.length) {
    const sessions = await Session.deleteMany({ userId: { $in: userIds } });
    const tokens = await PasswordResetToken.deleteMany({ userId: { $in: userIds } });
    console.log(
      `[${COMMAND}] removed   : ${sessions.deletedCount ?? 0} session(s), ${tokens.deletedCount ?? 0} reset token(s)`,
    );
  }

  // The governance trail and any assistant conversation are keyed by businessId but
  // are not part of the shared data list, so they are removed — and counted — here.
  const extras = await clearRoleFixtureExtras(businessId);

  const { removed, counts } = await removeTenant([businessId]);
  for (const [collection, count] of Object.entries({ ...counts, ...extras.counts })) {
    console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
  }

  // Prove it rather than assert it, over the same collection list the removal
  // used — a collection that is deleted is necessarily also verified.
  const leftovers = (await countTenantLeftovers([businessId])) + (await countRoleFixtureExtras(businessId));
  if (leftovers !== 0) {
    fail(`verification failed: ${leftovers} document(s) still reference the fixture tenant.`);
  }
  console.log(
    `[${COMMAND}] OK — removed ${removed + extras.removed} document(s); verification found 0 remaining.`,
  );

  if (!deleteFirebase) {
    console.log(`[${COMMAND}] Firebase identities kept (${ACCOUNTS.map((a) => a.email).join(', ')}).`);
    console.log(`[${COMMAND}] that is the safe direction: nothing is orphaned, and the addresses stay usable.`);
    console.log(`[${COMMAND}] pass --delete-firebase to remove those four identities as well.`);
    await mongoose.disconnect();
    return;
  }

  // Deleting an identity is only safe once no database row points at it. This is
  // re-queried here, AFTER the tenant removal, instead of assumed from it.
  const stillLinked = await User.countDocuments({ email: { $in: ACCOUNTS.map((a) => a.email) } });
  if (stillLinked !== 0) {
    fail(
      `${stillLinked} MongoDB user(s) still use the fixture addresses. Refusing to delete the ` +
        'identities — that is the F-50 lockout state. The database must be cleared first.',
    );
  }

  const { getFirebaseAdminApp } = await import('../src/services/firebase/adminApp.ts');
  const { getAuth } = await import('firebase-admin/auth');
  const auth = getAuth(getFirebaseAdminApp());

  for (const account of ACCOUNTS) {
    try {
      await auth.deleteUser((await auth.getUserByEmail(account.email)).uid);
      console.log(`[${COMMAND}] firebase  : deleted ${account.email}`);
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        console.log(`[${COMMAND}] firebase  : ${account.email} had no identity`);
        continue;
      }
      throw err;
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
