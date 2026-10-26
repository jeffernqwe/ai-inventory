// The unified seeding target guard — DB-FREE.
//
// This is the rule that decides whether a seeding run may write, and to WHERE, so
// it is asserted without a database: the guard is a pure function of a values bag
// and a resolved env, and a refusal must happen before anything is opened.
//
// What the tests pin, in the order the owner asked for it:
//   * development needs TWO phrases, production THREE — not the same number;
//   * the database must be named on the command line AND equal the resolved one;
//   * the test database and any unknown database are refused;
//   * every plan is listed, resolves to a script that exists, and has a unique phrase;
//   * `npm run seed` dispatches from that same table, so a plan cannot be reached
//     by any other name.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { DATABASE_NAMES } from '../src/config/env.ts';
import {
  SEED_CONFIRM_ENV,
  SEED_DB_CONFIRM_ENV,
  SEED_PLANS,
  SEED_PROD_CONFIRM_ENV,
  SEED_PROD_CONFIRM_PHRASE,
  assertSeedTarget,
  extractSeedPlanArg,
  requiredPhraseCount,
  resolveSeedPlan,
} from '../scripts/seed/guard.mjs';
import { SeedSafetyError } from '../scripts/perf/lib.mjs';
import {
  assertIdentityLinkUsable,
  countDisagreements,
  normaliseEmail,
  parseCount,
} from '../scripts/seed/lib.mjs';

const DEV = 'inventoryai_dev_db';
const PROD = 'inventoryai_prod_db';

function envFor(database) {
  // No database in the URI's path: this is the shape the real `.env` has, and the guard
  // refuses a URI that names a DIFFERENT database than the run targets (asserted below).
  return { mongodbUri: 'mongodb://example.invalid', mongodbDbName: database };
}

function messageOf(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof SeedSafetyError, `expected SeedSafetyError, got ${err?.name}`);
    return err.message;
  }
  assert.fail('expected the guard to refuse');
}

const base = {
  command: 'seed:demo',
  confirmPhrase: 'seed-demo-account',
};

describe('seeding target — development needs two phrases', () => {
  it('accepts the plan phrase plus the database name, and reports two', () => {
    const target = assertSeedTarget({
      ...base,
      env: envFor(DEV),
      database: DEV,
      values: { [SEED_CONFIRM_ENV]: 'seed-demo-account', [SEED_DB_CONFIRM_ENV]: DEV },
    });
    assert.deepEqual(target, { database: DEV, production: false, phrases: 2 });
  });

  it('refuses with ONE phrase and names the one that is missing', () => {
    const message = messageOf(() =>
      assertSeedTarget({
        ...base,
        env: envFor(DEV),
        database: DEV,
        values: { [SEED_CONFIRM_ENV]: 'seed-demo-account' },
      })
    );
    assert.match(message, /two confirmation phrase\(s\)/);
    assert.match(message, new RegExp(`${SEED_DB_CONFIRM_ENV}=${DEV}`));
    assert.match(message, /Nothing was written/);
  });

  it('reports both missing phrases together, so one run says everything', () => {
    const message = messageOf(() =>
      assertSeedTarget({ ...base, env: envFor(DEV), database: DEV, values: {} })
    );
    assert.match(message, /2 are missing or wrong/);
    assert.match(message, /SEED_CONFIRM=seed-demo-account/);
    assert.match(message, new RegExp(`${SEED_DB_CONFIRM_ENV}=${DEV}`));
  });

  it('a production phrase does NOT stand in for either development phrase', () => {
    const message = messageOf(() =>
      assertSeedTarget({
        ...base,
        env: envFor(DEV),
        database: DEV,
        values: { [SEED_PROD_CONFIRM_ENV]: SEED_PROD_CONFIRM_PHRASE },
      })
    );
    assert.match(message, /2 are missing or wrong/);
  });
});

