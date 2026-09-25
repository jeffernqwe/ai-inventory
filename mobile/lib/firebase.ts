/**
 * Phase 32D — the Firebase SDK boundary.
 *
 * This module is the ONLY place in the mobile app that imports the Firebase
 * JavaScript SDK. Everything else reaches Firebase through the three exports
 * below, so the SDK's version, its initialization order and its persistence
 * choice are decided in one file rather than discovered across a codebase.
 *
 * ONE HALF OF THE BOUNDARY, AND STILL INFRASTRUCTURE. Phase 32D established this
 * module and nothing more; Phase 32E added `lib/firebase-auth.ts` beside it, which
 * is what performs the email/password operations and decides what a Firebase
 * failure means. The split is deliberate: this file owns the SDK's version, its
 * initialization order and its persistence choice — the things that must be true
 * of every Firebase call — while the other owns behaviour. `lib/auth.tsx` is the
 * only importer of either, so no screen reaches Firebase directly and none sees a
 * Firebase error. Google Sign-In and Facebook Login remain later phases, and the
 * exchange endpoint they will call has existed since Phase 32C.
 *
 * DISABLED BY DEFAULT. With the four `EXPO_PUBLIC_FIREBASE_*` values unset,
 * `isFirebaseConfigured()` is `false`, both accessors return `null`, and the SDK
 * is never initialized. The app behaves exactly as it did before this module
 * existed, which is the phase's central invariant — and it is the state of this
 * repository today, so `lib/auth.tsx` branches on `isFirebaseConfigured()` to keep
 * registration on its pre-32D path.
 *
 * WHY `initializeAuth` AND NOT `getAuth` (owner decision 4). `getAuth()` picks
 * the platform's default persistence, which on React Native is a durable store.
 * This phase must NOT create a second durable credential on the device: the
 * Inventory AI JWT stays the only one, so Firebase Auth is pinned to
 * `inMemoryPersistence` explicitly. The effect is that Firebase state lives for
 * the lifetime of the process and is discarded on reload — which is precisely
 * what a boundary that signs nobody in should do, and it means there is nothing
 * to clear on sign-out, because nothing was ever kept.
 *
 * KNOWN LIMITATION, recorded rather than hidden. `initializeAuth` throws
 * `auth/already-initialized` if it is called twice for one app instance. The
 * module-level cache below prevents that in normal operation, but a Fast Refresh
 * of THIS file during development re-evaluates the module (resetting the cache)
 * while the SDK's own app registry survives, so a reload after editing this file
 * can surface that error until the app is restarted. It is a development-only
 * artifact — nothing an attacker or a user can reach — and it is deliberately not
 * worked around here, because the only workaround is `getAuth`, which decision 4
 * rules out. Phase 32E, the phase that first calls these accessors, contains it
 * rather than fixing it: `getFirebaseAuth()` is called INSIDE the try in
 * `lib/firebase-auth.ts`, so the throw arrives as an ordinary `failure` outcome
 * and the caller declines to fall back to the legacy route. The visible effect of
 * a Fast Refresh of this file is therefore a clear error instead of a silent
 * downgrade.
 */

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, type Auth } from 'firebase/auth';

import {
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  isFirebaseConfigured,
} from './config';

// Re-exported so a caller importing the Firebase boundary gets the whole
// boundary. The implementation stays in config.ts, which owns environment
// reading and carries no SDK dependency.
export { isFirebaseConfigured };

/**
 * Module-level caches. These are what make initialization idempotent: the SDK
 * throws `app/duplicate-app` on a second `initializeApp` and
 * `auth/already-initialized` on a second `initializeAuth`, so an accessor that
 * created a fresh instance on every call would fail on its second caller.
 */
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** The four configured values, assembled at call time so nothing is captured early. */
function firebaseOptions() {
  return {
    apiKey: FIREBASE_API_KEY,
    authDomain: FIREBASE_AUTH_DOMAIN,
    projectId: FIREBASE_PROJECT_ID,
    appId: FIREBASE_APP_ID,
  };
}

/**
 * The Firebase app, or `null` when Firebase is not configured.
 *
 * Reuses an already-registered app before creating one. The cache handles the
 * ordinary case; the `getApps()` check covers the case where an app exists but
 * this module's cache does not know about it, which is what a module
 * re-evaluation under Fast Refresh produces. Falling through to
 * `initializeApp` there would throw `app/duplicate-app`.
 *
 * No name is passed to `initializeApp`, so the app occupies the SDK's default
 * slot. That is intentional: naming it would let a second, differently-named app
 * coexist with this one, and there is exactly one Firebase project here.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  const existing = getApps()[0];
  app = existing ?? initializeApp(firebaseOptions());
  return app;
}

/**
 * Firebase Auth pinned to in-memory persistence, or `null` when Firebase is not
 * configured.
 *
 * Returning `null` rather than throwing is what makes "Firebase is not set up" a
 * state a caller can branch on instead of an error it has to catch — the same
 * shape `isMailConfigured()` takes on the server (Phase 26B-1). Callers must
 * handle `null`; there is no fallback instance, because a fallback would be a
 * second Firebase app and a second persistence decision.
 */
export function getFirebaseAuth(): Auth | null {
  const instance = getFirebaseApp();
  if (!instance) return null;
  if (!auth) {
    auth = initializeAuth(instance, { persistence: inMemoryPersistence });
  }
  return auth;
}

export default { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured };
