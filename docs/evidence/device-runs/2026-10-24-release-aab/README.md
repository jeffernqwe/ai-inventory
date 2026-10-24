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
| Permissions | 12 `uses-permission` entries, attributed below | REVIEW NOTE |

**Declared permissions, with their source and level** (an earlier version of this record listed
`BIND_JOB_SERVICE` as *requested* and missed `READ_GSERVICES`; this is the corrected reading, taken
from the element blocks rather than from any string that looks like a permission):

| Permission | Declared by | Level / effect |
|---|---|---|
| `CAMERA` | `expo-camera` — `app/(app)/scan.tsx` renders `CameraView` | **dangerous** — the only one a user ever sees a prompt for |
| `INTERNET` | Expo template | normal, install-time |
| `ACCESS_NETWORK_STATE` | `expo-updates`, Firebase | normal, install-time |
| `WAKE_LOCK` | AndroidX components pulled by Firebase / Expo Updates | normal, install-time |
| `VIBRATE` | Expo template | normal, install-time |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | `androidx.biometric`, a dependency of `expo-secure-store` | normal, install-time |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` | Expo template + `expo-file-system`, **`maxSdkVersion 32`** | normal, and only on Android 12 and older |
| `DUMP` | `androidx.profileinstaller`'s receiver | signature-level, never granted to the app by a user |
| `com.google.android.providers.gsf.permission.READ_GSERVICES` | Google Play services (Firebase) | normal, install-time |
| `com.inventoryai.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | declared **and defined** by the app itself | signature, granted only to this app |

`android.permission.BIND_JOB_SERVICE` and `com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION`
also appear in the manifest as **`android:permission` attributes on components** — requirements on
whoever calls that component, not requests by this app.

**The one entry worth acting on is `SYSTEM_ALERT_WINDOW`.** It is not declared by any dependency's own
manifest; it is one of the "optional permissions" in Expo's generated main-manifest template
(`@expo/config-plugins`, `withAndroidBaseMods.js`), so every prebuild inherits it, and nothing in
Inventory AI displays an overlay. It was left in this build and then blocked in app config for the
next one: see
[2026-10-24-permission-trim](../2026-10-24-permission-trim/README.md).

**How to reproduce:** the checks read the AAB as a ZIP — manifest protobuf fields are found by their
names and the value adjacent to each, the JS bundle is `base/assets/index.android.bundle`, and the
embedded config is `base/assets/app.config`. No Java, `bundletool` or Android SDK is needed:
`python docs/evidence/device-runs/2026-10-24-release-aab/verify.py <file.aab>` reproduces every row
above (the script is the one used for `aab-verification.txt`).

**Checked again with Google's tooling later the same day.** Android Studio's bundled JetBrains Runtime
(OpenJDK 25) runs `bundletool` 1.18.3, so this artifact was also validated and its manifest dumped
by the tool Google ships: `validate` exits 0, and the dump confirms package, `versionCode 2`, the SDK
levels and the permission list — stored here as [`bundletool-manifest.xml`](bundletool-manifest.xml).
See [2026-10-24-permission-trim](../2026-10-24-permission-trim/README.md). `validate`/`dump` need no
keystore, so no signing material was read, printed or committed.

## What these checks did not ask, and what the answer was (2026-10-24, later)

Every row above inspects **packaging**. None of them asked whether the JavaScript inside the bundle
was the JavaScript under review. It was not.

The same day, after the in-app account-deletion screen shipped (`381c3f8`, 20:56 local) and the
Google account chooser was fixed (`bfc9c6e`, 23:07), a parity check was run against both artifacts
still on disk. Both were built **before** those commits — `09d77d3d` and `4b133d62` were downloaded
at 16:51 and 17:41 — and neither bundle contains a single occurrence of any deletion copy:

| Artifact | `versionCode` | Bundle bytes | `Delete my account` | `Type DELETE` | `Continue with Google` | Verdict |
|---|---|---|---|---|---|---|
| `09d77d3d…` | 2 | 2,847,364 | 0 | 0 | present | **WRONG** |
| `4b133d62…` | 3 | 2,847,364 | 0 | 0 | present | **WRONG** |

Their bundles have exactly the same length because the permission trim changed the **manifest**, not
the JavaScript. That is the crux: a download that is signed, correctly versioned, correctly channelled
and one permission lighter can still be an artifact of a commit that lacked a Play-required feature,
and every manifest-level check passes.

Raw output: [`bundle-parity.txt`](bundle-parity.txt). The check is now a gate:
`mobile/scripts/check-aab.mjs` (`npm run check:aab -- <file>`), with its controls run by
`mobile/__tests__/release-aab-parity-guard.test.ts`. **Neither artifact is uploadable**; a build from a
current commit is required, and the Free plan's Android build quota resets 2026-11-01. Guide §1.1,
roadmap §27EZ.

## Limits — what this does not prove

- **It is not installed.** An AAB cannot be installed with `adb`; `bundletool build-apks` would have
  to re-sign it with a key this host does not hold, and a differently signed APK cannot replace the
  installed production build in place. Behaviour was proven on the **production-profile APK** built
  one build earlier (`versionCode 1`, same source, keystore, channel and environment) — see
  [2026-10-24-release-build](../2026-10-24-release-build/README.md).
- **No upload and no Play processing.** Play App Signing, the upload-key handover, pre-launch reports
  and Play's own manifest/permission review have not run.
- **Signing is verified as present, not cryptographically validated** (no `jarsigner` on this host).
  The keystore is the project's production key, as the EAS build record states.
- **iOS** untouched (no macOS on this host).
