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

/** The repository root, one level above `mobile/` — where `.github/dependabot.yml` lives. */
const repoRoot = join(projectRoot, '..');

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

  it('detects a move in each of the five packages whose move CI could not see — the comparator is not vacuous', () => {
    // The recorded PR #34 values used to be the perturbation. On SDK 58 three of them are
    // now the SDK's own pins, so replaying that manifest would make this control pass for
    // the wrong reason (only two mismatches). Perturb the same five names away from the
    // installed table instead, which keeps the control independent of the SDK version.
    const WRONG = '0.0.1-comparator-control';
    const perturbed: Manifest = {
      dependencies: { ...packageJson.dependencies },
      devDependencies: packageJson.devDependencies,
    };
    for (const name of Object.keys(PR_34_MOVES)) perturbed.dependencies![name] = WRONG;

    const mismatches = compare(perturbed, sdkPins).sort((a, b) => a.name.localeCompare(b.name));
    expect(mismatches.map((m) => m.name)).toEqual(Object.keys(PR_34_MOVES).sort());
    // Each one carries the manifest's value on one side and the SDK's on the other, so
    // the failure a reader sees is actionable without a second look.
    for (const mismatch of mismatches) {
      expect(mismatch.declared).toBe(WRONG);
      expect(mismatch.sdk).toBe(sdkPins[mismatch.name]);
    }
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

/**
 * The OTHER half of the same rule: every SDK-pinned direct dependency must also be
 * refused by Dependabot.
 *
 * WHY. The guard above only fails once a move has been made. The thing that stops a move
 * being PROPOSED is the ignore list in `.github/dependabot.yml`, and that list is derived
 * by hand from the same table — with no check that the derivation is complete. It was not:
 * measured 2026-10-12 (roadmap §27AY), the derivation read `dependencies` and missed the
 * two SDK-pinned DEVdependencies, so `eslint-config-expo` and `jest-expo` were free to be
 * proposed even though the guard above rejects a move in either — the standing-red-PR
 * outcome the carve-out exists to prevent. `react-native-reanimated` and
 * `react-native-worklets` were missing too once they became direct dependencies.
 *
 * The YAML is read as text, deliberately: the mobile suite declares no YAML parser, and
 * adding a dependency to parse four keys would be a worse trade than matching the one
 * line shape this file needs. The control below keeps that honest.
 */

describe('Dependabot refuses every package the SDK pins', () => {
  const dependabotYaml = readFileSync(join(repoRoot, '.github', 'dependabot.yml'), 'utf8');

  /** The `dependency-name` values of the `/mobile` update, and nothing else. */
  function mobileIgnoredNames(text: string): string[] {
    // Split at each update block so the server and actions lists cannot leak in.
    const blocks = text.split(/^\s*- package-ecosystem:/m).slice(1);
    const mobileBlock = blocks.find((block) => /^\s*directory:\s*\/mobile\s*$/m.test(block));
    if (!mobileBlock) throw new Error('no `/mobile` update block in .github/dependabot.yml');
    return [...mobileBlock.matchAll(/^\s*- dependency-name:\s*"?([^"\n\r]+)"?\s*$/gm)]
      .map((match) => match[1].trim())
      .filter((name) => name !== '*');
  }

  const ignored = mobileIgnoredNames(dependabotYaml);

  /** Pinned names the ignore list does not name — the failures. */
  function missingFromIgnore(manifest: Manifest, ignoreNames: string[]): string[] {
    return coveredNames(manifest, sdkPins).filter((name) => !ignoreNames.includes(name));
  }

  it('names every SDK-pinned direct dependency in its ignore list', () => {
    // A failure here is a one-line fix: add the name to the `/mobile` `ignore` list (see the
    // block comment beside it) rather than letting the package be proposed and then rejected
    // by the guard above.
    expect(missingFromIgnore(packageJson, ignored)).toEqual([]);
  });

  it('is not vacuous — a dropped entry is reported', () => {
    // The comparator run against the same list with exactly one name removed.
    const covered = coveredNames(packageJson, sdkPins);
    const dropped = covered[0];
    expect(missingFromIgnore(packageJson, ignored.filter((name) => name !== dropped))).toEqual([
      dropped,
    ]);
  });
});
