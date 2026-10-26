// `npm run seed -- --plan=accounts --database=<name> …`   (the one command; see Usage below)
// `npm run seed:accounts -- --database=<name> …`          (the same plan, preselected)
//
// Seed SEVERAL accounts at once, each with its OWN dataset size, so the AI
// assistant's speed, accuracy and reliability can be compared across tenants that
// hold very different amounts of data. Each account is registered in the app first
// (or already exists), and this script attaches to it — it never invents an
// identity quietly, and it never deletes one.
//
// WHY ONE TENANT PER ACCOUNT. Every row is written with that account's own
// `businessId`, and the application scopes every read by it, so the three datasets
// cannot be seen from one another. The script additionally asserts that the three
// accounts resolved to three DIFFERENT businesses, because "the data was separate"
// is the premise the whole comparison rests on and it should not be assumed.
//
// NO SKUs AND NO BARCODES BY DEFAULT. `sku` and `barcode` are optional on the
// Product schema and are uniquely indexed only among products that actually have
// them, so any number of products may omit them. Leaving them out is deliberate:
// it leaves the app's own barcode generation as the thing that FIRST assigns a
// code, which is what makes that feature testable on this data. Pass
// `--include-sku` to add generated codes instead (then barcode generation has
// nothing left to do).
//
// SAFETY — all of it inherited, none of it re-implemented:
//   * `assertSeedTarget` (./seed/guard.mjs) requires `--database=` to equal the
//     database this process resolved, refuses the test database and any unknown one,
//     refuses a `MONGODB_URI` that names a different database, and counts phrases by
//     target: TWO in development (`SEED_CONFIRM=seed-accounts` + `SEED_DB_CONFIRM`)
//     and THREE in production (adding `SEED_PROD_CONFIRM`) — all BEFORE a connection
//     is opened.
//   * A re-run resets ONLY the data of the tenants this script resolved, by
//     `businessId`, so another tenant cannot be reached even from a wrong id.
//   * Account rows (`users`, `businesses`) are only ever CREATED, never deleted and
//     never re-linked — no data seeder should be able to touch an account's
//     identity linkage as a side effect.
//   * NO Firebase identity is ever deleted. `docs/DEVELOPMENT_ROADMAP.md` §27BB
//     (F-50) records the trap: a MongoDB user whose Firebase identity was deleted
//     can neither sign in nor register (`409 EMAIL_IN_USE`), and nothing in the
//     application can repair it. Clearing MongoDB alone is the safe direction — it
//     frees every address and orphans nothing.
//
// PRODUCTION. The same command reaches a NAMED database, production included: the
// name must equal the one this process resolved, and that target needs THREE
// phrases (SEED_CONFIRM, SEED_DB_CONFIRM and SEED_PROD_CONFIRM). Two extra rules
// apply there, because several REAL businesses can be reset in one command:
//   * the DEFAULT PLAN IS REFUSED. Every account must be named explicitly, as
//     `address:documents[:businessId]`. The default three are a development
//     convenience, and running them against production would reset three real
//     businesses by accident.
//   * whenever an account ALREADY owns a business, its id must be the third field.
//     That is the same rule `seed:demo` applies: naming the tenant is what proves
//     the reset is meant. A brand-new account has no id to name, and creating one
//     deletes nothing, so it may omit it and the run prints the id it created.
//   * an EXISTING login's password is never rewritten, even when
//     DEMO_ACCOUNT_PASSWORD is set. Creation still uses it, because a new identity
//     has none otherwise.
//
// Usage (development — TWO phrases, and the database is always named):
//   SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed -- --plan=accounts --database=inventoryai_dev_db          # the three defaults
//   … add --dry-run to print the plan without connecting or writing
//   … add --accounts="a@x.com:5000,b@x.com:44000" to choose accounts and sizes
//   … add --include-sku for generated codes instead of leaving them to the app
//
// Production (THREE phrases):
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
//     SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
//     npm run seed -- --plan=accounts --database=inventoryai_prod_db \
//       --accounts="you@example.com:60000:<the id verify:demo prints>"
//
// `npm run seed:accounts` is the same command with the plan preselected.
//
// If an address has no Firebase identity yet, supply its initial password through
// the environment (never on the command line, never in a file):
//   DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed -- --plan=accounts --database=inventoryai_dev_db

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

