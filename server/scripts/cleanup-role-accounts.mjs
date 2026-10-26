// `npm run cleanup:roles -- --database=<name>`
//
// Remove the role-boundary fixture: its tenant, its four accounts and their
// sessions — and nothing else.
//
// THE SAME RULE AS EVERY OTHER PRODUCTION-CAPABLE SCOPED CLEANUP.
// `assertScopedCleanupTarget` requires `--database=` to equal the database this
// process resolved, refuses the test database, and costs TWO phrases in development
// or THREE in production:
//
//   CLEANUP_CONFIRM      = cleanup:roles
//   CLEANUP_DB_CONFIRM   = <the resolved database name>
//   CLEANUP_PROD_CONFIRM = DELETE-PRODUCTION-DATA        (production only)
//
// Before 2026-10-27 this command used `assertSafeTarget`, so it was the one fixture
// teardown that cost a single phrase. A scoped command must not be the cheaper way to
// delete production rows.
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
// Usage (development — TWO phrases):
//   CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_dev_db \
//     npm run cleanup:roles -- --database=inventoryai_dev_db --dry-run
//
// `--dry-run` counts every row the real run would remove, using the SAME teardown plan,
// and stops. It deletes nothing and never touches Firebase. Drop it only after the count
// is the one you expect. Add `--delete-firebase` to remove the four identities as well
// on a real run. Production adds `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` and
// `NODE_ENV=production`.
//
// Safe to run when nothing was ever seeded: it reports that and exits 0.

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import {
  SeedSafetyError,
  countTenantLeftovers,
  countTenantRemoval,
  removeTenant,
} from './perf/lib.mjs';
import { assertScopedCleanupTarget } from './cleanup/guard.mjs';
import {
  ACCOUNTS,
  CLEANUP_CONFIRM_PHRASE,
  findRoleTestBusiness,
} from './role-test/lib.mjs';
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
  const dryRun = process.argv.includes('--dry-run');

  // The shared scoped rule: named database, two phrases in development, three in production,
  // and a connection opened only after it passes.
  const target = assertScopedCleanupTarget({
    env,
    command: COMMAND,
    confirmPhrase: CLEANUP_CONFIRM_PHRASE,
    database: argValue('--database'),
  });
  const production = target.production;

  console.log(`[${COMMAND}] database  : ${target.database}${production ? '   (PRODUCTION)' : ''}`);
  if (dryRun) console.log(`[${COMMAND}] mode      : DRY RUN — counting only, nothing will be deleted`);

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const businessId = await findRoleTestBusiness();
  if (!businessId) {
    console.log(`[${COMMAND}] nothing to clean — no role fixture tenant exists in ${target.database}.`);
    await mongoose.disconnect();
    return;
  }

  const users = await User.find({ businessId }).select('_id email role').lean();
  console.log(`[${COMMAND}] tenant    : ${businessId}`);
  for (const user of users) {
    console.log(`[${COMMAND}]   ${user.role.padEnd(7)} ${user.email}`);
  }

  if (dryRun) {
    // The same full teardown plan `removeTenant` executes. The role fixture's audit and
    // assistant rows are part of that plan, so no separate extras count is needed here.
    const { total, counts } = await countTenantRemoval([businessId]);
    for (const [collection, count] of Object.entries(counts)) {
      if (count > 0) console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
    }
    console.log(
      `[${COMMAND}] DRY RUN — would remove ${total} document(s); nothing was deleted.`,
    );
    console.log(
      `[${COMMAND}] identities: ${deleteFirebase ? 'would be deleted after the database rows' : 'would be kept'}`,
    );
    await mongoose.disconnect();
    return;
  }

  const { removed, counts } = await removeTenant([businessId]);
  for (const [collection, count] of Object.entries(counts)) {
    if (count > 0) console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
  }

  // Prove it rather than assert it, over the same full teardown plan the removal used.
  const leftovers = await countTenantLeftovers([businessId]);
  if (leftovers !== 0) {
    fail(`verification failed: ${leftovers} document(s) still reference the fixture tenant.`);
  }
  console.log(`[${COMMAND}] OK — removed ${removed} document(s); verification found 0 remaining.`);

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
