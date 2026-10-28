// The two production-capable perf-tenant commands, on the same rule as every other
// seeder and cleanup.
//
// WHY THIS EXISTS. `seed:perf-tenant` and `cleanup:perf-tenant` were built before the
// three-phrase production rule and kept their own one-phrase guards. That made the
// disposable production tenant the CHEAPEST way to write or delete production rows —
// exactly the asymmetry the unified rule exists to remove. These tests pin the two
// commands to `assertSeedTarget` / `assertScopedCleanupTarget`, and pin the cleanup's
// `--dry-run` to a counting branch that runs before anything is removed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DATABASE_NAMES } from '../src/config/env.ts';
import {
  CLEANUP_CONFIRM_ENV,
  CLEANUP_DB_CONFIRM_ENV,
  CLEANUP_PROD_CONFIRM_ENV,
  CLEANUP_PROD_CONFIRM_PHRASE,
  assertScopedCleanupTarget,
} from '../scripts/cleanup/guard.mjs';
import {
  SEED_CONFIRM_ENV,
  SEED_DB_CONFIRM_ENV,
  SEED_PROD_CONFIRM_ENV,
  SEED_PROD_CONFIRM_PHRASE,
  assertSeedTarget,
} from '../scripts/seed/guard.mjs';
import {
  PERF_TENANT_CLEANUP_CONFIRM,
  PERF_TENANT_SEED_CONFIRM,
  seedTenantFingerprintProblem,
  seedTenantIdsFrom,
} from '../scripts/perf/lib.mjs';
import {
  TENANT_DATA_COLLECTIONS,
  TENANT_TEARDOWN_PLAN,
} from '../src/services/tenantTeardown.service.ts';

const read = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');
const readServer = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const envFor = (dbName) => ({
  mongodbUri: 'mongodb://example.invalid:27017',
  mongodbDbName: dbName,
});

const seedValues = (dbName, withProductionPhrase = true) => ({
  [SEED_CONFIRM_ENV]: PERF_TENANT_SEED_CONFIRM,
  [SEED_DB_CONFIRM_ENV]: dbName,
  ...(withProductionPhrase ? { [SEED_PROD_CONFIRM_ENV]: SEED_PROD_CONFIRM_PHRASE } : {}),
});

const cleanupValues = (dbName, withProductionPhrase = true) => ({
  [CLEANUP_CONFIRM_ENV]: PERF_TENANT_CLEANUP_CONFIRM,
  [CLEANUP_DB_CONFIRM_ENV]: dbName,
  ...(withProductionPhrase ? { [CLEANUP_PROD_CONFIRM_ENV]: CLEANUP_PROD_CONFIRM_PHRASE } : {}),
});

describe('perf tenant — the seed costs the same as every other production seed', () => {
  const seed = (dbName, withProductionPhrase = true, over = {}) =>
    assertSeedTarget({
      env: envFor(dbName),
      command: 'seed:perf-tenant',
      database: dbName,
      confirmPhrase: PERF_TENANT_SEED_CONFIRM,
      values: seedValues(dbName, withProductionPhrase),
      ...over,
    });

  it('accepts two phrases in development', () => {
    assert.deepEqual(seed(DATABASE_NAMES.development, false), {
      database: DATABASE_NAMES.development,
      production: false,
      phrases: 2,
    });
  });

  it('refuses production with only the two development phrases', () => {
    assert.throws(
      () => seed(DATABASE_NAMES.production, false),
      /three confirmation phrase\(s\).*SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA/,
    );
  });

  it('accepts production with all three phrases', () => {
    const result = seed(DATABASE_NAMES.production);
    assert.equal(result.production, true);
    assert.equal(result.phrases, 3);
  });

  it('refuses a database the run did not resolve, and the test database', () => {
    assert.throws(
      () => seed(DATABASE_NAMES.development, false, { database: DATABASE_NAMES.production }),
      /--database is "inventoryai_prod_db" but this process resolved "inventoryai_dev_db"/,
    );
    assert.throws(
      () =>
        assertSeedTarget({
          env: envFor(DATABASE_NAMES.test),
          command: 'seed:perf-tenant',
          database: DATABASE_NAMES.test,
          confirmPhrase: PERF_TENANT_SEED_CONFIRM,
          values: seedValues(DATABASE_NAMES.test, false),
        }),
      /test database/,
    );
  });
});