const COMMAND = 'seed:accounts';
const CONFIRM_PHRASE = 'seed-accounts';

/**
 * The suite the owner tests the assistant across. Three DELIBERATELY different
 * sizes, because the question being asked is whether the assistant's response time
 * moves with the amount of data — which three identical tenants cannot answer.
 * Development uses these defaults; production refuses them and requires `--accounts=`.
 *
 * The sizes are DOCUMENTS (what `seedTenant` counts), and products land at roughly
 * 22.5 %, so `large` yields ~50 600 products. That also closes the measurement
 * AI-3 recorded as its next step ("not measured above 10 000 products", roadmap
 * §27BG), which is why the top tier is not smaller.
 */
const DEFAULT_PLAN = [
  { email: 'jefferndullamalinaozxc@gmail.com', total: 5000, tier: 'small' },
  { email: 'jefferndullamalinao@gmail.com', total: 44000, tier: 'medium' },
  { email: 'jeffernmalinaoqwe@gmail.com', total: 225000, tier: 'large' },
];

const MIN_TOTAL = 100;
const MAX_TOTAL = 400000;

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

/**
 * Parse `--accounts="a@x.com:5000,b@x.com:44000,b@x.com:900:<businessId>"`
 * into the plan.
 *
 * A bare address is refused rather than defaulted: a size guessed here would show
 * up later as an unexplained difference between two tenants' response times, which
 * is precisely the measurement this script exists to make trustworthy. The optional
 * third field is the tenant's id, and production requires it whenever that tenant
 * already exists.
 */
