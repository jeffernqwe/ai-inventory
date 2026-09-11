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
Phase 16
Audit Trail Viewer
        ↓
Phase 17
Mobile Supplier & Purchase Order Management
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
- No commit and no push — the working tree keeps the change uncommitted for owner review.

---

# 16. Phase 16 — Audit Trail Viewer (read-only governance)

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
files untouched. Phases 12/13/14B/15 roadmap sections remain a pre-existing gap (as noted in the
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
- No commit and no push — the working tree keeps the change uncommitted for owner review.

---

# 17. Phase 17 — Mobile Supplier & Purchase Order Management

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

# 18. Phase 18 — SaaS-style UI Foundation, Light/Dark Theme System & Readability

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

---

# 19. Phase Gate System

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

# 20. Change Control

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

# 21. Bug Handling

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

# 22. Refactoring Rules

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

# 23. Dependency Rules

Before adding a dependency:

1. Determine whether the feature actually requires it.
2. Check whether an existing dependency already provides the functionality.
3. Prefer established and maintained libraries.
4. Avoid unnecessary packages.
5. Explain significant new dependencies.

Do not add dependencies simply for convenience.

---

# 24. Git Checkpoints

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

# 25. V1 Completion

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

# 26. Future Development

After V1, future features must be planned separately.

Potential V2:

- Barcode/QR scanner
- Push notifications
- Supplier management
- Stock transfers
- Advanced reports
- Document upload
- RAG
- MongoDB Vector Search

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

Future functionality must not be implemented during V1 unless explicitly approved.

---

# 27. Final Development Rule

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