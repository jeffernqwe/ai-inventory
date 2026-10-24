# 2026-10-25 — an invitation accepted on the phone, against the live production server

Handset: OPPO CPH1969 (Android 11), `PV4DDMIZZLTCIVSK`.
Build: the production-profile APK installed on 2026-10-24 (`versionCode 1`, `versionName 1.0.0`,
runtime version `1.0.0`, channel `production`) — **not rebuilt for this run**.
Delivered as an **over-the-air update**: `npx eas-cli update --channel production --environment
production --platform android`, group `936e1e55-c07e-4c05-9548-f991543ff567`, from commit
`33bdd54`. The second cold launch after publishing opened a route that exists only in that commit,
which is what proves the update was the bytes on screen.

Backend: `https://ai-inventory-l1mi.onrender.com`, deployed from the same commit (push to `main` →
Render auto-deploy on `rootDir: server`). The deploy is separately evidenced below by the public
`/terms` and `/invite` pages, which did not exist before it.

Data: the reserved demo tenant (`DEMO PREVIEW — safe to delete`, `demo-preview@example.invalid`),
seeded into `inventoryai_prod_db` with `seed:demo-tenant` for the run and removed afterwards with
`cleanup:demo-tenant` (**0 leftovers**, verified across every collection carrying the `businessId`).
The invited identity was a throwaway address with no inbox
(`invite.probe.20261025@gmail.com`); its six-digit code was read out of the stored digest with the
server's own pepper — the same procedure earlier runs used, and this run first proved the laptop's
pepper is the production one (a reset-code challenge matched by exhaustive comparison over 10^6
values). The invitation's token was written straight into the pending row with a known value for
the same reason: the mail would have gone to an address nobody can read. **Nothing in the
production path was bypassed** — preview, registration, verification, acceptance, audit and
deletion all ran through the real routes.

## What this run had to prove

1. A deep link to `inventoryai://invite?token=…` opens an invitation screen that names the invited
   address, the business and the role, and **redeems nothing**.
2. Create Account in its **invited** shape: no business-name field, the address prefilled and
   locked, the person choosing their own password.
3. AUTH-04's six digits verify the address **without pressing Verify**, and registration then joins
   **the inviting tenant with the invited role** — a new business is never created.
4. Account deletion still works for a Firebase-only member who joined this way, and leaves the
   business standing.
5. The Legal card reaches the live pages from a production build, with no domain typed into the app.

## Observed, in order

| Step | Observation | Frame |
|---|---|---|
| `adb shell am start -a android.intent.action.VIEW -d "inventoryai://invite?token=…"` | Cold start straight onto **Join DEMO PREVIEW — safe to delete** — *Create your account to join as staff*; Email `invite.probe.20261025@gmail.com`, Role **Staff**, Expires **Nov 1, 2026** | `01-invite-screen.png` |
| *Create your account* | Registration in its invited shape: a card naming Business and Role, **no** business-name input, **Your name**, **Email** prefilled with *This invitation was sent to this address* and not editable, Password with the live length hint (`23 characters — within the limit.`), Confirm password | `02-invited-register.png` |
| *Create Account* | Firebase identity created, AUTH-04 code requested, verify screen naming the inbox: *We sent the code to invite.probe.20261025@gmail.com*, countdown **9m 52s**, resend disabled for 52 s | `03-verify-code.png` |
| Six digits typed, **no Verify press** | Auto-submitted, registration accepted the invitation, and the app landed on the tenant's own Inventory screen — Demo Notebook A5 at Demo Shop, Demo USB-C Cable at Demo Van/Warehouse: **the demo tenant's fixture, not a new workspace** | `04-joined-tenant.png` |
| Profile | **Invite Probe**, badge **Staff**, Status Active, member since **Oct 25, 2026 · 04:03** | `05-profile-staff.png` |
| Profile, bottom | **Legal** card — *Privacy policy* and *Terms of use* — in the same build | `06-legal-card.png` |
| *Privacy policy* | Chrome opens `https://ai-inventory-l1mi.onrender.com/privacy` and the page renders | `07-privacy-in-chrome.png` |
| Profile → *Delete account* | The screen states *We will confirm this with your sign-in. You do not need to type your password* — the Firebase-only path — with the type-`DELETE` confirmation | `08-delete-account.png` |
| *Delete my account* | Back at Login, session cleared | `09-back-at-login.png` |

## Measured in the production database, not inferred

| Fact | Value |
|---|---|
| New user's `businessId` | `6add0b5e…` — the **inviting** tenant; businesses stayed at **5** (4 before the run + the demo tenant), so **no new business was created** |
| Role / status | `STAFF` / `ACTIVE` |
| `passwordHash` | **absent** — nobody but the member chose a credential |
| `firebaseUid` / `emailVerified` | set / `true` |
| Invitation row | `ACCEPTED`, `acceptedBy` = the new user, `acceptedAt` set, same business |
| Audit | one `INVITATION_ACCEPTED`, `entityType: INVITATION`, `metadata: { role: 'STAFF' }` — **no address** in the metadata |
| After deletion | the row is the tombstone (`name: 'Deleted user'`, `email: deleted+<id>@deleted.invalid`, `firebaseUid` gone); **0** invitations for the address; **0** sessions; `ACCOUNT_DELETED` audit row has `userId: null` and `metadata: { role: 'STAFF' }` |
| Firebase identity | `getUserByEmail` answers **`auth/user-not-found`** |
| Business after the member left | **still there**, owner count **1** — a non-owner's departure does not close the tenant |
| After `cleanup:demo-tenant` | production back to **4 users / 4 businesses / 0 invitations**; **0** probe addresses; **0** demo businesses |

## Live checks made from the laptop, before and after the device run

| URL | Answer |
|---|---|
| `GET /terms` | **200**, 5268 bytes, `Cache-Control: no-store`, CSP with a computed `sha256-…` for the inline stylesheet, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`; links to `/privacy`, `/account-deletion` and the contact address; **no** placeholder text |
| `GET /privacy`, `GET /account-deletion` | **200**, each linking to `/terms` |
| `GET /invite` (no token), `GET /invite?token=abc` | **400** *This invitation link is not usable* |
| `GET /invite?token=<64 hex>` | **200**, forwarding to `inventoryai://invite?token=…` |
| `GET /api/auth/invitation?token=…` (real pending row) | **200** with email, role, business name, expiry |
| `GET /api/invitations` (no session) | **401 `AUTH_REQUIRED`** |

## Limits of this evidence

- **One invited role (STAFF) and one path (Firebase email/password).** Google Sign-In converging on
  the same invitation is suite-covered, not driven here.
- **The invitation token and the six-digit code were minted for the run**, because the probe address
  has no inbox. The mail *template* was therefore not read on a phone in this run; its rendering is
  covered by `INVITATIONS.test.mjs`.
- **The invitation was not sent from the Users screen.** `POST /api/invitations` and the mobile
  invitation list are covered by tests; the admin half was not driven on the device.
- **iOS is unverified** (no macOS on this host), and this is a production-profile **APK**, not a
  Play-signed build; Play App Signing and an internal-testing install remain open.
- The handset now sits at **Login**, signed out — deliberate, because the probe account was deleted.
