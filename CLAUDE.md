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
closed**. `server/src` holds **117** `.ts` modules (re-counted 2026-10-10; the figure was 94 at the campaign close-out) and exactly one intentionally deferred `.js`
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
> true, Mongo challenge consumed, safe-log checks passed); **AUTH-04-H** is the documentation close-out, **complete** — commit `0972948`, 2026-10-03.
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
Phase 30A — EAS Development Build & iOS Readiness Foundation (EAS foundation only: the Expo Continuous Native Generation architecture is retained and no `ios/` or `android/` directory exists or is committed; the project is linked to EAS project `@jeffernqwes-team/inventory-ai` — `607eca05-1175-43ed-86a0-1829e91c9531`; `mobile/eas.json` defines `development`, `ios-simulator`, `preview` and `production` with `cli.appVersionSource: "remote"` and no update channel; `expo-dev-client` added and `expo-updates` deliberately not installed; bundle/package identifier `com.inventoryai.app` on both platforms; NO EAS build, submit or prebuild has been executed, so the phase is statically validated only and NOT runtime-verified; F-1 — the Phase 30A **PDF-sharing** finding, unrelated to the much later registration required-field validation fix recorded in the unnumbered entry below — **is FIXED in code as of 2026-10-11 (§27AM: both print actions pass the same label geometry, and two of the 8 guard cases fail if the fix is reverted), with only its print → scan round trip left unverified on hardware**; Phase 30B has NOT started, and is now **defined** in the entry below)

