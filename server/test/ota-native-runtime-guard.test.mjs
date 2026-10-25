/**
 * The OTA preflight's native-runtime rule, and why it needed one.
 *
 * WHY THIS TEST EXISTS. On 2026-10-25 the Expo SDK patch moved `expo-modules-core` 58.0.23 → 58.0.26
 * while every installed build still carried 58.0.23. `eas update` publishes the working tree and
 * labels the bundle with `appVersion`; it does not know which native modules a phone actually has,
 * so it would have accepted that publish and served JavaScript the binaries cannot run. The
 * preflight now compares the installed tree against a record written after a build, and the rule is
 * only worth having if it can both pass and fail. Each case below is one of those directions.
 *
 * The pure rule is imported from `mobile/scripts/check-ota-publish.mjs` rather than reimplemented
 * here: a copy would agree with itself and prove nothing about the command an operator runs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  auditPublish,
  compareNativeRuntime,
} from '../../mobile/scripts/check-ota-publish.mjs';

const installed = {
  expo: '58.0.19',
  expoModulesCore: '58.0.26',
  reactNative: '0.88.0',
};

const recorded = {
  appVersion: '1.0.1',
  expo: '58.0.19',
  expoModulesCore: '58.0.26',
  reactNative: '0.88.0',
  recordedAt: '2026-10-25',
  builds: { preview: '00000000-0000-0000-0000-000000000000' },
};

const rules = (result) => result.findings.map((finding) => finding.rule);

describe('the native-runtime comparison', () => {
  it('passes when the tree is the runtime that was built (positive control)', () => {
    const result = compareNativeRuntime({ recorded, installed, appVersion: '1.0.1', allowNativeChange: false });
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.warn, []);
  });

  it('fails when expo-modules-core moved after the build', () => {
    const result = compareNativeRuntime({
      recorded,
      installed: { ...installed, expoModulesCore: '58.0.30' },
      appVersion: '1.0.1',
      allowNativeChange: false,
    });
    assert.deepEqual(rules(result), ['native-runtime-moved']);
    // The message has to name both sides, or the reader cannot tell which way to move.
    assert.match(result.findings[0].message, /expo-modules-core 58\.0\.26 → 58\.0\.30/);
  });

  it('treats a package that is no longer installed as a move, never as a pass', () => {
    const result = compareNativeRuntime({
      recorded,
      installed: { ...installed, reactNative: null },
      appVersion: '1.0.1',
      allowNativeChange: false,
    });
    assert.deepEqual(rules(result), ['native-runtime-moved']);
    assert.match(result.findings[0].message, /react-native 0\.88\.0 → \(not installed\)/);
  });

  it('fails when no build has recorded this runtime', () => {
    const result = compareNativeRuntime({ recorded: null, installed, appVersion: '1.0.1', allowNativeChange: false });
    assert.deepEqual(rules(result), ['native-record-missing']);
  });

  it('fails when the record is present but incomplete', () => {
    // Built explicitly rather than by destructuring the field away: an unused binding is a lint
    // error, and the point of the case is which field is absent, not how it was removed.
    const partial = { appVersion: recorded.appVersion, expo: recorded.expo, reactNative: recorded.reactNative };
    const result = compareNativeRuntime({ recorded: partial, installed, appVersion: '1.0.1', allowNativeChange: false });
    assert.deepEqual(rules(result), ['native-record-incomplete']);
    assert.match(result.findings[0].message, /expoModulesCore/);
  });

  it('fails when the version moved but no binary exists for it yet', () => {
    const result = compareNativeRuntime({ recorded, installed, appVersion: '1.0.2', allowNativeChange: false });
    assert.deepEqual(rules(result), ['native-version-mismatch']);
    assert.match(result.findings[0].message, /recorded build is 1\.0\.1 but this tree is 1\.0\.2/);
  });

  it('reports the same mismatch as a warning when the exception is asked for out loud', () => {
    const result = compareNativeRuntime({
      recorded,
      installed: { ...installed, expoModulesCore: '58.0.30' },
      appVersion: '1.0.1',
      allowNativeChange: true,
    });
    assert.deepEqual(result.findings, []);
    assert.equal(result.warn.length, 1);
    assert.match(result.warn[0], /--allow-native-change/);
  });

  it('does not let the exception excuse a version with no binary', () => {
    // --allow-native-change answers "the modules moved"; it must not answer "there is no build".
    const result = compareNativeRuntime({
      recorded,
      installed: { ...installed, expoModulesCore: '58.0.30' },
      appVersion: '1.0.2',
      allowNativeChange: true,
    });
    assert.deepEqual(rules(result), ['native-version-mismatch']);
  });
});

describe('the preflight wires the rule into its own verdict', () => {
  const config = {
    version: '1.0.1',
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      url: 'https://u.expo.dev/00000000-0000-0000-0000-000000000000',
    },
  };
  const profiles = {
    development: { channel: 'development' },
    preview: { channel: 'preview' },
    production: { channel: 'production' },
  };
  const base = {
    tree: [],
    branch: 'main',
    ahead: 0,
    config,
    profiles,
    channel: 'production',
    allowDirty: false,
  };

  it('is ready with a clean tree, a matching runtime and a recorded build', () => {
    const result = auditPublish({ ...base, native: { recorded, installed }, allowNativeChange: false });
    assert.deepEqual(result.findings, []);
  });

  it('is not ready when the native modules moved, even though everything else is clean', () => {
    const result = auditPublish({
      ...base,
      native: { recorded, installed: { ...installed, expoModulesCore: '58.0.30' } },
      allowNativeChange: false,
    });
    assert.deepEqual(rules(result), ['native-runtime-moved']);
  });

  it('still reports the unrelated rules beside it', () => {
    // The native rule must add to the verdict, not replace it: a dirty tree and a stale record are
    // two different reasons not to publish, and an operator needs both.
    const result = auditPublish({
      ...base,
      tree: ['M mobile/app.json'],
      native: { recorded: null, installed },
      allowNativeChange: false,
    });
    assert.ok(rules(result).includes('uncommitted'));
    assert.ok(rules(result).includes('native-record-missing'));
  });
});
