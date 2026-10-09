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
Phase 32P — N-4 D2 Resolved: the Recovery-Context Bridge Caller (documentation only; closes the previously undocumented **D2** gap between Firebase password recovery and the planned N-4 credential-change bridge — the bridge is **authenticated** and needs a live Inventory AI session, which is correct for the in-app password *change* but **unsatisfiable for the primary reset flow**, since `forgot-password`/`reset-password` are **public** screens, the reset completes inside Firebase, and the reset screen clears the local session before returning to Login, so at the instant the password changes the caller holds **no** session and a Firebase-native reset would have revoked **nothing**; **the approved resolution is to establish the context first, never to relax authentication:** after the reset the user **signs in again with the new password** (which is also what makes the **300-second `auth_time` freshness** check satisfiable) → a **fresh Firebase ID token** → the **existing public exchange** mints a **temporary recovery-context session** → the **bridge** stamps `passwordChangedAt` and calls `revokeAllSessions()`, which revokes **all** sessions **including that temporary one** (`revokeAllSessions` has **no caller exception**) → a **re-exchange** mints the **final** session, valid because its `iat >= changedAtSec`; the recovery-context session is **structurally an ordinary session** — **no new session type, no new field, no "recovery" flag** — so the frozen session surface is untouched, and stopping after the bridge is **loud and recoverable** (sign in again), never silent; **restated as still binding:** `passwordChangedAt` **and** `revokeAllSessions()` remain the N-4 invariant, a Firebase ID token is **never** the application's permanent bearer credential, the **Firebase UID → MongoDB `User`** binding stays authoritative, and **no public unauthenticated `credentials-changed` endpoint** and **no Cloud Function / Admin-SDK trigger** is introduced (§14C.3.6's rejections stand); findings — the 300 s window must **not** be widened for recovery and the `401 SESSION_INVALIDATED`-is-success rule now also covers recovery (still to be pinned by a test), and the one remaining piece is **OD-9**, the trigger, recorded rather than chosen silently; documentation only — no code, test, schema, dependency, environment, EAS or Firebase Console change, and the bridge is still **not implemented**; roadmap §27W, design §14C.3.8, checklist §39)
Phase 32Q — OD-9 LOCKED: the Automatic Recovery Marker (documentation only; closes the last piece of **D2** — **OD-9**, how the client knows that a post-reset sign-in must run the bridge — locking it as **M-1…M-10**: a **durable, non-secret recovery marker** in `expo-secure-store` under **`inventoryai.auth.passwordResetPending`** holding **only an account fingerprint**, never a password, an `oobCode`, a Firebase ID token, an Inventory AI JWT, a `userId`, a `businessId`, a `role` or tenant data, so it is a **flow selector, never a credential**; it is created with **`verifyPasswordResetCode(oobCode)`** (present natively on Android and iOS, resolving the account's **email**), whose email is **memory-only** — used for the automatic sign-in and the fingerprint and **never** as an authorization source, the server still deriving the account exclusively from `requireAuth → req.user.id → Mongo User → firebaseUid`; **F1 automatic recovery is approved:** verify → write marker → `confirmPasswordReset` → sign in with the new password → **temporary** public exchange → `credentials-changed` → `revokeAllSessions` → **final** public exchange → `applySession`, where the temporary session is **held only in a local variable** (never persisted, never applied, never navigated with, never in route params) and is revoked with every other active session because `revokeAllSessions()` has **no caller exception**; the marker lifecycle is fixed — created **before** the password-change operation, **cleared** after a successful bridge acknowledgement or a **success-equivalent** `401 SESSION_INVALIDATED`, **kept** on `409 FIREBASE_REAUTHENTICATION_REQUIRED` and on transport failure, **never consumed on a fingerprint mismatch**, and the legacy `?token=` recovery **never creates it** because that server flow already revokes; **two limits recorded, not glossed** — the marker is **device-local**, so a reset on one device followed by the first password sign-in on another is **not detectable** and OD-9 is **not** a universal cross-device revocation guarantee, and **Option E** (server-side `passwordUpdatedAt` derivation) is **DEFERRED as a separate owner decision — now **OD-10** — with nothing of it introduced** (no Mongo field, no extra Admin lookup); `requireAuth`, `passwordChangedAt`, `revokeAllSessions()`, the UID→Mongo `User` mapping, Mongo business/role authority and the JWT/session architecture are **unchanged** and **no new session type or field** is introduced; **L-17 stays OPEN** as the end-to-end gate and **gains one requirement** — the live device test must confirm `verifyPasswordResetCode()` returns the correct email **without consuming** the reset code; findings F-19…F-22; documentation only — no code, test, schema, dependency, environment, EAS or Firebase Console change, and the bridge remains **not implemented**; roadmap §27X, design §14C.3.9, checklist §39)
Phase A / F-1 — Firebase Disconnect Re-scoped into a Credential Change (the unlink capability **REMOVED**, not deprecated: the route `POST /api/auth/firebase/unlink`, its service, controller handler, payload validator, both audit actions and the mobile API wrapper are gone from the committed tree, and the operation moved into **credential-change authority** — Firebase `updatePassword` → the shipped N-4 `credentials-changed` bridge → the session the sequence ends with — so `firebaseUid` is never cleared and no reachable path clears it; the old flow's credential-authority dead end (the OLD password staying valid at Firebase while the server no longer knew the account, resolving to `REGISTRATION_REQUIRED` and then `EMAIL_IN_USE`) is what removing it closes; **`Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`**, 2026-10-01, 27 files +1,347/−3,372; the formal record is **roadmap §27AA**, written retrospectively because the commit predates §27Z)
```

Phase 08 is an owner-directed hardening extension delivered in approved lettered increments
(08A, 08B, …) beyond the original Phase 00–07 plan; `docs/DEVELOPMENT_ROADMAP.md` records each
increment's scope and verified status.

Phase 10 is an owner-directed commercialization extension delivered in approved lettered increments
(10A, 10B, …) beyond the V1 completion gate. It prepares the backend for future SaaS
subscriptions/paid plans WITHOUT implementing payments: 10A added `Business.planCode`, a centralized
plan catalog with feature limits (`server/src/constants/plans.ts`), and business-level entitlement
checks (`server/src/services/entitlement.service.js`). Actual subscriptions, the billing lifecycle,
payment providers, AI usage metering, and paid-plan enforcement remain deferred (V4) and are NOT
implemented.

Phase 11 is an owner-directed inventory-intelligence extension delivered in approved lettered
increments (11A, 11B, …) after Phase 10. It turns stock data V1 already tracks into read-only
decision support WITHOUT changing the data model or enabling AI writes: 11A added a shared
stock-status classifier (IN / LOW / OUT), a healthy in-stock count to the dashboard summary, the
reorder-needed endpoint `GET /api/products/reorder`, the read-only `getReorderNeededProducts` AI
tool, and a mobile dashboard inventory-health + "Needs restock" preview. Everything reuses the §19
availability math, stays business-isolated and RBAC-gated, and never modifies products or inventory;
forecasting, demand prediction, purchasing, and AI write actions were NOT added.

Phase 14A is an owner-directed user-management foundation delivered as a single approved increment
after Phase 13. It exposes the `users.manage` capability as a real API for the first time: business-
scoped list/create/get and role+status update over `/api/users`, OWNER/ADMIN only, reusing the
existing permission key, `User` model, bcrypt, validation, and audit conventions. Enforcement is
server-side and tenant-isolated (client `businessId` is never accepted). Cross-role rules are strict:
no OWNER can be created or assigned through the API, no user can change their own role/status, the
OWNER account is immutable, and an ADMIN can neither create, assign, nor modify another ADMIN
(ADMIN creates/assigns MANAGER or STAFF only). Disabling a user instantly revokes login and existing
JWTs. No invitations/email, password reset, billing, hard delete, or mobile UI were added.

Phase 16 is an owner-directed audit-trail viewer delivered as a single approved increment after
Phase 15. The audit write path has existed since Phase 04 (`recordAudit`); Phase 16 adds the read
side: a business-scoped, read-only `GET /api/audit` (new `audit.view` permission, OWNER + ADMIN only)
with action/entityType/user/date/q filters, newest-first pagination, and a strict whitelisted DTO.
It reuses the existing `AuditLog` model + indexes and the standard list/validate/pagination
conventions — no model change, no new dependency, no write routes. MANAGER/STAFF are denied (403) and
never see the trail; a client-supplied `businessId` is ignored.

Phase 17 is an owner-directed mobile-management extension delivered as a single approved increment
after Phase 16, with ZERO backend changes. The supplier and purchase-order backend has been complete
since Phase 13 (suppliers CRUD + archive; POs with numbering, DRAFT-only editing, issue, cancel, and
claim-first receiving) and mobile was read + receive only. Phase 17 adds the mobile management half:
a Suppliers screen (create/edit/archive/restore incl. contact fields via an additive `fields` prop
on the shared `RefManage` — Categories/Locations unchanged), and the full PO lifecycle on mobile
(create DRAFT, edit DRAFT, issue, cancel) over the existing Phase 13 API, using the exact existing
backend error codes. The permission mirror gains `suppliers.manage`/`suppliers.view` in lock-step
with the server matrix (ADMIN + MANAGER manage, every role views); the backend stays authoritative
and business-isolated (no client `businessId`). STAFF remains view-only for supplier/PO management
but can still receive stock; receiving and the claim-first flow are unchanged; no
`PARTIALLY_RECEIVED` status was introduced.

Phase 21 is an owner-directed documentation-and-guard increment delivered as a single
approved increment after the Phase 20C–20H performance cascade. It changes **no production
behavior**: the archive-only product lifecycle and the inventory↔product dependency already
held, and the phase makes them explicit and prevents them from drifting silently. It states
the invariant in `docs/SYSTEM_SPECIFICATION.md` (§13 Product Lifecycle, §14 Inventory and
Product Integrity, §15 transaction permanence, §31 API Structure) and in this file, replaces
the previously illustrative `DELETE /api/products/:id` example with the implemented
archive/restore endpoints, and adds regression guards: a DB-free declaration suite
(`test/phase21-product-archive-invariant.test.mjs`) pinning that no deleted product status,
delete route, delete service method or product-deletion audit action exists and that
`productId` is required on both inventory and the ledger, plus DB-backed cases proving an
archived product keeps its inventory row, quantity and transaction history while all four
movement paths (stock-in, stock-out, adjust, transfer) reject it with `PRODUCT_ARCHIVED`.
No delete/purge/cascade/`deletedAt`/`PRODUCT_DELETED`/soft-delete was introduced, no model,
route, index, migration or AI tool changed, and `inventory.service.ts` — including the
`{'product.0': {$exists: true}}` list guard — is byte-identical.

Phase 22 is an owner-directed authorization-contract increment delivered as a single approved
increment after Phase 21. It hardens the **route→capability binding** without changing who may do
what. The read routes for products, suppliers and purchase orders had been protected by
authentication alone (`requireAuth`); they now name the capability they require —
`requirePermission(PERMISSIONS.PRODUCTS_VIEW)`, `SUPPLIERS_VIEW` and `PURCHASE_ORDERS_VIEW`
respectively — so a route's authorization requirement is stated rather than implied by "any
authenticated member". This is **behaviour-neutral by construction**: all four roles hold all three
view permissions, so the only requests whose outcome changes are those from a role that holds no
capability at all. **No role grant was added, removed or changed** for OWNER, ADMIN, MANAGER or
STAFF. Categories and locations read routes were deliberately left on `requireAuth` because no
`categories.view`/`locations.view` key exists, and inventing one was out of scope.

The phase also makes the permission **catalogue** self-checking. `server/src/constants/roles.ts`
gains `CATALOGUE_ONLY_PERMISSIONS`, which names the capabilities that are granted to roles but
implemented by no endpoint: `business.manage`, `roles.manage` and `transactions.view`. This is
**metadata for the regression guard only** — it is not imported by `middlewares/authorize.ts` and
takes no part in any runtime authorization decision. The ledger read stays on
`GET /api/inventory/history` under `inventory.history.view`; it was deliberately **not** moved to
`transactions.view`, because only OWNER/ADMIN/MANAGER hold that key while every role holds
`inventory.history.view`, so the switch would have silently revoked STAFF history access.

`server/test/phase22-authorization-contract.test.mjs` (DB-free) is the guard: it proves each
read route's binding structurally (router stack), behaviourally (it invokes the gate and requires a
403 for an ungranted role while admitting STAFF) and by declaration (the route names the expected
catalogue key); it requires every catalogue entry to be either enforced or listed as
catalogue-only, with the two sets disjoint; it rejects any permission a route references that is
not in the catalogue; and it pins that `CATALOGUE_ONLY_PERMISSIONS` never reaches the runtime
authorization path. No model, service, controller, index, migration or mobile file changed, and no
mutation route's gate was altered.

Phase 23 is an owner-directed authorization-contract completion delivered as a single approved
increment after Phase 22. It closes the three authorization surfaces Phase 22 left held by
convention, and changes **no production behavior**: no permission key was added, no role grant was
changed, and no route, controller, service, model, middleware or mobile file was modified. All work
is one DB-free guard suite plus documentation.

The core addition is **route authorization classification**. Phase 22 proved that eight named read
routes carry their view permission; it did not pin the complement — which routes are deliberately
*not* gated — so a route added without a gate would have passed every test in the suite. The guard
now discovers every route reachable from `app.ts` (reading the mount table out of `app.ts` source,
so a newly mounted router is covered automatically and cannot be mounted and forgotten), plus the
routes registered directly on the app, and requires each to land in exactly one declared bucket:
`PERMISSION_GATED` (the default — a gate as the second handler, with the declaration naming the
catalogue key), `AUTHENTICATED` (requireAuth + controller only), `PUBLIC` (no authentication), or
`ROLE_GATED`. `AUTHENTICATED` and `PUBLIC` are explicit lists carrying a written reason — the three
self-service account routes, the four categories/locations reads whose Phase 22 deferral is thereby
made visible, and the health/login/register routes. A route in no bucket **fails**, and a declared
exemption that has stopped being true also fails. There is deliberately **no route-count assertion**,
so a future phase adds a route by declaring it, never by editing a number.

**Cross-layer RBAC mirror.** `mobile/lib/permissions.js` re-declares the whole catalogue and all four
role grants, because the UI needs to know what to show. Nothing tied the two copies together, so they
were kept in step by hand (Phases 13A, 17 and 19 each did so) — and drift is silent in both
directions: a grant removed server-side makes the app offer an action the server 403s, and one added
makes a role never see an action it may perform. The guard dynamically imports the mirror and
compares roles, the 21 catalogue keys *and values*, and every role's grant set against
`server/src/constants/roles.ts`, which stays authoritative. The comparison is factored into a pure
function so it can be negative-tested in memory: perturbed clones prove a removed grant, an added
grant, a renamed key, a changed value and a missing role are each detected, and a further case proves
the guard's own `assert.deepEqual(drift, [])` shape throws on a diverged mirror. No mobile file was
modified and no mobile test runner was added.

**`requireRole` inertness.** `middlewares/authorize.ts` exports `requireRole(...roles)`, a role-name
allowlist that bypasses the permission catalogue. It has **no production call site** and is exercised
only by the Phase 03 suites, but it was also a blind spot: a route written `requireAuth,
requireRole('OWNER'), controller` carries no permission, so a scan looking only for `requirePermission`
would not see it. The classifier therefore recognises `requireRole(` explicitly and routes it to the
`ROLE_GATED` bucket — which is **empty by design**, and adding a route to it requires an owner
decision. The guard also pins that `requireRole` is still exported and that no module under
`src/routes/` references it. `requireRole` was deliberately **not deleted or modified**: its
inertness is pinned, not its removal.

**Client error-code contract.** The mobile client branches on server error codes
(`ACCOUNT_DISABLED`, `AI_RATE_LIMITED`, `RECEIVE_CONFLICT`, …), and renaming one server-side would
silently downgrade a specific, friendly client message to a generic failure. Every `code` literal the
client compares against must be a code the server can actually emit. The guard harvests emitting
positions of all three real shapes — the third argument of `new ApiError`, a `this.code =`
assignment, and a `code:` response-body property (the rate limiters answer directly rather than
through `ApiError`) — resolving identifier arguments through the module-level string constants;
pass-through assignments that resolve to nothing are skipped rather than treated as emissions.

`server/test/phase23-authorization-contract.test.mjs` (DB-free, registered in `PURE_UNIT`) is the
guard. Reporting the discovery honestly: it classifies **60 routes — 47 permission-gated, 7
authenticated (self-service plus the four categories/locations reads), 6 public, 0 role-gated**; that
distribution is observed, not asserted, and only the bucket *membership* is pinned.

Phase 24 is an owner-directed authorization-verification increment delivered as a single approved
increment after Phase 23. It adds the missing **runtime** half of the authorization contract and
changes **no production behavior**: no permission was added, renamed or removed, no role grant
changed, and no route, controller, service, model, middleware or mobile file was modified. The
change surface is one new DB-backed suite plus documentation.

The premise that runtime authorization was largely unproven turned out to be **only partly true**, and
the investigation said so: tenant isolation is covered by roughly fifteen behavioral tests across ten
files, horizontal ownership is complete (AI conversations are the only user-owned resource, and
same-business cross-user access is already pinned), and AI authorization is complete for its declared
matrix because the only denial cell that exists — `dashboard.view × STAFF` — is already covered both
directly and inside a live chat. Two real gaps remained, and Phase 24 closes exactly those.

**A consolidated matrix over real routes.** Vertical coverage existed per feature but only ever
against the boundary that feature cares about, and the suite's one four-role matrix ran against the
**test-only `/guard` router inside `phase03-auth.test.mjs`** — synthetic routes exercising the
middleware, not shipped endpoints. `server/test/phase24-runtime-authorization-matrix.test.mjs`
(DB-backed, registered in `PURE_DB`) walks a representative real route per capability and asserts the
outcome for all four roles. Its expectations are **derived, never transcribed**: the tier a route
belongs to is computed by asking the shipped `hasPermission(role, permission)` who holds its
capability, so the file contains no second copy of the role matrix and cannot silently disagree with
`constants/roles.ts` — a grant change flows straight through to the cells. Admitted cells deliberately
depend on nothing else: a gate is the second handler, so it decides before validation or lookup runs,
and an admitted cell asserts only "not 401, not 403, and not the code-less global 404", which means no
request body, no seeded resource, no provider availability and no success payload. The typo guard works
because the global handler (`middlewares/notFound.ts`) answers `{error, message}` with **no `code`**
while every `ApiError` 404 carries one. Denied cells assert 403 `FORBIDDEN`; unauthenticated requests
are sampled per tier rather than repeated per route, since Phase 23 already proves structurally that
`requireAuth` is `handlers[0]` on all 47 gated routes.

**Role mutation now has an authorization-effect proof.** Phase 14A asserted only the response payload
of a role change, although `authenticate.ts` reloads the user — and therefore the role — from the
database on every request. Four tests close that, always using the **same pre-existing token**: STAFF →
MANAGER grants a MANAGER-gated capability; MANAGER → STAFF revokes it (de-escalation being the sharper
security property); STAFF → ADMIN → STAFF crosses tiers and grants then revokes `users.manage`; and a
promotion reaches the AI tool permission gate, flipping a `getInventorySummary` soft `TOOL_FORBIDDEN`
into a real run. This is safe by construction rather than merely asserted: an access token carries only
`sub`/`iat`/`exp`, so there is no role claim that can go stale, and a hand-forged `role` claim neither
grants nor escalates anything.

**Accurate tenant-isolation documentation.** `assertBusinessAccess` (`src/utils/businessAccess.ts`,
emitting `FORBIDDEN_BUSINESS`) has no `src/` importer — its only callers are tests, one of them inside
the `/guard` router. It is therefore **production-dead and was left byte-identical**, neither wired,
modified nor deleted. Real tenant isolation is enforced by `businessId` query scoping and surfaces as a
plain 404 `NOT_FOUND`, not a 403; the mobile client does not compare against `FORBIDDEN_BUSINESS`, so no
client contract depends on the dead path.

**The empty OWNER-only runtime tier is asserted, not left implicit.** `business.manage` and
`roles.manage` are catalogue-only (Phase 22), so no real route distinguishes OWNER from ADMIN, and a
"complete" matrix has structurally empty top-tier cells. The suite asserts this directly instead of
leaving a hole that reads like coverage, and deliberately does **not** add a route to make it testable.

Every assertion was proven able to fail before being trusted: inverted assertions on the *stale* role
outcome (still 403 after promotion, still 200 after demotion) were confirmed to throw, a wrong expected
matrix cell was confirmed to throw, and the typo guard was confirmed to distinguish the global 404 from
an `ApiError` 404. Suite 459 → 469, `test:db` 320 → 330, `test:unit` unchanged at 170; `npm run lint`
0/0.

Phase 25 is an owner-directed design-token increment delivered as a single approved increment after
Phase 24, and it is the smallest phase in the project's history: **two token values and
documentation**. It closes the last two entries in `docs/DESIGN_SYSTEM.md`'s open known-issues list —
the light-theme contrast failures that 18E and 18F reported and deliberately did not fix, because
each was a cross-phase token change needing an owner decision.

The replacement values were **computed, not chosen by eye**. WCAG 2.x relative luminance and
`(L_light + 0.05) / (L_dark + 0.05)` were evaluated over the palette's own slate hue family, and
`palettes.light.placeholder` moves `#8A94A6` → `#646E83` (3.06:1 → 5.12:1 on `surface`; 2.70:1 →
4.53:1 on `surfaceMuted`; 2.83:1 → 4.73:1 on `background`) while `palettes.light.textMuted` moves
`#667085` → `#5F697E` (4.97:1 → 5.51:1; 4.40:1 → 4.87:1; 4.60:1 → 5.10:1). The dark theme was
already compliant (5.40:1 / 4.76:1) and is **unchanged**.

Two findings are worth keeping, because both were counter-intuitive and both are documented rather
than smoothed over. First, **`surfaceMuted` is the binding surface**: it is the lightest ground a
placeholder sits on, so it sets the floor for both tokens, and `#646E83` is the *lightest* value in
the hue family that clears 4.5:1 there. Second, and consequently, **`textMuted` had to move too** —
on a light surface, clearing AA on `surfaceMuted` requires a darker value than `#667085`, so any
conforming placeholder would have been darker than the token it must sit beneath, inverting the
muted hierarchy. Darkening `textMuted` restores the ordering and spaces the three muted tokens
evenly, at the cost of a **~7% contrast separation** between `placeholder` and `textMuted` — the
ceiling the `surfaceMuted` floor allows. That is tighter than the 0.615x gap it replaces, which
existed only because the placeholder was failing; the owner approved it explicitly as Option A.

**Placeholders are not exempt from 1.4.3.** Its exceptions are incidental text, logotypes and
*inactive* user-interface components only; the three binding sites (`SearchField`, `SelectField`'s
in-sheet search, `AiChat`'s composer) are live fields, so 4.5:1 genuinely applies. What *is* exempt
is `Input`'s disabled state, and `textMuted`'s icon/glyph uses on `surfaceMuted` fall under 1.4.11's
3:1 non-text threshold, which 4.40:1 already cleared — that asymmetry is why `textMuted`'s own
compliance was never the issue, and why the phase's real driver was the placeholder.

The change reaches the whole app visually — five components emit `colors.placeholder` and
`textMuted` has 44 sites across 26 files — while the diff is two lines in `mobile/lib/theme.js`.
`server/**` is **untouched** (no route, controller, service, model, middleware or test), the Phase
22/23/24 authorization artifacts are untouched, `mobile/app/(app)/ai/index.js`'s frozen
hooks-after-early-return is not restructured, and no mobile test runner was added. Contrast was
re-verified programmatically from the edited file, and the palette carries no hardcoded duplicate
of either hex outside it.

Phase 26A is an owner-directed session-hardening increment delivered as a single approved increment
after Phase 25, and it is the first phase to change what a session *is*. Until it, a JWT was the whole
session: verifiable but not withdrawable, so "Sign out" cleared only the client's copy, a stolen token
stayed valid until it expired, and the only server-side revocation was the blunt Phase 15 password
change. An access token now carries `sub`, a `jti` and the standard `iat`/`exp` — **and still nothing
else** — where the `jti` names a row in a new `sessions` collection; `requireAuth` refuses a token
whose session row is missing, revoked or expired, and refuses a token with **no `jti` at all**.
`requireAuth` remains the single authentication choke point, and every pre-existing guarantee is
intact and still enforced in the same order: ObjectId validation, the ACTIVE user requirement, the
`passwordChangedAt` comparison (`401 SESSION_INVALIDATED`, deliberately distinct from
`SESSION_REVOKED` so the two causes stay tellable apart), the active-business check and the HS256
restriction.

The session record stores only `userId`, `jti`, a cosmetic device label, `lastUsedAt`, `revokedAt` and
`expiresAt` — **no role and no `businessId`**, because authorization stays database-derived per
request (Phase 03/24). Three self-service **authenticated** routes were added —
`POST /api/auth/logout`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` — and
**no permission, role grant or Phase 22/24 authorization behaviour changed**; the caller's own
sessions need no capability. Sign-out-everywhere is deliberately the logout route with
`{ "all": true }`, not a fourth route. The session listing is a strict allowlist that **never returns
a token or a `jti`** (the `current` flag identifies the caller's own row instead), and
`DELETE /api/auth/sessions/:id` puts `req.user.id` inside the query filter rather than checking
ownership afterwards, so another user's session is unreachable and answers the same `404` as an
unknown id. Four audit events are written through the existing best-effort `recordAudit` path from
`session.service.ts`; no `jti` is ever written to the trail, since that viewer is readable by every
ADMIN and a `jti` is the one value that could be replayed with a stolen token.

Two consequences were reviewed and accepted by the owner before implementation: **every pre-26A token
is rejected** (it carries no `jti`, so it can never name a session), meaning each user signs in once
more; and **there is no refresh-token rotation** — a session ends when revoked or when its token
expires. Mobile gains an Active Sessions screen reached from Profile, sign-out that tells the server
before clearing local state (and still clears when offline), a device label derived without a new
dependency, and one central place in `lib/client.js`/`lib/auth.jsx` where a refused token is handled —
which also closes a real gap, since `MovementForm` used to surface a dead session as a form error it
could not resolve. `phase16-audit-viewer.test.mjs` is the one file outside the owner's approved list
that had to change: it pins that fixture business's exact audit row counts, and the required
session-created event shifts them.

Phase 26B is an owner-directed account-recovery increment delivered in three approved sub-phases
(26B-1, 26B-2, 26B-3) after Phase 26A, and it is the first phase to give a user a way back into an
account without an operator. It ships as **two** commits: 26B-1 alone (`5a46781` — "feat: add password
recovery email delivery (Phase 26B-1)", 10 files, +1388), then **26B-2 and 26B-3 together in one
commit** (`9900e9a` — "feat: add password recovery and its HTTP surface (Phase 26B-2, 26B-3)", 14
files, +3527/−5), because the service 26B-2 builds and the two routes that expose it land as one
observable unit. No dependency was added (the transport is a global-`fetch` call), no permission or
role grant changed, and no mobile file was touched.

**26B-1 — the mail service.** `server/src/services/mail/` is a provider-agnostic boundary the rest of
the application reaches through three functions — `isMailConfigured()`, `mailProviderName()` and
`sendPasswordResetEmail({ to, resetUrl, expiresInMinutes })` — and it is the only mail module anything
imports. `mailConfig.ts` reads `MAIL_PROVIDER`, `MAIL_FROM`, `PASSWORD_RESET_URL`, `MAIL_APP_NAME` and
`MAIL_REQUEST_TIMEOUT_MS` lazily at call time, so tests can switch providers between files and a
misconfiguration can never stop the server booting — password recovery simply answers a clean 503
until an operator fixes it. The Resend API key is deliberately **not** a field of that object:
`mailConfig()` is the value most likely to be spread into a log line, so `resendProvider.ts` reads the
key itself. `providers/index.ts` holds the registry (`resend` is the only builtin, requiring
`RESEND_API_KEY` + `MAIL_FROM`) and `selectProvider()` throws `MailNotConfigured` for an empty,
unknown or under-configured provider. Provider failures become `MailDeliveryError` carrying safe facts
only — an HTTP status and, when the provider names one, an error name matching `^[a-z0-9_]{1,64}$` —
and Resend's free-text `message` is read and **discarded** rather than relayed: it can echo submitted
field values, and one of those fields is the reset URL, which is a live credential. `MAIL_NOT_CONFIGURED`
and `MAIL_UNAVAILABLE` are the only two codes, so a delivery failure can never be mistaken for an
authentication one, and the layer logs nothing at all. The template is a pure function with no
password parameter, and every request is bounded by an `AbortController` timeout
(`MAIL_REQUEST_TIMEOUT_MS`, default 10000).

**26B-2 — the token store and recovery service.** A new `password_reset_tokens` collection stores
`userId`, `tokenHash`, `expiresAt` and `usedAt` and nothing else — no business id, no email, no role,
no IP, no user agent. The raw token is returned to the caller and **never persisted**: a 32-byte
`randomBytes` value is emailed, and only its SHA-256 digest is stored, so the database cannot be read
back into a working reset link. Tokens expire after 30 minutes, and `expiresAt` is enforced in the
claim query rather than left to the TTL sweep, which is eventual. Single use is one conditional
`findOneAndUpdate` on `{ tokenHash, usedAt: null, expiresAt: { $gt: now } }`, so two concurrent
submissions of the same link cannot both succeed, and **no branch ever unsets `usedAt`** — the token
is spent the moment it is claimed, fail-closed, even if everything after it fails. Only one token is
live per user: a new request deletes earlier unused ones with `{ userId, usedAt: null, _id: { $lt:
token._id } }`. `$lt` rather than `$ne` is what makes two concurrent requests converge instead of
cancelling each other out; this is convergence, not a transaction, and cross-process it can settle at
zero live tokens but never two. The service rejects an unknown, expired, already-used or
no-longer-valid token with a single `INVALID_RESET_TOKEN` code and one message, so the six rejection
reasons are indistinguishable to a caller; an account that is DISABLED, or whose business is not
ACTIVE, is treated exactly like an unknown one and no mail is sent. The new password is held to the
same policy as `change-password` (via the shared validator), hashed with bcrypt, and `passwordChangedAt`
is stamped — which is what revokes every token the user holds, the same Phase 15 mechanism 26A relies
on — with `revokeAllSessions` called as well, because `passwordChangedAt` has integer-second
granularity and `change-password` deliberately does not revoke sessions (26A pins that
non-revocation). Two audit events, `PASSWORD_RESET_REQUESTED` and `PASSWORD_RESET_COMPLETED`, are
written through the existing best-effort path and carry **no metadata**, so a token can never reach
the audit trail.

**26B-3 — the HTTP surface.** Two **public** (unauthenticated), POST-only routes under `/api/auth`,
both rate-limited: `forgot-password` and `reset-password`. `passwordReset.controller.ts` is the only
place a recovery domain failure becomes an HTTP status — 26B-2's errors carry a stable `code` and no
status, mirroring `mapAiFailure` in the AI layer. **The request path is an enumeration-resistant
invariant**: `requestPasswordReset` returns `undefined` on every non-error path, so the controller has
no field it could reflect, and one module-level constant is returned as a 202 from every non-error
exit. A **mail delivery failure is answered with that same 202**, logged server-side and swallowed:
the service can only reach the send after it has found a live, ACTIVE account, so a 503 there would be
reachable only for addresses that exist and would be an account-existence oracle. `MAIL_NOT_CONFIGURED`
**does** remain a 503, because that check happens *before* any account lookup and therefore
distinguishes nothing — this is an ordering argument, not a status choice, and a new post-lookup error
class is the one thing that could silently reopen the oracle. Its client-facing copy is fixed in the
controller rather than relayed, so no environment-variable name, provider name or transport detail
reaches an unauthenticated caller. `confirmPassword` is checked by the validator before the service is
called and is not returned by it, so a mistyped confirmation can never spend a valid token. The three
recovery limiters deliberately **omit** `skipSuccessfulRequests` (the success path and the silent
no-op are both 202, so skipping 2xx would disable the limiter entirely); that option is present only
on the two Phase 07B login limiters, and both facts are guarded. A spent token, an expired token and a
reused token all answer 400 `INVALID_RESET_TOKEN`; a too-weak password answers 400 `VALIDATION_ERROR`
with `fields`; a limiter answers 429 `PASSWORD_RESET_RATE_LIMITED`.

The pre-commit audit identified two risks, and they do not share a status. **B1 — the request path as
a practical timing oracle — is PARTIALLY MITIGATED by Phase 28 B1 (`7185e5e`) and is NOT closed:** the
outbound transport is off the request path, so an unknown address (one indexed query) and a known one
no longer differ by a mail round-trip, but the known path still does more **database** work (writes, an
audit insert), and that residual term is not claimed to be eliminated. **Phase 29 recorded the owner's
disposition: that residue is ACCEPTED FOR V1 and DEFERRED** — it is not pursued further in V1, and it is
never to be described as fixed. **B2 — distributed reset-mail flooding of a single victim — remains OPEN
and is DEFERRED TO V4**, together with **E3** (the in-memory, per-process limiter stores, which share
its root cause and its remedy) as related shared-infrastructure work; no shared store was introduced and
the limiters are unchanged. Both are recorded in `docs/DEVELOPMENT_ROADMAP.md` §27B, with Phase 28 B1's
own record in §27D and the owner's decisions in §27E. No new route was added anywhere else, and the
Phase 23 classifier's `PUBLIC` bucket declares both routes with their reasons.

Phase 27 is an owner-directed mobile password-recovery increment delivered as a single approved
increment after Phase 26B, and it is the half Phase 26B deliberately left out: mobile password
recovery is now implemented, consuming the **existing** backend endpoints unchanged. Two screens are
added — `/forgot-password` and `/reset-password` — together with a "Forgot password?" entry point on
login, two tokenless wrappers in `lib/api.js` (`forgotPassword`, `resetPassword`), and one additive
`success` tone on `Banner`. **No backend file changed**: `PASSWORD_RESET_URL` already accepted a
custom scheme, so `mailConfig.ts` needed no edit, and **no dependency was added**.

Both routes are **public** and deliberately sit outside the `(app)` group, whose layout redirects
anyone who is not signed in and would discard the incoming token before the screen could read it.
The token comes from `useLocalSearchParams()` and from nowhere else: a missing param is `undefined`
and a link carrying the key twice yields an array, and neither reaches the network. Its shape is
deliberately not validated client-side beyond a trim — the value is opaque base64url, so any
client-side rule could only ever reject a valid link. The token is never rendered, never logged by
application code, never persisted, and never copied into another navigation; it leaves the app in
exactly one place, the body of the reset POST. Neither wrapper sends an `Authorization` header, so a
refused public call cannot trip the client's central session-loss handler. `confirmPassword` keeps
the server's own field name so a server field error lands on it, and a field error naming `token` —
which has no input of its own — is promoted to form level rather than dropped silently. The
forgot-password success state is a fixed client constant that does **not** read the response, so the
client cannot undo the server's enumeration resistance. A new deep-link token arriving while the
screen is mounted resets the form, the errors and the success state.

**After a successful reset the client calls `clearSession()` before `router.replace('/login')`.**
That ordering is load-bearing, not cosmetic: `login.js` redirects a `signedIn` status into `(app)`,
so navigating to Login while the client still believed it was signed in would have landed the user
inside the app. `clearSession` is the right call rather than `signOut` because the reset already
ended every server-side session, so a logout would be a guaranteed-401 request for nothing.

Custom-scheme deep linking uses **`inventoryai://reset-password`**. Universal Links and Android App
Links remain **intentionally deferred**, so a reset link opened on a device without the app
installed has no web fallback yet.

Two verification limits are stated rather than glossed over. Runtime QA was performed in **Expo Go**
via `exp://<host>:8081/--/reset-password?token=…`, which resolves through the same `fromDeepLink()`
path a custom scheme does — Expo Go cannot be launched by a custom scheme, so the literal
`inventoryai://` target is **configuration-verified only** (by inspection of `app.json`'s `scheme`)
and a real custom-scheme run would need a development build, which this repository does not produce.
And **iOS runtime was not verified**: iOS verification was export/bundle-only.

One development-environment caveat is recorded so it is not mistaken for a defect: Expo Go's dev
runtime writes the launching URL — including a reset token — to logcat as `initialUri`. A control
launch on a token-free route shows it logs `initialUri` on **every** launch, which identifies it as
the Expo Go shell rather than application logging — the app contains no `console.*` calls at all. It
is a development-environment limitation, not an application logging defect.

Phase 28 is an owner-directed password-recovery hardening increment delivered as a single approved
increment (B1 only) after Phase 27, and it removes the outbound mail transport from the synchronous
request path. Until it, `POST /api/auth/forgot-password` awaited a real HTTPS `POST` to the mail
provider before answering, so an unknown address (one indexed lookup) and a known one (writes, an audit
insert and that transport wait) were trivially separable by latency even though the responses were
identical. The service now ends with an **unawaited** send whose rejection is handled in the same
synchronous turn — `sendPasswordResetEmail({…}).catch(logDetachedMailFailure)` — dispatched strictly
after the token insert, the one-live-token `deleteMany` and the `PASSWORD_RESET_REQUESTED` audit row.
That order is forced by the code's shape rather than merely asserted: the send is addressed to
`user.email`, which is only reachable after the account lookup. The rejection cannot escape, because
`.catch` is attached synchronously and `sendPasswordResetEmail` is `async`, so even a synchronous throw
inside it — notably `selectProvider()`'s `MailNotConfigured` — arrives as a rejection; and
`logDetachedMailFailure` itself performs only `instanceof` tests and one structured log call, so it
cannot throw and manufacture the very unhandled rejection the boundary exists to prevent.

The operator keeps the same distinction as before, under the same two strings, plus one new one:
`mail_not_configured`, `mail_delivery_failure`, and `mail_dispatch_error` for a template or programming
fault — named separately so a code defect is not misreported as a provider outage. The message carries
safe facts only (an HTTP status and a provider error name), so the reset URL, a live credential, can
never appear. Nothing else moved: `isMailConfigured()` and `resetUrl` still guard **before** the account
lookup, so `MAIL_NOT_CONFIGURED` is still a pre-lookup 503 that distinguishes nothing; the uniform 202
and the `undefined` return are unchanged; token generation, hashing, TTL, the atomic single-use claim,
fail-closed `usedAt` and one-live-token semantics are untouched; and rate limiting, the reset-password
flow, mobile and the route inventory are unchanged (65 routes — no route was added).

**The controller's `MailDeliveryError` branch is retained and is now unreachable**, which is deliberate:
if a future change reintroduces an awaited delivery path the failure would arrive there again, and
without the branch it would fall through to `mapPasswordResetFailure` and answer a post-lookup `MAIL_*`
503 for an address that exists — exactly the oracle decision D1 avoids. It is documented in place as a
regression guard and **must not be deleted as dead code**; the `MailDeliveryError → 503` row in
`mapPasswordResetFailure` is retained as forward defence for the same reason. The detach is proven in
three layers: behaviorally (a gated transport holds the send open while the 202 is asserted to have
already arrived, plus exactly-once completion, post-response failure logging and no unhandled
rejection) and structurally (a source guard pinning that no `await sendPasswordResetEmail(` remains and
that both the `.catch` handler and the controller's guard are present).

**B1 is PARTIALLY MITIGATED, NOT CLOSED, and is documented as such.** The dominant, most separable term
— the transport wait — is gone; what remains is **database work** (the business check, the token insert,
the `deleteMany` and the audit insert against one indexed read), which is explicitly **not** claimed to
be eliminated. No delay is injected to mask it, because unmeasured timing noise is not a security
control. **B2 — distributed reset-mail flooding of one address — was not implemented, not mitigated and
not touched**: the per-account bucket still keys on `ip|email` while a rotating attacker never trips the
per-IP bucket, and the limiter stores are still in-memory and per-process. **Phase 29 recorded its
disposition: DEFERRED TO V4**, together with E3, as related shared-infrastructure work — still open, not
mitigated, and with no shared store introduced.

Phase 29 is an owner-directed documentation-and-decision increment delivered as a single approved
increment after Phase 28 B1, and it is **documentation only**: no production code, test, dependency,
configuration, limiter or password-reset behaviour changed, and `server/**` and `mobile/**` are
byte-identical. Its purpose was to stop the repository saying "requires an owner decision" and start it
saying what was decided — because every remaining open security item was blocked on exactly that. Phase
28 B1's residual timing term, B2 and E3 each resolve either to an acceptance decision or to a
shared-store infrastructure decision, and no code phase could legitimately proceed ahead of one.

**Three owner decisions were recorded.** D-1: **B1's residual database-work timing difference is ACCEPTED
FOR V1 and DEFERRED** — it stays **PARTIALLY MITIGATED, NOT CLOSED**, is never to be described as fixed,
and no delay is injected to mask it. The reasoning is that the dominant and most separable term (the
transport wait) is already gone, and that equalizing the remainder would require either dummy writes on
the silent path or moving durability off the request path — and the latter would trade a timing oracle
for a lost-token correctness failure. D-2: **B2 is DEFERRED TO V4**, still open. D-3: **E3 is DEFERRED TO
V4**, still open, with B2 and E3 recorded as **related shared-infrastructure work** — same root cause (no
shared store), same remedy, therefore the same future increment. **No Redis or other shared store was
introduced**, and the in-memory per-process limiter architecture is unchanged.

**Four documentation inconsistencies were reconciled**, each verified against the files before being
changed rather than restated from memory. The roadmap's §3 Phase Overview flow diagram had stopped at
Phase 26B, so **Phase 27 and Phase 28 were missing from the canonical phase list** although both exist
as top-level sections — Phases 27, 28 and 29 are now listed. The README Phase Status list jumped from
Phase 26A to Phase 27 with **no Phase 26B entry at all** — the follow-up deferred at the Phase 28
close-out, discharged here. And the specification's §48 V2 "Future Roadmap" still listed the **barcode/QR
scanner, supplier management and stock transfers** as future work although all three shipped (Phases
12B–12D, 13A/17 and 19) — a correction the roadmap's §35 already carried and the specification had not.
The Phase 29 decision record itself lives in roadmap §27E.

**Historical snapshots were deliberately not back-updated**, in keeping with the convention every
earlier phase follows: §27B's Phase 26B-4 `## Verified` block still reads 36/36 HTTP cases, 39 recovery
cases and 209 + 394 = 603 even though the current figures are 40, 39 and 209 + 398 = 607. No test-count
snapshot was rewritten to match today's totals — the snapshot is the record of the phase that measured
it. The retained controller `MailDeliveryError` branch was not deleted, and no roadmap section was
renumbered: §27E is a new lettered subsection and sections 28–36 keep their numbers.

Phase 30A is an owner-directed release-engineering increment delivered as the first half of Phase 30,
and it is **infrastructure only**: no application code, no test, no backend file and no behavioural
change. It keeps the **Expo Continuous Native Generation (CNG)** architecture — nothing under
`mobile/ios/` or `mobile/android/` exists or is committed, and every native setting continues to flow
from `app.json` plus config plugins — and it lays the EAS foundation a future development build would
need. Three things landed. `expo-dev-client` was added at the SDK-57-matched `~57.0.19` (the installed
tree is dev-client 57.0.19 / dev-launcher 57.0.20 / dev-menu 57.0.18); **`expo-updates` was deliberately
not installed**, so the project remains OTA-free — the `expo-updates-interface` that arrives as a
dev-client transitive dependency is not OTA. `mobile/eas.json` was created with four build profiles:
`development` (development client, internal distribution, APK), `ios-simulator` (extending `development`
with `ios.simulator`), `preview` (internal-distribution APK) and `production` (auto-increment), under
`cli.appVersionSource: "remote"` — so EAS tracks build numbers server-side and `app.json` is never
dirtied by a version bump — and with **no `channel` key anywhere**, since update channels are meaningless
without `expo-updates`. And the project was linked: `eas init` created **`@jeffernqwes-team/inventory-ai`**
(project ID `607eca05-1175-43ed-86a0-1829e91c9531`), writing `extra.eas.projectId` and `owner` into
`app.json`. Both platforms carry the hyphen-free identifier `com.inventoryai.app` — the slug
`inventory-ai` would be an invalid Java package segment — and `ios.bundleIdentifier` / `android.package`
must stay in lock-step with it.

`eas init` writes back the **plugin-resolved** config rather than only the keys it owns, and on this
project it additionally injected `extra.router: {}` and `android.permissions:
["android.permission.CAMERA"]`. Both were removed by owner decision, because both are derived values
rather than intent: expo-router's own plugin regenerates `extra.router` on every config resolution, and
expo-camera's plugin injects the CAMERA manifest permission independently — confirmed with
`expo config --type introspect`, whose resolved package, permissions and URL schemes are identical with
and without them. The committed `app.json` diff is therefore four intentional additions.

**Nothing in Phase 30A is runtime-verified.** No `eas build`, no `eas submit`, no `expo prebuild`, no
simulator or device run and no APK install was performed. The phase is **statically** validated only:
`jest` 11 suites / 88 tests, `tsc --noEmit`, `eslint .` and `expo-doctor` 21/21, all identical before and
after, plus config introspection for the resolved native surface. **F-1 (PDF sharing) is NOT fixed and
NOT closed**, and **Phase 30B has NOT started**.

Phase 32B and 32C are the server half of the Firebase migration, and both are additive by construction.
32B installs the Admin SDK and the ID-token verify boundary behind `server/src/services/firebase/` and
changes three things on the `users` model; 32C exposes the exchange. Two constraints make the design
acceptable, and both are structural rather than asserted: **`requireAuth` changed by zero lines** — the
Firebase ID token is exchanged ONCE for an ordinary Inventory AI JWT, so Phase 26A's per-device session
revocation, `authenticate.ts`'s check order and every one of its error codes stay exactly as Phases
23/24 pin them — and **`businessId`/`role` still come from the MongoDB `User`**, never from a request
body, query, header or token claim, with `firebaseUid` read only from a verified payload. RBAC is
untouched: 4 roles, 21 permission keys, `ROLE_PERMISSIONS`, `CATALOGUE_ONLY_PERMISSIONS` and the Phase 23
mobile mirror are unchanged. `sparse: true` on `firebaseUid` is **mandatory, not decorative** — without
it the second legacy user without a uid collides with the first, breaking the legacy registration path
outright. 32C's registration route **refuses to link accounts**: a verified identity whose email already
belongs to a MongoDB user answers `409 EMAIL_IN_USE`, and account linking/migration was deliberately not
implemented.

Phase 32D then 32E are the mobile half, in that order deliberately: 32D establishes the SDK boundary and
signs nobody in, and 32E is the first phase that calls it. 32E's central property is that the legacy
password route is a **migration path, not a fallback** — it is reached only when Firebase reports that
no identity answers to the credentials, and never when Firebase or the backend failed, because treating
an outage as "try the other door" would let anyone who can break Firebase choose the weaker door. Both
codes that carry that meaning are handled, `auth/invalid-credential` and `auth/user-not-found`, because
they are the same signal under different project settings and handling only the first would hard-fail
every legacy account on a project with email-enumeration protection disabled. The session the flow
produces is the same Inventory AI JWT the app has always stored, so no session rule changed, and the
`EXPO_PUBLIC_FIREBASE_*` gate keeps an unconfigured build on its pre-Firebase path.

Four things Phase 32E decided or recorded, and they must not be lost. **The linked-account login guard:**
`loginWithPassword` refuses an account carrying a `firebaseUid` with 403 `FIREBASE_SIGN_IN_REQUIRED`,
placed after the password comparison and the status check — so it is not an enumeration oracle and
`ACCOUNT_DISABLED` still reports as it always has — and before `assertActiveBusiness` and the session
write, so no half-login can be left behind. **Its rollback consequence:** reverting the mobile build
alone no longer restores access for a linked account, because a reverted build has no Firebase path at
all, so rollback requires reverting the server behaviour too or disabling the guard. **The closed
password-authority decision** (design document §14.1): for a linked account Firebase owns the password
and the retained bcrypt hash is not a second way in, with the consequence recorded rather than glossed —
`change-password` and the 26B/27 reset flow then stop changing the credential that actually
authenticates the user. **One known limitation:** a legacy MongoDB account can have a Firebase identity
created for the same email without ever being linked to it (the client creates the identity first, the
server then answers `409 EMAIL_IN_USE`), and because the exchange resolves a user by `firebaseUid` only
and never by email, that identity is permanently unhealable. It is **not an account takeover and not a
lockout**, and no fix is implemented. The migration/linking phase is bound by the constraint recorded
with it: when it creates the Firebase user for an existing account it will receive
`auth/email-already-exists`, and that **MUST NOT be allowed to fail the legacy password login**.

**Verification status.** 32B, 32C and 32D are committed (`982284a`, `d4d9f19`, `ad26d60`). 32E is
implemented on branch `agent/phase-32e-firebase-auth` and **was not committed when this entry was
written**. The 32E review verified its own surface by targeted runs only — the new
`phase32e-firebase-legacy-guard.test.mjs` together with the modified
`phase32c-firebase-exchange.test.mjs` (42 passed, 0 failed, with that file's unit half run separately:
14 passed) and the three new mobile suites (3 suites / 46 tests) — and **no full suite was re-run for
it**. No EAS build, no prebuild, no emulator or device run and **no live Firebase project** has been
exercised for any of these phases, so the design document's two verification gates (bcrypt `auth:import`
support; the Expo SDK 57 React Native Firebase config-plugin configuration) remain **UNVERIFIED**. The
design authority is `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`; the shipped record is
`docs/DEVELOPMENT_ROADMAP.md` §27H.

Phase 32F is an owner-directed **decision-record and documentation close-out** increment delivered
after Phase 32E, and it is **documentation only**: no production code, test, dependency, schema,
route, configuration or authentication behaviour changed. Its purpose is to convert the multi-provider
architecture from "open questions" into **recorded owner decisions**, so that Google Sign-In,
Facebook Login, identity linking and legacy migration can each be implemented later without inventing
policy in code. Eleven decisions are now recorded as **RESOLVED**: Firebase is the identity provider
while MongoDB remains authoritative for `userId`, `businessId`, `role`, `status`, permissions,
business status, billing state, sessions and audit; the security boundary is server-controlled
(`businessId`, `role`, `status`, Firebase linkage, permissions and subscription access are never read
from the client); **a provider identity is NEVER automatically linked to an existing Inventory AI
account because the email address matches — email is not an account-linking join key**, and
authenticating a provider identity is not proof of ownership of an existing account; provider linking
is an explicit account operation performed by an already-authenticated user, whose provider UID comes
from the verified Firebase credential and never from a request body; provider linking **during a
sign-in attempt** requires an explicit ownership/recovery proof flow before it may attach to an
existing account; the Firebase exchange stays UID-authoritative with the existing
`REGISTRATION_REQUIRED` behaviour; the Phase 32E password-authority guard is retained unchanged; the
Inventory AI session representation stays **provider-neutral** (no provider field on the session model,
no provider-specific session types); Facebook identities without a usable email require explicit email
completion rather than an invented or UID-derived address; subscription/billing belongs to the
**business/tenant**, never to a Firebase identity; and lazy migration on successful legacy password
login remains accepted. The owner/ADMIN/MANAGER/STAFF creation hierarchy is documented, with
**invitation-based onboarding recorded as future implementation**, and **no invitation functionality
exists**. Open items are kept explicitly separated from resolved ones: the unlink policy and
last-authentication-method protection, the linked-account `change-password`/reset disposition,
`emailVerified` enforcement, M1 vs M2, Facebook's missing-email onboarding flow, the unhealable
orphan remedy and the `google-services.json` / `GoogleService-Info.plist` storage question all remain
**OPEN**. *(**Superseded in part 2026-09-29 (Phase 32O):** `emailVerified` enforcement is now
**DECIDED** — see the Firebase-only subsection above and design §14C.9; this sentence is the Phase 32F
record and is not rewritten.)* *(**Superseded in part 2026-10-07:** the unlink policy is no longer open — **Policy B** resolved it, and
the server-side capability was then **removed and re-scoped** into a credential change by
`Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9` (roadmap §27AA); the Policy B measurements remain
valid history and no reachable path clears `firebaseUid`.)* **Google Sign-In, Facebook Login, Apple Sign-In, account linking, account unlinking and
invitations were NOT implemented**; **Apple Sign-In is future scope**, and **no provider SDK was
installed**. The first EAS development build remains a **prerequisite** for validating the selected
mobile provider integration path, and **no EAS build was created**. Documentation drift was reconciled
across `CLAUDE.md`, `README.md`, `docs/SYSTEM_SPECIFICATION.md` and `docs/DEVELOPMENT_ROADMAP.md`,
including the previously undocumented `FIREBASE_*` environment variables (names only, never values)
and the missing Phase 32B–32E entries in the README phase list; no historical phase record was
rewritten. The design authority is
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14/§14A; the shipped record is
`docs/DEVELOPMENT_ROADMAP.md` §27I.

Phase 32G — First EAS Development Build / Native Runtime Validation (validation only: a `development`
profile Android build was produced, installed on the emulator and run OUTSIDE Expo Go, with API
communication proven end-to-end; **no production or configuration file changed** — Phase 30A's EAS
foundation was verified correct as committed; **M1 vs M2 NOT chosen**; no provider SDK installed;
**it is the THIRD EAS build and the second development-profile build, not the first** — see the
correction below)

Phase 32G is an owner-directed validation increment delivered as a single approved increment after
Phase 32F, and it is **validation only**: no provider was implemented, no schema, authentication
server behaviour, payment or billing behaviour was modified, no MongoDB schema changed, M1 and M2 were
**not** chosen between, and no provider SDK was installed. **No production or configuration file
changed at all** — §3's instruction to verify the EAS configuration rather than assume Phase 30A had
got it right resolved to the finding that it was already correct, so the minimum change set was empty
and the phase's single commit carries a `build:` subject over a documentation-only diff.

**The recorded build history is corrected here, because Phase 32G's own framing as "the first EAS
development build" is not accurate.** `CLAUDE.md`'s Phase 30A entry above ("NO EAS build, submit or
prebuild has been executed"), the Phase 30A narrative beneath it, and Phase 32F's "no EAS build was
created" are all **contradicted by EAS's own build list**, which holds **three** Android builds, every
one `finished`: **`94ecae78-35b6-46d8-b2e1-035cf36740a0`** (development profile, 2026-09-17 13:15,
from the Phase 30A commit `0a5d973` itself — precisely the claim Phase 30A denies),
**`b1447408-106f-4bd4-a5ac-ef17434fe1c4`** (preview, 2026-09-17 18:19, from `4998827`), and
**`60b0a916-1325-478f-b4fb-86fe3e7c3f07`** (development, 2026-09-21 00:33, from `5d7d1df` — this
phase). The `InventoryAI` AVD corroborates it: `com.inventoryai.app` reports
`firstInstallTime=2026-09-17 10:40:43` (emulator clock is UTC, so 18:40:43 local — a minute after
preview build `b1447408` finished) with `lastUpdateTime=2026-09-20 16:48:09`. Phase 32G is therefore
the **third** EAS build and the **second** development-profile build. The commit subject is the
owner's prescribed string and is used verbatim; roadmap §27J carries the accurate history. **No
historical phase record was rewritten** — those statements should be read as superseded, not as
still-true.

**What was proven.** The build is `development` profile (`developmentClient: true`,
`distribution: internal`, `android.buildType: apk`), Android, `finished` in 12 min 11 s, artifact
`https://expo.dev/artifacts/eas/4BpCsxZ-l5ikL4p3h-03UlhkZh_bxxR-q9LUELWgHXw.apk`, fingerprint
`eafbd98898e2064076677151c721472d1382486b` — **identical to preview build `b1447408`'s**, which is
consistent with Phase 32B–32E having added no native surface at all, since the Firebase SDK is
JavaScript-only. The EAS-managed keystore was **reused, not created**, and the version code was minted
server-side by `cli.appVersionSource: "remote"`, so `app.json` was never dirtied. Installed and
launched on the emulator, Metro served `expo-router/entry.js` (**1,525 modules in 11,051 ms**) into the
installed native APK with `topResumedActivity=com.inventoryai.app/.MainActivity` — which is exactly
what "runs outside Expo Go" means, because a development build is an installed native APK loading its
JavaScript from a bundler. The signed-out root renders, the auth UI loads, no `FATAL` /
`AndroidRuntime` / `E ReactNativeJS` entry appears in logcat, and **Firebase is never initialized** —
all four `EXPO_PUBLIC_FIREBASE_*` values are unset, so `isFirebaseConfigured()` is `false` and
`lib/firebase.ts` returns `null` without calling `initializeApp` (the lone `firebase` logcat string is
Google Play Services' own dynamic-links broker, not the JS SDK). **API communication is proven
end-to-end rather than inferred**: invalid credentials were submitted and the screen showed
**"Invalid email or password"**, which is `INVALID_CREDENTIALS_MESSAGE` at
`server/src/services/auth.service.ts:81` and exists nowhere in the app outside a test mock, with the
backend logging `POST /api/auth/login → 401` (395.9 ms) and `GET /api/auth/me → 401` (163 ms). That
also settles the platform question the build could have failed on: the app requests
`http://10.0.2.2:4000` — cleartext HTTP against `targetSdk 36` — and the development build's
debuggable manifest permits it.

**What was NOT verified, stated rather than glossed.** There was **no physical device**: every runtime
observation is from the `InventoryAI` Android **emulator**, and no device test is claimed. **iOS was
neither built nor run** — no iOS build exists for this project and the host is Windows, so the
`ios-simulator` profile stays unexercised. The `preview` and `production` profiles were not exercised.
Nothing beyond the signed-out root was navigated, since reaching an authenticated screen requires
valid credentials this phase deliberately did not supply. **No test suite was re-run**, because the
change set is documentation only. **No blocker was hit** — but one real limitation is recorded: the
`development` profile sets no `env`, so `EXPO_PUBLIC_API_URL` is unset and `mobile/lib/config.ts`
falls back to the emulator-only `http://10.0.2.2:4000`, meaning **physical-device API validation would
require setting it to the host's LAN address**; no change was made, because any value added would have
been emulator-wrong and would have broken the path this phase verified.

**M1 vs M2 findings were documented and NOT chosen.** For **M1** (native provider libraries) the
pipeline it needs is now proven — a config-plugin-driven CNG development build compiles, installs and
runs — and config-plugin auto-discovery is confirmed on this project, so an added native provider
module's plugin would run without hand-registration; its open cost is unchanged (`google-services.json`
and `GoogleService-Info.plist` storage) plus a changed fingerprint, and **its runtime behaviour is
unproven because no provider SDK was installed**. For **M2** (`expo-auth-session` / `expo-web-browser`)
the `inventoryai` scheme is configured and Phase 27 exercised a custom-scheme deep link — but only
configuration-verified, since a real custom-scheme launch needs a development build. **This phase
produced such a build but did not test a redirect**, so **M2's redirect capability remains unproven**,
and the question it must answer is recorded: a development build installs the dev launcher's own
activity and URL scheme alongside the app's, so a provider redirect handing control back must be
verified rather than assumed. The design authority remains
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14/§14A; the shipped record is
`docs/DEVELOPMENT_ROADMAP.md` §27J. **Phase 32H, 32I and 32J were NOT started** (Phase 32H
subsequently shipped — see the Phase 32H entry below; this sentence is the Phase 32G record and is
not rewritten).

> **Cross-reference added 2026-09-25 (Phase F1).** The M2 question recorded above — whether the
> mobile provider integration would use the `expo-auth-session` / `expo-web-browser` system-browser
> flow — **is closed as superseded**. The shipped implementation is **M1** (native SDKs:
> `@react-native-google-signin/google-signin`), and Phase F1 removed M2's browser machinery along with
> the `firebase` JS SDK dependency. This paragraph is the Phase 32G record and is not rewritten. See
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14A.9 and
> `docs/DEVELOPMENT_ROADMAP.md` §27N.

> **Cross-reference added 2026-09-25 (Phase F2).** Phase F2 completed the G-1 cleanup on the **native
> surface**: `expo-auth-session`, `expo-web-browser` (and its `app.json` plugin, removed atomically) and
> `expo-crypto` are gone from `mobile/package.json` and the lockfile; `expo.scheme` is now exactly
> `["inventoryai"]`; and `mobile/app/+native-intent.ts` with its suite is deleted, because the
> `com.inventoryai.app:/oauthredirect` callback it intercepted can no longer be delivered by any configured
> scheme. `android.package` / `ios.bundleIdentifier` remain `com.inventoryai.app` and the six native plugins
> remain. **F2.9 — a new EAS development build — has NOT been created**, so F2 is **config-verified only**;
> native confirmation is pending, iOS remains `[EXTERNAL VERIFICATION REQUIRED]`, and the F2.9 build targets
> the **local LAN backend**, not Render. See `docs/DEVELOPMENT_ROADMAP.md` §27O and
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14A.10.
>
> **Firebase dependency boundary, stated precisely (verified in Phase F2.6):** the **root** `firebase`
> dependency is removed and `firebase` is **not hoisted**, but it is **NOT absent from `node_modules`** —
> `@react-native-firebase/app@26.4.0`, which is kept on purpose because it is what authenticates, declares
> `firebase@12.17.1` as a hard dependency, so the JS SDK remains nested at
> `node_modules/@react-native-firebase/app/node_modules/firebase` and `npm ls firebase` still resolves. The
> invariant that holds, and is asserted, is that **no module under `mobile/lib/` or `mobile/app/` can resolve
> or import the bare Firebase JS SDK**. `@react-native-firebase/app` must not be removed or altered, and no
> record may claim the JS SDK is absent everywhere.

> **Cross-reference added 2026-09-25 (Phase F2.9).** The EAS development build and the Android runtime/native
> verification that F2.9 left open are now **done**. Build **`f3038fa1-1cab-476e-b0f9-d6a9178f955b`** — status
> **FINISHED**, profile **`development`** / **Android**, fingerprint
> **`d16abc4e7df419812e73598db676985be3606dc7`** — installed and ran on emulator **`emulator-5554`** (SDK 35,
> x86_64) with **0 `FATAL EXCEPTION` / `AndroidRuntime: FATAL`**. The fingerprint **exactly matched the current
> working-tree fingerprint**, proving the uncommitted F2 tree was what EAS built. **The F2 native surface is
> now Android-runtime VERIFIED**: `inventoryai://reset-password` renders the reset screen,
> `com.inventoryai.app:/oauthredirect` is **unresolvable at the OS level**, and `expo-web-browser` /
> `WebBrowserModule` / `oauthredirect` are **absent from the APK dex** while RNFirebase and native Google
> Sign-In remain; a real **local-backend** round trip was proven and **Render was not used**. **This supersedes
> the statement above that F2.9 had not been created.**
>
> **Authentication E2E remains deliberately unverified, and this is not an F2 failure.** F2 changed no
> authentication logic; the blockers are pre-existing and environmental: email/password is **PARTIAL** (the
> native Firebase path executes, but no live Firebase project or valid credentials exist), and native Google
> Sign-In, the Firebase→backend exchange, the Inventory AI JWT/session and Firebase logout/session teardown are
> all **BLOCKED**. **iOS remains `[EXTERNAL VERIFICATION REQUIRED]`** — no iOS build can be produced on this
> Windows host. Runtime verification changed **no source, config, EAS variable or API URL**, created no service
> file, and committed nothing. See `docs/DEVELOPMENT_ROADMAP.md` §27P and
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14A.11.

Phase 32H is an owner-directed account-linking increment delivered as a single approved increment after
Phase 32G, and it implements the **server half of linking and deliberately nothing else**. The question
it answers is exactly one: *may this authenticated Inventory AI account carry this verified Firebase
identity?* Firebase's own provider linking — `linkWithCredential`, "Connect Google" — is performed by
the **Firebase client SDK** against the signed-in Firebase user; the uid does not change, Inventory AI
never sees it, and the server has no API for it, so **no fake server-side provider-linking operation was
invented to "complete" the picture.** What the server owns is the half the client must never be trusted
with: the decision that a MongoDB `User` may carry a given `firebaseUid`, and the conflict detection
that stops one Firebase account silently taking over another person's tenant.

**One route, and it is the only way a `firebaseUid` is attached to an existing account.**
`POST /api/auth/firebase/link` is `requireAuth` + controller — Phase 23's `AUTHENTICATED` bucket, no
permission, because it acts only on the caller's own account and no catalogue key could express "may
link an identity" without inventing an authorization concept the catalogue does not have. It is
deliberately **not** rate-limited: no authenticated route in the application is limited, and adding one
would mean a new limiter factory and config entry, out of this phase's scope. The body is `{ idToken }`;
the response is `{ linked, user }`, and `user` is `toPublicUser`'s allowlist, so the route reports which
account was linked and never the identity attached to it. `linked: false` is the CASE A answer, not an
error — both are 200.

**Both sides of the association are server-derived, and that is the whole security argument.**
`validateFirebaseLink` returns only `{ problems, idToken }`, so the handler holds **no variable** that
could carry a client-supplied `userId`, `businessId`, `firebaseUid`, `role` or `status`: those keys are
inert rather than validated-and-rejected, and there is no check that could be deleted. The account is
`req.user.id` — the authenticated session **is** the ownership proof Phase 32F §14A.4 requires, which
is why this route may do what `registerBusinessFromFirebase` must refuse — and the identity is
`verifyFirebaseIdToken(idToken).uid`. `businessId` comes from `req.user`, and the service never writes
it, so a link can neither reach across tenants nor move an account between them. **A link writes exactly
two fields, `firebaseUid` and `emailVerified`;** `businessId`, `role` and `status` are read for the
audit row and never assigned, so no code path can change a tenant or a role.

**Four lifecycle cases, in an order that is load-bearing.** CASE A and CASE D are decided from the
**account's own** `firebaseUid` before the identity is looked up at all, so an account that already owns
an identity never has its own mapping queried, compared or replaced. **CASE A** — the same identity on
the same account — is an idempotent success with no write and **no audit row** (recording an event that
did not happen is a false trail, the reasoning `revokeSessionByJti` already uses). **CASE D** — this
account already owns a *different* identity — is refused, and the existing mapping is never silently
replaced: swapping it would hand a stranger's Firebase account a sign-in to this user. **CASE B** — the
identity already belongs to another MongoDB user — is refused and audited, **never merged and never
transferred**; the account that holds it keeps it untouched. **CASE C** — the identity belongs to nobody
— is attached, which is safe only because the caller has already proved they own this account.

**The email is never a join key in any of the four.** It is not compared against the account's, not used
to find an account, and not used to resolve a conflict — which is what makes "no automatic linking on an
address match" a property of the code's shape rather than of a check someone could delete, and what
makes a provider supplying no address (Facebook, per R-10) link exactly as well as one that does.

**Concurrency is the database's problem, not the check's.** Attachment is ONE conditional update
(`{ _id, firebaseUid: null }`, which matches null *or* absent), so a second link racing the first
matches nothing rather than replacing an identity set microseconds earlier; the `firebaseUid` unique
index is the last line of defence behind the CASE B pre-check, and the loser of a race sees E11000,
mapped to the **same** conflict — reporting it as anything else would be the "auto-resolve a compromised
mapping" behaviour §7.4 forbids. A lost race re-reads and re-dispatches to CASE A or CASE D rather than
assuming.

**Error and audit hygiene.** CASE B and CASE D share **one** `409`, one code
(`FIREBASE_IDENTITY_CONFLICT`) and one generic message naming no account, tenant, role or Firebase UID,
because telling them apart would describe a mapping the caller may not be entitled to see. **The
conflicting uid never enters the audit row** — that trail is readable by every ADMIN of the business,
and in CASE B the uid may name a person in a *different* tenant, so it goes only to the server-side
structured log, the standing `firebase_identity_collision` precedent. The success row records
`{ passwordCredentialRetained: boolean }` and no uid. **A refused link does not revoke sessions:**
revoking would not undo the link — the attacker simply signs in again — so it would be behaviour
invented for no security benefit. Two audit actions were added, `FIREBASE_IDENTITY_LINKED` and
`FIREBASE_IDENTITY_LINK_CONFLICT`; the brief's other candidates (attempted cross-business linking,
attempted role manipulation, unauthenticated linking) **have no emission site and cannot have one** —
the payload carries no `businessId` or `role` to attempt them with, and `requireAuth` refuses an
unauthenticated caller before any handler runs, so there is no `businessId` in scope to attribute a row
to.

**One deliberate divergence, and it is load-bearing.** A rejected Firebase ID token on this route is
answered **`400`, not `401`**. `mobile/lib/client.ts` treats a `401` **or `403`** response to a request
that carried a token as session loss and clears the session, and this route is authenticated — so a
`401` would mean "the Firebase credential was bad" and be acted on as "your Inventory AI session is
gone", signing a user out over an unrelated failure. The error **code** is unchanged
(`FIREBASE_TOKEN_INVALID`) and the adjustment is keyed on the code, so this module's own genuine
`401 AUTH_REQUIRED` still travels as a 401 and a client branching on codes needs no second branch.

**§15 finding — the password reset / `change-password` defect, inspected and deliberately NOT changed.**
For an account carrying a `firebaseUid`, the Phase 32E guard means the retained bcrypt hash no longer
authenticates anyone, so `POST /api/auth/change-password` and the 26B/27 reset flow both write an inert
hash, revoke every session as a side effect, and report success. **The linking boundary interacts with
this defect, and only by making the population reachable:** before this phase no code path wrote
`firebaseUid` onto an existing password account, so the state was theoretical; it now exists. **No
behaviour was changed**, because the brief forbids inventing a new password-reset policy and the
disposition is already recorded as open (design document O-2, specification §29) — changing these
endpoints without deciding the policy would settle by accident what must be settled on purpose. **O-2 is
escalated by this phase from "a gate on a future phase" to "a live defect", and the final decision
remains a separate explicit hardening item.** The audit flag is informational only, with zero
authentication behaviour change.

**§16 finding — unlink.** **Nothing implemented, nothing changed.** Unlinking remains a client-side
Firebase-only operation the server cannot observe, and Firebase's "last provider" protection remains
unaware of a retained `passwordHash`. **O-1 is unchanged and still open**, and Phase 32L owns it. No
unlink route, service or audit action was added.

**Verification.** `server/test/phase32h-firebase-linking.test.mjs` — one unit suite and one DB-backed
suite over the real `app.ts`, **25 tests, 25 pass, 0 fail**, registered in `MIXED` in
`scripts/run-tests.mjs` so both `test:unit` and `test:db` include it;
`phase23-authorization-contract.test.mjs` declares the new route in its `AUTHENTICATED` bucket with a
written reason, and that guard asserts bucket *membership* rather than a count, so it fails on the
declaration alone. `npm run typecheck` and `npm run lint` are clean; the phase22/23/TS-3 guard set runs
**60 pass, 0 fail**. **Every assertion was proven able to fail before being trusted**: a mutation pass
applied seven mutations to pristine copies — removing the CASE D guard *and* the conditional update's
`firebaseUid: null` filter together, removing the CASE B pre-check *and* the E11000 mapping together,
flipping the route's 400 to a 401, making the verified email a join key, adding the uid to the success
audit row, making CASE A non-idempotent, and making the validator return a client-supplied
`businessId` — and **all seven produced a red test**. Two findings are kept: **CASE D and CASE B are each
doubly enforced** (CASE D by its guard and the conditional filter, CASE B by its pre-check and the
unique index's E11000), so removing either layer **alone** leaves the property intact and the suite
green — defence in depth rather than redundancy to be tidied away, which is why those two mutations
remove both layers at once. **No schema change** (so no migration and no index rebuild), **no new
dependency**, **no session-model change**, **no payment or subscription code touched**, and the five
pre-existing working-tree entries untouched. Google Sign-In, Facebook Login, Apple Sign-In, provider
SDKs, OAuth redirects, account linking via a provider, unlinking and invitations are **NOT
implemented**. The design authority remains
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14B; the shipped record is
`docs/DEVELOPMENT_ROADMAP.md` §27K. **Phase 32I, 32J and 32L were NOT started.**

> **Cross-reference added 2026-09-26 (Phase 32L — documentation close-out).** The unlink finding above is
> **superseded**: Phase 32L shipped as **32L-A** (server, `01ae73f`) and **32L-B** (mobile, `0c3f87d`),
> both contained in `main` (`dbdf673`). The sentence "**Phase 32I, 32J and 32L were NOT started**" is the
> Phase 32H record and is not rewritten. One authenticated route, `POST /api/auth/firebase/unlink`,
> **`requireAuth` + controller with no permission** — the account is `req.user.id` and the identity is the
> verified token's uid, so no client-supplied `userId`/`businessId`/`firebaseUid`/`role`/`status` can
> steer it, and the email is never consulted. **★ Policy B is the unlink policy and the
> last-authentication-method invariant is enforced server-side:** an account may leave Firebase authority
> only by establishing a **new local password in the same transition**, so it never passes through a
> zero-authentication-method state; the retained bcrypt hash is **REPLACED, never re-enabled**, and the
> write touches only `firebaseUid`, `emailVerified`, `passwordHash` and `passwordChangedAt`, so an unlink
> can never move a tenant or change a role. Stale authentication answers **`409`
> `FIREBASE_REAUTHENTICATION_REQUIRED`** (a 300-second window, server-enforced from the signed claim),
> never 401/403. **The assumption the repository had recorded — that Firebase refuses to remove a user's
> last provider — was REFUTED by the Phase 32L runtime experiment**, which is why that protection can
> never be delegated to Firebase. Firebase-side provider unlinking remains a **Firebase client SDK**
> operation the server cannot observe; no server-side equivalent was faked. **Verification wording is
> unchanged and must stay so:** Firebase E2E, the Firebase → backend exchange, the Inventory AI
> JWT/session flow through live Firebase and iOS runtime are **NOT verified**; the 32L-B Google
> confirmation path was never runtime-verified; iOS remains `[EXTERNAL VERIFICATION REQUIRED]`; the test
> figures are the phase records' own historical figures and no suite was re-run for this close-out.
> **Documentation only** — no source, test, dependency, schema, route, permission, Firebase, EAS or Render
> change, and no protected working-tree file touched. No security/recovery decision is settled here. See
> `docs/DEVELOPMENT_ROADMAP.md` **§27Q** and `docs/SYSTEM_SPECIFICATION.md` §29.

> **Correction added 2026-10-02 (Phase F-1, HEAD `6e2252f`).** The unlink capability described above **no longer exists in the committed tree.** HEAD `6e2252f` ("feat: re-scope Firebase disconnect into a password change (Phase A / F-1)") removed the authenticated identity-unlinking route and deleted `server/src/services/firebaseUnlink.service.ts` (402 lines); `server/src/routes/auth.routes.ts` registers no `POST /api/auth/firebase/unlink` route, so no server-side path can clear a `firebaseUid`. The mobile `disconnect-firebase` screen was re-scoped into a password change (F-1). The 32L paragraph above is the historical record and is **not rewritten** — it should be read as **superseded**, not as still-true. The server-side **link** boundary (Phase 32H) is unaffected.

Phase 18 is an owner-directed mobile UI extension delivered in approved lettered increments (18A,
18B, …) after Phase 17. It turns the app into a modern SaaS-style product surface WITHOUT changing
navigation (the existing native-stack stays; a tab bar would require touching the owner-held
`(app)/_layout.js` and is deferred) or any backend behavior.
**18A, 18B, 18C, 18D, 18E, and 18F are implemented**: a semantic light **and** dark theme system (`palettes` in
`lib/theme.js` with `colors` kept as the light alias so owner-held chrome keeps working;
`ThemeProvider`/`useTheme` in `lib/theme-context.jsx`, scheme preference persisted via
`expo-secure-store`; `userInterfaceStyle: "automatic"`), a behavior-neutral conversion of all 41
non-owner-held theme importers to `useTheme()` with memoized per-theme styles, `@expo/vector-icons`
behind a semantic `components/icons.js` map, new primitives (`IconButton`, `SectionHeader`,
`ListRow`, `StatCard`, `Sheet`, `SearchField`, `ListScreen`) plus polish (Button size/icon, Badge
dot + 12px status text, Input/SelectField focus rings, ListState icons), and a readability pass:
44px+ touch targets, labelled icon controls, status always text/icon + color, larger type for
quantities/status/prices/primary actions, no `allowFontScaling` disabling, layouts verified at
increased system font sizes, WCAG-AA contrast in both themes. **18B** rebuilt the dashboard on those
primitives with a clearer navigation hierarchy (same data, same destinations). **18C** migrated the
three core list screens (products, inventory, purchase orders) onto one shared list grammar —
`ListScreen`/`ListRow`/`SearchField`/`PressableCard`/`Icon` — adding an optional `footer` and
`titleStyle` to `ListRow`, `emptyAction`/`loadingLabel` to `ListScreen`, prop forwarding to
`PressableCard`, and `autoCapitalize` to `SearchField`; behavior (API calls, filters, RBAC gates,
deep links, navigation, loading/empty/error copy) is unchanged, and no new entry points were added. **18D** brought the four record-detail screens (product, stock
record, purchase order, receive) onto the same primitives — `SectionHeader` for section headings,
`StatCard` for key quantities (available/on-hand; received/remaining, with ordered preserved in the
`sub` line), and the shared `ListRow` grammar for stock rows, PO items, receipts, and receive lines;
the purchase-order number keeps its `h2` prominence in the same weight family as the list screen. No
shared primitive needed changing. Behavior is unchanged: no logic, API, payload, navigation, or
permission edits, and the claim-first receive workflow is presentation-only (every receive function
is byte-identical). **18E** brings the fifteen secondary routes (users index/new/detail, audit, history,
categories, locations, suppliers, profile, change-password, edit-name, scan, AI hub/new/chat) onto the
same primitives and modernises the three backing components `RefManage`, `UserForm`, and `AiChat` in
place; `Chip` gains a semantic selected state and a 44px floor, and `ListScreen` gains additive
`errorTitle`/`footer` props. Behavior is unchanged again — RBAC gates, validation order, payload
asymmetries, and the `scan.js` rescan/`lastScanned` semantics are preserved, and `lib/theme.js` is
untouched. **18F** is the forms-and-auth pass and closes the 18x series: the three shared form
components (`ProductForm`, `MovementForm`, `PoForm`) and `AuthLayout` move onto the same primitives,
and the ten routes that render them (`login`, `register`, `app/index`, `products/new`,
`products/[id]/edit`, `stock-in`, `stock-out`, `adjust`, `purchase-orders/new`,
`purchase-orders/[id]/edit`) are reduced to a bare render. Each form component now owns a single
`Screen` (scroll, keyboard avoidance, safe-area padding) instead of being wrapped by its route — a
nested `Screen` would have doubled both the insets and the keyboard offset. PO item blocks use
`Card` + `SectionHeader`; `MovementForm`'s availability line becomes a `StatCard`; `AuthLayout`'s
brand block is centred and reflows; `AccessDenied`'s 🔒 emoji becomes the semantic
`Icon name="lock"`. Two owner-approved scope additions rode along: the **dark** `placeholder` token
was lifted from `#7A8494` to `#8A93A6` (4.41:1 → 5.40:1 on `surface`, 3.89:1 → 4.76:1 on
`surfaceMuted`), fixing the AA failure 18E reported; the **light** `placeholder` (`#8A94A6`, 3.06:1)
was left alone as out of scope and is documented as a known issue in `docs/DESIGN_SYSTEM.md`.
Behavior is unchanged: RBAC gates, validation order, payload shapes, and loading/empty/error copy
are preserved, and no form was submitted during verification.

Phase 19 is an owner-directed inventory-completeness increment delivered as a single approved
increment after Phase 18F. It closes the last §15 gap: `TRANSFER` had been reserved since Phase 04
but never implemented, so moving stock between locations required a manual stock-out at one location
plus a stock-in at the other. Phase 19 makes a transfer one logical operation producing both legs
through `POST /api/inventory/transfer`, reusing the **Phase 07A compensation architecture** rather
than introducing MongoDB sessions or multi-document transactions: a guarded atomic source debit, a
destination credit by upsert, two `TRANSFER` ledger rows sharing one `reference`, and a
quantity-anchored, destination-first rollback if either leg or the ledger write fails — so the
source never goes negative, the destination is never credited without a successful source leg, and a
concurrent movement on the same row is never clobbered. It is gated by the **existing**
`INVENTORY_MANAGE` permission (OWNER/ADMIN/MANAGER; STAFF 403) — no new permission and no RBAC
matrix change. Mobile gains a `/transfer` screen with source-availability, same-location and
over-quantity guards, reached from a role-gated dashboard entry, plus a "Transfer" history filter
chip/badge and the `INVENTORY_TRANSFERRED` audit label; the row-lookup shared by `MovementForm` and
`TransferForm` moved to `hooks/useInventoryRow.js` behavior-identically. No authentication, tenant
isolation, audit DTO, pagination, ordering, or existing stock-in/out/adjust semantics were changed.

The `(app)/_layout.js` and `components/SignOutIcon.jsx` freeze introduced in 18A (which had pinned both
to the static light `colors` alias, and therefore rendered the native header as a white bar over the
dark app) was **lifted by the owner** as a follow-up fix after 18E: both files now read `useTheme()`,
so the native header themes with the rest of the app, and the missing `suppliers` title was added to
the layout's `<Stack.Screen>` list. `colors` in `lib/theme.js` is now unimported. See
`docs/DESIGN_SYSTEM.md`.

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