# 8. Preparing the Google Play submission

This is the **paperwork** that goes around the artifact
([7. Updating the app](7-over-the-air-updates.md) covers the build and the updates). It is written
from what is actually inside the store bundle, not from intent, and it separates three things
carefully:

- what the bundle **is** (measured),
- what the Play Console form **should say** (a recommendation to review),
- what is **missing** and blocks a submission.

**Nothing has been uploaded.** There is no Play Console access in this repository, and uploading is
the owner's action.

**The current blocker is the artifact, not the paperwork.** Both AABs that exist (versionCode 2 and
the permission-trimmed versionCode 3) were built **before 2026-10-24 20:56**, when the in-app
account-deletion screen landed — their embedded JavaScript contains **none** of its copy, so an
upload of either would answer Play's account-deletion requirement with a build in which the feature
does not exist. §1.1 is the check that proves it and must be run on every future artifact. A new
build is not possible before the Free plan's Android build quota resets (2026-11-01).

---

## 1. The artifact these answers describe

| | |
|---|---|
| File | AAB, profile `production`, EAS `4b133d62…` (newest; supersedes the `09d77d3d…` rehearsal AAB, `versionCode 2`) |
| Package | `com.inventoryai.app` |
| Version | `versionName 1.0.0`, `versionCode 3` |
| SDK levels | `minSdk 24`, `targetSdk 36`, `compileSdk 37` |
| Signature | production keystore (EAS credentials) |
| Permissions | 11 declared — see §5 |
| Ads / analytics / billing SDKs | none in `package.json` |
| Update channel | `production`, runtime `1.0.0` |
| Embedded JavaScript | **predates account deletion** — see §1.1. Not uploadable |
| Next build | **`versionCode` ≥ 4** — a refused `production` build still incremented the remote counter from 3 to 4 |

