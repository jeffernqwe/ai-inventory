/**
 * The scripts that write, delete, read or spend must know WHICH environment they are in.
 *
 * WHY THIS EXISTS. `assertSafeTarget` — the guard shared by every seeder and its cleanup — used to
 * answer the environment question with `process.env.NODE_ENV === 'production'`, which says "safe"
 * to an UNSET value, to `Production`, and to `prod`. `prod` then resolved to the development
 * database, so a seed ran against a database nobody had named while the guard looked like it had
 * considered the question. The server itself stopped accepting that class of value on 2026-10-22
 * (`config/startup.ts`); a script that deletes data must not be the last place that guesses.
 *
 * The rule is the same one the server uses — one classifier, three outcomes — plus the target
 * check these tools already had. A measurement tool gets the same treatment without the
 * confirmation phrase, because reading the wrong database produces a number that a decision could
 * be made on.
 *
 * These are pure cases over the guard functions, plus source guards that every script of each kind
 * actually calls one. No database, no connection, no network.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  PERF_TENANT_CLEANUP_CONFIRM,
  PERF_TENANT_SEED_CONFIRM,
  PERF_TURNS_PROD_CONFIRM,
  SeedSafetyError,
  assertMeasurementTarget,
  assertNamedDatabaseTarget,
  assertReadableTarget,
  assertSafeTarget,
} from '../scripts/perf/lib.mjs';

/** A resolved environment as `config/env.ts` would hand it to a script. */
const envOf = (dbName = 'inventoryai_dev_db') => ({
  mongodbUri: 'mongodb://127.0.0.1:27017/unused',
  mongodbDbName: dbName,
  nodeEnv: 'development',
});

/** Set NODE_ENV for the duration of a callback, restoring whatever was there. */
async function withNodeEnv(value, fn) {
  const saved = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  }
}

const messageOf = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof SeedSafetyError, `expected a SeedSafetyError, got ${err}`);
    return err.message;
  }
  assert.fail('the guard did not refuse');
};

describe('a seeder refuses an environment it cannot name (2026-10-22)', () => {
  it('accepts the documented development shell', async () => {
    await withNodeEnv('development', () => {
      const saved = process.env.SEED_CONFIRM;
      process.env.SEED_CONFIRM = 'seed:test';
      try {
        assert.doesNotThrow(() =>
          assertSafeTarget(envOf(), 'seed:test', { confirmPhrase: 'seed:test' }),
        );
      } finally {
        if (saved === undefined) delete process.env.SEED_CONFIRM;
        else process.env.SEED_CONFIRM = saved;
      }
    });
  });

  it('refuses production by name', async () => {
    for (const value of ['production', ' production ']) {
      await withNodeEnv(value, () => {
        const message = messageOf(() =>
          assertSafeTarget(envOf(), 'seed:test', { confirmPhrase: 'seed:test' }),
        );
        assert.match(message, /NODE_ENV=production/);
        assert.match(message, /Nothing was written or deleted/);
      });
    }
  });

  it('refuses an unset or misspelled environment as AMBIGUOUS, not as production', async () => {
    // The distinction matters to whoever fixes it: nothing set is a different mistake from a typo,
    // and neither is the production refusal — the tool simply cannot prove what it would write.
    for (const value of [undefined, '', '   ', 'prod', 'Production', 'staging']) {
      await withNodeEnv(value, () => {
        const message = messageOf(() =>
          assertSafeTarget(envOf(), 'seed:test', { confirmPhrase: 'seed:test' }),
        );
        assert.match(message, /ambiguous/, JSON.stringify(value));
        assert.doesNotMatch(message, /NODE_ENV=production/, JSON.stringify(value));
        // The value is never QUOTED back: a typo is an arbitrary string. (A plain substring
        // check would trip on `prod`, which the message legitimately contains inside `production`.)
        if (typeof value === 'string' && value.trim()) {
          assert.equal(message.includes(`"${value.trim()}"`), false, JSON.stringify(value));
        }
      });
    }
  });

  it('refuses a target that is not the development database, whatever the environment says', async () => {
    await withNodeEnv('development', () => {
      for (const db of ['inventoryai_prod_db', 'inventoryai_test_db', 'someone_elses_db']) {
        const message = messageOf(() =>
          assertSafeTarget(envOf(db), 'seed:test', { confirmPhrase: 'seed:test' }),
        );
        assert.match(message, /not the development database/, db);
      }
    });
  });

  it('refuses a missing URI and a missing confirmation phrase', async () => {
    await withNodeEnv('development', () => {
      const noUri = messageOf(() =>
        assertSafeTarget({ ...envOf(), mongodbUri: '' }, 'seed:test', { confirmPhrase: 'seed:test' }),
      );
      assert.match(noUri, /MONGODB_URI is not set/);

      const noPhrase = messageOf(() =>
        assertSafeTarget(envOf(), 'seed:test', { confirmPhrase: 'seed:test' }),
      );
      assert.match(noPhrase, /SEED_CONFIRM=seed:test/);
    });
  });
});

