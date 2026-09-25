/**
 * Phase F1 — the retired-dependency guard.
 *
 * WHAT THIS FILE REPLACES, AND WHY ONE GUARD REPLACES SEVERAL.
 *
 * Until Phase F1, three suites carried negative assertions of the form
 * `expect(mockPromptAsync).not.toHaveBeenCalled()` — they modelled the browser OAuth
 * seams and asserted no shipped path reached them. That was the right shape of proof
 * while the browser helper was RETAINED BUT UNREFERENCED: a retained helper is only
 * safe if it is also unreachable, and unreachability is not a property a type can
 * express. Phase F1 deleted the helper, its Google discovery constants,
 * `googleRedirectUri()` and the `expo-auth-session` import, so those assertions lost
 * the thing they were about. A test that asserts a deleted seam is never called is a
 * test of nothing, and deleting them without a replacement would trade three real
 * guards for none.
 *
 * So the claim is made once, structurally, and at the level that actually matters after
 * a removal: NO MODULE UNDER `lib/` OR `app/` IMPORTS A RETIRED PACKAGE. That is a
 * strictly stronger statement than any of the three it replaces — they each covered one
 * function's behaviour, this covers every file in the app — and it is the claim that
 * makes the removal hold as the code changes.
 *
 * WHY THE IMPORT IS THE RIGHT THING TO READ. A dependency can be absent from
 * `package.json` and still be reached, because `require()` and a bare specifier do not
 * ask the manifest. Reading the import sites is therefore the check that cannot be
 * satisfied by an accident of installation order. `package.json` is asserted separately,
 * below, as the complementary fact.
 *
 * COMMENTS ARE STRIPPED FIRST. This repository documents its own removals by name —
 * `lib/firebase-auth.ts` says "expo-auth-session" several times in prose that explains
 * why it is gone — so a guard reading raw text would fail on the very explanations that
 * record the work. Stripping is therefore load-bearing, not tidiness, and the guard's own
 * positive controls below prove the extraction kept real code.
 *
 * PHASE F2.1 EXTENDS THIS GUARD RATHER THAN DUPLICATING IT, because the two phases removed
 * the same packages from two different surfaces and neither check implies the other. F1
 * removed them from SOURCE; F2.1 removes `expo-auth-session`, `expo-web-browser` and
 * `expo-crypto` from the MANIFEST and the lockfile. `expo-crypto` joins `RETIRED` here
 * because the only thing in the tree that reached it was `expo-auth-session`, so removing
 * that package is what made it unreachable. A source scan cannot see a manifest entry, and
 * a manifest check cannot see a `require()`, so both are asserted. F2.2 adds the third
 * surface, the Expo config's plugin list: that list is what config resolution WALKS, so a
 * plugin whose package is gone is not a warning but a `PluginError` that stops `expo
 * config`, `expo prebuild` and every EAS build before any native work begins. F2.3 extends
 * the same file's scheme list, where the retired entry is byte-identical to the Android
 * package name and the iOS bundle identifier — so the two things that must stay and the one
 * that had to go are the same string, and only an exact-array assertion separates them. F2.4
 * and F2.5 close the fourth surface, the browser-OAuth REDIRECT HANDLER itself: with the
 * package, its plugin and its scheme gone, `app/+native-intent.ts` had no producer left — the
 * hook existed only to keep Router from routing a callback URL no configured scheme can
 * deliver any more. A module that is unreferenced is not the same as a module that is
 * absent, so the last block asserts the file and its suite are gone AND that nothing under
 * `lib/` or `app/` still names the hook, because a re-added import is how a retired handler
 * would come back. F2.6 closes the last surface, the LOCKFILE, and it is the one that forced a
 * claim to be corrected rather than merely extended: `package.json` says what the project ASKS
 * for, but `npm ci` installs from `package-lock.json`, and a resolver walks the installed tree —
 * so the honest property is REACHABILITY, not absence. `@react-native-firebase/app`, which this
 * phase deliberately KEEPS, declares `firebase` as a hard dependency, so the JS SDK is still
 * installed exactly once, nested inside it. It is absent from the root — `node_modules/firebase`
 * does not exist — which is what makes a bare `firebase` specifier unresolvable from `lib/` and
 * `app/`, and that, not deletion, is what the F1 import scan actually enforces. Asserting
 * "no `firebase` entry anywhere" would therefore have been a guard that could never pass; the
 * block below pins where the single legitimate occurrence is allowed to live instead.
 */

