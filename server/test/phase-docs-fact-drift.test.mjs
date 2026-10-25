/**
 * Documentation fact drift — a number stated in prose is compared with the tree that can measure it.
 *
 * WHY THIS EXISTS — it is written from three defects found in one review, all in documents that
 * every other guard in this repository passes.
 *
 * 1. **A module count that was 43 files out of date.** `CLAUDE.md` stated that `server/src` holds
 *    **117** `.ts` modules. It was measured at **160** on 2026-10-25. The figure was true when it was
 *    written (2026-10-10) and nothing re-read it while the AUTH-04/05/06 modules, the invitation
 *    surface and the public legal pages landed — the same shape as the §2.6 route count the Phase 23
 *    guard was written for, in a different sentence.
 * 2. **A build plan that named the wrong artifact.** Guide 8 said the next store build would be
 *    `versionCode ≥ 4`. A quota-refused attempt had already advanced the remote counter to 5, so the
 *    next real build is 6 — and the tree had moved to `1.0.1` while the guide still implied `1.0.0`.
 *    Anyone following that table would have planned the wrong upload.
 * 3. **A status line that was never true any more.** The roadmap still described itself as
 *    "Initial Development Roadmap" while holding 167 dated records of a shipped V1.
 *
 * All three are one failure: **a fact that the tree can measure was written into prose by hand, once,
 * and then left.** This file pins the three that are mechanical.
 *
 * WHAT IT MEASURES.
 *
 *  * `CLAUDE.md`'s stated `server/src` `.ts` module count equals the files on disk.
 *  * `CLAUDE.md`'s stated mobile version equals `mobile/app.json`'s `expo.version`.
 *  * The stated **runtime** version equals the app version **while** `runtimeVersion` is
 *    `{ policy: "appVersion" }` — the rule that decides whether an OTA update is delivered at all. A
 *    document that says the two differ, under that policy, describes a build that cannot work.
 *  * The record count stated in the roadmap's header equals the number of `27…` records declared in
 *    it, and the index in `CLAUDE.md` lists exactly those anchors — no missing one, no invented one.
 *
 * WHAT IT IS NOT, so its green is not read as more than it is:
 *
 *  * **It cannot see a plan, an intent or a judgement.** Defect 2 above was only half mechanical: the
 *    `versionCode` figure comes from EAS's remote counter, which no repository file holds. The
 *    *version* half is guarded; the *counter* half is still a human reading `eas build:version:get`
 *    before writing it down, and no test here pretends otherwise.
 *  * **It does not check that a sentence is true**, only that the number in it matches the tree. A
 *    document can be wrong with every figure correct.
 *  * **It fails on a reworded sentence rather than guessing.** Each parser returns `null` when it can
 *    no longer read its figure, and the assertion below reports the sentence it wanted — the same
 *    contract as the §2.6 route-inventory guard, for the same reason: a loose pattern that matched a
 *    reworded sentence and compared the wrong number would be worse than a loud refusal.
 *  * **It reads two files for facts and one for counts**; the roadmap's own body prose is not parsed.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const CLAUDE_PATH = path.join(repoRoot, 'CLAUDE.md');
const ROADMAP_PATH = path.join(repoRoot, 'docs', 'DEVELOPMENT_ROADMAP.md');
const APP_JSON_PATH = path.join(repoRoot, 'mobile', 'app.json');
const SRC_DIR = path.join(repoRoot, 'server', 'src');

/** Whitespace-normalised text, so a sentence wrapped across lines still matches. */
function flat(raw) {
  return String(raw).replace(/\s+/g, ' ');
}

/** `server/src` is **N** `.ts` modules — the count CLAUDE.md claims. Or null. */
function statedModuleCount(raw) {
  const m = flat(raw).match(/`server\/src` is \*\*(\d+)\*\* `\.ts` modules/);
  return m ? Number(m[1]) : null;
}

/** Mobile version and runtime version, as the Project section states them. Or null. */
function statedMobileVersions(raw) {
  const m = flat(raw).match(/Mobile version `([0-9][0-9.]*)`, runtime `([0-9][0-9.]*)`/);
  return m ? { version: m[1], runtime: m[2] } : null;
}

/** Every `.ts` file under `server/src`, counted rather than taken from a comment. */
function measuredTsModules(dir = SRC_DIR) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += measuredTsModules(full);
    else if (entry.name.endsWith('.ts')) count += 1;
  }
  return count;
}

