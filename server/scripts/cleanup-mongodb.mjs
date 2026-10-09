// `npm run cleanup:test-mongodb` / `cleanup:dev-mongodb` / `cleanup:prod-mongodb`
// / `cleanup:all-mongodb` — clear ALL documents from one or more approved MongoDB
// databases, selected EXPLICITLY by the command.
//
// DESTRUCTIVE. Deletes every document in the selected database(s). It does NOT
// drop databases, collections, or indexes — structure is preserved.
//
// The target is chosen by the npm script that invoked this file (`--target=`),
// NEVER by the ambient `MONGODB_DB_NAME`, and every name is checked against the
// hard-coded allowlist in ./cleanup/lib.mjs. Fail-closed: refuses on any guard
// failure, before deleting anything.
//
// Usage:
//   npm run cleanup:test-mongodb
//   npm run cleanup:all-mongodb -- --yes
//   CLEANUP_CONFIRM=cleanup:all-mongodb CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
//     npm run cleanup:all-mongodb -- --yes
//
// `--yes` skips the interactive prompt but NEVER any confirmation phrase.

import 'dotenv/config';
import { MongoClient } from 'mongodb';

import env from '../src/config/env.ts';
import {
  CleanupSafetyError,
  MONGODB_CLEANUP_TARGETS,
  confirmationPhraseFor,
} from './cleanup/lib.mjs';
import { performMongodbTargetsCleanup } from './cleanup/run.mjs';

function argValue(flag) {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const TARGET = argValue('--target');
const COMMAND_NAME = argValue('--command') ?? 'cleanup:mongodb';
const CONFIRM_PHRASE = confirmationPhraseFor(COMMAND_NAME);

function fail(message) {
  console.error(`[${COMMAND_NAME}] ${message}`);
  process.exit(1);
}

/** Minimal readline prompt; returns the typed line. */
function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let data = '';
    const onData = (chunk) => {
      data += chunk.toString();
      if (data.includes('\n')) {
        process.stdin.off('data', onData);
        process.stdin.pause();
        resolve(data.split('\n')[0]);
      }
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function main() {
  if (!TARGET) {
    fail('no --target selector was supplied; refusing to guess. Nothing was deleted.');
  }
  if (!env.mongodbUri) {
    fail('MONGODB_URI is not set; nothing was deleted.');
  }

  console.log(`[${COMMAND_NAME}] DESTRUCTIVE MongoDB cleanup`);
  console.log(`[${COMMAND_NAME}] Approved targets : ${Object.values(MONGODB_CLEANUP_TARGETS).join(', ')}`);
  console.log(`[${COMMAND_NAME}] Preserves        : databases, collections, indexes`);
  console.log(`[${COMMAND_NAME}] Deletes          : all documents in every collection`);

  // `--yes` does NOT skip the confirmation phrase; it only skips the interactive
  // read, so the phrase must still be supplied explicitly via CLEANUP_CONFIRM.
  const providedConfirm = process.argv.includes('--yes')
    ? process.env.CLEANUP_CONFIRM
    : await prompt(`Type "${CONFIRM_PHRASE}" to delete all documents in the selected target(s): `);

  // A single client on the same URI; `connect(name)` returns a db handle for that
  // database and the ports the guarded sequence drives.
  const client = new MongoClient(env.mongodbUri);

  try {
    await client.connect();

    const connect = async (name) => {
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
    };

    const reports = await performMongodbTargetsCleanup({
      nodeEnv: process.env.NODE_ENV,
      selector: TARGET,
      confirmPhrase: CONFIRM_PHRASE,
      providedConfirm,
      providedProdConfirm: process.env.CLEANUP_PROD_CONFIRM,
      connect,
      log: (line) => console.log(`[${COMMAND_NAME}] ${line}`),
    });

    for (const r of reports) {
      console.log(
        `[${COMMAND_NAME}] OK — ${r.target}: ${r.collections} collection(s) cleared, structure preserved.`
      );
    }
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((err) => {
  if (err instanceof CleanupSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