import fs from 'fs';
import path from 'path';

const MOBILE_ROOT = path.join(__dirname, '..');

/**
 * The packages retired so far, and the specifiers that reach them.
 *
 * `firebase` and its two subpath specifiers are Phase F1's removals. `expo-auth-session`
 * and `expo-web-browser` were retired from source in F1 and from the manifest in F2.1;
 * `expo-crypto` was reachable only through `expo-auth-session`, so it is retired in F2.1
 * with it. Every phase that removes a package adds its specifier here — a name that is
 * dropped from this list is a name nothing checks any more.
 */
const RETIRED = [
  'firebase',
  'firebase/app',
  'firebase/auth',
  'expo-auth-session',
  'expo-web-browser',
  'expo-crypto',
] as const;

/** `firebase` -> `firebase`, `firebase/auth` -> `firebase\/auth`. */
const ALTERNATION = RETIRED.map((specifier) => specifier.replace('/', '\\/')).join('|');

/**
 * `import … from '<retired>'`, across a multi-line brace list.
 *
 * `[^;]*` rather than a lazy wildcard is deliberate: it cannot cross a statement
 * terminator, so a match always belongs to the import statement it started in. With a
 * lazy wildcard, `import x from './a'; import y from 'firebase/auth';` would match once
 * starting at the FIRST import — a false positive that would make the guard lie in the
 * direction that matters least but still lie.
 */
const IMPORT_FROM = new RegExp(`^\\s*import\\b[^;]*from\\s*['"](?:${ALTERNATION})['"]`, 'm');

/** `import '<retired>'` — the side-effect form, which has no `from`. */
const IMPORT_BARE = new RegExp(`^\\s*import\\s*['"](?:${ALTERNATION})['"]`, 'm');

/** `require('<retired>')`, the Metro-era escape hatch this boundary exists to close. */
const REQUIRE = new RegExp(`require\\(\\s*['"](?:${ALTERNATION})['"]\\s*\\)`);

/**
 * Strip block comments and full-line comments.
 *
 * The full-line filter drops any line whose first non-space characters are `//` or `*`,
 * which is what removes the prose above each removal. Trailing comments are deliberately
 * NOT stripped — doing so requires parsing strings, and every pattern this guard applies
 * is anchored to `import`/`require` at a statement boundary, so a trailing comment can
 * never be mistaken for one.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

/** Every `.ts`/`.tsx`/`.js`/`.jsx` file under a directory, recursively. */
function sourceFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFilesUnder(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) found.push(full);
  }
  return found;
}

/** `lib/auth.tsx` — relative to the mobile root, with forward slashes on every OS. */
const relative = (file: string): string =>
  path.relative(MOBILE_ROOT, file).split(path.sep).join('/');

describe('Phase F1 — no shipped module imports a retired package', () => {
  // `app/` and `lib/` are the whole shipped surface: `__tests__/` legitimately mocks the
  // retired package names, and `node_modules` is not ours.
  const files = [
    ...sourceFilesUnder(path.join(MOBILE_ROOT, 'lib')),
    ...sourceFilesUnder(path.join(MOBILE_ROOT, 'app')),
  ];

  it('walks a plausible surface, so the scan cannot pass by finding nothing', () => {
    // A traversal that silently returned [] would make every `it.each` below pass over an
    // empty list — the failure mode that looks exactly like success. The floor and the two
    // named files are what make that impossible.
    expect(files.length).toBeGreaterThan(20);

    const names = files.map(relative);
    expect(names).toContain('lib/firebase-auth.ts');
    expect(names).toContain('lib/auth.tsx');
    expect(names).toContain('lib/firebase-native.ts');
  });

  it.each(files.map(relative))('%s imports no retired package', (rel) => {
    const source = fs.readFileSync(path.join(MOBILE_ROOT, rel), 'utf8');
    const code = stripComments(source);

    // THE GUARD'S OWN GUARD, per file: an unreadable or mis-pathed read would produce an
    // empty string, and three `not.toMatch` assertions against an empty string pass for
    // the wrong reason.
    expect(source.length).toBeGreaterThan(0);

    expect(code).not.toMatch(IMPORT_FROM);
    expect(code).not.toMatch(IMPORT_BARE);
    expect(code).not.toMatch(REQUIRE);
  });

  it('proves the extraction kept real code, instead of stripping the file away', () => {
    // The complement of the per-file guard: the module whose gate import was REDIRECTED in
    // this phase must still show that import, and the redirected target is `./config`.
    const auth = stripComments(
      fs.readFileSync(path.join(MOBILE_ROOT, 'lib/auth.tsx'), 'utf8')
    );

    expect(auth).toMatch(/^import \{[^}]*isFirebaseConfigured[^}]*\} from '\.\/config';$/m);
    expect(auth).not.toMatch(/from '\.\/firebase'/);
  });
});

