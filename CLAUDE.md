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
- JavaScript

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

- JWT
- bcrypt

### AI

- AI provider abstraction
- Claude and/or Gemini
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
Phase 30A — EAS Development Build & iOS Readiness Foundation (EAS foundation only: the Expo Continuous Native Generation architecture is retained and no `ios/` or `android/` directory exists or is committed; the project is linked to EAS project `@jeffernqwes-team/inventory-ai` — `607eca05-1175-43ed-86a0-1829e91c9531`; `mobile/eas.json` defines `development`, `ios-simulator`, `preview` and `production` with `cli.appVersionSource: "remote"` and no update channel; `expo-dev-client` added and `expo-updates` deliberately not installed; bundle/package identifier `com.inventoryai.app` on both platforms; NO EAS build, submit or prebuild has been executed, so the phase is statically validated only and NOT runtime-verified; F-1 is NOT fixed and NOT closed; Phase 30B has NOT started)
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