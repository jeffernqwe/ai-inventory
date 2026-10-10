# Inventory AI — Claude Code Project Instructions

## 1. Project

This repository contains an AI-powered Inventory Management System for Android and iOS.

The complete system requirements are defined in:

`docs/SYSTEM_SPECIFICATION.md`

That document is the primary source of truth for the system.

---

## 2. Technology Stack

### Mobile

- React Native
- Expo
- Expo Router
- TypeScript

### Backend

- Node.js
- Express.js
- TypeScript
- REST API

The backend is **TypeScript-first and has no build step**. It runs its `.ts` sources
directly through Node's native type stripping — `npm start` is `node src/index.ts` — so
Node **24**, pinned by `.nvmrc` and `engines.node`, is both the development and the runtime
target, and an older runtime cannot start the server. `tsconfig.json` sets `noEmit` and
`erasableSyntaxOnly`, so `tsc` acts purely as a checker and any syntax Node could not strip
is a compile error rather than a runtime `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.

The server TypeScript migration campaign (**TS-1** … **TS-2F-p**) is **complete and
closed**. `server/src` holds 94 `.ts` modules and exactly one intentionally deferred `.js`
module, `server/src/services/entitlement.service.js`. `.ts` is canonical: new and modified
server code is written in TypeScript. `docs/TS-MIGRATION-MANIFEST.md` records the campaign
history, the deferred exception and the verification baseline.

### Database

- MongoDB Atlas
- Mongoose

### Authentication

- Firebase Authentication — the **identity provider** (answers "who is this person?")
- JWT — the Inventory AI **application session**, exchanged from a verified Firebase ID token
- bcrypt — legacy password hashes, retained for accounts that predate Firebase, and **on a retirement path** (locked direction 2026-09-29 — design §14C)
- Server-side session records named by a mandatory `jti` (Phase 26A)

Firebase identity and Inventory AI authorization are **separate systems**. A verified Firebase ID
token is exchanged **once** at `POST /api/auth/firebase/exchange` for an ordinary Inventory AI
access token; it never becomes the API bearer credential. `firebaseUid` is an **identity linkage
field, not an authorization source** — `businessId`, `role`, `status` and permissions always come
from the MongoDB `User`, loaded per request. The Firebase exchange is **UID-authoritative**: it
resolves a user by `firebaseUid` only and never by email.

Provider architecture (Google / Facebook / Apple) and the account-linking security policy are
documented in `docs/SYSTEM_SPECIFICATION.md` §29 and in the design authority
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14/§14A/§14C. **Facebook
Login and Apple Sign-In are NOT implemented.** *(Corrected 2026-09-29: **Google Sign-In** and the server-side **link** boundary are implemented — Phases C and 32H respectively. Provider linking itself is performed by the Firebase **client** SDK and has no server-side equivalent. Corrected 2026-10-02: the server-side **unlink** boundary does **not** exist — it was removed at HEAD `6e2252f` (Phase F-1), which deleted `server/src/services/firebaseUnlink.service.ts` and re-scoped Firebase disconnect into a password change.)* They are
planned and require an owner-approved phase each.

### Firebase-only authentication — the locked direction (design only; nothing removed)

**Firebase Authentication becomes the sole authentication authority**: email/password, Google, password
reset/recovery, email verification and password changes are all Firebase's. **The Inventory AI JWT and
server-side session remain**, and **MongoDB remains authoritative** for `businessId`, `role`, `status`,
permissions, business lifecycle and tenant isolation. **Business authorization must not move into
Firebase custom claims as the primary authority**, and no custom claim is introduced, read or trusted.
Email/password users must have a **verified email before entering the main app**; a Google user is
verified according to Firebase's signed claim, not because the provider is Google.

**The registration and email-verification flow is DECIDED (2026-09-29, Phase 32O).** The gate is the
**registration ordering** — the verification email is sent first and **no MongoDB `User`, no
`Business`, no Inventory AI JWT and no server session exist until `reload()` confirms
`emailVerified === true`** — plus a **client verify screen** for the signed-in-but-unverified
identity, so **`requireAuth` is deliberately not modified** and the Phase 23/24 authorization order and
status codes are untouched. The **Firebase UID remains the only** Firebase→MongoDB identity join key
(**email is never one**); `User.businessId` stays required and `User` + `Business` stay fused; resend
is **native Firebase Auth**; and the legacy `/api/auth/register` path stays **transitional** until it is
retired. The **verification-link return is selected as the Inventory AI deep-link flow**, with the
Firebase-hosted page recorded as the fallback, and it inherits the open L-17 gate. **None of it is
implemented.** Authoritative record: design **§14C.9** (decisions **RG-1…RG-15**, audit gaps
**D-5…D-9**, **OD-3 resolved**); roadmap **§27V**; checklist **§39**.

> **AUTH-04 supersession (2026-10-02).** Email verification is now a **custom 6-digit Inventory AI code
delivered through the provider-agnostic mail boundary** (Brevo is a supported provider and was the
provider used for the live acceptance; Resend remains supported), **not** a Firebase verification link,
and the client resends through Inventory AI
rather than native Firebase Auth. A successful confirmation sets Firebase's own `email_verified` state
through the Admin SDK (`updateUser(uid, { emailVerified: true })`). The registration **ordering** gate,
the **Firebase-UID-only** join, MongoDB authority and the unmodified **`requireAuth`** are preserved, and
the server-side **`EMAIL_NOT_VERIFIED`** enforcement remains. This supersedes the link/resend and
verification-link-return text above. See design **§14C.10**, checklist **§40**, roadmap **§27Y**.
>
> **AUTH-04 status (2026-10-04).** AUTH-04-A through AUTH-04-F are **shipped**; **AUTH-04-G PASSED its
> live end-to-end acceptance gate on Brevo** (request HTTP 200 with the exact success envelope, Brevo
> `sent` → `delivered`, confirmation HTTP 200 with `Email verified.`, Firebase `emailVerified` false →
> true, Mongo challenge consumed, safe-log checks passed); **AUTH-04-H** is the documentation close-out.
> The request path enforces a **60-second per-UID resend cooldown**; restart-while-unverified is
> **resolved by the shipped AUTH-04-F read-only probe** (unverified → verification screen, verified →
> Login, probe failure → unreachable state; no automatic sign-in or session restoration).

**Nothing has been implemented or removed by this decision.** The application-owned password path —
bcrypt login/register, the custom reset-token flow and the Resend mail layer, and admin-created
password accounts — is on a **retirement path**, with **invitation-based onboarding a hard prerequisite**
of removing legacy login (because `users.service.create` writes a password hash and no `firebaseUid`).
A Firebase-native credential change completes client-side and would therefore revoke **nothing**, so a
**credential-change revocation bridge** is required before native recovery or change-password ships.
The action-link return leg must be verified on a real device against a live Firebase project before
recovery is called complete, and iOS remains `[EXTERNAL VERIFICATION REQUIRED]`.

Authority for all of the above: `docs/SYSTEM_SPECIFICATION.md` §29 · design authority
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C** (locked decisions L-1…L-19, the
bridge, the order plan) · security record `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` **§39** · shipped
record `docs/DEVELOPMENT_ROADMAP.md` **§27U**.

### AI

- AI provider abstraction
- Providers: the Claude and Gemini built-ins, plus **OpenRouter** — an Anthropic-compatible gateway that
  is the **currently deployed provider**. It is selected server-side by `AI_PROVIDER` and requires
  `OPENROUTER_API_KEY` + `OPENROUTER_BASE_URL` + `AI_MODEL_OPENROUTER`, with **no default model**. The
  retired AgentRouter gateway has been removed and must not be reintroduced. See
  `docs/DEVELOPMENT_ROADMAP.md` §27S.
- AI credentials must remain server-side

---

## 3. Repository Structure

```text
/
├── CLAUDE.md
├── docs/
├── mobile/
├── server/
└── README.md
```

Do not place backend code inside `mobile/`.

Do not place mobile code inside `server/`.

Keep concerns separated.

---

# 4. Mandatory Architecture Rules

These rules must always be respected.

### Database

MongoDB is the source of truth.

The mobile application must NEVER connect directly to MongoDB.

Correct:

```text
Mobile → Backend → MongoDB
```

Incorrect:

```text
Mobile → MongoDB
```

### AI

The AI must NEVER connect directly to MongoDB.

Correct:

```text
Mobile
  ↓
