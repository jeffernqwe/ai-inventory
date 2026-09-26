# Firebase Authentication — Architecture & Console Runbook

**Phase:** 32A
**Date:** 2026-09-18
**Status:** Design — awaiting owner review. **No implementation is authorised by this document.**
**Scope:** Documentation only. This phase changes no source code, no dependency, no configuration,
no environment variable, no database record, and no authentication behaviour.

> **Current status (2026-09-20).** This document is still the design authority, and its scope line
> above describes **Phase 32A**, not the phases that followed. **Option B** (§5) is the selected
> architecture, and Phases 32B–32E have since implemented it for email/password (§21, roadmap §27H).
> **Phase 32F** recorded the multi-provider decisions in **§14A**, which is **authoritative for the
> current state of the register** — what is resolved, what is open, and what is implemented. Where §14
> and §14A differ in emphasis, §14A is current. **Google Sign-In, Facebook Login, Apple Sign-In,
> account linking, account unlinking and invitations remain unimplemented**, and no provider SDK is
> installed.

---

# 1. Purpose

This document specifies how Firebase Authentication will be introduced into Inventory AI as an
**external identity provider**, while the existing MongoDB `User` + JWT + `Session` system remains the
application's authentication and session layer.

It exists because Phase 32 is the first phase to touch authentication since Phase 03, and the
authentication stack has since acquired properties that are easy to destroy by accident: real
server-side session revocation (Phase 26A), a cross-layer RBAC contract pinned in both directions
(Phases 22–24), and a password-recovery path with its own mail layer and token store (Phases 26B/27).
The purpose of writing the design down first is to make explicit **which of those properties are
preserved, which are adapted, and which are at risk** before a single line of code is written.

The owner has selected **Option B** (§5). This document records that decision and its consequences.
It does not reopen it.

---

# 2. Current authentication architecture (as implemented)

Everything in this section describes code that exists today and was read directly from the
repository while writing this document. Nothing here is aspirational.

> **Updated by Phase 32F (2026-09-20).** This section is the **pre-Firebase** baseline as Phase 32A
> recorded it. Phases 32B–32E have since changed two things it states, marked inline below: the three
> additive `users` fields, and `passwordHash` becoming optional. The superseded wording is kept beside
> the correction rather than overwritten, so the delta stays visible.

## 2.1 Identity — MongoDB `users` collection

`server/src/models/user.model.ts`.

| Field | Type | Notes |
| --- | --- | --- |
| `businessId` | ObjectId → `Business` | **required**, indexed. The tenant key. |
| `name` | String | **required**, trimmed |
| `email` | String | **required**, `unique`, lowercased, trimmed, regex-validated. A single global person identity — login is platform-wide, not per-business. |
| `passwordHash` | String | **`required: false`** (Phase 32B — was `required`), `select: false` — never returned by default |
| `firebaseUid` | String | **added by Phase 32B.** `unique`, **`sparse: true`**. At most one account per Firebase identity; any number may have none. Sparse is mandatory — the index cannot be built once two accounts lack the field. |
| `emailVerified` | Boolean | **added by Phase 32B.** `default: false`, persisted from the verified Firebase token claim and **not enforced** — no authorization decision reads it. |
| `role` | String | enum `OWNER` \| `ADMIN` \| `MANAGER` \| `STAFF`, default `STAFF` |
| `status` | String | enum `ACTIVE` \| `DISABLED`, default `ACTIVE` |
| `passwordChangedAt` | Date | default `null`; the Phase 15 token-invalidation anchor |

Indexes: `{businessId, role}`, `{businessId, status}`, `{businessId, createdAt: -1, _id: -1}`,
plus the unique index on `email` and the **sparse unique index on `firebaseUid`**.

Credentials are bcrypt via `bcryptjs` at `BCRYPT_ROUNDS = 10`
(`server/src/services/auth.service.ts`). The hash is produced in exactly two places:
`registerBusinessOwner()` and the admin-side create in `server/src/services/users.service.ts`. An
account created through Firebase receives **no hash at all** — the API accepts no password on that
path — which is why `required` had to become `false` in Phase 32B.

## 2.2 Session — MongoDB `sessions` collection

`server/src/models/session.model.ts`. Added by Phase 26A.

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | ObjectId → `User` | required — scopes the row to its owner |
| `jti` | String | required, **unique** — the token's `jti` claim |
| `deviceLabel` | String | cosmetic only; normalized and capped, never used in a decision |
| `lastUsedAt` | Date | default `null`; "opened but not used yet" |
| `revokedAt` | Date | default `null`. **Not a hard delete** — a revoked row is kept so it cannot be silently re-created |
| `expiresAt` | Date | required; mirrors the token's own `exp` |

Indexes: `{userId, revokedAt}` for the liveness/list query, and a TTL index on `{expiresAt}` with
`expireAfterSeconds: 0`. The TTL sweep is eventual (~60s), so the liveness query filters on
`expiresAt` itself and never depends on the sweep having run.

**The row carries no authorization data — no role, no `businessId`.** That is deliberate: role and
tenant context are reloaded from the `User` on every request, so a stale session row can never widen
what its owner may do.

## 2.3 Token — HS256 JWT

`server/src/config/jwt.ts`.

```ts
export type AccessTokenClaims = { sub?: string; jti?: string; iat?: number; exp?: number };
export function signAccessToken(userId: unknown, jti: string): string
export function verifyAccessToken(token: string): AccessTokenClaims
export function decodeAccessToken(token: string): AccessTokenClaims | null
```

- `sub` = the MongoDB `User._id`.
- `jti` = the id of the `sessions` row the token names. **Mandatory, and a required argument rather
  than a default** — a caller that forgets it fails loudly at mint time instead of silently producing
  an unrevocable token.
- **Role and business are never claims.** The token is deliberately narrower than jsonwebtoken's own
  `JwtPayload` (which carries an `[key: string]: any` index signature under which a typo like
  `payload.jit` type-checks as `any`).
- Algorithm pinned to `HS256` on both sign and verify.
- Lifetime from `JWT_EXPIRES_IN` (default `7d`).

## 2.4 The authentication choke point

`server/src/middlewares/authenticate.ts` — `requireAuth`. Every protected request traverses these
checks **in this order**:

| # | Check | Failure |
| --- | --- | --- |
| 1 | `Bearer` scheme and a token are present | 401 `AUTH_REQUIRED` |
| 2 | `verifyAccessToken` (HS256 pinned) | 401 `INVALID_TOKEN` |
| 3 | `sub` is a valid ObjectId | 401 `INVALID_TOKEN` |
| 4 | `jti` is a non-empty string — **every pre-26A token dies here** | 401 `INVALID_TOKEN` |
| 5 | `User.findById(...).select('name email role status businessId passwordChangedAt')` | 401 `AUTH_REQUIRED` |
| 6 | `status === 'ACTIVE'` | 403 `ACCOUNT_DISABLED` |
| 7 | `iat >= floor(passwordChangedAt / 1000)` (strict `<` rejects) | 401 `SESSION_INVALIDATED` |
| 8 | `findActiveSessionByJti(jti)` exists **and** `session.userId === user._id` | 401 `SESSION_REVOKED` |
| 9 | `assertActiveBusiness(user.businessId)` | 403 — business missing / `SUSPENDED` / `ARCHIVED` |
| 10 | `touchSession(session)` — best-effort, after every rejection point | — |

It then attaches:

```ts
req.user = { id, businessId, name, email, role, status }   // businessId + role ALWAYS from the DB
req.auth = { sessionId, jti }                              // separate, so the public user DTO is unchanged
```

`passwordHash` is never loaded here.

## 2.5 Authorization

`server/src/middlewares/authorize.ts` exports `requirePermission(permission)` and
`requireRole(...roles)`, both reading only `req.user.role` and both running **after** `requireAuth`.

`server/src/constants/roles.ts` holds the catalogue: 4 roles (`OWNER`, `ADMIN`, `MANAGER`, `STAFF`),
**21 permission keys**, the `ROLE_PERMISSIONS` matrix, `hasPermission(role, permission)`, and
`CATALOGUE_ONLY_PERMISSIONS` = `business.manage`, `roles.manage`, `transactions.view` (granted to
roles but implemented by no endpoint — metadata for the regression guard only, never imported by
`authorize.ts`).

`mobile/lib/permissions.ts` re-declares the whole catalogue and matrix, and Phase 23 pins the mirror
to the server copy in lock-step, comparing roles, all 21 keys **and values**, and every role's grant
set.

## 2.6 Route inventory

Phase 23 classifies **68 routes**: **47 permission-gated**, **11 authenticated**, **10 public**,
**0 role-gated**. The `PUBLIC` and `AUTHENTICATED` buckets are explicit lists that each carry a
written reason; a route in no bucket fails the guard, and a declared exemption that has stopped being
true also fails. There is deliberately **no route-count assertion**.

> **Updated by Phase 32F (2026-09-20).** Phase 32A recorded this as "60 routes: 47 gated, 7
> authenticated, 6 public". Phase 26A added three authenticated routes, Phase 26B-3 added two public
> ones and **Phase 32C added the two Firebase public routes below** — 47 + 10 + 10 = 67, the total as
> of Phase 32F. The gated tier is unchanged at 47 throughout, which is the property that matters: no
> provider work has added or moved a permission-gated route.
>
> **Phase 32H added one authenticated route, `POST /api/auth/firebase/link`** (§14B.1) —
> 47 + 11 + 10 = **68**, the current total. *(Corrected 2026-09-22, documentation only, no behaviour
> change: the 67 figure was correct through Phase 32C and was not updated when Phase 32H added the
> authenticated link route.)*

The auth surface (`server/src/routes/auth.routes.ts`):

| Method | Path | Chain |
| --- | --- | --- |
| POST | `/api/auth/register` | register limiter → controller |
| POST | `/api/auth/login` | account limiter → IP limiter → controller |
| POST | `/api/auth/forgot-password` | account limiter → IP limiter → controller |
| POST | `/api/auth/reset-password` | confirm limiter → controller |
| POST | `/api/auth/firebase/exchange` | firebase exchange limiter → controller |
| POST | `/api/auth/firebase/register` | firebase register limiter → controller |
| GET | `/api/auth/me` | `requireAuth` |
| PATCH | `/api/auth/me` | `requireAuth` |
| POST | `/api/auth/change-password` | `requireAuth` |
| POST | `/api/auth/logout` | `requireAuth` (sign-out-everywhere is this route with `{all:true}`) |
| GET | `/api/auth/sessions` | `requireAuth` |
| DELETE | `/api/auth/sessions/:id` | `requireAuth` |
| POST | `/api/auth/firebase/link` | `requireAuth` (Phase 32H) |

Both Firebase routes are **public** and declared with their reasons in the Phase 23 guard: a caller
exchanging an ID token holds no Inventory AI JWT by definition, which is what the exchange exists to
remedy, and registration assigns `businessId` and `role` server-side. **Neither takes a provider
identity from the request body** — the UID comes from the verified token (§14A, R-2).

Rate limiting lives in `server/src/middlewares/rateLimit.ts`. The two **login** limiters are the only
ones carrying `skipSuccessfulRequests: true`. The three recovery limiters deliberately **omit** it,
because the success path and the silent no-op are both a 202 — skipping 2xx would disable the limiter
entirely. Both facts are guarded by tests. All limiter stores are **in-memory and per-process**
(a known, accepted limitation recorded as E3).

## 2.7 Mobile session layer

`mobile/lib/auth.tsx` — `AuthProvider` / `useSession()`, exposing
`{ user, token, status, signIn, signUp, signOut, signOutEverywhere, refresh, clearSession }`.

- The **JWT is the only thing persisted**, in `expo-secure-store` under
  `TOKEN_KEY = 'inventoryai.auth.token'`.
- The user object is **always re-fetched** from `GET /api/auth/me` on boot — never restored from a
  cache — so role/status/businessId reflect the server.
- `lib/client.ts` attaches `Authorization: Bearer <token>` and, on a 401/403 from a request that
  **carried** a token, invokes a single `sessionLostHandler` registered by `AuthProvider`. That one
  place decides what a refused token means; no screen re-derives it.
- `(app)/_layout.tsx` renders nothing while `status === 'loading'`, then `<Redirect href="/login" />`
  unless `signedIn`.
- Route files are **TypeScript** (`.tsx`/`.ts`), `tsconfig.json` present, `npm run typecheck` =
  `tsc --noEmit`. *(CLAUDE.md §2 still records "JavaScript" — stale.)*

## 2.8 Password recovery (Phases 26B / 27)

Provider-agnostic mail boundary at `server/src/services/mail/` reached through `isMailConfigured()`,
`mailProviderName()` and `sendPasswordResetEmail({to, resetUrl, expiresInMinutes})`. Resend is the
only builtin transport. A `password_reset_tokens` collection stores `userId`, `tokenHash`,
`expiresAt`, `usedAt` and nothing else — the raw 32-byte token is emailed and **never persisted**.
Single use is one conditional `findOneAndUpdate`; `usedAt` is never unset (fail-closed). Two public
routes, `MAIL_NOT_CONFIGURED` as a **pre-lookup** 503, a uniform 202 on every non-error path, and
Phase 28's detached (unawaited) send. Mobile has `/forgot-password` and `/reset-password` screens and
the custom scheme `inventoryai://reset-password`.

## 2.9 Mobile build configuration (Phase 30A)

- Expo SDK `~57.0.23`, React Native `0.86.3`, React `19.2.3`, `expo-dev-client ~57.0.19`.
- `app.json`: `scheme: "inventoryai"`, `ios.bundleIdentifier` and `android.package` both
  `com.inventoryai.app`, plugins `expo-router`, `expo-secure-store`, `expo-camera`. **No
  `googleServicesFile` anywhere.**
- `eas.json`: profiles `development` (dev client, internal, APK), `ios-simulator`, `preview`,
  `production`; `cli.appVersionSource: "remote"`; **no `channel` key**; `expo-updates` deliberately
  not installed.
- EAS project `@jeffernqwes-team/inventory-ai`, id `607eca05-1175-43ed-86a0-1829e91c9531`.
- **No EAS build, submit or prebuild has ever been executed.** The Phase 30A foundation is statically
  validated only.

---

# 3. Proposed Firebase architecture

Firebase Authentication becomes the **external identity provider**. Inventory AI's existing JWT +
`Session` remains the **application session**. The Firebase ID token is used exactly once, to obtain
an application session, and never becomes the API credential.

## 3.1 Data-flow diagram

