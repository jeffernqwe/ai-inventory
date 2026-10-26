// `ROLE_TEST_PASSWORD='…' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=<database> \
//   npm run seed -- --plan=roles --database=<database>`
//
// Create — or refresh — ONE isolated tenant holding ONE account per role
// (OWNER, ADMIN, MANAGER, STAFF), each with its own working sign-in, plus a
// small, self-consistent dataset so every role has something to look at.
//
// WHAT IT IS FOR. The role guards are proved by the automated suite. What the
// suite cannot do is show a person the app as a STAFF user. These four accounts
// exist so that "what does STAFF see?" can be answered on a real phone, against
// real data, in one tenant — so a hidden button is a permission, not an empty
// screen.
//
// NO EMAIL VERIFICATION CODE IS SENT OR NEEDED. The identities are marked
// verified through the Firebase ADMIN SDK, which is the same write the shipped
// AUTH-04 confirm step performs after a real 6-digit code is redeemed. No route
// is opened, no middleware is relaxed and `EMAIL_NOT_VERIFIED` still applies to
// every other account. The addresses are all in the reserved `example.invalid`
// domain, which can never receive mail.
//
// ISOLATION — three separate things, each checked rather than assumed:
//   * a DEDICATED tenant, named `ROLE TEST — role boundary fixture (do not use)`
//     and identified by BOTH its name and its owner address. Every data write is
//     filtered by that one `businessId`, so no other tenant can be reached even
//     if the wrong id were supplied;
//   * a DEDICATED database guard (`assertSeedTarget`, shared with every seeder):
//     `--database=` must name the database this process resolved, the test database
//     is refused, development needs TWO phrases and production THREE — all BEFORE a
//     connection is opened. The fixture is still found by its own two fingerprints,
//     never by whatever happened to be in the shell;
//   * a DEDICATED Firebase blast radius: four literal `.invalid` addresses. The
//     script never enumerates, never deletes an identity and never matches a
//     pattern, so no real login can be created, changed or removed.
//
// IDEMPOTENT. Re-running reuses the same tenant, re-marks the four identities
// verified with the supplied password (which is how the password is rotated) and
// replaces only that tenant's data. It never deletes a user and never moves one
// between tenants; an existing account belonging to another business is an error,
// not something to repair by guessing.
//
// Usage (development — TWO phrases, and the database is always named):
//   ROLE_TEST_PASSWORD='…' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed -- --plan=roles --database=inventoryai_dev_db --dry-run
//   … drop --dry-run for the real run; add --total=900 --seed=7 to change the size
//
// Production (THREE phrases; the fixture's own tenant is still the only one touched):
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     ROLE_TEST_PASSWORD='…' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_prod_db \
//     SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
//     npm run seed -- --plan=roles --database=inventoryai_prod_db
//
// `npm run seed:roles` is the same command with the plan preselected.
//
// The password is read from the environment only: it is never printed, never
// written to a file and never passed on the command line (where it would land in
// the shell history).

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import { SeedSafetyError, clearTenantData } from './perf/lib.mjs';
import { assertSeedTarget } from './seed/guard.mjs';
import {
  countDisagreements,
  makeRandom,
  parseCount,
  readTenantCounts,
  seedTenant,
} from './seed/lib.mjs';
import {
  ACCOUNTS,
  CLEANUP_CONFIRM_PHRASE,
  PASSWORD_ENV,
  ROLE_TEST_BUSINESS_NAME,
  SEED_CONFIRM_PHRASE,
  clearRoleFixtureExtras,
  ensureRoleTestTenant,
} from './role-test/lib.mjs';
const COMMAND = 'seed:roles';

// Small on purpose: the fixture exists for permission behaviour, not for scale.
// 900 documents still yields ~200 products, ~2 locations and ~380 movements —
// enough for every screen to have content — while finishing in about a second.
const DEFAULT_TOTAL = 900;
const MIN_TOTAL = 100;
const MAX_TOTAL = 20000;

