/**
 * The three-account workflow — DB-FREE.
 *
 * WHAT THIS PINS. Seeding by address is the owner's whole workflow: check the accounts, seed
 * them by PRODUCT count, then delete that data by address. Three things can go wrong without a
 * database, and all three are asserted here:
 *
 *   1. THE UNIT. A plan is counted in products and the generator is sized in documents, so a
 *      conversion that lands one product off would seed a dataset nobody asked for and report
 *      it as the size that was asked for. The round trip is checked over every small size and
 *      over the real ones.
 *   2. THE PHRASES. Each mode demands its own phrase (`seed:three` vs `seed:accounts`,
 *      `cleanup:three` vs `cleanup:account`), and a phrase that belongs to one mode must not
 *      satisfy another.
 *   3. WHAT THE SCRIPTS MAY DO. `check:accounts` writes nothing at all; `cleanup-accounts.mjs`
 *      removes tenant data and never a login, a business row or an identity (F-50).
 *   4. WHICH IDENTITY AUTHORITY. A seed writes to two stores, and only one of them was ever
 *      named: the Firebase project came from the shell's credentials. A login created in the
 *      wrong project could never be joined to the tenant written here, so the project is
 *      pinned — before the first read — and every seeder goes through one function.
 *
 * Reading source is deliberate: these are CLI contracts, and the assertions are the ones a
 * reviewer would make by hand. No connection, no network, no Firebase.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMPARISON_ACCOUNTS,
  MAX_DOCUMENTS,
  MAX_PRODUCTS,
  MIN_PRODUCTS,
  accountReadiness,
  assertOneBusinessAssociation,
  assertProductionTenantOwnership,
  databasesToCheck,
  documentsForProducts,
  productsForDocuments,
  summariseReadiness,
} from '../scripts/seed/lib.mjs';
import { APPROVED_FIREBASE_PROJECT_ID, assertSeedFirebaseProject } from '../scripts/seed/guard.mjs';
import { SeedSafetyError } from '../scripts/perf/lib.mjs';

const read = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** What `seedTenant` will actually write, in products, for a document budget. */
const achievedProducts = (total) => Math.max(5, Math.round(total * 0.225));

describe('the product size is exact, not approximate', () => {
  it('every small size round-trips through the document budget', () => {
    // `seedTenant` floors at 5 products, so that is where the walk starts.
    for (let products = MIN_PRODUCTS; products <= 2000; products += 1) {
      const total = documentsForProducts(products);
      assert.equal(
        achievedProducts(total),
        products,
        `asking for ${products} products produced ${achievedProducts(total)}`,
      );
      // The document floor belongs to a DOCUMENT count, not to this direction: a small
      // product count legitimately maps to a budget under `MIN_DOCUMENTS` (100 documents is
      // already 23 products), and applying it here would make "5 products" unsatisfiable.
      assert.ok(Number.isInteger(total) && total > 0, `${products} products became ${total}`);
    }
  });

  it('the sizes this workflow is used at round-trip exactly', () => {
    for (const products of [30000, 50000, 90000, 100000]) {
      const total = documentsForProducts(products);
      assert.equal(achievedProducts(total), products);
      assert.equal(productsForDocuments(total), products);
    }
  });

  it('the two ceilings are the same ceiling', () => {
    // 112 500 products ≈ 500 000 documents. If one moved without the other, the ceiling would
    // refuse a size it can express, or accept one it cannot.
    assert.equal(documentsForProducts(MAX_PRODUCTS), MAX_DOCUMENTS);
    assert.equal(productsForDocuments(MAX_DOCUMENTS), MAX_PRODUCTS);
    assert.equal(MAX_PRODUCTS, 112500);
    assert.equal(MAX_DOCUMENTS, 500000);
  });

  it('one million products is above the ceiling, and the refusal says why', () => {
    assert.ok(1000000 > MAX_PRODUCTS);
    const source = read('seed-accounts.mjs');
    assert.match(
      source,
      /one million products would be/,
      'the ceiling must name the reason a million is refused, not only the range',
    );
  });

  it('the three fixed accounts are one definition, with the sizes in products', () => {
    assert.deepEqual(
      COMPARISON_ACCOUNTS.map((a) => [a.email, a.products, a.tier]),
      [
        ['jefferndullamalinaozxc@gmail.com', 30000, 'small'],
        ['jefferndullamalinao@gmail.com', 50000, 'medium'],
        ['jeffernmalinaoqwe@gmail.com', 90000, 'large'],
      ],
    );
    assert.equal(new Set(COMPARISON_ACCOUNTS.map((a) => a.email)).size, COMPARISON_ACCOUNTS.length);
    for (const account of COMPARISON_ACCOUNTS) {
      assert.ok(account.products >= MIN_PRODUCTS && account.products <= MAX_PRODUCTS);
    }
  });
});

