#!/usr/bin/env node
/**
 * scripts/check-upgrade-watches.mjs — the deferred-upgrade watch list, as one command.
 *
 * WHY THIS EXISTS. The remaining deferred upgrades are not "not started": each is gated on something
 * outside this repository moving first, and the roadmap records each gate as prose to re-check by hand
 * (§27AH "Immediate next actions", §27AI Gate 0, §27AQ's measured blockers). Prose drifts; this reads
 * the registries and prints the same answers, so a session starts from a measurement instead of a
 * memory. It changes nothing — it is a read-only report.
 *
 * WHAT IT WATCHES, and what each one unblocks:
 *   1. `expo`               — `latest` must move to 58 before the SDK 58 train (§27AI) can run. The
 *                             gate is deliberately `latest`, not `next`: Expo promotes an SDK when it
 *                             is ready, and the runbook is written for that moment.
 *   2. `jest-expo`          — jest 30 arrives with the SDK 58 train, and the candidate it judges is the
 *                             one the INSTALLED SDK pins, never the registry's `latest`/`next`. The SDK
 *                             57 line (57.0.5) depends on `@jest/globals@^29.2.1`; 58.0.9 — the newest
 *                             58.x — depends on `^30.0.0`, so jest 30 is delivered by the promotion of
 *                             SDK 58 (§27AI Gate 0). This watch is where the corrected `READY` semantics
 *                             live; see the block above `decideJestExpo` for what it got wrong first.
 *   3. `typescript-eslint`  — TypeScript 7 is blocked until the linter each WORKSPACE actually resolves
 *                             declares a `typescript` peer that admits 7 — and those are two different
 *                             packages: `server/` depends on the meta package `typescript-eslint` and
 *                             never on the parser directly, while `mobile/` gets its parser from
 *                             `eslint-config-expo`, itself SDK-pinned. Measured 2026-10-11: both lines
 *                             read `>=4.8.4 <6.1.0`, so no published 9.x admits 7 on either path.
 *
 * HOW TO RUN. `node scripts/check-upgrade-watches.mjs` (add `--json` for machine output, `--self-test`
 * to run the controls alone). It needs the network and is deliberately NOT part of CI: a pipeline that
 * fails when npm is unreachable would turn an upstream outage into a red build. Exit code is 0 for
 * "report produced" — a watch being READY is news, not a failure of this script. The one non-zero exit
 * is a **failed control**, which stops the report before it is printed, so a broken rule can never be
 * read as a clean bill of health (§27AR's rule, applied here).
 *
 * WHAT IT DOES NOT DO: it never installs, never edits `package.json`, and never decides. `READY` means
 * the gate recorded in the roadmap can be started, nothing more.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org';

/** The slice of semver this file needs — deliberately narrow, and stated rather than approximated. */
function majorOf(version) {
  const m = /^(\d+)\./.exec(version);
  return m ? Number(m[1]) : NaN;
}

/**
 * Does a simple range admit `version`? Handles exactly the forms the watched packages publish:
 * `^X.y.z`, `~X.y.z`, an exact version, and `>=A <B` (possibly `||`-joined). Anything else is
 * reported as "unparsed" rather than silently called a pass, because a wrong answer here would be
 * worse than no answer.
 */
function rangeAdmits(range, version) {
  const target = majorOf(version);
  if (Number.isNaN(target)) return { ok: false, unparsed: true };
  const clauses = String(range)
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const clause of clauses) {
    if (clause.startsWith('^')) {
      const floor = clause.slice(1);
      if (majorOf(floor) === target && compareMajorMinor(floor, version) <= 0) return { ok: true };
    } else if (clause.startsWith('~')) {
      const floor = clause.slice(1);
      if (majorOf(floor) === target && minorOf(floor) === minorOf(version) && compareMajorMinor(floor, version) <= 0) {
        return { ok: true };
      }
    } else if (/^\d+\.\d+\.\d+/.test(clause)) {
      if (clause === version) return { ok: true };
    } else if (clause.includes('>=') || clause.includes('<')) {
      const bounds = clause.split(/\s+/).filter(Boolean);
      let lowerOk = true;
      let upperOk = true;
      for (const bound of bounds) {
        if (bound.startsWith('>=') && compareSemver(bound.slice(2), version) > 0) lowerOk = false;
        if (bound.startsWith('<') && compareSemver(bound.slice(1), version) <= 0) upperOk = false;
      }
      if (lowerOk && upperOk) return { ok: true };
    } else {
      return { ok: false, unparsed: true, clause };
    }
  }
  return { ok: false };
}

function minorOf(version) {
  const m = /^\d+\.(\d+)\./.exec(version);
  return m ? Number(m[1]) : NaN;
}

