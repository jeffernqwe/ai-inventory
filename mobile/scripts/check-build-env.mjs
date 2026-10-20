#!/usr/bin/env node
/**
 * Build-environment guard — the twelve variables a phone build needs, checked
 * before the build instead of after it.
 *
 * WHY THIS EXISTS, WITH THE DATE. On **2026-10-15** this project's production
 * *server* was found unable to onboard a member (no `MAIL_PROVIDER`), and the
 * *build* half of the same deployment was found in the same shape: `eas env:list
 * --environment production` answers
 *
 *     Environment: production
 *     No variables found for this environment.
 *
 * while `preview` and `development` each carry nine — the four
 * `EXPO_PUBLIC_FIREBASE_*` values, two Google client ids and the two Google
 * native configuration FILES. A `--profile production` build therefore inlines
 * `''` for every Firebase value, which `lib/config.ts` turns into
 * `isFirebaseConfigured() === false` — and **nothing fails**. The app does not
 * refuse to start; `lib/auth.tsx` takes the branch that kept unconfigured builds
 * usable before Firebase existed and signs the member up through the **legacy
 * password endpoint** instead. So the member gets an account, the owner gets a
 * green build, and the flow that was supposed to be under test (Firebase-first
 * registration with the AUTH-04 verification code) never runs. That is the same
 * failure class as the server's missing mail provider — legal, silent, and not
 * what anyone intended — and it is the reason this check is a *contract*, not a
 * reminder.
 *
 * WHAT EACH RULE IS FOR, AND WHY IT IS SHAPED THE WAY IT IS.
 *
 *   1. THE CONTRACT IS READ, NOT REMEMBERED. The variable names come from the
 *      `process.env.EXPO_PUBLIC_*` reads in the mobile sources (rule `undeclared`)
 *      and the documented list in `.env.example`. A name that exists in code and
 *      nowhere else fails, so this file cannot drift from the app it guards — the
 *      same argument AI-1's client-budget guard makes when it reads the server's
 *      own default out of its source.
 *   2. A RELEASE PROFILE MUST POINT AT A PUBLIC HTTPS BACKEND. `EXPO_PUBLIC_API_URL`
 *      is optional for a development build (the local fallbacks in `lib/config.ts`
 *      are what they are for) and load-bearing for a release one, where the
 *      fallback `http://10.0.2.2:4000` is the Android *emulator*'s alias for the
 *      host machine and resolves to nothing on a phone. Loopback, emulator, LAN and
 *      `.local` addresses are refused for a release profile by name, because
 *      "it is an http:// URL" was never the thing that mattered.
 *   3. FIREBASE IS ALL-OR-NOTHING, which is the app's own rule
 *      (`isFirebaseConfigured()` returns true only when all four values are
 *      present) — a half-configured profile is reported as a configuration fault
 *      rather than being allowed to fail later, deeper, at the first sign-in.
 *   4. NO SERVER CREDENTIAL MAY CARRY AN `EXPO_PUBLIC_` PREFIX. Everything with
 *      that prefix is compiled into the bundle in plain text, so a name the server
 *      owns (the service-account JSON, the private key, a pepper, a provider API
 *      key, the Mongo URI) appearing here as a *variable name* is a finding even
 *      before a value is set. This is a name check, deliberately: it needs no
 *      value and it cannot be defeated by the value looking innocuous.
 *   5. OFFLINE, THE EAS ENVIRONMENT STORE CANNOT BE SEEN — AND THAT IS SAID OUT
 *      LOUD RATHER THAN ASSUMED AWAY. `--live` asks the EAS CLI what the profile's
 *      environment actually supplies and requires the *union* of `eas.json`'s
 *      inline `env` and the store to satisfy rules 1–3; without `--live` the
 *      store's contents are unknown, so the tool reports them as **not checked**
 *      and does not guess. That is the honest split: what is in the repository is
 *      a repository gate (CI), and what is only in EAS is a pre-build gate an
 *      operator runs on a machine that is signed in.
 *
 * NOTHING HERE PRINTS A VALUE. `eas env:list --format short` prints names on the
 * left of an `=`, and only the left side is read — a value never enters this
 * process's output, and the live query is skipped entirely unless it is asked for.
 *
 * USAGE
 *   node scripts/check-build-env.mjs                  # repository rules, every profile
 *   node scripts/check-build-env.mjs --live           # also ask EAS what each profile has
 *   node scripts/check-build-env.mjs --profile production
 *   node scripts/check-build-env.mjs --self-test      # the controls only
 *
 * Exit codes: 0 clean, 1 findings, 2 could not run (or a failed self-test — in
 * which case the findings are not to be trusted either).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(mobileRoot);

/**
 * The Firebase values the app inlines at build time, in the order `lib/config.ts`
 * reads them. Four, together, or the build has no Firebase at all.
 */
