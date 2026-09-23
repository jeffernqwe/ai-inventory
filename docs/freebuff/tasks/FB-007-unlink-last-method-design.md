# FB-007 — Firebase unlink & last-authentication-method protection: audit + policy design (Phase 32L)

> Audit record of a Freebuff task. **Not** architecture, **not** project history, **not** a
> specification. Authoritative sources: `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`,
> `CLAUDE.md`, `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
>
> **This phase is ANALYSIS ONLY.** No production file, test, model, dependency, configuration,
> `.env` or database document was touched. The design below is a **Freebuff recommendation awaiting
> an OWNER DECISION**; per `DECISIONS.md`'s closing statement it is not project policy until an owner
> records it as one.

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | FB-007 |
| Date | 2026-09-23 (host clock read at preflight) |
| Phase | 32L |
| Branch | `experiment/freebuff-evaluation` |
| Starting HEAD | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — `feat: enforce firebase password authority boundary (Phase 32K)` |
| Ending HEAD | unchanged — **no commit authorised for this phase** |
| Staged at start / end | 0 / 0 |
| Request source | Jeffern — the Phase 32L brief, which authorizes analysis as **FB-007** |
| Explicit approval status | **APPROVED FOR ANALYSIS.** The brief is the approval: *"Record this work as: `FB-007`"*, under an explicit read-only forbidden list. |

## Requested Objective

Answer, before any unlink capability exists, what a Firebase identity unlink must do — and design the
**last-authentication-method** invariant that keeps the two dangerous end-states unreachable:

- **Case A (lockout).** `firebaseUid` present, `passwordHash` absent → unlink leaves the account with
  **no** usable authentication method.
- **Case B (silent credential reactivation).** `firebaseUid` present, `passwordHash` present → unlink
  re-activates a retained bcrypt hash that the user stopped using when they linked Firebase, and which
  Phase 32K proved is **inert for as long as the `firebaseUid` exists**.

The brief forbade implementation, database changes, Firebase Console changes, provider work
(Facebook/Apple), Render deployment, and any unlink against a real or test tenant.

## Scope

**Allowed:** read-only inspection of the linking/auth/session implementation, tests, and the four
authoritative documents; a written policy design; this audit record.

**Not allowed (and not done):** any production edit, any test edit, any schema/model edit, any
dependency change, any `.env` change, any commit, any unlink execution, any database write.

## Preflight (verified, not assumed)

| Check | Result |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` |
| HEAD | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` |
| Staged | **0** |
| Protected files (5) | byte-identical to `BASELINE.md` §3 — `10c5ff2e…d7bd530` (`mobile/eas.json`), `23e91610…da1a213` (`http.ts`), `83767f8b…22d0768` (`phase06-ai-wire.test.mjs`), `52d3afef…10625891` (plan 18c), `d000a5d3…e63c297` (plan 18e) |
| Production files modified | **none** |
| Database touched | **none** — no read, no write |

## Files Inspected

**Server:**
`services/auth.service.ts` · `services/firebaseLink.service.ts` · `services/firebaseAuth.service.ts` ·
`services/passwordReset.service.ts` · `services/session.service.ts` · `models/user.model.ts` ·
`models/session.model.ts` · `middlewares/authenticate.ts` ·
`controllers/auth.controller.ts` · `controllers/firebaseAuth.controller.ts` ·
`controllers/passwordReset.controller.ts` · `routes/auth.routes.ts` · `constants/audit.ts`

**Tests:**
`phase32b-firebase-admin.test.mjs` (55) · `phase32c-firebase-exchange.test.mjs` (44) ·
`phase32e-firebase-legacy-guard.test.mjs` (12) · `phase32h-firebase-linking.test.mjs` (25) ·
`phase32k-firebase-password-boundary.test.mjs` (12) · `scripts/run-tests.mjs`

**Mobile:**
`lib/api.ts` · `lib/auth.tsx` · `app/(app)/profile.tsx`
(searched for any link/unlink surface — **none exists**)

**Documents:**
`docs/SYSTEM_SPECIFICATION.md` (§29 password authority, Provider Identity Linking Policy,
Unlink/Revocation/Last-Method, Open Items) ·
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` (§14A.4/.5, §14B, §14B.4/.5/§16) ·
`docs/DEVELOPMENT_ROADMAP.md` (§27K, §27M, §16 `the unlink finding`)

## Source Findings

### F-1 — No unlink capability exists, in any form `[SOURCE]`

A repository-wide search for `unlink` returns **only prose** — the specification's and roadmap's own
open-item records, plus test fixture names (`unlinked32e`, "an unlinked account"). There is:

