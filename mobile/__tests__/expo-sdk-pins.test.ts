/**
 * ISS-16's detection gap — the Expo-managed dependency set, held in CI.
 *
 * WHAT THIS FILE PROVES, AND WHY IT EXISTS. Expo pins a set of native-moving packages to
 * exact ranges and publishes that set from the SDK itself, in
 * `expo/bundledNativeModules.json`. Taking one of those packages outside the set is not a
 * type error, not a lint error and not a test failure — it is a **native** incompatibility
 * that a green `tsc`/`jest` cannot see, and it surfaces only in a native build. That is
 * precisely what happened in Dependabot's PR #34: it moved five of them — `react` 19.2.3 →
 * 19.3.0, `react-dom` likewise, `react-native` 0.86.3 → 0.87.1,
 * `react-native-safe-area-context` ~5.7.0 → ~5.10.1, `react-native-screens` ~4.26.0 →
 * ~4.28.0 — and **both CI jobs stayed green** (ISS-16; the PR was closed, not merged).
 * `.github/dependabot.yml`'s ignore list stops Dependabot from proposing the move again;
 * nothing stopped a hand edit, another bot, or a mistyped install. This does.
 *
 * The comparison is made against the **installed SDK's own table**, never a copy of it
 * that would drift from the thing it claims to describe, and the rule is **equality**,
 * not semver compatibility: that is the form the table's own values take (`react` and
 * `react-native` bare, everything else with `~`) and the form `npx expo install --fix`
 * restores. A legitimate change moves the *installed* `expo` and this guard follows it
 * with no edit — the SDK 58 train changes the table, not this file. A patch-level move
 * inside one SDK moves `expo` first (and its table with it); a *partial* move, one that
 * leaves the manifest between two SDK patch levels, is the half-state this guard exists
 * to refuse.
 *
 * WHAT IT DOES NOT PROVE: that the set builds. It proves the manifest asks for what the
 * SDK's own table asks for — nothing about a native build, nothing about transitive
 * resolutions, and nothing about `expo install --check`'s **remote** patch-level view,
 * which the project has declined for SDK 57 with a recorded reason (ISS-17) and which is
 * a different question from this one.
 *
 * The positive control is as load-bearing as the pass: `compare()` is also run against
 * the recorded PR #34 manifest and must report exactly those five moves, so a comparator
 * that had gone blind fails here instead of passing silently.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const projectRoot = join(__dirname, '..');

const packageJson = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf8')
) as Manifest;

/** The installed SDK's own pin table — read, never transcribed. */
const sdkPins = JSON.parse(
  readFileSync(join(projectRoot, 'node_modules', 'expo', 'bundledNativeModules.json'), 'utf8')
) as Record<string, string>;

/** Every direct dependency, runtime and dev, in one map. */
function declaredDependencies(manifest: Manifest): Record<string, string> {
  return { ...manifest.dependencies, ...manifest.devDependencies };
}

/**
 * The dependency names this guard actually compares: a package is in scope when the SDK
 * declares a pin for it, and in scope for *devDependencies* too (`jest-expo` and
 * `eslint-config-expo` are SDK-managed).
 */
function coveredNames(manifest: Manifest, pins: Record<string, string>): string[] {
  return Object.keys(declaredDependencies(manifest)).filter((name) => pins[name] !== undefined);
}

/** The compared names whose declared range is not the SDK's — the failures. */
function compare(
  manifest: Manifest,
  pins: Record<string, string>
): { name: string; declared: string; sdk: string }[] {
  const declared = declaredDependencies(manifest);
  return coveredNames(manifest, pins)
    .filter((name) => declared[name] !== pins[name])
    .map((name) => ({ name, declared: declared[name], sdk: pins[name] }));
}

/** The five packages PR #34 moved, read from the closed pull request (ISS-16). */
const PR_34_MOVES: Record<string, string> = {
  react: '19.3.0',
  'react-dom': '19.3.0',
  'react-native': '0.87.1',
  'react-native-safe-area-context': '~5.10.1',
  'react-native-screens': '~4.28.0',
};

describe("the manifest is the installed Expo SDK's own pin set", () => {
  it('reads a real pin table from the installed SDK', () => {
    // A moved or renamed table would otherwise make every assertion below vacuous.
    expect(packageJson.dependencies?.expo).toBeDefined();
    expect(Object.keys(sdkPins).length).toBeGreaterThan(100);
    // The packages this guard exists for must be in the table, not merely nearby.
    for (const name of Object.keys(PR_34_MOVES)) {
      expect(sdkPins[name]).toBeDefined();
    }
    expect(sdkPins.react).toBeDefined();
    expect(sdkPins['react-native']).toBeDefined();
  });

  it('declares every Expo-managed package exactly as the installed SDK pins it', () => {
    // Failure means one of two things, and the diff says which: re-run
    // `npx expo install --fix` if the move was not intended, or — if the SDK itself
    // moved (a train) — accept that the table moved with it and commit nothing here.
    expect(compare(packageJson, sdkPins)).toEqual([]);
  });

  it('compares the five packages whose move CI could not see (ISS-16 / PR #34)', () => {
    const covered = coveredNames(packageJson, sdkPins);
    for (const name of Object.keys(PR_34_MOVES)) {
      expect(covered).toContain(name);
    }
  });

  it('lets no expo-* package escape the comparison', () => {
    // `expo` itself is the SDK, not one of its pins, so it is the one exemption.
    const escaped = Object.keys(declaredDependencies(packageJson))
      .filter((name) => name.startsWith('expo-'))
      .filter((name) => sdkPins[name] === undefined);
    expect(escaped).toEqual([]);
  });

  it('detects the recorded PR #34 move — the comparator is not vacuous', () => {
    // The same manifest with exactly the five recorded moves applied to it: this is the
    // state both CI jobs reported green, and it must not be green here.
    const pr34Manifest: Manifest = {
      dependencies: { ...packageJson.dependencies, ...PR_34_MOVES },
      devDependencies: packageJson.devDependencies,
    };
    const mismatches = compare(pr34Manifest, sdkPins).sort((a, b) => a.name.localeCompare(b.name));
    expect(mismatches.map((m) => m.name)).toEqual(Object.keys(PR_34_MOVES).sort());
    // Each one carries the manifest's value on one side and the SDK's on the other, so
    // the failure a reader sees is actionable without a second look.
    expect(mismatches.map((m) => `${m.name}: ${m.declared} (sdk ${m.sdk})`)).toEqual([
      'react: 19.3.0 (sdk 19.2.3)',
      'react-dom: 19.3.0 (sdk 19.2.3)',
      'react-native: 0.87.1 (sdk 0.86.3)',
      'react-native-safe-area-context: ~5.10.1 (sdk ~5.7.0)',
      'react-native-screens: ~4.28.0 (sdk ~4.26.0)',
    ]);
  });

  it('ignores the native packages the SDK does not manage', () => {
    // RNFirebase and Google Sign-In are native too, but Expo pins neither, so the
    // project's own choice governs them — a bump there must not trip this guard.
    const unmanaged: Manifest = {
      dependencies: {
        ...packageJson.dependencies,
        '@react-native-firebase/auth': '99.0.0',
        '@react-native-google-signin/google-signin': '99.0.0',
      },
      devDependencies: packageJson.devDependencies,
    };
    expect(sdkPins['@react-native-firebase/auth']).toBeUndefined();
    expect(sdkPins['@react-native-google-signin/google-signin']).toBeUndefined();
    expect(compare(unmanaged, sdkPins)).toEqual([]);
  });
});
