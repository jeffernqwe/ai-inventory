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
        ↓
AUTH-04
Custom 6-Digit Email Verification (AUTH-04-A…H; G PASSED live 2026-10-04, H = documentation close-out)
        ↓
Phase C3
Mobile Sign-in Vocabulary Standard & Widened Local-Password Gate (presentation only; §27Z)
        ↓
Phase A / F-1
Removal and Re-scope of the Firebase Unlink Capability (retrospective record; §27AA)
        ↓
AUTH-01
Firebase Revocation Checking & Verification-Failure Classification (2026-10-02; §27AB)
        ↓
AUTH-02
Short-Lived JWT, Enforced Issuer/Audience & the 14-Day Absolute Session Cap (2026-10-02; §27AC)
        ↓
AUTH-03
Inventory Session Renewal — Server Boundary & Mobile Client (2026-10-02; §27AD)
        ↓
CI quality gate
Server + Mobile GitHub Actions Gate (2026-10-07; §27AE)
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

> **Superseded in part — 2026-10-01 (`Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`).** The
> unlink capability the note above records as **shipped** was **REMOVED**, not deprecated: the route
> `POST /api/auth/firebase/unlink`, its service and its two audit actions no longer exist in the committed
> tree, and the operation was re-scoped into a **credential change** — so no reachable path clears
> `firebaseUid` by unlinking. **The Policy B measurements above remain valid history**; what changed is
> that the capability itself is gone. See the Phase F-1 correction in `CLAUDE.md` and
> `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §8.

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

> **Widened 2026-10-07 (Phase C3 — see §27Z).** The paragraph above is **not rewritten**, and
> `=== false` is still what keeps an older server's user object on the historical path. It became an
> **under-statement**, though: the shipped gate now also denies the local password action to
> `{ password: true, firebase: true }` — a legacy password account that later attached a Firebase
> identity. `authMethodsFor` derives the two capabilities as exact complements today, so the current
> server never produces that shape; the account it describes still has **no local password to
> manage**, because `loginWithPassword` refuses it with 403 `FIREBASE_SIGN_IN_REQUIRED` and
> `/change-password` answers 409 `PASSWORD_NOT_APPLICABLE` — its retained `passwordHash` is inert.
> The shipped gate is therefore
> `user?.authMethods?.password === false || user?.authMethods?.firebase === true`.

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

> **Superseded in part — 2026-10-01 (`Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`).** The
> unlink capability this section documents was **REMOVED**, not deprecated: the server route
> `POST /api/auth/firebase/unlink`, its service and its two audit actions no longer exist in the committed
> tree, and the operation was re-scoped into a **credential change**. **Everything below — the Status
> table, the "What shipped — 32L-A / 32L-B" sections, the Policy B mechanics and the refuted-assumption
> measurements — is the Phase 32L record: it remains valid as history and is annotated here rather than
> rewritten**, and the Policy B measurements stay valid historical facts. What is no longer true is only
> this: the capability itself is gone, and no reachable path clears `firebaseUid`. See the Phase F-1
> correction in `CLAUDE.md` and `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §8.

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
| Auth/rate-limit configuration | code-derived | **VERIFIED — NO ACTION REQUIRED** — **twenty-two** optional `AUTH_*` variables (eleven pairs), code-counted (not an estimate). *(Corrected 2026-10-07: this row read **sixteen**. **AUTH-03** added the session-renewal pair and **AUTH-04** the two email-verification pairs; sixteen was correct for this row's own baseline.)* |
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

# 27U. Phase 32N — Firebase-Only Authentication Architecture & the Credential-Change Revocation Bridge (design record only)

**Documentation only.** No application code, test, schema, dependency, environment variable, Firebase
Console setting, EAS configuration or deployment change was made by this phase. The authoritative
record is `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C**; the security-record
counterpart is `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` **§39**.

**Phase identifier.** `32N` is assigned **by this record**, not inherited — `32M` is not a phase in this
repository, and the `*(planned)*` rows in design §21 are left untouched. If the owner prefers another
identifier the record is renumbered rather than split.

## What shipped

Nothing executable. One design section (§14C), one security section (§39), this roadmap section, and
reconciled pointers in the specification, `CLAUDE.md` and `README.md`.

## The premise that shapes everything

The owner has fixed that **all current MongoDB users are mocked development/test data**, and that **no
legacy-user migration or bulk `auth:import` is to be built**. Two consequences follow and are recorded
rather than discovered later: design **§18 Gate 1** (bcrypt `auth:import` support) ceases to be live,
and the unhealable-orphan problem (**O-6**, design §16.6) does not arise for this population. The
migration direction therefore reverses: instead of carrying the existing population forward, the
**legacy password path is retired**.

## The nineteen locked decisions

Design **§14C.1**, cited as **L-1…L-19**: Firebase owns email/password, Google, password reset, email
verification and password changes (**L-1…L-5**); email/password users must verify before entering the
main app, and Google users are verified **according to Firebase's signed `email_verified` claim**
rather than because the provider is Google (**L-6, L-7**); the **Inventory AI JWT + server session
remain**, and Firebase does not replace backend authorization (**L-8**); **MongoDB remains
authoritative** for `businessId`, `role`, `status`, permissions, business lifecycle and tenant isolation
(**L-9**); legacy bcrypt login/register (**L-10**), the custom reset tokens + endpoints + **Resend**
infrastructure (**L-11**), admin-created password accounts (**L-12**) and the Inventory-specific
link/unlink lifecycle (**L-13**) are to be retired or re-scoped; a **credential-change revocation
bridge** is required before native recovery or change-password ships (**L-14/L-15/L-16**); the
**action-link return leg must be verified live** (**L-17**); business authorization must **not** move
into Firebase custom claims (**L-18**); and `checkRevoked` was reviewed (**L-19**).

## The security finding this phase exists to close

**A Firebase-native password reset would revoke nothing.** `passwordChangedAt` is the *only* mechanism
that invalidates existing Inventory AI sessions on a credential change, and Firebase cannot invalidate
them either (`checkRevoked` was `false` when this was written — **AUTH-01 now sets it `true`**, see the
review below). A client-side `confirmPasswordReset()` or `updatePassword()`
never reaches the server, so **every session that existed before the change — including an attacker's —
survives it**, which inverts the purpose of a reset. Today's 26B/27 flow does not have that hole because
the server stamps the field. **This is O-9 becoming live**, and it is why L-14 forbids shipping native
recovery first.

## The proposed bridge (design §14C.3)

`POST /api/auth/credentials-changed` — **AUTHENTICATED**, no permission, body `{ idToken }`, validator
returning only `{ problems, idToken }` so a planted identity/tenant/role is **inert by construction**.

- **L-15, twice over:** the verified uid **must equal** the account's `firebaseUid` (a mismatch is one
generic `409` and **no write**), **and** the signed `auth_time` must be inside the existing
  `FIREBASE_REAUTH_WINDOW_SECONDS` (300 s) window, failing closed on an absent claim. No single stolen
  artefact satisfies both plus a live session.
- **Writes exactly two things:** `passwordChangedAt = now` and `revokeAllSessions(...)`. It cannot move a
  tenant, change a role or change a status. Audit metadata is `{ reason: 'credential_changed' }` and
  **carries no uid** (the audit viewer is ADMIN-readable — the 32H/32L precedent).
- **L-16, ordering:** Firebase change → **bridge** (revokes everything) → **re-exchange**
  (`/api/auth/firebase/exchange` is **PUBLIC**, so the revocation cannot block it) → a new JWT whose
  `iat >= changedAtSec`. The request that performs the change is admitted because `requireAuth` rejects
  only tokens minted **strictly before** the stamp. The user stays signed in.
- **⚠️ Idempotency, and the one hazard added:** the endpoint is **not** retryable — a second call stamps
  a *later* time and revokes everything again, so a replay after the re-exchange would kill the
  brand-new session. It is sent **exactly once per credential change**. If its response is lost and the
  client retries, the retry arrives with the old token and is answered `401 SESSION_INVALIDATED`, which
  the client must treat as **success-equivalent** and proceed to the re-exchange. **This rule must be
  pinned by a test in the implementing step.**
- **Deliberately not done:** it does not change the credential, never reads `email`, does not claim to
  know *which* credential changed, carries **no rate limiter** (the standing rule that no authenticated
  route in this application is limited — 32H and 32L both record it), and does not replace the user's
  manual `POST /logout { all: true }`.

**Rejected alternatives** (design §14C.3.6): a **public** endpoint keyed only on a verified ID token
(turns a stolen Firebase credential into an Inventory AI denial-of-service against that account, and
contradicts L-15); a **Cloud Function / Admin-SDK trigger** (a new infrastructure surface with its own
secrets, cost and runtime that this repository has never had and no phase authorises); doing nothing
(impossible — Firebase cannot revoke an Inventory AI session); and accepting long-lived sessions
(contradicts L-14).

## `checkRevoked` review (L-19)

> **SUPERSEDED BY AUTH-01 (recorded 2026-10-07). The shipped behaviour is `checkRevoked: true`** —
> `services/firebase/tokenVerifier.ts` passes it explicitly, as the approved target architecture §9/§10
> requires ("Firebase revocation checking is a security boundary"). The recommendation below is retained
> **unrewritten** as the L-19 review record and is **not current policy**; the availability trade-off it
> names is the accepted cost of that change. The same correction is made in `AUTH_SECURITY_MASTER_CHECKLIST.md`
> §23 and in design §14C.5.

**Recommendation: REMAIN `false`.** MongoDB `status` is checked **per request** by `requireAuth` and is
the revocation authority (L-9). Setting it `true` would add a network round trip to Google on **every**
exchange, fail closed when Google is unreachable (turning a Google outage into a total sign-in outage
for a system whose authority is MongoDB anyway), and **still not revoke a live Inventory AI session**,
because `requireAuth` never sees a Firebase token. Full tradeoff table at design §14C.5. The gap that
remains either way is stated plainly: **disabling a user in Firebase only does not stop their Inventory
AI session, and will not while Firebase is not the bearer credential.**

## The action-link live-test gate (L-17)

SDK support is confirmed from the **installed** `@react-native-firebase/auth@26.4.0` declarations
(`sendPasswordResetEmail` `lib/index.ts:1248`, `confirmPasswordReset` `:1071`,
`verifyPasswordResetCode` `:1522`, `sendEmailVerification` `:1742`, `updatePassword` `:1773`,
`ActionCodeSettings` `lib/types/auth.ts:344`, `ActionCodeURL` `lib/ActionCodeURL.ts:148`) — so **no
install or upgrade is required**. What is **UNVERIFIED and must be measured** is whether Firebase's
**hosted action handler** honours `handleCodeInApp` for a **password reset** and hands the `oobCode` to
a **custom scheme**; that is Firebase server-side behaviour configured partly in the **Console**, and no
repository evidence can settle it. **The Android side has a proven precedent** — Phase F2.9 runtime-
verified that `inventoryai://reset-password` renders on a real development build. **iOS cannot be
verified on the current Windows host** (`[EXTERNAL VERIFICATION REQUIRED]`). If custom-scheme delivery
fails, the fallback is a hosted continue URL (Universal Links / App Links), which Phase 27 deferred and
which needs a web domain plus association files — a **new infrastructure dependency** that must be an
explicit owner decision.

## N-2 — the action-link live test (2026-09-29): app side VERIFIED, Firebase side NOT

**Live verification phase.** No application code, test, dependency, configuration or deployment file
was changed, and the emulator that was started for the test was shut down afterwards and the machine
returned to its prior state. The full result table is design **§14C.4.1**.

**What was done.** The existing `InventoryAI` AVD (`emulator-5554`, SDK 35, x86_64) was booted and the
**installed development build** `com.inventoryai.app` (versionCode 1, targetSdk 36, `lastUpdateTime
2026-09-25 15:43` — the **Phase F2.9** build `f3038fa1-…`) was exercised by injecting deep links at the
OS level. **No build was created and no Firebase Console setting was read or changed.**

| Probe | Result |
| --- | --- |
| `inventoryai://reset-password` package resolution | **Resolves to `com.inventoryai.app/.MainActivity`** |
| Control: retired `com.inventoryai.app:/oauthredirect` | **`No activity found`** — independently re-confirms F2.9 |
| `…/reset-password?oobCode=PLACEHOLDER` | **Status: ok**; delivered in-app; **no browser, no Firebase error, no crash** |
| Screen after that delivery | **`Link incomplete` / `This reset link is missing its token.`** |
| Positive control `…/reset-password?token=PLACEHOLDER` | **The reset form rendered** (`Set a new password`, `New password *`, `Confirm new password *`) |
| Negative control `inventoryai://` | The **login screen** rendered |

**PASS for the app side**, and the placeholder was never rendered.

**★ The finding N-3 must carry.** The `oobCode` and `token` probes differ **only in the parameter name**
and land on **different branches of the same screen**, because the current `app/reset-password.tsx` reads
**`params.token`**. A Firebase-native link carrying `?oobCode=` therefore renders **"Link incomplete"**.
**Router-level delivery of `inventoryai://reset-password?oobCode=…` does not by itself reach the form**,
so N-3 must change the screen to read `oobCode` (and/or use the SDK's `ActionCodeURL`) or every Firebase
reset link dead-ends one screen short. This is a reproducible observation, not an inference.

**What it does NOT prove.** Every probe injected the URL **directly with `am start`**, so it tests the
**receiving** end only. Still UNVERIFIED: whether **Firebase's email actually contains a custom-scheme
URL**; whether **Firebase's hosted action handler consumes the link first** (the exact behaviour
`handleCodeInApp` is meant to change, and the point of the gate); the **Firebase error path** for an
expired or already-used code; and anything provider-specific.

**Why it stopped there.** The remaining half needs an **email inbox** and a **Firebase Console session**
(and a dedicated development account). This host has **no `firebase` CLI, no `gcloud` CLI**, no Console
credential and no mailbox access, so the reset email was **never triggered** — not because it failed,
but because the link it would produce cannot be retrieved here. **No success was simulated.**

**Consequences.** **L-17 is only HALF satisfied** — the *real device* half is verified **on an emulator only** (a physical
device, an OPPO CPH1969 / Android 11, was attached later in the session but has **no build installed**
and **no APK exists to install**, so the run was not repeated there), the *live Firebase project* half is
**not**, and **the gate stays open**. **N-3 must not be started on the strength of this result alone.** **iOS is entirely
`[EXTERNAL VERIFICATION REQUIRED]` and nothing about it was tested** — including whether the single-entry
`expo.scheme` registers, whether a URL routes to `/reset-password`, and whether any Firebase action-link
delivery works on a platform with no Universal Links, no associated domains and no AASA file. **No
hosted continue-URL fallback was implemented or prototyped** — it is indicated only if the Firebase-side
probes fail, and they were never performed; it remains the new infrastructure dependency design §14C.4
already records.

### N-3 — Firebase-native password recovery, shipped additively (2026-09-29)

**Mobile only. No server file, no route, no permission, no schema, no dependency, no environment
variable, no EAS configuration and no Firebase Console setting was changed.** The existing custom
recovery stack — both routes, the controller, the service, the reset-token model, the Resend mail layer
and their suites — is **untouched and still works**; N-3 adds the Firebase path beside it, and N-7 is the
phase that removes the other one.

**Files changed (mobile, 6):** `lib/firebase-native.ts` (two operation: `nativeSendPasswordResetEmail`
with the `ActionCodeSettings` prescription, and `nativeConfirmPasswordReset`; plus the deep-link and
package constants they use), `lib/firebase-auth.ts` (the two outcome-typed wrappers, the code tables and
their sentences), `app/forgot-password.tsx` (Firebase first, custom endpoint as the unconfigured-build
fallback), `app/reset-password.tsx` (`?oobCode=` → Firebase, `?token=` → the existing endpoint),
`__tests__/phase1-rnfirebase-foundation.test.ts` (the **deliberate, documented** relaxation of one verb)
and the two new suites. The `reset-password` refactor also removed a render branch that the parent made
unreachable — the form could not be mounted without a code.

**The SDK surface used:** `sendPasswordResetEmail(auth, email, actionCodeSettings)` and
`confirmPasswordReset(auth, oobCode, newPassword)` from `@react-native-firebase/auth@26.4.0`, reached
only through the gated lazy loader. The settings are
`{ url: 'inventoryai://reset-password', handleCodeInApp: true, android: { packageName:
'com.inventoryai.app', installApp: true }, iOS: { bundleId: 'com.inventoryai.app' } }`, and the suite
**pins them against `app.json`** so the declared deep link cannot drift from `expo.scheme` / the package
identifiers.

**Two verbs, not four.** The plan named four; `verifyPasswordResetCode` and `applyActionCode` were not
added because nothing would call them (dead code is forbidden, and an unusable code is already an
ordinary `invalid-code` outcome). **One verb relaxed, not a group:** `sendPasswordResetEmail` left the
Phase 1 `FORBIDDEN` map with the reason written in place; `sendSignInLinkToEmail`, the listeners,
`setPersistence`, `reauthenticateWith*`, the account-mutation verbs and the provider link/unlink verbs
are all still forbidden.

**★ Two security properties, implemented rather than intended.** *Enumeration resistance follows the
flow*: `auth/user-not-found` and `auth/user-disabled` are answered as SENT, because with enumeration
protection OFF those codes identify an address and a failure would rebuild the oracle the uniform 202
exists to prevent. *No fallback on redemption*: an action code is a Firebase credential, so failing to
redeem it can never license the custom endpoint — and `lib/firebase-auth.ts` imports no API module, so
that branch would need a new import to exist. The gate's own errors
(`auth/invalid-continue-uri` / `auth/unauthorized-continue-uri`) are named as a **configuration fault**
rather than "please try again", because retrying cannot fix a continue-URL refusal.

**Verification.** `mobile` Jest: **36 suites / 509 tests, 0 failures** (36 new tests in two new suites:
`__tests__/phaseN3-firebase-recovery.test.ts` and `__tests__/phaseN3-recovery-screens.test.tsx`);
`tsc --noEmit` clean; `eslint .` 0 findings. **Server suites were not run — no server file changed.**

**★ What the first pass could not verify, and what the later device run changed.** **No Firebase reset email was generated or
received in that pass**, and no live Firebase project had been exercised. That changed partially — see the runtime result below — so
**items 3, 6 and 7 of the phase's test list remain BLOCKED**. The blockers are external and unchanged from N-2
(no Firebase Console credential, no mailbox, no `firebase`/`gcloud` CLI), because delivery and link contents
can be confirmed only from the inbox. **L-17 stays OPEN — NARROWED by the runtime result below, not resolved**, so
**N-4 must not be started as though the Firebase-side half were proven.** iOS remains
`[EXTERNAL VERIFICATION REQUIRED]`.

**Consequence of the additive design, stated so it is not discovered later.** Because the client now
resets a password **through Firebase**, the server never learns of it: `passwordChangedAt` is not
stamped and no session is revoked, so an Inventory AI session held by someone else stays valid until it
expires. That is the credential-change bridge's job (design §14C.3 / **N-4**), which is designed and
**not implemented**; the reset screen carries the same note in place, and only the local session is
cleared. The custom flow still revokes server-side, exactly as before.

**Superseding observation about the device.** §27U's N-2 subsection records that the attached physical
device had no build and no APK existed. That is no longer true: `com.inventoryai.app` **is installed**
on `PV4DDMIZZLTCIVSK` (CPH1969, SDK 30, installed 2026-09-29 13:04:10), and APKs exist under
`mobile/.smoke/`. **That installed build was the `preview` APK (`4160dee1-…`, commit `4ca36c6`) — a release
build that embeds its bundle, so Metro cannot drive it.** `mobile/.smoke/f2-9-development.apk` was therefore installed over it **by owner decision**. The N-2 prose is not
rewritten; this paragraph supersedes only the availability claim.

### N-3 runtime result (2026-09-29, physical device, live Firebase project)

**Setup.** The F2.9 development APK installed on the CPH1969, Metro serving the N-3 working tree into it
(`Android Bundled … expo-router/entry.js`, 1591 modules), reachability proven by loading
`http://localhost:8081/status` **in the device's own browser** through an `adb reverse` tunnel (the host
LAN address is unreachable from the device, so the tunnel is the path). One root cause is worth keeping:
the deep link must be `exp+inventory-ai://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`,
and a **stray `\r` in the URL** made the first launch silently fall back to the cached bundle.

| Probe | Observed |
| --- | --- |
| `inventoryai://reset-password?oobCode=<placeholder>` | **The reset form renders** — `Set a new password` and both fields. The pre-N-3 bundle answered *"Link incomplete / missing its token"*, so **F-8 is CLOSED on the client side, on a device.** |
| `inventoryai://reset-password?token=<placeholder>` | The same form renders — the legacy 26B/27 path is intact on the same build. |
| `inventoryai://forgot-password` → Send for `jeffern1233@owner.com` | `Auth: sendPasswordResetEmail` → `FirebaseAuth: Password reset request …` → **`sendPasswordResetEmail:onComplete:success`**; screen showed *"Check your email"*, the fixed enumeration-resistant sentence and the new body copy. |
| `confirmPasswordReset` with an obviously fake code | `FirebaseAuthActionCodeException: The out of band code is invalid…` → screen showed **"This reset link is invalid or has expired. Request a new one."** |

**What this settles, and what it does not.** The project **accepted the custom-scheme `ActionCodeSettings`**
— no `auth/*-continue-uri` rejection — so that configuration question moved from "unknown" to "accepted
by the API", and the `invalid-code` classification is now runtime-proven end to end. **It does NOT settle
delivery or the email's contents:** `onComplete:success` is returned even for an address with no account
under email-enumeration protection, and the screen **deliberately cannot** distinguish "sent" from "no
such account". Whether the emailed link returns to the app carrying the code — the remaining half of
L-17 — is **still UNVERIFIED**, and items 6/7 remain blocked. **NARROWED, NOT CLOSED.**

**State left behind.** The device now carries the F2.9 development build instead of preview `4160dee1-…`
(reinstallable from its EAS artifact URL); Metro was left running on `:8081` because it is what loads this
code; **no source, configuration, dependency or Firebase Console setting was changed by the run**, no new
EAS build was created, no real `oobCode` was ever obtained or recorded, and the device's temporary UI
dumps were removed.

---

## Implementation order (design §14C.6)

**N-1** this decision record → **N-2** the action-link live test (first, because it can invalidate the
mobile half of the plan) → **N-3** mobile Firebase-native recovery, additive → **N-4** the revocation
bridge → **N-5** native change-password + email verification → **N-6** retire the legacy password path
→ **N-7** retire the custom recovery stack + the **entire mail layer** (Resend's only production
consumer is password recovery) → **N-8** re-scope the identity lifecycle → **N-9** invitation-based
onboarding → **N-10** final verification. **Add before remove**, so no capability is briefly absent.

**★ Two sequencing constraints that break real users if ignored.**

1. **N-9 must land with or before N-6.** `server/src/services/users.service.ts` `create` hashes a
   password into `passwordHash` and writes **no `firebaseUid`** (L144–L152). Once legacy login is gone,
   such an account has **no way in at all**. L-12/O-10 is therefore a hard prerequisite of retiring the
   legacy path, not a follow-up.
2. **N-3 and N-5 must move `mobile/__tests__/phase1-rnfirebase-foundation.test.ts`'s `FORBIDDEN` verb
   map deliberately.** It currently forbids `sendPasswordResetEmail`, `sendSignInLinkToEmail`,
   `updateEmail(`, `verifyBeforeUpdateEmail(` and `deleteUser(` inside the native boundary. Three of
   those are exactly what the phases need. Changing the guard **is part of the work** — the guard exists
   so that "not yet" cannot drift into "accidentally", and a phase declares the verbs it now owns by
   moving them.

**Coexistence is a transition state, not a destination.** Design §14.1's standing warning still holds
while both reset systems exist — *"a password can be reset through one system and not the other"* — so
the plan closes in a definite direction rather than settling into permanent dual operation.

## Findings recorded