- **no** unlink route (`routes/auth.routes.ts` has 12 routes; none is unlink),
- **no** unlink service or helper,
- **no** unlink audit action (`constants/audit.ts` has two Firebase actions, both link),
- **no** provider field on any model,
- **no** mobile link **or** unlink surface (`lib/api.ts` exports `firebaseExchange` and
  `firebaseRegister` only — **Phase 32H's link route is not reachable from the app at all**),
- **no** provider field on the session model.

### F-2 — The link boundary is the exact inverse of the proposed unlink `[SOURCE]`

`firebaseLink.service.ts` is the shape an unlink should mirror: account from `req.user.id`, identity
from a **verified** Firebase ID token, four cases decided in an order that matters, and **one
conditional write** whose filter is the concurrency argument (`{ _id, firebaseUid: null }`).
Audit rows: `FIREBASE_IDENTITY_LINKED` (`{ passwordCredentialRetained }`) and
`FIREBASE_IDENTITY_LINK_CONFLICT` (`{ reason }`) — **the uid never enters the audit row**.

### F-3 — Phase 32K made the retained hash inert, and stated why `[SOURCE]`

`auth.service.ts:213` `authMethodsFor(user) => ({ password: !user.firebaseUid })` — the single
derivation of the capability, published by **both** `toPublicUser` (`:232`) and `authenticate.ts`'
`req.user`. `changePassword` refuses a `firebaseUid` account with `409 PASSWORD_NOT_APPLICABLE`
(`:374`) **before** the current-password comparison; the recovery request takes a silent `202`
(`passwordReset.service.ts:384`); the recovery completion refuses **last**, immediately before the
write (`:527`). **No retained `passwordHash` was deleted, precisely so that a later unlink could not
be made irreversible** — the disposition this phase must now settle.

### F-4 — Its own record states the dependency chain `[SOURCE]`

Specification §29: *"An unlink policy and last-authentication-method protection that account for both
sides are OPEN and must be settled before an unlink capability ships."* Design document **O-1** is the
same item; the roadmap's §16 records the Phase 32H finding that unlinking is a client-side
Firebase-only operation the server **cannot observe**. Two consequences the design must respect, both
already written down: Firebase refuses to unlink a user's **last provider**, but that notion covers
only Firebase's own methods and **is unaware of a retained `passwordHash`**; and the session model is
provider-neutral, so no provider field may be added to it.

## Current Behaviour (as verified)

| Surface | Firebase-native (`firebaseUid`, no hash) | Firebase-linked (`firebaseUid` + hash) |
| --- | --- | --- |
| `/api/auth/login` | 401 `INVALID_CREDENTIALS` (equalizer) | 403 `FIREBASE_SIGN_IN_REQUIRED` |
| `/api/auth/change-password` | 409 `PASSWORD_NOT_APPLICABLE` | 409 `PASSWORD_NOT_APPLICABLE` |
| `/api/auth/forgot-password` | silent 202, no token/mail/audit | silent 202 |
| `/api/auth/reset-password` | 400 `INVALID_RESET_TOKEN` (last) | 400 `INVALID_RESET_TOKEN` (last) |
| `/api/auth/firebase/exchange` | resolves by uid → session | resolves by uid → session |
| `/api/auth/firebase/link` | CASE C attaches | CASE A/D |
| **unlink** | **does not exist** | **does not exist** |

## Risks Identified

| # | Risk | Severity | Evidence |
| --- | --- | --- | --- |
| R-1 | **Case A lockout** — clearing `firebaseUid` on a hashless account leaves zero methods | high | F-3 (`authMethods.password = !firebaseUid`) |
| R-2 | **Case B reactivation** — clearing `firebaseUid` makes a retained, unmanaged hash live again | high | F-3; 32E's guard is *the only* thing keeping it inert |
| R-3 | **Delegating to Firebase's last-provider rule** — it cannot see the Mongo-side state in either direction | high | F-4 |
| R-4 | **Split-brain** — Firebase-side provider unlink is invisible to the server, so Mongo can be stale in either direction | medium | F-4 |
| R-5 | **Re-link / orphan interaction** — after unlink the Google identity still exists in Firebase; re-registering with it stays `409 EMAIL_IN_USE` (the known O-6 orphan class), so the only way back is explicit link while password-authenticated | medium | `firebaseAuth.service.ts` register path; design doc §16.6/O-6 |
| R-6 | **Concurrent link/unlink** — two conditional writers to one field | medium | F-2 (the conditional-update pattern already exists) |
| R-7 | **Email used as unlink proof** — would re-introduce an auto-unlink join key | high | §13 / spec *Provider Identity Linking Policy* |

## Policy Options Considered (owner decision required)

| Option | Native account | Linked account | Verdict |
| --- | --- | --- | --- |
| **A** — silently reactivate the retained hash; refuse unlink for native | refused (stuck) | unlink → hash live, unconfirmed | **Not recommended.** Refusing native pushes users to the invisible Firebase-side unlink (R-4); reactivation is R-2 exactly. |
| **B** — **establish a fresh local password as part of the unlink** (mandatory field) | unlink → password set | unlink → hash **replaced**, never resurrected | **RECOMMENDED.** One uniform rule; closes R-1 and R-2 by construction; no new recovery mechanism. |
| **C** — delete the hash and require another Firebase provider | refused | refused in practice | Not recommended: makes unlink unreachable and is irreversible. |
| **D** — no server unlink at all | n/a | n/a | Rejected: leaves O-1 open forever and leaves the client's provider unlink unobserved. |

## Recommended Design (proposal — not implemented, not approved)

**One authenticated route, `POST /api/auth/firebase/unlink`, `requireAuth` + controller, no
permission** — Phase 23's `AUTHENTICATED` bucket, because it acts only on the caller's own account.
Body `{ idToken, newPassword }`.

1. **Account** = `req.user.id`. **Identity** = `verifyFirebaseIdToken(idToken).uid`, and it is
   accepted **only if it equals the account's own `firebaseUid`** — otherwise `409`. This is the
   mirror of 32H CASE D and is what stops one tenant's session detaching an identity it does not own.
   Email is never a join key, in either direction (R-7).
2. **`newPassword`** is validated by the **existing shared password policy** (the same validator
   `change-password` and `reset-password` use) and hashed with the existing bcrypt helper.
3. **One conditional write**, filter `{ _id, firebaseUid: tokenUid }`:
   `$set { firebaseUid: null, emailVerified: false, passwordHash: <new>, passwordChangedAt: now }`.
   The filter is the whole concurrency argument (R-6): a racing link/unlink matches nothing and the
   loser re-reads and re-dispatches rather than assuming.
4. **Last-method invariant** holds **by construction** (the operation always ends with a usable local
   password) and is additionally asserted **defensively** server-side, so the rule is checkable rather
   than merely implied.
5. **Sessions: revoke all** (`revokeAllSessions`), because the **authentication authority changed** —
   a token minted under Firebase authority must not survive into a password-authority world. This
   mirrors `resetPassword` rather than `changePassword` (32A/32K pin that change-password does *not*
   revoke all).
6. **Authorization is untouched:** no code path writes `businessId`, `role` or `status` (§12).
7. **Audit:** exactly **two** new actions — `FIREBASE_IDENTITY_UNLINKED` (no uid; metadata
   `{ passwordEstablished: true }`) and `FIREBASE_IDENTITY_UNLINK_CONFLICT` (metadata `{ reason }`,
   no uid). No noisy per-refusal rows.
8. **Client contract:** `authMethods: { password, firebase }` — provider-neutral, no uid, no token.
   `firebase: !password` today, but named so the UI states *why* password management is absent instead
   of inferring it. A `canUnlink` flag is deliberately **not** proposed: it would be advisory only and
   the server stays authoritative.
9. **Ordering / split-brain (R-4):** the server operation is **self-contained** and must not depend on
   the client's Firebase-side unlink, which the server cannot observe. After a successful server
   unlink the client signs out of the Firebase SDK; the provider unlink in Firebase is optional and
   may legitimately fail (Firebase refuses a last provider). A stale Firebase identity afterwards is
   harmless because Mongo no longer resolves it — but it is the R-5 orphan, whose only way back is
   explicit link from a password-authenticated session.

**No schema change is required** (no new field, no index, no migration): `firebaseUid` is already
nullable + `sparse: true` unique, `passwordHash` is already optional, `emailVerified` already exists,
and the audit trail already carries the history.

## Database Implications

**None.** Documented reasons: the two-case matrix is expressible from existing fields; "last method"
is a *derived* predicate (`firebaseUid` absent AND `passwordHash` absent), not stored state; and adding
a provider list or a "methods" array would contradict §14A/§10 (Inventory AI stays authority-level,
Firebase owns the provider set).

## Session Implications

Revoke-all on unlink (authority change). No session-model change. `passwordChangedAt` is stamped as
the durable cross-process backstop; `revokeAllSessions` handles the live rows. Residual: a token
minted microseconds before the revoke can outlive it until expiry — unchanged from the existing
Phase 26A property.

## API Implications

One new `AUTHENTICATED` (not permission-gated) route, no new permission key, no RBAC matrix change, and
the Phase 23 classifier must gain its declaration. Response `{ unlinked: boolean, user }` using the
existing public-user allowlist, so the route reports the account and never the identity.

## Client Implications

`lib/api.ts` gains one tokenless-after-exchange wrapper (like `firebaseRegister`); `authMethods` typing
gains `firebase`; the profile/security screen gains an explicit "Disconnect Firebase sign-in" action
that collects the new password, and states plainly that this sets a password. The screen performs **no**
authorization decision.

## Test Plan (design only — nothing written)

| Group | Cases |
| --- | --- |
| Native (`firebaseUid`, no hash) | unlink + password → 200, ends with exactly one method; without `newPassword` → 400 `VALIDATION_ERROR`; wrong/absent identity token → 409 (never an oracle naming another account) |
| Linked (`firebaseUid` + hash) | unlink replaces the hash — **the old retained password must not authenticate**; the new one must; audit carries no uid |
| Post-unlink matrix | login with the new password → 200; `authMethods.password` → true; `change-password` now applies; **forgot/reset now apply** (32K's guard no longer fires) |
| Identity mismatch | token uid ≠ account uid → 409, no write, no session change |
| Concurrency | unlink/unlink; link/unlink both orders; unlink + concurrent password op — one conditional write wins, loser re-reads |
| Authorization | other user's session → their own account only; unauthenticated → 401; revoked/expired session → 401 |
| Audit | success row without uid; conflict row without uid; **no row on a no-op** |
| Split-brain | server unlink without client-side Firebase unlink → exchange no longer resolves the uid; explicit re-link from a password session restores it |
| Regression | 32K's matrix unchanged for accounts with no unlink; 32E guard intact; 32H link suite green |
| Mutation | remove the uid-equality check; remove `newPassword` validation; make the write unconditional; drop `revokeAllSessions`; drop `passwordChangedAt` — each must redden a named case |

## Deferred Implementation

Everything. Phase 32L ships **no code**. The implementation is a separate, owner-approved increment
that must first settle the four decisions in `DECISIONS.md` (policy option B vs A, the exact route and
its status codes, the session-revocation choice, and the `authMethods` shape).

## Unresolved Questions (owner only)

1. **Policy B vs A** — is mandatory password establishment at unlink the accepted UX, including for a
   Firebase-native user who may have wanted to leave Firebase entirely?
2. **Route and codes** — `POST /api/auth/firebase/unlink` with `409 FIREBASE_IDENTITY_CONFLICT` reused
   for the mismatch case, or a distinct code?
3. **Session revocation** — revoke-all (recommended) or allow the caller's current session to survive
   so the operation does not sign them out?
4. **`authMethods` shape** — add `firebase` (recommended, no information leak today) or stay
   `{ password }`?
5. **Should unlink require the business to be ACTIVE** (`assertActiveBusiness`), as the other writes do?

## External Verification Required

- `[FIREBASE OFFICIAL DOC]` — the exact semantics of `unlink`/`unlinkProvider` and the precise
  conditions under which Firebase refuses to remove a **last** provider, including whether an account
  whose remaining credential is a **legacy Mongo bcrypt hash** is treated as having one.
- `[FIREBASE OFFICIAL DOC]` — whether the client SDK surfaces a distinguishable error for a
  last-provider refusal, and its error code.
- `[EXTERNAL VERIFICATION REQUIRED]` — no live Firebase project has been exercised for any of the
  Phase 32B–32K work; these semantics are **unverified** here.
- `[EXPERIMENT REQUIRED]` — a real device run of the proposed unlink (needs the phase to be
  implemented first).

## Security Findings

1. **O-1 is a design gate, not a missing feature.** The dangerous states are unreachable today only
   because unlink does not exist. Shipping one without the invariant would open R-1 and R-2.
2. **Firebase's last-provider protection is insufficient and must not be relied on** (R-3): it cannot
   see the Mongo-side hash in either direction, and it cannot see a Mongo account at all.
3. **Phase 32K's "retain the hash" decision is what makes unlink possible at all** — deleting it then
   would have made a correct unlink irreversible. The retained hash's lifecycle is settled by the
   recommendation above (replaced, never resurrected), which is the first concrete answer to why it
   was retained.
4. **Phase 32H's link route is not reachable from mobile.** The client can link *nothing* today; the
   server boundary exists but has no UI. Recorded so a future phase does not assume otherwise.

## Known Limitations

- Analysis only: no runtime evidence, no live Firebase project, no implementation.
- The recommendation's timing properties (e.g. whether the unlink path could be an oracle for "does
  this account carry a Firebase identity") were **reasoned from source, not measured**; the case is
  low because the caller is authenticated and operating on their own account.

## Git Checkpoint

| Check | Value |
| --- | --- |
| Branch / HEAD | `experiment/freebuff-evaluation` / `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — **unchanged** |
| Staged | **0** |
| Commit | **none** |
| Pushed | **never** |
| Files modified (production) | **none** |
| Files created | this record + its trail entries only |

## Protected-File Verification

All five byte-identical to `BASELINE.md` §3 (hashes in §Preflight). `docs/freebuff/` is the only
directory written to, which the brief authorizes.

## Render Touched

**NO.** No deploy, no configuration change, no environment variable change.

## Status

**COMPLETE (analysis).** Recommendation delivered; **no owner decision taken on its behalf**; no code,
test, schema, dependency or database change made; nothing staged or committed.

---

# Extension — decision refinement (Phase 32L, second pass)

> Appended by the **same task (FB-007)**, per the brief's §18: *"This is a continuation of FB-007. Do not
> create another independent task ID unless necessary."* Still **analysis only** — no production file,
> test, model, config, `.env`, dependency or database object touched; nothing staged or committed.

## Baseline reconfirmed

Branch, HEAD (`8af1d49f83b3f4d82c7e40d894c94ab61620ab80`), staged (0) and **all five protected hashes**
are **identical** to the §Preflight table above. No production file changed since the first pass. No
Render, Firebase Console or database operation occurred.

## New findings (this pass)

### N-1 — Decision 1 is *pre-decided by the middleware* `[SOURCE]`

`assertActiveBusiness` is called at **`middlewares/authenticate.ts:138`**, inside `requireAuth` — so
**every authenticated route in the application already refuses a non-ACTIVE business** with
`403 BUSINESS_NOT_ACTIVE`. Public routes (`login`, `firebase/exchange`, both password-recovery legs)
call it themselves (`auth.service.ts:322`, `firebaseAuth.service.ts:183`,
`passwordReset.service.ts:355` and `:502`), because they do not run `requireAuth`.

**Consequence:** the proposed unlink route inherits the ACTIVE-business requirement **automatically**.
There is no "should unlink require it?" decision to make from consistency — only a decision about
whether unlink should be a **deliberate exception**, which would be a deviation to justify.

### N-2 — `auth_time` is documented, verifiable, and currently discarded `[FIREBASE OFFICIAL DOC]` + `[SOURCE]`

`[FIREBASE OFFICIAL DOC]` (Verify ID Tokens) lists `auth_time` in the **ID Token Payload Claims** table:
*"Authentication time — Must be in the past. The time when the user authenticated."* It is a signed,
server-verifiable claim, not client-supplied data.

`[SOURCE]` `services/firebase/tokenVerifier.ts:148` calls
`auth.verifyIdToken(idToken, /* checkRevoked */ false)` and receives the **full decoded payload**, but
`toVerifiedIdentity()` narrows it to `{ uid, email, emailVerified, signInProvider }`. So **the server
could enforce a freshness window today**, at the cost of widening a Phase 32B module's return type.
`checkRevoked` is `false` by the approved Phase 32A design, so revocation is not currently consulted.

### N-3 — ★ The Admin SDK **can** unlink providers — the recorded assumption is wrong `[SOURCE]`

`firebase-admin@14.4.0`'s `UpdateRequest` (`lib/auth/auth-config.d.ts:158-160`) declares:

```ts
/** Unlinks this user from the specified providers. */
providersToUnlink?: string[];
```

so `admin.auth().updateUser(uid, { providersToUnlink: ['google.com'] })` exists. The same SDK also
exposes `getUser(uid)` → `UserRecord.providerData` (`user-record.d.ts:241`) and
`revokeRefreshTokens(uid)` (`base-auth.d.ts:321`). **None of the three is used anywhere in `src/`.**

This **contradicts** two statements the repository records as capability facts:

| Recorded statement | Where | Status after N-3 |
| --- | --- | --- |
| *"Unlinking is a client-side Firebase operation, so the server cannot observe it"* | specification §29 | **Half right.** The server cannot observe a *client's* unlink — but it is **not unable to unlink**. It can, and therefore can observe its own. |
| *"attaching a provider is not a server-side operation at all — the server neither performs it nor has an API for it"* | specification §29; design doc §14B | **Inaccurate as capability.** `providerToLink` and `providersToUnlink` both exist. 32H's *choice* not to use them stands; its stated *reason* does not. |

**None of this was used or needed to produce the recommendation.** It is recorded because a future phase
that trusts the old wording would rule out a design that is in fact available. Runtime semantics —
whether the last provider can be removed, and whether an existing refresh token survives — remain
**`[EXTERNAL VERIFICATION REQUIRED]`**. Note that the same doc comment on `providerToLink` states
explicitly that linking **does not invalidate the refresh token**, which is a warning that unlinking may
not either; `revokeRefreshTokens` is the SDK's own answer, and the Admin SDK's session-management docs
are the source to check.

### N-4 — Firebase's documented recent-login scope, and `unlink`'s absence from it `[FIREBASE OFFICIAL DOC]`

The client-SDK documentation (Manage Users) enumerates the sensitive actions requiring a recent
sign-in as **deleting an account, setting a primary email address, and changing a password** — each
repeating *"the user must have signed in recently. See Re-authenticate a user."* **Provider unlinking is
not in that list**, and the account-linking page documents `unlink(user, providerId)` without stating a
recency requirement. The installed SDK nevertheless carries `auth/requires-recent-login`
(`CREDENTIAL_TOO_OLD_LOGIN_AGAIN`, `auth-public.d.ts:523`), and there is public evidence of it firing
around unlink/relink flows. **`[EXTERNAL VERIFICATION REQUIRED]`** — do not assert either way.

### N-5 — No "last provider" error code exists in the installed SDK `[SOURCE]`

A scan of `@firebase/auth`'s error enum finds `auth/no-such-provider` ("the provider is not linked to
this user"), `auth/invalid-provider-id`, `auth/provider-already-linked`, `auth/credential-already-in-use`,
`auth/requires-recent-login`, `auth/user-token-expired`, `auth/user-disabled`, `auth/user-mismatch`,
`auth/too-many-requests` — and **no code expressing "cannot remove the last sign-in method"**. The
project's assumption that "Firebase refuses to unlink a user's last provider" is therefore
**`[EXTERNAL VERIFICATION REQUIRED]`**, and the server must not depend on it.

### N-6 — ★ Re-signing in with an unlinked provider creates a **new** Firebase account `[FIREBASE OFFICIAL DOC]`

The account-linking page states it plainly: *"If a user signs in again with the same provider after it
has been unlinked, Firebase creates a new, separate user account instead of restoring link to the
original account."*

**This is decisive for sequencing.** If a Firebase-side unlink runs **before** the MongoDB side
(Sequence B), then any later sign-in with that provider yields a **different uid**, which can never
match the still-present Mongo `firebaseUid` — a permanent split-brain the server cannot repair, and
exactly the schema of the known unhealable-orphan class (O-6). It is also why the order matters more
than the mechanism.

### N-7 — `emailVerified` has no consumer beyond persistence `[SOURCE]`

`grep` finds it only in `models/user.model.ts`, `services/firebase/tokenVerifier.ts`,
`services/firebaseAuth.service.ts:258` (Firebase registration) and `services/firebaseLink.service.ts:278`
(link). It is **never read** for authorization, **never** in `toPublicUser`, **never** on the mobile
client. There is **no local verification workflow**. It is a stored copy of a Firebase claim — nothing
more. Setting it `false` when the Firebase identity is removed is therefore safe and semantically
correct, and retaining `true` would describe an identity the account no longer carries.

### N-8 — `authMethods` consumers are all absence-tolerant `[SOURCE]`

Consumers: `toPublicUser` (`auth.service.ts:232`), `requireAuth` (`authenticate.ts:155`), `GET /api/auth/me`
(which returns `req.user`), `mobile/lib/auth.tsx:117` (optional typing), `mobile/app/(app)/profile.tsx:110`
(compares `=== false`), and two mobile tests — one of which **explicitly covers `authMethods` being
absent** (`phase32k-password-capability-gating.test.tsx` case 3). Adding `firebase` is therefore
**backward compatible**: existing consumers branch on `password`, not on the key set.

### N-9 — The 32H error-mapping precedent (for the unlink matrix) `[SOURCE]`

`controllers/firebaseAuth.controller.ts`: a missing/absent service account maps to **503
`FIREBASE_NOT_CONFIGURED`**; a rejected Firebase token maps to **401 `FIREBASE_TOKEN_INVALID`**, and the
**link handler adjusts it to 400** (`:220-221`) with the same code, because `mobile/lib/client.ts` treats
a **401 or 403** on a token-bearing request as session loss. Validation failures go through
`throwValidation` → `VALIDATION_ERROR` + `fields`. Any unlink error matrix should reuse these three
decisions rather than invent new ones.

## Recommendation unchanged, with one refinement

The **policy B recommendation stands** (detach + mandatory fresh local password, replacing the retained
hash). The single refinement: because **N-1** shows the business-status question is already answered by
`requireAuth`, the *only* remaining business-status decision is whether to exempt unlink — and **no
consistency argument supports exempting it**. Five decisions remain owner-only; see the report.

## Extension status

**COMPLETE (analysis).** No owner decision taken. No production, test, model, config, dependency,
`.env`, database, Render or Console change. Nothing staged or committed.

---

# Extension II — external verification (Phase 32L, third pass)

> Same task ID (FB-007). **Research and verification only.** No production file, test, model, config,
> `.env`, dependency, database object, Firebase Console or Render change; nothing staged or committed.
> **Documentation scope note:** the brief for this pass states *"Do NOT change: SYSTEM_SPECIFICATION,
> DEVELOPMENT_ROADMAP, README, **MASTER_LOG**, **DECISIONS**, TEST_BASELINE, HANDOFF unless explicitly
> necessary and authorized."* This pass therefore writes **only this task record** — the two earlier
> passes had also written `MASTER_LOG.md` and `DECISIONS.md`, and that is deliberately **not** repeated
> here. The brief's §13 requires that scope ambiguity be **reported rather than acted on**; the
> ambiguity is recorded at the end of this section.

## Method

Evidence was taken from four sources, in descending order of authority for this project:
**(1)** the **installed dependency source** (`firebase-admin@14.4.0`, `firebase@12.19.0` /
`@firebase/auth`) — `[SDK SOURCE]`; **(2)** Firebase / Google **official documentation** —
`[FIREBASE OFFICIAL DOC]` / `[GOOGLE OFFICIAL DOC]`; **(3)** official published JSDoc shipped in the
SDK's own `.d.ts`; **(4)** public issue trackers, used only to identify *disagreements* and never as
proof. Nothing was executed and no live Firebase project was contacted.

## V-1 — `auth_time`

### V-1.1 What the claim is `[FIREBASE OFFICIAL DOC]` + `[SDK SOURCE]`

Listed in the ID Token Payload Claims table as *"Authentication time — Must be in the past. The time
when the user authenticated."* The Admin SDK's own type carries the operative sentence
(`firebase-admin/lib/auth/token-verifier.d.ts:36-44`):

> *"This value is not set when this particular ID token was created, but **when the user initially
> logged in to this session**. In a single session, the Firebase SDKs will refresh a user's ID tokens
> every hour. Each ID token will have a different `iat` value, but **the same `auth_time` value**."*

### V-1.2 ★ `getIdToken(true)` is NOT evidence of recent authentication `[SDK SOURCE]`

This is the distinction the brief asked for, and it is settled: a forced refresh produces a new `iat`
and **the same `auth_time`**. A refreshed token therefore says *"this session was authenticated at
`auth_time`"*, never *"the user just authenticated"*.

Corroborated inside the Admin SDK itself: `base-auth.js:972-981` decides revocation by comparing
`decodedIdToken.auth_time * 1000` against the user's `tokensValidAfterTime`. Firebase uses **`auth_time`**
— not `iat` — as the session's authentication moment.

### V-1.3 `reauthenticateWithCredential()` is a sign-in operation `[SDK SOURCE]`

`@firebase/auth` `esm/index-*.js:5901-5923`: `_reauthenticate` runs with
`OperationType.REAUTHENTICATE`, obtains `response.idToken`, parses it, and asserts
`user.uid === parsed.sub` — failing with `auth/user-mismatch` otherwise. So it is provably a **real
credential verification against the same Firebase user**, issued through the same sign-in path as an
ordinary sign-in. The official JSDoc states its purpose as obtaining *"tokens from recent sign-in
attempts"* (`auth-public.d.ts:2772-2778`).

### V-1.4 ★ Is the chain conclusively verified? **No.** `[EXPERIMENT REQUIRED]`

`reauthenticateWithCredential()` → fresh authentication → **updated `auth_time`** is **NOT**
established. What is proven: it is a genuine credential check; it yields a newly issued ID token that
is *expected to be accepted as recent*. What is **not** proven by any official document or SDK source:
that the Identity Toolkit backend stamps a **new** `auth_time` into that token. The Admin SDK doc's
phrase *"when the user initially logged in to this session"* is compatible with reauthentication
either updating it or not, and no official statement resolves which.

### V-1.5 A conflicting source, and why it matters less than it looks

A public `firebase-tools` issue (#3608) reports `auth_time` changing *"in lock-step with `iat`"* —
the opposite of the documented stability. **It is about the Auth/Firestore/Functions emulators**
(labels `emulators: auth`, `internal-bug-filed`), and its reproduction steps run against
`firebase emulators`. Two consequences worth keeping:

1. It does **not** refute production behaviour, so it cannot be used to justify a design either way.
2. **★ It means a local emulator experiment would give a misleading answer.** Any future
   `[EXPERIMENT REQUIRED]` must run against a **real** Firebase project, or it will measure the
   emulator's bug rather than the platform's semantics.

### V-1.6 Other caveats `[SDK SOURCE]` / `[FIREBASE OFFICIAL DOC]`

- **Cached tokens:** `getIdToken()` returns the current token if it will not expire within five
  minutes, so an unconditional read can hand back a token minted up to ~55 minutes ago.
- **Clock skew:** `auth_time` is seconds-since-epoch from Google's servers; a server-side freshness
  window must tolerate skew (a small negative allowance), and it is unaffected by our own clock drift
  beyond that tolerance.
- **Revocation:** `verifyIdToken(token, checkRevoked)` is the only revocation-aware path, and it costs
  a network round trip; our verifier passes `checkRevoked = false` by the approved Phase 32A design
  (`tokenVerifier.ts:148`), so a revoked token is **not** currently detected.
- **Provider differences:** `auth_time` is a property of the session, not of the provider, so the
  claim's *presence and meaning* are provider-independent — but whether reauthentication updates it is
  the same open question for every provider.
- **`auth_time` is discarded today:** `toVerifiedIdentity()` narrows the decoded payload to
  `{uid, email, emailVerified, signInProvider}`, so a freshness check would require widening that seam.

## V-2 — Client-side provider unlink

`[SDK SOURCE]` `esm/index-*.js:5857-5871` — the whole implementation:

```js
async function unlink(user, providerId) {
  await _assertLinkedStatus(true, userInternal, providerId);   // provider must be linked
  const { providerUserInfo } = await deleteLinkedAccounts(userInternal.auth, {
    idToken: await userInternal.getIdToken(),
    deleteProvider: [providerId]
  });
  // ... updates the local providerData
}
```

| Question | Answer | Source |
|---|---|---|
| 1. What happens on unlink? | The provider is detached from the Firebase user via `accounts:update` with `deleteProvider` | `[SDK SOURCE]` + `[GOOGLE OFFICIAL DOC]` |
| 2. Can the user still authenticate with that provider? | No | `[FIREBASE OFFICIAL DOC]` (*"they can no longer sign in with that provider"*) |
| 3. Unlinking the **last** provider? | **Not documented, and not enforced by the SDK.** There is **no client-side last-provider guard** — the only client check is `_assertLinkedStatus(true, …)` → `auth/no-such-provider`, meaning *"this provider is not linked"* | `[SDK SOURCE]` |
| 4/5. Specific error? | **None exists for "last provider"** — a full scan of the SDK's error enum finds no such code, and no official error list documents one. The provider-related codes that **do** exist: `auth/no-such-provider`, `auth/invalid-provider-id`, `auth/provider-already-linked`, `auth/credential-already-in-use`, `auth/requires-recent-login`, `auth/user-mismatch` | `[SDK SOURCE]` |
| 6. Is last-provider enforcement documented officially? | **No.** Repeated targeted searches of Firebase/Google documentation returned no statement. The project's specification asserts Firebase refuses it — that assertion is **`[EXTERNAL VERIFICATION REQUIRED]`** | — |
| 7. Provider differences? | Unlink is provider-agnostic in the SDK; only the provider ID differs. Whether a *last-provider* rule applies may depend on what remains (e.g. password vs. federated), which is **`[EXPERIMENT REQUIRED]`** | `[INFERENCE]` |
| 8. Does unlink delete the Firebase user? | **No** | `[FIREBASE OFFICIAL DOC]` + `[SDK SOURCE]` (returns a `User`) |
| 9. Does the UID change? | **No** — the UID is unchanged by unlinking | `[FIREBASE OFFICIAL DOC]` + `[INFERENCE]` from the returned `user.uid` |
| 10. Signing in again with the unlinked provider | **Creates a new, separate Firebase user with a new UID** | `[FIREBASE OFFICIAL DOC]` |

**★ The client path carries an end-user `idToken`.** That is why Firebase's own policy checks (including
any recency threshold) can apply to it, and it is the asymmetry the next section turns on.

## V-3 — Admin SDK `providersToUnlink`

`[SDK SOURCE]` `firebase-admin@14.4.0`:

- `auth-config.d.ts:158-160` — `providersToUnlink?: string[]`, *"Unlinks this user from the specified
  providers."*
- `auth-api-request.js:1215-1224` — validates it is an array of non-empty strings, else
  `INVALID_ARGUMENT`.
- `auth-api-request.js:1265-1271` — **translated to `deleteProvider: [...]`**.
- `auth-api-request.js:632` — sent to **`FIREBASE_AUTH_SET_ACCOUNT_INFO`, `/accounts:update` (POST)**.

`[GOOGLE OFFICIAL DOC]` the `accounts.update` reference: `deleteProvider[]` is *"The Identity Providers
to unlink from the user's account"*, and `localId` *"requires a Google OAuth 2.0 credential with proper
permissions"* (`firebaseauth.users.update`).

| Question | Answer | Source |
|---|---|---|
| 1. What it does | Same backend effect as the client's unlink (`deleteProvider` on `accounts:update`) | `[SDK SOURCE]` + `[GOOGLE OFFICIAL DOC]` |
| 2. Same as client-side? | **Same effect, different authority route**: Admin uses `localId` + service-account OAuth; the client presents an end-user `idToken` | `[GOOGLE OFFICIAL DOC]` |
| 3. **★ Last provider?** | **Not documented to be refused.** No Admin-side guard exists; enforcement, if any, is backend policy | `[SDK SOURCE]` + `[EXPERIMENT REQUIRED]` |
| 4. Errors | SDK-side `invalid-argument` for a malformed array; `INVALID_PROVIDER_ID` for provider-ID problems; otherwise the backend's error is surfaced. **No last-provider code exists** | `[SDK SOURCE]` |
| 5. Affects existing sessions? | **Not documented to.** Not in the documented refresh-token expiry triggers (see V-4) | `[FIREBASE OFFICIAL DOC]` + `[INFERENCE]` |
| 6/7. Does it invalidate refresh tokens? | Not documented; `revokeRefreshTokens(uid)` exists **separately** and is the documented mechanism. The same SDK's `providerToLink` doc warns that *linking* does not invalidate the refresh token — a caution, not proof, for unlinking | `[FIREBASE OFFICIAL DOC]` |
| 8. Does unlink invalidate ID tokens? | ID tokens are stateless JWTs valid until `exp`; revocation is detected only via `checkRevoked` or by comparing `auth_time` to `tokensValidAfterTime`. Nothing in the SDK ties unlink to token invalidation | `[SDK SOURCE]` + `[FIREBASE OFFICIAL DOC]` |
| 9. ★ **★ What this changes** | **A server-side unlink is an *administrator* operation and therefore does not inherit the end-user recency threshold.** If the owner wants recency on unlink, it must be enforced by us — it cannot be delegated to Firebase on the admin path | `[GOOGLE OFFICIAL DOC]` + `[INFERENCE]` |

## V-4 — Token and session behaviour

`[FIREBASE OFFICIAL DOC]` Refresh tokens expire **only** when **the user is deleted**, **the user is
disabled**, or **a major account change is detected — *"events like password or email address
updates"***. **Provider unlink is not among them.** That is the closest official answer available, and
it points to: **unlink does not, by itself, invalidate refresh tokens.** `[EXPERIMENT REQUIRED]` to
confirm.

`[SDK SOURCE]` `revokeRefreshTokens(uid)` → the Admin SDK's `revokeRefreshTokens` → sets `validSince`
on the user (the REST field documented as *"the minimum timestamp in seconds for an Identity Platform
ID token to be considered valid"*). `base-auth.js:972-981` then rejects any token whose
**`auth_time < tokensValidAfterTime`**.

**★ Architectural consequence, and it is a useful one:** because revocation keys on `auth_time` — the
session's *initial* authentication — a `revokeRefreshTokens` call at unlink time invalidates every
Firebase session this user holds, regardless of how recently their tokens were refreshed. If a future
phase ever wants to sever Firebase sessions as part of unlinking, `revokeRefreshTokens` is the tool,
and it is available (unused) in the installed Admin SDK.

Also `[FIREBASE OFFICIAL DOC]`: *"Password resets also revoke a user's existing tokens; however, the
Firebase Authentication backend handles the revocation automatically."* Our unlink sets a **local**
Inventory AI password (bcrypt, in Mongo) and does not touch Firebase's password, so **no automatic
Firebase-side revocation applies to our unlink.**

## V-5 — Re-sign-in after unlink

`[FIREBASE OFFICIAL DOC]`, verbatim: *"If a user signs in again with the same provider after it has
been unlinked, Firebase creates a new, separate user account instead of restoring link to the original
account."* UID changes; the old Firebase identity is abandoned.

**Inventory AI consequence.** If Mongo has already cleared the old `firebaseUid`, the new Firebase
identity resolves to no Mongo user, so `POST /api/auth/firebase/exchange` answers
**`REGISTRATION_REQUIRED`** — and a subsequent attempt to register answers **`409 EMAIL_IN_USE`**,
because the Inventory AI account still holds that address. The way back is the **explicit link** from a
password-authenticated session (`POST /api/auth/firebase/link`, CASE C — the identity belongs to nobody
in Mongo), never an e-mail match. **The e-mail is not a join key, and nothing here changes that.**

## V-6 — Sequencing, re-evaluated against this evidence

| Order | Consequence, given V-2/V-5 |
|---|---|
| **Server unlink → revoke → Firebase sign-out → *optional* provider unlink** | Every step after the authoritative one is optional or recoverable. A failed provider unlink leaves a stale Firebase identity that Mongo no longer resolves — **harmless**, and re-linkable later by explicit link |
| **Firebase provider unlink → server unlink** | ★ If the server step then fails, Mongo holds a `firebaseUid` whose Firebase user can **never** be re-entered, because signing in again mints a **new** UID (V-5). Recovery requires an operator. **The failure is not the provider unlink — it is doing it first** |

## V-7 — Open `[EXPERIMENT REQUIRED]` items, ranked

1. **★ Does `reauthenticateWithCredential()` produce a token with a fresh `auth_time`?** Decides whether
   Option C/D is viable. **Must be measured against a real Firebase project — an emulator would be
   misleading (V-1.5).**
2. Does the Identity Toolkit backend refuse `deleteProvider` when it would remove the **last** provider,
   and with what error? (client path and admin path may differ — V-2 vs V-3.)
3. Does a provider unlink invalidate existing **refresh tokens** in production? (V-4.)
4. Does `providersToUnlink` honour any last-provider rule on the admin path?
5. Does a post-unlink sign-in with the same provider really mint a new UID **in our project**? (V-5.)

## Extension II status

**COMPLETE (research).** No owner decision taken, no code, no dependency, no Console, no database, no
Render, no commit, no push. **Files written: this task record only** (plus the two report artefacts the
brief asked for in the response itself).

**Scope ambiguity reported, not resolved (per the brief's §13):** the brief's list of files not to change
includes `MASTER_LOG.md` and `DECISIONS.md`, which the **first two passes had already updated as this
task's own ledger**. This pass therefore did **not** touch them, so `MASTER_LOG.md` and `DECISIONS.md`
now describe FB-007 **through the second pass only** and do not mention V-1…V-7. If the audit trail is
expected to be continuous, that gap needs an explicit instruction — it is not resolved here.

---

# Extension III — real Firebase runtime external verification experiment (Phase 32L, third pass)

**Status: COMPLETE.** This pass **ran the experiment** Extensions I–II kept marking `[EXPERIMENT REQUIRED]`.
It is still read-only w.r.t. the repository — **no application source, test, schema, model, config, `.env`,
dependency, Console or MongoDB change** — and it produced **no commit and no push**.

Everything labelled `[EXPERIMENT]` below was **observed**, not inferred. The throwaway accounts were
created with the Admin SDK and deleted in a `finally` block; a `listUsers` sweep afterwards reported the
project holds **5 users total and 0 accounts matching the `fb32l-*` test prefix (CLEAN)**.

## Environment `[EXPERIMENT]`

| Item | Value |
| --- | --- |
| Firebase project | `inventoryai-d0d20` — the **real** project, **no emulator** |
| Admin SDK | `firebase-admin` 14.4.0 |
| Client SDK | `firebase` (Firebase JS SDK) 12.19.0 — the same version the mobile app ships |
| Runtime | Node v26.7.0 on Windows, loading the repo's own installed SDKs via `createRequire` |
| Credentials | the project's existing server service account + the mobile Web API key, read from `.env` at runtime, **never printed** |
| Test accounts | `fb32l-verify-*`, `fb32l-recency-*`, `fb32l-calib-*` @ `example.com`, created via Admin SDK, deleted at the end |
| Device | none — the client SDK was run headless in Node; **no APK, emulator or physical device was used** |

## A — `auth_time` vs token refresh `[EXPERIMENT]` (answers V-1.1)

Two independent runs, identical shape:

| Stage | run 1 | run 2 |
| --- | --- | --- |
| `auth_time` immediately after sign-in | 1790159210 | 1790159377 |
| `auth_time` after `getIdToken(true)` (forced **refresh**, 6 s later) | **1790159210 (unchanged)** | **1790159377 (unchanged)** |
| `iat` after that refresh | 1790159216 (**moved**) | 1790159383 (**moved**) |
| `auth_time` after `reauthenticateWithCredential()` + fresh token | **1790159219 (+9 s)** | **1790159386 (+9 s)** |

**★ Conclusion.** `reauthenticateWithCredential()` **does** produce a token carrying a **new** `auth_time`,
while a plain forced refresh leaves `auth_time` untouched and only moves `iat`. The 9-second delta matches
the deliberate idle between the two steps, so it is a real re-stamp and not clock drift. **V-1.1 is no
longer open: Option B/C/D are server-verifiable in principle.**

## B — Client `unlink()` of the **last** provider `[EXPERIMENT]` (answers V-1.2)

On an account whose **only** provider was `password`:

* `unlink(user, 'password')` **SUCCEEDED** — there is **no** last-provider refusal and **no**
  `auth/requires-recent-login`.
* `providerData` afterwards: **`(none)`** — the Firebase account was left with **zero** providers.
* Repeating the operation answered **`auth/no-such-provider`**.

The long-held belief that "Firebase refuses to remove the last provider" is **refuted for this project and
this SDK version** on the client path. Consistent with N-5: the installed SDK contains no last-provider
error code at all.

## ★ C — Recency is **not** enforced on unlink, but *is* on `updatePassword` `[EXPERIMENT]`

This is the finding that most changes the decision, so it was measured twice — once as the target and once
as a calibration control, under identical conditions (same project, same SDK, same 390-second idle, same
cached-token technique).

| Operation (session age **390 s**, past Firebase's ~5-minute window) | Result |
| --- | --- |
| **F — `unlink(user, 'password')`** | **SUCCEEDED** → *no* recent-auth requirement on provider unlink |
| **G — `updatePassword(user, …)`** (documented sensitive op) | **REFUSED `auth/requires-recent-login`** |

**Why the calibration matters.** Without G, F's success could have meant "the harness never produces a
stale session". G proves the opposite: at the *same* age, the **same** harness **does** observe recency
enforcement — for a different operation. The negative on `unlink` is therefore a genuine property of
Firebase, not a measurement artefact. **Firebase does not back the unlink recency requirement; a server
that wants one must enforce it itself.**

## D — Session / refresh-token behaviour after provider unlink `[EXPERIMENT]` (answers V-1.3)

| Action | Effect on the still-signed-in client session |
| --- | --- |
| Admin `providersToUnlink(['password'])` | **None** — the client's forced ID-token refresh **SUCCEEDED**, `auth_time` unchanged |
| Sign in again with the now-removed password | **FAILED `auth/invalid-credential`** |
| Admin `updateUser({ password })` (**by contrast**) | **Invalidates** — the existing session's next refresh **FAILED `auth/user-token-expired`** |

**★ Two distinct consequences.** *(i)* Provider unlink leaves the Firebase **refresh token alive**, so an
unlinked account keeps a working Firebase session until it is explicitly signed out or its refresh tokens
are revoked — the server-side unlink alone does not end it. *(ii)* Writing a password from the admin side
**does** revoke refresh tokens, which is directly relevant to Phase 32L §11 ("a local password is
established"): on the Firebase side that is a **revoking** event, and it is the opposite of the unlink
behaviour just above.

## E — Admin SDK `providersToUnlink` `[EXPERIMENT]` (answers V-1.3/V-1.4)

`updateUser(uid, { providersToUnlink: ['password'] })` on the **last** provider **SUCCEEDED**:
`providerData` became empty, the **UID was unchanged**, the **account persisted**, and its **email was
retained**. The admin path therefore behaves like the client path — **no last-provider rule on either**.
(Mirrors N-3: the Admin SDK rewrites this into Identity Toolkit `accounts:update`'s `deleteProvider`,
whose Google REST reference documents no such restriction.)

## F — Re-sign-in / re-registration after unlink `[EXPERIMENT]` + `[EXTERNAL VERIFICATION REQUIRED]` (V-1.5)

With the account left holding **zero** providers:

* The Firebase account **persists** — same UID, `disabled: false`, email retained.
* Admin `createUser({ email, … })` with the **same** email → **REFUSED `auth/email-already-exists`**.
* Client `createUserWithEmailAndPassword` with the **same** email → **REFUSED `auth/email-already-in-use`**.

**So for email/password a same-email re-registration does _not_ mint a new UID** — the original record
still owns the address. The documented "a new Firebase account is created when you sign in again with an
unlinked provider" behaviour belongs to the **federated** path, where `signInWithIdp` carries
`autoCreate` — the SDK's reauthentication resolver explicitly sets `autoCreate = false` while the sign-in
resolver does not `[SDK SOURCE]`. **A live Google credential was not available, so the federated case was
not exercised: `[EXTERNAL VERIFICATION REQUIRED]`, unchanged from Extension II (V-5).**

## Observed Firebase error catalogue `[EXPERIMENT]`

`auth/no-such-provider` · `auth/requires-recent-login` (**`updatePassword` only — not `unlink`**) ·
`auth/invalid-credential` (sign-in after unlink) · `auth/email-already-exists` (admin) ·
`auth/email-already-in-use` (client) · `auth/user-token-expired` (after an admin password write).

## What this changes for the Phase 32L decision

1. **Recency.** Option **A** is *sufficient* if the owner accepts no freshness requirement, because
   Firebase will not supply one — `unlink` is simply not gated. Option **B/C/D** are *technically sound*
   if a freshness requirement is wanted, because `auth_time` is server-verifiable and is genuinely reset by
   `reauthenticateWithCredential()`. **The evidence decides feasibility, not policy** — which of A/B/C/D
   is adopted remains an owner decision.
2. **Sequencing.** Server-first is **reinforced**: an unlink leaves the Firebase refresh token alive, so
   the Firebase side is the step that can be safely repeated or skipped, and doing it first would strand a
   `firebaseUid` the server can no longer resolve.
3. **Session revocation.** Revoking Inventory AI sessions does **not** end the Firebase session; ending
   that needs an explicit client sign-out and/or Admin `revokeRefreshTokens(uid)`.
4. **Zero-method end-state.** Both unlink paths can leave a Firebase account with **no** provider at all.
   The last-method invariant is therefore **entirely the server's to uphold** — nothing in Firebase refuses it.
5. **Email is still not a join key.** Nothing observed resurrects the old account by address, which is
   consistent with the standing rule.

## Extension III status

**COMPLETE (runtime experiment).** Repository untouched apart from this task record; protected files
byte-identical; **no commit, no push, no reset/clean/stash**; no Console, MongoDB or Render change; no
credential ever printed; all throwaway test accounts deleted and verified absent.

---

## Decision freeze

The open questions raised here were closed by a separate decision-freeze pass:

> **`FB-007-phase-32l-decision-freeze.md`** — the binding Phase 32L architecture (Options D, Policy B, the
> unlink invariants and the reset-token race contract). **Implementation follows that record, not this one.**

This record remains the audit; it is **not** superseded as evidence.
