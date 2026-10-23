# Device run — auth screen polish (2026-10-23)

A real handset, the local server, and the app's `development` build. This is the evidence for the
two auth passes recorded in roadmap **§27EN** (screen continuity) and **§27EO** (live password
rule, six-digit auto-verify, one copy of the shared helpers).

- **Device:** OPPO CPH1969 (`PV4DDMIZZLTCIVSK`), Android, app `com.inventoryai.app`.
- **Server:** local `node src/index.ts` on port 4000, development database, Brevo and Firebase on;
  reached from the phone through `adb reverse tcp:4000 tcp:4000`.
- **Bundle:** the installed `development` build loading the current JS.
- **Mirroring:** `scrcpy --stay-awake`, so the run was watched live rather than reconstructed.

## What was observed

| Observation | Evidence |
|---|---|
| Create Account states the password rule and counts toward it: empty → *Between 8 and 72 characters.*; three characters → *3 of 8 characters — 5 more to go.*; twelve → *12 characters — within the limit.* | accessibility tree, live |
| The reset screen names the inbox (`device.verify@example.invalid`) and counts the code's lifetime down — *Code expires in 8m 48s* — from the send instant rather than restating "10 minutes" | `reset-code-countdown-and-inbox.png` |
| Typing six digits produced **exactly one** `POST /api/auth/password-reset/verify` (`400`) with **no press of Verify code**, and the server's refusal rendered as the banner | `reset-code-auto-verify-refusal.png`; server access log, 16:07:22 |
| Login's **Continue with saved account** (from §27EN) resumed the verified identity and opened the demo tenant's dashboard with one tap | live, before the sign-out below |
| After signing out, the resume control was gone — the offer does not outlive the identity | live, accessibility tree |

`grep -c "password-reset/verify"` over the server log for the session returned **1**, which is what
the single-flight guard and the press-cancels-the-wait rule are for: the automatic request and a
press cannot both spend an attempt.

## What this run does **not** prove

- The **success** half of auto-verify — a correct code opening the password step — was not driven,
  because it needs a live reset code and the probe address has no inbox. That path is covered by
  `password-reset-code.test.tsx` and `AUTH06-password-reset-flow.test.mjs`; the device proves the
  request fires on its own and its refusal is rendered.
- The **verify-email** screen's identical auto-verify was not reached (it needs an unverified
  Firebase identity), and is covered by `phase16-verify-email-screen.test.tsx`.
- **iOS**: no macOS on this host.

## A harness note, recorded because it cost time

`adb shell uiautomator dump` returned the **previous** screen's tree twice while the app had already
navigated (once after the reset-code screen opened, once after the refusal). The screenshots and the
server's access log were the reliable record; a future run should treat a dump that contradicts a
screenshot as stale rather than as a failed navigation.
