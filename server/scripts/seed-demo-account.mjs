// `npm run seed:demo -- --email=<you@example.com> [--total=80000] [--seed=1]`
// `npm run seed:demo -- --database=<name> --business=<id> --email=<you@example.com>`
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
// SAFETY. `assertSeedTarget` requires `--database=` to equal the database this
// process resolved, refuses the test database and any unknown one, and requires two
// phrases in development or three in production — all before a connection is opened.
// A re-run resets ONLY the data of the one tenant the resolved account owns (never
// the account rows), by businessId, so another tenant cannot be reached even if the
// wrong id were supplied.
//
// PRODUCTION. The same command can write into a NAMED database, production
// included: `--database=<name>` must equal the database this process resolved, and
// that target needs THREE phrases (SEED_CONFIRM, SEED_DB_CONFIRM and
// SEED_PROD_CONFIRM). Because this script
// REPLACES the data of the business the account owns, a production run additionally
// requires `--business=<id>` as soon as that business already exists — naming the
// tenant is what proves the reset is meant. A production run never rewrites an
// EXISTING login's password, even when DEMO_ACCOUNT_PASSWORD is set: seeding is not a
// credential operation, and that address may belong to a person. Creating a brand-new
// identity still uses the password, because there is no credential to preserve.
//
// DETERMINISTIC: a seeded PRNG (`--seed`, default 1) means the same dataset every
// run, so two measurements describe the same tenant.
//
// Teardown: re-running the script resets the tenant, which is the documented way
// back; `clearTenantData` is exported from ./perf/lib.mjs for a targeted removal.
// The performance tenant (Part 3G) has its own `cleanup:perf-tenant`.
//
// Usage (development — TWO phrases; the database is always named):
//   SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed -- --plan=demo --database=inventoryai_dev_db \
//       --email=you@example.com --total=80000
//   … add --dry-run to print the plan without connecting or writing.
//
// Production (THREE phrases, and the tenant being reset is named too):
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     SEED_CONFIRM=seed-demo-account \
//     SEED_DB_CONFIRM=inventoryai_prod_db \
//     SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
//     npm run seed -- --plan=demo --database=inventoryai_prod_db \
//       --email=you@example.com --business=<the id verify:demo prints> --total=60000
//
// `npm run seed:demo` is the same command with the plan preselected, and takes the
// same phrases. The rule itself lives in ./seed/guard.mjs, not here.
//
// If the Firebase identity does not exist yet, supply its initial password through
// the environment (never on the command line, never in this file):
//   DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed -- --plan=demo --database=inventoryai_dev_db --email=new@example.com

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import { SeedSafetyError, clearTenantData } from './perf/lib.mjs';
import { assertSeedTarget } from './seed/guard.mjs';
import {
  assertTenantNamedForReset,
  countDisagreements,
  ensureTenantForIdentity,
  makeRandom,
  normaliseEmail,
  parseCount,
  readTenantCounts,
  resolveIdentity,
  seedTenant,
} from './seed/lib.mjs';

const COMMAND = 'seed:demo';
const CONFIRM_PHRASE = 'seed-demo-account';

/** The tenant this seeder names when it has to CREATE one. Never renamed afterwards. */
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

/** A MongoDB ObjectId, as a person can copy it from another command's output. */
function isBusinessId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value ?? '').trim());
}

