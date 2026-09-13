// Phase TS-3 — the module-graph guards, asserted in both directions.
//
// `scripts/check-module-graph.mjs` exists because the `.js` -> `.ts` migration has two
// failure modes that no other gate can see. A suite that only asserted "the repository is
// clean" would pass just as happily against a guard that returned `[]` unconditionally, so
// every detection rule below is also driven against a scratch tree built to violate it —
// the guard must FAIL there, for its own stated reason.
//
// The scratch trees live in the OS temp directory, never in the repository, and are
// removed on the way out. Nothing here needs MongoDB, so the file runs in both
// `npm test` and `npm run test:unit`.
//
// Coverage is pinned deliberately, not left implicit: the guards must keep covering
// `server/src` AND `mobile/`, so "the guard stopped looking at a tree" fails rather than
// silently shrinking the check to nothing.

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { analyzeRelativeSpecifiers, defaultRoots, findDuplicateModules } from '../scripts/check-module-graph.mjs';

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-module-graph.mjs');

const scratchDirs = [];

/**
 * Build a scratch tree outside the repository from a `{ 'relative/path': 'contents' }`
 * map and return its root plus the conventional `src` root the guards are pointed at.
 */
function scratchTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts3-guard-'));
  scratchDirs.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
  }
  return { dir, src: path.join(dir, 'src') };
}

