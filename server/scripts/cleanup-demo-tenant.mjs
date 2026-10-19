// `npm run cleanup:demo-tenant -- --database=<resolved database name>`
//
// Remove the demo tenant's MongoDB rows: its inventory, ledger, products,
// locations, categories and suppliers, then its users and the business row itself.
// It prints per-collection counts and then re-counts, refusing success if even one
// document still carries the businessId.
//
// WHAT IS LEFT BEHIND, ON PURPOSE. The Firebase identity. `docs/DEVELOPMENT_ROADMAP.md`
// §27BB (F-50) records the failure mode of the opposite order: a MongoDB user whose
// Firebase identity was deleted can neither sign in nor register, and nothing in the
// application can repair it. An identity with no MongoDB user is harmless (it gets
// `REGISTRATION_REQUIRED` and can register), so the safe direction is Mongo-first and
// stop there. Re-running the seeder reuses that identity, so repeated test cycles do
// not accumulate addresses.
//
// SAFETY. The database must be named and must equal the resolved one; the test
// database is refused; the confirmation phrase is required; and the tenant is located
// by BOTH fingerprints (exact business name and exact owner email), which must agree
// on one businessId. A half-state refuses rather than guessing.
//
// Usage:
//   CLEANUP_CONFIRM=cleanup:demo-tenant npm run cleanup:demo-tenant -- --database=<name>

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import {
  DEMO_CLEANUP_CONFIRM,
  DemoTenantError,
  assertDemoTarget,
  isProductionDatabase,
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
  const database = assertDemoTarget({
    mongodbUri: env.mongodbUri,
    resolvedDbName: env.mongodbDbName,
    requestedDatabase: argValue('--database'),
    confirm: process.env.CLEANUP_CONFIRM,
    confirmPhrase: DEMO_CLEANUP_CONFIRM,
    command: COMMAND,
  });

  console.log(`[${COMMAND}] database : ${database}${isProductionDatabase(database) ? '   (PRODUCTION)' : ''}`);

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

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
  console.log(`[${COMMAND}] leftovers : ${result.leftovers} — verified over every tenant collection`);
  console.log(`[${COMMAND}] identity  : the Firebase identity was left in place (see the script header)`);
  console.log(`[${COMMAND}] OK`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof DemoTenantError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