```text
  ┌──────────────────────────────────────────────────────────────┐
  │  Expo app (mobile)                                           │
  │                                                              │
  │   login.tsx / register.tsx / Google button                   │
  │        │                                                     │
  │        ├─ email + password ──► Firebase SDK sign-in          │
  │        └─ Google account   ──► Firebase SDK sign-in          │
  └────────┬─────────────────────────────────────────────────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Firebase Authentication  (external, Google-operated)        │
  │   owns: password storage, password verification,             │
  │         email verification state, Google federation,         │
  │         the token-signing keys                               │
  └────────┬─────────────────────────────────────────────────────┘
           │  Firebase ID token  (JWT signed by Google, ~1h)
           │  ── short-lived ── used ONCE ── never an API credential
           ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  POST /api/auth/firebase/exchange   { idToken, deviceLabel }  │
  │  PUBLIC route — no requireAuth (the caller has no session yet)│
  │                                                              │
  │   1. rate limiter                                            │
  │   2. firebase-admin  verifyIdToken(idToken)                  │
  │        → signature, exp, issuer, audience(projectId)         │
  │        → { uid, email, email_verified, sign_in_provider }    │
  │   3. User.findOne({ firebaseUid: uid })                      │
  │        └─ null → 200 REGISTRATION_REQUIRED  (not a 404)      │
  │   4. user.status === 'ACTIVE'   else 403 ACCOUNT_DISABLED    │
  │   5. assertActiveBusiness(user.businessId)                   │
  │   6. newSessionId() → signAccessToken(user._id, jti)         │
  │      createSessionForToken(...)        ← Phase 26A, unchanged│
  │   7. → { token, user: toPublicUser(user) }                   │
  └────────┬─────────────────────────────────────────────────────┘
           │  Inventory AI access token  (HS256, 7d, ours)
           ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Mobile stores it in SecureStore under the SAME key          │
  │  'inventoryai.auth.token'  — no mobile storage change        │
  └────────┬─────────────────────────────────────────────────────┘
           │  Authorization: Bearer <app JWT>
           ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  requireAuth  →  requirePermission  →  controller            │
  │  server/src/middlewares/authenticate.ts                      │
  │  ── ZERO LINES CHANGED BY PHASE 32 ──                        │
  └────────┬─────────────────────────────────────────────────────┘
           │
           ├──► MongoDB   (businessId from the User record, never the client)
           └──► AI service → controlled tools → MongoDB
```

## 3.2 What Firebase owns, and what it does not

| Concern | Owner after Phase 32 |
| --- | --- |
| Password storage and verification | **Firebase** (for Firebase-native accounts; legacy hash retained during migration) |
| Email + password sign-in | **Firebase** |
| Google federation | **Firebase** |
| Email verification *state* | **Firebase** |
| ID token signing / refresh | **Firebase** |
| **Application** session issuance | **Inventory AI** |
| **Session revocation** (per-device and all-device) | **Inventory AI** |
| **Role, permission, RBAC** | **Inventory AI** — nothing migrates to Firebase |
| **Tenant (`businessId`) isolation** | **Inventory AI** |
| Business lifecycle (`ACTIVE`/`SUSPENDED`/`ARCHIVED`) | **Inventory AI** |
| Audit trail | **Inventory AI** |
| Business/user records | **MongoDB** — Firebase is not the application datastore |

**Firestore is not introduced.** Firebase is used for identity only.

---

# 4. Non-negotiable invariants

These hold for every phase of 32 and are the acceptance criteria for the design.

1. **The Firebase ID token is never an API credential.** It is accepted at exactly one route, which
   exchanges it. No other route, middleware or service may verify or trust it.
2. **`requireAuth` is unchanged.** Check order, error codes (`AUTH_REQUIRED`, `INVALID_TOKEN`,
   `ACCOUNT_DISABLED`, `SESSION_INVALIDATED`, `SESSION_REVOKED`) and the `req.user` / `req.auth`
   shapes stay byte-identical. Phases 23 and 24 pin all three.
3. **`businessId` comes from the MongoDB `User` record.** Never from a request body, query parameter,
   header, or token claim.
4. **`firebaseUid` is read only from `verifyIdToken`'s verified payload.** A `firebaseUid` in a
   request body is ignored — and a test must prove it is ignored (§15).
5. **`role` and `permission` are never accepted from the client and never stored in Firebase.**
6. **Nothing about RBAC changes.** 4 roles, 21 permission keys and their exact values,
   `ROLE_PERMISSIONS`, `CATALOGUE_ONLY_PERMISSIONS`, and the mobile mirror all stay as they are.
7. **No password, hash, ID token or service-account credential is ever logged or returned.**
8. **The legacy password path is not removed or weakened** (§10).
9. **`assertActiveBusiness` still runs on every authenticated request.**
10. **Every pre-existing protected route keeps working, unchanged.**

---

# 5. Option B rationale

Three architectures were evaluated against this codebase specifically.

## Option A — Firebase completely replaces the current mechanism

Delete `sessions`, `session.service.ts`, `jwt.ts` and all of Phase 26A; the mobile client sends the
Firebase ID token as the `Bearer` credential and `requireAuth` verifies it with the Admin SDK.

**Rejected.** It removes per-device revocation, sign-out-everywhere, the Active Sessions screen and
`SESSION_INVALIDATED`; revocation degrades to either `verifyIdToken(token, true)` — a network
round-trip to Google **on every request** — or up to an hour of unchecked staleness. It still requires
the MongoDB lookup for role and `businessId`, so it is *more* work per request, not less. It breaks
the Phase 03/14A/26A/26B suites wholesale, since they mint and assert application JWTs. Net effect: a
**security downgrade** traded for less code.

## Option C — Firebase ID tokens used directly for API authentication

As A, but retaining the MongoDB user mapping. Identical revocation weakness. Firebase ID tokens live
~1h, so the client must call `getIdToken()` before requests and the expired-token path becomes
load-bearing on every screen. It still discards the session layer, for no compensating gain.

## Option B — Firebase is the identity provider; the existing JWT + Session is the application session ✅

**Selected.**

Why it is correct *for this repository*:

- **It preserves the strongest security asset in the codebase.** Phase 26A's session layer provides
  immediate, per-device, server-enforced revocation — a granularity Firebase does not offer. A and C
  trade it away; B keeps it and gains federated identity on top.
- **The blast radius is one new public route and one new service.** `requireAuth` changes by zero
  lines. All 47 permission-gated routes, all 4 roles, all 21 permission keys, the `businessId`
  derivation, the Phase 23 route classification and every RBAC / tenant-isolation test are untouched.
- **Authorization stays database-derived and per-request** — the Phase 03/24 property that a stale
  credential can never widen what its holder may do.
- **Failure isolation is favourable.** If Firebase is unreachable, new sign-ins fail but every
  outstanding application JWT keeps working: users already signed in stay productive.
- **No role/permission knowledge enters Firebase**, satisfying the requirement not to duplicate the
  business/role/permission system.

**Accepted trade-offs, stated plainly:**

- Two credentials exist on the device — Firebase's refresh token (in Firebase's own storage) and our
  application JWT (in SecureStore). **Logout must clear both**, or a surviving Firebase session
  silently re-exchanges.
- An application JWT (7d) outlives the Firebase ID token (~1h). That is safe because authorization is
  re-derived per request and revocation is ours — but it means a *deleted Firebase account* does not
  take effect until the application JWT expires or is revoked.
- Firebase becomes a dependency of the **login path** (not of request serving).

---

# 6. Security boundaries

```text
  UNTRUSTED                         │  TRUST BOUNDARY            │  TRUSTED
  ──────────────────────────────────┼────────────────────────────┼──────────────────────────
  Firebase ID token (from client)   │  verifyIdToken()           │  { uid, email, … }
  deviceLabel (from client)         │  normalizeDeviceLabel()    │  cosmetic label only
  ──────────────────────────────────┼────────────────────────────┼──────────────────────────
  businessId in any request         │  ── ignored entirely ──    │  User.businessId
  role / permission in any request  │  ── ignored entirely ──    │  User.role
  firebaseUid in a request body     │  ── ignored entirely ──    │  verified token payload
  ──────────────────────────────────┼────────────────────────────┼──────────────────────────
  Firebase Admin credentials        │  ── server process only ── │  never in the app bundle
```

**The exchange route is the only place a Firebase identity enters the system.** It is the single
point at which an external, Google-signed assertion becomes an Inventory AI session, and it is
therefore the only place that needs Firebase-specific security reasoning.

**Why the exchange is not a token-minting oracle.** It mints a session only for a `uid` that
`verifyIdToken` has cryptographically attested *and* that resolves to an existing, `ACTIVE` MongoDB
user in an `ACTIVE` business. An attacker who cannot produce a valid Google-signed ID token gets
nothing; an attacker who can produce one gets exactly the account that token names — which is the
definition of correct federated authentication.

**What deliberately does not happen server-side.** The server never sees or stores a password for
Firebase-native accounts, never calls Firebase on the request path of a normal API call, and never
consults Firebase to authorize a request. Authorization remains a local, database-derived decision.

---

# 7. Firebase ↔ MongoDB identity mapping

## 7.1 Mapping rule

`firebaseUid` is the join key between a Firebase identity and a MongoDB `User`. It is written **once**,
at first association, from the verified `uid` in the ID token, and is thereafter immutable through
normal application flows.

```
Firebase uid  ──1:1──►  users.firebaseUid  ──►  users.businessId, users.role, users.status
   │                                                    │
   └── owns: password, email verification,              └── owns: RBAC, tenant, lifecycle
       Google federation, token signing
```

`email` is also unique on both sides, but it is **not** the join key: it is mutable on the Firebase
side and it is the field involved in credential-collision handling (§16.2). The `uid` is stable and
provider-independent, which is what makes Google, email/password and any future provider converge on
one MongoDB record.

## 7.2 Schema changes

Minimum necessary — three fields on `users`, and nothing else.

```ts
// server/src/models/user.model.ts
firebaseUid:   { type: String, unique: true, sparse: true, index: true },  // NEW
emailVerified: { type: Boolean, default: false },                          // NEW
passwordHash:  { required: false, select: false },                         // CHANGED: still select:false
```

**`sparse: true` is mandatory, not decorative.** A plain `unique` index treats a missing value as
`null`, so the *second* legacy user without a `firebaseUid` would collide with the first. This is the
single easiest way to break the migration, and it fails as a duplicate-key error at insert time on a
record that has nothing to do with Firebase.

**`emailVerified` is persisted because `requireAuth` never sees an ID token.** The application JWT is
the session credential, so any Firebase claim that must be enforceable *per request* has to be
mirrored into MongoDB — the same pattern `role` and `status` already follow. **Persisting it does not
enforce it** (§14.2): in Phase 32 nothing reads this field to make a decision. It is written so that a
future, separately-approved phase can read it without a second migration.

**`passwordHash.required: false`** because Firebase owns passwords for new accounts. **The field is
not removed** — it is the rollback path (§11) and the legacy login credential (§10).

**`photoURL` is deliberately not added.** Firebase can supply one for Google accounts, but no screen
renders an avatar. An unconsumed field is dead weight (CLAUDE.md §8).

## 7.3 Field mapping at first association

| Firebase | MongoDB | Rule |
| --- | --- | --- |
| `uid` | `firebaseUid` | verbatim, from the verified payload only |
| `email` | `email` | already `unique` + lowercased; Firebase emails are already normalized |
| `email_verified` | `emailVerified` | mirrored, **not enforced** in Phase 32 |
| `name` / `displayName` | `name` | `name` is **required** on the model — a Google account with an empty `displayName` must fall back to the local-part of the email, or the write fails validation |
| — | `businessId`, `role`, `status` | **never** from Firebase; assigned by Inventory AI |

## 7.4 Lifecycle cases

| Case | Behaviour |
| --- | --- |
| **First Google sign-in, known email, no `firebaseUid`** | Depends on the account-linking decision (§14.4). Without a decision, Firebase raises `auth/account-exists-with-different-credential` and the flow must handle it explicitly rather than surfacing a raw error. |
| **First Google sign-in, no MongoDB user at all** | `REGISTRATION_REQUIRED` — the client routes to the business-signup screen. **Not a 404**: the identity is valid, it simply has no tenant yet. |
| **First email/password login** | The MongoDB user was created at registration (§8.2), so the exchange succeeds directly. |
| **Duplicate email at registration** | Firebase rejects client-side with `auth/email-already-in-use`. No regression: today's `POST /api/auth/register` returns 409 `EMAIL_IN_USE`, so enumeration resistance is unchanged. |
| **Disabled user** | `status !== 'ACTIVE'` → 403 `ACCOUNT_DISABLED`. Unchanged; the gate is server-side and Firebase knows nothing about it. |
| **Suspended/archived business** | `assertActiveBusiness` → 403. Unchanged. |
| **Firebase user deleted, MongoDB user alive** | The application JWT stays valid until it expires (≤7d) or is revoked. Reconciliation is an operational concern, not an in-request check — a per-request Firebase lookup would put Google on the hot path of every API call, which this design explicitly refuses. |
| **MongoDB user deleted, Firebase user alive** | `User.findById` → `null` → 401 `AUTH_REQUIRED`. Unchanged. |
| **Admin creates a user (Phase 14A)** | Credential creation must also happen in Firebase. **Owner decision** (§14.3). |
| **`firebaseUid` already linked to a different MongoDB user** | The unique index rejects the write. Treat as a hard error and audit it — this is the signature of a compromised or misconfigured mapping, never something to auto-resolve. |

---

# 8. Session lifecycle

## 8.1 Obtaining a session

Unchanged in shape from a password login — the exchange reuses **the same two calls**:

```ts
const jti   = newSessionId();
const token = signAccessToken(user._id, jti);
const session = await createSessionForToken({ userId: user._id, businessId: user.businessId, token, deviceLabel });
return { token, user, session };
```

Because the session row is created by the same function as today, `expiresAt`, `deviceLabel`
normalization and the TTL index all behave identically. The client receives `{ token, user }` in the
same envelope as `POST /api/auth/login`, so the mobile session layer needs no new parsing.

## 8.2 Registration sequence

```text
1. client   Firebase createUserWithEmailAndPassword(email, password)
              └─ failure: nothing has happened server-side; surface the Firebase error
2. client   updateProfile({ displayName: name })
3. client   POST /api/auth/firebase/register { businessName, name, idToken }
4. server   verifyIdToken → uid, email
              create Business + OWNER User with firebaseUid   (mirrors registerBusinessOwner)
              → 201, no token (matching today's register, which issues none)
5. client   POST /api/auth/firebase/exchange → session
```

