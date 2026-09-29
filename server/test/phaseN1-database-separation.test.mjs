// MongoDB environment separation (N-1) — DB-FREE guard suite.
//
// The separation itself is one idea: every connection names its database, and
// the name is resolved by config/env.ts from the environment rather than read
// from the path segment of MONGODB_URI. One shared Atlas cluster and one shared
// connection string therefore serve three environments without any of them
// sharing data.
//
// This file pins the rules that idea depends on, and it touches no database:
//   * development, test and production each resolve to their own database;
//   * a TEST run always resolves to the test database, whatever else is
//     configured — the property that stops a test run reaching real data;
//   * the two combinations that would put data somewhere an environment cannot
//     legitimately reach are refused outright;
//   * the legacy shared database can never be resolved to;
//   * the resolution is actually WIRED — the live process resolves to the test
//     database, and config/db.ts hands the resolved name to mongoose.connect.
//
// Only the last item is structural; the rest exercise the pure resolver. The
// behavioural half of the guarantee lives in test/helpers.mjs, which refuses to
// run DB-backed suites against anything but the test database by inspecting the
// live connection, so every DB-backed suite in the run re-proves the outcome.

import 'dotenv/config';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import env, { DATABASE_NAMES, resolveDatabaseName, MONGODB_DB_NAME_ENV } from '../src/config/env.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(testDir, '..');
const readServerFile = (relative) => readFileSync(path.join(serverRoot, relative), 'utf8');

/** The pre-separation shared database. Nothing may resolve back to it. */
const LEGACY_SHARED_DATABASE = 'inventory_ai';

describe('N-1 database name resolution', () => {
  it('development resolves to the development database', () => {
    assert.equal(resolveDatabaseName({ nodeEnv: 'development' }), DATABASE_NAMES.development);
  });

  it('an unset or empty NODE_ENV resolves to the development database', () => {
    assert.equal(resolveDatabaseName({ nodeEnv: undefined }), DATABASE_NAMES.development);
    assert.equal(resolveDatabaseName({ nodeEnv: '' }), DATABASE_NAMES.development);
    assert.equal(resolveDatabaseName({}), DATABASE_NAMES.development);
  });

  it('production resolves to the production database', () => {
    assert.equal(resolveDatabaseName({ nodeEnv: 'production' }), DATABASE_NAMES.production);
  });

  it('the environment is compared case-insensitively', () => {
    assert.equal(resolveDatabaseName({ nodeEnv: 'PRODUCTION' }), DATABASE_NAMES.production);
    assert.equal(resolveDatabaseName({ nodeEnv: 'Test' }), DATABASE_NAMES.test);
  });

  it('the three environments are three distinct databases, none of them the legacy one', () => {
    const names = Object.values(DATABASE_NAMES);
    assert.equal(new Set(names).size, 3, 'each environment must have its own database');
    for (const name of names) {
      assert.notEqual(name, LEGACY_SHARED_DATABASE, `${name} must not be the legacy shared database`);
    }
  });

  it('every resolution is one of the three named databases or an explicit override — never the legacy shared one', () => {
    const resolved = [
      resolveDatabaseName({ nodeEnv: 'development' }),
      resolveDatabaseName({ nodeEnv: 'production' }),
      resolveDatabaseName({ nodeEnv: 'development', testMode: 'full' }),
      // An explicit override is what lets a staging deployment pick a database of
      // its own; the point of this case is that no DEFAULT reaches the legacy name.
      resolveDatabaseName({ nodeEnv: 'development', explicitName: 'inventoryai_staging_db' }),
    ];
    for (const name of resolved) {
      assert.notEqual(name, LEGACY_SHARED_DATABASE);
    }
  });

  it('an explicit MONGODB_DB_NAME overrides the environment default outside production', () => {
    assert.equal(
      resolveDatabaseName({ nodeEnv: 'development', explicitName: 'inventoryai_staging_db' }),
      'inventoryai_staging_db'
    );
  });

  it('an explicit MONGODB_DB_NAME is honoured in production when it is not a development/test database', () => {
    assert.equal(
      resolveDatabaseName({ nodeEnv: 'production', explicitName: 'inventoryai_prod_db_2' }),
      'inventoryai_prod_db_2'
    );
  });

  it('trims surrounding whitespace from the override', () => {
    assert.equal(
      resolveDatabaseName({ nodeEnv: 'development', explicitName: '  inventoryai_staging_db  ' }),
      'inventoryai_staging_db'
    );
  });

  it('treats a blank override as absent', () => {
    assert.equal(resolveDatabaseName({ nodeEnv: 'development', explicitName: '   ' }), DATABASE_NAMES.development);
    assert.equal(resolveDatabaseName({ nodeEnv: 'production', explicitName: '' }), DATABASE_NAMES.production);
  });
});

