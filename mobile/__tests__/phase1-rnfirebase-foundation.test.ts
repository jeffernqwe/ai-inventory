/**
 * Phase 1 (RNFirebase foundation) — the native boundary, its wiring, and the
 * inertness that makes the phase safe to land.
 *
 * WHAT IS BEING PINNED, AND WHY EACH CLAIM NEEDS ITS OWN KIND OF TEST
 *
 *   1. INERTNESS is a property of the phase, not of any function. "No screen can
 *      reach the native SDK" and "this module calls no authentication verb" are
 *      claims about source text — no runtime assertion can observe a verb that
 *      should never have been written — so they are asserted against the files as
 *      text, with comments stripped first so the guards read code rather than
 *      prose. This is the same split `firebase.test.ts` (Phase 32D) documents.
 *
 *   2. BEHAVIOUR is tested by running the real `lib/firebase-native.ts` against
 *      mocks of the two native packages and of the shared gate. The native
 *      packages cannot load under this Jest configuration (they resolve native
 *      TurboModules), which is exactly why the boundary has to be lazy: the gate
 *      is checked first, and a gate that is off means no native module is loaded
 *      at all. The mock counts its own loads, so "unconfigured touched nothing" is
 *      asserted rather than asserted-by-inspection.
 *
 *   3. WIRING is tested by calling the real `app.config.js` with the environment
 *      set and unset. The EAS file-environment-variable contract (the variable
 *      holds a PATH the build runner chose, not the literal string
 *      `./google-services.json`) is the one thing about Phase 1 that cannot be
 *      verified without a cloud build, so the mechanism is pinned here instead of
 *      assumed: the path from the environment is what reaches
 *      `android.googleServicesFile`, and the file's CONTENTS are never read.
 *
 * WHAT THIS FILE DOES NOT TEST: any Firebase operation. Phase 1 signs nobody in,
 * creates no user, and calls no endpoint, so there is nothing of that kind to
 * test. `hasCurrentUser` is asserted on both sides because Phase 1 expects `false`
 * on a real build and a probe that could only ever say `false` would be worthless.
 *
 * PHASE B CHANGED FIVE GUARDS ON PURPOSE, and the changes are recorded here rather
 * than discovered later. The boundary now authenticates, so it legitimately uses
 * `signInWith*`, `createUserWith*`, `signOut(`, `getIdToken` and `updateProfile(`; the
 * app-wide import guard narrowed from "nothing may reference the boundary" to
 * "exactly one module may — `lib/firebase-auth.ts`, and no screen"; and the
 * dependency guard stopped claiming the JS SDK is what every path uses. Everything
 * else is untouched, including the two guards that carry the real weight: the boundary
 * still reaches the native packages only through the gated lazy loader, and it is still
 * the only file that names them. The Firebase operations themselves are tested in
 * `__tests__/firebase-auth.test.ts` (them migrated to the native seam) and in the
 * Phase B suites beside it.
 */

/// <reference types="node" />
//
// `tsconfig.json` pins `"types": ["jest"]`, so nothing ambient is in the program.
// The guards below read source files as text, which needs `node:fs`, `node:path`
// and `__dirname`; this directive opts THIS file into Node's types and nothing
// else, exactly as `firebase.test.ts` does for the same reason.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

/** Counts every evaluation of a native package, so "gated" is observable. */
const mockNativeLoads = { app: 0, auth: 0 };

/**
 * Makes the fake native layer fail on demand. `authError` stands in for the two
 * real failure shapes — the package being absent from the build, and the native
 * module being present but not initializing — because both arrive at the same
 * `try` in `probeNativeFirebase`.
 */
const mockNativeBehaviour: { authError: string | null; hasCurrentUser: boolean } = {
  authError: null,
  hasCurrentUser: false,
};

jest.mock('@react-native-firebase/app', () => {
  mockNativeLoads.app += 1;
  return { getApp: () => ({ name: '[DEFAULT]' }) };
});

