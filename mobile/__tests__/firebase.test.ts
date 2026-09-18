/**
 * Phase 32D — the Firebase SDK boundary.
 *
 * Two kinds of claim are made here, and they are deliberately kept apart:
 *
 *   1. BEHAVIOUR, tested against the real `lib/config.ts` and `lib/firebase.ts`
 *      with the Firebase SDK mocked. `lib/config.ts` reads `process.env` when it
 *      is first evaluated, so each case clears Jest's module registry and imports
 *      it fresh — there is no way to change the answer of an already-evaluated
 *      module, and a test that tried would pass for the wrong reason.
 *
 *   2. SOURCE GUARDS, asserted against the files as text. "No service-account
 *      variable is referenced" is not a property any runtime assertion can
 *      observe, because the failure mode is a name that should never have been
 *      written. These cases read the two files and check what they say.
 *
 * WHAT THIS FILE DOES NOT TEST: signing in, registering, exchanging a token, or
 * anything user-visible. Phase 32D creates no Firebase user and calls no API, so
 * there is nothing of that kind to test yet.
 *
 * THE FIREBASE SDK IS MOCKED, AND IT HAS TO BE. The real package cannot be loaded
 * under this Jest configuration — see `mockInMemoryPersistence` below for the
 * mechanism — so no case here can observe the SDK itself. That is the reason the
 * Android export in Phase 32D's verification order is mandatory rather than
 * decorative: Metro resolves a different build by a different algorithm, and it
 * is the only check that can fail if the SDK stops resolving.
 */

/// <reference types="node" />
//
// `tsconfig.json` pins `"types": ["jest"]` so the program pulls in no ambient
// package automatically, and its comment records that nothing else has needed
// one. The `source guards` block below is the first exception: it reads two
// source files as text, which needs `node:fs`, `node:path` and `__dirname`. This
// directive opts THIS file into Node's types and nothing else — the shared
// compiler options are deliberately left as they are, since widening them would
// change checking for every file in the project to serve one test.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------
//
// The mock functions are declared here and closed over by the factories below
// rather than created inside them. `jest.resetModules()` re-runs a factory, so a
// factory that built its own `jest.fn()` would hand the freshly-imported module
// a NEW spy while this file still held the old one — every assertion would then
// read zero calls and the suite would pass without testing anything.
//
// The app registry is a plain array so the "reuse an already-registered app"
// case can seed it.

const mockAppRegistry: { name: string; options: unknown }[] = [];

const mockInitializeApp = jest.fn((options: unknown) => {
  const app = { name: '[DEFAULT]', options };
  mockAppRegistry.push(app);
  return app;
});

const mockGetApps = jest.fn(() => mockAppRegistry as unknown[]);

// The parameter list is declared even though the fake ignores it, so
// `mock.calls[0]` is typed as a real argument tuple rather than the empty one a
// zero-parameter `jest.fn` infers — otherwise the case below that destructures
// the recorded call cannot be written at all.
const mockInitializeAuth = jest.fn((_app: unknown, _deps: unknown) => ({
  name: '[DEFAULT]',
  __fakeAuth: true,
}));

/**
 * Stands in for Firebase's `inMemoryPersistence` export.
 *
 * WHY THIS IS A SENTINEL AND NOT THE REAL CONSTANT. The real SDK cannot be
 * loaded under this Jest configuration, and that is a property of the config,
 * not of the boundary. `firebase/auth` resolves through the `react-native`
 * export condition the preset enables, reaching `@firebase/auth/dist/rn/index.js`;
 * that file requires `@firebase/util`, whose exports map has NO `react-native`
 * condition, so it falls to `default: ./dist/index.esm.js` — untransformed ESM,
 * which `jest-expo`'s `transformIgnorePatterns` allowlist does not cover. Adding
 * Firebase to that allowlist would fix it, but `mobile/jest.config.js` is outside
 * Phase 32D's permitted file set, so the boundary must be tested without it.
 *
 * The identity this sentinel preserves is the one that matters: the value below
 * is handed to the boundary as its `inMemoryPersistence` import, so the case that
 * asserts `initializeAuth` receives it proves the boundary passes the binding it
 * IMPORTED, not a convenience object of its own. The remaining link — that
 * `firebase/auth` really exports a working constant by that name — is a fact
 * about a third-party package, covered by the Android export rather than here,
 * because only Metro can resolve it. `source guards` pins the import site.
 */
