// `npm run cleanup -- --target=firebase --database=<name> --email=a@x.com`
//
// Delete SPECIFIC Firebase Authentication identities — the ones you name — so those
// addresses can be registered fresh. This is deliberately NOT `cleanup:test-firebase`,
// which deletes every identity in the project.
//
// THE ONE RULE THIS SCRIPT EXISTS TO ENFORCE. §27BB (F-50) records the trap: a
// MongoDB user whose Firebase identity has been deleted can **neither sign in** (no
// identity can produce an ID token) **nor register** (the exchange pre-checks
// MongoDB and answers `409 EMAIL_IN_USE`), and **nothing in the application can
// repair it**. So this script REFUSES TO DELETE any address whose identity is still
// referenced by a MongoDB user, and it refuses the WHOLE run rather than part of it.
// That turns the required ordering from a convention into a check:
//
//     1. clear the database first   ->  npm run cleanup -- --target=database …
//     2. then delete the identities ->  npm run cleanup -- --target=firebase …
//
// THE CHECK READS BOTH DATABASES. There is one Firebase project, so an address is
// one identity, but it can be referenced by a user row in development AND in
// production. Checking only the database this shell resolved would happily delete a
// live production login while clearing a development one. Both are counted, and a
// refusal names the database(s) that still hold the address.
//
// Guards, all reused so the code that is TESTED is the code that RUNS:
//   * `assertCleanupTarget`   — the shared cleanup rule: `--database` must equal the
//                               resolved database, it must be development or
//                               production, and `CLEANUP_CONFIRM=cleanup:firebase`
//                               plus `CLEANUP_DB_CONFIRM=<database>` must be present
//                               (production also needs CLEANUP_PROD_CONFIRM).
//   * `assertFirebaseProject` — the project must be exactly the approved project and
//                               must not look production.
// All of them run before any identity is touched, and before any connection opens.
//
// The link check asks each database TWICE for every address — by `firebaseUid` and
// by `email` — because the uid alone is not a durable link. Measured 2026-10-26 on
// this project's own dev database: all three user rows held uids that no longer
// existed in Firebase (each identity had been deleted and re-created under the same
// address). A uid-only check therefore answered "will delete" for an address a
// MongoDB user still owned, which is the exact unrecoverable state this script
// exists to prevent. `email` is unique, lower-cased and indexed, and it is what
// registration collides on, so it is the link that decides.
//
// Usage:
//   npm run cleanup -- --target=firebase --database=inventoryai_dev_db --email=a@x.com
//   CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_dev_db \
//     npm run cleanup -- --target=firebase --database=inventoryai_dev_db --email=a@x.com
//   npm run cleanup -- --target=firebase --database=inventoryai_dev_db --email=a@x.com --dry-run
//
// `--dry-run` reports the plan and deletes nothing; it still requires the phrases.
// `--yes` is accepted and does nothing — there is no interactive prompt any more.
//
// It never prints a credential, an id token or a password hash — only addresses,
// counts and the (non-secret) project id.

import 'dotenv/config';
import mongoose from 'mongoose';
import { getAuth } from 'firebase-admin/auth';

import env, { DATABASE_NAMES } from '../src/config/env.ts';
import User from '../src/models/user.model.ts';
import { getFirebaseAdminApp } from '../src/services/firebase/adminApp.ts';
import { firebaseConfig, isFirebaseConfigured } from '../src/config/firebase.ts';
import { assertCleanupTarget } from './cleanup/guard.mjs';
import {
  APPROVED_TEST_FIREBASE_PROJECT_ID,
  CleanupSafetyError,
  assertFirebaseProject,
  summariseFirebaseReferences,
} from './cleanup/lib.mjs';

const COMMAND = 'cleanup:firebase';

/** The databases whose user rows can reference an identity. One Firebase project,
 *  two populations — both have to be free before an identity may go. */
