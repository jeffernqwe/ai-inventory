// `npm run restore:db` — restore a `backup:db` directory into a DISPOSABLE database.
//
// This is the most destructive command in the repository: it drops and rewrites every
// collection the backup lists. Four things stand between a mistake and lost data:
//
//   1. the target must be exactly `inventoryai_test_db` or `inventoryai_dev_db` — the
//      repository's existing disposable set, imported from cleanup/lib.mjs;
//   2. every file's SHA-256 must match the manifest BEFORE the first drop, so a corrupt
//      backup fails with the database untouched;
//   3. the confirmation phrase must be the command's own name;
//   4. `--dry-run` verifies and reports without writing anything.
//
// It is also the drill: restore a production backup into the test database, then run
// `npm test` against it. A backup nobody has restored is a hypothesis.
//
// Usage:
//   CONFIRM=restore-db npm run restore:db -- --from=/path/to/inventoryai_prod_db-20261018T142530Z
//   CONFIRM=restore-db npm run restore:db -- --from=<dir> --dry-run
import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import {
  RESTORE_CONFIRM_PHRASE,
  RESTORE_ALLOWED_DATABASES,
  BackupSafetyError,
  assertConfirm,
  assertRestoreTarget,
  readManifest,
  restoreBackup,
} from './backup/lib.mjs';

const COMMAND = 'restore:db';

function argValue(prefix) {
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const from = argValue('--from=') || process.env.RESTORE_FROM || '';
  const dryRun = process.argv.slice(2).includes('--dry-run');

  if (!from) {
    fail(
      `no backup directory given. Pass --from=<dir> (the path \`backup:db\` printed). ` +
        `Allowed targets: ${RESTORE_ALLOWED_DATABASES.join(', ')}.`
    );
  }

  // Guard FIRST, before a connection exists: if the target is wrong, nothing should be
  // opened at all, not even a read.
  const target = assertRestoreTarget(env.mongodbDbName);
  assertConfirm(process.env.CONFIRM, RESTORE_CONFIRM_PHRASE);

  const manifest = await readManifest(from);

  // A restore from a different database is legitimate — it is the drill — but the
  // operator must see it, because "I restored the dev backup over test" and "I restored
  // production over test" are very different sessions.
  if (manifest.database && manifest.database !== target) {
    console.log(`[${COMMAND}] note     : backup came from "${manifest.database}", restoring into "${target}".`);
  }
  console.log(`[${COMMAND}] target   : ${target}`);
  console.log(`[${COMMAND}] backup   : ${from} (${manifest.finishedAt || manifest.startedAt})`);
  // The size the target has to find room for. A restore is the one operation here that
  // can fill a small cluster up, and on 2026-10-18 that is exactly what happened: the
  // free Atlas tier blocked writes partway through a restore of a 525 750-document
  // database ("over your space quota, using 520 MB of 512 MB"). The gzipped copy was
  // 11 MB and told nobody anything.
  console.log(
    `[${COMMAND}] size     : ${manifest.totals?.documents ?? 0} document(s), about ` +
      `${formatBytes(manifest.totals?.uncompressedBytes ?? 0)} to write`
  );
  if (dryRun) console.log(`[${COMMAND}] mode     : DRY RUN — nothing will be written`);

  await mongoose.connect(env.mongodbUri, { dbName: target });

  const liveName = mongoose.connection.name;
  if (liveName !== target) {
    await mongoose.disconnect();
    fail(`the live connection is "${liveName}" but "${target}" was resolved — nothing was restored.`);
  }

  // One progress line per collection roughly every 50 000 documents, plus a final line
  // each time, so a long restore is observably alive instead of looking hung. The first
  // real run of this command was killed by a timeout precisely because it said nothing
  // for nine minutes while it was working.
  const PROGRESS_EVERY = 50_000;
  const reported = new Map();

  try {
    const result = await restoreBackup({
      db: mongoose.connection.db,
      dir: from,
      dryRun,
      onProgress: ({ name, inserted, expected }) => {
        const last = reported.get(name) ?? 0;
        const done = inserted >= expected;
        if (done || inserted - last >= PROGRESS_EVERY) {
          reported.set(name, inserted);
          console.log(`[${COMMAND}]     ${name}: ${inserted}/${expected}`);
        }
      },
      onCollection: (entry) => {
        if (dryRun) {
          console.log(`[${COMMAND}]   would restore ${entry.name.padEnd(24)} ${entry.count} docs`);
        } else {
          const seconds = Math.round((entry.elapsedMs ?? 0) / 1000);
          console.log(
            `[${COMMAND}]   ${entry.name.padEnd(24)} ${String(entry.inserted).padStart(8)} docs restored` +
              `  ${seconds}s`
          );
        }
      },
    });

    console.log(
      dryRun
        ? `[${COMMAND}] OK — verified ${result.verified.length} file(s) against the manifest; nothing was written.`
        : `[${COMMAND}] OK — ${result.verified.length} collection(s), ${result.insertedTotal} document(s) restored into ${target}.`
    );
    await mongoose.disconnect();
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  if (error instanceof BackupSafetyError) fail(error.message);
  fail(error && error.message ? error.message : String(error));
});