**Failure mode, handled rather than ignored.** If step 3 or 4 fails, an orphan Firebase account
exists with no MongoDB user. This is intrinsic to federated registration and cannot be eliminated
client-side. It is made **self-healing**: the exchange answers `REGISTRATION_REQUIRED` for a valid
identity with no MongoDB record, so the user retries signup and the orphan is adopted. The
alternative — deleting the Firebase account client-side on failure — is racy and leaves the user with
no account at all if the delete also fails.

## 8.3 Ending a session

| Action | Firebase | Inventory AI |
| --- | --- | --- |
| Sign out (this device) | `firebaseSignOut()` | `POST /api/auth/logout` → revoke this session row |
| Sign out everywhere | `firebaseSignOut()` | `POST /api/auth/logout {all:true}` → revoke **all** rows |
| Session revoked elsewhere | — | Next request → 401 `SESSION_REVOKED` → existing `sessionLostHandler` clears local state |
| Application JWT expires | — | 401 → client re-exchanges a fresh ID token, or returns to login |

**Both halves are required.** Clearing only the application session leaves a live Firebase refresh
token on the device that can mint a new ID token and silently re-establish a session. Clearing only
Firebase leaves an application JWT that keeps working until it expires.

`logout {all:true}` must reach **both** systems, or "sign out everywhere" becomes a claim the system
does not honour — a direct contradiction of Phase 26A's purpose.

## 8.4 Re-exchange

When the application JWT is expired or revoked and a Firebase session is still live, the client can
obtain a fresh ID token and exchange again without a password prompt. This is the intended recovery
path and it is why the exchange endpoint must remain public and idempotent with respect to session
creation.

---

# 9. Migration strategy

Existing users hold bcrypt hashes and have no Firebase account. **No bulk migration is part of
Phase 32's implementation scope.** This section documents the strategy for a later phase and names
its risks.

## 9.1 Lazy migration (the recorded strategy)

1. **Keep `POST /api/auth/login` and `users.passwordHash` alive throughout Phase 32.** On a successful
   legacy password login, the server creates the Firebase user with the same password via
   `admin.auth().createUser()` and writes `firebaseUid`. Users migrate as they sign in.
2. Everyone who never signs in again is migrated by a later bulk import, or simply remains on the
   legacy path until it is retired.
3. Retirement of the legacy path is its own explicitly-approved increment, after the population on it
   is measured to be zero or acceptably small.

## 9.2 Why lazy first

- **Zero downtime, zero lockout.** No maintenance window, and no user is ever unable to sign in.
- **No new credential exposure.** The server already receives the plaintext password on this path
  today; forwarding it to `admin.auth().createUser()` adds no new disclosure.
- **It is the rollback story.** Because the legacy path is retained, reverting the mobile build leaves
  every pre-existing user able to sign in.

## 9.3 Risks of the bulk import (for the later phase)

- **bcrypt compatibility is UNVERIFIED** (§18, gate 1). If `auth:import` cannot consume our rounds-10
  hashes, big-bang migration is impossible and lazy migration becomes the only route. **If this gate
  fails, the documented fallback is lazy migration plus a forced-reset campaign** — which is a
  user-visible cost the owner must weigh before committing to it.
- **Duplicate-identifier behaviour.** Firebase's import does not check for `uid`/`email` collisions: a
  colliding `uid` *replaces* an existing user, and other duplicated fields *create an additional
  user*. An import file must therefore be generated and diffed against the live project, never
  blindly uploaded.
- **Ordering.** If the Mongo-side `firebaseUid` backfill and the Firebase import disagree, some users
  end up with an ID token that resolves to no `User` — surfacing as `REGISTRATION_REQUIRED` for an
  existing account, which is confusing but recoverable.
- **Password-change invalidation.** Imported users' `passwordChangedAt` semantics change (§14.7).

---

# 10. The legacy path is preserved

Phase 32 **does not** remove, weaken, disable or gate any of the following:

- `POST /api/auth/login` and its two rate limiters
- `users.passwordHash` and `passwordChangedAt`
- `registerBusinessOwner()` as the business-creation path
- `POST /api/auth/change-password`
- Phases 26B/27's forgot/reset endpoints, mail layer and mobile screens
- `config/jwt.ts`, `session.service.ts`, `authenticate.ts`, `authorize.ts`, `constants/roles.ts`

Two sign-in paths coexist by design for the duration of the migration. The consequence — that a user
whose password was changed through one system is unaffected in the other — is exactly why the
password-authority question (§14.1) had to be decided rather than allowed to persist unstated. **It was
decided by Phase 32E; see the amendment below and §14.1.**

**Amended by Phase 32E (2026-09-20) — one exception, and its scope.** `POST /api/auth/login` is now
**gated for Firebase-linked accounts**: `loginWithPassword` refuses with `403 FIREBASE_SIGN_IN_REQUIRED`
once the account carries a `firebaseUid` — after the password comparison and the status check, and
before `assertActiveBusiness` and the session write (`server/src/services/auth.service.ts`). Every other
item in the list above is untouched, and the route behaves exactly as it always has for every account
that has no `firebaseUid` — which is every account in production today, because no shipped code writes a
`firebaseUid` onto an account that retains a `passwordHash`. The exception exists because such an
account would otherwise hold two independently valid credentials that nothing keeps in step. Its
rollback consequence is recorded in §11; the decision it closes is §14.1.

---

# 11. Rollback strategy

| Phase | Reversibility |
| --- | --- |
| 32B (Admin SDK + verifier) | **Fully additive.** No route, no mobile change. Revert the commit; nothing else moved. |
| 32C (exchange + register routes) | **Additive routes.** Revert; legacy login is untouched and still the only path the app uses. |
| 32D / 32E (mobile) | **Revert the mobile build.** Old builds keep working because §10 keeps password login alive for every account without a `firebaseUid`. **This is the property that makes the whole plan reversible, and it depends entirely on not retiring the legacy path early** — see the Phase 32E qualification below. |
| 32E (schema) | **Additive fields with safe defaults.** `firebaseUid` sparse-unique and `emailVerified: false` are inert if the code reverts. No down-migration needed. |
| 32G (cutover) | Clean for every pre-existing user. **One-way for accounts created after cutover** — they have no `passwordHash` and cannot use the legacy path. |

**Phase 32E qualification (2026-09-20) — reverting the mobile build is no longer sufficient on its own
for a Firebase-linked account.** Because `loginWithPassword` now refuses an account carrying a
`firebaseUid` (§10), a reverted build — which has no Firebase path at all — cannot sign such an account
in: it posts to `POST /api/auth/login` and receives `403 FIREBASE_SIGN_IN_REQUIRED`. Rollback therefore
requires **reverting the server behaviour as well, or disabling the guard explicitly**; the mobile build
alone is not enough. This qualification is inert today, because no account is linked; it becomes live the
moment a migration phase begins writing `firebaseUid` onto password accounts (the 32G row below), and it
is that phase which must record the runbook step.

**The single one-way door.** Accounts registered through Firebase after cutover exist only in
Firebase. Rolling back the server to a password-only world locks those accounts out until Firebase is
re-enabled or they complete a reset. This must be stated in the operational runbook before 32G runs,
and it is the reason the cutover phase must not be scheduled until the Firebase path has been
exercised in production for a meaningful period.

**Never deleted during Phase 32:** `passwordHash`, `config/jwt.ts`, `session.service.ts`,
`POST /api/auth/login`. Retirement is a separate, approved increment.

---

# 12. M1 vs M2 — mobile integration paths

> **UPDATE — 2026-09-24 (additive; nothing below is removed).** The mobile integration
> path has since been **decided**: **M1 (React Native Firebase) is approved**, together with the
> Firebase **P2 durable-persistence** decision. That decision **supersedes the Phase 32D
> `inMemoryPersistence` requirement** and is recorded in
> [`2026-09-24-rnfirebase-p2-persistence-decision.md`](./2026-09-24-rnfirebase-p2-persistence-decision.md).
> The comparison table and rationale below remain the M1-vs-M2 analysis exactly as written. Read `O-4`
> and `O-7` in §14A.5 as resolved, and `O-11` (Expo Go) as forfeited as a consequence of choosing M1.
> The chosen Google Sign-In library is `@react-native-google-signin/google-signin@16.1.5`, and the two
> native configuration files are supplied by **EAS build-time injection** rather than committed.

Both are documented because the choice is an owner decision (§14.5) and it is not reversible cheaply
once native configuration exists.

| | **M1 — React Native Firebase** | **M2 — `firebase` JS SDK** |
| --- | --- | --- |
| Packages | `@react-native-firebase/app`, `@react-native-firebase/auth` | `firebase` (v12+ for current Expo SDKs) |
| Google Sign-In | `@react-native-google-signin/google-signin` (native) | `expo-auth-session` (system browser) |
| **Expo Go** | **Impossible** — confirmed by Expo's own documentation: React Native Firebase "requires custom native code and cannot be used with Expo Go" | **Works** |
| Development build | **Required** | Not required |
| Native config | `google-services.json`, `GoogleService-Info.plist`, SHA-1/SHA-256, `iosUrlScheme` | None |
| Google UX | Native account sheet | Browser round-trip; subject to Google's embedded-webview policy if implemented incorrectly |
| EAS impact | **Forces the first EAS build in this project's history** | None |

> **Cross-reference added 2026-09-25 (Phase F1).** The choice this table presents was **made in
> practice, and M2 is now CLOSED as superseded** rather than pending: the shipped implementation is
> **M1** (native SDKs), and Phase F1 deleted M2's browser machinery — the `expo-auth-session` import,
> `acquireGoogleIdToken`, its Google discovery constants, `googleRedirectUri()` and the `firebase` JS
> SDK dependency itself. The comparison above is historical and is left unedited. See **§14A.9**.
| Config-plugin burden | Firebase + Google Sign-In + `expo-build-properties` | None |
| Ongoing dev speed | Dev build rebuild required for native changes | `expo start` as today |

**Alignment note.** M1 matches where Phase 30A already points — `expo-dev-client` is installed and
four EAS profiles are defined, though no build has been produced. **M2 is materially lower-risk, needs
no EAS build, and keeps the current inner loop intact**, at the cost of a browser-based Google flow.

**Either way, the server side and the application-session design are identical.** This decision
affects only how the mobile client obtains an ID token.

---

# 13. Firebase Console setup checklist

Nothing in this section has been performed. It is a runbook.

## 13.1 Client-safe configuration

These values ship inside the app bundle. Per Firebase's own threat model they are **project
identifiers, not secrets** — but see §14.6 for the storage decision.

- [ ] Create the Firebase project.
- [ ] Add an **Android** app with package `com.inventoryai.app`.
- [ ] Add an **iOS** app with bundle id `com.inventoryai.app`.
- [ ] Authentication → Sign-in method → enable **Email/Password**.
- [ ] Authentication → Sign-in method → enable **Google**.
- [ ] Confirm the authorized domains list (`*.firebaseapp.com`, `*.web.app` are automatic). No custom
      domain is required while there is no web client.
- [ ] Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS).
- [ ] Record the iOS `REVERSED_CLIENT_ID` for the URL-scheme configuration.
- [ ] Register Android **SHA-1 and SHA-256** fingerprints.

## 13.2 Server-only credentials

- [ ] Project settings → Service accounts → **Generate new private key**.
- [ ] Store the resulting JSON as a server-side secret only (§14.6 storage strategy).
- [ ] **Never** place it in the mobile app, in git, in an EAS plaintext variable, or in chat.

## 13.3 The Android fingerprint bootstrap (two builds)

EAS owns the Android keystore, and **the keystore does not exist until the first build runs.** The
sequence is therefore unavoidably two builds, and this is worth budgeting for:

```text
1. eas build --profile development   ← creates the EAS-managed keystore
2. eas credentials                    ← read the keystore, compute SHA-1 / SHA-256
3. Firebase Console                   ← register both fingerprints
4. Firebase Console                   ← download a FRESH google-services.json  (required:
                                        the existing one predates the fingerprint)
5. eas build --profile development   ← second build, now with a working Google flow
```

Google Sign-In **cannot** work before step 5. A local debug build additionally needs the debug
keystore's SHA-1 registered, and a Play-distributed build needs the Play App Signing SHA-1.

---

# 14. Owner decisions

This section is the **decision register**. It records what was once undecided, so nothing could be
settled silently in code. The current state of every entry, and the register of decisions the owner
approved in Phase 32F, are in **§14A** immediately below; the per-item history that follows here is
kept in place rather than deleted, so the question each entry answered stays readable.

**Status after Phase 32F (2026-09-20):** the register is now split explicitly between **resolved**
decisions and **open** ones — see §14A, which is authoritative for the current state. In summary:
14.1 (password authority), 14.4 (linking policy) and 14.9 (lazy migration) are **resolved**; 14.3 is
**partly resolved** (invitation-based onboarding is the approved direction, its implementation is
open); 14.10 is **resolved** by the mobile TypeScript migration, which post-dated this document; and
14.2, 14.5, 14.6, 14.7 and 14.8 remain **open**. No entry was removed, and no implementation-specific
detail is marked resolved.

**14.1 Password-reset authority. — PARTLY RESOLVED by Phase 32E (2026-09-20).**

**Resolved:** *for a Firebase-linked account, Firebase is the password authority, and the retained
bcrypt hash is not a second way in.* `loginWithPassword` refuses a `firebaseUid`-bearing account with
`403 FIREBASE_SIGN_IN_REQUIRED` (§10), and the client copy — "This account signs in with Firebase. Enter
your Firebase password to continue." — deliberately names the **credential** rather than a control,
because 32E signs in through one email/password form for both paths. This was settled with the owner as
part of Phase 32E rather than left open, because an account holding two credentials that nothing keeps
in step is a bypass, not an open question.

**Consequence, recorded rather than glossed:** for a linked account, `POST /api/auth/change-password`
and the 26B/27 reset flow no longer change the credential that actually authenticates the user — the
Firebase password does, so a user who changes their password there is still admitted by their previous
Firebase password. This is inert today (no account is linked, and no shipped code links one) and becomes
live in the phase that starts writing `firebaseUid` onto password accounts. It is a residual risk this
decision accepts, not one it resolves; whichever phase retires the legacy path must settle it.