const FIREBASE_NAMES = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

/** The one variable every release build must have, and where it must point. */
const API_URL_NAME = 'EXPO_PUBLIC_API_URL';

/**
 * Names the SERVER owns. Any of these appearing with an `EXPO_PUBLIC_` prefix
 * would be compiled into the app bundle, so their presence as a *name* is the
 * finding, with or without a value.
 */
const SERVER_OWNED_NAMES = [
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'MONGODB_URI',
  'JWT_SECRET',
  'EMAIL_VERIFICATION_CODE_PEPPER',
  'BREVO_API_KEY',
  'OPENROUTER_API_KEY',
  'AI_API_KEY',
];

/** Addresses that are meaningful on a developer's machine and nowhere else. */
const NON_PUBLIC_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^10\.0\.2\.2$/, // the Android emulator's alias for the host machine
  /\.local$/i,
  /^\[::1\]$/,
];

/** A well-formed URL, so a typo is a finding rather than a mystery at runtime. */
function isPublicHttpsUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return !NON_PUBLIC_HOSTS.some((host) => host.test(url.hostname));
}

/** One finding: which profile, which rule, what to do about it. */
function problem(profile, rule, message) {
  return { profile, rule, message };
}

/**
 * Why a name may not carry an `EXPO_PUBLIC_` prefix, or null when it may.
 *
 * Everything with that prefix is compiled into the app bundle in plain text, so the
 * rule is stated as a fact about the NAME — it needs no value, and it cannot be
 * defeated by a value that looks innocuous. Two ways a name can be wrong here: it
 * belongs to the server, or it is a build-runner INPUT (a file path handed to
 * `app.config.js`) rather than a value the app reads at runtime.
 */
function publicPrefixProblem(name, nativeFileNames = []) {
  if (typeof name !== 'string' || !name.startsWith('EXPO_PUBLIC_')) return null;
  const bare = name.replace(/^EXPO_PUBLIC_/, '');
  if (SERVER_OWNED_NAMES.includes(bare)) {
    return `${name} carries an EXPO_PUBLIC_ prefix: everything with that prefix is compiled into the app bundle, and that name belongs to the server`;
  }
  if (nativeFileNames.includes(bare)) {
    return `${name} carries an EXPO_PUBLIC_ prefix: ${bare} is a build-runner INPUT (the path of an uploaded file), not a value to inline into the bundle`;
  }
  return null;
}

/**
 * Resolve a profile's own inline environment, following `extends`.
 *
 * `extends` is inherited configuration, so a profile that extends another has
 * that profile's `env` unless it overrides the key — exactly as the EAS CLI reads
 * it. A cycle is impossible in a file the CLI accepts, but the guard cannot
 * assume the file is acceptable, so it walks with a seen-set and stops.
 */
export function resolveProfileEnv(profileName, profiles) {
  const env = {};
  const seen = new Set();
  let current = profileName;
  const chain = [];
  while (current && profiles[current] && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = profiles[current].extends;
  }
  // Deepest ancestor first, so the most specific profile's own values win.
  for (const name of chain.reverse()) {
    const own = profiles[name]?.env;
    if (own && typeof own === 'object') Object.assign(env, own);
  }
  return env;
}

/** A profile is release-shaped when it does not build a development client. */
export function isReleaseProfile(profileName, profiles) {
  const seen = new Set();
  let current = profileName;
  while (current && profiles[current] && !seen.has(current)) {
    seen.add(current);
    if (profiles[current].developmentClient === true) return false;
    current = profiles[current].extends;
  }
  return true;
}

