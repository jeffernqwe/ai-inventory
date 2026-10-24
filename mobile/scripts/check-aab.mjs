#!/usr/bin/env node
/* global Buffer */
// `Buffer` is a Node global with no TypeScript/RN global declaration in this project's ESLint
// config; the same reason `process` needs none is that Expo's config declares it. Declared here
// rather than switching the whole `scripts/` directory to the Node environment, which would drop
// the React Native globals the other scripts in this directory are linted against.
/**
 * Store-artifact gate — may this AAB be uploaded to Play?
 *
 * WHY THIS EXISTS. On 2026-10-24 the production AAB (`versionCode 2`) was built, inspected against
 * its manifest and recorded as the store artifact. The `versionCode 3` build after it was about to be
 * uploaded. Both were **valid, signed, correctly-configured artifacts of an older commit**: neither
 * contained the in-app account-deletion screen Play requires, so the console form would have answered
 * "yes" with a build in which the feature does not exist. Every check that existed at the time asked
 * about packaging — package id, version, SDK levels, signature, channel, permissions — and packaging
 * was correct on both. None asked what was inside the JavaScript, or whether the packaging matched
 * this project's own contract.
 *
 * So the gate has two layers, and BOTH must pass:
 *
 *   1. **Packaging** — the facts a Play review and an install depend on, compared against the values
 *      this repository declares (package, `versionName` against the embedded config, SDK levels, the
 *      permission the trim removed, `production` channel, update URL, runtime version, release API
 *      host, no development surface, a signature present).
 *   2. **Bundle parity** — the user-visible copy of features that must be in any store build:
 *
 *        `Delete my account`      Play's account-deletion requirement
 *        `Type DELETE to confirm` the accidental-deletion safeguard, not just the screen
 *        `Continue with Google`   the provider sign-in entry point
 *        `Create your workspace`  the onboarding a new Firebase identity needs
 *
 * The four probes are read out of `assets/index.android.bundle` (a ZIP inside the ZIP, Hermes
 * bytecode). Hermes keeps string literals verbatim, which is what makes the question cheap and
 * reliable; this is deliberately NOT a source-map or commit check, which would need metadata an
 * artifact does not carry.
 *
 * EXIT CODES follow the repository convention (see `server/scripts/check-ai-model.mjs`):
 *
 *   0  VERIFIED — packaging matches the contract and every required sentence is in the bundle
 *   1  WRONG — at least one expectation failed; each failure is printed with its reason
 *   2  NOT VERIFIED — the file, the ZIP, or the bundle/config inside it could not be read
 *
 * USAGE
 *
 *   npm run check:aab -- builds/inventory-ai.aab     # an AAB
 *   npm run check:aab -- --bundle index.android.bundle   # a bare Metro/Hermes bundle (CI)
 *   npm run check:aab -- --self-test
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/**
 * The values this repository declares. A gate is only useful if it has something to compare against;
 * these are not preferences but the identities in `app.json`/`eas.json`, stated once here so a
 * changed identity forces a decision instead of slipping through.
 */
const CONTRACT = {
  package: 'com.inventoryai.app',
  minSdk: 24,
  /** Android 16 is required for new apps and updates from 31 August 2026. */
  targetSdkAtLeast: 36,
  channel: 'production',
  projectId: '607eca05-1175-43ed-86a0-1829e91c9531',
  apiHost: 'ai-inventory-l1mi.onrender.com',
  /** Unused by the app; inherited from Expo's template and blocked in `app.json`. */
  forbiddenPermission: 'android.permission.SYSTEM_ALERT_WINDOW',
  requiredPermissions: ['android.permission.CAMERA', 'android.permission.INTERNET'],
  /** Named in an archive entry means a development client or a web build slipped in. */
  forbiddenEntries: ['expo-dev-menu', 'expo-dev-launcher', 'react-native-web'],
};

/** Every store build must contain this copy. Each entry says what its absence would mean. */
const REQUIRED = [
  { probe: 'Delete my account', why: "Play's account-deletion requirement" },
  { probe: 'Type DELETE to confirm', why: 'the accidental-deletion safeguard' },
  { probe: 'Continue with Google', why: 'the Google sign-in entry point' },
  { probe: 'Create your workspace', why: 'Firebase registration onboarding' },
];

