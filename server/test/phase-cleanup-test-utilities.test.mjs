// Development/test cleanup utilities — DB-FREE guard suite.
//
// These utilities delete data, so their safety rules are the whole point and they
// are tested WITHOUT a database: every guard is a pure function, and the guarded
// sequence runs against in-memory fake ports. The destructive half is therefore
// exercised end-to-end while touching no real resource.
//
// The properties pinned here, in the order the owner asked for them:
//   * production environment is rejected;
//   * a wrong MongoDB database is rejected;
//   * a mismatched configured-vs-live MongoDB database is rejected;
//   * a missing/unknown Firebase project is rejected;
//   * a production Firebase project is rejected;
//   * the successful cleanup path works and post-cleanup verification runs;
//   * NO destructive call happens when any guard fails.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_MONGODB_CLEANUP_TARGETS,
  APPROVED_TEST_DATABASE,
  APPROVED_TEST_FIREBASE_PROJECT_ID,
  CleanupSafetyError,
  MONGODB_CLEANUP_TARGETS,
  PRODUCTION_CONFIRM_PHRASE,
  assertConfirmation,
  assertFirebaseProject,
  assertLiveTarget,
  assertNonProductionEnv,
  assertProductionConfirmation,
  assertTargetAllowed,
  assertTargetDatabase,
  classifyFirebaseAddress,
  confirmationPhraseFor,
  isProductionEnv,
  isProductionTarget,
  looksProduction,
  resolveMongodbTarget,
} from '../scripts/cleanup/lib.mjs';
import {
  CleanupIncompleteError,
  deleteAllFirebaseUsers,
  performFirebaseCleanup,
  performMongoCleanup,
  performMongodbTargetsCleanup,
} from '../scripts/cleanup/run.mjs';

// ---------------------------------------------------------------------------
// A fake Mongo that records every call, so a refused run can be proved inert.
// ---------------------------------------------------------------------------
function fakeMongo({ collections = { a: 3, b: 0, c: 5 }, indexesOk = true } = {}) {
  const data = new Map(Object.entries(collections).map(([k, v]) => [k, [...Array(v)]]));
  const calls = { list: 0, count: 0, del: 0, indexes: 0, deleted: {} };
  return {
    calls,
    data,
    ports: {
      listCollectionNames: async () => {
        calls.list += 1;
        return [...data.keys()];
      },
      countDocuments: async (name) => {
        calls.count += 1;
        return (data.get(name) ?? []).length;
      },
      deleteMany: async (name) => {
        calls.del += 1;
        const n = (data.get(name) ?? []).length;
        calls.deleted[name] = (calls.deleted[name] ?? 0) + n;
        data.set(name, []);
        return n;
      },
      listIndexes: async () => {
        calls.indexes += 1;
        return indexesOk ? [{ name: '_id_' }] : [];
      },
    },
  };
}