describe('the seeder has two modes and two phrases', () => {
  const source = read('seed-accounts.mjs');

  it('the list phrase and the preset phrase are distinct, and both are declared', () => {
    assert.match(source, /const CONFIRM_PHRASE = 'seed-accounts'/);
    assert.match(source, /const PRESET_PHRASE = 'seed-three-accounts'/);
    assert.notEqual('seed-accounts', 'seed-three-accounts');
  });

  it('the preset is the same script with the flag baked in, and the command says which mode it is in', () => {
    assert.equal(packageJson.scripts['seed:three'], 'node scripts/seed-accounts.mjs --preset=three');
    assert.equal(packageJson.scripts['seed:accounts'], 'node scripts/seed-accounts.mjs');
    assert.match(source, /const PRESET_ALIAS = 'seed:three'/);
    assert.match(source, /preset \? PRESET_PHRASE : CONFIRM_PHRASE/);
  });

  it('a bare seed:accounts names nothing, so it refuses instead of guessing a list', () => {
    assert.match(source, /--accounts="address:products\[:businessId\],…" is required/);
    assert.match(source, /pass either --preset=\$\{PRESET\} or --accounts=…, not both/);
  });

  it('the preset is refused in production, where every tenant is resolved and checked', () => {
    assert.match(
      source,
      /the \$\{PRESET_ALIAS\} preset is a development convenience and is refused in production/,
    );
    assert.match(source, /--accounts="address:products,…"/);
  });

  it('the preview opens no connection in development, and only reads in production', () => {
    // Development keeps the fast preview: it prints and returns before main connects.
    const dryIndex = source.indexOf('dry run complete — no connection was opened');
    const mainConnectIndex = source.indexOf('mongoose.connect(', source.indexOf('async function main()'));
    assert.ok(dryIndex > -1, 'the development dry-run branch is missing');
    assert.ok(mainConnectIndex > -1, 'the real run never connects, which cannot be right');
    assert.ok(dryIndex < mainConnectIndex, 'the development dry run runs AFTER the connection is opened');

    // Production reads the tenant first, so a wrong `:businessId` fails the preview rather than
    // the write (measured 2026-10-28: the preview reported exit 0 for an id the run refuses).
    // It must read through the shared resolver and the shared naming rule, and must never touch
    // the CREATING helper — a dry run that created a tenant would be the write it disclaims.
    const preview = source.slice(
      source.indexOf('async function previewProductionTargets'),
      source.indexOf('async function main()'),
    );
    assert.ok(preview.length > 0, 'the production preview is missing');
    assert.ok(preview.includes('readIdentity('), 'the preview must use the read-only identity lookup');
    assert.ok(!preview.includes('resolveIdentity('), 'the preview must not create or refresh an identity');
    assert.ok(preview.includes('resolveExistingTenantForIdentity('), 'the preview must resolve the tenant');
    assert.ok(preview.includes('readBusinessAssociations('), 'the preview must check for ambiguous links');
    assert.ok(preview.includes('assertOneBusinessAssociation('), 'the preview must refuse two tenants');
    assert.ok(
      preview.includes('assertProductionTenantOwnership('),
      'the preview must apply the ownership and naming rules',
    );
    assert.ok(!preview.includes('ensureTenantForIdentity('), 'the preview must not create a tenant');
    assert.ok(preview.includes('countTenantDataRemoval('), 'the preview must count what would be reset');
    assert.ok(!preview.includes('seedTenant('), 'the preview must not write data');
  });

  it('the plan entry syntax is products, with documents available and marked', () => {
    assert.match(source, /address:products:businessId/);
    assert.match(source, /^\s*const inDocuments = \/\^\\d\+d\$\//m);
    assert.match(source, /--accounts document size for/);
    assert.match(source, /--accounts product size for/);
  });

  it('the write path is the shared core, and it is read back', () => {
    for (const call of ['seedTenant(', 'clearTenantData(', 'readTenantCounts(', 'countDisagreements(', 'ensureTenantForIdentity(', 'assertTenantNamedForReset(', 'assertSeedTarget(']) {
      assert.ok(source.includes(call), `seed-accounts.mjs no longer calls ${call}`);
    }
    assert.match(source, /resolveIdentity\([^)]*refreshPassword: !production/);
  });
});

describe('a production target is resolved from the account, never typed', () => {
  const owner = {
    businessId: 'a'.repeat(24),
    businessName: 'republic of gamers',
    role: 'OWNER',
    status: 'ACTIVE',
    businessStatus: 'ACTIVE',
  };

  it('an address with no tenant is refused, because production must not create one', () => {
    assert.throws(
      () => assertProductionTenantOwnership({ email: 'a@x.com', tenant: null, command: 'seed:accounts' }),
      /no business exists for a@x\.com/,
    );
  });

  it('a member who is not the OWNER is refused', () => {
    assert.throws(
      () =>
        assertProductionTenantOwnership({
          email: 'a@x.com',
          tenant: { ...owner, role: 'STAFF' },
          command: 'seed:accounts',
        }),
      /requires the OWNER/,
    );
  });

  it('a DISABLED account is refused even when it is the OWNER', () => {
    assert.throws(
      () =>
        assertProductionTenantOwnership({
          email: 'a@x.com',
          tenant: { ...owner, status: 'DISABLED' },
          command: 'seed:accounts',
        }),
      /requires an ACTIVE account/,
    );
  });

  it('a business that is not ACTIVE is refused even when the account is the OWNER', () => {
    assert.throws(
      () =>
        assertProductionTenantOwnership({
          email: 'a@x.com',
          tenant: { ...owner, businessStatus: 'SUSPENDED' },
          command: 'seed:accounts',
        }),
      /requires an ACTIVE business/,
    );
  });

  it('the demo seed and cleanup share the production OWNER rule', () => {
    for (const name of ['seed-demo-account.mjs', 'cleanup-demo-account.mjs']) {
      assert.match(read(name), /assertProductionTenantOwnership\(/, `${name} does not call the shared rule`);
    }
  });

  it('an optional id is only accepted when it names the tenant the account owns', () => {
    assert.equal(
      assertProductionTenantOwnership({ email: 'a@x.com', tenant: owner, command: 'seed:accounts' }),
      owner.businessId,
    );
    assert.throws(
      () =>
        assertProductionTenantOwnership({
          email: 'a@x.com',
          tenant: owner,
          requestedBusinessId: 'b'.repeat(24),
          command: 'seed:accounts',
        }),
      /names business b{24}, but this account owns a{24}/,
    );
  });

  it('two business associations are ambiguous and refused; one is returned', () => {
    assert.equal(
      assertOneBusinessAssociation({ email: 'a@x.com', businessIds: [owner.businessId, owner.businessId] }),
      owner.businessId,
    );
    assert.equal(assertOneBusinessAssociation({ email: 'a@x.com', businessIds: [] }), null);
    assert.throws(
      () => assertOneBusinessAssociation({ email: 'a@x.com', businessIds: [owner.businessId, 'b'.repeat(24)] }),
      /linked to 2 businesses/,
    );
  });

  it('the dry run and the write path resolve and validate through the same functions', () => {
    const source = read('seed-accounts.mjs');
    for (const call of [
      'readBusinessAssociations(',
      'assertOneBusinessAssociation(',
      'assertProductionTenantOwnership(',
    ]) {
      assert.ok(source.includes(call), `seed-accounts.mjs no longer calls ${call}`);
    }

    const preview = source.slice(
      source.indexOf('async function previewProductionTargets'),
      source.indexOf('async function main()'),
    );
    for (const call of [
      'readIdentity(',
      'resolveExistingTenantForIdentity(',
      'readBusinessAssociations(',
      'assertOneBusinessAssociation(',
      'assertProductionTenantOwnership(',
      'countTenantDataRemoval(',
    ]) {
      assert.ok(preview.includes(call), `the production preview no longer calls ${call}`);
    }
    assert.ok(
      !preview.includes('ensureTenantForIdentity('),
      'the production preview must not create a tenant',
    );

    // The real path must run that check BEFORE resolveIdentity, which can create a login when
    // DEMO_ACCOUNT_PASSWORD is set. A refused tenant check must not leave a new identity behind.
    const preflightIndex = source.lastIndexOf('await previewProductionTargets(plan, target.database)');
    const identityLoop = source.indexOf('resolveIdentity(entry.email');
    assert.ok(preflightIndex > -1, 'the real production path never runs the read-only preflight');
    assert.ok(
      identityLoop > preflightIndex,
      'the real run resolves (and can create) identities before checking the tenants',
    );
  });

  it('prints no production seeding hint — the result is the end of the output', () => {
    const source = read('check-accounts.mjs');
    assert.equal(
      source.includes('production (three phrases'),
      false,
      'the production hint block is still printed',
    );
    assert.equal(
      source.includes('SEED_PROD_CONFIRM'),
      false,
      'the production hint still prints its confirmation phrase',
    );
  });
});

describe('the cleanup removes data and never an account', () => {
  const source = read('cleanup-accounts.mjs');

  it('the phrases match the modes, and are distinct from each other', () => {
    assert.match(source, /const CONFIRM_PHRASE = 'cleanup-account-data'/);
    assert.match(source, /const PRESET_PHRASE = 'cleanup-three-accounts'/);
    assert.equal(packageJson.scripts['cleanup:account'], 'node scripts/cleanup-accounts.mjs');
    assert.equal(packageJson.scripts['cleanup:three'], 'node scripts/cleanup-accounts.mjs --preset=three');
  });

  it("the phrase families do not cross: a seeder's phrase is never a cleanup's", () => {
    const seedPhrases = ['seed-accounts', 'seed-three-accounts'];
    const cleanupPhrases = ['cleanup-account-data', 'cleanup-three-accounts'];
    for (const phrase of cleanupPhrases) assert.equal(seedPhrases.includes(phrase), false, phrase);
  });

  it('it empties tenant data through the shared teardown, and counts with its other half', () => {
    assert.match(source, /assertScopedCleanupTarget\(/);
    assert.match(source, /clearTenantData\(\[entry\.businessId\]\)/);
    assert.match(source, /countTenantDataRemoval\(\[user\.businessId\]\)/);
    // The preview walks the SAME plan the delete executes, so the numbers cannot drift.
    assert.ok(
      source.indexOf('countTenantDataRemoval(') < source.indexOf('clearTenantData(['),
      'the counting half no longer runs before the deleting half',
    );
  });

  it('it never removes a user, a business row, a session or a Firebase identity', () => {
    for (const forbidden of [
      'removeTenant(',
      'auth.deleteUser(',
      'auth.createUser(',
      'auth.updateUser(',
      'User.deleteOne(',
      'User.deleteMany(',
      'Business.deleteOne(',
      'Session.deleteMany(',
    ]) {
      assert.equal(source.includes(forbidden), false, `cleanup-accounts.mjs calls ${forbidden}`);
    }
    assert.match(source, /never deletes an identity/);
  });

  it('production resolves each address to its tenant, and a supplied id must be that tenant', () => {
    assert.match(source, /assertProductionTenantOwnership\(/);
    assert.match(source, /readBusinessAssociations\(/);
    assert.match(source, /assertOneBusinessAssociation\(/);
    // The tenant must be a live row, not a businessId that points at nothing or at a closed
    // business. The seeder gets this from its resolver; cleanup reads it directly.
    assert.match(source, /Business\.findById\(user\.businessId\)/);
    assert.match(source, /Refusing to empty a tenant that cannot be checked/);
    assert.match(source, /is \$\{business\.status\}, not ACTIVE/);
    assert.match(source, /const PRESET_ALIAS = 'cleanup:three'/);
    assert.match(source, /is refused in production/);
    // The older `address:businessId` form still works, and is compared with the row.
    assert.match(source, /belongs to business \$\{String\(user\.businessId\)\}, not/);
    assert.equal(
      /must name its tenant in production/.test(source),
      false,
      'cleanup still demands an id it can look up from the account',
    );
  });

  it('a verification failure is a failure, not a note', () => {
    assert.match(source, /remaining !== 0/);
    assert.match(source, /The removal is incomplete/);
  });
});

describe('the check answers questions and changes nothing', () => {
  const source = read('check-accounts.mjs');

  it('it is wired to one npm command and defaults to the three fixed accounts', () => {
    assert.equal(packageJson.scripts['check:accounts'], 'node scripts/check-accounts.mjs');
    assert.match(source, /COMPARISON_ACCOUNTS\.map\(\(account\) => account\.email\)/);
  });

  it('a READY line prints the tenant id the production demo seeder must name', () => {
    assert.match(source, /businessId: \$\{row\.businessId\}/);
  });

  it('it writes nothing to either store', () => {
    for (const forbidden of [
      'insertMany(',
      'updateOne(',
      'updateMany(',
      'deleteOne(',
      'deleteMany(',
      'findOneAndUpdate(',
      'clearTenantData(',
      'removeTenant(',
      'auth.createUser(',
      'auth.deleteUser(',
      'auth.updateUser(',
      'auth.revokeRefreshTokens(',
      'Business.create(',
      'User.create(',
    ]) {
      assert.equal(source.includes(forbidden), false, `check-accounts.mjs calls ${forbidden}`);
    }
    assert.match(source, /READ-ONLY — nothing is created, changed or deleted/);
  });

  const NAMES = {
    development: 'inventoryai_dev_db',
    test: 'inventoryai_test_db',
    production: 'inventoryai_prod_db',
  };

  it('one database per run: development by default, production INSTEAD when asked', () => {
    assert.deepEqual(databasesToCheck({ withProduction: false, databaseNames: NAMES }), [NAMES.development]);
    assert.deepEqual(databasesToCheck({ withProduction: true, databaseNames: NAMES }), [NAMES.production]);

    // The defect measured 2026-10-28: production was APPENDED to development, so the command
    // read both and a development row that did not exist failed a production check.
    assert.equal(
      databasesToCheck({ withProduction: true, databaseNames: NAMES }).includes(NAMES.development),
      false,
      'a production check must not read development',
    );
    assert.equal(
      databasesToCheck({ withProduction: false, databaseNames: NAMES }).includes(NAMES.production),
      false,
      'a development check must not read production',
    );

    // Never the test database, in either mode: `npm test` owns it and clears it.
    for (const withProduction of [false, true]) {
      assert.equal(
        databasesToCheck({ withProduction, databaseNames: NAMES }).includes(NAMES.test),
        false,
        'the test database was selected',
      );
    }
  });

  it('READY requires a usable identity, an ACTIVE account and an ACTIVE business', () => {
    const ready = {
      production: true,
      identity: { exists: true, uid: 'firebase-1', disabled: false, emailVerified: true },
      user: {
        firebaseUid: 'firebase-1',
        status: 'ACTIVE',
        role: 'OWNER',
        businessId: 'a'.repeat(24),
      },
      business: { status: 'ACTIVE', name: 'republic of gamers' },
    };

    assert.equal(accountReadiness(ready), 'READY');
    assert.equal(
      accountReadiness({ ...ready, user: { ...ready.user, role: 'STAFF' } }),
      'NOT OWNER',
    );
    assert.equal(
      accountReadiness({ ...ready, production: false, user: { ...ready.user, role: 'STAFF' } }),
      'READY',
      'development keeps its existing member convenience',
    );

    assert.equal(
      accountReadiness({ ...ready, identity: { ...ready.identity, exists: false } }),
      'NO IDENTITY',
      'a stored uid with no identity must not be READY',
    );
    assert.equal(
      accountReadiness({ ...ready, identity: { ...ready.identity, disabled: true } }),
      'IDENTITY DISABLED',
    );
    assert.equal(
      accountReadiness({ ...ready, identity: { ...ready.identity, emailVerified: false } }),
      'IDENTITY UNVERIFIED',
    );
    assert.equal(
      accountReadiness({ ...ready, user: { ...ready.user, status: 'DISABLED' } }),
      'USER INACTIVE',
    );
    assert.equal(
      accountReadiness({ ...ready, business: { ...ready.business, status: 'SUSPENDED' } }),
      'BUSINESS INACTIVE',
    );
    assert.equal(accountReadiness({ ...ready, business: null }), 'NO BUSINESS');
    assert.equal(
      accountReadiness({ ...ready, user: { ...ready.user, firebaseUid: undefined } }),
      'NOT LINKED',
    );
    assert.equal(
      accountReadiness({ ...ready, user: { ...ready.user, firebaseUid: 'old-uid' } }),
      'STALE LINK',
    );
  });

  it('the script uses the shared readiness decision, not a second copy of the rule', () => {
    assert.match(source, /accountReadiness\(/);
    for (const verdict of ['NO IDENTITY', 'IDENTITY DISABLED', 'IDENTITY UNVERIFIED', 'USER INACTIVE', 'BUSINESS INACTIVE']) {
      assert.match(source, new RegExp(`verdict === '${verdict}'`));
    }
  });

  it('the script uses the rule, and cannot be pointed at a database nobody chose', () => {
    assert.match(
      source,
      /const databases = databasesToCheck\(\{ withProduction, databaseNames: DATABASE_NAMES \}\);/,
    );
    assert.equal(
      /const databases = \[/.test(source),
      false,
      'the database list was rebuilt by hand, so selection and its test can drift',
    );
    assert.match(source, /--with-production/);
    // No `--database=` flag: the tool cannot be pointed at a database nobody named, which is
    // why it needs no phrase. Reading production without asking is what this prevents.
    assert.equal(
      /argValue\('--database'\)/.test(source),
      false,
      'check-accounts.mjs parses --database, so its target is no longer a fixed choice',
    );
  });

  it('a row missing in the other environment cannot fail the selected one', () => {
    // The exact shape of the reported failure: development holds no user rows, production is READY.
    const rows = {
      [NAMES.development]: [{ verdict: 'MISSING' }, { verdict: 'MISSING' }, { verdict: 'MISSING' }],
      [NAMES.production]: [{ verdict: 'READY' }, { verdict: 'READY' }, { verdict: 'READY' }],
    };

    const production = databasesToCheck({ withProduction: true, databaseNames: NAMES })
      .map((dbName) => ({ dbName, rows: rows[dbName] }));
    const summary = summariseReadiness(production);
    assert.deepEqual(summary, { pairs: 3, notReady: 0, ready: 3 });
    assert.equal(summary.notReady > 0 ? 1 : 0, 0, 'the production check must exit 0');

    // The same rows selected for development are counted there — the verdict follows the selection.
    const development = databasesToCheck({ withProduction: false, databaseNames: NAMES })
      .map((dbName) => ({ dbName, rows: rows[dbName] }));
    assert.deepEqual(summariseReadiness(development), { pairs: 3, notReady: 3, ready: 0 });
  });

  it('the readiness summary is the only counter, and it drives the exit code', () => {
    assert.match(source, /const \{ pairs, notReady, ready \} = summariseReadiness\(checked\);/);
    assert.match(source, /if \(notReady > 0\) \{/);
    assert.match(source, /process\.exit\(1\)/);
    assert.match(source, /process\.exit\(0\)/);
    assert.equal(
      /notReady \+= 1/.test(source),
      false,
      'a second counter inside the print loop can disagree with the summary that sets the exit code',
    );
  });

  it('it refuses to answer from the wrong project rather than reporting no identity', () => {
    // Pointed at another project it would report MISSING for accounts that exist — a wrong
    // answer, not a missing one. It stops instead, with the not-checked exit code.
    assert.match(source, /assertSeedFirebaseProject\(firebaseConfig\(\)\.projectId\)/);
    assert.match(source, /NOT CHECKED \(exit 2\)/);
  });

  it('exit codes are a contract: ready, not ready, not checked', () => {
    assert.match(source, /process\.exit\(0\)/);
    assert.match(source, /process\.exit\(1\)/);
    assert.match(source, /NOT CHECKED \(exit 2\)/);
  });
});

describe('a connection failure is reported as a failure, not as a partial write', () => {
  const read = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');

  it('names the database and says nothing changed, before the first write', () => {
    // Measured against production on 2026-10-28: the seed's whole report was
    // `connect ETIMEDOUT 159.143.174.111:27017`, and a cleanup dry run exited 1 after printing its
    // DRY RUN header — both readable as "something may have happened". Neither had.
    for (const [name, sentence] of [
      ['seed-accounts.mjs', 'No tenant data was written'],
      ['cleanup-accounts.mjs', 'No document was deleted'],
    ]) {
      const source = read(name);
      assert.match(
        source,
        /could not reach MongoDB for \$\{target\.database\}/,
        `${name} does not name the database a failed connection was for`,
      );
      assert.ok(source.includes(sentence), `${name} does not say that nothing changed`);
    }
  });
});

describe('the identity authority is pinned, not inherited from the shell', () => {
  it('the approved project is imported from the guard that owns it, never restated', () => {
    const source = read('seed/guard.mjs');
    assert.match(source, /import \{ APPROVED_TEST_FIREBASE_PROJECT_ID \} from '\.\.\/cleanup\/lib\.mjs'/);
    assert.match(source, /export const APPROVED_FIREBASE_PROJECT_ID = APPROVED_TEST_FIREBASE_PROJECT_ID;/);
    assert.equal(
      /inventoryai-d0d20/.test(source),
      false,
      'seed/guard.mjs restates the project id as a literal, so the two halves can drift',
    );
  });

  it('it accepts the approved project and refuses every other answer', () => {
    assert.equal(assertSeedFirebaseProject('inventoryai-d0d20'), 'inventoryai-d0d20');
    assert.equal(assertSeedFirebaseProject(APPROVED_FIREBASE_PROJECT_ID), APPROVED_FIREBASE_PROJECT_ID);
    for (const bad of ['', '   ', null, undefined, 'inventoryai-prod', 'inventoryai-d0d20x']) {
      assert.throws(() => assertSeedFirebaseProject(bad), SeedSafetyError, `accepted ${JSON.stringify(bad)}`);
    }
    // A neighbouring project id is the realistic mistake, and it is not a prefix match.
    assert.throws(() => assertSeedFirebaseProject('inventoryai-d0d20-staging'), /Nothing was written/);
  });

  it('the identity is checked before the first read of Firebase', () => {
    const source = read('seed/lib.mjs');
    const check = source.indexOf('assertSeedFirebaseProject(app.options?.projectId)');
    const firstRead = source.indexOf('auth.getUserByEmail(address)');
    assert.ok(check > -1, 'resolveIdentity no longer pins the Firebase project');
    assert.ok(firstRead > -1, 'resolveIdentity no longer reads the identity by address');
    assert.ok(check < firstRead, 'resolveIdentity reads Firebase before it checks which project it is');
  });
});
