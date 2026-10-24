# 2026-10-24 — the preview build, against production: registration, verification, reset, offline start, and update-channel isolation

Handset: OPPO CPH1969 (Android 11), `PV4DDMIZZLTCIVSK`, mirrored with `scrcpy`.
Build: EAS `ea941bb7-95f0-4e8e-88be-4c5af08aa73e` (`preview`, channel `preview`, runtime `1.0.0`),
later running the over-the-air group `6e14b317-2729-465b-9746-449f8b3c272a` published earlier today.
Backend: `https://ai-inventory-l1mi.onrender.com` — no `adb reverse`, no local server.
Probe account: `auth.preview.1024@example.invalid`, workspace **Preview Probe Co**, deleted afterwards.

## Why this run

The previous run proved that an installed preview APK can be updated over the air. It did not
exercise the account journeys **on that build, against the production API** — a different question,
because the preview bundle has no development client, no Metro, and its own compiled API URL. The
owner also asked two narrower things: does a launch without a network keep the session, and can a
preview install ever receive a production-channel update.

## What was driven, in order

| # | Step | Result | Frame |
|---|---|---|---|
| 1 | Login → **Create an account**, all five fields filled on the phone | Form accepted; password hint read *19 characters — within the limit.* | `01-register-filled.png` |
| 2 | **Create Account** | *Verify your email* appeared; the code was sent to the probe address, the countdown started at **8m 29s**, and the screen named the inbox | `02-verify-screen.png` |
| 3 | Six digits typed, **no press of Verify** (auto-verify) | Confirm → register → exchange all succeeded; the **new tenant's dashboard** opened as *Preview Probe · Owner* | `03-new-tenant-dashboard.png` |
| 4 | Airplane mode on, force-stop, cold launch | **Signed in.** The app shell reads *Preview Probe · Owner* and the dashboard shows *Couldn't load the dashboard — Cannot reach the server*, with **Try again** — not Login | `04-offline-cold-start-signed-in.png` |
| 5 | Airplane mode off, **Try again** | First tap (12 s after the radio returned) still failed; a second tap 20 s later loaded the dashboard with the tenant's figures (all zero) | `05-online-retry-recovered.png` |
| 6 | Sign out → **Forgot password?** → address → **Send reset code** | *Enter your reset code*, inbox named, countdown **9m 50s**, resend disabled for **50 s** | `06-reset-code-screen.png` |
| 7 | Six reset digits typed, no press | Code verified (server: `attempts=1`, `verifiedAt` stamped, reset authorization minted); *Set a new password* opened, naming the address | `07-new-password-step.png` |
| 8 | New password typed in both fields | Hint read *18 characters — within the limit.*; **Set new password** → *Password changed* (server: `usedAt` stamped) | `08-password-changed.png` |
| 9 | Sign in with the **old** password | Refused: *Invalid email or password* | `09-old-password-refused.png` |
| 10 | Sign in with the **new** password | Signed in to the same tenant; the platform offered *Save password to Google?* (the `newPassword`/`newPassword` autocomplete declarations working) | `10-new-password-signed-in.png` |
| 11 | Sign out | Back at Login, no leftover session | `11-signed-out-clean.png` |

**How the codes were obtained.** The probe address has no inbox, so no mail was read. The codes were
recovered from the **stored keyed digest** in the production database using the server's own domain
labels and pepper: `709760` (verification) and `400309` (reset). The script that did it was a
throwaway and is not committed; it printed only a boolean and the recovered digits. This is a
testing convenience, not a product path — the digest is what makes the code unrecoverable to anyone
without the pepper.

**Database confirmation (production, `inventoryai_prod_db`).** After step 3: `role=OWNER`,
`status=ACTIVE`, `emailVerified=true`, `firebaseUid` present, business `Preview Probe Co (ACTIVE)`,
one session, verification challenge `attempts=1 usedAt` stamped. After step 8: the reset challenge's
`usedAt` stamped and **four `audit_logs` rows** written for the new business (the reset's own audit
row among them).

## Update-channel isolation

The question: **can a preview install receive a production update, or the reverse?** Measured on the
service and on the device.

| Measurement | Result |
|---|---|
| `eas channel:list` | **one** channel, `preview`, pointing at branch `preview`; groups `9e3936aa…` and `6e14b317…` |
| Manifest request, runtime `1.0.0`, `expo-channel-name: production` (before the test) | **HTTP 404** — *There is no channel named production for the app…* |
| Same request for `development` | **HTTP 404** |
| Published a probe to the production channel (`eas update --channel production --environment production`) | group `d165e4cb…`, manifest `01a16cb2…` |
| Published a **visible marker** to the production channel | group `3c777c22…`, manifest `01a16cb5…` — **newer** than preview's `01a16c95…`; the Login tagline was temporarily replaced with *PRODUCTION CHANNEL PROBE 14:59* |
| Manifest, channel `preview` | `200`, `01a16c95…` — unchanged by either production publish |
| Manifest, channel `production` | `200`, `01a16cb5…` (same runtime version `1.0.0`) |
| Device: two cold launches while `01a16cb5…` was live | Login tagline remained **Multi-tenant inventory for small teams** (`12-isolation-preview-tagline-after-production-marker.png`), and `adb logcat` contained **0** occurrences of `01a16cb5` |
| Cleanup | production channel and branch deleted; manifest for `production` → **404** again; only `preview` remains |

The device is on `preview` because it received `01a16c95…`, a manifest the service returns **only**
for `expo-channel-name: preview` — and because a newer production manifest, with the same runtime
version, changed nothing on it across two launches.

### A defect found while setting that test up

The EAS **production environment** contained no `EXPO_PUBLIC_API_URL` (the preview environment did).
`mobile/lib/config.ts` falls back to `http://localhost:4000` when the variable is absent, so a
production update published with `--environment production` would have built a bundle that could
not reach any server. The variable was added to that environment
(`eas env:set … EXPO_PUBLIC_API_URL=https://ai-inventory-l1mi.onrender.com`). After the change, the
production publish produced the **same asset key** (`mX841Vs3…`) as the preview publish, whose bytes
had already been grepped to contain `ai-inventory-l1mi.onrender.com` once and `localhost:4000` zero
times — so the production bundle now carries the production URL.

## Limits of this evidence

- **A preview build, not a store-signed production build.** It proves the production API, the
  production data path and the update channel; it does not prove a Play Store artifact.
- **No real inbox was read in this run.** Codes came from the stored digests. Brevo delivery to a
  real inbox was measured on 2026-10-22 (recorded in the roadmap's AUTH-06 two-step entry) and is
  unchanged by this run.
- **The first *Try again* failed** (12 s after aeroplane mode was turned off) and the second worked.
  That is recorded as observed; it is consistent with the radio still settling, and no further cause
  was established.
- **No 5xx was induced.** Error handling was exercised by an unreachable network, not by a failing
  server.
- **iOS unverified** (no macOS on this host), and the production *(store-signed)* profile has never
  been built or installed.
