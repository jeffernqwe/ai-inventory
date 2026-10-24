#!/usr/bin/env node
/* global Buffer */
// `Buffer` is a Node global with no TypeScript/RN global declaration in this project's ESLint
// config; the same reason `process` needs none is that Expo's config declares it. Declared here
// rather than switching the whole `scripts/` directory to the Node environment, which would drop
// the React Native globals the other scripts in this directory are linted against.
/**
 * Release-bundle parity guard — does this AAB actually contain the app we think we built?
 *
 * WHY THIS EXISTS. On 2026-10-24 the production AAB (versionCode 2) was built, inspected and
 * recorded as the store artifact. It was NOT uploaded, and a later check of its embedded
 * JavaScript found **no `Delete account` screen at all** (the strings were absent, while
 * neighbouring screens' strings were present) and none of the Google session surface added the
 * same day. The AAB was a valid, signed, correctly-configured artifact of an **older commit** —
 * every check that examined packaging, signing, permissions and the API URL passed, because none
 * of them asked whether the JavaScript was the JavaScript under review. Play's account-deletion
 * requirement would have been answered "yes" by a build in which the feature does not exist.
 *
 * WHAT IT CHECKS. The probes below are **user-visible sentences from features that must be in any
 * store build**, chosen because they are literal UI copy (not log text, not a code identifier) and
 * because a missing one is a release-level fact:
 *
 *   - `Delete my account`          — Play's account-deletion requirement.
 *   - `Continue with Google`       — the Google sign-in entry point.
 *   - `Create your workspace`      — the Firebase registration onboarding a new identity needs.
 *   - `Type DELETE to confirm`     — the accidental-deletion safeguard, not just the screen.
 *
 * It reads the AAB's own `assets/index.android.bundle` (a ZIP inside the ZIP, Hermes bytecode) and
 * counts UTF-8 occurrences. Hermes keeps string literals verbatim, which is what makes this a cheap
 * and reliable question; it is deliberately NOT a source-map or commit check, which would need
 * metadata the artifact does not carry.
 *
 * EXIT CODES follow the repository convention (see `server/scripts/check-ai-model.mjs`):
 *
 *   0  VERIFIED — every required probe was found in the bundle
 *   1  WRONG — at least one probe is missing; the list names them
 *   2  NOT VERIFIED — the file, the ZIP, or the bundle inside it could not be read
 *
 * USAGE
 *
 *   node scripts/check-aab.mjs builds/inventory-ai.aab
 *   node scripts/check-aab.mjs --self-test
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** Every store build must contain this copy. Each entry says what its absence would mean. */
const REQUIRED = [
  { probe: 'Delete my account', why: "Play's account-deletion requirement" },
  { probe: 'Continue with Google', why: 'the Google sign-in entry point' },
  { probe: 'Create your workspace', why: 'Firebase registration onboarding' },
  { probe: 'Type DELETE to confirm', why: 'the accidental-deletion safeguard' },
];

/** The bundle path inside a managed-workflow AAB, matched as a suffix so a split/other module still counts. */
const BUNDLE_SUFFIX = 'assets/index.android.bundle';

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

/** The feature sentences a given bundle is missing. */
export function missingProbes(bundle) {
  return REQUIRED.filter(({ probe }) => !bundle.includes(Buffer.from(probe, 'utf8'))).map(
    ({ probe }) => probe,
  );
}

function inspect(path) {
  if (!existsSync(path)) {
    console.error(`NOT VERIFIED: ${path} does not exist`);
    return 2;
  }
  const bytes = readFileSync(path);
  const sha = createHash('sha256').update(bytes).digest('hex');
  console.log(`aab: ${path}`);
  console.log(`bytes: ${bytes.length}`);
  console.log(`sha256: ${sha}`);

  let bundle;
  try {
    bundle = readZipEntry(bytes, BUNDLE_SUFFIX);
  } catch (error) {
    console.error(`NOT VERIFIED: ${error.message}`);
    return 2;
  }
  if (!bundle) {
    console.error(`NOT VERIFIED: no entry ending in ${BUNDLE_SUFFIX} inside the AAB`);
    return 2;
  }
  console.log(`bundle bytes: ${bundle.length}`);

  const missing = missingProbes(bundle);
  for (const { probe, why } of REQUIRED) {
    console.log(`  ${missing.includes(probe) ? 'MISSING' : 'present'}  ${probe}  (${why})`);
  }
  if (missing.length) {
    console.error(`\nWRONG: ${missing.length} required sentence(s) absent — this AAB predates them.`);
    return 1;
  }
  console.log('\nVERIFIED: every required sentence is in this bundle.');
  return 0;
}

/** Builds a stored-only ZIP in memory, so the self-test needs no fixture file on disk. */
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
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x0201_4b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0x21, 12);
    central.writeUInt32LE(0, 14);
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
  const complete = REQUIRED.map(({ probe }) => probe).join('\n');

  // 1. A bundle carrying every required sentence is VERIFIED.
  const good = buildZip([
    { name: 'base/manifest/AndroidManifest.xml', data: 'irrelevant' },
    { name: bundlePath, data: complete },
  ]);
  expect(missingProbes(readZipEntry(good, bundlePath)).length === 0, 'complete bundle passes');

  // 2. Dropping the deletion copy is detected, and named — the 2026-10-24 failure.
  const stale = buildZip([
    { name: bundlePath, data: "Continue with Google\nCreate your workspace\nType DELETE to confirm" },
  ]);
  const staleMissing = missingProbes(readZipEntry(stale, bundlePath));
  expect(staleMissing.includes('Delete my account'), 'a missing deletion screen is reported');
  expect(staleMissing.length === 1, 'only the missing sentence is reported');

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

  console.log(`release-bundle guard self-test: ${controls} control(s) passed`);
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

const [, , argument] = process.argv;
if (argument === '--self-test') {
  process.exit(selfTest());
} else if (!argument) {
  console.error('usage: node scripts/check-aab.mjs <path/to.aab> | --self-test');
  process.exit(2);
} else {
  process.exit(inspect(argument));
}
