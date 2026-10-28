// `npm run seed:three -- --database=<name>`                    — the three fixed accounts
// `npm run seed:accounts -- --database=<name> --accounts="…"`  — any accounts, any sizes
//
// Seed accounts that ALREADY EXIST with a large, realistic inventory dataset of their own.
// Each account is registered in the app first (or already exists), and this script attaches
// to it — it never invents an identity quietly, and it never deletes one.
//
// THE UNIT IS PRODUCTS. `--accounts` entries and the preset are counted in products, which
// is the number a person checks against the app's own product list. The generator sizes the
// whole seven-collection dataset, so the console prints the derived document figure next to
// every entry — `30,000 products ≈ 133,333 documents` — and both numbers are true.
//
// TWO WAYS IN, TWO PHRASES:
//   * `npm run seed:three`            the three comparison accounts, sized in
//                                     `seed/lib.mjs` (30 000 / 50 000 / 90 000 products).
//                                     Its phrase is SEED_CONFIRM=seed-three-accounts.
//   * `npm run seed:accounts --accounts="a@x.com:30000,b@y.com:50000"`  your own list.
//                                     Its phrase is SEED_CONFIRM=seed-accounts.
//   Each account may name its tenant: `address:products[:businessId]`. A size may be given
//   in documents instead with a `d`: `address:400000d`. The command prints the phrase it
//   needs, and a refusal names every phrase that is missing.
//
// THE CEILING IS 112 500 PRODUCTS (500 000 documents), reported rather than attempted:
// one million products would be ≈4 400 000 documents, and the plan is built in memory
// before it is inserted. A development `--dry-run` prints the size warning without opening a
// connection; a production one reads (read-only) to check every named id and count the reset —
// a preview that cannot see the tenant cannot promise the write will be allowed.
//
// WHY ONE TENANT PER ACCOUNT. Every row is written with that account's own `businessId`,
// and the application scopes every read by it, so the datasets cannot be seen from one
// another. The script additionally asserts that the accounts resolved to DIFFERENT
// businesses, because "the data was separate" is the premise every comparison rests on.
//
// NO SKUs AND NO BARCODES BY DEFAULT. `sku` and `barcode` are optional on the Product
// schema and are uniquely indexed only among products that actually have them, so any
// number of products may omit them. Leaving them out is deliberate: it leaves the app's own
// barcode generation as the thing that FIRST assigns a code, which is what makes that
// feature testable on this data. `--include-sku` adds generated codes instead.
//
// SAFETY — all of it inherited, none of it re-implemented:
//   * `assertSeedTarget` (./seed/guard.mjs) requires `--database=` to equal the database
//     this process resolved, refuses the test database and any unknown one, refuses a
//     `MONGODB_URI` that names a different database, and counts phrases by target: TWO in
//     development, THREE in production — all BEFORE a connection is opened.
//   * A re-run resets ONLY the data of the tenants this script resolved, by `businessId`,
//     so another tenant cannot be reached even from a wrong id.
//   * Account rows (`users`, `businesses`) are only ever CREATED, never deleted and never
//     re-linked — no data seeder should touch an identity linkage as a side effect.
//   * NO Firebase identity is ever deleted. `docs/DEVELOPMENT_ROADMAP.md` §27BB (F-50)
//     records the trap: a MongoDB user whose Firebase identity was deleted can neither
//     sign in nor register (`409 EMAIL_IN_USE`), and nothing in the application can
//     repair it. Clearing MongoDB alone is the safe direction.
//
// PRODUCTION. The same script reaches a NAMED database, production included. Three extra
// rules apply there, because several REAL businesses can be reset in one command:
//   * A PRESET IS REFUSED. Every account must be named explicitly, as
//     `address:products`; the preset is a development convenience and would reset real
//     businesses by accident.
//   * THE TENANT ID IS RESOLVED, NOT TYPED. Each address is looked up in the database, its
//     own `businessId` is read, and the run requires that account to be the OWNER. The
//     optional third field (`address:products:businessId`) still works, but it is compared
//     with the resolved id and a mismatch refuses. An account with no business is refused
//     rather than silently given a new one, so a production seed never creates a second
//     tenant behind an existing login.
//   * an EXISTING login's password is never rewritten, even when DEMO_ACCOUNT_PASSWORD is
//     set. Creation is refused in production outright.
//
// Usage (development — TWO phrases, and the database is always named):
//   SEED_CONFIRM=seed-three-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed:three -- --database=inventoryai_dev_db --dry-run      # plan only
//   SEED_CONFIRM=seed-three-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed:three -- --database=inventoryai_dev_db
//
//   SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed:accounts -- --database=inventoryai_dev_db \
//       --accounts="a@x.com:100000,b@y.com:40000"
//
// Production (THREE phrases, the preset refused, the tenant resolved from the address):
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
//     SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
//     npm run seed:accounts -- --database=inventoryai_prod_db \
//       --accounts="you@example.com:30000"
//
//   The optional third field still names a tenant, and is checked:
//     --accounts="you@example.com:30000:<businessId>"
//
// In DEVELOPMENT only, an address with no Firebase identity may be created: supply its initial
// password through the environment (never on the command line, never in a file). Production
// refuses instead — register the account in the app first.
//   DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed:accounts -- --database=inventoryai_dev_db --accounts="new@example.com:500"
//
// Teardown: `npm run cleanup:three` / `npm run cleanup:account` — the data goes, the login
// and the business row stay. See docs/guides/11-deleting-development.md and
// docs/guides/12-deleting-production.md.

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import { SeedSafetyError, clearTenantData, countTenantDataRemoval } from './perf/lib.mjs';
import { assertSeedTarget } from './seed/guard.mjs';
import {
  COMPARISON_ACCOUNTS,
  MAX_DOCUMENTS,
  MAX_PRODUCTS,
  MIN_DOCUMENTS,
  MIN_PRODUCTS,
  assertOneBusinessAssociation,
  assertProductionTenantOwnership,
  assertTenantNamedForReset,
  countDisagreements,
  documentsForProducts,
  ensureTenantForIdentity,
  isEmailAddress,
  makeRandom,
  normaliseBusinessId,
  normaliseEmail,
  parseCount,
  productsForDocuments,
  readBusinessAssociations,
  readIdentity,
  readTenantCounts,
  resolveExistingTenantForIdentity,
  resolveIdentity,
  seedTenant,
} from './seed/lib.mjs';

