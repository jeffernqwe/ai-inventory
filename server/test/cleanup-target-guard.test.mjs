// The cleanup workflow's rule, asserted without a database.
//
// What this file is for: the seeder and the cleanup command now answer the same
// three questions with the same shape (what / where / real). These tests pin that
// shape — two phrases in development, three in production, `--database` equal to
// what the process resolved — and pin the ordering that makes it worth anything:
// a refused run must not open a connection, and a dry run must not delete.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DATABASE_NAMES } from '../src/config/env.ts';
import { CleanupSafetyError, summariseFirebaseReferences } from '../scripts/cleanup/lib.mjs';
import { databaseNameInUri } from '../scripts/lib/mongo-uri.mjs';
import {
  CLEANUP_CONFIRM_ENV,
  CLEANUP_DB_CONFIRM_ENV,
  CLEANUP_PROD_CONFIRM_ENV,
  CLEANUP_PROD_CONFIRM_PHRASE,
  CLEANUP_TARGETS,
  assertCleanupTarget,
  extractCleanupTargetArg,
  requiredCleanupPhraseCount,
  resolveCleanupTarget,
} from '../scripts/cleanup/guard.mjs';
import { performNamedDatabaseCleanup } from '../scripts/cleanup/run.mjs';

const readScript = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');
const readServerFile = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const envFor = (dbName, over = {}) => ({
  mongodbUri: 'mongodb://example.invalid:27017',
  mongodbDbName: dbName,
  ...over,
});

const devValues = (over = {}) => ({
  [CLEANUP_CONFIRM_ENV]: CLEANUP_TARGETS.database.phrase,
  [CLEANUP_DB_CONFIRM_ENV]: DATABASE_NAMES.development,
  ...over,
});

const prodValues = (over = {}) => ({
  [CLEANUP_CONFIRM_ENV]: CLEANUP_TARGETS.database.phrase,
  [CLEANUP_DB_CONFIRM_ENV]: DATABASE_NAMES.production,
  [CLEANUP_PROD_CONFIRM_ENV]: CLEANUP_PROD_CONFIRM_PHRASE,
  ...over,
});

function fakeDb(collections) {
  const data = new Map(Object.entries(collections));
  const calls = { deleted: [] };
  return {
    data,
    calls,
    ports: {
      listCollectionNames: async () => [...data.keys()].sort(),
      countDocuments: async (name) => data.get(name) ?? 0,
      deleteMany: async (name) => {
        const before = data.get(name) ?? 0;
        data.set(name, 0);
        calls.deleted.push(name);
        return before;
      },
      listIndexes: async () => [{ name: '_id_' }],
    },
  };
}

// ---------------------------------------------------------------------------
// 1. The two targets, and how `--target` is read
// ---------------------------------------------------------------------------
describe('cleanup guard — targets', () => {
  it('knows exactly two destructive commands, each with its own phrase', () => {
    assert.deepEqual(Object.keys(CLEANUP_TARGETS).sort(), ['database', 'firebase']);
    assert.equal(CLEANUP_TARGETS.database.phrase, 'cleanup:database');
    assert.equal(CLEANUP_TARGETS.firebase.phrase, 'cleanup:firebase');
    assert.equal(new Set(Object.values(CLEANUP_TARGETS).map((t) => t.phrase)).size, 2);
  });

  it('refuses a missing or unknown target instead of defaulting to one', () => {
    for (const value of [undefined, null, '', '   ']) {
      assert.throws(() => resolveCleanupTarget(value), /--target=<database\|firebase> is required/);
    }
    assert.throws(() => resolveCleanupTarget('all'), /unknown --target "all"/);
    assert.throws(() => resolveCleanupTarget('mongodb'), /unknown --target "mongodb"/);
  });

  it('accepts --target=key and --target key, and strips it from the engine arguments', () => {
    assert.deepEqual(extractCleanupTargetArg(['--target=firebase', '--email=a@x.com']), {
      target: 'firebase',
      rest: ['--email=a@x.com'],
    });
    assert.deepEqual(extractCleanupTargetArg(['--target', 'database', '--dry-run']), {
      target: 'database',
      rest: ['--dry-run'],
    });
    assert.deepEqual(extractCleanupTargetArg(['--email=a@x.com']), {
      target: undefined,
      rest: ['--email=a@x.com'],
    });
  });
});

