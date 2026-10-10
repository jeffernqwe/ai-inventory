/**
 * ISS-02 — the RNFirebase Auth PII log remediation, held in place.
 *
 * WHAT THIS FILE PROVES, AND WHY IT IS AT THIS LAYER. `@react-native-firebase/auth`
 * 26.4.0 logs the Firebase user object — uid, email, display name, provider metadata —
 * through `Log.d` in `NativeRNFBTurboAuth.java`, and that call is not build-gated, so it
 * reaches release builds. No supported library toggle removes it, so the fix is a
 * `patch-package` patch applied by `postinstall` (roadmap §27AJ).
 *
 * The native code cannot be compiled here and the patched file lives in `node_modules`,
 * which is neither committed nor guaranteed present. What CAN be asserted is the patch
 * itself: that it exists, that every install applies it, that it removes exactly the one
 * line and nothing else, and that it names the dependency version we actually depend on.
 * That last assertion is the important one — when the dependency is bumped the patch
 * stops applying, `postinstall` fails, and this test says why.
 *
 * WHAT IT DOES NOT PROVE: that an Android build compiles the patched source, or that the
 * log is gone on a device. That needs a native build, and §27AJ records it as the
 * outstanding acceptance step rather than claiming it.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = join(__dirname, '..');

const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
};

/** The pinned dependency version — the patch name is derived from it, so a bump fails here. */
const AUTH_VERSION = packageJson.dependencies?.['@react-native-firebase/auth'] ?? 'VERSION-MISSING';

const PATCH_DIR = join(projectRoot, 'patches');
const PATCH_NAME = `@react-native-firebase+auth+${AUTH_VERSION}.patch`;
const PATCH_PATH = join(PATCH_DIR, PATCH_NAME);

/** The one native source that logs the user object. */
const TARGET_FILE =
  'node_modules/@react-native-firebase/auth/android/src/main/java/io/invertase/firebase/auth/NativeRNFBTurboAuth.java';

/** The call that must be gone, as it appears on the patch's removed line. */
const PII_CALL = 'Log.d(TAG, "addAuthStateListener:eventBody "';

describe('ISS-02 — the RNFirebase Auth PII log stays patched out', () => {
  const patch = existsSync(PATCH_PATH) ? readFileSync(PATCH_PATH, 'utf8') : '';
  const removed = patch
    .split('\n')
    .filter((line) => line.startsWith('-') && !line.startsWith('---'));
  const added = patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'));

  it('ships exactly one patch, named for the pinned dependency version', () => {
    // A version bump renames the expected patch and fails here before anything else,
    // which is the intended alarm — regenerate the patch, do not rename this test.
    expect(packageJson.dependencies?.['@react-native-firebase/auth']).toBeDefined();
    expect(existsSync(PATCH_DIR)).toBe(true);
    expect(readdirSync(PATCH_DIR)).toEqual([PATCH_NAME]);
  });

  it('is applied by every install, so a fresh clone is never left unpatched', () => {
    // `--error-on-fail` is not decoration: measured on 2026-10-10, patch-package exits 0 on a
    // failed apply unless it is passed (or `CI` is set), so without the flag a Windows or macOS
    // install would print the error and carry on unpatched. With it, the install fails.
    expect(packageJson.scripts?.postinstall).toBe('patch-package --error-on-fail');
    expect(packageJson.devDependencies?.['patch-package']).toBeDefined();
  });

  it('is a byte-stable patch file — LF endings, no carriage returns', () => {
    // Verification note: a CRLF copy of this patch was measured to apply correctly, so line
    // endings are not a correctness risk. Pinning them keeps the file identical everywhere
    // instead of silently different on a Windows checkout.
    expect(patch).not.toMatch(/\r/);
  });

  it('targets the one native file that logs the user object', () => {
    expect(patch).toContain(`a/${TARGET_FILE}`);
    expect(patch).toContain(`b/${TARGET_FILE}`);
  });

  it('removes the user-object log line', () => {
    expect(removed.filter((line) => line.includes(PII_CALL))).toHaveLength(1);
  });

  it('removes nothing else — the listener still emits the event to JavaScript', () => {
    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(0);
    // Scoped to removed/added lines: context lines are the patch's business, but the
    // patch must never delete the data emission or the event send.
    expect(removed.some((line) => line.includes('firebaseUserToMap'))).toBe(false);
    expect(removed.some((line) => line.includes('emitter.sendEvent'))).toBe(false);
  });

  it('keeps error diagnostics, so a failure is still visible in logcat', () => {
    expect(removed.some((line) => line.includes('Log.e'))).toBe(false);
    expect(added.some((line) => line.includes('Log.e'))).toBe(false);
  });

  it('is actually applied here once the package is installed', () => {
    const installed = join(projectRoot, TARGET_FILE);
    if (!existsSync(installed)) {
      // Not installed in this environment; the static assertions above still hold and
      // CI's `npm ci` (which runs `postinstall`) exercises this path.
      return;
    }
    expect(readFileSync(installed, 'utf8')).not.toContain(PII_CALL);
  });
});
