/**
 * Guide 14 — the command runbook, read against the scripts it describes.
 *
 * WHY THIS EXISTS. Guide 14 is the one page an operator copies from while running against either
 * `inventoryai_prod_db` or `inventoryai_dev_db`. A renamed script, a changed confirmation phrase, a
 * `--database=` that no longer equals `MONGODB_DB_NAME`, a development block carrying a production
 * phrase, or a missing `--dry-run` is not a typo: it is a command that either refuses at the terminal
 * or, worse, is accepted with a phrase that belongs to another operation. This file proves the
 * runbook's *invocations* are internally consistent and carry the phrases their guards actually
 * require, in the environment each block names.
 *
 * WHAT IT MEASURES.
 *
 *  * Every `npm run <script>` in Guide 14 is a script in `server/package.json`.
 *  * Every command block names `NODE_ENV` and `MONGODB_DB_NAME`, the pair matches the environment, and
 *    every `--database=` equals that database.
 *  * Production seeders carry their own `SEED_CONFIRM`, plus `SEED_DB_CONFIRM=inventoryai_prod_db` and
 *    `SEED_PROD_CONFIRM`; development seeders carry the first two and **not** the third.
 *  * Production cleanups carry their own `CLEANUP_CONFIRM`, plus `CLEANUP_DB_CONFIRM` and
 *    `CLEANUP_PROD_CONFIRM`; development cleanups carry the first two and **not** the third.
 *  * `seed:demo-tenant` is the one-phrase exception in both environments; `seed:perf` and
 *    `cleanup:perf` are the one-phrase development-only exceptions. Each is asserted in both
 *    directions: the phrase is present and the phrases it must not use are absent.
 *  * Every command has the arguments that make it the operation named, per environment: a production
 *    `check:accounts` needs `--with-production`, a development one must not have it; a production
 *    `verify:roles` needs `--base=`/`--signin`, a development one must not; production `seed --plan=demo`
 *    needs `--business=`, development resolves it.
 *  * Every writing command has both a `--dry-run` block and an execute block, in each environment where
 *    it is allowed.
 *  * The commands production refuses appear only under a refusal heading; `cleanup:test-firebase` is
 *    never printed without `--dry-run` in either environment.
 *  * Every `--flag` printed in a block exists somewhere in `server/scripts`, and the removed
 *    `--include-sku` never comes back.
 *  * All four `codes=` modes are present.
 *  * A3.1's status label is `PROD PREVIEW ONLY`, its size is the production measurement A1.1 records,
 *    and its post-delete proof is `check:accounts` — the command that can pass on an empty tenant.
 *  * Every other A3 cleanup section (A3.2–A3.8) has its status label pinned to the evidence its own
 *    paragraph states and to the exact command set and preview/execute shape the section carries.
 *
 * WHAT IT IS NOT. It does not run a command, connect to a database or prove that a command is safe; the
 * scripts' own guards do that at run time. It reads the guide and the scripts' own constants. It pins the
 * cleanup status labels because promoting one requires running the command and recording the result; a
 * label may not drift from the command or the figure that earned it.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SEED_PLANS, SEED_PROD_CONFIRM_PHRASE } from '../scripts/seed/guard.mjs';
import { DEMO_CLEANUP_CONFIRM, DEMO_SEED_CONFIRM } from '../scripts/demo/lib.mjs';
import {
  CLEANUP_CONFIRM_PHRASE as ROLE_CLEANUP_CONFIRM,
  SEED_CONFIRM_PHRASE as ROLE_SEED_CONFIRM,
} from '../scripts/role-test/lib.mjs';
import {
  PERF_TENANT_CLEANUP_CONFIRM,
  PERF_TENANT_SEED_CONFIRM,
  SEED_CONFIRM_PHRASE as PERF_SEED_CONFIRM,
} from '../scripts/perf/lib.mjs';
import { CLEANUP_TARGETS } from '../scripts/cleanup/guard.mjs';
import { PRODUCTION_CONFIRM_PHRASE } from '../scripts/cleanup/lib.mjs';
import { BACKUP_CONFIRM_PHRASE, RESTORE_CONFIRM_PHRASE } from '../scripts/backup/lib.mjs';

const GUIDE = new URL('../../docs/guides/14-command-runbook.md', import.meta.url);
const REFERENCE = readFileSync(GUIDE, 'utf8');

const PROD_DB = 'inventoryai_prod_db';
const DEV_DB = 'inventoryai_dev_db';
const TEST_DB = 'inventoryai_test_db';

const ENV_DB = {
  production: PROD_DB,
  development: DEV_DB,
  test: TEST_DB,
};

const scripts = new Set(
  Object.keys(
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts ?? {},
  ),
);

/** Read a `const NAME = '…'` from a CLI that does not export it. */
function constantFrom(file, name = 'CONFIRM_PHRASE') {
  const source = readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
  const match = source.match(new RegExp(`const ${name} = '([^']+)'`));
  assert.ok(match, `${file} no longer declares ${name} — the runbook guard reads it`);
  return match[1];
}

