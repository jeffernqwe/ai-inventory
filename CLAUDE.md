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
- JavaScript
- REST API

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
```

Phase 08 is an owner-directed hardening extension delivered in approved lettered increments
(08A, 08B, …) beyond the original Phase 00–07 plan; `docs/DEVELOPMENT_ROADMAP.md` records each
increment's scope and verified status.

Phase 10 is an owner-directed commercialization extension delivered in approved lettered increments
(10A, 10B, …) beyond the V1 completion gate. It prepares the backend for future SaaS
subscriptions/paid plans WITHOUT implementing payments: 10A added `Business.planCode`, a centralized
plan catalog with feature limits (`server/src/constants/plans.js`), and business-level entitlement
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
route, index, migration or AI tool changed, and `inventory.service.js` — including the
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

The phase also makes the permission **catalogue** self-checking. `server/src/constants/roles.js`
gains `CATALOGUE_ONLY_PERMISSIONS`, which names the capabilities that are granted to roles but
implemented by no endpoint: `business.manage`, `roles.manage` and `transactions.view`. This is
**metadata for the regression guard only** — it is not imported by `middlewares/authorize.js` and
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