// `SEED_CONFIRM=seed-accounts npm run seed:accounts`
//
// Seed SEVERAL accounts at once, each with its OWN dataset size, so the AI
// assistant's speed, accuracy and reliability can be compared across tenants that
// hold very different amounts of data. Each account is registered in the app first
// (or already exists), and this script attaches to it — it never invents an
// identity, and it never deletes one.
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
//   * `assertSafeTarget` (../perf/lib.mjs) refuses `NODE_ENV=production`, refuses a
//     database that is not the DEVELOPMENT one, refuses a missing MONGODB_URI, and
//     requires `SEED_CONFIRM=seed-accounts` — all BEFORE a connection is opened.
//     The test database is refused as firmly as production, because `npm test`
//     clears it and a measurement against it would be of a vanishing tenant.
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
// Usage:
//   SEED_CONFIRM=seed-accounts npm run seed:accounts                 # the three defaults
//   SEED_CONFIRM=seed-accounts npm run seed:accounts -- --dry-run     # plan only, writes nothing
//   SEED_CONFIRM=seed-accounts npm run seed:accounts -- --accounts="a@x.com:5000,b@x.com:44000"
//   SEED_CONFIRM=seed-accounts npm run seed:accounts -- --include-sku # generated codes instead
//
// If an address has no Firebase identity yet, supply its initial password through
// the environment (never on the command line, never in a file):
//   DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-accounts npm run seed:accounts

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import { SeedSafetyError, assertSafeTarget, clearTenantData } from './perf/lib.mjs';
import { ensureTenantForIdentity, makeRandom, resolveIdentity, seedTenant } from './seed/lib.mjs';

const COMMAND = 'seed:accounts';
const CONFIRM_PHRASE = 'seed-accounts';

/**
 * The suite the owner tests the assistant across. Three DELIBERATELY different
 * sizes, because the question being asked is whether the assistant's response time
 * moves with the amount of data — which three identical tenants cannot answer.
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
 * Parse `--accounts="a@x.com:5000,b@x.com:44000"` into the plan.
 *
 * A bare address is refused rather than defaulted: a size guessed here would show up
 * later as an unexplained difference between two tenants' response times, which is
 * precisely the measurement this script exists to make trustworthy.
 */
function parsePlan(raw) {
  if (!raw) return DEFAULT_PLAN;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.lastIndexOf(':');
      if (at === -1) {
        fail(`--accounts entry "${entry}" has no size. Use address:documents. Nothing was written.`);
      }
      const email = entry.slice(0, at).trim();
      const total = Number.parseInt(entry.slice(at + 1).trim(), 10);
      if (!email.includes('@')) {
        fail(`--accounts entry "${entry}" has no usable address. Nothing was written.`);
      }
      if (!Number.isInteger(total) || total < MIN_TOTAL || total > MAX_TOTAL) {
        fail(`--accounts entry "${entry}" needs a size between ${MIN_TOTAL} and ${MAX_TOTAL}. Nothing was written.`);
      }
      return { email, total, tier: 'custom' };
    });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const includeSku = process.argv.includes('--include-sku');
  const seed = Number.parseInt(argValue('--seed') ?? '1', 10);
  const plan = parsePlan(argValue('--accounts'));

  if (!Number.isInteger(seed) || seed < 0) {
    fail('--seed must be a non-negative integer. Nothing was written.');
  }
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

  // The guard runs BEFORE any connection, any identity lookup and any write — and it
  // runs on a dry run too, so a dry run proves the target and the confirmation are
  // right rather than only the shape of the plan.
  assertSafeTarget(env, COMMAND, { confirmPhrase: CONFIRM_PHRASE });

  console.log(`[${COMMAND}] database    : ${env.mongodbDbName}`);
  console.log(`[${COMMAND}] accounts    : ${plan.length}`);
  console.log(`[${COMMAND}] sku/barcode : ${includeSku ? 'GENERATED (--include-sku)' : 'none — left for the app to generate'}`);
  console.log(`[${COMMAND}] PRNG seed   : ${seed} (the datasets are reproducible)`);
  console.log(`[${COMMAND}] ${dryRun ? 'DRY RUN — nothing will be written' : 'DESTRUCTIVE within these tenants: existing data of each account is RESET'}`);
  console.log('');
  for (const entry of plan) {
    console.log(
      `[${COMMAND}]   ${entry.tier.padEnd(7)} ${entry.email.padEnd(34)} ~${entry.total.toLocaleString()} documents`,
    );
  }

  if (dryRun) {
    console.log('');
    console.log(`[${COMMAND}] dry run complete — no connection was opened and nothing was written.`);
    console.log(`[${COMMAND}] to run for real: SEED_CONFIRM=${CONFIRM_PHRASE} npm run seed:accounts`);
    return;
  }

  // ---- resolve every identity FIRST, so a plan that cannot be satisfied fails
  // ---- before any tenant has been reset. A half-seeded suite would silently bias
  // ---- the very comparison it is meant to support.
  const resolved = [];
  for (const entry of plan) {
    const identity = await resolveIdentity(entry.email);
    resolved.push({ ...entry, identity });
    console.log(
      `[${COMMAND}] identity  : ${entry.email} uid ${String(identity.uid).slice(0, 10)}… ` +
        `(${identity.created ? 'CREATED now' : 'already existed'}${identity.emailVerified ? ', verified' : ', NOT verified'})`,
    );
  }

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const results = [];
  for (const entry of resolved) {
    const tenant = await ensureTenantForIdentity({
      email: entry.email,
      identity: entry.identity,
      businessName: `AI TEST ${entry.tier.toUpperCase()} — ${entry.total.toLocaleString()} seeded documents`,
    });

    // The premise of the whole exercise. If two accounts resolved to one business
    // their data WOULD mix, and every comparison drawn from them would be void.
    if (results.some((r) => String(r.businessId) === String(tenant.businessId))) {
      throw new SeedSafetyError(
        `"${entry.email}" resolved to business ${String(tenant.businessId)}, which another account in ` +
          'this plan already owns — the datasets would not be separate. Stopping.',
      );
    }

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
  console.log(`[${COMMAND}] compare the assistant across the three tenants (server must be running):`);
  for (const r of results) {
    console.log(`[${COMMAND}]   npm run perf:measure -- --business=${String(r.businessId)} --label=${r.tier}`);
  }
  console.log(`[${COMMAND}]   npm run perf:turns   -- --business=<id> --only=1,3`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
