# Google Sign-In, registration and account deletion (OPPO CPH1969, 2026-10-24)

The run §27EX listed as **not verified**: the Firebase branch of account deletion had only ever been
driven with an identity created through the **Admin SDK** and onboarded through the app. This run used
the **real Google button** and a **real Google account**, so the extra steps that only a provider
sign-in has — the Play Services account sheet, the Google ID token, the Firebase credential exchange —
were all exercised.

- Device: OPPO CPH1969 (`PV4DDMIZZLTCIVSK`), Android, `com.inventoryai.app` `versionName 1.0.0`,
  `versionCode 1`, `targetSdk 36` — the **installed preview/profile APK with embedded JavaScript**,
  no Metro and no `adb reverse`, talking to `https://ai-inventory-l1mi.onrender.com`.
- Google account: `broccolifreebuff05179@gmail.com` (disposable — "broccoli" in the chooser).
- Times below are the **phone's** clock; the laptop was 12 hours ahead (22:27 = 10:27).

## What happened, in order

| Phone time | Frame | Observation |
| --- | --- | --- |
| 10:27 | `01-google-tap-no-chooser-spinner.png` | First tap of **Continue with Google**: the button shows its spinner and the Play Services sheet **never appears**. `signIn()` resolved the Google account this app had used before, silently. |
| 10:41 | `02-google-account-chooser.png` | A later tap **did** show `Choose an account — to continue to Inventory AI`, listing seven accounts including **broccoli**. |
| 10:42 | `03-registration-required-new-identity.png` | Choosing **broccoli** (an identity Firebase had just created for it) answered the info banner *"This sign-in is not linked to an Inventory AI account yet. Create a business account to continue."* — `403 REGISTRATION_REQUIRED`. |
| — | — | **Create a business account** was then completed through the app's own onboarding, producing the tenant `PROBE-google-broccoli` and an `OWNER`/`ACTIVE` user with a `firebaseUid` and **no `passwordHash`**. |
| 10:45 | `04-delete-screen-firebase-branch.png` | The Delete account screen for that user: *"We will confirm this with your sign-in. You do not need to type your password."* — **no password field** — plus *Type DELETE to confirm* and the *What stays, if others still use your business* paragraph. |
| 10:46 | `05-back-at-login-after-deletion.png` | `DELETE` + **Delete my account** → the app returned to **Login**, session cleared. |
| 10:54–10:56 | `06-deleted-identity-cannot-return.png` | Signed in again with **the same Google account**: the chooser appeared, **broccoli** was chosen, and the app answered the same `REGISTRATION_REQUIRED` banner — **no tenant, no dashboard, no session**. |
| 10:57 | `07-boot-probe-unreachable.png` | After the re-created identity was deleted server-side, a cold start showed the AUTH-04-F *Could not reach the verification service* state. |
| 10:59 | `08-try-again-lands-on-login.png` | **Try again** landed on **Login** — the state is recoverable and mints no session by itself. |

## Checked afterwards, against production

- **MongoDB** (`inventoryai_prod_db`): the user row for that address and the `PROBE-google-broccoli`
  business row are **gone**; **0** `PROBE-` businesses remain; the other three tenants
  (`royal kludge`, `inplay`, `rakk gears`) are untouched at **3 businesses / 3 users**.
- **No dangling references**: 33 audit rows and 1 conversation / 8 messages — **0** point at a
  missing business or conversation; no `DELETE`-shaped audit row survives, as designed for the
  sole-member branch (§27EX item 3).
- **Sessions**: 11 rows, every one belonging to a live user and every one `revokedAt`-stamped —
  **0 orphans**.
- **Firebase**: `getUserByEmail('broccolifreebuff05179@gmail.com')` → **`auth/user-not-found`** after
  the deletion, i.e. the identity is gone from the provider too, not merely unlinked.
- **Cleanup**: the identity that the post-deletion sign-in re-created
  (`fKinxuUtvpYykfVsRpKLguUMuIS2`, provider `google.com`) was deleted with the Admin SDK →
  **`auth/user-not-found`** again, Mongo still **3 / 3**, and no row exists for that address.

## The defect this run found, and the fix

The first tap resolving a saved Google account **without any chooser** is not cosmetic:

- a person with two Google accounts on one handset cannot reach the second one at all, and
- on a shared device, the next person tapping *Continue with Google* is signed into the **previous
  person's** Google identity — and therefore into their Inventory AI tenant. This run demonstrated it:
  the first tap went straight into an existing member's dashboard without a sheet.

`mobile/lib/firebase-native.ts` now clears this app's saved Google credential
(`GoogleSignin.signOut()`) **before** asking, and **ignores a failure to do so** — "nothing saved" is
the ordinary first-run case, not a reason to refuse a sign-in. It touches only Play Services' last
account for this client: it does not sign the person out of Google, and it does not touch the Firebase
session, which this boundary does not own. A new case in
`mobile/__tests__/phaseC-native-google.test.ts` pins the order
(★ *clears the saved Google account before asking, so the sheet can offer another one*), and a second
one pins that a clean state still signs in.

**This fix is JavaScript only** — no native module, permission, config or dependency changed — so it
can be delivered over the air on a channel the installed build listens to, or included in the next
build. It was **not** on the APK used for this run (which is why the first tap behaved as it did), and
it has not been re-measured on hardware.

## Not verified

- The chooser fix **on the device** (source + suite only; the APK predates it).
- A store-installed build from Play, Play App Signing, and Play's review.
- iOS (no macOS host).