const ACCOUNT_CLEANUP_PHRASE = constantFrom('cleanup-accounts.mjs');
const ACCOUNT_CLEANUP_PRESET_PHRASE = constantFrom('cleanup-accounts.mjs', 'PRESET_PHRASE');
const DEMO_ACCOUNT_CLEANUP_PHRASE = constantFrom('cleanup-demo-account.mjs');
const SEED_ACCOUNTS_PRESET_PHRASE = constantFrom('seed-accounts.mjs', 'PRESET_PHRASE');

const SEED_PHRASES = {
  'seed:accounts': SEED_PLANS.accounts.phrase,
  'seed:demo': SEED_PLANS.demo.phrase,
  'seed:demo-tenant': DEMO_SEED_CONFIRM,
  'seed:perf-tenant': PERF_TENANT_SEED_CONFIRM,
  'seed:roles': ROLE_SEED_CONFIRM,
  'seed:three': SEED_ACCOUNTS_PRESET_PHRASE,
  'seed:perf': PERF_SEED_CONFIRM,
};

const CLEANUP_PHRASES = {
  'cleanup:account': ACCOUNT_CLEANUP_PHRASE,
  'cleanup:demo': DEMO_ACCOUNT_CLEANUP_PHRASE,
  'cleanup:demo-tenant': DEMO_CLEANUP_CONFIRM,
  'cleanup:roles': ROLE_CLEANUP_CONFIRM,
  'cleanup:perf-tenant': PERF_TENANT_CLEANUP_CONFIRM,
  'cleanup:three': ACCOUNT_CLEANUP_PRESET_PHRASE,
  'cleanup:perf': PERF_SEED_CONFIRM,
  'cleanup:test-firebase': 'cleanup:test-firebase',
};

const CLEANUP_TARGET_PHRASES = {
  database: CLEANUP_TARGETS.database.phrase,
  firebase: CLEANUP_TARGETS.firebase.phrase,
};

/** Production refuses these; the guide must present them as refusals, not as a plan. */
const PROD_REFUSED = new Set([
  'seed:three',
  'seed:perf',
  'cleanup:three',
  'cleanup:perf',
  'cleanup:test-firebase',
]);

/** Commands that are development-only and therefore outside the production pair set. */
const DEV_ONLY = new Set(['seed:perf', 'cleanup:perf']);

/** Read-only commands; they must never carry a write phrase. */
const READ_ONLY = new Set(['check:accounts', 'verify:demo', 'audit:indexes']);

const WRITE = new Set([
  'seed',
  'seed:accounts',
  'seed:demo',
  'seed:demo-tenant',
  'seed:perf',
  'seed:perf-tenant',
  'seed:roles',
  'seed:three',
  'cleanup',
  'cleanup:account',
  'cleanup:demo',
  'cleanup:demo-tenant',
  'cleanup:perf',
  'cleanup:perf-tenant',
  'cleanup:roles',
  'cleanup:three',
  'cleanup:test-firebase',
]);

/** The write commands each runbook must actually contain, both preview and execute. */
const REQUIRED_KEYS = {
  production: [
    'seed:accounts',
    'plan:demo',
    'seed:demo',
    'seed:demo-tenant',
    'seed:perf-tenant',
    'seed:roles',
    'cleanup:account',
    'cleanup:demo',
    'cleanup:demo-tenant',
    'cleanup:perf-tenant',
    'cleanup:roles',
    'target:database',
    'target:firebase',
  ],
  development: [
    'seed:accounts',
    'plan:demo',
    'seed:demo-tenant',
    'seed:perf-tenant',
    'seed:roles',
    'seed:three',
    'seed:perf',
    'cleanup:account',
    'cleanup:demo',
    'cleanup:demo-tenant',
    'cleanup:perf-tenant',
    'cleanup:roles',
    'cleanup:three',
    'cleanup:perf',
    'target:database',
    'target:firebase',
  ],
};

/** Arguments that make each command the operation named. `env` narrows the requirement. */
const REQUIRED_ARGS = {
  'check:accounts': { production: ['--with-production'], development: [] },
  'seed:accounts': { production: ['--accounts=', '--database='], development: ['--accounts=', '--database='] },
  'seed:demo': { production: ['--email=', '--business=', '--total=', '--database='] },
  'plan:demo': {
    production: ['--plan=demo', '--email=', '--business=', '--total=', '--database='],
    development: ['--plan=demo', '--email=', '--total=', '--database='],
  },
  'seed:demo-tenant': { production: ['--database='], development: ['--database='] },
  'seed:perf-tenant': { production: ['--size=', '--database='], development: ['--size=', '--database='] },
  'seed:roles': { production: ['--database=', 'ROLE_TEST_PASSWORD='], development: ['--database=', 'ROLE_TEST_PASSWORD='] },
  'seed:three': { development: ['--database='] },
  'seed:perf': { development: ['--size='] },
  'verify:demo': { production: ['--database='], development: ['--database='] },
  'verify:roles': {
    production: ['--business=', '--database=', '--base=', '--signin'],
    development: ['--business=', '--database='],
  },
  'cleanup:account': { production: ['--accounts=', '--database='], development: ['--accounts=', '--database='] },
  'cleanup:demo': { production: ['--email=', '--business=', '--database='], development: ['--email=', '--business=', '--database='] },
  'cleanup:demo-tenant': { production: ['--database='], development: ['--database='] },
  'cleanup:perf-tenant': { production: ['--database='], development: ['--database='] },
  'cleanup:roles': { production: ['--database='], development: ['--database='] },
  'cleanup:three': { development: ['--database='] },
  'cleanup:perf': { development: [] },
  'target:database': { production: ['--target=database', '--database='], development: ['--target=database', '--database='] },
  'target:firebase': { production: ['--target=firebase', '--email=', '--database='], development: ['--target=firebase', '--email=', '--database='] },
  'backup:db': { production: ['BACKUP_DIR=', `CONFIRM=${BACKUP_CONFIRM_PHRASE}`], development: ['BACKUP_DIR=', `CONFIRM=${BACKUP_CONFIRM_PHRASE}`] },
  'restore:db': { test: [`CONFIRM=${RESTORE_CONFIRM_PHRASE}`, '--from='] },
};

