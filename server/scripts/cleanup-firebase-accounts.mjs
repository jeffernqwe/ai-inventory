// `npm run cleanup:firebase-accounts -- --email=a@x.com [--email=b@x.com]`
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
//     1. clear the database first   ->  `npm run cleanup:dev-mongodb`
//     2. then delete the identities ->  this script
//
// Run in that order, every identity is already unreferenced when it is removed, so
// this creates no orphan. Run in the other order and it stops before deleting
// anything and tells you which addresses are still linked.
//
// Guards, all reused from ./cleanup/lib.mjs so the code that is TESTED is the code
// that RUNS:
//   * `assertNonProductionEnv`  — NODE_ENV must be EXPLICITLY development.
//   * `assertFirebaseProject`   — the project must be exactly the approved
//                                 development/test project, and not look production.
//   * `assertConfirmation`      — `CLEANUP_CONFIRM=cleanup:firebase-accounts`.
//   * the database must be the resolved DEVELOPMENT database.
// All of them run before any identity is touched.
//
// Usage:
//   CLEANUP_CONFIRM=cleanup:firebase-accounts npm run cleanup:firebase-accounts -- --email=a@x.com
//   CLEANUP_CONFIRM=cleanup:firebase-accounts npm run cleanup:firebase-accounts -- --email=a@x.com,b@x.com --yes
//   npm run cleanup:firebase-accounts -- --email=a@x.com --dry-run   # report only, deletes nothing
//
// It never prints a credential, an id token or a password hash — only addresses,
// counts and the (non-secret) project id.

import 'dotenv/config';
import mongoose from 'mongoose';
import { getAuth } from 'firebase-admin/auth';

import env from '../src/config/env.ts';
import { DATABASE_NAMES } from '../src/config/env.ts';
import User from '../src/models/user.model.ts';
import { getFirebaseAdminApp } from '../src/services/firebase/adminApp.ts';
import { firebaseConfig, isFirebaseConfigured } from '../src/config/firebase.ts';
import {
  APPROVED_TEST_FIREBASE_PROJECT_ID,
  CleanupSafetyError,
  assertConfirmation,
  assertFirebaseProject,
  assertNonProductionEnv,
  confirmationPhraseFor,
} from './cleanup/lib.mjs';

const COMMAND = 'cleanup:firebase-accounts';
const CONFIRM_PHRASE = confirmationPhraseFor(COMMAND);

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

  // ---- guards: environment, project, confirmation — all before any deletion ----
  assertNonProductionEnv(process.env.NODE_ENV);
  if (!isFirebaseConfigured()) {
    fail('Firebase is not configured; the target project cannot be verified. Nothing was deleted.');
  }
  const projectId = assertFirebaseProject(firebaseConfig().projectId);
  if (env.mongodbDbName !== DATABASE_NAMES.development) {
    fail(
      `the resolved database is "${env.mongodbDbName}", not the development database ` +
        `"${DATABASE_NAMES.development}". The orphan check would be meaningless. Nothing was deleted.`,
    );
  }

  console.log(`[${COMMAND}] DESTRUCTIVE — deletes ONLY the addresses you named`);
  console.log(`[${COMMAND}] Firebase project : ${projectId} (approved: ${APPROVED_TEST_FIREBASE_PROJECT_ID})`);
  console.log(`[${COMMAND}] database         : ${env.mongodbDbName}`);
  console.log(`[${COMMAND}] addresses        : ${emails.join(', ')}`);
  console.log(`[${COMMAND}] ${dryRun ? 'DRY RUN — nothing will be deleted' : 'MongoDB          : read only, to prove no address is still linked'}`);

  const auth = getAuth(getFirebaseAdminApp());

  // ---- resolve every address, and prove none of them is still LINKED ----
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
  const plan = [];
  const orphaned = [];
  try {
    for (const email of emails) {
      let uid = null;
      try {
        const user = await auth.getUserByEmail(email);
        uid = user.uid;
      } catch (err) {
        if (err?.code !== 'auth/user-not-found') throw err;
      }

      if (!uid) {
        plan.push({ email, uid: null, action: 'no identity' });
        continue;
      }

      const linked = await User.countDocuments({ firebaseUid: uid });
      if (linked > 0) {
        orphaned.push(email);
        plan.push({ email, uid, action: 'REFUSED — still linked to a MongoDB user' });
        continue;
      }
      plan.push({ email, uid, action: 'will delete' });
    }

    for (const entry of plan) {
      console.log(`[${COMMAND}]   ${entry.email.padEnd(36)} ${entry.action}`);
    }

    // Fail-closed and all-or-nothing: a partial delete here would leave the operator
    // unsure which addresses are usable, which is worse than deleting nothing.
    if (orphaned.length) {
      throw new CleanupSafetyError(
        `${orphaned.length} address(es) still have a MongoDB user: ${orphaned.join(', ')}. ` +
          'Deleting one now would lock that address out permanently (it could neither sign in ' +
          'nor register, and nothing can repair it). Clear the database FIRST ' +
          '(`npm run cleanup:dev-mongodb`), then re-run this. NOTHING was deleted.',
      );
    }

    if (dryRun) {
      const wouldDelete = plan.filter((p) => p.uid && p.action === 'will delete').length;
      console.log(`[${COMMAND}] dry run complete — would delete ${wouldDelete} identity(ies); nothing was deleted.`);
      return;
    }

    // The phrase is asked for LAST, once the guards have passed and we know there is
    // something to delete — so a dry run and a refusal never interrogate the operator.
    // `--yes` does NOT skip the phrase; it only skips the typing.
    const providedConfirm = process.argv.includes('--yes')
      ? process.env.CLEANUP_CONFIRM
      : await prompt(`Type "${CONFIRM_PHRASE}" to delete these identities in ${projectId}: `);
    assertConfirmation(providedConfirm, CONFIRM_PHRASE);

    let deleted = 0;
    for (const entry of plan) {
      if (!entry.uid) continue;
      await auth.deleteUser(entry.uid);
      deleted += 1;
      console.log(`[${COMMAND}] deleted  ${entry.email}`);
    }
    console.log(`[${COMMAND}] OK — ${deleted} identity(ies) deleted; ${plan.length - deleted} had none to delete.`);
    console.log(`[${COMMAND}] those address(es) are now free to REGISTER fresh in the app.`);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof CleanupSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
