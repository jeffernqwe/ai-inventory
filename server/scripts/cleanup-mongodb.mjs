// `npm run cleanup -- --target=database --database=<name> [--dry-run]`
//
// Clear ALL documents from the one database you name. DESTRUCTIVE. It does NOT drop
// the database, its collections or its indexes — structure is preserved, so the next
// start (or the next seed) finds the schema it expects.
//
// THE TARGET IS NEVER GUESSED. `--database=` is required and must equal the database
// this process resolved from `MONGODB_DB_NAME`; the connection uses the resolved
// value, so a typo cannot redirect the delete. Only the development and production
// databases are accepted; the test database belongs to `npm test`.
//
// The phrases, and what each answers:
//
//   CLEANUP_CONFIRM=cleanup:database              which command
//   CLEANUP_DB_CONFIRM=inventoryai_dev_db         where, typed out
//   CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA   that the data is real  (production only)
//
// Usage:
//   npm run cleanup -- --target=database --database=inventoryai_dev_db --dry-run
//   npm run cleanup -- --target=database --database=inventoryai_dev_db
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
//     CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
//     npm run cleanup -- --target=database --database=inventoryai_prod_db
//
// `--dry-run` counts what would be deleted and stops; it still requires the phrases,
// because a dry run is there to prove the destination. `--yes` is accepted and does
// nothing — there is no interactive prompt any more, only the phrases.

import 'dotenv/config';
import { MongoClient } from 'mongodb';

import env, { DATABASE_NAMES } from '../src/config/env.ts';
import { CleanupSafetyError } from './cleanup/lib.mjs';
import { performNamedDatabaseCleanup } from './cleanup/run.mjs';

const COMMAND = 'cleanup:database';

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

if (process.argv.some((a) => a.startsWith('--target=') || a.startsWith('--command='))) {
  fail(
    'the selector flags are gone. Use `npm run cleanup -- --target=database --database=<name>`. ' +
      'Nothing was deleted.',
  );
}

const database = argValue('--database');
const dryRun = process.argv.includes('--dry-run');

let client;
let exitCode;

try {
  const report = await performNamedDatabaseCleanup({
    target: 'database',
    database,
    env,
    values: process.env,
    dryRun,
    log: (line) => console.log(`[${COMMAND}] ${line}`),
    connect: async (name) => {
      // Created only after the guard has passed: a refused run never opens a socket.
      client = new MongoClient(env.mongodbUri);
      await client.connect();
      const db = client.db(name);
      return {
        liveName: db.databaseName,
        ports: {
          listCollectionNames: async () => {
            const cols = await db.listCollections().toArray();
            return cols.map((c) => c.name).sort();
          },
          countDocuments: (col) => db.collection(col).countDocuments(),
          deleteMany: async (col) => {
            const res = await db.collection(col).deleteMany({});
            return res.deletedCount ?? 0;
          },
          listIndexes: (col) => db.collection(col).indexes(),
        },
      };
    },
  });

  if (report.dryRun) {
    console.log(
      `[${COMMAND}] OK — dry run against ${report.target}${report.target === DATABASE_NAMES.production ? ' (PRODUCTION)' : ''}: ` +
        `${report.collections} collection(s), ${report.total} document(s) would be deleted. Nothing was deleted.`,
    );
  } else {
    console.log(
      `[${COMMAND}] OK — ${report.target}: ${report.collections} collection(s) cleared ` +
        `(${report.totalDeleted} document(s)); structure preserved.`,
    );
  }
  exitCode = 0;
} catch (err) {
  await client?.close().catch(() => {});
  if (err instanceof CleanupSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
}

await client?.close().catch(() => {});
process.exit(exitCode ?? 0);