| # | Finding |
| --- | --- |
| **F-1** | A Firebase-native reset **revokes nothing** without the bridge (design §14C.3). |
| **F-2** | A client-side reset never reaches the server, so any future server-side consequence of a credential change must be **re-established explicitly** rather than inherited from 26B/27. |
| **F-3** | **Enumeration resistance relocates to Firebase.** The uniform-202 property is genuinely lost for a client-SDK call — a **relocation, not a new hole**, since an attacker can call the SDK directly with the public API key regardless — but the project's own guarantee no longer exists. |
| **F-4** | `users.service.create` produces an **unauthenticatable** account under Firebase-only (F-4 above / N-9). |
| **F-5** | Removing the recovery endpoints **deletes the subject matter of B2**. **E3 survives** for the remaining limiters, and **no shared store is introduced in either direction**. |
| **F-6** | `User.emailVerified` is written **only** at exchange/link/register time, so it is stale between those events — which matters once L-6/L-7 make a decision from it (**OD-3**). |
| **F-7** | **No live Firebase project has ever been exercised** for Phases 32B–32L, so none of this can be runtime-claimed. |

## Open decisions and blockers (design §14C.7)

**Decisions:** **OD-1** the bridge's name/shape · **OD-2** does unlink survive at all (Policy B's
destination disappears — blocks N-8) — **PARTLY ANSWERED 2026-10-01 (`Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`), matching
design §14C.7 OD-2:** the server-side ability to unlink was **removed outright** and the operation
**re-scoped into a credential change** (roadmap §27AA), so "remove unlink entirely" is what shipped at the
server; what stays open is only the **Firebase-side** provider unlink the server cannot observe. **This is a
historical/partial disposition, not an instruction to implement the removed route.** · **OD-3** `emailVerified` enforcement mechanics — **RESOLVED
2026-09-29 (§27V / design §14C.9)** · **OD-4** the invitation model (O-10 — blocks N-9 and therefore
N-6) · **OD-5** the 26B/27 artefact disposition
(deleted vs archived) · **OD-6** whether `/firebase/link` survives · **OD-7** whether `/register` is
removed outright or kept for an unconfigured build · **OD-8** Facebook (O-5) and Apple, untouched by
this design.
**Blockers:** **B-1** no live Firebase project ever exercised · **B-2** the action-link return leg is
UNVERIFIED · **B-3** iOS requires macOS · **B-4** the mobile Jest config mocks nothing Firebase-related
(design §19) · **B-5** `test:db` and the full suite must be re-run per step, and several guards fail by
**declaration** (the Phase 23 route classifier) so they must change in the same commit as the route
they describe.

**Closed or advanced by this phase:** **O-8** (Firebase takes over recovery — resolved), **O-9**
(compensating bridge — resolved in design), **O-3** (direction locked by this section, **mechanics
decided 2026-09-29 — §27V / design §14C.9**), **O-10** (direction locked, implementation open). **Gate 1** and **O-6** cease to apply to the mocked
population. **Untouched:** O-5, O-11.

## Verification

Documentation-only, so the verification is a documentation check rather than a test run: the complete
`git diff` reviewed, `git diff --check` clean, `git diff --stat` confirming **no source, test, schema,
config or environment file in the change set**, the protected five files **byte-identical to `HEAD`**,
and `.freebuff/` and the WIP backup preserved. **No test suite was run, because no executable file
changed** — and no test count is claimed or advanced by this phase.

## Documentation

- `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` — **new §14C** (locked decisions, target
  architecture, the revocation bridge, the action-link gate, the `checkRevoked` review, order plan,
  open decisions, and what is not authorised); **§14A.5** rows O-3 / O-8 / O-9 / O-10 annotated;
  **§18 Gate 1** reconciled and Gate 2 noted as satisfied in practice; **§14.1**'s "still open"
  paragraph answered; **§21** reconciled.
- `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` — **new §39**; §11, §22, §23, §27, §G-5 and "Decision
  Required" reconciled.
- `docs/SYSTEM_SPECIFICATION.md` **§29** — the authentication section reconciled to the locked
  direction, including the explicit statement that the legacy credential is on a retirement path and
  that nothing has been removed yet.
- `CLAUDE.md` §2 — the authentication paragraph corrected (it still stated that Google Sign-In and
  account unlinking were not implemented, which Phases C and 32L superseded) and the Firebase-only
  direction recorded.
- `README.md` — the phase list gains this entry.
- **No historical record, snapshot, test-count figure or phase section was rewritten**, and **no file was
  deleted**. The §14.1 guard, the 26B/27 endpoints, the reset-token model and the Resend mail layer all
  remain exactly as they shipped; the design documents a later retirement, it does not perform one.

---

# 27V. Phase 32O — Registration & Email-Verification Decisions (documentation only)

**Documentation only.** No application, mobile or server source, test, dependency, schema, environment
variable, Firebase Console setting, EAS configuration or deployment change was made by this phase. The
authoritative record is `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.9**; the
security-record counterpart is `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` **§39**.

**Phase identifier.** `32O` is assigned **by this record**, exactly as §27U's `32N` is. If the owner
prefers another identifier the record is renumbered rather than split.

## What shipped

Nothing executable. One design subsection (§14C.9), one checklist subsection plus its §39 additions,
this roadmap section, and reconciled pointers in the specification, `CLAUDE.md` and `README.md`.

## Why it exists

§27U locked the **direction** (L-1…L-19) and designed the **credential-change bridge**, and left
**OD-3 — the `emailVerified` enforcement mechanics (L-6, L-7) — OPEN**. The **read-only
registration/sign-up audit** of 2026-09-29 found the shipped flow creates the `Business` and the `User`
**immediately** and mints the session with **no verification step at all**, and asked five questions
the earlier record did not answer (**D-5…D-9**). This phase answers them.

## The fifteen locked registration decisions (RG-1…RG-15)

Design **§14C.9**: the registration **order is the mechanism** — Firebase account → **verification
email** → the user verifies → `reload()` confirms `emailVerified === true` → **only then** the `User`
**and** `Business` are created together (OWNER, `User.businessId` still required) → Inventory AI JWT +
session → main app (**RG-1…RG-4**). **No JWT, no session, no `User` and no `Business` before
verification** (**RG-2/RG-3**). **Firebase UID is the only** Firebase→MongoDB identity join key and
email is **never** one (**RG-5**). MongoDB stays authoritative for `businessId`, `role`, `status`,
permissions and lifecycle (**RG-6**). **`requireAuth` is NOT modified** (**RG-7**). An unverified
Google identity is **refused** by the signed `email_verified` claim, not by the provider name
(**RG-11**). Resend is **native Firebase Auth** with no custom verification-token or mail system
(**RG-12**). `User.emailVerified` is persisted after verified registration and **no per-request
Firebase call** is added (**RG-10**). The legacy `/api/auth/register` path stays **transitional**
until N-6 and is not weakened for this (**RG-14**). No custom claims, Firestore, tenant-less users,
email-based linking, new provider architecture or new mail infrastructure (**RG-15**).

## The gate, and why `requireAuth` is untouched

**The gate is the ordering, not a conditional.** An unverified identity has nothing to authenticate
against — no `Business`, no `User`, hence no session, no token and no authenticated route — and a
signed-in-but-unverified identity is held on a **client verify screen** that can resend. A check inside
`requireAuth` was rejected for two independent reasons: it would change the Phase 23/24 authorization
order and status-code contract §20 freezes, and it would **strand every already-shipped client**,
because a server-side check cannot be deployed in lockstep with the builds it would reject. The
consequence is recorded rather than glossed: **the gate applies at registration time**, and
`User.emailVerified` (written only at exchange/link/register time — finding **F-6**) is not refreshed
per request, so a later Firebase-side change is not reflected on an existing session.

## Verification-link return (RG-13)

**Selected: the Inventory AI return/deep-link flow**, because it needs no new infrastructure — one
`inventoryai` scheme, Expo-Router path routing, and the `ActionCodeSettings` shape the live project
already **accepted** during N-3. **Recorded fallback: the Firebase-hosted verification page followed by
app `reload()`**, which needs no continue-URL acceptance at all and works identically with RG-9's
refresh. **The selection inherits L-17's open gate** — the *mobile/OS* half is verified, the **Firebase
email half has never been exercised** — and, unlike recovery, an unverified user has **no fallback
capability**, which is why the hosted page stays a live alternative rather than being discarded.
**Neither shape is implemented.**

## Findings recorded from source

| # | Finding |
| --- | --- |
| **F-14** | `nativeCurrentIdToken()` calls `user.getIdToken()` with **no argument**, so it returns the **cached** token and refreshes only near expiry — a token minted *before* verification can still carry `email_verified: false`. **RG-9 requires a forced refresh** (`getIdToken(true)`): a boundary-module change, **not** a guard change. |
| **F-15** | `sendEmailVerification` and `reload` are **not** in the Phase 1 `FORBIDDEN` verb map, so **N-5 owes no N-3-style relaxation** — recorded so an implementer does not assume an edit is owed. |
| **F-16** | **No verify screen and no verification gate exist today.** `mobile/app/` has no `verify-email`, the only `(app)` guard is `status !== 'signedIn' ⇒ /login`, and `firebaseAuth.service.ts` states in place that it persists `emailVerified` and **does not enforce** it. |

## Where this leaves the plan (design §14C.6)

**N-5 remains unauthorised.** Its *mechanics* are now decided, but it still depends on **N-4** (the
revocation bridge) and, for the delivery half, on **B-2/L-17**. **No phase was started, and none is
authorised by this record.**

## Files reconciled

- `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` — **new §14C.9**; the **§14C.7 OD-3** row resolved; the **§14C.6 N-5** row and the **§14A.5 O-3** row annotated; the §14C.7 “items this migration closes” sentence corrected.
- `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` — **§39** gains the registration subsection and findings **F-14…F-16**, with the **O-3**, **G-5** and **Decision Required** rows reconciled.
- `docs/SYSTEM_SPECIFICATION.md` **§29** — the `emailVerified` mechanics paragraph now states the decided flow.
- `CLAUDE.md` §2 and `README.md` — the phase entries gain this record.
- **No historical record, snapshot, test-count figure or phase section was rewritten**, and **no file was deleted**. The legacy register path, the 26B/27 recovery stack, the reset-token model and the Resend mail layer all remain exactly as they shipped.

---

# 27W. Phase 32P — N-4 D2 (the recovery-context bridge caller) decision record (documentation only)

**Documentation only.** No application, mobile or server source, test, dependency, schema, environment
variable, Firebase Console setting, EAS configuration or deployment change was made by this phase. The
authoritative record is `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.3.8**; the
security-record counterpart is `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` **§39**.

**Phase identifier.** `32P` is assigned **by this record**, exactly as §27U's `32N` and §27V's `32O`
are. If the owner prefers another identifier the record is renumbered rather than split.

## What shipped

Nothing executable. One design subsection (§14C.3.8), one checklist subsection plus its §39 additions,
this roadmap section, and reconciled pointers in the specification, `CLAUDE.md` and `README.md`.

## The gap this closes (D2)

The N-4 bridge (`POST /api/auth/credentials-changed`) is an **authenticated** route — it needs a live
Inventory AI session, which is correct for the in-app password **change** and **unsatisfiable for the
primary password-reset flow**. `forgot-password` and `reset-password` are **public** screens outside
`(app)`, the reset completes entirely inside Firebase, and the reset screen clears the local session
before returning to Login (Phase 27, N-3). So at the instant the password actually changes the caller
holds **no** session and **cannot reach the bridge** — a Firebase-native reset would have revoked
**nothing**, leaving every prior session (including one an attacker opened with the compromised
password) alive. That is **D2**. It was raised in the N-4 preflight and was **undocumented anywhere in
this repository** until this record.

## The approved recovery sequence — locked

The resolution is **not** to relax the bridge's authentication but to **establish an authenticated
context first**, using only endpoints that already exist or are already designed:

```text
1  Mobile        Forgot Password (PUBLIC screen, outside (app))
2  Firebase      sendPasswordResetEmail → the user opens the emailed link
3  Firebase      confirmPasswordReset(oobCode, newPassword)     credential changes INSIDE Firebase
4  Mobile        signed out; local session cleared; back to Login   (Phase 27 / N-3)
5  Mobile        sign IN AGAIN with the NEW password → a FRESH Firebase ID token with a fresh
                 signed `auth_time`
6  Inventory AI  POST /api/auth/firebase/exchange  { idToken }   PUBLIC
                 → the RECOVERY-CONTEXT session (temporary, by design)
7  Inventory AI  POST /api/auth/credentials-changed  { freshIdToken }
                 requireAuth → uid binding → 300 s auth_time freshness
                 → passwordChangedAt = now  ;  revokeAllSessions()   ALL sessions die, incl. step 6's
8  Inventory AI  POST /api/auth/firebase/exchange  { idToken }   PUBLIC
                 → the FINAL session: a new JWT whose iat >= changedAtSec
9  Client        stores the FINAL session; signed in, and the old sessions are gone
```

**Step 5 is load-bearing twice over:** it produces the **fresh signed `auth_time`** the bridge's
freshness check demands (a stale pre-reset token would be refused `409
FIREBASE_REAUTHENTICATION_REQUIRED`), and it re-establishes the Firebase session the exchange consumes.
A reset does not sign the user in — `confirmPasswordReset` changes the credential and nothing else.

## Temporary versus final session

**The distinction is required**, because a reset begins with no session at all:

- **The recovery-context session (step 6)** is an ordinary Inventory AI JWT + `sessions` row minted by
  the **existing PUBLIC exchange**. It is **temporary by design**, is **expected to be revoked by step
  7**, and **no client may treat it as final or present it afterwards**. It is **not** a new kind of
  session: no “recovery” flag, no new field, no model change — the distinction lives in the **flow**,
  which is why §20's frozen session surface is untouched.
- **The final session (step 8)** is the only session that survives, valid because it is minted **after**
  the stamp (`iat >= changedAtSec`) — the property §14C.3.4 already relies on.
- **Neither is a Firebase ID token**, which is only ever the credential *presented to* the exchange and
  the bridge, never the bearer credential of an ordinary API call.

## Why the old sessions cannot survive by accident

Two independent mechanisms, both already designed, and **D2 changes neither**:

1. `revokeAllSessions({ userId, businessId, now })` is an **unconditional `updateMany({ userId,
   revokedAt: null })`** with **no caller exception** — it revokes the recovery-context session *and*
   every pre-reset session.
2. `passwordChangedAt = now` refuses, in `requireAuth`, any token minted **strictly before** the stamp.

So **the flow is complete only after step 8**: a client that stops at step 7 has revoked everything
*and* signed itself out — **loud and recoverable**, never silent — and a client must not skip step 7
merely because it holds a step-6 session, which is an artefact of the recovery rather than evidence
that revocation is unnecessary.

## Still binding (restated, not newly decided)

`passwordChangedAt` **and** `revokeAllSessions()` remain the **N-4 invariant**; a Firebase ID token is
**never** the application's permanent bearer credential; the **Firebase UID → MongoDB `User`** mapping
stays authoritative (`verifyFirebaseIdToken(idToken).uid` must equal
`User.findById(req.user.id).firebaseUid`); **no public unauthenticated `credentials-changed` endpoint**
is introduced; and **no Cloud Function / Admin-SDK trigger** is introduced — both §14C.3.6 rejections
**stand unchanged**, because D2 is solved by establishing context, not by weakening the bridge.

## Findings recorded

| # | Finding |
| --- | --- |
| **F-17** | The reset-flow bridge call is bounded by the **300 s** freshness window and it must **not** be widened for recovery: a slow user gets `409 FIREBASE_REAUTHENTICATION_REQUIRED` and the correct response is to sign in again. The **lost-response** rule also now covers recovery — a retry arrives with the stale pre-bridge token and is answered `401 SESSION_INVALIDATED`, which is **success-equivalent** and must proceed to the re-exchange (still to be pinned by a test). *(**Pinned 2026-10-07 (C4-11):** the second half of this finding is no longer owed — the pin now exists as `mobile/__tests__/phaseN4-recovery-handoff.test.tsx`, the case "treats a 401 SESSION_INVALIDATED as SUCCESS-EQUIVALENT and clears the marker", which asserts the marker is cleared, the flow proceeds to the re-exchange and the final session is applied.)* |
| **F-18** | **D2's one remaining piece is the trigger**, recorded as **OD-9** rather than chosen silently: how the client knows, at the post-reset sign-in, that it must run the bridge. Constraints: not a public/unauthenticated route; no client-supplied value steering a bridge call against an account (`req.user.id` only); no session minted outside `POST /api/auth/firebase/exchange`; no new `sessions`/`User` field without a separately-approved phase; and skipping the bridge must be **impossible or detectable**. *(**Superseded 2026-09-29 (Phase 32Q, §27X):** the trigger is now **LOCKED** — the durable, non-secret recovery marker, **M-1…M-10**, which satisfies each constraint listed here.)* |

## Where this leaves the plan (design §14C.6)

**N-4 remains unauthorised.** Its reachability question is now **answered** and its name/shape is still
**OD-1**; the recovery trigger is **OD-9** *(**LOCKED 2026-09-29 — Phase 32Q, §27X**: a durable non-secret recovery marker; this sentence is the Phase 32P record and is not rewritten)*; **L-17 remains OPEN** and unchanged. **No phase was started,
and none is authorised by this record.**

> **Annotated 2026-10-09 — the bridge that this record describes as "still not implemented" now exists.**
> The record above was accurate when written: its commit `025ce11` is timestamped **2026-09-29 21:19**, and
> the bridge landed **30 minutes later** in **`703a9da`** ("feat: add server-side credential-change bridge",
> **2026-09-29 21:49**) — `server/src/services/credentialsChanged.service.ts` and the authenticated
> **`POST /api/auth/credentials-changed`**, exercised by `server/test/phaseN4-credentials-changed.test.mjs`
> and the `phaseN4-*` mobile suites. The sentences above are the historical Phase 32P record and are **not
> rewritten**; they should be read as superseded on the implementation question only. **L-17 and OD-10
> remain OPEN** exactly as recorded here, and "N-4 remains unauthorised" is likewise unchanged — the bridge
> shipped, the *authorisation* question this record answers is a separate one.

## Files reconciled

- `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` — **new §14C.3.8**; the **§14C.3.1** annotation; the **§14C.6 N-4** row annotated; **OD-9** added to §14C.7.
- `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` — **§39** gains the D2 subsection with findings **F-17/F-18**, plus the title, **G-5** and **Decision Required** register mentions of **OD-9**.
- `docs/SYSTEM_SPECIFICATION.md` **§29** — the bridge paragraph now states the resolved reset-path sequence.
- `CLAUDE.md` §2 and `README.md` — the phase entries gain this record.
- **No historical record, snapshot, test-count figure or phase section was rewritten**, and **no file was deleted**. `middlewares/authenticate.ts`, the session model/service, the exchange, the bridge's design and every existing route are **unchanged** — and the bridge itself is still **not implemented**.

---

# 27X. Phase 32Q — OD-9 LOCKED: the automatic recovery marker (documentation only)