/** Numeric compare of `a.b.c`-style versions (prerelease tags ignored — none are watched here). */
function compareSemver(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

const compareMajorMinor = (a, b) => compareSemver(a, b);

// ---------------------------------------------------------------------------
// The jest-expo gate — what the SDK owns, and the false READY this corrects
// ---------------------------------------------------------------------------
//
// THE BUG THIS REPLACES. The first version of this watch asked the registry whether ANY jest-expo
// release admitted jest 30, reading `latest` and `next`, and set READY when one did. It found that
// `next` (58.0.9) depends on `@jest/globals@^30.0.0` and therefore printed **READY** on 2026-10-11 —
// while the SDK 58 promotion the roadmap gates jest 30 on (§27AI Gate 0) was still closed. The result
// was an instruction to take `jest-expo@58.0.9` onto Expo 57, and that version is not installable
// here: it also peers `@react-native/jest-preset@^0.88.0-rc.4` — SDK 58's React Native line, a release
// candidate — against this project's RN 0.86.3. That is the ISS-16 / ISS-17 class of change, both of
// which were declined for exactly this reason. The file's own header already said jest 30 "arrives with
// the SDK 58 train"; only the code disagreed. §27AQ recorded both the READY and the SDK-promotion
// sentence, one line apart, without noticing they contradict each other.
//
// WHY `next` WAS THE WRONG PLACE TO LOOK. The `expo` watch above reads only `latest` on the stated
// principle that "Expo promotes an SDK when it is ready". Reading a *prerelease* tag on a *pinned*
// package and calling it a green light applied the opposite rule to the same decision.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJsonIfPresent(absolutePath) {
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * What the installed mobile workspace actually has. Read from `node_modules` rather than from
 * `package.json`, because the pin table that owns these versions is the installed SDK's, and the RN
 * version that must satisfy a preset peer is the one that would run the tests.
 */
function readInstalledMobileFacts() {
  const sdkManifest = readJsonIfPresent(join(REPO_ROOT, 'mobile/node_modules/expo/package.json'));
  const pins = readJsonIfPresent(join(REPO_ROOT, 'mobile/node_modules/expo/bundledNativeModules.json'));
  const reactNative = readJsonIfPresent(join(REPO_ROOT, 'mobile/node_modules/react-native/package.json'));
  const jestPreset = readJsonIfPresent(join(REPO_ROOT, 'mobile/node_modules/@react-native/jest-preset/package.json'));
  const eslintConfigExpo = readJsonIfPresent(join(REPO_ROOT, 'mobile/node_modules/eslint-config-expo/package.json'));
  return {
    sdkVersion: sdkManifest?.version ?? null,
    jestExpoPin: pins?.['jest-expo'] ?? null,
    installedReactNative: reactNative?.version ?? null,
    installedJestPreset: jestPreset?.version ?? null,
    sdkEslintConfigExpoPin: pins?.['eslint-config-expo'] ?? null,
    installedEslintConfigExpo: eslintConfigExpo?.version ?? null,
    // The parser range `mobile/` may actually resolve. mobile/ never declares the parser itself, so its
    // own package.json cannot answer this — the import in `eslint.config.js` is `eslint-config-expo`.
    mobileParserRange: eslintConfigExpo?.dependencies?.['@typescript-eslint/parser'] ?? null,
  };
}

/** A dependency range declared in one of the workspace manifests, or `null`. */
function readDeclaredRange(relativeManifestPath, packageName) {
  const manifest = readJsonIfPresent(join(REPO_ROOT, relativeManifestPath));
  return manifest?.devDependencies?.[packageName] ?? manifest?.dependencies?.[packageName] ?? null;
}

/** The newest published version a simple range admits, or `null` when none does. */
function newestSatisfying(versions, range) {
  const admitted = versions.filter((version) => rangeAdmits(range, version).ok);
  if (!admitted.length) return null;
  return admitted.reduce((best, version) => (compareSemver(version, best) > 0 ? version : best));
}

/** The release triple of a version, prerelease tags dropped (`0.88.0-rc.4` → `0.88.0`). */
function releaseTriple(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/**
 * Does the installed React Native reach the line a candidate's `@react-native/jest-preset` peer asks
 * for? Compared as release triples with prerelease tags dropped: the question is whether the installed
 * RN is at least the line the preset was built for, and for these `0.x` peers — npm's caret caps within
 * the minor — that floor comparison is the question. Anything unreadable answers `false`, never a pass,
 * so an unrecognised range defers the watch instead of clearing it.
 */
function rnPresetAdmits(range, installedReactNative) {
  if (typeof range !== 'string' || !installedReactNative) return false;
  const floor = /(?:\^|~|>=)?\s*(\d+\.\d+\.\d+)/.exec(range.trim());
  if (!floor) return false;
  const installed = releaseTriple(installedReactNative);
  if (!installed) return false;
  return compareSemver(installed, releaseTriple(floor[1])) >= 0;
}

/**
 * The jest-expo gate as a pure function, so the controls below can drive it without the network.
 * `READY` requires BOTH halves: the installed SDK's own pin must reach a jest-30 line AND that
 * version's RN jest-preset peer must be satisfied here. The jest range alone was the wrong question.
 * Returns `{ status, detail }` with `status` one of `READY` / `DEFERRED` / `UNREADABLE`, and
 * `UNREADABLE` is never a pass.
 */
/**
 * The TypeScript 7 gate, per workspace, as a pure function so the controls can drive it.
 *
 * THE BUG THIS REPLACES. The first version read `@typescript-eslint/parser`'s `latest` and reported its
 * `typescript` peer for both workspaces. **Neither workspace depends on that package.** `server/`
 * depends on the meta package `typescript-eslint@^8.71.1`, and `mobile/` resolves the parser only
 * through `eslint-config-expo@57.0.2` (`^8.59.0`) — a package the SDK pins. The old question therefore
 * could not see a `typescript-eslint` 9.x that admits 7, and would have reported READY off a parser
 * release `mobile/` cannot load even if it existed. It answered correctly on 2026-10-11 by coincidence:
 * both lines happened to read `>=4.8.4 <6.1.0`.
 *
 * THE ASYMMETRY IS DELIBERATE, and it is the same rule the jest-expo gate uses — **the constraint the
 * project cannot choose is the gate.** `mobile/`'s parser arrives through the SDK-pinned
 * `eslint-config-expo`, so mobile's answer is resolved through that chain. `server/` declares the meta
 * package itself, so the project can bump it as part of taking TypeScript 7 and the gate is simply
 * whether a published release admits 7. `READY` needs both halves, and an unreadable input is never a
 * pass.
 */
function decideTypescript7({
  serverRange,
  serverLatest,
  serverPeer,
  sdkEslintConfigExpoPin,
  installedEslintConfigExpo,
  mobileParserRange,
  mobileParser,
  mobilePeer,
}) {
  const serverLine = `server: typescript-eslint declared ${serverRange ?? '(none)'}, latest ${serverLatest ?? '(unreadable)'} peer typescript=${serverPeer ?? '(missing)'}`;
  const mobileLine = mobileParserRange
    ? `mobile: eslint-config-expo ${installedEslintConfigExpo ?? '(unreadable)'} (SDK pins ${sdkEslintConfigExpoPin ?? '(none)'}) resolves parser ${mobileParser ?? '(none)'} peer typescript=${mobilePeer ?? '(missing)'}`
    : 'mobile: eslint-config-expo declares no @typescript-eslint/parser range (unreadable)';
  const detail = `${serverLine} | ${mobileLine}`;

  if (!serverLatest || !mobileParserRange) {
    return { status: 'UNREADABLE', detail: `${detail} — an input could not be read` };
  }

  const serverVerdict = rangeAdmits(serverPeer, '7.0.0');
  const mobileVerdict = rangeAdmits(mobilePeer, '7.0.0');
  if (serverVerdict.unparsed || mobileVerdict.unparsed) {
    return { status: 'UNREADABLE', detail: `${detail} — an unparsed peer range` };
  }
  if (serverVerdict.ok && mobileVerdict.ok) return { status: 'READY', detail };

  const blockers = [];
  if (!serverVerdict.ok) blockers.push('the server `typescript-eslint` line');
  if (!mobileVerdict.ok) blockers.push('the SDK-pinned `eslint-config-expo` line for mobile');
  return { status: 'DEFERRED', detail: `${detail} — TypeScript 7 waits on ${blockers.join(' and ')}` };
}

function decideJestExpo({ pin, installedReactNative, inLineVersion, inLineManifest, newestPublished, newestManifest }) {
  const newer =
    newestPublished && newestManifest
      ? `${newestPublished} (peer @react-native/jest-preset ${newestManifest.peerDependencies?.['@react-native/jest-preset'] ?? '(none)'})`
      : 'n/a';
  const suffix = `installed react-native=${installedReactNative ?? '(unreadable)'}; newest published stable: ${newer}`;

  if (!pin) return { status: 'UNREADABLE', detail: `the installed SDK declares no jest-expo pin — ${suffix}` };
  if (!inLineVersion || !inLineManifest) {
    return { status: 'DEFERRED', detail: `the pin ${pin} admits no published jest-expo — ${suffix}` };
  }

  const jestRange = inLineManifest.dependencies?.['@jest/globals'] ?? inLineManifest.dependencies?.['babel-jest'] ?? null;
  const jestVerdict = rangeAdmits(jestRange, '30.0.0');
  if (jestVerdict.unparsed) {
    return { status: 'UNREADABLE', detail: `unparsed jest range ${String(jestRange)} on pinned ${inLineVersion} — ${suffix}` };
  }

  const presetPeer = inLineManifest.peerDependencies?.['@react-native/jest-preset'] ?? null;
  const presetOk = rnPresetAdmits(presetPeer, installedReactNative);

  if (jestVerdict.ok && presetOk) {
    return {
      status: 'READY',
      detail: `pinned ${inLineVersion}: @jest/globals=${jestRange}, preset peer ${presetPeer} satisfied by react-native ${installedReactNative} — ${suffix}`,
    };
  }
  if (jestVerdict.ok) {
    return {
      status: 'DEFERRED',
      detail: `pinned ${inLineVersion} admits jest 30 but its preset peer ${presetPeer ?? '(none)'} is not satisfied by react-native ${installedReactNative} — ${suffix}`,
    };
  }
  return {
    status: 'DEFERRED',
    detail: `pinned ${inLineVersion}: @jest/globals=${jestRange ?? '(missing)'} — no jest 30 on the installed SDK's line — ${suffix}`,
  };
}

// ---------------------------------------------------------------------------
// The decode-uri-component gate (§27CL) — the one advisory that is inside a shipped bundle
// ---------------------------------------------------------------------------
//
// WHY THIS IS A WATCH AND NOT A FIX. `decode-uri-component`'s only patched release is 0.5.0, and it is
// **ESM-only** while its consumer here — `query-string@7.1.3`, reached by expo-router — is CommonJS and
// calls the module's export directly, so applying the fix breaks the app's own deep-link query parsing
// (`TypeError: decodeComponent is not a function`, measured in §27CJ). Nothing in this repository can
// close it today, and the Dependabot alert deliberately stays open. What CAN be automated is the
// question "has upstream moved yet?", which is otherwise a manual re-read of a web page.
//
// THE GATE IS CONJUNCTIVE, and both halves are read from a source rather than remembered:
//   1. a release that is **patched** — the floor comes from the advisory's own `first_patched_version`
//      (GitHub's public advisory API), so the watch follows the advisory instead of a copied constant;
//   2. a release a **CommonJS consumer can require** — decided from the published manifest's own shape
//      (`exports` with a `require` condition, or a `main` on a package that does not declare
//      `"type": "module"`).
//
// A patched-but-ESM-only release is therefore DEFERRED and says so by name — which is exactly the state
// §27CJ measured, so the watch reproduces it rather than describing it.

/**
 * Is `version` inside a vulnerable range? The inverse is "patched".
 *
 * Needed because the public advisory API does **not** always carry `first_patched_version` — measured on
 * this advisory, which returns `null` for it while Dependabot's own alert reports `0.5.0` from the same
 * database. The range it does carry is authoritative and exact (`<= 0.4.2` here), so the floor is derived
 * from it instead: a release is patched when the advisory's own range does not admit it.
 *
 * Handles the forms npm advisories publish for this (`<= A`, `< A`, `>= A`, `> A`, and space-separated
 * compounds). Anything else answers `{ known: false }`, and the caller reports UNREADABLE rather than
 * guessing — a wrong "patched" would close a security alert that should have stayed open.
 */
function vulnerableAdmits(range, version) {
  const clauses = String(range)
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!clauses.length) return { known: false };

  for (const clause of clauses) {
    // Operator and version are TIGHTENED from a single expression rather than split on whitespace: the
    // first version of this read `<= 0.4.2` as the bounds `<=` and `0.4.2`, gave the operator an empty
    // version, and reported the whole range unparsed — which the controls below caught, not the report.
    const bounds = [...clause.matchAll(/(<=|>=|<|>)\s*([0-9][^\s]*)/g)];
    if (!bounds.length) return { known: false, clause };
    const consumed = bounds.map(([, op, bound]) => `${op}${bound}`).join('');
    // Anything the expression did not consume is a form this file has not been taught — a git or
    // workspace range, say. Reported, never treated as "not vulnerable".
    if (consumed !== clause.replace(/\s+/g, '')) return { known: false, clause };

    const all = bounds.every(([, operator, bound]) => {
      const comparison = compareSemver(version, bound);
      if (operator === '<=') return comparison <= 0;
      if (operator === '<') return comparison < 0;
      if (operator === '>=') return comparison >= 0;
      return comparison > 0;
    });
    if (all) return { known: true, admitted: true };
  }
  return { known: true, admitted: false };
}

/**
 * How `require()` of a published package resolves, when the answer is "a value you can call".
 *
 * Deliberately conservative: a `require` condition or a CJS `main` on a non-`type: module` package is
 * accepted, and anything else is reported as not-requireable. The limit is stated rather than hidden —
 * a package with an `exports` map that omits `require` while leaving a stale `main` would be called
 * requireable here even if Node resolved the `exports` map first. It is a watch, not a resolver, and
 * the conservative direction is the one that keeps an alert open instead of closing it wrongly.
 */
function cjsEntry(manifest) {
  const exported = manifest?.exports;
  if (exported && typeof exported === 'object' && !Array.isArray(exported)) {
    const root = exported['.'] && typeof exported['.'] === 'object' ? exported['.'] : exported;
    if (root && typeof root === 'object' && typeof root.require === 'string') return `exports.require=${root.require}`;
  }
  if (manifest?.type === 'module') return null;
  if (typeof manifest?.main === 'string') return `main=${manifest.main}`;
  return null;
}

function decideDecodeUriComponent({ newestPublished, newestManifest, firstPatchedVersion, vulnerableRange }) {
  if (!newestPublished || !newestManifest) {
    return { status: 'UNREADABLE', detail: 'no published release could be read, so there is nothing to judge' };
  }

  // Two sources for the same fact, in order of how explicit they are: the advisory's own
  // `first_patched_version`, then the advisory's vulnerable range with the version tested against it.
  const floor = firstPatchedVersion ?? null;
  const admits = floor ? null : vulnerableAdmits(vulnerableRange ?? '', newestPublished);
  if (!floor && !admits?.known) {
    return {
      status: 'UNREADABLE',
      detail: `the advisory carries neither a patched version nor a usable vulnerable range (${vulnerableRange ?? '(none)'}), so there is no floor to watch against — newest published: ${newestPublished}`,
    };
  }
  const patched = floor ? compareSemver(newestPublished, floor) >= 0 : admits.admitted === false;
  const floorWhy = floor ? `>= ${floor}` : `outside the advisory range ${vulnerableRange}`;

  const entry = cjsEntry(newestManifest);
  const shape = newestManifest.type === 'module' ? 'type=module' : `type=${newestManifest.type ?? '(absent)'}`;

  if (patched && entry) {
    return {
      status: 'READY',
      detail: `${newestPublished} is patched (${floorWhy}) AND requireable from CommonJS (${entry}) — an overrides entry can be applied`,
    };
  }
  if (patched) {
    return {
      status: 'DEFERRED',
      detail: `${newestPublished} is patched (${floorWhy}) but ESM-only (${shape}, no require condition), so a CommonJS consumer's require() yields a namespace — the break §27CJ measured`,
    };
  }
  return {
    status: 'DEFERRED',
    detail: `the newest published release ${newestPublished} is still inside the advisory's vulnerable range (${floor ? `patched floor ${floor}` : String(vulnerableRange)})`,
  };
}

/** The public advisory for this package — the floor is read from it, never copied from the roadmap. */
const DECODE_URI_ADVISORY = 'GHSA-vcc3-ghjq-m6fr';

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const scoped = (name) => name.replace('/', '%2f');

/** Each watch: what to read, what READY means, and what it unblocks. */
const WATCHES = [
  {
    name: 'expo',
    gate: 'SDK 58 train (§27AI) — `latest` must be 58',
    async read() {
      const tags = await getJson(`${REGISTRY}/-/package/expo/dist-tags`);
      const latest = tags.latest;
      return {
        detail: `dist-tags: latest=${latest} next=${tags.next ?? '(none)'}`,
        ready: majorOf(latest) >= 58,
        unblocks: 'the SDK 58 upgrade runbook',
      };
    },
  },
  {
    name: 'jest-expo',
    gate: "jest 30 — the INSTALLED SDK's own jest-expo pin must reach a jest-30 line, installable here",
    async read() {
      const facts = readInstalledMobileFacts();
      const packument = await getJson(`${REGISTRY}/jest-expo`);
      const versions = Object.keys(packument.versions ?? {});
      const stable = versions.filter((version) => /^\d+\.\d+\.\d+$/.test(version));
      const newestPublished = stable.reduce(
        (best, version) => (best && compareSemver(version, best) <= 0 ? best : version),
        null
      );
      const newestManifest = newestPublished ? await getJson(`${REGISTRY}/jest-expo/${newestPublished}`) : null;
      const inLineVersion = newestSatisfying(versions, facts.jestExpoPin);
      const inLineManifest = inLineVersion ? await getJson(`${REGISTRY}/jest-expo/${inLineVersion}`) : null;

      const { status, detail } = decideJestExpo({
        pin: facts.jestExpoPin,
        installedReactNative: facts.installedReactNative,
        inLineVersion,
        inLineManifest,
        newestPublished,
        newestManifest,
      });
      return {
        detail: `installed SDK ${facts.sdkVersion ?? '(unreadable)'} pins jest-expo ${facts.jestExpoPin ?? '(none)'} | ${detail}`,
        ready: status === 'READY',
        unparsed: status === 'UNREADABLE',
        unblocks: 'jest 30 in mobile/',
      };
    },
  },
  {
    name: 'typescript-eslint',
    gate: 'TypeScript 7 — the linter EACH workspace resolves must declare a typescript peer that admits 7',
    async read() {
      const facts = readInstalledMobileFacts();
      const serverRange = readDeclaredRange('server/package.json', 'typescript-eslint');
      const serverManifest = await getJson(`${REGISTRY}/${scoped('typescript-eslint')}/latest`);
      const parserVersions = Object.keys(
        (await getJson(`${REGISTRY}/${scoped('@typescript-eslint/parser')}`)).versions ?? {}
      );
      const mobileParser = facts.mobileParserRange
        ? newestSatisfying(parserVersions, facts.mobileParserRange)
        : null;
      const mobileManifest = mobileParser
        ? await getJson(`${REGISTRY}/${scoped('@typescript-eslint/parser')}/${mobileParser}`)
        : null;

      const { status, detail } = decideTypescript7({
        serverRange,
        serverLatest: serverManifest.version,
        serverPeer: serverManifest.peerDependencies?.typescript ?? null,
        sdkEslintConfigExpoPin: facts.sdkEslintConfigExpoPin,
        installedEslintConfigExpo: facts.installedEslintConfigExpo,
        mobileParserRange: facts.mobileParserRange,
        mobileParser,
        mobilePeer: mobileManifest?.peerDependencies?.typescript ?? null,
      });
      return {
        detail,
        ready: status === 'READY',
        unparsed: status === 'UNREADABLE',
        unblocks: 'TypeScript 7 in mobile/ and server/',
      };
    },
  },
  {
    name: 'decode-uri-component',
    gate: `${DECODE_URI_ADVISORY} — a release that is BOTH patched (>= the advisory's first patched version) AND requireable from CommonJS must exist; today's patched release is ESM-only against a CommonJS consumer (§27CJ)`, 
    async read() {
      const advisory = await getJson(`https://api.github.com/advisories/${DECODE_URI_ADVISORY}`);
      const npmEntry = (advisory.vulnerabilities ?? []).find(
        (v) => v.package?.ecosystem === 'npm' && v.package?.name === 'decode-uri-component'
      );
      const firstPatchedVersion = npmEntry?.first_patched_version?.identifier ?? null;

      const packument = await getJson(`${REGISTRY}/decode-uri-component`);
      const versions = Object.keys(packument.versions ?? {});
      const stable = versions.filter((version) => /^\d+\.\d+\.\d+$/.test(version));
      const newestPublished = stable.reduce(
        (best, version) => (best && compareSemver(version, best) <= 0 ? best : version),
        null
      );
      const newestManifest = newestPublished
        ? await getJson(`${REGISTRY}/decode-uri-component/${newestPublished}`)
        : null;

      const { status, detail } = decideDecodeUriComponent({
        newestPublished,
        newestManifest,
        firstPatchedVersion,
        vulnerableRange: npmEntry?.vulnerable_version_range ?? null,
      });
      return {
        detail: `${detail} | advisory range: ${npmEntry?.vulnerable_version_range ?? '(unreadable)'}, firstPatched: ${firstPatchedVersion ?? '(null in the advisory)'}`,
        ready: status === 'READY',
        unparsed: status === 'UNREADABLE',
        unblocks: 'the decode-uri-component override in mobile/ — the one open advisory that reaches a shipped bundle',
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Controls — the correction's own proof
// ---------------------------------------------------------------------------
//
// The §27AR standard: a check that cannot fail proves nothing. The pair that matters is the last two
// must-not-fire cases — a version that admits jest 30 but whose RN preset this project cannot resolve
// must DEFER — and the must-fire case in which the same candidate on an SDK whose line IS RN 0.88
// turns READY. Without that pair, the fix would be a rule that only ever says DEFERRED.

const controlManifest = (jestRange, presetPeer) => ({
  dependencies: jestRange === undefined ? {} : { '@jest/globals': jestRange },
  peerDependencies: presetPeer === undefined ? {} : { '@react-native/jest-preset': presetPeer },
});

const CONTROLS = [
  {
    name: 'the installed SDK 57 line is not a jest-30 candidate (must not fire)',
    run: () =>
      decideJestExpo({
        pin: '~57.0.5',
        installedReactNative: '0.86.3',
        inLineVersion: '57.0.5',
        inLineManifest: controlManifest('^29.2.1', '^0.86.3'),
        newestPublished: '58.0.9',
        newestManifest: controlManifest('^30.0.0', '^0.88.0-rc.4'),
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'the false READY this fixes — jest 30 admitted, RN preset unreachable (must not fire)',
    run: () =>
      decideJestExpo({
        pin: '~58.0.9',
        installedReactNative: '0.86.3',
        inLineVersion: '58.0.9',
        inLineManifest: controlManifest('^30.0.0', '^0.88.0-rc.4'),
        newestPublished: '58.0.9',
        newestManifest: controlManifest('^30.0.0', '^0.88.0-rc.4'),
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'the promotion — same candidate on an SDK line that is RN 0.88 (must fire)',
    run: () =>
      decideJestExpo({
        pin: '~58.0.9',
        installedReactNative: '0.88.0',
        inLineVersion: '58.0.9',
        inLineManifest: controlManifest('^30.0.0', '^0.88.0-rc.4'),
        newestPublished: '58.0.9',
        newestManifest: controlManifest('^30.0.0', '^0.88.0-rc.4'),
      }),
    expect: 'READY',
  },
  {
    name: 'a pin with no published match (must not fire)',
    run: () => decideJestExpo({ pin: '~99.0.0', installedReactNative: '0.86.3', inLineVersion: null, inLineManifest: null }),
    expect: 'DEFERRED',
  },
  {
    name: 'no jest-expo pin at all — reported, never passed',
    run: () => decideJestExpo({ pin: null, installedReactNative: '0.86.3' }),
    expect: 'UNREADABLE',
  },
  {
    name: 'an unparsed jest range — reported, never passed',
    run: () =>
      decideJestExpo({
        pin: '~57.0.5',
        installedReactNative: '0.86.3',
        inLineVersion: '57.0.5',
        inLineManifest: controlManifest('workspace:^', '^0.86.3'),
      }),
    expect: 'UNREADABLE',
  },
  {
    name: 'an unreadable RN preset peer defers rather than clearing (must not fire)',
    run: () =>
      decideJestExpo({
        pin: '~58.0.9',
        installedReactNative: '0.88.0',
        inLineVersion: '58.0.9',
        inLineManifest: controlManifest('^30.0.0', undefined),
        newestPublished: '58.0.9',
        newestManifest: controlManifest('^30.0.0', undefined),
      }),
    expect: 'DEFERRED',
  },
];

const RANGE_CONTROLS = [
  {
    name: 'newestSatisfying picks the SDK line, not the newest overall',
    run: () => newestSatisfying(['57.0.4', '57.0.5', '58.0.9'], '~57.0.5'),
    expect: '57.0.5',
  },
  {
    name: 'newestSatisfying reports an empty line as null',
    run: () => newestSatisfying(['57.0.4', '58.0.9'], '~57.0.9'),
    expect: null,
  },
];

/**
 * The second control set, for the TypeScript 7 gate. Its must-not-fire pair is the whole point: a
 * `typescript-eslint` release that admits 7 must still DEFER while mobile's SDK-pinned chain resolves a
 * parser that does not, which is the case the version this replaced could not see at all.
 */
const TYPESCRIPT7_CONTROLS = [
  {
    name: 'both the server meta package and the mobile chain sit on the 8.x line (must not fire)',
    run: () =>
      decideTypescript7({
        serverRange: '^8.71.1',
        serverLatest: '8.71.1',
        serverPeer: '>=4.8.4 <6.1.0',
        sdkEslintConfigExpoPin: '~57.0.2',
        installedEslintConfigExpo: '57.0.2',
        mobileParserRange: '^8.59.0',
        mobileParser: '8.71.1',
        mobilePeer: '>=4.8.4 <6.1.0',
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'the bug — a 7-admitting release exists but mobile cannot load it (must not fire)',
    run: () =>
      decideTypescript7({
        serverRange: '^8.71.1',
        serverLatest: '9.0.0',
        serverPeer: '>=4.8.4 <7.1.0',
        sdkEslintConfigExpoPin: '~57.0.2',
        installedEslintConfigExpo: '57.0.2',
        mobileParserRange: '^8.59.0',
        mobileParser: '8.71.1',
        mobilePeer: '>=4.8.4 <6.1.0',
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'the server meta package is the only blocker (must not fire)',
    run: () =>
      decideTypescript7({
        serverRange: '^8.71.1',
        serverLatest: '8.71.1',
        serverPeer: '>=4.8.4 <6.1.0',
        sdkEslintConfigExpoPin: '~58.0.0',
        installedEslintConfigExpo: '58.0.2',
        mobileParserRange: '^9.0.0',
        mobileParser: '9.0.0',
        mobilePeer: '>=4.8.4 <7.1.0',
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'both paths admit 7 (must fire)',
    run: () =>
      decideTypescript7({
        serverRange: '^8.71.1',
        serverLatest: '9.0.0',
        serverPeer: '>=4.8.4 <7.1.0',
        sdkEslintConfigExpoPin: '~58.0.0',
        installedEslintConfigExpo: '58.0.2',
        mobileParserRange: '^9.0.0',
        mobileParser: '9.0.0',
        mobilePeer: '>=4.8.4 <7.1.0',
      }),
    expect: 'READY',
  },
  {
    name: 'a missing mobile parser range is reported, never passed',
    run: () =>
      decideTypescript7({
        serverRange: '^8.71.1',
        serverLatest: '9.0.0',
        serverPeer: '>=4.8.4 <7.1.0',
        sdkEslintConfigExpoPin: '~57.0.2',
        installedEslintConfigExpo: '57.0.2',
        mobileParserRange: null,
        mobileParser: null,
        mobilePeer: null,
      }),
    expect: 'UNREADABLE',
  },
  {
    name: 'an unparsed peer range is reported, never passed',
    run: () =>
      decideTypescript7({
        serverRange: '^8.71.1',
        serverLatest: '8.71.1',
        serverPeer: 'workspace:^',
        sdkEslintConfigExpoPin: '~57.0.2',
        installedEslintConfigExpo: '57.0.2',
        mobileParserRange: '^8.59.0',
        mobileParser: '8.71.1',
        mobilePeer: '>=4.8.4 <6.1.0',
      }),
    expect: 'UNREADABLE',
  },
];

/**
 * The third control set, for the decode-uri-component gate. Its must-fire case is the one that matters:
 * a patched release a CommonJS consumer can require turns READY — without it, the rule would be a switch
 * that can only ever say DEFERRED. The pair beside it is the state measured in §27CJ: patched BUT
 * ESM-only must not fire, because applying that release is what breaks the app.
 */
const DECODE_URI_CONTROLS = [
  {
    name: 'the only patched release is ESM-only — the state §27CJ measured (must not fire)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.5.0',
        newestManifest: { version: '0.5.0', type: 'module', exports: { default: './index.js' } },
        firstPatchedVersion: '0.5.0',
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'a patched release with a require condition (must fire)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.6.0',
        newestManifest: { version: '0.6.0', exports: { '.': { require: './index.cjs', default: './index.mjs' } } },
        firstPatchedVersion: '0.5.0',
      }),
    expect: 'READY',
  },
  {
    name: 'a patched release with a CommonJS main and no type field (must fire)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.5.1',
        newestManifest: { version: '0.5.1', main: 'index.js' },
        firstPatchedVersion: '0.5.0',
      }),
    expect: 'READY',
  },
  {
    name: 'a patched release whose ESM shape hides behind exports (must not fire)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.5.0',
        newestManifest: { version: '0.5.0', type: 'module', exports: { '.': { import: './index.js' } }, main: 'index.js' },
        firstPatchedVersion: '0.5.0',
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'still inside the vulnerable range, however requireable (must not fire)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.4.1',
        newestManifest: { version: '0.4.1', main: 'index.js' },
        firstPatchedVersion: '0.5.0',
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'no patched version AND no usable range is reported, never passed',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.4.1',
        newestManifest: { version: '0.4.1', main: 'index.js' },
        firstPatchedVersion: null,
        vulnerableRange: 'workspace:*',
      }),
    expect: 'UNREADABLE',
  },
  {
    name: 'an unreadable release manifest is reported, never passed',
    run: () =>
      decideDecodeUriComponent({ newestPublished: null, newestManifest: null, firstPatchedVersion: '0.5.0' }),
    expect: 'UNREADABLE',
  },
  // The floor path the LIVE advisory takes: it returns no `first_patched_version`, so the range decides.
  {
    name: 'the real advisory shape — no patched version, range `<= 0.4.2`, newest 0.5.0 requireable (must fire)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.5.0',
        newestManifest: { version: '0.5.0', main: 'index.js' },
        firstPatchedVersion: null,
        vulnerableRange: '<= 0.4.2',
      }),
    expect: 'READY',
  },
  {
    name: 'the same range against the newest release the range still admits (must not fire)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.4.2',
        newestManifest: { version: '0.4.2', main: 'index.js' },
        firstPatchedVersion: null,
        vulnerableRange: '<= 0.4.2',
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'an open-ended range admits every release (must not fire)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '99.0.0',
        newestManifest: { version: '99.0.0', main: 'index.js' },
        firstPatchedVersion: null,
        vulnerableRange: '>= 0.0.0',
      }),
    expect: 'DEFERRED',
  },
  {
    name: 'a compound range is judged on both bounds (must not fire while the newer one holds)',
    run: () =>
      decideDecodeUriComponent({
        newestPublished: '0.9.0',
        newestManifest: { version: '0.9.0', main: 'index.js' },
        firstPatchedVersion: null,
        vulnerableRange: '< 1.0.0 >= 0.5.0',
      }),
    expect: 'DEFERRED',
  },
];

/** Everything the controls assert, in one list, so the summary counts are read from one place. */
const ALL_STATE_CONTROLS = [...CONTROLS, ...TYPESCRIPT7_CONTROLS, ...DECODE_URI_CONTROLS];

const render = (value) => (value === null ? 'null' : JSON.stringify(value));

function runControls() {
  const failures = [];
  for (const control of [...ALL_STATE_CONTROLS, ...RANGE_CONTROLS]) {
    let value;
    try {
      const answer = control.run();
      value = answer && typeof answer === 'object' && 'status' in answer ? answer.status : answer;
    } catch (error) {
      value = `threw: ${error.message}`;
    }
    if (render(value) !== render(control.expect)) {
      failures.push(`${control.name}: expected [${render(control.expect)}], got [${render(value)}]`);
    }
  }
  return failures;
}

const argv = process.argv.slice(2);
const controlFailures = runControls();

if (argv.includes('--self-test') || controlFailures.length) {
  const total = ALL_STATE_CONTROLS.length + RANGE_CONTROLS.length;
  if (controlFailures.length) {
    console.log(`[upgrade-watches] ${controlFailures.length} control(s) FAILED — the report was not produced:`);
    for (const failure of controlFailures) console.log(`  - ${failure}`);
    process.exit(1);
  }
  // Labelled by what each group actually asserts: how many must fire, how many must not, and how
  // many pin the range arithmetic. Calling the range controls "must-not-fire" would be a label that
  // does not match its contents.
  const mustFire = ALL_STATE_CONTROLS.filter((c) => c.expect === 'READY').length;
  const mustNotFire = ALL_STATE_CONTROLS.length - mustFire;
  console.log(
    `[upgrade-watches] ${total} control(s) passed (${mustFire} must-fire, ${mustNotFire} must-not-fire, ${RANGE_CONTROLS.length} range)`
  );
  process.exit(0);
}

const results = [];
let failed = 0;
for (const watch of WATCHES) {
  try {
    const { detail, ready, unparsed, unblocks } = await watch.read();
    results.push({ package: watch.name, gate: watch.gate, detail, status: unparsed ? 'UNPARSED' : ready ? 'READY' : 'DEFERRED', unblocks });
    if (unparsed) failed += 1;
  } catch (error) {
    // A watch that cannot be read is reported as such, never as a pass.
    results.push({ package: watch.name, gate: watch.gate, detail: `unreadable: ${error.message}`, status: 'UNREADABLE', unblocks: '' });
    failed += 1;
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
} else {
  console.log('[upgrade-watches] read-only report — re-read the roadmap gate before acting on it\n');
  for (const row of results) {
    console.log(`  ${row.status.padEnd(10)} ${row.package}`);
    console.log(`             gate:    ${row.gate}`);
    console.log(`             current: ${row.detail}`);
    if (row.unblocks) console.log(`             unblocks: ${row.unblocks}`);
    console.log('');
  }
  const ready = results.filter((r) => r.status === 'READY');
  console.log(
    ready.length
      ? `[upgrade-watches] ${ready.length} gate(s) open: ${ready.map((r) => r.package).join(', ')}`
      : '[upgrade-watches] every watch is still deferred — nothing to start today.'
  );
  if (failed) console.log(`[upgrade-watches] ${failed} watch(es) could not be read — reported above, not counted as a pass.`);
}
process.exit(0);