describe('seeding target — production needs three phrases', () => {
  const values = {
    [SEED_CONFIRM_ENV]: 'seed-demo-account',
    [SEED_DB_CONFIRM_ENV]: PROD,
  };

  it('accepts all three and reports production', () => {
    const target = assertSeedTarget({
      ...base,
      env: envFor(PROD),
      database: PROD,
      values: { ...values, [SEED_PROD_CONFIRM_ENV]: SEED_PROD_CONFIRM_PHRASE },
    });
    assert.deepEqual(target, { database: PROD, production: true, phrases: 3 });
  });

  it('the two development phrases are not enough', () => {
    const message = messageOf(() =>
      assertSeedTarget({ ...base, env: envFor(PROD), database: PROD, values })
    );
    assert.match(message, /three confirmation phrase\(s\)/);
    assert.match(message, /PRODUCTION/);
    assert.match(message, new RegExp(`${SEED_PROD_CONFIRM_ENV}=${SEED_PROD_CONFIRM_PHRASE}`));
  });

  it('the count is a property of the target, not of the caller', () => {
    assert.equal(requiredPhraseCount(PROD), 3);
    assert.equal(requiredPhraseCount(DEV), 2);
  });
});

describe('seeding target — the database is named, checked and known', () => {
  const phrases = {
    [SEED_CONFIRM_ENV]: 'seed-demo-account',
    [SEED_DB_CONFIRM_ENV]: DEV,
  };

  it('refuses a missing --database', () => {
    const message = messageOf(() =>
      assertSeedTarget({ ...base, env: envFor(DEV), database: undefined, values: phrases })
    );
    assert.match(message, /--database=<name> is required/);
    assert.match(message, new RegExp(DEV));
  });

  it('refuses a name the process is not connected to', () => {
    const message = messageOf(() =>
      assertSeedTarget({ ...base, env: envFor(DEV), database: PROD, values: phrases })
    );
    assert.match(message, /but this process resolved/);
    assert.match(message, /Nothing was written/);
  });

  it('refuses the test database, which npm test clears', () => {
    const message = messageOf(() =>
      assertSeedTarget({
        ...base,
        env: envFor(DATABASE_NAMES.test),
        database: DATABASE_NAMES.test,
        values: { [SEED_CONFIRM_ENV]: 'seed-demo-account', [SEED_DB_CONFIRM_ENV]: DATABASE_NAMES.test },
      })
    );
    assert.match(message, /test database/);
    assert.match(message, /npm test/);
  });

  it('refuses an unknown database even when the flag agrees with it', () => {
    const message = messageOf(() =>
      assertSeedTarget({
        ...base,
        env: envFor('inventoryai_staging_db'),
        database: 'inventoryai_staging_db',
        values: {
          [SEED_CONFIRM_ENV]: 'seed-demo-account',
          [SEED_DB_CONFIRM_ENV]: 'inventoryai_staging_db',
        },
      })
    );
    assert.match(message, /not a seeding target/);
    assert.match(message, /inventoryai_dev_db, inventoryai_prod_db/);
  });

  it('refuses a missing MONGODB_URI before any other question', () => {
    const message = messageOf(() =>
      assertSeedTarget({
        ...base,
        env: { mongodbDbName: DEV },
        database: DEV,
        values: phrases,
      })
    );
    assert.match(message, /MONGODB_URI is not set/);
  });

  it('refuses when the CONNECTION STRING names a different database than the run', () => {
    // The flag and the resolved name agree; the shell is still configured for production.
    const message = messageOf(() =>
      assertSeedTarget({
        ...base,
        env: {
          mongodbUri: 'mongodb+srv://user:secret@cluster.example.net/inventoryai_prod_db?retryWrites=true',
          mongodbDbName: DEV,
        },
        database: DEV,
        values: phrases,
      })
    );
    assert.match(message, /MONGODB_URI names the database "inventoryai_prod_db"/);
    assert.match(message, /this run resolved "inventoryai_dev_db"/);
    assert.match(message, /Nothing was written/);
    assert.doesNotMatch(message, /secret/, 'the refusal must not echo the connection string');
  });

  it('accepts a connection string that names the same database, or names none', () => {
    const withPath = assertSeedTarget({
      ...base,
      env: { mongodbUri: `mongodb+srv://u:p@cluster.example.net/${DEV}`, mongodbDbName: DEV },
      database: DEV,
      values: phrases,
    });
    assert.equal(withPath.database, DEV);
  });
});