describe('N-1 test runs are fail-closed', () => {
  it('a test run resolves to the test database with nothing else configured', () => {
    assert.equal(resolveDatabaseName({ nodeEnv: 'development', testMode: 'full' }), DATABASE_NAMES.test);
    assert.equal(resolveDatabaseName({ nodeEnv: 'development', testMode: 'unit' }), DATABASE_NAMES.test);
    assert.equal(resolveDatabaseName({ nodeEnv: 'development', testMode: 'db' }), DATABASE_NAMES.test);
  });

  it('ANY non-empty TEST_MODE forces the test database, including an unrecognised value', () => {
    // The runner validates the mode before it sets TEST_MODE, but a stray value in
    // a shell or a CI job must not mean "not a test run" — that is exactly the
    // accident that would point a suite at the development database.
    for (const testMode of ['full', 'unit', 'db', 'nonsense', '1', ' true ']) {
      assert.equal(
        resolveDatabaseName({ nodeEnv: 'development', testMode }),
        DATABASE_NAMES.test,
        `TEST_MODE="${testMode}" must still resolve to the test database`
      );
    }
  });

  it('NODE_ENV=test alone is enough to select the test database', () => {
    assert.equal(resolveDatabaseName({ nodeEnv: 'test', testMode: undefined }), DATABASE_NAMES.test);
  });

  it('a test run ignores an override that names the development database', () => {
    assert.equal(
      resolveDatabaseName({ nodeEnv: 'development', testMode: 'db', explicitName: DATABASE_NAMES.development }),
      DATABASE_NAMES.test
    );
  });

  it('a test run ignores an override that names the production database', () => {
    assert.equal(
      resolveDatabaseName({ nodeEnv: 'development', testMode: 'db', explicitName: DATABASE_NAMES.production }),
      DATABASE_NAMES.test
    );
  });

  it('refuses a test run inside a production-flagged process', () => {
    assert.throws(
      () => resolveDatabaseName({ nodeEnv: 'production', testMode: 'full' }),
      /TEST_MODE is set in a production-flagged process/
    );
  });
});

describe('N-1 cross-environment safety rules', () => {
  it('refuses production naming the development database', () => {
    assert.throws(
      () => resolveDatabaseName({ nodeEnv: 'production', explicitName: DATABASE_NAMES.development }),
      /must not use the development or test database/
    );
  });

  it('refuses production naming the test database', () => {
    assert.throws(
      () => resolveDatabaseName({ nodeEnv: 'production', explicitName: DATABASE_NAMES.test }),
      /must not use the development or test database/
    );
  });

  it('refuses a non-production environment naming the production database', () => {
    assert.throws(
      () => resolveDatabaseName({ nodeEnv: 'development', explicitName: DATABASE_NAMES.production }),
      /Only a production process may use it/
    );
    assert.throws(
      () => resolveDatabaseName({ nodeEnv: 'staging', explicitName: DATABASE_NAMES.production }),
      /Only a production process may use it/
    );
  });

  it('a name that merely resembles a protected database is not treated as one', () => {
    // Database names are case-sensitive and exact. `inventoryai_prod_db_2` is a
    // different database, so it is a legitimate explicit override in development
    // and must not be refused as if it were the production database.
    assert.equal(
      resolveDatabaseName({ nodeEnv: 'development', explicitName: `${DATABASE_NAMES.production}_2` }),
      `${DATABASE_NAMES.production}_2`
    );
  });

  it('refusal messages name the variable but never a connection string', () => {
    const messages = [];
    for (const args of [
      { nodeEnv: 'production', testMode: 'full' },
      { nodeEnv: 'production', explicitName: DATABASE_NAMES.development },
      { nodeEnv: 'development', explicitName: DATABASE_NAMES.production },
    ]) {
      try {
        resolveDatabaseName(args);
        assert.fail('expected the resolution to be refused');
      } catch (err) {
        messages.push(err.message);
      }
    }
    assert.equal(messages.length, 3);
    for (const message of messages) {
      assert.ok(!/mongodb(\+srv)?:\/\//i.test(message), 'a refusal must never carry a connection string');
      assert.ok(/Refusing to configure the database/.test(message));
    }
  });
});

describe('N-1 the running process is actually separated', () => {
  it('this test process resolved to the test database', () => {
    // The runner sets TEST_MODE for every mode this suite is registered in, so
    // the live resolution is the test database — the wiring, not just the rule.
    assert.ok(
      String(process.env.TEST_MODE || '').trim() !== '',
      'expected the project test runner to set TEST_MODE'
    );
    assert.equal(env.mongodbDbName, DATABASE_NAMES.test);
  });

  it('the resolved name is the one handed to mongoose.connect', () => {
    // Structural guard: the resolution is worthless if the connection ignores it
    // and keeps using the URI's path segment, which is how development and
    // production came to share one database.
    const source = readServerFile(path.join('src', 'config', 'db.ts'));
    assert.match(
      source,
      /dbName:\s*env\.mongodbDbName/,
      'config/db.ts must pass the resolved database name to mongoose.connect'
    );
    assert.match(
      source,
      /export function getDatabaseName\(/,
      'config/db.ts must expose the effective database name for verification'
    );
  });

  it('the resolved name is never the connection string', () => {
    assert.ok(!env.mongodbDbName.includes('://'), 'a database name must never be a URI');
    assert.ok(!env.mongodbDbName.includes('@'), 'a database name must never carry credentials');
  });

  it('.env.example documents the override and the three databases', () => {
    const example = readServerFile('.env.example');
    assert.ok(example.includes(MONGODB_DB_NAME_ENV), `.env.example must document ${MONGODB_DB_NAME_ENV}`);
    for (const name of Object.values(DATABASE_NAMES)) {
      assert.ok(example.includes(name), `.env.example must name the ${name} database`);
    }
  });
});
