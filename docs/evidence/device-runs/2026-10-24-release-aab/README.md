# 2026-10-24 — the production AAB, built and inspected before any upload

Build: EAS `09d77d3d-0f1c-4f8e-948f-7a99ccaa2a56`, profile `production`, **default store
packaging** (`android.buildType` absent), `autoIncrement` on. The production profile was restored
before this build; nothing about the packaging was changed for it.
Artifact: `https://expo.dev/artifacts/eas/3sCYPhYmeC75sJzoV-UowT1TiAzGX4BzzVangTOavAo.aab`
`80,230,212` bytes · SHA-256 `dcbc63231d92307d344859747d1231fbe0a222fd17266d8c90ab87255648f50a`
No upload, no Play Console interaction.

Raw output: [`aab-verification.txt`](aab-verification.txt).

## What was checked, and what the artifact says

| Check | Measurement | Verdict |
|---|---|---|
| Archive is a valid bundle | 1,500 entries; `base/manifest/AndroidManifest.xml`, `base/resources.pb`, `base/dex/`, `base/lib/` present | PASS |
| Package id | `com.inventoryai.app` | PASS |
| Version | `versionName 1.0.0`, **`versionCode 2`** (auto-increment from the earlier rehearsal's 1) | PASS |
| SDK levels | `minSdkVersion 24`, `targetSdkVersion 36` | PASS |
| Signing | JAR signature present: `META-INF/977F9C91.SF`, `.RSA`, `MANIFEST.MF` — produced with the project's production keystore on the EAS builder | PASS (see limits) |
| Update channel | manifest meta-data carries `{"expo-channel-name":"production"}` and `EXPO_UPDATE_URL=https://u.expo.dev/607eca05-…` | PASS |
| Runtime version | `expo_runtime_version` = `1.0.0`, and `runtimeVersion: { policy: "appVersion" }` in the embedded config | PASS |
| Update behaviour | `checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0` | PASS |
| Production API compiled in | JS bundle contains `ai-inventory-l1mi.onrender.com` **once**, `localhost:4000` **zero** times | PASS |
| Correct JS in the artifact | Hermes bytecode; `inventoryai.auth.userSnapshot` present (the offline-boot fix is in this build) | PASS |
| No development surface | no `expo-dev-menu` / `expo-dev-launcher` / `react-native-web` / `.env` / secret-named entries | PASS |
| Architectures | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` | PASS |
| Native debugging | 60 Play upload debug-symbol files under `BUNDLE-METADATA/…debugsymbols/` | PASS |
| Permissions | 12, listed below | REVIEW NOTE |

**Permissions declared:** `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`, `VIBRATE`, `WAKE_LOCK`,
`BIND_JOB_SERVICE`, `DUMP`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `SYSTEM_ALERT_WINDOW`,
`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`.

`SYSTEM_ALERT_WINDOW` and the two external-storage permissions arrive from the React Native / Expo
libraries, not from anything this app asks for in `app.json`; on Android 11+ they are not granted
implicitly (`SYSTEM_ALERT_WINDOW` needs the user to enable "display over other apps", and the storage
permissions are effectively no-ops at `targetSdk 36`). They are recorded rather than removed because
removing a permission a library may rely on is a native change that needs its own build and test.
They are worth a glance in the Play Console listing before release.

**How to reproduce:** the checks read the AAB as a ZIP — manifest protobuf fields are found by their
names and the value adjacent to each, the JS bundle is `base/assets/index.android.bundle`, and the
embedded config is `base/assets/app.config`. No Java, `bundletool` or Android SDK is needed:
`python docs/evidence/device-runs/2026-10-24-release-aab/verify.py <file.aab>` reproduces every row
above (the script is the one used for `aab-verification.txt`).

## Limits — what this does not prove

- **It is not installed.** An AAB cannot be installed with `adb`, and this host has no Java, so
  `bundletool` could not generate split APKs from it either. Behaviour was proven on the
  **production-profile APK** built one build earlier (`versionCode 1`, same source, keystore,
  channel and environment) — see
  [2026-10-24-release-build](../2026-10-24-release-build/README.md).
- **No upload and no Play processing.** Play App Signing, the upload-key handover, pre-launch reports
  and Play's own manifest/permission review have not run.
- **Signing is verified as present, not cryptographically validated** (no `jarsigner` on this host).
  The keystore is the project's production key, as the EAS build record states.
- **iOS** untouched (no macOS on this host).
