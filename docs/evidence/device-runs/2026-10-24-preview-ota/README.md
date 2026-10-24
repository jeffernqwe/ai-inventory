# 2026-10-24 — preview APK on the production API, then an over-the-air update

Handset: OPPO CPH1969 (Android 11), `PV4DDMIZZLTCIVSK`, mirrored with `scrcpy`.
Build: EAS `ea941bb7-95f0-4e8e-88be-4c5af08aa73e`, profile `preview`, channel `preview`,
runtime version `1.0.0`, installed with `adb install -r` over the previous preview APK.
Backend: `https://ai-inventory-l1mi.onrender.com` (baked into the build; no `adb reverse` in use).
Data: the reserved demo tenant (`demo-preview@example.invalid`), seeded into
`inventoryai_prod_db` for the run with `seed:demo-tenant` and removed afterwards with
`cleanup:demo-tenant` (0 leftovers; the Firebase identity is left in place by that script's design).

## What this run had to prove

1. A preview build reaches the **production** API over HTTPS with no tunnel.
2. A **JavaScript-only change** can be delivered to that installed APK without rebuilding or
   reinstalling it.
3. The delivered change does what it was published to do.
4. The published bundle was built with the **preview environment's** variables, not the laptop's
   `localhost`.

## The published update

| | |
|---|---|
| Command | `npx eas-cli update --channel preview --environment preview --platform android --message "Keep the signed-in session when a launch cannot reach the server"` |
| Update group | `9e3936aa-b502-4b41-8e8d-b71a80ffe752` |
| Republished as | `6e14b317-2729-465b-9746-449f8b3c272a` (the group the device actually downloaded) |
| Runtime version | `1.0.0` (matches the build) |
| Content | the offline-boot session fix in `mobile/lib/auth.tsx` |

**`--platform android` was required.** The first attempt omitted it, and the export failed while
building the **web** bundle (`expo-router` → `react-native-web`); the project does not ship web, so
publishing is Android-only by design.

**The update carries the right API URL, measured, not assumed.** The exported bundle was grepped
before upload: `ai-inventory-l1mi.onrender.com` appears once, `localhost:4000` appears **zero**
times, and the new key `inventoryai.auth.userSnapshot` is present — so the bundle both targets
production and contains the fix.

## Observed, in order

| Step | Observation | Frame |
|---|---|---|
| Launch after install | Login screen; no dev launcher, so this is the preview build | `01-login-production.png` |
| Sign in (`demo-preview@example.invalid`) | Dashboard against production: **3 in stock / 3 low / 1 out / 6 active / 112 on hand**, matching the seeder's fixture | `02-dashboard-signed-in.png` |
| Publish the update | `eas update` reports group `9e3936aa…`, runtime `1.0.0`, platform android | — |
| Relaunch ×5 over ~20 min | `CheckCompleteUnavailable` / "No update available" every time. The manifest endpoint answered correctly for `curl` with the same headers, so the device was not being served the update | `05-expo-updates-log.txt` |
| `eas update:republish` the same group | Next launch: `DownloadCompleteWithUpdate`, `isUpdateAvailable=true, isUpdatePending=true`, manifest `01a16c95-…` | `05-expo-updates-log.txt` |
| Relaunch | Dashboard again (online) | — |
| **Airplane mode on, force-stop, cold launch** | The **signed-in app shell** — *INVENTORY AI · Demo Tester · Owner* — with the dashboard's own offline state: *Couldn't load the dashboard — Cannot reach the server. Check your connection and try again.* + **Try again**. Before the update, the same scenario landed on Login | `03-offline-launch-still-signed-in.png` |
| Airplane mode off, **Try again** | Dashboard returns with the same production figures (3 / 3 / 1 / 6 / 112) | `04-online-retry-recovered.png` |

The offline frame is the proof of delivery **and** of behaviour at once: only the newly published
JavaScript contains the stored-profile restore, so an offline cold start that keeps the session
cannot be the embedded bundle.

## Limits of this evidence

- **It is a preview build, not a store-signed production build.** It proves the update mechanism
  and the production API path; it does not prove a Play Store build.
- **Why the first publish was not served is not established.** The device was refused for at least
  19 minutes (14:06 publish → 14:14 and 14:25 checks), while the same manifest was returned to
  `curl` throughout. A republish at 14:24 was picked up on the first launch afterwards. This is
  recorded as an observation with a workaround, not as an explained cause.
- **iOS is unverified** (no macOS on this host), and the production build profile has not been
  built or installed.
- The screen is not signed out, but the **role shown comes from the stored profile** until the next
  successful `me` — that is the designed trade-off, and the server still authorizes every request.