describe('Phase F1 — the retired surface is gone from the tree and the manifest', () => {
  it('deletes the Firebase JS SDK boundary module', () => {
    expect(fs.existsSync(path.join(MOBILE_ROOT, 'lib/firebase.ts'))).toBe(false);
  });

  it('declares no Firebase JS SDK dependency', () => {
    // The complementary fact to the import scan: `package.json` is what an installer reads,
    // so a specifier that never appears in source could otherwise keep the package
    // installed and one import away from returning.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8')
    );

    expect(manifest.dependencies.firebase).toBeUndefined();
  });

  it('keeps the native packages that replaced it', () => {
    // The removal is only correct because something else performs the operations. Asserting
    // the replacement is present makes "everything is gone" an impossible reading of this
    // file.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8')
    );

    expect(manifest.dependencies['@react-native-firebase/app']).toBeDefined();
    expect(manifest.dependencies['@react-native-firebase/auth']).toBeDefined();
    expect(manifest.dependencies['@react-native-google-signin/google-signin']).toBeDefined();
  });
});

describe('Phase F2.1 — the retired packages are absent from the manifest', () => {
  /**
   * The three packages F2.1 removed as DIRECT dependencies. `firebase` is F1's manifest
   * removal and is asserted by the block above; these are checked here so that "no removed
   * package is reintroduced" holds for every one of them rather than for the first.
   */
  const F2_RETIRED_DEPENDENCIES = [
    'expo-auth-session',
    'expo-web-browser',
    'expo-crypto',
  ] as const;

  const readManifest = () =>
    JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8'));

  it.each(F2_RETIRED_DEPENDENCIES)('declares no direct %s dependency', (name) => {
    const manifest = readManifest();

    // The three places a package can be declared are checked separately: one moved to
    // `devDependencies` is still installed, still in the lockfile, and still one import
    // away from returning.
    expect(manifest.dependencies?.[name]).toBeUndefined();
    expect(manifest.devDependencies?.[name]).toBeUndefined();
    expect(manifest.optionalDependencies?.[name]).toBeUndefined();
  });

  it('keeps expo-linking, which expo-router depends on', () => {
    // The complement that makes this block a removal rather than a purge: `expo-router`
    // declares `expo-linking` as a dependency, so it must NOT follow the three out. Without
    // this, deleting every `expo-*` entry would satisfy the block above.
    const manifest = readManifest();

    expect(manifest.dependencies['expo-linking']).toBeDefined();
  });
});

describe('Phase F2.2 — the retired plugin is gone from the Expo config', () => {
  /**
   * `app.json` is read directly rather than through a resolved config, and deliberately so:
   * the plugin entry is exactly what config resolution FAILS on once its package is absent
   * (`resolvePluginForModule` throws before any native mod runs), so resolving would be the
   * thing under test instead of the thing doing the testing. The file is what must not drift.
   */
  const plugins = (): unknown[] =>
    JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'app.json'), 'utf8')).expo.plugins;

  it('declares no expo-web-browser plugin', () => {
    // F2.1 removed the package; F2.2 removes this entry with it. Each alone is a hard
    // failure rather than a warning, which is why the pair is asserted on both sides.
    expect(plugins()).not.toContain('expo-web-browser');
  });

  it('keeps the plugins the native surface still needs', () => {
    // The complement, so emptying the array cannot satisfy this block. Plugin entries are
    // either a bare string or a `[name, options]` tuple, hence the unwrap.
    const declared = plugins().map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));

    for (const kept of [
      'expo-router',
      'expo-secure-store',
      'expo-camera',
      '@react-native-firebase/app',
      '@react-native-firebase/auth',
      '@react-native-google-signin/google-signin',
    ]) {
      expect(declared).toContain(kept);
    }
  });
});