const mockInMemoryPersistence = { __fakePersistence: 'in-memory' } as const;

jest.mock('firebase/app', () => ({
  initializeApp: mockInitializeApp,
  getApps: mockGetApps,
}));

jest.mock('firebase/auth', () => ({
  inMemoryPersistence: mockInMemoryPersistence,
  initializeAuth: mockInitializeAuth,
}));

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

const FIREBASE_ENV_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

const COMPLETE_ENV: Record<string, string> = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test-project.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:0123456789abcdef',
};

/** Sets exactly the given Firebase variables, clearing the other three first. */
function applyFirebaseEnv(values: Record<string, string | undefined>): void {
  for (const key of FIREBASE_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

/** Clears the module registry and every mock's recorded calls and state. */
function resetAll(): void {
  mockAppRegistry.length = 0;
  mockInitializeApp.mockClear();
  mockGetApps.mockClear();
  mockGetApps.mockReturnValue(mockAppRegistry as unknown[]);
  mockInitializeAuth.mockClear();
  jest.resetModules();
}

type ConfigModule = typeof import('../lib/config');
type BoundaryModule = typeof import('../lib/firebase');

/**
 * A freshly-evaluated `lib/config.ts`, bound to the environment set immediately
 * before this call.
 *
 * `jest.requireActual` is used rather than `await import(...)`: Jest's Babel
 * transform leaves a dynamic `import()` as a genuine one, which the CommonJS
 * runtime refuses ("A dynamic import callback was invoked without
 * --experimental-vm-modules"). `requireActual` is also typed, so the module's
 * exports keep their real types instead of degrading to `any`. Mocks are not
 * bypassed for this module's dependencies — only for the module itself, which is
 * exactly what is wanted: `lib/firebase.ts` must still receive the SDK seam.
 */
function loadConfig(): ConfigModule {
  jest.resetModules();
  return jest.requireActual<ConfigModule>('../lib/config');
}

/** A freshly-evaluated `lib/firebase.ts`, with the mocks reset. */
function loadBoundary(): BoundaryModule {
  resetAll();
  return jest.requireActual<BoundaryModule>('../lib/firebase');
}

afterEach(() => {
  applyFirebaseEnv({});
});

// ---------------------------------------------------------------------------
// isFirebaseConfigured — all-or-nothing
// ---------------------------------------------------------------------------

describe('isFirebaseConfigured', () => {
  function configured(): boolean {
    return loadConfig().isFirebaseConfigured();
  }

  it('is false when all four values are absent', () => {
    applyFirebaseEnv({});
    expect(configured()).toBe(false);
  });

  it.each(FIREBASE_ENV_KEYS)('is false when only %s is missing', (missing) => {
    const env: Record<string, string> = { ...COMPLETE_ENV };
    delete env[missing];
    applyFirebaseEnv(env);
    expect(configured()).toBe(false);
  });

  it('is false when a value is present but blank', () => {
    // A variable set to empty whitespace reads as "set" to a naive truthiness
    // check on some platforms; it must count as absent.
    applyFirebaseEnv({ ...COMPLETE_ENV, EXPO_PUBLIC_FIREBASE_APP_ID: '   ' });
    expect(configured()).toBe(false);
  });

  it('is true only when all four values are present', () => {
    applyFirebaseEnv(COMPLETE_ENV);
    expect(configured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The boundary — disabled state
// ---------------------------------------------------------------------------

describe('a disabled boundary', () => {
  it('initializes nothing and returns null from both accessors', () => {
    applyFirebaseEnv({});
    const firebase = loadBoundary();

    expect(firebase.isFirebaseConfigured()).toBe(false);
    expect(firebase.getFirebaseApp()).toBeNull();
    expect(firebase.getFirebaseAuth()).toBeNull();
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockInitializeAuth).not.toHaveBeenCalled();
  });

  it('stays disabled when the configuration is only partial', () => {
    applyFirebaseEnv({
      EXPO_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
    });
    const firebase = loadBoundary();

    expect(firebase.getFirebaseApp()).toBeNull();
    expect(firebase.getFirebaseAuth()).toBeNull();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The boundary — enabled state
// ---------------------------------------------------------------------------

describe('an enabled boundary', () => {
  it('initializes the app once and reuses the instance', () => {
    applyFirebaseEnv(COMPLETE_ENV);
    const firebase = loadBoundary();

    const first = firebase.getFirebaseApp();
    const second = firebase.getFirebaseApp();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('passes the four configured values through to the SDK', () => {
    applyFirebaseEnv(COMPLETE_ENV);
    const firebase = loadBoundary();
    firebase.getFirebaseApp();

    expect(mockInitializeApp).toHaveBeenCalledWith({
      apiKey: COMPLETE_ENV.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: COMPLETE_ENV.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: COMPLETE_ENV.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      appId: COMPLETE_ENV.EXPO_PUBLIC_FIREBASE_APP_ID,
    });
  });

  it('reuses an app the SDK has already registered', () => {
    // The duplicate-app guard: `initializeApp` throws if the default slot is
    // taken, so an existing app must be adopted rather than created again.
    applyFirebaseEnv(COMPLETE_ENV);
    const firebase = loadBoundary();
    // Seeded AFTER `loadBoundary`, which resets every mock on the way in. Seeding
    // before it would be overwritten by that reset, `getApps()` would fall back
    // to the empty registry, and the case would pass while proving nothing.
    const existing = { name: '[DEFAULT]', options: {} };
    mockGetApps.mockReturnValue([existing]);

    expect(firebase.getFirebaseApp()).toBe(existing);
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('initializes Auth once and reuses the instance', () => {
    applyFirebaseEnv(COMPLETE_ENV);
    const firebase = loadBoundary();

    const first = firebase.getFirebaseAuth();
    const second = firebase.getFirebaseAuth();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);
  });

  it('pins Auth to in-memory persistence and nothing else', () => {
    applyFirebaseEnv(COMPLETE_ENV);
    const firebase = loadBoundary();
    firebase.getFirebaseAuth();

    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);
    const [app, deps] = mockInitializeAuth.mock.calls[0]!;
    expect(app).toBe(mockAppRegistry[0]);
    // Identity, not shape: the value asserted here is the one this file handed
    // the boundary as its `inMemoryPersistence` import, so passing a substitute
    // — a literal, or a different persistence — fails. The import site itself is
    // pinned by the `source guards` case below.
    expect(deps).toEqual({ persistence: mockInMemoryPersistence });
    // And no other option may ride along — a `popupRedirectResolver` or a second
    // dependency would mean this phase grew behaviour it did not declare.
    expect(Object.keys(deps as object)).toEqual(['persistence']);
  });

  it('derives Auth from the configured app', () => {
    applyFirebaseEnv(COMPLETE_ENV);
    const firebase = loadBoundary();

    expect(firebase.getFirebaseAuth()).toBe(firebase.getFirebaseAuth());
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Source guards
// ---------------------------------------------------------------------------

describe('source guards', () => {
  const libDir = join(__dirname, '..', 'lib');

  /**
   * Comments are stripped before anything is matched.
   *
   * Without this the guards read the prose that documents the rules as though it
   * were a violation of them: `lib/firebase.ts` explains in a comment why it does
   * not call `getAuth`, and `lib/config.ts` shows `process.env['NAME']` as the
   * bracket form to avoid. Both are correct code and both would fail a naive scan.
   * Removing comments first makes these cases assert what the code DOES rather
   * than what it says.
   */
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
  }

  const firebaseCode = stripComments(readFileSync(join(libDir, 'firebase.ts'), 'utf8'));
  const configCode = stripComments(readFileSync(join(libDir, 'config.ts'), 'utf8'));
  const bothCode = `${firebaseCode}\n${configCode}`;

  /** Every `process.env.NAME` read, by name. */
  function envNames(source: string): string[] {
    return [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]!);
  }

  it('references only the four approved Firebase variables', () => {
    const names = [...new Set(envNames(bothCode))].sort();
    // `EXPO_PUBLIC_API_URL` is the pre-existing backend URL, legitimately read
    // from `lib/config.ts`; the guard is scoped to the Firebase namespace.
    expect(names.filter((n) => !n.startsWith('EXPO_PUBLIC_FIREBASE_'))).toEqual([
      'EXPO_PUBLIC_API_URL',
    ]);
    expect(names.filter((n) => n.startsWith('EXPO_PUBLIC_FIREBASE_'))).toEqual(
      [...FIREBASE_ENV_KEYS].sort(),
    );
  });

  it('references no service-account, private-key or client-email variable', () => {
    // The credentials that must never reach the client, in any spelling.
    expect(bothCode).not.toMatch(/SERVICE_ACCOUNT/i);
    expect(bothCode).not.toMatch(/PRIVATE_KEY/i);
    expect(bothCode).not.toMatch(/CLIENT_EMAIL/i);
    expect(bothCode).not.toMatch(/FIREBASE_ADMIN/i);
    expect(envNames(bothCode).filter((n) => /SERVICE|SECRET|PRIVATE|CREDENTIAL/i.test(n))).toEqual(
      [],
    );
  });

  it('reads the configuration with dot notation only', () => {
    // Expo inlines `process.env.NAME` by substituting that literal expression.
    // Bracket access is NOT inlined, so it would silently evaluate to undefined
    // in a production bundle while passing every test in this file — Jest runs
    // against a real `process.env` and cannot see the difference.
    expect(bothCode).not.toMatch(/process\.env\[/);
  });

  it('names no durable persistence and no second credential store', () => {
    expect(bothCode).not.toMatch(/AsyncStorage/i);
    expect(bothCode).not.toMatch(/getReactNativePersistence/);
    expect(bothCode).not.toMatch(/indexedDBLocalPersistence/);
    expect(bothCode).not.toMatch(/browserLocalPersistence/);
    expect(bothCode).not.toMatch(/browserSessionPersistence/);
    // And the one that IS required, so this guard cannot pass by the module
    // having dropped persistence altogether.
    expect(firebaseCode).toMatch(/inMemoryPersistence/);
    expect(firebaseCode).toMatch(/initializeAuth\(/);
  });

  it('imports both Auth functions from firebase/auth itself', () => {
    // The identity case above proves only that the boundary forwards whichever
    // binding it received under that name. This pins WHERE the binding comes
    // from, which is the half Jest cannot reach by loading the SDK: if either
    // import were redirected elsewhere, the two assertions together would stop
    // describing Firebase at all.
    expect(firebaseCode).toMatch(
      /import\s*\{[^}]*\binMemoryPersistence\b[^}]*\}\s*from\s*'firebase\/auth'/,
    );
    expect(firebaseCode).toMatch(
      /import\s*\{[^}]*\binitializeAuth\b[^}]*\}\s*from\s*'firebase\/auth'/,
    );
  });

  it('does not use getAuth, which would pick a durable default', () => {
    // Owner decision 4: Auth is initialized explicitly. `getAuth` would select
    // the platform default persistence, which on React Native is durable.
    expect(firebaseCode).not.toMatch(/\bgetAuth\b/);
  });
});