function argValue(flag) {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // The target guard runs before any connection and before any identity lookup,
  // on a dry run too, so a dry run proves the destination and not merely the
  // shape of the plan. Two phrases for development, three for production — the
  // same rule every seeder uses (./seed/guard.mjs).
  const target = assertSeedTarget({
    env,
    command: COMMAND,
    database: argValue('--database'),
    confirmPhrase: SEED_CONFIRM_PHRASE,
  });
  const production = target.production;

  const total = parseCount(argValue('--total'), {
    name: '--total',
    min: MIN_TOTAL,
    max: MAX_TOTAL,
    fallback: DEFAULT_TOTAL,
  });
  const seed = parseCount(argValue('--seed'), { name: '--seed', min: 0, fallback: 1 });
  if (!dryRun && !process.env[PASSWORD_ENV]) {
    fail(
      `${PASSWORD_ENV} is not set. It is the four accounts' sign-in password and is required for a ` +
        'real run (never printed, never written to a file). Nothing was written.',
    );
  }

  console.log(`[${COMMAND}] database : ${target.database}${production ? '   (PRODUCTION)' : ''}`);
  console.log(`[${COMMAND}] confirmed: ${target.phrases} phrase(s) accepted`);
  console.log(`[${COMMAND}] tenant   : ${ROLE_TEST_BUSINESS_NAME}`);
  console.log(`[${COMMAND}] data     : ~${total.toLocaleString()} documents (PRNG seed ${seed})`);
  console.log(`[${COMMAND}] accounts : one per role, verified through the Firebase Admin SDK`);
  for (const account of ACCOUNTS) {
    console.log(`[${COMMAND}]   ${account.role.padEnd(7)} ${account.email}`);
  }
  if (!dryRun) {
    console.log(`[${COMMAND}] password : from ${PASSWORD_ENV} (not printed)`);
  }

  if (dryRun) {
    console.log('');
    console.log(`[${COMMAND}] dry run complete — no connection was opened and nothing was written.`);
    console.log(
      `[${COMMAND}] to run for real: ROLE_TEST_PASSWORD='…' SEED_CONFIRM=${SEED_CONFIRM_PHRASE} ` +
        `SEED_DB_CONFIRM=${target.database}${production ? ' SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA' : ''} ` +
        `npm run ${COMMAND} -- --database=${target.database}`,
    );
    return;
  }

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const tenant = await ensureRoleTestTenant();
  console.log('');
  console.log(
    `[${COMMAND}] tenant   : ${tenant.businessCreated ? 'CREATED' : 'reused'} ` +
      `${tenant.businessId} ("${tenant.businessName}")`,
  );

  for (const identity of tenant.identities) {
    console.log(
      `[${COMMAND}] identity : ${identity.email} uid ${String(identity.uid).slice(0, 10)}… ` +
        `(${identity.identityCreated ? 'CREATED now' : 'updated: password set, verified, enabled'})`,
    );
  }

  const cleared = await clearTenantData([tenant.businessId]);
  const extras = await clearRoleFixtureExtras(tenant.businessId);
  if (cleared.removed + extras.removed > 0) {
    console.log(
      `[${COMMAND}] reset    : removed ${cleared.removed + extras.removed} previous document(s) ` +
        `from this tenant (${extras.counts.audit_logs} audit row(s), ${extras.counts.ai_conversations} conversation(s))`,
    );
  }

  const started = Date.now();
  const { counts, achieved } = await seedTenant({
    businessId: tenant.businessId,
    userId: tenant.users.OWNER.id,
    total,
    rand: makeRandom(seed),
    includeSkuBarcode: true,
    label: 'ROLE',
  });
  const elapsedMs = Date.now() - started;

  // A seeder's own count is evidence about the seeder. These are read back from
  // the database, through the same `businessId` filter every screen uses, so the
  // summary describes what is actually there.
  const readBack = await readTenantCounts(tenant.businessId);
  const disagreements = countDisagreements(counts, readBack);
  if (disagreements.length) {
    fail(
      `the read-back does not match what was written (${disagreements
        .map((d) => `${d.collection}: wrote ${d.wrote}, found ${d.found}`)
        .join('; ')}). The fixture is NOT trustworthy; re-run before using it.`,
    );
  }

  console.log('');
  console.log(`[${COMMAND}] wrote ${achieved.toLocaleString()} document(s) in ${elapsedMs} ms`);
  console.log(`[${COMMAND}]   categories             ${readBack.categories}`);
  console.log(`[${COMMAND}]   locations              ${readBack.locations}`);
  console.log(`[${COMMAND}]   suppliers              ${readBack.suppliers}`);
  console.log(`[${COMMAND}]   products               ${readBack.products}`);
  console.log(`[${COMMAND}]   inventory              ${readBack.inventory}`);
  console.log(`[${COMMAND}]   inventory_transactions ${readBack.inventory_transactions}`);
  console.log(`[${COMMAND}]   purchase_orders        ${readBack.purchase_orders}`);
  console.log(`[${COMMAND}]   TOTAL                  ${achieved.toLocaleString()}   (target ${total.toLocaleString()}, read back and equal)`);
  console.log('');
  console.log(`[${COMMAND}] businessId : ${tenant.businessId}`);
  console.log(`[${COMMAND}] accounts   :`);
  for (const role of Object.keys(tenant.users)) {
    const user = tenant.users[role];
    console.log(`[${COMMAND}]   ${role.padEnd(7)} ${user.email.padEnd(30)} ${user.id}`);
  }
  console.log('');
  console.log(`[${COMMAND}] sign in on the phone with any of the four addresses and the password you set in ${PASSWORD_ENV}.`);
  console.log(`[${COMMAND}] prove the server-side boundary (server must be running):`);
  console.log(`[${COMMAND}]   npm run verify:roles -- --business=${tenant.businessId}`);
  console.log(`[${COMMAND}] remove the fixture when done (MongoDB only; Firebase identities are kept):`);
  const cleanupPhrases =
    `CLEANUP_CONFIRM=${CLEANUP_CONFIRM_PHRASE} CLEANUP_DB_CONFIRM=${target.database} ` +
    `${production ? 'CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA ' : ''}`;
  console.log(
    `[${COMMAND}]   ${cleanupPhrases}npm run cleanup:roles -- --database=${target.database}`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