Backend
  ↓
AI Service
  ↓
Controlled Tool
  ↓
MongoDB
```

Never provide MongoDB credentials or unrestricted database access to an AI provider.

### Authorization

The backend is the security boundary.

Always enforce:

- Authentication
- Authorization
- Role permissions
- Business isolation

on the server.

Do not rely on the mobile UI to enforce security.

### Business Isolation

Every business-owned resource must be isolated by `businessId`.

Never trust a client-provided `businessId`.

Determine business context from the authenticated user/session.

### Inventory

Inventory changes must follow the inventory business rules defined in:

`docs/SYSTEM_SPECIFICATION.md`

Inventory changes must create appropriate inventory transactions.

Do not allow negative inventory unless explicitly specified.

Products follow an archive-only lifecycle: `ACTIVE` <-> `ARCHIVED`, with `ARCHIVED`
terminal. Products are never hard-deleted by the application — no delete route,
service method, or cascade exists, and none may be added without explicit
specification. Archiving retains the product's inventory records and its full
transaction history.

Referential integrity between inventory and products is a responsibility of
application lifecycle rules and write-path validation, not of MongoDB. Mongoose
`ref` does not enforce anything; read-path filters are defensive query hygiene,
not integrity enforcement.

### AI V1

The AI assistant is READ-ONLY.

It may retrieve, summarize, explain, and analyze authorized inventory information.

It must NOT modify:

- Products
- Inventory
- Transactions
- Users
- Roles

unless a future specification explicitly enables these capabilities.

---

# 5. Security Rules

Never:

- Hardcode secrets
- Commit `.env`
- Expose API keys to the mobile application
- Expose MongoDB credentials
- Trust client authorization
- Trust AI authorization
- Return sensitive internal errors to clients

Use environment variables for secrets.

Maintain an `.env.example` containing variable names but never real credentials.

---

# 6. Development Rules

Before implementing a feature:

1. Read the relevant specification.
2. Inspect the existing implementation.
3. Understand the current architecture.
4. Create a short implementation plan.
5. Implement only the requested scope.

Do not blindly rewrite existing code.

Do not introduce unnecessary dependencies.

Prefer simple and maintainable solutions.

---

# 7. Phase Discipline

The project is developed in phases.

```text
Phase 00 — Planning & Inspection
Phase 01 — Project Foundation
Phase 02 — Backend + Database
Phase 03 — Authentication + Authorization
Phase 04 — Inventory Core
Phase 05 — Mobile Application
Phase 06 — AI Assistant
Phase 07 — Testing + Production Hardening
Phase 08 — Owner-Directed Hardening (lettered increments)
            08A — Structured request logging + correlation IDs
            08B — Backend ESLint baseline
Phase 10 — Commercialization Foundation (lettered increments)
            10A — SaaS plan state + centralized entitlement checks
            10B — Documentation close-out
Phase 11 — Inventory Intelligence & Alerts (lettered increments)
            11A — Inventory health counts + reorder list + read-only restock tool
            11B — Documentation close-out