**Documentation only.** No application, mobile or server source, test, dependency, schema, environment
variable, Firebase Console setting, EAS configuration or deployment change was made by this phase. The
authoritative record is `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.3.9**
(**M-1…M-10**); the security-record counterpart is `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` **§39**.

**Phase identifier.** `32Q` is assigned **by this record**, exactly as §27U's `32N`, §27V's `32O` and
§27W's `32P` are. If the owner prefers another identifier the record is renumbered rather than split.

## What shipped

Nothing executable. One design subsection (§14C.3.9), one checklist subsection plus its §39 additions,
this roadmap section, and reconciled pointers in the specification, `CLAUDE.md` and `README.md`.

## What it closes

§27W closed **D2**'s architecture and left exactly one question open, named **OD-9**: how the client
knows, at the post-reset sign-in, that it must run the bridge. It is now **LOCKED** as **M-1…M-10**.

## The locked decision, in one paragraph each

**M-1/M-2 — the marker.** A **durable, non-secret** marker in `expo-secure-store` under
**`inventoryai.auth.passwordResetPending`**, holding **only an account fingerprint**, created with
**`verifyPasswordResetCode(oobCode)`** (present natively on Android and iOS; returns the account's
**email**). The email is **memory-only** — used for the automatic sign-in and the fingerprint, and
**never** an authorization source. Nothing secret is stored: not a password, an `oobCode`, a Firebase ID
token, an Inventory AI JWT, a `userId`, a `businessId`, a `role` or tenant data.

**M-3/M-4/M-5 — the approved sequence.** `verifyPasswordResetCode → write marker →
confirmPasswordReset → signInWithEmail → temporary public exchange → credentials-changed →
revokeAllSessions → final public exchange → applySession(final)`. The temporary session is **held only
in a local variable** — never persisted, never applied, never navigated with, never in route params —
and `revokeAllSessions()` revokes it with every other active session because it has **no caller
exception**. A `401 SESSION_INVALIDATED` from a retry after a previously successful bridge is
**success-equivalent**: clear the marker and continue to the final exchange.

**M-6 — lifecycle.** Created **before** the password-change operation; cleared after a successful bridge
acknowledgement or `401 SESSION_INVALIDATED`; **kept** on `409 FIREBASE_REAUTHENTICATION_REQUIRED` and
on transport failure; **never consumed on a fingerprint mismatch**; and the **legacy `?token=` recovery
never creates it**, because that server flow already revokes.

**M-7/M-8 — the honest limits.** A reset on **Device A** followed by the first password sign-in on
**Device B** is **not detectable** by this device-local marker, so **OD-9 is not a universal
cross-device revocation guarantee** — it closes D2 for the completing device and that device's later
sign-ins. **Option E** (server-side `passwordUpdatedAt` derivation) would close that residue but is a
partial N-4 redesign — a `User` field plus a Google round trip on the sign-in path — so it is
**DEFERRED as a separate owner decision** — now **OD-10** in design §14C.7 — and **nothing of it is introduced**.

**M-9/M-10 — nothing else moves.** `requireAuth`, `passwordChangedAt`, `revokeAllSessions()`, the
UID→Mongo `User` mapping, Mongo business/role authority and the JWT/session architecture are
**unchanged**; **no new session type or session field** is introduced. **L-17 stays OPEN** as the
end-to-end gate and **gains one requirement**: the live device test must confirm
**`verifyPasswordResetCode()` returns the correct email and does not consume the reset code**.

## Findings recorded

| # | Finding |
| --- | --- |
| **F-19** | The marker is **device-local**, so D2 retains one residue no client-side mechanism can close (M-7). |
| **F-20** | **Option E** is the only identified way to close F-19 without the forbidden constructs, but it costs a `User` field and an extra Admin lookup and would make the bridge largely redundant. **Deferred, not adopted.** |
| **F-21** | **`verifyPasswordResetCode` is a new runtime dependency of the design.** It is present on Android and iOS in the installed SDK, but **its non-destructiveness has never been exercised against a live project** — which is why M-10 adds it to L-17. |
| **F-22** | **A forced token refresh must never be substituted for the recovery sign-in.** `getIdToken(true)` moves `iat` but **leaves `auth_time` alone**, so it satisfies neither the bridge's 300 s freshness check nor the "authenticated with the NEW password" premise. |

## Where this leaves the plan (design §14C.6)

**N-4 remains unauthorised.** Its architecture (D2) and now its trigger (OD-9) are both decided; the
bridge's name/shape is still **OD-1**, **L-17 remains OPEN**, and**Option E — now **OD-10** — plus the cross-device residue (F-19)** are recorded as open owner items. **No phase was started, and none is authorised by
this record.**

## Files reconciled

- `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` — **new §14C.3.9**; the **§14C.7 OD-9** row resolved; the **§14C.4** (L-17) gate annotated with its added requirement.
- `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` — **§39** gains the OD-9 subsection and findings **F-19…F-22**, with the title, **G-5** and **Decision Required** register mentions reconciled.
- `docs/SYSTEM_SPECIFICATION.md` **§29** — the bridge paragraph now states the locked marker and its limits.
- `CLAUDE.md` §2 and `README.md` — the phase entries gain this record.
- **No historical record, snapshot, test-count figure or phase section was rewritten**, and **no file was deleted**. `requireAuth`, the session model/service, the bridge's design, the recovery screen and every existing route are **unchanged** — and the bridge itself is still **not implemented**. *(**Annotated 2026-10-09:** this was true when written; the bridge shipped the same day in `703a9da`. See the §27W annotation and §27AE.)*

---

# 27Y. AUTH-04 — the custom 6-digit email-verification code flow (documentation supersession)

**Documentation only.** No application, mobile or server source, test, dependency, schema, index,
environment variable, Firebase Console setting, EAS configuration or deployment change was made for this
record, and no secret value is recorded. It supersedes the Firebase verification-link/resend
*mechanism* selected by the design authority §14C.9.

## What changed

Email verification moves from **Firebase's own verification email/link plus native resend** to a
**custom 6-digit Inventory AI verification code delivered through the provider-agnostic mail boundary (Brevo / Resend)**, with Firebase Admin
`updateUser(uid, { emailVerified: true })` setting the final Firebase verification state. Firebase
remains the identity provider; MongoDB remains the application authority; `requireAuth` is unchanged;
the Inventory JWT/session is unchanged; Firebase UID remains the only join key and email is never a
join key.

## Locked design (design authority §14C.10, AD-1…AD-19)

CSPRNG 6-digit code · HMAC-SHA256 with domain separation (`codeHmac`/`emailHmac`) · required
`EMAIL_VERIFICATION_CODE_PEPPER` (503 `EMAIL_VERIFICATION_NOT_CONFIGURED`, no unkeyed fallback,
production fail-fast) · 10-minute expiry · 5 attempts · 60-second resend cooldown · one active challenge
per uid in `email_verification_challenges` · unique `{uid}` index + TTL `{expiresAt}` index (cleanup
only) · atomic supersession · atomic attempt reservation · write-first/consume-second with `usedAt`
never unset · concurrency-safe confirmation · already-verified idempotency · no plaintext
code/email/pepper storage or logging · allowlisted structured logging.

## API contract

Two **pre-session Firebase-authenticated** (not public) endpoints —
`POST /api/auth/email-verification/request { idToken }` and
`POST /api/auth/email-verification/confirm { idToken, code }` — no `requireAuth`, no Inventory session,
no client-controlled uid/email/userId/businessId/role. Error codes are recorded in design authority
§14C.10.

## Status (AUTH-04-H close-out, 2026-10-04)

**SHIPPED.** AUTH-04-A through AUTH-04-F are shipped; **AUTH-04-G PASSED its live end-to-end acceptance
gate on 2026-10-04 (Brevo)**; **AUTH-04-H** is this documentation close-out. The custom 6-digit flow is
the shipped mechanism and the Firebase verification-link flow is no longer the current path.

**Brevo / Resend.** The AUTH-04 delivery path runs through the provider-agnostic mail boundary. **Brevo
is a supported provider and was the provider used for the AUTH-04-G live acceptance; Resend remains a
supported provider.** `MAIL_PROVIDER` selects between them; `server/.env.example` documents both.

**AUTH-04-G live acceptance (2026-10-04, Brevo).** Safe, non-secret evidence: request **HTTP 200** with
the exact success envelope; Brevo **`sent`** → **`delivered`**; confirmation **HTTP 200** with
**`Email verified.`**; Firebase `emailVerified` **false → true**; Mongo challenge **consumed** (`usedAt`
set, one attempt spent); safe-log checks passed (no code, HMAC, token, API key, address, URI or pepper).

## Resolved decision

**Restart while unverified** is **closed by the shipped AUTH-04-F behaviour**: on restart, when no
Inventory AI session token exists, the native Firebase identity is probed **read-only**; an **unverified**
identity **resumes the verification screen**, a **verified** identity goes to **Login** for a user-driven
exchange, and a **probe failure** produces the unreachable verification state. The probe performs **no
automatic sign-in, exchange or session restoration**.

## Files reconciled

`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` (§14C.9 RG-12/RG-13 annotated;
**§14C.10** added), `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` (§9 and §39 annotated; **§40** added),
`docs/AUTHENTICATION_AND_USER_VERIFICATION_TARGET_ARCHITECTURE.md` (§6, §7, §44),
`server/.env.example` (`EMAIL_VERIFICATION_CODE_PEPPER` name added). **Also reconciled by AUTH-04-H (2026-10-04):**
`CLAUDE.md`, `README.md`.

---

# 27Z. Phase C3 — the mobile sign-in vocabulary standard and the widened local-password gate (presentation only)

**Presentation and gating only.** No server file, route, permission, role grant, session, schema, index,
environment variable, dependency, EAS configuration or deployment setting changed, and **no new
authentication capability was added**. The server remains the security boundary in every case below; this
record documents the words the app uses and the condition under which it offers a local password action.
Shipped in commit `ca0d4ae` — `refactor: standardise the mobile sign-in vocabulary and gate local password
actions` — 7 files, +312/−59.

## 1. The vocabulary standard

The Profile identity area is now a **"Sign-in methods"** section that states what it is for ("Manage the
ways you can sign in to your Inventory AI account.") and names each method in the user's terms rather than
the implementation's:

| Surface | Shipped wording |
| --- | --- |
| Local credential | **"Email & Password"** with the existing **"Change password"** action |
| No identity attached | **"Google sign-in"** — "Use your Google account to sign in to Inventory AI." — action **"Add Google sign-in"** |
| Credential held by the sign-in provider | **"Change sign-in password"**, and the same title on the `disconnect-firebase` screen in `mobile/app/(app)/_layout.tsx` |

A separate **"Security"** card now holds the device-storage statement and the **"Active sessions"** entry,
so the sign-in vocabulary is no longer mixed with storage and session hygiene.

## 2. The rules the wording is held to

- **An action is named for the person, not the implementation.** "Add Google sign-in", **never** "Connect
  Google" as the app-facing action.
- **"Disconnect Firebase" is retired and must not return.** That action was re-scoped into a password
  change by Phase A / F-1; no Profile surface may carry the substring `disconnect` at all.
- **No provider is named where the capability block does not establish which provider is involved.**
  `authMethods` publishes a capability rather than the identity behind it, so a provider-held credential
  could be Google **or** a Firebase email/password identity and the app cannot tell them apart. For
  `{ password: false, firebase: true }` the rendered surface must contain neither `google` nor `firebase`.

## 3. The widened gate

The shipped condition is exactly:

```ts
user?.authMethods?.password === false || user?.authMethods?.firebase === true
```

The first half is Phase 32K's condition (§27M) — `password: false` is the server saying the local
credential cannot authenticate. The second half is defensive, and it is the point of the pass:
`{ password: true, firebase: true }` describes a **legacy password account that later attached a Firebase
identity**, and for it the server keeps the `passwordHash` while `loginWithPassword` refuses the account
with 403 `FIREBASE_SIGN_IN_REQUIRED` (Phase 32E, §27H) and `/change-password` answers 409
`PASSWORD_NOT_APPLICABLE` (Phase 32K) **before** any hash comparison. The retained hash is inert, so the
account has no local password to manage, and offering the action could only produce an error.

**Capability is not credential existence.** `authMethodsFor` (`server/src/services/auth.service.ts:230`)
derives `{ password: !firebaseUid, firebase: Boolean(firebaseUid) }`, so the current server produces only
`{ true, false }` and `{ false, true }`; the widened branch covers a shape the server does not produce
today. `password: false` does **not** mean "no credential exists" — a Firebase-linked account still
retains its legacy hash.

| Account | Password authority | Local password action offered |
| --- | --- | --- |
| Mongo-only (`firebaseUid` absent) | Local bcrypt hash | Yes |
| Firebase-linked legacy (`{ password: true, firebase: true }`) | Firebase | No — provider-managed line |
| Firebase-native / provider-held (`{ password: false, firebase: true }`) | Firebase | No — provider-managed line |
| User object without `authMethods` (older server) | Unchanged | Yes — historical behaviour preserved |

Both halves are tested with `===`, so an older server's user object — one without `authMethods` at all —
keeps the historical behaviour rather than losing the control.

## 4. What was deliberately NOT done

- **No authentication capability was added and no server guard changed.** 403 `FIREBASE_SIGN_IN_REQUIRED`,
  409 `PASSWORD_NOT_APPLICABLE`, `requireAuth`, the session model and the RBAC matrix are exactly as Phases
  32E and 32K left them; no server file was touched by this pass.
- **No credential was deleted or re-enabled.** The retained `passwordHash` stays retained and inert, and
  the unlink / last-authentication-method disposition remains Phase 32L's **Policy B** (§27Q).
  *(**Annotated 2026-10-01 — `Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`:** the Phase 32L
  unlink capability this line defers to was **REMOVED**, not deprecated, and the operation was re-scoped
  into a credential change — so no reachable path clears `firebaseUid`. The Policy B measurements remain
  valid history. See the Phase F-1 correction in `CLAUDE.md` and
  `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §8.)*
- **The gate is not a security control.** It only stops the UI offering an action the server would refuse;
  the server refuses it regardless, and the screen re-checks the same capability.

## Verification

- **Mobile:** the four focused suites — `auth-terminology-standard`, `phase32k-password-capability-gating`,
  `phase32m-connect-google-profile`, `phaseA-change-password-screen` — **4 suites / 29 tests, 0 fail**;
  full `npx jest` — **47 suites / 644 tests, 0 fail**; `tsc --noEmit` and `eslint .` clean.
- **New suite:** `mobile/__tests__/auth-terminology-standard.test.tsx` (182 lines, 5 cases) pins the
  vocabulary and the two rules above, including that the provider-held surface names neither provider.
- **No server suite was run for this pass**, because no server file changed.

> **Cross-reference added 2026-10-07 (Phase C3).** The Phase 32K gate sentence at §27M — "The test is
> `=== false`, not falsiness" — is **not rewritten**; it is annotated as widened. See the annotation in
> §27M and §41 of `docs/AUTH_SECURITY_MASTER_CHECKLIST.md`.

---

# 27AA. Phase A / F-1 — removal and re-scope of the Firebase unlink capability (retrospective record)

