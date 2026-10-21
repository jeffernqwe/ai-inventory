/* global jest */
// SDK 58 / jest-expo 58.0.11 known-issue workaround.
//
// WHAT BREAKS. `jest-expo` mocks `react-native/asset-registry` so the asset transformer's stub id
// (`module.exports = 1`) resolves. In React Native 0.88 that public module is only a wrapper
// around `react-native/src/private/assets/AssetRegistry`, while `expo-asset` reads the private
// module directly. The mock therefore never reaches `expo-asset`, `getAssetByID(1)` is undefined,
// and rendering any `@expo/vector-icons` icon throws
// `Module "1" is missing from the asset registry` — the whole React tree of that test fails.
//
// THE WORKAROUND is the one reported on expo/expo#51834: point the private module at the same
// mocked registry for the duration of the test run.
//
// WHEN TO DELETE THIS FILE: when a jest-expo release mocks the private module itself. Follow the
// issue; if the next SDK's test suite is green without this file, remove it and its
// `setupFilesAfterEnv` entry rather than carrying a permanent patch for a fixed bug.
const path = require('node:path');

jest.doMock(
  require.resolve('react-native/src/private/assets/AssetRegistry', {
    paths: [path.dirname(require.resolve('react-native/package.json'))],
  }),
  () => ({ AssetRegistry: jest.requireMock('react-native/asset-registry') }),
);