/**
 * Audit ONE profile. Pure, so the controls can drive every rule with synthetic
 * inputs instead of editing `eas.json` — which is also why the live/store
 * distinction is a parameter (`storeEnv`) rather than a branch inside the CLI
 * plumbing.
 *
 * @param {object} input
 * @param {string} input.profileName
 * @param {object} input.profiles       `eas.json`'s `build` map
 * @param {string[]|null} input.storeEnv Names the EAS environment store supplies,
 *        or `null` when the store was NOT consulted (offline).
 * @param {string[]} input.sourceNames  `EXPO_PUBLIC_*` names read by the sources
 * @param {string[]} input.nativeFileNames Build-runner file variables (`app.config.js`)
 * @param {string[]} input.declaredNames Names `.env.example` declares
 */
export function auditProfile({
  profileName,
  profiles,
  storeEnv,
  sourceNames,
  nativeFileNames = [],
  declaredNames,
}) {
  const problems = [];
  const release = isReleaseProfile(profileName, profiles);
  const inlineEnv = resolveProfileEnv(profileName, profiles);
  const stored = storeEnv === null ? null : new Set(storeEnv);
  const inline = new Set(Object.keys(inlineEnv));

  /** Present in `eas.json`'s inline env, or (when asked) in the store. */
  const has = (name) => inline.has(name) || (stored !== null && stored.has(name));

  // --- rule: a release profile must reach a public backend -------------------
  if (release) {
    if (has(API_URL_NAME)) {
      // Only an INLINE value can be judged: a store value is never read at all
      // (it may be secret-classified, and this tool never prints a value), so a
      // profile that gets its URL from the store is trusted on the store's word.
      const value = typeof inlineEnv[API_URL_NAME] === 'string' ? inlineEnv[API_URL_NAME] : '';
      if (inline.has(API_URL_NAME) && !isPublicHttpsUrl(value)) {
        problems.push(
          problem(
            profileName,
            'api-url-not-public',
            `${API_URL_NAME} is "${value}" — a release build must use a public https URL; ` +
              'loopback, emulator (10.0.2.2), LAN and .local addresses resolve to nothing on a phone',
          ),
        );
      }
    } else {
      problems.push(
        problem(
          profileName,
          'api-url-missing',
          `${API_URL_NAME} is supplied by neither this profile nor the EAS ${profileName} ` +
            'environment, so the build falls back to lib/config.ts\' local default',
        ),
      );
    }
  }

  // --- rules: Firebase is all-or-nothing, and a release profile needs it ------
  const firebaseDeclaredInline = FIREBASE_NAMES.filter((name) => inline.has(name));
  if (firebaseDeclaredInline.length > 0 && firebaseDeclaredInline.length < FIREBASE_NAMES.length) {
    const missing = FIREBASE_NAMES.filter((name) => !inline.has(name));
    problems.push(
      problem(
        profileName,
        'firebase-half-configured',
        `Firebase is all-or-nothing and this profile declares ${firebaseDeclaredInline.length} of ` +
          `${FIREBASE_NAMES.length} values; missing: ${missing.join(', ')}`,
      ),
    );
  }

  if (release && stored !== null) {
    const missing = FIREBASE_NAMES.filter((name) => !has(name));
    if (missing.length > 0) {
      problems.push(
        problem(
          profileName,
          'firebase-not-in-store',
          `the EAS ${profileName} environment supplies no ${missing.join(', ')} — ` +
            'isFirebaseConfigured() is false, so the build silently signs members in through the ' +
            'legacy password path and the Firebase-first registration flow is never exercised',
        ),
      );
    }

    // The native half of the same question, and the more brutal one: without these
    // files the build does not degrade, it FAILS (inside Gradle, or at the first
    // native Firebase call), because the in-file fallback path is a developer's
    // machine convention and not something a build runner has. See app.config.js.
    const missingFiles = nativeFileNames.filter((name) => !has(name));
    if (missingFiles.length > 0) {
      problems.push(
        problem(
          profileName,
          'native-config-not-in-store',
          `the EAS ${profileName} environment supplies no ${missingFiles.join(', ')} — ` +
            'app.config.js then falls back to a project-root path that does not exist on a build ' +
            'runner (EAS supplies these as `--type file` variables holding the uploaded file path)',
        ),
      );
    }
  }

  // --- rule: nothing that is not client configuration may be inlined ---------
  for (const name of [...sourceNames, ...declaredNames, ...inline.keys()]) {
    const why = publicPrefixProblem(name, nativeFileNames);
    if (why) problems.push(problem(profileName, 'server-credential-as-public', why));
  }

  return {
    profileName,
    release,
    storeConsulted: stored !== null,
    problems,
  };
}

