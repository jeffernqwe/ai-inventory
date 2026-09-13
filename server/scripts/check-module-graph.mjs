/**
 * Module-graph guards (Phase TS-3).
 *
 * The server is migrating from `.js` to `.ts` in bands, and each band renames modules
 * and rewrites every specifier that pointed at them. That work has two failure modes
 * that no existing gate can see:
 *
 *   1. DUPLICATE MODULES — `foo.js` surviving beside a renamed `foo.ts`. Because
 *      `test/sourceFiles.mjs`'s `resolveSourcePath()` prefers the literal path, the four
 *      source-text security guards would keep reading the STALE `.js` while the
 *      application runs the `.ts`, and every gate would still pass.
 *
 *   2. STALE SPECIFIERS — `import x from './foo.js'` left behind after `foo.js` became
 *      `foo.ts`. `tsc` is provably blind to this direction: a `.js` specifier whose
 *      target exists only as `.ts` produces NO diagnostic, while the reverse is TS7016.
 *      It fails only at runtime, with ERR_MODULE_NOT_FOUND.
 *
 * Neither is detectable by grep, by `tsc`, or by git's rename detection, so both are
 * checked here against the real filesystem.
 *
 * Specifiers are extracted with the TypeScript compiler's own parser rather than with a
 * regular expression, so text in comments, strings and regexes can never be mistaken for
 * an import — and dynamic `import()` calls are seen at all. `typescript` is already a
 * devDependency of this package; no new dependency is introduced.
 *
 * The guards are deliberately strict, and are cheap enough to run routinely:
 *   * a relative specifier that resolves to nothing is a FAILURE, not a warning — a dead
 *     import is a dead import regardless of which band is in flight;
 *   * a dynamic import whose argument is not a string literal CANNOT be resolved
 *     statically, so it is REPORTED as unverified rather than assumed correct.
 *
 * Usage:
 *   node scripts/check-module-graph.mjs              # both guards
 *   node scripts/check-module-graph.mjs extensions   # duplicate modules only
 *   node scripts/check-module-graph.mjs specifiers   # relative specifiers only
 *
 * Exit codes: 0 = clean, 1 = a guard found a problem, 2 = usage error.
 *
 * Both checks are also asserted by `test/phase-ts-3-migration-guards.test.mjs`, which the
 * standard `npm test` run executes, so the guards cannot be forgotten.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(serverRoot, '..');

/** Every extension a loadable application module may carry. */
export const SOURCE_EXTENSIONS = Object.freeze(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.mts', '.cjs', '.cts']);

/**
 * The extension a module takes when it is migrated. Used only to explain a failure —
 * a `.js` specifier whose `.js` target is gone and whose `.ts` sibling exists is the
 * signature of a missed rename.
 */
export const MIGRATION_PAIRS = Object.freeze({
  '.js': '.ts',
  '.jsx': '.tsx',
  '.mjs': '.mts',
  '.cjs': '.cts',
});

/** Extensions a bundler-less/extensionless resolution may supply (incl. JSON imports). */
const RESOLUTION_EXTENSIONS = Object.freeze([...SOURCE_EXTENSIONS, '.json']);

/** Platform suffixes Metro tries for an extensionless specifier (mobile uses Metro). */
const PLATFORM_SUFFIXES = Object.freeze(['', '.native', '.android', '.ios', '.web']);

/**
 * Directories that hold no application source: dependencies, VCS metadata, Expo/RN build
 * output and local QA artifacts. This is a directory skip list, never a module allowlist —
 * no individual module is ever excluded from the checks.
 */
const SKIP_DIRS = Object.freeze(
  new Set([
    'node_modules',
    '.git',
    '.expo',
    '.smoke',
    '.playwright-mcp',
    '.claude',
    '.vscode',
    '.idea',
    'dist',
    'web-build',
    'coverage',
    'android',
    'ios',
  ]),
);

/** Generated declarations end in `.ts` but carry no application code. */
function isDeclarationFile(name) {
  return /\.d\.(?:ts|mts|cts)$/.test(name);
}

/** The source extension `name` carries, or null. */
function sourceExtensionOf(name) {
  return SOURCE_EXTENSIONS.find((ext) => name.endsWith(ext)) ?? null;
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** Every application module under `root`, recursively. Missing roots yield nothing. */
export function collectSourceFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...collectSourceFiles(path.join(root, entry.name)));
    } else if (sourceExtensionOf(entry.name) && !isDeclarationFile(entry.name)) {
      out.push(path.join(root, entry.name));
    }
  }
  return out;
}

/**
 * The source trees both guards cover: the server's sources, its tests and the runner
 * scripts (which import the app), plus the whole mobile app so a future mobile migration
 * is covered by the same rule.
 */
export function defaultRoots() {
  return [
    path.join(serverRoot, 'src'),
    path.join(serverRoot, 'test'),
    path.join(serverRoot, 'scripts'),
    path.join(repoRoot, 'mobile'),
  ];
}

