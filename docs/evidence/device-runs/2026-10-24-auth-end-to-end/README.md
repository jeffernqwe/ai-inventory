# Device run — the two journeys end to end (2026-10-24)

One handset, one local server, one `development` build, two complete journeys: a brand-new account
created and verified from the Create Account screen, and the password of that account reset from the
Forgot password screen **through the app's own Set new password button**. This is the run the
earlier evidence files left owed: `../2026-10-23-auth-polish/README.md` could not reach either
success half, and `../2026-10-24-auth-auto-verify/README.md` reached the reset's password step but
finished the write outside the app.

- **Device:** OPPO CPH1969 (`PV4DDMIZZLTCIVSK`), Android 11, app `com.inventoryai.app`, mirrored
  live with `scrcpy` over USB.
- **Server:** local `node src/index.ts` on port 4000 with its stdout in a log file (so every
  request below is quoted from that log, not inferred), development database, Brevo and Firebase on,
  reached from the phone through `adb reverse tcp:4000` + `tcp:8081`.
- **Account:** `auth.run.241024@example.com`, created for this run, deleted afterwards.
- **The codes were not minted by a script.** The app made both requests, so the real routes minted
  the codes and mailed them. A probe address has no inbox, so the digits were recovered from the
  stored keyed digests with the server's own hashing functions and its own pepper — what was typed
  on the phone is therefore the value that was sent. The only script involved read a digest.

## Journey 1 — Create Account → verify → a new tenant

| What the phone did | Server log (UTC) |
|---|---|
| Create Account filled from the form: business name, name, address, password and confirmation; the live rule said *15 characters — within the limit.* — `01-create-account-filled.png` | — |
| **Create Account** tapped. It created the Firebase identity, asked for the verification code and moved to *Verify your email*, naming the inbox and counting *Code expires in 9m 37s* | `17:37:50` `POST /api/auth/email-verification/request` **200** |
| The six mailed digits typed into the boxes; **Verify was not pressed.** `02-mailed-code-typed-no-press.png` catches the screen at the moment the automatic request left | `17:44:52` `POST /api/auth/email-verification/confirm` **200**, then `17:44:53` `POST /api/auth/firebase/register` **201**, then `17:44:54` `POST /api/auth/firebase/exchange` **200** |
| The new tenant's dashboard, Owner, over the counters the server returned — `03-registered-tenant-dashboard.png` | — |

So the verification success path is measured on hardware end to end: **six digits, no press, and
the app registered the tenant and opened a session by itself.** The `register` call is the proof the
business name typed on the Create Account screen survived the verification step — the registration
ordering gate this project documents.

## Journey 2 — forgot password → code → the app writes the credential

Signed out from the dashboard's own **Sign out** (confirm dialog), then:

| What the phone did | Server log (UTC) |
|---|---|
| **Forgot password?** → the address → **Send reset code**; the reset screen named the inbox and counted *Code expires in 9m 57s* — `04-reset-code-screen.png` | `17:50:29` `POST /api/auth/password-reset/code` **202** |
| The six mailed digits typed; **Verify code was not pressed**; *Set a new password — Your code was verified for auth.run.241024@example.com* — `05-password-step-opened-by-the-code.png` | `17:55:01` `POST /api/auth/password-reset/verify` **200** |
| Both fields filled, the rule reading *13 characters — within the limit.* — `06-password-step-filled.png` | — |
| **Set new password** tapped; the button shows its own spinner — `07-set-new-password-in-flight.png` | `17:57:36` `POST /api/auth/password-reset/confirm` **200** |
| *Password changed — Sign in with your new password. Password changed. Please sign in again.* — `08-password-changed.png` | — |
| **Go to sign in**, then the **old** password: the app answered *Invalid email or password* — `09-old-password-refused.png` | (Firebase refuses; no Inventory AI session is minted) |
| The **new** password: the dashboard of the same tenant — `10-dashboard-after-the-reset.png` | `18:00:34` `POST /api/auth/firebase/exchange` **200** |

Nothing was written by hand: the `confirm` above is the app's own request from the button, and the
session that followed is an exchange of a Firebase sign-in with the new password. **"Password
changed" was reached on the device by pressing the button**, which is exactly what the previous
evidence file recorded as not yet proven.

## What this run does **not** prove

- **A pre-reset session being revoked.** This account was signed out before the reset, so there was
  no session for the reset to invalidate on the device. That behaviour is device-measured on an
  earlier account (2026-10-22, roadmap §27EI) and covered by `AUTH06-password-reset-flow.test.mjs`.
- **Mail delivery into an inbox.** The codes were recovered from the digests, so this proves what
  the routes issued and what the app did with it, not that Brevo placed the message.
- **A production build.** Every frame is the `development` build against the local server.
- **iOS:** no macOS on this host.

## Cleanup

The probe tenant, its sessions and its reset challenge were removed Mongo-first, then the Firebase
identity, and the re-count is the record: **0** users, **0** businesses, **0** audit rows, **0**
sessions, **0** reset challenges for that address.

## Three harness notes, recorded because each one cost time

1. **A failed `uiautomator dump` leaves the PREVIOUS file in place.** Both six-digit screens re-render
   every second for their countdown, and `uiautomator dump` then fails with `could not get idle
   state` — so reading the dump file describes the screen *before* the one on the display.   It reported the Create Account form while the phone was showing *Verify your email*. The fix the
   driver for this run used is to delete the remote file before every dump, so a failure becomes "no
   file" rather than "old screen"; the guide carries the same rule in §7e.
2. **Typing goes to whatever holds focus — not to what looks like the field.** A tap that misses the
   code row leaves the previous screen's field focused, so `adb shell input text` types a password
   into an invisible input on the screen underneath. Both code rows were tapped by coordinates
   measured from the current frame, and the digits were confirmed on screen before waiting.
3. **The two code rows do not sit at the same height.** The reset screen's card carries a longer
   description, so the boxes are ~130 px higher than the verify screen's. A shared coordinate is a
   tap that opens the keyboard and types nowhere.