// ---------------------------------------------------------------------------
// 2. `--database` must be the resolved database, and must be cleanable
// ---------------------------------------------------------------------------
describe('cleanup guard — the named database', () => {
  it('requires --database, and says which database the shell resolved', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor(DATABASE_NAMES.development),
          target: 'database',
          values: devValues(),
        }),
      /--database=<name> is required .*"inventoryai_dev_db"/,
    );
  });

  it('refuses a name that differs from the resolved database', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor(DATABASE_NAMES.development),
          target: 'database',
          database: DATABASE_NAMES.production,
          values: prodValues(),
        }),
      /--database is "inventoryai_prod_db" but this process resolved "inventoryai_dev_db"/,
    );
  });

  it('refuses the test database by name, because npm test owns it', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor(DATABASE_NAMES.test),
          target: 'database',
          database: DATABASE_NAMES.test,
          values: { [CLEANUP_CONFIRM_ENV]: 'cleanup:database', [CLEANUP_DB_CONFIRM_ENV]: DATABASE_NAMES.test },
        }),
      /test database .*"npm test" owns/,
    );
  });

  it('refuses a database that is not one of the two cleanable names', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor('inventoryai_staging_db'),
          target: 'database',
          database: 'inventoryai_staging_db',
          values: { [CLEANUP_CONFIRM_ENV]: 'cleanup:database', [CLEANUP_DB_CONFIRM_ENV]: 'inventoryai_staging_db' },
        }),
      /not a cleanup target .*inventoryai_dev_db, inventoryai_prod_db/,
    );
  });

  it('refuses before anything else when MONGODB_URI is missing', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: { mongodbDbName: DATABASE_NAMES.development },
          target: 'database',
          database: DATABASE_NAMES.development,
          values: devValues(),
        }),
      /MONGODB_URI is not set/,
    );
  });
});

// ---------------------------------------------------------------------------
// 2b. The connection string must agree with the target too
// ---------------------------------------------------------------------------
describe('cleanup guard — the connection string must agree', () => {
  it('refuses a URI that names a different database than the run', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor(DATABASE_NAMES.development, {
            mongodbUri: 'mongodb+srv://user:secret@cluster.example.net/inventoryai_prod_db?retryWrites=true', // secret-guard:allow — fake
          }),
          target: 'database',
          database: DATABASE_NAMES.development,
          values: devValues(),
        }),
      (err) => {
        assert.ok(err instanceof CleanupSafetyError);
        assert.match(err.message, /MONGODB_URI names the database "inventoryai_prod_db"/);
        assert.match(err.message, /this run resolved "inventoryai_dev_db"/);
        assert.match(err.message, /Nothing was deleted/);
        assert.doesNotMatch(err.message, /secret/, 'the refusal must not echo the connection string');
        return true;
      },
    );
  });

  it('accepts a URI that names the same database, or names none', () => {
    for (const uri of [
      `mongodb+srv://u:p@cluster.example.net/${DATABASE_NAMES.development}`, // secret-guard:allow — fake
      'mongodb://example.invalid:27017',
      'mongodb://example.invalid:27017/?retryWrites=true',
    ]) {
      const result = assertCleanupTarget({
        env: envFor(DATABASE_NAMES.development, { mongodbUri: uri }),
        target: 'database',
        database: DATABASE_NAMES.development,
        values: devValues(),
      });
      assert.equal(result.database, DATABASE_NAMES.development, uri);
    }
  });
});

