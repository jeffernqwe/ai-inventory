#!/usr/bin/env node
/**
 * Publish preflight — what must be true before `eas update` is allowed to describe a release.
 *
 * WHY THIS EXISTS, WITH THE DATE. On **2026-10-25** the first live release note was published to
 * the production channel, then the two files behind it — the note and a sentence on the login
 * screen — were undone on the laptop, and nothing was published again. The production channel
 * therefore kept serving a bundle containing "A small test update" while the repository said no
 * such note existed: `git status` was clean, `main` was committed, and the only artifact that
 * disagreed was the one every phone was actually running.
 *
 * The reason it could happen is not carelessness, it is a property of the tool: **`eas update`
 * publishes the working tree, not a commit.** There is no dirty check, no branch check, and this
 * CLI's `update:list` does not even report a commit hash (verified: `--json` returns branch,
 * message, runtime, group and platforms, and nothing else). So nothing downstream can tell you
 * that the live JavaScript was never committed — the mismatch is invisible until somebody reads
 * the screens.
 *
 * This file closes the gap from the publish side, where it can actually be closed: refuse to
 * publish anything that a commit does not describe. A publish is a release, and a release that
 * cannot be tied to a commit cannot be rolled back to deliberately or explained afterwards.
 *
 * WHAT IT CHECKS, AND WHY EACH ONE IS A FAILURE RATHER THAN A WARNING
 *
 *   1. THE TREE IS CLEAN. A modified or untracked file anywhere in the repository fails the run.
 *      That is stricter than "mobile/ only" on purpose: this repository's releases are pairs
 *      (server deploy + app publish), and a dirty server file is the same class of untraceable
 *      state. `--allow-dirty` exists for the genuine emergency and says so out loud in its output,
 *      because an emergency that silently becomes the habit is how the incident above happened.
 *   2. THE CONFIG STILL SAYS WHAT THE OPERATOR THINKS. Runtime policy `appVersion`, updates
 *      enabled, `ON_LOAD`, `fallbackToCacheTimeout: 0`, and a build profile whose channel is the
 *      one being published to. These are also pinned by `__tests__/ota-update-config.test.ts`;
 *      repeating them here is deliberate, because a test runs when somebody edits the config and
 *      this runs when somebody is about to reach every phone. The publish command it prints is
 *      copied from here, which is also how `--platform android` stops being forgotten.
 *   3. THE BRANCH AND THE REMOTE ARE REPORTED. Neither is a failure: publishing from a branch is
 *      legitimate, and so is a local commit that has not been pushed. But both change what the
 *      commit hash in this output means six months from now, so they are printed next to it
 *      instead of being assumed.
 *   4. THE NATIVE RUNTIME IS THE ONE THAT WAS BUILT. `runtimeVersion` is `appVersion`, so a native
 *      change has to travel with a new app version and a new binary — but nothing in EAS enforces
 *      that while the version is bumped in a commit and the build does not exist yet. On
 *      2026-10-25 an SDK patch moved `expo-modules-core` 58.0.23 → 58.0.26 while every installed
 *      build still carried 58.0.23; a publish from that tree would have served JavaScript to
 *      binaries that cannot run it, and EAS would have accepted it. A committed record
 *      (`ota-native-runtime.json`), written after a build, is compared against the installed tree;
 *      a mismatch fails unless `--allow-native-change` says the exception out loud.
 *
 * WHAT IT DOES NOT DO. It does not publish, does not run the test suite (that is a separate,
 * slower gate — `npm test`), and does not check the EAS environment's variables
 * (`npm run check:build-env -- --profile production --live` does that, and needs a signed-in CLI).
 * One command, one question: *is this tree a release?*
 *
 * USAGE
 *   node scripts/check-ota-publish.mjs                          # production
 *   node scripts/check-ota-publish.mjs --channel preview
 *   node scripts/check-ota-publish.mjs --allow-dirty            # emergency only; says so
 *   node scripts/check-ota-publish.mjs --allow-native-change    # emergency only; says so
 *
 * Exit codes: 0 ready to publish, 1 not ready, 2 could not run.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(mobileRoot);

/**
 * Git output, deliberately NOT trimmed: `git status --porcelain` starts every line with two
 * status characters, one of which is usually a space, so trimming the block silently eats the
 * first path's first letter. Callers that want a scalar trim it themselves.
 */
function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).replace(/\r?\n$/, '');
}

/** `app.json` and `eas.json`, or a thrown error naming which one could not be read. */
function readJson(name) {
  return JSON.parse(readFileSync(join(mobileRoot, name), 'utf8'));
}

/**
 * Expo's `app.json` keeps the real configuration under `expo`; `eas.json` does not. Throws with
 * the file's name rather than returning `{}` and letting every rule pass against nothing.
 */
