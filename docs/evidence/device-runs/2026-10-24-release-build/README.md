# 2026-10-24 — the production profile on the phone: build, journeys, OTA delivery and a real rollback

Handset: OPPO CPH1969 (Android 11), `PV4DDMIZZLTCIVSK`, mirrored with `scrcpy`.
Build: EAS `12829e5d-fb93-4ae4-858d-7f58e962f495`, **profile `production`**, signed with the
project's production keystore (`Build Credentials 84JNqqnITp`, the EAS-managed default).
`versionName 1.0.0`, `versionCode 1`, `minSdk 24`, `targetSdk 36`, runtime version `1.0.0`,
channel `production`, `EXPO_PUBLIC_API_URL` = the production API.
Probe account: `auth.release.1024@example.invalid`, workspace **Release Probe Co**, removed afterwards.

## What this build is — and is not

It is the **production profile**: the release variant, the production keystore, the production
channel and the production EAS environment. Two settings were changed for the rehearsal and restored
afterwards, both recorded in `mobile/eas.json`'s history: `android.buildType` was `apk` (a Play Store
artifact is an AAB and cannot be installed with `adb`) and `autoIncrement` was off (so the version
stayed `1.0.0`, matching the publishes below). **The AAB path itself was not built or uploaded**, so
this run does not prove Play Store packaging or Play App Signing — it proves the release *code path*
and the release *update channel* on a real handset.

The APK installed over the preview build with `adb install -r` and no signature conflict, which also
proves both profiles share one signing key.

## Journeys, driven from the phone

| # | Step | Result | Frame |
|---|---|---|---|
| 1 | Launch after install | Login, no development client, no Metro | — |
| 2 | Create Account (five fields) | accepted; hint *19 characters — within the limit.* | `01-register-filled.png` |
| 3 | Submit | *Verify your email*, inbox named, **8m 49s** countdown | `02-verify-screen.png` |
| 4 | Six digits, **no press of Verify** | confirm → register → exchange → **new tenant dashboard** | `03-new-tenant-dashboard.png` |
| 5 | Production rows | `OWNER`, `ACTIVE`, `emailVerified=true`, business `Release Probe Co (ACTIVE)`, 1 session, 1 audit row | — |
| 6 | Aeroplane mode, force-stop, cold launch | **signed in**; dashboard offline state + *Try again* | `04-offline-cold-start.png` |
| 7 | Network back, 20 s settle, **Try again** | dashboard loaded on the **first** tap | `05-online-retry-recovered.png` |
| 8 | Sign out → Forgot password → Send reset code | code screen, inbox named | `06-reset-code-screen.png` |
| 9 | Six digits, no press | verified (`attempts=1`, `verifiedAt`, authorization minted); password step | `07-new-password-step.png` |
| 10 | New password → **Set new password** | *Password changed*; server `usedAt` stamped | `08-password-changed.png` |
| 11 | Old password | refused: *Invalid email or password* | `09-old-password-refused.png` |
| 12 | New password | signed in to the same tenant; Android offered to save it | `10-new-password-signed-in.png` |

**The earlier "first Try again failed" is explained.** The client's budgets are **15 s** once the
server has answered recently and **60 s** while it has not (`REQUEST_TIMEOUT_MS`,
`COLD_START_TIMEOUT_MS`). The failed attempt was screenshotted **12 s** after the tap, so it was
not a timeout: the request had failed immediately, which is what a radio that has not yet attached
produces. This run waited **20 s** after aeroplane mode was switched off and the first tap worked.
The app behaved correctly in both runs — it showed its error state and kept the session.

## Over-the-air delivery to the release build, then a real rollback

The `production` channel did not exist before the run (manifest request answered **404**). It was
created by the first publish and deleted again at the end.

| Step | Observation |
|---|---|
| Publish marker (`--channel production --environment production`) | group `197d0367…`, manifest `01a16cfb…`, runtime `1.0.0`, message *PRODUCTION OTA MARKER* |
| Two cold launches | the marker is on screen: the Login tagline reads **PRODUCTION OTA MARKER 16:16** (`11-production-ota-marker-applied.png`) |
| `eas update:roll-back-to-embedded --channel production --platform android --runtime-version 1.0.0` | accepted as group `5516d353…`, manifest `01a16cfe…` (it **requires `--runtime-version`** in non-interactive mode; the guide now says so) |
| Two cold launches | the tagline is back to **Multi-tenant inventory for small teams** — the **embedded** bundle, not the marker (`12-rollback-to-embedded.png`) |
| Cleanup | `production` channel and branch deleted; manifest for that channel → **404**; only `preview` remains |

That is the rollback path previously recorded as *not exercised*: the directive reached an installed
release build and moved it off a published update.

## Cleanup

The probe's Firebase identity was deleted and every collection was swept by its `businessId`:
5 audit rows, 2 sessions, the user, the business and its reset challenge were removed; 0 users,
0 businesses and 0 audit rows remain for that address/tenant. The phone was left signed out on the
release build's Login screen. Helper scripts were deleted.

## Limits

- **An APK built from the production profile, not the store AAB.** Play Store packaging, Play App
  Signing and the upload path remain unexercised.
- **No 5xx was induced on the device.** The client rule for a server fault is now pinned by a suite
  case (`auth-offline-boot.test.tsx`: a 500 at boot keeps the session, marks it degraded and does not
  end the Firebase session), but a live injected fault was not performed.
- **No real inbox was read.** Codes came from the stored keyed digests, as in the preview run.
- **iOS unverified** (no macOS on this host).
- The marker and rollback publishes were rehearsal artifacts; both the channel and the branch were
  deleted afterwards, so production currently offers no updates at all.
