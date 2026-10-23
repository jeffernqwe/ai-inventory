# Device run — the success half of auto-verify (2026-10-24)

A real handset, the local server, and the app's `development` build. This closes the one thing the
run recorded in `../2026-10-23-auth-polish/README.md` could not: **a correct six-digit code opening
the password step with no press**. The gap was never the code — it was that a probe address has no
inbox, so the previous run could only type a *wrong* code.

- **Device:** OPPO CPH1969 (`PV4DDMIZZLTCIVSK`), Android, app `com.inventoryai.app`.
- **Server:** local `node src/index.ts` on port 4000, development database, Brevo and Firebase on;
  reached from the phone through `adb reverse tcp:4000 tcp:4000`.
- **Bundle:** the installed `development` build loading the current JS from Metro over
  `adb reverse tcp:8081 tcp:8081`.
- **Account:** a disposable Firebase identity (`auth.probe.…@example.com`), created unverified for
  this run and deleted afterwards.
- **How the mailed code was known without an inbox:** the request was made by the app's own
  **Forgot password** screen, so the real route minted the code and stored only its keyed digest.
  The plaintext was then recovered over the full 10⁶ space with the server's own `hashResetCode` and
  the server's own pepper (a throwaway script, deleted after the run). What was typed on the phone
  was therefore **the digits that were mailed** — not a separately minted value — which is what
  makes the observation mean anything.

## What was observed

| Observation | Evidence |
|---|---|
| Typing the correct six digits produced the password step **without pressing Verify code**: *Set a new password — Your code was verified for auth.probe.…@example.com. Choose the password you will sign in with.* | `reset-password-step-opened-by-a-correct-code.png` (12:43; the same screen was reached the same way at 12:32) |
| The reset screen names the inbox and counts the code's real lifetime from its send instant — *Code expires in 6m 27s*, then *5m 6s* | `reset-code-countdown-names-the-inbox.png` (12:51, 12:52) |
| The password step states the server's one policy while it is typed — 28 characters → *28 characters — within the limit.* — rather than a static minimum | `reset-password-rule-and-confirm-error.png` (12:34) |
| Pressing **Set new password** with the confirmation empty puts *Confirm password is required* **under that field** and does not submit | same frame (12:34–12:39) |
| The credential the reset authorized signs in **on the phone**: the probe address with the new 14-character password | `login-with-the-password-the-reset-installed.png` (1:10) |
| …and lands on the tenant's dashboard, which renders its own counts | `dashboard-after-the-reset-on-the-phone.png` (1:10) |

The code itself was verified and spent through the real routes (`/api/auth/password-reset/verify`
→ a reset authorization, `/api/auth/password-reset/confirm`), which is what "the credential the reset
authorized" means here: the sign-in on the phone is with the password that flow installed, and the
verification token in it was minted by that sign-in.

## What this run does **not** prove

- **The password step's own button was not carried to *Password changed* on the device.** The frames
  stop at the filled form and its validation; the confirmation was then applied through the route
  pair above. So this run proves the **code opens the step** (the thing §27EO left open), not that
  the button writes the credential — that was device-measured on 2026-10-22 (roadmap §27EI) and is
  covered by `AUTH06-password-reset-flow.test.mjs` and `password-reset-code.test.tsx`.
- **The verify-email screen's identical auto-verify was still not reached.** It needs an unverified
  identity carried through Create Account's verification screen; this run's identity went through the
  reset journey instead. That path remains suite-backed (`phase16-verify-email-screen.test.tsx`).
- **The request count was not re-counted.** The server was started for this run without writing its
  stdout to a file, so the "exactly one request per completed code" measurement is still the one in
  `../2026-10-23-auth-polish/README.md`, taken from a log.
- **iOS:** no macOS on this host.

## Cleanup

The probe tenant and identity were removed Mongo-first and then at Firebase, and the re-count is the
proof: **0** users for the address, **0** businesses by id or name, **0** sessions, **0** audit rows,
**0** verification challenges. Nothing from this run remains in the development database.

## Two harness notes, recorded because they cost time

1. `adb shell input text` types into **whatever has focus** — not into the app. Twice the text landed
   in the launcher's search field because the app was not in front, including one password. Bring the
   app forward and confirm with a screenshot before typing a credential.
2. The `development` build lost its Metro connection mid-run (`java.net.ConnectException … localhost
   :8081` on the dev-launcher screen, 12:59–1:01) and had to be reloaded; the tunnel
   (`adb reverse --list`) was up the whole time. A build that cannot reach Metro is not an app
   failure, and the run continued after the reload.
