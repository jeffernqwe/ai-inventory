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

describe('perf tenant — the guides show the same three phrases', () => {
  // Guide 9 owns every seeding command and Guide 10 every cleanup, so each example is pinned in
  // the guide that owns it. Each section is BOUNDED (heading to the next heading) rather than
  // running to the end of the file, so a phrase that survives elsewhere in the same guide cannot
  // make this pass for the wrong reason.
  const guideSection = (file, from, to) => {
    const text = readFileSync(new URL(`../../docs/guides/${file}`, import.meta.url), 'utf8');
    const start = text.indexOf(from);
    const end = text.indexOf(to);
    return start === -1 || end === -1 || end < start ? '' : text.slice(start, end);
  };

  const seedSection = guideSection(
    '9-seeding-data.md',
    '### The sign-in-able measurement tenant',
    '## The two tools on their own guards',
  );
  const cleanupSection = guideSection(
    '10-deleting-data.md',
    '## The tenant-scoped cleanups',
    '## Order: database first, identities second',
  );

  it('both sections this test reads still exist', () => {
    assert.ok(seedSection.length > 400, 'Guide 9 no longer has the seed:perf-tenant section this test pins');
    assert.ok(cleanupSection.length > 400, 'Guide 10 no longer has the perf-tenant cleanup example');
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