describe('an existing account whose identity link is stale is refused, not repaired', () => {
  it('accepts only the uid Firebase reports now', () => {
    assert.equal(
      assertIdentityLinkUsable({ email: 'a@x.com', storedUid: 'same-uid', resolvedUid: 'same-uid' }),
      true
    );
  });

  it('names both uids when the stored one is stale, and writes nothing', () => {
    // Measured 2026-10-26: every development row held a uid no longer in Firebase, so the
    // uid lookup missed and the seeder died on users.email_1 with a raw E11000.
    const message = messageOf(() =>
      assertIdentityLinkUsable({
        email: 'owner@example.com',
        storedUid: 'IWzTZqwaqpXCX6MqwJS4WHWWgL62',
        resolvedUid: 'j4me82omLPPGQmc6wCX1q4UTIWr1',
      })
    );
    assert.match(message, /owner@example\.com/);
    assert.match(message, /IWzTZqwaqp…/);
    assert.match(message, /j4me82omLP…/);
    assert.match(message, /409 EMAIL_IN_USE/);
    assert.match(message, /nothing a data seeder does implicitly|not\s+something a data seeder does implicitly/);
    assert.match(message, /Nothing was written/);
  });

  it('refuses a legacy account with no identity at all, rather than attaching one', () => {
    const message = messageOf(() =>
      assertIdentityLinkUsable({ email: 'old@example.com', storedUid: null, resolvedUid: 'new-uid' })
    );
    assert.match(message, /carries NO Firebase identity/);
    assert.match(message, /Nothing was written/);
  });
});