**Still open:** does Firebase take over `POST /api/auth/forgot-password` and
`POST /api/auth/reset-password`, displacing Phase 26B/27's Resend mail layer, token store and two
mobile screens? Running both is possible but means a password can be reset through one system and not
the other. If Firebase takes over: are the 26B/27 artefacts deleted, archived, or left in place? The
project's conventions forbid silent deletion — **and nothing is removed now: the 26B/27 endpoints, mail
layer, token store and both mobile screens remain exactly as they shipped, and no change to them is
implied by the decision above.** *Related UX question:* Firebase's default reset link is hosted, which
would replace the in-app `inventoryai://reset-password` flow unless `ActionCodeSettings` is configured
for a custom action URL. This choice also closes or preserves the B1/B2/E3 risk records in roadmap
§27B/§27D/§27E.

**14.2 Email-verification enforcement.** `emailVerified` is persisted but **not** enforced in
Phase 32. Enforcing it later is a behaviour change: today `signUp` logs the owner straight in, so
gating API access on verification would strand new users on a screen the app does not yet have.

**14.3 Admin-created users (Phase 14A). — PARTLY RESOLVED by Phase 32F (2026-09-20).**

**Resolved (direction):** the owner has approved **invitation-based onboarding** as the intended
mechanism, rather than having the creator establish another person's Firebase password. An invitation
is bound to the intended business and role, the invitee authenticates with an allowed Firebase
provider, the server validates the invitation, and `businessId` and `role` are assigned **server-side**
from the invitation — never from the invitee's request. The creator's own password is therefore never
another person's credential, which removes the weakest part of the original options below.

**Still open (implementation):** the invitation model, its lifetime and single-use semantics, the
route surface, revocation, whether an invitation may change business, and how it interacts with the
existing `users.manage` create route — which **still exists and still accepts a password**, unchanged.
**No invitation model, route, service or screen exists**, and none may be added without an approved
phase.

The original question is retained below so the reasoning stays readable: when an ADMIN creates a user
over `users.manage`, does the server create the Firebase account with the ADMIN-typed password
(minimum change — the mobile `UserForm` already collects one), or does Firebase send an invite /
password-reset email (better UX, but `password` becomes optional in the API contract)? The invitation
direction answers the *intent*; the shipped route has not been changed to match it.

**14.4 Google account linking. — RESOLVED by Phase 32F (2026-09-20).**

**Resolved: the system does NOT link automatically.** When a provider identity's email matches an
existing password account, the identities are **not** merged. **Email is not an account-linking join
key**, and authenticating a provider identity is **not** proof of ownership of an existing Inventory
AI account. The server stays **UID-authoritative**.

The reasoning, recorded rather than asserted: if an identity asserting `john@example.com` were merged
into an existing `john@example.com` account on the strength of the address, then anyone able to obtain
a provider account bearing a victim's address would receive that victim's session — their `businessId`,
their role, and their entire tenant's data. A provider that does not verify addresses, or that permits
an address to be changed later, makes that reachable in practice. Firebase's own default here is to
raise `auth/account-exists-with-different-credential`, which is the same refusal.

**Linking is instead an explicit account operation** (§14A, "Safe account linking"), performed by an
already-authenticated user, with the provider UID taken from the verified credential and never from a
request body. **Linking during a sign-in attempt requires an explicit ownership/recovery proof flow**
before it may attach to an existing account. **Neither flow is implemented.**

The original question is retained below: does the system link automatically, require a prior password
sign-in to prove ownership, or refuse? The answer is *refuse the automatic path*, and require proof on
any explicit path — but the phase that implements it is not this one.

**14.5 M1 vs M2** (§12).

**14.6 `google-services.json` / `GoogleService-Info.plist` storage.** Commit them deliberately with
written reasoning, or inject them at build time via EAS file environment variables? The latter forces
`app.json` → `app.config.js` so `googleServicesFile` can read from the environment — a structural
change to a file Phase 30A established as the single source of native configuration. Note also that
`.easignore` **replaces** `.gitignore` rather than adding to it, so any ignore change must be applied
to both.

**14.7 `passwordChangedAt` semantics for Firebase-native accounts.** Our server never learns that a
Firebase-native user changed their password, so **`SESSION_INVALIDATED` does not fire for them** — a
stolen application JWT is no longer killed by a password change, only by sign-out-everywhere
(Phase 26A). This is a genuine reduction in a security property that Phase 15 deliberately built, and
it requires explicit acceptance or a compensating design.

**14.8 Expo Go.** M1 forfeits Expo Go for day-to-day development. This affects every future mobile
phase, not just Phase 32.

**14.9 Acceptance of lazy migration — CONFIRMED by Phase 32F (2026-09-20).** That
`POST /api/auth/login` and `passwordHash` survive all of Phase 32 (§9, §10). Re-confirmed with the
qualification below, which remains binding.

**14.10 Documentation reconciliation. — RESOLVED (not by a phase).**

CLAUDE.md §2 recorded the mobile stack as "JavaScript" while the app is TypeScript. This was
unrelated to Firebase, and it has since been corrected by the mobile TypeScript migration: CLAUDE.md
§2 now reads **TypeScript** for the mobile stack, alongside the server's completed TypeScript
campaign. No action remains. Retained here only so the entry is not silently dropped from the register.

---

# 14A. Phase 32F — Multi-provider decision record

**Phase:** 32F
**Date:** 2026-09-20
**Scope:** Documentation only. This phase changes no source code, no dependency, no package manifest,
no environment variable, no database record, no schema, no route, no authentication behaviour, no
payment code, and creates no EAS build.

This section is **authoritative for the current state of the multi-provider architecture**. It records
the owner's decisions, separates what is **resolved** from what remains **open or future**, and states
plainly what is **not implemented**. It does not authorise implementation of anything.

## 14A.1 Architecture — Firebase as identity provider

Firebase Authentication is the **identity provider**. It answers *who is this person?* — nothing more.
The Inventory AI backend answers *which Inventory AI account and business does this person belong to,
and what are they allowed to do?*

MongoDB / Inventory AI remains authoritative for: `userId`, `businessId`, `role`, account status,
permissions, business status, subscription/billing state, application sessions, and audit records.
**Firebase UID is an identity linkage field, not an authorization source.**

| Method | Status |
| --- | --- |
| Email/password via Firebase Authentication | **Implemented** (32B–32E) |
| Google via Firebase Authentication | **Implemented** (Phase C, native `@react-native-google-signin/google-signin`) — existing-account Android flow **E2E verified 2026-09-26**; the new-identity `REGISTRATION_REQUIRED` path is ENVIRONMENT-BLOCKED |
| Facebook via Firebase Authentication | **Approved · NOT implemented** |
| Apple Sign-In | **Future scope · NOT part of the current implementation** |

## 14A.2 Security boundary

The following are **server-controlled** and are never read from the mobile client: `businessId`,
`role`, `status`, Firebase linkage, permissions, and subscription/business access. This is the
existing Phase 03 / 14A / 22–24 contract, restated here because the provider work is where it would be
most tempting to widen.

- Firebase ID tokens are accepted **only** at the exchange boundary.
- A Firebase ID token **must not** become the application's long-lived API bearer credential.
- The backend exchanges a verified ID token for the existing Inventory AI JWT/session model.
- **One unified Inventory AI session representation** exists regardless of provider. There are **no
  provider-specific session types**, and **no provider field may be added to the session model** merely
  because Google and Facebook are being added.

## 14A.3 Resolved decisions (approved by the owner, Phase 32F)

Each is a decision that was open and is now settled. **"Resolved" means the policy is decided — not
that any code implements it.**

| # | Decision | Consequence |
| --- | --- | --- |
| **R-1** | **Password authority for Firebase-linked accounts.** Firebase is the authority; the retained bcrypt hash is **not** a second authentication door. `loginWithPassword` continues to refuse with `403 FIREBASE_SIGN_IN_REQUIRED`. | The §14.1 guard is **retained unchanged** and must not be removed or weakened. |
| **R-2** | **Provider identity is never trusted from the request body.** A provider UID is taken only from the verified Firebase credential/token. | Same standing as `businessId`, `role` and `status`. |
| **R-3** | **A Firebase ID token is exchanged and does not become the application's bearer credential.** | Option B, unchanged. |
| **R-4** | **Email is not an identity-linking join key.** A provider identity is never linked to an existing account solely because the email matches. | Binds every future provider phase. |
| **R-5** | **Lazy migration on successful legacy password login is accepted** (§9.1). | Subject to the §10 qualification and the §16.6 binding constraint. |
| **R-6** | **Email / Firebase UID collision handling follows the existing documented behaviour** (§7.4): email → `409 EMAIL_IN_USE`; UID → **hard error**, never auto-resolved. | Already implemented; unchanged. |
| **R-7** | **Sessions remain provider-neutral.** | No schema change; no provider field on `sessions`. |
| **R-8** | **Account linking requires explicit ownership proof.** | A sign-in is evidence about an identity, not about an account. |
| **R-9** | **Provider linking must not silently happen based on email equality.** | Auto-linking on an address match is **prohibited**. |
| **R-10** | **Facebook missing-email cases require explicit handling.** Never invent an email; never derive one from the Facebook UID; require email completion before creating the user. | Binds the future Facebook phase. |
| **R-11** | **Subscription ownership is business-level, not Firebase-user-level.** | A change of Owner or provider must not transfer, destroy or recreate a business subscription. |

**R-2, R-4, R-7, R-8, R-9, R-10 and R-11 are new decisions recorded by this phase.** R-1, R-3 and
R-6 restate decisions already in force; R-5 confirms §14.9. Recording them here does not change any
behaviour: **none of the eleven is implemented by this phase**, and four of them (R-4, R-8, R-9, R-10)
constrain phases that do not exist yet.

## 14A.4 The linking policy, in full

**Prohibited:** linking a provider identity to an existing Inventory AI account because the email
addresses match. **Email is not an account-linking join key.** Authenticating a provider identity is
**not** equivalent to proving ownership of an existing Inventory AI account.

**Approved design for explicit linking** — an operation performed by an **already-authenticated**
Inventory AI user:

```text
Inventory AI authenticated session
        ↓
user explicitly chooses "Connect Google" / "Connect Facebook"
        ↓
provider authentication
        ↓
verified Firebase credential
        ↓
Firebase account linking
        ↓
the existing Inventory AI account is unchanged
        ↓
businessId / role / status remain authoritative
```

**Approved constraint on linking during sign-in:** it must require an **explicit ownership/recovery
proof flow** before it may attach a provider to an existing account. A user who signs in with a
provider whose address matches an existing account is **not** thereby shown that account.

**Not implemented:** there is no link route, no unlink route, no linking service, no provider field on
any model, and no ownership-proof flow. **This phase implements none of it.** (Recorded by Phase 32F
and accurate as of it. **Phase 32H later added the link *route* and the linking service — see §14B.**
There is still no unlink route, no provider field on any model, and no ownership-proof flow beyond the
authenticated session itself; the statement above is left as the Phase 32F record rather than
rewritten.)

## 14A.5 Open decisions (not resolved — do not settle these in code)

| # | Open question | Blocks |
| --- | --- | --- |
| **O-1** | The **unlink policy** and last-authentication-method protection, accounting for both Firebase's own provider set and the app-side `firebaseUid` password refusal. — **RESOLVED FOR THE SERVER-SIDE PATH 2026-09-26 (Phase 32L):** the policy is **Policy B** (an account may leave Firebase authority only by establishing a new local password in the same transition), so the server-side last-authentication-method invariant holds structurally and the `firebaseUid` password refusal is never the only remaining method. **Residual, recorded and NOT closed:** Firebase's own provider set is a client-side operation this server cannot observe. See `docs/DEVELOPMENT_ROADMAP.md` §27Q. | ~~Any unlink capability~~ — set as **Policy B**; the server-side capability shipped in Phase 32L |
| **O-2** | The **linked-account disposition** of `change-password` and the 26B/27 reset flow, which today would change an inert hash and revoke every session as a side effect. | Any phase that writes `firebaseUid` onto password accounts |
| **O-3** | Whether **`emailVerified` is enforced** (§14.2). | Provider sign-in relying on a provider-asserted address |
| **O-4** | **M1 vs M2** (§14.5). — **RESOLVED 2026-09-24:** **M1 (React Native Firebase)** approved, with P2 durable persistence; see [`2026-09-24-rnfirebase-p2-persistence-decision.md`](./2026-09-24-rnfirebase-p2-persistence-decision.md). | All Google/Facebook mobile work |
| **O-5** | The **Facebook missing-email onboarding flow** — the policy is R-10, the flow is undecided. | Facebook Login |
| **O-6** | The **remedy, if any, for the unhealable orphan** (§16.6). | The legacy migration/linking phase |
| **O-7** | **`google-services.json` / `GoogleService-Info.plist` storage** (§14.6). — **RESOLVED 2026-09-24:** **EAS build-time injection**; the files are **not committed** to the repository unless a later explicit owner decision changes this. See [`2026-09-24-rnfirebase-p2-persistence-decision.md`](./2026-09-24-rnfirebase-p2-persistence-decision.md) §8.1. | Native provider configuration |
| **O-8** | Whether **Firebase takes over the password reset flow**, and the disposition of the 26B/27 artefacts if it does (§14.1, still open). | Password recovery |
| **O-9** | **`passwordChangedAt` semantics for Firebase-native accounts** (§14.7) — `SESSION_INVALIDATED` does not fire for them. | Explicit acceptance or a compensating design |
| **O-10** | **Invitation implementation** — model, lifetime, single-use semantics, routes, revocation (§14.3). | Invitation onboarding |
| **O-11** | **Expo Go policy** (§14.8), which M1 would forfeit. | Every future mobile phase |

## 14A.6 Unverified gates (unchanged)

Neither is settled by this phase, and both gate **later** work rather than this one:

1. **Firebase `auth:import` bcrypt support** — decides whether a bulk migration is possible at all.
2. **React Native Firebase + Expo SDK 57 config-plugin configuration** — decides whether M1 is viable.

## 14A.7 Implementation status (stated so it cannot be assumed)

- **Google Sign-In: NOT started.** No provider SDK, no OAuth client, no route, no screen.
  *(**Superseded 2026-09-26 (Phase C):** native Google Sign-In **is implemented** — the
  `@react-native-google-signin/google-signin` provider SDK is installed and the existing-account
  Android flow is **E2E verified**; the new-identity `REGISTRATION_REQUIRED` path is
  ENVIRONMENT-BLOCKED. This sentence is the Phase 32F record and is not rewritten.)*