const COMMAND = 'seed:accounts';

/** The phrase for an explicit `--accounts=` list. */
const CONFIRM_PHRASE = 'seed-accounts';

/** The phrase for the preset — a different dataset, so a different phrase. */
const PRESET = 'three';
const PRESET_PHRASE = 'seed-three-accounts';
const PRESET_ALIAS = 'seed:three';

/**
 * Where a plan stops being merely large.
 *
 * Not a cap — the cap is `MAX_PRODUCTS` — but the size above which the run is worth a
 * stated warning: it is minutes of inserts, hundreds of thousands of documents, and it
 * replaces everything those tenants held.
 */
const LARGE_RUN_PRODUCTS = 90000;

/**
 * The rate the size warnings are estimated from, and it is a MEASUREMENT: production
 * seeded 80 000 documents in 171 s on 2026-10-25. Printed as an estimate, never as a
 * promise, because the tier and the network change.
 */
const MEASURED_DOCS_PER_SECOND = 470;

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

/** `--preset=three`, or nothing. Any other value is refused rather than guessed at. */
function presetValue(argv = process.argv) {
  const eq = argv.find((a) => a.startsWith('--preset='));
  if (eq) {
    const value = eq.slice('--preset='.length).trim().toLowerCase();
    if (value !== PRESET) {
      fail(`--preset must be ${PRESET} (or leave it out and pass --accounts=). Nothing was written.`);
    }
    return PRESET;
  }
  if (argv.includes('--preset')) {
    fail(`--preset needs a value: --preset=${PRESET}. Nothing was written.`);
  }
  return undefined;
}

