// `npm run cleanup -- --target=<database|firebase> --database=<name> …`
//
// The ONE entry point for destroying data in this project, on the same pattern as
// `npm run seed`: the command is the same in development and in production, the
// target is named on the command line, and the number of confirmation phrases is
// decided by that target — two in development, three in production.
//
// This file only DISPATCHES. Every guard lives in `scripts/cleanup/guard.mjs` and is
// called by the engine script itself, before it opens a connection, so running an
// engine directly by mistake cannot bypass the rule.
//
//   npm run cleanup -- --target=database --database=inventoryai_dev_db
//   npm run cleanup -- --target=database --database=inventoryai_dev_db --dry-run
//   npm run cleanup -- --target=firebase --database=inventoryai_dev_db --email=a@x.com
//
// `--dry-run` is read-only and still requires the phrases: a dry run is meant to
// prove the destination, and a run that skipped them would prove less.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  CLEANUP_DB_CONFIRM_ENV,
  CLEANUP_PROD_CONFIRM_ENV,
  CLEANUP_PROD_CONFIRM_PHRASE,
  CLEANUP_TARGETS,
  CLEANUP_CONFIRM_ENV,
  extractCleanupTargetArg,
  resolveCleanupTarget,
} from './cleanup/guard.mjs';
import { CleanupSafetyError } from './cleanup/lib.mjs';
import { DATABASE_NAMES } from '../src/config/env.ts';

const COMMAND = 'cleanup';

function usage() {
  return [
    '',
    '  npm run cleanup -- --target=database|firebase --database=<name> [options]',
    '',
    '  --target=database   clear every document in the named database;',
    '                      structure, collections and indexes are preserved.',
    '                      options: --dry-run',
    '  --target=firebase   delete ONLY the Firebase identities you name, after',
    '                      proving no user in development or production still',
    '                      references the address.  options: --email=… --dry-run',
    '',
    '  --database=<name>   required; must equal the database this shell resolves',
    `                      (${DATABASE_NAMES.development} or ${DATABASE_NAMES.production}).`,
    '',
    '  Phrases, by target database:',
    `    development  ${CLEANUP_CONFIRM_ENV}=<command>  ${CLEANUP_DB_CONFIRM_ENV}=<database>`,
    `    production   both of the above, plus ${CLEANUP_PROD_CONFIRM_ENV}=${CLEANUP_PROD_CONFIRM_PHRASE}`,
    '',
    `    <command> is ${Object.values(CLEANUP_TARGETS).map((t) => t.phrase).join(' or ')}.`,
    '',
    '  Nothing is deleted if any check fails.',
    '',
  ].join('\n');
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(usage());
  process.exit(0);
}

let engine;
try {
  const { target, rest } = extractCleanupTargetArg(argv);
  if (!target) {
    console.log(usage());
    fail('no --target was supplied; refusing to guess. Nothing was deleted.');
  }
  const record = resolveCleanupTarget(target);
  engine = { record, rest };
} catch (err) {
  if (err instanceof CleanupSafetyError) fail(err.message);
  throw err;
}

const scriptPath = fileURLToPath(new URL(engine.record.script, import.meta.url));
const child = spawnSync(process.execPath, [scriptPath, ...engine.rest], {
  stdio: 'inherit',
  env: process.env,
});

if (child.error) {
  fail(`could not start ${engine.record.script}: ${child.error.message}. Nothing was deleted.`);
}
process.exit(typeof child.status === 'number' ? child.status : 1);