**Retrospective documentation record.** This section records a change that shipped on **2026-10-01** in
commit **`6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`** ("feat: re-scope Firebase disconnect into a password
change (Phase A / F-1)"). It is written **after** §27Z even though it **predates** §27Z, §27Y and their
neighbours, because the roadmap had **no section recording it** while §27K–§27Z each record a sibling
phase. **Nothing was renumbered:** the section takes the next lettered slot and says so here rather than
being back-dated into the sequence.

## What was removed

**The server-side Firebase unlink capability was REMOVED, not deprecated.** `POST
/api/auth/firebase/unlink` and the path that served it no longer exist in the committed tree.

- **Deleted:** `server/src/services/firebaseUnlink.service.ts` (402 lines), its DB-backed suite
  `server/test/phase32l-firebase-unlink.test.mjs` (1,423 lines), and the mobile suite
  `mobile/__tests__/phase32l-b-disconnect-session.test.tsx` (559 lines).
- **Modified / re-scoped:** `server/src/routes/auth.routes.ts` (the route),
  `server/src/controllers/firebaseAuth.controller.ts` (the controller handler),
  `server/src/utils/validate.ts` (the payload validator), `server/src/constants/audit.ts` (both audit
  actions — `FIREBASE_IDENTITY_UNLINKED` and `FIREBASE_IDENTITY_UNLINK_CONFLICT` are no longer declared),
  `mobile/lib/api.ts` (the `firebaseUnlink` wrapper), `mobile/app/(app)/disconnect-firebase.tsx`,
  `mobile/lib/auth.tsx` and `mobile/lib/firebase-native.ts` (the client unlink surface).
- **Added:** `server/test/phaseA-credential-authority.test.mjs` and the two `phaseA-*` mobile suites that
  pin the replacement flow.
- **Size:** 27 files, **+1,347 / −3,372**.

## Why it was removed — the credential-authority dead end

The old flow detached the identity and wrote a new local password hash, but **the Firebase user was never
deleted or re-passworded**, so **the OLD password stayed valid at Firebase while the server no longer knew
the account**. Signing in with it succeeded at Firebase, resolved to **no MongoDB user** at the exchange —
which is `firebaseUid`-authoritative and never matches by email — answered **`REGISTRATION_REQUIRED`**, and
then met **`EMAIL_IN_USE`** at the end of the business-registration form. **Removing the capability is what
removes the state that produced it.**

## What replaced it — credential-change authority

The operation was **re-scoped into a credential change**: Firebase **`updatePassword`**, then the shipped
**N-4 `credentials-changed` bridge**, then the session the sequence ends with. The flow reuses
`confirmFirebaseSignIn` for the recent-authentication proof and holds a **temporary session** across the
bridge so the app's own token is not the one the bridge destroys. **Firebase stays the sole authority for
the account's password**, and **`firebaseUid` is never cleared — no reachable path clears it.**

## Verification note

**Documentation only.** This section adds no test run and makes **no runtime-verification claim**: the
artifact list and the figures above are the removal commit's own evidence, and the Phase 32L **Policy B**
measurements remain valid **history** (see §27Q and `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §8).

---

# 27AB. AUTH-01 — Firebase revocation checking and verification-failure classification

**Implementation record.** Shipped **2026-10-02** in commit **`b3f1146`** ("feat: enable Firebase
revocation checking and classify verification failures (AUTH-01)") — 7 files, **+774 / −20**. No §27x
section had recorded it, so it takes the next free lettered slot here rather than being back-dated.

## What shipped

- **`checkRevoked: true`** on the Admin SDK ID-token verification, so a credential revoked at Firebase is
  refused by the server instead of being accepted until its own `exp`.
- **A verification failure is classified into three disjoint outcomes**, so an outage can never be presented
  as a bad credential: a **terminal rejected credential** (`FirebaseTokenError`), a **transient inability to
  verify** (`FirebaseUnavailableError` → `FIREBASE_UNAVAILABLE` → **HTTP 503**), and the **operator
  configuration fault** (`FIREBASE_NOT_CONFIGURED`).
- The terminal allowlist is the **four unambiguous SDK codes**; **everything else — including the overloaded
  `auth/argument-error`, which `firebase-admin` 14.5.0 also emits for a JWKS fetch failure — is transient**,
  so a provider outage cannot destroy a valid session.
- A **structural JWT pre-check** and an **`aud`/`iss` environment assertion** were added as
  defence-in-depth on the real Admin SDK path only, leaving the test seam and its fixtures untouched.
- **Authenticated Firebase routes keep answering 503** for an unavailable Firebase rather than their 400
  token mapping.
- A **guard fails if the installed `firebase-admin` version changes**, because the classification is derived
  from 14.5.0's error codes rather than from a general contract.

## Verification note

Exercised by `server/test/phaseAUTH01-firebase-verification.test.mjs` (494 lines at introduction) with the
edited `phase32b-firebase-admin.test.mjs`. No route, schema, session/JWT, mobile or legacy-auth behaviour
changed, and **no `revokeRefreshTokens()` was introduced**.

---

# 27AC. AUTH-02 — short-lived JWT, enforced issuer/audience, and the 14-day absolute session cap

**Implementation record.** Shipped **2026-10-02** in commit **`6a0f41b`** ("feat: shorten JWT lifetime to
1h, enforce issuer/audience, and cap sessions at 14 days (AUTH-02)") — 15 files, **+993 / −70**.

## What shipped

- **The access token lives about an hour.** `JWT_EXPIRES_IN` defaults to `1h`, and in production a value
  `jsonwebtoken` cannot parse fails fast at startup rather than becoming a first-login 500.
- **Issuer and audience are minted and enforced.** `JWT_ISSUER` defaults to `inventory-ai` and
  `JWT_AUDIENCE` to `inventory-ai-api` (`server/src/config/env.ts`). They are stable, non-secret labels —
  deliberately **not** environment-specific — and `jsonwebtoken` itself validates them on every request
  rather than any claim being compared by hand.
- **Session longevity is bounded separately, in code and not in config**: `SESSION_ABSOLUTE_CAP_DAYS = 14`
  (`server/src/services/session.service.ts`), with a session's `expiresAt` anchored at creation. A session's
  usable life therefore never depends on the JWT lifetime — changing `JWT_EXPIRES_IN` can neither lengthen
  nor shorten it.
- **Expiry is classified rather than generic.** `requireAuth` distinguishes **`SESSION_EXPIRED`** — an
  expired token whose session is still live, and therefore **recoverable** — from the other 401s, using an
  expiry-ignoring re-verification that still performs a full signature, algorithm, issuer and audience check.
- **A one-time re-login was accepted deliberately**: a token minted before this change carries neither
  `iss` nor `aud`, so it is rejected and every existing user signs in once more.

## Verification note

Exercised by `server/test/phaseAUTH02-session-jwt.test.mjs` (695 lines at introduction) with the edited
`phase26a-session-lifecycle.test.mjs`, `phase32c-firebase-exchange.test.mjs` and `phase07d-*` suites. No
mobile change and no new dependency.

---

# 27AD. AUTH-03 — inventory session renewal (server boundary and mobile client)

**Implementation record.** Shipped **2026-10-02** in commits **`3085e3f`** ("feat: implement inventory
session renewal (AUTH-03)", 24 files, +2,322/−67) and **`5da0692`** ("fix: prevent AUTH-03 renewal request
from re-entering the renewal hooks", 2 files, +76/−3). The behaviour is specified in
`docs/SYSTEM_SPECIFICATION.md` **§"Session Renewal (AUTH-03)"**.

## What shipped — the server boundary

- **`POST /api/auth/renew`**, **authenticated**: `requireAuth` is the first handler, so the account is
  `req.user.id` and the session is `req.auth.jti`, both taken from the token that authenticated the request;
  the body carries only `{ idToken }`.
- **A renewed token names the SAME session**: the `jti` is passed through unchanged, **no session row is
  created**, **`expiresAt` is never written**, and **no audit row is written** per renewal — the 14-day
  absolute cap therefore cannot be extended by renewal.
- **Two refusals in a load-bearing order**: a verified uid that differs from the account's `firebaseUid`
  (or an account with none) is **`409 FIREBASE_IDENTITY_CONFLICT`**; an unverified identity is
  **`400 EMAIL_NOT_VERIFIED`** — 400 rather than 401/403 precisely so it cannot trip the client's
  session-loss rule and retroactively kill a live session.
- **Per-IP rate limited** (`AUTH_SESSION_RENEW_RATE_LIMIT_*`, default 120 per 15 minutes), answering
  **`429 SESSION_RENEW_RATE_LIMITED`** with a `Retry-After` header; middleware order is
  **`requireAuth → limiter → controller`**.
- **Firebase verification runs through the AUTH-01 boundary** (`checkRevoked: true`).

## What shipped — the mobile client

- **Proactive renewal** when the authentication horizon — `min(tokenExpiresAt, sessionExpiresAt)`, the
  earlier boundary winning — falls inside a **10-minute window**, and when the app returns to the foreground.
- **Single-flight**, guarded by an **authentication epoch** so a response belonging to an epoch that has
  since ended (a sign-out or a fresh sign-in) is discarded rather than applied.
- **Failures are classified by application error code, never by HTTP status**: a recoverable
  `SESSION_EXPIRED` retries the original request **exactly once**, terminal codes never renew, and a
  transient failure — the 429 included — degrades gracefully without ending the session.

## Verification note

`server/test/phaseAUTH03-session-renewal.test.mjs` (538 lines at introduction) and the two mobile suites
(`phaseAUTH03-auth-renewal.test.tsx`, `phaseAUTH03-client-renewal.test.ts`);
`phase23-authorization-contract.test.mjs` gained the route's `AUTHENTICATED`-bucket declaration. No new
permission, no new dependency and no new durable auth state.

---

# 27AE. CI quality gate — `.github/workflows/ci.yml` (and the defect its first run caught)

**Implementation record.** Shipped **2026-10-07** in commit **`9f4c5c1`** ("ci: add production quality
gates", 1 file, +183) and corrected **2026-10-09** in **`d415335`** ("ci: provide the test JWT_SECRET the
server suite requires", 1 file, +13).

## What the gate is

Two jobs, identical on every trigger, with **Node taken from `.nvmrc` and never hardcoded**:

- **`server`** — `npm ci`, typecheck, lint, both module-graph checks, **`npm test` in full mode** (the mode
  that makes DB-backed suites fail loudly rather than skip), then a boot smoke asserting `/ready` 200,
  `/live` 200 and termination within the shutdown window after `SIGTERM`, against a **`mongo:7` service
  container** with a health check.
- **`mobile`** — `npm ci`, typecheck, `jest`.

It runs on **every pull request** and on **pushes to `main`**, with **no path filters** — a filtered
required check is the classic way to block a merge with a check that never reports — and **no GitHub
secrets**.

## Enforcement — what this gate cannot do on this plan (recorded 2026-10-09)

**The gate cannot be made mandatory on this repository.** Classic branch protection and the newer
rulesets API are both unavailable on a **private** repository without GitHub Pro; each answers:

```text
Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)
```

So `ci / server` and `ci / mobile` run on every pull request and every push to `main`, but nothing
**prevents** a direct `git push origin main` or a merge past a red check. That is a **plan limitation,
not a configuration mistake** — both endpoints were attempted and both refused.

The compensating control is **`.github/workflows/main-guard.yml`** (added 2026-10-09, shipped through a
pull request): on every push to `main` it requires **every commit the push introduced to be associated
with a merged pull request**, using the API's own PR record, and fails the run otherwise. Its rule was
verified against real repository data before it shipped (`5acaf44` → PR #8, `3e5d2aa` → PR #7,
`0c54613` → PR #8, and a non-PR commit `e9616cf` → none).

**What it is and is not, stated plainly:** it is **detection, not prevention** — a bypass lands, then shows
up red on `main` instead of passing silently. It does **not** re-verify that the checks were green at
merge time; the primary `ci` run on the same push covers that. It is a compensating control for a paid
feature, and the limitation is recorded here so no later reader mistakes the green checkmarks for
enforcement.

## Resolution, later the same day (2026-10-09) — the repository was made public and protection applied

*(Update to the record above, which is kept as history.)* The owner chose to make the repository **public**
rather than upgrade the plan, which unlocks protection on the free tier. Before the visibility change the
**entire reachable history was scanned for credentials** — 48.7 MB of blobs across every ref — and came
back clean:

- **No sensitive file was ever added** — no `.env`, keystore, `.pem`, `.p12`, `google-services.json` or
  `GoogleService-Info.plist`. Only `.env.example` (names, never values) is tracked.
- **Zero matches** for Google API keys, `sk-`/`sk-ant-`/`sk-proj-`, Resend `re_`, Brevo `xkeysib-`,
  SendGrid `SG.`, GitHub `ghp_`/`gho_`, AWS `AKIA`, Render `rnd_`, `Bearer`-style tokens, or a
  credentialed `mongodb+srv://` URI.
- The 18 "PRIVATE KEY" hits are **dummy bodies** (`abc`, `ignored`, `MIIabc`) in
  `phase32b-firebase-admin.test.mjs`; the JWT-shaped strings are **fixtures** (`{"sub":"1234567890"}`,
  `{"sub":"1"}`, `{"sub":"u1"}`). No real key or token exists anywhere in history.

**Branch protection is now APPLIED and verified by API readback (2026-10-09):** required checks
**`server`** and **`mobile`** — the check-run names GitHub actually reports, **not** the
`ci / server` / `ci / mobile` form the pull-request UI displays (see the correction below) — with
**strict** up-to-date enforcement, a pull request required
(**0** approvals — a single-maintainer repository must not deadlock on self-approval), stale reviews
dismissed on push, and force-pushes and branch deletion blocked. **`enforce_admins: true`**, set the same
day after the setting below was shown to bind nobody.

**Why `enforce_admins` was turned on, and the proof it bites.** The first configuration left it `false`,
which is GitHub's default and looks harmless: "the owner keeps an escape hatch". On a repository whose
only collaborator **is** the owner-admin, it meant the required checks were **advisory for every actor
that exists** — the gate was decoration. Enforcement was then verified rather than assumed, in both
directions. With the required checks **pending**, a merge attempt was refused:

```text
X Pull request #10 is not mergeable: the base branch policy prohibits the merge. (exit 1)
```

and the pull request stayed `OPEN` / `BLOCKED`. Once the checks were green, the *same* merge
**succeeded** — which is the half that matters most, because a gate that also blocks a green pull
request would be a deadlock rather than a gate. The escape hatch still exists, but it is now an explicit
settings change rather than a silently absent rule.

**`main-guard` is retained** as a second layer rather than removed: it still catches a push that reaches
`main` by a route protection does not cover — a protection setting that is later relaxed, or a future
actor added without admin enforcement — and it
records the pull-request rule in the repository itself instead of only in a setting. **The trade-off is
recorded as the owner's decision**, taken with the scan results above in hand: a public repository exposes
the full source, history and documentation, and switching back to private does not un-expose content that
has already been cloned, forked or indexed.

> **Verifying this rather than assuming it — and being corrected by it.** The probe pull request that
> carries this record existed to prove the required-check context names, and it **caught the wrong
> ones**: configured as `ci / server` / `ci / mobile` (the form the pull-request UI shows), **both checks
> passed** — `server: SUCCESS`, `mobile: SUCCESS`, `mergeable: MERGEABLE` — while the pull request sat
> at **`mergeStateStatus: BLOCKED`**, waiting on an "Expected" status that can never report. Protection
> matches the **check-run names the REST API returns**, `server` and `mobile`, not the UI's
> `<workflow> / <job>` display form. Corrected to those two, the **same** pull request flipped
> **`BLOCKED` → `CLEAN` with no re-run and no new commit**, which is what proves the match rather than
> assuming it. Shipped unverified, this would have made **every future pull request unmergeable** —
> precisely the failure the probe existed to catch, and the reason the required-check names are pinned
> here as `server`/`mobile` rather than as they appear in the interface.

## Public-repository hardening (2026-10-09)

Making the repository public to unlock protection also made it **readable by anyone**, so the
repository-level security surface was closed out the same day. Three artifacts were added and four
settings enabled, each verified by API readback or against a published schema rather than assumed.

| Change | Why | Verified |
| --- | --- | --- |
| **`SECURITY.md`** | a public repository needs a stated reporting path | links resolve; the five findings it discloses (`B1`, `B2`, `E3`, `OD-10`, `L-17`) are each really recorded in the checklist |
| **`LICENSE`** (proprietary, all rights reserved) | neither package declared a `license` field, so the terms were unstated | contains no open-source licence name; holder, no-warranty and third-party carve-outs present |
| **`.github/dependabot.yml`** | dependency bumps for **both** packages | validates against the **published `dependabot-2.0` schema** (fetched from schemastore, validated with `jsonschema`); both target directories exist with `lockfileVersion: 3`; the one label it uses exists in the repository |

**The reporting channel is GitHub private vulnerability reporting, not an email address** — enabling it
was verified (`GET /repos/…/private-vulnerability-reporting` → `{"enabled":true}`), and inventing a mailbox
nobody reads would have been worse than stating nothing. The security policy also discloses the already
recorded open items up front, so a researcher is not thanked for re-reporting `B1`'s accepted residual
term.

**The licence is a deliberate owner decision and not an open-source one:** the repository became public
for **hosting** (free-tier protection, CI minutes and private vulnerability reporting), not to grant reuse
rights, so the file reserves all rights and permits viewing, cloning and contributing by pull request
only. GitHub will label a non-standard licence as *View license* rather than naming it — expected, not a
configuration error.

**Two settings were found DISABLED on a repository that had just become public**, which is the part worth
keeping: `secret_scanning` and `secret_scanning_push_protection` were both `disabled`, so the only
credential control in place was the **one-off history scan** performed before the visibility change —
an audit, not a standing control. Both are now `enabled`, verified by a fresh `GET` of `security_and_analysis`,
together with **Dependabot alerts** and **security updates**. `secret_scanning_non_provider_patterns` and
`secret_scanning_validity_checks` remain **disabled**, recorded here as such rather than left silently off.

**Limits stated rather than glossed.** `dependabot.yml` is only read from the default branch, so it
takes effect when this lands, not when it is written; the first version-update pull requests appear on the
following weekly run. Those pull requests land on a **protected `main`**, so Dependabot's own changes are
subject to the same required `server`/`mobile` checks as everyone else's — and grouping is scoped with
`applies-to: version-updates` so a **security** update is never folded into a routine minor/patch batch.

**The alerts turned into evidence within minutes.** Switching Dependabot on immediately surfaced
**9 open advisories, every one of them in `mobile/package-lock.json`** *(as measured 2026-10-09 — **7** on
2026-10-10, 3 high / 3 medium / 1 low, 0 critical; advisory counts drift, so re-read before quoting)* — 1 critical, 4 high, 3 moderate,
1 low — and **Dependabot opened three security-update pull requests by itself** (`#12`–`#14`), which is the
feature demonstrably working rather than merely enabled. Three of the nine (`braces`, `node-forge`,
`sprintf-js`) have **no published fix**, so they are recorded here as dependency debt that a version bump
cannot clear. A fourth, `uuid`, has a published fix that the dependency graph **cannot reach** — Dependabot's
updater failed on it and said so itself: *"A patched version exists for uuid, but the available update path
still resolves it to 7.0.3"*, the chain being `jest-expo` → `xcode` → `uuid ^7.0.3`. Clearing that one needs
an upstream release, not a config change. All nine are **transitive dependencies of the mobile build/tooling chain**, not server runtime
dependencies; that lowers the practical exposure of the critical and high entries but does not remove them,
and none of them was found by reading code — they were invisible until the setting existed.

## Source protection — the repository is private again (2026-10-09)

The public visibility that unlocked free protection was **reversed the same day**, roughly 90 minutes
later, on the owner's decision that the source must not be cloneable. The trade was **measured** this time
rather than predicted:

| Lost by going private | Still working |
| --- | --- |
| **Branch protection** — `GET …/branches/main/protection` → `403 Upgrade to GitHub Pro or make this repository public` | **Dependabot** — `vulnerability-alerts` → `204`, and the open advisories remain readable (nine at that time; **seven** on 2026-10-10) |
| **Rulesets** — the same `403` | **The workflows** — `server`, `mobile` and the new `secret-guard` job run unchanged, with Actions minutes still free at this scale (2,000/month on the Free plan) |
| **Secret scanning and push protection** — `security_and_analysis` is now `null`, the feature needing GitHub Secret Protection on a private repository | **`main-guard`** — detection of a bypass after the fact |

**What replaced the lost protections.** GitHub's scanner is gone, so its job moved into the repository:
**`scripts/check-secrets.mjs`** runs as the third CI job and fails a change that introduces
credential-shaped content — private-key blocks judged by **body length** so dummy fixtures pass, provider
token shapes, credentialed Mongo URIs, and a tracked `.env`. It is **pattern matching, not proof**, and says
so in its own header. The **six** deliberate test fixtures it legitimately matched were waived **on their own
lines** with `secret-guard:allow` rather than by weakening a rule or excluding the test tree from scanning,
so a real credential pasted into a test file still fails the build.

**Writing it found a bug in the guard itself**, which is why it was run against the real tree instead of
assumed: the first version advanced its line offsets by `line.length + 1`, which drifts byte-by-byte on a
**CRLF** file and made the private-key body test read from the wrong offset — reporting a
`-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----` fixture as a real key. Fixed by locating
each line by search, then all six paths re-exercised (clean tree, planted provider key, real-length key,
dummy key, `.env` file, waived line).

**The exposure window, measured rather than dismissed.** The repository was public for ~90 minutes.
`forks: 0` and `network_count: 0` — **nobody forked it**. The traffic API shows 24 clones / 3 unique
cloners / 244 views, all consistent with the owner's own machines and CI — but its **last recorded day is
2026-10-07** because traffic data **lags about two days**, so it does **not** cover the public window.
**A clone leaves no permanent record, so it cannot be established that no copy was taken.** The limitation,
the re-check commands and the growth plan are in `docs/SOURCE_PROTECTION.md`.

**Access surface, audited rather than assumed:** exactly **one collaborator** (the owner, admin), **no
deploy keys**, **no webhooks**, **no Actions secrets**; `.env`, `server/.env`, `mobile/.env` and `.freebuff`
are all **present and git-ignored**, and nothing sensitive is tracked. Two controls could not be verified
from the CLI and are recorded as **owner-side, not done**: **account 2FA** (`GET /user` returns
`two_factor_authentication: null`) and **which GitHub Apps can reach the repository**
(`GET /user/installations` → `403`, that endpoint requiring a GitHub App JWT), so the hosting integration's
repository scope must be reviewed in the UI. **Forking cannot be switched off on a personal private
repository** — GitHub answers `422 Allow forks setting can only be changed on org-owned private
repositories`: nobody outside can fork it, a collaborator could, and moving to an organization is the fix.

**Three `SECURITY.md` claims went stale within the hour and were corrected rather than left** — private
vulnerability reporting (`404` once private, so the channel is now an issue in this private repository),
the "secret scanning enabled" line, and the protected branch. That is the argument for the habit this
record follows: state the setting **and its evidence**, then re-read it when the state changes.

## The guard's first false positive — F-25 (2026-10-09)

With protection enforced, the guard had become the **second** layer — and on the merge of **PR #15** it went
red on `main` for a merge that was entirely legitimate. The log is worth keeping as-is, because it reads like
a real detection:

```text
##[error]commit a06c89bfa4ce4d8aa5f1e1f5f892c781cca7ab24 reached main without a merged pull request
OK: 12603e3f648233dca8b0d8ee554699ed90c1cc22 arrived through PR 15
OK: 6c897014a8b67314d2c4ed2847b52b0fdda58217 arrived through PR 15
FAIL: this push bypassed the pull-request flow.
```

**One commit of the same push was accused while its two siblings resolved in the same run** — the tell — and
the same API query a minute later resolved all three to PR #15. The cause is **eventual consistency**: the
job started **six seconds** after the merge (05:05:59 against a 05:05:53 merge) and the commit-to-PR
association for the branch's oldest commit had not propagated. The guard had been written assuming that
association was immediate, which is false.

**Why it was fixed rather than documented.** A guard that goes red on legitimate work is worse than no guard:
it teaches its reader to ignore the colour, which is the exact failure mode the guard was added to prevent.
The empty answer is now retried with a backoff, and — separately — a lookup that *never* answers is reported
as `could not verify` rather than as a bypass, so a GitHub API outage cannot be presented as a security
violation. All three paths were exercised locally against the live API before shipping: a commit from a
**merged** PR (immediate `OK`, exit 0), a commit on an **open** PR (retry note, then the named bypass, exit 1),
and an unanswerable lookup (`could not verify`, exit 1).

## The defect its first run caught — a missing test-owned variable

The gate's first-ever execution, on **PR #7**, failed the `server` job with **118 failing tests**, every one
a cascade from **`JWT_SECRET is not configured`**. Every server suite begins with `import 'dotenv/config'`,
so locally the **git-ignored `server/.env`** supplies that value; a CI checkout has no such file, so the
first `signAccessToken` threw `AUTH_NOT_CONFIGURED`, login answered 500 and everything auth-dependent died.
The `mobile` job passed on the same run.

**`d415335` adds one fixed, non-secret `JWT_SECRET` to the test step** and changes nothing else.
`JWT_ISSUER` / `JWT_AUDIENCE` / `JWT_EXPIRES_IN` are deliberately **not** set: their shipped defaults are the
contract and the suites assert it, so overriding them in the ambient environment would mask a regression
instead of catching one.

## Verification note

The diagnosis was **reproduced off-CI rather than inferred**: a clone with no `.env` and only the workflow's
variables produced the same 118 failures, and the full suite went green once the variable was supplied (185
suites / 1312 tests, 0 failures). **PR #7's checks then passed on GitHub** — `ci / server` and `ci / mobile`
— and the merge commit is **`3e5d2aa`**. The local reproduction used Atlas while CI uses `mongo:7`, so the
container was not literally the same database; the green run — not the simulation — is the authority for CI.

---

# 27AF. Owner-only access — audited, monitored and pinned (2026-10-09)

**The requirement, in the owner's words:** *"I must be the only human with authorized access to the
InventoryAI GitHub repository."* This section records what could be **confirmed**, what could be
**enforced**, what could only be **reported**, and the fact that **no repository setting was changed and no
integration was touched** to reach it — every change below is additive.

## Confirmed by API read, not assumed

| Surface | Finding |
| --- | --- |
| Collaborators | exactly one — the owner, with `admin` |
| Pending invitations | none |
| Deploy keys | none |
| Webhooks | none |
| Actions secrets / environments | none / none — no credential exists inside GitHub |
| Owner type | a **personal** account, not an organization (this is why two controls below are unavailable) |
| Actions shared with other repositories | `access_level: none` |
| Default `GITHUB_TOKEN` | `read`, and workflows cannot create or approve pull requests |
| Public gists on the account | none |
| InventoryAI code in public repositories | none — a code search scoped to the account for two distinctive identifiers returned zero, over 21 public and 4 private repositories |

**History re-verified over every ref, with controls.** `git grep` across every commit of every ref found
no `.env`, keystore, `.pem`, `.p12` or service-account file that was **ever** added, and both `.env.example`
files carry **empty** credential values. The only `-----BEGIN … PRIVATE KEY-----` matches are the
**27-character header string** — a documentation example, the guard's own pattern, and dummy test fixtures —
and a separate scan for a base64-shaped body line returned **nothing anywhere in history**, so no real key
block ever existed. A positive control (`PRODUCT_ARCHIVED`, which must be found) and a negative control (a
canary shape that must not be) were run through the identical traversal, because a scan that cannot fail
proves nothing.

## What GitHub cannot do here, measured

- branch protection and repository rulesets: `403 Upgrade to GitHub Pro or make this repository public`
- secret scanning and push protection: public-repository-only on this plan (`security_and_analysis: null`)
- `allow_forking: false`: `422 Allow forks setting can only be changed on org-owned private repositories`

So the policy is **enforced where the platform allows it and made observable where it does not**.

## What was added

- **`.github/workflows/access-guard.yml`** — a daily, also manually dispatchable monitor that **hard-fails**
  on a repository that is no longer private, on any fork or fork network, or on any collaborator other than
  the owner. Its **first real run (`37893715498`) produced the measurement that shapes it**: the
  collaborators endpoint answers **`200` to `GITHUB_TOKEN`**, while invitations, deploy keys, webhooks,
  Actions secrets, the Actions policy, branch protection and rulesets all answer **`403`**. Owner-only
  membership is therefore **asserted unattended**, and the seven unreadable endpoints are **printed with
  their HTTP status** — asserted empty whenever a 200 does arrive, and never counted as a pass when it does
  not. The scheduled trigger is deliberate: the policy changes through repository settings, not through a
  commit, so a push trigger would miss the very thing being watched.
- **`scripts/audit-access.mjs`** — the deep audit, which needs a credential that *can* read those
  endpoints: the owner's own `gh` session. Dependency-free, `PASS`/`FAIL`/`INFO`, **non-zero exit on any
  violation**, printing **names only and never a value**, and listing the unavailable settings so their
  absence is visible rather than forgotten. Verified by running it against the live API: **no policy
  violations**, with account 2FA, protection and rulesets reported as unavailable or unverifiable.
- **Action pinning** — `actions/checkout` and `actions/setup-node` are pinned to full commit SHAs, each
  confirmed by `git ls-remote` to be the commit its floating tag resolved to, so an upstream tag re-point can
  no longer alter what CI executes. A `github-actions` entry in `.github/dependabot.yml` keeps the pins
  current, because a pin with no updater silently stops receiving the fixes it exists to make safe to take.
  **Re-pinned to `v7` on 2026-10-11** (checkout `v7.0.1` @ `3d3c42e5…`, setup-node `v7.1.0` @ `949feb24…`,
  each read from its floating tag, §27AO): the pins had sat at `v4.4.0`, whose Node 20 runtime GitHub was
  already overriding, so every run carried a deprecation warning (ISS-12).
- **Two stale claims corrected rather than left standing** — `dependabot.yml`'s comment that these PRs land
  on a **protected** `main` (they do not, at this plan level: nothing forces the checks to pass, so a red
  Dependabot PR must not be merged by hand), and the monitor's own first draft, which described the
  collaborator check as unreadable — the run showed otherwise, so the file now records the measurement.

## Verification

PR **#28** → merge **`99e1eac`**. The `ci` run on the PR is green at job level — **`server`** (full suite),
**`mobile`**, **`secret-guard`** — which is also the proof that the **pinned** actions execute correctly.
`access-guard` then ran on `main` (`37893715498`, **success**) and printed the matrix quoted above. All
three YAML files were parsed before the PR, `node --check` passed on the new script, and
`scripts/check-secrets.mjs` was run over every changed file (clean).

## Integrations, and what was not touched

The repository holds **no deploy configuration** — no `render.yaml`, no Dockerfile — so the Render and
MongoDB Atlas connections live in their own dashboards and in Render's environment variables, and the
mobile build config in `mobile/eas.json` carries project identifiers, not credentials. **Render reaches
this repository through a GitHub App installation, not through a repository webhook** — which is precisely
why it is invisible to every CLI check here: `GET /user/installations` needs a token authorised to an App
and `GET /repos/…/installation` needs an App JWT (both `403`/`401`). No app installation, deploy key,
hook, secret, collaborator or permission was revoked, narrowed or modified, and the only settings call made
was the deliberate `allow_forking: false` attempt that the platform refused with `422`.

## Still owner-side

Account **2FA** (`two_factor_authentication: null`) and the **GitHub Apps with repository access** list
cannot be read from the CLI, and **no automated check here can see an app**, because an app is not a
collaborator. Both must be confirmed in the UI, and the hosting app's repository scope narrowed there.

---

# 27AG. Workflow simplification — fewer moving parts, dependency policy, and a leaner instruction file (2026-10-09)

**The owner's report:** the GitHub setup "has become more complicated than necessary" — the goal
being plain code tracking, feature management and pull requests, not security machinery. This section
records what was **measured**, what was **removed**, and what is now **not watched**, so the trade is
on the record rather than implicit.

## Measured first

| Question | Answer |
| --- | --- |
| Does anything block the daily git flow? | **No.** No protected branch, no required check, no required reviewer, no local hook, no approval gate — protection answers `403` on a private repo at this plan level |
| What does a pull request cost? | `ci` runs **160–214 s** (three parallel jobs), plus a second run on the `main` push; `main-guard` 8 s, `access-guard` 11 s/day. Human time added: **none** |
| What was actually noisy? | **14 open Dependabot PRs, 8 of them major versions, 5 of them red**; 16 remote branches; and a **143 KB `CLAUDE.md`** loaded into every agent session |

## Dependency policy changed

[`.github/dependabot.yml`](../.github/dependabot.yml) now queues **minor and patch updates only**,
grouped per package, `open-pull-requests-limit: 2`, weekly, for `/server`, `/mobile` and
`github-actions`. Major versions are **excluded** from the queue. Two GitHub-documented facts made this
safe: security-update pull requests **are not subject to `open-pull-requests-limit` and do not count
toward it**, and `update-types` filters version updates — so a vulnerability fix still arrives
immediately as its own PR regardless of the ignore rule.

**Queue cleared the same day, on evidence rather than policy alone:** three green non-major PRs were
**merged** (`#16` server group, `#14` shell-quote, `#13` source-map-js — the last two were two of the
three security updates Dependabot had raised itself); **nine major PRs and two blocked ones were
closed** (`#17`, `#18`, `#20`, `#21`, `#22`, `#23`, `#24`, `#29`, `#30`; plus `#12` and `#19`), each with
the reason stated on the PR. Open PRs went **14 → 0** and remote branches **16 → 2** (each closed
Dependabot PR takes its own branch).

Two closures were **blocked rather than merely major**, and that came from reading the failures rather
than the titles: `#12` fails `npm ci` with `ERESOLVE` because `expo-router@58.0.16` needs
`expo-constants@58` while the project resolves `~57.0.20` from `expo@57.0.26`; and the mobile
minor/patch group `#19` fails **typecheck** with ~10 `TS2322` errors — `Type 'null' is not assignable to
type 'Element | ComponentType<any> | undefined'` — which is the React 19 types no longer accepting
`null` where `undefined` is expected. Both are recorded in **issue #32** with their evidence, so the
next weekly mobile group is a known, tracked blocker instead of a surprise red PR.

## Two workflows removed

- **`main-guard.yml`** — flagged a push that reached `main` outside a merged pull request
  (detection only, 8 s per push). Removed: `main` cannot be protected here anyway, and a direct push
  is a legitimate solo workflow.
- **`access-guard.yml`** — the daily visibility/fork/collaborator monitor added earlier the same day
  (green in run `37894805284`). Removed on the owner's call for fewer moving parts.

**Stated plainly, because it changes the risk picture:** nothing now watches repository visibility,
the collaborator list, deploy keys or webhooks. An accidental flip to public, or a new collaborator,
is noticed only when someone runs `node scripts/audit-access.mjs` — a habit, not a control. The
three protections this plan lacks (branch protection, rulesets, secret scanning) are unchanged and
unaffected by this removal; `scripts/audit-access.mjs` and `scripts/check-secrets.mjs` are kept.

## `CLAUDE.md` split

`CLAUDE.md` is loaded into **every** agent session, and it carried ~87 KB of phase prose. That text was
moved **verbatim** to [`docs/PHASE_HISTORY.md`](PHASE_HISTORY.md) — verified byte-identical against the
previous revision — leaving **143 KB → 57 KB** (1,686 → 717 lines). The one-line-per-phase index stays
in `CLAUDE.md`, because an agent needs to know what already exists before proposing work. A
**proportional-records rule** replaced the blanket obligation: security, architecture, authorization,
schema, route, dependency-policy or phase-level changes get a dated record; a routine feature or fix is
documented by its pull request, its tests and the code.

## Left alone deliberately

`wip/backup-working-tree` is **not** contained in `main` — it holds a unique commit (`e9616cf`,
2026-09-28, "back up uncommitted working-tree work"), so it was **kept** despite being approved for
deletion; the approval rested on a description that turned out to be wrong, and a private branch costs
nothing. `ci.yml` and its three jobs, `scripts/check-secrets.mjs`, the pinned action SHAs and
`scripts/audit-access.mjs` are all unchanged.

---

# 27AH. Current status, known issues and the next-step order (2026-10-10, revised 2026-10-11)

## Why this section exists

To stop re-auditing the repository to remember where the project is. Everything here is a **working view**,
verified on 2026-10-10 and re-checked after the P0 merges (`f2f6731`, `aadab04`, `bf0c915`); it adds no phase status and changes none. The phase records
above remain authoritative for what shipped, and `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` for anything
security-relevant. **A task is complete only with evidence** — a commit, a CI run or a measured command output.
Published figures drift (advisory counts especially); re-read a number at the moment you quote it.

**How a session starts from here.** When asked what to work on next, answer from the order below rather than re-auditing:
re-verify only the volatile figures (HEAD, PR and CI state, open advisories), quote the rest from this section, and
update its tracking boxes, status rows and heading date at the end of a session that lands work.

## Status at a glance

| Dimension | Verified state |
| --- | --- |
| Repository | `main` @ `31bd7b7` = `origin/main`; no tags, no stashes; the device guide is committed (P3-3 resolved); 2026-10-11: **ISS-13 fixed** (#45, §27AM), the **Expo pin guard** added (§27AN), the **watch script** landed (§27AQ), the **secret guard made able to fail** (§27AR), the **attribution-bearing history rewritten** (§27AS — every tree hash unchanged), the **first real-device run** performed (§27AT), the **device runbook written** (#53), and the **upgrade watch's false `READY` corrected** (§27AU, **ISS-19**) — and then the **same registry-vs-project flaw found and fixed in its third watch** (#55) |
| CI | `.github/workflows/ci.yml` only — jobs **server / mobile / secret-guard**; last `main` run green on `31bd7b7` (run 38129734595, 2026-10-11T09:49Z), and green on both §27AU pull requests before it |
| Backend | **117** `.ts` modules + one deferred `.js` (`server/src/services/entitlement.service.js`); **0** open advisories |
| Mobile | **132** `.ts`/`.tsx` sources and **0** `.js`/`.jsx` in `app/ components/ lib/ __tests__/` (re-counted 2026-10-11); Expo 57 / RN 0.86.3 |
| Tests | **64** server test files (`server/test/*.test.mjs`) and **50** mobile test files (file counts, re-read 2026-10-11). CI's own summary at `3beaf85`: server **185 suites / 1312 tests, 0 failures**; mobile **49 suites / 660 tests** — a "suite" there is CI's unit, not a file. Re-run locally on `3adac9d` for the device pass: mobile **50 / 666**, server **185 / 1312**, both 0 failures, `tsc` and eslint clean (§27AT) |
| Open on GitHub | **Nothing at all** but **issue #32** (deferred majors) — re-read 2026-10-11 (late): `gh pr list --state open` is empty and one issue is open, **PRs #46–#55 merged** (§27AL–§27AU); #34 (ISS-16) and #38 (ISS-17) closed with their reasons |
| Open advisories | **5** — 2 high, 3 medium, 0 critical (all mobile; re-read 2026-10-11 from the alerts API after §27AK's disposition, and **verified again** the same evening — the count drifts, and did) |
| Production | Render auto-deploy from `main`; `https://ai-inventory-l1mi.onrender.com` reachable and serving the AUTH-04 endpoints |
| Device | **First physical-device run performed 2026-10-11** (§27AT): dev client `0972948` installed on the OPPO CPH1969 over USB, app launched and rendered, the USB backend path proved, the §27R register validation confirmed on hardware. **Unauthenticated only** — the local database is empty, so sign-in, verification, inventory and the AI assistant remain **not device-verified** |

## Verified complete — with evidence

Sessions named by a mandatory `jti` and real logout (26A) · password recovery server and mobile (26B/27) with the
B1 timing hardening (28) · **AUTH-01** revocation checking and failure classification · **AUTH-02** short-lived JWT
with enforced issuer/audience and the 14-day absolute cap · **AUTH-03** session renewal · **AUTH-04** the custom
6-digit email-verification flow (A–G shipped, G passed live on Brevo, **H complete in `0972948`**; endpoints at
`server/src/routes/auth.routes.ts:119` and `:124`) · the **N-4 credential-change bridge**
(`server/src/services/credentialsChanged.service.ts`, `POST /api/auth/credentials-changed`, `auth.routes.ts:196`,
commit `703a9da`, an ancestor of `main`) · **F1/F2** retirements · **Phase 31** AI wire diagnostics and the
AgentRouter → OpenRouter migration (`31D.6` present) · the 2026-10-09 workflow simplification (`ci.yml` only,
`scripts/audit-access.mjs`, `dependabot.yml` matching the recorded policy) · the physical-device dev loop
(dev client + Metro + local backend + mirroring), written up in `docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md`.

**Google Sign-In** is implemented: `@react-native-google-signin/google-signin@16.1.5`, wired in
`mobile/app/login.tsx` (`handleGoogle`), `lib/firebase-auth.ts` and `lib/firebase-native.ts`; checklist §5a marks
the Android E2E verified on 2026-09-26. (Roadmap §35 long said otherwise — corrected there on 2026-10-10.)
Facebook Login and Apple Sign-In remain unimplemented.

## In progress

There is **no in-flight feature work**. P0 closed on 2026-10-10: #35/#36/#37 merged (`f2f6731`, `aadab04`,
`bf0c915`), #34 closed (ISS-16), and the device guide committed (P3-3 resolved). SDK 58 execution is deferred by its
recorded Gate 0 decision (§27AI). **ISS-02 closed out on 2026-10-10** (remediated — §27AJ, PR #40), the
**advisories dispositioned** (§27AK, PR #41), and on 2026-10-11 the **Dependabot carve-out completed** with
the last three P3 housekeeping items decided (§27AL), **ISS-13 fixed** (§27AM, PR #45), the **Expo pin set
put under CI** — ISS-16's detection gap (§27AN, PR #46) — the deferred queue re-measured and scripted (§27AQ,
PR #49), the **secret guard's rules made provable** (§27AR, PR #50), and the **first real-device Android run**
prepared and performed (§27AT, F-26…F-28), and the **device runbook** written into the physical-device guide
(#53). Finally the deferred-upgrade watch was read back and found to be reporting an **open gate that was
shut**, and corrected with controls of its own (§27AU, ISS-19) — the one unblocked correctness defect left on
the board (§27AU's *Why this came first*).

**Attribution policy tightened, and the history rewritten (2026-10-11).** The owner required that no
unwanted contributor name, AI attribution tag or automated signature line appears in commits, messages,
pull requests or history. The audit found **99 commits on `main` carrying 107 removable trailer lines**
in four forms (91 `Co-Authored-By: Claude Code`, 8 `🤖 Generated with Codebuff`, 5 capital-`A`
`Co-Authored-By: Codebuff`, 3 `Co-authored-by: Codebuff`), while `git config` was already correct and
**no hook or template in this repository can add one** — the trailers came from a coding agent's own
message template. CLAUDE.md §16 is now tool-agnostic and forward-binding, and the owner authorised a
one-off **message-only** rewrite, performed and verified commit by commit (§27AS): `main` `f8493f8` →
`3cef708`, with every tree hash unchanged. The 4 `dependabot[bot]` trailers are deliberately kept. (The
earlier "103 commits" figure in this section was the first, incomplete measurement.)

Next: **the device-testing account decision** (§27AT) and **P3-1** — the two items left that need the owner.

## Known issues and required fixes

| ID | Sev | Issue | Evidence | Fix |
| --- | --- | --- | --- | --- |
| **ISS-01** | High | PR #34 fails the `mobile` job with four `TS2322`: `Type 'null' is not assignable to type 'Element \| ComponentType<any> \| undefined'` at `components/ListScreen.tsx(102,10)` and `(109,8)`, `components/RefManage.tsx(265,9)`, `components/SelectField.tsx(147,13)` | CI run `37899073322` (reproduced twice) | Fix the `null`-typed prop values — `ListScreen.tsx:86` (`?? null`), `RefManage.tsx:266` and `SelectField.tsx:150` (`: null`) → `undefined`. **Done, verified locally — PR #36** (`npx tsc --noEmit`, `npx eslint .`, `npx jest`: 47 suites / 644 tests); **not** a check to relax |
| **ISS-02** | High → **`[~]`** | **RNFirebase PII logging reaches release builds**: `@react-native-firebase/auth` 26.4.0 logs the Firebase user object via `Log.d`, **not build-gated**; logcat only; uid/email/displayName/provider metadata, no credentials; no supported toggle | Checklist §24/§28; source re-read 2026-10-10 (one line; the id-token listener logs nothing; iOS side logs nothing) | **Remediated 2026-10-10 — `patch-package` patch + `postinstall --error-on-fail`, §27AJ.** Artifact-level verified (patch content, end-to-end reinstall applies it, 8-case guard, mobile 48/652, LF-pinned by `.gitattributes`). **Not closed:** no native build yet — §27AI step 9 re-checks logcat |
| **ISS-03** | Medium | Documents claim **9 open advisories** (1 critical, 4 high, 3 moderate, 1 low) | CLAUDE.md, checklist §42, this file's §27AE, issue #32 | Live value was **7** (3 high, 3 medium, 1 low, 0 critical) — corrected in place on 2026-10-10; **5 remain open** after the per-alert disposition (§27AK) |
| **ISS-04** | Medium | `README.md` calls the mobile app "written in **JavaScript**" and starts it with **Expo Go** | README:379, README:391 | It is 129 `.ts`/`.tsx` / 0 `.js`, and it needs a **development build** (RNFirebase + dev client). Corrected 2026-10-10 |
| **ISS-05** | Medium | §35 stated Google Sign-In was "approved, not implemented" with "no provider SDK installed" and the first dev build still a prerequisite | §35 | Corrected 2026-10-10 (see §35) |
| **ISS-06** | Medium → **`[~]`** | **P-3, re-read at source 2026-10-10: the `[⛔]` premise was imprecise.** RNFirebase does not hardcode 34 — it declares `minSdk 23`, `targetSdk 34`, `compileSdk 34` in **its own `package.json`** (`sdkVersions.android`), which its gradle consumes. Those are a **library's** build values: AGP requires the **app's** compileSdk to be ≥ each dependency's, which holds, and a library's `targetSdk` has no runtime effect | `@react-native-firebase/app/android/build.gradle` + its `package.json`; `expo-modules-autolinking`'s `ExpoRootProjectPlugin.kt` (the app's values come from the version catalog, fallback 35); checklist §25 | **Expected-benign, and still unverified** — nothing has been built since. On the next native build, read the generated values and the Gradle output. If the app's levels need raising, the lever is **`expo-build-properties`** (`bundledNativeModules` `~57.0.22`, **not installed**), not a patch of the library |
| **ISS-07** | Medium | **Phase 30B is referenced but never defined** — "has not started" in four places with no objective, scope or DoD | CLAUDE.md, this file's 30A record, PHASE_HISTORY, README | Define it or remove the references — owner decision (P3-1) |
| **ISS-08** | Medium | The CLAUDE.md main-guard / access-guard bullets read as if both monitors still exist | CLAUDE.md; `.github/workflows/` holds only `ci.yml` | Corrected 2026-10-10: marked as removed; "do not push to `main`" is a **convention with no automation** |
| **ISS-09** | Low | Module count stale at 94 | CLAUDE.md:39, `docs/TS-MIGRATION-MANIFEST.md`:16 | Live: **117** `.ts`; corrected 2026-10-10 |
| **ISS-10** | Low | AUTH-04-H read as pending | CLAUDE.md | Complete — `0972948`; corrected 2026-10-10 |
| **ISS-11** | Low | Phase 30A's "no EAS build has been executed / statically validated only" is superseded but un-annotated | CLAUDE.md 30A record | Builds exist: development 2026-09-26/09-30/10-03, preview 2026-09-29 and 2026-10-10; annotated |
| **ISS-12** | Low → **`[✓]`** | CI warned the pinned `actions/*` SHAs target Node 20 (forced onto Node 24) | CI job logs — the warning was in every run, including `3beaf85`'s | **Resolved 2026-10-11 (§27AO):** both actions re-pinned to v7 (checkout v7.0.1, setup-node v7.1.0), each the commit its floating `v7` tag resolved to; the run on the re-pin PR is the verification — green, warning gone |
| **ISS-13** | Low → **`[~]`** | **F-1 (Phase 30A PDF-sharing finding)** — carried since Phase 30A with **no description ever recorded**, only the identifier (searched 2026-10-11: §27F, `PHASE_HISTORY` and git history all name it, none explains it) | Read at source: the label path is `barcodeLabelHtml` → `printAsync` / `printToFileAsync`+`Sharing.shareAsync`. It held **one** concrete defect — the print path omitted `width`/`height`, so it paged the label at expo-print's US Letter 612×792 while the PDF used the label geometry | **Fixed 2026-10-11:** both actions pass the same `{ html, width, height }`, guarded by 8 cases whose two geometry assertions fail when the fix is reverted (§27AM). **Remaining half is a device round-trip** (print → scan) in the §27AI device pass — **no longer gated on Phase 30B** |
| **ISS-14** | Low → **`[~]`** | `origin/wip/backup-working-tree` (2026-09-28) is stale and **fully superseded** — measured again 2026-10-11: **1 commit ahead, 97 behind** `main`, its one unique commit being the backup itself. **Disposition: retained, no action** (§27AL) — its checklist is smaller (1040 vs 2160 lines), `main` already has `31D.6`, the 18c/18e plan docs exist on `main`, its `eas.json` change is already on `main` | `git diff main...origin/wip/backup-working-tree` | Delete or leave with a recorded "no action" (P3-4) |
| **ISS-15** | Info → **`[✓]`** | Three test baselines from three dates, none current | TS manifest (259 unit) · `docs/freebuff/TEST_BASELINE.md` (server 838 / mobile 21 suites, frozen 2026-09-30) · CLAUDE.md N-3 (mobile 36 suites / 509) | **Done 2026-10-11:** CI declared the single source of truth, and both files annotated **in place** beside the figures they freeze (§27AL, §27AH *Verification requirements*) |
| **ISS-17** | Medium | **The SDK 57 patch rollup cannot be installed** — `expo install --check` asks for `expo ~57.0.27` / `expo-constants ~57.0.21` / `expo-linking ~57.0.12` / `expo-router ~57.0.25`, but taking it nests `expo-modules-core@57.0.21` under `node_modules/expo/` where root-level `jest-expo` cannot resolve it (48/48 suites fail), and declaring it directly is `ERESOLVE`: it wants `react-native-worklets ^0.7.4…^0.10.0` while `expo-router@57.0.25`'s `react-native-reanimated@4.7.0` forces `0.13.x` | Reproduced from `main` on 2026-10-10 by two routes; Dependabot PR **#38** failed identically and its lockfile dropped the package entirely | **Declined as a whole** and moved to the SDK 58 train (§27AI, §27AK); #38 **closed** with the evidence. Accepted consequence: `expo install --check` reports outdated until then — known, not unnoticed |
| **ISS-18** | Medium | **`npx`-driven npm commands fail on this host** — npm 11.19.1 rejects the stray `allow-scripts=9router` line in `~/.npmrc` when it arrives **as a flag**, and `npx` forwards it; `npx patch-package` and `expo install` / `--fix` all fail, plain `npm install` works | Measured three ways 2026-10-10; full account in §27AK | Workaround in use: `npm_config_userconfig=<empty file>` for the command, or the equivalent plain `npm install <pkg>@<ver>`. **Owner-side:** the global `~/.npmrc` line was deliberately left alone. CI is unaffected |
| **ISS-16** | High | **PR #34 moves five Expo-pinned packages outside SDK 57** — `react-native` 0.86.3 → 0.87.1, `react` 19.2.3 → 19.3.0, `react-dom` 19.2.3 → 19.3.0, `react-native-safe-area-context` ~5.7.0 → ~5.10.1, `react-native-screens` ~4.26.0 → ~4.28.0, plus the matching `@types/react` ~19.3.0. Expo SDK 57 expects exactly the old values, and CI runs no `expo-doctor` / `expo install --check`, so a green typecheck cannot see the native incompatibility — it would surface in the next native build | `mobile/node_modules/expo/bundledNativeModules.json` vs `gh pr diff 34` (both read 2026-10-10); `mobile/package.json` | **Do not merge as-is.** Close or hold PR #34 and take these versions with the Expo SDK 58 train via `npx expo install --fix` (issue #32); decide whether Dependabot should ignore the Expo-pinned set (P0-2 — **decided and completed**, §27AL); **and the detection gap named here is closed** — `mobile/__tests__/expo-sdk-pins.test.ts` holds every Expo-managed dependency to the installed SDK's own pin table, positive control included (§27AN) |

| **ISS-19** | Medium → **`[✓]`** | **The deferred-upgrade watch reported `jest-expo` as `READY` while §27AI Gate 0 was shut** — the gate asked whether *any* jest-expo release admitted jest 30 (reading the prerelease tag `next`, 58.0.9) rather than whether the **installed** SDK's pin did, and never checked installability: 58.0.9 also peers `@react-native/jest-preset@^0.88.0-rc.4` against this project's RN 0.86.3. **Its third watch had the same flaw:** it read `@typescript-eslint/parser`, a package **neither workspace depends on**, while `server/` resolves the `typescript-eslint` meta package and `mobile/` resolves the parser through the SDK-pinned `eslint-config-expo` | `scripts/check-upgrade-watches.mjs` read at source 2026-10-11; §27AQ recorded the `READY` in the same section as the sentence saying jest 30 rides with the SDK 58 promotion | **Fixed 2026-10-11 (§27AU + its follow-on):** each gate reads the constraint that actually governs it — the installed SDK's pin table and the RN preset peer for `jest-expo`, one line **per workspace** for `typescript-eslint` — so all three watches report `DEFERRED`; guarded by **15 controls** run before every report, with break/restore proof for both bug classes (`expected ["DEFERRED"], got ["READY"]`, exit 1, three separate times) |

**Correctly recorded as open or deferred — not issues:** L-17 (recovery-mail delivery never inspected end-to-end),
B1's residual timing term, B2 / E3 / OD-10 (V4), owner decisions O-5 / O-6 / O-10 / O-11, P-4 (device-time),
P-6 + Gate 1 + iOS app registration (environment-blocked), and the new-identity `REGISTRATION_REQUIRED` path.

## Pending

**Fixes:** ISS-06 (with the SDK 58 train) · ISS-17/ISS-18 (decided and recorded, no action pending) · ISS-13 (**fixed, §27AM** — its device half rides with the same pass). *(ISS-01 fixed in #36; ISS-16 disposed in #37; ISS-02 remediated — §27AJ; the 7 advisories dispositioned — §27AK; all 2026-10-10.)*
**Upgrades, in issue #32's order:** Expo SDK 58 — **deferred by Gate 0 until Expo promotes it to `latest`** (§27AI records the decision and the runbook; the pins differ from PR #34's set — RN 0.88 family, not 0.87.1) → the React 19 type fixes (ISS-01 is the first of them) → TypeScript 7 →
jest 30 → ~~the `actions/*` v7 re-pin~~ (**taken early 2026-10-11 — ISS-12 resolved, §27AO**) → ~~`dotenv` 18 and `@types/bcryptjs` 3~~ (**taken 2026-10-11 — §27AP**: `dotenv` 18 taken with the preload path measured; the `@types/bcryptjs` row's premise was wrong — 3.0.0 is a deprecated stub, so the dependency was **removed** instead and `tsc` proves it). **The two that remain are now measured, not pending:** jest 30 arrives *with* the SDK 58 promotion (`jest-expo@58.0.9`), and TypeScript 7 is upstream-blocked on a typescript-eslint line that admits 7 (§27AQ).
**Testing:** the L-17 mail leg, owner-assisted; and a dated test baseline for this section.
**Documentation:** Phase 30B (P3-1) — **the only one left**; `docs/freebuff/*` is **decided (retained, §27AL)**, and the corrections and the device guide are done.
**Deliberately not scheduled:** Facebook Login, Apple Sign-In, and everything in §35 V2/V3/V4. No new feature work
before P0–P2 are clear.

## The order to work in

**P0 — remove the only red check, correctly.** Fix ISS-01's four `null`-typed prop values in code, on a branch from `main` — they are the React 19.3 type migration the SDK 58 train needs. Then dispose of **PR #34** (ISS-16): it moves five Expo-pinned packages outside SDK 57, so it must not merge as it stands.
*Exit:* `npx tsc --noEmit` and `npx jest` green in `mobile` on `main`; `server`/`secret-guard` stay green; PR #34 closed or held with the ISS-16 reason recorded.
*Why:* it is the only red check in the repository, and a dependency queue is healthy only when every entry is either SDK-compatible or declined with a recorded reason — PR #34 is the second case.

**P1 — correct the documented facts that mislead.** ISS-03, ISS-09, ISS-10, ISS-11 (done 2026-10-10); ISS-04, ISS-05,
ISS-08 (done 2026-10-10). *Exit:* every corrected figure re-read from its source at edit time.

**P2 — the security-relevant native layer, before the next native build.** ~~ISS-02~~ (**remediated 2026-10-10, §27AJ** —
native confirmation rides with the SDK 58 device pass) and ~~the advisory queue~~ (**dispositioned 2026-10-10, §27AK** —
2 of 7 fixed, 5 accepted with reasons), then ISS-06 and issue #32's upgrade train. *Exit:* CI green at each step; one device
build launched and used per native change. *Dependency:* P2's ISS-01 pattern is established (#36).

**P3 — decisions and housekeeping (owner input required).** Define or remove **Phase 30B** and assign ISS-13 to it;
decide `docs/freebuff/*`; commit or discard the device guide; dispose of the stale WIP branch; declare CI the single
test-count source. *Why:* phase discipline is unenforceable while a "phase" has no scope and three documents disagree.

**P4 — deferred and accepted debt.** B1's residual, B2 / E3 / OD-10, L-17, O-5 / O-6 / O-10 / O-11, and the iOS gates
(environment-blocked — no progress is possible on this host). Revisit only when P0–P3 are clear or a disposition changes.

## Immediate next actions

1. **Decision: the device run's account (§27AT)** — the app is installed and rendering on the phone, but the
   local backend's database is empty, so nothing behind the login is reachable. Three ways forward, owner's
   choice: register a fresh test account through the app (exercises AUTH-04 end to end, needs a mailbox),
   point `EXPO_PUBLIC_API_URL` at the deployed backend and use the real account (immediate, live data), or
   seed the local database with a test tenant (instant, skips the registration and verification paths).
2. **Decision: P3-1 (Phase 30B)** — define it or remove its references (ISS-07). **The only item left that
   cannot be settled from the repository**: everything else in P0–P3 is now shipped, dispositioned, deferred
   with a record, or awaiting a build — ISS-13 included (§27AM).
3. **Keep the upgrade watches — one command, now with its own proof:**
   `node scripts/check-upgrade-watches.mjs` (`--self-test` runs the 15 controls alone; **§27AU**). Re-read
   **2026-10-11**: the SDK 58 **Gate 0 is still closed** (`latest` 57.0.27, `next` 58.0.7) — and after the
   §27AU correction **all three watches report `DEFERRED`**, `jest-expo` included: jest 30 rides with that
   promotion, and `jest-expo@58.0.9` additionally needs *SDK 58's* RN jest preset (`^0.88.0-rc.4`) against
   this project's 0.86.3, so it is not installable here even once jest 30 exists. **TypeScript 7 is
   upstream-blocked on two different lines** — `server/`'s declared `typescript-eslint` meta package and the
   parser `mobile/`'s SDK-pinned `eslint-config-expo` resolves both read `typescript >=4.8.4 <6.1.0`, and no
   published release admits 7. When `latest` moves to 58, execute §27AI.
4. **Carry the two build-time confirmations into the next native build** — the remediated PII line absent
   from logcat (ISS-02) and the generated `compileSdk`/`targetSdk` values read and recorded (ISS-06). Neither
   can be closed without one, and neither is claimed as closed today. **F-26 sharpens this:** the client on the
   phone was built 2026-10-03 and so **predates** the ISS-02 patch, which means the device under test is *known*
   to still carry the unpatched logging — a fresh `development` build is the only way to close it (§27AT).

**Do not:** start any V2/V3/V4 feature, write to production, or push directly to `main`. PRs #34 (ISS-16) and #38 (ISS-17)
are closed with their reasons; those versions arrive only with the SDK 58 upgrade.

## Verification requirements

- **Authentication.** `cd server && npm run typecheck && npm run lint && npm test`; `cd mobile && npx tsc --noEmit &&
  npx eslint . && npx jest`. Local smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health/ready`
  → 200. On device: a rejected session must surface the documented codes (`SESSION_EXPIRED`, `SESSION_INVALIDATED`),
  never a generic error. Never verify auth changes against production with real accounts.
- **Email verification (AUTH-04).** A missing payload must answer `400 VALIDATION_ERROR` from the validator, before
  any service, DB or mail work. The request path enforces a 60-second per-UID cooldown. **L-17 remains open:** the
  mail leg has never been inspected end-to-end and needs a mailbox (owner-assisted) — request, receive, confirm,
  then check that Firebase `emailVerified` flips false → true and the Mongo challenge is consumed. Never against production users.
- **Render backend.** Non-mutating probes only. A malformed identity answers `503 FIREBASE_UNAVAILABLE` **by design**
  (`auth/argument-error` is classified transient so an upstream blip cannot destroy valid sessions) — that is not an
  outage. Never run writes, registration or mail-sending probes against production to "check it works".
- **React Native app on the device.** Three independent signals: Metro printing `Android Bundled … expo-router\entry.js`;
  the app rendering (read it mechanically with `adb shell uiautomator dump`); and the **local** server logging
  `{"type":"http",…}` lines as you use it. If the first two pass and the third stays silent, the app is pointing
  elsewhere — check `EXPO_PUBLIC_API_URL` in `mobile/.env` (it must be reachable **from the phone**) and restart Metro
  with `--clear`. A `preview`/`production` APK cannot load your edits: an EAS **`development`** build is required.
  Known environment limit: ColorOS refuses the shell `WRITE_SECURE_SETTINGS`, so scrcpy's `-w` (stay-awake) is
  declined — raise the phone's screen timeout instead. Full procedure: `docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md`.
  **For a cabled run, prefer the USB tunnel over the LAN address (F-28):** `adb reverse tcp:8081 tcp:8081` and
  `adb reverse tcp:4000 tcp:4000` with `EXPO_PUBLIC_API_URL=http://localhost:4000` needs no Wi-Fi, no DHCP-lease
  match and no firewall rule, and it is what §27AT's run was performed with. *(**F-28 resolved 2026-10-11:** the
  guide no longer presents it as the alternative — §7b is titled **"The USB tunnels (verified)"** and leads with
  them, so the promotion this note asked for is done.)* Also: a **`development`** client is mandatory and its **native**
  layer ages silently, so check `eas build:list` for the newest `development` build and rebuild if the change
  under test is native (F-26).
- **Baseline.** CI is the **single source of truth** (ISS-15); dated local counts are kept here only as
  snapshots. Latest: **2026-10-11 — mobile 50 suites / 666 tests, 0 failures** (49/660 at `3beaf85`, plus the
  pin guard); server at that date **185 suites / 1312 tests, 0 failures** (`3beaf85`). Re-read the numbers at
  execution; never quote a stale figure.

## Tracking

- [x] **P0-1** ISS-01 four `null`-typed prop values fixed — **merged (#36, `aadab04`)**, tsc/eslint/jest 644 tests
- [x] **P0-2** ISS-16 **PR #34 closed**; Dependabot carve-out **merged (#37, `bf0c915`)**
- [x] **P1** ISS-03 / ISS-04 / ISS-05 / ISS-08 / ISS-09 / ISS-10 / ISS-11 corrections *(done 2026-10-10)*
- [x] **P2-1** ISS-02 RNFirebase PII remediation — **implemented, artifact-verified and merged (#40, 2026-10-10, §27AJ)**; device re-check rides with the SDK 58 pass
- [x] **P2-4** the 7 dependency advisories **dispositioned** — 2 fixed, 5 accepted with reasons, SDK 57 rollup declined (§27AK); Dependabot #38 closed
- [ ] **P2-2** ISS-06 P-3 SDK alignment — **`[⛔]` corrected to `[~]` on 2026-10-10** (library values, expected-benign); confirmation needs the next native build
- [ ] **P2-3** issue #32 upgrade train — **partly taken 2026-10-11:** the two action re-pins (§27AO, ISS-12 resolved) and the server pair (§27AP: `dotenv` 18 taken with its preload path measured; `@types/bcryptjs` removed — its 3.0.0 is a deprecated stub); what remains is **gated, not pending** — SDK 58 on Gate 0, jest 30 with that promotion, TypeScript 7 upstream (§27AQ, `scripts/check-upgrade-watches.mjs` — whose `jest-expo` `READY` was wrong and is now corrected with controls, **ISS-19 / §27AU**)
- [ ] **P2-5** ISS-18: the `~/.npmrc` `allow-scripts` line — **owner-side**, workaround recorded (§27AK)
- [x] **P2-6** the Expo pin set is held in CI — ISS-16's detection gap closed by a guard suite against the installed SDK's own table, positive control included (§27AN)
- [ ] **P3-1** Phase 30B defined or its references removed (ISS-07) — **decision needed**; ISS-13 is no longer waiting on it (§27AM)
- [x] **P3-2** `docs/freebuff/*` **retained, decided** (audit/provenance layer; counts annotated as frozen) — §27AL
- [x] **P3-3** device guide **committed** (2026-10-10; `docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md`)
- [x] **P3-4** stale WIP branch — **retained, no action** (ISS-14: 1 ahead / 97 behind; the unique commit is the superseded backup itself) — §27AL
- [x] **P3-5** test-count source **declared**: CI is the source of truth, and the two older baselines now say so in place (ISS-15) — §27AL
- [x] **P3-6** Dependabot carve-out **completed** — every Expo-pinned package excluded, derived from the installed SDK (18 of 22 names) — §27AL
- [ ] **P4** deferred debt — no action (B1, B2, E3, OD-10, L-17, O-5/O-6/O-10/O-11, iOS gates)

## Documents corrected on 2026-10-10

`README.md` (module language and the Expo Go quick-start), `CLAUDE.md` (module count, the removed monitors,
AUTH-04-H, the advisory count), `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` (advisory count, and separating advisories
from deferred majors), `docs/TS-MIGRATION-MANIFEST.md` (module count annotated), and §35 and §27AE of this file.
Deliberately **not** changed: `docs/SOURCE_PROTECTION.md` and `SECURITY.md` were already correct for the private-repo
state, and `docs/freebuff/*` awaits its decision (P3-2).

---

# 27AI. Expo SDK 58 upgrade — the approved procedure (2026-10-10)

## Why this exists, and its status

Issue #32 lists **Expo SDK 58** as the first deferred major, and §27AH's P2 train says the RN/React
versions must arrive through `npx expo install --fix` rather than a raw Dependabot bump (ISS-16 —
PR #34). This section is the **runbook**: the ordered steps, the checks, the device acceptance pass
and the rollback, so the upgrade can be executed without re-deriving any of it.

**Approval:** approved by merge `f2f6731` (PR #35, 2026-10-10). **Execution has not started** — the Gate 0
decision below currently defers it until SDK 58 reaches `latest`.

## Gate 0 — release status (re-check at execution)

Read on 2026-10-10 with `npm view expo dist-tags`: `latest = 57.0.27`, **`next = 58.0.7`**,
`canary = 58.0.0-canary…`. SDK 58 is **not yet the stable channel**, and `expo@58.0.7` pins
`react-native` **0.88.0-rc.4** — a release candidate. Therefore:

- **Preferred:** wait until Expo promotes SDK 58 to `latest` (the pins are then final), then execute.
- **Alternative:** execute on the pre-release SDK **only by an explicit owner decision**, recorded in
  the executing PR. Re-run `npm view expo dist-tags` at execution — never trust this line.

**Decision (2026-10-10, made under the owner's standing delegation): wait for promotion — do not execute on the
pre-release.** A native SDK move on a pinned release candidate is exactly the class of change JS-only CI cannot
validate (ISS-16's lesson), and majors are taken deliberately. **Watch:** run `npm view expo dist-tags` at the start
of any session that considers executing; begin when `latest` is a 58.x release. If the pre-release path is chosen
later, replace this paragraph with that decision, its date and its rationale.

## Verified target set (read from the package, not guessed)

`npm pack expo@58.0.7` → its `bundledNativeModules.json`, 2026-10-10:

| Package | SDK 57 today | SDK 58 declares | PR #34 proposed |
| --- | --- | --- | --- |
| `react` | 19.2.3 | **19.3.0** | 19.3.0 |
| `react-dom` | 19.2.3 | **19.3.0** | 19.3.0 |
| `react-native` | 0.86.3 | **0.88.0-rc.4** | 0.87.1 |
| `react-native-safe-area-context` | ~5.7.0 | **~5.9.1** | ~5.10.1 |
| `react-native-screens` | ~4.26.0 | **~4.28.0** | ~4.28.0 |

Two lessons held verbatim: the SDK — not Dependabot — decides, and **PR #34 was wrong on two of
five** (RN and safe-area). Everything else the SDK pins follows `expo install --fix`;
`@types/react` (dev-only, not in the map) must move alongside to ~19.3.x or `tsc` will say so.

## Prerequisites (all must be true before step 1)

- [ ] PRs #35 (docs), #36 (ISS-01 fixes) and #37 (Dependabot carve-out) merged; `main` green.
- [ ] The Gate 0 decision recorded.
- [ ] One development-build slot on the Android device — this plan ends with a device pass, not a CI result.
- [ ] Issue #32's SDK 58 entry open and linked to the executing PR.

## The procedure

1. **Branch + baseline.** `git checkout -b chore/expo-sdk-58 main`. Record the green baseline:
   `cd mobile && npx tsc --noEmit && npx eslint . && npx jest --ci` (2026-10-10: 47 suites / 644
   tests) and `npx expo install --check` (clean on SDK 57 — if not, stop and record why).
2. **Bump the SDK only.** `npx expo install expo@^58.0.0` (pin the exact released version if Gate 0
   chose one). Do not hand-edit `package.json`.
3. **Align every pinned dependency.** `npx expo install --fix`, then `npx expo install --check` →
   **must report no mismatches**; paste both outputs into the PR. If `--fix` moves any of the packages
   the Dependabot carve-out excludes, that is the sanctioned path — **do not relax the ignore rules**, and
   do not bump them by hand. Since §27AL the carve-out covers **every** package the installed SDK pins, so
   the excluded set and the set `--fix` is expected to move are the same set by construction.
4. **Doctor.** `npx expo-doctor` → triage every finding. Expected guest: RNFirebase's
   `compileSdk`/`targetSdk` 34 vs 36 (**ISS-06 / P-3** — re-read 2026-10-10: 34 is RNFirebase's own
   **library** value and a library may compile below the app. Read and **record the generated app values**
   here, and raise the **app's** levels through `expo-build-properties` if Play policy requires it).
   Any warning left standing needs a dated record; none may be ignored silently.
5. **Type pass.** `npx tsc --noEmit`. The four ISS-01 sites are already fixed (#36); **any new error
   is new information** — fix it in code. `as any`, `@ts-ignore` and relaxed tsconfig are not options
   (project rule).
6. **Lint + tests.** `npx eslint .` and `npx jest --ci`; every failure is an SDK behavior change
   until proven otherwise. No snapshot updates or weakened assertions without a recorded reason.
7. **CNG sanity.** No `ios/` or `android/` directory may appear (Phase 30A rule); check `git status`
   and `npx expo config --type public`.
8. **CI.** Push the branch; the `mobile` job is the gate and `server`/`secret-guard` must stay green.
   Do not merge red, and do not merge with `expo install --check` mismatched.
9. **Development-build validation pass — the acceptance gate.** For a native SDK move, a JS-only
   pass proves nothing:
   - `eas build --profile development --platform android`; record the build ID. iOS stays export-only
     (environment-blocked).
   - Install, then `npx expo start --dev-client --clear`; open the app.
   - Require the three independent signals (§27AH): Metro prints `Android Bundled … expo-router\entry.js`;
     the app renders (read mechanically with `adb shell uiautomator dump`); the local server logs
     `{"type":"http",…}` lines as the app is used. If the first two pass and the third stays silent,
     check `EXPO_PUBLIC_API_URL` (must be reachable from the phone) before touching the SDK.
   - Smoke journeys: Firebase sign-in and the AUTH-03 renewal path; the three list surfaces touched by
     #36 (empty / loading / error / footer states); the email-verification screen; one stock-in and one
     stock-out; one transfer; and **one label round-trip** — print a label, then scan the printed code back
     with the app's own scanner (ISS-13, §27AM). In logcat, confirm the remediated RNFirebase PII line (ISS-02, §27AJ) is
     **absent** — a `Log.d` line for `addAuthStateListener:eventBody` must not appear — and that the
     patch still applies at this version.
   - Device limit to expect: ColorOS refuses `WRITE_SECURE_SETTINGS`, so raise the screen timeout
     manually (see `docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md`).
10. **Merge criteria.** All of: CI green; `expo install --check` clean; doctor findings resolved or
    waived with a record; the device pass recorded (build ID, date, journeys); test counts re-read and
    recorded in §27AH; no unrelated changes in the diff.
11. **Land and close out.** Squash-merge; delete the branch; close issue #32's SDK 58 entry; update
    §27AH's status rows and advisory count (re-read it); **re-derive the Dependabot carve-out against the
    new SDK** (§27AL — the ignore list is measured from `bundledNativeModules.json`, so a new SDK moves the
    pins and the list must move with them).

## Rollback

Revert the single upgrade PR on `main`; reinstall the previous development build if the device build
regressed. The Dependabot ignores and all policy stay untouched — a revert needs no config change.
Record the reason and reopen issue #32's entry.

## Risks (recorded, not glossed)

- **First real RN 0.88 native build** — JS CI cannot prove it; only step 9 can.
- **Pre-release pins** — the RN RC is exactly what Gate 0 exists for.
- **`compileSdk` (P-3 / ISS-06)** — the upgrade is where it gets *read*: record the generated app values and any
  Gradle warning. A library compiling below the app is not itself a blocker (see §27AH ISS-06).
- **ISS-02 PII** — remediated at the artifact level (§27AJ); this pass is where the fix is finally observed on a device.
- **Advisories drift** — re-read the count at execution (7 on 2026-10-10); some may change with the
  new dependency graph.
- **iOS** — unverifiable on this host; export-only until a macOS host exists.

## Evidence to record when executed

Branch + PR number; CI run URL; `expo install --check` and `expo-doctor` outputs; EAS build ID;
device-pass notes (signals + journeys); new test counts; updated §27AH rows; closed issue #32 entry.

---

# 27AJ. ISS-02 — the RNFirebase Auth PII log, remediated (2026-10-10, PR #40)

## The finding, re-read at source

`@react-native-firebase/auth` **26.4.0** — the pinned and current version — logs the Firebase user
object from `NativeRNFBTurboAuth.java`. Read line by line on 2026-10-10, the site is **exactly one
line**, `addAuthStateListener:eventBody`, whose payload is `firebaseUserToMap(user)`: **uid, email,
display name, provider metadata**. The call is **not** wrapped in a `BuildConfig.DEBUG` guard, so it
is reachable in a release build, and it lands in **device logcat** only — the app never transmits it,
and **no credential is in it** (no ID token, no password, no hash). The exposure is an `adb logcat`
reader on an unlocked, USB-debugged device; a device with logging restricted, or a released build on
a locked device, is not exposed.

Two adjacent claims were re-checked rather than assumed:

- The **id-token listener logs nothing**, so the earlier "no token" statement is true at the source.
- The **iOS side of the same package contains zero `Log` calls** — this is Android-only and needs no
  iOS counterpart.

Our own code is clean: `mobile/lib`, `mobile/app` and `mobile/components` contain **zero**
`console.*` calls (the single grep hit is a comment).

## Decision — patch it out, and keep the patch honest

| Option | Outcome |
| --- | --- |
| Do nothing | **Rejected** — release-reachable account-identity PII, and the cost of removing it is one line |
| R8/ProGuard `Log.d` stripping | **Not implemented** — a build-wide change with its own diagnostic risk, verifiable only with a release build on the EAS-managed Android path. Kept in reserve for the SDK 58 train |
| `patch-package` patch removing that single call | **Chosen** — dependency-local, reviewable as a 9-line artifact, applied automatically on every install, `Log.e` diagnostics preserved |

**There is no version to bump into:** 26.4.0 **is** the latest published `@react-native-firebase/auth`,
so the remediation cannot be a dependency update. An upstream report is recommended and recorded as a
follow-up — this change does not file one.

## Mechanism, as implemented

- `mobile/package.json` — `patch-package` as a **devDependency** plus
  `"postinstall": "patch-package --error-on-fail"`, so a fresh clone, CI's `npm ci` and an EAS build
  all apply the patch before anything compiles **and a failed apply stops the install** (why the flag
  is not optional: measured below).
- `.gitattributes` — `*.patch text eol=lf`, so the patch is byte-identical in a Windows working copy
  and on a Linux runner rather than LF in the repository and CRLF on this host.
- `mobile/patches/@react-native-firebase+auth+26.4.0.patch` — **one removed line, zero added**; no other
  `Log.d` call in the package is touched, and neither is the data emission or the event send.
- The patch name is **derived from the pinned version**. When the dependency is bumped the patch stops
  applying, `postinstall` fails loudly, and the guard below fails first saying why. A silently lost
  patch is the failure mode worth preventing, not a build that limps on unpatched.

## Verification — what was run, and what it does not cover

| Check | Result |
| --- | --- |
| Patch content re-read | one removed line, correct hunk, `Log.e` + `firebaseUserToMap` untouched |
| End-to-end apply | package directory deleted, `npm install` run → **`postinstall` re-applied the patch and the PII line was absent** in the reinstalled package (the fresh-clone / CI / EAS path) |
| Guard suite | `mobile/__tests__/iss-02-rnfirebase-auth-pii-patch.test.ts` — **8 cases, passing** |
| Full mobile suite | **48 suites / 652 tests, 0 failures** (baseline 47 / 644 → **+1 suite / +8 tests**) |
| Fresh Windows checkout | patch restored from the blob with `.gitattributes` in place: **933 bytes, LF, zero carriage returns** (asserted by the suite) |
| Mobile `tsc` / `eslint` | clean (exit 0) |
| Lockfile | **purely additive** (`+173`), no transitive churn, no audit delta |

The guard sits at the artifact layer because that is what can be asserted here: the native code is not
compiled on this host, and `node_modules` is neither committed nor guaranteed present. It pins the
patch name to the pinned version, the `postinstall` hook, the exact target file, the single removed
line, and — when the package *is* installed — that the installed source no longer contains the call.
A version bump therefore fails the suite with a regenerate-the-patch message rather than passing quietly.

## Limits — recorded, not glossed

- **No native Android build of the patched source has been run, and the log has not been observed
  absent on a device.** That is the remaining acceptance step; §27AI's device pass now names it.
- The device guide's logcat check is a **check**, not a measurement.
- **Disposition: `[!]` → `[~]`.** Remediated and verified at the artifact level; **not closed** until a
  development build confirms the line is gone from logcat.

## Two things measured while hardening this

**A failed apply is silent locally, and lethal on CI.** Patch-package 8.0.1 exits **0** on a genuine
apply failure unless `--error-on-fail` is passed — the flag is **on by default only when `CI` is set**.
Measured three ways against a deliberately inapplicable patch: default flags → exit **0** with the
error printed (a Windows install would carry on unpatched); `--error-on-fail` → exit **1**; `CI=true` →
exit **1**. Hence the explicit flag in `postinstall`, and the guard suite pins it. A stale patch after a
dependency bump now stops the install everywhere, not only on the runner.

**CRLF is not the hazard it looks like.** Git warned it would rewrite the patch's line endings on this
host, so it was tested rather than assumed: with a pristine source file, **both an LF and a CRLF copy of
the patch applied correctly and removed the line** (`@react-native-firebase/auth@26.4.0 ✔`, exit 0).
The `.gitattributes` rule is therefore **determinism, not a workaround** — and an earlier apparent
failure was this author's own mangled test fixture, which is recorded here so the next person does not
re-derive a wrong cause from it.

**And one environment note, for whoever regenerates the patch:** `npx patch-package` **cannot generate**
a patch here — `npx` injects an `--allow-scripts` config into the child npm process, which npm 11.19.1
rejects (`EALLOWSCRIPTS: --allow-scripts is not allowed in project-scoped installs`), and patch-package
swallows npm's output (`stdio: "ignore"`), surfacing only an opaque spawn error. Invoking its CLI
directly through `node` generates the patch normally. **The apply path never shells out to npm**, so
`postinstall` is unaffected.

---

# 27AK. Dependency advisories — the per-alert disposition (2026-10-10)

Seven alerts were open on `mobile/package-lock.json`, all dependency-level, and §27AH's next action was a
**fix-or-accept note per alert**. This is that note. Every row was measured on 2026-10-10: the chain from
`npm ls`, the alert metadata from the Dependabot API, and for the one repair a full install plus the suites.

## The queue, and what each alert actually is

| Alert | Sev | Package | Chain | Ships in the app? | Patched | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| #4 | high | `@grpc/grpc-js` < 1.13.6 | `@react-native-firebase/app` → `firebase` → `@firebase/firestore` | **No** — the web SDK's Node gRPC transport; no app module imports the web SDK | 1.13.6 | **FIXED** — overridden to 1.14.6 |
| #3 | low | `@grpc/grpc-js` < 1.13.6 | same | No | 1.13.6 | **FIXED** — same override |
| #2 | medium | `decode-uri-component` ≤ 0.4.2 | `expo-router` → `query-string@7` | **Yes** — `expo-router`'s `getPathFromState` is bundled runtime code | 0.5.0 | **ACCEPTED** — no CJS-compatible fix exists |
| #1 | medium | `uuid` < 11.1.1 | `expo-sharing` → `@expo/config-plugins` → `xcode` | No — build/config time only | 11.1.1 | **ACCEPTED** — the fix is a major in a build tool |
| #5 | high | `node-forge` ≤ 1.4.0 | `expo` → `@expo/cli` | No — the CLI, not the bundle | **none** | **ACCEPTED** — unfixable |
| #6 | high | `braces` ≤ 3.0.3 | `jest` → `@jest/core` → `micromatch` | No — test tooling | **none** | **ACCEPTED** — unfixable |
| #8 | medium | `sprintf-js` ≤ 1.1.3 | `jest-expo` → `babel-jest` → `babel-plugin-istanbul` → `js-yaml@3` → `argparse@1` | No — coverage tooling | **none** | **ACCEPTED** — unfixable |

## Fixed — `@grpc/grpc-js` (2 of the 7)

An `overrides` entry raises it to **1.14.6**, above the 1.13.6 first patched version. It is the **Node**
gRPC transport of the Firebase *web* SDK: our own code imports the web SDK nowhere (the one grep hit is a
comment recording that the import was deliberately removed in Phase D) and `@react-native-firebase/app`
does not require it either, so React Native never executes it. The lockfile change stays inside that
package's own subtree — a nested `@grpc/proto-loader` and `@js-sdsl/ordered-map` — and **nothing else in the
tree moves**: the expo family is unchanged, `expo-modules-core` stays hoisted at the root, and the ISS-02
patch still applies. `npm ls` is clean of invalid, missing and extraneous entries; `tsc`, `eslint` and
**48 suites / 652 tests** are green.

## Accepted — and why, per alert

- **`decode-uri-component`** is the only accepted alert whose package is in a **production bundle**, so it
  gets the fullest reason. The patched version, **0.5.0, is ESM-only** — `"type": "module"` with an exports
  map whose sole entry is an ESM default — while `query-string@7.1.3` is CommonJS and reaches it through
  `require()`. Forcing the override would therefore break resolution in the exact place Expo Router uses it,
  which is a worse outcome than the advisory. The correct fix is upstream: a `query-string` major that no
  longer depends on it, shipped by Expo. **Impact, stated plainly:** the advisory is a malformed-`%`-sequence
  DoS in the *device's own* URL parsing — a crash, with no data exposure and no server-side effect.
  **Re-check at the SDK 58 train.**
- **`uuid`** — `xcode` is used by Expo's config plugins at prebuild/config time and never in the bundle. The
  patched version is a **major** (11.x, ESM-first) while `xcode@3` asks for `^7.0.3`, so the override trades
  a real build-tool break for no runtime gain. Re-check when Expo moves `@expo/config-plugins`.
- **`node-forge`, `braces`, `sprintf-js`** — **no patched version exists at all** (Dependabot reports no
  `first_patched_version`), so neither a bump nor an override can clear them. They sit in `@expo/cli` and in
  Jest's own tree, neither of which ships. They clear when Expo and Jest publish fixes, and the alerts are
  the reminder.

## Declined — the SDK 57 patch rollup, and why Dependabot PR #38 had to be closed

`expo install --check` on `main` asks for four moves: `expo ~57.0.27`, `expo-constants ~57.0.21`,
`expo-linking ~57.0.12`, `expo-router ~57.0.25`. Dependabot's weekly group PR proposed three of them plus
`@expo/*` internals, and its `mobile` job failed with **all 48 suites** at `jest-expo`'s preset —
`Cannot find module 'expo-modules-core'`. Its lockfile contains **no `expo-modules-core` entry at all**.

It was reproduced from `main` by hand, through the sanctioned command, and the cause is upstream:

1. With the move taken, the lockfile's `expo@57.0.27` **peer-depends** on `expo-modules-core`, and the
   resolver places `expo-modules-core@57.0.21` **nested** at `node_modules/expo/node_modules/`, where
   root-level `jest-expo` cannot resolve it — the identical 48-suite failure by a different route.
   (Measured for contrast: on `main` the same package is hoisted at the root.)
2. Declaring `expo-modules-core` directly — it **is** listed in `expo/bundledNativeModules.json` as
   `~57.0.21`, so that is the sanctioned version — is **unsatisfiable**: npm answers `ERESOLVE`, because
   `expo-modules-core@57.0.21` requires `react-native-worklets ^0.7.4 … ^0.10.0` while
   `react-native-reanimated@4.7.0` (an optional peer of `@expo/ui` ← `expo-router@57.0.25`) requires
   `react-native-worklets@0.13.x`. **The two cannot coexist** — which is precisely why #38's lockfile
   dropped the package rather than failing loudly.

**Disposition: declined as a whole, recorded, and moved to the SDK 58 train** (§27AI), where the tree moves
together under the runbook and its device pass. Taking part of it would leave `expo install --check` failing
for the remainder. `main` stays green and internally consistent on SDK 57.0.26, and **#38 is closed** with
this evidence in its thread. The accepted consequence is stated rather than hidden: the project is
**knowingly one patch behind what Expo's own check asks for** until the SDK 58 upgrade,so that check will keep reporting outdated dependencies — a known state, not an unnoticed one. **The queue can
no longer re-propose it:** the Dependabot carve-out was completed on 2026-10-11 so that *every* Expo-pinned
package is excluded, derived from the installed SDK rather than from a curated list (§27AL).

## Environment finding — npm 11.19.1, `allow-scripts`, and every `npx`-driven npm spawn

Found while trying to run those sanctioned commands. `~/.npmrc` on this host carries a stray
`allow-scripts=9router` line, and npm 11.19.1 **rejects that key when it arrives as a flag** in a
project-scoped install:

```
npm error code EALLOWSCRIPTS
npm error --allow-scripts is not allowed in project-scoped installs.
```

Measured three ways: plain `npm install` and `npm install --dry-run` **succeed** (the value comes from
config), an explicit `--allow-scripts=…` flag **fails**, and `npx`-driven tools **forward it** — so
`npx patch-package` (patch generation) and `expo install` / `expo install --fix` (their npm sub-process) all
fail on this machine.

- **CI is unaffected:** it runs `npm ci` directly, and no runner carries this user config.
- **Workaround used:** point npm at an empty user config for that one command —
  `npm_config_userconfig=<empty file> ./node_modules/.bin/expo install --fix`. Where even that failed, the
  equivalent plain `npm install <pkg>@<version>` finished the work without routing through npx.
- **Owner-side, deliberately not touched:** the `~/.npmrc` line is global and unrelated to Inventory AI.
  Removing it — if nothing else on this host needs it — would restore `npx`-driven npm tooling.

## Where this leaves the queue

**2 of 7 fixed** (`@grpc/grpc-js`, one high and one low), **5 accepted with a written reason** (one of which
is in a production bundle and carries a re-check at the SDK 58 train), and the SDK 57 patch rollup declined
with its upstream conflict documented. No alert is dismissed without a reason, and none is claimed fixed
that is not measured.

**Confirmed by the platform, not inferred:** after the merge, Dependabot reports both `@grpc/grpc-js` alerts
`state: fixed` (`fixed_at 2026-10-10T17:10:12Z`) and the open count at **5** — `sprintf-js` (medium),
`braces` (high), `node-forge` (high), `decode-uri-component` (medium), `uuid` (medium) — exactly the five
accepted above. Re-read the count before quoting it; it drifts.

---

# 27AL. Dependabot scope completed — every Expo-pinned package is excluded (2026-10-11)

## What changed, and why the rule is now mechanical

The mobile carve-out named **five** packages (`react`, `react-dom`, `react-native`,
`react-native-safe-area-context`, `react-native-screens`). Dependabot was therefore still free to propose
**every other Expo-pinned dependency** — and that is exactly where both dependency failures came from:
**#34** moved four SDK-pinned packages outside SDK 57 (ISS-16), and **#38** proposed the SDK 57 patch
rollup that **cannot install at all** (ISS-17, §27AK).

The rule is now mechanical rather than a curated list: **if the package is a key in the installed SDK's
`expo/bundledNativeModules.json`, it is excluded from version updates.** Measured on 2026-10-11 that is
**17 of the 21** mobile dependencies, with `expo` added explicitly because it carries the upgrade. The
three that stay open — `@react-native-firebase/app`, `@react-native-firebase/auth`,
`@react-native-google-signin/google-signin` — are version choices this project makes, so Dependabot may
still propose them.

## What this does, and what it deliberately leaves alone

- **Security updates are unaffected:** the header of `dependabot.yml` records that they are exempt from
  `open-pull-requests-limit` and from `update-types` filters, and that still holds.
- **Majors are unaffected:** the existing `*` / `version-update:semver-major` rule is untouched.
- **The SDK train is unaffected in kind, only in who proposes it** — these packages now move the way the
  policy always said they should: deliberately, with the SDK upgrade, through `npx expo install --fix`
  under the §27AI runbook.
- **What it stops:** a weekly red pull request that cannot be merged and has to be closed by hand. The
  queue's stated intent — "normally empty or trivially green" — is restored rather than re-argued weekly.

## Verification

`dependabot.yml` was re-read and validated in place: the YAML parses; three `updates` entries; every entry
carries `package-ecosystem`, `directory` and a valid `schedule.interval`; every `ignore` entry carries a
`dependency-name`; no duplicates. The mobile ignore list was then **compared against the installed SDK**:
18 names — the pinned set of 17 plus `expo` — with **no pinned package left uncovered and no non-pinned
package excluded**. That comparison is repeatable (`bundledNativeModules.json` is its authority) and must be
re-run when the SDK moves; it is the check that keeps this list from silently going stale.

**Not verified:** GitHub has not evaluated the file. `dependabot.yml` is read only from the default branch,
so the real confirmation is the next scheduled run producing no error — stated rather than assumed.

## The three housekeeping dispositions decided with it

- **P3-2 — `docs/freebuff/*`: retained.** Six files plus an empty `tasks/`, each self-labelled as an
  audit/provenance layer that claims no authority, last touched 2026-09-30 and referenced by nothing else.
  Deleting them destroys provenance rather than tidying anything, so they stay — with their counts
  annotated as frozen snapshots (ISS-15).
- **P3-4 — the stale WIP branch: retained, no action.** `origin/wip/backup-working-tree` measures **1
  commit ahead and 97 behind** `main`; its single unique commit is the backup itself, whose content §27AH
  already records as superseded. Deleting the only copy of a backup is destructive and buys nothing, so the
  recorded "no action" alternative is taken and the measurement is written down.
- **P3-5 — the test-count source: declared.** CI is the single source of truth; the two older baselines
  (`docs/freebuff/TEST_BASELINE.md` and `docs/TS-MIGRATION-MANIFEST.md`) now say so **in place**, beside
  the figures they freeze, instead of contradicting them from a distance.

---

# 27AM. ISS-13 — the Phase 30A "F-1" PDF-sharing finding, resolved as far as it can be (2026-10-11)

## Establishing what the finding was had to come first

ISS-13 has been carried since Phase 30A as *"F-1 (PDF-sharing finding) is still open and real"*, with its
evidence given as "`expo-print`/`expo-sharing` are dependencies; sharing code in
`app/(app)/products/[id]/index.tsx`" and its fix as "wherever 30B lands". **Its content was never written
down** — not in §27F, not in `docs/PHASE_HISTORY.md`, and not in the git history (searched 2026-10-11: the
identifier appears, a description never did). That is precisely why it could not be fixed: the record said a
defect existed without saying what it was, and every plan inherited the gap.

So the first step was to read the code rather than guess at it. The label path is `barcodeLabelHtml` (a
self-contained HTML page with an inline-SVG EAN-13) → `printAsync` (print) or `printToFileAsync` +
`Sharing.shareAsync` (save or share as PDF). Reading it found **one concrete defect and no others**.

## Fixed — the two label actions produced two different documents

`onShareLabel` passed the page geometry `barcodeLabelHtml` returns; `onPrintLabel` passed `{ html }` alone,
which lets `expo-print` fall back to its default page — **US Letter, 612×792**. Print and share therefore
produced different layouts from the same label: the printed one a small label adrift on a sheet of paper.
`expo-print`'s own types state that `width`/`height` apply "only with the `html` option", so the values were
being computed and then not handed over. Both actions now pass the identical `{ html, width, height }`.

Guarded by a new suite, `mobile/__tests__/product-label-print-share.test.tsx` (8 cases): the two documents
must be **exactly equal**; the page must be smaller than a sheet in both dimensions; the shared file is
offered as a PDF carrying the product name and its code; the document is self-contained (its only URL is the
SVG **namespace**, with no `src=`, no `file://`, no `<img>`, no `url(`); a barcode that is not an EAN-13
offers no label actions at all; an unavailable share sheet renders no file and says so; a PDF that cannot be
produced is refused rather than shared; and a print failure is reported with the actions left usable.

**Checked for meaning, not just for green:** reverting the one-line fix makes exactly the two geometry cases
fail and leaves the other six passing, so the suite pins the defect rather than the implementation.

## Still open — and now expressed as something a device can settle

Two claims cannot be made from a repository: that a printer and the OS share sheet render the file as
intended, and that a printed label **scans** back into the app's own scanner. The screen already instructs
the user to do exactly that ("Print it or save/share a PDF, then scan the printed code with the scanner to
verify it"), so the acceptance item is now a device round-trip, listed in the §27AI device pass beside the
PII and `compileSdk` confirmations.

**ISS-13 is consequently no longer gated on Phase 30B.** Its actionable half is fixed and its unverifiable
half has a named test; the P3-1 decision now concerns only what Phase 30B *is*, not where this finding
belongs.

# 27AN. ISS-16's detection gap closed — the Expo pin set is now held in CI (2026-10-11)

## The gap was named, and it was real

ISS-16's own evidence said it: *"CI runs no `expo-doctor` / `expo install --check`, so a green typecheck
cannot see the native incompatibility"*. Dependabot's PR #34 moved five native-moving packages outside SDK 57 —
`react` 19.2.3 → 19.3.0, `react-dom` likewise, `react-native` 0.86.3 → 0.87.1,
`react-native-safe-area-context` ~5.7.0 → ~5.10.1, `react-native-screens` ~4.26.0 → ~4.28.0 — and **both CI
jobs reported green**. The response at the time was a policy: `.github/dependabot.yml`'s ignore list, completed
to every Expo-pinned package in §27AL. A policy binds Dependabot; nothing bound a hand edit, another bot, or a
mistyped `npm install`.

## What now holds it

`mobile/__tests__/expo-sdk-pins.test.ts` — six cases, no new dependency, no network, no workflow change:

- **The source of truth is read, never transcribed:** the installed SDK's own
  `expo/bundledNativeModules.json`. A copy would drift from the thing it describes.
- **The rule is exact equality**, for every direct dependency the SDK names — runtime and dev, so `jest-expo`
  and `eslint-config-expo` are covered too. Nineteen packages are compared today and **zero deviate**. Equality
  is the form the table's values take (`react`/`react-native` bare, the rest `~`) and the form
  `npx expo install --fix` restores. A legitimate change moves the *installed* `expo`, and its table with it —
  which this guard follows without an edit; the SDK 58 train changes the table, not this file.
- **A patch-level move inside one SDK moves `expo` first**, table included; a *partial* move — the manifest left
  between two SDK patch levels — is the half-state this guard refuses. That is a different question from
  `expo install --check`'s **remote** view, which the project declined for SDK 57 with reasons (§27AK/ISS-17).
- **The boundary is asserted, not assumed:** RNFirebase and Google Sign-In are native too, but Expo pins
  neither, so a bump there must *not* be flagged — a case says so.

## Two protections against a guard that cannot fail

1. **A positive control inside the suite.** The five recorded PR #34 moves are kept as a fixture, applied to
   today's manifest, and the comparator must report **exactly those five**, each carrying both sides
   (`react-native: 0.87.1 (sdk 0.86.3)`).
2. **A measured mutation of the real manifest.** The same moves were written into `mobile/package.json` on
   2026-10-11: the guard failed naming them, and `package.json` was restored and verified blob-identical
   (`6e0188bb`).

## What it does not prove

That the set **builds** — that is still a native build's job, and ISS-02's and ISS-06's confirmations ride with
it. Nothing about transitive resolutions inside the lockfile, and nothing about patch-level currency against
Expo's remote table.

## Evidence

`mobile`: **50 suites / 666 tests, 0 failures** (from 49/660 at `3beaf85`), `tsc` 0, `eslint` 0. The server
suite, the workflows and every runtime path are untouched — the guard runs in the existing `mobile` job.

# 27AO. The workflow actions re-pinned to v7 — ISS-12 cleared early (2026-10-11)

## Why this item moved ahead of the train

Issue #32's suggested order puts the two action re-pins last: after SDK 58, the React 19 type fixes,
TypeScript 7 and jest 30. That order is about the **app's** dependency graph, where each move constrains the
next. This item has no relationship to it — GitHub Actions are CI infrastructure and no app module ever sees
them — so the only thing the order was buying was a deprecation warning on every run of every pull request
until the train could begin, and the train is blocked on Gate 0 (`latest` is still 57, §27AI). It was taken on
its own, deliberately, and recorded here rather than silently reordered.

## What changed

`actions/checkout` and `actions/setup-node` moved from `v4.4.0` to **`v7`** in all three jobs. Each pin is the
commit that action's floating `v7` tag resolved to via `git ls-remote` at the moment of the change — checkout
`v7.0.1` @ `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node `v7.1.0` @
`949feb2413d6458794dcd2491c4babbbce0c15c1` — never a moving tag in the workflow itself. Dependabot's closed
PRs #29/#30 had already shown v7 green in CI (issue #32's table records it), and this workflow uses only
`node-version-file` and the npm cache inputs.

## What it closes, and what it does not

**ISS-12 is cleared:** the Node 20 deprecation warning — printed on every run until now, including
`3beaf85`'s — is gone, because v7 targets the runtime GitHub is migrating to rather than one it
force-overrides. **Still waiting:** `dotenv` 18, `@types/bcryptjs` 3, TypeScript 7 and jest 30, and the
Expo SDK 58 train, which Gate 0 still holds.

The same stale `v4.4.0` claim lived in six places and was corrected with the change, not left standing: the
workflow header, `dependabot.yml`'s `github-actions` note, `CLAUDE.md`, checklist §42,
`docs/SOURCE_PROTECTION.md` and §27AE above.

# 27AP. The server-side queue items taken — and one row's premise was wrong (2026-10-11)

These are the two items in issue #32's deferred queue that touch only `server/`: unlike the mobile train they
are not gated by Expo SDK 58, and unlike the action re-pin (§27AO) they *are* runtime dependencies — so each
one was read before it was taken, and the reading changed one of them.

## `@types/bcryptjs` — removed, not bumped

Issue #32's row, written from Dependabot's pull request, says to take `@types/bcryptjs` 2.4.6 → **3.0.0**.
Reading the package first: **3.0.0 is a deprecated stub**, whose own description is *"Stub TypeScript
definitions entry for bcryptjs, which provides its own types definitions"*. `bcryptjs` itself is already
**3.0.3** here — declared and installed — and it ships `index.d.ts` and `umd/index.d.ts` through its exports
map. The row's action would therefore have installed a package whose only content is a notice saying it is not
needed.

Removed instead. The proof is the compiler: `npm run typecheck` ⇒ **exit 0** with the package gone, so the
three `import bcrypt from 'bcryptjs'` sites (`auth.service.ts`, `passwordReset.service.ts`, `users.service.ts`)
resolve the library's own declarations. Nothing else about the change is interesting, which is the point.

## `dotenv` 18 — taken, with its one risky behaviour measured

dotenv 18's changelog announces a CLI, an opt-in fast parser, and — the line that mattered — **"Removed:
Remove preloading. Instead use cli `dotenv run -- your-command`"**, while "injecting" output moves to stderr
and `.env.vault` support is dropped. This server's entire environment loading is `import 'dotenv/config'`
(`src/index.ts`, plus `cleanup-mongodb.mjs` and `cleanup-test-firebase.mjs`), and a break there would be
invisible in CI — CI supplies env vars directly, with no `.env` in the checkout.

So it was checked at the source and then measured: dotenv 18.0.7's exports map still publishes `./config` and
`./config.js`, and with 18.0.7 installed, an `import 'dotenv/config'` executed from `server/` against the real
`.env` loaded **5 of 5** sampled keys (`MONGODB_URI`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `OPENROUTER_API_KEY`
— reported as presence, never as values). The preload path survives; what the changelog removed is the older
documented pattern, not this entry point.

## Evidence

`cd server`: `npm run typecheck` 0 · `npm run lint` 0 · `check:extensions` 0 and `check:specifiers` 0 (337
modules, 1,677 specifiers, 0 stale) · `npm run test:unit` **695 passed, 0 failed, 33 deliberately skipped**.
The full suite and the `/ready` + `/live` + `SIGTERM` boot smoke are CI's, on a throwaway `mongo:7` container;
that run is the record for both.

# 27AQ. The deferred queue's remaining rows, measured — and the drift a script caught (2026-10-11)

## Why they were measured instead of quoted

Two of issue #32's remaining rows were worded as preferences — "take it deliberately with the types work",
"belongs in the same pass". Reading them rather than trusting the wording gives a different and more useful
answer: neither is waiting on a decision, and they are not waiting on the same thing.

- **`jest` 30 — delivered by the SDK 58 train.** `jest-expo@57.0.5` (the installed SDK 57 line) depends on
  `@jest/globals`, `babel-jest` and `jest-environment-jsdom` at `^29.2.1`. `jest-expo@58.0.9` — the newest
  58.x, currently `next` — depends on all three at `^30.0.0`. So jest 30 is **scheduled with SDK 58's
  promotion** (Gate 0, §27AI), which is exactly where issue #32's order puts it.
- **TypeScript 7 — genuinely upstream-blocked, and not by Expo.** The only published `@typescript-eslint`
  line is 8.x (`parser@8.70.0` in `mobile/`, `8.71.1` in `server/`), and both declare
`typescript >=4.8.4 <6.1.0`; there is no 9.x. *(Corrected 2026-10-11 — §27AU's follow-on: `server/` does
not depend on the parser directly at all. It depends on the meta package `typescript-eslint@^8.71.1`, whose
peer range is the one quoted here, and that is the line `server/` would move. The conclusion — upstream-blocked
in both workspaces — is unchanged; the package named for `server/` was not the one it resolves.)*

## The drift, kept rather than tidied away

The first reading of the jest-expo question was taken on **58.0.0** and showed `^29.2.1`; a conclusion was
recorded — *"the SDK 58 train does not by itself deliver jest 30"* — and minutes later the same question asked
of **58.0.9** showed `^30.0.0`. The line had moved within days, and prose would have carried the wrong answer
until someone re-read it. The correction is written down (here, and in issue #32's comment) rather than
edited away, because the episode is the argument for the tool that caught it.

## `scripts/check-upgrade-watches.mjs`

All three watches are now one read-only command — `node scripts/check-upgrade-watches.mjs` (`--json` for
machine output). Dependency-free, Node's own `fetch`, and it reports `READY` / `DEFERRED` / `UNREADABLE` per
watch, **never counting an unreadable watch as a pass** — the rule `scripts/audit-access.mjs` already
follows. It is deliberately **not** in CI, since a pipeline that goes red when npm is unreachable would turn
an upstream outage into a failed build.

~~It reads `jest-expo`'s `latest` **and** `next`, because the finding above is about `next`~~ — **corrected
later the same day, §27AU:** reading `next` was itself the defect. The `jest-expo` watch now reads the
**installed SDK's own pin table** and requires the candidate's `@react-native/jest-preset` peer to be
satisfied here, because `jest-expo` is Expo's to version rather than the registry's.

First live run, 2026-10-11: `expo` **DEFERRED** (`latest` 57.0.27, `next` 58.0.7) · `jest-expo` **READY**
(58.0.9 admits jest 30) · `@typescript-eslint/parser` **DEFERRED** (8.71.1, `typescript >=4.8.4 <6.1.0`).
`READY` here means a gate recorded above can be started; it is not a decision to start it.

*(**Corrected 2026-10-11 — §27AU.** That `jest-expo` **READY** was wrong, and the sentence in this section's
first bullet was the true one: 58.0.9 belongs to the SDK 58 line and peers a release-candidate React Native
preset this project cannot resolve, so **no** gate was open, and all three watches now report **DEFERRED**.
The line above is kept as the record of what the first version of the script actually printed.)*

# 27AR. The secret guard can now fail on purpose — controls for every rule (2026-10-11)

## What was wrong

`scripts/check-secrets.mjs` is this repository's only credential control: GitHub's secret scanning and push
protection are unavailable on a private repository at this plan level (§27AE), so the third CI job *is* the
net. Its rules had never been exercised. The six fixture values in the test tree are waived on their own
lines, so a run over the tree finds nothing whether or not the rules still match — a rule that had quietly
stopped firing, through a botched regex edit or a refactor, would have left every run green while detecting
nothing. The project had already learned this lesson once, in the history scan: *"a scan that cannot fail
proves nothing"* (§27AE). The guard's own header even promised *"explicit files (used by the tests)"* — and
nothing used that mode.

## What changed

**22 controls, run before the scan on every invocation** (`--self-test` runs them alone). Sixteen must-fire
cases, one per rule — the private-key block, a credentialed Mongo URI, `AIza…`, `AKIA…`, `sk-…`, `re_…`,
`xkeysib-…`, `SG.…`, `ghp_…`, `github_pat_…`, `xoxb-…`, `sk_live_…`, the service-account JSON, a signed JWT, a
tracked `.env` — plus six must-not-fire cases: short tokens that only look like keys, a local Mongo URI with
no credentials, `.env.example`, a dummy PEM whose body is `abc` **with 400-character neighbours**, the PEM
shape at 100 characters (quiet) and 400 (caught), and a waived line. A failed control run stops the scan
before it starts, so the tool can no longer print *"no credential-shaped content found"* through rules that no
longer fire.

**The controls were themselves proven.** Two deliberate breaks were made and reverted: renaming the brevo
rule's prefix produced `brevo-key.txt: expected [brevo-key], got [clean]`; lowering the resend rule's
quantifier to `{3,}` produced the opposite failure, `too-short.txt: expected [clean], got [resend-key]`. Both
exit 1; the restored file passes 22/22. That is the difference between a control set and decoration.

**The guard flagged its own canaries on the first run** — the two literal strings (the Mongo URI and the
service-account JSON) are lines in this very file — and the fix was the mechanism the file already documents:
`secret-guard:allow` on those two lines, visible in review rather than hidden in a rule.

## One control was wrong, and the run said so

The first version of the boundary case asserted that a body of `MIN_KEY_BODY - 2` characters was quiet. It
fired. The threshold measures the **whole block**, header letters included, so the cutoff actually sits near
185 body characters. The check was not weakened — the **control** was corrected to assert the promise
("short is quiet, realistic is caught", 100 vs 400) instead of an accidental boundary, with the reasoning in a
comment beside it; a control that pins an accident fails on the next refactor.

## Evidence

`node scripts/check-secrets.mjs` → `22 control(s) passed (16 must-fire, 6 must-not-fire)` · `scanned 409
file(s)` · `no credential-shaped content found`, exit 0. The two break/restore runs above. The CI `secret-guard`
job runs the same command with the step now named for both halves, so the controls ran on this change's own
pull request.

---

# 27AS. The attribution cleanup — a message-only rewrite, measured three times (2026-10-11)

**Why.** The owner required that no unwanted contributor name, AI attribution tag or automated
signature line appears in commits, commit messages, pull requests or history, and that commits carry
only `jeffernzxc <jefferndullamalinaozxc@gmail.com>`. CLAUDE.md §16 now states the policy in
tool-agnostic, forward-binding terms (rules 1–10). This section is the authoritative record of the
one-off rewrite the owner authorised for history that already existed.

**The audit, final measurement.** Across `main`'s 234 commits, **99 commits carried 107 removable
attribution lines**, in exactly **four** distinct forms:

| Form | Lines |
| --- | --- |
| `Co-Authored-By: Claude Code <noreply@anthropic.com>` | 91 |
| `🤖 Generated with Codebuff` | 8 |
| `Co-Authored-By: Codebuff <noreply@codebuff.com>` | 5 |
| `Co-authored-by: Codebuff <noreply@codebuff.com>` | 3 |

The earlier figure of "103 commits" was the *first* measurement and was incomplete: it counted the
forms already known. The five capital-`A` `Co-Authored-By:` lines surfaced only because the first
push was re-scanned on the remote (F-29). **No AI identity is an author or a committer anywhere in
the history** — every trailer was the coding agent's own message template.

**Deliberately kept.** The 4 `Co-authored-by: dependabot[bot] <…@users.noreply.github.com>` trailers
on the dependency-update commits stay: they credit a bot the owner runs for changes it made, and
removing them would attribute those changes to the owner. One `Claude Code` string also remains, in
the subject `chore: ignore local Freebuff and Claude Code tooling state`, where it names tooling being
ignored rather than claiming authorship.

**Method.** `git filter-branch --msg-filter` over `main` and `wip/backup-working-tree`, with the
filter kept in `.git/msg-filter.py` so it can never be committed. It removes only whole lines that are
trailer-shaped, matched case-insensitively and on the value, so an uppercase `Co-Authored-By:` and
every address form of these tools are caught while prose that merely mentions a tool is preserved.

**Three passes, recorded rather than quietly fixed.**

1. The first filter also collapsed runs of blank lines. Pairwise comparison showed **128 of 234
   messages differed** from the original by a trailing blank line — outside the agreed scope of
   "trailers only". Reverted and redone.
2. The second filter matched the trailer tokens case-sensitively and matched only the forms already
   seen, so the 5 capital-`A` lines survived. Found by re-scanning the pushed commit graph.
3. The third pass is the one in force.

**Verification of the pass in force.** Before rewriting, the filter was dry-run over the pre-rewrite
graph and **every line it would drop was enumerated** — 107 lines, the four forms above and nothing
else — and the predicate was self-tested against 6 trailer forms that must go and 5 prose/fixture
lines that must survive (the dependabot trailer and a `CLAUDE.md` reference among them). After
rewriting, every commit was compared pairwise against the original graph:

| Ref | Commits | Trees differing | Messages differing beyond the removals | Commits still carrying a trailer |
| --- | --- | --- | --- | --- |
| `main` | 234 → 234 | **0** | **0** | **0** |
| `wip/backup-working-tree` | 129 → 129 | **0** | **0** | **0** |

**Result.** `main` `f8493f8` → **`3cef708`**; `wip/backup-working-tree` `e9616cf` → **`d94bec2`**
(that branch's rewrite is identical to a separate re-run, which is the determinism check). Every tree
hash is unchanged, so **the work is preserved exactly** — only message lines were removed. Both refs
were pushed with `--force-with-lease` pinned to the exact value the remote served at that moment, and
the remote was re-read afterwards to confirm the result rather than trusting the push output.

**Backups, and how to undo.** `.git/pre-rewrite-backup.bundle` (3.9 MB, `git bundle verify` clean)
holds both pre-rewrite tips, and `/tmp/inventoryai-backup.git` is a full mirror taken earlier the same
day (`main` @ `3adac9d`). Restoring means forcing the ref back to `f8493f8` / `e9616cf` from the
bundle.

**Impact.** No branch other than those two existed on the remote — every feature branch had already
been deleted at merge — so no open pull request was disturbed and there were no tags or stashes. PRs
**#1–#51** remain recorded as merged, but their commits are no longer ancestors of the rewritten
`main`: GitHub still renders those pages from its own stored data, while the old commit objects become
unreachable on the remote over time. CI re-ran on `3cef708`.

**Repository-wide sweep, not just commits.** 50 pull requests, their bodies, their conversation
comments, the pull-request review comments and the repository description were searched for
`codebuff|claude code|anthropic.com|generated with|co-authored-by`: **0 matches**. Author and
committer fields across `main` are the owner's own identities only — `jeffernzxc`, `jeffyy` (an
earlier display name, same email) and `Jeffernzxc <141919050+nreffejzxc@users.noreply.github.com>`
(the GitHub web-UI form) — plus `dependabot[bot]` and `GitHub` for web merges. **`jeffyy` (97
commits) and the GitHub noreply address (33 commits) are the owner's own earlier identities, not
attribution violations, and were left as they are** (F-32); normalising them would be a second,
separate rewrite and requires its own request.

**Nothing can re-add them.** `git config` is `jeffernzxc` / `jefferndullamalinaozxc@gmail.com` and was
already correct; `commit.template` is unset; and `.git/hooks/` holds **no** non-`*.sample` hook, so
`commit-msg` and `prepare-commit-msg` cannot append anything. The trailers that existed came from a
coding agent's own message template — exactly what CLAUDE.md rule 7 forbids reintroducing.

**Standing rule.** A history rewrite stays forbidden except on a new, explicit owner request (CLAUDE.md
rule 9); this authorisation does not carry forward.

**Findings.**

- **F-29** — the capital-`A` `Co-Authored-By:` variant, invisible both to a case-sensitive filter and
  to a count that only looks for the forms already known.
- **F-30** — a blank-line-collapsing filter changes messages beyond the trailer lines; only a
  commit-by-commit pairwise comparison catches it.
- **F-31** — Git Bash's `/tmp` and a Windows Python's `/tmp` are different directories, so a filter
  script written to one and read from the other is not the script that runs.
- **F-32** — three display names and two email forms in the history are the owner's own past
  identities, not AI attribution.

# 27AT. Real-device Android run — what the phone proved, and what it did not (2026-10-11)

## Why this section exists

The owner asked to see the application on a **physical Android phone over USB** rather than an emulator, and to
be told honestly what is device-verified as opposed to merely test-green. This is that record. **No application
source code changed**: the work was environment preparation, a device run, and documentation. The one local
change is `mobile/.env`, which is git-ignored (see below).

## What was actually in place (measured, not assumed)

| Piece | Measured state |
| --- | --- |
| Host tooling | `node v26.10.0` (matches `.nvmrc`), `adb 1.0.41`, `scrcpy 4.1`, `npx expo --version` → `57.0.27` |
| Device | OPPO `CPH1969`, Android 11 (SDK 30), serial `PV4DDMIZZLTCIVSK` |
| `adb devices` | **`unauthorized`** on first inspection — the USB-debugging prompt had not been accepted. It reached `device` state only after the owner tapped it. (The runbook's own troubleshooting table already names this state and its fix.) |
| `server/.env` | Complete — `PORT`, `MONGODB_URI`, `JWT_SECRET`, `AI_PROVIDER`, `OPENROUTER_*`, Firebase Admin, `MAIL_PROVIDER`, `RESEND_API_KEY`, `BREVO_API_KEY`, `MAIL_FROM`, `EMAIL_VERIFICATION_CODE_PEPPER`. The backend starts and reports `db: connected`. |
| `mobile/.env` | `EXPO_PUBLIC_API_URL=http://192.168.1.4:4000`, and the laptop's LAN IPv4 turned out to be exactly `192.168.1.4` — the committed default matched this network. |
| Dev client on the phone | **None.** `adb shell cmd package list packages | grep inventory` was empty — the F2.9 build is no longer on this device, so the whole client had to be reinstalled before any device work could begin. |

## The decision that shaped the run — which binary

EAS build history, read rather than remembered:

| Profile | Date | Commit | Distribution |
| --- | --- | --- | --- |
| `preview` | 2026-10-09 | `e00ba97` | internal |
| `development` | **2026-10-03** | **`0972948`** | internal |

The newest Android artefact is a **`preview`** build — a standalone APK that bundles its own JS and **cannot be
driven by Metro**. The newest **`development`** (dev-client) build is 2026-10-03 at `0972948`. The owner chose to
install that one rather than wait ~15–25 minutes for a fresh EAS build, so the run started in minutes. Installed
with `adb install -r` (253 MB APK) → `Success`, and confirmed to be a genuine dev client because
`adb shell cmd package resolve-activity --brief -a android.intent.action.VIEW -d "inventoryai://expo-development-client/?url=http://localhost:8081"`
answers `com.inventoryai.app/.MainActivity` — a standalone build answers *No activity found*, which is the
runbook's own discriminator.

**Caveat, measured by date rather than assumed:** that binary was built 2026-10-03 and therefore **predates the
ISS-02 native patch** (`mobile/patches/@react-native-firebase+auth+26.4.0.patch`, which deletes the
`Log.d(TAG, "addAuthStateListener:eventBody " + …)` line from `NativeRNFBTurboAuth.java`; the patch landed in
`da17f8c`). The install on the phone therefore still carries the **unpatched native code**, so this binary's
logcat is **not** patch-clean. Everything JavaScript-level is current, because Metro serves it. **ISS-02's
device re-check (§27AI step 9) is not closed by this run** and still needs a native build made after the patch.

## How it was wired — USB only, no Wi-Fi dependency

- **USB tunnels:** `adb reverse tcp:8081 tcp:8081` and `adb reverse tcp:4000 tcp:4000`, so the phone's `localhost`
  on both ports is this laptop, over the cable. Chosen over the LAN address deliberately: no Wi-Fi, no DHCP-lease
  match, no Windows Firewall rule.
- **`mobile/.env`** was pointed at `http://localhost:4000` (the LAN value backed up outside the repository). Since
  `EXPO_PUBLIC_*` is **inlined at bundle time**, Metro was restarted with `--clear`. `mobile/.env` is
  git-ignored, so nothing tracked changed; the repository default remains the LAN URL.
- **Backend:** `cd server && npm start` → `http://localhost:4000`; `/api/health/ready` →
  `{"status":"ready","db":"connected"}`, `/api/health/live` → `{"status":"live"}`. The database is named **`test`**
  and is **entirely empty** — 0 users, 0 businesses, 0 products, 0 inventories, 0 inventory transactions,
  0 locations, 0 suppliers, 0 purchase orders, 0 sessions, 0 audit rows (read directly, read-only).
- **Metro:** `npx expo start --dev-client --clear --port 8081`; `/status` → `packager-status:running`.
- **Launch:** `am start -a android.intent.action.VIEW -d "inventoryai://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.
- **Mirror:** `scrcpy -s PV4DDMIZZLTCIVSK -m 1024 --window-title "Inventory AI"` → Renderer `direct3d11`,
  texture `472x1024`, window on the owner's desktop.

## Verified ON THE DEVICE — the three independent signals

1. **Metro served the bundle:**
   `Android Bundled 13482ms node_modules\expo-router\entry.js (1602 modules)`.
2. **The app is on the screen:** `mResumedActivity: ActivityRecord{… com.inventoryai.app/.MainActivity}` — and the
   rendered Login screen was read off the device as *Inventory AI · Multi-tenant inventory for small teams ·
   Welcome back · Sign in to manage your inventory. · Email \* · Password \* · Sign In · Continue with Google ·
   Forgot password? · New to Inventory AI? Create an account*.
3. **It is talking to this laptop:** the backend log recorded `GET /api/health/ready → 200` and
   `GET /favicon.ico → 404` **originating on the phone** (a URL opened on the device), which proves
   `phone → adb reverse → laptop:4000` end to end. No request had come from the **app itself** at that point,
   because no screen that calls the API had been reached — that is expected, not a failure.

Two more device-verified behaviours:

- **Navigation works.** Tapping the sign-up link on Login rendered the register screen — *Create your workspace ·
  You'll get a new business and an Owner account.* with Business name / Your name / Email / Password /
  Confirm password.
- **The §27R required-field fix, on real hardware.** Submitting the register form **completely empty** produced all
  five inline errors — *Business name is required · Name is required · Email is required · Password is required ·
  Confirm password is required* — and the backend's request count was **unchanged (5 → 5)**, i.e. the form was
  rejected **client-side with no network call**, which is precisely what the fix promises. Before §27R the empty
  form reached the Firebase sign-up path.
- No crash in logcat, no JS error on Metro, and the app survived being relaunched into the foreground.

## NOT verified on the device — stated plainly

The local database is empty, and the owner's real account lives in the **deployed** backend's database rather than
this one, so there is nothing to sign in with. Consequently:

| Flow | State |
| --- | --- |
| Firebase-first **sign-in** → token exchange → Inventory AI session | **Not run** — needs an account |
| **Email verification** (AUTH-04, the 6-digit code) | **Not run** — needs an account |
| Dashboard, products, inventory, locations, stock-in/out, transfer, suppliers, purchase orders, AI assistant, audit trail | **Not run** — unreachable without a session |
| **Google Sign-In** | **Not run** — needs an account, and on Android additionally depends on the EAS-managed keystore's SHA-1 being registered |
| **ISS-02** logcat re-check | **Not closed** — the binary predates the patch, and no auth state change occurred, so no `RNFBAuth` lines were emitted at all |
| **ISS-13** print → scan round trip | **Not run** |

## Findings

**F-26 (Medium — tooling).** The newest Android build on EAS is a `preview` build (2026-10-09) while the newest
`development` build is 2026-10-03 — six days and roughly 150 commits behind `main` at the time of the run. Only a
`development` client can be driven by Metro, so the practical device-testing binary is whatever `development`
build was made last and **its native layer silently ages**. Evidence: `eas build:list` (the table above), plus an
empty package list on the device, which forced a 253 MB re-download before any device work could start. Remedy:
build a `development` client at the commit being tested whenever the native layer matters — and say so in the
guide, instead of discovering it at the phone.

**F-27 (Low — configuration).** `mobile/app.json` sets `android.googleServicesFile: "./google-services.json"` and
`ios.googleServicesFile: "./GoogleService-Info.plist"`, and **neither file exists in the checkout** (they are
EAS-managed and deliberately not committed). Metro prints
`Could not parse Expo config: android.googleServicesFile: "./google-services.json"` — twice, plus the iOS pair —
on every start. Harmless to a Metro-served JS bundle, because EAS injects the file at build time, but it is noise
on every run and it means local tooling cannot resolve Google services configuration. **Not fixed here**: it is a
configuration decision, not a defect, and the files are absent on purpose.

**F-28 (Low — documentation).** `docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md` presents `adb reverse` as the
*alternative* to the LAN address. For a cabled run it is in fact the **deterministic** route — no Wi-Fi, no DHCP
match, no firewall rule — and this run used it successfully. ~~Promote it.~~ **Done 2026-10-11 (#53):** the guide's
§7b is titled "The USB tunnels (verified)" and the tunnels are the route it walks, with the LAN address kept as the
fallback. A second, smaller note from the same
session: `uiautomator dump` reports the **whole row** for an expo-router `<Link>` nested inside a `<Text>`, so a
tap at the row's centre lands on the label rather than the link — **a testing-methodology note, not an application
defect** (the link navigated correctly once tapped on its own side).

## Verification for this record

`main` @ `3adac9d`, working tree clean.

| Suite | Command | Result |
| --- | --- | --- |
| Mobile typecheck | `npx tsc --noEmit` | clean, exit 0 |
| Mobile lint | `npx eslint .` | clean, exit 0 |
| Mobile tests | `npx jest` | **50 suites / 666 tests, 0 failures** (15.5 s) |
| Server typecheck | `npx tsc --noEmit` | clean, exit 0 |
| Server lint | `npx eslint src` | clean, exit 0 |
| Server tests | `npm test` | **185 suites / 1312 tests, 0 failures** (232 s) |

The server suite's full mode logs `[db] MongoDB connection lost — requests that need the database will return 503
until it reconnects` while it runs; the run still ends 1312/1312, and that line is the suite's own teardown, not a
product failure.

## The next step for device testing

The gating item is an **account on the local backend**. Three ways forward, all recorded in §27AH's order:
register a fresh test account through the app against the empty local database (which exercises AUTH-04 end to end
but needs a mailbox the owner can read the 6-digit code from), or point `EXPO_PUBLIC_API_URL` at the deployed
backend and sign in with the owner's real account (immediate, but it tests live data rather than a laptop run), or
seed the local database with a test tenant (instant, but it skips the registration and verification paths that are
themselves worth testing).

---

# 27AU. An upgrade watch reported a gate as OPEN that was shut — corrected, with controls (2026-10-11)

## Why this exists

`scripts/check-upgrade-watches.mjs` was added hours earlier (§27AQ) to answer the deferred-upgrade
queue's three questions from a measurement instead of a memory. Its second watch, `jest-expo`,
printed **READY** on its first live run — and §27AQ recorded that READY **in the same section** that
says jest 30 "is **scheduled with SDK 58's promotion** (Gate 0, §27AI)". The two cannot both be true:
Gate 0 was still closed (`latest` 57.0.27, `next` 58.0.7), so no gate was open.

The cause was the gate's **definition**, not its arithmetic.

## What the watch asked, and why it was the wrong question

Read at source, the first version asked the registry whether **any** jest-expo release admitted jest 30,
reading `latest` **and** `next`, and cleared itself when one did. It found that `next` (58.0.9) depends
on `@jest/globals@^30.0.0`. Three separate things were wrong with treating that as an open gate:

- **`next` is another SDK's line.** The `expo` watch directly above it reads only `latest`, on the
  stated principle that *"Expo promotes an SDK when it is ready"*. Reading a **prerelease** tag on a
  **pinned** package applied the opposite rule to the same decision.
- **`jest-expo` is Expo's to version, not this project's.** It is a key in the installed SDK's own
  `expo/bundledNativeModules.json` (`jest-expo -> ~57.0.5`) — the same table §27AL's Dependabot carve-out
  derives its exclusions from. The candidate is therefore whatever the **installed SDK pins**, never the
  newest published release.
- **And the candidate was not installable here.** This is the half the original gate never asked about:
  `jest-expo@58.0.9` also peers `@react-native/jest-preset@^0.88.0-rc.4` — SDK 58's React Native line, a
  **release candidate** — while this project runs RN 0.86.3 and has `@react-native/jest-preset@0.86.3`
  installed. A version whose preset cannot resolve is not a candidate however attractive its jest range
  looks. That is the ISS-16 / ISS-17 class of change, declined twice already for exactly this reason.

The consequence was not cosmetic. §27AH's *Immediate next actions* tells every session to run this
command first, and `READY` is an instruction: it said to take another SDK's test harness — and an RC
preset — onto SDK 57, in a repository whose mobile regression net is **50 suites / 666 tests** running on
that preset.

## What changed

The watch now answers one question — **may this project take jest 30 without leaving its installed Expo
SDK line?** — and `READY` requires **both** halves: the installed SDK's own pin must reach a jest-30 line
**and** that version's `@react-native/jest-preset` peer must be satisfied by the installed `react-native`.
Its inputs are read from `node_modules` (the installed SDK's pin table, the installed RN, the installed
preset) rather than from registry tags, and an unreadable range answers `DEFERRED`, never `READY`.

**9 controls, run before the report on every invocation** (`--self-test` runs them alone), following
§27AR's standard that a check which cannot fail proves nothing. (9 at the time of this first correction;
**15** after the follow-on below.) The pair that matters is the false READY
itself: a version that admits jest 30 while its RN preset is unreachable must **DEFER**, and the *same*
version on a line whose React Native is 0.88 must **READY**. Without the second, the corrected rule could
only ever say DEFERRED — a rule that cannot fire is the same defect pointing the other way. A failed
control stops the report before it is printed and exits 1; a produced report is otherwise still exit 0,
so the "READY is news, not a failure" contract is intact.

## Evidence

- `node scripts/check-upgrade-watches.mjs` → all three watches **DEFERRED**, the jest-expo row now naming
  the real reason and the future cost: `pinned 57.0.5: @jest/globals=^29.2.1 — no jest 30 on the installed
  SDK's line — installed react-native=0.86.3; newest published stable: 58.0.9 (peer
  @react-native/jest-preset ^0.88.0-rc.4)`.
- `--self-test` → `9 control(s) passed (1 must-fire, 6 must-not-fire, 2 range)`, exit 0.
- **The controls were proven able to fail — twice — and then restored.** Break A removed the RN-preset
  half, i.e. reintroduced the original bug, and the control that encodes it fired:
  `the false READY this fixes — jest 30 admitted, RN preset unreachable (must not fire): expected ["DEFERRED"], got ["READY"]`,
  exit 1. Break B made the pin arithmetic ignore the pin and two controls fired, exit 1. Restored: 9/9,
  exit 0. The break runs were planted in throwaway copies and the tree is otherwise untouched.
- `--json` shape unchanged (`checkedAt` + `package, gate, detail, status, unblocks`), so any consumer of
  the machine output is unaffected.
- Volatile figures re-read at the same moment rather than quoted: `main` @ `074cacc` = `origin/main`; CI
  green on `074cacc` (run `38125618984`, 2026-10-11T08:40Z); **5** open advisories (2 high, 3 medium, 0
  critical).

## The lesson, stated rather than implied

§27AQ already made the argument for this tool — *"prose would have carried the wrong answer until someone
re-read it"* — and the tool then carried the wrong answer itself, in the one field a reader acts on. A
watch that reads a registry learns about the registry; it does not learn about **this project**. The
version a pinned package may take is a fact about the installed SDK, not about npm. Two of the three
watches were right; the third needed the installed tree to be right at all.

## Follow-on, same day — the third watch read a package neither workspace depends on

Correcting `jest-expo` made the same question worth asking of the third watch, and it failed it the same way.
It read `@typescript-eslint/parser`'s `latest` and reported that peer range for **both** workspaces — but
**neither workspace depends on that package**:

| Workspace | What it actually resolves | Where it comes from |
| --- | --- | --- |
| `server/` | the meta package `typescript-eslint@^8.71.1` | `server/package.json`, directly |
| `mobile/` | `@typescript-eslint/parser` through `eslint-config-expo@57.0.2` (`^8.59.0`) | transitively; `eslint-config-expo` is itself **SDK-pinned** (`~57.0.2`) |

So the old question could not see a `typescript-eslint` 9.x that admits 7, and would have reported `READY` off
a parser release `mobile/` cannot load even if one existed. It answered correctly on 2026-10-11 only by
coincidence: both lines happened to read `>=4.8.4 <6.1.0`.

The watch — now named `typescript-eslint` rather than for a package the project does not use — reports **one
line per workspace** and requires both to admit 7. The asymmetry is deliberate and is the same rule the
`jest-expo` gate uses, *the constraint the project cannot choose is the gate*: `mobile/`'s parser arrives
through the SDK-pinned `eslint-config-expo`, so mobile's answer is resolved through that chain, while
`server/` declares the meta package itself and can bump it as part of taking TypeScript 7.

**6 more controls, 15 in total** (`2 must-fire, 11 must-not-fire, 2 range`), and the new set's must-not-fire
pair was proven load-bearing: with the mobile chain ignored — the original one-package logic — the control
fires, `the bug — a 7-admitting release exists but mobile cannot load it (must not fire): expected ["DEFERRED"], got ["READY"]`, exit 1. Restored: 15/15, exit 0.

The corrected report, with both lines visible:

```text
DEFERRED   typescript-eslint
           gate:    TypeScript 7 — the linter EACH workspace resolves must declare a typescript peer that admits 7
           current: server: typescript-eslint declared ^8.71.1, latest 8.71.1 peer typescript=>=4.8.4 <6.1.0 |
                    mobile: eslint-config-expo 57.0.2 (SDK pins ~57.0.2) resolves parser 8.71.1 peer typescript=>=4.8.4 <6.1.0
```

## Not changed

No dependency, `package.json`, lockfile, CI job, application or test source. The `expo` and
`@typescript-eslint/parser` watches, the report's output shape, the exit-code contract for a produced
report, and the deliberate exclusion of this script from CI all stay as they were.

## One limitation, kept visible

`scripts/` is outside both workspaces' lint scopes — `server/eslint.config.js` and
`mobile/eslint.config.js` are resolved from their own directories and CI lints with
`working-directory: server` / `mobile`, so this file is linted by neither. Running ESLint over it from
`server/` exits 2 with *"ESLint couldn't find an eslint.config.\* file"*, which is a **config-resolution
error, not a lint finding** — the same standing as `scripts/audit-access.mjs` and
`scripts/check-secrets.mjs`. Syntax here is proven by execution, not by a linter.

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
- ~~Google Sign-In (Firebase provider) — approved, not implemented~~ — **IMPLEMENTED** (corrected 2026-10-10; see below)
- Facebook Login (Firebase provider) — **approved, not implemented**

Firebase Authentication itself is **not** future work: it shipped as the identity provider in Phases
32B–32E (§27H). The two provider entries are the approved-but-unimplemented part, each bound by the
Phase 32F linking policy — **no automatic linking on an email match** — and by the open register in
design document §14A.5. **Apple Sign-In remains future scope** and is not scheduled. *(**Correction, 2026-10-10:** of
the two provider entries above, **Google Sign-In shipped** — `@react-native-google-signin/google-signin@16.1.5`,
`mobile/app/login.tsx` → `handleGoogle`, checklist §5a `[✓]` 2026-09-26 — so only **Facebook** remains
approved-but-unimplemented. A provider SDK **is** installed.)*
*(Superseded 2026-10-10: the original sentence here read “no provider SDK is installed, and the first EAS
development build remains a prerequisite (§27F)”. Both clauses are now false — a provider SDK is installed for
Google, and development builds have existed since 2026-09-26 (preview build from `e00ba97`, 2026-10-10).)*

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