Phase 14A — User Management Foundation (OWNER/ADMIN users.manage API: list/create/role+status; no OWNER, no self-change, ADMIN↔ADMIN restricted)
Phase 16 — Audit Trail Viewer (read-only GET /api/audit: OWNER/ADMIN governance trail; action/entityType/user/date/q filters; no write routes)
Phase 17 — Mobile Supplier & Purchase Order Management (suppliers CRUD/archive + PO create/edit/issue/cancel on mobile; zero backend changes; STAFF view-only)
Phase 19 — Stock Transfers Between Locations (POST /api/inventory/transfer: two-leg TRANSFER movement + Phase 07A compensation; existing INVENTORY_MANAGE permission; MANAGER+)
Phase 21 — Product Archive-Only Lifecycle & Inventory Invariant (documentation + regression guards only; no production behavior change)
Phase 22 — Authorization Contract Enforcement & RBAC Coverage Guards (read routes bound to their view permissions; `CATALOGUE_ONLY_PERMISSIONS` declared; no role grant changed)
Phase 23 — Authorization Contract Completion: Route Classification & RBAC Mirror Guards (every route classified into a declared authorization bucket; mobile RBAC mirror pinned to the server matrix; `requireRole` inertness and client error-code contract; no production behavior change)
Phase 24 — Runtime Authorization Matrix & Tenant-Isolation Verification (runtime role × real-route matrix derived from `ROLE_PERMISSIONS`; role-change effect proven on an existing JWT in both directions; empty OWNER-only runtime tier asserted; no production behavior change)
Phase 25 — Design-Token Contrast Close-Out & Mobile Known-Issue Reconciliation (two light-theme tokens raised to WCAG AA on every surface they are used on; measured, not eyeballed; no production behavior change)
Phase 26A — Session Hardening & Real Logout (server-side session records named by a mandatory `jti`; real server-side sign-out, per-session revocation and sign-out-everywhere; no new permission, no refresh-token rotation; every pre-26A token is rejected once)
Phase 26B — Password Recovery (email reset link: provider-agnostic mail layer with a Resend transport, single-use hashed reset tokens; `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` added as two PUBLIC routes; no new permission, no new dependency, no mobile change; the request path answers one identical 202 to every caller)
Phase 27 — Mobile Password Recovery (`/forgot-password` and `/reset-password` public screens consuming the existing Phase 26B endpoints; custom-scheme reset link `inventoryai://reset-password`; a successful reset clears the client session before returning to Login; ZERO backend changes and no new dependency; Universal Links / Android App Links deferred; iOS verification export-only)
Phase 28 — Password Reset Mail Delivery Timing Hardening (B1 ONLY — the outbound password-reset email send is detached from the HTTP request path, so the 202 no longer waits on a mail provider: the send is dispatched unawaited after the durable token and audit writes, with an explicit rejection handler attached in the same synchronous turn; the pre-lookup `MAIL_NOT_CONFIGURED` 503, the uniform 202, token semantics, audit ordering, rate limiting and mobile are unchanged; PARTIALLY MITIGATED, NOT CLOSED — the residual database-work timing term is NOT eliminated; B2 was NOT implemented and remains open)
Phase 29 — Residual Security-Risk Decision Record & Documentation Reconciliation (documentation only; records the owner's dispositions of the three remaining open security items — B1's residual database-work timing term ACCEPTED FOR V1 and DEFERRED, still PARTIALLY MITIGATED and NOT CLOSED; B2 and E3 DEFERRED TO V4 as related shared-infrastructure work, both still open — and reconciles the roadmap Phase Overview, the missing README Phase 26B entry, and the specification's §48 future-roadmap list with what has already shipped; no production code, test, dependency, configuration, limiter or password-reset behavior changed, no shared store introduced, and no historical verification snapshot back-updated)
Phase 30A — EAS Development Build & iOS Readiness Foundation (EAS foundation only: the Expo Continuous Native Generation architecture is retained and no `ios/` or `android/` directory exists or is committed; the project is linked to EAS project `@jeffernqwes-team/inventory-ai` — `607eca05-1175-43ed-86a0-1829e91c9531`; `mobile/eas.json` defines `development`, `ios-simulator`, `preview` and `production` with `cli.appVersionSource: "remote"` and no update channel; `expo-dev-client` added and `expo-updates` deliberately not installed; bundle/package identifier `com.inventoryai.app` on both platforms; NO EAS build, submit or prebuild has been executed, so the phase is statically validated only and NOT runtime-verified; F-1 — the Phase 30A **PDF-sharing** finding, unrelated to the much later registration required-field validation fix recorded in the unnumbered entry below — is NOT fixed and NOT closed; Phase 30B has NOT started)
Phase 32B — Firebase Admin SDK Foundation (server-only verify boundary: Admin SDK dependency, `config/firebase.ts`, ID-token verifier wrapper, environment validation + production fail-fast, `.env.example` names, and three additive `users` fields — `firebaseUid` String `sparse: true` unique, `emailVerified` Boolean persisted but NOT enforced, `passwordHash.required: false`; NO routes)
Phase 32C — Firebase Authentication Session Exchange (two PUBLIC routes `POST /api/auth/firebase/exchange` and `POST /api/auth/firebase/register`, their service and rate limiters; the Firebase ID token is exchanged ONCE for an existing Inventory AI access token and never becomes the API bearer credential; `REGISTRATION_REQUIRED` for a verified identity with no MongoDB user; a colliding email is refused with `EMAIL_IN_USE` — linking is REFUSED, not implemented; `requireAuth`, RBAC and the legacy path unchanged)
Phase 32D — Firebase JS SDK Boundary (mobile `lib/firebase.ts` ONLY: SDK version, initialization order, the `inMemoryPersistence` decision and the `EXPO_PUBLIC_FIREBASE_*` gate that leaves the SDK uninitialized; infrastructure only — no screen reaches Firebase, no API call is made, no authentication state is touched)
Phase 32E — Firebase Email/Password Authentication Flow (mobile Firebase-first sign-in exchanging its ID token through the 32C endpoint, with the legacy password route reached ONLY for the two codes that mean "no Firebase identity answers to these credentials" — `auth/invalid-credential` and `auth/user-not-found` — never for a Firebase or backend failure, so an outage cannot become a downgrade; plus the server-side `firebaseUid` guard refusing the legacy route with 403 `FIREBASE_SIGN_IN_REQUIRED`; Google Sign-In NOT implemented; account linking and migration NOT implemented)
Phase 32H — Server-Side Account Linking Boundary & Authentication Ownership (ONE authenticated route `POST /api/auth/firebase/link` — `requireAuth` + controller, no permission — attaching a verified Firebase identity to the CALLER'S OWN account; the account is `req.user.id` and the identity is the verified token's uid, so no client-supplied `userId`/`businessId`/`firebaseUid`/`role`/`status` can steer it; `validateFirebaseLink` returns only `{problems, idToken}`; a link writes only `firebaseUid` + `emailVerified`, so it can never move a tenant or change a role; CASE A idempotent, CASE B and CASE D refused with ONE 409 `FIREBASE_IDENTITY_CONFLICT` that never names an account, tenant, role or uid, never merged or re-pointed; a rejected Firebase token answers 400 not 401 so a bad provider credential cannot sign the user out; NO schema change, NO new dependency, NO session-model change, and the Phase 32E guard untouched; Google Sign-In, Facebook Login, Apple Sign-In, provider SDKs, OAuth redirects, unlinking and invitations all NOT implemented — provider linking is performed by the Firebase CLIENT SDK and no server-side equivalent was faked)
Phase 32J — Mobile Firebase Registration Onboarding (an identity Firebase has already created but the exchange refuses with `403 REGISTRATION_REQUIRED` is routed into a registration/onboarding screen that completes the Inventory AI account; Google and email/password converge on the same route; roadmap §27L)
Phase 32K — Firebase Password Authority Boundary & Timing-Equalizer Credential Fix (the Phase 32H-escalated O-2 defect is made true in code for every `firebaseUid` account, with a timing-equalizer credential fix; roadmap §27M)
Phase 32L — Firebase Identity Unlink (32L-A server `POST /api/auth/firebase/unlink` under **Policy B** — an account may leave Firebase authority only by setting a new local password in the same transition — and 32L-B the mobile flow; no new permission; server-side last-authentication-method invariant made structural; roadmap §27Q) — **SUPERSEDED 2026-10-02 (Phase F-1, HEAD `6e2252f`): the unlink route and `server/src/services/firebaseUnlink.service.ts` were REMOVED and Firebase disconnect was re-scoped into a password change; no unlink capability exists in the committed tree.** **Removal identifier, disambiguated — the repository also carries unrelated `F-1`/`F1` labels (the Phase F1 SDK retirement, roadmap §27N, and the Phase 30A PDF-sharing finding): `Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`.** See `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §8.
Phase F1 — Retire the Firebase JS SDK and the Browser OAuth Path (`mobile/lib/firebase.ts`, the `firebase` dependency and the `expo-auth-session` browser path removed; imports redirected to the SDK-free `lib/config.ts` first; pure JavaScript, no new build; roadmap §27N)
Phase F2 — Retire the Browser Dependencies, the Plugin, the Second Scheme and the Native-Intent Hook (`expo-auth-session`, `expo-web-browser` + its plugin and `expo-crypto` removed; `expo.scheme` is exactly `["inventoryai"]`; `app/+native-intent.ts` deleted; roadmap §27O)
Phase F2.9 — EAS Development Build & Android Runtime/Native Verification of F2 (a `development` Android build installed and run; the retained `inventoryai://reset-password` deep link renders and the retired callback is unresolvable at the OS level; authentication E2E remains environmentally unverified; roadmap §27P)
Registration required-field validation fix (mobile; **not** the Phase 30A "F-1" PDF-sharing finding and **not** a "Phase F1/F2" cleanup phase) — `mobile/app/register.tsx` `submit()` now checks that business name, name, email, password and confirmation are each non-empty before it calls `signUp()`, so an empty register form is rejected client-side instead of reaching the Firebase sign-up path; the pre-existing non-empty confirm-mismatch rule is preserved (an empty confirmation reports "required", a differing non-empty one still reports "Passwords do not match"); guarded by the new focused suite `mobile/__tests__/register-validation.test.tsx` (6 cases); no backend, dependency, permission, route or session change; roadmap §27R)