describe('databaseNameInUri — reads the path segment and nothing else', () => {
  const cases = [
    ['mongodb://host', ''],
    ['mongodb://host:27017', ''],
    ['mongodb://host/', ''],
    ['mongodb://host/?retryWrites=true', ''],
    ['mongodb://user:pass@host:27017/db?retryWrites=true', 'db'], // secret-guard:allow — fake
    ['mongodb+srv://user:pass@a.example.net,b.example.net/db', 'db'], // secret-guard:allow — fake
    ['mongodb://user:p%40ss@host/db', 'db'], // secret-guard:allow — fake
    ['mongodb://host/inventory%20ai', 'inventory ai'],
    ['', ''],
    [undefined, ''],
  ];

  for (const [uri, expected] of cases) {
    it(`${JSON.stringify(uri ?? '')} → ${JSON.stringify(expected)}`, () => {
      assert.equal(databaseNameInUri(uri), expected);
    });
  }

  it('never returns the host or a credential', () => {
    const name = databaseNameInUri('mongodb+srv://user:topsecret@cluster.example.net/inventoryai_dev_db'); // secret-guard:allow — fake
    assert.equal(name, 'inventoryai_dev_db');
    assert.doesNotMatch(name, /topsecret|cluster\.example\.net/);
  });
});

