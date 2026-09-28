# Inventory AI — Development Roadmap

**Version:** 1.0  
**Status:** Initial Development Roadmap

---

# 1. Purpose

This document defines the implementation order for the Inventory AI project.

The project must be developed incrementally.

Claude Code must not attempt to implement the entire application in one phase.

Each phase must be:

1. Planned
2. Implemented
3. Tested
4. Verified
5. Documented
6. Reviewed

before proceeding to the next phase.

---

# 2. Development Philosophy

The project follows:

```text
Understand
    ↓
Plan
    ↓
Implement
    ↓
Test
    ↓
Verify
    ↓
Document
    ↓
Commit
    ↓
Next Phase
```

The objective is to keep every implementation step:

- Small
- Testable
- Reviewable
- Reversible
- Maintainable

---

# 3. Phase Overview

```text
Phase 00
Planning & Inspection
        ↓
Phase 01
Project Foundation
        ↓
Phase 02
Backend + Database
        ↓
Phase 03
Authentication + Authorization
        ↓
Phase 04
Inventory Core
        ↓
Phase 05
Mobile Application
        ↓
Phase 06
AI Assistant
        ↓
Phase 07
Testing + Production Hardening
        ↓
Phase 08
Owner-Directed Hardening (08A, 08B)
        ↓
Phase 10
Commercialization Foundation (10A, 10B)
        ↓
Phase 11
Inventory Intelligence & Alerts (11A, 11B)
        ↓
Phase 14A
User Management Foundation
        ↓
Phase 15
Account Security & Profile Management
        ↓
Phase 16
Audit Trail Viewer
        ↓
Phase 17
Mobile Supplier & Purchase Order Management
        ↓
Phase 18
SaaS-style UI Foundation & Adoption (18A–18F)
        ↓
Phase 19
Stock Transfers Between Locations
        ↓
Phase 20
Performance, Pagination & Filter Contract Hardening (20A–20H)
        ↓
Phase 21
Product Archive-Only Lifecycle & Inventory Invariant
        ↓
Phase 22
Authorization Contract Enforcement & RBAC Coverage Guards
        ↓
Phase 23
Authorization Contract Completion: Route Classification & RBAC Mirror Guards
        ↓
Phase 24
Runtime Authorization Matrix & Tenant-Isolation Verification
        ↓
Phase 25
Design-Token Contrast Close-Out & Mobile Known-Issue Reconciliation
        ↓
Phase 26A
Session Hardening & Real Logout
        ↓
Phase 26B
Password Recovery (Email Reset)
        ↓
Phase 27
Mobile Password Recovery
        ↓
Phase 28
Password Reset Mail Delivery Timing Hardening (B1)
        ↓
Phase 29
Residual Security-Risk Decision Record & Documentation Reconciliation
        ↓
Phase 30A
EAS Development Build & iOS Readiness Foundation
        ↓
Phase 31
AI Provider Wire Diagnostics & the AgentRouter → OpenRouter Migration
        ↓
Phase 32A
Firebase Authentication Architecture & Console Runbook
        ↓
Phase 32B
Firebase Admin SDK Foundation (Server Verify Boundary)
        ↓
Phase 32C
Firebase Authentication Session Exchange
        ↓
Phase 32D
Firebase JS SDK Boundary (Client Initialization)
        ↓
Phase 32E
Firebase Email/Password Authentication & Legacy Fallback Guard
        ↓
Phase 32F
Firebase Multi-Provider Authentication Architecture — Decision Record & Documentation Close-out
        ↓
Phase 32G
First EAS Development Build / Native Runtime Validation
        ↓
Phase 32H
Server-Side Account Linking Boundary & Authentication Ownership
        ↓
Phase 32J
Mobile Firebase Registration Onboarding (Google → register → exchange → session)
        ↓
Phase 32K
Firebase Password Authority Boundary & Timing-Equalizer Credential Fix
        ↓
Phase 32L
Firebase Identity Unlink (server boundary + mobile) — 32L-A / 32L-B
        ↓
Phase B
Mobile Firebase Authentication on the Native SDK
        ↓
Phase C
Mobile Google Sign-In on the Native SDK
        ↓
Phase D
Native Firebase Confirmation Flows
        ↓
Phase E
Native Firebase Session Teardown & Session Reconciliation
        ↓
Phase F1
Retire the Firebase JS SDK and the Browser OAuth Path
        ↓
Phase F2
Retire the Browser Dependencies, the Plugin, the Second Scheme and the Native-Intent Hook
        ↓
Phase F2.9
EAS Development Build & Android Runtime/Native Verification of F2
```

---

# 4. Phase 00 — Planning & Inspection

## Objective

Understand the development environment and repository before implementing the application.

## Coding

NO major application implementation.

## Tasks

Inspect:

- Operating system
- Node.js version
- npm version
- Git installation
- Git configuration
- Expo availability
- React Native environment
- Existing repository
- Existing package files
- Existing dependencies
- Existing source files
- Existing configuration
- Potential naming conflicts
- Potential architecture conflicts

Review:

```text
CLAUDE.md
docs/SYSTEM_SPECIFICATION.md
docs/DEVELOPMENT_ROADMAP.md
```

## Expected Output

Claude must provide:

- Current environment summary
- Repository structure summary
- Existing configuration
- Detected problems
- Dependency concerns
- Architecture concerns
- Recommended Phase 01 implementation plan

## Definition of Done

Phase 00 is complete when:

- The repository has been inspected.
- The development environment is understood.
- No major unknown architecture conflicts remain.
- A Phase 01 plan exists.

---

# 5. Phase 01 — Project Foundation

## Objective

Create the basic application structure.

## Scope

### Mobile

Set up:

- React Native
- Expo
- Expo Router
- JavaScript
- Basic app entry
- Basic navigation foundation

### Backend

Set up:

- Node.js
- Express.js
- JavaScript
- Server entry point
- Basic routing
- Environment configuration
- Error handling foundation

### Repository

Create:

```text
mobile/
server/
docs/
```

Set up:

- `.gitignore`
- `.env.example`
- README
- Development scripts

## Explicitly Excluded

Do NOT implement:

- Authentication
- Products
- Inventory
- Stock-in
- Stock-out
- AI
- MongoDB business models
- User roles

## Definition of Done

- Mobile project starts successfully.
- Expo application runs.
- Backend starts successfully.
- Environment configuration works.
- Basic API endpoint responds.
- Project structure follows the specification.
- No unnecessary feature implementation exists.

---

# 6. Phase 02 — Backend + Database

## Objective

Create the backend data architecture and MongoDB foundation.

## Scope

Create Mongoose models for:

```text
Business
User
Location
Category
Product
Inventory
InventoryTransaction
AuditLog
AIConversation
AIMessage
```

Implement:

- MongoDB connection
- Mongoose configuration
- Model relationships
- Validation foundation
- Database indexes
- Repository/service structure
- API structure
- Centralized error handling

## Important Rules

MongoDB must remain accessible only from the backend.

Business-owned records must support business isolation.

Inventory must represent:

```text
Product + Location
```

not one global quantity.

## Explicitly Excluded

Do NOT implement:

- Complete authentication
- Full RBAC
- Mobile inventory screens
- AI functionality
- AI tools

Authentication and authorization belong to Phase 03.

## Definition of Done

- Backend connects to MongoDB.
- Required models exist.
- Schemas have appropriate validation.
- Important indexes exist.
- Backend structure is maintainable.
- Database connection errors are handled.
- Relevant tests/checks pass.

---

# 7. Phase 03 — Authentication + Authorization

## Objective

Implement secure user authentication and server-side authorization.

## Scope

Implement:

- Registration
- Login
- Password hashing
- JWT authentication
- Protected routes
- User/business relationship
- Roles
- RBAC middleware
- Business isolation

Roles:

```text
OWNER
ADMIN
MANAGER
STAFF
```

## Security Requirements

The backend must determine:

```text
Authenticated User
        ↓
Business Context
        ↓
Role
        ↓
Permissions
```

Never trust:

```text
Client businessId
Client role
AI businessId
AI role
```

## Tests

Test:

- Valid registration
- Duplicate email
- Valid login
- Invalid login
- Protected endpoint
- Unauthorized endpoint
- Role permissions
- Business isolation

## Definition of Done

- Users can register.
- Users can log in.
- Passwords are hashed.
- JWT authentication works.
- Protected routes work.
- RBAC works.
- Business isolation works.
- Security tests pass.

---

# 8. Phase 04 — Inventory Core

## Objective

Implement the core inventory management system.

This is the central business functionality.

## Scope

### Business

- Business management

### Locations

- Create
- Read
- Update
- Archive

### Categories

- Create
- Read
- Update
- Archive

### Products

- Create
- Read
- Update
- Archive
- Search
- Filtering

### Inventory

- View inventory
- Stock-in
- Stock-out
- Adjustment

### Transactions

Create transaction records for inventory changes.

### Audit Logs

Record important inventory operations.

### Dashboard

Implement:

- Product count
- Inventory quantity
- Low-stock count
- Out-of-stock count
- Recent activity

## Inventory Rules

Stock-in:

```text
newQuantity =
previousQuantity + stockInQuantity
```

Stock-out:

```text
newQuantity =
previousQuantity - stockOutQuantity
```

Reject:

```text
stockOutQuantity > availableQuantity
```

Negative inventory is not allowed.

## Consistency

Inventory update and transaction creation must be handled safely.

Where appropriate, use database transactions.

## Definition of Done

- Products work.
- Categories work.
- Locations work.
- Inventory works.
- Stock-in works.
- Stock-out works.
- Negative inventory is prevented.
- Transactions are recorded.
- Audit logs are generated.
- Search works.
- Low-stock detection works.
- Out-of-stock detection works.
- Dashboard works.
- Business isolation remains enforced.
- Critical inventory tests pass.

---

# 9. Phase 05 — Mobile Application

## Objective

Connect the React Native application to the backend and implement the V1 user interface.

## Screens

```text
Splash
Login
Register

Dashboard

Products
├── Product List
├── Product Details
├── Create Product
└── Edit Product

Categories

Locations

Inventory
├── Inventory List
├── Stock In
└── Stock Out

Inventory History

AI Assistant

Profile / Settings
```

## Mobile Requirements

Implement:

- API client
- Authentication state
- Token handling
- Navigation
- Loading states
- Error states
- Empty states
- Form validation
- Search
- Pagination where appropriate
- Efficient list rendering

## UX Principles

The application should prioritize:

- Simplicity
- Fast navigation
- Clear actions
- Clear inventory quantities
- Clear error messages
- Minimal unnecessary interaction

## Explicitly Excluded

Do NOT implement:

- Full offline sync
- AI write actions
- Payments
- Subscription system
- Advanced analytics
- Barcode scanner

## Definition of Done

A user can complete this workflow from the mobile app:

```text
Register
 ↓
Login
 ↓
Dashboard
 ↓
Create Location
 ↓
Create Category
 ↓
Create Product
 ↓
Stock In
 ↓
View Inventory
 ↓
Stock Out
 ↓
View History
```

---

# 10. Phase 06 — AI Assistant

## Objective

Add a secure, read-only AI assistant.

## Scope

Implement:

- AI service
- AI provider abstraction
- Claude provider
- Gemini provider where configured
- AI chat endpoint
- Conversation handling
- Message storage
- Controlled inventory tools

Initial tools:

```text
searchProducts
getProduct
getInventory
getLowStockProducts
getOutOfStockProducts
getInventorySummary
getInventoryHistory
getProductsByLocation
```

## AI Security

AI must:

- Receive authenticated user context.
- Inherit user permissions.
- Respect business isolation.
- Use controlled tools.
- Never access MongoDB directly.
- Never receive MongoDB credentials.
- Never execute arbitrary database queries.

## V1 AI Restrictions

AI is READ-ONLY.

The AI cannot:

```text
Create product
Update product
Delete product
Modify inventory
Create stock transaction
Modify users
Change roles
```

## AI Accuracy

Database facts must come from tool results.

The AI must not invent:

- Quantities
- Products
- Stock levels
- Locations
- Transaction history

## Definition of Done

Example questions work:

```text
"What products are low in stock?"

"How many products do I have?"

"How many Coca-Cola items are available?"

"Which products are out of stock?"

"Show inventory in the warehouse."

"What happened to inventory recently?"
```

AI tool authorization must be tested.

AI must not bypass business isolation.

AI must not modify inventory.

---

# 11. Phase 07 — Testing + Production Hardening

## Objective

Prepare the application for production deployment.

## Testing

Review:

- Authentication
- Authorization
- Business isolation
- Products
- Inventory
- Transactions
- Audit logs
- Dashboard
- AI tools
- AI authorization
- API validation

## Security

Review:

- Environment variables
- JWT security
- Password hashing
- API rate limiting
- CORS
- Input validation
- Error responses
- MongoDB permissions
- AI API credentials
- Business isolation

## Performance

Review:

- Database indexes
- Pagination
- API payload size
- Mobile list performance
- Image optimization
- Search performance
- AI context size

## Production

Prepare:

- Production environment variables
- Backend deployment
- MongoDB production configuration
- Mobile production configuration
- Build configuration
- Error monitoring
- Logging
- Backup strategy

## Definition of Done

- Critical tests pass.
- Security review is completed.
- Production configuration is separated from development.
- Secrets are not committed.
- Backend can run in production.
- Mobile production build can be generated.
- Critical V1 workflows have been verified.

---

# 12. Phase 08 — Owner-Directed Hardening

## Objective

Phase 08 is an owner-directed hardening extension approved after Phase 07, beyond the original
Phase 00–07 plan. It is delivered in approved lettered increments; each increment is recorded here
with its scope and verified status when it completes, so the roadmap stays aligned with the
committed implementation (spec §54 acceptance criterion 29 — documentation accurately reflects the
implementation).

## 08A — Structured Request Logging + Correlation IDs

### Scope

Implemented (commit `fc11823`):

- Dependency-free structured logger (`src/utils/logger.js`) — one JSON object per line; info →
  stdout, error → stderr; `undefined` fields are omitted so absent context simply does not appear.
- Request/correlation-ID middleware (`src/middlewares/requestId.js`), registered first in the app
  chain so every downstream layer (rate limiters, body parser, routes, error handler) runs under a
  single stable id. A safe client-supplied `X-Request-ID` (≤ 128 chars, charset
  `[A-Za-z0-9._:-]`) is echoed verbatim; anything unsafe or overlong is replaced by a fresh
  `crypto.randomUUID()`. Every response — success, 404, or body error — returns `X-Request-ID`.
- Per-request access log (`src/middlewares/httpLogger.js`) emitted on response `finish`: requestId,
  method, path (captured at entry — never the query string), status, authenticated userId when
  present, and duration.
- Structured server-side error records from the centralized error handler carrying requestId + user
  context, while preserving the human-readable message text (Phase 07G log assertions unchanged).
- Logs NEVER contain authorization headers, cookies, request bodies, query strings, or full AI
  prompts/responses.
- Request logging is on by default and disabled with `LOG_REQUESTS=0`; the test runner forces `0`
  so suites stay quiet. Configuration documented in `server/.env.example`.

### Verified

- New Phase 08A test file (`server/test/phase08a-request-logging.test.mjs`) covering id
  generation/echo/sanitization, access-log fields, the no-secrets guarantee, and authenticated
  user-id capture.
- Full backend suite: 223/223 passing.

## 08B — Backend ESLint Baseline

### Scope

Implemented (commit `5525c61`):

- `server/eslint.config.js` — ESLint 10 flat config: `@eslint/js` `recommended` + Node globals +
  `sourceType: 'module'`, plus a single consistency rule (`eqeqeq`, smart). No prettier or stylistic
  packs — a practical, bug-focused baseline, not a style system.
- Covers `server/src`, `server/test`, `server/scripts`, and the config itself.
- Dev dependencies `eslint`, `@eslint/js`, `globals`; `npm run lint` script (`eslint .`).
- Behavior-preserving fixes for recommended-level findings (unused imports/bindings/helpers and
  dead assignments removed). No runtime behavior change.

### Verified

- `npm run lint`: 0 errors / 0 warnings.
- Full backend suite unchanged: 223/223.

## Definition of Done

- Phase 08 increments are recorded in this roadmap and in `CLAUDE.md`.
- Logging/correlation-ID behavior and the lint command are documented in README and `.env.example`.
- `npm run lint`, `npm run test:unit`, and `npm test` all pass.

---

# 13. Phase 10 — Commercialization Foundation

## Objective

Phase 10 is an owner-directed extension approved after the V1 completion gate, beyond the original
Phase 00–07 plan. It prepares the backend for future SaaS subscriptions and paid plans WITHOUT
implementing payments. It is delivered in approved lettered increments; each is recorded here with
its scope and verified status when it completes.

## 10A — Commercialization Foundation

### Scope

Implemented and committed (`99e26ad`):

- `Business.planCode` — which catalog plan a business is on. Defaults to `FOUNDATION` (the
  unlimited V1 baseline), so existing and newly registered businesses keep current behavior;
  pre-Phase-10 documents without the field resolve to `FOUNDATION`.
- Centralized plan definitions and feature limits in `server/src/constants/plans.js` — the `PLANS`
  catalog, canonical `PLAN_FEATURES`, and `resolvePlan` (lenient fallback to the default plan so an
  unknown code never locks a tenant out).
- Business-level entitlement checks in `server/src/services/entitlement.service.js` —
  `getBusinessPlan(businessId)`, `assertBusinessEntitled(businessId, feature, { usage })`, and the
  pure decision core `decideFeature`. Server-authoritative: `businessId` comes from the session, the
  tenant is verified ACTIVE (`assertActiveBusiness`), and decisions fail closed per feature.
- `server/test/phase10-commercialization.test.mjs` — catalog + decision-core unit tests and
  DB-backed tests for planCode defaulting, capped-plan enforcement, tenant isolation, and
  fail-closed behavior.

### Explicitly Deferred

The following are NOT implemented and remain Future Development features:

- Subscriptions and the billing lifecycle (plan periods, renewals, status)
- Payment providers and payment processing
- AI usage metering / quotas
- Paid-plan enforcement on any route or business rule

Phase 10 only defines plan state and the entitlement-check primitive a future billing flow will
drive. No V1 route or business rule is gated and nothing is charged.

### Verified

- New Phase 10 test file covering catalog integrity, the entitlement decision matrix, planCode
  defaulting, capped-plan enforcement, tenant isolation, and fail-closed behavior.
- `npm run lint`: 0 errors / 0 warnings.
- Full backend suite: 240/240 (was 223/223 before Phase 10A).

## 10B — Documentation Close-out

### Scope

Documentation only — records Phase 10 in `CLAUDE.md`, this roadmap, and `README.md`. No application
code, tests, mobile code, dependencies, or configuration changed.

### Verified

- `npm run lint`, `npm run test:unit`, and `npm test` pass (unchanged — documentation-only change).
- `git diff` confirms only the three documentation files changed; the approved Phase 10A code is
  unchanged.

## Definition of Done

- Phase 10 increments are recorded in this roadmap, in `CLAUDE.md`, and in README.
- Deferred items (subscriptions / billing lifecycle / payment providers / AI usage metering /
  paid-plan enforcement) are stated as deferred.
- The V1 completion status is preserved.
- `npm run lint`, `npm run test:unit`, and `npm test` all pass.

---

# 14. Phase 11 — Inventory Intelligence & Alerts

## Objective

Phase 11 is an owner-directed extension approved after Phase 10, beyond the original Phase 00–07 plan
and the V1 completion gate. It turns stock data the V1 core already tracks into read-only decision
support — per-business inventory-health counts and a "what needs restocking" answer — surfaced
through the existing dashboard API, the product API, the MANAGER+ mobile dashboard, and the read-only
AI assistant. It is delivered in approved lettered increments; each is recorded here with its scope
and verified status when it completes. Phase 11 adds no data-model change, no new dependency, no
forecasting/purchasing, and no AI write action.

## 11A — Inventory Intelligence & Alerts

### Scope

Implemented (approved; commit `fe1b21d`):

- Shared stock-status vocabulary and pure classifier (`server/src/constants/stockStatus.js`):
  `STOCK_STATUSES` (IN_STOCK / LOW_STOCK / OUT_OF_STOCK) and `classifyStockStatus(available,
  minimumStock)` implementing the §19 semantics — OUT when available ≤ 0, LOW when available ≤
  minimumStock, IN when available > minimumStock.
- Inventory health in the dashboard summary (`dashboard.service.js`): the dashboard now reports a
  healthy **in-stock** count alongside active products, total on-hand quantity, low-stock, and
  out-of-stock. In-stock is the exact complement of low among the same ACTIVE-product set
  (`inStockProducts = totalProducts − lowStockProducts`), so it needs no extra query and can never
  disagree with the low count.
- Reorder-needed endpoint `GET /api/products/reorder` (`product.service.js` `listReorder` + products
  controller/route): ACTIVE products whose summed availability is at or below their `minimumStock`,
  each item flagged OUT_OF_STOCK vs LOW_STOCK, out-of-stock first, with `q`/category filters and the
  standard pagination envelope. It reuses the same availability join as the product stock lists so
  every surface agrees (verified equal to the dashboard low count).
- Read-only AI tool `getReorderNeededProducts` (`services/ai/tools.js`): the tool set grew from 8 to
  9. Permissioned (INVENTORY_VIEW) and business-isolated like its siblings, it returns `{ count,
  items }` so the assistant can answer "what needs restocking", "which products are out or low in
  stock", and how the inventory is doing. It can never write.
- Mobile dashboard (MANAGER+, `mobile/app/(app)/dashboard.js` + `productsApi.reorder`): an
  "Inventory health" tile row (In stock / Low stock / Out of stock / Active products / Total on-hand
  quantity) and a compact "Needs restock" preview of the worst restock candidates (top 5; each row
  taps into product detail for stock-in). The preview is secondary — a failure never blocks the
  summary. No new screen; no redesign.

### Explicitly Out of Scope

Nothing below was added; each remains a Future Development feature:

- AI write actions, forecasting, demand prediction, and purchase recommendations
- Supplier management and automated purchasing
- RAG / vector search

### Verified

- New Phase 11 test file (`server/test/phase11-intelligence.test.mjs`, classified MIXED) covering
  the classifier boundary matrix (incl. `minimumStock = 0`), the reorder endpoint (ACTIVE
  at-or-below-min only, OUT/LOW tags, worst-first, q + pagination), dashboard health consistency
  (`inStockProducts == totalProducts − lowStockProducts`), cross-business isolation, STAFF/OWNER
  RBAC, and the read-only restock tool (incl. rejecting a model-supplied `businessId`).
- `npm run lint`: 0 errors / 0 warnings.
- DB-free unit run: 106 passed / 10 skipped / 0 failed (Phase 11 classifier units included).
- Full backend suite: 257/257 passing (was 240/240 before Phase 11A).
- Mobile: `npx expo export` bundles cleanly for Android and iOS (bundle/type sanity check).

## 11B — Documentation Close-out

### Scope

Documentation only — records Phase 11 in `CLAUDE.md`, this roadmap, and `README.md`. No application
code, tests, mobile code, dependencies, or configuration changed.

### Verified

- `npm run lint`, `npm run test:unit`, and `npm test` pass (unchanged — documentation-only change).
- `git diff` confirms only the three documentation files changed; the approved Phase 11A code is
  unchanged.

## Definition of Done

- Phase 11 increments are recorded in this roadmap, in `CLAUDE.md`, and in README.
- Phase 11 stays read-only: no AI write action, forecasting, purchasing, or new data model.
- The V1 completion status and the Phase 10 status are preserved.
- `npm run lint`, `npm run test:unit`, and `npm test` all pass.

---

# 15. Phase 14A — User Management Foundation

## Objective

Phase 14A is an owner-directed foundation extension approved after Phase 13 (the current V1 feature
baseline), beyond the original Phase 00–07 plan. The RBAC layer has always defined `users.manage` but
no route exposed it — a business could not create ADMIN/MANAGER/STAFF accounts or disable a departing
employee through the product. This phase delivers the secure, business-scoped User Management API for
OWNER/ADMIN that closes that gap, reusing the existing permission key, `User` model (role/status
enums + global unique email index), validation, error, audit, and bcrypt conventions. Delivered as a
single approved increment; committed as `5b2cf66`.

## Scope

Implemented and committed (`5b2cf66`):

- `/api/users` routes — `GET /` (list, paginated with `q` on name/email and `status` filter),
  `POST /` (create), `GET /:id`, `PATCH /:id` (role and/or status). Every route requires
  `requireAuth` + `requirePermission(users.manage)`.
- `users.service.js` carries the authoritative cross-role rules, applied after tenant scoping:
  business context always comes from the authenticated session (a client `businessId` is never
  accepted, and a foreign id is a 404, never a leak); no OWNER can be created or assigned; no user
  can change their own role/status (`CANNOT_MODIFY_SELF`); the OWNER account is immutable through
  the API (`OWNER_IMMUTABLE`); and an ADMIN can neither create, assign, nor modify another ADMIN
  (`ADMIN_RESTRICTED` — ADMIN creates/assigns MANAGER or STAFF only).
- ADMIN granted `users.manage` in the server RBAC matrix (deliberate spec §7 change — ADMIN
  previously had no user management; unit tests updated accordingly). MANAGER/STAFF still hold no
  user-management permission.
- Create validates name/email/password via the shared auth helpers and a role in
  ADMIN/MANAGER/STAFF; passwords hashed with bcryptjs (10 rounds, the same cost as registration);
  email uniqueness pre-checked then E11000-caught → `409 EMAIL_IN_USE` (global index).
- Update accepts `role` and/or `status` (ACTIVE/DISABLED), at least one required. Disabling takes
  effect instantly because `requireAuth` reloads user status per request — the disabled user's login
  and every existing JWT are rejected with `403 ACCOUNT_DISABLED`; re-enabling restores access.
- Responses reuse `toPublicUser` (never a password hash). `USER_CREATED` / `USER_UPDATED` audit rows
  with `entityType: 'USER'` and secret-free metadata.
- `NON_OWNER_ROLES` constant and `validateUserCreate` / `validateUserUpdate` in `validate.js`; new
  audit constants; the mobile permissions mirror gained `USERS_MANAGE` for ADMIN and a
  `canManageUsers` predicate (no mobile UI this phase).

### Explicitly Out of Scope

No invitations or email sending, no password reset/change, no billing/subscriptions, no hard delete,
no name/email editing, no OWNER creation/assignment, and no mobile user-management screens. Phase 13
(suppliers, purchase orders, receiving) remains at the 13C/13D baseline; this phase builds on it
without changing its scope. The roadmap's earlier Phase 12/13 entries were never added as sections
(pre-existing gap) and are not backfilled here.

### Verified

- New `server/test/phase14-users.test.mjs` (classified MIXED) covers RBAC (no token 401, STAFF/
  MANAGER 403, OWNER/ADMIN pass), tenant isolation (list scoping, foreign get/patch → 404, client
  businessId ignored), self-modification, OWNER immutability, ADMIN restrictions, duplicate emails
  (same + cross business), disabled-user login/JWT revocation and re-enable, invalid role/status
  validation, the bcrypt round-trip, and the USER_CREATED/USER_UPDATED audit rows. The Phase 03 RBAC
  unit tests were updated for the ADMIN `users.manage` grant and `NON_OWNER_ROLES`.
- `npm run lint`: 0 errors / 0 warnings.
- DB-free unit run: 107 passed / 16 skipped / 0 failed (Phase 14A users suite skips in unit mode as
  a DB-backed suite; the updated Phase 03 RBAC units run).
- Full backend suite: 332/332 passing (was 312/312 before Phase 14A).

## Definition of Done

- The Phase 14A increment is recorded in this roadmap, in `CLAUDE.md`, and in the specification
  (spec §7 ADMIN capabilities and §31 API structure).
- User management is OWNER/ADMIN-only, business-scoped, and server-enforced; the cross-role
  protections (no OWNER, no self-change, no ADMIN-to-ADMIN) are covered by tests.
- `npm run lint`, `npm run test:unit`, and `npm test` all pass.
- Committed as `5b2cf66`; nothing pushed.

---

# 16. Phase 15 — Account Security & Profile Management

## Objective

Phase 15 is an owner-directed account-security increment approved after Phase 14B (the current V1
feature baseline), beyond the original Phase 00–07 plan. Authentication (Phase 03) could create an
account but never let a user maintain it: there was no way to change a compromised or forgotten
password, and no way to correct a display name. Phase 15 closes that gap with two self-service
endpoints plus the minimum mechanism that makes a password change actually mean something — a
server-side invalidation of every token issued before it — WITHOUT introducing a session store.
Delivered as a single approved increment; committed as `1124834`.

## Scope

Implemented and committed (`1124834`):

- `POST /api/auth/change-password` — `{ currentPassword, newPassword }`, `requireAuth`. The current
  password is verified against the stored bcrypt hash **before** anything changes (`400
  INVALID_CURRENT_PASSWORD` on a wrong one, with no mutation); on success the hash is replaced at the
  same cost as registration and `User.passwordChangedAt` is stamped with `now`. No new token is
  issued — the client signs in again with the new password.
- `PATCH /api/auth/me` — `{ name }`, `requireAuth`. Updates **only** the caller's name. The user id
  comes exclusively from `req.user.id`, never from the payload; every field outside `name` is
  rejected with `400 VALIDATION_ERROR` rather than silently ignored; the response reuses
  `toPublicUser` (never a password hash).
- `User.passwordChangedAt` (new field, `default: null`). `requireAuth` compares the token's `iat` —
  integer Unix **seconds**, the granularity `jsonwebtoken` signs at — against
  `Math.floor(passwordChangedAt / 1000)` with a strict `<`, and rejects strictly older-second tokens
  with `401 SESSION_INVALIDATED`. A token minted in the **same** second as the change stays valid,
  which is exactly the fresh login that follows a change. `null` means never changed, so every
  pre-existing user is unaffected and no migration is needed.
- That is the entire invalidation mechanism: **no session store, no token denylist, no new
  dependency**. It composes with — and does not replace — the Phase 07B business-status revocation,
  which is unchanged.
- `validateChangePassword` / `validateMeUpdate` in `validate.js` (the latter a strict allowlist).
  Mobile gains a change-password screen and an edit-name screen reached from Profile, plus the
  `changePassword` / `updateMe` API wrappers.

### Explicitly Out of Scope

No password reset or "forgot password" flow, no email or invitation sending, no session listing or
per-device revocation, no refresh tokens, no email/role/status editing through `/me`, no multi-factor
authentication, and no change to register/login, RBAC, or tenant isolation. Owner-held `_layout.js`
and `SignOutIcon.jsx` untouched. Phase 12/13/14B roadmap sections remain a pre-existing gap (as noted
in the Phase 14A section) and are not backfilled here.

### Verified

- New `server/test/phase15-account-security.test.mjs` (classified MIXED; DB-backed, 7 cases) over the
  real HTTP app covers the authentication requirement on both endpoints, change-password payload
  validation, a wrong current password (`INVALID_CURRENT_PASSWORD`, nothing changed), the full
  invalidation lifecycle (old JWT dead, old password dead, new password + new JWT work), the
  deterministic second-granularity boundary (only strictly older-second tokens are revoked), the
  `/me` name update, and rejection of every non-`name` field.
- `npm run lint`: 0 errors / 0 warnings.
- Full backend suite: 339/339 passing — the figure the Phase 16 section records as its own starting
  point.

## Definition of Done

- The Phase 15 increment is recorded in this roadmap and in the README API table + Phase Status.
- A password change revokes every previously issued JWT without a session store; the comparison is
  same-second-safe and is covered by a dedicated boundary test.
- Profile updates are name-only, session-identified, and strict-allowlist validated.
- Committed as `1124834`; nothing pushed.

### Superseded in part by Phase 26A

Two statements above describe the system as it stood before Phase 26A and no longer hold: there **is**
now a server-side session store, and per-device session revocation now exists (see §27). What Phase 15
established is unchanged and still in force — a password change still revokes every session of that
user, by the same `iat`-versus-`passwordChangedAt` comparison at the same second granularity — and the
`SESSION_INVALIDATED` path is deliberately kept distinct from the `SESSION_REVOKED` one so the two
causes remain tellable apart.

---

# 17. Phase 16 — Audit Trail Viewer (read-only governance)

## Objective

Phase 16 is an owner-directed extension approved after Phase 15. The audit write path has been in
place since Phase 04 — every significant write (categories, locations, suppliers, purchase orders,
inventory movements, and since 14A user create/role/status changes) records a business-scoped
`AuditLog` row with a "who/what/entity/when" shape (spec §17). But there was **no read path**: no
`/api/audit` route, no controller, no mobile screen — the system recorded everything and hid it.
Phase 16 delivers the read side: a read-only, business-isolated, RBAC-gated audit trail viewer for
OWNER/ADMIN. Read-only by design — no write routes, no model change, no new dependency.

## Scope

Implemented and committed (`ddea22e`):

- `GET /api/audit` — newest-first, paginated `{ items, page, limit, total, totalPages }`. Requires
  `requireAuth` + a new `requirePermission(audit.view)`. Filters: `action` (validated against
  `AUDIT_ACTIONS`), `entityType` (`AUDIT_ENTITY_TYPES`), `userId`, ISO `from`/`to` (with `to >= from`),
  and `q` (action/entityId text). Unknown filter values are rejected `400 VALIDATION_ERROR`, never
  silently ignored.
- `audit.service.listAudit` — business context comes exclusively from the authenticated session (a
  client `businessId` is ignored; cross-business rows are unreachable). `.populate('userId', 'name')`
  resolves the actor. Returns a strict whitelisted DTO `{ id, action, entityType, entityId, actor,
  metadata, createdAt }`; system rows with no `userId` return `actor: null`.
- New `AUDIT_VIEW ('audit.view')` permission granted to **OWNER + ADMIN only** in the server RBAC
  matrix (MANAGER/STAFF hold no audit permission → 403). Mirrored in the mobile permissions mirror
  (`canViewAudit`) — the backend stays authoritative.
- Mobile: `mobile/app/(app)/audit.js` (OWNER/ADMIN gate + AccessDenied for others, self-declared
  `<Stack.Screen>`, q search + entityType chips, `usePagedList`/`useRefetchOnFocus`) and an "Audit
  Log" dashboard tile gated by `canViewAudit`. The owner-held `_layout.js` / `SignOutIcon.jsx` are
  untouched.

### Explicitly Out of Scope

No write/delete of audit rows, no audit detail screen, no password reset, no invitations, no
`/api/businesses`, no mobile supplier/PO management, no reports/analytics, no stock transfers, no
entitlement enforcement, no `api/transactions` standalone route. No new dependencies. Owner-held
files untouched. Phases 12/13/14B roadmap sections remain a pre-existing gap (as noted in the
Phase 14A section) and are not backfilled here.

### Verified

- New `server/test/phase16-audit-viewer.test.mjs` (classified MIXED) covers RBAC (401/403/200),
  tenant isolation (foreign trails never leak; a planted `businessId` is ignored), every filter
  (action, entityType, userId, from/to incl. bad ranges, q) with unknown values rejected 400,
  pagination envelope + newest-first ordering, actor population (populated name; `actor: null` for
  system rows), and DTO hygiene (strict whitelist, no password/hash/sensitive fields).
- `npm run lint`: 0 errors / 0 warnings.
- DB-free unit run: 107 passed / 18 skipped / 0 failed (Phase 16 audit suite skips in unit mode as a
  DB-backed suite).
- Full backend suite: 350/350 passing (was 339/339 before Phase 16).
- Mobile: `npx expo export` for android and iOS both green.

## Definition of Done

- The Phase 16 increment is recorded in this roadmap, in `CLAUDE.md`, in the README API table +
  Phase Status, and in the specification (§31 API structure).
