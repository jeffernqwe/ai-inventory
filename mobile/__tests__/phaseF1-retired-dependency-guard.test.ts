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
 */

import fs from 'fs';
import path from 'path';

const MOBILE_ROOT = path.join(__dirname, '..');

/** The packages Phase F1 retired, and the specifiers that reach them. */
const RETIRED = [
  'firebase',
  'firebase/app',
  'firebase/auth',
  'expo-auth-session',
  'expo-web-browser',
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