// ---------------------------------------------------------------------------
// 2c. One reference anywhere refuses a Firebase deletion
// ---------------------------------------------------------------------------
describe('firebase references — one row anywhere is enough', () => {
  const UID = 'uid-1';

  it('a reference in PRODUCTION refuses a deletion started from development', () => {
    const result = summariseFirebaseReferences({
      uid: UID,
      countsByDatabase: {
        inventoryai_dev_db: { byUid: 0, byEmail: 0 },
        inventoryai_prod_db: { byUid: 1, byEmail: 1 },
      },
    });
    assert.equal(result.verdict, 'refused-linked');
    assert.deepEqual(result.linkedIn, ['inventoryai_prod_db']);
    assert.equal(result.linkedByUid, 1);
  });

  it('one reference is enough in either database, by uid or by email', () => {
    for (const counts of [
      { byUid: 1, byEmail: 0 },
      { byUid: 0, byEmail: 1 },
    ]) {
      const dev = summariseFirebaseReferences({
        uid: UID,
        countsByDatabase: { inventoryai_dev_db: counts, inventoryai_prod_db: { byUid: 0, byEmail: 0 } },
      });
      const prod = summariseFirebaseReferences({
        uid: UID,
        countsByDatabase: { inventoryai_dev_db: { byUid: 0, byEmail: 0 }, inventoryai_prod_db: counts },
      });
      assert.equal(dev.verdict, 'refused-linked');
      assert.equal(prod.verdict, 'refused-linked');
    }
  });

  it('names every database that contributed, in the order they were read', () => {
    const result = summariseFirebaseReferences({
      uid: UID,
      countsByDatabase: {
        inventoryai_dev_db: { byUid: 0, byEmail: 2 },
        inventoryai_prod_db: { byUid: 1, byEmail: 0 },
      },
    });
    assert.deepEqual(result.linkedIn, ['inventoryai_dev_db', 'inventoryai_prod_db']);
    assert.equal(result.verdict, 'refused-linked');
  });

  it('an address with no identity but a row is ORPHANED, never "free to delete"', () => {
    const result = summariseFirebaseReferences({
      uid: null,
      countsByDatabase: { inventoryai_dev_db: { byUid: 0, byEmail: 1 } },
    });
    assert.equal(result.verdict, 'orphaned');
    assert.deepEqual(result.linkedIn, ['inventoryai_dev_db']);
  });

  it('deletable only when nothing references it in any database', () => {
    const none = { byUid: 0, byEmail: 0 };
    assert.equal(
      summariseFirebaseReferences({
        uid: UID,
        countsByDatabase: { inventoryai_dev_db: none, inventoryai_prod_db: none },
      }).verdict,
      'will-delete',
    );
    assert.equal(
      summariseFirebaseReferences({ uid: null, countsByDatabase: { inventoryai_dev_db: none } }).verdict,
      'no-identity',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Two phrases in development, three in production
// ---------------------------------------------------------------------------
describe('cleanup guard — confirmation phrases', () => {
  it('development with no phrases names BOTH, and says how many are needed', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor(DATABASE_NAMES.development),
          target: 'database',
          database: DATABASE_NAMES.development,
          values: {},
        }),
      (err) => {
        assert.ok(err instanceof CleanupSafetyError);
        assert.match(err.message, /two confirmation phrase\(s\)/);
        assert.match(err.message, /CLEANUP_CONFIRM=cleanup:database/);
        assert.match(err.message, /CLEANUP_DB_CONFIRM=inventoryai_dev_db/);
        assert.match(err.message, /Nothing was deleted\./);
        return true;
      },
    );
  });

  it('development with one phrase names only the missing one', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor(DATABASE_NAMES.development),
          target: 'database',
          database: DATABASE_NAMES.development,
          values: { [CLEANUP_CONFIRM_ENV]: 'cleanup:database' },
        }),
      (err) => {
        assert.match(err.message, /1 is missing or wrong: CLEANUP_DB_CONFIRM=inventoryai_dev_db/);
        assert.doesNotMatch(err.message, /CLEANUP_CONFIRM=cleanup:database AND/);
        return true;
      },
    );
  });

  it('development with both phrases passes and reports two', () => {
    const result = assertCleanupTarget({
      env: envFor(DATABASE_NAMES.development),
      target: 'database',
      database: DATABASE_NAMES.development,
      values: devValues(),
    });
    assert.deepEqual(result, {
      target: 'database',
      database: DATABASE_NAMES.development,
      production: false,
      phrases: 2,
    });
  });

  it('production with two phrases refuses and names the third', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor(DATABASE_NAMES.production),
          target: 'database',
          database: DATABASE_NAMES.production,
          values: prodValues({ [CLEANUP_PROD_CONFIRM_ENV]: undefined }),
        }),
      (err) => {
        assert.match(err.message, /three confirmation phrase\(s\)/);
        assert.match(err.message, /\(PRODUCTION\)/);
        assert.match(err.message, /CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA/);
        return true;
      },
    );
  });

  it('production with three phrases passes and reports three', () => {
    const result = assertCleanupTarget({
      env: envFor(DATABASE_NAMES.production),
      target: 'database',
      database: DATABASE_NAMES.production,
      values: prodValues(),
    });
    assert.equal(result.production, true);
    assert.equal(result.phrases, 3);
    assert.equal(requiredCleanupPhraseCount(DATABASE_NAMES.production), 3);
    assert.equal(requiredCleanupPhraseCount(DATABASE_NAMES.development), 2);
  });

  it('a phrase that belongs to the other command is refused, and named', () => {
    assert.throws(
      () =>
        assertCleanupTarget({
          env: envFor(DATABASE_NAMES.development),
          target: 'firebase',
          database: DATABASE_NAMES.development,
          values: devValues({ [CLEANUP_CONFIRM_ENV]: 'cleanup:database' }),
        }),
      /CLEANUP_CONFIRM names "cleanup:database", but this run is \[cleanup:firebase\].*cleanup:firebase/,
    );
  });

  it('each command needs its own phrase, not just any phrase', () => {
    const result = assertCleanupTarget({
      env: envFor(DATABASE_NAMES.development),
      target: 'firebase',
      database: DATABASE_NAMES.development,
      values: { [CLEANUP_CONFIRM_ENV]: 'cleanup:firebase', [CLEANUP_DB_CONFIRM_ENV]: DATABASE_NAMES.development },
    });
    assert.equal(result.target, 'firebase');
  });
});

