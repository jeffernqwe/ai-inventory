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