const REFERENCE_DATABASES = [DATABASE_NAMES.development, DATABASE_NAMES.production];

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function argValues(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  return argv
    .filter((a) => a.startsWith(prefix))
    .flatMap((a) => a.slice(prefix.length).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const emails = [...new Set(argValues('--email').map((e) => e.toLowerCase()))];

  if (!emails.length) {
    fail('--email=<address> is required (repeatable, or comma-separated). Nothing was deleted.');
  }
  for (const email of emails) {
    if (!email.includes('@')) {
      fail(`"${email}" is not an address. Nothing was deleted.`);
    }
  }

  // ---- guards: target, database, phrases — all before any deletion or connection ----
  const checked = assertCleanupTarget({
    env,
    target: 'firebase',
    database: argValue('--database'),
    values: process.env,
  });

  if (!isFirebaseConfigured()) {
    fail('Firebase is not configured; the target project cannot be verified. Nothing was deleted.');
  }
  const projectId = assertFirebaseProject(firebaseConfig().projectId);

  console.log(`[${COMMAND}] DESTRUCTIVE — deletes ONLY the addresses you named`);
  console.log(`[${COMMAND}] Firebase project : ${projectId} (approved: ${APPROVED_TEST_FIREBASE_PROJECT_ID})`);
  console.log(`[${COMMAND}] target database  : ${checked.database}${checked.production ? '   (PRODUCTION)' : ''}`);
  console.log(`[${COMMAND}] link check reads : ${REFERENCE_DATABASES.join(', ')}`);
  console.log(`[${COMMAND}] addresses        : ${emails.join(', ')}`);
  console.log(
    `[${COMMAND}] ${dryRun ? 'DRY RUN — nothing will be deleted' : 'MongoDB          : read only, to prove no address is still linked'}`,
  );

  const auth = getAuth(getFirebaseAdminApp());

  // ---- resolve every address, and prove none of them is still LINKED ----
  await mongoose.connect(env.mongodbUri, { dbName: checked.database });
  const collections = User.collection.collectionName;
  const client = mongoose.connection.getClient();
  const plan = [];
  const stillLinked = new Map();
  const alreadyOrphaned = new Map();
  try {
    for (const email of emails) {
      let uid = null;
      try {
        const user = await auth.getUserByEmail(email);
        uid = user.uid;
      } catch (err) {
        if (err?.code !== 'auth/user-not-found') throw err;
      }

      // Both links, in both databases, for every address. See the header: a stale uid
      // outlives the identity it names, so uid-only is not enough — and ONE row anywhere
      // is enough to refuse, which is why the totals are summed rather than judged
      // database by database.
      const countsByDatabase = {};
      for (const dbName of REFERENCE_DATABASES) {
        const users = client.db(dbName).collection(collections);
        countsByDatabase[dbName] = {
          byUid: uid ? await users.countDocuments({ firebaseUid: uid }) : 0,
          byEmail: await users.countDocuments({ email }),
        };
      }

      const { verdict, linkedIn } = summariseFirebaseReferences({ uid, countsByDatabase });

      if (verdict === 'refused-linked') stillLinked.set(email, linkedIn);
      if (verdict === 'orphaned') alreadyOrphaned.set(email, linkedIn);

      plan.push({
        email,
        uid,
        verdict,
        linkedIn,
        action: {
          'refused-linked': 'REFUSED — still linked to a MongoDB user',
          orphaned: 'ORPHANED — identity already gone, database row remains',
          'will-delete': 'will delete',
          'no-identity': 'no identity',
        }[verdict],
      });
    }

    for (const entry of plan) {
      const where = entry.linkedIn.length ? `  [${entry.linkedIn.join(', ')}]` : '';
      console.log(`[${COMMAND}]   ${entry.email.padEnd(36)} ${entry.action}${where}`);
    }

    // Fail-closed and all-or-nothing: a partial delete here would leave the operator
    // unsure which addresses are usable, which is worse than deleting nothing.
    if (stillLinked.size) {
      const named = [...stillLinked].map(([email, dbs]) => `${email} (${dbs.join(', ')})`);
      throw new CleanupSafetyError(
        `${stillLinked.size} address(es) still have a MongoDB user: ${named.join(', ')}. ` +
          'Deleting one now would lock that address out permanently (it could neither sign in ' +
          'nor register, and nothing can repair it). Clear the database FIRST ' +
          '(`npm run cleanup -- --target=database --database=…`), then re-run this. ' +
          'NOTHING was deleted.',
      );
    }

    // Nothing to delete here, and deleting could not have helped: the address is
    // already in the state the guard above prevents. Reported as a refusal, because
    // "0 deleted" would read as success while the address stays unusable.
    if (alreadyOrphaned.size) {
      const named = [...alreadyOrphaned].map(([email, dbs]) => `${email} (${dbs.join(', ')})`);
      throw new CleanupSafetyError(
        `${alreadyOrphaned.size} address(es) have NO Firebase identity but a MongoDB user still ` +
          `owns the address: ${named.join(', ')}. That row can neither sign in nor ` +
          'register (`409 EMAIL_IN_USE`), and no Firebase deletion can change that — the database ' +
          'row has to go first (`npm run cleanup -- --target=database --database=…`). ' +
          'NOTHING was deleted.',
      );
    }

    if (dryRun) {
      const wouldDelete = plan.filter((p) => p.uid && p.action === 'will delete').length;
      console.log(`[${COMMAND}] dry run complete — would delete ${wouldDelete} identity(ies); nothing was deleted.`);
      return;
    }

    const deletable = plan.filter((entry) => entry.uid);
    for (const entry of deletable) {
      await auth.deleteUser(entry.uid);
      console.log(`[${COMMAND}] deleted  ${entry.email}`);
    }

    // Prove the identities are gone rather than trusting the delete calls.
    const survivors = [];
    for (const entry of deletable) {
      try {
        await auth.getUser(entry.uid);
        survivors.push(entry.email);
      } catch (err) {
        if (err?.code !== 'auth/user-not-found') throw err;
      }
    }
    if (survivors.length) {
      throw new CleanupSafetyError(
        `${survivors.length} identity(ies) still exist after deletion: ${survivors.join(', ')}. ` +
          'Re-run the command; nothing else was changed.',
      );
    }

    console.log(
      `[${COMMAND}] OK — ${deletable.length} identity(ies) deleted; ` +
        `${plan.length - deletable.length} had none to delete.`,
    );
    if (deletable.length) {
      console.log(`[${COMMAND}] those address(es) are now free to REGISTER fresh in the app.`);
    }
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof CleanupSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
