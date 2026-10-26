// `npm run cleanup:demo-tenant -- --database=<resolved database name> [--dry-run]`
//
// Remove the demo tenant's MongoDB rows: its inventory, ledger, products, locations,
// categories and suppliers, the assistant's conversations and their messages, its audit
// trail, and the account-scoped rows its users own (sessions, password-reset tokens and
// reset challenges) — then its users and the business row itself. It prints
// per-collection counts and then re-counts over the same teardown plan, refusing success
// if even one row the plan names is still present.
//
// `--dry-run` uses the SAME teardown plan as the real run, counts every collection and
// stops; it deletes nothing and never touches the Firebase identity. It costs the same
// phrases as a real run.
//
// WHAT THE FINAL COUNT CAN SEE. `countTenantLeftovers` walks the SAME teardown plan as
// the removal: every collection carrying businessId, the assistant's messages through
// their conversations, the account-scoped rows resolved from the tenant's users, the
// users and the business row. Sessions and reset rows are deleted by id BEFORE their
// users; the counts above evidence that step, and the final count is the plan's own
// answer rather than a shorter list.
//
// WHAT IS LEFT BEHIND, ON PURPOSE. The Firebase identity. `docs/DEVELOPMENT_ROADMAP.md`
// §27BB (F-50) records the failure mode of the opposite order: a MongoDB user whose
// Firebase identity was deleted can neither sign in nor register, and nothing in the
// application can repair it. An identity with no MongoDB user is harmless (it gets
// `REGISTRATION_REQUIRED` and can register), so the safe direction is Mongo-first and
// stop there. Re-running the seeder reuses that identity, so repeated test cycles do
// not accumulate addresses.
//
// SAFETY. The shared scoped cleanup rule: the database must be named and must equal
// the resolved one; the test database is refused; and the run costs TWO phrases in
// development or THREE in production — `CLEANUP_CONFIRM=cleanup:demo-tenant`,
// `CLEANUP_DB_CONFIRM=<database>`, and `CLEANUP_PROD_CONFIRM` in production. The
// tenant is located by BOTH fingerprints (exact business name and exact owner email),
// which must agree on one businessId. A half-state refuses rather than guessing.
//
// Usage (development — TWO phrases):
//   CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_dev_db \
//     npm run cleanup:demo-tenant -- --database=inventoryai_dev_db --dry-run
//
// Production adds `NODE_ENV=production` and the third phrase. Drop `--dry-run` only
// after the count is the one you expect.

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import { assertScopedCleanupTarget } from './cleanup/guard.mjs';
import {
  DEMO_CLEANUP_CONFIRM,
  DemoTenantError,
  previewDemoTenantRemoval,
  removeDemoTenant,
} from './demo/lib.mjs';

const COMMAND = 'cleanup:demo-tenant';

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
  const dryRun = process.argv.includes('--dry-run');

  const target = assertScopedCleanupTarget({
    env,
    command: COMMAND,
    confirmPhrase: DEMO_CLEANUP_CONFIRM,
    database: argValue('--database'),
  });

  console.log(
    `[${COMMAND}] database : ${target.database}${target.production ? '   (PRODUCTION)' : ''}`,
  );
  if (dryRun) console.log(`[${COMMAND}] mode     : DRY RUN — counting only, nothing will be deleted`);

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  if (dryRun) {
    const preview = await previewDemoTenantRemoval();
    if (!preview.removable) {
      console.log(`[${COMMAND}] ${preview.reason}`);
      await mongoose.disconnect();
      return;
    }
    console.log(`[${COMMAND}] tenant    : ${preview.businessId}`);
    for (const [collection, count] of Object.entries(preview.counts)) {
      console.log(`[${COMMAND}]   ${String(collection).padEnd(24)} ${count}`);
    }
    console.log(
      `[${COMMAND}] DRY RUN — would remove ${preview.total} document(s); nothing was deleted.`,
    );
    console.log(`[${COMMAND}] identity  : the Firebase identity would be left in place`);
    await mongoose.disconnect();
    return;
  }

  const result = await removeDemoTenant();
  if (!result.removed) {
    console.log(`[${COMMAND}] ${result.reason}`);
    await mongoose.disconnect();
    return;
  }

  console.log(`[${COMMAND}] removed from businessId ${result.businessId}`);
  for (const [collection, count] of Object.entries(result.counts)) {
    console.log(`[${COMMAND}]   ${String(collection).padEnd(24)} ${count}`);
  }
  console.log(
    `[${COMMAND}] leftovers : ${result.leftovers} — verified over the full teardown plan ` +
      '(data, account rows, users and the business row)',
  );
  console.log(`[${COMMAND}] identity  : the Firebase identity was left in place (see the script header)`);
  console.log(`[${COMMAND}] OK`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof DemoTenantError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