describe('a measurement refuses the wrong database before it reads or spends', () => {
  it('accepts the development and test databases', async () => {
    await withNodeEnv('development', () => {
      assert.doesNotThrow(() => assertReadableTarget(envOf('inventoryai_dev_db'), 'perf:measure'));
    });
    await withNodeEnv('test', () => {
      assert.doesNotThrow(() => assertReadableTarget(envOf('inventoryai_test_db'), 'perf:measure'));
    });
  });

  it('refuses production, an ambiguous environment, and the production database by name', async () => {
    await withNodeEnv('production', () => {
      const message = messageOf(() => assertReadableTarget(envOf(), 'perf:measure'));
      assert.match(message, /never run against production/);
      assert.match(message, /Nothing was read or spent/);
    });

    await withNodeEnv(undefined, () => {
      assert.match(messageOf(() => assertReadableTarget(envOf(), 'perf:measure')), /ambiguous/);
    });

    // The posture and the target are separate questions, and this is the one the posture cannot
    // answer: a development shell pointed at the production database.
    await withNodeEnv('development', () => {
      const message = messageOf(() =>
        assertReadableTarget(envOf('inventoryai_prod_db'), 'perf:measure'),
      );
      assert.match(message, /not one of inventoryai_dev_db, inventoryai_test_db/);
    });
  });

  it('needs no confirmation phrase — measuring is not destructive', async () => {
    await withNodeEnv('development', () => {
      assert.equal(process.env.SEED_CONFIRM, undefined);
      assert.doesNotThrow(() => assertReadableTarget(envOf(), 'perf:measure'));
    });
  });
});

/**
 * The production-capable tenant (2026-10-25). `assertSafeTarget` refuses production, and that is
 * correct for its callers. A tenant a store build can be signed into has to be seedable THERE, so
 * this guard allows it — and replaces the refusal with the requirement that the target be NAMED.
 * These cases pin both halves: production is reachable, and it is unreachable by accident.
 */
describe('the production-capable tenant names its target instead of being refused', () => {
  const named = (over = {}) => ({
    mongodbUri: 'mongodb://127.0.0.1:27017/unused',
    resolvedDbName: 'inventoryai_prod_db',
    requestedDatabase: 'inventoryai_prod_db',
    confirm: PERF_TENANT_SEED_CONFIRM,
    confirmPhrase: PERF_TENANT_SEED_CONFIRM,
    command: 'seed:perf-tenant',
    ...over,
  });

  it('accepts the production database when it is named and confirmed', () => {
    assert.equal(assertNamedDatabaseTarget(named()), 'inventoryai_prod_db');
  });

  it('refuses an unnamed target, even though production is allowed', () => {
    for (const requestedDatabase of [undefined, '', '   ']) {
      const message = messageOf(() => assertNamedDatabaseTarget(named({ requestedDatabase })));
      assert.match(message, /--database=<name> is required/);
      assert.match(message, /Nothing was written or deleted/);
    }
  });

  it('refuses a name that is not the database this process resolved', () => {
    const message = messageOf(() =>
      assertNamedDatabaseTarget(named({ requestedDatabase: 'inventoryai_dev_db' })),
    );
    assert.match(message, /but the resolved database is "inventoryai_prod_db"/);
  });

  it('refuses the test database, which npm test clears', () => {
    const message = messageOf(() =>
      assertNamedDatabaseTarget(named({ resolvedDbName: 'inventoryai_test_db', requestedDatabase: 'inventoryai_test_db' })),
    );
    assert.match(message, /test database/);
  });

  it('refuses a missing or wrong phrase, and names the variable to set', () => {
    for (const confirm of [undefined, '', 'seed-perf-ai', PERF_TENANT_CLEANUP_CONFIRM]) {
      const message = messageOf(() => assertNamedDatabaseTarget(named({ confirm })));
      assert.match(message, /SEED_CONFIRM='seed:perf-tenant'/);
    }
  });

  it('refuses a missing URI before saying anything about the database', () => {
    const message = messageOf(() => assertNamedDatabaseTarget(named({ mongodbUri: '' })));
    assert.match(message, /MONGODB_URI is not set/);
  });
});

/**
 * A measurement against production (2026-10-25). The probe reads real rows and spends the shared AI
 * allowance, so "which database is this?" has to be answered before the first request — `--base=`
 * names a server, not a database.
 */