/**
 * Audit the repository itself: names used by the sources must be documented, and
 * nothing server-owned may be public. Reported once, not per profile, because
 * these are facts about the tree rather than about a build.
 */
export function auditContract({ sourceNames, declaredNames, nativeFileNames = [] }) {
  const problems = [];
  const declared = new Set(declaredNames);

  for (const name of [...sourceNames].sort()) {
    // A name that may not be public at all is the more serious finding, so it is
    // reported as that rather than as merely undocumented.
    const why = publicPrefixProblem(name, nativeFileNames);
    if (why) problems.push(problem('(repository)', 'server-credential-as-public', why));
    else if (!declared.has(name)) {
      problems.push(
        problem(
          '(repository)',
          'undeclared',
          `${name} is read by the mobile sources but is not listed in mobile/.env.example`,
        ),
      );
    }
  }

  for (const name of [...declaredNames].sort()) {
    const why = publicPrefixProblem(name, nativeFileNames);
    if (why) problems.push(problem('(repository)', 'server-credential-as-public', why));
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Repository readers
// ---------------------------------------------------------------------------

function readEasJson() {
  return JSON.parse(readFileSync(join(mobileRoot, 'eas.json'), 'utf8'));
}

/**
 * The `process.env` names the mobile sources actually read, split by what they are.
 *
 * SCANNED FROM SOURCE ON PURPOSE. A hand-maintained list of "the variables the app
 * needs" is the exact artifact that goes stale silently, and the whole point of
 * this guard is that silence is the enemy. Only dotted, literal reads count — which
 * is also the only form Expo's build-time inlining supports (see the note in
 * `lib/config.ts`), so the scan and the bundler agree by construction.
 *
 * TWO KINDS, AND THEY ARE NOT INTERCHANGEABLE:
 *
 *   * `EXPO_PUBLIC_*` values are INLINED INTO THE BUNDLE. They must be documented
 *     in `.env.example` and must never carry a server-owned name.
 *   * anything else read at config-resolution time is a BUILD-RUNNER input. Today
 *     that is exactly `app.config.js`'s two native Firebase files
 *     (`GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST`), which EAS supplies as
 *     `--type file` variables holding the path the runner wrote the upload to. Their
 *     in-file fallback (`./google-services.json`) exists on a developer's machine
 *     and NOT on a build runner, so a profile missing one fails from inside Gradle —
 *     which is why they are checked too, and how this guard came to know about them:
 *     the file that names them says so (`app.config.js`, MAINTENANCE).
 *
 * Comments are stripped before matching, because the modules that use these
 * variables also discuss them in prose — `lib/config.ts` writes the literal
 * expression `process.env.NAME` while explaining inlining — and a guard that read
 * prose as configuration would demand a variable named NAME.
 */
function readSourceNames() {
  const publicNames = new Set();
  const nativeFileNames = new Set();
  const skip = new Set(['node_modules', 'dist', '.expo', '.smoke', 'android', 'ios', '.git', '__tests__']);
  const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0 || !allowedExtensions.has(entry.name.slice(dot))) continue;
      // Block comments go entirely; a line comment only when the line IS one.
      // Stripping from the first `//` anywhere would also cut a `https://` string
      // literal and silently drop a real read that shared its line.
      const text = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .map((line) => (/^\s*\/\//.test(line) ? '' : line))
        .join('\n');
      for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)) {
        if (match[1].startsWith('EXPO_PUBLIC_')) publicNames.add(match[1]);
        else nativeFileNames.add(match[1]);
      }
    }
  };

  if (!statSync(mobileRoot).isDirectory()) throw new Error('mobile/ is not a directory');
  walk(mobileRoot);
  return { publicNames: [...publicNames], nativeFileNames: [...nativeFileNames] };
}

/** The names `mobile/.env.example` documents, in file order. */
function readDeclaredNames() {
  const text = readFileSync(join(mobileRoot, '.env.example'), 'utf8');
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match) names.push(match[1]);
  }
  return names;
}