Phase N-3 — Firebase-Native Password Recovery, Additive (mobile only; two React Native Firebase Auth verbs — `sendPasswordResetEmail` with `ActionCodeSettings` pointing at `inventoryai://reset-password`, and `confirmPasswordReset`; the Phase 1 `FORBIDDEN` verb map relaxed for **exactly one verb**, with the reason written in place; `forgot-password` is Firebase-first with the custom 26B endpoint reachable ONLY when the build has no Firebase configuration, so a Firebase outage can never become a downgrade; `reset-password` redeems a Firebase `?oobCode=` while `?token=` still goes to `POST /api/auth/reset-password`; enumeration resistance moved into the client — `auth/user-not-found`/`auth/user-disabled` answer SENT — and a failed redemption can never fall back to the server endpoint; the `auth/*-continue-uri` family answers as a configuration fault rather than "try again"; the 26B/27 routes, controller, service, token model, Resend mail layer and their suites are UNTOUCHED, and there is no server, permission, schema, dependency, environment, EAS or Firebase Console change; guarded by two new suites (36 cases), mobile 36 suites / 509 tests, `tsc`/`eslint` clean; **an on-device run against the live Firebase project WAS then performed** (F2.9 development APK driven by Metro): `?oobCode=` **renders the reset form** (F-8 closed client-side), the legacy `?token=` path still works, `sendPasswordResetEmail` for the dedicated test address reached the project and answered **`onComplete:success`**, and `confirmPasswordReset` with a deliberately fake code produced `FirebaseAuthActionCodeException` → the screen's *"invalid or has expired"* copy — so the project **ACCEPTED the custom-scheme `ActionCodeSettings`** and the gate is **NARROWED**; **the reset email itself was never received or inspected (no mailbox), so delivery and the email's link remain UNVERIFIED, test items 3/6/7 remain BLOCKED, and L-17 stays OPEN** (the preview/release build this device carried cannot be driven by Metro, which is why the F2.9 development APK was installed over it by owner decision); a Firebase-native reset also does not revoke Inventory AI sessions, which is the credential-change bridge's job (N-4, designed and NOT implemented); roadmap §27U)
Phase 32O — Registration & Email-Verification Decision Record (documentation only; the read-only registration/sign-up audit is written down and its open questions are decided — the registration **order** is the mechanism: Firebase Email/Password account → **verification email sent** → the user verifies → `reload()` confirms `emailVerified === true` → **only then** Inventory AI creates the MongoDB `User` **and** `Business` together (OWNER, `User.businessId` still required) → Inventory AI JWT + server session → main app; **no `User`, no `Business`, no JWT and no session exist before verification**, so there is no half-registered tenant and a signed-in-but-unverified identity is held on a **client verify screen** that can resend via **native Firebase Auth**; **`requireAuth` is deliberately NOT modified** — a server-side check would change the frozen Phase 23/24 order and strand every already-shipped client — so the Phase 23/24 authorization order and status codes are preserved; the **Firebase UID stays the only** Firebase→MongoDB identity join key and **email is never one**; MongoDB stays authoritative for `businessId`/`role`/`status`/permissions/lifecycle; an unverified **Google** identity is **refused** per Firebase's signed `email_verified` claim, not the provider name; `User.emailVerified` is persisted with **no per-request Firebase call**; the legacy `/api/auth/register` path stays **transitional** (N-6 retires it) and **universal** enforcement becomes possible only then; the **verification-link return is SELECTED as the Inventory AI deep-link flow** with the **Firebase-hosted page recorded as the fallback**, inheriting the open L-17 gate so the delivery half must be measured live; **OD-3 resolved** and audit gaps **D-5…D-9** closed; three source-recorded findings — `nativeCurrentIdToken()` passes no argument to `getIdToken()` so RG-9 needs a **forced refresh** (boundary change, **not** a guard change), `sendEmailVerification`/`reload` are **not** in the Phase 1 `FORBIDDEN` map so **no guard relaxation is owed**, and **no verify screen or verification gate exists today**; documentation only — no code, test, schema, dependency, environment, EAS or Firebase Console change, and nothing implemented; roadmap §27V, design §14C.9, checklist §39) — **superseded in part 2026-10-02 (AUTH-04):** the **verification-link + native resend** mechanism is replaced by a **custom 6-digit Inventory AI code delivered by Resend** (design §14C.10, checklist §40, roadmap §27Y). This entry is the historical record and is **not** rewritten.
Phase 32P — N-4 D2 Resolved: the Recovery-Context Bridge Caller (documentation only; closes the previously undocumented **D2** gap between Firebase password recovery and the planned N-4 credential-change bridge — the bridge is **authenticated** and needs a live Inventory AI session, which is correct for the in-app password *change* but **unsatisfiable for the primary reset flow**, since `forgot-password`/`reset-password` are **public** screens, the reset completes inside Firebase, and the reset screen clears the local session before returning to Login, so at the instant the password changes the caller holds **no** session and a Firebase-native reset would have revoked **nothing**; **the approved resolution is to establish the context first, never to relax authentication:** after the reset the user **signs in again with the new password** (which is also what makes the **300-second `auth_time` freshness** check satisfiable) → a **fresh Firebase ID token** → the **existing public exchange** mints a **temporary recovery-context session** → the **bridge** stamps `passwordChangedAt` and calls `revokeAllSessions()`, which revokes **all** sessions **including that temporary one** (`revokeAllSessions` has **no caller exception**) → a **re-exchange** mints the **final** session, valid because its `iat >= changedAtSec`; the recovery-context session is **structurally an ordinary session** — **no new session type, no new field, no "recovery" flag** — so the frozen session surface is untouched, and stopping after the bridge is **loud and recoverable** (sign in again), never silent; **restated as still binding:** `passwordChangedAt` **and** `revokeAllSessions()` remain the N-4 invariant, a Firebase ID token is **never** the application's permanent bearer credential, the **Firebase UID → MongoDB `User`** binding stays authoritative, and **no public unauthenticated `credentials-changed` endpoint** and **no Cloud Function / Admin-SDK trigger** is introduced (§14C.3.6's rejections stand); findings — the 300 s window must **not** be widened for recovery and the `401 SESSION_INVALIDATED`-is-success rule now also covers recovery (still to be pinned by a test), and the one remaining piece is **OD-9**, the trigger, recorded rather than chosen silently; documentation only — no code, test, schema, dependency, environment, EAS or Firebase Console change, and the bridge is still **not implemented**; roadmap §27W, design §14C.3.8, checklist §39) — *(Annotated 2026-10-09: the bridge shipped the same day, in `703a9da` — `server/src/services/credentialsChanged.service.ts` and the authenticated `POST /api/auth/credentials-changed` — so the "still not implemented" clause in the record above is superseded on the implementation question only; `L-17` and `OD-10` remain OPEN. See the §27W annotation.)*
Phase 32Q — OD-9 LOCKED: the Automatic Recovery Marker (documentation only; closes the last piece of **D2** — **OD-9**, how the client knows that a post-reset sign-in must run the bridge — locking it as **M-1…M-10**: a **durable, non-secret recovery marker** in `expo-secure-store` under **`inventoryai.auth.passwordResetPending`** holding **only an account fingerprint**, never a password, an `oobCode`, a Firebase ID token, an Inventory AI JWT, a `userId`, a `businessId`, a `role` or tenant data, so it is a **flow selector, never a credential**; it is created with **`verifyPasswordResetCode(oobCode)`** (present natively on Android and iOS, resolving the account's **email**), whose email is **memory-only** — used for the automatic sign-in and the fingerprint and **never** as an authorization source, the server still deriving the account exclusively from `requireAuth → req.user.id → Mongo User → firebaseUid`; **F1 automatic recovery is approved:** verify → write marker → `confirmPasswordReset` → sign in with the new password → **temporary** public exchange → `credentials-changed` → `revokeAllSessions` → **final** public exchange → `applySession`, where the temporary session is **held only in a local variable** (never persisted, never applied, never navigated with, never in route params) and is revoked with every other active session because `revokeAllSessions()` has **no caller exception**; the marker lifecycle is fixed — created **before** the password-change operation, **cleared** after a successful bridge acknowledgement or a **success-equivalent** `401 SESSION_INVALIDATED`, **kept** on `409 FIREBASE_REAUTHENTICATION_REQUIRED` and on transport failure, **never consumed on a fingerprint mismatch**, and the legacy `?token=` recovery **never creates it** because that server flow already revokes; **two limits recorded, not glossed** — the marker is **device-local**, so a reset on one device followed by the first password sign-in on another is **not detectable** and OD-9 is **not** a universal cross-device revocation guarantee, and **Option E** (server-side `passwordUpdatedAt` derivation) is **DEFERRED as a separate owner decision — now **OD-10** — with nothing of it introduced** (no Mongo field, no extra Admin lookup); `requireAuth`, `passwordChangedAt`, `revokeAllSessions()`, the UID→Mongo `User` mapping, Mongo business/role authority and the JWT/session architecture are **unchanged** and **no new session type or field** is introduced; **L-17 stays OPEN** as the end-to-end gate and **gains one requirement** — the live device test must confirm `verifyPasswordResetCode()` returns the correct email **without consuming** the reset code; findings F-19…F-22; documentation only — no code, test, schema, dependency, environment, EAS or Firebase Console change, and the bridge remains **not implemented**; roadmap §27X, design §14C.3.9, checklist §39) — *(Annotated 2026-10-09: the bridge shipped on the same day as this record, in `703a9da`; the "bridge remains not implemented" clause is superseded on the implementation question only, while `L-17` and the deferred `OD-10` remain OPEN exactly as recorded. See the §27W annotation.)*
Phase A / F-1 — Firebase Disconnect Re-scoped into a Credential Change (the unlink capability **REMOVED**, not deprecated: the route `POST /api/auth/firebase/unlink`, its service, controller handler, payload validator, both audit actions and the mobile API wrapper are gone from the committed tree, and the operation moved into **credential-change authority** — Firebase `updatePassword` → the shipped N-4 `credentials-changed` bridge → the session the sequence ends with — so `firebaseUid` is never cleared and no reachable path clears it; the old flow's credential-authority dead end (the OLD password staying valid at Firebase while the server no longer knew the account, resolving to `REGISTRATION_REQUIRED` and then `EMAIL_IN_USE`) is what removing it closes; **`Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`**, 2026-10-01, 27 files +1,347/−3,372; the formal record is **roadmap §27AA**, written retrospectively because the commit predates §27Z)
AUTH-01 — Firebase Revocation Checking & Verification-Failure Classification (`checkRevoked: true` on the Admin SDK verification path; a failure classified into three disjoint outcomes — terminal `FirebaseTokenError`, transient `FIREBASE_UNAVAILABLE` → 503, and the configuration fault `FIREBASE_NOT_CONFIGURED`; everything outside the four unambiguous SDK codes, including the overloaded `auth/argument-error`, is transient so an outage cannot be presented as a bad credential; a structural JWT pre-check and an `aud`/`iss` assertion as defence-in-depth on the real Admin SDK path only; a guard fails if the installed `firebase-admin` version changes; no route, schema, session/JWT or mobile change and no `revokeRefreshTokens()`; `b3f1146` 2026-10-02; roadmap §27AB)
AUTH-02 — Short-Lived JWT, Enforced Issuer/Audience & the 14-Day Absolute Session Cap (`JWT_EXPIRES_IN` default `1h`; `JWT_ISSUER`/`JWT_AUDIENCE` minted and validated by `jsonwebtoken` on every request, defaults `inventory-ai`/`inventory-ai-api`, deliberately non-environment-specific; session longevity bounded separately **in code** — `SESSION_ABSOLUTE_CAP_DAYS = 14` with `expiresAt` anchored at creation — so the JWT lifetime can never lengthen a session; `requireAuth` distinguishes the recoverable `SESSION_EXPIRED` from the other 401s; pre-AUTH-02 tokens carry neither claim and are rejected, so every existing user signs in once more; `6a0f41b` 2026-10-02; roadmap §27AC)
AUTH-03 — Inventory Session Renewal (server boundary and mobile client; `POST /api/auth/renew`, authenticated, account from `req.user.id` and session from `req.auth.jti`, body carries only `{ idToken }`; a new token for the SAME session — `jti` unchanged, no session row created, `expiresAt` never written, no audit row per renewal, so the 14-day cap cannot be extended by renewing; uid mismatch → `409 FIREBASE_IDENTITY_CONFLICT`, unverified → `400 EMAIL_NOT_VERIFIED`, per-IP limiter → `429 SESSION_RENEW_RATE_LIMITED` with `Retry-After`; middleware order `requireAuth → limiter → controller`; mobile renews proactively on `min(tokenExpiresAt, sessionExpiresAt)` inside a 10-minute window and on foreground, single-flight with an authentication epoch, classifying failures by application error code rather than HTTP status — one retry for `SESSION_EXPIRED`, never for terminal codes, graceful degradation for transient ones; `3085e3f` + the `5da0692` re-entrancy fix, 2026-10-02; roadmap §27AD)
CI quality gate — `.github/workflows/ci.yml` (`ci / server` + `ci / mobile` on every pull request and on pushes to `main`: `npm ci`, typecheck, lint, both module-graph checks, the full backend suite and a boot smoke for `/ready`, `/live` and `SIGTERM` against a `mongo:7` container, plus mobile typecheck and jest; Node from `.nvmrc`, no GitHub secrets; its first-ever run on PR #7 caught a real defect — the suites need `JWT_SECRET`, supplied locally by the git-ignored `server/.env` and missing on a CI checkout, producing 118 failures all cascading from `AUTH_NOT_CONFIGURED` — reproduced off-CI in a clone with no `.env` and fixed by `d415335` with one fixed non-secret test value, after which both jobs passed and PR #7 merged as `3e5d2aa`; `9f4c5c1` 2026-10-07; roadmap §27AE)
CI main-guard — `.github/workflows/main-guard.yml`, the free-plan substitute for branch protection (added when classic protection AND the rulesets API both answered `403 Upgrade to GitHub Pro or make this repository public` on a **private** repository; **RESOLVED 2026-10-09 — the owner made the repository PUBLIC and branch protection is now applied, so the two `ci` checks are REQUIRED on `main`**; the required contexts are **`server` and `mobile`** — the check-run names the REST API returns, **not** the `ci / server` / `ci / mobile` form the pull-request page displays — because configuring the display form leaves a fully green pull request `BLOCKED` on a status that never reports (finding **F-24**, caught by the probe pull request that accompanied the change and fixed by correcting the contexts, which flipped that same PR `BLOCKED` → `CLEAN` with no re-run); **`enforce_admins` is `true` as of the same day** — with it `false` the required checks bind **nobody**, since the only collaborator is the owner-admin, and enforcement was verified in both directions (merge refused while the required checks were pending: *"the base branch policy prohibits the merge"*, exit 1; the same merge succeeded once they were green, so there is no deadlock on a green pull request); this guard is **retained** as a second layer for the routes protection does not cover, a setting later relaxed or an actor added without admin enforcement included; roadmap §27AE, checklist §42). On every push to `main` it requires **every commit the push introduced to be associated with a merged pull request** — the API's own PR record — and fails otherwise, so a direct push to `main` becomes a red run instead of passing silently. It is **detection, not prevention**, and it does not re-check merge-time check status (the primary `ci` run on the same push covers that); the rule was proven against real data before shipping (`5acaf44` → PR #8, `3e5d2aa` → PR #7, `0c54613` → PR #8, non-PR `e9616cf` → none). **Do not push directly to `main`** — land work through a pull request; `main-guard` will flag it if you do, 2026-10-09; roadmap §27AE; **F-25** — its first run with real work in it was a **false positive**: the commit-to-PR association is **eventually consistent**, so it called the oldest commit of the legitimate PR #15 merge unassociated while its siblings resolved to the PR in the same run, and the identical query a minute later resolved all three; an empty answer is now **retried with a bounded backoff** (~75 s over five attempts) and an API that never answers is reported as a **verification failure rather than an accusation**, with all three paths exercised locally against the live API before shipping)
Public-repository hardening — `SECURITY.md` (reporting via **GitHub private vulnerability reporting**, enabled and verified; **no invented mailbox**; the already-open items `B1`/`B2`/`E3`/`OD-10`/`L-17` are disclosed so a researcher is not thanked for re-reporting them), `LICENSE` (**proprietary, all rights reserved** — an owner decision, because the repository is public for **hosting** rather than to grant reuse rights; GitHub labels a non-standard licence as *View license*, which is expected), and `.github/dependabot.yml` (npm version updates for **both** `server/` and `mobile/`, weekly, minor+patch grouped with `applies-to: version-updates` so a **security** update stays its own visible pull request; validated against the published `dependabot-2.0` schema, not from memory). Repository settings were **checked rather than assumed, and two were found DISABLED on a repository that had just become public** — `secret_scanning` and `secret_scanning_push_protection`, which left the one-off history scan as the only credential control; both are now enabled alongside Dependabot alerts and security updates, while `secret_scanning_non_provider_patterns` and `secret_scanning_validity_checks` remain **disabled and recorded as such**. `dependabot.yml` is only read from the default branch, so it activates when this lands, and its pull requests must pass the required `server`/`mobile` checks like any other change; **switching the alerts on immediately surfaced 9 open advisories, every one in `mobile/package-lock.json`** (1 critical, 4 high, 3 moderate, 1 low) **and Dependabot opened three security-update pull requests by itself (`#12`–`#14`)** — the feature working rather than merely enabled, with `braces`/`node-forge`/`sprintf-js` **not fixable by a version bump** and `uuid` **fixable only upstream** (its patch exists but the graph cannot reach it — Dependabot's updater failed with *"A patched version exists for uuid, but the available update path still resolves it to 7.0.3"*, chain `jest-expo` → `xcode` → `uuid ^7.0.3`), all recorded as open dependency debt; no server or mobile source file, route, model, permission or test was touched, 2026-10-09; roadmap §27AE, checklist §42)
Source protection — the repository is **PRIVATE again** (2026-10-09, ~90 minutes after the public flip, on the owner's decision that the source must not be cloneable) and the trade was **measured, not predicted**: **branch protection and rulesets answer `403 Upgrade to GitHub Pro or make this repository public`** and `security_and_analysis` is `null`, so **secret scanning and push protection are gone** on a private repo at this plan level, while **Dependabot survives** (`vulnerability-alerts` → `204`, 9 advisories readable) and the workflows run unchanged; the lost scanner is replaced by **`scripts/check-secrets.mjs`** as the **third CI job** (dependency-free; private-key blocks judged by **body length** so the dummy PEM fixtures pass; provider token shapes; credentialed Mongo URIs; a tracked `.env`) with the **six** deliberate fixtures waived **on their own lines** via `secret-guard:allow` rather than by weakening a rule or excluding the test tree, so a real credential pasted into a test file still fails the build — and it is **pattern matching, not proof**; **writing it found a bug in it**: the first version's `line.length + 1` offset arithmetic drifts on **CRLF** files and misread the private-key body check, reporting an `abc`-body fixture as a real key, found by running the guard on the real tree and fixed by locating each line by search; **enforcement is now detection only** (`main-guard` + CI report, they do not gate); **the public window is a measured, unresolved exposure** — `forks: 0` and `network_count: 0`, but the traffic API **lags ~2 days** so its last recorded day is 2026-10-07 and it does **not** cover the window, hence **it cannot be established that no copy was taken** (**a clone leaves no record the way a fork does**); **access audited**: one collaborator (owner/admin), no deploy keys, no webhooks, no Actions secrets, and `.env`/`server/.env`/`mobile/.env`/`.freebuff` all present and git-ignored; **two owner-side gaps recorded as NOT done** — account **2FA** could not be confirmed (`two_factor_authentication: null`) and the **GitHub Apps with repository access** could not be listed (`403`, needs an App JWT, so the hosting integration's scope must be reviewed in the UI); **forking cannot be disabled on a personal private repo** (`422`, org-owned only); **three `SECURITY.md` claims were corrected** once the flip made them false (private vulnerability reporting `404` when private, the secret-scanning line, the protected branch); limitations and the growth plan are in **`docs/SOURCE_PROTECTION.md`**; roadmap §27AE, checklist §42)
Owner-only access — enforced where GitHub allows it, monitored where it does not (2026-10-09; the owner's requirement: *"I must be the only human with authorized access to the InventoryAI GitHub repository"*) — the audit **changed no repository setting and touched no integration**, every change being additive, and it reports what it could not read instead of assuming it: **confirmed** one collaborator (the owner, `admin`) with **no** pending invitations, deploy keys, webhooks, Actions secrets or environments, this repository's Actions **not shared** with any other (`access_level: none`), the default `GITHUB_TOKEN` already **read-only** and unable to create or approve pull requests, **no public gists**, and **no InventoryAI code in any public repository** (account-scoped code search for two distinctive identifiers → zero); the **history scan re-run over every ref with controls** (a positive control that must be found, a negative canary that must not, because a scan that cannot fail proves nothing) found no `.env`/keystore/`.pem`/`.p12`/service-account file **ever** added, the only `PRIVATE KEY` hits being the **27-character header string** (a docs example, the guard's own pattern, dummy fixtures), **no base64-shaped body line anywhere in history**, and **empty** credential values in both `.env.example` files — so **no secret was ever committed and no rotation is owed**; **the platform limit is recorded, not assumed** (protection and rulesets `403`, `security_and_analysis: null`, `allow_forking: false` → `422 "only on org-owned private repositories"`), so the policy is **enforced where it can be and observable where it cannot**: **`access-guard.yml`** runs **daily** and **hard-fails** on a non-private repository, a fork/fork network, or a collaborator other than the owner — its **first real run (`37893715498`) measured the collaborators endpoint answering `200` to `GITHUB_TOKEN`** while invitations, deploy keys, webhooks, secrets, the Actions policy, protection and rulesets all answer **`403`**, so owner-only membership is **asserted unattended** and those seven are **printed with their status, never counted as a pass**; the deep audit is **`scripts/audit-access.mjs`** against the owner's own `gh` session (dependency-free, **names only and never a value**, non-zero exit on a violation, run live with **no violations**); the two workflow actions are **pinned to commit SHAs** verified via `git ls-remote` to be what the floating `v4` tags already resolved to (behaviour-identical) with a `github-actions` Dependabot entry maintaining the pins; two stale claims were **corrected, not left standing** (`dependabot.yml`'s "protected `main`" and the monitor's own unreadable-collaborator claim); **nothing was revoked, narrowed or disabled**, and Render reaches this repository through a **GitHub App installation — not a webhook — which is why no CLI check here can see it**, making the app list and account **2FA** the two owner-side confirmations; **a private repository is not an uncopyable one**; roadmap §27AF, checklist §42)
```

### Workflow simplification (2026-10-09) — the owner asked for a lighter process

The GitHub flow is deliberately minimal now: **branch → commit → push → pull request → review →
merge**, with one `ci` workflow (jobs `server`, `mobile`, `secret-guard`) that runs in about three
minutes and gates nothing — `main` cannot be protected on a private repository at this plan level,
and that is accepted.

**Two workflows were removed** on the owner's decision, to keep the setup small: `main-guard.yml`
(it flagged a push to `main` outside a pull request) and `access-guard.yml` (a daily monitor of
repository visibility and the access list, which had run green). Nothing replaces them
unattended; the access check is now the manual `node scripts/audit-access.mjs`. `ci.yml`,
`scripts/check-secrets.mjs` and the pinned action SHAs are kept.

**Dependency policy:** Dependabot queues **minor and patch updates only**, grouped per package,
at most two open PRs per package, weekly — major versions are taken deliberately and are tracked
in issue #32 rather than as standing red PRs. Security updates are exempt from all of that and
still arrive on their own. Expo SDK-pinned core packages in `mobile/` — `react`, `react-dom`, `react-native`, `react-native-safe-area-context`, `react-native-screens` — are additionally excluded from version updates: Dependabot cannot know the SDK's pinned versions, so these move only with an Expo SDK upgrade via `npx expo install --fix` (roadmap §27AH, ISS-16).

**Records are proportional:** a security, architecture, authorization, schema, route,
dependency-policy or phase-level change gets a dated record; a routine feature or fix is
documented by its pull request description, its tests and the code. Do not restate what the
roadmap already records. Nothing above changes what must be verified — never claim a check you
did not run.

### Detailed history lives outside this file

The prose record of every phase and increment listed above is kept in
`docs/PHASE_HISTORY.md`, so it does not load into every session. The authoritative records are
`docs/DEVELOPMENT_ROADMAP.md` (per-phase, with evidence) and
`docs/AUTH_SECURITY_MASTER_CHECKLIST.md` (security-relevant work).

### Records are proportional to the change

- A **security, architecture, authorization, schema, route, dependency-policy or phase-level**
  change gets a dated record with its evidence in the roadmap and, when it is security-relevant,
  the checklist.
- A **routine feature or fix** is documented by its pull request description, its tests, and the
  code. Do not open a second parallel narrative for it, and do not restate what the roadmap
  already records.
- Never claim verification that was not performed, and keep failures and limitations visible.

When instructed to work on a specific phase:

- Implement that phase only.
- Do not jump ahead.
- Do not implement future features without explicit approval.
- Do not silently expand scope.

If a future feature is required to properly implement the current phase, explain the dependency before making major changes.

---

# 8. Code Quality

Prefer:

- Clear naming
- Small focused modules
- Reusable services
- Separation of concerns
- Consistent error handling
- Input validation
- Appropriate logging
- Testable business logic

Avoid:

- Duplicate logic
- Giant files
- Unnecessary abstractions
- Dead code
- Hardcoded configuration
- Magic values
- Unused dependencies

---

# 9. Backend Rules

Backend responsibilities include:

- Authentication
- Authorization
- Validation
- Business logic
- Inventory calculations
- Database operations
- Audit logging
- AI tool execution

Controllers should not contain excessive business logic.

Keep business logic in appropriate services/modules.

Database access should remain organized and maintainable.

---

# 10. Mobile Rules

The mobile application communicates with the backend through the API.

Do not place business-critical authorization logic only in the mobile app.

The mobile application should:

- Handle loading states
- Handle errors
- Handle empty states
- Validate basic user input
- Provide clear feedback
- Avoid unnecessary API calls
- Use efficient list rendering

Mobile UX should remain simple and practical.

---

# 11. AI Rules

The AI assistant must use controlled tools.

Initial tools may include:

```text
searchProducts
getProduct
getInventory
getLowStockProducts
getOutOfStockProducts
getInventorySummary
getInventoryHistory
getProductsByLocation
getReorderNeededProducts
```

AI tools must receive authenticated user context.

Every tool must enforce:

```text
User
 ↓
Authentication
 ↓
Role Authorization
 ↓
Business Isolation
 ↓
Database Query
```

Never allow the AI model to generate arbitrary MongoDB queries.

Never trust an AI-supplied `businessId`.

Never allow AI-generated text to override backend authorization.

---

# 12. AI Accuracy

The AI must not invent database facts.

For inventory quantities, products, stock levels, locations, and history:

- Retrieve authoritative information from backend tools.
- Base the response on tool results.
- Clearly state when information is unavailable.
- Do not guess missing inventory information.

---

# 13. Testing

After implementing a feature, run appropriate checks and tests.

Critical areas include:

- Authentication
- Authorization
- Business isolation
- Product operations
- Inventory operations
- Stock-in
- Stock-out
- Negative stock prevention
- Transaction creation
- Dashboard calculations
- AI tool authorization

Do not claim a feature works without verifying it.

---

# 14. Verification Requirement

After implementation:

1. Run relevant tests.
2. Run lint/type/syntax checks when available.
3. Verify the affected functionality.
4. Review for security issues.
5. Check that unrelated functionality was not unnecessarily changed.
6. Fix problems introduced by the current task.

If something cannot be verified, explicitly report it.

---

# 15. Documentation

Update documentation when implementation changes an architectural or functional decision.

Primary specification:

`docs/SYSTEM_SPECIFICATION.md`

Do not silently contradict the specification.

If an intentional architecture change is required:

1. Explain the conflict.
2. Propose the change.
3. Obtain approval before making a major architectural change.

---

# 16. Git

Use meaningful commits.

Examples:

```text
feat: add product model
feat: implement stock in
feat: implement stock out
fix: prevent negative inventory
feat: add inventory history
feat: add read-only AI tools
test: add inventory authorization tests
```

Never commit:

```text
.env
API keys
MongoDB credentials
Private certificates
```

### Inventory AI — Project Identity & Git Attribution

The project identity belongs to Jeffern. Claude Code is only an implementation tool and must NOT be represented as a project author, contributor, co-author, or attribution identity.

Canonical project identity:

* Project: Inventory AI
* Owner: Jeffern
* GitHub display name: Jeffernzxc
* GitHub username: nreffejzxc
* Git identity: jeffernzxc
* Commit email: jefferndullamalinaozxc@gmail.com
* Implementation: Jeffern
* Attribution: Jeffern / Jeffernzxc only

#### Git commit rules

1. Do NOT add:
   `Co-Authored-By: Claude Code <noreply@anthropic.com>`

2. Do NOT add any Claude Code or Anthropic co-author trailer.

3. Do NOT add "Generated with Claude Code", "Generated by Claude", or similar AI attribution to commit messages.

4. Do NOT identify Claude Code or Anthropic as the author, co-author, contributor, or implementation owner of Inventory AI.

5. Normal commit messages must describe the actual Inventory AI change only.

6. Git author and committer identity must use the repository's configured Jeffern/jeffernzxc identity.

7. Do not rewrite existing Git history to apply this rule unless Jeffern explicitly requests history rewriting.

8. This rule applies to all future commits, branches, pull requests, changelogs, release notes, and project documentation unless Jeffern explicitly overrides it for a specific case.

9. Claude Code may implement, modify, test, debug, and document the project, but those actions do not make Claude Code a project author or contributor.

10. If the repository's Git identity does not match the canonical identity above, inspect and report the mismatch before changing it. Do not silently change Git identity.

---

# 17. Scope Protection

Do NOT implement the following unless explicitly requested:

- Payments
- Subscriptions
- SaaS billing
- Full offline synchronization
- AI write actions
- AI forecasting
- Demand prediction
- RAG
- Vector Search
- Advanced supplier management
- Automated purchasing
- Advanced analytics

These belong to future versions.

---

# 18. Working Style

When given a task, follow this sequence:

```text
READ
  ↓
INSPECT
  ↓
PLAN
  ↓
IMPLEMENT
  ↓
TEST
  ↓
VERIFY
  ↓
DOCUMENT
  ↓
REPORT
```

Do not rush directly into implementation.

Before making substantial changes, understand the existing project.

---

# 19. Completion Report

After completing a task, report:

### Implemented

What was changed.

### Files Changed

Important files created or modified.

### Verification

Tests/checks that were executed and their results.

### Issues

Any remaining problems or limitations.

### Next Step

The recommended next development step.

Keep reports concise and factual.

---

# 20. Final Rule

When uncertain about implementation details, prioritize:

1. `docs/SYSTEM_SPECIFICATION.md`
2. Existing project architecture
3. Security
4. Data integrity
5. Maintainability
6. Simplicity

Never sacrifice security, authorization, business isolation, or inventory consistency for convenience.