/**
 * Source-file helpers for the source-text security guards (Phase TS-1).
 *
 * Four guard suites — `phase22-authorization-contract`, `phase23-authorization-contract`,
 * `phase26b-password-recovery` and `phase26b-password-recovery-http` — verify security
 * properties by reading the application's SOURCE as text rather than by exercising it.
 * That makes them the part of the suite most exposed to a file rename, and the migration
 * to TypeScript renames 95 server modules and 83 mobile modules.
 *
 * Hardening them means making the extension question answerable in exactly ONE place, so
 * the four guards cannot drift from one another. It does NOT relax anything: each guard
 * still reads the same modules and makes the same assertions — it simply stops assuming
 * those modules end in `.js`.
 *
 * Two deliberate rules:
 *
 *   * `.d.ts` is NOT a source file. It ends in `.ts`, so a naive `endsWith('.ts')` filter
 *     would sweep generated declarations (`.expo/types/router.d.ts`, `expo-env.d.ts`) into
 *     a security scan as though they were application code.
 *   * Resolution PREFERS an existing path untouched. While every module is still `.js`,
 *     every helper below returns exactly what the inline code it replaced returned.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Extensions a plain application module may have (server sources, mobile lib/hooks). */
export const SOURCE_EXTENSIONS = Object.freeze(['.js', '.ts']);

/** Extensions a JSX-bearing component module may have (mobile components/routes). */
export const COMPONENT_EXTENSIONS = Object.freeze(['.jsx', '.tsx']);

/** Every extension a guard should treat as application modules. */
export const ALL_SOURCE_EXTENSIONS = Object.freeze([...SOURCE_EXTENSIONS, ...COMPONENT_EXTENSIONS]);

/**
 * A regex fragment matching any source extension, derived from the lists above so it
 * cannot fall out of step with them. Longest-first, so `.tsx` is preferred over `.ts`.
 *
 *   new RegExp(`from '\\./mail/index${SOURCE_EXTENSION_PATTERN}'`)
 */
export const SOURCE_EXTENSION_PATTERN = `\\.(?:${ALL_SOURCE_EXTENSIONS.slice()
  .sort((a, b) => b.length - a.length)
  .map((ext) => ext.slice(1))
  .join('|')})`;

/** Resolve a URL or path string to a plain filesystem path. */
function toPath(target) {
  return target instanceof URL ? fileURLToPath(target) : target;
}

/** Generated declaration files end in `.ts`/`.mts`/`.cts` but carry no application code. */
function isDeclarationFile(name) {
  return /\.d\.(?:ts|mts|cts)$/.test(name);
}

/** Does `name` look like an application module with one of `extensions`? */
export function hasSourceExtension(name, extensions = ALL_SOURCE_EXTENSIONS) {
  if (isDeclarationFile(name)) return false;
  return extensions.some((ext) => name.endsWith(ext));
}

/**
 * Return the path that actually exists for `target`, trying the literal path first and
 * then the same basename under each candidate extension. Falls back to the original path
 * so a genuine miss fails loudly, naming the path the caller asked for.
 */
export function resolveSourcePath(target, extensions = ALL_SOURCE_EXTENSIONS) {
  const filePath = toPath(target);
  if (fs.existsSync(filePath)) return filePath;

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  for (const ext of extensions) {
    const candidate = path.join(dir, base + ext);
    if (fs.existsSync(candidate)) return candidate;
  }
  return filePath;
}

/** Read a source file as UTF-8, resolving `.js`/`.ts` (etc.) transparently. */
export function readSource(target, extensions = ALL_SOURCE_EXTENSIONS) {
  return fs.readFileSync(resolveSourcePath(target, extensions), 'utf8');
}

/** Filenames directly inside `dir` that are application modules, sorted. */
export function listSourceFiles(dir, extensions = ALL_SOURCE_EXTENSIONS) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && hasSourceExtension(entry.name, extensions))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Recursively list application modules under `dir`, skipping any directory named in
 * `skipDirs`. Returns absolute paths.
 */
export function walkSourceFiles(dir, { extensions = ALL_SOURCE_EXTENSIONS, skipDirs = new Set() } = {}) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      out.push(...walkSourceFiles(path.join(dir, entry.name), { extensions, skipDirs }));
    } else if (hasSourceExtension(entry.name, extensions)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * A module specifier or relative path with any source extension removed, so an assertion
 * can pin WHICH module is imported without pinning the extension it currently carries:
 *
 *   './mail/index.js' -> './mail/index'
 */
export function sourceModuleName(specifier) {
  for (const ext of ALL_SOURCE_EXTENSIONS) {
    if (specifier.endsWith(ext)) return specifier.slice(0, -ext.length);
  }
  return specifier;
}