describe('a measurement reaches production only by naming it', () => {
  const measurement = (over = {}) => ({
    mongodbUri: 'mongodb://127.0.0.1:27017/unused',
    resolvedDbName: 'inventoryai_prod_db',
    requestedDatabase: 'inventoryai_prod_db',
    confirm: PERF_TURNS_PROD_CONFIRM,
    confirmPhrase: PERF_TURNS_PROD_CONFIRM,
    command: 'perf:turns',
    ...over,
  });

  it('leaves the development and test databases needing no naming at all', () => {
    for (const db of ['inventoryai_dev_db', 'inventoryai_test_db']) {
      assert.deepEqual(
        assertMeasurementTarget(
          measurement({ resolvedDbName: db, requestedDatabase: undefined, confirm: undefined }),
        ),
        { database: db, production: false },
      );
    }
  });

  it('refuses production when it is not named', () => {
    for (const requestedDatabase of [undefined, '', 'inventoryai_dev_db']) {
      const message = messageOf(() => assertMeasurementTarget(measurement({ requestedDatabase })));
      assert.match(message, /Name it with --database=inventoryai_prod_db/);
    }
  });

  it('refuses production without its own phrase', () => {
    for (const confirm of [undefined, '', 'seed-perf-ai', PERF_TENANT_SEED_CONFIRM]) {
      const message = messageOf(() => assertMeasurementTarget(measurement({ confirm })));
      assert.match(message, /PERF_TURNS_CONFIRM='perf-turns:production'/);
    }
  });

  it('accepts production when it is named and confirmed, and says so', () => {
    assert.deepEqual(assertMeasurementTarget(measurement()), {
      database: 'inventoryai_prod_db',
      production: true,
    });
  });

  it('refuses a database it does not recognise unless that database is named too', () => {
    const message = messageOf(() =>
      assertMeasurementTarget(
        measurement({ resolvedDbName: 'some_other_db', requestedDatabase: undefined, confirm: undefined }),
      ),
    );
    assert.match(message, /Name it with --database=some_other_db/);
  });

  it('keeps every phrase distinct, so one cannot be pasted into another command', () => {
    const phrases = [
      'seed-perf-ai',
      PERF_TENANT_SEED_CONFIRM,
      PERF_TENANT_CLEANUP_CONFIRM,
      PERF_TURNS_PROD_CONFIRM,
    ];
    assert.equal(new Set(phrases).size, phrases.length);
  });
});

/**
 * The scripts themselves, read from source. A guard that some path never calls is the failure mode
 * this pins: the next script added must opt in, and the old comparison must not grow back.
 */
describe('every data-touching script calls one of the guards', () => {
  const read = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');

  const SEEDERS = [
    'seed-perf-data.mjs',
    'cleanup-perf-data.mjs',
    'seed-demo-account.mjs',
    'seed-demo-tenant.mjs',
    'cleanup-demo-tenant.mjs',
    'seed-accounts.mjs',
    'seed-role-accounts.mjs',
    'cleanup-role-accounts.mjs',
    'seed-perf-tenant.mjs',
    'cleanup-perf-tenant.mjs',
    'restore-db.mjs',
  ];

  const MEASUREMENTS = ['measure-ai-tools.mjs', 'measure-ai-turns.mjs'];

  it('every seeder and cleanup resolves its target through a guard', () => {
    for (const name of SEEDERS) {
      const source = read(name);
      // `assertDemoTarget` is the demo tenant's own guard: it requires the database to be NAMED on
      // the command line, refuses the test database and refuses a re-run over another business.
      assert.match(
        source,
        /assertSafeTarget\(|assertRestoreTarget\(|assertDemoTarget\(|assertNamedDatabaseTarget\(/,
        `${name} has no target guard`,
      );
    }
  });

  it('every measurement checks the database it is about to read', () => {
    for (const name of MEASUREMENTS) {
      assert.match(
        read(name),
        /assertReadableTarget\(|assertMeasurementTarget\(/,
        `${name} has no readable-target guard`,
      );
    }
  });

  it('no script compares NODE_ENV to "production" itself (control)', () => {
    // The old rule, in one line. Every script that needs this question now asks the classifier, so
    // the answer cannot differ between the server and a tool that deletes rows.
    for (const name of readdirSync(new URL('../scripts', import.meta.url))) {
      if (!name.endsWith('.mjs')) continue;
      const source = read(name);
      assert.equal(
        /process\.env\.NODE_ENV\s*===\s*['"]production['"]/.test(source),
        false,
        `${name} compares NODE_ENV to "production" itself`,
      );
    }
  });
});
