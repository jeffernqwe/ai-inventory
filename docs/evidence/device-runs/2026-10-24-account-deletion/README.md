# 2026-10-24 — account deletion: live API regression, then the flow on the phone

Handset: OPPO CPH1969 (Android 11), `PV4DDMIZZLTCIVSK`, mirrored with `scrcpy`.
Build: the production-profile APK from EAS `12829e5d-…` (`versionName 1.0.0`,
`versionCode 1`, channel `production`, runtime `1.0.0`), installed 15:55, updated over the air
during this run — see *The bundle the screen came from* below.
Backend: `https://ai-inventory-l1mi.onrender.com`, commit **`a5a8b10`** (deployed 21:23 local).
Data: throwaway accounts on `example.invalid` (RFC 2606 — an address that can never receive mail),
created through the public API and removed by the flow itself. No real account or business was
touched; every direct database statement was a read filtered by that run's stamp.

## What this run had to prove

1. The server change is **live**, not only committed: both public pages carry the new wording and
   the deletion now closes a business whose only member is leaving.
2. **Both deletion outcomes** hold against production, field by field in `inventoryai_prod_db`:
   sole member → business gone; member leaves → business, owner and history survive.
3. The **screen** exists, says what it is about to do, refuses a mistyped confirmation, and returns
   the person to Login with the credential dead.

## The bundle the screen came from

The installed binary predates the account-deletion feature, so the screen could only be there if an
over-the-air update had delivered it. Two were published to the `production` channel on 2026-10-24:

| | |
|---|---|
| `ce6c6e8f-684c-4497-804d-bdc475de75ee` | "Account deletion (2026-10-24)" — published ~1 h before this run; the Profile screen already listed **Delete account**, so this one had been applied |
| `c7a108b1-03dc-4f76-84f7-6b211e32f6ee` | "Sole-member deletion wording (2026-10-24)" — this run's reordered screen, commit `a5a8b10`, runtime `1.0.0` |

Frame `02-delete-screen.png` is the second one: the banner reads *"…and your business, if you are its
only member"* and **If you are the only member** is the first card — neither sentence existed in the
bundle published an hour earlier, so the frame is proof both of delivery and of which bundle is
running.

**The channel was removed after the run** (branch and channel deleted; the manifest endpoint returns
404 again). Leaving a test update on `production` would let the next store build — same
`appVersion`, therefore same runtime — replace its newer embedded bundle with this one on first
launch.

## Journeys on the device

| Step | Observation | Frame |
|---|---|---|
| Sign in, legacy password account created by the API | Dashboard for the new tenant: 0 in stock / 0 low / 0 out / 0 active / 0 on hand | `00-signed-in-dashboard.png` |
| Dashboard → scroll → **Profile** → scroll | The account screen lists **Sign out**, and below it, quieter, **Delete account** | `01-profile-lists-delete-account.png` |
| **Delete account** | Warning banner, *If you are the only member* first, then what is deleted and what stays, then the two fields | `02-delete-screen.png` |
| Press **Delete my account** with the word blank | *Type DELETE to confirm* appears under the field; **no request is made**; the screen stays | — |
| Type `DELET`, press again | *Type DELETE exactly* under the field; still no request | — |
| Type `DELETE` with the current password, press | The app leaves for **Login**, fields empty | `03-back-at-login.png` |

After the tap, in `inventoryai_prod_db`: the `probe.acc3.device@example.invalid` user row and its
`PROBE-acc3-device` business row are **gone**; `POST /api/auth/login` with the password that worked
minutes earlier answers **401 `INVALID_CREDENTIALS`**. Production counts returned to their
pre-run values (businesses 3, users 3, sessions 8, audit 27, conversations 1, messages 8,
categories 5, locations 5).

## The live API regression — 43 checks, 0 failures

Run twice against production (stamp `acc2`; the first attempt, `acc1`, failed 9 assertions because
it compared a hex id against an `ObjectId` field — a defect in the probe, not the product, and the
same run's product assertions all passed).

**Scenario A — the only member leaves.** Register 201 → business present → sign in as OWNER →
`GET /api/users` total 1 → **wrong password 400 and `GET /api/auth/me` still 200** → mistyped word
400 → **`DELETE /api/auth/me` 200 `{deleted: true, changed: true}`** → business row 0, user rows 0,
audit 0, sessions 0 (by the deleted user's id), assistant conversations 0 → the old token 401 → the
old password 401 → **the same address registers again 201** into a *new* business → that second
account also deletes, its business row gone.

**Scenario B — a member leaves, the business stays.** Register 201 → owner signs in → owner adds a
STAFF 201 → STAFF signs in → **STAFF deletes 200 `{deleted: true, changed: true}`** → the row is a
tombstone: `status DELETED`, name `Deleted user`, address `deleted+<id>@deleted.invalid`, no
`passwordHash`, no `firebaseUid`, `deletedAt` set → **the business is `ACTIVE`** and the owner
untouched → the leaver's sessions are gone while the owner's are not → one `ACCOUNT_DELETED` audit
row with `userId: null` → the owner still pages 1 member, `GET /api/users/:id` for the leaver is
404, the leaver cannot sign in → **with only a tombstone left the owner closes the rest**, and
business, tombstone and trail all go to 0 → no probe user or business is left behind.

Both runs ended with zero probe rows in `inventoryai_prod_db`.

## The public pages, live

`GET /privacy` and `GET /account-deletion` both answer **200 `text/html` without a session**, with
`Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'; style-src 'sha256-…'` — the hash recomputed from the
bytes served. The deletion page states both outcomes: *"If other people still use your business and
you are its only owner, the app will ask you to make another member an owner first … If you are the
business's only member … closing your account closes the business as well"*, and the policy's
retention paragraph says the same. `POST /account-deletion` is still a 404.

## Limits of this evidence

- **Not a Play-signed build**, and nothing is uploaded: Play App Signing, the upload-key handover and
  review remain unexercised.
- **The Firebase re-authentication branch was not driven on the device.** The probe account is a
  legacy password account, so the screen showed the password field and the server checked
  `currentPassword`. The `idToken` branch (a linked account confirming with a forced-refresh Firebase
  token) is covered by `ACCOUNT-DELETION.test.mjs` and the mobile suite, not by this run.
- **A tombstoned member is not a "remaining member" for the last-owner rule.** Scenario B measures
  that: after the STAFF left, the OWNER's own deletion took the whole business, tombstone included.
  A business with a live non-owner member is a different case and is covered by the suite.
- **iOS is unverified** (no macOS on this host).