// ---------------------------------------------------------------------------
// 4. A refused run touches nothing; a dry run deletes nothing
// ---------------------------------------------------------------------------
describe('cleanup — the guarded sequence', () => {
  it('refuses before opening a connection', async () => {
    let connected = false;
    await assert.rejects(
      () =>
        performNamedDatabaseCleanup({
          database: DATABASE_NAMES.production, // names a database the shell did not resolve
          env: envFor(DATABASE_NAMES.development),
          values: devValues(),
          connect: async () => {
            connected = true;
            throw new Error('connect must not be reached');
          },
        }),
      CleanupSafetyError,
    );
    assert.equal(connected, false, 'a refused run must not open a connection');
  });

  it('clears every collection and verifies the result', async () => {
    const db = fakeDb({ products: 4, users: 2, locations: 0 });
    const report = await performNamedDatabaseCleanup({
      database: DATABASE_NAMES.development,
      env: envFor(DATABASE_NAMES.development),
      values: devValues(),
      connect: async (name) => ({ liveName: name, ports: db.ports }),
    });

    assert.equal(report.dryRun, false);
    assert.equal(report.collections, 3);
    assert.equal(report.totalDeleted, 6);
    assert.equal(report.totalAfter, 0);
    assert.equal(db.calls.deleted.length, 3);
  });

  it('refuses when the live connection is not the requested database', async () => {
    const db = fakeDb({ products: 1 });
    await assert.rejects(
      () =>
        performNamedDatabaseCleanup({
          database: DATABASE_NAMES.development,
          env: envFor(DATABASE_NAMES.development),
          values: devValues(),
          connect: async () => ({ liveName: DATABASE_NAMES.production, ports: db.ports }),
        }),
      /live connection is "inventoryai_prod_db"/,
    );
    assert.equal(db.calls.deleted.length, 0, 'nothing may be deleted after a live-name mismatch');
  });

  it('a dry run counts and deletes nothing', async () => {
    const db = fakeDb({ products: 4, users: 2 });
    const report = await performNamedDatabaseCleanup({
      database: DATABASE_NAMES.development,
      env: envFor(DATABASE_NAMES.development),
      values: devValues(),
      dryRun: true,
      connect: async (name) => ({ liveName: name, ports: db.ports }),
    });

    assert.equal(report.dryRun, true);
    assert.equal(report.collections, 2);
    assert.equal(report.total, 6);
    assert.deepEqual(report.counts, { products: 4, users: 2 });
    assert.equal(db.calls.deleted.length, 0, 'a dry run must not delete');
  });
});

// ---------------------------------------------------------------------------
// 5. The command surface, and the order the scripts run in
// ---------------------------------------------------------------------------
describe('cleanup — command surface', () => {
  const pkg = JSON.parse(readServerFile('package.json'));

  it('exposes one cleanup command and no per-selector aliases', () => {
    assert.equal(pkg.scripts.cleanup, 'node scripts/cleanup.mjs');
    for (const legacy of [
      'cleanup:test-mongodb',
      'cleanup:dev-mongodb',
      'cleanup:prod-mongodb',
      'cleanup:all-mongodb',
      'cleanup:firebase-accounts',
    ]) {
      assert.equal(pkg.scripts[legacy], undefined, `${legacy} must not survive the standardization`);
    }
  });

  it('the database engine reaches the guard before the connection', () => {
    const orchestration = readScript('cleanup/run.mjs');
    const fn = orchestration.slice(orchestration.indexOf('export async function performNamedDatabaseCleanup'));
    const guardAt = fn.indexOf('assertCleanupTarget(');
    const connectAt = fn.indexOf('await connect(');
    assert.ok(guardAt > -1, 'performNamedDatabaseCleanup must call assertCleanupTarget');
    assert.ok(connectAt > guardAt, 'the guard must run before connect()');
  });

  it('the Firebase engine guards before it connects or deletes', () => {
    const source = readScript('cleanup-firebase-accounts.mjs');
    const guardAt = source.indexOf('assertCleanupTarget({');
    const connectAt = source.indexOf('await mongoose.connect(');
    const deleteAt = source.indexOf('auth.deleteUser(');
    assert.ok(guardAt > -1, 'the engine must call the shared guard');
    assert.ok(connectAt > guardAt, 'the guard must run before mongoose.connect');
    assert.ok(deleteAt > guardAt, 'the guard must run before deleteUser');
  });

  it('the Firebase engine checks both databases, not only the target', () => {
    const source = readScript('cleanup-firebase-accounts.mjs');
    assert.match(source, /REFERENCE_DATABASES = \[DATABASE_NAMES\.development, DATABASE_NAMES\.production\]/);
    assert.match(source, /client\.db\(dbName\)/);
  });
});
