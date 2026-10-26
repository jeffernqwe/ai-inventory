// `npm run cleanup:demo -- --email=<address> --business=<id> [--database=<name>] [--dry-run]`
//
// Remove the DATA of ONE tenant — the one `seed:demo` writes — and keep the login, the
// business row and its members. This is the missing half of the account seeder: a re-run
// resets the dataset, but there was no way to go back to an empty business without wiping
// the whole database or deleting a login (which is the unrecoverable direction, F-50).
//
// WHY `--business=` IS ALWAYS REQUIRED. The email resolves the account; the id names what
// will be deleted. Requiring both means a typo cannot empty a different tenant: the two
// must agree, and the account lookup itself never trusts a client-supplied id.
//
// WHAT IT REMOVES — exactly the business-owned rows `clearTenantData` defines, the same
// list account deletion and the other cleanups use: inventory, movements, purchase orders,
// products, categories, locations, suppliers, audit rows, invitations, and the assistant's
// conversations and messages.
//
// WHAT IT KEEPS — deliberately: the MongoDB user(s), the business row, the Firebase
// identity, and every session. The person stays signed in, the business keeps its name and
// its members, and the address remains usable. Deleting a login whose database record still
// exists is the one unrecoverable state (F-50); this command never goes near it.
//
// SAFETY. `--database=` is required and must equal the database this process
// resolved; the test database is refused. Development costs TWO phrases
// (`CLEANUP_CONFIRM=cleanup:demo-account` and `CLEANUP_DB_CONFIRM=<database>`);
// production costs THREE, adding `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA`.
// Every delete is scoped by the one `businessId` both the account and the flag
// name, and the Firebase identity is never touched.
//
// `--dry-run` counts through the SAME data-only teardown plan `clearTenantData` executes, and writes
// nothing. It still connects and still requires both identifiers to agree, so the preview describes
// the same tenant and the same rows the real run would.
//
// Usage:
//   CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_dev_db \
//     npm run cleanup:demo -- --database=inventoryai_dev_db \
//       --email=you@example.com --business=<id> --dry-run
//
// Production (three phrases):
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_prod_db \
//     CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
//     npm run cleanup:demo -- --database=inventoryai_prod_db \
//       --email=you@example.com --business=<id>

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import User from '../src/models/user.model.ts';
import { assertScopedCleanupTarget } from './cleanup/guard.mjs';
import {
  SeedSafetyError,
  clearTenantData,
  countTenantDataRemoval,
} from './perf/lib.mjs';

const COMMAND = 'cleanup:demo';
const CONFIRM_PHRASE = 'cleanup:demo-account';

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
  const email = argValue('--email');
  const businessId = argValue('--business');
  const dryRun = process.argv.includes('--dry-run');

  // Two phrases in development, three in production — the same rule as the
  // database-wide cleanup. The target is named and must match what was resolved.
  const target = assertScopedCleanupTarget({
    env,
    command: COMMAND,
    confirmPhrase: CONFIRM_PHRASE,
    database: argValue('--database'),
  });

  if (!email || !email.includes('@')) {
    fail('--email=<address> is required. Nothing was removed.');
  }
  if (!/^[a-f0-9]{24}$/i.test(String(businessId ?? ''))) {
    fail('--business=<24-character businessId> is required. Nothing was removed.');
  }

  console.log(`[${COMMAND}] database : ${target.database}${target.production ? '   (PRODUCTION)' : ''}`);
  console.log(`[${COMMAND}] account  : ${email}`);
  console.log(`[${COMMAND}] tenant   : ${businessId}`);
  if (dryRun) console.log(`[${COMMAND}] mode     : DRY RUN — counts only, nothing is deleted`);

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const user = await User.findOne({ email }).select('_id businessId role').lean();
  if (!user) {
    fail(`no MongoDB account for ${email} — nothing was removed.`);
  }
  if (String(user.businessId) !== String(businessId)) {
    fail(
      `"${email}" belongs to business ${String(user.businessId)}, not ${businessId}. ` +
        'Refusing to remove a tenant the account does not own. Nothing was removed.',
    );
  }

  if (dryRun) {
    // The counting half of the SAME plan `clearTenantData` executes, so the preview and
    // the real run cannot describe different collections, filters or order.
    const { total, counts } = await countTenantDataRemoval([businessId]);
    for (const [collection, count] of Object.entries(counts)) {
      if (count > 0) console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
    }
    console.log(`[${COMMAND}] would remove ${total} document(s); nothing was deleted.`);
    await mongoose.disconnect();
    return;
  }

  const { removed, counts } = await clearTenantData([businessId]);
  for (const [collection, count] of Object.entries(counts)) {
    if (count > 0) console.log(`[${COMMAND}]   ${collection.padEnd(24)} ${count}`);
  }

  // Prove it over the same plan the removal used: after a successful data-only clear,
  // the count must be zero. The users and business row are deliberately kept, and are
  // not part of this data-only plan.
  const remaining = (await countTenantDataRemoval([businessId])).total;
  if (remaining !== 0) {
    fail(
      `verification failed: ${remaining} document(s) still reference ${businessId}. The removal ` +
        'is incomplete — inspect before re-running anything.',
    );
  }

  console.log(`[${COMMAND}] OK — removed ${removed} document(s); verification found 0 remaining.`);
  console.log(
    `[${COMMAND}] kept      : the login, the business row, its members and every session ` +
      '(F-50 — this command never deletes an identity)',
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