`targetSdk 36` matters: from **31 August 2026** new apps and updates must target Android 16 (API 36)
or higher, so this build meets the current requirement rather than needing an exception
([Play's target API rule](https://support.google.com/googleplay/android-developer/answer/11926878)).

### 1.1 The pre-upload gate: is this the app we think we built?

Every other check in the artifact record looks at **packaging** — package id, version, SDK levels,
signature, channel, permissions. All of them passed on both AABs, and both were still the wrong
artifact: their JavaScript was from a commit that had no account-deletion screen. A store build is
only as good as the bundle inside it, and the bundle is the one thing a manifest does not describe.

```bash
cd mobile
npm run check:aab -- /path/to/inventory-ai.aab     # 0 verified · 1 wrong · 2 not verified
```

It reads `base/assets/index.android.bundle` out of the AAB (a ZIP inside the ZIP, Hermes bytecode,
string literals intact) and requires four **user-visible** sentences from features that must be in any
store build: `Delete my account` and `Type DELETE to confirm` (Play's deletion requirement), 
`Continue with Google` (the provider entry point) and `Create your workspace` (the onboarding a new
identity needs). Hermes keeps these verbatim, which is what makes the question cheap; it is a parity
check against a known list, not a source-map or commit check, and editing that copy means updating the
list. Its own controls include a negative case, and one that fails if a probe is no longer copy in
`app/`/`components/`, so a reworded sentence cannot silently disarm it
(`mobile/__tests__/release-aab-parity-guard.test.ts` runs them).

**Measured on the two artifacts that exist (2026-10-24):**

| Artifact | `versionCode` | Bundle bytes | Deletion copy | Verdict |
|---|---|---|---|---|
| `09d77d3d…` (rehearsal AAB) | 2 | 2,847,364 | **0 occurrences** | WRONG (exit 1) |
| `4b133d62…` (permission-trimmed) | 3 | 2,847,364 | **0 occurrences** | WRONG (exit 1) |

Their bundles are byte-for-byte the same length because the permission trim changed the **manifest**,
not the JavaScript — which is exactly why a manifest-level review could not have noticed. Both were
built before the deletion screen existed. Evidence and raw output:
[`2026-10-24-release-aab`](../evidence/device-runs/2026-10-24-release-aab/README.md).

---

## 2. Store listing

| Field | Value |
|---|---|
| App name (30 max) | `Inventory AI` |
| Short description (80 max) | `Track stock, scan barcodes and ask an AI assistant about your inventory.` (77) |
| Category | Business |
| Contact email | the owner's Play account email |
| Privacy policy URL | `https://ai-inventory-l1mi.onrender.com/privacy` — **live and measured**; see §6.1 |
| Account deletion URL | `https://ai-inventory-l1mi.onrender.com/account-deletion` — **live and measured**; see §6.2 |

**Full description (draft, 4,000 max).** Adjust the tone, keep the facts:

> Inventory AI keeps a small business's stock accurate without a spreadsheet.
>
> Record stock in and out, transfer quantities between locations, and see what is running low before
> it runs out. Scan a product barcode to find it instantly, and print a shelf label with its barcode
> as a PDF you can share.
>
> Products, categories, locations, suppliers and purchase orders live in one place, and every
> movement writes a transaction, so the history of a product can be read back rather than guessed.
> An audit trail records who changed what.
>
> The built-in assistant answers questions about your own inventory — what to reorder, what a
> product's stock is at each location, how much stock is tied up — and it is read-only: it can look,
> summarise and explain, and it cannot change your data.
>
> Roles decide what each person can do: an owner or admin manages users and settings, managers run
> stock movements, staff can look things up. Each business sees only its own data.

**Graphics** (Play's requirements):

| Asset | Status |
|---|---|
| App icon 512×512 | available — `mobile/assets/icon.png` is 1024×1024, downscale |
| Feature graphic 1024×500 | **MISSING** |
| Phone screenshots, at least 2 | usable candidates exist (1080×2340) in `docs/evidence/device-runs/2026-10-24-release-build/`, but they show the **auth flows**; capture clean Dashboard / Inventory / Product / Assistant screens before using them as store art |

---

## 3. App content declarations

| Section | Answer |
|---|---|
| **Privacy policy** | `https://ai-inventory-l1mi.onrender.com/privacy` — live; must stay consistent with what §4 says is collected |
| **Account deletion** | in-app **Profile → Delete account**, and `<server>/account-deletion` for the Data safety form |
| **App access** | All functionality requires sign-in → provide a **review account** and instructions (§7) |
| **Ads** | No |
| **Content rating** | Questionnaire: no violence, sexuality, gambling, drugs, profanity, or user-to-user communication. Expect "Everyone" / PEGI 3 |
| **Target audience** | 18+ (a business tool); not designed for children |
| **News app** | No |
| **Health / financial features / government app** | No |
| **Data safety** | §4 — needs an owner decision, not a guess |
| **Advertising ID** | Not used, and no `AD_ID` permission is declared |

---

## 4. Data safety — what the app actually handles

Read from the code paths, not the marketing copy:

| Data | Collected? | Where it goes | Purpose |
|---|---|---|---|
| Name, email address | yes, at account creation | MongoDB (our server) + Firebase Authentication (Google) | account, sign-in, verification and reset mail |
| Password | never seen by the app's own code | Firebase Authentication only | sign-in |
| Inventory records: products, stock, locations, suppliers, purchase orders, transactions | yes | our MongoDB | the product's core function |
| AI assistant questions and answers | yes | our MongoDB + **OpenRouter** (the AI provider) — the question and the inventory data the assistant reads | answering the question |
| Audit trail entries (who did what) | yes | our MongoDB, visible to owner/admin | governance |
| Device/installation identifiers | via Firebase/Google Play services | Google | sign-in |
| Crash logs, analytics, advertising data | **no** — no such SDK is installed | — | — |

**Recommended conservative answers** (confirm each line in the console before submitting):

- **Collected:** personal info → name, email; app activity → "other user-generated content"
  (inventory records and assistant messages).
- **Shared:** with service providers for app functionality — Google (Firebase, authentication),
  Brevo (transactional email delivery), OpenRouter (the assistant's question and the inventory data
  it reads). The privacy policy must name them.
- **Encrypted in transit:** yes (HTTPS only; the app refuses cleartext in release).
- **Data deletion:** in-app flow and public page both implemented — see §6.2.

---

## 5. Permissions the reviewer will see

| Permission | Why it is there | What to say if asked |
|---|---|---|
| `CAMERA` | `app/(app)/scan.tsx` scans barcodes with `CameraView` | used only while the scan screen is open, to read a barcode; no photos are stored or uploaded |
| `READ/WRITE_EXTERNAL_STORAGE` | inherited from Expo's template + `expo-file-system`, **capped at API 32** | not requested on Android 13+; only affects old devices |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `VIBRATE` | normal-level, install-time | no prompt, no user-visible effect |
| `USE_BIOMETRIC` / `USE_FINGERPRINT` | `androidx.biometric`, a dependency of the secure token store | not used to gate anything in V1 |
| `DUMP` | `androidx.profileinstaller` | signature-level; never granted to the app by a user |
| `…READ_GSERVICES` | Google Play services | install-time |
| `com.inventoryai.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | the app's own signature permission | internal |

**No** location, SMS, call log, contacts, microphone, `MANAGE_EXTERNAL_STORAGE` or "all files access"
permission is declared. The only dangerous permission is `CAMERA`.

`SYSTEM_ALERT_WINDOW` ("display over other apps") was **removed** on 2026-10-24
([evidence](../evidence/device-runs/2026-10-24-permission-trim/README.md)); if a listing ever shows
it, the upload came from a build older than that change.

---

## 6. The two Play requirements, and where each stands

Both are now **live, covered by tests and exercised**: the pages are served by production and were
opened signed out, and the deletion flow has been run on a phone with a throwaway account
(`docs/evidence/device-runs/2026-10-24-account-deletion/`). What remains for either is a **console
entry**, not code — plus, for the in-app half of deletion, **an artifact built after 2026-10-24 20:56**
(§1.1).

### 6.1 Privacy policy — live

`GET /privacy` exists in the server (`server/src/pages/privacyPolicy.ts`), outside `/api`, and covers
what §4 lists: the processors by name (Firebase, Brevo, OpenRouter, MongoDB Atlas, Render), what is not
collected, the camera's barcode-only use, retention, security, 18+, and **how a person deletes their
account and what happens to their data**. It is served from the same place as the code that creates
the obligation, so it cannot drift into a separate document.

**Measured live (2026-10-24):** `GET https://ai-inventory-l1mi.onrender.com/privacy` answers **200
text/html** with `default-src 'none'` plus the stylesheet's CSP hash, `no-store`, `no-referrer`,
`frame-ancestors 'none'` and no `X-Powered-By`; `POST /privacy` is a 404. The page carries no script,
so it renders the same signed out.

**Still to do, and none of it is code:**

1. **Confirm the contact address** in the page (`CONTACT_EMAIL`, one constant, also used by the
   deletion page).
2. Decide whether to add a **legal entity / jurisdiction** line. The draft deliberately claims
   neither; inventing one would be worse than omitting it.
3. Paste `https://ai-inventory-l1mi.onrender.com/privacy` into the console and open it in a
   **private browser window** (signed out), because that is how a reviewer opens it.

The page and its guards: `server/src/pages/privacyPolicy.ts`, `server/test/PRIVACY-page.test.mjs`;
the change record is roadmap §27EV (privacy) and §27EW (deletion).

### 6.2 Account deletion — live, and measured on production

Google requires apps that let people create an account to offer **both**:

1. an **in-app path** to delete the account and its data, and
2. a **web URL** (used in the Data safety form) for people who no longer have the app.

Sources: [Play's account-deletion policy](https://support.google.com/googleplay/android-developer/answer/13327111),
[the design guidance](https://android-developers.googleblog.com/2024/03/designing-your-account-deletion-experience-google-play.html).

**Both halves now exist.**

- **In the app:** Profile → **Delete account** (`mobile/app/(app)/delete-account.tsx`). It states what
  is deleted and what stays, requires the word `DELETE` and a re-authentication credential (a
  Firebase ID token for a linked account, the current password for a legacy one), then signs the
  person out.
- **On the web:** `GET /account-deletion` (`server/src/pages/accountDeletionPage.ts`), outside `/api`,
  public and unauthenticated so somebody who cannot sign in can still use it. Paste
  `https://ai-inventory-l1mi.onrender.com/account-deletion` into the Data safety form.
- **On the server:** `DELETE /api/auth/me` (`server/src/services/accountDeletion.service.ts`). The
  account is always `req.user.id` — no id in the request can aim it elsewhere — and the operation is
  a **tombstone**, not a hard delete:

  | Removed | Kept |
  | --- | --- |
  | name, real email address, password hash, Firebase identity (deleted at the provider), all sessions, reset + verification records, AI conversations and their messages | the business's stock levels, movements, purchase orders and audit trail, with the person's `userId` set to `null`; the `User` row survives as an anonymous placeholder |

  Ownership, and therefore the kept-data table above, depends on **who is left**:

  - **Somebody else still uses the business.** Its records stay (the table above). If the caller is
    its only `OWNER`, the request is refused `409 LAST_OWNER_TRANSFER_REQUIRED` until another member
    is made an owner.
  - **Nobody else is left.** The account **and the whole business** are deleted — products, stock,
    movements, purchase orders, suppliers, locations, audit trail and assistant history — because
    there is nobody left to own the records or read them. The screen states this before the button.

  A repeat request converges (`changed: false`) instead of repeating the destructive work.

**Measured on production (2026-10-24) with a disposable tenant:** 12/12 checks — registered 201,
signed in 200, STAFF created 201 and signed in 200, mistyped word 400, wrong password 400
`INVALID_CURRENT_PASSWORD`, the session still 200 after both refusals, deletion 200
`{deleted:true,changed:true}`, the dead token 403 `ACCOUNT_DISABLED`, the deleted login 401, the
owner unaffected 200, and the deleted member absent from `GET /api/users` (0 rows). The probe tenants
were then removed (leftovers **0**) and no real account was touched.

**Delivered to the phone by update, not by build.** The installed production-profile APK predates the
screen, so it arrived there through the `production` OTA channel (the same route the Google chooser
fix took); the run below therefore proves the **feature on a device**, not that a store artifact
contains it. Neither AAB does — §1.1.

**Deployed and device-tested (2026-10-24).** The sole-member change is live (commit `a5a8b10`;
`GET /api/health` publishes it as `production`), and both public pages serve the two-outcome wording.
On the phone, with a throwaway account: Profile → Delete account stated the consequences, refused a
blank word and a mistyped one **without making a request**, then returned the app to Login on
`DELETE` plus the password — after which the user row, the business row and the old password were all
gone. The evidence, including a 43-check API regression over both ownership cases, is
`docs/evidence/device-runs/2026-10-24-account-deletion/`.

**Still to do:**

1. Fill in Data safety with both URLs and the deletion answer, keeping it consistent with the two
   ownership cases above.
2. **Google Sign-In was measured separately** (2026-10-24) and reaches the same branch: a real Google
   account registered through the button (`403 REGISTRATION_REQUIRED` → *Create a business
   account*), the delete screen showed the provider wording **with no password field**, deletion
   returned the app to Login, the provider identity answered `auth/user-not-found`, and **signing in
   again with the same Google account could not get back in** — the same banner, no tenant, no
   session. The run also found and fixed a shared-device defect (a saved Google account was reused
   with **no account chooser**); that fix is JavaScript only, was delivered over the air on the
   `production` channel (no build was possible that day — the Free plan's Android build quota resets
   2026-11-01), and was then measured on the phone: after signing out, *Continue with Google* showed
   the **chooser**, a **second** Google account on the same handset got `REGISTRATION_REQUIRED` with
   no tenant and no session, and deleting the first account returned the app to Login. Evidence:
   `docs/evidence/device-runs/2026-10-24-google-sign-in/`.

Implementation records: roadmap §27EW (deletion), §27EX (the sole-member closure and the production
run) and §27EY (the Google account run and the chooser fix); tests
`server/test/ACCOUNT-DELETION.test.mjs` (server), `mobile/__tests__/account-deletion.test.tsx`
(screen) and `mobile/__tests__/phaseC-native-google.test.ts` (the chooser).

---

## 7. The review account

Play's reviewers must be able to reach the features. Provide, in the "App access" instructions:

- an `OWNER` account on a **seeded demo tenant** with products, stock, a supplier, a purchase order
  and a low-stock product (so the assistant has something to answer about),
- the exact steps: sign in → dashboard → inventory → product → assistant,
- a note that the account is a demo tenant and its data is disposable.

Do **not** give a reviewer a real customer account. `server/scripts/seed-demo-tenant.mjs` already
creates this shape, and `cleanup:demo-tenant` removes it — the same pair used for the device runs.

---

## 8. Upload checklist (when you decide to upload)

0. **Build from a commit that contains what you are submitting** (`eas build --profile production`;
   needs the build quota — the Free plan resets 2026-11-01).
1. **Run the parity gate on the file you are about to upload** — §1.1, `npm run check:aab -- <file>`.
   Exit 1 means the artifact predates a required feature; do not upload it, whatever the manifest says.
2. **Back up the production keystore** and its passwords (EAS credentials). If it is lost before
   Play App Signing is enrolled, the package name is unrecoverable.
3. Create the app in Play Console with package `com.inventoryai.app`, enroll in **Play App Signing**
   (Google holds the app signing key; the current keystore becomes the **upload key**).
4. Complete §2–§5, including the privacy policy URL and the deletion URL.
5. Upload the AAB to **Internal testing** first — `eas build` prints its artifact URL; the file can
   also be downloaded and uploaded by hand, which is the simplest first path (no service account).
6. Add your own account as an internal tester, install **from Play**, and run the journeys
   (sign-in, dashboard, scanner, assistant, offline launch, password reset).
7. Only then promote to closed/production. Every later upload needs a higher `versionCode`;
   `autoIncrement` is on, so each `eas build` produces one.

**Still unproven at this point:** nothing has been uploaded, so Play App Signing, Play's own
pre-launch report and the store-installed build have never been exercised. The AAB itself has been
validated with `bundletool` (`validate` exit 0, manifest dumped) but never installed — a store install
is the only way to test Play's re-signed artifact.