/** The bundle path inside a managed-workflow AAB, matched as a suffix. */
const BUNDLE_SUFFIX = 'assets/index.android.bundle';

/* ------------------------------------------------------------------------------------------------
 * ZIP
 * --------------------------------------------------------------------------------------------- */

/**
 * Reads one entry out of a ZIP archive held in memory.
 *
 * A deliberately small reader: the repository has no ZIP dependency, and adding one for a release
 * check would mean the check itself becomes a dependency to keep updated. It walks the central
 * directory (not local headers) because that is where the sizes and the compression method for an
 * entry actually live, then decompresses with `zlib` when the entry is deflated.
 */
export function readZipEntry(buffer, name) {
  // End of central directory: signature 0x06054b50, searched backwards because it is last.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 66_000; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x0605_4b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end-of-central-directory record)');

  const entries = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  let cursor = cdOffset;
  for (let i = 0; i < entries; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x0201_4b50) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const entryName = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (!entryName.endsWith(name)) continue;

    // The local header repeats the name and extra fields with possibly different lengths.
    if (buffer.readUInt32LE(localOffset) !== 0x0403_4b50) {
      throw new Error(`corrupt local header for ${name}`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return raw;
    if (method === 8) return inflateRawSync(raw);
    throw new Error(`unsupported compression method ${method} for ${name}`);
  }
  return null;
}

/** Every entry name in a ZIP archive held in memory. */
export function listZipEntries(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 66_000; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x0605_4b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end-of-central-directory record)');

  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x0201_4b50) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    names.push(buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/* ------------------------------------------------------------------------------------------------
 * AndroidManifest (protobuf, read the way `aapt2` writes it)
 * --------------------------------------------------------------------------------------------- */

/**
 * An attribute in the binary manifest is a name immediately followed by `0x1a`, a one-byte length
 * and the value — so the value can be read next to its own name instead of guessing from context.
 */
export function manifestAttribute(manifest, name) {
  const needle = Buffer.concat([Buffer.from(name, 'utf8'), Buffer.from([0x1a])]);
  const at = manifest.indexOf(needle);
  if (at < 0) return null;
  const start = at + needle.length + 1;
  const length = manifest[at + needle.length];
  return manifest.subarray(start, start + length).toString('utf8');
}

/**
 * The permissions the app **requests**.
 *
 * Each `uses-permission` element is one protobuf block, so the `name` inside a block is that
 * element's own attribute. A `name` found anywhere else in the manifest is not a request:
 * `android:permission` on a service is a requirement on whoever calls it, and the app's own
 * `permission` element defines one rather than asking for it. Reading declarations this way is what
 * the artifact record needed a correction for on 2026-10-24.
 */
export function declaredPermissions(manifest) {
  const marker = Buffer.concat([Buffer.from([0x1a, 0x0f]), Buffer.from('uses-permission')]);
  const blocks = manifest.toString('latin1').split(marker.toString('latin1')).slice(1);
  const permissions = [];
  for (const block of blocks) {
    const bytes = Buffer.from(block, 'latin1');
    const name = manifestAttribute(bytes.subarray(0, 400), 'name');
    if (name) permissions.push(name);
  }
  return permissions;
}

/* ------------------------------------------------------------------------------------------------
 * Checks
 * --------------------------------------------------------------------------------------------- */

/** The feature sentences a given bundle is missing. */
export function missingProbes(bundle) {
  return REQUIRED.filter(({ probe }) => !bundle.includes(Buffer.from(probe, 'utf8'))).map(
    ({ probe }) => probe,
  );
}

/**
 * Compares one AAB against `CONTRACT`. Returns the failures (each `{ what, detail }`) and the facts
 * it read, so the caller can print both a verdict and the evidence for it.
 */
export function checkPackaging(archive) {
  const facts = {};
  const problems = [];
  const fail = (what, detail) => problems.push({ what, detail });
  const names = listZipEntries(archive.buffer);

  facts.entries = names.length;
  facts.abis = [...new Set(names.filter((n) => n.startsWith('base/lib/')).map((n) => n.split('/')[2]))].sort();
  facts.signature = names.filter((n) => /^META-INF\/[^/]+\.(SF|RSA|DSA|EC)$/i.test(n));
  if (!facts.signature.length) fail('signing', 'no JAR signature entries under META-INF/');

  for (const forbidden of CONTRACT.forbiddenEntries) {
    const hits = names.filter((name) => name.includes(forbidden)).length;
    if (hits) fail('release surface', `${hits} archive entr${hits === 1 ? 'y' : 'ies'} mention ${forbidden}`);
  }

  if (!names.includes('base/manifest/AndroidManifest.xml')) {
    fail('manifest', 'base/manifest/AndroidManifest.xml is absent');
    return { facts, problems };
  }
  const manifest = readZipEntry(archive.buffer, 'base/manifest/AndroidManifest.xml');

  facts.package = manifestAttribute(manifest, 'package');
  if (facts.package !== CONTRACT.package) {
    fail('package', `expected ${CONTRACT.package}, found ${facts.package ?? 'nothing'}`);
  }

  facts.versionName = manifestAttribute(manifest, 'versionName');
  facts.versionCode = Number(manifestAttribute(manifest, 'versionCode'));
  if (!Number.isInteger(facts.versionCode) || facts.versionCode < 1) {
    fail('versionCode', `not a positive integer: ${manifestAttribute(manifest, 'versionCode')}`);
  }

  facts.minSdk = Number(manifestAttribute(manifest, 'minSdkVersion'));
  if (facts.minSdk !== CONTRACT.minSdk) {
    fail('minSdk', `expected ${CONTRACT.minSdk}, found ${facts.minSdk}`);
  }
  facts.targetSdk = Number(manifestAttribute(manifest, 'targetSdkVersion'));
  if (!(facts.targetSdk >= CONTRACT.targetSdkAtLeast)) {
    fail('targetSdk', `expected at least ${CONTRACT.targetSdkAtLeast}, found ${facts.targetSdk}`);
  }

  facts.permissions = declaredPermissions(manifest);
  if (facts.permissions.includes(CONTRACT.forbiddenPermission)) {
    fail('permission', `${CONTRACT.forbiddenPermission} is declared; the app never displays an overlay`);
  }
  for (const required of CONTRACT.requiredPermissions) {
    if (!facts.permissions.includes(required)) fail('permission', `${required} is not declared`);
  }

  facts.updateUrl = /https:\/\/u\.expo\.dev\/[0-9a-f-]+/.exec(manifest.toString('latin1'))?.[0] ?? null;
  if (!facts.updateUrl || !facts.updateUrl.endsWith(CONTRACT.projectId)) {
    fail('update URL', `expected the project's u.expo.dev URL, found ${facts.updateUrl ?? 'nothing'}`);
  }
  facts.channel = /\{"expo-channel-name":"([a-z-]+)"\}/.exec(manifest.toString('latin1'))?.[1] ?? null;
  if (facts.channel !== CONTRACT.channel) {
    fail('channel', `expected ${CONTRACT.channel}, found ${facts.channel ?? 'nothing'}`);
  }

  // The runtime version label is a @string resource, so its value lives in resources.pb.
  const resources = readZipEntry(archive.buffer, 'base/resources.pb');
  const marker = resources?.indexOf(Buffer.from('expo_runtime_version', 'utf8')) ?? -1;
  facts.runtimeVersion =
    marker >= 0
      ? (/[0-9]+\.[0-9]+\.[0-9]+/.exec(resources.subarray(marker, marker + 400).toString('latin1'))?.[0] ?? null)
      : null;
  if (!facts.runtimeVersion) fail('runtime version', 'expo_runtime_version is not in resources.pb');

  const configBytes = readZipEntry(archive.buffer, 'base/assets/app.config');
  if (!configBytes) {
    fail('app config', 'base/assets/app.config is absent');
    return { facts, problems };
  }
  let config;
  try {
    config = JSON.parse(configBytes.toString('utf8'));
  } catch (error) {
    fail('app config', `not JSON: ${error.message}`);
    return { facts, problems };
  }
  facts.configVersion = config.version;
  facts.configScheme = config.scheme;
  facts.configRuntimePolicy = config.runtimeVersion?.policy ?? config.runtimeVersion ?? null;
  facts.configCheckAutomatically = config.updates?.checkAutomatically ?? null;

  if (facts.versionName !== facts.configVersion) {
    fail(
      'version',
      `manifest versionName ${facts.versionName} disagrees with the embedded config ${facts.configVersion}`,
    );
  }
  if (facts.runtimeVersion && facts.configVersion && facts.runtimeVersion !== facts.configVersion) {
    fail(
      'runtime version',
      `${facts.runtimeVersion} disagrees with the embedded config ${facts.configVersion}`,
    );
  }
  if (config.android?.package !== CONTRACT.package) {
    fail('app config', `android.package is ${config.android?.package ?? 'absent'}`);
  }

  const bundle = readZipEntry(archive.buffer, BUNDLE_SUFFIX);
  if (!bundle) {
    fail('bundle', `no entry ending in ${BUNDLE_SUFFIX}`);
    return { facts, problems };
  }
  const text = bundle.toString('latin1');
  facts.bundleBytes = bundle.length;
  facts.apiHostHits = text.split(CONTRACT.apiHost).length - 1;
  facts.localhostHits = text.split('localhost:4000').length - 1;
  if (facts.apiHostHits < 1) fail('API host', `${CONTRACT.apiHost} does not appear in the bundle`);
  if (facts.localhostHits > 0) {
    fail('API host', `localhost:4000 appears ${facts.localhostHits} time(s) in the bundle`);
  }

  return { facts, problems };
}

/* ------------------------------------------------------------------------------------------------
 * Report
 * --------------------------------------------------------------------------------------------- */

/** Prints the facts, then the verdict. Returns the exit code. */
function inspectArchive(path) {
  if (!existsSync(path)) {
    console.error(`NOT VERIFIED: ${path} does not exist`);
    return 2;
  }
  const bytes = readFileSync(path);
  console.log(`aab: ${path}`);
  console.log(`bytes: ${bytes.length}`);
  console.log(`sha256: ${createHash('sha256').update(bytes).digest('hex')}`);

  let result;
  let bundle;
  try {
    const archive = { buffer: bytes };
    result = checkPackaging(archive);
    bundle = readZipEntry(bytes, BUNDLE_SUFFIX);
  } catch (error) {
    console.error(`NOT VERIFIED: ${error.message}`);
    return 2;
  }
  if (!bundle) {
    console.error(`NOT VERIFIED: no entry ending in ${BUNDLE_SUFFIX} inside the AAB`);
    return 2;
  }

  const { facts, problems } = result;
  console.log(
    `package ${facts.package} · versionCode ${facts.versionCode} · ${facts.versionName} · ` +
      `minSdk ${facts.minSdk} · targetSdk ${facts.targetSdk}`,
  );
  console.log(
    `channel ${facts.channel} · runtime ${facts.runtimeVersion} · permissions ${facts.permissions?.length}` +
      ` · ABIs ${facts.abis?.join(', ')} · signature ${facts.signature?.length ? 'present' : 'absent'}`,
  );
  console.log(
    `bundle ${facts.bundleBytes} bytes · ${CONTRACT.apiHost} ×${facts.apiHostHits} · localhost:4000 ×${facts.localhostHits}`,
  );

  const missing = missingProbes(bundle);
  for (const { probe, why } of REQUIRED) {
    console.log(`  ${missing.includes(probe) ? 'MISSING' : 'present'}  ${probe}  (${why})`);
  }

  if (problems.length || missing.length) {
    for (const { what, detail } of problems) console.error(`\nWRONG (${what}): ${detail}`);
    if (missing.length) {
      console.error(`\nWRONG (bundle): ${missing.length} required sentence(s) absent — this AAB predates them.`);
    }
    return 1;
  }
  console.log('\nVERIFIED: packaging matches the contract and every required sentence is in the bundle.');
  return 0;
}

/** Checks a bare Metro/Hermes bundle — the half of the gate that needs no AAB (CI). */
function inspectBundle(path) {
  if (!existsSync(path)) {
    console.error(`NOT VERIFIED: ${path} does not exist`);
    return 2;
  }
  const bytes = readFileSync(path);
  console.log(`bundle: ${path}`);
  console.log(`bytes: ${bytes.length}`);
  const missing = missingProbes(bytes);
  for (const { probe, why } of REQUIRED) {
    console.log(`  ${missing.includes(probe) ? 'MISSING' : 'present'}  ${probe}  (${why})`);
  }
  if (missing.length) {
    console.error(`\nWRONG (bundle): ${missing.length} required sentence(s) absent — this bundle predates them.`);
    return 1;
  }
  console.log('\nVERIFIED: every required sentence is in this bundle.');
  return 0;
}

/* ------------------------------------------------------------------------------------------------
 * Controls
 * --------------------------------------------------------------------------------------------- */

/** Builds a stored-only ZIP in memory, so the controls need no fixture file on disk. */
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const body = Buffer.from(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x0403_4b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x0201_4b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** One manifest attribute in the binary form `aapt2` writes: name, 0x1a, length, value. */
function attributeBytes(name, value) {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([Buffer.from(name, 'utf8'), Buffer.from([0x1a, bytes.length]), bytes]);
}

/** A synthetic manifest carrying exactly the attributes the gate reads. */
function buildManifest({ packageName = CONTRACT.package, permissions = [] } = {}) {
  const parts = [
    attributeBytes('package', packageName),
    attributeBytes('versionName', '1.0.0'),
    attributeBytes('versionCode', '9'),
    attributeBytes('minSdkVersion', '24'),
    attributeBytes('targetSdkVersion', '36'),
    Buffer.from(`https://u.expo.dev/${CONTRACT.projectId}`, 'utf8'),
    Buffer.from('{"expo-channel-name":"production"}', 'utf8'),
  ];
  for (const permission of permissions) {
    parts.push(
      Buffer.concat([
        Buffer.from([0x1a, 0x0f]),
        Buffer.from('uses-permission', 'utf8'),
        Buffer.from([0x12, 0x04]),
        Buffer.from('name', 'utf8'),
        Buffer.from([0x1a, Buffer.byteLength(permission)]),
        Buffer.from(permission, 'utf8'),
      ]),
    );
  }
  return Buffer.concat(parts);
}

function selfTest() {
  let controls = 0;
  const expect = (condition, what) => {
    if (!condition) throw new Error(`self-test failed: ${what}`);
    controls += 1;
  };

  // 0. Every probe is still copy that exists in this app. Without this, a typo or a reworded
  //    sentence would make the REAL check fail on a perfectly good artifact — or, worse, pass on a
  //    stale one that happens to contain the old wording. Editing the copy therefore forces a
  //    decision about this list instead of silently disarming it.
  const source = ['app', 'components']
    .flatMap((dir) => listFiles(new URL(`../${dir}/`, import.meta.url), '.tsx'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  for (const { probe } of REQUIRED) {
    if (!source.includes(probe)) {
      throw new Error(`self-test failed: "${probe}" is no longer copy in mobile/app or mobile/components`);
    }
    controls += 1;
  }

  const bundlePath = 'base/assets/index.android.bundle';
  const completeBundle = REQUIRED.map(({ probe }) => probe).join('\n');

  // 1. A bundle carrying every required sentence passes.
  const good = buildZip([{ name: bundlePath, data: completeBundle }]);
  expect(missingProbes(readZipEntry(good, bundlePath)).length === 0, 'complete bundle passes');

  // 2. Dropping the deletion copy is detected, and named — the 2026-10-24 failure.
  const stale = buildZip([{ name: bundlePath, data: 'Continue with Google\nCreate your workspace' }]);
  const staleMissing = missingProbes(readZipEntry(stale, bundlePath));
  expect(staleMissing.includes('Delete my account'), 'a missing deletion screen is reported');
  expect(staleMissing.length === 2, 'only the missing sentences are reported');

  // 3. A bundle that is absent is null rather than an exception, so the caller can say NOT VERIFIED.
  const noBundle = buildZip([{ name: 'base/manifest/AndroidManifest.xml', data: 'x' }]);
  expect(readZipEntry(noBundle, bundlePath) === null, 'a missing bundle entry returns null');

  // 4. A non-ZIP input is refused instead of silently reporting "nothing missing".
  let refused = false;
  try {
    readZipEntry(Buffer.from('definitely not a zip archive at all'), bundlePath);
  } catch {
    refused = true;
  }
  expect(refused, 'a non-ZIP file is refused');

  // 5. The packaging layer passes a manifest that matches the contract.
  const resourcesWithRuntime = Buffer.from('expo_runtime_version ... 1.0.0', 'utf8');
  const config = JSON.stringify({
    version: '1.0.0',
    runtimeVersion: { policy: 'appVersion' },
    android: { package: CONTRACT.package },
    updates: { checkAutomatically: 'ON_LOAD' },
  });
  const buildArchive = (manifest, bundle = completeBundle) =>
    buildZip([
      { name: 'base/manifest/AndroidManifest.xml', data: manifest },
      { name: 'base/resources.pb', data: resourcesWithRuntime },
      { name: 'base/assets/app.config', data: config },
      { name: bundlePath, data: `${bundle}\n${CONTRACT.apiHost}` },
      { name: 'META-INF/CERT.SF', data: 'x' },
      { name: 'base/lib/arm64-v8a/libreactnative.so', data: 'x' },
    ]);

  const compliant = checkPackaging({
    buffer: buildArchive(buildManifest({ permissions: CONTRACT.requiredPermissions })),
  });
  expect(compliant.problems.length === 0, `a compliant manifest passes (${JSON.stringify(compliant.problems)})`);
  expect(compliant.facts.versionCode === 9, 'versionCode is read from the manifest');
  expect(compliant.facts.permissions.length === 2, 'declared permissions are counted');

  // 6. The permission that was removed is refused if it ever comes back.
  const withOverlay = checkPackaging({
    buffer: buildArchive(
      buildManifest({
        permissions: [...CONTRACT.requiredPermissions, CONTRACT.forbiddenPermission],
      }),
    ),
  });
  expect(
    withOverlay.problems.some((p) => p.detail.includes(CONTRACT.forbiddenPermission)),
    'SYSTEM_ALERT_WINDOW is refused',
  );

  // 7. A wrong package id is refused, and named.
  const wrongPackage = checkPackaging({
    buffer: buildArchive(buildManifest({ packageName: 'com.example.other', permissions: CONTRACT.requiredPermissions })),
  });
  expect(
    wrongPackage.problems.some((p) => p.what === 'package' && p.detail.includes('com.example.other')),
    'a wrong package id is reported',
  );

  // 8. A development-client entry in the archive is refused.
  const withDevMenu = buildZip([
    { name: 'base/manifest/AndroidManifest.xml', data: buildManifest({ permissions: CONTRACT.requiredPermissions }) },
    { name: 'base/resources.pb', data: resourcesWithRuntime },
    { name: 'base/assets/app.config', data: config },
    { name: bundlePath, data: `${completeBundle}\n${CONTRACT.apiHost}` },
    { name: 'META-INF/CERT.SF', data: 'x' },
    { name: 'base/assets/expo-dev-menu.json', data: 'x' },
  ]);
  expect(
    checkPackaging({ buffer: withDevMenu }).problems.some((p) => p.what === 'release surface'),
    'a development-client entry is refused',
  );

  console.log(`store-artifact gate self-test: ${controls} control(s) passed`);
  return 0;
}

/** Recursively lists files with a given extension under `dir`. */
function listFiles(dir, extension) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    if (entry.isDirectory()) return listFiles(child, extension);
    return entry.name.endsWith(extension) ? [child] : [];
  });
}

const [, , argument, extra] = process.argv;
if (argument === '--self-test') {
  process.exit(selfTest());
} else if (argument === '--bundle') {
  if (!extra) {
    console.error('usage: node scripts/check-aab.mjs --bundle <path/to/index.android.bundle>');
    process.exit(2);
  }
  process.exit(inspectBundle(extra));
} else if (!argument) {
  console.error('usage: node scripts/check-aab.mjs <path/to.aab> | --bundle <file> | --self-test');
  process.exit(2);
} else {
  process.exit(inspectArchive(argument));
}
