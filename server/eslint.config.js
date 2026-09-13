// ESLint flat config (Phase 08B; TypeScript coverage added in Phase TS-1).
//
// Practical backend baseline for the Express + Node.js ES Modules server:
//   * @eslint/js `recommended` — real-bug catchers (no-undef, no-unused-vars,
//     no-unreachable, no-fallthrough, no-constant-condition, ...).
//   * Node.js globals + `sourceType: 'module'` so the ESM code is understood.
//   * A single consistency rule (eqeqeq) — no strict/opinionated style system.
//
// Intentionally NOT added: prettier, stylistic rule packs, eslint-plugin-import
// resolvers, etc. The goal is catching defects and obvious inconsistencies, not
// enforcing formatting. Test files are linted with the same rules as src; the
// node:test API is imported explicitly (never relied on as globals).
//
// Phase TS-1 note: the TypeScript blocks below are scoped strictly to `**/*.ts`,
// so `.js` and `.mjs` files see EXACTLY the configuration they saw before —
// same parser, same rules, same order. The typescript-eslint presets are spread
// after `js.configs.recommended` because `eslint-recommended` disables the core
// rules TypeScript itself covers (`no-undef`, `no-unused-vars`, ...); if it ran
// first, those core rules would be re-enabled for `.ts` and report false
// positives on type-only identifiers.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  // Backend sources, tests, runner scripts, and this config itself.
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['node_modules/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Consistency: prefer strict equality. 'smart' keeps the intentional
      // `== null` idiom (checking for null OR undefined) legal.
      eqeqeq: ['error', 'smart'],
    },
  },
  // eslint:recommended — applied after the base config above so its rule
  // defaults do not override the eqeqeq setting.
  {
    ...js.configs.recommended,
  },
  // TypeScript sources. `typescript-eslint`'s own presets, each re-scoped to
  // `**/*.ts` because the package's base config carries no `files` restriction
  // and would otherwise attach the TypeScript parser to `.js`/`.mjs` as well.
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  // Node globals and the same consistency rule the JavaScript baseline uses, so
  // a migrated file is held to one standard rather than two.
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
    },
  },
];