- **Facebook Login: NOT started.** Same.
- **Apple Sign-In: future scope**, not scheduled.
- **Account linking: NOT implemented. Account unlinking: NOT implemented.** (**Superseded in part by
  §14B** — as of Phase 32H the server-side linking *boundary* is implemented, and as of **Phase 32L**
  (`POST /api/auth/firebase/unlink`, Policy B — specification §29, roadmap §27Q) the server-side
  **unlinking** boundary is implemented too. Every provider-side statement in this section still holds:
  no provider screen, no ownership-proof flow beyond the authenticated session, and Firebase-side
  provider linking/unlinking remains a client-SDK operation the server cannot observe. The sentence
  above is the Phase 32F record and is not rewritten.)
- **Invitations: NOT implemented.** The `users.manage` create route still exists unchanged.
- **No provider SDK is installed** on either platform. *(**Superseded 2026-09-26 (Phases B–C):** the
  native Firebase (`@react-native-firebase/*`) and Google Sign-In provider SDKs are installed. The
  Phase 32F record is not rewritten.)*
- **No EAS build, submit or prebuild has been created.** The first EAS development build remains a
  **prerequisite** for validating the selected mobile provider integration path; until it exists, no
  provider integration has been tested — and none is claimed to have been. (**Superseded by Phase 32G**,
  which produced one; the claim that no *provider* integration has been tested still holds.)
- **The Firebase exchange is unchanged**: it verifies the ID token, uses the verified UID, resolves by
  `firebaseUid`, **never by email**, rejects an unknown UID with the existing registration-required
  behaviour, applies the existing user/business status checks, and mints the existing JWT/session.

## 14A.8 Phase E — session-reconciliation decisions (2026-09-25)

Owner decisions taken after the Phase D native migration, when the remaining
JavaScript-SDK confirmation paths were gone and the durable/Inventory split could be
examined as a whole. **D-E1, D-E2 and D-E5 are implemented; D-E3 and D-E4 are
ACCEPTED FOR V1 and implemented by nothing** — they record that the current behaviour
is the intended behaviour, so no later phase treats it as unfinished.

**D-E1 — a failed native Firebase sign-out is CONSUMED, not discarded.**
`signOutOfFirebase()` has always been total and has always REPORTED whether the durable
native session could be ended; nothing read that boolean, so a failure left a persisted
Firebase credential on a device whose Inventory AI session had already ended, with no
signal at all. The outcome is now consumed: a `false` is recorded as a one-bit
`firebaseSignOutPending` marker in secure storage, and a later launch that resolves to
**signed out** retries the sign-out. Two constraints shape it. There is deliberately
**no user-facing error**, because a failed Firebase sign-out offers a person no action
and describes a credential they cannot see. And Inventory AI sign-out **still completes
whatever Firebase does** — the Firebase step runs last and cannot throw, so the marker
can never be a precondition for the local sign-out. No token, uid, password, hash,
native error text or secret is stored or logged: the marker is one bit meaning "Firebase
may still hold a session on this device".

**D-E2 — boot cleanup is EXPLICIT, and is never duplicated.** A boot that restored a
stored Inventory AI JWT and had it refused ended the durable Firebase session only
because the centralized `sessionLostHandler` happened to be registered before the boot
effect ran — a guarantee that rested on React effect ordering rather than on anything
stated. The boot path now performs the cleanup itself. It does not duplicate the
handler's work: `lib/client.ts` reports a token-bearing 401/403 to the handler
*synchronously*, before the refused request is rethrown, so by the time the boot catch
runs a single flag says whether the centralized path already owns this refusal and the
boot path acts only when it does not. **The centralized session-loss behaviour is
unchanged** — it remains the one place a refused token is interpreted, and it remains
the owner of the Firebase sign-out for every refusal that travels through the
transport. This is not a second session-loss mechanism; it is the same cleanup, made
explicit for the one caller that could previously rely on ordering.

**D-E3 — the post-unlink Firebase identity. ACCEPTED FOR V1.** Unlinking detaches the
MongoDB mapping only: the Firebase identity itself remains in Firebase, because
provider unlinking is a client-side Firebase operation and the server has no part in it
(§14B.4). A later sign-in with that detached identity therefore authenticates with
Firebase and resolves by `firebaseUid` to **no MongoDB user**, so the exchange answers
`REGISTRATION_REQUIRED` (§8.2) — which is a **new-business onboarding** path, not a
route back into the account that was unlinked. This is accepted rather than fixed. It is
**not an account takeover**: the exchange is UID-authoritative and never matches by
email, so no existing tenant is reachable through a detached uid. It is **not a
lockout**: the unlinked account keeps working through the new local password Policy B
established in the same transition. The consequence to state plainly is the surprising
one — the old Firebase credential can create a *second* Inventory AI business. Related,
but distinct, from the pre-link orphan of §16.6: that one is an identity created for an
existing account and never linked to it, whereas this is an identity that was linked and
then deliberately detached. **No code change, no schema change, and this does not settle
`O-1`, `O-2` or `O-6`.**

**D-E4 — other devices' Firebase sessions. ACCEPTED FOR V1.** "Sign out everywhere"
revokes **every Inventory AI session** the user holds, on every device, in one call —
the server owns those. It **cannot** end the durable native Firebase session on another
device: that session lives in that device's own store, the server holds no handle on it,
and nothing is pushed to a client. The other device therefore stops being able to act
immediately (its JWT is dead server-side) but its Firebase session ends only when it next
makes a request and the centralized handler clears it. **No architecture change**: the
alternative would be a server-side Firebase revocation or a push channel, neither of
which exists and neither of which is proposed here. The residual to state plainly is that
a device the app is never opened on keeps a durable Firebase credential indefinitely —
which grants nothing on its own, because a durable Firebase session never becomes an
Inventory AI session (§14A.2, §16.7).

**D-E5 — a stale persistence comment corrected.** `app/register-firebase.tsx` justified
its cold-start refusal with "`inMemoryPersistence` (Phase 32D) means a restart has no
Firebase user at all". That premise is false under owner decision P2, which supersedes
the Phase 32D pin: a restart **can** restore a native `currentUser`. The refusal itself
was always correct and still is — the in-memory `firebaseRegistrationRequired` flag, not
Firebase state, is what authorizes that screen — so only the recorded reason was
corrected, and it now states the durable-persistence reality and that a restored
`currentUser` never becomes an Inventory AI session.

**Documentation observation, recorded rather than corrected (§16.7).** §16.7 is the
Phase 32A record and closes with "*or the client re-exchanges silently if a Firebase
session remains*". The shipped client does **not** do that: there is no automatic
exchange anywhere, boot consults only the stored Inventory AI JWT, and a durable Firebase
`currentUser` grants no session by itself. The clause is superseded by implementation and
is left as the historical record it is; the accurate statement is the one above.

## 14A.9 Phase F1 — the Firebase JS SDK and browser OAuth path are REMOVED (2026-09-25)

Phase F — the cleanup the earlier phases kept deferring — was split by the owner into two
controlled phases (**G-1**). **Phase F1 is pure JavaScript and changes no native surface**; **Phase
F2**, separately approved, removes the Expo browser dependencies, the `expo-web-browser` plugin, the
second `expo.scheme` entry and is the phase that requires a new native build. This section records
what F1 removed and, more importantly, the decisions that authorised removing it.

**The JS-SDK boundary is gone, and two imports had to move first.** `mobile/lib/firebase.ts` was the
only module in the app that imported `firebase/app` and `firebase/auth`. Phase B/C/D moved every
authentication off it, but two modules still imported `isFirebaseConfigured` **from it** purely
because that is where the re-export lived — `lib/auth.tsx` and `lib/firebase-native.ts`. Because
`lib/firebase.ts` carried top-level static SDK imports, asking that boolean pulled the entire
JavaScript SDK into those modules' bundle graph. The function has always been defined, SDK-free, in
`lib/config.ts`; F1 redirected both imports there and only then deleted the module and the `firebase`
dependency. **This ordering is the phase's one real hazard**: deleting the module first would have
left `isFirebaseConfigured` undefined, and the native gate — `isNativeFirebaseConfigured()`, which is
the same predicate — would have thrown for every Firebase and Google sign-in.

**The browser OAuth mechanism is gone with it.** Removed from `lib/firebase-auth.ts`: the
`expo-auth-session` import block, `acquireGoogleIdToken` (the authorization-code + PKCE helper Phase D
left unreferenced), its Google discovery constants (`GOOGLE_DISCOVERY`, `GOOGLE_SCOPES`), the
`GoogleIdTokenOutcome` type, and `googleRedirectUri()` (**G-5** — removed with the helper rather than
retained as a dead export). Nothing was reaching any of them: since Phase C the sign-in authenticates
natively and since Phase D the disconnect confirmation does too. **No behaviour moved with them** —
the outcome unions, the codes, the message table, the legacy-fallback rules and the unlink policy are
byte-identical, and `confirmFirebaseSignIn` still produces the fresh `auth_time` the server's 300-second
rule requires.

**The three negative browser-seam guards were replaced, not deleted (G-4).** Three suites had asserted
`expect(mockPromptAsync).not.toHaveBeenCalled()` and peers — the claim that kept a retained-but-unused
helper provably unreachable. With the helper gone those assertions had nothing to describe, so the
claim is now made **once, structurally, at the level that matters after a removal**:
`mobile/__tests__/phaseF1-retired-dependency-guard.test.ts` proves that no module under `lib/` or
`app/` imports `firebase`, `firebase/app`, `firebase/auth`, `expo-auth-session` or
`expo-web-browser`, that `lib/firebase.ts` is absent, and that `package.json` declares no `firebase`
dependency while still declaring the three native packages that replaced it. That is strictly stronger
than the three assertions it supersedes, which each covered one function's behaviour. The guard strips
comments before reading, because this module documents its own removals by name, and it proves its own
extraction with positive controls so an empty or mis-pathed read cannot pass.

**G-2 — the old JS-SDK rollback target is accepted as gone.** Until F1, `lib/firebase.ts`, the browser
helper and the still-installed `firebase` package were a one-commit rollback from the Phase B/C/D
native migration; Phase D's own record said the browser code was kept partly for that reason. F1
removes that target deliberately. **Git history is the rollback mechanism** — the branch point
`f15995e` and the merge commit `fa87941` are published, so `git revert`/`git checkout` reaches the
pre-F1 state without the dead code being carried forward indefinitely.

**G-6 — M2 is CLOSED as superseded by the shipped M1 architecture.** §12's mobile-integration table,
`docs/SYSTEM_SPECIFICATION.md` §M1-vs-M2 and the roadmap's M2 note all presented native SDKs (M1) and
the `expo-auth-session` system-browser flow (M2) as an open choice. The shipped implementation is
**M1**: `@react-native-google-signin/google-signin` performs the consent, and F1 deletes M2's browser
machinery. The M2 option is therefore **not pending** and no future phase may treat it as a live
alternative for the providers already shipped. It is closed **as superseded** rather than as
rejected; the historical statements are preserved in place with dated cross-references (**G-7**), not
rewritten.

**What F1 deliberately did NOT remove, and why.** The three native packages and their `app.json`
plugins (they are what authenticates now); `EXPO_PUBLIC_FIREBASE_*` and `isFirebaseConfigured()` in
`lib/config.ts` (the native gate); the `EXPO_PUBLIC_GOOGLE_*` client IDs and `googleClientId()`;
the `inventoryai` scheme (the Phase 27 `inventoryai://reset-password` deep link);
`android.package`/`ios.bundleIdentifier` = `com.inventoryai.app`; and
**`app/+native-intent.ts` with its suite**, which is retained until F2 because the scheme entry whose
callback it intercepts (`com.inventoryai.app:/oauthredirect`) is not removed until F2 — keeping the
interceptor while the scheme exists is the stricter ordering. The server's `firebase-admin` stack is a
separate subsystem and was not touched.

**Verification.** `npm test` **30 suites / 423 tests, 0 failures**; `tsc --noEmit` and `eslint .`
clean; the server suite unchanged (no server file was touched). **F1 is verified on the EXISTING
Phase 32G development build**, because it removes no native module — a *superset* of native modules
still runs the new JavaScript. **F2 is the phase that needs a new build**, and iOS remains
`[EXTERNAL VERIFICATION REQUIRED]`.

**A finding that must be stated precisely: the JS SDK is no longer a dependency of this project, but
it is NOT absent from the installed tree.** `@react-native-firebase/app@26.4.0` — which this project
keeps on purpose, because it is what authenticates now — declares `"firebase": "12.17.1"` as a **hard
dependency**. npm therefore does not remove the package; it de-hoists it to
`node_modules/@react-native-firebase/app/node_modules/firebase`, and `npm ls firebase` still resolves
(a nested `firebase@12.17.1`). What F1 removed is the **duplicate, hoisted copy application code was
importing** (the direct `firebase@^12.19.0`, together with 45 packages of its own `@firebase/*`
subtrees). The nested copy is RNFirebase's internal dependency and is **unreachable from application
code**, which is the fact `npx expo export`/Metro resolution and the import guard both rest on: no
module under `lib/` or `app/` names it, so nothing bundles it. Anyone re-reading this later should not
expect `npm ls firebase` to be empty and should not read its output as "the removal did not work".

## 14A.10 Phase F2 — the native surface is reduced: the browser dependencies, the plugin, the second scheme and the redirect hook are REMOVED (2026-09-25)

Phase F2 is the second half of the **G-1** split and the only half that changes the **native surface**, which
is why the owner required a separate approval for it and why it is the phase that needs a new development
build. Unlike F1 it needed no preparatory step: by the time F2 began, nothing in the app reached anything it
removes. F2 was implemented in six approved sub-steps (**F2.1–F2.6**) with two verification steps (**F2.7**,
**F2.8**), each reported and accepted before the next began.

**F2.1 — the three browser packages leave the manifest.** `expo-auth-session ~57.0.12`, `expo-web-browser
~57.0.3` and `expo-crypto ~57.0.3` were removed as direct dependencies (`mobile/package.json` 24 → 21) and,
with them, `expo-application` — which was never a top-level package but lived at
`node_modules/expo-auth-session/node_modules/expo-application`, so npm pruned it naturally with its only
dependent rather than by hand. The lockfile diff is a **pure deletion (0 added / 49 removed)** with no version
churn and no unrelated package touched. **`expo-linking` deliberately stays**: it is a dependency of
`expo-router`, and it is asserted present precisely so that "delete every `expo-*` entry" cannot satisfy the
guard.

