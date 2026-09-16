// MOD-04 — mobile ESLint foundation.
//
// Expo's supported flat config: `eslint-config-expo` supplies the TypeScript
// parser, the @typescript-eslint recommended set (not type-checked), react,
// react-hooks, import and the Expo/React Native rule groups, and it decides
// which of them apply to which file type. Nothing is layered on top of it
// except the generated-output ignores below, so the rule set stays something
// Expo maintains rather than something this project has to keep in step with
// an SDK upgrade.
//
// See https://docs.expo.dev/guides/using-eslint/
//
// `npm run lint` invokes `eslint .` rather than `expo lint`. The wrapper is not
// equivalent: with no path argument it lints only the directories in its own
// DEFAULT_INPUTS list (`src`, `app`, `components`) and therefore silently skips
// `lib/` and `hooks/` entirely — 16 of this project's 83 source files, including
// the API client, the session context and the RBAC mirror. `eslint .` discovers
// everything the config below matches, which is the only behaviour a lint gate
// can be trusted on. (`expo lint .` is equivalent; the bare form is not.)
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Build output, tool caches and this repo's pre-existing QA artifacts are
    // not source. `node_modules` is ignored by ESLint already, and `android/`
    // and `ios/` hold no hand-written JS because the project does not prebuild.
    ignores: ['dist/**', '.expo/**', '.smoke/**', 'android/**', 'ios/**'],
  },
]);