/** Fenced `bash` blocks, each with the nearest heading above it. */
function bashBlocks(text) {
  const blocks = [];
  let heading = '';
  let current = null;

  for (const line of String(text).split(/\r?\n/)) {
    const headingMatch = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (!current && headingMatch) {
      heading = headingMatch[1];
      continue;
    }
    const fence = line.match(/^```(\w*)\s*$/);
    if (!current && fence) {
      current = { heading, lang: fence[1], lines: [] };
      continue;
    }
    if (current && /^```\s*$/.test(line)) {
      blocks.push({ heading: current.heading, lang: current.lang, text: current.lines.join('\n') });
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  return blocks.filter((block) => block.lang === 'bash');
}

/** The heading's section, up to the next heading of the same or a higher level. */
function sectionByHeading(text, pattern) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((line) => pattern.test(line));
  assert.ok(start >= 0, `Guide 14 no longer has a heading matching ${pattern}`);
  const level = (lines[start].match(/^#+/) ?? [''])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const heading = lines[i].match(/^#+/);
    if (heading && heading[0].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The `**Status:**` paragraph, including its wrapped continuation lines. */
function statusBlock(section, where) {
  const lines = String(section).split(/\r?\n/);
  const starts = lines
    .map((line, index) => (/^\*\*Status:\*\*/.test(line) ? index : -1))
    .filter((index) => index >= 0);
  assert.equal(starts.length, 1, `${where} must carry exactly one **Status:** paragraph`);
  let end = starts[0];
  while (end + 1 < lines.length && lines[end + 1].trim() !== '') end += 1;
  return lines.slice(starts[0], end + 1).join('\n');
}

/** The bold label a status paragraph opens with. */
function statusLabel(status, where) {
  const match = String(status).match(/^\*\*Status:\*\* \*\*([^*]+)\*\*/);
  assert.ok(match, `${where} no longer opens with a bold status label`);
  return match[1];
}

/** `13332` as the page writes it: `13 332`. */
function spaced(number) {
  return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Every distinct `npm run <name>` in a text. */
function scriptNames(text) {
  return [
    ...new Set(
      [...String(text).matchAll(/npm run ([a-zA-Z0-9][a-zA-Z0-9:_-]*)/g)].map((match) => match[1]),
    ),
  ];
}

function escape(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The value of `NAME=value` in a block, if present. */
function value(text, name) {
  const match = String(text).match(new RegExp(`(?:^|\\s)${escape(name)}=([^\\s\\\\]+)`));
  return match ? match[1] : undefined;
}

/** Every `--flag=value` value in a block. */
function flagValues(text, flag) {
  return [...String(text).matchAll(new RegExp(`${escape(flag)}=([^\\s\\\\]+)`, 'g'))].map(
    (match) => match[1],
  );
}

function planOf(text) {
  const match = String(text).match(/--plan(?:=|\s+)([a-z0-9-]+)/);
  return match ? match[1] : undefined;
}

function targetOf(text) {
  const match = String(text).match(/--target=([a-z]+)/);
  return match ? match[1] : undefined;
}

function keyFor(name, text) {
  if (name === 'seed') return `plan:${planOf(text)}`;
  if (name === 'cleanup') return `target:${targetOf(text)}`;
  return name;
}

function environmentOf(block) {
  return value(block.text, 'NODE_ENV');
}

function isRefusal(block) {
  return /refus/i.test(block.heading);
}

function assertEnvironment(block) {
  const env = environmentOf(block);
  assert.ok(env, `a command block under "${block.heading}" does not name NODE_ENV`);
  assert.ok(ENV_DB[env], `a block names NODE_ENV=${env}, which this page does not describe`);

  const db = value(block.text, 'MONGODB_DB_NAME');
  assert.equal(db, ENV_DB[env], `a ${env} block names MONGODB_DB_NAME=${db ?? '(none)'}`);

  for (const flag of flagValues(block.text, '--database')) {
    assert.equal(flag, db, `--database=${flag} disagrees with MONGODB_DB_NAME=${db}`);
  }

  if (env === 'development') {
    assert.equal(
      value(block.text, 'SEED_PROD_CONFIRM'),
      undefined,
      `a development block in "${block.heading}" carries SEED_PROD_CONFIRM`,
    );
    assert.equal(
      value(block.text, 'CLEANUP_PROD_CONFIRM'),
      undefined,
      `a development block in "${block.heading}" carries CLEANUP_PROD_CONFIRM`,
    );
  }
}

function assertSeed(name, block) {
  const env = environmentOf(block);
  const text = block.text;
  const expected = name === 'seed' ? SEED_PLANS[planOf(text)]?.phrase : SEED_PHRASES[name];
  assert.ok(expected, `${name} has no phrase mapping in this guard`);

  assert.equal(value(text, 'SEED_CONFIRM'), expected, `${name} must carry SEED_CONFIRM=${expected}`);

  const onePhrase = name === 'seed:demo-tenant' || name === 'seed:perf';
  if (onePhrase) {
    assert.equal(
      value(text, 'SEED_DB_CONFIRM'),
      undefined,
      `${name} takes one phrase; SEED_DB_CONFIRM is not part of it`,
    );
    assert.equal(
      value(text, 'SEED_PROD_CONFIRM'),
      undefined,
      `${name} takes one phrase; SEED_PROD_CONFIRM is not part of it`,
    );
    return;
  }

  assert.equal(
    value(text, 'SEED_DB_CONFIRM'),
    ENV_DB[env],
    `${name} must carry SEED_DB_CONFIRM=${ENV_DB[env]}`,
  );

  if (env === 'production') {
    assert.equal(
      value(text, 'SEED_PROD_CONFIRM'),
      SEED_PROD_CONFIRM_PHRASE,
      `${name} must carry SEED_PROD_CONFIRM=${SEED_PROD_CONFIRM_PHRASE}`,
    );
  } else {
    assert.equal(
      value(text, 'SEED_PROD_CONFIRM'),
      undefined,
      `${name} must not carry SEED_PROD_CONFIRM in development`,
    );
  }
}

function assertCleanup(name, block) {
  const env = environmentOf(block);
  const text = block.text;
  const expected = name === 'cleanup' ? CLEANUP_TARGET_PHRASES[targetOf(text)] : CLEANUP_PHRASES[name];
  assert.ok(expected, `${name} has no phrase mapping in this guard`);

  if (name === 'cleanup:perf') {
    assert.equal(
      value(text, 'SEED_CONFIRM'),
      PERF_SEED_CONFIRM,
      `cleanup:perf must carry SEED_CONFIRM=${PERF_SEED_CONFIRM}`,
    );
    assert.equal(value(text, 'CLEANUP_CONFIRM'), undefined, 'cleanup:perf reads SEED_CONFIRM, not CLEANUP_CONFIRM');
    assert.equal(value(text, 'CLEANUP_DB_CONFIRM'), undefined, 'cleanup:perf takes no CLEANUP_DB_CONFIRM');
    assert.equal(value(text, 'CLEANUP_PROD_CONFIRM'), undefined, 'cleanup:perf takes no CLEANUP_PROD_CONFIRM');
    return;
  }

  assert.equal(
    value(text, 'CLEANUP_CONFIRM'),
    expected,
    `${name} must carry CLEANUP_CONFIRM=${expected}`,
  );
  assert.equal(
    value(text, 'CLEANUP_DB_CONFIRM'),
    ENV_DB[env],
    `${name} must carry CLEANUP_DB_CONFIRM=${ENV_DB[env]}`,
  );

  if (env === 'production') {
    assert.equal(
      value(text, 'CLEANUP_PROD_CONFIRM'),
      PRODUCTION_CONFIRM_PHRASE,
      `${name} must carry CLEANUP_PROD_CONFIRM=${PRODUCTION_CONFIRM_PHRASE}`,
    );
  } else {
    assert.equal(
      value(text, 'CLEANUP_PROD_CONFIRM'),
      undefined,
      `${name} must not carry CLEANUP_PROD_CONFIRM in development`,
    );
  }
}

function assertRequiredArgs(key, block) {
  const env = environmentOf(block);
  const required = REQUIRED_ARGS[key]?.[env] ?? [];
  for (const fragment of required) {
    assert.ok(
      block.text.includes(fragment),
      `${key} block in "${block.heading}" (${env}) is missing ${fragment}`,
    );
  }

  if (key === 'verify:demo') {
    assert.ok(
      block.text.includes('--email=') || block.text.includes('--accounts='),
      `verify:demo block in "${block.heading}" must name --email= or --accounts=`,
    );
  }
  if (key === 'check:accounts' && env === 'development') {
    assert.ok(
      !block.text.includes('--with-production'),
      'a development check:accounts block must not pass --with-production',
    );
  }
  if (key === 'verify:roles' && env === 'development') {
    assert.ok(!block.text.includes('--signin'), 'a development verify:roles block must not pass --signin');
    assert.ok(!block.text.includes('--base='), 'a development verify:roles block must not pass --base=');
  }
}

/** Every `.mjs` file under `server/scripts`, concatenated. */
function allScriptSources() {
  const root = fileURLToPath(new URL('../scripts/', import.meta.url));
  const chunks = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.mjs')) chunks.push(readFileSync(path, 'utf8'));
    }
  };
  walk(root);
  return chunks.join('\n');
}

const SCRIPT_SOURCE = allScriptSources();

describe('Guide 14 — the command runbook is internally consistent in both environments', () => {
  test('the guide is present and names both targets and all four code modes', () => {
    assert.ok(REFERENCE.length > 10_000, 'Guide 14 is missing or has been emptied');
    assert.match(REFERENCE, /NODE_ENV=production/);
    assert.match(REFERENCE, /NODE_ENV=development/);
    assert.match(REFERENCE, /MONGODB_DB_NAME=inventoryai_prod_db/);
    assert.match(REFERENCE, /MONGODB_DB_NAME=inventoryai_dev_db/);
    assert.match(REFERENCE, /--database=inventoryai_prod_db/);
    assert.match(REFERENCE, /--database=inventoryai_dev_db/);

    // One page, two named runbooks — not a production sheet with a development appendix.
    assert.equal((REFERENCE.match(/^# /gm) ?? []).length, 1, 'Guide 14 must have exactly one title');
    assert.match(REFERENCE, /^## A\. Production runbook$/m);
    assert.match(REFERENCE, /^## B\. Development runbook$/m);

    for (const mode of ['both', 'sku', 'barcode', 'none']) {
      assert.match(
        REFERENCE,
        new RegExp(`codes=${mode}\\b`),
        `the runbook no longer documents codes=${mode}`,
      );
    }
  });

  test('every npm run name in the guide is a real server script', () => {
    const names = [...new Set([...REFERENCE.matchAll(/npm run ([a-zA-Z0-9][a-zA-Z0-9:_-]*)/g)].map((m) => m[1]))];
    assert.ok(names.length >= 15, `the extractor found only ${names.length} commands`);
    for (const name of names) {
      assert.ok(scripts.has(name), `Guide 14 tells the reader to run npm run ${name}, which does not exist`);
    }
  });

  test('each command block names one database, and the flag agrees with it', () => {
    const blocks = bashBlocks(REFERENCE);
    assert.ok(blocks.length >= 40, `the extractor found only ${blocks.length} bash blocks`);
    for (const block of blocks) {
      if (scriptNames(block.text).length > 0) assertEnvironment(block);
    }
  });

  test('each seeder carries the phrases its guard requires in that environment', () => {
    let seeders = 0;
    for (const block of bashBlocks(REFERENCE)) {
      for (const name of scriptNames(block.text)) {
        if (!name.startsWith('seed')) continue;
        if (name !== 'seed' && !SEED_PHRASES[name]) continue;

        const env = environmentOf(block);
        if (env === 'production' && PROD_REFUSED.has(name)) {
          assert.ok(isRefusal(block), `${name} appears in production under "${block.heading}", not a refusal`);
          continue;
        }
        assertSeed(name, block);
        seeders += 1;
      }
    }
    assert.ok(seeders >= 14, `the guard found only ${seeders} seeded command blocks`);
  });

  test('each cleanup carries the phrases its guard requires in that environment', () => {
    let cleanups = 0;
    for (const block of bashBlocks(REFERENCE)) {
      for (const name of scriptNames(block.text)) {
        if (!name.startsWith('cleanup')) continue;

        if (name === 'cleanup:test-firebase') {
          assert.match(block.text, /--dry-run\b/, 'Guide 14 prints the destructive cleanup:test-firebase form');
          continue;
        }

        const env = environmentOf(block);
        if (env === 'production' && PROD_REFUSED.has(name)) {
          assert.ok(isRefusal(block), `${name} appears in production under "${block.heading}", not a refusal`);
          continue;
        }
        assertCleanup(name, block);
        cleanups += 1;
      }
    }
    assert.ok(cleanups >= 16, `the guard found only ${cleanups} cleanup command blocks`);
  });

  test('every command carries the arguments that make it that operation', () => {
    for (const block of bashBlocks(REFERENCE)) {
      for (const name of scriptNames(block.text)) {
        const key = keyFor(name, block.text);
        if (!(key in REQUIRED_ARGS)) continue;
        assertRequiredArgs(key, block);
      }
    }
  });

  test('every writing command has both a preview and an execute block, per environment', () => {
    const seen = new Map();

    for (const block of bashBlocks(REFERENCE)) {
      const env = environmentOf(block);
      for (const name of scriptNames(block.text)) {
        if (!WRITE.has(name) || READ_ONLY.has(name)) continue;
        if (name === 'cleanup:test-firebase') continue;
        if (env === 'production' && PROD_REFUSED.has(name)) continue;
        if (env === 'production' && DEV_ONLY.has(name)) continue;

        const key = keyFor(name, block.text);
        const slot = seen.get(`${env}:${key}`) ?? { preview: false, execute: false };
        if (/--dry-run\b/.test(block.text)) slot.preview = true;
        else slot.execute = true;
        seen.set(`${env}:${key}`, slot);
      }
    }

    for (const [env, keys] of Object.entries(REQUIRED_KEYS)) {
      for (const key of keys) {
        const slot = seen.get(`${env}:${key}`);
        assert.ok(slot, `${key} is missing from the ${env} runbook`);
        assert.ok(slot.preview, `${key} has no --dry-run preview in the ${env} runbook`);
        assert.ok(slot.execute, `${key} has no execute form in the ${env} runbook`);
      }
    }
  });

  test('the read-only commands never carry a write confirmation phrase', () => {
    for (const block of bashBlocks(REFERENCE)) {
      const names = scriptNames(block.text);
      if (!names.some((name) => READ_ONLY.has(name))) continue;
      assert.equal(
        value(block.text, 'SEED_PROD_CONFIRM'),
        undefined,
        `a read-only block in "${block.heading}" carries SEED_PROD_CONFIRM`,
      );
      assert.equal(
        value(block.text, 'CLEANUP_PROD_CONFIRM'),
        undefined,
        `a read-only block in "${block.heading}" carries CLEANUP_PROD_CONFIRM`,
      );
    }
  });

  test('the commands production refuses are presented as refusals', () => {
    const blocks = bashBlocks(REFERENCE);
    for (const name of PROD_REFUSED) {
      const found = blocks.filter(
        (block) => environmentOf(block) === 'production' && scriptNames(block.text).includes(name),
      );
      if (name === 'cleanup:test-firebase') continue;
      assert.ok(found.length > 0, `${name} is not documented as refused`);
      for (const block of found) {
        assert.ok(
          isRefusal(block),
          `${name} appears under "${block.heading}", which is not a refusal section`,
        );
      }
    }

    const testFirebase = blocks.filter((block) => scriptNames(block.text).includes('cleanup:test-firebase'));
    assert.ok(testFirebase.length > 0, 'cleanup:test-firebase is not documented at all');
    for (const block of testFirebase) {
      assert.match(block.text, /--dry-run\b/, 'Guide 14 prints the destructive cleanup:test-firebase form');
    }
  });

  test('every flag printed in a block exists in the scripts, and the removed one does not', () => {
    const flags = new Set();
    for (const block of bashBlocks(REFERENCE)) {
      for (const match of block.text.matchAll(/(?<![\w-])(--[a-z][a-z0-9-]*)/g)) {
        flags.add(match[1]);
      }
    }

    assert.ok(flags.size >= 10, `the extractor found only ${flags.size} flags`);
    for (const flag of flags) {
      assert.ok(SCRIPT_SOURCE.includes(flag), `Guide 14 prints ${flag}, which no script accepts`);
    }
    assert.equal(
      REFERENCE.includes('--include-sku'),
      false,
      'Guide 14 still prints --include-sku, which the seeder refuses',
    );
  });

  test('the block and value readers can fail — in-test negative control', () => {
    const planted =
      '```bash\nNODE_ENV=production MONGODB_DB_NAME=wrong_db \\\n' +
      "SEED_CONFIRM=not-the-phrase \\\n" +
      'npm run seed:accounts -- --database=wrong_db\n```';

    const blocks = bashBlocks(planted);
    assert.equal(blocks.length, 1);
    assert.deepEqual(scriptNames(blocks[0].text), ['seed:accounts']);
    assert.equal(value(blocks[0].text, 'NODE_ENV'), 'production');
    assert.equal(value(blocks[0].text, 'MONGODB_DB_NAME'), 'wrong_db');
    assert.equal(value(blocks[0].text, 'SEED_CONFIRM'), 'not-the-phrase');
    assert.notEqual(value(blocks[0].text, 'SEED_CONFIRM'), SEED_PLANS.accounts.phrase);
    assert.equal(planOf('npm run seed -- --plan=demo'), 'demo');
    assert.equal(targetOf('npm run cleanup -- --target=firebase'), 'firebase');
  });
});

/**
 * A3.1's evidence, pinned on purpose.
 *
 * The 2026-10-29 production pass ran the `--dry-run` and a read-only `check:accounts` at this size;
 * it did not run the three-account execute form. Promoting the label is therefore a two-part change:
 * run the execute, then update the status and this expectation together. The failure is the guard.
 */
const A31_EVIDENCE = {
  label: 'PROD PREVIEW ONLY',
  productsPerTenant: 1000,
  documentsPerTenant: 4444,
  totalDocuments: 13332,
  accounts: [
    'jefferndullamalinaozxc@gmail.com',
    'jefferndullamalinao@gmail.com',
    'jeffernmalinaoqwe@gmail.com',
  ],
};

describe('Guide 14 — A3.1 is tied to its commands and the production measurement', () => {
  const section = sectionByHeading(REFERENCE, /^#### A3\.1\b/);
  const status = statusBlock(section, 'A3.1');

  test('the status label is one the page defines, and still records a preview only', () => {
    const legend = new Set(
      [...REFERENCE.matchAll(/^\| \*\*([A-Z][A-Z0-9 -]+)\*\* \|/gm)].map((match) => match[1]),
    );
    assert.ok(legend.size >= 6, `the status legend yields only ${legend.size} labels`);

    const label = statusLabel(status, 'A3.1');
    assert.ok(legend.has(label), `A3.1 uses status "${label}", which the page's legend does not define`);
    assert.equal(
      label,
      A31_EVIDENCE.label,
      `A3.1 claims "${label}", but the pinned evidence is "${A31_EVIDENCE.label}". ` +
        'Run the three-account execute against production and record the result before promoting it.',
    );

    const blocks = bashBlocks(section);
    const cleanups = blocks.filter((block) => scriptNames(block.text).includes('cleanup:account'));
    const previews = cleanups.filter((block) => /--dry-run\b/.test(block.text));
    const executes = cleanups.filter((block) => !/--dry-run\b/.test(block.text));
    assert.equal(cleanups.length, 2, 'A3.1 must carry exactly a preview and an execute cleanup block');
    assert.equal(previews.length, 1, 'A3.1 has no single --dry-run cleanup block');
    assert.equal(executes.length, 1, 'A3.1 has no single execute cleanup block');
    for (const block of cleanups) {
      assertEnvironment(block);
      assert.equal(environmentOf(block), 'production', 'A3.1 belongs to the production runbook');
      assertCleanup('cleanup:account', block);
    }

    assert.match(status, /preview matched that total while deleting nothing/i);
    assert.match(status, /execute form has been exercised only at\s+fixture scale/i);
    assert.match(status, /not at this size/i);
  });

  test('the three-account size is the measurement A1.1 records', () => {
    const a11 = sectionByHeading(REFERENCE, /^#### A1\.1\b/);
    const a11Status = statusBlock(a11, 'A1.1');
    const { productsPerTenant, documentsPerTenant, totalDocuments } = A31_EVIDENCE;

    assert.equal(
      totalDocuments,
      documentsPerTenant * 3,
      'A3.1\'s total is not three tenants at the per-tenant document count',
    );
    assert.match(a11, /About 13 332 documents\./);
    assert.match(a11Status, new RegExp(`${spaced(totalDocuments)} documents written`));
    assert.match(a11Status, new RegExp(`${spaced(productsPerTenant)} products`));
    assert.match(a11Status, new RegExp(`${spaced(documentsPerTenant)} documents`));

    assert.match(
      status,
      new RegExp(`${spaced(productsPerTenant)} products / ${spaced(documentsPerTenant)} documents each`),
    );
    assert.match(status, new RegExp(`${spaced(totalDocuments)} in total`));
  });

  test('the post-delete proof is check:accounts, and the scripts produce the claimed result', () => {
    const blocks = bashBlocks(section);
    assert.equal(
      blocks.some((block) => scriptNames(block.text).includes('verify:demo')),
      false,
      'A3.1 prints verify:demo as a post-delete command; it fails on an empty tenant',
    );

    const checks = blocks.filter((block) => scriptNames(block.text).includes('check:accounts'));
    assert.equal(checks.length, 1, 'A3.1 must carry exactly one post-delete check:accounts block');
    const check = checks[0];
    assertEnvironment(check);
    assert.equal(environmentOf(check), 'production');
    assert.match(check.text, /--with-production/);
    for (const account of A31_EVIDENCE.accounts) {
      assert.ok(check.text.includes(account), `the post-delete check omits ${account}`);
    }
    assert.equal(value(check.text, 'CLEANUP_PROD_CONFIRM'), undefined);
    assert.equal(value(check.text, 'SEED_PROD_CONFIRM'), undefined);

    assert.match(status, /`0 remaining` per tenant/i);
    assert.match(section, /`cleanup:account` re-counts each tenant/);
    assert.match(section, /`verify:demo` is a deep integrity check, not the deletion proof/);

    const cleanupSource = readFileSync(
      new URL('../scripts/cleanup-accounts.mjs', import.meta.url),
      'utf8',
    );
    assert.match(cleanupSource, /countTenantDataRemoval\(\[entry\.businessId\]\)/);
    assert.match(cleanupSource, /if \(remaining !== 0\)/);
    assert.match(cleanupSource, /0 remaining/);

    const checkSource = readFileSync(new URL('../scripts/check-accounts.mjs', import.meta.url), 'utf8');
    assert.match(checkSource, /Result {3}: SUCCESS/);
    assert.match(checkSource, /products \/ .*documents in \$\{dbName\}/);
    assert.match(checkSource, /process\.exit\(0\)/);

    const verifySource = readFileSync(
      new URL('../scripts/verify-demo-data.mjs', import.meta.url),
      'utf8',
    );
    assert.match(verifySource, /tenantEmptinessProblem\(counts\)/);
    assert.match(verifySource, /process\.exit\(1\)/);
  });
});

/**
 * A3.2–A3.8: the rest of the cleanup evidence, pinned the same way as A3.1.
 *
 * Each entry is the whole claim: the label, the figures or statement it rests on, the commands the section
 * may print, and how many preview/execute (or refusal) blocks it may have. Promoting a label, changing a
 * measured count, or replacing the command that earned it therefore fails here instead of becoming prose
 * drift. A3.1 has its own deeper guard above because its post-delete proof is a second command.
 */
const CLEANUP_STATUS_EVIDENCE = [
  {
    id: 'A3.2',
    heading: /^#### A3\.2\b/,
    label: 'PROD-TESTED',
    claims: [/100 documents/, /`0 remaining`/, /account kept/],
    scripts: ['cleanup:demo'],
    previews: 1,
    executes: 1,
    args: ['--email=jefferndullamalinaozxc@gmail.com', '--business=6ae15d1b6f2be6b817771e97'],
  },
  {
    id: 'A3.3',
    heading: /^#### A3\.3\b/,
    label: 'PROD-TESTED',
    claims: [/29 documents/, /leftovers 0/],
    scripts: ['cleanup:demo-tenant'],
    previews: 1,
    executes: 1,
  },
  {
    id: 'A3.4',
    heading: /^#### A3\.4\b/,
    label: 'PROD-TESTED',
    claims: [/2 account rows/, /`0 remaining`/],
    scripts: ['cleanup:perf-tenant'],
    previews: 1,
    executes: 1,
  },
  {
    id: 'A3.5',
    heading: /^#### A3\.5\b/,
    label: 'PROD-TESTED',
    claims: [/914 documents/, /`0 remaining`/, /four identities deleted/],
    scripts: ['cleanup:roles'],
    previews: 1,
    executes: 2,
    args: ['--delete-firebase'],
  },
  {
    id: 'A3.6',
    heading: /^#### A3\.6\b/,
    label: 'PROD-TESTED',
    claims: [/1 identity deleted/, /both databases checked for a remaining owner/],
    scripts: ['cleanup'],
    previews: 1,
    executes: 1,
    args: ['--target=firebase', '--email=perf-seed-ai@example.invalid'],
  },
  {
    id: 'A3.7',
    heading: /^#### A3\.7\b/,
    label: 'PROD PREVIEW ONLY',
    claims: [/preview counted 5 055 documents across 17 collections/, /execute\s+form was not run/],
    scripts: ['cleanup'],
    previews: 1,
    executes: 1,
    args: ['--target=database'],
  },
  {
    id: 'A3.8',
    heading: /^#### A3\.8\b/,
    label: 'REFUSAL TESTED',
    claims: [/all three commands refused in production/, /none deleted anything/],
    scripts: ['cleanup:perf', 'cleanup:test-firebase', 'cleanup:three'],
    previews: 2,
    executes: 1,
    refusals: 3,
  },
];

describe('Guide 14 — every other cleanup section is tied to its pinned evidence', () => {
  const legend = new Set(
    [...REFERENCE.matchAll(/^\| \*\*([A-Z][A-Z0-9 -]+)\*\* \|/gm)].map((match) => match[1]),
  );

  for (const entry of CLEANUP_STATUS_EVIDENCE) {
    test(`${entry.id} carries its pinned status, evidence and command shape`, () => {
      const section = sectionByHeading(REFERENCE, entry.heading);
      const status = statusBlock(section, entry.id);
      const label = statusLabel(status, entry.id);

      assert.ok(legend.has(label), `${entry.id} uses status "${label}", which the page's legend does not define`);
      assert.equal(
        label,
        entry.label,
        `${entry.id} claims "${label}", but the pinned evidence is "${entry.label}". ` +
          'Run the command, record the result, then update the label and this expectation together.',
      );
      for (const claim of entry.claims) {
        assert.match(
          status,
          claim,
          `${entry.id} no longer states the evidence its status rests on (${claim})`,
        );
      }

      const blocks = bashBlocks(section);
      assert.ok(blocks.length > 0, `${entry.id} has no bash command block`);
      for (const block of blocks) {
        assertEnvironment(block);
        assert.equal(environmentOf(block), 'production', `${entry.id} belongs to the production runbook`);
      }

      const names = [...new Set(blocks.flatMap((block) => scriptNames(block.text)))].sort();
      assert.deepEqual(
        names,
        [...entry.scripts].sort(),
        `${entry.id} no longer prints the command set that earned its status`,
      );

      const previews = blocks.filter((block) => /--dry-run\b/.test(block.text));
      const executes = blocks.filter((block) => !/--dry-run\b/.test(block.text));
      assert.equal(previews.length, entry.previews, `${entry.id} has ${previews.length} preview block(s)`);
      assert.equal(executes.length, entry.executes, `${entry.id} has ${executes.length} execute block(s)`);

      if (entry.refusals) {
        assert.equal(blocks.length, entry.refusals, `${entry.id} no longer carries all its refusal blocks`);
        for (const block of blocks) {
          assert.ok(isRefusal(block), `${entry.id} prints a command under "${block.heading}", not a refusal`);
        }
        for (const block of blocks.filter((block) =>
          scriptNames(block.text).includes('cleanup:test-firebase'),
        )) {
          assert.match(block.text, /--dry-run\b/, `${entry.id} prints the destructive cleanup:test-firebase form`);
        }
      } else {
        for (const block of blocks) {
          assert.equal(isRefusal(block), false, `${entry.id} presents a real command as a refusal`);
          for (const name of scriptNames(block.text)) assertCleanup(name, block);
        }
      }

      for (const arg of entry.args ?? []) {
        assert.ok(
          blocks.some((block) => block.text.includes(arg)),
          `${entry.id} no longer prints ${arg}, the argument that made it the measured operation`,
        );
      }
    });
  }
});

describe('Guide 14 — the three accounts are verified in one read-only run', () => {
  test('A1.1 carries one --accounts block, not three per-account commands', () => {
    const section = sectionByHeading(REFERENCE, /^#### A1\.1\b/);
    const checks = bashBlocks(section).filter((block) =>
      scriptNames(block.text).includes('verify:demo'),
    );

    assert.equal(checks.length, 1, 'A1.1 must verify the three accounts in one command');
    const check = checks[0];
    assertEnvironment(check);
    assert.equal(environmentOf(check), 'production');
    assert.match(check.text, /--accounts=/);
    assert.equal(check.text.includes('--email='), false, 'the three-account form must not be per-account');
    for (const account of A31_EVIDENCE.accounts) {
      assert.ok(check.text.includes(account), `the one-command verification omits ${account}`);
    }
    assert.equal((check.text.match(/:1 000/g) ?? []).length, 0, 'sizes cannot contain a space');
    assert.equal((check.text.match(/:1000/g) ?? []).length, 3, 'every account must name its expected size');
    assert.equal(value(check.text, 'CLEANUP_PROD_CONFIRM'), undefined);
    assert.equal(value(check.text, 'SEED_PROD_CONFIRM'), undefined);
  });
});