/**
 * Ask the EAS CLI what one environment supplies — NAMES ONLY.
 *
 * The CLI prints `NAME=value` lines in `short` format. Only the name is taken, so
 * no value is ever read into this process, printed, or compared. A return of
 * `null` means the question could not be answered (not signed in, offline, or no
 * CLI), and the caller reports that as *not checked* rather than as clean.
 */
function readStoreEnv(profileName) {
  if (!/^[a-z0-9-]{1,40}$/i.test(profileName)) return null;
  const cliArgs = ['eas', 'env:list', '--environment', profileName, '--format', 'short'];
  // On Windows `npx` is a `.cmd`, which Node refuses to execute without a shell
  // and warns about when one is used, so the interpreter is named explicitly and
  // the arguments are passed positionally instead. Either way this runs with no
  // shell expansion of its own, and the profile name is validated above.
  const [command, args] =
    process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', 'npx', ...cliArgs]] : ['npx', cliArgs];
  let output;
  try {
    output = execFileSync(command, args, {
      cwd: mobileRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 120000,
    });
  } catch {
    return null;
  }

  const names = output
    .split(/\r?\n/)
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line))
    .filter(Boolean)
    .map((match) => match[1]);
  if (names.length === 0 && !/Environment:\s*\S/.test(output)) return null;
  return names;
}

// ---------------------------------------------------------------------------
// Controls — a guard that cannot fail proves nothing
// ---------------------------------------------------------------------------

