// `npm run seed:demo -- --email=<you@example.com> [--total=80000] [--seed=1]`
//
// Give ONE real account a large, realistic inventory dataset so the AI assistant
// can be asked questions at a scale a test fixture never reaches, and so the phone
// the owner already signs in with lands directly in that dataset.
//
// For SEVERAL accounts at once (each with its own size, and WITHOUT generated
// SKUs/barcodes) use `seed:accounts` instead — see seed-accounts.mjs. Both call the
// same `seedTenant` core in ./seed/lib.mjs; this file is the single-account CLI.
//
// WHY IT ATTACHES TO AN EXISTING IDENTITY RATHER THAN INVENTING ONE. The application
// joins Firebase to MongoDB on `firebaseUid` ONLY (never email), and the exchange
// resolves a user by that uid. So the honest way to hand an existing login a seeded
// tenant is: resolve the uid from FIREBASE (the identity authority), then create or
// reuse the MongoDB User that carries it — exactly the linkage the registration flow
// writes. Nothing here reads a user by email in MongoDB.
//
// WHY IT DOES NOT DELETE FIREBASE IDENTITIES. `docs/DEVELOPMENT_ROADMAP.md` §27BB
// (F-50) records what happens when the two stores are cleaned in the wrong
// relationship: a MongoDB user whose Firebase identity was deleted can neither sign
// in nor register (`409 EMAIL_IN_USE`), and **nothing in the application can repair
// it**. Clearing MongoDB alone is the safe direction — it frees every address and
// orphans nothing. This script therefore never deletes a Firebase user, and it only
// ever creates one when the requested identity does not exist.
//
// SAFETY: `assertSafeTarget` refuses production, refuses the test database, and
// requires a confirmation phrase — all before a connection is opened. A re-run
// resets ONLY the data of the one tenant the resolved account owns (never the
// account rows), by businessId, so another tenant cannot be reached even if the
// wrong id were supplied.
//
// DETERMINISTIC: a seeded PRNG (`--seed`, default 1) means the same dataset every
// run, so two measurements describe the same tenant.
//
// Teardown: `npm run cleanup:perf`-style tooling covers the performance tenant; for
// this one, re-running the script resets it, and `clearTenantData` is exported for
// a targeted removal.
//
// Usage:
//   SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=you@example.com --total=80000
//   SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=you@example.com --total=200 --seed=7
//
// If the Firebase identity does not exist yet, supply its initial password through
// the environment (never on the command line, never in this file):
//   DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=new@example.com

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import { SeedSafetyError, assertSafeTarget, clearTenantData } from './perf/lib.mjs';
import { ensureTenantForIdentity, makeRandom, resolveIdentity, seedTenant } from './seed/lib.mjs';

const COMMAND = 'seed:demo';
const CONFIRM_PHRASE = 'seed-demo-account';

/** The tenant this seeder owns once it is done. Named so it is obvious in the app. */
const DEMO_BUSINESS_NAME = 'AI SCALE TEST — 80k seeded dataset';

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
  const total = Number.parseInt(argValue('--total') ?? '80000', 10);
  const seed = Number.parseInt(argValue('--seed') ?? '1', 10);

  assertSafeTarget(env, COMMAND, { confirmPhrase: CONFIRM_PHRASE });

  if (!email || !email.includes('@')) {
    fail('--email=<address> is required. Nothing was written.');
  }
  if (!Number.isInteger(total) || total < 100 || total > 400000) {
    fail('--total must be an integer between 100 and 400000. Nothing was written.');
  }
  if (!Number.isInteger(seed) || seed < 0) {
    fail('--seed must be a non-negative integer. Nothing was written.');
  }

  console.log(`[${COMMAND}] database : ${env.mongodbDbName}`);
  console.log(`[${COMMAND}] account  : ${email}`);
  console.log(`[${COMMAND}] target   : ~${total.toLocaleString()} documents across 7 collections`);
  console.log(`[${COMMAND}] PRNG seed: ${seed} (the dataset is reproducible)`);

  const identity = await resolveIdentity(email);
  console.log(
    `[${COMMAND}] identity : uid ${String(identity.uid).slice(0, 10)}… ` +
      `(${identity.created ? 'CREATED now' : 'already existed'}${identity.emailVerified ? ', verified' : ', NOT verified'})`,
  );

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
  const started = Date.now();

  const tenant = await ensureTenantForIdentity({
    email,
    identity,
    businessName: DEMO_BUSINESS_NAME,
  });
  console.log(
    `[${COMMAND}] tenant   : ${tenant.reused ? 'reusing' : 'CREATED'} ${String(tenant.businessId)} ("${tenant.businessName}")`,
  );

  // ---- reset this tenant's DATA (never the account rows) ----
  const cleared = await clearTenantData([tenant.businessId]);
  if (cleared.removed > 0) {
    console.log(`[${COMMAND}] reset    : removed ${cleared.removed} previous document(s) from this tenant`);
  }

  const { counts, achieved, receiptTransactions } = await seedTenant({
    businessId: tenant.businessId,
    userId: tenant.userId,
    total,
    rand: makeRandom(seed),
    includeSkuBarcode: true,
    label: 'DEMO',
  });

  console.log('');
  console.log(`[${COMMAND}] OK`);
  console.log(`[${COMMAND}]   categories             ${counts.categories}`);
  console.log(`[${COMMAND}]   locations              ${counts.locations}`);
  console.log(`[${COMMAND}]   suppliers              ${counts.suppliers}`);
  console.log(`[${COMMAND}]   products               ${counts.products}`);
  console.log(`[${COMMAND}]   inventory              ${counts.inventory}`);
  console.log(`[${COMMAND}]   inventory_transactions ${counts.inventory_transactions}  (incl. ${receiptTransactions} PO receipt movement(s))`);
  console.log(`[${COMMAND}]   purchase_orders        ${counts.purchase_orders}`);
  console.log(`[${COMMAND}]   ----------------------------------------`);
  console.log(`[${COMMAND}]   TOTAL                  ${achieved.toLocaleString()}   (target ${total.toLocaleString()})`);
  console.log(`[${COMMAND}] businessId : ${String(tenant.businessId)}`);
  console.log(`[${COMMAND}] account    : ${email}${tenant.accountCreated ? '  (MongoDB account CREATED — sign in as usual)' : '  (existing account, unchanged)'}`);
  console.log(`[${COMMAND}] elapsed    : ${Date.now() - started} ms`);
  console.log(`[${COMMAND}] next       : npm run perf:measure -- --business=${String(tenant.businessId)}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
