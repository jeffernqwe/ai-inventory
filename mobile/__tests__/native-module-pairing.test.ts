/**
 * The native pairing no other check validates.
 *
 * WHY THIS FILE EXISTS. `__tests__/expo-sdk-pins.test.ts` compares every **direct**
 * dependency against the installed Expo SDK's own pin table
 * (`expo/bundledNativeModules.json`). It could not see the defect this file was written
 * from, because neither package was a direct dependency: `react-native-reanimated`
 * arrives as an **optional peer** of `expo-router` and `react-native-worklets` as an
 * optional peer of the `@expo/ui` that `expo-router` bundles, so npm resolved them from
 * a `*` range to whatever was newest.
 *
 * WHAT WAS WRONG, MEASURED. At HEAD (`373b30a`) the lockfile carried
 * `react-native-reanimated@4.7.1` and `react-native-worklets@0.13.0` while the installed
 * `expo-modules-core` declared `react-native-worklets: "^0.7.4 || ^0.8.0 || ^0.9.0 ||
 * ^0.10.0"`. `npm ls --package-lock-only --all` reported worklets **invalid**
 * (`ELSPROBLEMS`), and both `expo-doctor` (**21/21**) and the pin guard were blind to it:
 * the doctor validates direct dependencies, and so does the guard.
 *
 * THE FIX, AND WHY THIS FILE PINS IT. The pin table already names the correct pair —
 * `react-native-reanimated` **4.5.1** and `react-native-worklets` **0.10.1** — and both
 * declare `react-native: "0.83 - 0.86"`, a partial hyphen range meaning
 * `>=0.83.0 <0.87.0`, which **admits** the 0.86.3 this app installs. Declaring the two
 * as direct dependencies at exactly those versions (roadmap §27AY) made the tree valid
 * again and put them under the pin guard permanently. The invariant that made that fix
 * correct — the installed trio is mutually consistent — is what this file holds, so a
 * future `*`-resolved bump, a hand edit, or an SDK train that moves one member of the
 * trio without the others fails here instead of in a native build.
 *
 * WHAT IT PROVES: the installed worklets satisfies what the installed reanimated states;
 * both native packages support the installed React Native; and `expo-modules-core`'s
 * declared range admits the installed worklets, so `npm ls` stays valid.
 *
 * WHAT IT DOES NOT PROVE: that the combination builds or runs, anything about Reanimated
 * behaviour at runtime, and nothing about the pin table itself — which is the pin
 * guard's job, and which together with this file is what ties the table to the React
 * Native actually installed.
 *
 * The matcher accepts the range forms npm writes into these manifests (`*`, `x`-pinned,
 * exact, `^`, `~`, `a.b - c.d`, `||`) and **throws on any form it does not recognise**,
 * so an unreadable range can never make this guard pass by not looking. The positive
 * control pins that, and it earned its keep: the first draft of this file asserted that
 * reanimated 4.5.1's `0.83 - 0.86` *excluded* RN 0.86.3, and the control failed — the
 * hyphen range ends below `0.87.0`, so 4.5.1 does support it, which is what made the fix
 * above the right one rather than a downgrade.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Manifest = {
  name?: string;
  version?: string;
  peerDependencies?: Record<string, string>;
};

const projectRoot = join(__dirname, '..');

/** The installed manifest of a package, read from the tree that will actually build. */
function installed(name: string): Manifest {
  return JSON.parse(
    readFileSync(join(projectRoot, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')
  ) as Manifest;
}

type Version = { major: number; minor: number; patch: number };

function parseVersion(raw: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!match) throw new Error(`native-module-pairing: cannot read a version from "${raw}"`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** -1 | 0 | 1, comparing major, then minor, then patch. */
function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** One alternative of a range — never the `||` list, which `satisfies` splits first. */
function satisfiesAlternative(v: Version, alternative: string): boolean {
  const range = alternative.trim();
  if (range === '' || range === '*') return true;

  // "0.86 - 0.88" — a hyphen range. A PARTIAL right-hand side means "below the next
  // minor", not "at most X.Y.0": that is why `0.83 - 0.86` admits 0.86.3.
  const hyphen = /^(\d+)\.(\d+)(?:\.(\d+))?\s+-\s+(\d+)\.(\d+)(?:\.(\d+))?$/.exec(range);
  if (hyphen) {
    const floor: Version = { major: Number(hyphen[1]), minor: Number(hyphen[2]), patch: Number(hyphen[3] ?? 0) };
    if (hyphen[6] === undefined) {
      const ceiling: Version = { major: Number(hyphen[4]), minor: Number(hyphen[5]) + 1, patch: 0 };
      return compare(v, floor) >= 0 && compare(v, ceiling) < 0;
    }
    const ceiling: Version = { major: Number(hyphen[4]), minor: Number(hyphen[5]), patch: Number(hyphen[6]) };
    return compare(v, floor) >= 0 && compare(v, ceiling) <= 0;
  }

  // "^0.10.0" — for a 0.x major the caret stops at the next MINOR, not the next major.
  const caret = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (caret) {
    const major = Number(caret[1]);
    const minor = Number(caret[2]);
    const floor: Version = { major, minor, patch: Number(caret[3]) };
    const ceiling: Version =
      major > 0
        ? { major: major + 1, minor: 0, patch: 0 }
        : minor > 0
          ? { major: 0, minor: minor + 1, patch: 0 }
          : { major: 0, minor: 0, patch: Number(caret[3]) + 1 };
    return compare(v, floor) >= 0 && compare(v, ceiling) < 0;
  }

  // "~5.7.0" — the next minor.
  const tilde = /^~(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (tilde) {
    const floor: Version = { major: Number(tilde[1]), minor: Number(tilde[2]), patch: Number(tilde[3]) };
    return compare(v, floor) >= 0 && compare(v, { major: floor.major, minor: floor.minor + 1, patch: 0 }) < 0;
  }

  // "0.10.x" — pin the major and minor, ignore the patch.
  const xPinned = /^(\d+)\.(\d+)\.x$/.exec(range);
  if (xPinned) return v.major === Number(xPinned[1]) && v.minor === Number(xPinned[2]);

  if (/^\d+\.\d+\.\d+$/.test(range)) return compare(v, parseVersion(range)) === 0;

  throw new Error(
    `native-module-pairing: unsupported range "${range}" — extend this matcher instead of skipping it`
  );
}

/** Does `version` satisfy `range`? Any `||` alternative passing is enough. */
function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  return range.split('||').some((alternative) => satisfiesAlternative(v, alternative));
}

const reactNative = installed('react-native');
const reanimated = installed('react-native-reanimated');
const worklets = installed('react-native-worklets');
const expoModulesCore = installed('expo-modules-core');

/** The peer range a package states for another, or undefined when it states none. */
function peerRange(manifest: Manifest, on: string): string | undefined {
  return manifest.peerDependencies?.[on];
}

describe('the installed Reanimated / Worklets pairing', () => {
  it('installs the four packages this guard compares', () => {
    // A rename or a removal would otherwise make every assertion below vacuous.
    for (const manifest of [reactNative, reanimated, worklets, expoModulesCore]) {
      expect(manifest.name).toBeDefined();
      expect(() => parseVersion(String(manifest.version))).not.toThrow();
    }
  });

  it('installs a Worklets version that satisfies the requirement Reanimated states', () => {
    // Reanimated runs against this pairing. A worklets it did not ask for is the
    // version-mismatch class that fails in a native build, not in CI.
    const required = peerRange(reanimated, 'react-native-worklets');
    expect(required).toBeDefined();
    expect(satisfies(String(worklets.version), String(required))).toBe(true);
  });

  it('installs a Reanimated version that supports the installed React Native', () => {
    const required = peerRange(reanimated, 'react-native');
    expect(required).toBeDefined();
    expect(satisfies(String(reactNative.version), String(required))).toBe(true);
  });

  it('installs a Worklets version that supports the installed React Native', () => {
    const required = peerRange(worklets, 'react-native');
    expect(required).toBeDefined();
    expect(satisfies(String(reactNative.version), String(required))).toBe(true);
  });

  it('keeps expo-modules-core admitting the installed worklets, so npm ls stays valid', () => {
    // The regression this file was written from: at HEAD this range rejected the
    // installed worklets and `npm ls` reported ELSPROBLEMS, which neither the doctor nor
    // the pin guard could see. A `*`-resolved bump, a hand edit, or an SDK train moving
    // one member of the trio without the others fails here.
    const cap = peerRange(expoModulesCore, 'react-native-worklets');
    expect(cap).toBeDefined();
    expect(satisfies(String(worklets.version), String(cap))).toBe(true);
  });

  it('refuses to read a range it does not understand — the matcher is not vacuous', () => {
    // The forms these manifests actually contain, including the partial hyphen range
    // whose meaning decided the fix.
    expect(satisfies('0.86.3', '0.83 - 0.86')).toBe(true);
    expect(satisfies('0.87.0', '0.83 - 0.86')).toBe(false);
    expect(satisfies('0.83.0', '0.83 - 0.86')).toBe(true);
    expect(satisfies('0.82.9', '0.83 - 0.86')).toBe(false);
    expect(satisfies('0.86.3', '0.86 - 0.88')).toBe(true);
    expect(satisfies('0.89.0', '0.86 - 0.88')).toBe(false);
    expect(satisfies('0.10.1', '0.10.x')).toBe(true);
    expect(satisfies('0.13.0', '0.10.x')).toBe(false);
    expect(satisfies('0.10.1', '^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0')).toBe(true);
    expect(satisfies('0.13.0', '^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0')).toBe(false);
    expect(satisfies('19.2.4', '^19.2.4')).toBe(true);
    expect(satisfies('20.0.0', '^19.2.4')).toBe(false);
    expect(satisfies('5.7.3', '~5.7.0')).toBe(true);
    expect(satisfies('5.8.0', '~5.7.0')).toBe(false);
    expect(satisfies('1.2.3', '*')).toBe(true);
    // An unreadable range must throw, so this guard can never pass by not looking.
    expect(() => satisfies('1.2.3', '>=1.2.3')).toThrow(/unsupported range/);
  });
});
