/**
 * Firebase Admin application lifecycle (Phase 32B).
 *
 * This module owns exactly one thing: producing an initialized Firebase Admin
 * app on demand, and tearing it down again in tests. It is the only module in the
 * server that calls `initializeApp`, and the only one that constructs a
 * credential from the service account.
 *
 * Four properties are deliberate:
 *
 *   LAZY      — nothing initializes at import time. The server boots with Firebase
 *               absent, unconfigured, or misconfigured exactly as it did before
 *               Phase 32B; a Firebase problem can only ever surface at the point
 *               something asks for an ID token to be verified.
 *   MEMOIZED  — one app per process. `initializeApp` throws `app/duplicate-app`
 *               on a second call with the same name, so an unmemoized wrapper
 *               would work once and then fail.
 *   ADOPTIVE  — if an app under our name already exists (a test file that did not
 *               reset, a future module that initialized first) it is adopted
 *               rather than re-created, so the duplicate-app throw cannot happen
 *               even across module reloads.
 *   RESETTABLE — `resetFirebaseAdminApp()` tears the app down so the next call
 *               rebuilds it from the CURRENT environment. Without this, a test
 *               that changes the Firebase environment would keep observing the
 *               first app it built.
 *
 * Nothing here logs. A service-account credential is the one value in this
 * codebase whose disclosure is unrecoverable, and the cheapest way to guarantee
 * it never reaches a log line is for this module to have no logging call at all —
 * the same reasoning as the mail layer.
 */

import { initializeApp, getApps, deleteApp, cert } from 'firebase-admin/app';
import type { App } from 'firebase-admin/app';

import { firebaseConfig, serviceAccountProblems } from '../../config/firebase.ts';
import { FirebaseNotConfigured } from './firebaseErrors.ts';

/**
 * The name our app is registered under. A fixed name (rather than the default
 * app) keeps this module's app distinguishable from any other, which is what
 * makes `resetFirebaseAdminApp` able to delete precisely ours and nothing else.
 */
export const FIREBASE_APP_NAME = 'inventory-ai';

let currentApp: App | null = null;

/**
 * The initialized Firebase Admin app, building it on first use.
 *
 * Throws FirebaseNotConfigured when the environment supplies no usable service
 * account, and when the supplied one cannot be turned into a credential — an
 * unparseable PEM reaches `cert()`, which throws. Both are the same condition
 * from a caller's perspective: this server cannot verify Firebase ID tokens.
 *
 * The thrown message names VARIABLES only. `serviceAccountProblems` supplies the
 * variable names, and the underlying credential error is deliberately NOT
 * relayed — its text is produced by a library that was handed the private key.
 */
export function getFirebaseAdminApp(): App {
  if (currentApp) return currentApp;

  const existing = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  if (existing) {
    currentApp = existing;
    return currentApp;
  }

  const problems = serviceAccountProblems();
  const config = firebaseConfig();

  if (problems.length > 0 || config.source === 'none') {
    const named = problems.map((problem) => problem.variable);
    throw new FirebaseNotConfigured(
      named.length > 0
        ? `Firebase is partially configured. Set or clear together: ${named.join(', ')}.`
        : 'Firebase is not configured on this server, so Firebase ID tokens cannot be verified.'
    );
  }

  try {
    currentApp = initializeApp(
      {
        // cert() takes the three fields as one indivisible credential — the same
        // unit config/firebase.ts validates them as.
        credential: cert({
          projectId: config.projectId,
          clientEmail: config.clientEmail,
          privateKey: config.privateKey,
        }),
        projectId: config.projectId,
      },
      FIREBASE_APP_NAME
    );
  } catch {
    // The underlying error can quote the credential it rejected, so it is not
    // relayed. The variable name is enough for an operator to locate the fault.
    throw new FirebaseNotConfigured(
      'The configured Firebase service account could not be used. Check FIREBASE_PRIVATE_KEY (a PEM must be complete, including its BEGIN/END lines) or FIREBASE_SERVICE_ACCOUNT_JSON.'
    );
  }

  return currentApp;
}

/** True once an app has actually been built. Never builds one as a side effect. */
export function isFirebaseAdminAppInitialized(): boolean {
  return currentApp !== null;
}

/**
 * Tears the Firebase Admin app down and forgets it, so the next call to
 * `getFirebaseAdminApp` rebuilds from the current environment.
 *
 * Test-support by intent, but not test-only: it is the only correct way to
 * release the app, and a future graceful-shutdown path has a legitimate use for
 * it. Safe to call when no app exists, and safe to call twice.
 */
export async function resetFirebaseAdminApp(): Promise<void> {
  const app = currentApp;
  currentApp = null;
  if (!app) return;

  try {
    await deleteApp(app);
  } catch {
    // Already gone (deleted by another caller, or never fully constructed). The
    // module's own reference is cleared above either way, which is what the next
    // getFirebaseAdminApp call depends on.
  }
}

export default {
  FIREBASE_APP_NAME,
  getFirebaseAdminApp,
  isFirebaseAdminAppInitialized,
  resetFirebaseAdminApp,
};