function selfTest() {
  const sourceNames = [...FIREBASE_NAMES, API_URL_NAME];
  const declaredNames = [...sourceNames];
  const nativeFileNames = ['GOOGLE_SERVICES_JSON', 'GOOGLE_SERVICE_INFO_PLIST'];
  const healthy = {
    development: { developmentClient: true, distribution: 'internal' },
    'ios-simulator': { extends: 'development', ios: { simulator: true } },
    preview: { distribution: 'internal', env: { [API_URL_NAME]: 'https://example.test' } },
    production: {
      autoIncrement: true,
      env: {
        [API_URL_NAME]: 'https://example.test',
        ...Object.fromEntries(FIREBASE_NAMES.map((name) => [name, 'inline'])),
      },
    },
  };

  /**
   * THE SHAPE THIS PROJECT WAS ACTUALLY IN ON 2026-10-15: a release profile that
   * names its backend, holds no Firebase value inline, and needs the EAS
   * environment to supply the four — which the production environment did not.
   */
  const storeless = {
    production: { autoIncrement: true, env: { [API_URL_NAME]: 'https://example.test' } },
  };

  const cases = [
    {
      name: 'repository contract: every source name is declared in .env.example',
      actual: auditContract({ sourceNames, declaredNames }),
      expected: [],
    },
    {
      name: 'repository contract: a source name missing from .env.example is a finding',
      actual: auditContract({ sourceNames: [...sourceNames, 'EXPO_PUBLIC_NEW_THING'], declaredNames }),
      expected: ['undeclared'],
    },
    {
      name: 'repository contract: a server credential with a public prefix is a finding, with no value needed',
      actual: auditContract({
        sourceNames: [...sourceNames, 'EXPO_PUBLIC_FIREBASE_PRIVATE_KEY'],
        declaredNames,
      }),
      expected: ['server-credential-as-public'],
    },
    {
      name: 'release profile with a public https URL and all four Firebase values inline is clean',
      actual: auditProfile({
        profileName: 'production',
        profiles: healthy,
        storeEnv: null,
        sourceNames,
        declaredNames,
      }).problems,
      expected: [],
    },
    {
      name: 'release profile with no API URL at all is a finding',
      actual: auditProfile({
        profileName: 'production',
        profiles: { production: {} },
        storeEnv: null,
        sourceNames,
        declaredNames,
      }).problems,
      expected: ['api-url-missing'],
    },
    {
      name: 'release profile pointing at the Android emulator alias is a finding',
      actual: auditProfile({
        profileName: 'production',
        profiles: { production: { env: { [API_URL_NAME]: 'http://10.0.2.2:4000' } } },
        storeEnv: null,
        sourceNames,
        declaredNames,
      }).problems,
      expected: ['api-url-not-public'],
    },
    {
      name: 'release profile pointing at a LAN address is a finding',
      actual: auditProfile({
        profileName: 'production',
        profiles: { production: { env: { [API_URL_NAME]: 'http://192.168.1.4:4000' } } },
        storeEnv: null,
        sourceNames,
        declaredNames,
      }).problems,
      expected: ['api-url-not-public'],
    },
    {
      name: 'half-configured Firebase inline is a finding even though the store might complete it',
      actual: auditProfile({
        profileName: 'production',
        profiles: {
          production: {
            env: { [API_URL_NAME]: 'https://example.test', [FIREBASE_NAMES[0]]: 'inline' },
          },
        },
        storeEnv: null,
        sourceNames,
        declaredNames,
      }).problems,
      expected: ['firebase-half-configured'],
    },
    {
      // THE CASE THIS TOOL WAS WRITTEN FOR: the state of the EAS project on
      // 2026-10-15, where the production environment supplies nothing at all.
      name: 'a release profile whose EAS environment supplies no Firebase values is a finding',
      actual: auditProfile({
        profileName: 'production',
        profiles: storeless,
        storeEnv: [],
        sourceNames,
        declaredNames,
      }).problems,
      expected: ['firebase-not-in-store'],
    },
    {
      name: 'the same profile is clean once the store supplies the four values',
      actual: auditProfile({
        profileName: 'production',
        profiles: storeless,
        storeEnv: FIREBASE_NAMES,
        sourceNames,
        declaredNames,
      }).problems,
      expected: [],
    },
    {
      // The native-configuration half: preview and development have these two and
      // production did not, and without them the build fails rather than degrades.
      name: 'a release profile whose store lacks the native Firebase configuration files is a finding',
      actual: auditProfile({
        profileName: 'production',
        profiles: storeless,
        storeEnv: FIREBASE_NAMES,
        sourceNames,
        nativeFileNames,
        declaredNames,
      }).problems,
      expected: ['native-config-not-in-store'],
    },
    {
      name: 'and the profile is clean when the store supplies both kinds',
      actual: auditProfile({
        profileName: 'production',
        profiles: storeless,
        storeEnv: [...FIREBASE_NAMES, ...nativeFileNames],
        sourceNames,
        nativeFileNames,
        declaredNames,
      }).problems,
      expected: [],
    },
    {
      // A build-runner INPUT inlined as a public value is the same class of mistake
      // as a server credential: `EXPO_PUBLIC_GOOGLE_SERVICES_JSON` would compile a
      // path into the bundle instead of configuring the native build.
      name: 'a build-runner file variable is never expected to carry a public prefix either',
      actual: auditContract({
        sourceNames,
        declaredNames: [...declaredNames, ...nativeFileNames.map((name) => `EXPO_PUBLIC_${name}`)],
        nativeFileNames,
      }),
      expected: ['server-credential-as-public', 'server-credential-as-public'],
    },
    {
      // Offline, the store is unknown; saying "clean" would be a claim this tool
      // cannot make, so it reports nothing and the report marks the store unchecked.
      name: 'offline, a release profile without inline Firebase values is reported as unchecked rather than as a finding',
      actual: auditProfile({
        profileName: 'production',
        profiles: storeless,
        storeEnv: null,
        sourceNames,
        declaredNames,
      }),
      expected: [],
      expectedStoreConsulted: false,
    },
    {
      name: 'a development build is not held to the release rules',
      actual: auditProfile({
        profileName: 'development',
        profiles: { ...healthy, development: { developmentClient: true, distribution: 'internal' } },
        storeEnv: [],
        sourceNames,
        declaredNames,
      }).problems,
      expected: [],
    },
    {
      name: 'an inherited API URL satisfies the release rule, so extends is honoured',
      actual: auditProfile({
        profileName: 'production',
        profiles: {
          base: { env: { [API_URL_NAME]: 'https://example.test' } },
          production: { extends: 'base' },
        },
        storeEnv: FIREBASE_NAMES,
        sourceNames,
        declaredNames,
      }).problems,
      expected: [],
    },
    {
      name: 'a profile that overrides an inherited value beats it',
      actual: auditProfile({
        profileName: 'production',
        profiles: {
          base: { env: { [API_URL_NAME]: 'https://example.test' } },
          production: { extends: 'base', env: { [API_URL_NAME]: 'http://localhost:4000' } },
        },
        storeEnv: FIREBASE_NAMES,
        sourceNames,
        declaredNames,
      }).problems,
      expected: ['api-url-not-public'],
    },
  ];

  let failures = 0;
  for (const testCase of cases) {
    const actual = Array.isArray(testCase.actual) ? testCase.actual : testCase.actual.problems;
    const rules = actual.map((entry) => entry.rule).sort();
    const expected = [...testCase.expected].sort();
    let ok = rules.length === expected.length && rules.every((rule, i) => rule === expected[i]);
    if (ok && testCase.expectedStoreConsulted !== undefined) {
      ok = testCase.actual.storeConsulted === testCase.expectedStoreConsulted;
    }
    if (!ok) {
      failures += 1;
      console.log(
        `::error::self-test ${testCase.name}: expected [${expected.join(', ') || 'clean'}], got [${rules.join(', ') || 'clean'}]`,
      );
    }
  }

  if (failures > 0) {
    console.log(
      `build-env guard self-test: ${failures} of ${cases.length} control(s) FAILED — a rule is broken; do not trust this run.`,
    );
    return 1;
  }
  console.log(`build-env guard self-test: ${cases.length} control(s) passed`);
  return 0;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const controls = selfTest();
  if (args.includes('--self-test')) return controls;

  const live = args.includes('--live');
  const only = (() => {
    const index = args.indexOf('--profile');
    return index >= 0 ? args[index + 1] : null;
  })();

  let eas;
  let publicNames;
  let nativeFileNames;
  let declaredNames;
  try {
    eas = readEasJson();
    ({ publicNames, nativeFileNames } = readSourceNames());
    declaredNames = readDeclaredNames();
  } catch (err) {
    console.log(`::error::build-env guard could not read the repository: ${err.message}`);
    return 2;
  }

  const profiles = eas.build ?? {};
  const names = Object.keys(profiles).filter((name) => !only || name === only);
  if (names.length === 0) {
    console.log(`::error::build-env guard: no build profile matches ${only ?? '(any)'}`);
    return 2;
  }

  const findings = [];
  console.log(`build-env guard: ${relative(REPO_ROOT, join(mobileRoot, 'eas.json'))}, ${names.length} profile(s)`);
  console.log(`build-env guard: inlined value(s) read from source: ${publicNames.join(', ')}`);
  console.log(
    `build-env guard: build-runner file variable(s) read from source: ${nativeFileNames.join(', ') || '(none)'}`,
  );
  console.log(`build-env guard: EAS environment store ${live ? 'consulted' : 'NOT consulted (pass --live)'}`);

  for (const name of names) {
    const storeEnv = live ? readStoreEnv(name) : null;
    const result = auditProfile({
      profileName: name,
      profiles,
      storeEnv,
      sourceNames: publicNames,
      nativeFileNames,
      declaredNames,
    });
    findings.push(...result.problems);

    const shape = result.release ? 'release' : 'development';
    if (result.problems.length === 0) {
      const store = live
        ? result.storeConsulted
          ? 'store ok'
          : 'store UNREADABLE (not signed in?)'
        : 'store unchecked';
      console.log(`build-env guard: ${name} (${shape}) — ok (${store})`);
    } else {
      console.log(`build-env guard: ${name} (${shape}) — ${result.problems.length} problem(s)`);
    }
    if (live && !result.storeConsulted) {
      console.log(
        `  note: the EAS ${name} environment could not be read, so its contents are NOT verified.`,
      );
    }
  }

  const contractProblems = auditContract({ sourceNames: publicNames, declaredNames });
  findings.push(...contractProblems);

  for (const finding of findings) {
    console.log(`::error::${finding.rule} [${finding.profile}] ${finding.message}`);
  }

  if (findings.length > 0) {
    console.log('');
    console.log(`build-env guard: ${findings.length} finding(s).`);
    console.log('A release build with no EXPO_PUBLIC_FIREBASE_* does not fail — it silently falls back');
    console.log('to the legacy password flow, which is why this is checked before the build.');
    return 1;
  }

  console.log(
    `build-env guard: no findings${live ? '' : ' (repository rules only — run with --live before a release build)'}`,
  );
  return 0;
}

process.exitCode = main();