async function main() {
  // Lower-cased once, here: the schema lower-cases on write but queries are exact, so a
  // mixed-case argument would find the Firebase identity and miss the database row.
  const email = normaliseEmail(argValue('--email'));
  const requestedBusiness = argValue('--business');
  const dryRun = process.argv.includes('--dry-run');

  // The unified guard: `--database=` must equal the resolved database, and the
  // target class decides the phrase count — two for development, three for
  // production. It runs before any connection, identity lookup or write, on a dry
  // run as well, so a dry run proves the destination too.
  const target = assertSeedTarget({
    env,
    command: COMMAND,
    database: argValue('--database'),
    confirmPhrase: CONFIRM_PHRASE,
  });
  const production = target.production;

  if (!email || !email.includes('@')) {
    fail('--email=<address> is required. Nothing was written.');
  }
  const total = parseCount(argValue('--total'), {
    name: '--total',
    min: 100,
    max: 400000,
    fallback: 80000,
  });
  const seed = parseCount(argValue('--seed'), { name: '--seed', min: 0, fallback: 1 });
  if (requestedBusiness && !isBusinessId(requestedBusiness)) {
    fail('--business must be a 24-character businessId. Nothing was written.');
  }

  console.log(`[${COMMAND}] database : ${target.database}${production ? '   (PRODUCTION)' : ''}`);
  console.log(`[${COMMAND}] confirmed: ${target.phrases} phrase(s) accepted`);
  console.log(`[${COMMAND}] account  : ${email}`);
  console.log(`[${COMMAND}] target   : ~${total.toLocaleString()} documents across 7 collections`);
  console.log(`[${COMMAND}] PRNG seed: ${seed} (the dataset is reproducible)`);

  if (dryRun) {
    console.log('');
    console.log(`[${COMMAND}] dry run complete — no connection was opened and nothing was written.`);
    console.log(
      `[${COMMAND}] a real run would resolve (creating only if absent) the Firebase identity for ` +
        `${email}, then REPLACE the data of the tenant that account owns.`,
    );
    if (production) {
      console.log(
        `[${COMMAND}] production also needs --business=<the id verify:demo prints> whenever that ` +
          'tenant already exists.',
      );
    }
    console.log(
      `[${COMMAND}] to run for real: SEED_CONFIRM=${CONFIRM_PHRASE} ` +
        `SEED_DB_CONFIRM=${target.database}${production ? ' SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA' : ''} ` +
        `npm run ${COMMAND} -- --database=${target.database} …`,
    );
    return;
  }

  // In production an existing credential is never rewritten; see resolveIdentity.
  const identity = await resolveIdentity(email, { refreshPassword: !production });
  console.log(
    `[${COMMAND}] identity : uid ${String(identity.uid).slice(0, 10)}… ` +
      `(${identity.created ? 'CREATED now' : 'already existed'}${identity.emailVerified ? ', verified' : ', NOT verified'})` +
      `${identity.passwordSkipped ? ' — password NOT changed on a production run' : ''}`,
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

  // Naming the tenant is the third deliberate act a production reset needs. The rule lives
  // in ./seed/lib.mjs and is shared with seed:accounts, so the two cannot disagree about it.
  assertTenantNamedForReset({
    production,
    reused: tenant.reused,
    requestedBusinessId: requestedBusiness,
    businessId: tenant.businessId,
    businessName: tenant.businessName,
    command: COMMAND,
  });
  if (production) {
    console.log(
      `[${COMMAND}] scope    : replacing the DATA of business ${String(tenant.businessId)}; ` +
        'its login and business row are kept',
    );
  }

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

  // The write is not the claim. Count it back through the tenant's own filter, so a
  // partially-rejected insert can never be reported as a finished dataset.
  const readBack = await readTenantCounts(tenant.businessId);
  const disagreements = countDisagreements(counts, readBack);
  if (disagreements.length) {
    fail(
      `the read-back does not match what was written (${disagreements
        .map((d) => `${d.collection}: wrote ${d.wrote}, found ${d.found}`)
        .join('; ')}). The dataset is NOT trustworthy; re-run before using it.`,
    );
  }

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
  console.log(
    `[${COMMAND}]   TOTAL                  ${achieved.toLocaleString()}   ` +
      `(target ${total.toLocaleString()}; read-back equal)`,
  );
  console.log(`[${COMMAND}] businessId : ${String(tenant.businessId)}`);
  console.log(`[${COMMAND}] account    : ${email}${tenant.accountCreated ? '  (MongoDB account CREATED — sign in as usual)' : '  (existing account, unchanged)'}`);
  console.log(`[${COMMAND}] elapsed    : ${Date.now() - started} ms`);

  if (production) {
    console.log(`[${COMMAND}] next       : measure the DEPLOYED assistant — the database and the tenant are both named:`);
    console.log(
      `[${COMMAND}]   NODE_ENV=production MONGODB_DB_NAME=${env.mongodbDbName} ` +
        'PERF_TURNS_CONFIRM=perf-turns:production \\',
    );
    console.log(
      `[${COMMAND}]     npm run perf:turns -- --base=https://ai-inventory-l1mi.onrender.com ` +
        `--database=${env.mongodbDbName} --business=${String(tenant.businessId)} --login --only=1,2`,
    );
  } else {
    console.log(`[${COMMAND}] next       : npm run perf:measure -- --business=${String(tenant.businessId)}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