function parsePlan(raw, { production }) {
  if (!raw) {
    if (production) {
      fail(
        'a production run needs --accounts="address:documents[:businessId],…". The default plan is a ' +
          'development convenience and would reset three real businesses. Nothing was written.',
      );
    }
    return DEFAULT_PLAN;
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(':').map((part) => part.trim());
      if (parts.length < 2 || parts.length > 3) {
        fail(
          `--accounts entry "${entry}" must be address:documents or address:documents:businessId. ` +
            'Nothing was written.',
        );
      }
      const email = normaliseEmail(parts[0]);
      const businessId = parts[2];
      if (!email.includes('@')) {
        fail(`--accounts entry "${entry}" has no usable address. Nothing was written.`);
      }
      const total = parseCount(parts[1], {
        name: `--accounts size for ${email}`,
        min: MIN_TOTAL,
        max: MAX_TOTAL,
      });
      if (businessId && !/^[a-f0-9]{24}$/i.test(businessId)) {
        fail(
          `--accounts entry "${entry}" has a businessId that is not 24 hexadecimal characters. ` +
            'Nothing was written.',
        );
      }
      return { email, total, tier: 'custom', businessId: businessId || undefined };
    });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const includeSku = process.argv.includes('--include-sku');

  // The guard runs BEFORE any connection, any identity lookup and any write — and it
  // runs on a dry run too, so a dry run proves the target and the confirmation are
  // right rather than only the shape of the plan. Two phrases for development, three
  // for production; the rule is shared with every other seeder (./seed/guard.mjs).
  const target = assertSeedTarget({
    env,
    command: COMMAND,
    database: argValue('--database'),
    confirmPhrase: CONFIRM_PHRASE,
  });
  const production = target.production;

  const plan = parsePlan(argValue('--accounts'), { production });
  const seed = parseCount(argValue('--seed'), { name: '--seed', min: 0, fallback: 1 });

  if (!plan.length) {
    fail('the plan is empty. Nothing was written.');
  }

  const seen = new Set();
  for (const entry of plan) {
    if (seen.has(entry.email)) {
      fail(`"${entry.email}" appears twice in the plan. Nothing was written.`);
    }
    seen.add(entry.email);
  }

  console.log(`[${COMMAND}] database    : ${target.database}${production ? '   (PRODUCTION)' : ''}`);
  console.log(`[${COMMAND}] confirmed   : ${target.phrases} phrase(s) accepted`);
  console.log(`[${COMMAND}] accounts    : ${plan.length}`);
  console.log(`[${COMMAND}] sku/barcode : ${includeSku ? 'GENERATED (--include-sku)' : 'none — left for the app to generate'}`);
  console.log(`[${COMMAND}] PRNG seed   : ${seed} (the datasets are reproducible)`);
  console.log(`[${COMMAND}] ${dryRun ? 'DRY RUN — nothing will be written' : 'DESTRUCTIVE within these tenants: existing data of each account is RESET'}`);
  console.log('');
  for (const entry of plan) {
    console.log(
      `[${COMMAND}]   ${entry.tier.padEnd(7)} ${entry.email.padEnd(34)} ~${entry.total.toLocaleString()} documents` +
        `${entry.businessId ? `  business ${entry.businessId}` : ''}`,
    );
  }
  if (production) {
    console.log('');
    console.log(
      `[${COMMAND}] production: each account that ALREADY owns a business must name it as the third ` +
        'field; its existing password is never changed',
    );
  }

  if (dryRun) {
    console.log('');
    console.log(`[${COMMAND}] dry run complete — no connection was opened and nothing was written.`);
    console.log(
      `[${COMMAND}] to run for real: SEED_CONFIRM=${CONFIRM_PHRASE} ` +
        `SEED_DB_CONFIRM=${target.database}${production ? ' SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA' : ''} ` +
        `npm run ${COMMAND} -- --database=${target.database} …`,
    );
    return;
  }

  // ---- resolve every identity FIRST, so a plan that cannot be satisfied fails
  // ---- before any tenant has been reset. A half-seeded suite would silently bias
  // ---- the very comparison it is meant to support.
  const resolved = [];
  for (const entry of plan) {
    const identity = await resolveIdentity(entry.email, { refreshPassword: !production });
    resolved.push({ ...entry, identity });
    console.log(
      `[${COMMAND}] identity  : ${entry.email} uid ${String(identity.uid).slice(0, 10)}… ` +
        `(${identity.created ? 'CREATED now' : 'already existed'}${identity.emailVerified ? ', verified' : ', NOT verified'})` +
        `${identity.passwordSkipped ? ' — password NOT changed on a production run' : ''}`,
    );
  }

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  // ---- phase 2: tenants. Resolve EVERY tenant, prove the datasets are separate and
  // ---- that every tenant about to be replaced was named — before anything is cleared.
  // ---- Resetting as this loop went would leave a half-seeded suite when a later
  // ---- account was misnamed, and a half-seeded suite silently biases the comparison
  // ---- it exists to support.
  const prepared = [];
  for (const entry of resolved) {
    const tenant = await ensureTenantForIdentity({
      email: entry.email,
      identity: entry.identity,
      businessName: `AI TEST ${entry.tier.toUpperCase()} — ${entry.total.toLocaleString()} seeded documents`,
    });

    // The premise of the whole exercise. If two accounts resolved to one business
    // their data WOULD mix, and every comparison drawn from them would be void.
    if (prepared.some((p) => String(p.tenant.businessId) === String(tenant.businessId))) {
      throw new SeedSafetyError(
        `"${entry.email}" resolved to business ${String(tenant.businessId)}, which another account in ` +
          'this plan already owns — the datasets would not be separate. Stopping.',
      );
    }

    // Naming the tenant is required exactly when there is something to replace. A
    // brand-new account has no id to name until this run creates one, and creating one
    // deletes nothing. The rule itself is shared with seed:demo.
    assertTenantNamedForReset({
      production,
      reused: tenant.reused,
      requestedBusinessId: entry.businessId,
      businessId: tenant.businessId,
      businessName: tenant.businessName,
      command: `${COMMAND} (${entry.email})`,
      namingHint: 'the third field of --accounts',
    });

    prepared.push({ entry, tenant });
  }

  // ---- phase 3: reset and write, one tenant at a time. Every check above passed, so a
  // ---- failure from here is a database failure rather than a plan that cannot work.
  const results = [];
  for (const { entry, tenant } of prepared) {
    console.log('');
    console.log(
      `[${COMMAND}] ${entry.tier}: ${entry.email} -> ${tenant.reused ? 'reusing' : 'CREATED'} ` +
        `${String(tenant.businessId)} ("${tenant.businessName}")`,
    );

    const cleared = await clearTenantData([tenant.businessId]);
    if (cleared.removed > 0) {
      console.log(`[${COMMAND}]   reset: removed ${cleared.removed} previous document(s) from this tenant`);
    }

    const started = Date.now();
    const { counts, achieved, receiptTransactions } = await seedTenant({
      businessId: tenant.businessId,
      userId: tenant.userId,
      total: entry.total,
      rand: makeRandom(seed),
      includeSkuBarcode: includeSku,
      label: 'ACCT',
    });

    // Count it back before calling it done: a partially-rejected insert must not be
    // reported as a comparable tenant.
    const readBack = await readTenantCounts(tenant.businessId);
    const disagreements = countDisagreements(counts, readBack);
    if (disagreements.length) {
      throw new SeedSafetyError(
        `the read-back for ${entry.email} does not match what was written (${disagreements
          .map((d) => `${d.collection}: wrote ${d.wrote}, found ${d.found}`)
          .join('; ')}). The dataset is NOT trustworthy; re-run before using it.`,
      );
    }

    results.push({
      ...entry,
      businessId: tenant.businessId,
      businessName: tenant.businessName,
      counts,
      achieved,
      receiptTransactions,
      elapsedMs: Date.now() - started,
      accountCreated: tenant.accountCreated,
    });
    console.log(
      `[${COMMAND}]   wrote ${achieved.toLocaleString()} document(s) ` +
        `(${counts.products.toLocaleString()} products) in ${Date.now() - started} ms`,
    );
  }

  console.log('');
  console.log(`[${COMMAND}] OK — ${results.length} account(s) seeded, each its own tenant`);
  console.log(`[${COMMAND}]`);
  console.log(`[${COMMAND}]   tier    account                              products    documents   businessId`);
  for (const r of results) {
    console.log(
      `[${COMMAND}]   ${r.tier.padEnd(7)} ${r.email.padEnd(34)} ` +
        `${String(r.counts.products).padStart(8)}  ${String(r.achieved).padStart(11)}   ${String(r.businessId)}`,
    );
  }
  console.log(`[${COMMAND}]`);
  console.log(`[${COMMAND}] barcode generation is left unassigned on purpose: open a seeded product`);
  console.log(`[${COMMAND}] in the app and use the barcode action to generate its first code.`);
  console.log(`[${COMMAND}]`);
  if (production) {
    console.log(`[${COMMAND}] compare the assistant against the DEPLOYED server (one tenant at a time):`);
    console.log(
      `[${COMMAND}]   NODE_ENV=production MONGODB_DB_NAME=${env.mongodbDbName} ` +
        'PERF_TURNS_CONFIRM=perf-turns:production \\',
    );
    for (const r of results) {
      console.log(
        `[${COMMAND}]     npm run perf:turns -- --base=https://ai-inventory-l1mi.onrender.com ` +
          `--database=${env.mongodbDbName} --business=${String(r.businessId)} --login --only=1,2`,
      );
    }
  } else {
    console.log(`[${COMMAND}] compare the assistant across the three tenants (server must be running):`);
    for (const r of results) {
      console.log(`[${COMMAND}]   npm run perf:measure -- --business=${String(r.businessId)} --label=${r.tier}`);
    }
    console.log(`[${COMMAND}]   npm run perf:turns   -- --business=<id> --only=1,3`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