- The trail is OWNER/ADMIN-only, business-isolated, read-only, and server-enforced; filters and the
  DTO whitelist are covered by tests.
- `npm run lint`, `npm run test:unit`, and `npm test` all pass.
- Committed as `ddea22e`; nothing pushed.

---

# 18. Phase 17 — Mobile Supplier & Purchase Order Management

## Objective

Phase 17 is an owner-directed extension approved after Phase 16. The supplier and purchase-order
backend has been complete and server-tested since Phase 13 (suppliers CRUD + archive on the shared
reference stack; POs with numbering, DRAFT-only editing, issue, cancel, and claim-first receiving),
but mobile was read + receive only (Phase 13D). Phase 17 delivers the mobile management half: a
Suppliers screen (create/edit/archive/restore incl. contact fields) and the full PO lifecycle on
mobile (create DRAFT, edit DRAFT, issue, cancel) over the existing Phase 13 API. **Zero backend
changes** — no model, route, controller, service, validator, RBAC, audit-event, or server-test
change. Read + receive behaviour is preserved exactly.

## Scope

Implemented and committed (`9249633`):

- `mobile/app/(app)/suppliers.js` — Suppliers manage screen reusing the shared `RefManage` pattern
  (search, Active/Archived chips, pagination, archive/restore) with an additive `fields` prop that
  adds `contactName` / `phone` / `email` to the create/edit modal and the list rows. Categories and
  Locations pass no `fields` and behave unchanged.
- `mobile/lib/api.js` — `suppliersApi` (list/get/create/update/archive/restore with contact fields)
  via the shared reference wrapper; `purchaseOrdersApi` gains `create`, `update` (PATCH), `issue`,
  `cancel` — each mapped to the existing Phase 13 endpoints with the exact backend error codes.
- `mobile/lib/permissions.js` — mirror adds `SUPPLIERS_MANAGE ('suppliers.manage')` and
  `SUPPLIERS_VIEW ('suppliers.view')` in lock-step with the server matrix (ADMIN + MANAGER manage,
  every role views) and exports `canManageSuppliers` / `canViewSuppliers`. UI-gating only; the
  backend stays authoritative.
- `mobile/components/PoForm.jsx` — shared PO create/edit form: supplier + location searchable
  pickers, optional `expectedAt` (YYYY-MM-DD text input — verified the server's `optionalDate`
  accepts it), optional notes, and a line-items editor (product picker, whole quantity ≥ 1, optional
  unit cost ≥ 0, no duplicate products, ≤ 200 lines). Mirrors `validatePurchaseOrder` for UX;
  server 400 field problems and the exact PO mutation codes (`PO_NOT_DRAFT`, `PO_STATE_CONFLICT`,
  `PO_CANCELED`, `PO_ALREADY_RECEIVED`, `PO_ALREADY_OPEN`, `PO_ALREADY_CANCELED`, `PO_NUMBER_CONFLICT`,
  `SUPPLIER_NOT_FOUND`, `SUPPLIER_ARCHIVED`, `PRODUCT_*`, `LOCATION_*`) map to friendly messages.
- `mobile/app/(app)/purchase-orders/new.js` and `[id]/edit.js` — create (DRAFT) and edit (DRAFT-only)
  screens, gated by `purchase-orders.manage` with `AccessDenied` for other roles; edit fetches the
  order fresh and refuses non-DRAFT states (mirroring `PO_NOT_DRAFT`).
- `mobile/app/(app)/purchase-orders/[id]/index.js` — manage row (Edit + Issue on DRAFT, Cancel on
  DRAFT/OPEN) gated by `purchase-orders.manage`, each with a confirm dialog and a refetch after the
  mutation so the status/actions re-render. The existing Receive flow is untouched.
- `mobile/app/(app)/dashboard.js` — unconditional "Suppliers" tile (every role views suppliers).
- Docs: this roadmap section (tail sections renumbered), `CLAUDE.md` phase list, README supplier/PO
  API tables (fills the pre-existing Phase 13 doc gap), and spec §31 API structure.

### Explicitly Out of Scope

No backend/model/RBAC/audit/test changes of any kind. No supplier deep screen beyond the manage
modal; no supplier deletion (archive only). No PO deletion, no PO number editing, no editing
OPEN/RECEIVED/CANCELED orders, no new PO status (partial receiving remains per-line while OPEN),
no date-range PO filters. No new dependencies (no date picker). Phases 12/13/14B/15 roadmap
sections remain a pre-existing gap and are not backfilled here. The "New PO" entry point on the PO
list header was contemplated in planning as optional and is not part of this increment — the create
screen is reachable via deep link and the dashboard's Purchase Orders tile; adding a list-header
button is a follow-up decision. Owner-held files (`_layout.js`, `SignOutIcon.jsx`) untouched.

### Verified

- No server file changed: the full backend suite remains 350/350 and `npm run lint` stays 0/0,
  re-run as a regression sanity check to prove Phase 17 left the server untouched.
- Mobile: `npx expo export` for android and iOS both green.
- Android emulator smoke (AVD InventoryAI + Expo Go): OWNER/ADMIN/MANAGER supplier CRUD + archive/
  restore; OWNER/ADMIN/MANAGER PO create (DRAFT) → edit → issue → partial/full receive → auto-
  RECEIVED, and cancel from DRAFT/OPEN; STAFF supplier/PO view-only with manage affordances hidden
  and direct nav denied; invalid transitions return the existing backend 409 codes; business
  isolation spot-check; Phase 16 audit viewer shows `SUPPLIER_CREATED` and `PURCHASE_ORDER_ISSUED`
  rows with the correct entity and the logged-in actor. Evidence captured under `.smoke/p17-*`
  (untracked).

## Definition of Done

- OWNER/ADMIN/MANAGER can manage suppliers and POs from the app; STAFF remains view-only for
  supplier/PO management and can still receive stock.
- The full PO lifecycle works on mobile (create → edit DRAFT → issue → receive → auto-RECEIVED, and
  cancel from DRAFT/OPEN); non-DRAFT edits are never offered and are rejected by the server
  (`PO_NOT_DRAFT`).
- Every mobile manage action is UI-gated by the permission mirror; the backend stays authoritative
  (403/409 on hand-crafted requests) and business-isolated (no client `businessId` anywhere).
- Receiving and the claim-first flow are unchanged; no `PARTIALLY_RECEIVED` status was introduced.
- `npm run lint` 0/0 and the full backend suite 350/350 (regression check only — no server change).
- Mobile android + iOS exports green; emulator smoke evidence captured in `.smoke/p17-*`, untracked.
- Docs updated (roadmap incl. renumbering, CLAUDE.md, README API table, spec §31); committed as
  `9249633`; nothing pushed.

# 19. Phase 18 — SaaS-style UI Foundation, Light/Dark Theme System & Readability

## Objective

Phase 18 is an owner-directed mobile UI extension approved after Phase 17. The mobile app has
accumulated many screens with ad-hoc inline styles and hardcoded colors, and it has always rendered
in a single light palette regardless of the device theme. Phase 18 delivers the foundation that
turns the app into a modern SaaS-style product surface: a semantic light **and** dark theme system,
reusable design primitives, an icon system, a readable dashboard hierarchy, and accessibility
improvements (44px+ touch targets, labeled icon controls, status conveyed through text/icon + color,
and layouts verified at increased system font sizes). Navigation remains the existing native-stack
(expo-router); adding a tab bar would have required touching the owner-held `(app)/_layout.js` and
is deferred. **Phase 18A is the foundation increment**: tokens, ThemeProvider, the 41-file
behavior-neutral `useTheme()` conversion, primitive polish, new primitives, and docs. Screen
redesigns that adopt the new primitives are later increments (18B+).

### Phase 18A Scope

Implemented and committed (`263b857`):

- `mobile/lib/theme.js` — semantic token set grows a full dark palette. `palettes = { light, dark }`
  with light/dark values for surfaces, text, brand, status, and stock-state chips. `colors` is kept
  as an alias for the **light** palette so the owner-held native-header chrome
  (`(app)/_layout.js`, `SignOutIcon.jsx`) keeps working unchanged. Shared scales (spacing, radius,
  type incl. new `stat` + `listTitle` tokens, shadows, duration) are scheme-independent. Light
  `textMuted` raised `#8A94A6` → `#667085` for WCAG AA.
- `mobile/lib/theme-context.jsx` — new `ThemeProvider` + `useTheme()`. Resolves scheme from the OS
  (`useColorScheme`) or a persisted user preference ('system' | 'light' | 'dark', stored via the
  already-installed `expo-secure-store`; no new dependency). Returns `{ colors, scheme, isDark,
  preference, setScheme, hydrated }`.
- `mobile/app.json` — `userInterfaceStyle: "automatic"`; `expo-system-ui` added (required by SDK 57
  for Android to honor the setting).
- `mobile/app/_layout.js` (root, modifiable) — app wrapped in `ThemeProvider`; `StatusBar` is
  scheme-aware (`light` text on dark theme, `dark` on light); root stack `contentStyle` uses the
  active `colors.background`.
- All 41 non-owner-held theme importers converted to `useTheme()` with memoized per-theme styles
  (`const createStyles = (colors) => StyleSheet.create({...})` + `const styles = useMemo(...)`).
  Light-mode values are unchanged — only where colors come from changed. Module-scope TONES/VARIANTS
  maps became functions of `colors`; module-scope helpers like `deltaTone` gained a `colors`
  parameter. Camera-surface whites in `scan.js` stay literal (they sit on the live camera feed).
  Owner-held `_layout.js` + `SignOutIcon.jsx` are byte-identical (sha256-verified).
- `mobile/components/icons.js` + `@expo/vector-icons` (15.0.2, SDK-matched) — semantic icon map
  (`add`, `search`, `scan`, `signOut`, …) so screens never reference raw glyph names.
- New primitives: `IconButton` (44px+ target, labelled), `SectionHeader`, `ListRow`, `StatCard`
  (large `stat` value token — 24/800), `Sheet` (shared bottom sheet; `SelectField` refactored onto
  it), `SearchField`, `ListScreen` (paged-list shell; adoption is 18B). `RefManage` keeps its inline
  sheet — its footer/button layout differs from `Sheet`, so forcing the swap would change light
  visuals.
- Primitive polish: `Button` gains `size` (md 46 / lg 52, both ≥ 44px) + optional `icon`;
  `Badge` text 11→12 and PO status badges get a leading status dot (state never conveyed by color
  alone); `Input`/`SelectField` show a primary focus ring; `ListState` empty/error states accept
  icons.
- Docs: this roadmap section, `CLAUDE.md` phase list, README, and a new `docs/DESIGN_SYSTEM.md`.

### Explicitly Out of Scope

No screen redesigns (list rows, dashboard cards, forms are re-themed, not re-laid-out — adoption of
the new primitives is 18B). No tab bar / new navigation. No backend, model, RBAC, audit, or
server-test change. No `allowFontScaling` disabling anywhere — native React Native font scaling is
left enabled and layouts were checked at increased system font sizes. No new navigation or
state-management dependency; `@expo/vector-icons` and `expo-system-ui` are the only new packages.

### Verified

- Mobile: `npx expo export` android and iOS both green (Ionicons + MaterialCommunityIcons fonts
  bundled).
- Protected owner-held files sha256-identical to their pre-18A state.
- Grep: no `import { colors }` from `lib/theme` remains except `SignOutIcon.jsx` (protected).
- Emulator smoke (light theme → dark theme → increased system font size) evidence in `.smoke/p18-18a-*`
  (untracked).

## Definition of Done

- The full app renders from the theme system: light and dark palettes resolve at runtime, the
  status bar follows the scheme, and a persisted preference survives restarts.
- Light-mode behavior and colors are unchanged after the 41-file conversion.
- Key information (quantities, stock/PO status, prices, primary actions) uses larger readable type;
  controls are ≥ 44px; icon-only controls have labels; status reads through text/icon + color.
- Layouts survive increased system font size without clipping primary actions (verified on the
  emulator).
- No backend/test changes; owner-held files untouched; android + iOS exports green.
- Committed as `263b857` after owner review of the Phase 18A QA report; nothing pushed.

---

# 18B. Phase 18B — Dashboard Redesign & Navigation Hierarchy

Phase 18B is the first adoption increment after the 18A foundation. It re-lays-out the dashboard on
the 18A primitives WITHOUT changing any data source, navigation target, or backend behavior: the
summary numbers, inventory-health section, "Needs restock" preview, and every existing route are
the same, presented with a clearer hierarchy.

### Phase 18B Scope

Implemented and committed (`3dd75dd`):

- `mobile/app/(app)/dashboard.js` — rebuilt on `StatCard` (large `stat` value token), `SectionHeader`,
  `ListRow`, `Icon`, `Button`, and `Card`, with a grouped navigation hierarchy so primary
  destinations read as first-class entries instead of a flat tile grid. Every existing route and
  permission gate is preserved; the underlying API calls are unchanged.
- `mobile/components/icons.js` — added the semantic icon names the new dashboard hierarchy needs.

### Explicitly Out of Scope

No list-screen redesigns (they are 18C). No tab bar / navigation-structure change. No backend,
model, RBAC, audit, or server-test change. No new dependency. Owner-held files (`_layout.js`,
`SignOutIcon.jsx`) untouched.

### Verified

- Mobile: `npx expo export` android and iOS both green.
- Protected owner-held files sha256-identical.
- Android emulator visual QA (light, dark, 130% and 160% system font scale): hierarchy, readability,
  ≥ 44px targets, status text + color, RBAC-gated entries, and navigation targets all PASS. Evidence
  under `.smoke/` (untracked).

## Definition of Done

- The dashboard presents the same information and the same destinations with a clearer hierarchy,
  built from the 18A primitives.
- Light and dark palettes and increased system font sizes all render without clipping.
- No backend/test changes; owner-held files untouched; android + iOS exports green.
- Committed as `3dd75dd` after owner approval; nothing pushed.

---

# 18C. Phase 18C — Core List Screens on the Design System

Phase 18C is the list-screen adoption increment. It migrates the three core list screens onto the
18A primitives so list rows share one visual grammar and key quantities stay readable for older
business users, WITHOUT changing behavior: identical API calls and query params, identical RBAC
gates, identical deep links, identical navigation targets, and identical loading/empty/error copy.

### Phase 18C Scope

- `mobile/components/ListScreen.jsx` — fixed a latent double-padding defect (the internal `Screen`
  applied its own `padded` inset on top of the `FlatList` content padding, yielding 32px instead of
  16px) by rendering the shell with `padded={false}`; added the missing `emptyAction` passthrough
  and an optional `loadingLabel` (defaults to the previous generic `'Loading…'`). Never rendered
  before this phase because `ListScreen` had no adopters.
- `mobile/components/ListRow.jsx` — added an optional `footer` slot so important quantities are not
  forced down to the smaller subtitle size, and an optional, purely presentational `titleStyle`
  override (used to keep the purchase-order number at its existing `fontWeight: 800` emphasis).
  Both are backward compatible; existing dashboard callers are unaffected.
- `mobile/components/Card.jsx` — `PressableCard` forwards extra props to the underlying `Pressable`
  so `accessibilityRole="button"` survives adoption (without this, migrated rows would silently lose
  their button role). Additive and backward compatible.
- `mobile/components/SearchField.jsx` — `autoCapitalize` becomes an optional prop (default `'none'`,
  the previous hardcoded value) so the PO-number search keeps its existing `'characters'` behavior.
- `mobile/app/(app)/products/index.js` — first migration; adopted `ListScreen`/`ListRow`/`SearchField`
  /`Chip`/`Button`/`PressableCard`/`Icon`. Search, status chips, stock-state chips, category/location
  filters, debounce, pagination, pull-to-refresh, focus refetch, and the `products.manage` gate are
  unchanged. The "New product" affordance keeps its existing right-aligned position.
- `mobile/app/(app)/inventory.js` — adopted the same primitives; low/out availability now renders as
  a body-size `footer` instead of being pushed into the 13px subtitle. The `?status=low|out` deep
  links, filter semantics, empty-state copy, and `ButtonRow` scan/PO actions are unchanged.
- `mobile/app/(app)/purchase-orders/index.js` — adopted the same primitives; the PO number keeps its
  existing emphasis via `titleStyle` and the ordered/received progress renders at body size. The
  `canViewPurchaseOrders` early-return gate, status filter, debounce, and empty-state copy are
  unchanged. No new "New purchase order" entry point was added (the dashboard quick action remains
  the entry point).
- Docs: this roadmap section, `docs/DESIGN_SYSTEM.md` adoption status, `CLAUDE.md` phase list.

### Explicitly Out of Scope

Core detail screens are 18D; secondary screens (Users, Audit, History, Categories, Locations,
Suppliers, Profile) are 18E. No new entry points or features. No backend, model, RBAC, audit, or
server-test change. No new dependency. No navigation or tab-bar change. Owner-held files
(`_layout.js`, `SignOutIcon.jsx`) untouched.

### Verified

See the Phase 18C QA report (static checks, android + iOS exports, emulator smoke across light/dark
and 130%/160% system font scale, protected-file hashes).

## Definition of Done

- The three core list screens render from the shared list primitives with one consistent row
  grammar, and key quantities/status read at body size or larger.
- Behavior is preserved exactly: API calls, query params, RBAC gates, deep links, navigation
  targets, retry/refresh/pagination, and loading/empty/error copy.
- No backend/test changes; owner-held files untouched; android + iOS exports green.
- Committed as `dac15c7`; nothing pushed.

---

# 18D. Phase 18D — Detail Screens on the Design System

Phase 18D is the detail-screen adoption increment. It brings the four record-detail screens onto the
18B/18C primitives so a detail screen reads like the dashboard and the lists it was opened from,
WITHOUT changing behavior: identical API calls and payloads, identical RBAC gates, identical
navigation targets, and identical loading/error/empty copy.

Note on method: unlike 18C, these screens were already converted to `useTheme()` + semantic tokens by
18A, so 18D is not a migration — it is adoption of the newer primitives (`SectionHeader`, `StatCard`,
the shared `ListRow` grammar) that post-date them. No shared primitive needed changing, so no file in
`mobile/components/` was touched.

### Phase 18D Scope

- `mobile/app/(app)/products/[id]/index.js` — stock rows adopt `Card` + `ListRow` (location icon,
  location title, availability in the `footer` at body size instead of the previous 12px caption);
  the barcode card header becomes a `SectionHeader` with the Internal badge in its `action` slot;
  "Stock"/"Move stock" become `SectionHeader`s. Product fields, the barcode/no-barcode conditionals,
  and all four handlers (`onToggleArchive`, `onGenerateBarcode`, `onPrintLabel`, `onShareLabel`) are
  unchanged. Stock rows deliberately remain non-tappable — no new entry point.
