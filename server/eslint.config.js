// ESLint flat config (Phase 08B).
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

import js from '@eslint/js';
import globals from 'globals';

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
];
