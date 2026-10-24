# 8. Preparing the Google Play submission

This is the **paperwork** that goes around the artifact
([7. Updating the app](7-over-the-air-updates.md) covers the build and the updates). It is written
from what is actually inside the store bundle, not from intent, and it separates three things
carefully:

- what the bundle **is** (measured),
- what the Play Console form **should say** (a recommendation to review),
- what is **missing** and blocks a submission (two things, both owner decisions).

**Nothing has been uploaded.** There is no Play Console access in this repository, and uploading is
the owner's action.

---

## 1. The artifact these answers describe

| | |
|---|---|
| File | AAB, profile `production`, EAS `4b133d62…` |
| Package | `com.inventoryai.app` |
| Version | `versionName 1.0.0`, `versionCode 3` |
| SDK levels | `minSdk 24`, `targetSdk 36`, `compileSdk 37` |
| Signature | production keystore (EAS credentials) |
| Permissions | 11 declared — see §5 |
| Ads / analytics / billing SDKs | none in `package.json` |
| Update channel | `production`, runtime `1.0.0` |

`targetSdk 36` matters: from **31 August 2026** new apps and updates must target Android 16 (API 36)
or higher, so this build meets the current requirement rather than needing an exception
([Play's target API rule](https://support.google.com/googleplay/android-developer/answer/11926878)).

---

## 2. Store listing

| Field | Value |
|---|---|
| App name (30 max) | `Inventory AI` |
| Short description (80 max) | `Track stock, scan barcodes and ask an AI assistant about your inventory.` (77) |
| Category | Business |
| Contact email | the owner's Play account email |
| Privacy policy URL | `<server>/privacy` — implemented, **live only after the next server deploy**; see §6.1 |
| Account deletion URL | `<server>/account-deletion` — implemented, **live only after the next server deploy**; see §6.2 |

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
| **Privacy policy** | `<server>/privacy` — must match what §4 says is collected; live after the next deploy |
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

## 6. The two blockers, and where each stands

Both are now **implemented in the code and covered by tests**. What remains for each is a deploy and a
console entry, and — for deletion — a device run. Neither is a code gap any more.

### 6.1 Privacy policy — implemented, awaiting deploy

`GET /privacy` exists in the server (`server/src/pages/privacyPolicy.ts`), outside `/api`, and covers
what §4 lists: the processors by name (Firebase, Brevo, OpenRouter, MongoDB Atlas, Render), what is not
collected, the camera's barcode-only use, retention, security, 18+, and **how a person deletes their
account and what happens to their data**. It is served from the same place as the code that creates
the obligation, so it cannot drift into a separate document.

**Still to do, and none of it is code:**

1. **Deploy the server** — until then the URL answers 404 and the listing cannot use it.
2. **Confirm the contact address** in the page (`CONTACT_EMAIL`, one constant, also used by the
   deletion page).
3. Decide whether to add a **legal entity / jurisdiction** line. The draft deliberately claims
   neither; inventing one would be worse than omitting it.
4. Paste `https://ai-inventory-l1mi.onrender.com/privacy` into the console and check it in a
   **private browser window** (signed out), because that is how a reviewer opens it.

The page and its guards: `server/src/pages/privacyPolicy.ts`, `server/test/PRIVACY-page.test.mjs`;
the change record is roadmap §27EV (privacy) and §27EW (deletion).

### 6.2 Account deletion — implemented, awaiting deploy and a device run

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

  The last active `OWNER` of a business is refused with `409 LAST_OWNER_TRANSFER_REQUIRED` until
  another owner exists; that is the one case where deletion cannot complete on its own. A repeat
  request converges (`changed: false`) instead of repeating the destructive work.

**Still to do:**

1. **Deploy** the server so both URLs are live.
2. Open both in a **private window** and confirm they render signed out.
3. **Device run the in-app flow**: create a throwaway account, delete it, confirm the screen returns
   to Login, the old password is refused, and the tombstone is anonymized in the database. A
   disposable account is required — this is the one flow whose test destroys what it touches.
4. Fill in Data safety with both URLs and the deletion answer, and keep the answer consistent with
   what §6.2's table says is kept.

Implementation record: roadmap §27EW; tests `server/test/ACCOUNT-DELETION.test.mjs` (server) and
`mobile/__tests__/account-deletion.test.tsx` (screen).

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

1. **Back up the production keystore** and its passwords (EAS credentials). If it is lost before
   Play App Signing is enrolled, the package name is unrecoverable.
2. Create the app in Play Console with package `com.inventoryai.app`, enroll in **Play App Signing**
   (Google holds the app signing key; the current keystore becomes the **upload key**).
3. Complete §2–§5, including the privacy policy URL and the deletion URL.
4. Upload the AAB to **Internal testing** first — `eas build` prints its artifact URL; the file can
   also be downloaded and uploaded by hand, which is the simplest first path (no service account).
5. Add your own account as an internal tester, install **from Play**, and run the journeys
   (sign-in, dashboard, scanner, assistant, offline launch, password reset).
6. Only then promote to closed/production. Every later upload needs a higher `versionCode`;
   `autoIncrement` is on, so each `eas build` produces one.

**Still unproven at this point:** nothing has been uploaded, so Play App Signing, Play's own
pre-launch report and the store-installed build have never been exercised. The AAB itself has been
validated with `bundletool` (`validate` exit 0, manifest dumped) but never installed — a store install
is the only way to test Play's re-signed artifact.