**F2.2 — the plugin leaves atomically with the package (F-1).** `app.json` declared `"expo-web-browser"` in
its plugin list, and removing the package while keeping the entry is not a warning but a hard failure —
`resolvePluginForModule` throws before any native mod runs. This was **measured, not assumed**: with F2.1
applied and F2.2 not yet, `npx expo config` **failed on the plugin**, which is the intermediate state the
owner accepted in advance. F2.2 removes the entry (plugins 7 → 6) and public config resolution returns. The
pair is now asserted on **both** sides.

**F2.3 — only the second scheme is removed (G-3).** `expo.scheme` goes `["inventoryai", "com.inventoryai.app"]`
→ `["inventoryai"]`. The retired entry, `android.package` and `ios.bundleIdentifier` are the **same literal
string**, so the plausible break is a search-and-replace that takes the two identifiers with it; both were kept
and both are asserted. `inventoryai` is kept because it is Phase 27's `inventoryai://reset-password`, so the
password-recovery deep link is unaffected.

**F2.4 / F2.5 — the redirect hook and its suite are deleted.** With the second scheme gone,
`com.inventoryai.app:/oauthredirect` has **no producer**: no configured scheme can deliver it, and the hook's
entire subject — Expo Router's spurious "Unmatched Route" over the login screen (Phase 32I-Z) — is
unreachable. `app/+native-intent.ts` (118 lines) and `__tests__/native-intent-oauth-callback.test.ts`
(126 lines, its 9 cases) are therefore removed. A module that is merely *unreferenced* is one import away
from returning, so the guard asserts the **file and the suite are absent** *and* that nothing under `lib/` or
`app/` still names the hook.

**F2.6 — the last uncovered surface, and a claim that had to be corrected rather than extended.** F1 read the
**source**, F2.1 the **manifest**, F2.2/F2.3 the **Expo config**, F2.4/F2.5 the **filesystem**. The remaining
surface is the **lockfile**: `package.json` says what the project asks for, but `npm ci` installs from
`package-lock.json`, and a resolver walks the installed tree. Writing the obvious assertion would have produced
a guard that can never pass, because **`firebase` is still in the tree**. F2.6 therefore asserts
**reachability, not absence**: the lockfile's root package declares none of the four retired packages; none is
**hoisted** at `node_modules/<name>`; any surviving occurrence must be **nested inside a package this phase
keeps**; and the kept packages must remain hoisted.

**The Firebase dependency boundary, restated exactly as verified. This is the invariant Phase F enforces, and
it is NOT "the JS SDK is absent".**

- **The root `firebase` dependency is removed** — `mobile/package.json` declares it in neither
  `dependencies`, `devDependencies` nor `optionalDependencies`, and the lockfile's root package agrees.
- **`firebase` is not hoisted** — there is no `node_modules/firebase`, in the lockfile or on disk.
- **`@react-native-firebase/app@26.4.0` legitimately retains `firebase@12.17.1` nested under its own
  dependency tree**, at `node_modules/@react-native-firebase/app/node_modules/firebase`, because RNFirebase
  declares it as a hard dependency. `npm ls firebase` therefore still resolves. **`@react-native-firebase/app`
  was not removed, altered or downgraded** — it is what authenticates.
- **The enforced invariant is resolvability from shipped code:** no module under `mobile/lib/` or `mobile/app/`
  can resolve or import the bare Firebase JS SDK, because resolution walks up from the importing file and there
  is no entry at the mobile root. That is what makes the F1 import scan *enforceable* rather than aspirational,
  and it is a stronger property than a test — the resolver itself refuses.
- **It is never to be claimed that the Firebase JS SDK is absent everywhere in `node_modules`.** It is not, and
  it cannot be while RNFirebase is installed. A future reader who runs `npm ls firebase` and sees a nested
  `firebase@12.17.1` is looking at the expected state, not at a failed removal.

**Verification, and what it does and does not cover.**

- `npx expo config --type public` — **exit 0**, stderr empty: `scheme ["inventoryai"]` (1),
  `android.package` / `ios.bundleIdentifier` both `com.inventoryai.app`, **6 plugins** (`expo-router`,
  `expo-secure-store`, `expo-camera`, `@react-native-firebase/app`, `@react-native-firebase/auth`,
  `@react-native-google-signin/google-signin`).
- **`npx expo config --type prebuild` — exit 0, which nothing before F2 had established.** It applies the
  config plugins' static config, so it exercises the plugin graph more deeply than `--type public`; six plugins
  now resolve with no plugin error on either path.
- **`npx expo config --type introspect` — still exit 1, and the sole remaining error is blocker B-1**:
  `[ios.infoPlist]: withIosInfoPlistBaseMod: ENOENT: no such file or directory, open
  '…/mobile/GoogleService-Info.plist'`, raised by the google-signin plugin's `getGoogleSignInReversedClientId`
  reading `ios.googleServicesFile`. This is the same blocker F2.0 identified and every F2 step reconfirmed;
  the `PluginError` count is 0 and no retired name appears anywhere in the output. **No plist was created and
  no native value was invented.**
- `npm install` (F2.7) is a true no-op: `package.json` and `package-lock.json` are **byte-identical before and
  after** (`a002328b…`, `f46bc21e…`), so the manifest, the lockfile and the installed tree agree.
- Retired-surface search over `mobile/lib/` + `mobile/app/` — **zero executable references** to
  `expo-auth-session`, `expo-web-browser`, `expo-crypto`, `AuthSession`, `openAuthSessionAsync`,
  `makeRedirectUri`, `useAuthRequest`, `promptAsync`, `native-intent`, `redirectSystemPath`, `oauthredirect`
  or `com.inventoryai.app`. The ten surviving text mentions (`expo-auth-session`, `googleRedirectUri`,
  `acquireGoogleIdToken`) are **all inside comments** recording the removal, and two `GOOGLE_SCOPES` hits are a
  **substring false positive** on the live `NATIVE_GOOGLE_SCOPES` constant in `lib/firebase-native.ts`.
