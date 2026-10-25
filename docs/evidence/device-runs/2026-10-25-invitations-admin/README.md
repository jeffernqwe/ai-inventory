# 2026-10-25 — the admin half of invitations, and a real inbox, against production

Handset: OPPO CPH1969 (Android 11), `PV4DDMIZZLTCIVSK`.
Build: the **production-profile APK** already installed on 2026-10-24 (`versionCode 1`,
`versionName 1.0.0`, runtime `1.0.0`, channel `production`), carrying over-the-air group
`936e1e55-…` from commit `33bdd54`. **Nothing was rebuilt, published or installed for this run** —
the code under test is the code on the phone.
Backend: `https://ai-inventory-l1mi.onrender.com`, live at commit `97d88f8` (`/api/health` reported
`db: connected`, `environment: production`).
Data: the disposable demo tenant (`DEMO PREVIEW — safe to delete`, `demo-preview@example.invalid`),
seeded into `inventoryai_prod_db` for the run with `seed:demo-tenant` and removed afterwards with
`cleanup:demo-tenant` (**0 leftovers**).

**The mailbox was real.** A throwaway inbox (`…@guerrillamailblock.com`) was created through that
provider's API, and the mail server actually received both messages: the invitation and the AUTH-04
six-digit code. This is the first invitation run in which nothing was hand-minted — no token written
into a row, no code read out of a stored digest.

## What this run had to prove

The previous pass (§27FC) closed with two named gaps, and both are closed here:

1. **An admin sends an invitation from the Users screen on the device** — not through `curl`, not
   through a script.
2. **The invitation email reaches a real inbox**, and its link works from that inbox.
3. The revoke path removes a live link, not just a list row.
4. The mailed invitation can be **accepted end to end** by the person who received it, choosing their
   own password.
5. The invited member can delete their own account, and the business survives.

## Observed, in order

| Time | Step | Observation | Frame |
|---|---|---|---|
| 12:35 | Sign in as the demo owner | Dashboard matches the fixture: **3 / 3 / 1 / 6 / 112** | — |
| 12:36 | `inventoryai://users/invitations` | The **Invitations** screen: colleague's email, role, *Send invitation*, and *No one is waiting to join* | — |
| 12:37:31 | *Send invitation* — `…@guerrillamailblock.com`, role **Staff** | Green notice *Invitation sent to …*, form cleared, and the row appears under **Pending invitations** with role, **Pending**, expiry **Nov 1, 2026** and a **Revoke** button | `01-sent-from-the-screen.png` |
| 12:38:06 | Read the inbox over its API | **Two messages**: `no-reply@guerrillamail.com :: Welcome to Guerrilla Mail` and `jefferndullamalinaozxc@…brevosend.com :: You have been invited to join DEMO PREVIEW — safe to delete on Inventory AI` — **34 s after the tap** | — |
| 12:38 | Follow the mail's link | `302` from Brevo's click host → `https://ai-inventory-l1mi.onrender.com/invite?token=…` → **200**, whose body forwards to `inventoryai://invite?token=…` | — |
| 12:38 | Compare the mailed token with the row | `sha256(token)` = `ccfd9ffd20de…` — **the stored `tokenHash`**, so the message carried the token for that invitation and not some other | — |
| 12:40 | Second invitation — `…@guerrillamailblock.com`, role **Manager** | Sent from the same screen; a second inbox received the matching message | — |
| 12:44 | **Revoke** on the Manager row | Confirmation *The link sent to … will stop working immediately*, then *Invitation for … revoked.* and the row gone from the list | `02-revoke-confirmation.png`, `03-revoked.png` |
| 12:44 | Query the revoked link | `GET /api/auth/invitation?token=<revoked>` → **404 `INVITATION_INVALID`**, while the untouched pending token still answered **200** with `{ email, role: "STAFF", businessName, expiresAt }` | — |
| 12:46 | Sign out, open the **emailed** token | *Join DEMO PREVIEW — safe to delete* / *Create your account to join as staff* — Email, Business, Role **Staff**, Expires **Nov 1, 2026** | `04-opened-from-the-emailed-link.png` |
| 12:48 | *Create your account* | The **invited** registration shape: a card naming Business and Role, **no business-name input**, *Your name*, Email **prefilled and locked** (*This invitation was sent to this address*), Password with the live rule hint (`18 characters — within the limit.`), Confirm password | `05-invited-register.png` |
| 12:52 | *Create Account* | Firebase identity created; AUTH-04 requested; the verify screen names the inbox and counts down **9m 51s**, resend disabled for 51 s | `06-verify-code-real-inbox.png` |
| 12:53 | Read the inbox, type the six digits, **no Verify press** | The code mail read *Your Inventory AI verification code … 855806*; typing it auto-verified, the invitation was accepted, and the app landed on **the demo tenant's own Inventory** (Demo Notebook A5 at Demo Shop, Demo USB-C Cable 2m at Demo Van/Warehouse) — not a new workspace | `07-joined-tenant-staff.png` |
| 12:55 | Profile | **Invite Prob**, badge **Staff**, Active, member since **Oct 25, 2026 · 12:53** | `08-profile-staff.png` |
| 12:58 | Profile → *Delete account* → type `DELETE` | *We will confirm this with your sign-in. You do not need to type your password* — the Firebase-only path — and the app returned to **Login** with the session cleared | `09-back-at-login-after-deletion.png` |