/**
 * One plan entry: `address:size[:businessId]`.
 *
 * The size is PRODUCTS. A `d` suffix makes it DOCUMENTS instead — the currency the
 * generator works in, for a run that wants a total rather than a catalogue size. A bare
 * address is refused rather than defaulted: a size guessed here would show up later as an
 * unexplained difference between two tenants' response times, which is exactly the
 * comparison this script exists to make trustworthy.
 */
function parseEntry(entry) {
  const parts = entry.split(':').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) {
    fail(
      `--accounts entry "${entry}" must be address:products (or address:products:businessId, ` +
        'or a size in documents with a d suffix: address:400000d). Nothing was written.',
    );
  }

  const email = normaliseEmail(parts[0]);
  if (!isEmailAddress(email)) {
    fail(`--accounts entry "${entry}" has no usable address. Nothing was written.`);
  }

  const size = parts[1];
  const rawBusinessId = parts[2];
  const businessId = normaliseBusinessId(rawBusinessId);
  const inDocuments = /^\d+d$/i.test(size);
  const digits = (inDocuments ? size.slice(0, -1) : size).replace(/p$/i, '');

  let products;
  let total;
  if (inDocuments) {
    total = parseCount(digits, {
      name: `--accounts document size for ${email}`,
      min: MIN_DOCUMENTS,
      max: MAX_DOCUMENTS,
    });
    products = productsForDocuments(total);
  } else {
    // The ceiling is reported HERE, before the range parser, because the number is what
    // makes the limit understandable: "between 5 and 112500" says what, not why.
    const asked = /^\d+$/.test(digits) ? Number.parseInt(digits, 10) : NaN;
    if (Number.isSafeInteger(asked) && asked > MAX_PRODUCTS) {
      fail(
        `${email} asks for ${asked.toLocaleString()} products. The ceiling is ` +
          `${MAX_PRODUCTS.toLocaleString()} products (${MAX_DOCUMENTS.toLocaleString()} documents): ` +
          'one million products would be ≈4 400 000 documents, and the whole dataset is built in ' +
          'memory before it is inserted, so that run is refused rather than attempted. Nothing was written.',
      );
    }
    products = parseCount(digits, {
      name: `--accounts product size for ${email}`,
      min: MIN_PRODUCTS,
      max: MAX_PRODUCTS,
    });
    total = documentsForProducts(products);
  }

  if (rawBusinessId !== undefined && !businessId) {
    fail(
      `--accounts entry "${entry}" has a businessId that is not 24 hexadecimal characters. ` +
        'Nothing was written.',
    );
  }

  return { email, products, total, tier: 'custom', businessId: businessId || undefined };
}

/** The three comparison accounts, as a plan. Sizes live in ./seed/lib.mjs with the emails. */
function presetPlan() {
  return COMPARISON_ACCOUNTS.map((account) => ({
    ...account,
    total: documentsForProducts(account.products),
  }));
}

function parsePlan(raw) {
  if (!raw) return presetPlan();
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseEntry);
}

/**
 * Read BEFORE claiming, in production.
 *
 * WHY (measured 2026-10-28). The preview used to return before opening a connection, so it could
 * not compare the `:businessId` an entry names with the tenant the account actually owns. A wrong
 * id printed `business <someone else's id>` and exit 0, while the same line for real refused — the
 * preview said the opposite of the run, which is the one thing a preview must not do.
 *
 * It reads through the SAME lookup and the SAME rules as the real run
 * (`resolveExistingTenantForIdentity`, `readBusinessAssociations`, `assertProductionTenantOwnership`),
 * and it can only read: `readIdentity` never creates, and nothing here writes. An address that
 * resolves to no identity, no business or a non-OWNER refuses HERE rather than at the write.
 * Development keeps the fast preview — it creates tenants there, and creates nothing that replaces.
 */
