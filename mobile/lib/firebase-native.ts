/**
 * Phase 1 (RNFirebase foundation) — the React Native Firebase (native SDK)
 * boundary.
 *
 * ONE HALF OF A PAIR, AND STILL INFRASTRUCTURE. `lib/firebase.ts` is the Firebase
 * *JavaScript* SDK boundary and stays exactly as Phase 32D wrote it: every shipped
 * authentication path (Phases 32E–32L) still runs through it, and Phase 1 changes
 * none of that. This module is the counterpart for the *native* SDK, introduced
 * the same way Phase 32D introduced the JS one — a boundary that signs nobody in
 * — and it is deliberately not reachable from any screen or route yet (pinned by
 * `__tests__/phase1-rnfirebase-foundation.test.ts`).
 *
 * GATED. `isFirebaseConfigured()` (re-exported by `lib/firebase.ts`) is the same
 * all-or-nothing `EXPO_PUBLIC_FIREBASE_*` gate the JS SDK uses. With the four
 * values unset — the default in Expo Go, in Jest, and in any build without them —
 * `probeNativeFirebase()` answers `'unconfigured'` and no native module is loaded
 * at all, so importing this file cannot change how the app runs.
 *
 * LAZY. The native modules are loaded through Metro's synchronous `require()`
 * INSIDE the probe, once the gate has passed, rather than through a static
 * `import`. Two reasons, both load-bearing: a static import evaluates
 * `@react-native-firebase/app` as soon as any importer is bundled, which in a build
 * that does not contain the native module (Expo Go, any pre-Phase-1 dev build, the
 * Jest environment) throws before a single line of app code runs; and a dynamic
 * `import()` is not a portable answer either, because Expo's own Metro
 * documentation warns it "is generally not available in React Native with Hermes
 * enabled". `require()` is the one lazy access that works on every engine this app
 * ships on, and it is what makes "gated" a property of the code rather than of the
 * order in which modules happen to be evaluated.
 *
 * INERT. Phase 1 performs no authentication. Nothing here calls `signIn*`,
 * `createUser*`, `signOut`, `getIdToken`, `onAuthStateChanged`, `setPersistence`,
 * or any provider/linking/handling method, and no Firebase user is created. The
 * only native calls made are `getApp()` and `getAuth()` — the initialization the
 * phase exists to verify — plus a read of `currentUser` so the phase's own
 * acceptance criterion ("no Firebase credential was created") is observable rather
 * than merely asserted. Persistence is left at the native default: owner decision
 * P2 (frozen 2026-09-24) *approves* durable native Firebase Auth persistence and
 * explicitly supersedes Phase 32D owner decision 4 (`inMemoryPersistence`), so
 * there is no workaround to write here and none may be added.
 *
 * WHAT IT DELIBERATELY DOES NOT CACHE. `require()` is called per probe; module
 * evaluation is already cached by Metro (and by Jest), so a second module-level
 * cache would only add a value that can go stale across a Fast Refresh — the
 * lesson `lib/firebase.ts` records for `initializeAuth`'s `auth/already-initialized`.
 * Phase 1 calls no Firebase method that throws on a second call.
 *
 * Sunsets in a later phase: `getAuth()` and the `currentUser` read are the seam
 * Phase 2 (email/password) will grow from, and this file's "no auth verbs" guard
 * is expected to be *changed deliberately* then, not bypassed.
 */

import { isFirebaseConfigured } from './firebase';

/**
 * `require` is not part of this project's TypeScript program: `tsconfig.json` pins
 * `"types": ["jest"]` so no ambient package leaks in. The declaration below is
 * scoped to this file and exists only so the lazy loader above can be written at
 * all — Metro and Jest both provide a real `require` at runtime.
 */
declare const require: (id: string) => unknown;

/** Bounded so a native error cannot dump a stack or a path into a caller's UI. */
const MAX_REASON_LENGTH = 200;

export type NativeFirebaseStatus =
  /** The `EXPO_PUBLIC_FIREBASE_*` gate is not satisfied: nothing was loaded. */
  | 'unconfigured'
  /** The native modules loaded and Firebase Auth initialized. */
  | 'available'
  /** The gate passed but the native modules could not be loaded or initialized. */
  | 'unavailable';

export type NativeFirebaseProbe = {
  status: NativeFirebaseStatus;
  /**
   * Why the boundary is `'unavailable'`, as a single bounded line. Present only
   * for that status: the module-load and module-init failures it reports carry no
   * credential, no token and no configuration value, which is why it is safe to
   * surface, and why it is truncated and stripped of newlines.
   */
  reason?: string;
  /**
   * Whether a Firebase Auth user is already persisted on the device. Read from
   * `auth.currentUser`, never from a listener. Phase 1 expects `false`: this phase
   * never signs anyone in, and the probe exists partly so that expectation can be
   * observed on a real build instead of assumed.
   */
  hasCurrentUser?: boolean;
};

/** A single bounded line: no newlines, no stack, never longer than the cap. */
function reasonFrom(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = (raw.split('\n')[0] ?? '').trim();
  return firstLine.length > MAX_REASON_LENGTH ? `${firstLine.slice(0, MAX_REASON_LENGTH)}…` : firstLine;
}

/**
 * Whether the native boundary is enabled at all.
 *
 * Delegates to the one gate the app already uses, rather than adding a second
 * environment variable: an app configured for Firebase is configured for both
 * boundaries, and a second flag would be a second thing to get wrong.
 */
export function isNativeFirebaseConfigured(): boolean {
  return isFirebaseConfigured();
}

/**
 * Loads the native Firebase modules and initializes Firebase Auth, once the gate
 * has passed.
 *
 * Never throws and never returns a credential: a build with no native module (or a
 * misconfigured one) degrades to `{ status: 'unavailable', reason }`, which is the
 * behaviour a caller can branch on — the same shape `lib/firebase.ts` uses by
 * returning `null` instead of throwing, and the same shape `isMailConfigured()`
 * takes on the server.
 */
export function probeNativeFirebase(): NativeFirebaseProbe {
  if (!isNativeFirebaseConfigured()) return { status: 'unconfigured' };

  try {
    const appModule = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
    const authModule = require('@react-native-firebase/auth') as typeof import('@react-native-firebase/auth');
    const auth = authModule.getAuth(appModule.getApp());
    return { status: 'available', hasCurrentUser: auth.currentUser !== null };
  } catch (error) {
    return { status: 'unavailable', reason: reasonFrom(error) };
  }
}
