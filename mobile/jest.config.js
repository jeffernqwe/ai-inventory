// MOD-05 — mobile Jest foundation.
//
// `jest-expo` is Expo's own preset: it supplies the Babel transform (so
// `.ts`/`.tsx` and JSX compile exactly as Metro compiles them), the
// React Native platform mocks, and the `transformIgnorePatterns` allowlist
// that lets `expo-*`/`react-native` packages ship untranspiled ESM. Layering
// anything on top of it here would be a second thing to keep in step with an
// SDK upgrade, so only `testPathIgnorePatterns` is added.
//
// Tests live in `__tests__/`. They must never live under `app/`: Expo Router
// treats every file it finds there as a route or layout, so a file called
// `*.test.tsx` in that tree would be bundled as a screen.
const config = {
  preset: 'jest-expo',
  // SDK 58 workaround for jest-expo's asset-registry mock; see jest.setup.js and expo/expo#51834.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Build output (`.expo`, `dist`) and this repo's pre-existing QA artifacts
  // (`.smoke`) are not source. Jest already ignores `node_modules`, and
  // `android/`/`ios/` hold nothing because the project does not prebuild.
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/', '/.smoke/'],
};

module.exports = config;