describe('Phase F2.3 — the retired scheme is gone from the Expo config', () => {
  const expo = (): Record<string, any> =>
    JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'app.json'), 'utf8')).expo;

  it('declares exactly the one scheme the app still answers to', () => {
    // EXACT-ARRAY equality, not `not.toContain('com.inventoryai.app')`. This pins two
    // distinct failures at once: the retired entry returning, and a scheme being ADDED.
    // `inventoryai` is Phase 27's password-reset scheme (`inventoryai://reset-password`) and
    // is the whole reason the list is not empty.
    expect(expo().scheme).toEqual(['inventoryai']);
  });

  it('keeps the identifiers that the retired scheme string was identical to', () => {
    // The removed scheme, the Android package and the iOS bundle identifier are all the
    // literal string `com.inventoryai.app`, so a search-and-replace across this file is the
    // plausible way to break it — and it would take the package name with it. These two are
    // NOT URI schemes and must survive the scheme's removal.
    expect(expo().android.package).toBe('com.inventoryai.app');
    expect(expo().ios.bundleIdentifier).toBe('com.inventoryai.app');
  });
});

describe('Phase F2.4 + F2.5 — the browser-OAuth redirect handler is gone', () => {
  /**
   * The module name and the export it carried. `+native-intent` is Router's reserved hook
   * filename, so nothing else can legitimately live at that path, and `redirectSystemPath`
   * named the only thing the file exported.
   */
  const RETIRED_HOOK = /\+native-intent|redirectSystemPath/;

  it('deletes the native-intent hook module', () => {
    // F2.3 removed the second scheme, which was the only thing that could deliver
    // `com.inventoryai.app:/oauthredirect`; with no producer left the hook's whole subject is
    // unreachable. A module that is merely unreferenced can be re-wired by one import, which
    // is why the file itself must be absent rather than inert.
    expect(fs.existsSync(path.join(MOBILE_ROOT, 'app/+native-intent.ts'))).toBe(false);
  });

  it('deletes the suite that pinned the hook', () => {
    // The companion fact: a surviving suite would import a module that no longer exists, so
    // its removal is part of the same deletion rather than tidying. The guard's own block
    // below replaces what those tests proved about the shipped surface.
    expect(
      fs.existsSync(path.join(MOBILE_ROOT, '__tests__/native-intent-oauth-callback.test.ts'))
    ).toBe(false);
  });

  it('keeps the route directory the hook was deleted FROM, so absence is not emptiness', () => {
    // The complement, so deleting `app/` wholesale cannot satisfy this block. These are
    // ordinary route files whose presence is unrelated to the removal and would be an
    // obvious casualty of a too-broad delete.
    for (const kept of ['app/_layout.tsx', 'app/login.tsx', 'app/reset-password.tsx']) {
      expect(fs.existsSync(path.join(MOBILE_ROOT, kept))).toBe(true);
    }
  });

  it('finds no shipped module that still names the retired hook', () => {
    // The claim F2.4/F2.5 exists to make, and the one a file-existence check cannot: nothing
    // under the shipped surface may import the hook or reference its export. Comments are
    // stripped first for the same reason as the block above — this file and the roadmap
    // discuss `redirectSystemPath` by name — but `__tests__/` is deliberately out of scope
    // here, because a future test may legitimately assert the hook stays gone.
    const files = [
      ...sourceFilesUnder(path.join(MOBILE_ROOT, 'lib')),
      ...sourceFilesUnder(path.join(MOBILE_ROOT, 'app')),
    ];

    // The same walk-quality floor as the F1 scan: an empty traversal would pass the loop
    // below for the wrong reason.
    expect(files.length).toBeGreaterThan(20);

    const offenders = files.filter((file) => RETIRED_HOOK.test(stripComments(fs.readFileSync(file, 'utf8'))));

    expect(offenders.map(relative)).toEqual([]);
  });
});