function fakeFirebase({ uids = ['u1', 'u2', 'u3'], failDeletes = false } = {}) {
  let current = [...uids];
  const calls = { list: 0, del: 0 };
  return {
    calls,
    get current() {
      return current;
    },
    ports: {
      listUserIds: async () => {
        calls.list += 1;
        return [...current];
      },
      deleteUsers: async (batch) => {
        calls.del += 1;
        if (failDeletes) {
          return { successCount: 0, failureCount: batch.length, errors: [] };
        }
        current = current.filter((u) => !batch.includes(u));
        return { successCount: batch.length, failureCount: 0, errors: [] };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Production environment rejection
// ---------------------------------------------------------------------------
describe('cleanup utilities — production environment is rejected', () => {
  it('isProductionEnv recognises production spellings case-insensitively', () => {
    for (const v of ['production', 'PRODUCTION', 'Production', ' prod ', 'prod']) {
      assert.equal(isProductionEnv(v), true, `${JSON.stringify(v)} must read as production`);
    }
    for (const v of ['development', 'dev', '', undefined, null, 'staging']) {
      assert.equal(isProductionEnv(v), false, `${JSON.stringify(v)} must not read as production`);
    }
  });

  it('assertNonProductionEnv refuses production', () => {
    for (const v of ['production', 'PRODUCTION', 'prod']) {
      assert.throws(() => assertNonProductionEnv(v), CleanupSafetyError);
    }
  });

  it('assertNonProductionEnv refuses an unset/blank NODE_ENV as uncertain', () => {
    assert.throws(() => assertNonProductionEnv(undefined), /NODE_ENV is not set/);
    assert.throws(() => assertNonProductionEnv(''), /NODE_ENV is not set/);
    assert.throws(() => assertNonProductionEnv('   '), /NODE_ENV is not set/);
  });

  it('assertNonProductionEnv refuses an unrecognised value rather than assuming it is safe', () => {
    assert.throws(() => assertNonProductionEnv('staging'), /not an approved cleanup environment/);
  });

  it('assertNonProductionEnv accepts the approved development value', () => {
    assert.equal(assertNonProductionEnv('development'), 'development');
    assert.equal(assertNonProductionEnv(' DEVELOPMENT '), 'development');
  });
});

// ---------------------------------------------------------------------------
// 2. Wrong MongoDB database rejection
// ---------------------------------------------------------------------------
describe('cleanup utilities — wrong MongoDB database is rejected', () => {
  it('assertTargetDatabase refuses any name other than the approved one', () => {
    for (const name of ['inventoryai_dev_db', 'inventoryai_prod_db', 'inventory_ai', 'other']) {
      assert.throws(
        () => assertTargetDatabase({ configuredName: name, liveName: name }),
        CleanupSafetyError,
        `${name} must be refused`
      );
    }
  });

  it('assertTargetDatabase accepts only the exact approved name', () => {
    assert.equal(
      assertTargetDatabase({ configuredName: APPROVED_TEST_DATABASE, liveName: APPROVED_TEST_DATABASE }),
      APPROVED_TEST_DATABASE
    );
  });

  it('the approved database is not a production-looking name', () => {
    assert.equal(looksProduction(APPROVED_TEST_DATABASE), false);
  });
});

// ---------------------------------------------------------------------------
// 3. Configured-vs-live mismatch rejection
// ---------------------------------------------------------------------------
describe('cleanup utilities — configured/live database mismatch is rejected', () => {
  it('refuses when the configured name matches but the live connection does not', () => {
    assert.throws(
      () => assertTargetDatabase({ configuredName: APPROVED_TEST_DATABASE, liveName: 'inventoryai_dev_db' }),
      /live connection says "inventoryai_dev_db"/
    );
  });

  it('refuses when the live name matches but the configured name does not', () => {
    assert.throws(
      () => assertTargetDatabase({ configuredName: 'inventoryai_prod_db', liveName: APPROVED_TEST_DATABASE }),
      CleanupSafetyError
    );
  });

  it('refuses a blank configured or live name as unverifiable', () => {
    assert.throws(() => assertTargetDatabase({ configuredName: '', liveName: APPROVED_TEST_DATABASE }), /could not be resolved/);
    assert.throws(() => assertTargetDatabase({ configuredName: APPROVED_TEST_DATABASE, liveName: '' }), /has not been established/);
  });

  it('treats a near-miss as a mismatch (names are exact)', () => {
    assert.throws(
      () => assertTargetDatabase({ configuredName: `${APPROVED_TEST_DATABASE} `, liveName: `${APPROVED_TEST_DATABASE}_2` }),
      CleanupSafetyError
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Missing / unknown Firebase project rejection
// ---------------------------------------------------------------------------
describe('cleanup utilities — missing/unknown Firebase project is rejected', () => {
  it('refuses a missing or blank project id', () => {
    for (const v of [undefined, null, '', '   ']) {
      assert.throws(() => assertFirebaseProject(v), /missing or empty/);
    }
  });

  it('refuses any project other than the approved one', () => {
    assert.throws(() => assertFirebaseProject('some-other-project'), /must be exactly/);
  });

  it('accepts the exact approved project id', () => {
    assert.equal(assertFirebaseProject(APPROVED_TEST_FIREBASE_PROJECT_ID), APPROVED_TEST_FIREBASE_PROJECT_ID);
  });
});

// ---------------------------------------------------------------------------
// 5. Production Firebase project rejection
// ---------------------------------------------------------------------------
describe('cleanup utilities — production-looking Firebase project is rejected', () => {
  it('looksProduction flags production markers', () => {
    for (const v of ['my-prod-app', 'inventory-production', 'acme-live', 'PROD']) {
      assert.equal(looksProduction(v), true, `${v} must look production`);
    }
  });

  it('refuses a production-looking project even if it were the approved name pattern', () => {
    assert.throws(() => assertFirebaseProject('inventoryai-prod-d0d20'), /looks like a production project/);
  });

  it('the approved project id is not production-looking', () => {
    assert.equal(looksProduction(APPROVED_TEST_FIREBASE_PROJECT_ID), false);
  });
});

// ---------------------------------------------------------------------------
// 6. Confirmation phrase
// ---------------------------------------------------------------------------
describe('cleanup utilities — confirmation phrase', () => {
  it('refuses a wrong or empty phrase', () => {
    assert.throws(() => assertConfirmation('', 'cleanup:test-mongodb'), /did not match/);
    assert.throws(() => assertConfirmation('yes', 'cleanup:test-mongodb'), /did not match/);
    assert.throws(() => assertConfirmation(undefined, 'cleanup:test-firebase'), /did not match/);
  });

  it('accepts the exact phrase', () => {
    assert.equal(assertConfirmation('cleanup:test-mongodb', 'cleanup:test-mongodb'), true);
    assert.equal(assertConfirmation(' cleanup:test-firebase ', 'cleanup:test-firebase'), true);
  });

  it('exposes a stable phrase per command', () => {
    assert.equal(confirmationPhraseFor('cleanup:test-mongodb'), 'cleanup:test-mongodb');
    assert.equal(confirmationPhraseFor('cleanup:test-firebase'), 'cleanup:test-firebase');
  });
});

// ---------------------------------------------------------------------------
// 7. Successful cleanup + post-cleanup verification
// ---------------------------------------------------------------------------
describe('cleanup utilities — successful cleanup path', () => {
  it('clears every collection and reports before/deleted/after', async () => {
    const mongo = fakeMongo({ collections: { a: 3, b: 0, c: 5 } });
    const report = await performMongoCleanup({
      nodeEnv: 'development',
      configuredName: APPROVED_TEST_DATABASE,
      liveName: APPROVED_TEST_DATABASE,
      confirmPhrase: 'cleanup:test-mongodb',
      providedConfirm: 'cleanup:test-mongodb',
      ports: mongo.ports,
    });

    assert.equal(report.collections, 3);
    assert.equal(report.totalBefore, 8);
    assert.equal(report.totalDeleted, 8);
    assert.equal(report.totalAfter, 0);
    assert.deepEqual(report.after, { a: 0, b: 0, c: 0 });
    // every collection was visited, none silently skipped
    assert.equal(Object.keys(mongo.calls.deleted).length, 3);
  });

  it('deletes every Firebase user and verifies zero remain', async () => {
    const fb = fakeFirebase({ uids: ['u1', 'u2', 'u3', 'u4'] });
    const report = await performFirebaseCleanup({
      nodeEnv: 'development',
      projectId: APPROVED_TEST_FIREBASE_PROJECT_ID,
      confirmPhrase: 'cleanup:test-firebase',
      providedConfirm: 'cleanup:test-firebase',
      ports: fb.ports,
    });

    assert.equal(report.before, 4);
    assert.equal(report.deleted, 4);
    assert.equal(report.failures, 0);
    assert.equal(report.after, 0);
    assert.deepEqual(fb.current, []);
  });

  it('batches deletions but still verifies the whole set', async () => {
    const fb = fakeFirebase({ uids: Array.from({ length: 25 }, (_, i) => `u${i}`) });
    const report = await deleteAllFirebaseUsers({ ...fb.ports, batchSize: 10 });
    assert.equal(report.before, 25);
    assert.equal(report.deleted, 25);
    assert.equal(report.after, 0);
    assert.equal(fb.calls.del, 3, 'expected ceil(25/10) batches');
  });

  it('fails loudly when a collection is not empty after cleanup', async () => {
    const ports = {
      listCollectionNames: async () => ['a'],
      countDocuments: async () => 1, // never drops to zero
      deleteMany: async () => 1,
      listIndexes: async () => [{ name: '_id_' }],
    };
    await assert.rejects(
      () => performMongoCleanup({
        nodeEnv: 'development',
        configuredName: APPROVED_TEST_DATABASE,
        liveName: APPROVED_TEST_DATABASE,
        confirmPhrase: 'cleanup:test-mongodb',
        providedConfirm: 'cleanup:test-mongodb',
        ports,
      }),
      CleanupIncompleteError
    );
  });

  it('fails loudly when indexes were not preserved', async () => {
    const mongo = fakeMongo({ indexesOk: false });
    await assert.rejects(
      () => performMongoCleanup({
        nodeEnv: 'development',
        configuredName: APPROVED_TEST_DATABASE,
        liveName: APPROVED_TEST_DATABASE,
        confirmPhrase: 'cleanup:test-mongodb',
        providedConfirm: 'cleanup:test-mongodb',
        ports: mongo.ports,
      }),
      /structure was not preserved/
    );
  });

  it('fails loudly when Firebase deletions fail and users remain', async () => {
    const fb = fakeFirebase({ uids: ['u1', 'u2'], failDeletes: true });
    await assert.rejects(
      () => performFirebaseCleanup({
        nodeEnv: 'development',
        projectId: APPROVED_TEST_FIREBASE_PROJECT_ID,
        confirmPhrase: 'cleanup:test-firebase',
        providedConfirm: 'cleanup:test-firebase',
        ports: fb.ports,
      }),
      /cleanup incomplete/
    );
  });
});

// ---------------------------------------------------------------------------
// 8. No destructive operation when a guard fails
// ---------------------------------------------------------------------------
describe('cleanup utilities — a failed guard performs NO destructive call', () => {
  const baseMongo = () => ({
    nodeEnv: 'development',
    configuredName: APPROVED_TEST_DATABASE,
    liveName: APPROVED_TEST_DATABASE,
    confirmPhrase: 'cleanup:test-mongodb',
    providedConfirm: 'cleanup:test-mongodb',
  });

  it('production environment: no port is touched', async () => {
    const mongo = fakeMongo();
    await assert.rejects(
      () => performMongoCleanup({ ...baseMongo(), nodeEnv: 'production', ports: mongo.ports }),
      CleanupSafetyError
    );
    assert.equal(mongo.calls.del, 0);
    assert.equal(mongo.calls.count, 0);
    assert.equal(mongo.calls.list, 0);
  });

  it('wrong database: no port is touched', async () => {
    const mongo = fakeMongo();
    await assert.rejects(
      () => performMongoCleanup({ ...baseMongo(), configuredName: 'inventoryai_dev_db', liveName: 'inventoryai_dev_db', ports: mongo.ports }),
      CleanupSafetyError
    );
    assert.equal(mongo.calls.del, 0);
  });

  it('configured/live mismatch: no port is touched', async () => {
    const mongo = fakeMongo();
    await assert.rejects(
      () => performMongoCleanup({ ...baseMongo(), liveName: 'inventoryai_prod_db', ports: mongo.ports }),
      CleanupSafetyError
    );
    assert.equal(mongo.calls.del, 0);
  });

  it('wrong confirmation phrase: no port is touched', async () => {
    const mongo = fakeMongo();
    await assert.rejects(
      () => performMongoCleanup({ ...baseMongo(), providedConfirm: 'nope', ports: mongo.ports }),
      CleanupSafetyError
    );
    assert.equal(mongo.calls.del, 0);
  });

  it('Firebase production environment: no port is touched', async () => {
    const fb = fakeFirebase();
    await assert.rejects(
      () => performFirebaseCleanup({
        nodeEnv: 'production',
        projectId: APPROVED_TEST_FIREBASE_PROJECT_ID,
        confirmPhrase: 'cleanup:test-firebase',
        providedConfirm: 'cleanup:test-firebase',
        ports: fb.ports,
      }),
      CleanupSafetyError
    );
    assert.equal(fb.calls.del, 0);
    assert.equal(fb.calls.list, 0);
  });

  it('Firebase wrong/unknown project: no port is touched', async () => {
    const fb = fakeFirebase();
    await assert.rejects(
      () => performFirebaseCleanup({
        nodeEnv: 'development',
        projectId: 'someone-elses-project',
        confirmPhrase: 'cleanup:test-firebase',
        providedConfirm: 'cleanup:test-firebase',
        ports: fb.ports,
      }),
      CleanupSafetyError
    );
    assert.equal(fb.calls.del, 0);
  });

  it('Firebase production-looking project: no port is touched', async () => {
    const fb = fakeFirebase();
    await assert.rejects(
      () => performFirebaseCleanup({
        nodeEnv: 'development',
        projectId: 'inventoryai-prod',
        confirmPhrase: 'cleanup:test-firebase',
        providedConfirm: 'cleanup:test-firebase',
        ports: fb.ports,
      }),
      CleanupSafetyError
    );
    assert.equal(fb.calls.del, 0);
  });

  it('Firebase missing project: no port is touched', async () => {
    const fb = fakeFirebase();
    await assert.rejects(
      () => performFirebaseCleanup({
        nodeEnv: 'development',
        projectId: '',
        confirmPhrase: 'cleanup:test-firebase',
        providedConfirm: 'cleanup:test-firebase',
        ports: fb.ports,
      }),
      CleanupSafetyError
    );
    assert.equal(fb.calls.del, 0);
  });
});

// ---------------------------------------------------------------------------
// Multi-target MongoDB cleanup (test / dev / prod / all)
// ---------------------------------------------------------------------------

/** A fake `connect(name)` that returns fake ports for that database. */
function fakeConnector({ collections = { a: 2, b: 1 }, overrideLiveName } = {}) {
  const calls = { connect: 0 };
  const connectors = [];
  return {
    calls,
    connectors,
    connect: async (name) => {
      calls.connect += 1;
      const mongo = fakeMongo({ collections });
      connectors.push({ name, mongo });
      return { liveName: overrideLiveName ?? name, ports: mongo.ports };
    },
  };
}

describe('cleanup utilities — multi-target allowlist', () => {
  it('the allowlist is exactly test/dev/prod and hard-coded', () => {
    assert.deepEqual(MONGODB_CLEANUP_TARGETS, {
      test: 'inventoryai_test_db',
      dev: 'inventoryai_dev_db',
      prod: 'inventoryai_prod_db',
    });
    assert.deepEqual(ALL_MONGODB_CLEANUP_TARGETS, [
      'inventoryai_test_db',
      'inventoryai_dev_db',
      'inventoryai_prod_db',
    ]);
    assert.equal(Object.isFrozen(MONGODB_CLEANUP_TARGETS), true);
  });

  it('resolveMongodbTarget maps the four selectors explicitly', () => {
    assert.deepEqual(resolveMongodbTarget('test'), ['inventoryai_test_db']);
    assert.deepEqual(resolveMongodbTarget('dev'), ['inventoryai_dev_db']);
    assert.deepEqual(resolveMongodbTarget('prod'), ['inventoryai_prod_db']);
    assert.deepEqual(resolveMongodbTarget('all'), [
      'inventoryai_test_db',
      'inventoryai_dev_db',
      'inventoryai_prod_db',
    ]);
    assert.deepEqual(resolveMongodbTarget(' TEST '), ['inventoryai_test_db']);
  });

  it('resolveMongodbTarget refuses an arbitrary database name or unknown selector', () => {
    for (const v of ['inventoryai_other_db', 'inventory_ai', '', undefined, 'delete-everything']) {
      assert.throws(() => resolveMongodbTarget(v), CleanupSafetyError);
    }
  });

  it('assertTargetAllowed refuses anything not in the allowlist', () => {
    assert.equal(assertTargetAllowed('inventoryai_dev_db'), 'inventoryai_dev_db');
    for (const v of ['inventoryai_dev_db_2', 'InventoryAI_DEV_DB', 'admin', 'local']) {
      assert.throws(() => assertTargetAllowed(v), CleanupSafetyError);
    }
  });

  it('isProductionTarget recognises only the approved production database', () => {
    assert.equal(isProductionTarget('inventoryai_prod_db'), true);
    assert.equal(isProductionTarget('inventoryai_test_db'), false);
    assert.equal(isProductionTarget('inventoryai_dev_db'), false);
  });

  it('assertLiveTarget refuses a live name that differs from the requested target', () => {
    assert.equal(assertLiveTarget({ requested: 'inventoryai_dev_db', liveName: 'inventoryai_dev_db' }), 'inventoryai_dev_db');
    assert.throws(() => assertLiveTarget({ requested: 'inventoryai_dev_db', liveName: 'inventoryai_prod_db' }), CleanupSafetyError);
    assert.throws(() => assertLiveTarget({ requested: 'inventoryai_dev_db', liveName: '' }), CleanupSafetyError);
  });
});

describe('cleanup utilities — production confirmation requirement', () => {
  it('assertProductionConfirmation requires the exact phrase', () => {
    assert.equal(assertProductionConfirmation(PRODUCTION_CONFIRM_PHRASE), true);
    for (const v of ['', 'DELETE-PRODUCTION', 'cleanup:prod-mongodb', undefined]) {
      assert.throws(() => assertProductionConfirmation(v), CleanupSafetyError);
    }
  });

  it('a production target requires the production phrase AND the command phrase', async () => {
    const conn = fakeConnector();
    // missing production phrase -> refused, no connection
    await assert.rejects(
      () => performMongodbTargetsCleanup({
        nodeEnv: 'development',
        selector: 'prod',
        confirmPhrase: 'cleanup:prod-mongodb',
        providedConfirm: 'cleanup:prod-mongodb',
        connect: conn.connect,
      }),
      /production confirmation phrase did not match/
    );
    assert.equal(conn.calls.connect, 0);

    // production phrase present but command phrase wrong -> still refused
    await assert.rejects(
      () => performMongodbTargetsCleanup({
        nodeEnv: 'development',
        selector: 'prod',
        confirmPhrase: 'cleanup:prod-mongodb',
        providedConfirm: 'nope',
        providedProdConfirm: PRODUCTION_CONFIRM_PHRASE,
        connect: conn.connect,
      }),
      /confirmation phrase did not match/
    );
    assert.equal(conn.calls.connect, 0);
  });

  it('the production target may run with NODE_ENV=production when both phrases match', async () => {
    const conn = fakeConnector();
    const reports = await performMongodbTargetsCleanup({
      nodeEnv: 'production',
      selector: 'prod',
      confirmPhrase: 'cleanup:prod-mongodb',
      providedConfirm: 'cleanup:prod-mongodb',
      providedProdConfirm: PRODUCTION_CONFIRM_PHRASE,
      connect: conn.connect,
    });
    assert.equal(reports.length, 1);
    assert.equal(reports[0].target, 'inventoryai_prod_db');
    assert.equal(reports[0].totalAfter, 0);
  });

  it('a non-production target still refuses NODE_ENV=production', async () => {
    const conn = fakeConnector();
    await assert.rejects(
      () => performMongodbTargetsCleanup({
        nodeEnv: 'production',
        selector: 'dev',
        confirmPhrase: 'cleanup:dev-mongodb',
        providedConfirm: 'cleanup:dev-mongodb',
        providedProdConfirm: PRODUCTION_CONFIRM_PHRASE,
        connect: conn.connect,
      }),
      CleanupSafetyError
    );
    assert.equal(conn.calls.connect, 0);
  });
});

describe('cleanup utilities — all-database confirmation requirement', () => {
  it('all requires the production phrase before touching anything', async () => {
    const conn = fakeConnector();
    await assert.rejects(
      () => performMongodbTargetsCleanup({
        nodeEnv: 'development',
        selector: 'all',
        confirmPhrase: 'cleanup:all-mongodb',
        providedConfirm: 'cleanup:all-mongodb',
        connect: conn.connect,
      }),
      /production confirmation phrase did not match/
    );
    assert.equal(conn.calls.connect, 0);
  });

  it('all clears exactly test, dev and prod, in that order, with the production phrase', async () => {
    const conn = fakeConnector({ collections: { a: 4, b: 3 } });
    const reports = await performMongodbTargetsCleanup({
      nodeEnv: 'development',
      selector: 'all',
      confirmPhrase: 'cleanup:all-mongodb',
      providedConfirm: 'cleanup:all-mongodb',
      providedProdConfirm: PRODUCTION_CONFIRM_PHRASE,
      connect: conn.connect,
    });
    assert.deepEqual(
      reports.map((r) => r.target),
      ['inventoryai_test_db', 'inventoryai_dev_db', 'inventoryai_prod_db']
    );
    assert.equal(conn.calls.connect, 3);
    for (const r of reports) assert.equal(r.totalAfter, 0);
  });

  it('--yes without a confirmation phrase is refused (all)', async () => {
    const conn = fakeConnector();
    await assert.rejects(
      () => performMongodbTargetsCleanup({
        nodeEnv: 'development',
        selector: 'all',
        confirmPhrase: 'cleanup:all-mongodb',
        providedConfirm: undefined,
        providedProdConfirm: PRODUCTION_CONFIRM_PHRASE,
        connect: conn.connect,
      }),
      CleanupSafetyError
    );
    assert.equal(conn.calls.connect, 0);
  });

  it('--yes without a confirmation phrase is refused (single target)', async () => {
    const conn = fakeConnector();
    await assert.rejects(
      () => performMongodbTargetsCleanup({
        nodeEnv: 'development',
        selector: 'test',
        confirmPhrase: 'cleanup:test-mongodb',
        providedConfirm: undefined,
        connect: conn.connect,
      }),
      CleanupSafetyError
    );
    assert.equal(conn.calls.connect, 0);
  });
});

describe('cleanup utilities — multi-target success and verification', () => {
  it('a single dev target clears every collection and verifies emptiness + indexes', async () => {
    const conn = fakeConnector({ collections: { a: 4, b: 0, c: 2 } });
    const reports = await performMongodbTargetsCleanup({
      nodeEnv: 'development',
      selector: 'dev',
      confirmPhrase: 'cleanup:dev-mongodb',
      providedConfirm: 'cleanup:dev-mongodb',
      connect: conn.connect,
    });
    assert.equal(reports[0].target, 'inventoryai_dev_db');
    assert.equal(reports[0].totalBefore, 6);
    assert.equal(reports[0].totalDeleted, 6);
    assert.equal(reports[0].totalAfter, 0);
    assert.deepEqual(conn.connectors[0].mongo.calls.deleted, { a: 4, b: 0, c: 2 });
  });

  it('a live-name mismatch aborts that target before deleting', async () => {
    const conn = fakeConnector({ overrideLiveName: 'inventoryai_prod_db' });
    await assert.rejects(
      () => performMongodbTargetsCleanup({
        nodeEnv: 'development',
        selector: 'dev',
        confirmPhrase: 'cleanup:dev-mongodb',
        providedConfirm: 'cleanup:dev-mongodb',
        connect: conn.connect,
      }),
      /live connection is/
    );
    assert.equal(conn.connectors[0].mongo.calls.del, 0);
  });

  it('fails loudly when a target collection is not empty after cleanup', async () => {
    const ports = {
      listCollectionNames: async () => ['a'],
      countDocuments: async () => 1,
      deleteMany: async () => 1,
      listIndexes: async () => [{ name: '_id_' }],
    };
    await assert.rejects(
      () => performMongodbTargetsCleanup({
        nodeEnv: 'development',
        selector: 'test',
        confirmPhrase: 'cleanup:test-mongodb',
        providedConfirm: 'cleanup:test-mongodb',
        connect: async () => ({ liveName: 'inventoryai_test_db', ports }),
      }),
      CleanupIncompleteError
    );
  });
});

describe('the Firebase link check is by address, not only by uid', () => {
  it('★ a stale uid does NOT make a still-owned address deletable', () => {
    // Measured 2026-10-26: every dev user row held a uid that no longer existed in
    // Firebase, so the uid lookup found nothing while the address was still owned.
    // The old uid-only check answered 'will delete' here — the unrecoverable state.
    assert.equal(
      classifyFirebaseAddress({ uid: 'live-uid', linkedByUid: 0, linkedByEmail: 1 }),
      'refused-linked'
    );
  });

  it('a uid match and an address match both refuse', () => {
    assert.equal(classifyFirebaseAddress({ uid: 'u', linkedByUid: 1, linkedByEmail: 0 }), 'refused-linked');
    assert.equal(classifyFirebaseAddress({ uid: 'u', linkedByUid: 1, linkedByEmail: 1 }), 'refused-linked');
  });

  it('an address with no identity but a database row is reported as orphaned', () => {
    assert.equal(classifyFirebaseAddress({ uid: null, linkedByEmail: 1 }), 'orphaned');
    assert.equal(classifyFirebaseAddress({ uid: '', linkedByEmail: 3 }), 'orphaned');
  });

  it('only an unreferenced identity is deletable, and an absent one has nothing to delete', () => {
    assert.equal(classifyFirebaseAddress({ uid: 'u', linkedByUid: 0, linkedByEmail: 0 }), 'will-delete');
    assert.equal(classifyFirebaseAddress({ uid: null, linkedByUid: 0, linkedByEmail: 0 }), 'no-identity');
    assert.equal(classifyFirebaseAddress({}), 'no-identity');
  });
});