describe('the plan table and the dispatcher', () => {
  it('every plan names a script that exists and a unique phrase', () => {
    const phrases = new Set();
    for (const [key, plan] of Object.entries(SEED_PLANS)) {
      assert.match(key, /^[a-z]+$/, `unexpected plan key ${key}`);
      assert.ok(plan.description && plan.description.length > 10, `${key} has no description`);
      assert.ok(
        existsSync(new URL(`../scripts/${plan.script}`, import.meta.url)),
        `plan ${key} points at a missing script: ${plan.script}`
      );
      assert.equal(phrases.has(plan.phrase), false, `phrase reused by another plan: ${plan.phrase}`);
      phrases.add(plan.phrase);
    }
    assert.deepEqual([...phrases].sort(), ['seed-accounts', 'seed-demo-account', 'seed-roles']);
  });

  it('--plan is accepted with = or with a space, and stripped from the forwarded args', () => {
    assert.deepEqual(extractSeedPlanArg(['--plan=demo', '--email=a@x.com']), {
      plan: 'demo',
      rest: ['--email=a@x.com'],
    });
    assert.deepEqual(extractSeedPlanArg(['--plan', 'roles', '--dry-run']), {
      plan: 'roles',
      rest: ['--dry-run'],
    });
    assert.deepEqual(extractSeedPlanArg(['--email=a@x.com']), {
      plan: undefined,
      rest: ['--email=a@x.com'],
    });
    // A second positional after `--plan` is NOT part of the plan: only one value is
    // consumed, so `--plan demo --email` cannot swallow the next flag.
    assert.deepEqual(extractSeedPlanArg(['--plan', 'demo', '--email=a@x.com']), {
      plan: 'demo',
      rest: ['--email=a@x.com'],
    });
  });

  it('an unknown or missing plan is refused rather than defaulted', () => {
    assert.match(messageOf(() => resolveSeedPlan('everything')), /unknown --plan "everything"/);
    assert.match(messageOf(() => resolveSeedPlan('')), /--plan=<demo\|accounts\|roles> is required/);
    assert.equal(resolveSeedPlan(' DEMO ').plan, 'demo');
  });

  it('the single command, the three plans and the direct aliases all agree', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    assert.equal(packageJson.scripts.seed, 'node scripts/seed.mjs');
    assert.equal(packageJson.scripts['seed:demo'], 'node scripts/seed-demo-account.mjs');
    assert.equal(packageJson.scripts['seed:accounts'], 'node scripts/seed-accounts.mjs');
    assert.equal(packageJson.scripts['seed:roles'], 'node scripts/seed-role-accounts.mjs');

    // The dispatcher must not carry its own copy of the mapping, and every seeder in
    // the workflow must call the shared guard: that is what makes `npm run seed` and
    // `npm run seed:demo` impossible to disagree about what is safe.
    const dispatcher = readFileSync(new URL('../scripts/seed.mjs', import.meta.url), 'utf8');
    assert.match(dispatcher, /resolveSeedPlan\(/);
    for (const name of ['seed-demo-account.mjs', 'seed-accounts.mjs', 'seed-role-accounts.mjs']) {
      const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');
      assert.match(source, /assertSeedTarget\(/, `${name} does not use the unified guard`);
      assert.equal(
        /assertSafeTarget\(/.test(source),
        false,
        `${name} still calls the old one-phrase guard`
      );
    }

    // The email collision has ONE explanation and ONE refusal, in the shared core.
    const lib = readFileSync(new URL('../scripts/seed/lib.mjs', import.meta.url), 'utf8');
    assert.match(lib, /assertIdentityLinkUsable\(\{/, 'the stale-link refusal is not applied');
  });
});

// ---------------------------------------------------------------------------
// The CLI boundary: one spelling for an address, one parser for a size, and the
// read-back that makes "OK" a measurement rather than a claim.
// ---------------------------------------------------------------------------
describe('seeding helpers — addresses, sizes and the read-back', () => {
  it('normalises an address the way the schema stores it', () => {
    assert.equal(normaliseEmail('  Jeffern@Example.COM '), 'jeffern@example.com');
    assert.equal(normaliseEmail('a+tag@x.co'), 'a+tag@x.co');
    assert.equal(normaliseEmail(undefined), '');
    assert.equal(normaliseEmail(null), '');
  });

  it('accepts a whole number inside the range', () => {
    assert.equal(parseCount('900', { name: '--total', min: 100, max: 400000 }), 900);
    assert.equal(parseCount(' 80 ', { name: '--total', min: 1, max: 100 }), 80);
    // No upper bound: a PRNG seed is any non-negative integer.
    assert.equal(parseCount('4294967296', { name: '--seed', min: 0 }), 4294967296);
    assert.throws(() => parseCount('-1', { name: '--seed', min: 0 }), /at least 0/);
  });

  it('uses the fallback only when the flag is absent or blank', () => {
    const spec = { name: '--total', min: 1, max: 100, fallback: 60 };
    assert.equal(parseCount(undefined, spec), 60);
    assert.equal(parseCount('', spec), 60);
    assert.equal(parseCount('61', spec), 61);
  });

  it('refuses a value parseInt would silently truncate', () => {
    // parseInt answered 900, 12 and 1 for these; a dataset of the wrong size cannot be
    // noticed later, because nothing records what the size was meant to be.
    for (const bad of ['900abc', '12.9', '1e3', '-5', ' ', 'NaN']) {
      assert.throws(
        () => parseCount(bad, { name: '--total', min: 1, max: 100000 }),
        /must be a whole number between 1 and 100000/,
        bad,
      );
    }
  });

  it('refuses a value outside the range, including zero', () => {
    assert.throws(() => parseCount('0', { name: '--total', min: 100, max: 200 }), /between 100 and 200/);
    assert.throws(() => parseCount('201', { name: '--total', min: 100, max: 200 }), /between 100 and 200/);
  });

  it('every refusal says nothing was written', () => {
    assert.throws(() => parseCount('abc', { name: '--total', min: 1, max: 2 }), /Nothing was written\./);
    assert.throws(() => parseCount('', { name: '--total', min: 1, max: 2 }), /Nothing was written\./);
  });

  it('the read-back comparison names each collection that disagrees', () => {
    const written = { products: 10, inventory: 10, purchase_orders: 2 };
    assert.deepEqual(countDisagreements(written, { ...written }), []);
    assert.deepEqual(countDisagreements(written, { products: 9, inventory: 10, purchase_orders: 2 }), [
      { collection: 'products', wrote: 10, found: 9 },
    ]);
    // A collection the read-back did not report is a disagreement, not a pass.
    assert.deepEqual(countDisagreements(written, { products: 10, inventory: 10 }), [
      { collection: 'purchase_orders', wrote: 2, found: undefined },
    ]);
  });

  it('the seeders use the shared helpers rather than their own copies', () => {
    const read = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');
    const demo = read('seed-demo-account.mjs');
    const accounts = read('seed-accounts.mjs');
    const roles = read('seed-role-accounts.mjs');

    assert.match(demo, /normaliseEmail\(argValue\('--email'\)\)/, 'demo does not normalise the address');
    assert.match(
      accounts,
      /const email = normaliseEmail\(parts\[0\]\)/,
      'accounts does not normalise plan addresses',
    );

    for (const [name, source] of [['demo', demo], ['accounts', accounts], ['roles', roles]]) {
      assert.match(source, /parseCount\(/, `${name} does not use the strict size parser`);
      assert.equal(
        /Number\.parseInt\(\s*argValue\('--(total|seed)'\)/.test(source),
        false,
        `${name} still parses a size or seed with parseInt`,
      );
      assert.match(source, /readTenantCounts\(/, `${name} does not read the tenant back`);
      assert.match(source, /countDisagreements\(/, `${name} does not compare the read-back`);
    }
  });
});