## Measured in the production database, not inferred

| Fact | Value |
|---|---|
| Invitation row after sending | `PENDING`, role `STAFF`, `expiresAt` 2026-11-01, `tokenHash` = the digest of the mailed token |
| New user | `6add8b535c96badc096fea64`, `businessId` = **the inviting tenant** `6add8687…`, role `STAFF`, status `ACTIVE`, `firebaseUid` set, `emailVerified` true, **no `passwordHash`** |
| Invitation after acceptance | `ACCEPTED`, `acceptedBy` = that user, `acceptedAt` **2026-10-25T04:53:39Z**, same business |
| Audit | `INVITATION_SENT` (STAFF), `INVITATION_SENT` (MANAGER), `INVITATION_REVOKED` (MANAGER), `INVITATION_ACCEPTED` (STAFF) — every metadata is `{ role }` and **no address** appears in any of them |
| After deletion | tombstone `Deleted user` / `deleted+<id>@deleted.invalid`, `firebaseUid` **null**, status `DELETED`, **0** sessions, **0** invitations for the address, `ACCOUNT_DELETED` with `userId: null` and `{ role: 'STAFF' }` |
| Firebase | `getUserByEmail` → **`auth/user-not-found`** |
| Business | still present with its owner — a member's departure does not close a tenant |
| After `cleanup:demo-tenant` | **0 leftovers**; production reads **5 users / 4 businesses / 1 invitation** — all pre-existing owner accounts, and the one invitation is the owner's own earlier `ACCEPTED` row, untouched by this run. **0** demo businesses, **0** probe addresses |

## Findings worth keeping

- **Brevo rewrites the link.** The button in the mail points at `…sendibt2.com/tr/cl/…`, not at our
  page. That is the provider's click tracking, and it means the token exists inside a third party's
  click URL for as long as that provider keeps it. It resolves correctly and the run proves the
  redirect chain, but it is a fact about the token's exposure that was previously assumed away.
- **The mail's sender is the configured `MAIL_FROM`**, which today is a Brevo-branded address
  (`…@12346610.brevosend.com`). It delivers, but it does not look like Inventory AI; a
  domain-verified sender is a store-readiness item, not a code defect.
- **`GET /invite` answers 200 for a revoked token**, because the page deliberately does not query the
  database — it checks the token's *shape* and forwards to the app, which then says the invitation is
  no longer valid. Recorded as designed behaviour, not a bug: the page resolves nothing and redeems
  nothing.
- **Harness notes, learned the hard way:** `adb shell input text` needs `%s` for a space; a swipe
  performed while the soft keyboard is open is *glide typing* and inserts words; `BACK` closes the
  keyboard first and only the *second* `BACK` pops the screen; and `uiautomator dump` fails silently
  onto the previous file while an animation or countdown is repainting.

## Operational note

While checking the Firebase identity afterwards, a verification command printed the
`FIREBASE_SERVICE_ACCOUNT_JSON` blob into the local terminal log (the variable holds base64, not the
JSON the check assumed). The value is a local credential that lives in `server/.env` and never entered
the repository, but it has now existed in a terminal transcript: **rotate that service-account key**
(Google Cloud → IAM → the Firebase Admin service account → new key, then replace the value in the
deployment and in `server/.env`) at the next convenient moment. Nothing in the application changed.

## Limits of this evidence

- **One role (STAFF) and one path (Firebase email/password).** Google Sign-In converging on an
  invitation remains suite-covered only.
- **One sender (OWNER).** An ADMIN sending — and the ADMIN-cannot-invite-ADMIN refusal — are covered by
  `INVITATIONS.test.mjs`, not driven on the handset.
- **The inbox is disposable and third-party.** Delivery through Brevo to a real mailbox is proven;
  what a corporate mail gateway does with the message is not.
- **This is a production-profile APK, not a Play-signed one.** Play App Signing and an internal-testing
  install remain the open release gate.
- **iOS is unverified** (no macOS on this host).