function readExpoConfig() {
  const app = readJson('app.json');
  const config = app.expo ?? app;
  if (typeof config.version !== 'string') {
    throw new Error('app.json does not resolve a string "version" — cannot state the runtime label');
  }
  return config;
}

/** The installed version of a package in this workspace, or null when it is not installed. */
function installedVersion(name) {
  try {
    return JSON.parse(readFileSync(join(mobileRoot, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

/**
 * The committed native-runtime record, or null when there is none.
 *
 * Deliberately not defaulted: a missing record means no build has claimed this runtime, which is a
 * finding rather than a reason to assume the tree is publishable.
 */
function readNativeRecord() {
  try {
    return JSON.parse(readFileSync(join(mobileRoot, 'ota-native-runtime.json'), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`ota-native-runtime.json is not readable JSON: ${err.message}`);
  }
}

/** The three packages whose versions decide whether a binary can run a bundle. */
const NATIVE_FIELDS = [
  ['expo', 'expo'],
  ['expoModulesCore', 'expo-modules-core'],
  ['reactNative', 'react-native'],
];

/**
 * Does this tree's native runtime match the last build somebody recorded?
 *
 * Pure over its inputs, so the rule can be driven by the tests without a git repository or a build.
 * The version check and the native check answer different questions: the first says "there is no
 * binary for this runtime yet", the second says "there is one, but these modules are newer".
 */
export function compareNativeRuntime({ recorded, installed, appVersion, allowNativeChange }) {
  const findings = [];
  const warn = [];

  if (recorded === null || recorded === undefined) {
    findings.push({
      rule: 'native-record-missing',
      message:
        'ota-native-runtime.json does not exist, so no build has claimed this runtime — build and ' +
        'install it first, then record the versions it was compiled with',
    });
    return { findings, warn };
  }

  const missing = ['appVersion', 'expo', 'expoModulesCore', 'reactNative'].filter(
    (key) => typeof recorded[key] !== 'string',
  );
  if (missing.length > 0) {
    findings.push({
      rule: 'native-record-incomplete',
      message: `ota-native-runtime.json is missing ${missing.join(', ')}`,
    });
    return { findings, warn };
  }

  if (recorded.appVersion !== appVersion) {
    findings.push({
      rule: 'native-version-mismatch',
      message:
        `the recorded build is ${recorded.appVersion} but this tree is ${appVersion} — a ${appVersion} ` +
        'bundle has no installed binary to serve, so build and install it before publishing',
    });
  }

  const moved = NATIVE_FIELDS.filter(([field]) => recorded[field] !== installed[field]).map(
    ([field, name]) => `${name} ${recorded[field]} → ${installed[field] ?? '(not installed)'}`,
  );
  if (moved.length > 0) {
    const message =
      `the native modules moved since the recorded build (${moved.join(', ')}) — JavaScript built ` +
      'against these versions would reach binaries compiled for the recorded ones';
    if (allowNativeChange) warn.push(`${message} [--allow-native-change]`);
    else findings.push({ rule: 'native-runtime-moved', message });
  }

  return { findings, warn };
}

/**
 * Every way this repository is not a release, as `{ rule, message }`.
 *
 * Pure over its inputs so the rules can be reasoned about (and driven) without a git repository.
 */
export function auditPublish({
  tree,
  branch,
  ahead,
  config,
  profiles,
  channel,
  allowDirty,
  native,
  allowNativeChange,
}) {
  const findings = [];
  const warn = [];

  if (tree.length > 0) {
    if (allowDirty) {
      warn.push(
        `the tree is DIRTY and --allow-dirty was passed: ${tree.length} path(s) are not in any ` +
          'commit, so this publish cannot be tied to one',
      );
    } else {
      for (const entry of tree.slice(0, 12)) {
        findings.push({ rule: 'uncommitted', message: `${entry} is not committed` });
      }
      if (tree.length > 12) {
        findings.push({ rule: 'uncommitted', message: `…and ${tree.length - 12} more path(s)` });
      }
      findings.push({
        rule: 'uncommitted',
        message:
          'eas update publishes the WORKING TREE, not a commit — publishing now would serve ' +
          'JavaScript that no commit describes (this is exactly what happened on 2026-10-25)',
      });
    }
  }

  if (branch !== 'main') {
    warn.push(`on branch ${branch}, not main — the publish will still be served to every install`);
  }
  if (ahead === null) {
    // Saying nothing here would read as "nothing is unpushed", which is a claim this run cannot
    // make. Not checked is reported as not checked.
    warn.push('origin/main is unavailable, so unpushed commits were NOT checked');
  } else if (ahead > 0) {
    warn.push(
      `${ahead} commit(s) are not on origin/main — the release is real but exists only on this laptop`,
    );
  }

  const updates = config.updates ?? {};
  if (updates.enabled === false) {
    findings.push({
      rule: 'updates-disabled',
      message: 'app.json sets updates.enabled to false — the app would ignore this publish forever',
    });
  }
  if (config.runtimeVersion?.policy !== 'appVersion') {
    findings.push({
      rule: 'runtime-policy',
      message: `runtimeVersion is ${JSON.stringify(config.runtimeVersion)} — this project's policy is {"policy":"appVersion"}`,
    });
  }
  if (updates.checkAutomatically !== 'ON_LOAD') {
    findings.push({
      rule: 'check-automatically',
      message: `checkAutomatically is ${String(updates.checkAutomatically)} — an install would not look for updates at launch`,
    });
  }
  if (updates.fallbackToCacheTimeout !== 0) {
    findings.push({
      rule: 'launch-waits-for-network',
      message: `fallbackToCacheTimeout is ${String(updates.fallbackToCacheTimeout)} — a launch would wait on EAS instead of starting immediately`,
    });
  }
  if (typeof updates.url !== 'string' || !updates.url.startsWith('https://u.expo.dev/')) {
    findings.push({
      rule: 'update-url',
      message: 'app.json does not name this project at https://u.expo.dev/…',
    });
  }

  const profile = Object.keys(profiles).find((name) => profiles[name]?.channel === channel);
  if (!profile) {
    findings.push({
      rule: 'no-profile-for-channel',
      message: `no build profile in eas.json has channel "${channel}" — nothing installs there`,
    });
  }

  if (native) {
    const nativeResult = compareNativeRuntime({
      recorded: native.recorded,
      installed: native.installed,
      appVersion: config.version,
      allowNativeChange,
    });
    findings.push(...nativeResult.findings);
    warn.push(...nativeResult.warn);
  }

  return { findings, warn, profile, runtime: config.version };
}

function main() {
  const args = process.argv.slice(2);
  const allowDirty = args.includes('--allow-dirty');
  const allowNativeChange = args.includes('--allow-native-change');
  const channelIndex = args.indexOf('--channel');
  const channel = channelIndex >= 0 ? args[channelIndex + 1] : 'production';
  if (typeof channel !== 'string' || !/^[a-z0-9-]{1,40}$/.test(channel)) {
    console.log('::error::check-ota-publish: --channel needs a name such as production or preview');
    return 2;
  }

  let tree;
  let branch;
  let head;
  let ahead = null;
  let config;
  let profiles;
  let native;
  try {
    tree = git(['status', '--porcelain']).split(/\r?\n/).filter(Boolean);
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    head = git(['rev-parse', '--short', 'HEAD']).trim();
    try {
      ahead = Number(git(['rev-list', '--count', 'origin/main..HEAD']).trim());
    } catch {
      ahead = null; // no origin/main to compare with; reported as NOT checked
    }
    config = readExpoConfig();
    profiles = readJson('eas.json').build ?? {};
    native = {
      recorded: readNativeRecord(),
      installed: {
        expo: installedVersion('expo'),
        expoModulesCore: installedVersion('expo-modules-core'),
        reactNative: installedVersion('react-native'),
      },
    };
  } catch (err) {
    console.log(`::error::check-ota-publish could not read the repository: ${err.message}`);
    return 2;
  }

  const label = (entry) => `${entry.slice(0, 2).trim() || '??'} ${entry.slice(3).trim()}`;
  const result = auditPublish({
    tree: tree.map(label),
    branch,
    ahead,
    config,
    profiles,
    channel,
    allowDirty,
    native,
    allowNativeChange,
  });

  console.log(`check-ota-publish: ${channel} · runtime ${result.runtime} · profile ${result.profile ?? '(none)'}`);
  const aheadLabel = ahead === null ? '' : ahead > 0 ? ` (+${ahead} unpushed)` : '';
  console.log(`check-ota-publish: HEAD ${head} on ${branch}${aheadLabel}`);
  const record = native?.recorded;
  console.log(
    `check-ota-publish: native record ${
      record ? `${record.appVersion} · expo-modules-core ${record.expoModulesCore}` : '(none)'
    }`,
  );
  for (const entry of result.warn) console.log(`check-ota-publish: note — ${entry}`);
  for (const finding of result.findings) console.log(`::error::${finding.rule} ${finding.message}`);

  if (result.findings.length > 0) {
    console.log('');
    console.log(`check-ota-publish: ${result.findings.length} finding(s) — NOT ready to publish.`);
    console.log('Resolve the findings above, re-run this, and only then:');
    console.log(
      `  npx eas-cli update --channel ${channel} --environment ${channel} --platform android -m "<what changed>"`,
    );
    return 1;
  }

  console.log('check-ota-publish: ready.');
  console.log('Publish with (both flags matter: the environment loads the variables, the platform skips web):');
  console.log(
    `  npx eas-cli update --channel ${channel} --environment ${channel} --platform android -m "<what changed>"`,
  );
  return 0;
}

// Imported by the tests for its pure rules; executed only when invoked as a script.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