/** The plan records the roadmap declares, in order. */
function declaredRecords(raw) {
  return [...String(raw).matchAll(/^#{1,3}\s+(27[A-Z]{1,3})\.\s+\S/gm)].map((m) => m[1]);
}

/** The anchors CLAUDE.md's index lists. */
function indexedRecords(raw) {
  return [...String(raw).matchAll(/\*\*§(27[A-Z]{1,3})\*\*/g)].map((m) => m[1]);
}

/** The record count the roadmap's own header states, or null. */
function statedRecordCount(raw) {
  const m = flat(raw).match(/all \*\*(\d+)\*\* records/);
  return m ? Number(m[1]) : null;
}

const claude = readFileSync(CLAUDE_PATH, 'utf8');
const roadmap = readFileSync(ROADMAP_PATH, 'utf8');
const appJson = JSON.parse(readFileSync(APP_JSON_PATH, 'utf8'));

const STATED_MODULES = statedModuleCount(claude);
const STATED_VERSIONS = statedMobileVersions(claude);
const MEASURED_MODULES = measuredTsModules();
const DECLARED = declaredRecords(roadmap);
const INDEXED = indexedRecords(claude);
const STATED_RECORDS = statedRecordCount(roadmap);

describe('documentation fact drift', () => {
  test('every figure this guard reads is actually present', () => {
    // A guard whose parsers all returned null would otherwise be silent forever.
    assert.notEqual(STATED_MODULES, null, 'CLAUDE.md no longer states the `server/src` `.ts` module count');
    assert.notEqual(STATED_VERSIONS, null, 'CLAUDE.md no longer states the mobile version and runtime');
    assert.notEqual(STATED_RECORDS, null, 'the roadmap header no longer states the record count');
    assert.ok(DECLARED.length > 70, `expected >70 declared records, found ${DECLARED.length}`);
    assert.ok(MEASURED_MODULES > 100, `the module walk found only ${MEASURED_MODULES} files — it is not reading server/src`);
  });

  test('★ the stated module count is the count on disk', () => {
    assert.equal(
      STATED_MODULES,
      MEASURED_MODULES,
      `CLAUDE.md states ${STATED_MODULES} \`.ts\` modules; server/src holds ${MEASURED_MODULES}. ` +
        'A module was added or removed — update the sentence (and its re-counted date) rather than this assertion.'
    );
  });

  test('★ the stated mobile version is the one the app declares', () => {
    assert.equal(
      STATED_VERSIONS.version,
      appJson.expo.version,
      `CLAUDE.md states mobile version ${STATED_VERSIONS.version}; mobile/app.json declares ${appJson.expo.version}.`
    );
  });

  test('★ under the appVersion runtime policy, the stated runtime IS the app version', () => {
    // This is not tidiness: `runtimeVersion` decides whether an installed binary accepts a published
    // bundle. Under `appVersion` the two labels are the same string by construction, so a document
    // (or a config) that separates them describes an update that no installed build would take.
    const policy = appJson.expo.runtimeVersion?.policy;
    assert.equal(policy, 'appVersion', `unexpected runtimeVersion policy: ${JSON.stringify(appJson.expo.runtimeVersion)}`);
    assert.equal(
      STATED_VERSIONS.runtime,
      STATED_VERSIONS.version,
      `CLAUDE.md states runtime ${STATED_VERSIONS.runtime} against version ${STATED_VERSIONS.version}; ` +
        'under `{ policy: "appVersion" }` they are the same label.'
    );
    assert.equal(STATED_VERSIONS.runtime, appJson.expo.version);
  });

  test('★ the record count stated in the roadmap is the number of records declared', () => {
    assert.equal(
      STATED_RECORDS,
      DECLARED.length,
      `the roadmap header states ${STATED_RECORDS} records; it declares ${DECLARED.length}. ` +
        'Adding a record means updating that sentence.'
    );
  });

  test('★ CLAUDE.md indexes exactly the records the roadmap declares', () => {
    const declared = [...new Set(DECLARED)];
    const indexed = [...new Set(INDEXED)];
    assert.deepEqual(
      declared.filter((id) => !indexed.includes(id)),
      [],
      'these records are declared but absent from the CLAUDE.md index'
    );
    assert.deepEqual(
      indexed.filter((id) => !declared.includes(id)),
      [],
      'the CLAUDE.md index names anchors the roadmap does not declare'
    );
  });

  test('the parsers can fail — in-test controls in both directions', () => {
    // Each parser is shown reporting a planted wrong value and then agreeing with a right one, so a
    // function that returned a constant could not pass the assertions above.
    assert.equal(statedModuleCount('`server/src` is **117** `.ts` modules'), 117);
    assert.notEqual(statedModuleCount('`server/src` is **117** `.ts` modules'), MEASURED_MODULES);

    assert.deepEqual(statedMobileVersions('Mobile version `1.0.0`, runtime `1.0.0`'), { version: '1.0.0', runtime: '1.0.0' });
    assert.notEqual(statedMobileVersions('Mobile version `1.0.0`, runtime `1.0.0`').version, appJson.expo.version);

    assert.equal(statedRecordCount('lists all **81** records by the title'), 81);
    assert.notEqual(statedRecordCount('lists all **81** records by the title'), DECLARED.length);

    // And the reworded sentence is refused rather than matched loosely.
    assert.equal(statedModuleCount('`server/src` contains some TypeScript modules'), null);
    assert.equal(statedMobileVersions('mobile is at its released version'), null);
    assert.equal(statedRecordCount('a long list of records follows'), null);

    // The count extraction is controlled too, on a planted document. The identifier is assembled
    // from parts rather than written out: this file is inside the corpus the section-integrity guard
    // scans, and a literal citation to a record that does not exist would recreate the very defect
    // that guard was written for (it quotes a bad anchor without its sigil for the same reason).
    const PLANTED = '27' + 'ZZ';
    const OTHER = '27' + 'ZY';
    assert.deepEqual(declaredRecords(`# ${PLANTED}. A planted record\n\n# ${OTHER}. Another (2026-01-01)`), [PLANTED, OTHER]);
    assert.deepEqual(indexedRecords(`- **§${PLANTED}** — A planted record`), [PLANTED]);
  });
});
