// `npm run cleanup:test-firebase` — delete ALL Firebase Authentication users in
// the approved development/test Firebase project.
//
// DESTRUCTIVE. It deletes every user in the approved project's Auth. It does NOT
// create any user, sends no email, and does not touch MongoDB. It never operates
// against an unknown or production project.
//
// Fail-closed: it refuses to delete anything unless every guard in ./cleanup/lib.mjs
// passes, and the guarded sequence itself lives in ./cleanup/run.mjs so the tested
// code is the code that runs. This file is only the I/O and the prompt. It never
// prints credentials — only counts and the (non-secret) project id.
//
// Usage:
//   npm run cleanup:test-firebase
//   npm run cleanup:test-firebase -- --yes
//   CLEANUP_CONFIRM=cleanup:test-firebase npm run cleanup:test-firebase

import 'dotenv/config';
import { getAuth } from 'firebase-admin/auth';

import { getFirebaseAdminApp } from '../src/services/firebase/adminApp.ts';
import { firebaseConfig, isFirebaseConfigured } from '../src/config/firebase.ts';
import {
  APPROVED_TEST_FIREBASE_PROJECT_ID,
  CleanupSafetyError,
  assertFirebaseProject,
  assertNonProductionEnv,
  confirmationPhraseFor,
} from './cleanup/lib.mjs';
import { performFirebaseCleanup } from './cleanup/run.mjs';

const COMMAND_NAME = 'cleanup:test-firebase';
const CONFIRM_PHRASE = confirmationPhraseFor(COMMAND_NAME);
const BATCH_SIZE = 1000;

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
  // Guards run BEFORE anything else — no banner, no Admin app, no network.
  assertNonProductionEnv(process.env.NODE_ENV);

  if (!isFirebaseConfigured()) {
    fail('Firebase is not configured; the target project cannot be verified. Nothing was deleted.');
  }

  const projectId = assertFirebaseProject(firebaseConfig().projectId);

  console.log(`[${COMMAND_NAME}] DESTRUCTIVE cleanup — development/test only`);
  console.log(`[${COMMAND_NAME}] Firebase project : ${projectId}`);
  console.log(`[${COMMAND_NAME}] Deletes          : all Firebase Authentication users`);
  console.log(`[${COMMAND_NAME}] Preserves        : nothing (users are removed); no user is created`);
  console.log(`[${COMMAND_NAME}] MongoDB          : not touched`);

  const auth = getAuth(getFirebaseAdminApp());

  const listUserIds = async () => {
    const uids = [];
    let pageToken;
    do {
      const page = await auth.listUsers(BATCH_SIZE, pageToken);
      for (const u of page.users) uids.push(u.uid);
      pageToken = page.pageToken;
    } while (pageToken);
    return uids;
  };

  // `--yes` does NOT skip the confirmation phrase; it only skips the interactive
  // read, so the phrase must still be supplied explicitly via CLEANUP_CONFIRM.
  const providedConfirm = process.argv.includes('--yes')
    ? process.env.CLEANUP_CONFIRM
    : await prompt(`Type "${CONFIRM_PHRASE}" to delete all users in ${projectId}: `);

  const report = await performFirebaseCleanup({
    nodeEnv: process.env.NODE_ENV,
    projectId,
    confirmPhrase: CONFIRM_PHRASE,
    providedConfirm,
    expectedProjectId: APPROVED_TEST_FIREBASE_PROJECT_ID,
    log: (line) => console.log(`[${COMMAND_NAME}] ${line}`),
    ports: {
      listUserIds,
      deleteUsers: (uids) => auth.deleteUsers(uids),
    },
  });

  if (report.before === 0) {
    console.log(`[${COMMAND_NAME}] OK — no users to delete.`);
  } else {
    console.log(`[${COMMAND_NAME}] OK — all Firebase Authentication users deleted.`);
  }
}

main().catch((err) => {
  if (err instanceof CleanupSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