jest.mock('@react-native-firebase/auth', () => {
  mockNativeLoads.auth += 1;
  return {
    getAuth: () => {
      if (mockNativeBehaviour.authError !== null) throw new Error(mockNativeBehaviour.authError);
      return { currentUser: mockNativeBehaviour.hasCurrentUser ? { uid: 'not-read' } : null };
    },
  };
});

/** The one gate both boundaries share; `lib/firebase.ts` owns the real one. */
const mockIsFirebaseConfigured = jest.fn(() => false);

jest.mock('../lib/firebase', () => ({
  isFirebaseConfigured: mockIsFirebaseConfigured,
}));

type BoundaryModule = typeof import('../lib/firebase-native');

/**
 * The real boundary.
 *
 * Loaded through a function rather than a top-level `import`, for the reason
 * `firebase.test.ts` records for the same shape: ES imports are hoisted above every
 * declaration in this file, while `jest.mock` factories are hoisted above those
 * imports — so a static import of the boundary would evaluate `../lib/firebase`
 * before `mockIsFirebaseConfigured` exists, and the boundary would receive
 * `undefined` instead of the gate. Loading it on first use, after the consts above
 * have run, is what makes the seam hold. `requireActual` bypasses the mock registry
 * for THIS module only — its `../lib/firebase` dependency still gets the mock.
 */
function loadBoundary(): BoundaryModule {
  return jest.requireActual<BoundaryModule>('../lib/firebase-native');
}

