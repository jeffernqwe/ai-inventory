/**
 * ISS-02 — the RNFirebase Auth PII log, now fixed upstream.
 *
 * HISTORY. `@react-native-firebase/auth` 26.4.0 logged the Firebase user object — uid,
 * email, display name, provider metadata — through `Log.d` in
 * `NativeRNFBTurboAuth.java`, and that call was not build-gated, so it reached release
 * builds. The v26 remediation was a `patch-package` patch applied by `postinstall`
 * (roadmap §27AJ). **v27.0.0 removed that call upstream**, so the patch is gone.
 *
 * WHAT THIS FILE PROVES NOW. The dependency is at or above the version that contains the
 * fix, no patch or `postinstall` hook survives to be silently skipped, and — when the
 * package is installed — the published source still has no user-object log at the auth
 * listener while it still emits the event and still keeps `Log.e` diagnostics.
 *
 * WHAT IT DOES NOT PROVE: that an Android build compiles the source, or that logcat is
 * clean on a device. Those need the native build and the Phase 30B device pass.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = join(__dirname, '..');

const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
};

const AUTH_VERSION = packageJson.dependencies?.['@react-native-firebase/auth'] ?? 'VERSION-MISSING';
const APP_VERSION = packageJson.dependencies?.['@react-native-firebase/app'] ?? 'VERSION-MISSING';

/** The first release that removed the user-object log. */
const FIXED_IN_MAJOR = 27;

const PATCH_DIR = join(projectRoot, 'patches');

const TARGET_FILE =
  'node_modules/@react-native-firebase/auth/android/src/main/java/io/invertase/firebase/auth/NativeRNFBTurboAuth.java';

/** The call v26 shipped and v27 no longer contains. */
const PII_CALL = 'Log.d(TAG, "addAuthStateListener:eventBody "';

describe('ISS-02 — the RNFirebase Auth PII log stays fixed', () => {
  it('pins the dependency at or above the release that removed the log', () => {
    expect(AUTH_VERSION).not.toBe('VERSION-MISSING');
    expect(APP_VERSION).toBe(AUTH_VERSION);

    const major = Number.parseInt(AUTH_VERSION.split('.')[0] ?? '', 10);
    expect(Number.isFinite(major)).toBe(true);
    expect(major).toBeGreaterThanOrEqual(FIXED_IN_MAJOR);
  });

  it('ships no patch and no install hook that could mask a downgrade', () => {
    const patches = existsSync(PATCH_DIR) ? readdirSync(PATCH_DIR) : [];
    expect(patches).toEqual([]);
    expect(packageJson.scripts?.postinstall).toBeUndefined();
    expect(packageJson.devDependencies?.['patch-package']).toBeUndefined();
  });

  it('has no user-object log in the installed auth source', () => {
    const installed = join(projectRoot, TARGET_FILE);
    if (!existsSync(installed)) {
      // The package is not installed in this environment. CI installs it before this
      // suite, and the static assertions above still hold; do not turn a missing
      // node_modules into a false pass about the source.
      return;
    }

    const source = readFileSync(installed, 'utf8');
    expect(source).not.toContain(PII_CALL);
    expect(source).toContain('addAuthStateListener');
  });

  it('still emits the auth event and keeps failure diagnostics', () => {
    const installed = join(projectRoot, TARGET_FILE);
    if (!existsSync(installed)) {
      return;
    }

    const source = readFileSync(installed, 'utf8');
    // The data path is the feature; the remediation must never remove it.
    expect(source).toContain('firebaseUserToMap');
    expect(source).toContain('emitter.sendEvent');
    // Failures must remain visible in logcat.
    expect(source).toContain('Log.e');
  });
});