describe('perf tenant — the cleanup costs the same as every other production cleanup', () => {
  const cleanup = (dbName, withProductionPhrase = true, over = {}) =>
    assertScopedCleanupTarget({
      env: envFor(dbName),
      command: 'cleanup:perf-tenant',
      confirmPhrase: PERF_TENANT_CLEANUP_CONFIRM,
      database: dbName,
      values: cleanupValues(dbName, withProductionPhrase),
      ...over,
    });

  it('accepts two phrases in development', () => {
    assert.deepEqual(cleanup(DATABASE_NAMES.development, false), {
      database: DATABASE_NAMES.development,
      production: false,
      phrases: 2,
    });
  });

  it('refuses production with only the two development phrases', () => {
    assert.throws(
      () => cleanup(DATABASE_NAMES.production, false),
      /three confirmation phrase\(s\).*CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA/,
    );
  });

  it('accepts production with all three phrases', () => {
    const result = cleanup(DATABASE_NAMES.production);
    assert.equal(result.production, true);
    assert.equal(result.phrases, 3);
  });
});

describe('perf tenant — the scripts call the shared guards', () => {
  it('the seeder uses assertSeedTarget, not the old one-phrase guard', () => {
    const source = read('seed-perf-tenant.mjs');
    assert.match(source, /assertSeedTarget\(\{/);
    assert.equal(
      /assertNamedDatabaseTarget\(/.test(source),
      false,
      'seed:perf-tenant still calls the old one-phrase guard',
    );
  });

  it('the cleanup uses assertScopedCleanupTarget, not the old one-phrase guard', () => {
    const source = read('cleanup-perf-tenant.mjs');
    assert.match(source, /assertScopedCleanupTarget\(\{/);
    assert.equal(
      /assertNamedDatabaseTarget\(/.test(source),
      false,
      'cleanup:perf-tenant still calls the old one-phrase guard',
    );
  });
});

describe('perf tenant — the cleanup has a real dry run', () => {
  const source = read('cleanup-perf-tenant.mjs');

  it('recognises --dry-run and counts through the shared removal definition', () => {
    assert.match(source, /const dryRun = process\.argv\.includes\('--dry-run'\)/);
    assert.match(source, /countTenantRemoval\(/);
  });

  it('the dry-run branch runs before removeTenant', () => {
    const dryAt = source.indexOf('if (dryRun)');
    const removeAt = source.indexOf('await removeTenant(');
    assert.ok(dryAt > -1, 'the cleanup has no dry-run branch');
    assert.ok(removeAt > dryAt, 'the removal is reached before the dry-run branch');
  });
});

describe('perf tenant — the counting definition lives beside the removal', () => {
  it('countTenantRemoval is exported and re-exported for the scripts', () => {
    const service = readServer('src/services/tenantTeardown.service.ts');
    const perfLib = read('perf/lib.mjs');
    assert.match(service, /export async function countTenantRemoval\(/);
    assert.match(perfLib, /countTenantRemoval/);
  });
});

describe('perf tenant — one plan drives both the preview and the deletion', () => {
  it('the data half is every declared collection, with AI history first', () => {
    const data = TENANT_TEARDOWN_PLAN.filter((step) => step.scope === 'data').map((step) => step.name);
    assert.deepEqual(data, [
      'ai_messages',
      'ai_conversations',
      ...TENANT_DATA_COLLECTIONS.map(([name]) => name),
    ]);
  });

  it('the account half ends with the users and the business row', () => {
    const account = TENANT_TEARDOWN_PLAN.filter((step) => step.scope === 'account').map((step) => step.name);
    assert.deepEqual(account, [
      'sessions',
      'password_reset_tokens',
      'password_reset_challenges',
      'users',
      'businesses',
    ]);
  });

  it('every step is named once, so no plan can silently shadow another', () => {
    const names = TENANT_TEARDOWN_PLAN.map((step) => step.name);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('perf tenant — a fingerprint that only half matches is not the tenant', () => {
  it('requires the marker name and the owner address to agree', () => {
    // The old lookup UNIONED the two sets, so a real business carrying the marker name
    // was returned by a cleanup whose owner had nothing to do with it.
    const target = 'a'.repeat(24);
    const other = 'b'.repeat(24);
    assert.deepEqual(seedTenantIdsFrom({ nameBusinessIds: [target], ownerBusinessIds: [target] }), [target]);
    assert.deepEqual(seedTenantIdsFrom({ nameBusinessIds: [target], ownerBusinessIds: [other] }), []);
    assert.deepEqual(seedTenantIdsFrom({ nameBusinessIds: [target], ownerBusinessIds: [] }), []);
    assert.deepEqual(seedTenantIdsFrom({ nameBusinessIds: [target, other], ownerBusinessIds: [other] }), [other]);
  });

  it('a half-state is named and refused, never treated as “nothing to clean”', () => {
    const target = 'a'.repeat(24);
    const other = 'b'.repeat(24);
    assert.equal(seedTenantFingerprintProblem({}), null);
    assert.match(
      seedTenantFingerprintProblem({ nameBusinessIds: [target], ownerBusinessIds: [other] }),
      /half-state/,
    );
    assert.match(
      seedTenantFingerprintProblem({ nameBusinessIds: [target], ownerBusinessIds: [] }),
      /half-state/,
    );
    assert.equal(
      seedTenantFingerprintProblem({ nameBusinessIds: [target, other], ownerBusinessIds: [target] }),
      null,
      'a name-only candidate is not part of a half-state when one real match exists',
    );
    assert.equal(
      seedTenantFingerprintProblem({ nameBusinessIds: [target], ownerBusinessIds: [target] }),
      null,
    );
  });

  it('both perf cleanups and the perf seeder use the refusing lookup', () => {
    for (const name of ['cleanup-perf-data.mjs', 'cleanup-perf-tenant.mjs', 'seed-perf-data.mjs']) {
      assert.match(read(name), /findSeedTenantIds\(/, `${name} does not resolve the seed tenant`);
    }
  });

  it('seed:perf-tenant resolves the existing user before creating a business', () => {
    // The old order created a business and then refused because the user belonged to a
    // different one, leaving an empty business behind on every such refusal.
    const source = read('seed-perf-tenant.mjs');
    const user = source.indexOf("let user = await User.findOne({ email: SEED_OWNER_EMAIL })");
    const create = source.indexOf("const business = await Business.create({ name: SEED_BUSINESS_NAME");
    assert.ok(user > -1, 'the user lookup is gone');
    assert.ok(create > -1, 'the business creation is gone');
    assert.ok(user < create, 'a business can be created before the existing user is checked');
  });

  it('the perf seeders parse sizes and seeds strictly', () => {
    for (const name of ['seed-perf-data.mjs', 'seed-perf-tenant.mjs']) {
      const source = read(name);
      assert.match(source, /parseCount\(argValue\('--size'\)/, `${name} does not use the strict size parser`);
      assert.match(source, /parseCount\(argValue\('--seed'\)/, `${name} does not use the strict seed parser`);
      assert.equal(
        /Number\.parseInt\(\s*argValue\('--(size|seed)'\)/.test(source),
        false,
        `${name} still parses with parseInt`,
      );
    }
  });
});

describe('perf tenant — the guides show the same three phrases', () => {
  // Since 2026-10-27 the data commands have one guide per half and per environment: Guide 9 seeds
  // development, Guide 10 seeds production, Guide 11 deletes development and Guide 12 deletes
  // production. The production examples are pinned where they live. Each section is BOUNDED
  // (heading to the next heading) rather than running to the end of the file, so a phrase that
  // survives elsewhere in the same guide cannot make this pass for the wrong reason.
  const guideSection = (file, from, to) => {
    const text = readFileSync(new URL(`../../docs/guides/${file}`, import.meta.url), 'utf8');
    const start = text.indexOf(from);
    const end = text.indexOf(to);
    return start === -1 || end === -1 || end < start ? '' : text.slice(start, end);
  };

  const seedSection = guideSection(
    '10-seeding-production.md',
    '### The measurement tenant (`seed:perf-tenant`)',
    '### The fixed-figure demo tenant',
  );
  const cleanupSection = guideSection(
    '12-deleting-production.md',
    '## The measurement tenant (`cleanup:perf-tenant`)',
    '## The space a delete does not give back',
  );

  it('both sections this test reads still exist', () => {
    assert.ok(seedSection.length > 400, 'Guide 10 no longer has the seed:perf-tenant section this test pins');
    assert.ok(cleanupSection.length > 400, 'Guide 12 no longer has the perf-tenant cleanup example');
  });

  it('the seed example names the database and the production phrase', () => {
    assert.match(seedSection, /SEED_DB_CONFIRM=inventoryai_prod_db/);
    assert.match(seedSection, /SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA/);
  });

  it('the cleanup example names the database, the production phrase, and the dry run', () => {
    assert.match(cleanupSection, /npm run cleanup:perf-tenant/);
    assert.match(cleanupSection, /CLEANUP_DB_CONFIRM=inventoryai_prod_db/);
    assert.match(cleanupSection, /CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA/);
    assert.match(cleanupSection, /--dry-run/);
  });
});