after(() => {
  for (const dir of scratchDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The real repository
// ---------------------------------------------------------------------------
const ROOTS = defaultRoots();
const REPO_DUPLICATES = findDuplicateModules(ROOTS);
const REPO_SPECIFIERS = analyzeRelativeSpecifiers(ROOTS);

describe('Phase TS-3 — module-graph guards over the real repository', () => {
  it('covers server/src, server/test, server/scripts and the mobile app', () => {
    for (const required of ['src', 'test', 'scripts']) {
      assert.ok(
        ROOTS.some((root) => path.basename(root) === required),
        `the guards must cover server/${required}`,
      );
    }
    // mobile is a sibling of server/, and is covered as a whole tree — a future mobile
    // migration is then guarded by the same rule with no further wiring.
    const mobileRoot = ROOTS.find((root) => path.basename(root) === 'mobile');
    assert.ok(mobileRoot, 'the guards must cover mobile/');
    const serverSrc = ROOTS.find((root) => path.basename(root) === 'src');
    assert.equal(
      path.dirname(mobileRoot),
      path.dirname(path.dirname(serverSrc)),
      'mobile/ must be the repository-level tree beside server/, not a server subdirectory',
    );
    for (const root of ROOTS) {
      assert.ok(fs.existsSync(root), `covered tree is absent, so the check would be partial: ${root}`);
    }
  });

  it('has no module stem defined twice inside one directory', () => {
    assert.deepEqual(
      REPO_DUPLICATES.duplicates,
      [],
      'a duplicate .js/.ts module pair silently makes every source-text guard read one file while the app runs the other',
    );
  });

  it('has no relative specifier pointing at an extension the module no longer has', () => {
    assert.deepEqual(REPO_SPECIFIERS.stale, [], 'a stale specifier is invisible to tsc and fails only at runtime');
    assert.deepEqual(REPO_SPECIFIERS.mismatched, [], 'a specifier naming an extension the module does not have cannot resolve');
  });

  it('has no relative specifier that resolves to nothing', () => {
    assert.deepEqual(REPO_SPECIFIERS.unresolved, []);
  });

  it('inspects the whole module graph rather than passing vacuously', () => {
    assert.ok(REPO_DUPLICATES.scannedFiles >= 150, `expected a full scan, saw ${REPO_DUPLICATES.scannedFiles} files`);
    assert.ok(REPO_SPECIFIERS.checked >= 800, `expected the whole graph, saw ${REPO_SPECIFIERS.checked} relative specifiers`);
    assert.ok(REPO_SPECIFIERS.literal >= 400, 'the server resolves its specifiers literally, extension-complete');
    assert.ok(REPO_SPECIFIERS.candidate >= 400, 'the mobile app resolves extensionless specifiers through candidate extensions');
  });

  it('reports the dynamic imports it cannot resolve instead of assuming they are correct', () => {
    // phase23 loads the mobile RBAC mirror and the mounted routers through computed
    // specifiers. Those are genuinely unresolvable statically, so they must be reported
    // — and must NOT be counted as failures, or as verified.
    assert.ok(REPO_SPECIFIERS.dynamicUnverified.length >= 1);
    for (const item of REPO_SPECIFIERS.dynamicUnverified) {
      assert.equal(item.specifier, null, 'a reported dynamic import is one with a non-literal argument');
      assert.ok(item.file.endsWith('.mjs'), 'the only computed imports today are test infrastructure');
    }
  });
});

describe('Phase TS-3 — the CLI entry point', () => {
  it('exits 0 on the clean repository', () => {
    const run = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    assert.equal(run.status, 0, `guard exited ${run.status}\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /extensions OK/);
    assert.match(run.stdout, /specifiers OK/);
  });

  it('rejects an unknown check name with exit code 2', () => {
    const run = spawnSync(process.execPath, [scriptPath, 'nonsense'], { encoding: 'utf8' });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /Unknown check/);
  });
});

// ---------------------------------------------------------------------------
// Duplicate-extension guard — detection, and its false-positive boundary
// ---------------------------------------------------------------------------
describe('Phase TS-3 — duplicate-extension detection', () => {
  it('detects a migrated module left beside its original', () => {
    const { src } = scratchTree({
      'src/config/env.js': 'export const env = 1;\n',
      'src/config/env.ts': 'export const env: number = 1;\n',
    });
    const { duplicates } = findDuplicateModules([src]);
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].stem, 'env');
    assert.deepEqual(duplicates[0].files, ['env.js', 'env.ts']);
    assert.equal(path.basename(duplicates[0].dir), 'config');
  });

  it('detects a duplicate in a nested directory', () => {
    const { src } = scratchTree({
      'src/services/ai/tools.js': 'export const t = 1;\n',
      'src/services/ai/tools.tsx': 'export const t = 1;\n',
    });
    assert.equal(findDuplicateModules([src]).duplicates.length, 1);
  });

  it('does not flag the same stem in different directories', () => {
    const { src } = scratchTree({
      'src/catalog/index.js': 'export const a = 1;\n',
      'src/inventory/index.ts': 'export const a: number = 1;\n',
      'src/models/user.ts': 'export const u = 1;\n',
      'src/services/user.js': 'export const u = 1;\n',
    });
    assert.deepEqual(findDuplicateModules([src]).duplicates, []);
  });

  it('does not treat a generated declaration file as a module', () => {
    const { src } = scratchTree({
      'src/router.d.ts': 'export declare const r: number;\n',
      'src/router.js': 'export const r = 1;\n',
      'src/env.d.ts': 'export declare const e: number;\n',
    });
    assert.deepEqual(findDuplicateModules([src]).duplicates, []);
  });

  it('does not flag unrelated filenames that merely share a prefix', () => {
    const { src } = scratchTree({
      'src/config/env.ts': 'export const e = 1;\n',
      'src/config/envs.js': 'export const e = 1;\n',
      'src/config/environment.ts': 'export const e = 1;\n',
    });
    assert.deepEqual(findDuplicateModules([src]).duplicates, []);
  });

  it('reports the scanned file count, so a clean result is distinguishable from a blind one', () => {
    const { src } = scratchTree({ 'src/a.js': 'export const a = 1;\n', 'src/nested/b.ts': 'export const b = 1;\n' });
    assert.equal(findDuplicateModules([src]).scannedFiles, 2);
  });
});

// ---------------------------------------------------------------------------
// Stale-relative-specifier guard — detection, and its false-positive boundary
// ---------------------------------------------------------------------------
describe('Phase TS-3 — stale relative specifier detection', () => {
  it('detects a .js specifier whose module has been migrated to .ts', () => {
    const { src } = scratchTree({
      'src/config/env.ts': 'export const env: number = 1;\n',
      'src/app.js': "import { env } from './config/env.js';\nexport default env;\n",
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.stale.length, 1, 'this is the case tsc cannot see');
    assert.equal(report.stale[0].specifier, './config/env.js');
    assert.equal(report.stale[0].line, 1);
    assert.equal(report.stale[0].suggestion, './config/env.ts');
    assert.equal(path.basename(report.stale[0].siblingPath), 'env.ts');
    assert.equal(report.unresolved.length, 0, 'a stale specifier is classified once, not twice');
  });

  it('detects a .ts specifier whose module exists only as .js', () => {
    const { src } = scratchTree({
      'src/utils/errors.js': 'export const e = 1;\n',
      'src/app.ts': "import { e } from './utils/errors.ts';\nexport default e;\n",
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.stale.length, 0);
    assert.equal(report.mismatched.length, 1);
    assert.equal(report.mismatched[0].suggestion, './utils/errors.js');
  });

  it('detects a relative specifier that resolves to nothing at all', () => {
    const { src } = scratchTree({ 'src/app.js': "import { x } from './gone.js';\nexport default x;\n" });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.unresolved.length, 1);
    assert.equal(report.unresolved[0].specifier, './gone.js');
  });

  it('leaves a correctly migrated specifier alone', () => {
    const { src } = scratchTree({
      'src/config/env.ts': 'export const env: number = 1;\n',
      'src/app.ts': "import { env } from './config/env.ts';\nexport default env;\n",
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.literal, 1);
    assert.deepEqual([report.stale, report.mismatched, report.unresolved], [[], [], []]);
  });

  it('ignores package imports, node builtins, absolute URLs and non-relative specifiers', () => {
    const { src } = scratchTree({
      'src/app.js': [
        "import fs from 'node:fs';",
        "import path from 'node:path';",
        "import express from 'express';",
        "import mongoose from 'mongoose';",
        "import remote from 'https://example.com/mod.js';",
        'export { fs, path, express, mongoose, remote };',
      ].join('\n'),
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.checked, 0, 'only relative specifiers are the guards business');
    assert.deepEqual([report.stale, report.mismatched, report.unresolved], [[], [], []]);
  });

  it('resolves an extensionless specifier through a candidate extension', () => {
    const { src } = scratchTree({
      'src/lib/theme.js': 'export const theme = 1;\n',
      'src/components/icons.ts': 'export const icons = 1;\n',
      'src/app.js': "import { theme } from './lib/theme';\nimport { icons } from './components/icons';\nexport { theme, icons };\n",
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.candidate, 2);
    assert.equal(report.unresolved.length, 0);
  });

  it('resolves an extensionless specifier through an index file and a platform suffix', () => {
    const { src } = scratchTree({
      'src/widgets/index.js': 'export const w = 1;\n',
      'src/platform/button.ios.js': 'export const b = 1;\n',
      'src/app.js': "import { w } from './widgets/';\nimport { b } from './platform/button';\nexport { w, b };\n",
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.candidate, 2);
    assert.equal(report.unresolved.length, 0);
  });

  it('accepts .mjs test infrastructure importing an existing .js module', () => {
    const { src } = scratchTree({
      'src/helpers.js': 'export const h = 1;\n',
      'src/phase-ts-3.test.mjs': "import { h } from './helpers.js';\nexport default h;\n",
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.literal, 1);
    assert.deepEqual([report.stale, report.mismatched, report.unresolved], [[], [], []]);
  });

  it('reads specifiers from the parse tree, so comment and string text is never an import', () => {
    const { src } = scratchTree({
      'src/app.js': [
        "// import { gone } from './comment-gone.js';",
        "/* import './block-gone.js'; */",
        'const prose = "a specifier that looks like ./string-gone.js";',
        'export default prose;',
      ].join('\n'),
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.checked, 0);
    assert.deepEqual([report.stale, report.mismatched, report.unresolved], [[], [], []]);
  });

  it('checks a dynamic import whose argument is a literal', () => {
    const { src } = scratchTree({
      'src/config/env.ts': 'export const env: number = 1;\n',
      'src/app.js': "export const load = () => import('./config/env.js');\n",
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.stale.length, 1, 'a literal dynamic import is statically knowable and must be checked');
    assert.equal(report.stale[0].dynamic, true);
  });

  it('reports a dynamic import with a computed argument as unverified, never as a failure', () => {
    const { src } = scratchTree({
      'src/routes/inventory.routes.js': 'export const r = 1;\n',
      'src/app.js': "export const load = async (file) => import(new URL(file, 'file:///').href);\n",
    });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.dynamicUnverified.length, 1);
    assert.equal(report.dynamicUnverified[0].specifier, null);
    assert.deepEqual([report.stale, report.mismatched, report.unresolved], [[], [], []]);
  });

  it('reports the scanned file count, so a clean result is distinguishable from a blind one', () => {
    const { src } = scratchTree({ 'src/a.js': "import './b.js';\n", 'src/b.js': 'export const b = 1;\n' });
    const report = analyzeRelativeSpecifiers([src]);
    assert.equal(report.scannedFiles, 2);
    assert.equal(report.checked, 1);
  });
});