/**
 * Find module stems that exist more than once inside one directory — `foo.js` beside
 * `foo.ts` (or any other pair of source extensions sharing a stem). Two files with the
 * same stem in the same directory resolve to the same specifier, so which one wins is an
 * accident of resolution order rather than a decision.
 */
export function findDuplicateModules(roots) {
  const files = roots.flatMap((root) => collectSourceFiles(root));
  const byStem = new Map();

  for (const file of files) {
    const dir = path.dirname(file);
    const base = path.basename(file);
    const ext = sourceExtensionOf(base);
    const stem = base.slice(0, -ext.length);
    const key = `${dir}${path.sep}${stem}`;
    if (!byStem.has(key)) byStem.set(key, { dir, stem, files: [] });
    byStem.get(key).files.push(base);
  }

  const duplicates = [...byStem.values()]
    .filter((entry) => entry.files.length > 1)
    .map((entry) => ({ ...entry, files: [...entry.files].sort() }));

  return { scannedFiles: files.length, duplicates };
}

/** Parse one file and return every module specifier it states, with its source position. */
function specifiersIn(file) {
  const text = fs.readFileSync(file, 'utf8');
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
  const found = [];
  const at = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const visit = (node) => {
    const { SyntaxKind } = ts;
    if (node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration) {
      if (node.moduleSpecifier?.kind === SyntaxKind.StringLiteral) {
        found.push({ specifier: node.moduleSpecifier.text, line: at(node.moduleSpecifier), dynamic: false });
      }
    } else if (node.kind === SyntaxKind.ImportEqualsDeclaration) {
      const ref = node.moduleReference;
      if (ref?.kind === SyntaxKind.ExternalModuleReference && ref.expression?.kind === SyntaxKind.StringLiteral) {
        found.push({ specifier: ref.expression.text, line: at(ref), dynamic: false });
      }
    } else if (node.kind === SyntaxKind.CallExpression && node.expression.kind === SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg?.kind === SyntaxKind.StringLiteral) {
        found.push({ specifier: arg.text, line: at(arg), dynamic: true });
      } else if (arg) {
        found.push({ specifier: null, line: at(arg), dynamic: true });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** Is `specifier` a relative one? Package imports, `node:` builtins and absolute URLs are not. */
function isRelative(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * Resolve a relative specifier the way its consumer will: the literal path first, then —
 * for an extensionless specifier only — the candidate extensions and index files a
 * bundler would try (mobile imports are extensionless by Metro convention).
 *
 * Returns a classification rather than a boolean so a failure can explain itself.
 */
function resolveSpecifier(importer, specifier) {
  const dir = path.dirname(importer);
  const target = path.resolve(dir, specifier);
  const ext = sourceExtensionOf(specifier);
  const stem = ext ? specifier.slice(0, -ext.length) : specifier;
  const stemTarget = ext ? path.resolve(dir, stem) : target;

  if (isFile(target)) return { kind: 'literal' };

  // A specifier carrying a source extension must match that extension exactly. When it
  // does not, a sibling under the migratable extension is the signature of a rename that
  // was not carried through to the importer.
  if (ext) {
    const migrated = MIGRATION_PAIRS[ext];
    if (migrated && isFile(`${stemTarget}${migrated}`)) {
      return { kind: 'stale', missingPath: target, siblingPath: `${stemTarget}${migrated}`, suggestion: `${stem}${migrated}` };
    }
    for (const other of SOURCE_EXTENSIONS) {
      if (other !== ext && isFile(`${stemTarget}${other}`)) {
        return { kind: 'mismatched', missingPath: target, siblingPath: `${stemTarget}${other}`, suggestion: `${stem}${other}` };
      }
    }
    return { kind: 'unresolved', missingPath: target };
  }

  // Extensionless: only a true directory specifier may resolve to an index file.
  const directoryOnly = specifier.endsWith('/');
  if (!directoryOnly) {
    for (const platform of PLATFORM_SUFFIXES) {
      for (const candidate of RESOLUTION_EXTENSIONS) {
        if (isFile(`${target}${platform}${candidate}`)) return { kind: 'candidate' };
      }
    }
  }
  for (const platform of PLATFORM_SUFFIXES) {
    for (const candidate of RESOLUTION_EXTENSIONS) {
      if (isFile(path.join(target, `index${platform}${candidate}`))) return { kind: 'candidate' };
    }
  }
  if (isDirectory(target)) return { kind: 'candidate' };

  // An extensionless specifier can also be the stale half of a rename: `./foo` still
  // resolves once `foo.ts` exists, but `./foo` written where only `foo.ts` exists is fine
  // too — so the only genuine failure here is a target that resolves to nothing at all.
  return { kind: 'unresolved', missingPath: target };
}

/**
 * Check every relative specifier in every covered source file against the filesystem.
 *
 *   literal             — the exact path exists
 *   candidate           — extensionless, resolved by candidate extension or index file
 *   stale               — target gone, sibling under its MIGRATION_PAIRS extension exists
 *   mismatched          — target gone, sibling under some other source extension exists
 *   unresolved          — nothing resolves this specifier
 *   dynamicUnverified   — a dynamic import whose argument is not a string literal
 */
export function analyzeRelativeSpecifiers(roots) {
  const files = roots.flatMap((root) => collectSourceFiles(root));
  const report = {
    scannedFiles: files.length,
    checked: 0,
    literal: 0,
    candidate: 0,
    stale: [],
    mismatched: [],
    unresolved: [],
    dynamicUnverified: [],
  };

  for (const file of files) {
    for (const { specifier, line, dynamic } of specifiersIn(file)) {
      const where = { file, line, dynamic };
      if (specifier === null) {
        report.dynamicUnverified.push({ ...where, specifier: null });
        continue;
      }
      if (!isRelative(specifier)) continue;
      report.checked += 1;
      const result = resolveSpecifier(file, specifier);
      if (result.kind === 'literal' || result.kind === 'candidate') {
        report[result.kind] += 1;
      } else {
        report[result.kind].push({ ...where, specifier, ...result });
      }
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const CHECKS = ['extensions', 'specifiers'];

const relative = (target) => path.relative(repoRoot, target).split(path.sep).join('/');

function reportDuplicates(roots) {
  const { scannedFiles, duplicates } = findDuplicateModules(roots);
  if (!duplicates.length) {
    console.log(`[check-module-graph] extensions OK — ${scannedFiles} module(s) scanned, no duplicate module stem`);
    return 0;
  }
  console.error(`[check-module-graph] FAIL (extensions) — ${duplicates.length} duplicate module stem(s)`);
  for (const { dir, stem, files } of duplicates) {
    console.error(`  ${relative(path.join(dir, stem))}`);
    console.error(`      files: ${files.join(', ')}`);
    console.error('      Two modules share one stem in one directory, so one specifier resolves to both.');
    console.error('      Remove the stale file, or rename it — the migration must leave exactly one.');
  }
  return 1;
}

function reportSpecifiers(roots) {
  const report = analyzeRelativeSpecifiers(roots);
  const failures = report.stale.length + report.mismatched.length + report.unresolved.length;

  for (const item of report.stale) {
    console.error(`[check-module-graph] STALE  ${relative(item.file)}:${item.line}  '${item.specifier}'`);
    console.error(`      missing:  ${relative(item.missingPath)}`);
    console.error(`      migrated: ${relative(item.siblingPath)}`);
    console.error(`      The module was migrated but this specifier was not — rewrite it as '${item.suggestion}'.`);
  }
  for (const item of report.mismatched) {
    console.error(`[check-module-graph] MISMATCHED  ${relative(item.file)}:${item.line}  '${item.specifier}'`);
    console.error(`      missing: ${relative(item.missingPath)}  but ${relative(item.siblingPath)} exists`);
    console.error(`      Did you mean '${item.suggestion}'?`);
  }
  for (const item of report.unresolved) {
    console.error(`[check-module-graph] UNRESOLVED  ${relative(item.file)}:${item.line}  '${item.specifier}'`);
    console.error(`      no file or index resolves ${relative(item.missingPath)}`);
  }
  for (const item of report.dynamicUnverified) {
    console.error(`[check-module-graph] note  ${relative(item.file)}:${item.line}  dynamic import() with a non-literal argument — NOT statically verified`);
  }

  if (failures) {
    console.error(`[check-module-graph] FAIL (specifiers) — ${report.stale.length} stale, ${report.mismatched.length} mismatched, ${report.unresolved.length} unresolved`);
    return 1;
  }
  console.log(
    `[check-module-graph] specifiers OK — ${report.scannedFiles} file(s) scanned, ${report.checked} relative specifier(s) resolved ` +
      `(${report.literal} literal, ${report.candidate} by candidate extension), 0 stale, 0 unresolved`,
  );
  if (report.dynamicUnverified.length) {
    console.log(`[check-module-graph] note — ${report.dynamicUnverified.length} dynamic import(s) could not be resolved statically (reported above, not assumed correct)`);
  }
  return 0;
}

function main() {
  const arg = process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log('usage: node scripts/check-module-graph.mjs [extensions|specifiers]');
    return 0;
  }
  if (arg !== undefined && !CHECKS.includes(arg)) {
    console.error(`[check-module-graph] Unknown check "${arg}" — expected one of ${CHECKS.join(', ')}, or no argument for both.`);
    return 2;
  }

  const roots = defaultRoots();
  const missing = roots.filter((root) => !fs.existsSync(root));
  if (missing.length) {
    console.error(`[check-module-graph] WARNING — covered tree(s) absent, coverage is reduced: ${missing.map(relative).join(', ')}`);
  }

  const checks = arg ? [arg] : CHECKS;
  let failed = 0;
  for (const check of checks) {
    failed += check === 'extensions' ? reportDuplicates(roots) : reportSpecifiers(roots);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