- `mobile/app/(app)/inventory/[id].js` — available/on-hand lead the screen as a 2-up `StatCard` grid
  (the dashboard's existing grid pattern), with the out-of-stock `danger` tone preserved via the
  StatCard `tone` prop; `Reserved` and the remaining metadata stay as definition rows; "Move stock"
  becomes a `SectionHeader`. Values and business meaning are unchanged.
- `mobile/app/(app)/purchase-orders/[id]/index.js` — received/remaining lead as a 2-up `StatCard`
  grid with `Ordered` preserved through the `sub` line ("of N ordered"); the PO number keeps its
  `h2` prominence and gains the `fontWeight: 800` weight family already used by the list screen; the
  four section headings become `SectionHeader`s; items adopt `ListRow` (product icon, SKU subtitle,
  ordered/received/remaining progress in the `footer` at body size, existing row separators kept via
  `style`); receipts adopt `Card` + `ListRow` with the received unit count at body size instead of
  12px caption. The pending-claims `Banner`, `statusNote`, `canViewPurchaseOrders` gate, and
  `onIssue`/`onCancel` are unchanged.
- `mobile/app/(app)/purchase-orders/[id]/receive.js` — **presentation only**. The "Receive quantities"
  heading becomes a `SectionHeader` and each line header becomes a `ListRow` (product icon, SKU
  subtitle, ordered/received context in the `footer` at body size); the quantity `Input` and its
  `name`/`error`/`helper` wiring are untouched. Every function is byte-identical: `str`,
  `offeredQuantity`, `receivableLines`, `defaultQuantities`, `entry`, `CODE_MESSAGES`, `load`,
  `onChangeQty`, `submit`, both early-return branches, and the `AccessDenied` guard. The claim-first
  workflow, quantities, validation, status transitions, concurrency handling, and the
  `RECEIVE_CONFLICT` partial-apply recovery are unchanged.
- Docs: this roadmap section, `docs/DESIGN_SYSTEM.md` adoption status, `CLAUDE.md` phase list.

### Explicitly Out of Scope

Secondary screens (Users, Audit, History, Categories, Locations, Suppliers, Profile, scan, AI) are
18E. No new primitive, no edit to any `mobile/components/` file, no new feature or entry point, no
new navigation. Owner-held files (`_layout.js`, `SignOutIcon.jsx`) untouched. No backend, model,
RBAC, audit, or server-test change. No new dependency. No `README.md` or
`docs/SYSTEM_SPECIFICATION.md` change.

### Verified

See the Phase 18D QA report (static checks, android + iOS exports, emulator smoke across light/dark
and 130%/160% system font scale, RBAC/navigation/validation branches, protected-file hashes, and the
frozen-logic diff evidence for the receive workflow). A real receive was NOT executed — it would
mutate inventory — so `submit()` is reported NOT EXERCISED.

## Definition of Done

- The four detail screens render from the shared primitives with the same row grammar, section
  headers, and key-quantity treatment as the dashboard and the 18C lists.
- Behavior is preserved exactly: API calls and payloads, RBAC gates, navigation targets, and
  loading/error/empty copy; the claim-first receive logic is byte-identical.
- No `mobile/components/` change; no backend/test change; owner-held files untouched; android + iOS
  exports green.
- Committed as `d3592fb`; nothing pushed.

---

# 18E. Phase 18E — Secondary Screens on the Design System

Phase 18E is the secondary-screen adoption increment, and the last 18x increment short of the
forms/auth pass. It brings the fifteen remaining routes onto the primitives established in
18A–18D so the app reads as one product rather than a set of independently styled screens. It is
presentation only: no route, API, permission, validation, navigation, or business-logic change.

### Phase 18E Scope

- Routes: `users/index.js`, `users/new.js`, `users/[id].js`, `audit.js`, `history.js`,
  `categories.js`, `locations.js`, `suppliers.js`, `profile.js`, `change-password.js`,
  `edit-name.js`, `scan.js`, `ai/index.js`, `ai/new.js`, `ai/[id].js`. `ai/new.js` and `ai/[id].js`
  already satisfied the pattern (`<Screen padded={false}><AiChat /></Screen>`) and were not touched.
- Components: `RefManage.jsx`, `UserForm.jsx`, `AiChat.jsx` — the three backing components named in
  the approved plan. `Chip.jsx` gained the required semantic selected state
  (`accessibilityState={{ selected }}`) and a 44px floor; `ListScreen.jsx` gained an additive
  `errorTitle` and `footer`. No other `mobile/components/` file changed.
- `RefManage.jsx` was rewritten onto `ListScreen`/`Card`/`ListRow`/`SearchField`/`Button`, and its
  edit `Modal` became a `Sheet` over the existing `SelectField` idiom. The create/update payload
  asymmetry is preserved: create omits blank fields, update forwards `''`.
- `AiChat.jsx` kept its optimistic append (the server `userMessage` is still ignored), gained the
  semantic `sparkles` icon in place of the 🤖 emoji, a theme-aware timestamp colour, and unpinned
  line heights. Its welcome title also gained `alignSelf: 'stretch'`, which repairs a pre-existing
  truncation (`textAlign: 'center'` alone let the parent shrink-wrap the title's box to its
  unwrapped width, clipping the line) — verified against `HEAD`, where the same defect reproduces.
- `scan.js` keeps every functional invariant: `RESCAN_IGNORE_MS`, the `captureLocked`/`lastScanned`
  refs, `rescan()` deliberately NOT clearing `lastScanned.current`, `lookup()`'s catch order,
  `loadStock`'s early return, and the full `router.push` param bags. The live-camera overlay keeps
  its fixed literals; the viewport behind the preview is pinned to `#000` instead of `colors.text`,
  which flashed near-white in dark mode.
- `history.js` keeps the U+2212 minus in `deltaText`, the `useActiveRef` option lists, and the
  `usePagedList` wiring; the pinned `lineHeight: 16` on the reason line was removed so the line
  reflows at large font scales.
- `audit.js` keeps its hook-before-view guard (the paged list is created before the `!view` check)
  and its exact `AccessDenied` string. `ai/index.js`'s known hooks-after-early-return was
  deliberately left in place, per the approved plan, and is reported as a known issue rather than
  silently restructured.
- Docs: this roadmap section, `docs/DESIGN_SYSTEM.md` (§6 scaling/reflow, selected state, dark mode;
  adoption status), `CLAUDE.md` phase list.

### Explicitly Out of Scope

Forms and auth screens (stock-in/out/adjust, `MovementForm`, `products/new`, `products/edit`,
`ProductForm`, `purchase-orders/new`, `purchase-orders/edit`, `PoForm`, login/register,
`AuthLayout`, `app/index.js`) are deferred to Phase 18F. Owner-held `_layout.js` and
`SignOutIcon.jsx` are untouched. No backend, model, RBAC, audit, or server-test change. No new
dependency. No new route. No change to `lib/theme.js` — the dark-mode placeholder contrast finding
below is therefore reported, not fixed.

### Verified

Android and iOS exports green. Emulator smoke on all fifteen routes across light/dark and
100%/160% system font scale: no clipped text, no edge overflow, no undersized touch target, no
low-contrast text. `grep` confirms no `allowFontScaling` / `maxFontSizeMultiplier` anywhere. The
protected-file hashes for `_layout.js` and `SignOutIcon.jsx` match the pinned values.

### Known Issues (reported, not fixed)

- `lib/theme.js` `palettes.dark.placeholder` (`#7A8494`) measures 3.89:1 on `surfaceMuted` and
  4.41:1 on `surface` — below the 4.5:1 AA floor for normal text. This is a Phase 18A token that
  reaches every screen committed since 18A, so correcting it is a cross-phase change outside this
  increment's scope. Placeholders are supplemental here: every field also carries a real label.
- `ai/index.js:37-39` creates hooks after an early return. Frozen by the approved plan; it is not a
  runtime violation under the React version in use, and restructuring it would be a
  behavior-adjacent lifecycle change.
- `components/AccessDenied.jsx` still renders a 🔒 emoji. It is outside the approved component list
  and is shared with already-committed 18B–18D screens.
- ~~The native stack header is unthemed, so it stays light in dark mode.~~ **Fixed — see the
  follow-up below.**

### Follow-up Fix — Themed Native Header (after the 18E commit)

The white header over a dark app was traced to `(app)/_layout.js:6` importing the **static light**
`colors` alias and binding `headerStyle.backgroundColor` to it. The alias is not reactive, so the
bar was `#FFFFFF` in both themes. `components/SignOutIcon.jsx` had the same defect (its ⎋ chip bound
to the light `surface`, and it mounts as `headerRight` on Inventory, so the two files are coupled).

This was deliberate Phase 18A fallout, not an 18E regression: 18A added dark mode, kept `colors` as
the light alias so the two owner-held files kept working with zero edits, and froze both. The owner
**lifted that freeze** to fix it.

- `(app)/_layout.js` — `useTheme()` replaces the static import, so `headerStyle`,
  `headerTitleStyle`, `headerTintColor` and `contentStyle` all resolve per theme. Added the missing
  `<Stack.Screen name="suppliers" options={{ title: 'Suppliers' }} />` (the only route with no title
  anywhere, so it had been rendering the auto-derived lowercase "suppliers"). The six other routes
  that self-declare `<Stack.Screen options={{ title }} />` — audit, change-password, edit-name,
  users/index, users/new, users/[id] — were left alone: they set the title only and now inherit the
  themed options, so adding duplicate layout entries would have created a second source of truth.
- `components/SignOutIcon.jsx` — `useTheme()` + memoized `createStyles`. The fill moved from
  `surface` to `surfaceMuted`, because the header background *is* `surface`: the chip would
  otherwise be invisible in both themes.
- `lib/theme.js` — `colors` is now unimported by the whole app. The alias and its doc comment were
  kept (not deleted) as a reference value; the comment now warns against callers instead of
  describing a freeze that no longer exists.
- Verified on the emulator: dark header `#1B1E26` / light `#FFFFFF`, ⎋ chip `#242834` on dark and
  `#EEF1F7` on light, `Suppliers` title correct, AI Assistant / Inventory / Users headers coherent.
  Android + iOS exports green.

## Definition of Done

- The fifteen secondary routes render from the shared primitives, with the same row grammar, section
  headers, and key-quantity treatment as the dashboard, the 18C lists, and the 18D details.
- Behavior is preserved exactly: API calls and payloads, RBAC gates, navigation targets, validation
  order, and loading/empty/error copy.
- `lib/theme.js`'s token values, the server, and the server tests are untouched; android +
  iOS exports green. (The `(app)/_layout.js` / `SignOutIcon.jsx` freeze was lifted in the follow-up
  fix above, which is a separate commit.)
- Committed as `979968a`; the themed-native-header follow-up is `04a2b3d`. Nothing pushed.

---

# 18F. Phase 18F — Forms & Auth Screens on the Design System

Phase 18F is the last 18x increment: the forms and authentication screens adopt the primitives
established in 18A–18E, so the app reads as one product from the first screen a user ever sees
(login) through to the busiest form (a multi-line purchase order). Structure and presentation only —
no route, API, permission, validation, navigation, or business-logic change.

### Phase 18F Scope

The approved scope is **16 source files, 3 documentation files, and this plan document (20 files
total)**.

- Components (4): `ProductForm.jsx`, `MovementForm.jsx`, `PoForm.jsx`, `AuthLayout.jsx`.
- Routes (10): `login.js`, `register.js`, `index.js`, `products/new.js`, `products/[id]/edit.js`,
  `stock-in.js`, `stock-out.js`, `adjust.js`, `purchase-orders/new.js`,
  `purchase-orders/[id]/edit.js`.
- Owner-approved additions (2): `lib/theme.js` (D1) and `components/AccessDenied.jsx` (D2).

Shape of the change:

- The three form components each **own their `Screen`** (scroll, `KeyboardAvoidingView`, safe-area
  padding) and every route renders them bare. Previously the route wrapped the form, which made the
  shell the route's concern and left the form unusable anywhere else. No route nests a second
  `Screen` — that would double both the safe-area insets and the keyboard offset.
- `PoForm`'s per-line `<View style={lineCard}>` becomes `Card`, its "Items" heading becomes
  `SectionHeader`, and "Add line" / "Remove line" gain the semantic `add` / `remove` icons.
- `MovementForm`'s availability line becomes a `StatCard`, and its locked-product block becomes a
  `Card`; `PoForm`'s and `MovementForm`'s pinned `lineHeight: 18` hints were removed so they reflow
  at large font scales.
- `AuthLayout` gained a centred brand block that reflows, with `alignSelf: 'stretch'` on the centred
  text (the §6.1 technique) so a wrapped tagline does not shrink-wrap off-centre.
- `AccessDenied`'s 🔒 emoji becomes the semantic `Icon name="lock"` (D2) — same meaning, same
  accessibility semantics, no new icon implementation.
- `lib/theme.js` dark `placeholder`: `#7A8494` → `#8A93A6` (D1).

`products/[id]/edit.js` and `purchase-orders/[id]/edit.js` are in the expected file list but needed
**no change** — both already render their form bare (the PO one only wraps `Screen` around the
non-DRAFT `EmptyState`, which is not a form), so they were verified rather than edited. They are
reported as deliberate no-change entries, not as dropped scope.

### D1 — Dark placeholder contrast

The 18E report flagged `palettes.dark.placeholder` (`#7A8494`) at 4.41:1 on `surface` and 3.89:1 on
`surfaceMuted`, both below the 4.5:1 AA floor for normal text. The owner approved correcting it, on
the conditions that the value be **measured rather than copied from the plan**, that it stay
centralised in the theme system, and that no per-screen colors be introduced.

Measured with the WCAG relative-luminance formula:

| Value | on `surface` `#1B1E26` | on `surfaceMuted` `#242834` |
| --- | --- | --- |
| `#7A8494` (old) | 4.41:1 | 3.89:1 |
| **`#8A93A6` (chosen)** | **5.40:1** | **4.76:1** |

`#8A93A6` clears AA on every surface a placeholder sits on — including `surfaceMuted`, the harder
case, which search fields use — while staying dimmer than `textMuted` (`#98A1B3`, 5.66:1) so
placeholders remain visually subordinate to real values. Confirmed on-device: the placeholder glyphs
sample `#8A93A6`, and `#7A8494` no longer appears as a glyph color anywhere.

The **light** `placeholder` (`#8A94A6`) was measured at the same time and is also below AA (3.06:1
on white, 2.70:1 on `surfaceMuted`). It was never flagged by 18E, D1 authorised the dark token only,
and changing it would alter every light-theme input shipped since 18A — so it is **reported for an
owner decision, not changed**. See `docs/DESIGN_SYSTEM.md` §7.

### Explicitly Out of Scope

Owner-held `_layout.js` and `SignOutIcon.jsx` (untouched); the light `placeholder` and
`textMuted`-on-`surfaceMuted` contrast findings; the known PO-**list** 160% search-placeholder
clipping; the hooks-after-early-return in `ai/index.js`. No backend, model, RBAC, audit, DTO, or
server-test change. No new dependency, no route, no navigation change. No new hash-record file (D3
declined).

### Verified

Android and iOS exports green. Emulator pass over the 18F routes and components across light/dark
and 100%/160% system font scale: no clipped text, no edge overflow, no undersized touch target, no
low-contrast text. RBAC gates re-checked for STAFF (denied) and OWNER/ADMIN/MANAGER (allowed). Forms
were exercised through their validation states and **not submitted**; no business data was mutated.

## Definition of Done

- The forms and auth screens render from the shared primitives, with the same container, section,
  and field grammar as the rest of the app.
- Every route renders its form bare; no `Screen` is nested inside another `Screen`.
- Behavior is preserved exactly: RBAC gates, API calls and payloads, validation order, navigation
  targets, and loading/empty/error copy.
- The only token change is the D1 dark `placeholder`; light values, the server, and the server tests
  are untouched; Android + iOS exports green.
- Committed as `311e558`; nothing pushed.

---

# 20. Phase 19 — Stock Transfers Between Locations

## Objective

Close the last gap in the §15 transaction set: `TRANSFER` was reserved from Phase 04 but never
implemented, so stock could only move between locations by a manual stock-out at one location and a
manual stock-in at the other. Phase 19 implements the transfer as one atomic logical operation that
produces both legs, reusing the Phase 07A compensation architecture rather than introducing
MongoDB sessions/multi-document transactions.

## Scope

Backend:

- `POST /api/inventory/transfer` — `{ productId, fromLocationId, toLocationId, quantity, reason?, reference? }`,
  returns both legs (`previousQuantity`/`newQuantity` plus `destinationPreviousQuantity`/
  `destinationNewQuantity`) and the shared `reference`.
- `inventoryService.transfer()`: guarded atomic source debit (conditional update that fails rather
  than driving the source negative), destination credit by upsert, two `TRANSFER` ledger rows
  written in a `for` loop, one `recordAudit` for `INVENTORY_TRANSFERRED`.
- Quantity-anchored, destination-first compensation on failure (same pattern as Phase 07A): the
  rollback is anchored to the mutation actually performed, so it can never clobber a concurrent
  movement and can never drive a quantity negative. A failed first credit deletes the row it
  created rather than leaving a zero-quantity orphan.
- Audit failure never compensates a durable movement (H3).
- `TRANSFER` added to the accepted history `type` filter; `validateTransfer` rejects a same-location
  transfer and non-positive/non-integer quantities.

Mobile:

- New `/transfer` route + `TransferForm` (two location pickers, source availability `StatCard`,
  same-location and over-quantity guards), reached from a role-gated dashboard workspace entry.
- History gains a "Transfer" filter chip, a `TRANSFER` type badge (info tone), and the transfer icon;
  the Audit screen gains the `INVENTORY_TRANSFERRED` action label.
- `canTransferStock` mirrors the server gate onto the existing `INVENTORY_MANAGE` permission — **no
  new permission and no RBAC matrix change**.
- The row-lookup logic shared by `MovementForm` and `TransferForm` is extracted to
  `hooks/useInventoryRow.js` (behavior-identical).

## Out of Scope

- No new permission (`INVENTORY_TRANSFER` was explicitly rejected); OWNER/ADMIN/MANAGER allowed,
  STAFF 403, unauthenticated 401.
- No MongoDB sessions or multi-document transactions.
- No partial/quantity-split transfers, no transfer of reserved stock, no approval workflow, no
  transfer documents or receipts.
- No change to authentication, tenant isolation, audit DTOs, pagination, ordering, or existing
  stock-in/out/adjust semantics.

## Definition of Done

- All 24 cases in `server/test/phase19-transfers.test.mjs` pass, including failure injection,
  compensation, and the concurrency-sensitive source-mutation case (H4/H5).
- `phase04-inventory.test.mjs` and `phase07a-inventory-compensation.test.mjs` re-run green.
- Emulator smoke on a single permitted role (MANAGER) confirms entry point, guards, both legs,
  persisted quantities, and the history badge/filter.
- Committed as `6bc9a70` (`feat: add stock transfers between locations (Phase 19)`); the dashboard
  recent-activity grouping fix that followed is `294a8f6`. Nothing pushed.

---

# 21. Phase 20 — Performance, Pagination & Filter Contract Hardening (20A–20H)

## Objective

Make the shared list read path deterministic, index-backed and explicit about how it treats input it
cannot parse — without changing what any well-formed request returns. Delivered as eight owner-approved
increments (20A–20H) after Phase 19, all confined to list ordering, pagination and filter validation.

## Scope

- **20A** (`bf84a6a`) — offset pagination ordering was non-deterministic whenever two documents shared a
  sort key, so a page boundary could repeat or skip a row. Every list sort gains an `_id` tiebreaker.
- **20B** — the read-path audit that identified the remaining findings (M-1…M-5, C1–C2) and fixed
  nothing itself.
- **20C** (`23a3673`, `45afd75`) — restore index-backed pagination sorts with three compound indexes
  matching the `_id`-augmented sorts, and harden the pinned pagination contract.
- **20D** (`4c04248`, `821b469`) — a malformed `q`/`status`/`supplierId` was silently ignored and the
  unfiltered list returned; it is now rejected with `400 VALIDATION_ERROR`.
- **20E** (`7369796`) — `page`/`limit` were parsed with `Number.parseInt`, a *prefix* parser, so
  `?limit=1e3` yielded `limit: 1`: it passed both the `>= 1` guard and the cap and was answered with a
  single row. A value is now usable only when the whole value is an integer.
- **20F** (`b96c805`) — `ai_conversations` list pagination was covered only by a `createdAt` index
  while sorting on `updatedAt`; the matching index is added and the old one kept.
- **20G** (`3d06c91`) — the same gap for the products, purchase-orders and users list sorts, each with a
  DB-free schema-declaration guard.
- **20H** (`0bd289f`) — the product list sort sat after its first `$lookup`, where no index can serve it;
  it is hoisted above it. A sort inside `$facet` or after a `$lookup` is invisible to `explain`, so a
  missing sort in the plan is not evidence that no sort occurs.

## Out of Scope

- No keyset/cursor pagination, no change to page numbering, `skip`, `DEFAULT_LIMIT`, `MAX_LIMIT` or the
  response envelope.
- Malformed pagination values continue to **coerce** to the documented default; only filters **reject**.
  This asymmetry is deliberate and both halves are pinned by tests.
- No model, route, controller, service or AI-tool change beyond the indexes and the two parse/validate
  fixes above. No mobile change.

## Definition of Done

`npm run lint` clean; the pagination, ordering and filter-contract suites green (`393/393`, `406/406`,
`410/410`, `412/412`, `419/419` at the relevant increments, `440/440` after Phase 22); the changed set at
each increment confined to the files named above. No V2/V4 feature, no new dependency.

---

# 22. Phase 21 — Product Archive-Only Lifecycle & Inventory Invariant

## Objective

Make explicit, and prevent from drifting, two properties the system already had: products follow an
archive-only lifecycle (`ACTIVE` <-> `ARCHIVED`, with `ARCHIVED` terminal — no hard delete exists or
may be added), and an inventory record is dependent on a live product in the same business, with the
dependency maintained by application lifecycle rules and write-path validation rather than by any
database-level foreign key.

This is a documentation-and-guard increment. It changes **no production behavior**.

## Scope

Documentation:

- `docs/SYSTEM_SPECIFICATION.md` gains `## Product Lifecycle` (§13, stating that deletion is
  prohibited and `ARCHIVED` is terminal), `## Inventory and Product Integrity` (§14, stating that
  archiving retains inventory records and history and that integrity comes from lifecycle rules plus
  write-path validation, **not** from MongoDB — and that read-path filters are defensive query
  hygiene, not enforcement), a transaction-permanence note (§15), and a clarification in §31 that
  the endpoint list is illustrative and that product deletion is not part of the contract. The
  previously illustrative `DELETE /api/products/:id` line is replaced with the implemented
  `POST /api/products/:id/archive` and `POST /api/products/:id/restore`.
- `CLAUDE.md` §4 (Mandatory Architecture Rules) carries the archive-only product rule and the
  referential-integrity statement; §7 lists Phase 21.
- This section.

Tests:

- New `server/test/phase21-product-archive-invariant.test.mjs` — DB-free declaration guards
  registered in `PURE_UNIT`: the product status enum has exactly `ACTIVE`/`ARCHIVED` and no
  deletion-like state; the products router registers no `DELETE` route and does expose
  archive/restore; `productService` exposes no delete-like operation; the audit vocabulary declares
  no product-deletion action; `productId` is required and references `Product` on both `Inventory`
  and `InventoryTransaction`; `businessId` is required on `Product`. Runs in both `npm test` and
  `npm run test:unit`, so "nobody added a delete route" stays checkable even with MongoDB down.
- `server/test/phase04-inventory.test.mjs` — three DB-backed cases: every movement type (stock-in,
  stock-out, adjust, transfer) is rejected against an archived product with `PRODUCT_ARCHIVED` and
  moves nothing; archiving retains the inventory row, its quantity and its full history, and the row
  is still listed and attributed to the archived product; restoring makes the product operational
  again from the stock it kept.
- `server/test/phase04-catalog.test.mjs` — `DELETE /api/products/:id` returns 404 and leaves the
  product untouched, while archive/restore remain the terminal transitions.

## Out of Scope

- No `DELETE /api/products/:id`, no purge, no cascade delete, no soft delete, no `deletedAt`, no
  `PRODUCT_DELETED` audit action, no delete hook, no MongoDB foreign-key emulation.
- No change to any model, route, index, migration, controller, service, or AI tool. No new index.
- No change to `inventory.service.js` — including the `{'product.0': {$exists: true}}` list guard,
  which stays byte-identical. That guard is defensive read-path filtering and is redundant with the
  following `$unwind` for filtering purposes; it is **not** referential-integrity enforcement, and
  Phase 21 neither removes nor "fixes" it.
- No orphan-repair behavior, no logging/metrics/counters for the guard, no test that manufactures
  orphan inventory documents.
- No mobile change, no API response change. Phase 20C–20H performance work stays closed.

## Definition of Done

- `node --test server/test/phase21-product-archive-invariant.test.mjs` passes 6/6 with no database
  involvement.
- `npm run test:unit`, `npm run test:db`, `npm test` and `npm run lint` are green.
- `git diff` shows `server/src/**` and `mobile/**` unchanged, and `server/src/services/inventory.service.js`
  byte-identical.
- Nothing committed, nothing pushed.

---

# 23. Phase 22 — Authorization Contract Enforcement & RBAC Coverage Guards

## Objective

Harden the **route→capability binding** without changing who may do what, and make the permission
catalogue self-checking. A route's authorization requirement must be *stated*, not implied by "any
authenticated member of the business".

## Scope

- The read routes for products, suppliers and purchase orders had been protected by `requireAuth`
  alone. They now name the capability they require —
  `requirePermission(PERMISSIONS.PRODUCTS_VIEW)`, `SUPPLIERS_VIEW` and `PURCHASE_ORDERS_VIEW`.
- `server/src/constants/roles.js` gains `CATALOGUE_ONLY_PERMISSIONS` naming the capabilities granted to
  roles but implemented by no endpoint: `business.manage`, `roles.manage`, `transactions.view`. This is
  **metadata for the regression guard only** — it is not imported by `middlewares/authorize.js` and
  takes no part in any runtime authorization decision.
- New DB-free `server/test/phase22-authorization-contract.test.mjs`, registered in `PURE_UNIT`, is the
  guard: it proves each read route's binding structurally (by walking the router stack), behaviourally
  (by invoking the gate and requiring a 403 for an ungranted role while admitting STAFF) and by
  declaration (the route names the expected catalogue key); it requires every catalogue entry to be
  either enforced or listed as catalogue-only, with the two sets disjoint; it rejects any permission a
  route references that is not in the catalogue; and it pins that `CATALOGUE_ONLY_PERMISSIONS` never
  reaches the runtime authorization path.

## Out of Scope

- **No role grant was added, removed or changed** for OWNER, ADMIN, MANAGER or STAFF. The change is
  behaviour-neutral by construction: all four roles hold all three view permissions, so the only
  requests whose outcome changes are those from a role that holds no capability at all.
- Categories and locations read routes were deliberately left on `requireAuth`, because no
  `categories.view`/`locations.view` key exists and inventing one was out of scope.
- The ledger read was **not** moved from `inventory.history.view` to `transactions.view`: only
  OWNER/ADMIN/MANAGER hold the latter while every role holds the former, so the switch would have
  silently revoked STAFF history access.
- No model, service, controller, index, migration or mobile file changed, and no mutation route's gate
  was altered.

## Definition of Done

`npm run lint` clean (`0/0`); the new DB-free suite green; the full backend suite `440/440`. No new
permission key and no grant change, verified by diff.

---

# 24. Phase 23 — Authorization Contract Completion: Route Classification & RBAC Mirror Guards

## Objective

**Authorization contract guards and cross-layer RBAC consistency; no production behavior change.**

Phase 22 bound eight named read routes to their view permissions and made the catalogue
self-checking. It left three authorization surfaces held by convention, each of which could drift
silently:

1. **The complement of the gated routes was unpinned.** Phase 22 proved eight routes *are* gated; it
   did not pin which routes are deliberately *not* gated, so a route added without a gate would pass
   every test in the suite — the exact failure Phase 22 existed to prevent.
2. **The mobile RBAC mirror was kept in step by hand.** `mobile/lib/permissions.js` re-declares the
   whole catalogue and all four role grants so the UI knows what to show. Nothing tied it to
   `server/src/constants/roles.js`; Phases 13A, 17 and 19 each had to update both by hand.
3. **`requireRole` was a blind spot.** A route gated by role name carries no permission, so any scan
   looking only for `requirePermission` would not see it, and the client's dependence on specific
   server error codes had no guard at all.

## Scope

All of it is one DB-free guard suite plus documentation. **No production behavior changes: no
permission key added, no role grant changed, no change to any server route, controller, service,
model or middleware, and no change to any mobile source file.**

- **Route authorization classification.** The guard discovers every route reachable from `app.js` —
  reading the mount table out of `app.js` source, so a newly mounted router is covered automatically
  and cannot be mounted and forgotten — plus the routes registered directly on the app, and requires
  each to land in exactly one declared bucket: `PERMISSION_GATED` (the default), `AUTHENTICATED`,
  `PUBLIC`, `ROLE_GATED`. `AUTHENTICATED` and `PUBLIC` are explicit lists with a written reason: the
  three self-service account routes, the four categories/locations reads (making Phase 22's deferral
  visible so it cannot be extended by accident), and health/login/register. A route in no bucket
  fails, and a declared exemption that has stopped being true also fails. There is deliberately **no
  route-count assertion** — a future phase adds a route by declaring it, never by editing a number.
- **Cross-layer RBAC mirror.** The guard dynamically imports `mobile/lib/permissions.js` and compares
  roles, the 21 catalogue keys *and values*, and every role's grant set against the authoritative
  server matrix. No mobile test runner was added and no mobile file was modified.
- **`requireRole` inertness.** The classifier recognises `requireRole(` and routes it to `ROLE_GATED`,
  which is empty by design. The guard also pins that `requireRole` is still exported from
  `middlewares/authorize.js` and referenced by no module under `src/routes/`. It was deliberately
  **not deleted or modified** — its inertness is pinned, not its removal.
- **Client error-code contract.** Every `code` literal the mobile client branches on must be a code
  the server can emit, across all three emission shapes: the third argument of `new ApiError(...)`, a
  `this.code = ...` assignment, and a `code:` property written directly into a response body (the rate
  limiters answer without going through `ApiError`). Identifier arguments are resolved through the
  module-level string constants; pass-through assignments that resolve to nothing are skipped rather
  than counted as emissions.
- New `server/test/phase23-authorization-contract.test.mjs`, registered in `PURE_UNIT`. `CLAUDE.md`,
  `docs/SYSTEM_SPECIFICATION.md` and this roadmap document the contracts.
- **`assertBusinessAccess` is untouched** and out of scope, as is `entitlement.service.js`.

## Out of Scope

- No new permission key, no role-grant change, no route, controller, service, model or middleware
  change, no mobile source change, no mobile test runner or dependency, no CI.
- No deletion of `requireRole`, `assertBusinessAccess` or `entitlement.service.js`.
- No route-count snapshot, and no change to the Phase 22 suites other than running them unchanged.
- No V2/V4 feature. DB-free guards only.

## Definition of Done

`npm run lint` clean (`0/0`); the new suite green; `npm run test:unit`, `npm run test:db` and
`npm test` green with the DB-mode counts unchanged and the full suite `459/459`; the Phase 22,
phase03-auth and phase03-rbac suites unchanged and green; `git diff --name-only -- server/src mobile`
empty; and a deliberate negative test proving the mirror guard can actually detect divergence.
Nothing committed, nothing pushed.

---

# 25. Phase 24 — Runtime Authorization Matrix & Tenant-Isolation Verification

**Status: implemented and verified (2026-09-12); not committed pending owner approval.**

## Goal

Add the **runtime** half of the authorization contract that Phases 22 and 23 left structural, and
close the one authorization property nothing in the suite verified. No production behavior change.

## What the investigation found

The premise that runtime authorization was largely unproven turned out to be only partly true, and
the phase was reduced accordingly rather than expanded to match the premise:

- **Tenant isolation was already well covered** — roughly fifteen behavioral tests across ten files,
  including the mutation paths and five proofs that a client-supplied `businessId` is ignored.
- **Horizontal authorization was already complete.** AI conversations are the *only* user-owned
  resource in the system (`userId` on audit logs, inventory transactions and purchase orders is actor
  provenance, not an access scope), and same-business cross-user access was already pinned.
- **AI authorization was already complete for its declared matrix.** Because all four roles hold
  `ai.use`, `products.view`, `inventory.view` and `inventory.history.view`, the only denial cell that
  exists is `dashboard.view × STAFF` — already covered directly and inside a live chat.
- **Two real gaps remained:** vertical coverage was scattered per feature (each file pinning only its
  own boundary) with the suite's single four-role matrix running against the **test-only `/guard`
  router** in `phase03-auth.test.mjs` — synthetic routes, not shipped endpoints; and **role mutation
  had no authorization-effect proof**, `phase14-users` having asserted only the response payload while
  the status test beside it did verify its effect.

## Implemented

`server/test/phase24-runtime-authorization-matrix.test.mjs` (DB-backed, registered in `PURE_DB`):

- **A consolidated matrix over real routes**, walking a representative endpoint per capability and
  asserting the outcome for all four roles. Expectations are **derived from `hasPermission`**, so the
  suite holds no second copy of the role matrix and cannot drift from `constants/roles.js`.
- **Admitted cells depend on nothing but the gate** — a gate is the second handler, so it decides
  before validation, and an admitted cell asserts only "not 401, not 403, and not the code-less global
  404". No bodies, no seeded resources, no provider availability, no success payloads. A mistyped path
  is caught because the global 404 carries no `code` while every `ApiError` 404 does.
- **Denied cells** assert 403 `FORBIDDEN`; **unauthenticated** requests assert 401 `AUTH_REQUIRED`,
  sampled per tier rather than per route.
- **Four role-mutation tests**, each reusing the **same pre-existing JWT**: STAFF → MANAGER grants a
  MANAGER-gated capability, MANAGER → STAFF revokes it, STAFF → ADMIN → STAFF grants then revokes
  `users.manage`, and a promotion reaches the AI tool permission gate (flipping a
  `getInventorySummary` soft `TOOL_FORBIDDEN` into a real run). These prove `authenticate.js` re-reads
  the role from the database per request; an access token carries only `sub`/`iat`/`exp`, so there is
  no role claim that can go stale and a forged one can neither grant nor escalate.
- **The empty OWNER-only runtime tier is asserted explicitly.** `business.manage` and `roles.manage`
  are catalogue-only, so no shipped endpoint distinguishes OWNER from ADMIN; the suite asserts that
  rather than leaving a hole that would read as coverage, and adds no route to make it testable.

## Documented

Tenant isolation is documented accurately as **404-scoped queries**, not a 403 middleware.
`assertBusinessAccess` has no `src/` importer (its only callers are tests, one inside the `/guard`
router), so it is production-dead and was left **byte-identical** — not wired, not modified, not
deleted — and the `FORBIDDEN_BUSINESS` code is not reachable at runtime in production.

## Out of Scope

- No permission added, renamed or removed; no role grant changed.
- No route, controller, service, model, middleware or mobile file modified.
- No change to `requireAuth`, `requirePermission`, `requireRole`, `assertBusinessAccess` or
  `businessId` resolution.
- No modification, consolidation or refactor of any existing test file.
- No wiring or deletion of the production-dead `assertBusinessAccess`.
- No new route for `business.manage` / `roles.manage`; no reversal of the Phase 22 decision.
- No static query-scoping audit, no runtime Express route enumeration, no CI or dependency change, and
  no `run-tests.mjs` change beyond registering the new `PURE_DB` file.

## Verification

`npm run lint` 0 errors / 0 warnings; new suite 10/10; `npm run test:db` 320 → 330; `npm run test:unit`
unchanged at 170; `npm test` 459 → 469, 0 fail / 0 skipped. Phase 22 (11/11) and Phase 23 (19/19)
re-run green and byte-unmodified. Both new proofs were shown able to fail before being trusted:
inverted assertions on the *stale* role outcome (still 403 after promotion, still 200 after demotion)
were confirmed to throw, a wrong expected matrix cell was confirmed to throw, and the typo guard was
confirmed to distinguish the two 404 shapes. `git diff --name-only -- server/src mobile` empty. Change
surface is exactly six paths: the new test file, one `PURE_DB` line in `server/scripts/run-tests.mjs`,
and `CLAUDE.md`, `docs/SYSTEM_SPECIFICATION.md`, `README.md`, `docs/DEVELOPMENT_ROADMAP.md`.

---

# 26. Phase 25 — Design-Token Contrast Close-Out & Mobile Known-Issue Reconciliation

**Status: implemented and verified (2026-09-12); not committed pending owner approval.**

## Objective

Close the two measured WCAG-AA contrast failures in the **light** theme that `docs/DESIGN_SYSTEM.md`
had carried as open known issues since 18E/18F, and reconcile the design-system documentation with
the corrected values. Delivered as a single owner-approved increment (Option A) after Phase 24, and
confined to two token values plus documentation. No production behavior change.

The owner approved Option A explicitly, including the tighter ~7% visual separation between the two
muted tokens that the AA floor on `surfaceMuted` forces; the dark theme is unchanged.

## Scope

- `mobile/lib/theme.js` — `palettes.light.placeholder` `#8A94A6` → **`#646E83`** and
  `palettes.light.textMuted` `#667085` → **`#5F697E`**. No other line of the file changed; the dark
  palette, the shared scales and the exports are untouched.
- The replacement values were **computed, not chosen by eye**. WCAG 2.x relative luminance
  (`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`, `L = 0.2126R + 0.7152G + 0.0722B`) and
  `(L_light + 0.05) / (L_dark + 0.05)` were evaluated over the palette's own slate hue family.
- `surfaceMuted` (`#EEF1F7`) is the **binding surface** for both tokens: it is the lightest ground a
  placeholder sits on, so it sets the floor. `#646E83` is the lightest value in the hue family that
  clears 4.5:1 there (4.53:1) — the maximum subordination available.

## Measured result

| Token | Before | on `surface` | on `surfaceMuted` | on `background` | After | on `surface` | on `surfaceMuted` | on `background` |
|---|---|---|---|---|---|---|---|---|
| `placeholder` | `#8A94A6` | 3.06:1 | 2.70:1 | 2.83:1 | `#646E83` | 5.12:1 | 4.53:1 | 4.73:1 |
| `textMuted` | `#667085` | 4.97:1 | 4.40:1 | 4.60:1 | `#5F697E` | 5.51:1 | 4.87:1 | 5.10:1 |

`textSecondary` (`#5B6472`, 5.98:1 / 5.29:1 / 5.53:1) is unchanged and still leads the ladder.
Dark theme unchanged and already compliant: `placeholder` `#8A93A6` 5.40:1 / 4.76:1;
`textMuted` `#98A1B3` 6.41:1 / 5.66:1.

**Why `textMuted` had to move too.** On a light surface, clearing 4.5:1 on `surfaceMuted` requires a
*darker* value than `#667085` (4.40:1) — so any conforming placeholder would have been darker than
the token it must sit beneath, inverting the muted hierarchy. Darkening `textMuted` to `#5F697E`
restores the ordering and spaces the three muted tokens evenly (steps of ~0.93x on every surface).
The result is a **~7% contrast separation** between `placeholder` and `textMuted` — the ceiling the
`surfaceMuted` floor allows, reported rather than hidden. It is deliberately tighter than the
0.615x gap it replaces, which existed only because the placeholder was failing.

**Placeholders are not exempt.** WCAG 1.4.3 excludes incidental text, logotypes and **inactive**
user-interface components only. The three binding placeholder sites — `SearchField`,
`SelectField`'s in-sheet search and `AiChat`'s composer — are live fields, so 4.5:1 genuinely
applies and no exception was claimed.

## Blast Radius (enumerated, not assumed)

Four components emit `colors.placeholder` across five sites (`SelectField` has two); the edit is two
lines but reaches the whole app.

| Site | Ground |
|---|---|
| `components/Input.jsx` | `surface` (its `inputDisabled` state uses `surfaceMuted`, but is exempt as inactive) |
| `components/SearchField.jsx` | `surfaceMuted` — binding |
| `components/SelectField.jsx` (field text + in-sheet search) | `surface`; in-sheet search `surfaceMuted` — binding |
| `components/AiChat.jsx` (composer) | `surfaceMuted` — binding |

`colors.textMuted` has 44 sites across 26 files. Informational text sits on `surface` or
`background`, both already compliant; its only `surfaceMuted` pairings are a **disabled** input
(exempt, 1.4.3) and icon/glyph uses governed by 1.4.11's 3:1 non-text threshold, which 4.40:1
already cleared. Verified by grep that **no hardcoded duplicate** of either old or new hex exists
outside `mobile/lib/theme.js`, and that **no server test imports `mobile/lib/theme.js`** (the Phase
23 guard reads `mobile/lib/permissions.js` only).

## Out of Scope

- No `server/**` change of any kind: no route, controller, service, model, middleware, index,
  config, script or test. `server/` diff is empty and the suite is not re-run, because nothing in it
  can be affected.
- No RBAC, permission, audit or AI change; `assertBusinessAccess`, `requireRole`,
  `CATALOGUE_ONLY_PERMISSIONS` and every Phase 22/23/24 authorization artifact are untouched.
- No component, layout, copy or logic edit; no new screen, primitive, navigation or feature.
- `mobile/app/(app)/ai/index.js`'s hooks-after-early-return is **not** restructured: it remains the
  frozen known issue recorded by 18E.
- No mobile test runner added (Phase 23 recorded that as a deliberate non-goal), no new dependency,
  no unrelated cleanup of the pre-existing untracked artifacts.
- No change to the dark theme, to `textSecondary`, or to any other token.
- The smoke surfaced one **pre-existing** layout defect — the products-list `SearchField` placeholder
  clips its wrapped second line at 160% font scale, identically in light and dark, so it is not a
  token effect. It is recorded in `docs/DESIGN_SYSTEM.md`'s known-issues section and deliberately
  left unfixed, since a primitive/layout edit is outside this phase's approved scope.

## Verified

- Contrast recomputed **programmatically from the edited file** (the palette is parsed out of
  `mobile/lib/theme.js`, not from the plan's notes) for `placeholder`, `textMuted`,
  `textSecondary` and `text`, against all three light surfaces at a 4.5:1 floor: all pass, and
  `placeholder` is subordinate to `textMuted` on every surface (0.929x).
- Dark tokens recomputed and unchanged: `placeholder` 5.40:1 / 4.76:1, `textMuted` 6.41:1 / 5.66:1.
  The dark `placeholder` was also re-measured on the device (4.76:1 on `surfaceMuted`), matching the
  computed value.
- Expo export green for Android and iOS (`--platform android` and `--platform ios`, both exit 0);
  the new tokens are present in both emitted bundles and the superseded light values are absent
  from them.
- Emulator smoke across light and dark at 100% and 160% system font scale, on the screens that
  carry the affected tokens: every one of the four `colors.placeholder` components (`Input`,
  `SearchField`, `SelectField` field + in-sheet search, `AiChat` composer) plus muted-caption, icon
  and empty-state sites on the dashboard, product/PO/supplier lists, stock-in, adjust, AI hub and
  the AI chat. Each rendered token was sampled from the screenshot pixels and reproduces the
  computed value exactly.
- `git diff --name-only -- server/` empty.

## Definition of Done

- Both light tokens clear 4.5:1 on every surface they are used on, with the hierarchy preserved.
- `docs/DESIGN_SYSTEM.md` §2 carries the measured values and §7 has no open known issues, with the
  closure recorded rather than the history erased.
- The change surface is exactly five paths: `mobile/lib/theme.js`, `docs/DESIGN_SYSTEM.md`, this
  roadmap, `CLAUDE.md` and `README.md`.
- Nothing committed or pushed without explicit owner approval.

---

# 27. Phase 26A — Session Hardening & Real Logout

**Status: implemented and verified (2026-09-12); not committed pending owner approval.**

## Objective

Make sign-out real. Until this phase a JWT *was* the session: it could be verified but not withdrawn,
so "Sign out" only cleared the client's copy of the token, a stolen token stayed valid until it
expired, and the only server-side revocation that existed was the blunt Phase 15 password change
(every token, everywhere). One device could not be signed out without signing out all of them.

Delivered as a single approved increment (26A) after Phase 25. The owner's scope for 26A is
explicitly limited: **no refresh-token rotation**, no password reset, no email, no OAuth, no MFA, no
new roles or permissions, and no new dependency.

## Scope

**Session model.** A new `server/src/models/session.model.js` records `userId`, `jti`, `deviceLabel`,
`lastUsedAt`, `revokedAt` and `expiresAt`, with a unique index on `{jti}`, a `{userId, revokedAt}`
index for the listing and revocation queries, and a TTL index on `{expiresAt}` so expired rows are
removed by MongoDB. It carries **no authorization data** — no role, no `businessId` — so a session
grants continued authentication and nothing else.

**Token shape.** `server/src/config/jwt.js` signs `sub`, a fresh `jti` and the standard `iat`/`exp`,
and still nothing more: no role, no `businessId`, no status. HS256, the existing secret handling and
the existing expiry behaviour are unchanged. The `expiresAt` stored on the row is read back from the
token's own `exp` claim, so the row and the token expire at the same instant by construction rather
than by a second implementation of the duration format.

**The choke point.** `server/src/middlewares/authenticate.js` gains exactly one new requirement: the
token's `jti` must name a session that exists, has not been revoked and has not expired. A token with
no `jti` is rejected outright, before any lookup. Every pre-existing guarantee is preserved and still
enforced in the same order: ObjectId validation, the ACTIVE user requirement, the Phase 15
`passwordChangedAt` comparison (still `401 SESSION_INVALIDATED`), the Phase 07B active-business check,
and the HS256 algorithm restriction. The session context is exposed as `req.auth = { sessionId, jti }`,
kept separate from `req.user` so the `/api/auth/me` payload is unchanged by this phase.

**Routes.** Three self-service, authenticated routes — `POST /api/auth/logout`,
`GET /api/auth/sessions` and `DELETE /api/auth/sessions/:id`. There is deliberately no fourth route
for "sign out everywhere": it is the same logout route with `{ "all": true }`.

- Logout identifies the session from the token's own `jti`. The client never names a session, a user
  or a business, and `validateLogout` rejects every body field except `all` with `400`.
- `GET /api/auth/sessions` queries by `req.user.id` alone and returns a strict allowlist
  (`id`, `current`, `deviceLabel`, `createdAt`, `lastUsedAt`, `expiresAt`). **A token or a `jti` is
  never returned**, and the `current` flag is how a client identifies its own row without ever
  seeing a session id it did not already hold. `lastUsedAt` is refreshed opportunistically at most
  once per session per five minutes, so the liveness check does not add a write to every request.
- `DELETE /api/auth/sessions/:id` puts the owner inside the query filter rather than checking
  ownership after the write, so revoking another user's session is impossible by construction and
  answers the same `404` as an unknown id — which also means the response cannot reveal that someone
  else's session exists.

**No new permission.** These are the caller's own sessions, so they are authenticated routes rather
than capability-gated ones; nothing was added to the catalogue and no role grant changed. The Phase 23
route-classification guard declares the three new routes in its `AUTHENTICATED` bucket, which is the
only authorization-artifact edit the phase makes.

**Audit.** Four events — `SESSION_CREATED` (issued at login), `SESSION_LOGGED_OUT`,
`SESSION_REVOKED` (a session ended remotely) and `SESSIONS_REVOKED_ALL` — written through the existing
`recordAudit` path from `session.service.js`, the best-effort idiom the inventory ledger also uses:
the session change is already durable and cannot be un-done by an audit failure. No `jti` is ever
written to the trail, because the Phase 16 viewer is readable by every ADMIN of the business and a
`jti` is the one value that could be replayed with a stolen token; the session `_id` and the device
label are recorded instead.

**Mobile.** `lib/api.js` gains `logout`/`sessions`/`revokeSession` and a cosmetic `deviceLabel` on
login; `lib/auth.jsx` derives that label without a new dependency (`Android · <model>` from
`Platform.constants`, otherwise the OS name) and `signOut` now tells the server **before** clearing
local state, clearing anyway when the server is unreachable so an offline user is still signed out.
A new `app/(app)/sessions.js` lists the signed-in devices, marks the current one, shows when each was
signed in and last active, ends one of them, and offers "Sign out everywhere". A refused token is now
handled centrally in `lib/client.js` (a listener registered by the auth context) instead of being
re-derived per screen, which also closes a real gap: `MovementForm` used to surface a dead session as
a form error it could not resolve.

## Consequences Accepted

- **Every previously issued token is invalid.** Pre-26A tokens carry no `jti`, and a token with no
  `jti` can never name a session, so it is rejected rather than trusted. Every user signs in once
  more. This was reviewed and accepted by the owner before implementation.
- **No refresh-token rotation in 26A.** A session ends when it is revoked or when its token expires.
- The `passwordChangedAt` mechanism is unchanged and still revokes every session of a user; session
  revocation is an additional, finer-grained control, not a replacement.

## Blast Radius (enumerated, not assumed)

Seven existing test files needed a token fixture that satisfies the new mandatory-`jti` contract
(`support.mjs`, `phase03`, `phase07b`, `phase07c`, `phase07d-db-reliability`,
`phase07d-production-config`, `phase08a`); `phase23` declares the three new routes. One further file
was **not** on the owner's approved list and had to change: `phase16-audit-viewer.test.mjs` pins that
fixture business's exact audit row counts, and the specification's own requirement that a login
records a session-created event shifts those counts. It was updated to match the new reality, not
relaxed — recorded here because it is a deviation from the approved file list.

## Verified

- `server/test/phase26a-session-lifecycle.test.mjs` (DB-backed, 22 cases) covers the 15 mandatory
  cases — session created at login; `jti` present in the token; a token without `jti` rejected; a
  valid `jti` accepted; logout revoking the current session; a revoked session's token rejected; one
  revocation leaving another session working; sign out everywhere ending all sessions; one user's
  session not revocable by another; an expired session rejected; a disabled user still rejected;
  inactive/suspended/archived business behaviour unchanged; `passwordChangedAt` still invalidating;
  forged role/business claims still granting nothing; the authorization contracts intact — plus
  DTO-shape, body-validation, audit-row, device-label and re-login cases.
- **Every new security assertion was proven able to fail before it was trusted.** Six mutations were
  applied and reverted one at a time: disabling the session-liveness check (tests 3, 5, 6 fail);
  dropping `userId` from the revoke-by-id filter (test 9 fails); logout ignoring `all` (tests 7, 8,
  19, 21 fail); `toPublicSession` exposing `jti` (test 16 fails); skipping label normalization (test
  20 fails); a lenient `validateLogout` (test 17 fails).
- `npm run lint`: 0 errors / 0 warnings. Full backend suite: **491/491** (469 before this phase),
  78 suites, 0 failures — the Phase 22/23/24 authorization suites included and unchanged.
- Expo export green for Android and iOS (both exit 0) with a **positive control**: the new session UI
  strings and the `/api/auth/sessions` path are present in both bundles, while the JWT secret, the
  string `jti` and `SESSION_REVOKED` are absent from both.

## Definition of Done

- Sign-out revokes the session server-side; a single session is revocable; "sign out everywhere"
  exists. A token without `jti` is rejected.
- No authorization data was added to any token or session record, and no permission, role grant or
  Phase 22/24 authorization behaviour changed.
- The change surface is the approved Phase 26A files plus the seven objectively-required fixture
  updates and `phase16-audit-viewer.test.mjs` (recorded above).
- Nothing committed or pushed without explicit owner approval.

---

# 27B. Phase 26B — Password Recovery (Email Reset)

**Status: implemented, verified and committed (2026-09-13); not pushed.**
**Commits: `5a46781` — "feat: add password recovery email delivery (Phase 26B-1)", then `9900e9a` —
"feat: add password recovery and its HTTP surface (Phase 26B-2, 26B-3)". Phase 26B-2 and Phase 26B-3
share the second commit: the token store and the service that uses it have no caller and no observable
behaviour until the two routes exist, so they are one unit of work.**

## Objective

Give a user a way back into their own account without an operator. Until this phase the only route to
a changed password was `POST /api/auth/change-password`, which requires already being signed in — so a
forgotten password meant a locked-out account and a manual database edit. Delivered in three approved
sub-phases (26B-1, 26B-2, 26B-3) after Phase 26A.

The owner's scope is explicitly limited: **no OAuth, no MFA, no refresh-token rotation, no new
dependency, no new permission, no role-grant change and no mobile change.** Recovery is server-side
and email-based only. Nothing here changes what a session is, and nothing here is reachable by an
authenticated API consumer that does not already hold the reset token.

## Scope

### 26B-1 — Mail service (`5a46781`)

`server/src/services/mail/` is a provider-agnostic boundary that the rest of the application reaches
through exactly three functions — `isMailConfigured()`, `mailProviderName()` and
`sendPasswordResetEmail({ to, resetUrl, expiresInMinutes })` — and it is the only mail module anything
imports. Callers never learn which provider is configured; only `resendProvider.js` knows that Resend
exists.

- **Configuration** (`mailConfig.js`) reads `MAIL_PROVIDER`, `MAIL_FROM`, `PASSWORD_RESET_URL`,
  `MAIL_APP_NAME` and `MAIL_REQUEST_TIMEOUT_MS` **lazily at call time**, the same pattern as
  `services/ai/aiConfig.js`: a missing key or an unknown provider name can never prevent the server
  from booting, and password recovery simply answers a clean 503 until an operator fixes it. The
  `RESEND_API_KEY` is deliberately **not** a field of that object — `mailConfig()` is the value most
  likely to be spread into a log line, so the provider that needs the key reads it itself.
- **Provider registry** (`providers/index.js`) holds a registry plus a `resend` builtin requiring
  `RESEND_API_KEY` and `MAIL_FROM`; `selectProvider()` throws `MailNotConfigured` for an empty
  provider name, an unregistered name, or a builtin missing required configuration.
- **Safe provider error handling** (`providers/resendProvider.js`). A non-2xx response becomes a
  `MailDeliveryError` carrying an HTTP status and, when the provider names one, an error name matching
  `^[a-z0-9_]{1,64}$`. Resend's free-text `message` is read and **discarded** rather than relayed: it
  can echo submitted field values, and one of those fields is the reset URL — a live credential. The
  provider response body never travels with the error, and the module logs nothing.
- **Timeout behaviour.** Every request is bounded by an `AbortController`
  (`MAIL_REQUEST_TIMEOUT_MS`, default `10000`), so a slow provider cannot hold a request open
  indefinitely; a timeout surfaces as a `MailDeliveryError` like any other transport failure.
- **Template** (`templates/passwordReset.js`) is a pure function returning `{ subject, text, html }`.
  It takes no password parameter — there is nothing in the signature to misuse — and it refuses to
  render without a reset URL.
- **Error separation.** `MAIL_NOT_CONFIGURED` and `MAIL_UNAVAILABLE` are the only two codes in this
  layer, so a delivery failure can never be mistaken for an authentication or session failure. The
  fetch logic is deliberately **not** shared with the AI layer's `services/ai/providers/http.js`: the
  two layers must raise different error types, and sharing it would make the mail path able to throw
  an `AiProviderError` — exactly the coupling this boundary exists to prevent.
- **No dependency was added.** The transport is a global-`fetch` call, so `package.json` and the
  lockfile are untouched; the Resend SDK is deliberately not installed. Because the endpoint is a
  module constant rather than injectable configuration, the wire-format tests stub `globalThis.fetch`
  instead of standing up a local server.
- **Test coverage:** `server/test/phase26b-mail-service.test.mjs` (37 tests, DB-free) plus the shared
  fake at `server/test/fakes/mailProvider.mjs`.

### 26B-2 — Reset-token store and recovery service (`9900e9a`)

A new `password_reset_tokens` collection (`server/src/models/passwordResetToken.model.js`) stores
`userId`, `tokenHash`, `expiresAt` and `usedAt` and **nothing else** — no business id, no email, no
role, no status, no IP address, no user agent. It carries a unique index on `tokenHash`, an index on
`{ userId, usedAt }` for the listing and cleanup queries, and a TTL index on `expiresAt`.

`server/src/services/passwordReset.service.js` owns the flow:

- **Cryptographically secure token generation.** A 32-byte `randomBytes` value, not a counter, a
  timestamp or a UUID-shaped guess.
- **The raw token is never persisted.** Only its SHA-256 digest is stored, so the database cannot be
  read back into a working reset link — a leaked dump or a database reader yields no usable token.
- **Token expiration.** Links are valid for 30 minutes (`PASSWORD_RESET_TTL_MINUTES`), and `expiresAt`
  is enforced **in the claim query** rather than left to the TTL sweep, which is eventual (~60 s) and
  must never be the correctness mechanism.
- **Atomic single-use claim.** One conditional
  `findOneAndUpdate({ tokenHash, usedAt: null, expiresAt: { $gt: now } }, { $set: { usedAt: now } })`,
  so two concurrent submissions of the same link cannot both succeed.
- **Replay protection and fail-closed behaviour.** No branch anywhere ever unsets `usedAt`: the token
  is spent the moment it is claimed, and a later failure (a rejected user, a failed save, a failed
  session revocation) leaves it spent rather than returning it to circulation. One code,
  `INVALID_RESET_TOKEN`, and one message cover all six rejection reasons — unknown, expired, already
  used, no such user, DISABLED user, and a SUSPENDED or missing business — so a caller cannot tell
  them apart.
- **One live token per user, by convergence not by transaction.** A new request deletes earlier unused
  tokens with `{ userId, usedAt: null, _id: { $lt: token._id } }`. `$lt` rather than `$ne` is what makes
  two concurrent requests converge instead of cancelling each other out. Cross-process this can settle
  at **zero** live tokens (both links dead; the user simply asks again) but never two. See **E2** below.
- **Inactive account and business rejection.** A DISABLED user, or a user whose business is not ACTIVE,
  is treated exactly like an unknown address: no token is created and no mail is sent.
- **Password policy parity.** The new password is held to the same policy as `change-password`, through
  the same validator, so the two routes cannot drift apart.
- **bcrypt hashing**, at the project's existing cost, into `User.passwordHash`.
- **`passwordChangedAt` is updated**, which is the Phase 15 mechanism that invalidates every token
  issued before it — and **`revokeAllSessions` is called as well**. That second call is not redundant:
  `passwordChangedAt` has integer-second granularity and the comparison is strict, so a session issued
  in the same second as the reset would otherwise survive. `change-password` deliberately does *not*
  revoke sessions and `phase26a:443-472` pins that, so the two flows are intentionally different here.
- **Audit behaviour.** Two events, `PASSWORD_RESET_REQUESTED` and `PASSWORD_RESET_COMPLETED`, are
  written through the existing best-effort `recordAudit` path. They carry **no metadata at all**, so a
  reset token can never reach the audit trail. The requested event is written after the token row
  exists and **before** the send, which is why there is no `delivered` flag — under this layer's
  throw-based contract such a flag would be a constant.
- **Mail preconditions are checked before any write.** `isMailConfigured()` and the reset-URL check run
  *before* the account lookup, which is what makes "mail unconfigured → no token row" true.

### 26B-3 — Password-recovery HTTP surface (`9900e9a`)

Two **public, unauthenticated, POST-only** routes, both rate-limited:

```text
POST /api/auth/forgot-password   → 202, always
POST /api/auth/reset-password    → 200 on success
```

- **Route classification.** Both are declared in the Phase 23 classifier's `PUBLIC` bucket, with a
  written reason. They are the first new unauthenticated write surface since Phase 07B.
- **Middleware and validation ordering.** Rate limiter → validator → controller. A request that fails
  validation never reaches the service, and on the reset path it never touches a token.
- **`confirmPassword` is validation-only.** It is checked by the validator *before* the service is
  called and is **not returned** by it, so a mistyped confirmation can never spend a valid reset token,
  and the controller has no variable to pass by mistake: the service receives `{ token, newPassword }`
  and nothing else. A structural test reads the controller source and requires exactly those two
  properties at the call site.
- **Generic `forgot-password` response.** One module-level constant is returned as a 202 from every
  non-error exit, so "we sent you a link" and "no such account" are byte-identical. Enumeration
  resistance here is **structural, not a rule a caller must remember**: `requestPasswordReset` returns
  `undefined` on every non-error path, so the controller has no field it could reflect.
- **Error mapping** lives in `server/src/controllers/passwordReset.controller.js` and nowhere else. The
  26B-2 service is a domain layer: its `PasswordResetError` carries a stable `code` and **no HTTP
  status**, mirroring `mapAiFailure` in the AI layer, and this one small file does the translation
  rather than teaching `auth.controller.js` a second convention. `INVALID_RESET_TOKEN` → 400 with the
  service's own message; `VALIDATION_ERROR` → 400 with `fields`; anything unrecognised propagates
  unchanged to the global handler and becomes a generic 500 whose message is never echoed to a client.
- **No token or password leakage.** Neither route returns a token, a hash, a user id or a password; the
  success responses carry a `message` and nothing else. The account a mail failure concerned is not
  logged either — a log naming it would be the oracle the response refuses to be, and logs travel
  further than responses do.
- **429 contract.** All three recovery limiters answer `429` with code `PASSWORD_RESET_RATE_LIMITED`.
  They deliberately **omit** `skipSuccessfulRequests`: the success path and the silent no-op are both
  202, so skipping 2xx would disable the limiter entirely and never spend a budget. That option is
  present only on the two Phase 07B login limiters, and both facts are guarded by tests.

## The `forgot-password` invariant

> **`POST /api/auth/forgot-password` answers an identical 202 to every caller** — whether the address
> belongs to an active account, belongs to a disabled one, belongs to no account at all, or could not
> be mailed.

There is one deliberate exception, and it is an **ordering** property rather than a status choice:
`MAIL_NOT_CONFIGURED` returns a 503. It is safe precisely because the service checks mail
configuration *before* it looks the account up, so every caller gets it identically and it
distinguishes nothing about any account.

## `MAIL_NOT_CONFIGURED` (503) vs `MailDeliveryError` (swallowed to 202)

This is the single subtlest rule in the phase and the one most likely to be broken by a well-meaning
change:

- **`MailNotConfigured` is thrown before `User.findOne`.** Its 503 is therefore reachable for an
  unknown address exactly as for a known one — it is a statement about the *server*, not about the
  account — and it stays a 503 so an operator can see that recovery is broken.
- **`MailDeliveryError` can only be thrown after the lookup**, because it comes from the send. A 503
  there would be reachable *only* for an address that exists, making it an account-existence oracle.
  The failure is therefore intercepted, the operational reason is logged server-side, and the caller
  receives the identical 202. The log record is the whole point of swallowing it: the operator still
  learns, the attacker learns nothing.
  **Since Phase 28 B1 the interception happens on the DETACHED path, in the service's
  `logDetachedMailFailure`, not in `forgotPassword`** — the send is dispatched without being awaited,
  so a delivery failure can no longer reach the controller frame at all. The caller's 202 is unchanged
  and still identical to every other outcome. The `MailDeliveryError` branch in `forgotPassword` is
  **retained as an unreachable regression guard**: if a future change ever reintroduces an awaited
  delivery path, the failure would start arriving there again, and without the branch it would fall
  through to `mapPasswordResetFailure` and answer a post-lookup `MAIL_*` 503. **That branch is
  deliberate and must not be deleted as dead code.**
- The `MailDeliveryError → 503 MAIL_UNAVAILABLE` row remains in `mapPasswordResetFailure` as
  documented, presently-unreachable **forward defence**, so that if the reset path ever gains a mail
  step a `MAIL_*` code becomes a namespaced 503 rather than an unhandled 500. It is not a defect and
  must not be reported as one; the branch is deliberate and its intent is recorded in the controller.
- **What would break this:** a *new* error class thrown after the lookup that the mapper maps to
  anything other than 202. Nothing in the code enforces the ordering — no type, no guard, no lint rule.
  The current design is fail-safe in the dangerous direction (every pre-lookup error yields a uniform
  503, and `MailDeliveryError` is caught at the call site), but this is the one change that could
  silently reopen the oracle.

## Rate Limits and Their Purpose

Three limiters, all with `standardHeaders: 'draft-7'`, all answering `429 PASSWORD_RESET_RATE_LIMITED`,
and all keyed with an explicit `ipKeyGenerator(request.ip)` rather than a library default — the default
throws on a spoofed `X-Forwarded-For` when trust proxy is off, which would turn a hostile header into
a 500.

| Limiter | Key | Window | Max | Purpose |
|---|---|---|---|---|
| `forgot-password` account bucket | `ip` + normalized email | 1 h | 5 | Bounds mail sent to any one inbox from one source |
| `forgot-password` IP bucket | `ip` | 1 h | 20 | Backstop against address rotation from a single source |
| `reset-password` | `ip` | 15 min | 20 | Every accepted attempt costs a bcrypt hash |

The windows are deliberately longer than login's: a recovery link is valid for 30 minutes and a user
who needs one needs it once, so there is no legitimate burst to protect. **Every** attempt counts on
all three — there is no failure to skip, because the success and no-such-account paths are
indistinguishable by design.

Two known limits of this arrangement are recorded below as **B2** and **E3**: the buckets are
per-process in-memory stores, so N app instances multiply every budget, and the per-account bucket
keys on `ip|email`, so it bounds mail per source-and-address rather than mail to a victim overall.

## Configuration

Documented operator-facing in `server/.env.example` (§ the Phase 26B-1/26B-3 blocks) and in
`docs/SYSTEM_SPECIFICATION.md` §35. Password recovery is **disabled unless `MAIL_PROVIDER` names a
configured provider and `PASSWORD_RESET_URL` is set**; while either is missing, `forgot-password`
answers its fixed 503 and no reset token is ever created. Nothing in this configuration is ever sent
to the mobile application.

```text
MAIL_PROVIDER               which provider sends mail; empty disables recovery entirely
MAIL_FROM                   verified sender, `Name <address@your-domain>`
RESEND_API_KEY              server-side only; never returned in a response or written to a log
MAIL_APP_NAME               default "Inventory AI"
MAIL_REQUEST_TIMEOUT_MS     default 10000
PASSWORD_RESET_URL          the trusted reset page the emailed link points at
```

- **`PASSWORD_RESET_URL` is the only source of the reset URL.** It is never built from the `Host`,
  `Origin` or `Referer` headers or from anything a client sends, so a hostile request cannot redirect
  a victim's reset link to an attacker's domain. It must point at a real reset screen that reads the
  `token` query parameter and POSTs it back to `/api/auth/reset-password`; if it points nowhere, the
  feature is configured but unusable, which is why the §F deployment step below matters.
- **Restart behaviour.** The six `AUTH_PASSWORD_RESET_*` values are read when the auth router is
  constructed — at module import — so **changing any of them requires a process restart**, even though
  `.env.example` presents them as tunable. This is identical to the pre-existing login/register
  behaviour and is honest rather than a defect, but it is worth an operator knowing. The mail values
  are read per request and need no restart; they are re-validated per send instead, which is why a
  misconfiguration degrades to a 503 rather than to a boot failure.

## Accepted / Deferred Security Risks

Recorded here, in writing, so they are owner-visible rather than merely in-code. **Both of the
following were identified by the pre-commit READ-ONLY security and integration audit, reviewed by the
owner, and explicitly deferred — they are open, not closed, and neither has an in-scope fix.**

### B1 — `forgot-password` is a practical timing oracle on account existence

**Status: PARTIALLY MITIGATED by Phase 28 B1 (`7185e5e`). NOT CLOSED — the residual is ACCEPTED FOR V1
and DEFERRED by the Phase 29 owner decision, recorded in §27E.** **Do not describe this as fixed.**

For an **unknown** address the request costs one indexed `User.findOne` and returns. For a **known,
active** address the same request additionally performs a business existence check, a token insert, a
`deleteMany`, and an **audit insert**. Until Phase 28 B1 it *also* awaited a synchronous outbound
HTTPS `POST` to Resend with up to a 10 s timeout, and that transport wait was by far the dominant term
— a sub-millisecond path versus a typically 100 ms+ path, trivially separable by latency measurement
over a modest sample.

**Phase 28 B1 removed that transport term from the request path.** The send is now dispatched after
the durable writes and is not awaited, so the 202 no longer waits on a mail provider. The dominant,
most easily measured component of the difference is therefore **gone**.

**What is NOT eliminated.** The success path still performs more DATABASE work than the silent exit —
the business check, the token insert, the `deleteMany` and the audit insert against one indexed read.
A timing difference therefore still exists in principle, it is **not** claimed to be eliminated, and no
delay is injected to mask it, because unmeasured timing noise is not a security control. This entry is
recorded as a **partial mitigation so that it is not mistaken for closure**.

Enumeration resistance remains the governing invariant of this phase, and the uniform 202 does not
protect the clock. The remedy anticipated in this entry — *"making the send fire-and-forget after the
202 is written"* — **was implemented by Phase 28 B1**. It closed the transport term and, as predicted
here, left the database term; **Phase 29 recorded the owner's decision to ACCEPT that residue for V1
and DEFER it rather than pursue it further** (§27E).

### B2 — Distributed reset-mail flooding of one address is not bounded

**Status: accepted / deferred. Not fixed. DEFERRED TO V4 by the Phase 29 owner decision (§27E),
together with E3, as related shared-infrastructure work.**

The account bucket keys on `ip|email`, so its 5/hour cap applies per (source, address). The IP bucket
keys purely on IP, so it bounds total recovery traffic per source but **not** mail volume to any single
victim. An attacker with a rotating IP pool sends 5 × N mails/hour to one inbox; the per-IP backstop
never fires because each source stays under 20. The in-memory stores mean N app instances multiply the
budget as well.

The endpoint is public, unauthenticated, and causes outbound mail and provider-quota consumption;
mail-flooding a third party is the primary abuse vector for a feature of this shape. This is inherent
to the approved design — no Redis, no shared store, both explicitly out of V1 scope, so no in-scope fix
exists. Closing it needs a shared store and therefore a new owner decision.

**Neither B1 nor B2 was closed by the Phase 26B-4 documentation close-out.** That phase recorded them;
it did not address them. **Current status (Phase 28 B1, `7185e5e`): B1 is PARTIALLY MITIGATED — the
outbound transport is off the request path, the residual database-work term remains and is not claimed
to be eliminated — and B2 remains OPEN and unimplemented.** See §27D.

**Phase 29 then recorded the owner's dispositions, and those are the current ones:** B1's residual is
**ACCEPTED FOR V1 and DEFERRED** — not closed, and not pursued further in V1; B2 and E3 are **DEFERRED
TO V4** as related shared-infrastructure work, both still open. See §27D and §27E.

## Residual Risks (accepted)

Also from the audit, all accepted as inherent or as the deliberate price of a chosen trade-off.

- **E2 — Cross-process same-second interleaving can settle at zero live tokens.** Two concurrent
  requests can leave both links dead and neither usable. The property that matters — never two live
  tokens for one user — holds. A partial unique index would make it absolute and was deliberately not
  added; the user simply asks again.
- **E3 — The limiter stores are in-memory and therefore per-process.** A multi-instance deployment
  multiplies every budget. A shared store (Redis) is out of V1 scope by decision; this is the same
  underlying limit as B2. **DEFERRED TO V4 by the Phase 29 owner decision (§27E), recorded together
  with B2 as related shared-infrastructure work** — the in-memory architecture is unchanged and no
  shared store was introduced.
- **E4 — A delivery failure leaves a live, unused token row** for an account whose owner never received
  the link. Nobody holds the raw token, so it is unusable; the next request's `deleteMany` removes it,
  and the TTL index removes it eventually. The alternative — deleting the row on delivery failure —
  would make the row's existence conditional on an external service and would complicate the audit
  story, so it was rejected deliberately.
- **E5 — A swallowed delivery failure gives the client no retry signal.** This is the price of the
  enumeration invariant, paid knowingly: the operator learns from the log, and the user simply asks
  again.
- **E6 — The `PASSWORD_RESET_REQUESTED` audit row exists only for real accounts**, so an ADMIN reading
  the trail can infer that an account exists. Necessary for the trail to be useful, and the audience is
  OWNER/ADMIN inside the tenant, not an anonymous caller.
- **E8 — A `revokeAllSessions` failure after `user.save()` leaves the password changed but sessions
  live.** Fail-closed for the token, not for the sessions. The password is already changed and
  `passwordChangedAt` rejects strictly-earlier tokens, so the residual window is the same second.
- **E9 — The `expireAfterSeconds: 0` sweep is eventual (~60 s).** Correctness does not depend on it:
  the claim query filters `expiresAt` directly.

## Verified

**Figures below are the Phase 26B-4 close-out snapshot and are preserved as the record of that phase.
Phase 28 B1 subsequently added four cases to the same HTTP suite and moved the suite arithmetic — see
§27D for the current numbers. The historical values here have deliberately not been back-updated, in
keeping with how every earlier phase's `## Verified` block is kept.**

- **`npm run test:unit` — 209 pass, 20 skipped, 0 fail.**
- **`npm run test:db` — 394 pass, 15 skipped, 0 fail.**
- **`npm run lint` — exit 0**, 0 errors and 0 warnings.
- **Full arithmetic: 603 passing tests** (209 + 394), with 35 skipped across the two runs.
- **Phase 26B HTTP suite — 36/36** (`server/test/phase26b-password-recovery-http.test.mjs`; 12 DB-free
  + 24 DB-backed cases).
- **Phase 26B password-recovery suite — 39/39** (`server/test/phase26b-password-recovery.test.mjs`).
- **Phase 26B mail suite — 37 tests** (`server/test/phase26b-mail-service.test.mjs`, DB-free).
- **Phase 23 authorization contract — 19/19** (both new routes classified `PUBLIC` with reasons).
- **Phase 24 runtime authorization matrix — 10/10.**
- **Phase 07B auth security — 16/16** (the login limiters' `skipSuccessfulRequests` still present).
- **Every new security assertion was proven able to fail before it was trusted.** The recovery service's
  three mutations each produced a *named* assertion failure and were then reverted (service hash
  restored byte-identical): leaking the raw token into audit metadata; adding a `$unset: { usedAt }`
  release path; dropping `usedAt: null` from the claim filter. The controller's call-site guard was
  written because passing `confirmPassword` through produced **no** observable failure — it is caught
  structurally instead.
- **Route inventory, independently measured** by a source-level walk of `app.js`'s mounts and each
  router's declarations: **65 routes = 47 permission-gated + 10 authenticated + 8 public + 0
  role-gated**. Phase 26B added exactly two, both public; the gated tier is unchanged at 47.
- `mobile/**` is untouched by both commits, and no dependency was added to either `package.json`.

## Definition of Done

- A user who has forgotten their password can complete a reset by email, without an operator.
- `forgot-password` is indistinguishable across the unknown-address, disabled-account, delivered and
  delivery-failed cases — with `MAIL_NOT_CONFIGURED` as the one documented, ordering-justified
  exception.
- A reset token is single-use, expires, is stored only as a hash, and can never be replayed or
  released once claimed.
- No new permission, role grant, session semantic or mobile change; no new dependency.
- The two accepted High risks were recorded in writing here. **At the time of this close-out both
  remained open**; subsequently **B1 was PARTIALLY MITIGATED by Phase 28 B1 (`7185e5e`) and is still
  not closed**, while **B2 remains open and unimplemented**.
- Nothing pushed without explicit owner approval.

---

# 27C. Phase 27 — Mobile Password Recovery

**Status: implemented, verified and committed (2026-09-13); not pushed.**
**Commit: `6b8c3c0` — "feat: add password recovery screens to the mobile app (Phase 27)", 5 files,
+380/−7. ZERO `server/` files changed, and no dependency added to either `package.json`.**

## Objective

Give the mobile application the client half of Phase 26B. Phase 26B shipped two public recovery routes
and a mail layer, but deliberately made **no mobile change**, so a reset link pointed at
`PASSWORD_RESET_URL` opened nothing a user could complete the flow in. Phase 27 adds the two screens
that consume those endpoints, so a locked-out user can finish a reset entirely inside the app.

The scope is deliberate and narrow: **mobile only, zero backend change, no new dependency, no
navigation change, no permission or role-grant change.** `PASSWORD_RESET_URL` already accepted a
custom scheme, so `mailConfig.js` needed no edit — the backend was complete as shipped.

## Scope

### `mobile/app/forgot-password.js` (new)

A **PUBLIC** screen, a sibling of login/register and deliberately **outside the `(app)` group**,
whose layout redirects anyone who is not signed in and would discard the flow before it starts. It
collects an email and calls the existing `POST /api/auth/forgot-password`.

- **Presence-only email check.** No client-side email-shape rule is imposed, because the shape rule
  lives in the server's validator and a second copy would drift from it.
- **The success state is a fixed client constant and never reads the response.** The server answers one
  identical 202 whether or not the address exists, and swallows a post-lookup delivery failure to that
  same 202 precisely because a distinguishable answer would be an account-existence oracle. Rendering
  the response body would be the one place the client could undo that, so this screen does not read it.
- **No `signedIn` redirect.** A signed-in visitor landing here is harmless — the reset would simply end
  their sessions — and bouncing them into `(app)` would be exactly the silent navigation the phase
  forbids.

### `mobile/app/reset-password.js` (new)

A **PUBLIC** screen outside `(app)`, reached by the emailed deep link, calling the existing
`POST /api/auth/reset-password`.

- **The token is read from `useLocalSearchParams()` and from nowhere else.** A missing param is
  `undefined`, and a link carrying the key twice yields an **array**; neither is a usable token and
  neither reaches the network — both render "Link incomplete" with no request made.
- **The token's shape is deliberately not validated client-side beyond a trim.** The value is opaque
  base64url, so any client-side rule about its length or alphabet could only ever reject a *valid*
  link. There is no client-side token length restriction.
- **`confirmPassword` keeps the server's own field name** on its input, so a server-side field error
  lands on the field it names. A field error naming `token` — which has no input of its own — is
  **promoted to form level** rather than dropped silently.
- **Friendly pre-checks** mirror the server rules (required, minimum 8 characters, confirmation match)
  and never substitute for them: the server remains authoritative.
- **A new token arriving while the screen is mounted resets the screen completely** — form values,
  field errors, the form error and the success state — so a fresh attempt cannot inherit a previous
  success.
- **All hooks precede every early return.** The three render states (`no token` / `done` / `form`) are
  entered after the hooks, so the component does not repeat the frozen hooks-after-early-return pattern
  in `(app)/ai/index.js`.
- Three render states: **"Link incomplete"** (no token, with a route to `/forgot-password`),
  **"Password changed"** (success), and the form.

### Login entry point (`mobile/app/login.js`)

A "Forgot password?" link was added to the existing `AuthLayout` footer, above the existing
"New to Inventory AI? Create an account" line. Nothing else on the screen changed: the same fields,
the same validation, the same `signedIn` redirect and the same error handling. The footer's two lines
are separate `Text` nodes with a margin between them rather than a `gap`, so each centres on its own
when it wraps at large font scales.

### API layer (`mobile/lib/api.js`)

Two thin wrappers over the **existing** endpoints — `forgotPassword(email)` and
`resetPassword({ token, newPassword, confirmPassword })` — following the file's established
`apiFetch`/`ApiError` convention, plus both names added to the default export.

Both are deliberately **tokenless**: neither takes nor sends a JWT. The recovery surface is public, so
sending authorization would be meaningless, and not sending it means a refused public call can never
trip the central session-loss handling in `lib/client.js`.

### Shared component (`mobile/components/Banner.jsx`)

One **additive** line: a `success` tone. Every one of the 23 pre-existing call sites uses
`error`/`warn`/`info`, so no existing screen can change appearance. The tone uses the `success` and
`successSoft` tokens, which already existed in **both** palettes — no token was added or altered.

### Deep linking

Custom-scheme deep linking uses **`inventoryai://reset-password`**, matching the `scheme` already
declared in `mobile/app.json`, so the operator-facing configuration is:

```text
PASSWORD_RESET_URL=inventoryai://reset-password
```

A link of the form `inventoryai://reset-password?token=<token>` opens the app directly and hands the
token to the reset screen as a route parameter. Expo Router's `fromDeepLink()` concatenates host +
pathname + query and strips a leading slash, so `reset-password` is the route name — kept lowercase
because `new URL()` lower-cases a host.

**Universal Links and Android App Links remain intentionally deferred.** As shipped, a reset link
opened on a device that does not have the app installed has no web fallback; that is a known,
accepted limitation of this increment, not an oversight.

## Token security rules

The reset token is treated as a live credential for its whole lifetime.

- **Read from route params only.** It is never constructed, guessed, defaulted or accepted from any
  other source.
- **Never rendered.** It appears in no label, message, hint or accessibility string.
- **Never logged by application code.** The five files contain no `console.*` call at all.
- **Never persisted.** It is not written to SecureStore, `AsyncStorage`, or any other storage; the only
  persisted auth value in the app remains the session token.
- **Never copied into navigation.** It is not forwarded to another route, a `router.replace`/`push`
  target, or a param object.
- **Sent in exactly one place:** the JSON body of `POST /api/auth/reset-password`.
- **Rejected locally when unusable.** A missing, empty or non-string token produces no network request.
- **Never in a log line on the way out.** The server records `req.path` only for these routes, so no
  request log carries the body or the query.

## Successful reset clears the client session before navigating to Login

On success the screen sets its success state and then calls **`await clearSession()` before
`router.replace('/login')`**. That ordering is load-bearing rather than cosmetic: `login.js` redirects a
`signedIn` status into `(app)`, so navigating to Login while the client still believed it was signed in
would have silently landed the user **inside the app**. `clearSession` is the correct call rather than
`signOut` because the reset already ended every server-side session (Phase 26B-2's
`passwordChangedAt` stamp plus `revokeAllSessions`), so a logout request would be a guaranteed 401
fired for nothing.

## Accepted residual

Recorded here so it is owner-visible rather than merely in code.

- **The reset token necessarily exists in the route params for as long as the reset screen is
  mounted.** There is no way to complete the flow without it, and it cannot be cleared from the URL
  before it is submitted. It is therefore mitigated rather than eliminated: it is never rendered,
  never logged by application code, never persisted, and never copied into another navigation, and
  **the route is replaced after a successful reset**, so the spent token does not remain the active
  route's parameter.
- **The foreground same-route second-token case (token A → token B while the reset screen is already
  mounted) remains an explicit QA risk and was not device-tested.** The code handles it by design —
  the token is read from the focused route's params rather than latched into state, and a `useEffect`
  keyed on the token clears the form, the errors and the success state — but that is **reasoned
  behaviour, not observed behaviour**. Delivering two links to an already-open screen was not exercised
  on a device in this increment.

## Verification limits

- **Expo Go cannot runtime-test the custom `inventoryai://` scheme.** Expo Go is launched by its own
  `exp://` scheme, so a literal `inventoryai://reset-password` run requires a development build, which
  this repository does not produce (no `expo-dev-client`, no `android/`, no `eas.json`). Runtime QA was
  therefore performed through **`exp://<host>:8081/--/reset-password?token=…`**, which Expo Router
  resolves through the **same** `fromDeepLink()` code path a custom scheme uses, so the route
  resolution, the param parsing and the screen behaviour are all genuinely exercised. What is *not*
  exercised is the custom-scheme handoff itself.
- **The `inventoryai://` target is configuration-verified only**, by inspection of `mobile/app.json`'s
  `scheme` value and of Expo Router's documented resolution, not by a runtime launch.
- **iOS was not runtime-verified.** iOS verification was **export/bundle-only**: the bundle builds and
  contains both routes, but no iOS device or simulator run was performed.
- **Development-environment caveat, not an application defect.** Expo Go's dev runtime writes the
  launching URL — including a reset token — to logcat as `initialUri`. A control launch on a
  token-free route shows it logs `initialUri` on **every** launch regardless of route, which
  identifies it as the Expo Go shell rather than application logging; the app itself contains no
  `console.*` calls. It applies to any deep link in Expo Go, and it disappears in a production build.

## Verified

- **`npx expo export --platform android` — exit 0; `npx expo export --platform ios` — exit 0**
  (iOS bundle verification only, no runtime). Both `forgot-password` and `reset-password` are present
  in the shipped bundle.
- **Backend regression, unchanged baseline:** `npm run test:unit` — **209 pass, 20 skipped, 0 fail**;
  `npm run test:db` — **394 pass, 15 skipped, 0 fail**; `npm run lint` — **exit 0**. Identical to the
  Phase 26B numbers, as expected: no backend file changed.
- **Android runtime QA on the emulator (Expo Go, `exp://10.0.2.2:8081/--/…`, cold launch each time):**
  token present → reset form; token missing → "Link incomplete" with no request; `?token=` empty →
  the same, with no request; **full end-to-end reset** — minted token → form → `200` → "Password
  changed" → Login screen (**not** `(app)`) → **sign in with the newly set password** → dashboard as
  OWNER; spent token re-use → `400` with the server's message; mismatched confirmation → the client
  pre-check. `/login` renders "Forgot password?" with the rest of the screen unchanged, and
  `/forgot-password` renders.
- **The token was confirmed absent from the rendered UI** by dumping the view hierarchy during the
  reset flow and searching it for the token value.
- **Security review:** zero `console.*` in all five files; no reset token in any persisted storage;
  no `Authorization` header sent by either wrapper; the server's request log records no token.
- **Commit contents audited:** exactly the five production files; `server/**` empty in the commit;
  the 33 pre-existing untracked artifacts untouched; nothing pushed.

## Definition of Done

- A user who follows a reset link can set a new password entirely inside the app and sign in with it.
- The token is read only from the deep link, never rendered, logged, persisted or copied into
  navigation, and leaves the app only in the reset POST body.
- A successful reset returns the user to Login — never into `(app)` — because the client session is
  cleared before navigation.
- No backend file, permission, role grant or existing screen behaviour changed, and no dependency was
  added.
- The two verification limits (custom-scheme runtime untested; iOS export-only) and the one QA risk
  (foreground second-token delivery) are recorded in writing here rather than left implicit.
- Nothing pushed without explicit owner approval.

---

# 27D. Phase 28 — Password Reset Mail Delivery Timing Hardening

**Status: implemented, verified and committed (2026-09-13); not pushed.**
**Commit: `7185e5e` — "fix: detach password reset email delivery from request path (Phase 28 B1)",
5 files, +507/−27.**
**B1 ONLY. Phase 28 B2 was NOT implemented and remains open — DEFERRED TO V4 by the Phase 29 owner
decision (§27E).**

## Objective

Remove the outbound password-reset email transport from the synchronous HTTP request path, so that
`POST /api/auth/forgot-password` no longer waits on an external mail provider before answering. This
is the remedy §27B's B1 entry anticipated — *"making the send fire-and-forget after the 202 is
written"* — and it targets the single largest and most easily measured component of the account-existence
timing oracle.

The owner's scope was explicitly limited to **B1 only**. B2 (distributed reset-mail flooding) was
named, left untouched, and is still open. No permission, role grant, route, dependency, configuration,
token semantic, audit semantic, rate limiter or mobile file changed.

## Scope

Five files, of which **two are production**:

- `server/src/services/passwordReset.service.js` (+98/−19) — the detach itself, plus
  `logDetachedMailFailure` and its three reason codes.
- `server/src/controllers/passwordReset.controller.js` (+34) — **comment-only**: the retained
  `MailDeliveryError` branch is preserved verbatim and annotated with why it is a regression guard.
- `server/test/fakes/mailProvider.mjs` (+100) — `inflight` tracking, `awaitPendingMail()`,
  `pendingMailCount()` and `fakeMailGate()`.
- `server/test/phase26b-password-recovery-http.test.mjs` (+210) — cases 37-40.
- `server/test/phase26b-password-recovery.test.mjs` (+92) — case 11 rewritten to the new contract.

## The detached-delivery contract

`requestPasswordReset` ends with an **unawaited** send whose rejection is handled in the same
synchronous turn:

```js
sendPasswordResetEmail({
  to: user.email,
  resetUrl: buildResetUrl(resetUrl, rawToken),
  expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
}).catch(logDetachedMailFailure);
```

Four properties make this safe, and each is load-bearing rather than stylistic:

- **Order is forced, not merely asserted.** Everything durable — the token insert, the `deleteMany`
  that enforces one live token, and the `PASSWORD_RESET_REQUESTED` audit row — completes **before**
  dispatch. This falls out of the code's shape: the send is addressed to `user.email`, which is only
  reachable after the account lookup, so the detach is structurally the last statement.
- **The rejection cannot escape.** `.catch` is attached in the same synchronous turn the promise is
  created, and `sendPasswordResetEmail` is an `async` function, so even a synchronous throw inside it
  (notably `selectProvider()`'s `MailNotConfigured`) arrives as a rejection rather than propagating to
  the caller. An unhandled rejection here would crash the process on a delivery failure — converting a
  swallowed, operator-visible event into an outage.
- **The handler cannot itself throw.** `logDetachedMailFailure` performs only `instanceof` tests, one
  `typeof` guard and a structured log call. A throw inside a `.catch` handler would create a fresh
  rejected promise with nothing attached — precisely the unhandled rejection this boundary exists to
  prevent.
- **The operator keeps the distinction.** Three reason codes are emitted: `mail_not_configured`,
  `mail_delivery_failure` (both the **same strings** the controller's `logMailFailure` used, so an
  operator's grep survives the move) and `mail_dispatch_error` for a template or programming fault.
  The third exists so a code defect is not misreported as a provider outage and does not send an
  operator to a provider status page for something the provider never saw. The message carries safe
  facts only — the mail layer builds it from an HTTP status and a provider error name — so the reset
  URL, which is a live credential, can never appear, and no `userId` is logged on this unauthenticated
  path.

## What did NOT change

- **The `forgot-password` invariant.** One identical 202 to every caller, and `requestPasswordReset`
  still returns `undefined` on every non-error path, so the controller has nothing it could reflect.
- **`MAIL_NOT_CONFIGURED` is still a pre-lookup 503.** The `isMailConfigured()` and `resetUrl` guards
  still precede `User.findOne`, so that answer is reachable identically for an unknown address and
  distinguishes nothing about any account. The detach did **not** move this check.
- **Token semantics.** Generation, SHA-256 hashing, the 30-minute TTL, the atomic single-use
  `findOneAndUpdate` claim, fail-closed `usedAt`, and one-live-token `deleteMany` — all unchanged.
- **Audit semantics, and the audit write still precedes dispatch.**
- **Rate limiting**, including the deliberate omission of `skipSuccessfulRequests` on the three
  recovery limiters.
- **The `reset-password` flow**, the mobile client, deep-link behaviour, and the route inventory.
- **The retained controller branch.** The `MailDeliveryError` branch in `forgotPassword` is now
  **unreachable** — the service handles the rejection itself — and is kept deliberately. If a future
  change reintroduces an awaited delivery path, the failure would arrive there again, and without the
  branch it would fall through to `mapPasswordResetFailure` and answer a post-lookup `MAIL_*` 503 for
  an address that exists: exactly the oracle decision D1 exists to avoid. **It must not be deleted as
  dead code.** The `MailDeliveryError → 503 MAIL_UNAVAILABLE` row in `mapPasswordResetFailure` is
  likewise retained as documented forward defence.

## Partially mitigated, not closed

**The oracle is NOT closed, and this phase does not claim it is.** What was removed is the outbound
transport wait — the dominant, most separable term, a synchronous HTTPS request with up to a 10 s
timeout against a sub-millisecond silent path. **What remains is database work**: the business
existence check, the token insert, the `deleteMany` and the audit insert, against one indexed read for
an unknown address. That difference still exists in principle and is **explicitly not claimed to be
eliminated**. No delay is injected to mask it, because unmeasured timing noise is not a security
control.

**Phase 29 recorded the owner's decision on this residue: ACCEPTED FOR V1 and DEFERRED.** No further
work on it is scheduled in V1, its token durability, audit ordering and detached-mail behaviour are
unchanged, and **this phase does not claim the oracle is closed** — it remains PARTIALLY MITIGATED.

## B2 remains open

**B2 — distributed reset-mail flooding of one address is not bounded — was not implemented, not
mitigated, and not touched.** The account bucket still keys on `ip|email` while a rotating attacker
never trips the per-IP bucket, and the limiter stores are still in-memory and therefore per-process.
Closing it needs a shared store (Redis), which is out of V1 scope by decision and requires its own
owner decision. The rate limiters are byte-identical to Phase 26B.

**Phase 29 recorded that decision: B2 is DEFERRED TO V4**, together with **E3** (the in-memory,
per-process limiter stores, which share the same root cause and the same remedy) — both recorded as
**related shared-infrastructure work**. **No shared store was introduced, no dependency was added, and
the rate limiters remain byte-identical**; B2 stays OPEN and is explicitly deferred rather than fixed.

## Verified

- **`npm run test:unit` — 209 passed, 20 skipped, 0 failed** (229 tests, 69 suites).
- **`npm run test:db` — 398 passed, 15 skipped, 0 failed** (413 tests, 55 suites).
- **`npm test` — 607 passed, 0 failed, 0 skipped** (87 suites, exit 0).
- **Arithmetic: 209 + 398 = 607 passing**, with **35 skipped** across the two split runs.
- **`npm run lint` — exit 0**, 0 errors and 0 warnings.
- **Phase 26B HTTP recovery suite — 40 cases, 40 passing** (12 DB-free + 28 DB-backed; four cases
  added by this phase).
- **Phase 26B password-recovery service suite — 39 cases** (case 11 rewritten, not added).
- **Phase 26B mail suite — 37 cases** (unchanged, DB-free).
- **Route inventory unchanged at 65** — this phase added no route. The Phase 23 classifier's `PUBLIC`
  bucket still declares exactly the same two recovery routes.
- **The behavior is proven by ordering, not by measurement.** Cases 37-39 hold the transport open with
  `fakeMailGate`, so "the 202 did not wait for delivery" is a fact about ordering rather than a latency
  threshold that would be flaky on a loaded machine and prove nothing when green. Case 37 asserts the
  response has arrived **while** `pendingMailCount() === 1` and `sentMessages().length === 1` — the
  latter stopping it passing vacuously by the send never having been attempted. Case 38 proves the
  detached send completes exactly once after release, with the token and audit preconditions asserted
  before release. Case 39 proves the failure is logged strictly **after** the response and never goes
  unhandled. Case 40 is a source-level structural guard pinning that no `await sendPasswordResetEmail(`
  remains and that the `.catch(logDetachedMailFailure)` and the controller's guard are both present.
- **Every new assertion was proven able to fail before being trusted — these are verification
  observations, not implementation changes.** Two mutations were applied to the service and reverted:
  restoring `await sendPasswordResetEmail({...})` reproduced case 11's named failure (`the request must
  resolve — delivery is detached: The email provider is unavailable.`), and changing it to
  `await ... .catch(...)` — awaited, but caught — **deadlocked the HTTP suite**, because case 37's
  gated transport blocks the very request the test is waiting on. That deadlock is itself evidence that
  case 37 detects blocking delivery rather than merely observing a fast local fake. The service was
  then restored and confirmed byte-identical (`git hash-object` = `95e5fde4…` before and after).
- **The committed diff is exactly the five approved files**, and `mobile/**` is untouched.

## Definition of Done

- The outbound mail transport is no longer on the `forgot-password` request path; the 202 does not wait
  on a mail provider.
- The detached promise has rejection handling attached in the same synchronous turn, the handler cannot
  itself throw, and a background delivery failure never surfaces as an unhandled rejection.
- Token and audit writes complete before dispatch, and the caller's response is the same constant
  whichever way the detached send settles.
- `MAIL_NOT_CONFIGURED` remains a pre-lookup 503, and the `forgot-password` response remains identical
  across unknown, disabled, suspended, orphaned, delivered and delivery-failed cases.
- **B1 is recorded as PARTIALLY MITIGATED, NOT CLOSED**; the residual database-work timing term is
  documented as remaining and is not claimed to be eliminated.
- **B2 is recorded as open and unimplemented**, with its reasoning unchanged.
- The retained controller `MailDeliveryError` branch is preserved as an unreachable regression guard
  and is documented as such, so that deleting it is a visible decision rather than a tidy-up.
- Nothing pushed without explicit owner approval.

---

# 27E. Phase 29 — Residual Security-Risk Decision Record & Documentation Reconciliation

**Status: implemented, verified and committed (2026-09-13); not pushed.**
**Documentation only — no production code, no test, no dependency and no configuration changed.**

## Objective

Two things, and nothing else. First, to convert the project's three remaining open security items from
*"requires an owner decision"* into **recorded owner decisions**, so the repository states what was
decided rather than what is pending. Second, to reconcile four verified documentation inconsistencies so
the documents match the shipped implementation — which matters here not as tidiness but because
`docs/SYSTEM_SPECIFICATION.md` §54 criterion 29 is *"Documentation accurately reflects the
implementation."*

Without this phase every remaining open item was blocked. The residual timing term of B1, B2 and E3 all
resolve to either an acceptance decision or a shared-store infrastructure decision, and no code phase
could legitimately proceed ahead of one.

## The three owner decisions

**D-1 — B1 residual: ACCEPT FOR V1 / DEFER.** The database-work timing difference left by Phase 28 B1 is
**accepted for V1 and deferred**. It remains **PARTIALLY MITIGATED, NOT CLOSED**. No attempt was made to
eliminate it, no delay is injected to mask it, and token durability, audit ordering and detached-mail
behaviour are unchanged. The reasoning the owner accepted: the dominant, most separable term — the
transport wait — is already gone; what remains is database work whose equalization would require either
dummy writes on the silent path or moving durability off the request path, and the latter would trade a
timing oracle for a lost-token correctness failure.

**D-2 — B2: DEFER TO V4.** Distributed reset-mail flooding of one address stays **OPEN and explicitly
deferred to V4**. No Redis, no shared rate-limit store and no other shared-store infrastructure was
introduced, and the rate limiters are unchanged.

**D-3 — E3: DEFER TO V4.** The in-memory, per-process limiter stores stay **OPEN and explicitly deferred
to V4**. The current limiter architecture is unchanged in this phase. **B2 and E3 are recorded as
related future shared-infrastructure work** — same root cause (no shared store), same remedy, and
therefore the same future increment.

## What did NOT change

- **No production code.** `server/**` and `mobile/**` are byte-identical; no route, controller, service,
  model, middleware, limiter or dependency was touched.
- **No test file changed.** The suite is untouched, and its figures are unchanged by this phase.
- **No dependency, lockfile, configuration or deployment file changed.**
- **Password-reset behaviour is unchanged** — the detach, token semantics, audit ordering, the uniform
  202 and the pre-lookup `MAIL_NOT_CONFIGURED` 503 are exactly as Phase 28 B1 left them.
- **Rate limiter behaviour is unchanged**, including the deliberate omission of
  `skipSuccessfulRequests` on the three recovery limiters.
- **The retained controller `MailDeliveryError` branch is preserved.** It was not deleted, and it is
  still documented as an unreachable regression guard.
- **No roadmap section was renumbered.** §27E is a new lettered subsection in the post-27 series;
  sections 28–36 keep their existing numbers, and no `# 28` was created for Phase 28 or Phase 29.

## Documentation reconciliation

Four inconsistencies, each verified against the files before being changed:

- **`docs/DEVELOPMENT_ROADMAP.md` §3 "Phase Overview"** — the flow diagram ended at Phase 26B, so
  **Phase 27 and Phase 28 were absent** from the canonical overview although both exist as top-level
  sections. Phases 27, 28 and 29 are now listed.
- **`README.md` Phase Status** — the list jumped from Phase 26A to Phase 27, and Phase 26B appeared once
  in the whole file only as a passing mention. **The missing Phase 26B entry was added.** This was the
  follow-up deferred by the Phase 28 documentation close-out, discharged here.
- **`docs/SYSTEM_SPECIFICATION.md` §48 "Future Roadmap"** — the V2 list still named the **Barcode/QR
  Scanner, Supplier Management and Stock Transfers** as future work although all three shipped (Phases
  12B–12D, 13A/17 and 19). Roadmap §35 already carried that correction; the specification was
  reconciled to match it.
- **The three risk dispositions** — now recorded in §27B, §27D, `CLAUDE.md` and `README.md` as decisions
  rather than as pending questions.

## Historical snapshots are preserved

This phase **did not back-update any historical `## Verified` figure**, in keeping with the convention
every earlier phase follows. In particular §27B's Phase 26B-4 snapshot still reads *36/36 HTTP cases, 39
recovery cases, 209 + 394, 603 total* even though the current figures are 40, 39 and 209 + 398 = 607 —
the snapshot is the record of that phase, and the qualifier paragraph explaining this remains in place.
**No test-count snapshot was rewritten merely to make it match today's totals.**

## Verified

- **`git diff --name-only` — documentation files only.** No `server/**` or `mobile/**` path appears.
- **`git diff --check` — exit 0.**
- **The 33 pre-existing untracked entries are unchanged and untouched**, and none is staged.
- **Every decision statement was re-checked against the implementation before being written**, not
  restated from memory: the request path in `passwordReset.service.js` still ends in the unawaited
  `.catch(logDetachedMailFailure)`; `mapPasswordResetFailure` and the controller's `MailDeliveryError`
  branch are both still present; the limiter stores are still in-memory and per-process.
- **No new test run is claimed for this phase.** It changes no code and no test, so the suite's state is
  exactly `7185e5e`'s — 607/607 across 87 suites, `test:unit` 209 pass / 20 skipped, `test:db` 398 pass
  / 15 skipped, `lint` exit 0 — which was measured during the Phase 28 close-out.

## Definition of Done

- The three residual risks have a recorded owner disposition instead of an open question.
- **B1 is recorded as PARTIALLY MITIGATED, NOT CLOSED and ACCEPTED FOR V1 / DEFERRED** — never as fixed.
- **B2 and E3 are recorded as OPEN and DEFERRED TO V4**, as related shared-infrastructure work, with no
  shared store introduced.
- The four documentation inconsistencies are reconciled, and the deferred Phase 26B README follow-up is
  discharged.
- Historical verification snapshots are preserved untouched.
- No production code, test, dependency, configuration, limiter or password-reset behaviour changed.
- Nothing pushed without explicit owner approval.

---

# 27F. Phase 30A — EAS Development Build & iOS Readiness Foundation

## Objective

Give the mobile app a working EAS foundation for a future development build, **without producing one**.

## Coding

Infrastructure only. No application code, no test, no backend file, and no behavioural change.

## Scope

The phase deliberately does **not** run `eas build`, `eas submit` or `expo prebuild`, does not create
`mobile/ios/` or `mobile/android/`, does not install `expo-updates`, and does not touch F-1 (PDF sharing).

## What landed

**1. The CNG architecture is retained.** Nothing under `mobile/ios/` or `mobile/android/` exists, and
both paths are still gitignored (`mobile/.gitignore:40,41`). Every native setting continues to flow from
`app.json` plus config plugins, so a build's native projects are generated on EAS servers rather than
committed.

**2. `expo-dev-client` was added**, at the Expo-resolved, SDK-57-matched `~57.0.19`. The installed tree is
`expo-dev-client@57.0.19` / `expo-dev-launcher@57.0.20` / `expo-dev-menu@57.0.18`. **`expo-updates` was
deliberately not installed** and remains absent from both `package.json` and `node_modules`; the
`expo-updates-interface` package that arrives as a dev-client transitive dependency is **not** OTA and
does not create an update path. The lockfile gained exactly **7 packages, 0 removed, 0 version-changed**.

**3. `mobile/eas.json` was created** with four build profiles:

| Profile | Shape |
|---|---|
| `development` | `developmentClient: true`, `distribution: "internal"`, Android APK |
| `ios-simulator` | extends `development`, with `ios.simulator: true` |
| `preview` | `distribution: "internal"`, Android APK, no dev tools |
| `production` | `autoIncrement: true` |

`cli.appVersionSource` is **`"remote"`**, so EAS tracks build numbers server-side and `app.json` is never
dirtied by a version bump. There is **no `channel` key anywhere** in the file, which is correct precisely
because `expo-updates` is not installed — an update channel is meaningless without an OTA runtime.

**4. The project was linked to EAS.** `eas init` **created** `@jeffernqwes-team/inventory-ai` — no prior
project existed, and `init` is create-or-link keyed on the app slug, so it would have linked rather than
duplicated had one been present. It recorded `extra.eas.projectId` (`607eca05-1175-43ed-86a0-1829e91c9531`)
and `owner` (`jeffernqwes-team`) in `app.json`. The account was **not** inferred: the authenticated CLI
exposes two accounts (`jeffernqwe` and `jeffernqwes-team`), both Role: Owner, and the repository contains
no `owner` field or project ID to disambiguate them, so the choice was escalated to the owner.

**5. Both platforms carry the identifier `com.inventoryai.app`** — `ios.bundleIdentifier` and
`android.package` — deliberately hyphen-free, because the slug `inventory-ai` would be an invalid Java
package segment. The two must stay in lock-step.

## `eas init` writes back the plugin-resolved config

`eas init` persists the **plugin-resolved** Expo config, not merely the keys it owns. On this project it
additionally injected `extra.router: {}` and `android.permissions: ["android.permission.CAMERA"]`,
inflating the `app.json` diff from 2 insertions to 14 insertions / 2 deletions. Both were removed by
owner decision, and both were **proven derived rather than intentional** before removal:

- `expo-router`'s own config plugin **writes** `extra.router` on every resolution
  (`withRouter` returns `{...config, extra: {...config.extra, router: {...config.extra?.router, ...props}}}`),
  and with the bare `"expo-router"` plugin entry `props` is `{}`. Nothing in the app reads it back.
- `expo-camera`'s plugin injects `android.permission.CAMERA` into the manifest independently
  (`expo-camera/plugin/build/withCamera.js`); `expo config --type introspect` already listed CAMERA in
  `uses-permission` **before** `init` ran.

The confirming evidence is that after removal the resolved native surface is **unchanged**: the introspect
output still reports `android.package: com.inventoryai.app`, still lists CAMERA among `uses-permission`,
still resolves the URL schemes `["inventoryai","com.inventoryai.app"]` and `exp+inventory-ai`, and still
shows `extra.router` — regenerated by the plugin. The committed `app.json` diff is therefore four
intentional additions: `ios.bundleIdentifier`, `android.package`, `extra.eas.projectId`, and `owner`.

## Not runtime-verified

**No runtime verification was performed and none is claimed.** No `eas build`, no `eas submit`, no
`expo prebuild`, no simulator or device run, no APK install and no EAS-hosted build exists. Everything in
this phase is **statically** validated.

## Verified

- **`git diff --stat`** — `mobile/app.json` (+9/−1), `mobile/package-lock.json` (+81),
  `mobile/package.json` (+1). `git diff --cached --stat` empty; nothing staged.
- **The `app.json` diff is four intentional additions**: the two identifiers, and the two
  EAS keys.
- **`mobile/eas.json`** — valid JSON; four profiles present; `cli.appVersionSource: "remote"`; **0
  occurrences of `channel`**; `ios-simulator.extends = "development"` with `ios.simulator: true`;
  `development.env` absent.
- **`extra.eas.projectId` matches the initialized project** — `607eca05-1175-43ed-86a0-1829e91c9531`.
- **`expo-updates` absent** from both `package.json` and `node_modules`.
- **`expo-modules-core@57.0.18` stayed top-level with 0 nested copies** and a single lockfile key, despite
  npm emitting a `react-native-worklets` peer-conflict warning during install. The nesting trap that
  silently kills the Jest suite did **not** recur, and no lockfile relocation was needed.
- **No `ios/` and no `android/` directory**; both still matched by `mobile/.gitignore`.
- **Toolchain, measured before the install, after the install, and again after the config edits — identical
  each time:** `npm run test` 11 suites / 88 tests pass; `npm run typecheck` (`tsc --noEmit`) clean;
  `npm run lint` (`eslint .`) clean; `npx expo-doctor` 21/21.
- **`git diff --check`** — clean.

## Definition of Done

- EAS foundation established with the CNG architecture retained and no native directory committed.
- The project is linked to the intended EAS account, with the project ID recorded.
- Four build profiles exist, with a remote app version source and no update channel.
- `expo-dev-client` present; `expo-updates` still absent.
- Both platform identifiers are `com.inventoryai.app`.
- Nothing is documented as runtime-verified, because nothing was run.
- F-1 is recorded as **not fixed and not closed**.
- Phase 30B is **not** started.
- Nothing committed or pushed without explicit owner approval.

---

# 27G. Phase 32A — Firebase Authentication Architecture & Console Runbook

## Objective

Decide and record **how** Firebase Authentication will enter Inventory AI, before any of it is built.

## Coding

**None.** This phase is documentation only. No source file, dependency, package manifest, environment
variable, database record, Firebase project, EAS or Render configuration, commit or push is changed.

## Scope

The phase deliberately does **not** create a Firebase project, does not generate a service account,
does not install a package, does not migrate a user, and does not alter authentication behaviour.

## Design authority

The design itself lives in **`docs/superpowers/specs/2026-09-18-firebase-auth-design.md`**, which is the
authoritative document. This section records only the decision and its load-bearing constraints.

## What was decided

**Option B — Firebase is the external identity provider; the existing MongoDB `User` + JWT + `Session`
system remains the application's authentication and session layer.** The Firebase ID token is exchanged
**once**, by a new public endpoint, for an Inventory AI access token; it never becomes the API bearer
credential. Options A (complete replacement) and C (Firebase ID tokens used directly as API credentials)
were evaluated against this codebase and rejected: both discard Phase 26A's per-device server-enforced
revocation — a granularity Firebase does not offer — while still requiring the same MongoDB user lookup
per request, making them strictly more work for less security.

Three constraints follow, and each is a security property rather than a preference:

- **`requireAuth` changes by zero lines.** Its 10-step check order, its error codes (`AUTH_REQUIRED`,
  `INVALID_TOKEN`, `ACCOUNT_DISABLED`, `SESSION_INVALIDATED`, `SESSION_REVOKED`) and the
  `req.user`/`req.auth` shapes stay as Phases 23 and 24 pin them.
- **`businessId` and `role` continue to come from the MongoDB `User` record** — never from a request
  body, query, header or token claim. `firebaseUid` is read only from a verified token payload.
- **RBAC is untouched.** 4 roles, 21 permission keys, `ROLE_PERMISSIONS`, `CATALOGUE_ONLY_PERMISSIONS`
  and the Phase 23 mobile mirror all stay exactly as they are. Nothing about permissions migrates to
  Firebase, and Firestore is not introduced.

The legacy path is **preserved, not deprecated in place**: `POST /api/auth/login`, `passwordHash`,
`passwordChangedAt` and Phases 26B/27's recovery surface all survive Phase 32, which is what makes the
mobile work revertible. Two additive `users` fields carry the mapping — `firebaseUid` (String,
**`sparse: true`** unique, so legacy users without one remain valid) and `emailVerified` (Boolean,
persisted but **not enforced** in this phase) — plus `passwordHash.required: false`.

## Verification gates

**Two facts are marked UNVERIFIED and are load-bearing.** Neither may be asserted from memory, and the
authoritative documentation pages returned truncated content when checked:

1. **Firebase `auth:import` support for our existing bcrypt rounds-10 hashes** — affects bulk migration
   only; lazy migration is unaffected. If it fails, the fallback is lazy migration plus a forced-reset
   campaign.
2. **The exact React Native Firebase Expo config-plugin configuration for Expo SDK 57** — affects any
   phase touching native mobile configuration.

A related constraint: Phase 30A records that **no EAS build has ever been executed**, so the M1 path
forces the project's first build, its first keystore, and a two-build SHA-1/SHA-256 fingerprint bootstrap.

## Definition of Done

- The design document exists at `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
- Option B is recorded as selected, with A and C recorded as rejected and why.
- Every non-negotiable invariant is stated, and every preserved subsystem is named.
- Both unverifiable facts are marked **UNVERIFIED**, each with a concrete route to settling it.
- The open owner decisions — password-reset authority, email-verification enforcement, admin-created
  users, Google account linking, M1 vs M2, native config-file storage, `passwordChangedAt` semantics
  for Firebase-native accounts, Expo Go, lazy migration, and the stale "JavaScript" stack note in
  CLAUDE.md §2 — are listed as decisions, **none resolved silently**.
- **No source code, package, environment variable, database record, Firebase project, Render
  configuration, commit or push is changed.**

---

# 27H. Phases 32B–32E — Firebase Implementation (server boundary, client boundary, email/password auth)

## Design authority

`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` remains authoritative. This section records
only what shipped and the decisions that shipped with it. **It also reconciles the phase names**: the
design document's §21 outline is the *plan* Phase 32A recorded, and the mobile work was re-split by the
owner as it landed (reconciled in §21 on 2026-09-20). Google Sign-In, which §21 had placed at 32E,
remains a **later, unnumbered phase** and is not implemented.

## What landed

- **32B — Firebase Admin SDK foundation** (`982284a`). Server-only verify boundary: the Admin SDK
  dependency, `config/firebase.ts`, the ID-token verifier wrapper, environment validation and
  production fail-fast, the `.env.example` names, and the three additive `users` changes —
  `firebaseUid` (String, **`sparse: true`** unique), `emailVerified` (Boolean, persisted and **not
  enforced**), `passwordHash.required: false`. **No routes.**
- **32C — Authentication session exchange** (`d4d9f19`). The two public routes
  `POST /api/auth/firebase/exchange` and `POST /api/auth/firebase/register`, the service behind them, and
  their rate limiters. The Firebase ID token is exchanged **once** for an Inventory AI access token and
  never becomes the API bearer credential. A verified identity with no MongoDB user answers
  `REGISTRATION_REQUIRED`; an email that already belongs to a MongoDB user answers `409 EMAIL_IN_USE` —
  **account linking is refused, not implemented**.
- **32D — Firebase JS SDK boundary on mobile** (`ad26d60`). `mobile/lib/firebase.ts` only: the SDK
  version, initialization order, the `inMemoryPersistence` decision, and the
  `EXPO_PUBLIC_FIREBASE_*` gate that keeps the SDK uninitialized and the app behaving as it did before
  Firebase existed. Infrastructure only — no screen reached Firebase, and no API call was made.
- **32E — Firebase email/password authentication flow**, with the legacy fallback and its server-side
  guard. The mobile sign-in path asks Firebase first and hands the ID token to the 32C exchange; the
  legacy password route is reached **only** when Firebase reports that no identity answers to the
  credentials — never when Firebase or the backend failed, so an outage cannot become a downgrade.

## Decisions recorded by 32E (all now written into the design document)

- **A linked account may no longer use the legacy password login** (§10, §14.1). `loginWithPassword`
  refuses an account carrying a `firebaseUid` with `403 FIREBASE_SIGN_IN_REQUIRED`, after the password
  comparison and the status check so the refusal is not an enumeration oracle, and before the session
  write so no half-login can be left behind. **Rollback consequence:** reverting the mobile build is no
  longer sufficient for a linked account — a reverted build has no Firebase path at all — so rollback
  requires reverting the server behaviour too, or disabling the guard (§11).
- **Password authority is closed** (§14.1). For a linked account, Firebase owns the password; the
  retained bcrypt hash is not a second way in. Recorded with its consequence: for a linked account,
  `change-password` and the 26B/27 reset flow no longer change the credential that actually
  authenticates the user. Inert today, live in the phase that links accounts. The disposition of the
  26B/27 artefacts remains open, and **nothing was removed**.
- **The two Firebase codes that open the legacy route are both handled** — `auth/invalid-credential` and
  `auth/user-not-found`, the same signal under different project settings. Handling only the first would
  hard-fail every legacy account on a project with email-enumeration protection off, which §9.2's
  "no user is ever unable to sign in" forbids.
- **Orphan adoption is implemented** (§8.2, §16.6). A registration whose Firebase identity was created
  before the server step failed is adopted on retry — which requires the same password, so it proves the
  credential rather than merely the address.

## Known limitation recorded by 32E — the unhealable orphan (§16.6)

A **legacy MongoDB account** can have a Firebase identity created for the same email without ever being
linked to it: the client creates the Firebase identity first, and the server then refuses registration
with `409 EMAIL_IN_USE`. Because the exchange resolves a user by `firebaseUid` **only, never by email**,
that identity can never resolve to the existing account, and §8.2's self-healing path does not apply.
**It is not an account takeover and not a lockout** — the legacy account carries no `firebaseUid`, so the
guard does not fire and its password login keeps working. **No fix is implemented**: §8.2 rejects
client-side deletion as racy, and a server pre-check would be a new public route needing its own Phase 23
classification.

**Binding constraint on the migration/linking phase.** When lazy link-on-login (§9.1) creates the
Firebase user for an existing account, it will receive `auth/email-already-exists` for exactly these
addresses. That **MUST NOT be allowed to fail the legacy password login**; the linking phase must handle
the collision explicitly instead of treating it as a login error.

## Scope

No Google Sign-In, no provider federation, no account linking or migration, no `firebaseUid` backfill,
no admin-created-user work, no `emailVerified` enforcement, and no change to the legacy path's
availability for unlinked accounts. The four roles, 21 permission keys, `ROLE_PERMISSIONS`,
`CATALOGUE_ONLY_PERMISSIONS`, the Phase 23 route classification and the mobile RBAC mirror are
unchanged.

## Verification

Documentation only in this increment: **no application source file, test, dependency or `.env` file was
changed**, and no test suite was re-run for it. The 32E code verification is recorded with the 32E
implementation itself.

## Definition of Done

- The design document records the linked-account login guard, its rollback consequence and the closed
  §14.1 decision.
- The unhealable-orphan limitation is recorded, with the binding constraint on the migration/linking
  phase, and **no fix is implemented**.
- The roadmap and design document §21 agree on what 32D and 32E actually are, and Google Sign-In is
  recorded as a later, unnumbered phase.
- **No source code, test, dependency, `.env` file, commit or push is changed.**

---

# 27I. Phase 32F — Firebase Multi-Provider Authentication Architecture (decision record & documentation close-out)

## Design authority

`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` remains authoritative. **§14A is the
decision register this phase created and is authoritative for the current state of the multi-provider
architecture** — what is resolved, what is open, and what is implemented. This section records only
what the phase shipped.

## Objective

Convert the multi-provider architecture from **open questions** into **recorded owner decisions**, so
that Google Sign-In, Facebook Login, identity linking and legacy migration can each be implemented
later without inventing policy in code — and reconcile the documentation drift found during the
architecture investigation.

## Coding

NO implementation. This phase is documentation only.

## What landed

- **Eleven decisions recorded as RESOLVED** in design document §14A.3, each with its consequence:
  - **R-1** Password authority for Firebase-linked accounts — Firebase is the authority, the retained
    bcrypt hash is not a second door. The Phase 32E `FIREBASE_SIGN_IN_REQUIRED` guard is **retained
    unchanged**.
  - **R-2** A provider identity is **never** trusted from the request body; the provider UID comes
    only from the verified credential.
  - **R-3** A Firebase ID token is exchanged and does not become the application's bearer credential.
  - **R-4** **Email is not an identity-linking join key.**
  - **R-5** Lazy migration on successful legacy password login remains accepted.
  - **R-6** Email / UID collision handling follows the existing documented behaviour (§7.4) — email →
    `409 EMAIL_IN_USE`, UID → hard error, never auto-resolved.
  - **R-7** Sessions remain **provider-neutral**; no provider field on the session model.
  - **R-8** Account linking requires **explicit ownership proof**.
  - **R-9** Provider linking must **not** silently happen on email equality.
  - **R-10** Facebook missing-email cases require **explicit handling** — never invent an address,
    never derive one from the UID.
  - **R-11** **Subscription ownership is business-level**, never Firebase-user-level.
- **The linking policy written out in full** (§14A.4): the prohibited automatic path, the approved
  explicit-link flow for an already-authenticated user, and the requirement that linking *during a
  sign-in attempt* needs an ownership/recovery proof flow.
- **The open register kept separate** (§14A.5, O-1…O-11): unlink and last-method protection, the
  linked-account `change-password`/reset disposition, `emailVerified` enforcement, M1 vs M2, the
  Facebook missing-email flow, the unhealable-orphan remedy, credential-file storage, whether Firebase
  takes over password reset, `passwordChangedAt` semantics for Firebase-native accounts, invitation
  implementation, and the Expo Go policy. **None of these is settled, and none was settled in code.**
- **Documentation reconciliation** across four documents, all of it additive or corrective to the
  *current* state and none of it rewriting a historical phase record:
  - `docs/SYSTEM_SPECIFICATION.md` — **§9** gained `planCode` in the Business model and a
    *Subscription Ownership Is Business-Level* subsection; **§10** gained `firebaseUid`, `emailVerified`
    and optional `passwordHash` in the conceptual User model plus an *Identity Linkage vs.
    Authorization* subsection; **§29** gained the Firebase identity-provider boundary, the exchange
    contract, password authority, the provider linking policy, the Facebook missing-email rule, the
    unlink/revocation limits, provider-neutral sessions, and an explicit **Open Items** table; **§30**
    gained the *User Creation Hierarchy* and *Invitation-Based Onboarding* subsections; **§35** gained
    the `FIREBASE_*` **names** (never values); and the future-authentication list and **§48 V2** were
    corrected to mark Google and Facebook as **planned but unimplemented**, Apple and MFA as future
    scope, and Firebase itself as **shipped**.
  - `README.md` — the **missing Phase 32A–32E entries were added to the Phase Status list** (it had
    stopped at Phase 30A), and the Environment Configuration section gained the Firebase variable
    **names** and the server-side-only rule.
  - `CLAUDE.md` — §2 now records Firebase as the identity provider alongside the application-session
    JWT, and §7 carries the Phase 32F entry.
  - The **design document itself** — §14 gained a status header and per-item annotations (14.3 partly
    resolved, 14.4 resolved, 14.9 confirmed, 14.10 resolved by the mobile TypeScript migration), §14A
    was added, §20 gained the multi-provider invariants, §21 gained the shipped 32F row and a second
    reconciliation note, and the header gained a current-status block.

## The 32F number was reassigned, and that is recorded rather than smoothed over

Design document §21's plan had **32F as "MongoDB sync"**. The owner reassigned the number to this
decision record. Rather than renumber the unbuilt rows — which would silently restate a plan as a
schedule — the planned rows are now marked *(planned)* and a second reconciliation note in §21 records
the change. **No phase beyond 32F is authorised** by this work.

## Scope

**No** Google Sign-In, Facebook Login, Apple Sign-In, account linking, account unlinking, invitation
functionality, provider SDK, OAuth client, schema change, route change, migration or backfill. **No**
change to authentication behaviour, and in particular **no change to the Firebase exchange, to the
Phase 32E `firebaseUid` guard, to `authenticate.ts`, to the session model, or to any RBAC artefact**.
**No** payment or billing code touched. **No** EAS build, submit or prebuild created.

## Implementation status (stated so it cannot be assumed)

- **Google Sign-In: NOT started. Facebook Login: NOT started. Apple Sign-In: future scope.**
- **Account linking: NOT implemented. Account unlinking: NOT implemented. Invitations: NOT
  implemented.** The `users.manage` create route still exists unchanged and still accepts a password.
- **No provider SDK is installed.** No OAuth client was created.
- **No EAS build has been created.** The first EAS development build remains a **prerequisite** for
  validating the selected mobile provider integration path, and until it exists **no provider
  integration has been tested — and none is claimed to have been.**
- Both **UNVERIFIED gates** are unchanged: Firebase `auth:import` bcrypt support (bulk migration) and
  the React Native Firebase + Expo SDK 57 config-plugin configuration (M1 viability).

## Verified

Documentation-only phase. No application source file, test, dependency, package manifest, `.env` file,
schema or route was changed; the changed-file set is documentation only, and the verification is the
`git status` / `git diff --stat` review recorded with the phase. **No test suite was re-run for a
documentation change**, and the existing suites are unaffected by it.

## Definition of Done

- Design document §14A exists and separates **resolved** decisions from **open** ones, with the eleven
  approved decisions recorded and no implementation-specific detail marked resolved.
- **Email auto-linking is explicitly prohibited** in both the design document (§14A.4) and the
  specification (§29).
- **The Firebase exchange remains documented as UID-authoritative**, and the Phase 32E password
  authority remains documented as in force.
- **Owner/ADMIN/MANAGER/STAFF creation hierarchy** and **invitation onboarding as future work** are
  documented in the specification.
- **Business-level subscription ownership** is documented in the specification.
- **Google and Facebook are documented as planned providers; Apple remains future scope.**
- **No provider implementation was performed**, and **no EAS build was created**.
- **No source code, test, dependency, `.env` file or schema is changed**, and no commit beyond this
  phase's own documentation commit is made.

---

# 27J. Phase 32G — First EAS Development Build / Native Runtime Validation

## Objective

Produce an EAS **development build** of the mobile app, install it on an Android device or emulator,
and establish whether the project can run **outside Expo Go**. Phase 32G is a validation phase: it
does **not** implement Google Sign-In, Facebook Login, Apple Sign-In, account linking or account
unlinking; it does **not** modify MongoDB schemas, authentication server behaviour, payment or billing
behaviour; it does **not** select M1 over M2; and it does **not** install a provider SDK. It does not
proceed to Phase 32H, 32I or 32J.

## Coding

**NO production or configuration change.** No application source file, test, dependency, package
manifest, schema, route, limiter or `.env` file was modified — and **`mobile/eas.json` was not
changed**. §3's instruction to verify the EAS configuration rather than assume Phase 30A had got it
right resolved to the finding that **Phase 30A's foundation was already correct**; the build recorded
below is the empirical proof of that, so §4's "minimum changes necessary" resolved to an empty set.
The changed-file set is documentation only, which is why the phase's single commit carries a `build:`
subject over a documentation diff.

## Correction to the recorded build history

Phase 32G's framing as "the first EAS development build" is **not accurate**, and the discrepancy is
recorded rather than smoothed over. Several documents state that no EAS build had ever been executed —
`CLAUDE.md`'s Phase 30A entry ("NO EAS build, submit or prebuild has been executed"), the Phase 30A
narrative beneath it, and Phase 32F's "no EAS build was created" in both `CLAUDE.md` and `README.md`.
**EAS's own build list contradicts all of them.** The project `@jeffernqwes-team/inventory-ai` holds
**three** builds, every one of them Android and every one `finished`:

| Build ID | Profile | Commit | Started |
| --- | --- | --- | --- |
| `94ecae78-35b6-46d8-b2e1-035cf36740a0` | **development** | `0a5d973` — "feat: establish EAS development build foundation" (Phase 30A) | 2026-09-17 13:15 |
| `b1447408-106f-4bd4-a5ac-ef17434fe1c4` | preview | `4998827` — "chore: secure local smoke and EAS artifacts" | 2026-09-17 18:19 |
| `60b0a916-1325-478f-b4fb-86fe3e7c3f07` | development | `5d7d1df` (Phase 32F) | 2026-09-21 00:33 |

The first is a **development** build taken from the Phase 30A commit itself — precisely the claim
Phase 30A's record denies. The second is consistent with Phase 31C's preview-profile work against the
Render API. On-device evidence agrees: `com.inventoryai.app` on the `InventoryAI` AVD reports
`firstInstallTime=2026-09-17 10:40:43` with `lastUpdateTime=2026-09-20 16:48:09`, so an APK of this
app was already on this emulator two days before this phase ran. (The emulator clock runs UTC, so
`10:40:43` is `18:40:43` local — about a minute after preview build `b1447408` finished at 18:39:29,
which identifies the first install on this AVD as the **preview** build.)

**Phase 32G is therefore the third EAS build and the second development-profile build, not the
first.** The commit subject is the owner's prescribed string and is used verbatim; this section
carries the accurate history. The historical statements were **not rewritten**, in keeping with the
convention Phase 29 established and Phase 32F followed — but they should be read as superseded by the
table above.

## Build record

- **Profile:** `development` — `developmentClient: true`, `distribution: internal`,
  `android.buildType: apk`, as Phase 30A defined it. **Not modified by this phase.**
- **Platform:** Android. **Result:** `finished`, 2026-09-21 00:33:06 → 00:45:17 (12 min 11 s).
- **Artifact:** `https://expo.dev/artifacts/eas/4BpCsxZ-l5ikL4p3h-03UlhkZh_bxxR-q9LUELWgHXw.apk`
  (257,427,086 bytes, sha256 `2e9686ac9b727cd8be9a65a13d5f3b1d00d41605cae22c279bf078353387c2d8`).
- **Fingerprint:** `eafbd98898e2064076677151c721472d1382486b` — **identical to preview build
  `b1447408`'s**, which is consistent with Phase 32B–32E having added no native surface at all: the
  Firebase SDK is JavaScript-only, so nothing between the 2026-09-17 preview build and this one changed
  the native project. (Build `94ecae78`'s fingerprint, `c18f0d77…`, differs.)
- **Version:** SDK 57.0.0, versionName 1.0.0, versionCode 1 — the version code is minted server-side by
  `cli.appVersionSource: "remote"`, so `app.json` was never dirtied by a version bump.
- **Native surface:** minSdk 24, targetSdk 36, identifier `com.inventoryai.app`.
- **Signing:** the EAS-managed Android keystore was **reused**, not created —
  `Using Keystore from configuration: Build Credentials 84JNqqnITp (default)`. No credential was
  generated, exported or committed.
- **Source:** the working tree at HEAD `5d7d1df`, which carried the pre-existing uncommitted
  `mobile/eas.json` preview-URL edit. That edit sets `env` on the **`preview`** profile only and
  cannot affect a `development` build.

## Runtime smoke test

Installed with `adb install` (`Success`, versionCode 1). Metro served `expo-router/entry.js` —
**1,525 modules bundled in 11,051 ms** — into the installed native APK, and
`topResumedActivity=com.inventoryai.app/.MainActivity`. This is the phase's central result: **the app
runs outside Expo Go.** A development build is an installed native APK that loads its JavaScript from
a Metro bundler, so a bundle serving into it and a resumed activity is exactly the evidence that the
Expo Go shell is no longer involved.

- **App launches, signed-out root renders** — the login screen displays fully.
- **Auth UI loads** — Email, Password, Sign In, "Forgot password?" and "Create an account" all render.
- **Firebase initialization does not crash** — and, more precisely, the SDK is **never initialized**:
  all four `EXPO_PUBLIC_FIREBASE_*` values are unset in this build, so `isFirebaseConfigured()` is
  `false` and `lib/firebase.ts` returns `null` without ever calling `initializeApp`. The only
  `firebase` string in logcat is `BoundBrokerSvc: onUnbind … com.google.firebase.dynamiclinks.service.START`
  (pid 1696), which is a **Google Play Services** platform component and has nothing to do with the
  Firebase JS SDK. This is the Phase 32D boundary behaving exactly as designed.
- **Server configuration causes no startup failure.**
- **API communication is functional, proven end-to-end rather than inferred.** Deliberately-invalid
  credentials were submitted (`nobody@example.com` and a wrong password) and the screen displayed
  **"Invalid email or password"**. That string is `INVALID_CREDENTIALS_MESSAGE` at
  `server/src/services/auth.service.ts:81` and appears nowhere in the app outside a **test mock**
  (`mobile/__tests__/login-registration-required.test.tsx:121`), so it can only have come from the
  server. The backend's own structured log confirms the round trip:
  - `POST /api/auth/login → 401`, 395.9 ms, `2026-09-20T16:51:46.640Z`
  - `GET /api/auth/me → 401`, 163 ms, `2026-09-20T16:48:43.139Z` (the session probe on launch)

  This also settles the one platform question the build could plausibly have failed on. The app
  requests `http://10.0.2.2:4000` — plain cleartext HTTP against `targetSdk 36`, where cleartext is
  denied by default — and Android did **not** block it: the development build's debuggable manifest
  permits cleartext, and logcat contains no `CLEARTEXT` rejection.
- **No fatal errors.** Logcat contains no `FATAL`, `AndroidRuntime`, `E ReactNativeJS` or React Native
  exception entries.

## Not verified

- **No physical device.** Every piece of runtime evidence above comes from the `InventoryAI` Android
  **emulator** (AVD). No phone or tablet was connected, and no physical-device test is claimed.
- **iOS was not built and was not run.** No iOS EAS build exists for this project, and this host is
  Windows, so no simulator run was possible either. The `ios-simulator` profile remains unexercised.
- The `preview` and `production` profiles were not exercised by this phase.
- **Nothing beyond the signed-out root was navigated.** No authenticated screen was reached, because
  reaching one requires valid credentials and this phase deliberately submitted none.

## M1 vs M2 findings (§8) — documented, NOT chosen

**M1 — native provider libraries.** The pipeline M1 depends on is now proven end to end: a
config-plugin-driven, CNG-based development build compiles, installs and runs on Android, and the
`development` profile is a working vehicle for a build that carries native modules. Config-plugin
auto-discovery is confirmed on this project — plugins for *installed* modules run even when absent from
`app.json`'s `plugins` array (verified with `expo config --type introspect` → `pluginHistory`) — so an
added native provider module's plugin would run without hand-registration, though registering it
explicitly remains the clearer choice. The cost M1 carries is unchanged and still **OPEN**: it needs
`google-services.json` (Android) and `GoogleService-Info.plist` (iOS), whose storage the design
document leaves undecided, and it would change the native surface — and therefore the fingerprint.
**No provider SDK was installed, so M1's runtime behaviour is unproven here.**

**M2 — browser-based flows (`expo-auth-session` / `expo-web-browser`).** The custom scheme M2 depends
on is configured (`scheme: "inventoryai"` in `app.json`) and Phase 27 already exercised a
custom-scheme deep link through the same `fromDeepLink()` path — but only **configuration-verified**,
since a real custom-scheme launch needs a development build and Phase 27 had none. **This phase
produced such a build but did not test a custom-scheme or web-browser redirect**, because doing so
would mean exercising a provider flow; `expo-auth-session` and `expo-web-browser` are not installed and
were not. So **M2's redirect capability remains unproven**, and the specific question M2 must answer is
recorded here rather than left implicit: a development build installs the dev launcher's own activity
and URL scheme alongside the app's, so a provider redirect handing control back must be verified
rather than assumed.

> **Cross-reference added 2026-09-25 (Phase F1).** M2 is **CLOSED as superseded**: the shipped
> architecture is M1 (native SDKs), and Phase F1 removed `expo-auth-session`, the browser
> authorization-code + PKCE helper, `googleRedirectUri()` and the `firebase` JS SDK dependency. The
> redirect question recorded above therefore has no phase left to answer it — the flow it describes no
> longer exists. This section is the Phase 32G record and is not rewritten. See §27N.

## Blockers and limitations

- **No blocker was hit.** The pipeline worked exactly as committed, and no unrelated configuration was
  modified to hide anything.
- **The `development` profile cannot reach the API on a physical device as configured.** It
  deliberately sets no `env`, so `EXPO_PUBLIC_API_URL` is unset and `mobile/lib/config.ts` falls back
  to `http://10.0.2.2:4000` — the emulator's host-loopback alias. That is correct by design for a
  Metro-served dev client, but it means **physical-device API validation requires
  `EXPO_PUBLIC_API_URL` to be set to the host's LAN address**. No change was made: adding one would
  have had to be emulator-wrong, breaking the path this phase verified.
- The emulator image has no shell HTTP client (toybox provides no `curl`/`wget`), so reachability
  could not be probed from the shell. It was proven through the app's own request instead.
- `mobile/eas.json`'s `preview` profile points at the Render origin and `production` at the placeholder
  `https://REPLACE-WITH-PRODUCTION-ORIGIN` — both pre-existing and untouched.

## Verification

- `git status --porcelain` reports exactly the five entries it reported before the phase began — three
  modified (`mobile/eas.json`, `server/src/services/ai/providers/http.ts`,
  `server/test/phase06-ai-wire.test.mjs`) and two untracked plan documents — **none of them created,
  modified or reverted by this phase**, as §1 required. This phase's own diff is documentation only.
- **No secret or credential is committed.** The Android keystore is held by EAS and was reused, never
  exported; no `google-services.json`, `GoogleService-Info.plist`, `.env` file or Firebase provider
  credential exists in the tree.
- **No Google or Facebook provider SDK implementation exists** — none was installed.
- **No server authentication behaviour changed**: `git diff` over `server/` reports only the
  pre-existing unrelated `http.ts` and `phase06-ai-wire.test.mjs` edits.
- **No test suite was re-run for this phase**, because the change set is documentation only and no
  production file was touched; the existing suites are unaffected by it.

## Definition of Done

- An EAS **development** build exists, **finished**, recorded with build ID, profile, platform,
  artifact URL, fingerprint and version.
- The build was installed on an Android emulator and **launched**: the app runs **outside Expo Go**,
  proven by a Metro-served dev-client bundle loading into an installed native APK.
- The signed-out root renders, the auth UI loads, Firebase initialization does not crash, and API
  communication is proven end to end against the local backend.
- **No physical-device test is claimed**, because none occurred; **no iOS run is claimed**, because
  none was possible on this host.
- **M1 vs M2 is NOT chosen**, and neither is implemented.
- **Google Sign-In, Facebook Login, Apple Sign-In, account linking and account unlinking were NOT
  implemented**, and no provider SDK was installed.
- **The build history is corrected**: EAS holds three builds, two of them predating this phase,
  superseding the "no EAS build has ever been executed" statements in the Phase 30A and Phase 32F
  records.
- **Phase 32H, 32I and 32J were NOT started.**

---

# 27K. Phase 32H — Server-Side Account Linking Boundary & Authentication Ownership

## Objective

Establish the **server-side** foundation on which Firebase Email/Password and the future Google,
Facebook and Apple providers all converge into **one** Inventory AI account and session model. The
server stays authoritative for Inventory AI user identity, `businessId`, role, account status,
business status, permissions, subscription/billing access, sessions, account-linking authorization and
audit events. Firebase authenticates the person; Inventory AI authorizes the person; the business owns
the subscription.

Phase 32H is the **server half of linking and nothing else**. It does **not** implement Google
Sign-In, Facebook Login, Apple Sign-In, any provider SDK, any OAuth redirect flow, any Expo provider
configuration, any provider button, any account-invitation UI or functionality, any payment or
subscription change, any bulk Firebase migration or `auth:import`, and **no unlinking of any kind**.
It does not weaken or remove the Phase 32E password-authority guard, and it does not change the
existing Firebase exchange contract.

## What was implemented

**One authenticated route, one service, one validator, two audit actions.**

```text
POST /api/auth/firebase/link        AUTHENTICATED (requireAuth + controller, no permission)
body:  { idToken }                  -> 200 { linked: boolean, user }
```

- **`server/src/services/firebaseLink.service.ts`** (new) — `linkFirebaseIdentity({ userId,
  businessId, idToken })`, the whole linking decision.
- **`server/src/controllers/firebaseAuth.controller.ts`** — the `firebaseLink` handler and
  `mapFirebaseLinkFailure`, alongside the two existing public handlers so there is exactly one
  translation of a Firebase domain error.
- **`server/src/routes/auth.routes.ts`** — the route, in the protected block.
- **`server/src/utils/validate.ts`** — `validateFirebaseLink`, returning only `{ problems, idToken }`.
- **`server/src/constants/audit.ts`** — `FIREBASE_IDENTITY_LINKED` and
  `FIREBASE_IDENTITY_LINK_CONFLICT`.
- **`server/src/services/firebaseAuth.service.ts`** — `duplicateKeyField` exported (one word; its two
  existing call sites are unchanged) so the link service can read the E11000 field name the same way
  the exchange does rather than duplicating the parse.

**No schema change.** `firebaseUid` keeps `unique: true, sparse: true`, `emailVerified` is unchanged,
and no model field was added, renamed or relaxed.

**No new dependency.** No package manifest changed on either side.

**No session-model change.** No provider field, no `providerUid`, no role, no `businessId` was added to
the session; the JWT stays `sub` + `jti` + `iat`/`exp` and provider-neutral.

## The security invariants, and how each is structural rather than asserted

| Invariant | How it holds |
| --- | --- |
| Authenticating an identity ≠ proving ownership of an existing account | The route is `requireAuth`; the session **is** the ownership proof, and it is the only one accepted. |
| Email is not an account-linking join key | The verified email is read for *nothing*: not compared, not used to find an account, not used to resolve a conflict. Removing the comparison is impossible because there is no comparison. |
| No client-supplied identity, tenant or role | `validateFirebaseLink` returns only `{ problems, idToken }`, so the handler holds no such variable; the account is `req.user.id` and the identity is the verified token's uid. |
| A link never moves a tenant or a role | The only fields ever written are `firebaseUid` and `emailVerified`; `businessId`, `role` and `status` are read for the audit row and never assigned. |
| One Firebase account → one `firebaseUid` → one MongoDB user | The `firebaseUid` unique index, unchanged; no provider-specific column exists for a second identity to live in. |
| A conflict leaks nothing | CASE B and CASE D share one `409`, one code and one generic message; the conflicting uid never enters audit metadata (an ADMIN-readable trail, and in CASE B the uid may name a person in another tenant) and goes only to the server log. |
| A race cannot double-link | One conditional update guarded on `firebaseUid: null`, plus the unique index's E11000 mapped to the same conflict. |

## The four lifecycle cases

Handled in `firebaseLink.service.ts`, in an order that is load-bearing — CASE A and CASE D are decided
from the **account's own** `firebaseUid` before the identity is looked up, so an account that already
owns an identity never has its own mapping queried, compared or replaced.

| Case | Condition | Outcome |
| --- | --- | --- |
| **A** | same identity, same account | idempotent success, `linked: false`, no write, **no audit row** |
| **D** | this account already owns a *different* identity | `409` — never silently replaced |
| **B** | the identity belongs to *another* MongoDB user | `409` — never merged, never transferred, audited |
| **C** | the identity belongs to nobody | attached |

## The 400-not-401 decision

The link route answers a rejected Firebase ID token with **`400`**, not `401`. This is not cosmetic and
it is not a relaxation. `mobile/lib/client.ts` treats a `401` **or `403`** response to a request that
carried a token as session loss and clears the session; the link route is authenticated, so a `401`
there would mean "the Firebase credential was bad" and would be acted on as "your Inventory AI session
is gone" — signing a user out over an unrelated failure. The error `code` is unchanged
(`FIREBASE_TOKEN_INVALID`), and the adjustment is keyed on the **code**, so this module's own genuine
`401 AUTH_REQUIRED` still travels as a `401`.

## §15 — the password reset / `change-password` finding

**Inspected, documented, and deliberately not changed.** For an account carrying a `firebaseUid`, the
Phase 32E guard means the retained bcrypt hash no longer authenticates anyone, so
`POST /api/auth/change-password` and the 26B/27 reset flow both write an **inert** hash, revoke every
session as a side effect, and report success.

**The linking boundary does interact with this defect, and only by making the population reachable.**
Before this phase no code path wrote `firebaseUid` onto an existing password account, so the state was
theoretical; it now exists. **No behaviour was changed**, because the brief forbids inventing a new
password-reset policy and the disposition is already recorded as open (design document O-2,
`SYSTEM_SPECIFICATION.md` §29's open-items table). Changing these endpoints without deciding the policy
would settle by accident what must be settled on purpose. **O-2 is escalated by this phase from "a gate
on a future phase" to "a live defect", and the final decision remains a separate explicit hardening
item.** The success audit row records `{ passwordCredentialRetained: boolean }` — informational only,
zero authentication behaviour change — so an operator investigating has a start point.

> **Superseded by Phase 32K (§27M).** O-2 was decided and implemented there: Firebase is the sole
authentication authority for any account carrying a `firebaseUid`, and local password login,
`change-password` and the recovery flow now refuse such an account. The Phase 32K audit also **corrected
the finding above**: an ordinary `change-password` attempt by a Firebase-**native** account does *not*
report success — it fails `400 INVALID_CURRENT_PASSWORD`, because a hashless account has no current
password to verify. It was `reset-password` that reported success while writing an unusable credential,
and `change-password` behaved as described only for a Firebase-**linked** account that still carried a
hash. Those statements should be read as superseded, not as still true; the original text is not
rewritten.

## §16 — the unlink finding

**Nothing implemented, nothing changed.** Unlinking remains a client-side Firebase-only operation the
server cannot observe, and Firebase's "last provider" protection remains unaware of a retained
`passwordHash`. **O-1 is unchanged and still open**, and Phase 32L remains the phase that owns it.
Phase 32H added no unlink route, no unlink service and no unlink audit action.

> **Superseded 2026-09-26 (Phase 32L — see §27Q).** The unlink capability this subsection records as
> absent **shipped** in `01ae73f` (32L-A, server) and `0c3f87d` (32L-B, mobile), both contained in
> `main` (`dbdf673`): one authenticated route `POST /api/auth/firebase/unlink`, its service, its audit
> actions. The last-authentication-method invariant is enforced **server-side** by **Policy B** — an
> account may leave Firebase authority only by establishing a new local password in the same transition
> — because the Phase 32L runtime experiment **refuted** the "Firebase refuses to remove the last
> provider" belief this paragraph rests on. This paragraph is the Phase 32H record and is not rewritten.

## Google / Facebook / Apple status

**Not implemented, and not partially implemented.** No provider SDK was installed on either platform,
no provider package was added to either manifest, and no provider route, redirect, screen or button
exists. What exists is the **boundary those providers will converge on**: a verified Firebase identity
attaching to an already-authenticated account, with the provider-neutrality that makes "one Firebase
account, several providers, one `firebaseUid`, one MongoDB user" a property of the schema rather than a
rule someone must remember.

**On the two halves of "linking", kept apart on purpose.** Firebase's own credential/provider linking
(`linkWithCredential`, "Connect Google") is performed by the **Firebase client SDK** against the
signed-in Firebase user; the uid does not change, Inventory AI never sees it, and the server has no API
for it. **No fake server-side provider-linking operation was invented** — the server owns the half the
client must never be trusted with, which is the decision that a MongoDB user may carry a given
`firebaseUid`.

## Testing

`server/test/phase32h-firebase-linking.test.mjs` — one unit suite (no database) and one DB-backed suite
over the real `app.ts`. **25 tests, 25 pass, 0 fail.** Registered in `MIXED` in
`scripts/run-tests.mjs`, so both `npm run test:unit` and `npm run test:db` include it.

The brief's twelve required server-side invariants are covered, including the ones that are easy to
assert vacuously: the payload returns only `{problems, idToken}`; a planted identity/tenant/role is
inert; the token email is never compared to the account email; CASE B and CASE D are indistinguishable
to the caller; a rejected Firebase token is a `400` and the caller's session survives it; an
unconfigured server answers `503` with the session intact; the Phase 32E guard is intact and is made
**live** by linking; and two accounts racing for one identity produce exactly one winner and one
conflict.

`server/test/phase23-authorization-contract.test.mjs` declares the new route in its `AUTHENTICATED`
bucket with a written reason. That guard asserts bucket **membership**, never a count, so it fails on
the declaration alone — which is the intended design and was confirmed by deliberately misnaming the
declaration: the route was reported undeclared *and* the stale declaration was reported as no longer
true.

**Every assertion was proven able to fail before being trusted.** A mutation pass over the service, the
controller and the validator applied seven mutations to pristine copies — removing the CASE D guard
*and* the conditional update's `firebaseUid: null` filter together, removing the CASE B pre-check *and*
the E11000 mapping together, flipping the link route's `400` to `401`, making the verified email a join
key, adding the uid to the success audit row, making CASE A non-idempotent, and making the validator
return a client-supplied `businessId`. **All seven produced a red test.**

Two of them are worth keeping as findings. **CASE D and CASE B are each doubly enforced** — CASE D by
its guard and by the conditional update's filter, CASE B by its pre-check and by the unique index's
E11000 — so removing either layer **alone** leaves the property intact and the suite green. That is
defence in depth rather than redundancy to be tidied away, and it is why those two mutations remove
both layers at once.

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — clean, 0 errors / 0 warnings.
- `phase32h-firebase-linking.test.mjs` — **25 pass, 0 fail**.
- `phase23-authorization-contract.test.mjs` + `phase22-authorization-contract.test.mjs` +
  `phase-ts-3-migration-guards.test.mjs` — **60 pass, 0 fail**.
- **No schema change**, so no migration and no index rebuild.
- **No secret is committed.** No `.env`, no service-account JSON, no `google-services.json` or
  `GoogleService-Info.plist`, no API key.
- **No payment or subscription code was touched** — no file under a billing, plan or entitlement path
  changed, and subscription ownership remains the Business/tenant.
- **The five pre-existing working-tree entries are untouched** (§1): `mobile/eas.json`,
  `server/src/services/ai/providers/http.ts`, `server/test/phase06-ai-wire.test.mjs`, and the two
  untracked `docs/superpowers/plans/2026-09-11-phase-18{c,e}-*.md` plan documents. None was reset,
  restored, stashed, deleted or overwritten.

## Definition of Done

- An authenticated server-side linking boundary exists, and it is the **only** way a `firebaseUid` is
  attached to an existing account.
- The account comes from the session and the identity from a verified token; no client-supplied
  identity, tenant or role can steer it.
- A link cannot move an account between businesses or change its role.
- The four lifecycle cases are handled, with CASE B and CASE D refused, never merged or re-pointed.
- Conflicts leak nothing to the caller and nothing cross-tenant to the audit trail.
- The Phase 32E guard is intact and unweakened.
- **Google Sign-In, Facebook Login, Apple Sign-In, account linking via a provider, account unlinking
  and invitations are NOT implemented**, and no provider SDK was installed.
- **Phase 32I, 32J and 32L were NOT started.** *(Superseded 2026-09-26: **32J** shipped — §27L — and
  **32L** shipped — §27Q. The Phase 32H record is not rewritten.)*

---

# 27L. Phase 32J — Mobile Firebase Registration Onboarding (Google → register → exchange → session)

## Objective

Make an already-authenticated Firebase/Google identity that the exchange refuses with `403
REGISTRATION_REQUIRED` able to finish Inventory AI registration through the endpoint that already
exists, and then enter the ordinary session flow.

## What was implemented

Two new mobile files and three touched ones. **No server file changed** — `POST
/api/auth/firebase/register` (Phase 32C) and `POST /api/auth/firebase/exchange` (Phase 32C) are reused
as shipped, and no new endpoint, schema field, session mechanism or dependency was added.

```text
Google OAuth → Firebase JS → POST /api/auth/firebase/exchange → 403 REGISTRATION_REQUIRED
   → /register-firebase (businessName + optional name)
   → POST /api/auth/firebase/register → 201 { user, business }
   → POST /api/auth/firebase/exchange → 200 { token, user }
   → applySession(token, user) → authenticated app
```

- `mobile/lib/firebase-auth.ts` — one additive export, `currentFirebaseIdToken()`. It reads
  `getFirebaseAuth()?.currentUser` and returns `user.getIdToken()`, and is **total by design**: `null`
  for "no current user" and `null` for "the refresh failed", because both have the single consequence
  that this device cannot produce a registration credential right now. It never fabricates,
  reconstructs or caches one.
- `mobile/lib/auth.tsx` — `firebaseRegistrationRequired` state, `completeFirebaseRegistration`, and the
  arming that points the user at onboarding.
- `mobile/app/register-firebase.tsx` — the onboarding screen (new route).
- `mobile/app/login.tsx` — the `REGISTRATION_REQUIRED` banner action now targets `/register-firebase`
  instead of the email/password `/register`.

## Route decision — a dedicated route, not a mode of `/register`

`/register` collects `businessName`, `name`, `email`, `password` and a confirmation, and its `signUp()`
asks Firebase for a **new** identity (`ensureFirebaseAccount`). For a person who has just proved one
identity with Google, the email it would ask for is one they have already proved, and the password it
would ask for is what mints a **second** Firebase identity — which the server then refuses with
`EMAIL_IN_USE`, and which is not the identity that was authenticated in any case. Neither outcome can
produce a tenant, so a controlled mode would have had to suppress half the form and route around
`signUp` anyway. A dedicated route keeps both paths honest: `/register` is unchanged for email/password
(its flow and tests still pass), and `/register-firebase` collects exactly what is missing — `businessName`
(required) and `name` (optional). It renders **no** email, password or confirmation input, and its
`Link` target is asserted directly so a banner action that silently still pointed at `/register` would
fail the suite.

## The identity never travels through navigation

`completeFirebaseRegistration({ businessName, name })` is the whole client-side input surface. There is
no `idToken`, `firebaseUid`, `email`, `userId`, `businessId`, `role` or `status` parameter, so no route
parameter, no AsyncStorage entry and no screen state can carry a credential; the token is obtained
inside the context from the Firebase Auth layer and used immediately. That is the same shape Phase 32H
and Phase 32C established: the client never declares its own identity, and the server derives
`firebaseUid`, `email` and `emailVerified` from the verified token.

## Arming, and what clears it

`firebaseRegistrationRequired` is armed by one helper, `isRegistrationRequired(err)` — `err instanceof
ApiError && err.code === 'REGISTRATION_REQUIRED'` — reached from both entry points (`signIn` and
`googleSignIn`), so Google and email/password failures converge on the same onboarding. It is cleared by
`applySession` whenever a real token is applied, so a later successful sign-in does not leave onboarding
armed. It is deliberately **not persisted**: with `inMemoryPersistence` (Phase 32D) the Firebase identity
itself does not survive a process restart either, so persisting the flag alone would only let the user
type a business name against an identity that is gone. Reaching the route without the flag therefore
renders a "Start again" state that makes **no request** — failing safe rather than fabricating a
credential.

## A half-done attempt must not be repeated

Registration and sign-in are two calls, and the first can succeed while the second fails (network,
server). Re-running both would create a second Business and a second OWNER for the same person, so the
context holds `firebaseAccountRegisteredRef`: set **only** when `api.firebaseRegister` actually
resolves, left `false` by a refusal (the input is correctable) and left `false` by a network fault (the
attempt is genuinely repeatable). A retry after a successful register therefore resumes at the exchange.
`armRegistrationRequired()` resets the ref, because reaching `REGISTRATION_REQUIRED` again cannot belong
to the same half — a half-created attempt left an account linked to that identity, so the exchange for it
can no longer answer `REGISTRATION_REQUIRED` — which is what keeps a stale flag from stranding a
**different** identity. No backend idempotency mechanism was invented.

## Conflict behaviour

- **`409 EMAIL_IN_USE`** — reported with a fixed client sentence and a "Sign in to your existing
  account" action. Nothing is linked: attaching the uid from here is exactly the automatic-match linking
  Phase 32H refuses, and the explicit route for it is `POST /api/auth/firebase/link` over an existing
  session.
- **Firebase UID collision** — the backend reports it as a plain 500, so the screen shows one fixed
  sentence and never the thrown error's text. This is asserted by a test that scans every rendered string
  for the thrown message, not just the banner.
- **No Firebase user left** — a safe sentence and no request at all.
- **A field error naming an input this screen does not render** (for example `idToken` when a verified
  identity carries no email) is promoted to form level rather than dropped, the rule Phase 27 set.

## Testing

Two new suites, **24 tests**, plus the two touched suites:

- `mobile/__tests__/firebase-registration-onboarding.test.tsx` (12) — the service, over the real
  `AuthProvider` with only the Firebase, API and SecureStore module boundaries mocked. Pins the register
  payload as `{ idToken, businessName, name }` and nothing else, the exchange-after-register order, the
  retry-as-exchange-only rule, and that a refusal opens no session and attaches nothing.
- `mobile/__tests__/register-firebase-screen.test.tsx` (12) — the screen and its login entry point, with
  real `AuthLayout`/`Banner`/`Input`/`Button`: the form asks for a business name only (no email, no
  password, no confirmation), the conflict copy offers sign-in, no raw error text can reach the screen,
  and the banner action targets `/register-firebase`.
- **Every assertion was proven able to fail before being trusted.** Five mutations were applied to
  pristine copies and each produced a red test: removing `firebaseRegister` (7 failures), removing
  `firebaseExchange` (5), removing `applySession` (5), making the screen demand a password (6), and
  swallowing `EMAIL_IN_USE` to auto-link (1). All five were reverted and both files verified
  **byte-identical** to their pre-mutation SHA-256.

## Runtime verification

A **real-device run**, not an inference from unit tests. The OPPO F11 Pro (`PV4DDMIZZLTCIVSK`) running the
installed development build, Metro serving the updated JavaScript bundle (1553 modules), the backend on
stdout. The operator drove Google and the form; the experiment observed only non-secret metadata.

| Gate | Result | Evidence |
| --- | --- | --- |
| Google authorization + callback | PASS | OS delivered the callback to `com.inventoryai.app/.MainActivity` |
| `POST /api/auth/firebase/exchange` | 403 `REGISTRATION_REQUIRED` | request log |
| Onboarding reached, business name submitted | PASS | by the operator |
| `POST /api/auth/firebase/register` | **201** | request log, 214.9 ms |
| `POST /api/auth/firebase/exchange` | **200** | request log, 322 ms later |
| Session applied | PASS | `GET /api/dashboard` **200** with a `userId`; `GET /api/purchase-orders` 304 |
| Final screen | authenticated Home (OWNER entries) | UI dump |
| Process continuity | **WARM** — same PID before and after | `pidof` |
| Expo Router `Unmatched Route` | **0 occurrences** | logcat |
| JS errors | 0 | logcat |

## Verification

- `npx jest` — **20 suites, 209 tests, all pass** (was 18 / 185).
- `npx tsc --noEmit` — clean. `npx eslint .` — clean.
- Server tests were not run: **no server file was modified**.
- **No secret was committed and none was logged**: the temp capture that held the one-time authorization
  code was deleted at the end of the run, and the report quotes only method, path and status.
- **The five pre-existing working-tree entries are untouched**, none was reset, restored, stashed,
  deleted or overwritten.

## Known limitations

- **No cold-start recovery.** The Firebase identity lives in memory (Phase 32D), so the flow is
  in-session only and the route fails safe when it is not.
- **iOS is unverified** — the iOS client ID is still empty.
- **O-2 remains open and is now reachable in the ordinary course of business**: the first Google-registered
  OWNER is a Firebase-native account with no usable password, so `change-password` and the reset flow
  would report success while changing nothing. This phase did not touch that decision. *(**Resolved by
  Phase 32K — §27M.** The audit there also corrected this sentence's second clause: `change-password`
  fails for a Firebase-native account rather than reporting success; it was the reset flow that reported
  success. The wording is superseded, not rewritten.)*
- **Registration still writes no audit row and uses no transaction** — inherited from Phase 32C and
  explicitly out of scope here.
- The run left **a real Business + OWNER user** in the MongoDB database the local server connects to, and
  the device remains signed in as that owner.

## Definition of Done

- An already-authenticated Firebase identity can complete registration and reach an Inventory AI session
  through the existing endpoints, with no second sign-in.
- Email/password registration is unchanged, and no Firebase-native path asks for credentials the identity
  already has.
- No credential is passed through navigation, persisted, or reconstructed when absent.
- `EMAIL_IN_USE` never links, and a UID collision never leaks server text.
- A failed exchange after a successful registration cannot create a second business.
- **No server file, schema, dependency, session mechanism or Firebase/Google configuration changed.**

---

# 27M. Phase 32K — Firebase Password Authority Boundary & Timing-Equalizer Credential Fix

## Objective

Make the boundary that Phase 32H escalated to a **live defect** true in code: **for every Inventory AI
user carrying a `firebaseUid`, Firebase is the sole authentication authority**, so Inventory AI local
password operations do not apply to that account. Phase 32J had made Firebase-native OWNER registration
a normal outcome, so the state was no longer theoretical.

The phase also fixes a second, sharper defect the Phase 32K audit found in the same code while auditing
the first.

## 1. ★ The timing equalizer was a credential

`server/src/services/auth.service.ts` held:

```ts
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-placeholder', BCRYPT_ROUNDS);
```

`bcrypt.hashSync` returns a **valid hash of a known string**, and the idiom `user?.passwordHash ||
DUMMY_HASH` made that constant the comparison **target** whenever an account held no `passwordHash`. Two
consequences followed, and both were real:

- `loginWithPassword` — submitting the literal `timing-equalizer-placeholder` **authenticated** a hashless
  account and opened a session for it.
- `changePassword` — submitting the same literal as `currentPassword` **installed a real credential**,
  stamped `passwordChangedAt` and revoked every session. The attacker left with a password, not just a
  session.

It was reachable because `passwordHash` is optional (Phase 32B) and because a Firebase-native account has
none by design. The fix is one function, `verifyPassword(password, storedHash)`, which runs the bcrypt
comparison in every branch — so the timing property is preserved exactly — and then **discards the
result** when there is no stored hash:

```ts
const hash = storedHash || null;
const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
return hash !== null && matches;
```

Putting it in one place is the point: `|| DUMMY_HASH` appeared at **two** call sites with the same defect,
so fixing either one alone would have looked complete. "A placeholder is never a credential" is now a
property of the code rather than a rule two call sites must each remember.

## 2. The password boundary

| Surface | Firebase-owned account (`firebaseUid` present) | Legacy account (no `firebaseUid`) |
| --- | --- | --- |
| `POST /api/auth/login` | unchanged — the Phase 32E guard still answers `403 FIREBASE_SIGN_IN_REQUIRED` (linked) or the generic `401` (native, which has no hash to verify) | unchanged |
| `POST /api/auth/change-password` | **refused** `409 PASSWORD_NOT_APPLICABLE`, before the current-password comparison and before every effect | unchanged |
| `POST /api/auth/forgot-password` | **silent exit** — the same uniform `202`, **no token, no email, no audit row** | unchanged |
| `POST /api/auth/reset-password` | **refused** `400 INVALID_RESET_TOKEN`, token spent fail-closed, **no hash written** | unchanged |

Three placement decisions carry the phase, and each is recorded in the code at its site:

- **The change-password guard sits BEFORE the current-password comparison.** Placed after it, a
  Firebase-native account (no hash) would report `400 INVALID_CURRENT_PASSWORD` while a Firebase-linked
  account (hash retained) would report the boundary refusal — two different answers to one question,
  decided by whether an inert hash happens to remain on the document.
- **The change-password refusal is a `409`, not a `401`/`403`.** `mobile/lib/client.ts` treats a `401` or
  `403` on a request that carried a token as session loss and clears the session, so a `403` here would
  sign a user out of a perfectly valid session. `409` is also what the adjacent account-state refusals
  already use (`EMAIL_IN_USE`, `FIREBASE_IDENTITY_CONFLICT`), and Phase 32H's link route made the same
  move for the same reason.
- **The recovery refusal is a SILENT RETURN, not an error.** Distinguishing a Firebase address from an
  unknown one would turn `forgot-password` into the account-existence oracle the whole Phase 26B design
  refuses to be, and "this account uses a managed sign-in" is itself account state an unauthenticated
  caller may not learn. It takes the same silent exit as a DISABLED account or an inactive tenant and
  sits **after** the tenant check, so a Firebase account performs exactly the database work a legacy one
  does up to the point a token would be created — adding no new timing signal to a path whose residual
  database-work term is already documented as only **partially mitigated**.

The reset-completion guard is deliberately the **last thing before the write**. Tokens issued before this
phase may still be unspent, but the more general reason is that "which accounts may hold a local
password" is a property of *that write*, so the check belongs immediately in front of it rather than in a
different function on a different request.

## 3. The capability the client consumes

Mobile needs to know whether local password management applies, and must not be told why. The public DTO
gains **one** additive field derived in **one** helper:

```ts
authMethods: { password: !user.firebaseUid }
```

`firebaseUid` is never published — it is the identity join key the Firebase design keeps server-side.
`password: false` does **not** mean "no credential exists": a Firebase-**linked** account still retains
its legacy hash (Phase 32H deliberately does not delete it); it means that hash cannot authenticate, so
it is not a password anyone can manage.

The helper is imported by **both** surfaces that publish a user — `toPublicUser` (login, exchange,
register, link, `/api/users`) and `requireAuth`'s `req.user` (which answers `GET /api/auth/me` and does
**not** go through `toPublicUser`) — so the two cannot disagree. `requireAuth` selects `firebaseUid` for
this derivation only, and never puts it on `req.user`.

Mobile: `AuthUser` gains the optional capability, and the Profile screen hides the Change-password
control and explains why when it is `false`. The test is `=== false`, not falsiness, so an older server's
user object keeps the historical behaviour. **The screen is not the boundary** — a request that reaches
`/change-password` anyway is refused by the server, and the screen's existing error path renders that
message.

## 4. What was deliberately NOT done

- **No retained `passwordHash` was deleted.** The unlink / last-authentication-method disposition is
  still open (Phase 32L owns O-1), and deleting a hash now could make a later unlink irreversible. The
  hash is retained and made inert. *(Superseded 2026-09-26: **Phase 32L shipped** and settled the
  disposition as **Policy B** — an unlink requires a new local password in the same transition and the
  retained hash is **REPLACED, never re-enabled**. This is the Phase 32K record and is not rewritten;
  see §27Q.)*
- **No schema change.** `passwordHash` was already optional and `firebaseUid` already present, so the
  existing schema was sufficient. No field, index or migration was added.
- **No unlinking, no provider SDK, no Facebook/Apple, no session-model change, no new dependency.**
- **No second password credential** was created for any Firebase account, and no reset token is issued
  that such an account could never spend.

## Verification

- **Server:** `npm test` — **795 tests, 106 suites, 0 fail**; `npm run test:unit` — 336 tests, 313 pass,
  0 fail (the difference is DB-required suites skipped with a visible reason in unit mode);
  `npm run typecheck` and `npm run lint` clean.
- **Mobile:** `npx jest` — **21 suites / 213 tests** (was 20 / 209); `tsc --noEmit` and `eslint .` clean.
- **New suite:** `server/test/phase32k-firebase-password-boundary.test.mjs` (12 cases, registered
  `PURE_DB`) walks the legacy / Firebase-native / Firebase-linked matrix. It does **not** restate the
  equalizer literal: it reads it **out of `auth.service.ts`**, so the case cannot pass vacuously if the
  string changes, and the assertion that the pattern still matches fails loudly if the equalizer is ever
  removed. Two new mobile cases cover the capability gating, including the backward-compatible
  "capability absent" case.
- **Every new assertion was proven able to fail** before it was trusted, by a seven-mutation pass (all
  reverted; no mutated file left behind):

| Mutation | Cases that went red |
| --- | --- |
| change-password Firebase guard disabled | 6, 10 |
| equalizer accepts again (`return matches`) | 3, 4, 5 |
| `forgot-password` guard removed | 7, 11 |
| `reset-password` guard removed | 8 |
| `authMethods` dropped from `toPublicUser` | 1, 12 |
| `authMethods` dropped from `requireAuth` | 12 |
| mobile Profile gate disabled | mobile case 1 |

- **Two pre-existing suites had to change**, and the change is declared rather than smoothed over. Both
  pin the **exact key set** of a user payload, so an additive field is a deliberate edit:
  `phase26a-session-lifecycle.test.mjs` (the `/api/auth/me` allowlist) and
  `phase32c-firebase-exchange.test.mjs` (the exchange's public-DTO allowlist). Each keeps its exact-shape
  assertion and gained an explicit `firebaseUid`-absent assertion so the property they actually guard is
  stated rather than implied by the list.

## Known limitations

- **No runtime verification of this phase.** The changes are server-side and mobile-JS; no development
  build was produced, no device run was performed and no live Firebase project was exercised. Every
  figure above is a test/lint/typecheck result, not an observation of the behaviour in a running app.
- **A token issued before this phase can still be spent once** on `reset-password` for a Firebase account
  — it is refused, and fail-closed, but it is not "already spent". Only the refusal is new.
- **The retained hash is inert, not gone.** If unlinking is later added without a last-authentication-method
  rule, the retained hash becomes live again for that account the moment `firebaseUid` is cleared.
- **`change-password`'s refusal message is provider-neutral by design**, so a user is not told which
  provider manages their password. That is deliberate, and it does mean the app cannot point them at a
  specific next step while only one provider exists.

## Definition of Done

- No account carrying a `firebaseUid` can obtain, change or reset an Inventory AI local password.
- The timing equalizer performs its timing work and can never be accepted as a credential.
- No Firebase account is sent a reset email, is written a fake credential, or is recorded as having
  changed one.
- Legacy accounts without a `firebaseUid` behave exactly as before, on every password surface.
- The client learns whether local password management applies without learning the identity behind it.
- **No schema, index, migration, dependency, session mechanism or retained hash was changed.**

---

# 27N. Phase F1 — Retire the Firebase JS SDK and the Browser OAuth Path

Phase F is the **cleanup the Firebase migration kept deferring**: after Phases B–E every
authentication ran on the native SDK, but the JavaScript SDK boundary, the browser OAuth helper and
the `firebase` package were all still installed and still imported in places. The owner split it into
two controlled phases (**G-1**):

| | Phase F1 (this section) | Phase F2 (approved separately, NOT started) |
| --- | --- | --- |
| Nature | **Pure JavaScript — no native surface change** | Native-surface reduction |
| Removes | `lib/firebase.ts`, the `firebase` dependency, the `expo-auth-session` import, `acquireGoogleIdToken`, `GOOGLE_DISCOVERY`, `GOOGLE_SCOPES`, `GoogleIdTokenOutcome`, `googleRedirectUri()` | `expo-auth-session`, `expo-web-browser` **and its `app.json` plugin together**, `expo-crypto`, the second `com.inventoryai.app` `expo.scheme` entry, `app/+native-intent.ts` |
| Native build | **Not required** | **Required** — a new EAS development build |
| iOS | `[EXTERNAL VERIFICATION REQUIRED]` | `[EXTERNAL VERIFICATION REQUIRED]` |

## The prerequisite that made the removal safe

`lib/firebase.ts` was the only module importing `firebase/app` and `firebase/auth`. It did not need to
be: **two modules imported `isFirebaseConfigured` from it** — `lib/auth.tsx` and
`lib/firebase-native.ts` — purely because that is where the re-export sat, and because the module
carried top-level static SDK imports, asking that boolean pulled the whole JavaScript SDK into their
bundle graph. The function is defined, SDK-free, in `lib/config.ts`. **F1 redirected both imports
there first, and only then deleted the module and the package.** Removing the module first would have
left the native gate (`isNativeFirebaseConfigured()`, the same predicate) throwing for every Firebase
and Google sign-in — the phase's one real hazard, recorded as **F-2** and closed by ordering.

## What else went, and what deliberately did not

Removed with it: the `expo-auth-session` import in `lib/firebase-auth.ts` and everything only it
served — `acquireGoogleIdToken` (the Phase 32I authorization-code + PKCE helper Phase D left
unreferenced), its Google discovery constants, the `GoogleIdTokenOutcome` type, and `googleRedirectUri()`
(**G-5**: removed with its only caller rather than kept as a dead export). **No behaviour moved with
them** — the outcome unions, error codes, message table, legacy-fallback rules, the 300-second
`auth_time` rule and the unlink policy are unchanged, and `confirmFirebaseSignIn` still produces the
fresh `auth_time` the server requires.

**Kept, on purpose:** the three native packages and their `app.json` plugins; everything in
`lib/firebase-native.ts`; `EXPO_PUBLIC_FIREBASE_*` and `isFirebaseConfigured()` in `lib/config.ts`;
the `EXPO_PUBLIC_GOOGLE_*` client IDs and `googleClientId()`; the `inventoryai` scheme (Phase 27's
`inventoryai://reset-password`); `android.package`/`ios.bundleIdentifier` = `com.inventoryai.app`; and
**`app/+native-intent.ts` with its suite**, which stays until F2 because the scheme entry whose
callback it intercepts is not removed until F2 — keeping the interceptor while the scheme exists is
the stricter ordering (**C-2**).

## The guard that replaced three negative assertions (**G-4**)

Three suites had asserted `expect(mockPromptAsync).not.toHaveBeenCalled()` and peers — the claim that
kept a retained-but-unused helper provably unreachable. Deleting the helper made those assertions
tests of nothing, so rather than dropping them the claim was **moved to the level that still means
something after a removal**: `mobile/__tests__/phaseF1-retired-dependency-guard.test.ts` walks every
source file under `lib/` and `app/` and proves none imports `firebase`, `firebase/app`,
`firebase/auth`, `expo-auth-session` or `expo-web-browser`; that `lib/firebase.ts` is absent; and that
`package.json` declares no `firebase` while still declaring the three native packages that replaced
it. Comments are stripped before the scan — this codebase documents its removals by name — and the
suite carries positive controls so an empty traversal cannot pass, plus a `phaseC-native-google` mock
merge, because two `jest.mock` factories for `lib/config` are rejected by Jest.

## G-2 — the rollback target is accepted as gone

Until F1, `lib/firebase.ts`, the browser helper and the still-installed `firebase` package were a
one-commit rollback from the native migration, and Phase D said the browser code was retained partly
for that reason. **F1 removes that target deliberately; git history is the rollback mechanism** —
`f15995e` (Phase E) and the merge commit `fa87941` are published.

## G-6 — M2 is CLOSED as superseded

The mobile provider integration is **M1** (native SDKs). The `expo-auth-session` / `expo-web-browser`
browser flow (M2) is not a pending alternative, and its machinery no longer exists. The M2 discussion
in §27J and in the design authority is preserved as history with a dated cross-reference rather than
rewritten (**G-7**).

## Verification

- `npm test` — **30 suites / 423 tests, 0 failures** (before F1: 30 suites / 388 tests; `firebase.test.ts`
  deleted, `phaseF1-retired-dependency-guard.test.ts` added, the reduced baselines recorded in the
  Phase F1 report).
- `npm run typecheck` (`tsc --noEmit`) and `npm run lint` (`eslint .`) — clean.
- **`firebase` is no longer a declared dependency and no source file imports it** — but it is **not
  absent from the installed tree**, and the expectation that it would be is wrong: `@react-native-firebase/app@26.4.0`
  declares `"firebase": "12.17.1"` as a hard dependency, so npm de-hoists the JS SDK under
  `node_modules/@react-native-firebase/app/` rather than removing it, and `npm ls firebase` still
  resolves. F1 removed the **duplicate hoisted copy application code used** (direct `firebase@^12.19.0`
  plus 45 packages of its own `@firebase/*` subtrees). The nested copy is unreachable from `lib/` and
  `app/`, which is what the structural guard proves.
- `expo-auth-session`, `expo-web-browser` and `expo-crypto` still resolve as direct dependencies,
  because F2 removes them and F1 must not.
- Server suite — unchanged, as no server file was touched.
- **Device smoke test on the EXISTING Phase 32G development build**, which is sufficient for F1 because
  no native module was removed: a superset of native modules still runs the new JavaScript.
- **iOS remains `[EXTERNAL VERIFICATION REQUIRED]`** — no iOS build or device exists for this project.

## Definition of Done

- No module under `lib/` or `app/` imports the retired packages, proven structurally and not by
  inspection.
- The Firebase JS SDK boundary, the browser OAuth mechanism and the `firebase` dependency are gone.
- Authentication behaviour is unchanged: native email/password, native Google, the confirmation flow,
  the 300-second `auth_time` rule, unlink, and every client-facing error code.
- No native module, plugin, URL scheme, bundle identifier or permission changed — that is F2.
- **No server file, schema, session mechanism or protected working-tree file was touched.**

---

# 27O. Phase F2 — Retire the Browser Dependencies, the Plugin, the Second Scheme and the Native-Intent Hook

Phase F2 is the second half of the owner's **G-1** split, and the half that changes the **native surface** —
which is why it required its own approval and why it is the phase that needs a new development build. It was
delivered in six approved sub-steps (**F2.1–F2.6**) with two verification steps (**F2.7**, **F2.8**), each
reported and accepted before the next began. **F2.9 — the development build — has not been created.**

## What F2 removed, and why each removal was safe

- **F2.1 — the three browser packages.** `expo-auth-session ~57.0.12`, `expo-web-browser ~57.0.3` and
  `expo-crypto ~57.0.3` left `mobile/package.json` (24 → 21 direct dependencies) along with `expo-application`,
  which was nested at `node_modules/expo-auth-session/node_modules/expo-application` and was therefore pruned
  naturally with its only dependent. The lockfile diff is a **pure deletion: 0 added / 49 removed**, no version
  churn. `expo-linking` is **kept** — `expo-router` depends on it — and is asserted present so that deleting
  every `expo-*` entry cannot satisfy the guard.
- **F2.2 — the plugin, atomically with the package (F-1).** Removing `expo-web-browser` from the manifest while
  `app.json` still listed it as a plugin is a **hard failure, not a warning**: `resolvePluginForModule` throws
  before any native mod runs. That was measured rather than assumed — `npx expo config` failed on exactly that
  plugin between F2.1 and F2.2, the accepted intermediate state. F2.2 removes the entry; plugins go 7 → 6 and
  config resolution returns.
- **F2.3 — only the second scheme (G-3).** `expo.scheme` becomes `["inventoryai"]`. The retired entry,
  `android.package` and `ios.bundleIdentifier` are the **same literal string**, so the plausible break is a
  search-and-replace that takes the identifiers with it; both were kept and are asserted. `inventoryai` stays
  because it is Phase 27's `inventoryai://reset-password`.
- **F2.4 / F2.5 — the redirect hook and its suite.** With the second scheme gone,
  `com.inventoryai.app:/oauthredirect` has no producer, so `app/+native-intent.ts` (118 lines) and
  `__tests__/native-intent-oauth-callback.test.ts` (126 lines, 9 cases) were deleted. The guard asserts both
  files are **absent** *and* that nothing under `lib/`/`app/` still names the hook, because an unreferenced
  module is one import away from returning.
- **F2.6 — the lockfile, the last uncovered surface.** F1 read the source, F2.1 the manifest, F2.2/F2.3 the Expo
  config, F2.4/F2.5 the filesystem. F2.6 asserts **reachability, not absence**: the lockfile's root package
  declares none of the four retired packages, none is hoisted at `node_modules/<name>`, any surviving
  occurrence must be nested inside a package F2 keeps, and the kept packages stay hoisted.

## The Firebase dependency boundary, stated accurately

The invariant Phase F enforces is **resolvability from shipped code**, not absence from `node_modules`:

- the **root `firebase` dependency is removed** — declared nowhere in `mobile/package.json`, and the lockfile's
  root package agrees;
- **`firebase` is not hoisted** — there is no `node_modules/firebase`;
- **`@react-native-firebase/app@26.4.0` legitimately retains `firebase@12.17.1`**, nested at
  `node_modules/@react-native-firebase/app/node_modules/firebase`, because RNFirebase declares it as a hard
  dependency — and that package was **not removed, altered or downgraded**, since it is what authenticates;
- therefore **no module under `mobile/lib/` or `mobile/app/` can resolve or import the bare Firebase JS SDK**,
  because resolution walks up from the importing file and there is no entry at the mobile root;
- and it is **never to be claimed that the JS SDK is absent everywhere in `node_modules`**. `npm ls firebase`
  still resolves a nested `firebase@12.17.1`; that is the expected state, not a failed removal.

This is a deliberate correction to the shape the assertion would naturally have taken: a
"no `firebase` entry anywhere" guard **could never pass**, and committing it would have baked a false claim
into a test. The nested occurrence is therefore pinned by *location* rather than denied.

## Verification

- `npx expo config --type public` — **exit 0**, stderr empty. `scheme ["inventoryai"]`;
  `android.package` / `ios.bundleIdentifier` both `com.inventoryai.app`; **6 plugins** (`expo-router`,
  `expo-secure-store`, `expo-camera`, `@react-native-firebase/app`, `@react-native-firebase/auth`,
  `@react-native-google-signin/google-signin`).
- **`npx expo config --type prebuild` — exit 0.** New in F2, and the stronger structural result: it applies the
  config plugins' static config, so the plugin graph resolves on that path too.
- `npx expo config --type introspect` — **exit 1, sole remaining error is blocker B-1**:
  `[ios.infoPlist]: withIosInfoPlistBaseMod: ENOENT … '…/mobile/GoogleService-Info.plist'`, from the
  google-signin plugin's `getGoogleSignInReversedClientId`. `PluginError` count 0; no retired name in the
  output; **no plist created and no native value invented**.
- `npm install` (F2.7) — **a true no-op**: `package.json` and `package-lock.json` byte-identical before and
  after (`a002328b…`, `f46bc21e…`).
- Retired-surface search over `mobile/lib/` + `mobile/app/` — **zero executable references** to any retired
  browser-OAuth or native-intent surface, and none to `com.inventoryai.app`. The ten surviving text mentions
  are **all comments**; the two `GOOGLE_SCOPES` hits are a substring false positive on the live
  `NATIVE_GOOGLE_SCOPES` constant.
- **Guard 59 → 77 cases. Mobile suite 30 suites / 423 tests → 29 suites / 432 tests.** The suite count falls by
  exactly the deleted suite; the test total is **+9 net**, and reading it requires both directions:
  **+4** (F2.1), **+2** (F2.2), **+2** (F2.3), **−9** (F2.5's deleted cases), **−1** (the F1 block's per-file
  `it.each` walks `app/`, so deleting a file there removes one of its own cases), **+4** (F2.4/F2.5),
  **+7** (F2.6). `tsc --noEmit` and `eslint .` clean.
- **Mutation-proven.** F2.4/F2.5: two injected probes → **2 failed**, green once removed. F2.6: three lockfile
  mutations → **3 failed**, lockfile restored **byte-identically**.
- **Config-verified ONLY.** F2 removes a native module, plugin, scheme and Android intent-filter, so the existing
  Phase 32G build cannot prove it (**F-3**). Native confirmation lands with **F2.9**. **iOS remains
  `[EXTERNAL VERIFICATION REQUIRED]`** (**F-6**).

## F2.9 target decision

**The F2.9 development build targets the LOCAL LAN BACKEND, not Render.** The build must reach an API it can
actually talk to, the Render service is a free-tier instance with cold starts, and `mobile/lib/config.ts` would
otherwise fall back to the emulator-only `http://10.0.2.2:4000`. `EXPO_PUBLIC_API_URL` is to be pointed at the
host's LAN address for the run; the `development` profile still declares no `env`, so this is a run-time
decision and not a committed value.

## Carried forward

- The **Render free-tier cold-start limitation** is accepted as a known V1 QA limitation — no plan or instance
  change proposed or made.
- The **F1 device smoke test remains deferred**: the device had no LAN route to the host, and a pre-existing
  unresponsive Metro process on port 8081 forced a secondary port. Neither is touched by F2.

## Definition of Done

- The three browser packages are gone from the manifest, the lockfile and the installed tree's root; the
  `expo-web-browser` plugin is gone with them; `expo-linking` and the six native plugins remain.
- `expo.scheme` is exactly `["inventoryai"]`; both identifiers remain `com.inventoryai.app`.
- `app/+native-intent.ts` and its suite are deleted, and no shipped module names the hook.
- No retired package is resolvable from `lib/` or `app/` — proven on the lockfile as well as in source.
- `@react-native-firebase/app` and `@react-native-firebase/auth` are intact and unaltered, and the nested
  `firebase@12.17.1` under RNFirebase is documented as expected rather than reported as a failure.
- **No authentication behaviour changed, no server file touched, and no protected working-tree file touched.**
- **F2.9 (the new development build) remains the one open step.**

---

# 27P. Phase F2.9 — EAS Development Build & Android Runtime/Native Verification

Phase F2.9 is the step §27O left open and it closes **F-3** (the existing build could not prove the reduced
surface) and **F-6** for Android. It is an **EAS build plus a runtime verification**, and it changed **no source
or configuration file** — the minimum change set was empty.

## The build

| Field | Value |
|---|---|
| Build ID | **`f3038fa1-1cab-476e-b0f9-d6a9178f955b`** |
| Status | **`FINISHED`** |
| Profile / platform | **`development`** / **Android** (`distribution: internal`, `android.buildType: apk`) |
| Fingerprint | **`d16abc4e7df419812e73598db676985be3606dc7`** |
| Created → finished | `2026-09-25T14:34:03Z` → `2026-09-25T15:27:59Z` |
| Credentials | **Reused**, not created (`Build Credentials 84JNqqnITp`) |
| Artifact | `https://expo.dev/artifacts/eas/20nq60ekWSx40s8u9Cm_Y3mzjXhxpU8yOEmfe7X_qco.apk` |

The record displays `gitCommitHash: 2ec35b8a…` (Phase F1), and **that display is misleading**: EAS Build uploads
the **working directory**, not the commit (expo/eas-cli issue #3831 — "*EAS just uploads your working directory
as is*").

**The working tree is proven, not assumed, to be what was built.** `eas fingerprint:generate --platform android`
on the current working tree returns **exactly** the build's fingerprint `d16abc4e…`. Because F2 removed
dependencies from `package.json` and changed `app.json` — both fingerprint inputs — a build of committed HEAD
would necessarily have hashed differently. The uncommitted F2 tree is therefore what EAS compiled, which is what
makes F2.9 a verification of **F2** rather than of its predecessor.

## Android runtime/native verification — F2 change surface: VERIFIED

APK installed successfully on **`emulator-5554`** (AVD `InventoryAI`, **SDK 35**, **x86_64**), in place over the
2026-09-24 build. App **launched successfully** (`ReactNativeJS: Running "main"`, `ExpoModulesCore ✅ JSI
interop was installed`); **`FATAL EXCEPTION` / `AndroidRuntime: FATAL` count for the whole session: 0**; the login
screen rendered in full. The F2 surface is confirmed by four independent kinds of evidence:

- **Registered schemes** — `com.inventoryai.app` is **absent**; the app's own scheme is `inventoryai`, beside
  only framework/dev-client schemes from Expo and the Google Sign-In libraries.
- **Intent resolution** — `inventoryai://reset-password?token=…` **resolves to
  `com.inventoryai.app.MainActivity` and renders the "Set a new password" screen** (the retained Phase 27
  route); `com.inventoryai.app:/oauthredirect` answers **"unable to resolve Intent"** and `am start` fails —
  **unresolvable at the OS level**, with no browser or WebView opened.
- **APK dex inspection** — `expo/modules/webbrowser` **0**, `WebBrowserModule` **0**, `oauthredirect` **0**;
  kept: `expo/modules/securestore` 139, `expo/modules/camera` 469, `io/invertase/firebase` 210,
  `com/reactnativegooglesignin` 50, `com/google/firebase` 1276. **RNFirebase and native Google Sign-In remain.**
- **Local-backend round trip** — "Send reset link" rendered **"Password reset is temporarily unavailable. Please
  try again later."**, which is `server/src/controllers/passwordReset.controller.ts`'s
  `MAIL_NOT_CONFIGURED_MESSAGE` returned as the designed pre-lookup **503**, and which exists **nowhere** in the
  mobile app. **Render was not used.**

## The API/runtime nuance

The **EAS-built APK** carries the expected development configuration behaviour around `http://10.0.2.2:4000`
(the `development` profile declares no `env`, and `.easignore` excludes `.env` from the archive). The **runtime
verification actually exercised a different, equivalent path**: a development build loads its JavaScript from a
local **Metro** bundler, Metro loads the local `.env`, and the bundle therefore addressed the **private LAN
backend address** rather than the emulator alias. Both are **local** and **neither is Render**
(`onrender.com` → 0 matches). The private address is deliberately not reproduced here.

## Authentication status — pre-existing limitations, NOT F2 failures

F2 changed **no authentication logic**. The distinction is preserved and no PASS is manufactured:

- **Email/password — PARTIAL.** The path **executes** (logcat shows the native Firebase SDK receiving
  `signInWithEmailAndPassword`, the Phase 32E Firebase-first flow) and failed with `lib/firebase-auth.ts`'s
  `DEFAULT_FAILURE_MESSAGE`, with **no fallback** to the legacy route — the designed no-downgrade property. A
  successful sign-in needs a **live Firebase project and valid credentials**, which this environment has never
  had.
- **Native Google Sign-In — BLOCKED.** Module present and button renders (`RNGoogleSigninButtonViewManager`);
  the consent flow needs a live Firebase project.
- **Firebase → backend exchange — BLOCKED.** **Inventory AI JWT/session — BLOCKED.** **Firebase logout /
  session teardown — BLOCKED**, because no authenticated session can be created to tear down.

**iOS remains `[EXTERNAL VERIFICATION REQUIRED]`** — no iOS build can be produced on this Windows host, so the
`ios-simulator` profile stays unexercised. F-6 is unchanged and not closed by F2.9.

## Provenance

During runtime verification: **no source or configuration file changed**, **no EAS environment variable
changed**, **no Firebase service file created locally**, **no API URL changed**, **no commit or push**, and all
five protected working-tree files unchanged. A Metro bundler was started on a spare port because the
pre-existing Metro on 8081 was unresponsive and the one on 8082 was unreachable — **neither process was killed**.
A physical device was attached to the host throughout and was **not** used; every command targeted
`emulator-5554` explicitly.

## EAS build-history correction (append-only)

EAS holds **six** Android builds, all `FINISHED`, **five** of them `development`. Two —
**`28b9a4e2-406e-4269-bc98-12da3454b58c`** (2026-09-22, `6bac86e`) and
**`3cd7fae4-66d8-48be-88d0-a305b86c8c93`** (2026-09-24, `9917447`) — are **not in the phase records held at the
time of the audit**. Phase 32G's "three Android builds" was accurate as of 2026-09-20. F2.9 is the **sixth**
Android build and the **fifth** development-profile build. This is an append-only correction; no historical
record is rewritten.

## Superseded statements

This section's header statement — "**F2.9 — the development build — has not been created.**" — and the Phase F2
cross-reference in `CLAUDE.md` (both written before the build) recorded that F2 was **config-verified only**.
Those statements were true when written and are **superseded by this section**: the F2.9 EAS build and the
Android runtime/native verification above. They remain in place as the historical record they are.

## Verification

- EAS build `f3038fa1-1cab-476e-b0f9-d6a9178f955b` — **FINISHED**, artifact produced, `error: undefined`.
- Working-tree fingerprint `d16abc4e…` **==** build fingerprint `d16abc4e…` — the F2 tree is what was built.
- Emulator `emulator-5554` — install **Success**, launch **Success**, **0** fatal exceptions.
- Native surface: retired scheme absent, retired callback unresolvable, retired native module absent from the
  APK dex, kept modules present, retained deep link functional.
- Local-backend HTTP round trip proven end-to-end.
- **No source/config/package file changed; no commit; no push; protected files unchanged.**

## Definition of Done

- The reduced F2 native surface is **Android-runtime verified** rather than config-verified only.
- The retained `inventoryai://reset-password` route is proven functional on the built artifact.
- The retired `com.inventoryai.app` scheme and `/oauthredirect` callback are proven unresolvable on the device.
- Authentication E2E is recorded as **BLOCKED/PARTIAL** for pre-existing environmental reasons, and is **not**
  presented as an F2 failure.
- **iOS remains `[EXTERNAL VERIFICATION REQUIRED]`.**
- **No source, configuration or protected file was modified to obtain these results.**

---

# 27Q. Phase 32L — Firebase Identity Unlink (32L-A / 32L-B) and Its Documentation Close-out

Phase 32L is the owner-directed increment that gave an authenticated account a way to **stop
authenticating through the Firebase identity it carries** and become a password account. It was approved
and shipped as two halves — **32L-A** (server) and **32L-B** (mobile) — and **both were already merged
before this section was written**. This section is therefore a **documentation close-out and shipped
record**, not an implementation: it changes no code, and it exists because the roadmap had **no section
for Phase 32L at all** while **three statements across two sections** — §27K (two) and §27M (one) —
still asserted that Phase 32L had not started.

## Status

| Half | Commit | Scope |
| --- | --- | --- |
| **32L-A** (server) | **`01ae73f`** | The unlink endpoint, its service, validator, audit actions and the Policy B write. |
| **32L-B** (mobile) | **`0c3f87d`** | The disconnect screen, the Profile entry point, `firebaseUnlink`, the `disconnectFirebase` orchestration and `authMethods` widening. |

Both are ancestors of `fa87941` (PR #1) and therefore of **`dbdf673`** (PR #2, `main` at that time).
**The implementation was shipped before this close-out; the close-out documents it.**

**Decision authority:** `docs/freebuff/tasks/FB-007-unlink-last-method-design.md` (design freeze),
`FB-008-phase-32l-a-unlink-backend.md`, `FB-010-phase-32l-b-mobile-unlink.md`; owner decisions
**FB-D-119** (architecture FROZEN), **FB-D-120** (★ the last-provider belief refuted), **FB-D-123**
(the Q6 email parameter ratified).

## What shipped — 32L-A (server)

- **ONE route: `POST /api/auth/firebase/unlink`** — `requireAuth` + controller, **no permission**. It is
  Phase 23's `AUTHENTICATED` bucket, for the reason that bucket exists: it acts only on the caller's own
  account and no catalogue key could express "may unlink an identity" without inventing an authorization
  concept the catalogue does not have. It carries no rate limiter, matching the existing `firebase/link`
  precedent: every attempt already requires a live session, a verified Firebase credential, a matching
  identity and a fresh authentication before it can do any work at all. (`POST /api/ai/chat` is the one
  authenticated route that does carry a limiter.) Body: `{ idToken, newPassword, confirmPassword }`.
- **Both sides of the association are server-derived.** The account is `req.user.id`; the identity is the
  uid `verifyFirebaseIdToken` returns. So a body carrying `userId`, `businessId`, `firebaseUid`, `role` or
  `status` is **inert by construction** — there is no variable in the module holding it. **The email is
  never consulted** — not compared, not used to find an account, not used to resolve anything.
- **★ Policy B — the unlink policy.** An account may leave Firebase authority **only by establishing a NEW
  local password in the same transition**, so it never passes through a zero-authentication-method state.
  That is why `newPassword` is required, and why the retained legacy bcrypt hash is **REPLACED rather than
  re-enabled** — re-enabling it could silently resurrect a credential the user abandoned, or one an
  attacker still knows.
- **The write touches exactly four fields** — `firebaseUid`, `emailVerified`, `passwordHash`,
  `passwordChangedAt` — so an unlink can never move an account between businesses, change its role or
  change its status. `businessId` and `role` are read for the audit row and never assigned.
- **Order is load-bearing:** verify the ID token → confirm the presented identity is the one already
  attached → **freshness** → write. Stale authentication answers **`409`
  `FIREBASE_REAUTHENTICATION_REQUIRED`** (the 300-second window in `src/constants/firebase.ts`), never a
  `401`/`403`, so a stale credential cannot sign the user out.
- **Concurrency is the database's problem, and the guard is the expected identity.** The detach is ONE
  conditional update — `{ _id: user._id, firebaseUid: identity.uid }` with `$unset: { firebaseUid: 1 }`
  — so a stale or racing unlink that presents an identity this account no longer carries matches nothing
  and detaches nothing. The `firebaseUid` sparse unique index enforces UID uniqueness across accounts;
  it is **not** this operation's race-protection mechanism.
- **Sessions:** after the write, `revokeAllSessions` runs as well as the `passwordChangedAt` stamp — the
  stamp alone already rejects tokens issued in a strictly earlier second, and the explicit call closes
  the same-second hole.
- **Audit:** `FIREBASE_IDENTITY_UNLINKED` (success; its metadata records only
  `{ passwordEstablished: true }` and **never the detached uid**, because the audit viewer is readable by
  every ADMIN of the business and the uid is the identity join key) and `FIREBASE_IDENTITY_UNLINK_CONFLICT`.
  "Nothing linked" is answered `409 FIREBASE_IDENTITY_NOT_LINKED` and is deliberately **not** audited — an
  event that did not happen makes a false trail.
- **What the server does NOT do:** Firebase-side provider unlinking (`unlink()`, "Disconnect Google") is
  performed by the **Firebase client SDK** against the signed-in Firebase user; the server cannot observe
  it and offers no API for it. The Admin SDK's `providersToUnlink` capability was runtime-verified and
  deliberately kept out of this flow. The server owns only the MongoDB `firebaseUid` detachment.

## What shipped — 32L-B (mobile)

A dedicated gated screen (`app/(app)/disconnect-firebase.tsx`) reached from a Profile entry point, the
`firebaseUnlink` API wrapper, and a `disconnectFirebase` orchestration in the session layer. The frozen
contract is **reauth-first**; a server **`200` is the only thing that produces a teardown**, and the
Firebase session is ended **after** the 200. The retry no longer holds the new password across a second
confirmation (the owner-ratified remediation, FB-D-123). `authMethods` is provider-neutral —
`{ password, firebase }` — so no provider-specific session or user shape was introduced.

## ★ The refuted assumption that shaped the policy

This repository had recorded, and Phase 32L's own design initially relied on, the belief that **Firebase
refuses to remove a user's last provider**. **Two separate measurements from the Phase 32L runtime work
settle it, and they are different facts:**

- **The last-provider measurement — the refutation.** The unlink **succeeded on the account's final
  provider and left the Firebase account with ZERO providers**, so Firebase does **not** refuse to remove
  the last one and the belief above is refuted.
- **The 390-second measurement — the recency distinction, a separate finding.** At an authentication age
  where `updatePassword` was **refused**, a provider unlink was **accepted**: Firebase does not gate
  unlinking on recency. *This is evidence about freshness, not about the last provider.*

Two consequences follow, and both are load-bearing:

1. **Last-authentication-method protection must be enforced server-side and never delegated to Firebase.**
2. **Policy B is what enforces it** — the account always leaves the transition holding a password.

## The native migration series B–E, which F1/F2 cleaned up

F1, F2 and F2.9 have their own sections (§27N, §27O, §27P). The migration those phases *retired* had no
roadmap record; it is listed here for completeness, with its detail in the design authority §14A.8/§14A.9.

| Phase | Commit | Scope |
| --- | --- | --- |
| RNFirebase native foundation | `c5d07f5` | The native Firebase packages and their `app.json` plugins. |
| **B** | `0c3f87d` | Mobile Firebase authentication moved onto the native SDK (shipped together with 32I, 32J and 32L-B). |
| **C** | `ea52c2c` | Mobile Google Sign-In moved onto the native SDK. |
| **D** | `63826f4` | Native Firebase confirmation flows. |
| **E** | `f15995e` | Native Firebase session teardown and the session-reconciliation decisions (design authority §14A.8). |

All are ancestors of `fa87941` and therefore of `dbdf673`.

## Verification status — stated so it cannot be overstated

- The test, typecheck and lint figures that belong to 32L are the **Phase 32L records' own historical
  figures**. **No suite was re-run for this close-out**, because this close-out changes documentation only.
- **Firebase end-to-end is NOT verified, and this is not a 32L failure.** Email/password is **PARTIAL**
  (the native path executes but no live Firebase project or valid credentials exist), and native Google
  Sign-In, the Firebase → backend exchange, the Inventory AI JWT/session flow and Firebase
  logout/session teardown are **BLOCKED/PARTIAL** for that environmental reason (see §27P).
- **iOS remains `[EXTERNAL VERIFICATION REQUIRED]`** — no iOS build can be produced on this host.
- The **32L-B Google confirmation path was never runtime-verified** (FB-010 handoff note 4); a live
  Firebase project and a development build are required.

## Superseded statements

Written before 32L shipped, true when written, and **preserved in place** with dated notes rather than
rewritten:

- §27K — "**O-1 is unchanged and still open**, and Phase 32L remains the phase that owns it."
- §27K — "**Phase 32I, 32J and 32L were NOT started.**"
- §27M — "The unlink / last-authentication-method disposition is still open (Phase 32L owns O-1)…"
- `README.md` — its three "**Phase 32L was NOT started.**" sentences.
- `CLAUDE.md` — "**Phase 32I, 32J and 32L were NOT started.**"

## Scope of this close-out

**Documentation only.** No source file, test, dependency, schema, index, route, permission, middleware,
Firebase configuration, EAS configuration or Render setting was changed, and **none of the five protected
working-tree entries was touched**. No security or recovery architecture is decided here, and no open
security/recovery item is resolved by this section.

## Definition of Done

- Phase 32L has a roadmap record, and the native migration series B–E is listed.
- Every stale "Phase 32L was NOT started" statement carries a dated supersession note.
- The specification §29 records the shipped unlink capability and Policy B.
- `README.md` records 32L, F1, F2 and F2.9.
- **No implementation claim is made beyond what was actually verified**, and no open security/recovery
  decision is settled or silently closed.

---

# 27R. Registration Form Required-Field Validation (Preview-Validation Finding "F-1")

## Objective

Close the one real defect found while functionally validating the mobile **Preview** build: the
registration screen validated only the confirm-password mismatch, so submitting the form **empty**
produced no client-side errors and instead reached the Firebase sign-up path.

**Naming, stated because three unrelated things share the shape "F-1/F1":** this is the
**registration "F-1"** found during Preview validation. It is **not** the Phase 30A
**"F-1" = PDF sharing** finding (§27F), which remains open, and it is **not** the
**Phase F1 / F2 / F2.9** cleanup series (§27N–§27P). The three names are unrelated, and no historical
record is rewritten to reconcile them.

## Change

`mobile/app/register.tsx` — `submit()` validates required fields **before** it calls `signUp()`:
business name, name, email, password and confirmation must each be non-empty. The pre-existing
confirm-mismatch rule is preserved and sharpened: an empty confirmation reports **"Confirm password is
required"**, while a non-empty confirmation that differs still reports **"Passwords do not match"**.

## Files changed

| File | Change |
| --- | --- |
| `mobile/app/register.tsx` | required-field validation added to `submit()` (+13/−1 lines) |
| `mobile/__tests__/register-validation.test.tsx` | new focused suite, 6 cases |

## Verification

- **Focused suite:** `npx jest register-validation` — **6 passed, 6 total**. A mutation pass that
  reverted the required-field checks failed 4 of the 6 cases, confirming the suite distinguishes the
  fix; the file was restored and its hash re-verified.
- **Full mobile suite:** `npx jest` — **30 suites / 438 tests, 0 failures**. `npx tsc --noEmit` clean;
  `npx eslint .` clean.
- **Device verification (already performed; not part of this documentation change).** EAS `preview`
  Android build **`75fc3eb6-0a01-4bb3-a42d-5e90c9cff939`** (`FINISHED`, fingerprint
  `d16abc4e7df419812e73598db676985be3606dc7`) was installed on device `PV4DDMIZZLTCIVSK`; five
  invalid-submit scenarios passed, with `createUserWithEmailAndPassword` called **0** times.

## Issues

- **The complete-form path was not exercised on device**, because it would create data; it is covered
  by the focused suite only.
- **iOS is not runtime-verified** — no iOS build exists on this host.
- No backend, dependency, permission, route, session or schema change; no protected working-tree file
  touched.

## Documentation

- `CLAUDE.md` numbered index: entries added for Phases **32J, 32K, 32L, F1, F2 and F2.9** (the list
  previously stopped at 32H), plus an unnumbered entry for this fix that disambiguates it from the
  Phase 30A "F-1".
- `docs/SYSTEM_SPECIFICATION.md` §29 and §48, and the design authority §14A.1/§14A.7: the stale
  "Google Sign-In not implemented" statements are corrected, and the design authority gains the missing
  Phase 32L **unlink** supersession note.
- `README.md` Phase Status: an entry for this fix.

---

# 27S. Phase 31 — AI Provider Wire Diagnostics, the AgentRouter → OpenRouter Migration, and the OpenRouter Wire-Suite Test Isolation

## Objective

Close two documentation gaps the provider work left behind, and record the resolution of the one test
failure that was mistaken for an OpenRouter production problem.

**Gap 1 — Phase 31 was never in the phase record.** The AI provider wire diagnostics exist in the
shipped code and are cited by other records (`Phase 31C` preview-profile work, §27J; `Phase 31D.3` and
`Phase 31D.6`, `server/src/services/ai/providers/http.ts`), but the phase had **no section anywhere**
and was **absent from §3's Phase Overview**. It is listed there now.

**Gap 2 — the AgentRouter → OpenRouter migration had no record.** It shipped as three commits and a
merge and touched the specification, `.env.example`, the provider registry, the config validator,
`run-tests.mjs` and three test files — yet `docs/DEVELOPMENT_ROADMAP.md`,
`docs/AUTH_SECURITY_MASTER_CHECKLIST.md`, `CLAUDE.md` and every `docs/freebuff/` file contained **no
mention of OpenRouter at all**. Only `README.md` and `docs/SYSTEM_SPECIFICATION.md` §26/§35 named it,
and the specification's own **§3 Technology Stack** still listed Claude and Google Gemini as the only
providers. Those stale statements are corrected here.

## Provider history — how the AI provider reached its current state

| Stage | What happened |
| --- | --- |
| Phase 06 | The AI Assistant shipped on a provider abstraction with **Claude** and **Gemini** built-ins. |
| Phase 31 | Owner-directed AI provider **wire diagnostics**. A production gateway call answered 2xx with a body `res.json()` could not parse, and only that fact was recorded, so the status, Content-Type and body were all discarded (`31D.3`). A later origin migration replaced an Aliyun WAF challenge with a **401**, and the `!res.ok` branch logged the status alone and threw without reading the body, making it un-diagnosable by construction (`31D.6`). Both branches now report status, Content-Type, length and a **redacted** body prefix. The helpers are logging only: they alter no control flow and raise the same `AiProviderError` on every path. |
| `e9f2690` (2026-09-28) | **`feat: add OpenRouter AI provider`** — an `openrouter` built-in as a thin configuration over the shared `anthropicWire.ts` layer (8 files, +1029/−14). |
| `711d090` (2026-09-28) | **`chore: remove the AgentRouter AI provider and leave OpenRouter as the only provider`** — the retired gateway's module, registry entry, provider-selection support, configuration, environment variables, tests and active documentation removed (14 files, +42/−213). |
| `7b4f4fa` (2026-09-28) | **`test: retarget AI wire diagnostics to OpenRouter`** — `phase06-ai-wire.test.mjs` rebuilt against the OpenRouter variables; the Phase 31D.6 diagnostics in `http.ts` committed unchanged (3 files). |
| `e97497b` (2026-09-28) | Merge of **PR #6** into `main`. |

**Why the gateway mattered, and what did not change.** The retired gateway required claude-cli /
claude-code client-fingerprint headers; OpenRouter documents a bare `Authorization: Bearer` and
nothing else, so the OpenRouter provider sends **no** impersonation headers and **no**
`anthropic-version`. Because OpenRouter fronts many models with differing tool-calling ability,
`AI_MODEL_OPENROUTER` is **required with no default** — a missing model refuses to build and surfaces
as a 503 rather than silently routing inventory questions at a model that may not support tools.
Provider selection stays server-side on the pre-existing `AI_PROVIDER` switch, so adding a provider
does not by itself change which one is configured. The AI Assistant flow, tool authorization, tenant
isolation and the read-only AI V1 boundary are unchanged by the migration.

## OpenRouter status vs. test status — the distinction this record exists to keep

**Production / integration status.** The OpenRouter integration **has been working in test
production** throughout this work: the AI Assistant responds through the OpenRouter provider, and this
investigation found **no production OpenRouter integration failure**. Nothing here should be read as
"OpenRouter was broken", "the AI Assistant was broken", or "credits caused a production failure".

**Automated test-isolation status.** One unit test failed, and it had **nothing to do with the
gateway**: the suite **never contacted OpenRouter**, and running it **cannot consume OpenRouter
credits**. The failure was a local test-isolation defect whose symptom — the real production model name
appearing in an assertion — made it look like a model/credits problem.

### The failure

`server/test/phase-openrouter-provider.test.mjs` → *"sends the configured model, token cap, system
prompt, tools as input_schema and mapped messages"*:

```text
+ actual   'inclusionai/ling-3.0-flash-sante:free'      ← the model configured in server/.env
- expected 'test-vendor/tool-capable-model'             ← the stub's model
```

### Root cause — ambient `.env` contamination, in six steps

1. `createAnthropicCompatibleProvider()` captures the **API key** at construction time.
2. It resolves the **model per request** — `aiConfig()[modelKey] || defaultModel` — and `aiConfig()`
   reads `process.env` lazily by design, so a test can switch providers between files.
3. `server/test/phase-openrouter-provider.test.mjs` imports `test/support.mjs`, which does
   `import 'dotenv/config'`, so the developer's real `server/.env` is loaded into `process.env`.
4. The old `providerFor()` helper set `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL` /
   `AI_MODEL_OPENROUTER`, built the provider, and **restored all three before the deferred request ran**.
5. `complete()` therefore read `AI_MODEL_OPENROUTER` from the ambient environment — the real `.env` model.
6. The assertion compared that value against the stub's expected model and failed.

Because the *ambient* value leaked, the suite **passed wherever `server/.env` set no
`AI_MODEL_OPENROUTER`** and failed only on a configured machine. That asymmetry — not a provider fault —
is why the failure looked intermittent and environment-dependent.

### The fix (test-only)

| File | Change |
| --- | --- |
| `server/test/phase-openrouter-provider.test.mjs` | `providerFor()` now **pins** its three environment variables for the **whole test** instead of restoring them before the request, and a top-level `afterEach()` reverses and clears them so no stub value leaks. `afterEach` added to the `node:test` import. (+27/−10) |

**No production source was changed** — not the provider, the registry, the model configuration, the
config validator or `http.ts`.

### Verification

- Target suite, `TEST_MODE=unit`: **28 pass / 0 fail / 1 skipped** (the DB-backed suite, skipped by mode).
- Same suite with a hostile ambient `AI_MODEL_OPENROUTER=some/other-model`: **28 pass / 0 fail** — the
  suite no longer reads the ambient value at all.
- `npm run test:unit`: **373 tests, 348 pass, 0 fail, 25 skipped**.
- `npm run typecheck`, `npm run lint`, `git diff --check`: clean.
- Protected files, `.env` and `server/src/**`: **unchanged**.
- Commit **`751d796`** — `test: pin the OpenRouter suite's model instead of reading the ambient env`.

### Does this test call the real OpenRouter API?

**No.** Every request in the suite goes to a local `http.createServer` stub on `127.0.0.1`, except one
case that deliberately targets an unreachable `http://127.0.0.1:9/api` to exercise the network-error
path. No gateway credential is used, no request leaves the machine, and **running it cannot consume
OpenRouter credits**. The sibling wire suite `phase06-ai-wire.test.mjs` uses the same stub approach and
does **not** import `support.mjs`, so it was never affected by the `.env` coupling — the same trap
exists for any future suite that both loads `dotenv` and asserts on a lazily-read provider value.

## Future-audit guidance

> OpenRouter integration was verified working in test production at the Phase 1 reconciliation
> checkpoint. The historical unit-test failure was caused by ambient `.env` contamination in the
> OpenRouter test, not by the production provider. Future audits should verify current
> deployment/provider configuration and run deterministic local tests, but should not reopen the
> historical test-isolation investigation unless the relevant test or provider environment-loading
> behavior changes.

A historical verification is **not** a statement that OpenRouter, a specific free model, or the
gateway API will remain available. **Free model availability and credits can change independently of
application correctness**, so temporary model-credit exhaustion is not evidence that the Inventory AI
OpenRouter integration is defective. Verifying current deployment, model and API availability remains
required whenever it is relevant.

## What remains genuinely unverified

- **The DB-backed AI tool workload** in the same file — all nine read-only tools executed over MongoDB —
  was **not** run during the reconciliation, because `TEST_MODE=unit` skips it by design. It needs
  `npm run test:db` / `npm test` against a reachable database.
- **No automated test makes a live gateway call**, so a real 200/401/429 from OpenRouter, the deployed
  model's tool-calling behaviour, and the Render production configuration are covered by production
  smoke testing — not by the suite.
- **`docs/AUTH_SECURITY_MASTER_CHECKLIST.md` was deliberately not changed.** Its remit is
  authentication/security invariants, owner decisions, deferred security items and the §32/§37
  protected-file integrity register. AI provider health and provider-suite test isolation are not
  authentication or authorization properties, so recording them there would dilute that register.

## Documentation

- `docs/DEVELOPMENT_ROADMAP.md` §3 — Phase 31 added to the Phase Overview (it had never been listed);
  this section added.
- `README.md` — the Phase 06 entry no longer omits OpenRouter, and the Phase Status list gains a
  Phase 31 entry recording the diagnostics, the migration and the test-isolation outcome.
- `CLAUDE.md` §2 — the AI stack bullet listed only "Claude and/or Gemini" and now names all three
  providers, identifying OpenRouter as the deployed one.
- `docs/SYSTEM_SPECIFICATION.md` — **§3 Technology Stack** no longer lists Claude and Gemini as the only
  providers, and **§41 Testing Strategy** records that the provider wire suites run against a local
  stub and never contact a live gateway.
- `docs/freebuff/HANDOFF.md` §2 — the living current-state table refreshed.
- No historical record, snapshot or test-count figure was rewritten, and no file was deleted.

---

# 27T. Deployment-Configuration Reconciliation (Phases 4A–4B)

A read-only verification of the deployed **EAS** and **Render** configuration, and the two
repository-visible corrections it justified. **Documentation and one configuration value only:** no
application source, test, dependency, schema, route, permission, mobile code, Render setting or EAS
dashboard value was changed.

## What shipped

- **Phase 4A (`d309252`)** — the EAS **`production`** profile's `EXPO_PUBLIC_API_URL` was the literal
  `https://REPLACE-WITH-PRODUCTION-ORIGIN`. The project owner confirmed
  `https://ai-inventory-l1mi.onrender.com` as the intended production origin, and the value was replaced.
  One line in `mobile/eas.json`; `preview` already pointed at the same origin (`934b15a`). No other
  profile, variable, plugin or native setting changed.
- **Phase 4B (this record)** — the deployment audit's findings were reconciled into
  `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §38 and the Render section of `README.md` (`0152f8a`), and the
  ignore / configuration boundary audit was added as the phase's addendum (`d14ad86`).
- **Repository hygiene checkpoint (`a95a461`)** — the two boundary decisions the audit raised were
  approved by the owner and committed: `.freebuff/` and `.claude/settings.local.json` were added to the
  root `.gitignore`. Verified afterwards: both rules match, no tracked file became ignored, the
  tracked-file integrity check stayed empty, and the working tree went from one untracked entry
  (`?? .freebuff/`) to **fully clean**.

## Findings — repository evidence vs. dashboard verification

| Item | Evidence | Status |
| --- | --- | --- |
| G-1 production EAS API origin was a placeholder | repository | **DONE / FIXED** (`d309252`) |
| G-2 EAS Firebase/Google client configuration | dashboard (owner-verified) | **VERIFIED — NO ACTION REQUIRED** |
| G-3 Render `TRUST_PROXY=1` | dashboard (owner-verified) + code-derived | **VERIFIED** |
| G-4 Render production configuration documentation | repository | **DONE** — now enumerated in `README.md` |
| Mail configuration | code-derived | **VERIFIED — NO ACTION REQUIRED** for startup; **OPEN** for password recovery — the reset-architecture decision is pending a **separate read-only audit** |
| Auth/rate-limit configuration | code-derived | **VERIFIED — NO ACTION REQUIRED** — **sixteen** optional `AUTH_*` variables, code-counted (not an estimate) |
| Ignore-boundary decisions (`.freebuff/`, `.claude/settings.local.json`) | repository | **DONE / VERIFIED** (`a95a461`) |

`EXPO_PUBLIC_FIREBASE_*` (all six client values), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
`GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST` are **EAS dashboard environment variables**,
not values missing from `mobile/eas.json`. The Firebase Android SHA-1/SHA-256 fingerprints are
configured in the Firebase console. **No secret value is recorded anywhere in this record.**

## The one genuinely open item — and what is deliberately NOT decided

Password recovery is **disabled in production** because the Render service carries none of
`MAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY` or `PASSWORD_RESET_URL`. That is the designed
"not configured" state rather than a defect: `POST /api/auth/forgot-password` correctly answers a fixed
503 `MAIL_NOT_CONFIGURED`, and **the server still boots and serves every other feature** — mail missing
disables recovery only. Two things must **not** be read into this: **Resend is still the implemented,
supported transport and was not removed**, and **Firebase-based password recovery has not been
implemented.**

**The production reset architecture is undecided, and this record deliberately does not decide it.**
Choosing between the shipped Resend flow and a Firebase-based reset requires a separate **read-only
audit** first, so **no `PASSWORD_RESET_URL` value is proposed or pre-decided here.** Phase 27's
`inventoryai://reset-password` mobile custom scheme exists and works, but whether a future decision
reuses it is part of that audit. **Nothing was configured, enabled or changed.**

`AI_MAX_TOOL_RESULT_CHARS` (default `12000`, read by `aiConfig.ts`) is also absent from
`server/.env.example` — cosmetic drift, recorded so it is not rediscovered as a defect.

## Verification

`mobile/eas.json` parses and keeps its four profiles, `cli.appVersionSource: "remote"` and **no
`channel`** key; its worktree EOL is unchanged (`i/lf w/lf`). `git diff --check` is clean and the change
is one line. The other four protected files are byte-identical to `HEAD`. No build, no deployment, no
DB-backed test, no live AI/API call, no `.env` change, and no secret recorded.

## Ignore / configuration boundary audit

A read-only audit of every ignore and exclusion rule in the repository, added because "the file is not
committed" is **not** by itself evidence of a defect: this project deliberately keeps several classes of
value outside Git and outside the EAS archive. `git check-ignore -v` was run for every rule below.

| File / rule | Purpose | Evidence | Status | Action |
| --- | --- | --- | --- | --- |
| root `.gitignore` → `node_modules/` | keep dependencies out of Git | `server/node_modules` and `mobile/node_modules` both match | **INTENTIONAL — VERIFIED** | none |
| root `.gitignore` → `.env`, `.env.*`, `!.env.example` | never commit secrets; keep the **names** template trackable | `server/.env` and `mobile/.env` are present locally and ignored; both `.env.example` files are tracked and **not** ignored | **INTENTIONAL — VERIFIED** | none |
| root `.gitignore` → `logs/`, `*.log`, `*-debug.log*` | local log artifacts | `mobile/.emulator-boot.log`, `mobile/.metro-check/metro.log` match | **INTENTIONAL — VERIFIED** | none |
| root `.gitignore` → `.expo/`, `dist/`, `web-build/`, `expo-env.d.ts` | Expo build output and generated types | `mobile/.expo/`, `mobile/dist/` match | **INTENTIONAL — VERIFIED** | none |
| root `.gitignore` → `mobile/android/`, `mobile/ios/` | CNG: generated native projects stay out of source control | neither directory exists; both paths match | **INTENTIONAL — VERIFIED** | none |
| root `.gitignore` → `.playwright-mcp/`, `.smoke/` | local tooling and smoke-test captures | both match | **INTENTIONAL — VERIFIED** | none |
| `mobile/.gitignore` → `google-services.json`, `GoogleService-Info.plist` | Firebase native config is **never committed** (owner decision **P-1** / **O-7 RESOLVED**); a build receives it as file environment variables | neither file is present locally | **INTENTIONAL — VERIFIED** | none |
| `mobile/.gitignore` → `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.pem`, `*.mobileprovision` | signing and provisioning material | present in both ignore files | **INTENTIONAL — VERIFIED** (security-sensitive) | none |
| `mobile/.easignore` as a whole | EAS CLI uses `.easignore` **instead of** `.gitignore`, so it must carry the **union** of the mobile and relevant root rules | its own header states this; the file is tracked | **INTENTIONAL — VERIFIED** | none |
| `mobile/.easignore` → `.env`, `.env.*`, `!.env.example` | **security-critical:** without it the developer's local `mobile/.env` — holding the eight `EXPO_PUBLIC_*` client values — would be uploaded into a remote build archive | file inspected; `mobile/.env` present locally | **INTENTIONAL — VERIFIED** | none |
| `mobile/.easignore` → `google-services.json`, `GoogleService-Info.plist` | a remote build gets them from `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST`, not as an uploaded copy | `mobile/app.config.js:50,54`; owner-verified dashboard variables | **INTENTIONAL — VERIFIED** | none |
| `mobile/.easignore` → `.smoke/` | the rule the file was created for (Phase 31B.2) | its header comment | **INTENTIONAL — VERIFIED** | none |
| root `mobile/android/`, `mobile/ios/` vs `.easignore` `/android`, `/ios` | equivalent — `.easignore` is rooted at `mobile/` | rule-by-rule comparison of the two files | **INTENTIONAL — VERIFIED** | none |
| **no `server/.gitignore`** | the root rules already cover `server/` | `git check-ignore server/node_modules server/.env` both match root rules | **INTENTIONAL — VERIFIED** | none |
| **no `render.yaml` / `Procfile` / `Dockerfile` / `.dockerignore` / `.npmignore`** | Render configuration is dashboard-side (`rootDir: server`, branch, Auto Deploy, health check); this is neither a containerised nor a published deploy | repository-wide search found none | **INTENTIONAL — VERIFIED** | none |
| **no `.gitattributes`** | line endings are governed by `core.autocrlf=true`, a local Git setting rather than a repository attribute | the file does not exist; `git ls-files --eol` reports an empty `attr/` column for every file | **INTENTIONAL — VERIFIED** | none. *Consequence recorded:* EOL handling is **operator-local**, so a clone with a different `autocrlf` shows whole-file EOL differences — which is why this project verifies **git blob hashes**, not worktree text |
| root `.env` (present locally, ignored) | a local developer artifact, **read by nothing**: `dotenv` resolves from the process working directory, which is `server/` | `server/src/index.ts:2` (`import 'dotenv/config'`) | **INTENTIONAL — VERIFIED** | none |
| `mobile/google-services.json` / plist **absent locally** | consequence: `app.config.js`'s local-path fallback points at a file that is not there, so a *local* prebuild would fail; the EAS build is the supported path and supplies them through the file environment variables | `mobile/app.config.js:50,54`; the ENOENT class is already recorded in §27J | **INTENTIONAL — VERIFIED** | none |
| **`.freebuff/` — was untracked and matched by NO ignore rule** *(finding as recorded at the audit checkpoint)* | local tooling state, deliberately outside Git; **0 commit entries across every ref** | `git check-ignore .freebuff/project-id` returned **no match**; `git log --all -- .freebuff` is empty | **RESOLVED — DONE / VERIFIED (`a95a461`)** | Owner decision taken: `.freebuff/` was added to the **root `.gitignore`**. It now matches (`git check-ignore -v` → the `.gitignore` rule), and it is **still untracked and uncommitted** — 0 commit entries across every ref, contents untouched |
| **`~/.config/git/ignore` → `**/.claude/settings.local.json`** *(finding as recorded at the audit checkpoint)* | a **machine-local** global excludes file, not a repository rule | `git check-ignore -v .claude/settings.local.json` resolved to `C:\Users\jeffe/.config/git/ignore:1` | **RESOLVED — DONE / VERIFIED (`a95a461`)** | Owner decision taken: the rule is now in the **root `.gitignore`**, so the file is ignored in **every clone** rather than only on this machine. The machine-local global excludes file is unchanged and remains outside the repository |
| **`wip/backup-working-tree` @ `e9616cf`** | the preserved pre-reconciliation working-tree snapshot | `git ls-remote` equals the local ref; its tree still holds the pre-Phase-4A `mobile/eas.json` (`c1ab09c8…`), `http.ts` and `mobile/.easignore` | **INTENTIONAL — VERIFIED** | **preserve.** Ignore rules cannot affect refs, so no ignore file can damage or expose it |

**Integrity result: `git ls-files -i -c --exclude-standard` is EMPTY** — no tracked file is matched by
any ignore rule, and no file under `server/src/`, `server/test/`, `mobile/app/` or `mobile/lib/` is
silently outside Git. Every exclusion above is **INTENTIONAL**, and the two rows recorded as
**POSSIBLE GAP — NEEDS OWNER DECISION** are both **CLOSED**: the owner approved the two
repository-boundary rules and they were committed in **`a95a461`**.

*Historical note, preserved rather than rewritten:* at the audit checkpoint this record read "**no
ignore file was changed**" and carried those two items as open owner decisions. That was accurate then
and remains traceable in the row wording above; it is **superseded, not deleted.** Re-verified after
`a95a461`: both rules match, `.freebuff/` and `.claude/settings.local.json` are reported **ignored**
(`!!`) by `git status`, no tracked file became ignored, and the tracked-file integrity check is still
**empty**.

Two historical Freebuff notes describe a `mobile/.gitignore` entry for the Firebase native files as
"not the mechanism" (`tasks/FB-012…:192`, `MASTER_LOG.md:515`). Those notes predate the entries now
present at `mobile/.gitignore:45,46`, and the point they make still holds and is the reason both files
carry the rule: **`.easignore` replaces rather than extends `.gitignore`**.

## Documentation

- `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` — **§38** added: the current-state deployment baseline, the
  auth/rate-limit and mail audits, the refreshed protected-file register, the security-relevant
  ignore-boundary result and the future-audit guidance.
- `README.md` — the Render deployment section now enumerates the required production variables and
  explains `TRUST_PROXY`, and records what is deliberately absent from the repository; the environment
  section records which values are dashboard-managed.
- `docs/DEVELOPMENT_ROADMAP.md` §27T — the rule-by-rule **ignore / configuration boundary audit** table
  above, added as the addendum to this phase.
- `docs/freebuff/HANDOFF.md` §2 and `docs/freebuff/BASELINE.md` §13 — the living pointer to the
  protected-file integrity register re-pointed from §32/§37 to §32/§38.
- `docs/DEVELOPMENT_ROADMAP.md` §27T, `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §38 and `README.md` —
  **second pass, after `a95a461`**: the two ignore-boundary decisions advanced from open to
  **DONE / VERIFIED**, the stale "no ignore file was changed" statement corrected, the `AUTH_*` count
  corrected to **sixteen** (code-verified), and the password-recovery wording corrected so that Resend
  is not implied to be removed, Firebase reset is not implied to be implemented, and no
  `PASSWORD_RESET_URL` value is pre-decided. Original audit wording is preserved and marked superseded.
- No historical record, snapshot or test-count figure was rewritten, and no file was deleted. In
  particular §27J's Phase 32G text still says the `production` profile holds the placeholder: that is a
  **frozen historical record**, superseded rather than edited.

---

# 28. Phase Gate System

Claude Code must NOT automatically move to the next phase after completing a phase.

After every phase, produce:

```text
PHASE STATUS
────────────
Phase:
Status:

IMPLEMENTED
- ...

FILES CHANGED
- ...

TESTS
- ...

VERIFICATION
- ...

ISSUES
- ...

SPECIFICATION CONFLICTS
- ...

REMAINING WORK
- ...

RECOMMENDED NEXT PHASE
- ...
```

The project owner decides whether to proceed.

---

# 29. Change Control

If Claude discovers that the current specification is incomplete or incorrect:

Do NOT silently redesign the system.

Instead:

1. Identify the issue.
2. Explain why it matters.
3. Propose a solution.
4. Explain affected components.
5. Wait for approval before making major architectural changes.

Minor implementation improvements that do not alter architectural decisions may be applied normally.

---

# 30. Bug Handling

If a bug is discovered during a phase:

### If related to the current phase

Fix it before declaring the phase complete.

### If unrelated to the current phase

Do not immediately expand scope.

Report it as:

```text
Unrelated issue discovered:
...
Recommended future phase:
...
```

Only fix it immediately if it blocks the current phase.

---

# 31. Refactoring Rules

Refactoring is allowed when it:

- Improves maintainability
- Fixes architectural problems
- Removes duplication
- Improves security
- Improves testability

However:

Do not perform large unrelated refactors during feature implementation.

Keep changes focused.

---

# 32. Dependency Rules

Before adding a dependency:

1. Determine whether the feature actually requires it.
2. Check whether an existing dependency already provides the functionality.
3. Prefer established and maintained libraries.
4. Avoid unnecessary packages.
5. Explain significant new dependencies.

Do not add dependencies simply for convenience.

---

# 33. Git Checkpoints

A Git commit should be created after a stable phase.

Recommended:

```text
phase 00: planning complete
phase 01: foundation complete
phase 02: backend database complete
phase 03: authentication authorization complete
phase 04: inventory core complete
phase 05: mobile application complete
phase 06: AI assistant complete
phase 07: production hardening complete
phase 08A: structured request logging complete
phase 08B: ESLint baseline complete
phase 10A: commercialization foundation complete
phase 10B: commercialization documentation close-out complete
phase 11A: inventory intelligence + restock alerts complete
phase 11B: inventory intelligence documentation close-out complete
phase 14A: user management foundation complete
```

Before committing:

- Run relevant checks.
- Review changed files.
- Verify no secrets are included.
- Confirm scope is correct.

---

# 34. V1 Completion

V1 is complete only when all major requirements in:

`docs/SYSTEM_SPECIFICATION.md`

have been implemented and verified.

The final V1 workflow must work:

```text
Register
   ↓
Create Business
   ↓
Login
   ↓
Create Location
   ↓
Create Category
   ↓
Create Product
   ↓
Stock In
   ↓
Inventory Updated
   ↓
Transaction Recorded
   ↓
Stock Out
   ↓
Inventory Updated
   ↓
Transaction Recorded
   ↓
Dashboard Updated
   ↓
AI Inventory Questions
```

---

# 35. Future Development

After V1, future features must be planned separately.

Potential V2:

- Push notifications
- Advanced reports
- Document upload
- RAG
- MongoDB Vector Search
- Google Sign-In (Firebase provider) — **approved, not implemented**
- Facebook Login (Firebase provider) — **approved, not implemented**

Firebase Authentication itself is **not** future work: it shipped as the identity provider in Phases
32B–32E (§27H). The two provider entries are the approved-but-unimplemented part, each bound by the
Phase 32F linking policy — **no automatic linking on an email match** — and by the open register in
design document §14A.5. **Apple Sign-In remains future scope** and is not scheduled. No provider SDK
is installed, and the first EAS development build remains a prerequisite (§27F).

Shipped since this list was written, and no longer future work: the barcode/QR scanner (Phase 12B–12D),
supplier management (Phase 13A, Phase 17), and stock transfers (Phase 19) — see their sections above.

Potential V3:

- AI forecasting
- Demand prediction
- Purchase recommendations
- Automated alerts
- AI-assisted actions

Potential V4:

- Multi-business SaaS
- Subscriptions
- Billing
- Team management
- AI usage quotas

Subscription and billing state belongs to the **business (tenant)**, never to an individual Firebase
identity or user account: a change of Owner, or a change of authentication provider, must not
transfer, destroy or recreate a business's subscription (specification §9). The Phase 10A foundation
(`Business.planCode`, `server/src/constants/plans.ts`, the entitlement service) already keys entitlement
off the business rather than the person; payments, the billing lifecycle and paid-plan enforcement
remain unimplemented and deferred here.

Future functionality must not be implemented during V1 unless explicitly approved.

---

# 36. Final Development Rule

The goal is not to produce the largest amount of code as quickly as possible.

The goal is to produce a:

- Secure
- Correct
- Maintainable
- Testable
- Scalable
- Production-ready

inventory management system.

Every phase must leave the project in a better and verifiable state than before.