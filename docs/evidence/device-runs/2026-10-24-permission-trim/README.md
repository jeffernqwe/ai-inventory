# 2026-10-24 — reviewing the Android permissions, and removing the one nobody needs

Follow-up to [2026-10-24-release-aab](../2026-10-24-release-aab/README.md). That inspection
reported 12 declared permissions and left three of them as a review note. This run attributed every
one of them to a real source and removed the single entry that no part of the product needs.

## 1. What each permission comes from

Read from the element blocks of the built manifest (`verify.py`), matched against each dependency's
own `AndroidManifest.xml` and `build.gradle`:

| Permission | Source | Level | Needed? |
|---|---|---|---|
| `CAMERA` | `expo-camera`; `app/(app)/scan.tsx` renders `CameraView` | dangerous | **yes** — barcode scanning |
| `INTERNET` | Expo's manifest template | normal | yes |
| `ACCESS_NETWORK_STATE` | `expo-updates`, Firebase | normal | yes |
| `WAKE_LOCK` | AndroidX pulled by Firebase / Expo Updates | normal | yes |
| `VIBRATE` | Expo's manifest template | normal | harmless, kept |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | `androidx.biometric`, a dependency of `expo-secure-store` | normal | comes with the token store |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` | Expo template + `expo-file-system`, capped `maxSdkVersion 32` | normal, Android ≤12 only | harmless, kept |
| `DUMP` | `androidx.profileinstaller`'s receiver | signature | never granted to a user |
| `…gsf.permission.READ_GSERVICES` | Google Play services (Firebase) | normal | comes with Firebase |
| `SYSTEM_ALERT_WINDOW` | **Expo's "optional permissions" template** — not a dependency, not `app.json` | special (user must enable "display over other apps") | **no — removed here** |

`BIND_JOB_SERVICE` (and GMS's `REVOCATION_NOTIFICATION`) are **not requested**: they are
`android:permission` attributes on components, i.e. a requirement on whoever calls them. The earlier
record listed `BIND_JOB_SERVICE` as declared; that was wrong and is corrected in both places.

## 2. The change

`mobile/app.json` → `android.blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW"]`.
Expo's config schema applies this with `tools:node="remove"` when the manifest is generated, so it is
absent from the built artifact rather than merely inert. No dependency, no plugin, no native code.

A guard suite pins the decision — `mobile/__tests__/android-permissions.test.ts` (4 cases): the block
list is exactly that one entry (not a subset, so a future addition is a deliberate edit), nothing the
app uses appears in it, `expo-camera` and the `CameraView` import still exist, and the camera
permission message is still present so the prompt explains itself.

## 3. Verified

**Local:** mobile **92 suites / 1,103 tests / 0 failures**, `tsc` clean, `eslint` clean,
`check-build-env --profile production` clean (17 self-test controls).

**The rebuilt store artifact** (EAS `4b133d62-30a9-4e18-a7ca-950b06e0cfed`, profile `production`,
default packaging, `versionCode` **3**, 80,230,207 bytes, SHA-256 `76740691…`):

- `SYSTEM_ALERT_WINDOW` **absent**; declared permissions **12 → 11** (the survivor list is in
  [`aab-verification.txt`](aab-verification.txt), unedited output).
- The two storage permissions still carry `maxSdkVersion 32` — the cap was invisible in the first
  report, which is why `verify.py` now prints it.
- **The JavaScript is byte-identical to the previous AAB**: `base/assets/index.android.bundle`,
  2,847,364 bytes, SHA-256 `1156e960…` in both builds. Only the manifest and the embedded app config
  differ (`app.config` SHA-256 `36ed58d9…` → `f6b652cb…`, the added `blockedPermissions`).
- Everything else is unchanged: package, `versionName`, SDK levels, signature entries, production
  channel, runtime `1.0.0`, `ON_LOAD`/`fallbackToCacheTimeout: 0`, 60 debug-symbol files, production
  API host once and `localhost:4000` never, no dev-menu/web/`.env` entries.**With Google's own tooling.** Android Studio's bundled JetBrains Runtime (OpenJDK **25.0.3**) runs
`bundletool` **1.18.3**, so the bundle was validated by the tool Google ships for it rather than by
this repository's reader alone:

- `bundletool validate --bundle=app-release.aab` → exit **0**, "App Bundle information / Feature
  modules: base" ([output](bundletool-validate.txt), warnings stripped).
- `bundletool dump manifest --bundle=app-release.aab --module=base` → authoritative XML
  ([before](../2026-10-24-release-aab/bundletool-manifest.xml) /
  [after](bundletool-manifest.xml)). It confirms `versionCode="3"`, `minSdkVersion="24"`,
  `targetSdkVersion="36"`, `compileSdkVersion="37"` and lists **exactly** the 11 permissions above,
  with `maxSdkVersion="32"` printed on the storage pair and **no `SYSTEM_ALERT_WINDOW`** — while the
  previous build's dump lists 12 including it.
- **No keystore or password was needed, read, printed or committed** for either command: `validate`
  and `dump` do not sign.

**Device:** not re-run. The JavaScript in the rebuilt artifact is byte-identical to the build that was

driven on the phone on 2026-10-24
([release build](../2026-10-24-release-build/README.md), [preview](../2026-10-24-preview-journeys/README.md),
[OTA](../2026-10-24-preview-ota/README.md)), and the manifest change removes a permission the app
never requested at runtime — so a re-install would exercise the same code with one fewer
declaration. This is recorded as a gap rather than a pass: an install of a build carrying this
manifest was not performed, and `SYSTEM_ALERT_WINDOW` was never exercised either way.

**Why it was not installed even with bundletool available:** an install would need `bundletool
build-apks`, which re-signs the APKs with a key this host does not have (the production keystore lives
in EAS). A locally signed APK shares the package name but not the signature, so `adb install -r`
would be refused; installing it would mean uninstalling the production build on the phone and
losing in-place update continuity for a manifest-only change.

## 4. What is still open

- The **AAB is still not installed** (an AAB cannot be installed as-is, and re-signing it locally
  would break the installed app's signature lineage) and **nothing has been uploaded** — Play App
  Signing and Play's own review remain unexercised.
- `CAMERA` remains the only permission a user is ever prompted for, and it is justified by the
  scanner; the Play Data safety form should say so.
- iOS untouched (no macOS on this host).