async function previewProductionTargets(plan, database) {
  try {
    await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
  } catch (err) {
    throw new SeedSafetyError(
      `could not read ${database} to check the ids (${String(err.message).split('\n')[0]}). ` +
        'Nothing was written — and the ids were NOT checked. Fix the connection and re-run the dry run.',
    );
  }

  try {
    for (const entry of plan) {
      const identity = await readIdentity(entry.email);
      if (!identity) {
        throw new SeedSafetyError(
          `no Firebase identity exists for ${entry.email}, and a production seed will not create ` +
            'one. Register the account in the app first (registration creates it), then re-run. ' +
            'Nothing was written.',
        );
      }

      const tenant = await resolveExistingTenantForIdentity({ email: entry.email, identity });
      assertOneBusinessAssociation({
        email: entry.email,
        businessIds: await readBusinessAssociations({ email: entry.email, firebaseUid: identity.uid }),
      });

      // The real run's rules, applied here so a missing tenant, a renamed id or a non-OWNER
      // fails the preview rather than the write.
      entry.businessId = String(
        assertProductionTenantOwnership({
          email: entry.email,
          tenant,
          requestedBusinessId: entry.businessId,
          command: `${COMMAND} (${entry.email})`,
          namingHint: 'the third field of --accounts',
        }),
      );

      const { total } = await countTenantDataRemoval([tenant.businessId]);
      console.log(
        `  ${entry.email} — ${tenant.businessName} — ${tenant.role} — ` +
          `${total.toLocaleString()} documents to reset`,
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const includeSku = process.argv.includes('--include-sku');
  const preset = presetValue();
  const requested = argValue('--accounts');

  if (preset && requested) {
    fail(`pass either --preset=${PRESET} or --accounts=…, not both. Nothing was written.`);
  }
  if (!preset && !requested) {
    fail(
      '--accounts="address:products[:businessId],…" is required — for the three fixed accounts use ' +
        `${PRESET_ALIAS} (the same script with --preset=${PRESET}). Nothing was written.`,
    );
  }

  // A preset has no sizes to read, so its phrase is the preset's own. The guard runs BEFORE
  // any connection, any identity lookup and any write — and it runs on a dry run too, so a
  // dry run proves the target and the confirmation rather than only the shape of the plan.
  const phrase = preset ? PRESET_PHRASE : CONFIRM_PHRASE;
  const target = assertSeedTarget({
    env,
    command: preset ? PRESET_ALIAS : COMMAND,
    database: argValue('--database'),
    confirmPhrase: phrase,
  });
  const production = target.production;

  if (production && preset) {
    fail(
      `the ${PRESET_ALIAS} preset is a development convenience and is refused in production: it ` +
        'would reset three real businesses in one command. Name every account instead, as ' +
        '--accounts="address:products,…" — each tenant is resolved from its address and checked ' +
        'before anything is written.',
    );
  }

  const plan = parsePlan(requested);
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

  const documents = plan.reduce((sum, entry) => sum + entry.total, 0);
  const products = plan.reduce((sum, entry) => sum + entry.products, 0);
  const seconds = Math.round(documents / MEASURED_DOCS_PER_SECOND);

  console.log(`Database : ${target.database}${production ? ' (PRODUCTION)' : ''}`);
  console.log(`Mode     : ${dryRun ? 'DRY RUN — nothing will be written' : 'WRITE — each named tenant is reset'}`);
  console.log(`Accounts : ${plan.length}`);
  console.log(`Products : ${products.toLocaleString()}`);
  console.log(`Documents: ${documents.toLocaleString()} (estimated)`);
  if (includeSku) console.log('SKU/barcode: generated (--include-sku)');
  if (products >= LARGE_RUN_PRODUCTS) {
    console.log(`Est. time: about ${Math.max(1, Math.round(seconds / 60))} minutes`);
  }
  if (production) {
    console.log('Production: tenant resolved from the account, OWNER required');
  }

  // Production prints each account from the verified preflight instead, so the address,
  // business and count appear once.
  if (!production) {
    for (const entry of plan) {
      console.log(
        `\n${entry.email} — ${entry.products.toLocaleString()} products — ` +
          `${entry.total.toLocaleString()} documents`,
      );
    }
  }

  if (dryRun) {
    console.log('');
    if (production) {
      await previewProductionTargets(plan, target.database);
      console.log('\nAll accounts and businesses verified.');
      console.log('No data written.');
    } else {
      console.log('dry run complete — no connection was opened and nothing was written.');
    }
    console.log('Result   : DRY RUN SUCCESS');
    return;
  }

  // ---- production: prove every account and tenant BEFORE touching Firebase. The identity
  // ---- resolver may create a login when DEMO_ACCOUNT_PASSWORD is set, and a production run
  // ---- that would refuse on a missing tenant must not leave a new identity behind while
  // ---- doing it. This is the dry run's own read-only check, run again on the real path.
  if (production) {
    console.log('');
    console.log(`[${COMMAND}] production preflight — read-only, against ${target.database}:`);
    await previewProductionTargets(plan, target.database);
  }

  // ---- resolve every identity next, so a plan that cannot be satisfied fails
  // ---- before any tenant has been reset. A half-seeded suite would silently bias
  // ---- the very comparison it is meant to support.
  const resolved = [];
  for (const entry of plan) {
    const identity = await resolveIdentity(entry.email, { refreshPassword: !production });
    resolved.push({ ...entry, identity });
    console.log(
      `Identity : ${entry.email} — ${identity.created ? 'CREATED' : 'verified'}` +
        `${identity.emailVerified ? '' : ' (NOT verified)'}` +
        `${identity.passwordSkipped ? ' — password unchanged' : ''}`,
    );
  }

  // A connection failure happens BEFORE phase 2, so nothing has been written. Without this
  // wrapper the whole report was the driver's own line (`connect ETIMEDOUT …`, measured against
  // production on 2026-10-28): it named neither the database nor whether anything had changed.
  try {
    await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
  } catch (err) {
    throw new SeedSafetyError(
      `could not reach MongoDB for ${target.database} (${String(err.message).split('\n')[0]}). ` +
        'No tenant data was written — the run stopped before its first write. ' +
        'A transient connection failure is worth one retry of the same command.',
    );
  }

  // ---- phase 2: tenants. Resolve EVERY tenant, prove the datasets are separate and
  // ---- that every tenant about to be replaced was named — before anything is cleared.
  const prepared = [];
  for (const entry of resolved) {
    const existing = await resolveExistingTenantForIdentity({
      email: entry.email,
      identity: entry.identity,
    });

    let tenant;
    if (production) {
      // The lookup and the two rules are the ones the preview ran: an ambiguous association, a
      // missing tenant or a non-OWNER is refused here as well, and an id supplied in the third
      // field is accepted only when it equals the row's own businessId.
      assertOneBusinessAssociation({
        email: entry.email,
        businessIds: await readBusinessAssociations({
          email: entry.email,
          firebaseUid: entry.identity.uid,
        }),
      });
      entry.businessId = String(
        assertProductionTenantOwnership({
          email: entry.email,
          tenant: existing,
          requestedBusinessId: entry.businessId,
          command: `${COMMAND} (${entry.email})`,
          namingHint: 'the third field of --accounts',
        }),
      );
      tenant = existing;
    } else {
      // Development keeps its one convenience: a new address may create its own tenant.
      tenant = existing ?? await ensureTenantForIdentity({
        email: entry.email,
        identity: entry.identity,
        businessName: `AI TEST ${entry.tier.toUpperCase()} — ${entry.products.toLocaleString()} seeded products`,
      });
    }

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
    console.log(
      `\n${entry.email} — ${tenant.businessName} — ${tenant.reused ? 'existing' : 'created'} tenant — ` +
        `writing ${entry.total.toLocaleString()} documents`,
    );

    const cleared = await clearTenantData([tenant.businessId]);
    if (cleared.removed > 0) {
      console.log(`  reset: removed ${cleared.removed.toLocaleString()} previous documents`);
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
      `  wrote ${achieved.toLocaleString()} documents ` +
        `(${counts.products.toLocaleString()} products) in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  }

  console.log('');
  console.log(`Documents: ${results.reduce((sum, r) => sum + r.achieved, 0).toLocaleString()} across ${results.length} tenants`);
  console.log('Result   : SUCCESS');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