Phase 30B — Native & Device Acceptance (defined 2026-10-11 by owner decision; **NOT started**): the work that is unreachable from JavaScript-only CI, and the only home for the items that need a native build. Scope — **ISS-02** the RNFirebase Auth PII log re-checked in logcat on a `development` build made **after** the `patch-package` patch (the client installed on the phone predates it, F-26); **ISS-06** the **generated** `minSdk`/`compileSdk`/`targetSdk` read out of the build and recorded, with `expo-build-properties` entering only if the app's own levels need raising; **ISS-13** the PDF label printed and **scanned back**; the **authenticated device run** — Firebase-first sign-in, AUTH-04 verification, tenant creation, then dashboard/inventory/locations/stock in-out/transfers/suppliers/purchase orders/AI assistant/audit trail; and **iOS**, which is **environment-blocked** (no macOS on this host). Definition of done — every item carries a **device-measured observation** with its date, blocked items are recorded as blocked and **never** as passing, **no item is closed from a code read alone**, and the phase adds **no** dependency, route, permission or schema change. It is **not** the SDK 58 train (§27AI) and **not** Phase 30A's EAS foundation, which is complete; the one item once assigned here, ISS-13, was already fixed in code (§27AM). Roadmap §27AW.)
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
AI-1 — The AI Turn Time Budget (fixes **ISS-21**, the one defect the authenticated device walkthrough §27BC found; server + mobile, **no new dependency**): the server's ceiling for one chat turn was the *product* of two unrelated knobs (`AI_REQUEST_TIMEOUT_MS` 60 s × `AI_MAX_TOOL_ITERATIONS` 6) and was stated nowhere, while the mobile client aborted **every** route at a fixed `REQUEST_TIMEOUT_MS = 15000` — so a slow-but-successful answer (one measured working answer took **13 283 ms**) was killed by the phone and then reported to the user as *"Cannot reach the server"*, naming the wrong component and sending them to check a connection that was working. Now: **one wall-clock deadline per turn** (`AI_TURN_DEADLINE_MS`, default 60 000) that each provider call is clamped to the remaining time of, so the loop can never exceed it; the assistant gets its own client budget (`AI_REQUEST_TIMEOUT_MS`, 75 000) with a **guard that reads the server's default out of its source** and fails if the client budget is not above it, because two numbers that were never designed to agree would otherwise drift again; a timeout is its own fact (`504 AI_TIMEOUT`, its own sentence, checked **before** `isNetwork` — the transport always distinguished it and the screen discarded it); and a turn whose caller has gone away is **cancelled** (`499 AI_ABANDONED`) instead of paying for a model call nobody will read, which also makes an abandoned turn visible server-side for the first time. **Two corrections of the record:** §27BC's F-51 wording said the chat request "never arrived" — it said only that it was never **logged**, and `httpLogger` emits on `res.on('finish')` alone, so an aborted request leaves no line at all (probe: **1** line for a completed request, **0** for an aborted one, with a positive control), making the zero occurrences exactly what an abort looks like; and `res.on('close')` was **not** sufficient to detect a caller who left during auth, found by the failing test and fixed with a `res.destroyed` check. Server **1331/1331**, mobile **688/688**, typecheck/lint/both module-graph checks clean on both sides. **VERIFIED ON THE DEVICE 2026-10-12 (§27BE)**, on the same OPPO CPH1969 over the USB tunnels with scrcpy mirroring: four `POST /api/ai/chat` turns returned **201** at **6 185 / 8 212 / 10 302 / 19 388 ms** — the last **4.4 s beyond the old 15 s client abort**, still answering and still rendering on screen, which is exactly the request the old code would have killed — and a forced **2 s** turn deadline returned **504** at **2 224 ms** with the app showing *"The assistant took too long to answer. Please try again."* and *"Cannot reach the server"* absent from the screen. The only 5xx in the whole run is that deliberate 504. **Still unverified on hardware:** the Task 5 abandoned-turn cancellation (both attempts were inconclusive — see §27BE). Streaming and the model choice are the owner's next decisions and were deliberately left out; roadmap §27BD, plan `docs/superpowers/plans/2026-10-12-ai-turn-time-budget.md`)
AI-2 — The Degraded Turn Made Visible, a Bounded Retry, and the Read-Only Invariant Made Provable (fixes **ISS-23** and delivers the code half of **ISS-22**; server + mobile, **no new dependency, no model change, no route, permission or schema change**): the 2026-10-12 device run measured **three defect-class turns in five** from the free-tier gateway (§27BE) — **F-52** (a `200` carrying only a `thinking` block: no text, no tool call), **F-54** (a `200` with a **zero-length body**) and **F-55** (raw Markdown on screen) — and the first two **left no server-side trace whatsoever**: the canned sentence *"I could not generate a response right now. Please try again."* was returned as an ordinary **HTTP 201**, and a repository-wide `grep` for it found exactly one occurrence, its own assignment. Now: a content-less `200` is **retried once** (`AI_EMPTY_RETRY_MAX`, default 1) as an ordinary loop iteration, so the retry **shares `AI_TURN_DEADLINE_MS` and `AI_MAX_TOOL_ITERATIONS`** and can neither extend a turn nor run unbounded, and it applies **only** to the empty-completion shape — **a provider failure is never retried**, so an outage cannot be answered by paying for it twice while the cause is hidden; a turn that exhausts the budget is **marked** — `degraded` is `EMPTY_COMPLETION` or `ITERATION_LIMIT`, **absent rather than null on a healthy turn** — and it is still persisted and still a `201`, with one greppable server line (`[ai] degraded turn reason=… attempts=… empty=… model=… tools=…`, where `empty` counts responses **seen** rather than retries **authorised**, so the line cannot overstate what happened), the **cause reported rather than the trigger** because a turn that ran out of steps while the model kept answering nothing is an empty-completion problem and naming it a step-count problem sends an operator to the wrong knob. The **security half**, and the reason this is more than a reliability patch: CLAUDE.md §4's read-only scope was mandatory and yet **nothing in the repository could fail if a write capability were added to the tool table** — the invariant held only because every contributor remembered it — so `server/test/AI2-ai-readonly-tools.test.mjs` now pins every tool's permission to the four **read** capabilities (and asserts those four are not write-shaped), scans the table's **own source** for any service call outside a read-only allow-list, requires **every** tool to refuse a smuggled `businessId`/`$where`/`role` argument, and asserts the nine write-tool names a model actually invents (`createProduct`, `stockOut`, `adjustStock`, …) all answer `TOOL_NOT_FOUND`; **the scan carries a positive control that mutates the source twice**, because a guard that cannot fail is decoration. Plus **ISS-23**: the assistant bubble strips Markdown markers — deliberately **not** a renderer, so no new dependency — with two limits the suite pins: **single underscores are never emphasis** (`SKU_123_AB`, `MIN_STOCK_LEVEL` are data, not formatting) and **a lone asterisk counts only when a non-space follows it**, so `12 * 3 = 36` survives as arithmetic. **Owner decision 2026-10-13: the assistant stays on the free tier** — no paid model, no provider change — so the model is untouched and the residual is accepted for V1: the retry reduces and *counts* the symptom, it does not make a free-tier model reliable. Evidence: server **1353 tests / 192 suites** and mobile **54 suites / 701 tests**, **0 failures** (up from 1331 and 688), `tsc`/`eslint`/both module-graph checks clean on both sides; **every new suite was watched failing first** (the retry suite `1 !== 2` provider calls, `1 !== 3` for a raised budget, `degraded === undefined`, and *"Missing expected rejection"* exactly where today's code resolves instead of timing out; the mobile suite **13/13** on `stripMarkdown is not a function`); and the guard **proven able to fail in both directions** — clean tree exit **0**, a write call injected into an executor **1** (failing both the scan and its positive control), a tool gated on `INVENTORY_MANAGE` **1**, restored **0** and **byte-identical** to the pre-break copy. One transient is recorded rather than smoothed over: the run printed `[db] MongoDB connection lost` once (the known Atlas `ReplicaSetNoPrimary` of §27BC/§27BE) and recovered with **0 failures and 0 skipped**. **NOT device-verified** — the failure rate is not yet re-measured and the Markdown strip's wiring awaits the next run; roadmap §27BF)
AI-3 — The Assistant's Queries at Catalogue Scale (fixes **ISS-24**, the defect the large-dataset stress test found; server only — **no route, permission, schema, dependency, session or mobile change, and no model or provider change**): the owner asked for the assistant to be tested *"under more demanding, real-world conditions"*, so a synthetic tenant was seeded (`npm run seed:perf` — isolated, labelled, disposable, refuses production and the test database, requires `SEED_CONFIRM`) and every tool was timed against it with **zero model calls** (`npm run perf:measure`), because provider quota is the scarce resource (~50 free requests a day, §27BF). Measured at **100 / 1 000 / 10 000 products**, **seven of nine tools grew ~8–9× for 10× the data** — `getInventory` 122 → 659 → **5 665 ms**, `getInventoryHistory` 119 → 605 → **5 520**, `getProductsByLocation` 99 → 408 → **3 555**, and the stock/dashboard family 86–133 → 253–284 → **1 983–2 281** — while `searchProducts` and `getProduct` stayed flat at ~210 ms; **payloads stayed flat** at 3.8–7.4 k characters, so paging was never the problem. `explain('executionStats')` gave the mechanism exactly: each slow pipeline ran a `$lookup` **once per tenant row** *before* the page window — 20 105 rows twice for the inventory page (3.1 s + 3.2 s), 19 944 twice for history (3.0 s + 2.8 s), 10 000 for the availability family (2.0–2.2 s) — each an **index** lookup at ~0.15 ms whose **count** was the cost, because `$skip`/`$limit` sat at the bottom inside a `$facet` and a facet cannot run without everything above it: a 15–25 row page paid for the whole partition, and **no index can fix a fan-out of one query per row**. Fixed in three shapes: the page window moved **above** the joins wherever nothing between them filters (`transactions.list`, `inventory.listRows` — the latter gaining the model's `{businessId, updatedAt:-1, _id:-1}` index so the order is index-provided, both counting with a separate `$count` over the same `$match`), and wherever a stock predicate genuinely needs the join it was **turned around**: one grouped `$unionWith` pass over inventory merged by key with a single `$group` (`$max` ignores missing values, so each accumulator takes the side that carries it, and every filter/sort/`$regex` stays inside MongoDB), plus the dashboard's four counts computed from one grouped inventory read and a projection-only catalogue read instead of 10 000 joins. **9 of 9 tools are now ≤ 650 ms at 10 000 products** (getInventory **75**, history **68**, byLocation 258, out 259, low 265, reorder 268, search 214, getProduct 212, summary 413) — the seven slow ones together, **23.4 s → 1.6 s**. Proven **output-identical rather than merely faster**: `npm run perf:golden` captures the full payload, hash and total of **17** tool/argument combinations — including the ones that change which pipeline branch runs — and **all 17 matched byte-for-byte before and after**; the suite stayed **1353 tests / 192 suites / 0 failures**, with `tsc`/`eslint`/both module-graph checks clean. A real stress run over HTTP (`npm run perf:turns` — a session minted the way login mints one, so no credential lives in a script) answered **2 of 3** turns **grounded and numerically exact** (1 492 restock items; 64 units across 3 locations) at **34.9 s / 31.1 s**, and the third returned **504 AI_TIMEOUT at 60.3 s** — provider latency, not query time: at this scale the **free-tier model, not the database, is the bottleneck** (0.3–0.4 s of queries against 30–60 s of model time), which is the measured cost of the owner's *"stay on the free tier"* decision. **NOT device-verified, and NOT measured above 10 000 products** — the merged tools still scan the partition by construction (0.26–0.65 s at 10 k), so a ≥50 k measurement is the recorded next step; the new index builds on the next server boot (`autoIndex`, the same route the Phase 20G/20H indexes took), and `npm run cleanup:perf` removes the seeded tenant. **DEVICE-VERIFIED 2026-10-13 (§27BG)** on the OPPO CPH1969 over the USB tunnels with scrcpy mirroring, against the 10 000-product tenant: the dashboard on the phone showed **8 508 / 620 / 1 492 / 10 000** — every figure equal to the golden ground truth — **three** of four real turns returned **201** at **40.2 / 34.8 / 12.2 s** (tools `getLowStockProducts`, `getInventoryHistory`, `getProduct`; every answer **grounded and numerically exact**, including *64 units across three locations*) and the fourth returned **504 AI_TIMEOUT at 60.5 s**, rendering the AI-1 copy with *"Cannot reach the server"* absent. The comparison to the earlier device runs (6.2–19.4 s at dozens of products) is the point: **the tools are 0.07–0.3 s of each turn and the free-tier model is the rest**, so at this scale the provider — not the database — bounds the assistant, exactly as the HTTP measurement said. Two new findings: **ISS-25** (Markdown *tables* render literally — AI-2's strip never covered them, and a 20-row list is when a model reaches for one) and a **self-contradictory seeded ledger** (every movement was written as an increase regardless of type, so 6 615 of 6 616 STOCK_OUT rows claimed stock went up and the assistant reported them faithfully) — **fixed in `seed:perf` and proven consistent on a re-seeded tenant (0 inconsistent rows)**. Roadmap §27BG.
AI-4 — The Assistant's Answer, Rendered (fixes **ISS-25**, and the defect the owner's three screenshots showed; **mobile only** — no server file, no route, no permission, no schema, no dependency, and **no prompt change**, so the request path and the token cost per turn are untouched by construction): the owner asked for answers that are *presentable, organized and easier to read* and set the constraints — no new dependency, no expensive API calls, no noticeable latency, no unnecessary tokens, no loss of accuracy. The scoping measurement came first, and it decided the design: a census of **every stored assistant answer** found **3 tables, 2 headings, 4 bullet lists, 0 numbered steps**, so the model already writes the structures; nothing needed to be asked of it, and **a formatting instruction in the system prompt was rejected as a permanent per-turn token cost for a benefit rendering already delivers** (recorded as a rejected option, not an oversight). AI-2's approach could not be extended, and this is the whole reason ISS-25 existed: in `| Product | SKU |` the **pipes carry the row/column relationship**, so stripping them destroys the structure and keeping them (what shipped) puts punctuation on the screen — a table has to be **rendered**. `stripMarkdown` was **moved** to `mobile/lib/assistantMarkdown.ts` — the AI-2 suite's import address changed and **not one assertion did** — and given a precise residual role: applied to every span the parser does not model, so a marker nobody taught it about still cannot reach the screen, while the two AI-2 invariants (a single underscore is never emphasis, because `SKU_123_AB` and `MIN_STOCK_LEVEL` are data; `12 * 3 = 36` stays arithmetic) are preserved and re-pinned **through the renderer**. Two presentation calls are stated so they can be rejected: **a wide table becomes one card per row, not a grid** (the observed answers have five and seven columns, and in a ~400 px bubble a seven-column grid leaves each column under 60 px — which is exactly what made the screenshot unreadable — so at ≤ 3 columns a grid is rendered and above it the row's own name becomes a card title with its remaining columns as label/value lines, the threshold being one named constant), and **bold is rendered as bold rather than deleted**, because the owner asked for important information to be highlighted and styling a parsed run is free. **A real defect was found on the way, in shipped code:** `stripMarkdown` had **no word boundary at all**, so it silently rewrote `4*5*6` as `456` and `A*B*C` as `ABC` — a shortened multiplication still reads as an answer, which is the worst class of bug in an assistant that reports quantities, and AI-2's own reasoning ("would silently corrupt the very data the assistant exists to report") always implied the fix; a marker must now **stand apart from a word** to count as markup, in the parser **and** the residual pass so the two agree, which means ambiguous markup is treated as **data** (visible markers are ugly, a wrong number is wrong). Cost was **measured, not argued**: on the largest real stored answer (1 494 chars) `stripMarkdown` cost **0.0075 ms** and `parseAssistantMarkdown` costs **0.1552 ms** — **+0.148 ms** of added CPU work per answer against turns of **12 236–40 226 ms** on the device (~0.001 % of the answer's latency), incurred once per rendered bubble because the parse is memoised on the answer and the component is `memo`ised; scaling was checked for the failure mode that matters (**10 → 160 synthetic rows / 1 189 → 18 639 chars is 0.114 → 1.666 ms, i.e. 16× the data for 14.6× the time — linear**), with a deliberately enormous absolute bound left in the suite as a permanent guard; the one number that went **up** is view count and it is recorded rather than glossed — a table answer renders **355** nodes instead of 1 `<Text>` (a one-line answer renders 3), ordinary for a React Native screen and bounded by `FlatList` virtualisation plus `memo`. Verification: **29 new cases** in `mobile/__tests__/ai4-assistant-answer-render.test.tsx` (the AI-2 suite's 13 cases are re-pointed at the new module with **no assertion changed**), written first and watched fail on a missing module, pinning the parser's structure, the renderer's output, both AI-2 invariants through the new path, both directions of the boundary rule, and as **one property over six realistic inputs including both real answers** that no `|`, `**`, `__` or `---` can reach the screen by any path; the guard was **proven able to fail three times** — wide tables back to a grid → the card assertion, the `---` separator no longer consumed → **8 failures** including both no-markup properties, the boundary removed again → the two arithmetic cases — with the tree then restored **byte-identical**, and **one mutation that appeared to pass in silence was a `sed` whose escaping did not match** (a no-op mutation, not a blind guard), re-run with an assertion that the edit landed and failing exactly as intended, because a mutation that cannot apply is not evidence; `tsc` also earned its keep by catching a genuine **type-design error the tests could not** — a table row is a list of *cell*s and `rows` was one array dimension short — fixed by naming the levels (`Cell`, `Row`) rather than by loosening an assertion. Suite **55 suites / 731 tests / 0 failures** (up from 54 / 701), `tsc`/`eslint` clean, and **the prompt's rule text is byte-identical to HEAD** with `mobile/package.json` unmodified, which is the proof that no token or latency was spent. **NOT device-verified** — the rendering runs through React Native's own component tree with the real stored answers, but nobody has looked at it on the OPPO, and "does it read well" is a judgement only a screen can settle; a wrapped `|---|` separator row is handled **by construction, not by observation**; and `stripMarkdown`'s `**` rule was deliberately left as it was (a hypothetical `4**5**6` would still be shortened), recorded rather than fixed. *(Annotated 2026-10-14: **the rendering is now device-verified — §27BS** — and to a stronger standard than "does it read well": two stored answers were read on the phone, one of them a **4-column, 5-row table** rendered as **one card per row** with the header row not drawn as a row, no marker anywhere on screen, and every value drawn — the one-character `0` measured on all five cards by pixel bounding box. The call this entry made, **cards rather than a cramped grid above three columns**, is therefore observed on hardware rather than argued. What stays open: the ≤ 3-column **grid** path has still never been seen on a phone, and only the owner can say whether it reads well.)* Roadmap §27BH.

AI-5 — The Turn's Own Cost (the gap AI-1 and AI-2 left open; server only, **no behaviour change**): AI-1 bounded a turn with one wall-clock deadline and AI-2 made a **degraded** turn visible, but a turn that **succeeded** recorded **nothing about itself** — the service could emit exactly two things, a provider failure and the degraded warning — so "why did that answer take 21 seconds" could only be answered by re-running a probe against a seeded tenant, which spends provider quota (the deployed free tier allows roughly **50 requests a day in total**, §27BF) and only ever describes a controlled run. Now **one line per turn on every exit**, including the paths that throw (which is why a failed turn states what it spent before it died): `[ai] turn outcome=ok total=12598ms providerMs=11973ms calls=3 toolMs=625ms toolRuns=1 tools=getInventorySummary empty=1 in=3399 out=499 model=… iterations=3`, where `grep -c '[ai] turn'` is the turn count, `outcome=` (`ok`, `degraded`, `AI_TIMEOUT`, `AI_ABANDONED`, `AI_UNAVAILABLE`, `AI_NOT_CONFIGURED`, `ERROR`) uses the **same vocabulary as the error codes the controller returns** so a log line and an HTTP answer name the same thing, and the body is the split. **Two real turns** against the 10 000-product tenant (201, grounded, every fact correct) measured **95–97 % provider time against 3–5 % tools** — `20 128 / 20 820 ms` and `11 973 / 12 598 ms`, with `getInventorySummary` at 0.63–0.69 s against AI-3's isolated 0.41 s — so the model, not the database, is what a member waits for, **read per turn rather than inferred**. Both turns took **3 model calls for 1 tool run**, i.e. one response carried neither text nor a tool call and was rescued by AI-2's retry inside a turn that still reported `ok`; that was only *implied* by `calls=3` beside `toolRuns=1`, so **`empty=` was added** (defined as responses **seen**, not retries authorised, matching AI-2's warning line), which makes the free tier's empty-completion rate countable across **healthy** turns too — the evidence the deferred provider decision (**ISS-22**) is waiting on. **A defect in this increment, caught by its own test:** the first draft reported from the `catch` and counted in the `finally`, so a call that **timed out** was reported as costing **zero calls** (`'0' !== '1'`); both timing sites now count **before** reporting, which is the case for asserting numbers rather than a line's shape (a shape check passes on a line of zeroes and diagnoses nothing). Verification: **8 cases** in `server/test/AI5-ai-turn-cost.test.mjs`, written first and watched fail, pinning one line per healthy turn that stays one line, the request and tool-round counts and names, **provider time measured against a deliberate 40 ms provider delay** so a zero-filled line cannot pass, the split never exceeding the total, a dead turn reporting what it spent, an abandoned turn reporting **zero** spend rather than staying silent, the degraded turn keeping its AI-2 warning **beside** the cost line, the provider-failure path intact, and the recovered-retry case; the line is also read out of **real `POST /api/ai/chat` requests** in the AI-1 DB suite rather than only from in-process unit calls. Suite **1361 / 193 / 0**, `tsc`/`eslint` clean; `perf:turns` gained **`--only=<n>`** so re-checking one question no longer costs the other three. **NOT device-verified** — and the server the phone talks to was started before this change, so it needs a restart before the line appears there; two turns on one model is a reading, not a distribution. *(Annotated 2026-10-14: **the line has now been read off a real turn on the phone — §27BS.** After the server restart, a device turn on 2026-10-14 produced `outcome=ok total=17599ms providerMs=17510ms calls=2 toolMs=89ms toolRuns=1 tools=getOutOfStockProducts empty=0 in=3272 out=228` beside an HTTP `201` at 18 135 ms — **99.5 % provider time against 0.5 % tools**, the split this entry measured over HTTP now confirmed on a member's own turn, and a `calls=2 / empty=0` clean turn that contrasts usefully with the two `calls=3 / empty=1` turns earlier the same day. Still a small sample: three turns on one model is a reading, not a distribution.)* Roadmap §27BI.

Index integrity (IDX-1) — The Guards Proved an Index Was DECLARED and Nothing Could Tell Whether It Was BUILT (verification increment; `server/` only, **no production behaviour change**): five increments rest on a database index for their entire benefit — Phase 20G/20H (the list-sort keys), Phase 22/**AI-3** (the inventory page sort `{ businessId: 1, updatedAt: -1, _id: -1 }`, measured at **6.3 s per 25-row page** without it at 10 000 products) and the **TTL keys** on `sessions`, `password_reset_tokens` and `email_verification_challenges` (the only thing that actually **deletes** an expired row — AUTH-02 bounds a lifetime in code, but the collection grows without the key) — and **every one of those suites reads the model source**, so not one could fail if the database never built the index, while the mechanism that turns a declaration into an index (Mongoose's default `autoIndex`, background, at connect time) was asserted **nowhere**: `grep -rn "autoIndex\|syncIndexes\|createIndexes" src/ scripts/` returned nothing. **A real coverage gap, not a hypothetical one:** `grep -rln "updatedAt: -1" test/` matched **no test at all**, so deleting the single line `inventorySchema.index({ businessId: 1, updatedAt: -1, _id: -1 });` from `inventory.model.ts` left the entire suite green while the AI-3 page window silently stopped being index-provided. Now: **`npm run audit:indexes`** asks the DATABASE (read-only — it never creates, drops or modifies anything, and deliberately does **not** call `syncIndexes()`, which can **DROP** indexes it does not recognise, including one an operator added on purpose to a shared database; exit code 1 on any disagreement so it can gate a deploy check; coverage by construction from the barrel's own `models` array), and **`server/test/phase-index-integrity.test.mjs`** (8 cases, registered PURE_DB) asserts every declared index exists **with the declared field ORDER**, uniqueness, sparsity and TTL for **every** model, names the AI-3 key and the three TTL keys explicitly and asserts **both halves** (declared **and** present), guards the mechanism (no `autoIndex` disabling anywhere in `src/`, no override at the one `mongoose.connect` call site), and pins the comparison rule itself. **Order is the part that carries the meaning**: `{ a: 1, b: 1 }` and `{ b: 1, a: 1 }` are different indexes — a compound key only serves a query whose equality/sort keys are a **prefix** of its own layout — and this increment's **own first draft sorted the fields**, reporting `ok` for an index that cannot answer the query it was added for and printing the AI-3 key as `_id:-1,businessId:1,updatedAt:-1`; that false green is why both the tool and the suite now compare order-sensitively, with a test asserting they still do. **Measured, not assumed:** the dev database agrees exactly — **60 declared indexes across 15 collections, 0 disagreements, 0 undeclared**, including the AI-3 key in the declared order and the three TTL keys (`expiresAt:1`, `ttl 0s`). **The guard was watched failing, twice, with the tree restored byte-identical both times:** deleting the AI-3 declaration reddened exactly that one case ("`no longer DECLARES the page-sort index businessId:1,updatedAt:-1,_id:-1`") and nothing else; `autoIndex: false` at the connect site reddened exactly the two mechanism cases; both mutations were confirmed to have **applied** before the run, because a mutation that cannot apply is not evidence. Suite **1369 / 195 / 0** (up from 1361 / 193), `tsc`/`eslint` clean — `eslint` caught a useless assignment in the tool's collection read. **Honest limit, stated rather than left to be discovered:** `Model.init()` is awaited before comparing (which makes a fresh CI database deterministic rather than racing a background build) and that is also a **repair** — `init()` **creates** a missing index — so on a long-lived database a leftover from an earlier boot can satisfy the existence check; the suite proves the mechanism **produces** the declared indexes (it fails on a fresh database with the build path disabled, and on a unique/sparse/TTL disagreement MongoDB refuses to reconcile), **not** that nobody dropped one yesterday. **NOT verified:** the **production** database has not been audited (read-only, but production credentials are not in this environment and nothing here touches production — running it once per deployed environment is the follow-up), TTL semantics are asserted as declarations-and-keys rather than observed deletions, and the audit is a **manual** tool rather than a CI step (CI's `mongo:7` container is a fresh database, so auditing it would test index **creation**, which the suite already covers, rather than drift against a database anyone uses). Roadmap §27BJ.

AI-6 — The Assistant's Limit, Named (the follow-up ISS-22's own re-measurement asked for; server + mobile, **no new dependency, no model or provider change, no route, permission, schema, session or prompt change**): §27BF measured the **dominant** failure at the free tier as a `429 free-models-per-day` **quota** answer, and until now every non-2xx from the gateway collapsed into one class — `AiProviderError` → `502 AI_UNAVAILABLE` → the app's *"The AI service is temporarily unavailable. Please try again in a moment."* That sentence was wrong **twice** for a spent allowance: nothing upstream was unavailable, and a moment's wait cannot refill a daily quota, so it prescribed an action that could never work and sent the member round the same loop. Now a `429` — and its `402 insufficient credits` sibling, which the pre-existing OpenRouter suite already listed beside it — is **`429 AI_QUOTA_EXCEEDED`** with its **own sentence** (*"The assistant has reached its usage limit for now. Please try again later."*), raised from exactly **one** place (`providers/http.ts`); **every other non-2xx, every 5xx included, keeps `502 AI_UNAVAILABLE`**, because a 5xx really is an outage and softening it into a limit would tell a member to wait for something that is broken. The class is **deliberately not an `AiProviderError` subclass** — the same choice `AiTimeout` made — so no later reordering of the controller's `instanceof` checks can silently re-report a limit as an outage; it is in **`isAiError`**, so the loop's catch passes it through untouched and AI-5's cost line reports **`outcome=AI_QUOTA_EXCEEDED`** (the log line and the HTTP answer name the same thing), and it is **never retried**, because a limit is not more retryable than a failure (AI-2's rule: a refusal is never answered by paying for it twice while the cause is hidden). **The two 429s are kept apart** at the boundary — the route's own `AI_RATE_LIMITED` clears in seconds, the allowance does not — pinned over the real route. The client's branch is checked with the other codes and therefore **before** the network fallback, the ordering rule AI-1 established. **Two options were considered and rejected, recorded rather than omitted:** plumbing the upstream `Retry-After` into the copy (a quota resets on a *schedule*, not after N seconds, and the two upstream shapes arrive as the same status, so a formatted duration would be a number the server cannot stand behind — a wrong duration is worse than none) and a second code to separate rate from quota (it would require trusting upstream body prose, which this layer only ever prefixes for a log line). **Verification:** server **1383 tests / 198 suites / 0 failures** and mobile **57 suites / 759 tests / 0 failures**, `tsc`/`eslint`/both module-graph checks clean, `check-secrets` exit 0 (22 controls, 433 files); a **mutation pass with every mutation detected** — the http classification emptied → **3** unit failures, the controller mapping removed → **3** DB failures, `isAiError` without the new class → **3** unit failures, the mobile copy removed → **4** mobile failures — tree restored **byte-identical**. **One pre-existing test was updated and is declared:** `server/test/phase-openrouter-provider.test.mjs` asserted that 429 and 402 were provider failures, which is precisely the behaviour this increment corrects, so its one loop was **split, not weakened** — the remaining three statuses keep their assertions and gained a new negative one (`!(err instanceof AiQuotaExceeded)`), a new case asserts the limit class with its code, and the key-leak check runs in both (5 statuses under 1 assertion class became 5 under 2; the protected `server/test/phase06-ai-wire.test.mjs` was **not touched** and never sent a 429 or a 402). **Recorded honestly:** the tests were written alongside the implementation, so "can this fail" rests on the mutation pass rather than on watching red first; the first full-suite run exited **1 with 4 failures** — one the real contract above, three the **known Atlas `MongoDB connection lost` transient** (65 occurrences in that log; that suite then re-ran **11/11**, which is what distinguishes an environment drop from a regression); and two bugs were found in this increment's **own test code** by running it (`AI_RATE_LIMIT_MAX='0'` does not limit anything, because config's `positiveInt` treats a non-positive value as unset and falls back to 20). **NOT device-verified — nobody has seen the new sentence on the phone**, and this names the failure rather than fixing the free tier. Roadmap §27BL.

AI-7 and AI-8 backfilled (2026-10-15; both shipped on 2026-10-14/15 and are recorded in full in the roadmap — this list had simply not been extended for them). **AI-7 (roadmap §27BU)** fixed a defect §27BT had named and deliberately not fixed: a continued conversation never rose in the list and its displayed time never advanced, because `AIConversation` carries `timestamps: true`, `listConversations` sorts on `{ updatedAt: -1, _id: -1 }`, the mobile row renders `formatDateTime(item.updatedAt)` — and **no write path touched a conversation when a message was added**, so `updatedAt` was frozen at creation and "newest first" was in practice "newest *created* first". The fix is **one write on the success path only** in `server/src/controllers/ai.controller.ts`, immediately after the turn is durable and before the response, so a turn that times out or is abandoned cannot make a conversation look busy (a failed turn persists nothing at all). 4 DB cases, the ★ one watched failing first against the reverted three lines, and **DEVICE-MEASURED 2026-10-14**: continuing the oldest conversation and returning to the list put it **first** at **16:22 → 18:11**, then **17:02 → 18:17** above it. **AI-8 (roadmap §27BV)** fixed **ISS-29**: an answer cut off by `AI_MAX_OUTPUT_TOKENS` was stored and served as a complete one, because the existing `max_tokens` guard fired only when the response carried **no text** — so a truncation carrying text was invisible at every layer. The cap is now **reported by both provider wires** (`stop_reason === 'max_tokens'`, `finishReason === 'MAX_TOKENS'`) instead of only being tested for whether to throw; the partial answer is **kept** and the turn marked `OUTPUT_LIMIT`, a third `DegradedReason` deliberately **not** in the canned-sentence table because replacing a partial answer would throw away the useful half; the mark is persisted on the message and returned on reload, and the sentence lives on the client beside the answer it qualifies. 9 server + 6 mobile cases, each written first and watched failing, both halves proved able to fail by mutation with the files restored **byte-identically**; **DEVICE-VERIFIED 2026-10-15** with a temporary 40-token cap (`out=40`, `[ai] degraded turn reason=OUTPUT_LIMIT`, the note drawn on the phone and still there after reopening the thread), the cap then **DECIDED to stay at 800** (§27BY) because both turns that reached it had already spent **48.6 s and 57.4 s of the 60 s turn budget**, so raising it would convert a marked partial answer into a `504 AI_TIMEOUT` with no answer at all.

AI-9 — The Turn That Can Be Stopped, and a Stop That Is Not a Failure (mobile only; **no server, route, permission, schema, dependency, prompt or token-cost change**, and no model or provider change): the device runs measured real turns at **6–40 s** with one `504` at the 60 s deadline, and until now the member had **no way to end that wait** — the Send button sat behind `loading` with an emptied input, so it was disabled for exactly as long as it was needed, and the only exits (leaving the screen, killing the app) are aborts the app neither made nor could describe. The server has been ready for this since **AI-1 Task 5**, which cancels a turn whose caller went away (`499 AI_ABANDONED`, logged with `outcome=AI_ABANDONED` and zero spend) rather than running it to its deadline; what was missing was a **decision** the client could make on the member's behalf. The whole increment is therefore one distinction: a caller's abort and the client's own timeout arrive at `fetch` as the **same `AbortError`** — both abort the same controller — so **`REQUEST_CANCELLED`** now separates them by asking *whose* abort fired (`mobile/lib/client.ts` forwards a caller `signal` into that one controller instead of replacing or racing it, and reads it back at the failure site), and the screen routes that one code **away from the error banner entirely**: a stop produces no sentence about slowness and none about the network — the two wrong answers this class of bug produces, the second being the `status === 0` trap AI-1 already fixed once, which is why `sendErrorMessage` also refuses it now. The Stop **replaces Send** while a turn is in flight (the composer was disabled anyway), a stopped turn leaves an honest note under the question rather than an error, and that note deliberately promises only what is true in **both** cases — a turn the model had already finished is stored either way, so it says the answer will be there when the chat is reopened rather than claiming nothing was saved. It also makes **AI-1's abandoned-turn path reachable on demand for the first time**: two device attempts to produce `499 AI_ABANDONED` were inconclusive because abandonment could not be provoked from the UI, and a Stop button is exactly that provocation — recorded as the device item this unblocks, **not** as measured. 9 cases in `mobile/__tests__/ai9-assistant-stop.test.tsx` (5 screen, 4 transport/unit, including the negative control that a real `NETWORK_TIMEOUT` still reads as a slow assistant); proven able to fail **twice by mutation** — removing the screen's cancel branch reddens the two starred screen cases, removing the transport's "whose abort" check reddens the two cancellation cases — with both files restored **byte-identical** (sha256 verified) and each mutation asserted to have landed before the run. Mobile **64 suites / 848 tests / 0 failures** (up from 63 / 839), `tsc --noEmit` and `eslint .` clean. **NOT device-verified:** no phone is attached to this host today, so neither the Stop affordance nor the server-side `499` has been observed on hardware, and the claim that a React Native abort closes the socket the server watches is stated as **mechanism** (covered by AI-1's own suite) rather than measured. Roadmap §27CF. *(Annotated 2026-10-17: **device-verified — §27CM**, on a fresh `development`-profile EAS build of this branch served by Metro over USB. A held stub response (`slow:25000`) produced the thinking row, the slot reading **Stop**, and then: `[ai:openrouter] caller went away; the upstream call was cancelled`, `[ai] turn outcome=AI_ABANDONED … calls=1`, no `201`, and the note rendered verbatim with **no error banner** and Send restored — while the stub itself logged `caller had already gone away; nothing sent` 12.2 s before its held answer would have been produced, so the abort closed the **upstream** connection rather than only the screen. **One prediction was wrong and is corrected:** §27CF expected `calls=0`; the measurement is `calls=1`, because the stop landed inside an in-flight provider call — the case that section listed as unobserved — so a stop saves the remainder of a turn, bounded rather than eliminated, exactly as its own Limits said. Still unprovoked: the *"the model had already finished"* half of the note's storage promise. The phone now carries a development build, so it needs Metro on this machine to open the app.)*

DEP-1 — The Deployment That Was Legal, Silent and Unusable, and What It Is Missing (server + mobile + CI; **no route, permission, schema, session, JWT, dependency or environment change, and no request refused or accepted that was not before**): the question was whether this app could take another **test-production deployment**, and every signal this project publishes said yes — measured on the deployed Render service on **2026-10-15**, `GET /api/health/live` **200** (0.248 s), `GET /api/health` **200** `{"status":"ok","db":"connected"}` (0.147 s), CI green, and the production configuration validator — which does refuse to boot on a missing `MONGODB_URI`, a short `JWT_SECRET` or a half-configured Firebase service account — silent. And **not one new member could register**: `POST /api/auth/forgot-password` answered **`503 MAIL_NOT_CONFIGURED`** (0.194 s) because `MAIL_PROVIDER` is unset on that host, so `isMailConfigured()` is false — which means the **AUTH-04 registration gate cannot work either**, since `services/emailVerification/request.ts` asks the **same predicate** one step later (after token verification, before any challenge is touched) and answers `503 EMAIL_VERIFICATION_NOT_CONFIGURED`; and because a member verifies **before** any `User`, `Business`, JWT or session exists, a server that cannot send mail **cannot onboard anybody while serving every existing member perfectly**. Firebase, by contrast, **is** configured there — a deliberately garbage ID token comes back `400 FIREBASE_TOKEN_INVALID` through the Admin SDK and `401 FIREBASE_TOKEN_INVALID` at the exchange, i.e. verified and rejected. The mobile half is the same shape one layer out: `eas env:list` says **`No variables found for this environment.` for `production`** while `preview` and `development` each carry nine, so a `--profile production` build inlines `''` for every Firebase value — and **nothing fails**, because `lib/auth.tsx` takes the branch that kept unconfigured builds usable before Firebase existed and registers the member through the **legacy password endpoint**, so a green build, a working sign-in and an account whose flow was never the one under test; and with no `GOOGLE_SERVICES_JSON` the same build fails **harder**, because `app.config.js` falls back to a project-root path that does not exist on a build runner. Two halves, one defect class: **legal, silent, crippling** — a state validation owns nothing about, because a *supported* integration that cannot work is not a missing required variable. Shipped: **`server/src/config/deploymentReadiness.ts`** — one greppable boot line (`[config] integrations mail=off firebase=on emailVerification=off ai=on(openrouter)`, naming states and never values), **a warning for each legal-but-unusable state** (the two above, each naming the variables to set and the two `503` codes a caller already gets), read from the **real predicates** so the line cannot disagree with the behaviour it describes, and deliberately **a warning and never a failure** — refusing to boot over an optional integration would turn a degraded feature into a dead deployment on its next restart, so a production boot with a note outstanding is asserted to **still boot and still listen**; plus a **build identity on the existing `GET /api/health`** (`commit` + `uptimeSeconds`) because *"is the deployed build the one I merged?"* had no answer from outside the hosting dashboard and this project has already paid for a stale-build assumption, with the host's value treated as untrusted (**7–40 hex characters or `unknown`**, never a typo or a URL) and the surface kept narrow (`/ready` stays a gate, `/live` stays dependency-free, and the integration state is **not** published — it is already observable by the callers it affects). And **`mobile/scripts/check-build-env.mjs`** (`npm run check:build-env`), a read-only guard whose rules are **read from the sources**: the `process.env.EXPO_PUBLIC_*` names come from a scan and must each be documented in `.env.example`, the two **build-runner file variables** come from `app.config.js` itself, a **release** profile (derived — `developmentClient` is what makes one a development profile) must name a public **https** backend with loopback, `10.0.2.2`, LAN and `.local` refused **by host**, Firebase is checked **all-or-nothing** like `isFirebaseConfigured()`, and nothing server-owned or build-runner-input may carry an `EXPO_PUBLIC_` prefix (decided from the **name**, so it needs no value). Offline it is the repository gate CI runs; **`--live`** asks the EAS CLI what a profile's environment actually supplies and requires the union of `eas.json` and the store — reading **names only**, so no value is ever printed or compared — and the real project reproduces the finding: **`--profile production --live` exits 1** naming the four `EXPO_PUBLIC_FIREBASE_*` values and the two Google files, while `development`, `ios-simulator` and `preview` pass, and the offline run exits **0** saying *"repository rules only"*. Verification: the guard's **17 controls run on every invocation** and **failed twice on the first run** — catching a real hole in its own rules (a server-owned name found in the *sources* was reported only as undocumented) and a control that was wrong rather than the rule, with one case corrected after a mutation that injected both names into both lists produced four findings where the case expected two; `server/test/DEP-1-deployment-readiness.test.mjs` is **21 cases**, registered in `run-tests.mjs`'s `PURE_UNIT` list, driving the **real predicates through a controlled environment** and pinning the line's exact text and single-line shape, both warnings, **six** shapes that must produce **no** warning, that **no sentinel secret reaches the line or either warning** (with a positive control proving each sentinel really was set, so "absent" cannot pass vacuously), the commit precedence and shape rule (including a plausible injection string), that `/ready` and `/live` grew no field, and that the line and its warnings are emitted **before** the database is touched; server unit mode **812 tests / 185 suites — 775 pass / 0 fail / 37 skipped** (from 790 / 180), mobile **64 suites / 848 tests / 0 failures**, `tsc`/`eslint` clean both sides. **Limits, stated:** the server change makes the state **legible, not fixed** — a boot line cannot set `MAIL_PROVIDER`, so **both blockers remain owner configuration** (the mail variables on Render, and the six EAS variables in the `production` environment) and registration on a production build still cannot complete until they are set; the AUTH-04 half of the production finding is an **inference from the shared predicate**, because the verification-code request was probed with a token rejected *before* that gate; `--live` needs a signed-in EAS CLI, so it is a manual pre-build step and not a CI gate; the build identity is only as good as the host's variable and cannot detect a deploy that claims the right commit while serving an older image; and neither warning knows about a state nobody has thought of yet. **No code change sets a secret, and none of this is device-verified — no phone is attached to this host.** Roadmap §27CH.

DEP-2 — The First Request of Every Session Was Aborted Before the Server Could Answer It, and the App Blamed the Network (mobile only — **no server file, route, permission, schema, session, JWT, dependency, environment, EAS or Render change, and no request refused or accepted that was not before**): the owner's device report (*"an error that said something like 'Cannot connect to the server'"*) resolved into **three defects**, two of which reach real members. **(1) The 15 s budget against a ~32 s host.** Measured on the deployed free-tier instance on 2026-10-16: first byte at **32 369 ms** (TCP 52 ms, TLS 87 ms — the host is the wait) and **32 440 ms** in an earlier reading, against **194 ms** warm, so the **first request of every session was aborted before the server could possibly answer it** — reproduced deterministically against a stub with that profile, whose log carries the client's decision: `CLIENT-GONE POST /api/auth/login after=14989ms`. **(2) The abort was reported as an outage.** The classification inferred the cause from the rejection's **shape** (`err.name === 'AbortError'`), and React Native's aborted request rejects as `TypeError: Network request failed`, so the phone printed *"Cannot reach the server. Check your connection and try again."* for a server that was merely slow — **the sentence the owner saw, and a falsification of AI-1's own record** ("the app says *timed out*, never *cannot reach the server*"): AI-1 fixed that copy on the assistant screen and left the transport guessing. **(3) A dev build pointed at loopback is a phone talking to itself.** `mobile/.env` names a loopback address, so a Metro-driven dev run on a physical phone calls the phone; proved by a sign-in arriving at a stand-in backend on the laptop (`host=localhost:4000`, `cl=88`, `ct=application/json`, `ua=okhttp/4.12.0` — credentials in the **body**, never the query), and reproduced by removing the tunnel and reading the identical sentence off the screen. Shipped, all client-side: **`COLD_START_TIMEOUT_MS` (60 s)** and **`SERVER_WARM_WINDOW_MS` (5 min, deliberately below Render's 15-minute sleep threshold — at or above it the client would call a sleeping server awake)**, with the measurement each is derived from written beside it; **`requestBudget()`** gives 15 s once the server answered anything within the window and the cold allowance otherwise, so an answer of any kind — refusals included — ends the allowance, while an explicit `timeoutMs` bypasses the rule in both states (the assistant is untouched); **the timeout is classified by construction** (the controller records *whose* abort fired before aborting; `isAbortError` survives only as the fallback for an abort this client did not start, and AI-9's caller-cancellation branch still wins); and **`unreachableMessage(baseUrl, isDev)`** keeps production copy byte-identical while a **development** build pointed at loopback appends the URL it is calling and both ways out (`10.0.2.2` is deliberately *not* treated as a mistake — it is correct for an emulator). Verification: **`mobile/__tests__/dep2-client-connectivity.test.ts`, 15 cases, written first and watched fail (11 failed / 4 passed)**, AI-1's budget case **re-specified rather than weakened** (it now proves the server awake before asserting 15 s, and DEP-2's suite asserts both states), **mobile 65 suites / 863 tests / 0 failures** (from 64 / 848), `tsc` clean, `eslint` **zero warnings**, `check:build-env` offline green; **on the phone all three fixes were observed** — a 32 s cold backend was **waited out (32 001 ms, no abort)** and the server's own refusal rendered, a backend that stopped answering produced the **truthful "The request timed out…"** at **14 995 ms** with the warm budget back at 15 s, and the tunnel-down dev build rendered the note; and **end-to-end against production while cold** (37 minutes idle): spinner at t+6 s and t+20 s, the server's real answer at **t+34 s**, with `GET /api/health` reporting `uptimeSeconds: 58` a minute later — the app's own request booted the instance. By-product: the deployed host now answers `forgot-password` **202**, so **mail is configured there and DEP-1's `503 MAIL_NOT_CONFIGURED` no longer reproduces**. Limits: the cold start is **survived, not shortened** (the owner's accepted V1 decision), the allowance is a **client-side estimate** — a host slow for another reason is waited on up to 60 s — the numbers are **pinned from measurements rather than tuned from traffic**, no keep-alive/scheduler was added, and two false starts from **stale tap coordinates** are recorded because an automation harness with stale coordinates reports whatever the screen happened to be. Roadmap §27CI.

Dependency advisories — The Fixed Version That Is Not a Fix, and the One the Updater Said It Could Not Reach (mobile `package.json` + `package-lock.json` only; **no source file, route, permission, model, session, environment or application behaviour change**, no declared range edited, and exactly one transitive package changed): of the five open Dependabot advisories — all transitive build/tooling dependencies of the mobile package — **`uuid` is closed**, because the checklist's *"a fix the graph cannot reach"* was true of Dependabot's updater (which rewrites a **declared range**, and `xcode@3.0.1` declares `^7.0.3` for a package patched at 11) and false of npm, where an `overrides` entry replaces the resolution: `uuid: ^11.1.1` now sits beside the existing `@grpc/grpc-js` override, its **only** consumer is `xcode` (`require('uuid')` once, `uuid.v4()` once, no `buf` — so the advisory's own trigger, a missing bounds check in v3/v5/v6 **with a `buf`**, was never reachable here and the closure is hygiene rather than a security fix), and uuid 11 still ships the CJS build that call resolves. **`decode-uri-component`'s published fix cannot be used, and applying it breaks the app** — 0.5.0 is **ESM-only** while `query-string@7.1.3` is CJS and calls the export directly, so `require()` returns `{__esModule, default}` and the affected path, the app's own **deep-link query parsing** in expo-router, dies with **`TypeError: decodeComponent is not a function`** (measured with the override applied, and the reverted tree's `query-string.parse('?a=x%20y')` → `{"a":"x y"}` is the control) — and that path **is** inside the shipped bundles, measured from their source maps (Android 1 441 modules, iOS 1 317), while `node-forge`, `braces`, `micromatch`, `sprintf-js` and `xcode` are in neither — and query-string 8.x/9.x are ESM-only **too** while still declaring the vulnerable `^0.4.1`, so **no parent version exists that is both CJS-compatible and patched**. `sprintf-js`, `braces` and `node-forge` have **no published fix at all** (registry-read 2026-10-16: every `latest` is inside its own vulnerable range), and all three sit in build/test tooling no application code imports. Verified: mobile **65 suites / 863 tests / 0 failures**, `tsc`/`eslint` clean, `npm ci --dry-run` exit 0, an Android production bundle exports (one `.hbc`, 3 565 987 bytes), and the lockfile diff is exactly the uuid entry. **Limits:** no iOS prebuild ran (no macOS here, so the `xcode` path is verified at the API boundary and **not** by generating a `pbxproj` — a Phase 30B item); `npm audit` reports 60 vulnerabilities against Dependabot's five and the two are not reconciled here; four advisories stay open and are now recorded in `SECURITY.md` as known-and-open. Roadmap §27CJ.

AI-10 — The Answer the Model Could Not Fit, and the Harness That Hid the Fix (server + mobile; **no new dependency, no model or provider change, no route, permission, schema, session or environment change**, and the output cap itself — `AI_MAX_OUTPUT_TOKENS`, default 800 — is deliberately **untouched**, because raising it would make the failure rarer by making every answer more expensive, which is a provider decision still on the owner's desk as **ISS-22** and not a classification one): the Q4 defect §27BG recorded and deliberately did not fix — *"How many products are completely out of stock, and what percentage of the active catalogue is that?"* answered **`502 AI_UNAVAILABLE` twice, at 31 421 ms and 31 789 ms**, each after `getInventorySummary` had already run and answered — was wrong three ways at once: it **named the wrong component** (the gateway answered **2xx**; the model had spent its whole output budget with no text and no tool call), it **prescribed an action that cannot work** ("try again in a moment" re-spends the same budget, and the wire layer's own advice, *"try a shorter question"*, never reached the screen), and it **left no trace** (every sibling path in `providers/http.ts` logs before it throws; this shape is a 2xx, so it had no status line either, and a repo-wide search for the canned sentence found exactly one occurrence — its own assignment). Now **`AiOutputLimit` / `AI_OUTPUT_LIMIT`** — deliberately not an `AiProviderError`, for the same reason `AiTimeout`, `AiAbandoned` and `AiQuotaExceeded` are not: *"we gave up waiting"*, *"the caller left"*, *"an allowance is spent"* and *"the model ran out of room"* are four facts with four remedies and collapsing any into *"temporarily unavailable"* is the defect — thrown from `anthropicWire.ts`, **logged where the cap is known** (`[ai:openrouter] output limit reached with nothing usable (model=…, maxTokens=800, stop=max_tokens)`), mapped by the controller **before** the provider branch to **`502 AI_OUTPUT_LIMIT`** with *"The assistant ran out of room before it could answer. Please ask a shorter or more specific question."*, and given the client's **own copy** in `sendErrorMessage` rather than inheriting a server string. **The harness defect found on the way, and recorded because the symptom was indistinguishable from the defect:** the wire case drives the real provider against a localhost stub, and its first version failed with **`ECONNREFUSED` on the stub's own port** while the DB-free cases passed — because `node --test` runs a root-level `after()` registered before the file's first `await` as soon as that root's first child finishes, i.e. **before the second suite runs**, so the cleanup hook closed the stub; the hook that closes the app server sits after that await and never had the problem. The stub now closes in the last root hook. Verified: server **10 cases / 10 green** in full mode and **4/4** in `TEST_MODE=db` over the **real wire** with `hits === 1` as the **positive control** that the turn reached the stub, pinning that the limit is **never retried**, that `outcome=AI_OUTPUT_LIMIT` uses the same word as the code, and that AI-8's truncated-but-present answer still keeps its text; mobile **10 cases**, written first and **watched failing** (5 of 10 red with the client branch neutered), asserting the sentence by value, that it is not the outage/quota/timeout/rate-limit/unreachable sentence, that the **code wins over the server's message on the same object**, and reading `AI_OUTPUT_LIMIT` out of the **server's own source** so the client cannot be correct against a string the server never emits; `tsc`/`eslint`/both module-graph checks clean on both sides. **Limits:** **NOT device-verified** (the chain is proven over the wire and on the client, but nobody has seen this sentence on the OPPO against a live gateway); the failure is **named, not prevented** — a free-tier model that spends its cap without answering still cannot answer. Roadmap §27CK. *(Annotated 2026-10-17: **device-verified — §27CM.** On a phone running this branch's own bundle against a local stub replaying the captured Q4 body, one typed question produced the stub's `mode=maxtokens` request carrying that text, `[ai:openrouter] output limit reached with nothing usable (model=…, maxTokens=800, stop=max_tokens)`, `[ai] turn outcome=AI_OUTPUT_LIMIT` and `502` — and the screen showed the question and **"The assistant ran out of room before it could answer. Please ask a shorter or more specific question."**, with no error banner and no *"Cannot reach the server"*; the sentence itself is unchanged, so **no mobile file was touched by this annotation**. The same run found and fixed a second defect on this path: the turn's cost line reported `in=0 out=0 model=unknown` for the one turn that spends its whole budget, because the parser threw away a `usage` and a `model` it had already parsed — the failure now carries its accounting, the service adopts it before writing the line, an absent report is **omitted rather than zeroed**, and four new cases in the same suite pin it (written first and watched fail; the last runs over the **real wire**, not only a hand-thrown error). Server **1445 tests / 213 suites / 0 failures**, `tsc`/`eslint`/both module-graph checks clean. The stub is a socket and not the free tier, so the failure **rate** is still unmeasured and **ISS-22** remains the owner's decision.)*

AI-11 — The Assistant's Own Usage Report, and What the Allowance Actually Says (server tooling only: a new read-only `server/scripts/ai-usage.mjs` behind `npm run ai:usage`, plus its 6-case suite; **no application behaviour, route, permission, schema, session, dependency, environment, model or mobile change**, and **no model call at all**, so it spends none of the allowance it measures): the decision still open (**ISS-22** — does the assistant stay on the free tier) needed a kind of evidence nothing could supply, because every existing instrument **consumed what it measured** — `perf:turns` times real turns and spends quota, and the deployed free tier allows roughly **50 requests a day in total** (§27BF), while AI-5's per-turn cost line (`[ai] turn …`, written on every exit **including the ones that throw**) recorded what every real turn actually cost and **nothing read those lines back**. The tool joins two readings it can take for free: **the log** — turns, outcomes, provider **requests**, tool rounds, empty completions, tokens, the model, and the provider-versus-tools time split — and **the provider's own account**, `GET {OPENROUTER_BASE_URL}/v1/key`, which is a GET and therefore reads no model. **The reading, live 2026-10-17:** `is_free_tier: true`, `free_model_daily_requests {used: 37, limit: 50, remaining: 13}`, **paid usage 0** (day 0, month 0) and no credit limit configured — so §27BF's *"about 50 requests a day in total"* is now a **provider-confirmed figure rather than an inference**, and the day's consumption is countable from the same source. **Design decisions stated so they can be rejected:** a turn line cut short by a restart is **counted and reported `malformed` rather than dropped**, because dropping it understates usage — the one direction a quota report must not err in; **absent is never zeroed in either direction** (a missing field contributes nothing, a missing provider counter prints `null`), which is AI-10's own rule applied to the report; an **AI-2 degraded warning is not a second turn**, since counting it would inflate the count on exactly the turns that had trouble; the provider's masked `label` is **dropped rather than echoed** and nothing from the log is reprinted, because a log can contain a credential; and the **requests-per-turn ratio comes from the log it was given**, with that caveat printed in the report — a log of cheap turns overstates how many turns the remaining allowance buys (this log measured **1 request/turn** where real tool-using turns measured **2–3**). Verified: **14 controls** (7 must-fire, 7 must-not-fire) via `--self-test`, **proven able to fail twice by mutation** — making `malformed` unable to increment reddens the truncated-line and share controls, and defaulting an absent provider counter to `0` reddens the absent-not-zero control, each restored **byte-identical** (sha256) — plus a **6-case suite** (`PURE_UNIT`, driving the real CLI in a child process) pinning the arithmetic on a known log, **exit 2 on an unreadable log** (*"nothing was measured"*, never an empty report of zero turns), stdin support, and the leak control whose **run is asserted first so it cannot pass by crashing**; server **1451 tests / 214 suites / 0 failures**, `tsc`/`eslint` clean. **Limits:** it reads a log it is **given**, so on a deployment the log needs a sink (the provider counter is authoritative and needs none); the provider's day boundary is **UTC**; `perf:turns` remains the only instrument that measures latency end to end and still spends quota; and nothing here changes the provider, the model or the cap — **the owner's decision is still the owner's**. Roadmap §27CN. *(Annotated 2026-10-17: **the log-sink limit is narrowed by a second source, §27CO.** `AIMessage` had stored `model`, `toolsUsed`, `usage` and (since AI-8) `degraded` on every assistant turn all along — its own comment says why: *"the rate of each reason becomes countable from the database rather than only from a log file that rotation will eat"* — so `--db` reads production usage with **no new field, no migration, no log sink and no credential**, every figure computed inside MongoDB. The reading that matters is the first production-shaped reliability figure this project has had: **44 stored turns over 30 days, 14 of them degraded (11 `EMPTY_COMPLETION`, 3 `OUTPUT_LIMIT`)** — roughly a quarter of answered turns arriving only after AI-2's retry or with a caveat attached, which is the evidence **ISS-22** was waiting for and still not the decision. The halves are complements: a **failed** turn persists nothing (Phase 07E / M7), so timeouts, abandonment, output limits and quota refusals remain log-only, and `not-marked-degraded` is a lower bound because a pre-AI-8 message cannot carry the mark. Two more findings recorded there rather than fixed: 12 turns carry the model label `openrouter` (the parser's fallback when the wire names no model), and a **full-suite failure that was not this increment's** — `phase26a-session-lifecycle` case 10 re-read a session row it had just expired, racing the `sessions` TTL sweep, which a probe measured deleting such a row **21 789 ms** after the expiry. The fix was the order, not a weaker assertion, and the repaired case was proven **still able to fail** by removing the list query's expiry filter. Suite now **10 cases** (7 log-side, 3 database-side, the read-only claim pinned by a source scan with both controls), server **1455 tests / 215 suites / 0 failures**.)*

Deferred-upgrade watch — the open advisory is now watched, and the gate the watch says has opened (2026-10-16; `scripts/check-upgrade-watches.mjs` only — **no application behaviour, dependency, route, permission, schema, session or environment change**, no alert dismissed, no upgrade started): §27CJ left `decode-uri-component` open for a measured reason and left the monitoring as prose (*"re-read the alert list afterwards"*), which is a thing someone has to remember; it is now the **fourth watch** on the mechanism this project already owns, with a **conjunctive gate** — a release that is **patched** *and* **requireable from CommonJS** — where the patched floor is read from the **advisory** and the CommonJS shape from the **published manifest** (`exports.require`, or a `main` on a package that does not declare `"type": "module"`), so the patched-but-ESM-only state §27CJ measured is **reproduced by the tool rather than described by it**. **Two corrections, found by running it:** the public advisory returns **`first_patched_version: null`** for this GHSA while Dependabot's alert API reports `0.5.0` from the same database, so the floor is derived from the range it does carry (**`<= 0.4.2`**); and the parser's first version split a clause on whitespace, reading `<= 0.4.2` as the bounds `<=` and `0.4.2` and answering *unparsed* — **four controls failed at once and the report never produced**, which is the controls doing the job the report cannot. **The finding, which is not about this advisory:** run live on 2026-10-16 the report is no longer *"everything deferred"* — **`READY expo`, `dist-tags: latest=58.0.12 next=58.0.11`** against an installed **57.0.27**, i.e. **§27AI's Gate 0 (*`latest` must be 58*) is open** and this is the first time any of the four watches has fired, while jest-expo stays shut (the installed SDK's pin admits no jest 30) and TypeScript 7 stays shut (both linters' peers refuse it). Recorded as a **reading with its date, not as a reason to start** — the SDK 58 train is a major promotion with its own runbook and it is the owner's call; nothing has begun it. Verified: **26 controls pass** (5 must-fire, 19 must-not-fire, 2 range) up from 17, the four rows quoted verbatim in the record, and the Dependabot list re-read the same day answering **four** open (the `uuid` advisory cleared when §27CJ's override reached the default branch — §27CJ annotated, and `SECURITY.md` now carries the GHSA identifiers and the no-dismissal-is-owed note). **Limits:** the watch can see a release but not **test** one (whether a future patched-and-requireable release keeps deep-link parsing working is still a bundle-and-run question); the CommonJS rule is conservative and not a resolver; and an unauthenticated advisory read that fails is reported `UNREADABLE`, never as a pass. Roadmap §27CL.

Documentation index — the records this file had not yet carried by name (2026-10-15; reconciles with **roadmap §27CG**). This file is the entry point for the project's work: an increment lands a paragraph here and its full record in `docs/DEVELOPMENT_ROADMAP.md`. That convention had **lagged**, and quietly: measured mechanically at the moment this block was written, **29 of the roadmap's 82 plan records had no `§` anchor anywhere in this file**, so they could not be found from the entry point at all. They are indexed below, one line each, and the rule is now **enforced rather than remembered** — `server/test/phase-docs-section-integrity.test.mjs` fails when a declared `27…` record cannot be found in this file, so a future increment must land its own pointer. Two honest notes about the list: the check is **mechanical** (the anchor, not the subject), so several entries are covered in substance under another heading without naming their record — Phase 28, Phase 30A, the workflow simplification and ISS-12 are all here already; and a record being listed means **only** that it is reachable from here, which is what it is for. **Nothing in the list is unimplemented, and no claim in it is fresh** — each pointer leads to its dated record.

* §27D — Phase 28 — Password Reset Mail Delivery Timing Hardening
* §27E — Phase 29 — Residual Security-Risk Decision Record & Documentation Reconciliation
* §27F — Phase 30A — EAS Development Build & iOS Readiness Foundation
* §27G — Phase 32A — Firebase Authentication Architecture & Console Runbook
* §27H — Phases 32B–32E — Firebase Implementation (server boundary, client boundary, email/password auth)
* §27I — Phase 32F — Firebase Multi-Provider Authentication Architecture (decision record & documentation close-out)
* §27J — Phase 32G — First EAS Development Build / Native Runtime Validation
* §27K — Phase 32H — Server-Side Account Linking Boundary & Authentication Ownership
* §27T — Deployment-Configuration Reconciliation (Phases 4A–4B)
* §27AG — Workflow simplification — fewer moving parts, dependency policy, and a leaner instruction file
* §27AJ — ISS-02 — the RNFirebase Auth PII log, remediated (2026-10-10, PR #40)
* §27AK — Dependency advisories — the per-alert disposition
* §27AN — ISS-16's detection gap closed — the Expo pin set is now held in CI
* §27AO — The workflow actions re-pinned to v7 — ISS-12 cleared early
* §27AP — The server-side queue items taken — and one row's premise was wrong
* §27AR — The secret guard can now fail on purpose — controls for every rule
* §27AT — Real-device Android run — what the phone proved, and what it did not
* §27AU — An upgrade watch reported a gate as OPEN that was shut — corrected, with controls
* §27AV — The local backend was serving the TEST database — and the "empty database" measurement read a different one
* §27AZ — The Phase 30B build — ISS-06 closed, ISS-02 verified at the artifact level, and the dependency fix proved natively
* §27BA — The Phase 30B device run — ISS-02 closed on hardware
* §27BB — The test-data reset, and the orphaned-identity finding it exposed
* §27BK — The owner's account seeded at 80 000 records, and the Firebase cleanup that was refused
* §27BM — One seeding core instead of two, and the three-account comparison setup
* §27BN — The sign-in form's silence, and five places the auth copy failed
* §27BP — A deploy gate that lied, and a measurement that reported a call it never made
* §27BW — The keyboard stops covering the focused field
* §27BX — The dashboard summary at 50 625 products — the catalogue stops crossing the wire
* §27BZ — The assistant's tools at 50 000 products — linear, and still not the bottleneck

CI quality gate — `.github/workflows/ci.yml` (`ci / server` + `ci / mobile` on every pull request and on pushes to `main`: `npm ci`, typecheck, lint, both module-graph checks, the full backend suite and a boot smoke for `/ready`, `/live` and `SIGTERM` against a `mongo:7` container, plus mobile typecheck and jest; Node from `.nvmrc`, no GitHub secrets; its first-ever run on PR #7 caught a real defect — the suites need `JWT_SECRET`, supplied locally by the git-ignored `server/.env` and missing on a CI checkout, producing 118 failures all cascading from `AUTH_NOT_CONFIGURED` — reproduced off-CI in a clone with no `.env` and fixed by `d415335` with one fixed non-secret test value, after which both jobs passed and PR #7 merged as `3e5d2aa`; `9f4c5c1` 2026-10-07; roadmap §27AE)
CI attribution guard — `scripts/check-commit-attribution.mjs`, run by the fourth `ci.yml` job `attribution-guard` (added 2026-10-14): it reads the **author and committer fields and the commit messages** of the commits an event introduces and fails on a forbidden AI attribution trailer — the rule rules 1, 2, 4 and 7 state and that **nothing in the repository could enforce**, which is how two lines of it reached **six commits** on the AI-1..AI-6 branch, including the published head of PR #74 (`3686cb9`), while `main` stayed clean, so a normal merge would have written them into the permanent history. The patterns are **line-anchored** so a message that discusses the rule is not a violation, the owner's own identity and Dependabot's bot trailer are **allowed** (measured first: `dependabot[bot]` is the only bot-shaped identity in `main`'s last 2 000 commits), a self-test of 17 controls runs on every invocation, and a base commit missing from the checkout exits **2 — NOT VERIFIED** rather than reporting a clean branch it never read, which is why it is the one job that checks out the full history. Verified in three directions — exit 0 on the real 13-commit PR range, exit 1 on a throwaway commit authored by a tool and on one carrying the trailer lines, exit 2 against an unresolvable base — and the six affected messages were rewritten message-only (**tree hashes and author/committer fields verified identical for all twelve commits** afterwards); roadmap §27BR)
CI main-guard — `.github/workflows/main-guard.yml`, the free-plan substitute for branch protection (added when classic protection AND the rulesets API both answered `403 Upgrade to GitHub Pro or make this repository public` on a **private** repository; **RESOLVED 2026-10-09 — the owner made the repository PUBLIC and branch protection is now applied, so the two `ci` checks are REQUIRED on `main`** *(**Corrected 2026-10-12: this is FALSE today, and the repository's own probe says so.** The visibility was reversed to **private ~90 minutes later the same day**, and protection on a private repository at this plan level answers `403 Upgrade to GitHub Pro or make this repository public` — re-read 2026-10-12. The two checks therefore **report** and do **not** gate, and the `enforce_admins` sentence below describes a configuration that no longer exists. `SECURITY.md` states this correctly under "Four protections this repository does NOT have"; the *Source protection* paragraph on the next bullet carries the same correction. Do not plan around a required check.)*; the required contexts are **`server` and `mobile`** — the check-run names the REST API returns, **not** the `ci / server` / `ci / mobile` form the pull-request page displays — because configuring the display form leaves a fully green pull request `BLOCKED` on a status that never reports (finding **F-24**, caught by the probe pull request that accompanied the change and fixed by correcting the contexts, which flipped that same PR `BLOCKED` → `CLEAN` with no re-run); **`enforce_admins` is `true` as of the same day** — with it `false` the required checks bind **nobody**, since the only collaborator is the owner-admin, and enforcement was verified in both directions (merge refused while the required checks were pending: *"the base branch policy prohibits the merge"*, exit 1; the same merge succeeded once they were green, so there is no deadlock on a green pull request); this guard is **retained** as a second layer for the routes protection does not cover, a setting later relaxed or an actor added without admin enforcement included; roadmap §27AE, checklist §42). On every push to `main` it requires **every commit the push introduced to be associated with a merged pull request** — the API's own PR record — and fails otherwise, so a direct push to `main` becomes a red run instead of passing silently. It is **detection, not prevention**, and it does not re-check merge-time check status (the primary `ci` run on the same push covers that); the rule was proven against real data before shipping (`5acaf44` → PR #8, `3e5d2aa` → PR #7, `0c54613` → PR #8, non-PR `e9616cf` → none). **Do not push directly to `main`** — land work through a pull request; `main-guard` used to flag it if you did (that workflow was **removed later the same day** — see *Workflow simplification* below), so nothing flags it now; roadmap §27AE; **F-25** — its first run with real work in it was a **false positive**: the commit-to-PR association is **eventually consistent**, so it called the oldest commit of the legitimate PR #15 merge unassociated while its siblings resolved to the PR in the same run, and the identical query a minute later resolved all three; an empty answer is now **retried with a bounded backoff** (~75 s over five attempts) and an API that never answers is reported as a **verification failure rather than an accusation**, with all three paths exercised locally against the live API before shipping)
Public-repository hardening — `SECURITY.md` (reporting via **GitHub private vulnerability reporting**, enabled and verified; **no invented mailbox**; the already-open items `B1`/`B2`/`E3`/`OD-10`/`L-17` are disclosed so a researcher is not thanked for re-reporting them), `LICENSE` (**proprietary, all rights reserved** — an owner decision, because the repository is public for **hosting** rather than to grant reuse rights; GitHub labels a non-standard licence as *View license*, which is expected), and `.github/dependabot.yml` (npm version updates for **both** `server/` and `mobile/`, weekly, minor+patch grouped with `applies-to: version-updates` so a **security** update stays its own visible pull request; validated against the published `dependabot-2.0` schema, not from memory). Repository settings were **checked rather than assumed, and two were found DISABLED on a repository that had just become public** — `secret_scanning` and `secret_scanning_push_protection`, which left the one-off history scan as the only credential control; both are now enabled alongside Dependabot alerts and security updates, while `secret_scanning_non_provider_patterns` and `secret_scanning_validity_checks` remain **disabled and recorded as such**. `dependabot.yml` is only read from the default branch, so it activates when this lands, and its pull requests must pass the required `server`/`mobile` checks like any other change; **switching the alerts on immediately surfaced 9 open advisories, every one in `mobile/package-lock.json`** (1 critical, 4 high, 3 moderate, 1 low) **and Dependabot opened three security-update pull requests by itself (`#12`–`#14`)** — the feature working rather than merely enabled, with `braces`/`node-forge`/`sprintf-js` **not fixable by a version bump** and `uuid` **fixable only upstream** (its patch exists but the graph cannot reach it — Dependabot's updater failed with *"A patched version exists for uuid, but the available update path still resolves it to 7.0.3"*, chain `jest-expo` → `xcode` → `uuid ^7.0.3`), all recorded as open dependency debt; no server or mobile source file, route, model, permission or test was touched, 2026-10-09; roadmap §27AE, checklist §42) *(Corrected 2026-10-10: the live count is **7** — 3 high, 3 medium, 1 low, 0 critical. Dependabot counts drift, so re-read before quoting.)*
Source protection — the repository is **PRIVATE again** (2026-10-09, ~90 minutes after the public flip, on the owner's decision that the source must not be cloneable) and the trade was **measured, not predicted**: **branch protection and rulesets answer `403 Upgrade to GitHub Pro or make this repository public`** and `security_and_analysis` is `null`, so **secret scanning and push protection are gone** on a private repo at this plan level, while **Dependabot survives** (`vulnerability-alerts` → `204`, 9 advisories readable) and the workflows run unchanged; the lost scanner is replaced by **`scripts/check-secrets.mjs`** as the **third CI job** (dependency-free; private-key blocks judged by **body length** so the dummy PEM fixtures pass; provider token shapes; credentialed Mongo URIs; a tracked `.env`) with the **six** deliberate fixtures waived **on their own lines** via `secret-guard:allow` rather than by weakening a rule or excluding the test tree, so a real credential pasted into a test file still fails the build — and it is **pattern matching, not proof**; **writing it found a bug in it**: the first version's `line.length + 1` offset arithmetic drifts on **CRLF** files and misread the private-key body check, reporting an `abc`-body fixture as a real key, found by running the guard on the real tree and fixed by locating each line by search; **enforcement is now detection only** (`main-guard` + CI report, they do not gate); **the public window is a measured, unresolved exposure** — `forks: 0` and `network_count: 0`, but the traffic API **lags ~2 days** so its last recorded day is 2026-10-07 and it does **not** cover the window, hence **it cannot be established that no copy was taken** (**a clone leaves no record the way a fork does**); **access audited**: one collaborator (owner/admin), no deploy keys, no webhooks, no Actions secrets, and `.env`/`server/.env`/`mobile/.env`/`.freebuff` all present and git-ignored; **two owner-side gaps recorded as NOT done** — account **2FA** could not be confirmed (`two_factor_authentication: null`) and the **GitHub Apps with repository access** could not be listed (`403`, needs an App JWT, so the hosting integration's scope must be reviewed in the UI); **forking cannot be disabled on a personal private repo** (`422`, org-owned only); **three `SECURITY.md` claims were corrected** once the flip made them false (private vulnerability reporting `404` when private, the secret-scanning line, the protected branch); limitations and the growth plan are in **`docs/SOURCE_PROTECTION.md`**; roadmap §27AE, checklist §42)
Owner-only access — enforced where GitHub allows it, monitored where it does not (2026-10-09; the owner's requirement: *"I must be the only human with authorized access to the InventoryAI GitHub repository"*) — the audit **changed no repository setting and touched no integration**, every change being additive, and it reports what it could not read instead of assuming it: **confirmed** one collaborator (the owner, `admin`) with **no** pending invitations, deploy keys, webhooks, Actions secrets or environments, this repository's Actions **not shared** with any other (`access_level: none`), the default `GITHUB_TOKEN` already **read-only** and unable to create or approve pull requests, **no public gists**, and **no InventoryAI code in any public repository** (account-scoped code search for two distinctive identifiers → zero); the **history scan re-run over every ref with controls** (a positive control that must be found, a negative canary that must not, because a scan that cannot fail proves nothing) found no `.env`/keystore/`.pem`/`.p12`/service-account file **ever** added, the only `PRIVATE KEY` hits being the **27-character header string** (a docs example, the guard's own pattern, dummy fixtures), **no base64-shaped body line anywhere in history**, and **empty** credential values in both `.env.example` files — so **no secret was ever committed and no rotation is owed**; **the platform limit is recorded, not assumed** (protection and rulesets `403`, `security_and_analysis: null`, `allow_forking: false` → `422 "only on org-owned private repositories"`), so the policy is **enforced where it can be and observable where it cannot**: **`access-guard.yml`** **ran** daily and hard-failed on a non-private repository (the monitor was **removed 2026-10-09** — see *Workflow simplification* below), a fork/fork network, or a collaborator other than the owner — its **first real run (`37893715498`) measured the collaborators endpoint answering `200` to `GITHUB_TOKEN`** while invitations, deploy keys, webhooks, secrets, the Actions policy, protection and rulesets all answer **`403`**, so owner-only membership is **asserted unattended** and those seven are **printed with their status, never counted as a pass**; the deep audit is **`scripts/audit-access.mjs`** against the owner's own `gh` session (dependency-free, **names only and never a value**, non-zero exit on a violation, run live with **no violations**); the two workflow actions are **pinned to commit SHAs** verified via `git ls-remote` to be what the floating tag already resolved to — **re-pinned from v4.4.0 to v7 on 2026-10-11** (checkout v7.0.1, setup-node v7.1.0), which clears the Node 20 deprecation warning every run had printed (ISS-12) — with a `github-actions` Dependabot entry maintaining the pins; two stale claims were **corrected, not left standing** (`dependabot.yml`'s "protected `main`" and the monitor's own unreadable-collaborator claim); **nothing was revoked, narrowed or disabled**, and Render reaches this repository through a **GitHub App installation — not a webhook — which is why no CLI check here can see it**, making the app list and account **2FA** the two owner-side confirmations; **a private repository is not an uncopyable one**; roadmap §27AF, checklist §42)
Documentation truth pass, invalidated citations & a route-inventory guard (2026-10-12) — a read-only audit of the **39 tracked documents** found four wrong claims and **one false security control**: **branch protection is NOT applied** (the API answers `403 Upgrade to GitHub Pro or make this repository public` on a private repository at this plan level), corrected in place on the claim itself in this file, roadmap §27AE and checklist §42; the Firebase design authority §2.6 said **68 routes** where the mounted set is **72** (**47 permission-gated + 13 authenticated + 12 public + 0 role-gated**) and its auth-surface table omitted four routes — both corrected, and the table now lists all 17; `README.md` called the mobile app "(JavaScript)" and claimed 129 `.ts`/`.tsx` files in `app/ components/ lib/` where **82** are measured — both fixed. Two findings with longer tails: the **2026-10-11 message-only rewrite invalidated the documentation's own evidence citations** (a fresh clone resolves **2 of 27** sampled pre-rewrite SHAs; fetching `refs/pull/*` resolves **25**; CLAUDE.md's "ancestor of `main`" claim for `703a9da` is false) and it left **all 99 trailer-bearing commits still fetchable from `origin`** through the **58 `refs/pull/*` refs** it advertises — so §27AS is corrected, **`refs/original/*` is RETAINED** (it is what makes ~132 cited SHAs resolve locally, and the earlier suggestion to delete it is withdrawn), and the standing convention is now **cite section anchors, file paths and PR numbers as primary evidence, and treat any pre-2026-10-11 SHA as historical**. New DB-free guard `server/test/phase-docs-route-inventory.test.mjs` pins §2.6 to the route declarations and the app registrations (11 tests, break/restore proven: exit 1 broken, exit 0 restored); `server` lint, typecheck and both module-graph checks clean; **no source, route, schema, permission, dependency, workflow or session change, and no Git history operation of any kind**. Roadmap §27AX.
ISS-26's device half — the assistant's LaTeX decoded correctly and was still hiding a different number (mobile only; **no dependency, no renderer, no prompt change**; found on the device 2026-10-14): §27BQ closed ISS-26's *record* gap and ended by stating that **nothing in it had been device-checked**, so the stored answer was re-opened on the OPPO CPH1969 (the F2.9 `development` APK over Metro, USB tunnels) with **no new turn and therefore no provider quota spent at all**. The decoder itself is now confirmed on hardware — not one backslash, brace or command survives on the screen. The same screen, however, showed `17+ 5/113 × 100 ≈ 19.5%`, and read as written that is **17 + (5 ÷ 113) = 17.04**, a different number from the 19.5% printed at the end of it. The message was then read straight back out of `ai_messages` to establish ground truth instead of inferring it: the model had written `\frac{17 + 5}{113}` — *"17 plus 5, over 113"* — so **the renderer, not the model, introduced the wrong reading**. That is the same failure class as AI-4's word boundary (a marker quietly editing the answer) and worse in one respect, because the answer still *looks* like an answer. Now `fractionTerm` in `mobile/lib/assistantMarkdown.ts` keeps the brackets on any fraction side that carries an operator, so `\frac{17 + 5}{113}` decodes to `(17 + 5)/113`, while a single term is untouched and `\frac{620}{10,000}` still decodes to `620/10,000` — which is what keeps the rule away from the answers already stored. **The rule covers the operator family (`+ - − × · ÷ /`, plus the LaTeX spellings `\times`/`\cdot`/`\div`/`\pm`/`\mp`) rather than the two signs one screenshot happened to show, and that came from a measurement:** the fraction bar binds tighter than `×` exactly as it does than `+`, so the same code decoded `\frac{1}{2 \times 3}` — **one sixth** — as `1/2 × 3`, **one and a half**. Verification: **11 cases** in the ISS-26 suite (its count unchanged — the assertions grew inside the cases that already existed) covering the real stored formula, `(17+5)/113` unspaced, both-sides-operator `(n - 1)/(2 + k)`, the four multiplicative forms and the single-term re-pins; the narrowed rule was **watched failing first** through a line-based mutator that prints the before and after line and **exits non-zero if the edit did not apply** (a mutation that cannot apply is not evidence), answering `Expected: "1/(2 × 3)" / Received: "1/2 × 3"` — exactly the wrong number — with the file then restored and re-run green; mobile **59 suites / 802 tests / 0 failures** (up from 801), `tsc --noEmit` and `eslint .` clean; and the corrected line was **re-rendered on the phone at zero quota**, checked twice on the raw dump and on a 3× crop because the pre-fix reading had already been an OCR artifact once. The same pass then gave AI-4's rendering its **first device look**, and closed the one question §27BH left to a screen — what a **table** looks like on a phone — with **one real turn** (`201`, 17.6 s, `getOutOfStockProducts`), asked directly for a table and answered with a **4-column, 5-row** one: it renders as **one card per row**, the row's own name as the card title and the header's other columns as label/value lines, the header row **not** drawn as a row, **no `|`, no `------`, no `**` anywhere on the screen**, the closing sentence as ordinary prose, and every value present — including the single-character `0`, which was proven **drawn on all five cards** by pixel measurement (267 ink pixels, bbox `428..445`, the identical glyph signature five times). **That turn is also the first device sighting of AI-5's cost line** — `[ai] turn outcome=ok total=17599ms providerMs=17510ms calls=2 toolMs=89ms toolRuns=1 tools=getOutOfStockProducts empty=0 in=3272 out=228`, i.e. **99.5 % provider time against 0.5 % tools** read off a real member's turn, with a clean `calls=2 / empty=0` that contrasts with the two earlier turns in the same account that needed `calls=3` and an AI-2 retry. **Three false findings are recorded rather than buried**, because each would have been written up as a defect: a database probe that reported "no stored table anywhere" while **two silent bugs** (the database name lives in `MONGODB_DB_NAME`, and `role` is uppercase `ASSISTANT`) made it unable to match anything — so a provider turn was spent on a question whose answer was already in the database, where a **6-column, 20-row** table still sits (in another business, and therefore invisible to the signed-in phone); OCR that read the lone `0` as **absent** on all five cards, which is exactly what a dropped last column would look like; and a pixel scan whose window began at `x=460` while the value column begins at **x≈428**, so a glyph that was correctly drawn measured as zero ink three times. The instruments were fixed and re-controlled before any of it was believed, which is how three apparent defects became zero. **Stated limits:** OCR of a screenshot rather than a DOM read, one turn and one table shape (the **grid** path and the 6-column stored table remain unseen on hardware), and *"does it read well"* is still a judgement for the owner rather than for a test. **Limits stated rather than glossed:** the observation rests on OCR of a 1080-px screenshot (the accessibility tree could not be dumped — `uiautomator` will not idle past a blinking caret and the one digest it returned was stale), only one stored answer contains an operator-carrying fraction, so the `×`/`÷`/`·` branches are proven by test and mutation rather than by anything the model has actually written, and `stripMarkdown`'s `**` rule keeps the limit §27BH recorded. Roadmap §27BS.
ISS-27 — The narrow table collapsed, and the screen looked empty (found **on the device** 2026-10-14, minutes after the verification in the entry above; mobile only — **no server, route, permission, schema, dependency or prompt change**): asked for a **two-column** table, the assistant answered correctly (the stored message is a proper 2×5 Markdown table and the API returned it) and the phone showed **nothing at all** — a blank message area, the previous answer gone with it, only a timestamp drawn. The accessibility tree settled it: the answer's `android.widget.TextView` cells measured **48 px wide and up to 1 452 px tall**, so the whole answer sat in a ~200 px column, its height exploded to ~1 600 px, and scroll-to-end pinned the viewport to the bottom of it, pushing the question off the top of the screen. **The pixel scan had reported zero ink** over a 1080 × 1500 band, and that was the instrument being wrong rather than the screen: the collapsed answer draws only the grid's `border` (`#2A2F3B`) on the bubble's `surface` (`#1B1E26`), a luminance difference of about **20**, under the tool's threshold of 40 — at threshold 20 the same cell showed 516 ink pixels. The four-column **card** path verified minutes earlier had escaped the same defect only because a card is titled with the row's own long name, which gives the bubble a wide intrinsic width — **luck, not design** — which is why the fix covers both paths. Now a table-bearing answer takes the full bubble width (`bubbleWide: { flex: 1 }`, still capped by `maxWidth: '84%'`) so a grid's `flex: 1` columns have a width to share, and `isTableAnswer` is an O(n) `includes('|')` — a superset of the parser's own detection, so the keystroke-driven render path pays nothing and a prose reply keeps its natural bubble. **5 cases** in `mobile/__tests__/iss-27-narrow-table-width.test.tsx` using the real stored answer, the ★ case **watched failing first** (`Expected: 1 / Received: undefined`, then restored byte-identical); mobile **60 suites / 807 tests / 0 failures** (up from 59 / 802), `tsc --noEmit` and `eslint .` clean. **DEVICE-VERIFIED at zero provider quota**, because it re-renders a stored answer: the tree now measures **464 × 96** and **256 × 96** for the two columns instead of 48 px wide and 1 452 px tall, with all five rows and every `0` on screen and the card answer unchanged. **Stated limits:** **jest cannot see a layout collapse** — every AI-4 case passed while the phone rendered that 48 px column, so the new suite pins the wiring and the values while the layout stays device-only; one screen and one orientation, with only two- and four-column tables measured, so the seven-column card path and landscape remain unmeasured; and the conversation list's timestamp was seen to go stale after a new turn (**not investigated, not fixed**, recorded so it is not rediscovered). Roadmap §27BT.
The Markdown word-boundary rule gets the guard AI-4 never left behind (mobile only; **no dependency, no prompt, no server and no production behaviour change**): AI-4 found and fixed a real defect — `stripMarkdown` had **no word boundary at all**, so it rewrote `4*5*6` as `456` and `A*B*C` as `ABC`, **two characters removed and a quantity silently changed** — and then left one residual **recorded rather than fixed**; neither the fix nor the residual had a rule-level guard, because the AI-2 and AI-4 suites pin the two named invariants (`SKU_123_AB` is data, `12 * 3 = 36` is arithmetic) rather than the rule that produces them. **The first guard written for it was blind to the very defect it was written for:** it compared **alphanumeric content** before and after and **passed while the bug was present**, because `4*5*6` and `456` keep the same digits in the same order — measured by removing the boundary rule and watching the passing property, not reasoned about. The shipped guard compares **runs** instead, where a removed marker **fuses** two alphanumeric runs and the change is visible: **0** violations on the clean tree, and **1,976** strict plus **2,412** styled violations when the rule is removed from its two code sites, with the edit **asserted to have landed by file hash** before the run and the file restored **byte-identically** afterwards. Scoping is measured, not chosen: over the no-backtick corpus (every string to depth 6 over `* _ # 4 a` — **19,530** inputs) a run may never be fused by either path, while with backticks a boundary **can** be fused and every such case is a code span or a styled span adjacent to a run (**1,492** of them, and **0** once backticks leave the corpus) — the styling carries the separation, so the shipped rule is the general form, *a run boundary may disappear only where a styled span carries it*, measured to hold over both corpora (**75,516** inputs). The residual AI-4 accepted (`4**5**6` → `4*5*6`, operators surviving so no quantity is altered) is **pinned** in both directions so it cannot drift silently. 6 cases in `mobile/__tests__/assistant-markdown-invariant.test.ts`; mobile **63 suites / 839 tests / 0 failures**, `tsc --noEmit` and `eslint .` clean. **Limits stated in the file:** it is a property over generated inputs rather than a proof (a small alphabet at depth 6 cannot see a defect needing a longer string), the styled-span exemption is a proxy (styling is present *at* the fusion, not proven to be *the* boundary), and it says nothing about how an answer reads on a screen. Roadmap §27CB.
The section numbering gets the guard every other index already had (docs plus one test file; **no production, dependency, route, schema or permission change**): **two records claimed the same §27 number on two branches** — the server-bumps record and the Markdown guard above — and **nothing failed**, no test and no build; the collision was found by a human reading a **merge conflict**, and resolving it cost a renumbering across three documents and a rewrite of the record's own justification. In the same afternoon a citation was found sending readers to a `27A` record **that has never existed** (the lettered series starts at `27B`; the plan series begins at §27). Both are one failure — the document numbering is an **index** and nothing checked it — so `server/test/phase-docs-section-integrity.test.mjs` (**4 cases**, registered in `run-tests.mjs`'s `PURE_UNIT` list, because an unclassified file makes `npm test` exit **2**) now asserts that **no plan record is numbered twice** and that **every citation resolves**, scanned across the project's own text (**446** files — docs, sources, tests, scripts, workflows). **The scoping was measured rather than chosen:** records use `## 1. …`-style local sub-headings and **four such numbers repeat today** (`1`, `2`, `3`, `4`, three times each), so a guard over "every numbered heading" would report four false positives on a clean tree and be deleted within a week; the `27…` namespace holds **79** records and that is what is checked. **Proved able to fail in both directions:** a second `# 27CB.` record appended → the duplicate assertion fails with `[['27CB', 2]]`, exactly the defect class that cost the renumbering; a citation to an unresolvable record appended → the citation assertion fails naming the file and the id; each restored **byte-identically**, and the corpus floors (**>70** records, **>400** files) come from that measurement rather than a guess. **The guard applies to itself and needs no self-exclusion:** quoting the bad identifier and planting an unresolvable one in the test file made the first run of the finished suite report **four** new dangling citations, so identifiers are written **without their sigil** here and the unresolvable one is **assembled from parts**, leaving the corpus whole (the issue-record guard took the documented single-file exclusion instead). It also corrected the one real dangling citation in the tree — `docs/PHASE_HISTORY.md`, which now points at §27 — and the fix records why the wrong identifier is written there without its sigil. Server **unit mode 790 tests / 180 suites — 753 pass / 0 fail / 37 deliberately skipped** (from 786 / 179 — 749 / 0 / 37), `npm run test:unit` exit **0**. **Limits:** it cannot see a collision before the two records meet (two branches can each claim a number and both be clean; it fires when the second lands, which is earlier than the human who found it by hand but is not prevention), and it says nothing about whether a record is true, sensibly numbered, or whether a citation names the section the sentence meant. Roadmap §27CD.
```

### Workflow simplification (2026-10-09) — the owner asked for a lighter process

The GitHub flow is deliberately minimal now: **branch → commit → push → pull request → review →
merge**, with one `ci` workflow (jobs `server`, `mobile`, `secret-guard`) that runs in about three
minutes and gates nothing — `main` cannot be protected on a private repository at this plan level,
and that is accepted.

**Two workflows were removed** on the owner's decision, to keep the setup small: `main-guard.yml`
(it flagged a push to `main` outside a pull request) and `access-guard.yml` (a daily monitor of
repository visibility and the access list, which had run green).Nothing replaces them unattended; the access check is now the manual `node scripts/audit-access.mjs`, and the deferred-upgrade gates are one read-only command, `node scripts/check-upgrade-watches.mjs` (roadmap §27AQ — outside CI on purpose, since it needs the network). `ci.yml`,
`scripts/check-secrets.mjs` and the pinned action SHAs are kept.

**Dependency policy:** Dependabot queues **minor and patch updates only**, grouped per package,
at most two open PRs per package, weekly — major versions are taken deliberately and are tracked
in issue #32 rather than as standing red PRs. Security updates are exempt from all of that and
still arrive on their own. **Every package the installed Expo SDK pins** is additionally excluded from
version updates — the rule is mechanical: if it is a key in `expo/bundledNativeModules.json`, Expo owns
its version and Dependabot cannot know it (all **21** of the 30 packages the mobile manifest declares,
dependencies and devDependencies both, since **2026-10-12** — the earlier figure of 17 missed the two
SDK-pinned devDependencies, `eslint-config-expo` and `jest-expo`, and the completeness of that list is now
held by `mobile/__tests__/expo-sdk-pins.test.ts` rather than by hand). These move only with an Expo SDK
upgrade via `npx expo install --fix` (roadmap §27AH/§27AL; ISS-16, ISS-17). That command was **blocked** on
the owner's machine by `allow-scripts=9router` in the user-level `~/.npmrc` — npm 11.19.1 rejects the flag
form Expo's installer passes, and `expo install` writes `package.json` before the install it then fails on —
and is **fixed as of 2026-10-12**, the line having been removed (verified: `npx expo install --check` reports
"Dependencies are up to date"). Note separately that npm 11.19.1 gates **dependency install scripts by
default**, so the `npm warn install-scripts` notice is not a local misconfiguration (roadmap §27AY, findings
**F-41** and **F-42**; this host also runs Node 26 while `.nvmrc` pins 24 — **F-43**). The four that
stay open are
`@react-native-firebase/app`, `@react-native-firebase/auth`, `@react-native-google-signin/google-signin`
and `expo` itself, whose versions this project chooses deliberately.

**Device measurements on 2026-10-15, and one correction of the record** (roadmap **§27CE**) — no production behaviour
change: the diff is 11 comment lines and the one experiment it describes was measured and then **reverted**. Two open
device items are settled as far as this hardware allows. **ISS-25's last unmeasured shape is closed on hardware:** the
stored six-column table renders as **one card per row** — title **647 px** (the full bubble), labels **288 px**, values
**359 px**, all three rows carrying all five lines, and **zero** pipes, rules, `**`, `###` or `\frac` anywhere in the
dump. **ISS-13's device half is measured and splits in two:** the artifact `Share PDF` writes is
`/MediaBox [0 0 594.95996 339.12]` — exactly the 595×340 label page — while the print dialog's sheet is **612×792**
(US Letter) and **is not the app's to set**, because expo-print's Android module builds the print job from `orientation`
and margins only (`UNKNOWN_PORTRAIT` = "the service or the user decides"), which is also why the eight guard cases can
pin the arguments and never the page. The obvious remedy — generate the label PDF and print *that* file — was tried on
the device and produced the same Letter sheet, so it was **reverted rather than shipped**; a label printer wants the
shared PDF, or a media size chosen in the dialog. **The correction matters more than either measurement:** an earlier
attempt in this session explained "zero requests reached the local backend" as the installed build talking to the
deployed backend, and that was **wrong** — `adb shell uiautomator dump` was being read back through paths Git Bash and
Node disagree about (`/sdcard/…` mangled; Node's `/tmp` is `C:\tmp`, the shell's is `AppData\Local\Temp`), so every
"screen" was a **stale file** and the app was in fact sitting on the **Expo dev launcher**. Two rules this leaves:
a device reading is evidence only once a **reload is proven** (Metro `Bundled … (1 module)`), since the first attempt at
the experiment silently measured the old code; and an absence of evidence is never evidence about the system until the
instrument is known good.

**The server minor-and-patch group was taken on 2026-10-15** — `express` 5.2.1 → 5.3.0, `dotenv` 18.0.7 →
18.0.8, `mongoose` 9.11.1 → 9.11.2, `@types/node` 26.6.4 → 26.6.5 and `typescript-eslint` 8.71.1 →
8.71.2 — verified green (`tsc`, `eslint`, both module-graph checks, the full suite, `npm ci` and the boot
smoke) and recorded in roadmap **§27CC**. It is **not** a security fix and is not described as one: the CVEs
express 5.3.0's release notes name were **already closed by the lockfile** (`qs` 6.16.0 and `proxy-addr`
2.0.8 were already resolved), so what moved is the *declared* floor. **Nothing was taken in `mobile/`** —
§27CA records why: three of its five advisories have **no patched release published upstream at all**, and
the one patch that exists breaks its own consumer. The runtime floor is unchanged (express 5.3.0 requires
Node `>= 18`, below this project's `>= 24`), and the install step is unchanged (`npm ci` ⇒ exit 0, the
lockfile being in sync being the thing that check proves).

**Records are proportional:** a security, architecture, authorization, schema, route,
dependency-policy or phase-level change gets a dated record; a routine feature or fix is
documented by its pull request description, its tests and the code. Do not restate what the
roadmap already records. Nothing above changes what must be verified — never claim a check you
did not run.

### Detailed history lives outside this file

The prose record of every phase and increment listed above is kept in
`docs/PHASE_HISTORY.md`, so it does not load into every session. The authoritative records are
`docs/DEVELOPMENT_ROADMAP.md` (per-phase, with evidence) and
`docs/AUTH_SECURITY_MASTER_CHECKLIST.md` (security-relevant work). **Current open work, known issues and the next-step order live in `docs/DEVELOPMENT_ROADMAP.md` §27AH** — read that section at the start of a session instead of re-auditing the repository.

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

These rules are **tool-agnostic and forward-binding**: they name Claude Code and Codebuff only as
instances. Any AI agent, coding tool, bot or automation is covered, and so is any tool introduced later.

1. Do NOT add a co-author trailer for an AI agent, a coding tool, a bot or automation. Forbidden
   examples, by name:
   `Co-Authored-By: Claude Code <noreply@anthropic.com>`,
   `Co-Authored-By: Codebuff <noreply@codebuff.com>`.

2. Do NOT add a generated-by tag, signature line or automated footer to a commit body or trailer.
   Forbidden examples, by name: `🤖 Generated with Codebuff`, `Generated with Codebuff`,
   `Generated with Claude Code`, `Generated by Claude`, `Made with …`, and any emoji-prefixed
   attribution line.

3. A normal commit message is the Inventory AI change and nothing else — subject, optional body
   explaining *why*, and no attribution of any kind. **The only identity that may appear anywhere in a
   commit, branch, pull request, changelog or release note is Jeffern's own name and the commit email
   above.**

4. Do NOT identify Claude Code, Anthropic, Codebuff or any other tool as the author, co-author,
   contributor, implementer or owner of Inventory AI. Implementing, modifying, testing, debugging and
   documenting the project does not make a tool an author or contributor.

5. Git author **and** committer identity must be the repository's configured Jeffern/jeffernzxc
   identity. Verify with `git config user.name` / `git config user.email` before creating a commit; the
   two must be `jeffernzxc` and `jefferndullamalinaozxc@gmail.com`. If either differs, **report the
   mismatch** — never silently change Git identity.

6. Before creating any commit, read back what you are about to record —
   `git log -1 --format=%B` on the staged commit, or the message you are about to pass — and confirm it
   carries no trailer other than the owner's own. A trailer that was never added cannot be reviewed
   away later.

7. **Nothing in this repository may add a trailer automatically.** No `commit-msg` or
   `prepare-commit-msg` hook, no commit template (`commit.template`), no alias and no script may append
   one. The unwanted trailers found in pre-2026-10-11 history came from a coding agent's own
   commit-message template — not from Git — so that template must not be reintroduced.

8. This rule applies to all future commits, branches, pull requests, pull request descriptions, reviews,
   changelogs, release notes and project documentation, unless Jeffern explicitly overrides it for one
   specific case.

9. Rewriting history stays forbidden **except on Jeffern's explicit request.** Jeffern requested it once,
   on 2026-10-11, to remove the already-published attribution described in rule 1 and rule 2; that rewrite
   is recorded in `docs/DEVELOPMENT_ROADMAP.md` §27AS. That single request does not stand as standing
   permission, and no further history rewrite may be started without a new, explicit request.

10. When a history rewrite is authorised, it must be **message-only** (file contents and trees untouched,
    proved by comparing tree hashes before and after), must preserve every commit's work, must be
    reported with its impact on branches, pull requests and deployments, and must use
    `--force-with-lease` — never an unguarded force push.

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