- **Guard 59 → 77 cases**; **mobile suite 30 suites / 423 tests → 29 suites / 432 tests**. The suite count
  drops by exactly the deleted suite, and the test total is **+9 net** from two additions and two subtractions
  that must be read together: **+4** (F2.1), **+2** (F2.2), **+2** (F2.3), **−9** (F2.5's deleted cases),
  **−1** (the F1 block's per-file `it.each` walks `app/`, so deleting a file there removes one of its own
  cases), **+4** (F2.4/F2.5), **+7** (F2.6). `tsc --noEmit` and `eslint .` are clean throughout.
- **Every new assertion was proven able to fail before being trusted.** F2.4/F2.5: two injected probes (a
  `lib/` module naming the hook, and a recreated `app/+native-intent.ts`) → **2 failed**; probes removed →
  green. F2.6: three lockfile mutations (root declares `expo-web-browser`; `expo-crypto` hoisted; `firebase`
  nested under a non-kept package) → **3 failed**; lockfile then restored **byte-identically** to `f46bc21e…`.

**What F2 does NOT verify, and what remains.** F2 removes a native module, a native config plugin, a URL scheme
and an Android intent-filter, so **the existing Phase 32G development build cannot prove the reduced surface**
— risk **F-3** from the moment F2 was planned. Every F2 result above is therefore **config-verified, not
native-verified**; `introspect` is blocked by B-1 and the host is Windows, so the native consequences land with
the **F2.9 development build**, the only remaining F2 step. **iOS is still `[EXTERNAL VERIFICATION REQUIRED]`
(F-6)** — no iOS build exists for this project and none can be produced on this host.

**F2.9's target is decided: the LOCAL LAN BACKEND, not Render.** The development build must reach an API it can
actually talk to, and the Render service is a free-tier instance with cold starts; `mobile/lib/config.ts` would
otherwise fall back to the emulator-only `http://10.0.2.2:4000`. `EXPO_PUBLIC_API_URL` is therefore to be pointed
at the host's LAN address for the F2.9 run. The `development` profile still declares no `env`, so this is a
build/run-time decision and not a committed value.

**Carried forward, unchanged.** The **Render free-tier cold-start limitation** is accepted as a known V1 QA
limitation, with no plan or instance change proposed or made. The **F1 device smoke test remains deferred** —
the test device had no LAN route to the host, and a pre-existing unresponsive Metro process on port 8081 forced
a secondary port; neither condition is touched by F2.

## 14A.11 Phase F2.9 — the EAS development build and the Android runtime/native verification (2026-09-25)

Phase F2.9 is the step §14A.10 left open, and it closes the **F-3** and **F-6** verification gaps for Android. It
is an **EAS build plus a runtime verification**, and — like every other step in Phase F — it changed no source or
configuration file.

**The build.** `eas build --profile development --platform android` produced build
**`f3038fa1-1cab-476e-b0f9-d6a9178f955b`**, status **`FINISHED`**, profile **`development`**, platform
**Android** (`distribution: internal`, `android.buildType: apk`), created `2026-09-25T14:34:03Z` and finished
`2026-09-25T15:27:59Z` (≈40 min EAS free-tier queue + ≈12 min build). The EAS-managed keystore was **reused,
not created** (`Build Credentials 84JNqqnITp`), and the version code was minted server-side, so `app.json` was
never dirtied. Artifact:
`https://expo.dev/artifacts/eas/20nq60ekWSx40s8u9Cm_Y3mzjXhxpU8yOEmfe7X_qco.apk`. The build record displays
`gitCommitHash: 2ec35b8a…` (Phase F1) — **and that display is misleading**: EAS Build uploads the **working
directory**, not the commit (expo/eas-cli issue #3831: "*EAS just uploads your working directory as is*").

**The working tree is proven, not assumed, to be what was built — and this is the finding that makes the whole
verification valid.** The new build's fingerprint is **`d16abc4e7df419812e73598db676985be3606dc7`**, and
`eas fingerprint:generate --platform android` run on the current working tree returns **exactly the same hash**.
Because F2 removed dependencies from `package.json` and changed `app.json` — both fingerprint inputs — a build
of committed HEAD would necessarily have hashed differently. The uncommitted F2 tree is therefore what EAS
compiled, so F2.9 verifies **F2** rather than its predecessor.

**The runtime verification.** The APK installed successfully on the Android emulator **`emulator-5554`** (AVD
`InventoryAI`; **SDK 35**, **x86_64**), as an in-place upgrade over the 2026-09-24 build. The app **launched
successfully** — `ReactNativeJS: Running "main"`, `ExpoModulesCore ✅ JSI interop was installed` — and the
**`FATAL EXCEPTION` / `AndroidRuntime: FATAL` count for the whole session was 0**. The login screen rendered in
full (`Welcome back`, `Email *`, `Password *`, `Sign In`, `Forgot password?`, `Continue with Google`,
`New to Inventory AI? Create an account`).

**The F2 native surface is Android-runtime VERIFIED**, on four independent kinds of evidence:

- **Registered schemes** (installed-package dump): `com.inventoryai.app` is **absent**. The app's own scheme is
  `inventoryai`, alongside only framework/dev-client schemes contributed by Expo and the Google Sign-In
  libraries (`exp+inventory-ai`, `expo-dev-launcher`, `genericidp`, `recaptcha`).
- **Intent resolution:** `inventoryai://reset-password?token=…` **resolves to
  `com.inventoryai.app.MainActivity` and renders the full "Set a new password" screen**, so the retained Phase 27
  recovery route works at runtime. `com.inventoryai.app:/oauthredirect` answers **"unable to resolve Intent"**
  and `am start` fails outright — the retired callback is **unresolvable at the OS level**, and no browser or
  WebView opened.
- **APK dex inspection:** `expo/modules/webbrowser` **0**, `WebBrowserModule` **0** and `oauthredirect` **0**,
  while the kept native modules remain — `expo/modules/securestore` 139, `expo/modules/camera` 469,
  `io/invertase/firebase` 210, `com/reactnativegooglesignin` 50 and `com/google/firebase` 1276. **RNFirebase and
  native Google Sign-In remain**, and no `expo-web-browser` native surface survives in the artifact.
- **A real local-backend round trip:** submitting the login screen's "Send reset link" rendered **"Password
  reset is temporarily unavailable. Please try again later."** — which is
  `server/src/controllers/passwordReset.controller.ts`'s `MAIL_NOT_CONFIGURED_MESSAGE`, returned as the designed
  pre-lookup **503**, and which exists **nowhere** in the mobile app. The client therefore reached the backend
  and rendered the server's own copy. **Render was not used** at any point.

**The API/runtime nuance, recorded because the two paths differ.** The **EAS-built APK** itself carries the
expected development configuration behaviour around `http://10.0.2.2:4000` — the `development` profile declares
no `env`, and `.env` is excluded from the archive by `.easignore`. But a development build **loads its
JavaScript from a local Metro bundler**, and Metro loads the local `.env`, so the path actually exercised during
verification used the **private LAN backend address** rather than the emulator alias. Both are **local**, and
**neither is Render** (`onrender.com` appears 0 times). The build's stated target decision — local backend, not
Render — is satisfied on both paths; the private address is deliberately not reproduced in this document.

**Authentication status — the distinction is preserved, and no PASS is manufactured.** F2 changed **no
authentication logic**, and the following are **pre-existing environment limitations, not F2 failures**:

- **Email/password — PARTIAL.** The path **executes**: logcat shows the native Firebase SDK receiving
  `signInWithEmailAndPassword` (the Phase 32E Firebase-first flow). It failed with `lib/firebase-auth.ts`'s
  `DEFAULT_FAILURE_MESSAGE`, and the client correctly **did not fall back** to the legacy password route — the
  designed no-downgrade property. A successful sign-in requires a **live Firebase project and valid
  credentials**, neither of which this environment has ever had.
- **Native Google Sign-In — BLOCKED.** The native module is present and the button renders
  (`RNGoogleSigninButtonViewManager`), but the consent flow requires a live Firebase project.
- **Firebase → backend exchange — BLOCKED** (it needs a Firebase ID token).
- **Inventory AI JWT/session — BLOCKED** (it depends on the two above).
- **Firebase logout / session teardown — BLOCKED**, because no authenticated session can be created for it to
  tear down.

**iOS remains `[EXTERNAL VERIFICATION REQUIRED]`.** No iOS build can be produced on this Windows host, so the
`ios-simulator` profile stays unexercised. F-6 is unchanged and is **not** closed by F2.9.

**Provenance — what the verification did and did not touch.** During runtime verification **no source or
configuration file was changed**, **no EAS environment variable was changed**, **no Firebase service file was
created locally**, **no API URL was changed**, and **no commit or push occurred**; all five protected
working-tree files were unchanged before, during and after. Verification used a Metro bundler started on a spare
port because the pre-existing Metro on 8081 was unresponsive and the one on 8082 was unreachable — **neither
process was killed**. A physical device was attached to the host for the whole run and was **not** used: every
command targeted `emulator-5554` explicitly.

**EAS build-history correction (append-only; no historical record is rewritten).** EAS's own list holds **six**
Android builds, all `FINISHED`, of which **five** are `development`. Two of them —
**`28b9a4e2-406e-4269-bc98-12da3454b58c`** (2026-09-22, commit `6bac86e`) and
**`3cd7fae4-66d8-48be-88d0-a305b86c8c93`** (2026-09-24, commit `9917447`) — do not appear in the phase records
held at the time of this audit. Phase 32G's "three Android builds" was accurate as of 2026-09-20; F2.9 is
therefore the **sixth** Android build and the **fifth** development-profile build, not the fourth. Earlier
statements are **superseded, not rewritten**.

**Superseded statements.** §14A.10, `docs/DEVELOPMENT_ROADMAP.md` §27O and the `CLAUDE.md` Phase F2
cross-reference each recorded that **F2.9 had not been created** and that F2 was therefore config-verified only.
Those statements were true when written and are **superseded by this section** — the F2.9 EAS build and the
Android runtime verification above. They are preserved as the historical record they are.

---

## 14B. Phase 32H — the server-side linking boundary (implemented)

Phase 32H implements the **server half** of §14A.4 and deliberately nothing else. The question it
answers is exactly one: *may this authenticated Inventory AI account carry this verified Firebase
identity?* The provider half — obtaining a Google or Facebook credential, and Firebase's own
`linkWithCredential` against the signed-in Firebase user — is performed by the **Firebase client SDK**
and is not a server operation at all. No fake server-side provider-linking call was invented to
"complete" it.

### 14B.1 The route

```text
POST /api/auth/firebase/link          AUTHENTICATED (requireAuth + controller, no permission)
body:  { idToken }                    -> 200 { linked: boolean, user }
```

`validateFirebaseLink` reads `idToken` and **returns only `{ problems, idToken }`**, which is the
structural half of the whole design: the handler holds no variable that could carry a client-supplied
`userId`, `businessId`, `firebaseUid`, `role` or `status`, so those keys are inert rather than
validated-and-rejected. There is no check that could be deleted.

- **The account is `req.user.id`** — put there by `requireAuth` from the MongoDB document the caller's
  own session resolves to. The authenticated session *is* the ownership proof (§14A.4); requiring it
  is not a convenience, it is the evidence that was missing in the exchange's email-collision refusal.
- **The identity is `verifyFirebaseIdToken(idToken).uid`** — narrowed from a token whose signature
  Google verified. It is never read from the body.
- **`businessId` comes from `req.user`**, and the service never writes the field, so the route can
  neither reach across tenants nor move an account between them.
- **No rate limiter.** No authenticated route in the application is rate-limited today; adding one
  would mean a new limiter factory and config entry, which is out of this phase's scope. The route is
  bounded by the session it requires.

### 14B.2 The four lifecycle cases, in the order that matters

Decided in `server/src/services/firebaseLink.service.ts`. CASE A and CASE D are answered from the
**account's own** `firebaseUid` before the identity is looked up at all, so an account that already
owns an identity never has its own mapping queried, compared or replaced.

| Case | Condition | Outcome |
| --- | --- | --- |
| **A** | same identity, same account | **Idempotent success.** `linked: false`. No write, and **no audit row** — recording an event that did not happen is a false trail. |
| **D** | this account already owns a *different* identity | `409 FIREBASE_IDENTITY_CONFLICT`. Never silently replaced: swapping the mapping would hand the incoming account's holder a sign-in to this user. Decided before the lookup, so it costs no query. |
| **B** | the identity belongs to *another* MongoDB user | `409 FIREBASE_IDENTITY_CONFLICT`. **Never merged, never transferred.** The account that holds it keeps it untouched. |
| **C** | the identity belongs to nobody | Attached — safe only because the caller has already proved they own this account. |

**The email is never a join key in any of the four.** It is not compared against the account's, not
used to find an account, and not used to resolve a conflict. R-4/R-9 in force — and it is what makes
R-10 work: a provider that supplies no address links exactly as well as one that does.

**Concurrency is the database's problem, not the check's.** Attachment is ONE conditional update
(`{ _id, firebaseUid: null }` — which matches null or absent), so a second link racing the first
matches nothing rather than replacing an identity set microseconds earlier. The `firebaseUid` unique
index is the last line of defence behind the CASE B pre-check: the loser of a race sees E11000 and is
mapped to the *same* conflict, because reporting it as anything else would be the "auto-resolve a
compromised mapping" behaviour §7.4 forbids. A lost race re-reads and re-dispatches to CASE A or CASE D
rather than assuming.

### 14B.3 Error and audit hygiene

- **One `409` for CASE B and CASE D**, one code (`FIREBASE_IDENTITY_CONFLICT`), one generic message
  naming no account, tenant, role or Firebase UID. Telling the two apart would describe a mapping the
  caller may not be entitled to see.
- **The conflicting UID never enters the audit row.** The audit viewer is readable by every ADMIN of
  the business, and in CASE B that UID may name a person in a *different* tenant. The audit records a
  `reason` from a closed set; the UID goes to the server-side structured log, which no tenant can read
  — the standing `firebase_identity_collision` precedent.
- **The success row records `{ passwordCredentialRetained: boolean }`** and no UID. That flag is
  informational only: it marks the exact state whose `change-password` / reset disposition is O-2
  below, so an operator investigating has a start point.
- **A refused link does not revoke sessions.** Revoking would not undo the link (the attacker simply
  signs in again), so it would be behaviour invented for no security benefit.
- Two audit actions were added: `FIREBASE_IDENTITY_LINKED` and `FIREBASE_IDENTITY_LINK_CONFLICT`. The
  brief's other candidates — attempted cross-business linking, attempted role manipulation,
  unauthenticated linking — have **no emission site and cannot have one**: the payload carries no
  `businessId` or `role` to attempt them with, and `requireAuth` refuses an unauthenticated caller
  before any handler, so there is no `businessId` in scope to attribute a row to. Inventing rows for
  them would mean recording events the code cannot produce.

### 14B.4 What is deliberately NOT in Phase 32H

Google Sign-In UI · Facebook Login UI · Apple Sign-In · provider SDKs (none installed) · OAuth redirect
flows · Expo provider configuration changes · provider buttons · invitation UI · payment or
subscription changes · bulk Firebase migration · `auth:import` · unlink (any form) · any change to the
Firebase exchange contract · any weakening of the §14.1 password-authority guard.

### 14B.5 §15 finding — the password reset / `change-password` defect

**Inspected, documented, and deliberately not changed.** For an account carrying a `firebaseUid`, the
§14.1 guard means the retained bcrypt hash no longer authenticates anyone. Consequences, stated
exactly:

| Endpoint | Behaviour on a linked account |
| --- | --- |
| `POST /api/auth/change-password` | Validates the *current* password against the bcrypt hash, writes a new hash, stamps `passwordChangedAt` — which revokes every session. The user is signed out and the credential that authenticates them (Firebase's) is untouched. Reports success. |
| `POST /api/auth/forgot-password` / `reset-password` | Mails a link and rewrites the bcrypt hash. Same outcome: a successful-looking reset that does not change what signs the user in. |

**Whether the linking boundary interacts with this defect: it does, and only by making the population
reachable.** Before Phase 32H no code path wrote `firebaseUid` onto an existing password account, so
the state was theoretical. It now exists. **No behaviour was changed**, because the brief forbids
inventing a new password-reset policy and the disposition is already recorded as open (O-2). Changing
these endpoints without deciding the policy would settle by accident what is meant to be decided on
purpose. **O-2 is escalated by this phase from "blocks a future phase" to "a live defect", and the
final decision remains a separate explicit hardening item.**

### 14B.6 §16 finding — unlink and last-authentication-method

**Nothing was implemented and nothing was changed.** Unlinking remains client-side Firebase-only, the
server still cannot observe it, and Firebase's "last provider" protection is still unaware of a
retained `passwordHash` — so an account can be password-linked (Firebase refuses no unlink that matters
here) only insofar as Firebase's own rules allow. **O-1 is unchanged and still open**, and Phase 32L
remains the phase that owns it. Phase 32H added no unlink route, no unlink service and no unlink
audit action.

> **Superseded 2026-09-26 (Phase 32L — see `docs/DEVELOPMENT_ROADMAP.md` §27Q).** This subsection is the
> Phase 32H record and is not rewritten. Phase 32L subsequently shipped the unlink capability it records
> as absent — `POST /api/auth/firebase/unlink`, `requireAuth` + controller with no permission — under
> **Policy B**, which is the last-authentication-method invariant made structural: an account may leave
> Firebase authority only by establishing a **new local password in the same transition**, and the
> retained hash is replaced rather than re-enabled. **The "Firebase refuses the last provider" premise in
> this subsection was also refuted by runtime measurement, and the two measurements are separate facts:**
> the **last-provider** measurement saw the unlink **succeed on the account's final provider and leave the
> Firebase account with zero providers** — the refutation — while the separate **390-second** measurement
> saw a provider unlink **accepted** at an authentication age where `updatePassword` was **refused**, a
> finding about *recency*. That is why the protection is enforced **server-side and never delegated to
> Firebase**. `O-1`'s row in §14A.5 carries the same dated annotation.

### 14B.7 Verification

`server/test/phase32h-firebase-linking.test.mjs` — one unit suite (no database) and one DB-backed
suite over the real `app.ts`, **25 tests**, registered in `MIXED` in `scripts/run-tests.mjs`. The
brief's twelve required invariants are covered, including the ones that are easy to assert vacuously:
the payload returns only `{problems, idToken}`; a planted identity/tenant/role is inert; the token
email is never compared; CASE B and CASE D are indistinguishable to the caller; a rejected Firebase
token is a **400** and the caller's session survives it; an unconfigured server answers 503; the §14.1
guard is intact and is made *live* by linking; and two accounts racing for one identity produce exactly
one winner. `phase23-authorization-contract.test.mjs` declares the new route in its `AUTHENTICATED`
bucket.

**Every assertion was proven able to fail before being trusted**, by a mutation pass over the service,
the controller and the validator: seven mutations — removing each of the two doubly-enforced guards
(CASE D, CASE B), flipping the link route's 400 to a 401, making email a join key, adding the UID to
the success audit row, making CASE A non-idempotent, and making the validator return a client-supplied
`businessId` — were each applied to a pristine copy and each produced a red test. Two of those were
**doubly enforced** and only fell when *both* layers were removed: CASE D by the guard and by the
conditional update's `firebaseUid: null` filter, CASE B by the pre-check and by the unique index's
E11000. That is a finding worth keeping: removing either layer alone leaves the property intact, which
is what "defence in depth" means here rather than a redundancy to be tidied away.

---

# 15. Rate limiting considerations

The exchange endpoint is a **public** route that mints sessions, making it the highest-value target
introduced by Phase 32.

- **It must be rate limited from the day it ships**, reusing the existing limiter factories in
  `server/src/middlewares/rateLimit.ts` rather than adding a new mechanism.
- **`skipSuccessfulRequests` must be OMITTED.** The same reasoning the recovery limiters already
  document applies: a successful exchange is a 2xx, and skipping 2xx would exempt precisely the
  traffic the limiter exists to bound. The option appears only on the two Phase 07B login limiters,
  and both facts are guarded by tests.
- **A `verifyIdToken` call is not free.** Google's verification is a cryptographic check against
  cached public keys, but an unthrottled endpoint still lets an attacker force work.
- **Two buckets are worth having**, mirroring the login design: a per-IP cap (address rotation
  backstop) and, if a stable key exists, a per-identity cap. Note that the identity is unknown until
  *after* verification, so an identity-keyed bucket necessarily costs one verification first.
- **The `REGISTRATION_REQUIRED` path must be counted, not skipped.** It is a legitimate outcome but
  also an enumeration surface for "which Firebase identities exist".
- **Limiter stores remain in-memory and per-process** (E3, deferred to V4). Phase 32 does not change
  that, and must not claim protection it does not have: behind more than one instance, limits are
  per-instance.
- **Route classification.** Two new public routes take the Phase 23 inventory from **60 → 62 routes**
  and **6 → 8 public**. `phase23-authorization-contract.test.mjs` **must be updated in the same
  commit** with a written reason for each, and it will fail until it is. That guard asserts bucket
  *membership*, not counts, so it fails on the declaration, which is the intended design.

---

# 16. Failure scenarios

## 16.1 Firebase unreachable or returning errors

| Situation | Outcome |
| --- | --- |
| Firebase down, user already signed in | **Unaffected.** Application JWTs are ours; every API call works. This is a property of Option B. |
| Firebase down, user signing in | Sign-in fails with a retryable error. No session is created. |
| Firebase slow | Bounded by an explicit timeout, mirroring `MAIL_REQUEST_TIMEOUT_MS`'s precedent. |
| Misconfigured project id (audience mismatch) | **Every** verification fails. The most likely misconfiguration, and it fails closed and loudly. |

## 16.2 Verification failures (all 401, never 500)

Expired token · invalid signature · wrong issuer · wrong audience · malformed token · token from a
different Firebase project. Each must map to a distinct, **server-side-logged**, client-safe message.
A 500 here would leak that verification was attempted and failed internally.

## 16.3 Identity resolves to no MongoDB user

`REGISTRATION_REQUIRED` — a normal outcome for a valid identity with no tenant, **not** an error
status. It is what makes orphaned federated registrations self-healing (§8.2).

## 16.4 Identity resolves to a disabled or suspended principal

403 `ACCOUNT_DISABLED` / 403 from `assertActiveBusiness` — identical to today's password login, so a
disabled user cannot bypass the gate by switching sign-in method.

## 16.5 Credential collision

A Google sign-in whose email matches an existing password account. Without the §14.4 decision this
raises `auth/account-exists-with-different-credential`. **It must be handled explicitly; surfacing a
raw Firebase error string to the user is not acceptable.**

## 16.6 Orphaned Firebase account

**The recoverable case.** Registration step 4 fails after step 1 succeeded. Recovered by
`REGISTRATION_REQUIRED` (§8.2): the retry adopts the existing identity. For email/password that adoption
requires the **same password**, so it proves the caller owns the credential rather than merely knowing
the address.

**The unhealable case — KNOWN LIMITATION, no fix implemented (recorded by Phase 32E, 2026-09-20).**
A **legacy MongoDB account** (a `User` with a `passwordHash` and no `firebaseUid`) can have a Firebase
identity created for the same email without ever being linked to it:

1. Someone registers on the mobile client with that email. Step 1 creates the Firebase identity —
   Firebase knows nothing about the MongoDB user, so this succeeds.
2. `POST /api/auth/firebase/register` finds `User.exists({ email })` and answers `409 EMAIL_IN_USE`
   (account linking is refused, not implemented — `server/src/services/firebaseAuth.service.ts`).
3. The Firebase identity is left orphaned.

The §8.2 self-healing path does **not** apply: `exchangeFirebaseSession` resolves a user by
`firebaseUid` **only, never by email**, so that identity can never resolve to the existing MongoDB
account, and every retried registration fails its pre-check the same way. The orphan is permanent.

**What it is not.** Not an account takeover and not a lockout. Because the exchange never matches by
email, the holder of the orphaned identity receives `REGISTRATION_REQUIRED` rather than a session; and
the legacy account is unaffected — it carries no `firebaseUid`, so the §10 guard does not fire and its
password login keeps working.

**Why no fix is implemented here.** Client-side deletion of the Firebase account on failure is rejected
by §8.2 as racy, and a server-side pre-check would be a new public route requiring its own Phase 23
authorization classification — neither belongs in this increment. The limitation is recorded so that the
migration/linking phase owns it.

**Binding constraint on the migration/linking phase.** When lazy link-on-login (§9.1) creates the
Firebase user for an existing account via `admin.auth().createUser()`, it will receive
`auth/email-already-exists` for exactly these addresses. That outcome **MUST NOT be allowed to fail the
legacy password login** — a user would otherwise be locked out of their own account by a Firebase
identity they never created. The linking phase must handle the collision explicitly (for example by
adopting the existing identity once the credential is proven) rather than treating it as a login error.

## 16.7 Client-side session desynchronization

The application JWT is revoked but the Firebase session is live. The next request returns 401
`SESSION_REVOKED`, the existing `sessionLostHandler` clears local state, and the user signs in again —
or the client re-exchanges silently if a Firebase session remains. **Both paths must be exercised in
the emulator smoke (Phase 32H); neither is unit-testable.**

## 16.8 Service-account key misconfiguration on Render

A PEM stored through a web UI routinely loses its real newlines. This fails at startup, not at first
login, and the mitigation is a single base64 `FIREBASE_SERVICE_ACCOUNT_JSON` variable instead of three
separate ones (§17).

---

# 17. Required configuration

## 17.1 Server secrets (never in the app, never in git)

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

**Recommended instead of the three above:** a single base64-encoded
`FIREBASE_SERVICE_ACCOUNT_JSON`, which eliminates the newline-mangling failure class entirely.

Production fail-fast joins the existing `validateProductionConfig` contract: if any Firebase variable
is set, all required ones must be present and the key must parse — and the error message names only
the **variable**, never the value, matching the existing convention. In development and test these
checks stay lenient so the server still boots without Firebase configured.

`server/.env.example` gains these names with comments and **no values**.

## 17.2 Mobile configuration

**M1:** no new environment variables. Configuration arrives through the native files referenced by
`app.json`'s `googleServicesFile`, plus the iOS URL scheme. New plugins are required in `app.json`
(Firebase, Google Sign-In, and `expo-build-properties` for the iOS static-framework requirement).

**M2:** `EXPO_PUBLIC_FIREBASE_*` variables (apiKey, authDomain, projectId, appId, …) added to
`mobile/.env.example` with names only.

**Either path preserves:** `scheme: "inventoryai"`, both platforms' `com.inventoryai.app` identifier,
`extra.eas.projectId`, `owner`, and the existing `expo-router` / `expo-secure-store` / `expo-camera`
plugins.

---

# 18. Verification gates (UNVERIFIED)

Two facts are load-bearing for Phase 32 and **could not be verified** while writing this document.
The authoritative documentation pages returned truncated content, and neither fact may be asserted
from memory. **Both must be resolved before the phases that depend on them are planned in detail.**

**Gate 1 — Firebase `auth:import` support for our existing bcrypt hashes. Status: UNVERIFIED.**
The Admin SDK import page's visible content listed only `HMAC_SHA256`, `SCRYPT` and `STANDARD_SCRYPT`;
a bcrypt entry was not present in the retrieved excerpt, and the CLI page returned navigation chrome
rather than its article body. Our hashes are `bcryptjs` rounds 10.

- *Affects:* §9.3 bulk migration only. **Lazy migration is unaffected.**
- *If it fails:* bulk import is impossible; the fallback is lazy migration plus a forced-reset
  campaign, whose user-visible cost the owner must accept.
- *How to settle it:* `firebase auth:import --help` against the pinned CLI version, plus the CLI
  reference's article body — **not** a summary.

**Gate 2 — the exact React Native Firebase Expo config-plugin configuration for Expo SDK 57.
Status: UNVERIFIED.**
Expo's own guide names `@react-native-firebase/app` and confirms the Expo Go incompatibility, but it
carries no `app.json` snippet, no `googleServicesFile` key placement, and no `expo-build-properties`
settings; it defers to rnfirebase.io, whose `/auth/usage` page returned the plain-React-Native path
without Expo detail. The per-service auth package name and the plugin options are therefore unconfirmed
for SDK 57.

- *Affects:* §12 M1, §13.1 and §17.2 — i.e. **any phase that touches native mobile configuration.**
- *How to settle it:* the rnfirebase.io Expo page, plus `npx expo config --type introspect`, which
  reports the *resolved* native surface after plugin auto-discovery and is the only check that sees
  plugins contributed by installed modules. **It requires no build.**

**A third item, not a gate but a constraint:** Phase 30A records that **no EAS build has ever been
executed**. M1 therefore forces the project's first EAS build, its first keystore, and the two-build
fingerprint bootstrap (§13.3). Any M1 schedule must carry that risk.

---

# 19. Testing strategy

| Area | Kind | Notes |
| --- | --- | --- |
| Expired / invalid-signature / wrong-audience / malformed ID token | Unit, stubbed verifier | No Firebase project required |
| Unknown uid → `REGISTRATION_REQUIRED` | DB-backed | Not a 404 |
| Disabled user, unknown MongoDB user | DB-backed | Must match today's codes exactly |
| **`firebaseUid` in the request body is ignored** | DB-backed | **Mandatory** — without it the central security claim is untested |
| `firebaseUid` sparse-unique: two legacy users with no uid both insert | DB-backed | The §7.2 trap |
| Exchange mints a session usable by all 47 gated routes | DB-backed | Proves the two layers compose |
| **RBAC + tenant isolation + cross-business attempts** | **Reuse Phase 24's matrix, untouched** | Its expectations are derived from `hasPermission`, so it must stay green without edits |
| Route classification 60 → 62, 6 → 8 public | DB-free | `phase23-…` updated in the same commit |
| Rate limiting on the exchange route | DB-backed | Including that `skipSuccessfulRequests` is absent |
| Registration sequence and the orphan path | DB-backed | |
| Google Sign-In | **Emulator smoke only** | Not unit-testable |
| Persisted session across app restart | **Emulator smoke only** | |
| Logout clears **both** credentials | **Emulator smoke only** | The two-credential trap |
| Silent re-exchange after JWT expiry | **Emulator smoke only** | |
| Legacy login still works (regression) | DB-backed | The rollback property, asserted |

**Constraint:** the mobile suite currently mocks nothing Firebase-related; M1 requires mocking the
native module in `jest.config.js`, and any test touching `lib/auth.tsx` must be updated in the same
commit as the rewire.

---

# 20. What must NOT change

- `server/src/middlewares/authenticate.ts` — check order, error codes, `req.user`/`req.auth` shapes
- `server/src/constants/roles.ts` — 4 roles, 21 permission keys **and their exact values**,
  `ROLE_PERMISSIONS`, `CATALOGUE_ONLY_PERMISSIONS`
- `mobile/lib/permissions.ts` — the Phase 23 mirror stays in lock-step with the server
- The Phase 23 route classification — new routes are **declared**, never exempted
- `businessId` derived from the MongoDB `User`; never from a body, query, or header
- The global 404/error envelope `{error, message}` carrying **no** `code`
- Client-facing codes the mobile app branches on: `ACCOUNT_DISABLED`, `SESSION_REVOKED`,
  `SESSION_INVALIDATED`, `INVALID_TOKEN`, `AUTH_REQUIRED`, `EMAIL_IN_USE`, `INVALID_CREDENTIALS`
- `server/src/services/session.service.ts` and `models/session.model.ts`
- `server/src/config/jwt.ts`
- Phase 21's archive-only product invariant and the AI read-only boundary
- `assertBusinessAccess` — production-dead, byte-identical (Phase 24 pinned its inertness)
- No secret in git; `.env.example` carries names only

**Added by Phase 32F (§14A) — the multi-provider invariants.** These bind every future provider phase
and are listed here so they sit with the rest of the frozen surface:

- **The Firebase exchange stays UID-authoritative.** It resolves a user by `firebaseUid` and **never by
  email**; an unresolved UID keeps the existing registration-required behaviour.
- **The `firebaseUid` login guard stays.** `loginWithPassword` continues to refuse a linked account
  with `403 FIREBASE_SIGN_IN_REQUIRED`, in the same position (after the password comparison and the
  status check, before the session write). It is not to be removed or weakened.
- **Sessions stay provider-neutral.** `models/session.model.ts` gains **no provider field** and no
  provider-specific session type may be introduced.
- **`businessId`, `role`, `status`, Firebase linkage, permissions and subscription access are
  server-controlled** and are never read from the mobile client.
- **Email is not an account-linking join key.** No provider identity may be linked to an existing
  account because the addresses match (§14A.4).
- **Subscription ownership is business-level**, never keyed to a Firebase UID.
- **The 4 roles, 21 permission keys, `ROLE_PERMISSIONS` and the Phase 23 mobile mirror are unchanged**
  by any provider work.

---

# 21. Phase outline (not authorised by this document)

Recorded for sequencing only. **The dependency order differs from the original brief**: the server
exchange endpoint must exist before any mobile work, because mobile has nothing to exchange against
otherwise.

| Phase | Scope | Depends on |
| --- | --- | --- |
| **32A** | This document. Documentation only. | — |
| **32B** ✅ | **Shipped.** Server Admin SDK: dependency, `config/firebase.ts`, verifier wrapper, env + fail-fast, `firebaseUid` / `emailVerified` / `passwordHash.required:false`, `.env.example`. **No routes.** Gate 1 not required. | 32A approval, Gate 2 if native config changes |
| **32C** ✅ | **Shipped.** Exchange + registration routes, service, limiters, Phase 23 classifier update. | 32B |
| **32D** ✅ | **Shipped.** Firebase JS SDK boundary on mobile: `mobile/lib/firebase.ts`, the SDK version, initialization order, the `inMemoryPersistence` decision and the `EXPO_PUBLIC_FIREBASE_*` gate. Infrastructure only — no screen reached Firebase. | 32C |
| **32E** ✅ | **Shipped.** Firebase email/password authentication flow: Firebase-first sign-in, the legacy fallback confined to the two codes that mean "no Firebase identity answers to these credentials", `ensureFirebaseAccount`'s orphan adoption, and the server-side `firebaseUid` login guard (§10, §11, §14.1). | 32D |
| **32F** ✅ | **Shipped as something other than this table planned** — see the note below. Decision record and documentation close-out: the eleven resolved owner decisions (§14A.3), the linking policy (§14A.4), the open register (§14A.5), and reconciliation of the specification, README, roadmap and CLAUDE.md. **Documentation only — no code, schema, dependency, route, configuration, payment or EAS change.** | 32E |
| *(deferred)* | Google Sign-In: fingerprints, URL scheme, the second build, credential-collision handling. **A later phase, still not numbered.** §14.4 is now **resolved** (§14A, R-4/R-8/R-9): no automatic linking, and explicit linking requires ownership proof. Still requires **§14.5 (M1 vs M2)** and the first EAS build. | — |
| *(planned)* | MongoDB sync: `firebaseUid` backfill, admin-created users, reconciliation. **This was the row this table called "32F"; the number has since been used for the decision record above, so this work is now unnumbered.** | 32E, §14.3 |
| *(planned)* | Migration/compat: legacy path retained, lazy link-on-login, bulk import **if Gate 1 permits**. | Gate 1, §14.7, §14.9 |
| *(planned)* | Test suites + emulator smoke. | Migration phase |
| *(planned)* | Production readiness: Render secrets, monitoring, runbook, rollback rehearsal. | Test phase |

**Reconciled 2026-09-20 (Phase 32E).** This table is the **plan** Phase 32A recorded, not the shipped
sequence, and the two diverged deliberately. The mobile work was re-split by the owner as it shipped:
**32D** became the Firebase client boundary and **32E** became the email/password flow plus the
legacy-path guard, while **Google Sign-In moved to a later, unnumbered phase** and is not part of
either. Rows for unbuilt phases (32F–32I) are left as planned rather than renumbered, so this remains a
plan and not a second, competing schedule. The shipped record is
`docs/DEVELOPMENT_ROADMAP.md` **§27H**.

**Reconciled again 2026-09-20 (Phase 32F).** The owner reassigned the number **32F** to the
multi-provider **decision record and documentation close-out** (§14A), which is not the "MongoDB sync"
row this table planned for it. Rather than renumber the unbuilt rows — which would silently restate a
plan as a schedule — the planned rows above are now marked *(planned)* and left in their original
order, and the note is the record of the change. **No phase beyond 32F is authorised**, the planned
rows are not a commitment to build in that order, and the decision record does not authorise any of
them. The shipped record is `docs/DEVELOPMENT_ROADMAP.md` **§27I**.

---

# 22. Definition of Done — Phase 32A

- This design document exists at `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
- Option B is recorded as the selected architecture, with A and C documented as rejected and why.
- Every non-negotiable invariant is stated (§4) and every preserved subsystem is named (§10).
- The two unverifiable facts are marked **UNVERIFIED** with a concrete route to settling each (§18).
- The ten open owner decisions are listed without being silently resolved (§14).
- `docs/DEVELOPMENT_ROADMAP.md` references this document (§3 Phase Overview and §27G).
- **No source code, dependency, package manifest, environment variable, database record, Firebase
  project, EAS/Render configuration, commit or push is changed.**
