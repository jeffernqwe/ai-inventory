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

import { DATABASE_NAMES } from '../src/config/env.ts';
import {
  PERF_TENANT_CLEANUP_CONFIRM,
  PERF_TENANT_SEED_CONFIRM,
  PERF_TURNS_PROD_CONFIRM,
  SeedSafetyError,
  assertMeasurementTarget,
  assertNamedDatabaseTarget,
  assertNamedReadTarget,
  assertReadableTarget,
  assertSafeTarget,
} from '../scripts/perf/lib.mjs';
import { assertTenantNamedForReset } from '../scripts/seed/lib.mjs';

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

/** Set one environment variable for the duration of a callback, restoring it after. */
async function withEnvValue(name, value, fn) {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
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
 * The ACCOUNT seeders reach production the same way (2026-10-25): the command is the same, the
 * only difference is that `--database=` names the target. Without it, the old refusal stands, so
 * a shell that forgets the flag cannot write to a real deployment by accident.
 */
describe('naming the database is how an account seeder reaches production', () => {
  const productionEnv = {
    mongodbUri: 'mongodb://127.0.0.1:27017/unused',
    mongodbDbName: DATABASE_NAMES.production,
    nodeEnv: 'production',
  };
  const named = { confirmPhrase: 'seed-demo-account', database: DATABASE_NAMES.production };

  it("accepts a named production target under the command's own phrase", async () => {
    await withNodeEnv('production', () =>
      withEnvValue('SEED_CONFIRM', 'seed-demo-account', () => {
        assert.equal(assertSafeTarget(productionEnv, 'seed:demo', named), DATABASE_NAMES.production);
      }),
    );
  });

  it('still refuses production when no database is named', async () => {
    await withNodeEnv('production', () =>
      withEnvValue('SEED_CONFIRM', 'seed-demo-account', () => {
        const message = messageOf(() =>
          assertSafeTarget(productionEnv, 'seed:demo', { confirmPhrase: 'seed-demo-account' }),
        );
        assert.match(message, /NODE_ENV=production/);
      }),
    );
  });

  it('refuses a name that is not the database this run resolved', async () => {
    await withEnvValue('SEED_CONFIRM', 'seed-demo-account', () => {
      const message = messageOf(() =>
        assertSafeTarget(productionEnv, 'seed:demo', { ...named, database: DATABASE_NAMES.development }),
      );
      assert.match(message, /but the resolved database is "inventoryai_prod_db"/);
    });
  });

  it('refuses the test database even when it is named', async () => {
    await withEnvValue('SEED_CONFIRM', 'seed-demo-account', () => {
      const message = messageOf(() =>
        assertSafeTarget(
          { ...productionEnv, mongodbDbName: DATABASE_NAMES.test },
          'seed:demo',
          { ...named, database: DATABASE_NAMES.test },
        ),
      );
      assert.match(message, /test database/);
    });
  });

  it("refuses another command's phrase", async () => {
    await withEnvValue('SEED_CONFIRM', 'seed-accounts', () => {
      const message = messageOf(() => assertSafeTarget(productionEnv, 'seed:demo', named));
      assert.match(message, /SEED_CONFIRM='seed-demo-account'/);
    });
  });

  it('never rewrites an existing credential in production', () => {
    // Pinned in the SOURCE because the behaviour itself needs Firebase: both account seeders
    // pass `refreshPassword: !production`, so a real person's password is left alone.
    for (const name of ['seed-demo-account.mjs', 'seed-accounts.mjs']) {
      const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');
      assert.match(
        source,
        /resolveIdentity\([^)]*refreshPassword: !production/,
        `${name} would change an existing production credential`,
      );
    }
  });
});

/**
 * A read-only verification (`verify:demo`) may inspect production, but only when the database is
 * named. It writes nothing and spends nothing, so there is no phrase to set.
 */
describe('a read-only verification names production instead of being refused', () => {
  const read = (db, requestedDatabase = db) => ({
    mongodbUri: 'mongodb://127.0.0.1:27017/unused',
    resolvedDbName: db,
    requestedDatabase,
    command: 'verify:demo',
  });

  it('reads the development and test databases without naming them', () => {
    for (const db of [DATABASE_NAMES.development, DATABASE_NAMES.test]) {
      assert.equal(assertNamedReadTarget(read(db)), db);
      assert.equal(assertNamedReadTarget(read(db, '')), db);
    }
  });

  it('refuses production when it is not named', () => {
    const message = messageOf(() => assertNamedReadTarget(read(DATABASE_NAMES.production, '')));
    assert.match(message, /Name it with --database=inventoryai_prod_db/);
    assert.match(message, /Nothing was read/);
  });

  it('accepts production when it is named, and needs no confirmation phrase', () => {
    assert.equal(assertNamedReadTarget(read(DATABASE_NAMES.production)), DATABASE_NAMES.production);
  });

  it('refuses a name that is not the database the process resolved', () => {
    const message = messageOf(() =>
      assertNamedReadTarget(read(DATABASE_NAMES.production, DATABASE_NAMES.development)),
    );
    assert.match(message, /but the resolved database is "inventoryai_prod_db"/);
  });

  it('refuses a missing URI', () => {
    assert.match(
      messageOf(() => assertNamedReadTarget({ ...read(DATABASE_NAMES.development), mongodbUri: '' })),
      /MONGODB_URI is not set/,
    );
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
 * A destructive production run names the business it replaces (2026-10-25). Pure, so the rule is
 * asserted without a database — and shared by both account seeders, which is why one test covers both.
 */
describe('a production reset names the tenant it replaces', () => {
  const id = (letter) => letter.repeat(24);
  const base = {
    production: true,
    reused: true,
    requestedBusinessId: id('a'),
    businessId: id('b'),
    businessName: 'A real business',
    command: 'seed:demo',
  };

  it('says nothing in development, whatever the ids are', () => {
    assert.doesNotThrow(() => assertTenantNamedForReset({ ...base, production: false }));
    assert.doesNotThrow(() =>
      assertTenantNamedForReset({ ...base, production: false, requestedBusinessId: undefined }),
    );
  });

  it('allows a brand-new tenant, which has no id to name yet', () => {
    assert.doesNotThrow(() =>
      assertTenantNamedForReset({ ...base, reused: false, requestedBusinessId: undefined }),
    );
  });

  it('refuses an existing tenant with no id named', () => {
    const message = messageOf(() =>
      assertTenantNamedForReset({ ...base, requestedBusinessId: undefined }),
    );
    assert.match(message, /--business=<businessId> is required in production/);
    assert.match(message, /would REPLACE the data of business/);
    // A refusal here prevented a REPLACEMENT, not a first write; the message says so.
    assert.match(message, /Nothing was replaced/);
  });

  it('refuses an id that names another business', () => {
    const message = messageOf(() => assertTenantNamedForReset(base));
    assert.ok(
      message.includes(`names business ${id('a')}, but this account owns ${id('b')}`),
      message,
    );
    assert.match(message, /Refusing to reset a business that was not named/);
  });

  it('accepts the id the account actually owns, and names the command-specific hint', () => {
    assert.doesNotThrow(() => assertTenantNamedForReset({ ...base, requestedBusinessId: id('b') }));

    const message = messageOf(() =>
      assertTenantNamedForReset({
        ...base,
        requestedBusinessId: undefined,
        namingHint: 'the third field of --accounts',
        command: 'seed:accounts (a@x.com)',
      }),
    );
    assert.match(message, /the third field of --accounts is required in production/);
    assert.match(message, /seed:accounts \(a@x\.com\)/);
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
    'cleanup-demo-account.mjs',
    'seed-demo-tenant.mjs',
    'cleanup-demo-tenant.mjs',
    'seed-accounts.mjs',
    'seed-role-accounts.mjs',
    'cleanup-role-accounts.mjs',
    'seed-perf-tenant.mjs',
    'cleanup-perf-tenant.mjs',
    'verify-role-access.mjs',
    'restore-db.mjs',
  ];

  const MEASUREMENTS = ['measure-ai-tools.mjs', 'measure-ai-turns.mjs', 'verify-demo-data.mjs'];

  it('every seeder and cleanup resolves its target through a guard', () => {
    for (const name of SEEDERS) {
      const source = read(name);
      // `assertDemoTarget` is the demo tenant's own guard: it requires the database to be NAMED on
      // the command line, refuses the test database and refuses a re-run over another business.
      assert.match(
        source,
        /assertSeedTarget\(|assertSafeTarget\(|assertRestoreTarget\(|assertDemoTarget\(|assertNamedDatabaseTarget\(|assertScopedCleanupTarget\(/,
        `${name} has no target guard`,
      );
    }
  });

  it('every measurement checks the database it is about to read', () => {
    for (const name of MEASUREMENTS) {
      assert.match(
        read(name),
        /assertReadableTarget\(|assertMeasurementTarget\(|assertNamedReadTarget\(/,
        `${name} has no readable-target guard`,
      );
    }
  });

  it("the account cleanup empties one tenant's data and never an identity", () => {
    // F-50: deleting a login whose MongoDB record still exists is the one unrecoverable state,
    // so this command must use the data-only teardown and must be told which tenant it means.
    const source = read('cleanup-demo-account.mjs');
    assert.match(source, /clearTenantData\(\[businessId\]\)/, 'must use the shared data-only teardown');
    assert.equal(/removeTenant\(/.test(source), false, 'removeTenant also deletes users and the business row');
    assert.match(source, /--business=<24-character businessId> is required/, 'the tenant must be named');
    assert.match(
      source,
      /String\(user\.businessId\) !== String\(businessId\)/,
      'the account must agree with the named tenant before anything is removed',
    );
    // A destructive command reads its phrase from CLEANUP_CONFIRM, not the SEED_CONFIRM a seeder
    // export would satisfy. It also names the database, so it costs two phrases in development
    // and three in production — the same rule as the database-wide command.
    assert.match(source, /assertScopedCleanupTarget\(\{/);
    assert.match(source, /confirmPhrase: CONFIRM_PHRASE/);
    assert.match(source, /const CONFIRM_PHRASE = 'cleanup:demo-account'/);
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

describe('command audit — the refusals and previews fixed on 2026-10-27', () => {
  const read = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');

  it('verify:demo refuses a missing address BEFORE it connects', () => {
    // `User.findOne({ email: undefined })` drops the key, so the query becomes `findOne({})` —
    // the first user in the database. A run that forgot the flag would verify, and could pass,
    // an account nobody named. Ordering is the fix: the refusal has to precede the connection.
    const source = read('verify-demo-data.mjs');
    const refusal = source.indexOf('--email=<address> is required');
    const connect = source.indexOf('await mongoose.connect(');
    assert.notEqual(refusal, -1, 'the required-address refusal is gone');
    assert.ok(refusal < connect, 'the address must be validated before the connection opens');
    // A positional FLAG is not an address: `-- --database=…` used to be read as the email.
    assert.match(source, /process\.argv\[2\] && !process\.argv\[2\]\.startsWith\('--'\)/);
  });

  it('the demo-tenant refusal names SEED_CONFIRM, not only the command', () => {
    // The old message read `set seed:demo-tenant confirmation to "seed:demo-tenant"`, which never
    // told the operator what to export.
    const lib = read('demo/lib.mjs');
    assert.match(lib, /set SEED_CONFIRM=\$\{confirmPhrase\} to proceed/);
    assert.equal(
      /\$\{command\} confirmation to/.test(lib),
      false,
      'the message must name the variable the operator has to export',
    );
  });

  it('every data-writing command reads --dry-run, and previews before it can write', () => {
    // `--dry-run` was silently ignored by four commands. On a live database that meant a "preview"
    // wrote rows (`seed:perf-tenant`, `seed:demo-tenant`, `seed:perf`) or deleted every identity
    // (`cleanup:test-firebase`). Each now has a preview that stops before its first write, and the
    // anchor below IS that first write — so a branch moved after it fails here.
    const cases = [
      ['seed-perf-tenant.mjs', 'const identity = await resolveIdentity(SEED_OWNER_EMAIL);'],
      ['seed-demo-tenant.mjs', 'const result = await seedDemoTenant();'],
      ['seed-perf-data.mjs', 'await mongoose.connect('],
      ['cleanup-test-firebase.mjs', 'await performFirebaseCleanup({'],
    ];
    for (const [name, firstWrite] of cases) {
      const source = read(name);
      const flag = source.indexOf("process.argv.includes('--dry-run')");
      const write = source.indexOf(firstWrite);
      assert.notEqual(flag, -1, `${name} does not read --dry-run`);
      assert.notEqual(write, -1, `${name}: the anchor ${firstWrite} is gone`);
      assert.ok(flag < write, `${name} previews only after it can write`);
    }
  });

  it('cleanup:perf previews with the same plan it deletes', () => {
    // Every other cleanup has a preview; this one did not. The count must come from the shared
    // teardown plan, so the preview cannot describe a different tenant from the delete.
    const source = read('cleanup-perf-data.mjs');
    assert.match(source, /process\.argv\.includes\('--dry-run'\)/);
    const preview = source.indexOf('countTenantRemoval(ids)');
    const remove = source.indexOf('removeTenant(ids)');
    assert.notEqual(preview, -1, 'the dry run must count the shared teardown plan');
    assert.ok(preview < remove, 'the preview must be decided before anything is removed');
  });
});
