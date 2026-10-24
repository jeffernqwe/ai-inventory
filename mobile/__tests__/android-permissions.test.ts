/**
 * The Android permission set is a product decision, so it is pinned here.
 *
 * WHY THIS SUITE EXISTS (2026-10-24). The production AAB declared
 * `SYSTEM_ALERT_WINDOW`, which nothing in this app uses: it is one of the "optional
 * permissions" in Expo's own generated Android manifest template, inherited by every
 * prebuild. A store listing that asks for "display over other apps" invites a reviewer
 * question for a capability the product does not have, so the config now blocks it.
 *
 * WHAT THE OTHER PERMISSIONS ARE, so the block list cannot quietly grow into a
 * capability the app needs:
 *   - CAMERA is real: `app/(app)/scan.tsx` renders `CameraView` to scan barcodes.
 *   - INTERNET / ACCESS_NETWORK_STATE / WAKE_LOCK / VIBRATE are normal-level, granted at
 *     install, and used by the app, Firebase and Expo Updates.
 *   - USE_BIOMETRIC / USE_FINGERPRINT arrive with `androidx.biometric`, which
 *     expo-secure-store depends on.
 *   - READ/WRITE_EXTERNAL_STORAGE are capped at API 32 by the template and only affect
 *     Android 12 and older.
 *   - DUMP is required by androidx.profileinstaller's receiver; READ_GSERVICES comes
 *     with Google Play services. Neither prompts a user.
 */

/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..');

function appConfig(): {
  expo: {
    android: { blockedPermissions?: string[]; package?: string };
    plugins?: unknown[];
  };
} {
  return JSON.parse(readFileSync(join(mobileRoot, 'app.json'), 'utf8'));
}

function packageJson(): { dependencies: Record<string, string> } {
  return JSON.parse(readFileSync(join(mobileRoot, 'package.json'), 'utf8'));
}

describe('the Android permission set', () => {
  it('blocks the overlay permission Expo adds by default and nothing else', () => {
    // An exact list, not a subset: a permission added to this array silently removes it
    // from the built manifest, so every entry has to be a deliberate decision.
    expect(appConfig().expo.android.blockedPermissions).toEqual([
      'android.permission.SYSTEM_ALERT_WINDOW',
    ]);
  });

  it('never blocks a capability the app uses', () => {
    const blocked = appConfig().expo.android.blockedPermissions ?? [];
    const mustSurvive = [
      'android.permission.CAMERA',
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.WAKE_LOCK',
      'android.permission.USE_BIOMETRIC',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ];
    for (const permission of mustSurvive) {
      expect(blocked).not.toContain(permission);
    }
  });

  it('still depends on the camera module, the only dangerous permission it declares', () => {
    // If the scanner were ever removed, CAMERA would become removable — and this test
    // should then change deliberately rather than drift.
    expect(packageJson().dependencies).toHaveProperty('expo-camera');
    const scanScreen = readFileSync(join(mobileRoot, 'app', '(app)', 'scan.tsx'), 'utf8');
    expect(scanScreen).toContain("from 'expo-camera'");
    expect(scanScreen).toContain('<CameraView');
  });

  it('keeps the camera plugin’s permission text, so the prompt explains itself', () => {
    const plugins = appConfig().expo.plugins ?? [];
    const camera = plugins.find(
      (entry): entry is [string, Record<string, unknown>] =>
        Array.isArray(entry) && entry[0] === 'expo-camera',
    );
    expect(camera?.[1].cameraPermission).toBe(
      'Allow Inventory AI to access your camera to scan product barcodes.',
    );
  });
});