describe('Phase F2.6 — the retired packages cannot be resolved from the app root', () => {
  /**
   * The surface F1's source scan and F2.1's manifest check both leave open. `package.json`
   * states intent; `package-lock.json` is what `npm ci` actually installs, and the installed
   * tree is what a module resolver walks — so a package can be absent from the manifest and
   * still be present, one bare specifier away, in the tree that ships. Each assertion below
   * is about a path a module could REACH rather than about a file's contents.
   */
  const F2_RETIRED = ['expo-auth-session', 'expo-web-browser', 'expo-crypto'] as const;

  /** F1's manifest removal, checked on the same surface. */
  const F1_RETIRED = 'firebase';

  const RETIRED_NAMES = [...F2_RETIRED, F1_RETIRED];

  type Lockfile = { packages: Record<string, any> };

  const lock = (): Lockfile =>
    JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'package-lock.json'), 'utf8'));

  /**
   * The bare package name of a lockfile entry: the segment after its LAST `node_modules/`.
   * `node_modules/expo-linking` -> `expo-linking`;
   * `node_modules/@react-native-firebase/app/node_modules/firebase` -> `firebase`.
   */
  const bareName = (key: string): string =>
    key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);

  const allEntries = (): string[] => Object.keys(lock().packages).filter((key) => key !== '');

  it('declares none of the retired packages in the lockfile root package', () => {
    // `packages['']` is the project's own entry inside the lockfile — the manifest as the
    // lockfile records it. A package named here is installed at the root by `npm ci` no matter
    // what `package.json` says, which is why this is read from the lockfile and not inferred
    // from the block above.
    const root = lock().packages[''];
    expect(root).toBeDefined();

    for (const name of RETIRED_NAMES) {
      expect(root.dependencies?.[name]).toBeUndefined();
      expect(root.devDependencies?.[name]).toBeUndefined();
      expect(root.optionalDependencies?.[name]).toBeUndefined();
    }
  });

  it.each(RETIRED_NAMES)('%s is not hoisted, so no shipped module can resolve it', (name) => {
    // THE assertion that makes the F1 import scan enforceable rather than aspirational. A bare
    // `firebase` specifier is resolved by walking up from the importing file to the nearest
    // `node_modules` that contains it; with no entry at the mobile root, a module under `lib/`
    // or `app/` cannot reach one. A NESTED copy is not a hole in this: it is visible only to
    // modules inside its own subtree, and the importing subtrees here are the native packages.
    expect(lock().packages[`node_modules/${name}`]).toBeUndefined();
  });

  it('allows the retired names to appear only nested inside a package this phase keeps', () => {
    // Deliberately a loop over whatever is found, with NO presence assertion. One retired name
    // legitimately survives in the tree — `@react-native-firebase/app` (KEPT, and the whole
    // shipped M1 architecture) declares `firebase` as a hard dependency, so the JS SDK is
    // installed once beneath it. Demanding its absence would be a guard that can never pass;
    // demanding it be present would break on a benign upstream change. What must never happen
    // is a retired name appearing anywhere ELSE — a re-hoist, or a new dependent — so that is
    // exactly what is pinned, and the failure names the offending path.
    const nestedUnder = 'node_modules/@react-native-firebase/app/node_modules/';

    for (const key of allEntries().filter((k) => RETIRED_NAMES.includes(bareName(k)))) {
      expect(key).toContain(nestedUnder);
    }
  });

  it('keeps the packages the app still resolves hoisted at the root', () => {
    // The positive control for this block. A guard whose whole job is "these entries are
    // absent" passes just as happily against an empty, truncated or mis-read lockfile, so the
    // kept packages are asserted present on the same traversal the absence checks use.
    const packages = lock().packages;

    for (const kept of [
      'expo-linking',
      'expo-router',
      'expo-secure-store',
      '@react-native-firebase/app',
      '@react-native-firebase/auth',
      '@react-native-google-signin/google-signin',
    ]) {
      expect(packages[`node_modules/${kept}`]).toBeDefined();
    }
  });
});