beforeEach(() => {
  mockNativeLoads.app = 0;
  mockNativeLoads.auth = 0;
  mockNativeBehaviour.authError = null;
  mockNativeBehaviour.hasCurrentUser = false;
  mockIsFirebaseConfigured.mockReset();
  mockIsFirebaseConfigured.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOBILE_ROOT = join(__dirname, '..');

const NATIVE_BOUNDARY = join(MOBILE_ROOT, 'lib', 'firebase-native.ts');

const readSource = (path: string): string => readFileSync(path, 'utf8');

/**
 * Strips block and line comments. Line comments are only stripped when they start
 * a line, so a `//` inside a string is left alone. This exists because the guards
 * below assert that certain *identifiers never appear*, and this module's own
 * header names the forbidden verbs in order to explain why they are forbidden.
 */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/** Every source file under the given directory, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.includes(path.slice(path.lastIndexOf('.'))) ? [path] : [];
  });
}

// ---------------------------------------------------------------------------
// Source guards — inertness
// ---------------------------------------------------------------------------

describe('the native boundary calls no authentication verb', () => {
  const source = readSource(NATIVE_BOUNDARY);
  const code = codeOnly(source);

  /**
   * Grouped by what an accidental call would do, so a failure names the risk.
   *
   * PHASE B RELAXED EXACTLY FIVE VERBS, and each is now a shipped operation of the
   * boundary rather than an accident waiting to happen: `signInWith` (native
   * email/password sign-in), `createUserWith` (native registration), `signOut(`
   * (ending the durable session), `getIdToken` (minting the token the exchange
   * consumes once) and `updateProfile(` (the cosmetic display name a registration
   * writes). Every remaining group is forbidden for a reason that has not changed:
   * an auth-state listener would let native state drive the app, `setPersistence`
   * cannot work on React Native Firebase at all (owner decision P2 §3), and the
   * provider link/unlink, Firebase email and account-mutation verbs are Phase D/E
   * work that the owner has not authorised.
   */
  const FORBIDDEN: Record<string, string[]> = {
    'signs in anonymously': ['signInAnonymously'],
    'attaches an auth listener': ['onAuthStateChanged', 'onIdTokenChanged'],
    'writes a persistence workaround': ['setPersistence'],
    're-authenticates': ['reauthenticateWith'],
    'sends a Firebase email': ['sendPasswordResetEmail', 'sendSignInLinkToEmail'],
    'changes the account destructively': [
      'deleteUser(',
      'updateEmail(',
      'verifyBeforeUpdateEmail(',
    ],
    'links or unlinks a provider': ['linkWithCredential', 'unlink('],
  };

  it.each(Object.entries(FORBIDDEN))('never %s', (_risk, verbs) => {
    for (const verb of verbs) {
      expect(code).not.toContain(verb);
    }
  });

  it('reaches the native packages only through the lazy loader', () => {
    // Three shapes would each evaluate a native package before the gate can be
    // consulted: a static import (`from '@react-native-firebase/...'`), a
    // side-effect import (`import '@react-native-firebase/...'`) and a runtime
    // dynamic import — and Expo's Metro documentation warns that `import()` is
    // generally unavailable with Hermes anyway. The only two shapes allowed are the
    // lazy `require()` and a `typeof import(...)` TYPE query, which TypeScript
    // erases and which therefore never runs.
    expect(code).not.toMatch(/from\s+['"]@react-native-firebase/);
    expect(code).not.toMatch(/^\s*import\s+['"]/m);

    const sites = [...code.matchAll(/(\w+\(|from\s)['"]?@react-native-firebase\/\w+/g)].map(
      (match) => match[1],
    );
    expect(sites.sort()).toEqual(['import(', 'import(', 'require(', 'require(']);

    // PHASE C ADDS A THIRD PACKAGE, AND THE SAME TWO SHAPES ARE THE ONLY ONES
    // ALLOWED FOR IT: one `typeof import(...)` TYPE query, which TypeScript erases,
    // and one lazy `require()` inside its own gated loader. A static import of the
    // Google library would evaluate it before its gate could be consulted, exactly
    // as it would for the two above — so the count is pinned rather than the shape
    // merely described.
    expect(code).not.toMatch(/from\s+['"]@react-native-google-signin/);

    const googleSites = [
      ...code.matchAll(/(\w+\(|from\s)['"]?@react-native-google-signin\/\w+/g),
    ].map((match) => match[1]);
    expect(googleSites.sort()).toEqual(['import(', 'require(']);
  });

  it('consults the shared gate before either native package is loaded', () => {
    const gate = code.indexOf('if (!isNativeFirebaseConfigured())');
    const firstLoad = code.indexOf("require('@react-native-firebase/app')");
    expect(source).toContain("from './firebase'");
    expect(gate).toBeGreaterThan(-1);
    expect(firstLoad).toBeGreaterThan(gate);
  });
});

describe('nothing in the app or the library can reach the native SDK yet', () => {
  const files = [...sourceFiles(join(MOBILE_ROOT, 'app')), ...sourceFiles(join(MOBILE_ROOT, 'lib'))];
  const others = files.filter((path) => path !== NATIVE_BOUNDARY);

  it('is the only file that names @react-native-firebase', () => {
    expect(others.filter((path) => readSource(path).includes('@react-native-firebase'))).toEqual([]);
  });

  it('is also the only file that names @react-native-google-signin', () => {
    // Phase C's addition, held to Phase 1's rule: a screen that imported the Google
    // library directly would bypass the boundary, and with it the gate, the lazy
    // load and the rule that no credential is ever handed upward.
    expect(
      others.filter((path) => readSource(path).includes('@react-native-google-signin'))
    ).toEqual([]);
  });

  it('is imported only by the classification layer, and by no screen or layout', () => {
    // Phase B narrowed this from "imported by nothing at all" rather than deleting
    // it, because the property that matters is still exactly one thing: nothing above
    // the classification layer may hold a Firebase session. The boundary is reachable
    // through `lib/firebase-auth.ts` alone — the module that owns every Firebase
    // operation and the decision about what a Firebase failure means — so a screen
    // that imported the boundary would fail here, and so would a second library
    // module. Nothing under `app/` may ever appear in this list.
    const importers = others.filter((path) => /firebase-native/.test(readSource(path)));
    expect(importers).toEqual([join(MOBILE_ROOT, 'lib', 'firebase-auth.ts')]);
  });

  it('covers the trees it claims to cover', () => {
    // A guard that silently walks nothing passes for the wrong reason.
    expect(others).toContain(join(MOBILE_ROOT, 'app', '_layout.tsx'));
    expect(others).toContain(join(MOBILE_ROOT, 'lib', 'auth.tsx'));
    expect(others.length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Behaviour — the probe
// ---------------------------------------------------------------------------

describe('probeNativeFirebase', () => {
  it('reports unconfigured and loads no native module when the gate is off', () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    expect(loadBoundary().probeNativeFirebase()).toEqual({ status: 'unconfigured' });
    expect(mockNativeLoads).toEqual({ app: 0, auth: 0 });
  });

  it('initializes Firebase Auth once the gate passes, with no user signed in', () => {
    mockIsFirebaseConfigured.mockReturnValue(true);

    expect(loadBoundary().probeNativeFirebase()).toEqual({ status: 'available', hasCurrentUser: false });
    expect(mockNativeLoads).toEqual({ app: 1, auth: 1 });
  });

  it('reports a persisted user rather than always answering false', () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.hasCurrentUser = true;

    expect(loadBoundary().probeNativeFirebase()).toEqual({ status: 'available', hasCurrentUser: true });
  });

  it('degrades to unavailable, without throwing, when the native module is absent', () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.authError = 'RNFBAppModule not found: the native module is not linked into this build';

    expect(loadBoundary().probeNativeFirebase()).toEqual({
      status: 'unavailable',
      reason: 'RNFBAppModule not found: the native module is not linked into this build',
    });
  });

  it('keeps a failure reason to one bounded line', () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockNativeBehaviour.authError = `${'y'.repeat(500)}\nsecond line`;

    const result = loadBoundary().probeNativeFirebase();

    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe(`${'y'.repeat(200)}…`);
    expect(result.reason).not.toContain('\n');
  });

  it('mirrors the shared gate exactly, in both directions', () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    expect(loadBoundary().isNativeFirebaseConfigured()).toBe(true);
    mockIsFirebaseConfigured.mockReturnValue(false);
    expect(loadBoundary().isNativeFirebaseConfigured()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wiring — app.config.js, the EAS file-variable contract, and version pins
// ---------------------------------------------------------------------------

type AppConfig = Record<string, any>;
type AppConfigFactory = (context: { config: AppConfig }) => AppConfig;

const STATIC_CONFIG: AppConfig = JSON.parse(readSource(join(MOBILE_ROOT, 'app.json'))).expo;

const appConfigFactory = jest.requireActual<AppConfigFactory>(join(MOBILE_ROOT, 'app.config.js'));

const CONFIG_ENV_KEYS = ['GOOGLE_SERVICES_JSON', 'GOOGLE_SERVICE_INFO_PLIST'] as const;

/** Resolves the real dynamic config against the real static config. */
function resolveAppConfig(): AppConfig {
  return appConfigFactory({ config: STATIC_CONFIG });
}

afterEach(() => {
  for (const key of CONFIG_ENV_KEYS) delete process.env[key];
});

describe('app.config.js — the EAS file-variable path reaches googleServicesFile', () => {
  it('uses the path the build runner assigned, which is not the project-local name', () => {
    const injected = '/home/expo/build/files/google-services.json';
    process.env.GOOGLE_SERVICES_JSON = injected;

    const config = resolveAppConfig();

    expect(config.android.googleServicesFile).toBe(injected);
    // The iOS half falls back to its own local name when only Android is injected.
    expect(config.ios.googleServicesFile).toBe('./GoogleService-Info.plist');
  });

  it('resolves the iOS file variable independently', () => {
    process.env.GOOGLE_SERVICE_INFO_PLIST = '/home/expo/build/files/GoogleService-Info.plist';

    expect(resolveAppConfig().ios.googleServicesFile).toBe('/home/expo/build/files/GoogleService-Info.plist');
  });

  it('falls back to the conventional project-root name, as Expo documents it', () => {
    const config = resolveAppConfig();

    expect(config.android.googleServicesFile).toBe('./google-services.json');
    expect(config.ios.googleServicesFile).toBe('./GoogleService-Info.plist');
  });

  it('always resolves both fields, because the auth plugin requires the iOS one', () => {
    // `@react-native-firebase/auth`'s config plugin throws "Your app.json file is
    // missing ios.googleServicesFile" when the field is absent, and reads the file
    // it names during config resolution. An omitted field is therefore a hard
    // failure of `expo prebuild`, not a neutral "not configured yet" state — so both
    // fields must be present in every resolution of this config, injected or not.
    for (const env of [{}, { GOOGLE_SERVICES_JSON: '/injected/google-services.json' }]) {
      for (const key of CONFIG_ENV_KEYS) delete process.env[key];
      Object.assign(process.env, env);

      const config = resolveAppConfig();

      expect(typeof config.android.googleServicesFile).toBe('string');
      expect(typeof config.ios.googleServicesFile).toBe('string');
    }
  });

  it('passes the whole static config through unchanged', () => {
    const config = resolveAppConfig();

    expect(config.name).toBe(STATIC_CONFIG.name);
    expect(config.android.package).toBe('com.inventoryai.app');
    expect(config.ios.bundleIdentifier).toBe('com.inventoryai.app');
    expect(config.extra.eas.projectId).toBe(STATIC_CONFIG.extra.eas.projectId);
    expect(config.plugins).toEqual(STATIC_CONFIG.plugins);
  });

  it('declares the three Phase 1 plugins so CNG applies the native configuration', () => {
    expect(STATIC_CONFIG.plugins).toEqual(
      expect.arrayContaining([
        '@react-native-firebase/app',
        '@react-native-firebase/auth',
        '@react-native-google-signin/google-signin',
      ]),
    );
  });

  it('commits no Firebase native path and reads no Firebase native file', () => {
    // The path can only ever come from the environment (P-1), and the file's
    // CONTENTS — which are not secret-config but are still never needed here —
    // must not be read by config resolution.
    expect(JSON.stringify(STATIC_CONFIG)).not.toContain('googleServicesFile');
    const source = codeOnly(readSource(join(MOBILE_ROOT, 'app.config.js')));
    expect(source).not.toContain('readFileSync');
    expect(source).not.toContain('readFile(');
  });
});

describe('the Firebase native configuration files cannot be committed or uploaded', () => {
  it.each(['mobile/.gitignore', 'mobile/.easignore'])('%s ignores both files', (relative) => {
    const source = readSource(join(MOBILE_ROOT, '..', relative));
    expect(source).toMatch(/^google-services\.json$/m);
    expect(source).toMatch(/^GoogleService-Info\.plist$/m);
  });
});

describe('the frozen Phase 1 dependency versions', () => {
  const dependencies = JSON.parse(readSource(join(MOBILE_ROOT, 'package.json'))).dependencies;

  it('pins React Native Firebase app and auth together, exactly', () => {
    // `@react-native-firebase/auth` peer-depends on ONE exact app version; a range
    // here would let the pair drift apart.
    expect(dependencies['@react-native-firebase/app']).toBe('26.4.0');
    expect(dependencies['@react-native-firebase/auth']).toBe('26.4.0');
  });

  it('pins the approved Google Sign-In library', () => {
    expect(dependencies['@react-native-google-signin/google-signin']).toBe('16.1.5');
  });

  it('still installs the Firebase JS SDK, which Phase B left in place', () => {
    // Phase B migrated email/password to the native SDK, so the original wording
    // ("which every shipped auth path still uses") stopped being true and was
    // corrected rather than left to mislead. The JS SDK remains INSTALLED because
    // Google sign-in (32I) and the disconnect confirmation (32L-B) still run through
    // it, and removing it is Phase F work the owner has not authorised.
    expect(dependencies.firebase).toBeDefined();
  });
});
