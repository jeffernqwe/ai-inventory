# Inventory AI — System Specification

**Version:** 1.0  
**Status:** Initial Product Specification  
**Target Platforms:** Android + iOS  
**Architecture:** React Native + Expo + Node.js + Express + MongoDB Atlas

---

# 1. Project Overview

Inventory AI is a cross-platform mobile Inventory Management System designed for small and medium-sized businesses.

The application allows authorized users to:

- Manage products
- Manage categories
- Manage locations
- Track inventory
- Record stock-in transactions
- Record stock-out transactions
- View inventory history
- Monitor low-stock and out-of-stock products
- View inventory summaries
- Search and filter products
- Ask an AI assistant questions about inventory data

The AI assistant is an additional interface for interacting with authorized inventory information. It must not replace the application's core inventory functionality.

The inventory system must remain usable even when the AI service is unavailable.

---

# 2. Product Goals

## Primary Goals

1. Provide a simple mobile inventory management experience.
2. Maintain accurate inventory quantities.
3. Maintain an auditable history of inventory changes.
4. Secure business and user data.
5. Support multiple users with different permissions.
6. Provide an AI assistant capable of answering inventory-related questions.
7. Build the architecture so future features can be added without major rewrites.
8. Support Android and iOS from the same mobile codebase.

## Non-Goals for V1

The following features are intentionally excluded from V1:

- Online payments
- Subscription billing
- Full offline synchronization
- AI-powered stock modification
- AI forecasting
- Demand prediction
- Advanced supplier management
- Complex accounting
- Advanced reporting
- RAG / vector search
- Automated purchasing
- Multi-business SaaS billing
- Advanced barcode/QR scanning

These may be considered in future versions.

---

# 3. Technology Stack

## Mobile

- React Native
- Expo
- Expo Router
- JavaScript
- REST API communication
- Secure local token storage

## Backend

- Node.js
- Express.js
- JavaScript
- REST API
- JWT authentication
- bcrypt password hashing

## Database

- MongoDB Atlas
- Mongoose

## AI

The application must use an AI provider abstraction.

Initial providers may include:

- Anthropic Claude
- Google Gemini

The application must not tightly couple the business logic to one AI provider.

Example conceptual architecture:

```text
AI Service
├── Provider Interface
├── Claude Provider
└── Gemini Provider
```

The active provider should be configurable through server-side environment variables.

---

# 4. High-Level Architecture

```text
┌───────────────────────────────┐
│       React Native App        │
│        Expo + Expo Router     │
└───────────────┬───────────────┘
                │
                │ HTTPS / REST API
                ▼
┌───────────────────────────────┐
│       Node.js + Express       │
│                               │
│ Authentication               │
│ Authorization                │
│ Business Logic               │
│ Validation                   │
│ Inventory Logic              │
│ Audit Logging                │
│ AI Service                   │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│         MongoDB Atlas         │
│                               │
│ Businesses                   │
│ Users                        │
│ Products                     │
│ Categories                   │
│ Locations                    │
│ Inventory                    │
│ Transactions                 │
│ Audit Logs                   │
│ AI Conversations             │
└───────────────────────────────┘
```

AI requests:

```text
Mobile
  ↓
Backend
  ↓
AI Service
  ↓
AI Provider
  ↓
Controlled Tool
  ↓
Authorization
  ↓
MongoDB
  ↓
Tool Result
  ↓
AI Response
  ↓
Mobile
```

---

# 5. Critical Architecture Rules

These rules are mandatory.

## Rule 1 — Mobile must never access MongoDB directly

The mobile application communicates only with the backend API.

```text
Mobile → API → Database
```

Never:

```text
Mobile → MongoDB
```

## Rule 2 — AI must never access MongoDB directly

The AI provider must never receive database credentials or unrestricted database access.

Never:

```text
AI → MongoDB
```

Instead:

```text
AI → Controlled Backend Tool → MongoDB
```

## Rule 3 — Backend is the security boundary

The backend is responsible for:

- Authentication
- Authorization
- Business isolation
- Input validation
- Inventory rules
- Database operations
- AI tool authorization

## Rule 4 — MongoDB is the source of truth

The AI model must not invent inventory values.

Database-derived information must come from backend tools.

## Rule 5 — AI inherits user permissions

The AI must operate using the authenticated user's identity and permissions.

A STAFF user must not gain ADMIN capabilities simply by asking the AI.

## Rule 6 — Never trust client-supplied businessId

The business associated with a request must be determined from the authenticated user's server-side identity and authorization context.

## Rule 7 — V1 AI is read-only

The AI may:

- Search
- Retrieve
- Summarize
- Explain
- Analyze available inventory information

The AI may not:

- Create products
- Update products
- Delete products
- Modify inventory
- Create stock transactions
- Change users
- Change roles

AI write actions may be considered in a future version with explicit confirmation and additional safeguards.

---

# 6. Multi-Tenant Architecture

The application should be designed as multi-tenant from the beginning.

A business represents one organization using the system.

Conceptually:

```text
Business A
├── Users
├── Locations
├── Products
├── Categories
├── Inventory
└── Transactions

Business B
├── Users
├── Locations
├── Products
├── Categories
├── Inventory
└── Transactions
```

Data from one business must never be accessible to another business.

Every business-owned resource must contain or be resolvable to the appropriate `businessId`.

The backend must enforce this isolation.

---

# 7. User Roles

V1 supports the following roles.

## OWNER

Full business access.

Capabilities:

- Manage business
- Manage users
- Manage roles
- Manage locations
- Manage categories
- Manage products
- Manage inventory
- View transactions
- View dashboard
- Use AI assistant

## ADMIN

Administrative access excluding ownership-level controls.

Capabilities:

- Manage users (create/assign MANAGER or STAFF, enable/disable; never ADMIN or OWNER)
- Manage products
- Manage categories
- Manage locations
- Manage inventory
- View transactions
- View dashboard
- Use AI assistant

User management is strictly business-scoped and server-enforced: no user can
create or assign the OWNER role, no user can change their own role/status, and
an ADMIN can neither create, assign, nor modify another ADMIN. Disabling a user
revokes their access immediately.

## MANAGER

Operational management access.

Capabilities:

- Manage products
- Manage inventory
- View dashboard
- View transactions
- Use AI assistant

## STAFF

Operational staff access.

Capabilities:

- View products
- View inventory
- Perform permitted stock-in
- Perform permitted stock-out
- View permitted inventory history
- Ask AI questions about permitted inventory information

Authorization must always be enforced server-side.

---

# 8. Core Database Collections

V1 should contain the following primary collections:

```text
businesses
users
locations
categories
products
inventory
inventory_transactions
audit_logs
ai_conversations
ai_messages
```

---

# 9. Business Model

Conceptual fields:

```text
Business
├── _id
├── name
├── status
├── createdAt
└── updatedAt
```

Possible statuses:

```text
ACTIVE
SUSPENDED
ARCHIVED
```

Business ownership and user membership must be enforced by the backend.

---

# 10. User Model

Conceptual fields:

```text
User
├── _id
├── businessId
├── name
├── email
├── passwordHash
├── role
├── status
├── createdAt
└── updatedAt
```

Possible statuses:

```text
ACTIVE
DISABLED
```

Passwords must never be stored in plain text.

---

# 11. Location Model

A location represents a warehouse, store, branch, storage area, or other inventory location.

Conceptual fields:

```text
Location
├── _id
├── businessId
├── name
├── description
├── status
├── createdAt
└── updatedAt
```

Possible statuses:

```text
ACTIVE
ARCHIVED
```

V1 may support multiple locations even if the first user only uses one.

---

# 12. Category Model

Conceptual fields:

```text
Category
├── _id
├── businessId
├── name
├── description
├── status
├── createdAt
└── updatedAt
```

Categories must be isolated by business.

---

# 13. Product Model

Conceptual fields:

```text
Product
├── _id
├── businessId
├── name
├── sku
├── barcode
├── description
├── categoryId
├── costPrice
├── sellingPrice
├── unit
├── minimumStock
├── imageUrl
├── status
├── createdAt
└── updatedAt
```

Possible status:

```text
ACTIVE
ARCHIVED
```

## Product Rules

- SKU should be unique within a business.
- Barcode should be unique within a business when provided.
- Archived products should not be treated as active products.
- Product images should be stored externally.
- MongoDB should store image URLs rather than large image files.
- Prices must use appropriate numeric handling.
- `minimumStock` determines the low-stock threshold.

## Product Lifecycle

A product is created `ACTIVE` and moves only between `ACTIVE` and `ARCHIVED`:

```text
ACTIVE  <->  ARCHIVED
```

`ARCHIVED` is the terminal lifecycle state. **Deletion of a product is prohibited by
the application architecture.** No delete, purge, cascade-delete, or soft-delete
operation exists, and none is part of the API contract. Archiving is the supported
way to retire a product, and it is reversible through restore.

A product's `businessId` is not writable after creation, so a product can never be
moved out of the business that owns its inventory.

---

# 14. Inventory Model

Inventory represents the quantity of a product at a specific location.

Inventory must NOT be treated as one global quantity when multiple locations exist.

Conceptually:

```text
Inventory
├── _id
├── businessId
├── productId
├── locationId
├── quantity
├── reservedQuantity
├── availableQuantity
└── updatedAt
```

Relationship:

```text
Product + Location = Inventory Record
```

Example:

```text
Product: Coca-Cola
Location: Main Store
Quantity: 50
```

and:

```text
Product: Coca-Cola
Location: Warehouse
Quantity: 100
```

These are separate inventory records.

## Inventory and Product Integrity

An inventory record is conceptually dependent on its product: a quantity only has
meaning as "this product, at this location".

Archiving a product does not affect its inventory. The inventory records and the
full transaction history of an archived product are retained unchanged, and archived
stock continues to be counted in business-wide quantity totals. Archived products
cannot be used in new stock movements.

Referential integrity between inventory and products is maintained by **application
lifecycle rules and write-path validation** — a movement requires that the product
exists in the authenticated business and is not archived — and **not** by any
database-level foreign key. MongoDB has no cross-collection foreign keys, and
Mongoose `ref` only enables `populate()`; it constrains nothing.

Read-path filters that skip inventory rows whose product cannot be resolved are
defensive query hygiene. They are **not** the mechanism that enforces referential
integrity, and they must not be described or relied upon as such.

## Quantity Rules

```text
availableQuantity =
quantity - reservedQuantity
```

V1 may keep `reservedQuantity` at zero while preserving the architecture for future reservation functionality.

Negative inventory is not allowed by default.

---

# 15. Inventory Transactions

Inventory changes must be represented as transactions.

Transaction history is permanent. It is retained when a product is archived, and it
continues to reference that product by `productId`. Records are not rewritten or
removed when a product's status changes.

Supported V1 transaction types:

```text
STOCK_IN
STOCK_OUT
ADJUSTMENT
TRANSFER
```

Conceptual fields:

```text
InventoryTransaction
├── _id
├── businessId
├── productId
├── locationId
├── type
├── quantity
├── previousQuantity
├── newQuantity
├── reason
├── reference
├── userId
└── createdAt
```

## Stock-In

Example:

```text
Previous: 50
Stock In: +20
New: 70
```

## Stock-Out

Example:

```text
Previous: 70
Stock Out: -10
New: 60
```

## Stock-Out Validation

The backend must reject:

```text
requested quantity > available quantity
```

The system must never silently create negative inventory.

## Stock Transfer

A transfer moves quantity of one product from one location to another location
within the same business. It is a single logical operation that produces two
movement rows.

Example:

```text
Main Warehouse: 50 → 40   (TRANSFER, -10)
Store Front:     5 → 15   (TRANSFER, +10)
```

A transfer is subject to the same rules as any other stock movement:

```text
source and destination must be different locations
quantity must be a positive integer
requested quantity <= available quantity at the source
both locations and the product must belong to the authenticated business
```

A transfer is neither a gain nor a loss — total business inventory is unchanged.
Both legs share one `reference` so the pair can be correlated.

If either leg fails, the operation is compensated so that stock is never lost or
duplicated, the source never goes negative, and a partially applied transfer is
not left behind.

Transfer is a stock movement, not a new permission: it is gated by the existing
`INVENTORY_MANAGE` capability (OWNER, ADMIN, MANAGER).

---

# 16. Inventory Consistency

Inventory quantity updates and transaction creation must be handled safely.

The implementation must avoid situations where:

```text
Inventory updated
BUT
Transaction failed
```

or:

```text
Transaction created
BUT
Inventory update failed
```

Where supported and appropriate, database transactions should be used to preserve consistency.

Concurrent inventory updates must also be considered.

---

# 17. Audit Logs

Important system operations should generate audit logs.

Examples:

```text
PRODUCT_CREATED
PRODUCT_UPDATED
PRODUCT_ARCHIVED

INVENTORY_STOCK_IN
INVENTORY_STOCK_OUT
INVENTORY_ADJUSTED

USER_CREATED
USER_ROLE_CHANGED
USER_DISABLED
```

Conceptual fields:

```text
AuditLog
├── _id
├── businessId
├── userId
├── action
├── entityType
├── entityId
├── metadata
└── createdAt
```

Audit logs should provide enough information to understand:

- Who performed the action
- What was changed
- Which entity was affected
- When it happened

---

# 18. Search

Product search must support:

- Product name
- SKU
- Barcode

Filters:

- Category
- Location
- Active/Archived
- Low stock
- Out of stock

Search results must support pagination.

Search should be optimized using appropriate MongoDB indexes.

---

# 19. Low Stock Logic

A product is considered low stock when:

```text
availableQuantity <= minimumStock
```

Out-of-stock:

```text
availableQuantity <= 0
```

The exact implementation must account for the selected location.

Dashboard statistics must use consistent definitions.

---

# 20. Dashboard

V1 dashboard should provide:

- Total products
- Total inventory quantity
- Low-stock products
- Out-of-stock products
- Recent inventory activity

Future dashboard features may include:

- Sales analytics
- Purchase analytics
- Inventory valuation
- Trends
- Charts
- AI-generated reports

---

# 21. AI Assistant

The AI assistant is a natural-language interface for authorized inventory information.

Example questions:

```text
"What products are low in stock?"

"How many Coca-Cola items do we have?"

"Which products are out of stock?"

"Show me inventory in the warehouse."

"What was the recent stock activity?"

"Which products have the highest quantity?"
```

The AI must answer using controlled backend tools.

---

# 22. AI Tool Architecture

Initial V1 tools:

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

Each tool must:

1. Receive the authenticated user context.
2. Determine the user's business.
3. Validate authorization.
4. Query only permitted data.
5. Return structured data to the AI service.
6. Never expose unauthorized records.

The model must not construct arbitrary MongoDB queries.

---

# 23. AI Tool Example

User:

```text
"What products are low in stock?"
```

Conceptual flow:

```text
User
 ↓
Mobile
 ↓
POST /api/ai/chat
 ↓
Backend Authentication
 ↓
AI Service
 ↓
AI decides to use:
getLowStockProducts
 ↓
Backend validates user/business
 ↓
MongoDB query
 ↓
Structured result
 ↓
AI generates response
 ↓
Mobile
```

The AI response should be based on the returned database data.

---

# 24. AI Hallucination Protection

The AI must not fabricate:

- Product quantities
- Product prices
- SKU values
- Inventory history
- Locations
- Stock levels
- Business records

If required data cannot be retrieved, the AI should clearly state that the information is unavailable.

The AI should distinguish between:

```text
Database fact
```

and:

```text
AI-generated explanation
```

---

# 25. AI Security

Never expose:

- AI API keys
- MongoDB credentials
- Internal database connection strings
- Internal authorization details

to the mobile application.

AI credentials must remain server-side.

AI requests must be authenticated and rate-limited.

The AI must not be able to bypass backend authorization.

---

# 26. AI Provider Abstraction

The backend should provide an abstraction similar to:

```text
AIService
├── provider
├── generateResponse()
├── executeTools()
└── handleConversation()
```

Providers:

```text
ClaudeProvider
GeminiProvider
```

The application should be able to switch providers through configuration without rewriting inventory logic.

---

# 27. AI Conversation Storage

V1 may store:

```text
AIConversation
├── _id
├── businessId
├── userId
├── title
├── createdAt
└── updatedAt
```

Messages:

```text
AIMessage
├── _id
├── conversationId
├── role
├── content
├── model
├── toolsUsed
├── usage
└── createdAt
```

Possible roles:

```text
USER
ASSISTANT
TOOL
```

Sensitive information should not be unnecessarily stored in conversation history.

---

# 28. RAG / Vector Search

RAG is NOT required for V1.

Future architecture may use MongoDB Atlas Vector Search for:

- Product documentation
- Business policies
- Supplier documents
- Internal manuals
- Uploaded documents
- Semantic search

Possible future architecture:

```text
Documents
 ↓
Chunking
 ↓
Embeddings
 ↓
MongoDB Vector Search
 ↓
Relevant Context
 ↓
AI Model
 ↓
Response
```

Do not introduce this complexity during V1 unless specifically required.

---

# 29. Authentication

Authentication must use:

```text
Email + Password
```

Passwords:

```text
bcrypt
```

Session authentication:

```text
JWT
```

The backend must validate authentication on protected routes.

## Server-Side Sessions

An access token is **not** the whole session. Signing a token creates a session
record, and the token's `jti` claim names it. An access token therefore carries:

```text
sub   the user id
jti   the id of the session record
iat   issued-at
exp   expiry
```

It carries nothing else. Role, status and `businessId` remain database-derived on
every request (§30), and a session record holds no authorization data either — a
session grants nothing except continued authentication, so a stolen or forged one
cannot escalate anything.

`middlewares/authenticate.js` is the single authentication choke point and
requires all of the following before a request proceeds: a valid HS256 signature,
an unexpired token, a `sub` that is a real user, a **`jti` that names a session
which exists, belongs to that user, is not revoked and has not expired**, an
ACTIVE user, and an ACTIVE business. A token with no `jti` is rejected outright.

The session record (`server/src/models/session.model.js`) stores the user, the
`jti`, a cosmetic device label, `createdAt`, `lastUsedAt`, `revokedAt` and
`expiresAt`, and is removed by a TTL index once it expires. Because the record is
consulted on every authenticated request, a session can be ended server-side:

- **Sign out** ends the session the request was authenticated with. The client
  never names a session, a user or a business — the server takes it from the
  token's own `jti`. This is what makes logout real rather than a client-side
  state change.
- **Per-session revocation** ends one session belonging to the caller, so a single
  device can be signed out while every other session keeps working. The owner is
  part of the lookup, so another user's session is unreachable and answers the
  same `404` as an unknown id.
- **Sign out everywhere** ends every open session for the caller, the current one
  included.

Both are self-service operations on the caller's own sessions and require no new
permission: they are authenticated routes, not capability-gated ones. The three
routes are `POST /api/auth/logout` (with `{ "all": true }` for sign out
everywhere), `GET /api/auth/sessions` and `DELETE /api/auth/sessions/:id`. The
session listing never exposes a token or a `jti` — it names the current session
with a `current` flag instead, which is all a client needs to identify itself.

Two consequences are deliberate and were accepted when this was introduced:
tokens issued before server-side sessions existed carry no `jti`, so they are
rejected and every user signs in once more; and **there is no refresh-token
rotation** — a session ends when it is revoked or when its token expires, and a
new token is obtained by signing in again.

## Password Recovery

A user who has forgotten their password recovers access through an emailed, single-use reset link.
Two routes, both **public and unauthenticated** — the caller cannot authenticate, which is the whole
point — and both POST-only:

```text
POST /api/auth/forgot-password   202, always
POST /api/auth/reset-password    200 on success
```

Both are rate-limited. They are the only unauthenticated write surface besides register and login.

### `POST /api/auth/forgot-password`

**The response is identical for every caller.** Requesting a link for an address with no account, for
a disabled account, for an account whose business is not active, and for an address that exists and is
deliverable all answer the same `202` with the same message body, so the route cannot be used to
discover which addresses have accounts. This is an invariant, not a UI convention, and it is enforced
structurally: the service returns no value on any non-error path, so the route has nothing it could
reflect.

The one exception is **server configuration, not account state**: when mail delivery is not configured
the route answers `503` with a fixed message that names no variable, provider or transport detail.
That answer is safe because it is decided **before** the account is looked up — every caller receives
it identically, so it distinguishes nothing about any account — and it is a `503` so an operator can
see that recovery is broken. A message that *could* be sent but fails in transit is handled the
opposite way: the failure is recorded server-side and the caller still receives the same `202`, because
by then the account is already known to exist and any distinguishable answer would be an
account-existence oracle.

A reset link is valid for 30 minutes and can be used once.

### `POST /api/auth/reset-password`

Accepts the emailed token and the new password. On success it answers `200` with a message body and
nothing else — no token, no user, no password — and every session belonging to that user is ended, so
a reset also evicts anyone already signed in with the old password. The user's `passwordChangedAt` is
updated, which independently invalidates every access token issued before the reset.

The new password is held to the same policy as `POST /api/auth/change-password`; the two routes share
one validator and cannot drift apart. A `confirmPassword` field is accepted and checked **before** the
token is presented, and takes no part in the reset itself — so a mistyped confirmation is rejected
without touching the token, and a valid link cannot be spent by a typo.

The token is consumed the instant it is claimed, and consumption is **fail-closed**: a token is never
returned to circulation by a later failure, and no failure path releases it. A second use of the same
link — concurrently, or after any subsequent failure — is rejected. Only one link is live per user at
a time, so requesting a new one invalidates the previous one, and a token is stored only as a hash, so
the database itself yields nothing that can be replayed.

### Errors

Both routes answer with an error `code` and a message:

- An invalid, unknown, expired, already-used or no-longer-valid token →
  `400 INVALID_RESET_TOKEN`. One code and one message cover every one of those cases, so a caller
  cannot tell them apart.
- A new password that fails policy, or a malformed request → `400 VALIDATION_ERROR` with a `fields`
  list.
- Too many attempts → `429 PASSWORD_RESET_RATE_LIMITED`. **Every** attempt counts, including
  successful ones and including requests for addresses that have no account: there is no failure to
  exempt, because those two paths are deliberately indistinguishable.
- Mail not configured on the server → `503`.

Error responses never carry a stack trace, a database or provider detail, an environment-variable
name, or any part of the message that was sent (§33).

### Mobile client

The mobile application implements the user-facing half of this surface, on `/forgot-password` and
`/reset-password`. Both are public screens, so they render whether or not a session exists and never
wait on authentication.

- **A password-reset email link targets the mobile app's custom scheme**, not a web page: the reset
  URL is `inventoryai://reset-password?token=<token>`, which is the value `PASSWORD_RESET_URL` carries
  (§35). Universal Links and Android App Links are deferred, so a link opened on a device without the
  app installed has no web fallback.
- **The reset screen reads the token from the incoming URL parameter** and from nowhere else. A link
  with no token, an empty token or a malformed one is rejected locally and no request is made. The
  client imposes no rule on the token's shape beyond that.
- **The token is submitted only in the body of `POST /api/auth/reset-password`.** It is never
  displayed on screen, never written to a log by application code, never persisted to device storage,
  and never copied into another navigation. It leaves the app in exactly one place.
- **A successful reset clears the client session and returns the user to Login.** Clearing is required
  before navigating, because the Sign In screen redirects an authenticated client into the app — so a
  user whose reset succeeded would otherwise be sent straight back into the app instead of being asked
  to sign in with the new password. No client session survives a reset, matching the server, which ends
  every session the account held.

### Known limits

Two properties of this surface are documented, accepted and **not** fixed, because both need an owner
decision and both were out of the scope that introduced them. They are recorded in
`docs/DEVELOPMENT_ROADMAP.md` §27B "Accepted / Deferred Security Risks" and are open:

- `forgot-password` is a **practical timing oracle**: an unknown address costs one indexed lookup,
  while a known one additionally costs writes, an audit row and an outbound mail request, so the two
  are separable by latency even though the responses are identical. The responses are uniform; the
  time taken is not.
- **Distributed flooding of one address is not bounded.** The per-address limit is keyed by source
  address *and* email, and the per-source limit never sees a rotating attacker, so mail volume to a
  single victim is not capped across sources.

Future authentication may include:

- Google OAuth
- Apple Sign-In
- Facebook Login
- MFA

These are not required for V1.

---

# 30. Authorization

Authorization must be server-side.

Conceptually:

```text
authenticate()
      ↓
authorize()
      ↓
business isolation
      ↓
controller/service
```

The mobile application may hide unauthorized UI elements, but this is only a UX feature.

The backend remains the authority.

## Permission Catalogue and Route Bindings

`server/src/constants/roles.js` is the single source of truth for capabilities.
It holds the permission catalogue (`PERMISSIONS`), the grants per role
(`ROLE_PERMISSIONS`), and `hasPermission(role, permission)`. The role and the
grant are derived from the authenticated `req.user`, which is loaded from the
database — never from a client-supplied role or token claim.

Every protected endpoint binds to an **explicit** capability key through
`requirePermission(PERMISSIONS.<KEY>)`. Authentication alone is not an
authorization decision: a route that reads or writes a resource with a
corresponding capability must name that capability, so the endpoint's
authorization requirement is stated in the route declaration rather than
implied by "any authenticated member of the business".

A capability in the catalogue that no endpoint implements is declared in
`CATALOGUE_ONLY_PERMISSIONS`, beside the catalogue, with the reason it is
unimplemented. That list is **metadata for the regression guard only**: it is
not consumed by `middlewares/authorize.js` and takes no part in any runtime
authorization decision. It exists so the catalogue cannot silently accumulate
capabilities that are granted to roles but attached to nothing. As of Phase 22
it contains:

- `business.manage` — business-level settings are reserved for OWNER; no
  business-settings endpoint exists.
- `roles.manage` — role administration is reserved for OWNER; roles are fixed in
  code, so there is nothing to administer.
- `transactions.view` — the ledger read is served by
  `GET /api/inventory/history`, which is protected by `inventory.history.view`.
  See below.

Adding an endpoint that enforces a catalogue-only capability moves it out of
that list; the guard fails until it does.

## Inventory History Authorization

`GET /api/inventory/history` is protected by `inventory.history.view`, not by
`transactions.view`. All four roles hold `inventory.history.view`, whereas only
OWNER, ADMIN and MANAGER hold `transactions.view` — so gating the route on the
latter would silently revoke STAFF's inventory-history access. The two keys are
deliberately not interchangeable, and the binding is pinned by a test.

## Enforcement Guard

`server/test/phase22-authorization-contract.test.mjs` is a database-free suite
that pins the contract above: the route→capability binding for each protected
read route (structurally, by walking the router stack; behaviourally, by invoking
the gate; and by asserting the declaration names the expected catalogue key), the
partition of the catalogue into enforced and catalogue-only, the rejection of any
permission a route references that is not in the catalogue, the fact that
`CATALOGUE_ONLY_PERMISSIONS` is never consumed by the runtime authorization path,
and that all four roles still hold every capability a route now requires.

## Route Authorization Classification

Authorization is a property of **every** route, not only of the routes that happen to be gated. Each
route reachable from `server/src/app.js` therefore falls into exactly one declared class:

- **Permission-gated** — the route carries a capability gate as its first handler after
  `requireAuth`, and its declaration names the catalogue key. This is the default and the expectation
  for every route that reads or writes a business resource.
- **Authenticated** — `requireAuth` plus a controller, with no capability gate. Reserved for the
  caller's own account (`GET`/`PATCH /api/auth/me`, `POST /api/auth/change-password`, and the
  session-lifecycle routes `POST /api/auth/logout`, `GET /api/auth/sessions`,
  `DELETE /api/auth/sessions/:id` — a user's own sessions are self-service, so no capability is
  involved) and for the categories/locations reads, which have no view capability in the catalogue.
  Each is listed explicitly, with its reason, so that the deferral is visible and cannot be extended
  by accident.
- **Public** — no authentication at all. The health probes must answer before a token can exist,
  login/register are how a token is obtained, and password recovery
  (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`) is how a locked-out user gets a
  new password without one; all are rate-limited, and no public route writes business data except
  through the recovery flow described in §29.
- **Role-gated** — a gate naming roles directly rather than a capability. **There are none**, and
  adding one requires an explicit decision: a role-name gate bypasses the permission catalogue, so a
  route using it would be invisible to any scan that looks only for capability keys.

A route in no class is a defect. Declaring a route in a class it no longer belongs to is also a
defect. Nothing in this section is a route inventory: no count is fixed, so a later phase adds a
route by classifying it, never by amending a number.

`requireRole(...roles)` in `server/src/middlewares/authorize.js` is the role-name allowlist behind
the fourth class. It is retained and tested but has **no production call site**; its inertness is
pinned by the guard rather than being removed by it.

## Client Error-Code Contract

An error `code` is part of the client-facing contract. The mobile application branches on specific
codes to produce specific messages, so a code the server renames or stops emitting silently degrades
a precise client message into a generic failure. Every code the client compares against must be a
code the server can emit. The server emits codes in three ways — the third argument of
`new ApiError(...)`, a `this.code = ...` assignment on a custom error class, and a `code:` property
written directly into a response body (the rate limiters answer without going through `ApiError`) —
and all three are in scope.

## Cross-Layer RBAC Mirror

`mobile/lib/permissions.js` mirrors the catalogue and the role grants in
`server/src/constants/roles.js` because the UI needs to know what to show. The mirror is **not** an
authorization boundary — the backend remains the sole authority, and every request is decided
server-side. The two copies are required to agree exactly: a grant present only on the server makes
the app offer an action the server refuses, and a grant present only in the mirror makes a role never
see an action it is permitted to perform. The server matrix is authoritative, and the mirror is
updated to match it.

## Enforcement Guard

`server/test/phase23-authorization-contract.test.mjs` is the database-free suite that pins the three
contracts above: the classification of every route with the exemption lists and their reasons, the
mirror's equality with the server matrix (roles, catalogue keys and values, and every role's grant
set), `requireRole`'s inertness together with its recognition by the classifier, and the absence of
any client-branched error code the server cannot emit. Its comparisons are factored into pure
functions and exercised against deliberately perturbed in-memory clones, so the guard is
demonstrably capable of failing rather than merely being green.

`server/test/phase24-runtime-authorization-matrix.test.mjs` is the DB-backed counterpart: the runtime
matrix over real routes, the four role-mutation tests, and the explicit assertion that no runtime route
is reserved to OWNER alone. Its expectations come from `hasPermission`, so it too cannot drift from the
catalogue.

## Runtime Authorization Matrix

The three contracts above are **structural**: they prove that a route *declares* a gate, not that the
shipped server *applies* it to a real request. A separate DB-backed suite pins the runtime behaviour
over real endpoints, role by role.

The matrix is **derived, never transcribed**. The tier a route belongs to is computed by asking the
shipped `hasPermission(role, permission)` who holds the route's capability, so the suite holds no
second copy of the role matrix and cannot silently disagree with `src/constants/roles.js`; a grant
change flows straight through to the cells. The matrix resolves to three invoked tiers:

| Tier | Holders | Representative capabilities |
|---|---|---|
| A | OWNER, ADMIN | `users.manage`, `audit.view`, `categories.manage`, `locations.manage` |
| B | OWNER, ADMIN, MANAGER | `products.manage`, `suppliers.manage`, `purchase-orders.manage`, `inventory.manage`, `dashboard.view` |
| C | every role | every `*.view`, `inventory.stock-in`/`stock-out`, `inventory.history.view`, `purchase-orders.receive`, `ai.use` |

There is deliberately **no OWNER-only runtime tier**. The two OWNER-exclusive capabilities
(`business.manage`, `roles.manage`) are catalogue-only per Phase 22, so no shipped endpoint
distinguishes OWNER from ADMIN. The suite asserts that emptiness explicitly rather than leaving a hole
that would read as coverage, and no route is added to make the tier testable.

Two properties keep the matrix honest and cheap to maintain:

* **An admitted cell depends on nothing but the gate.** A permission gate is the second handler, so it
  decides before validation, lookup or provider access. An admitted cell therefore asserts only "not
  401, not 403, and not the code-less global 404" — no request body, no seeded resource, no provider
  availability, no success payload — which keeps the suite immune to unrelated validation changes. The
  distinction between the two 404 shapes is what catches a mistyped path: the global handler
  (`middlewares/notFound.js`) answers `{error, message}` with **no `code`**, while every `ApiError` 404
  carries one.
* **Denial is asserted exactly.** A refused cell asserts HTTP 403 with `code: 'FORBIDDEN'`; an
  unauthenticated request to a gated route asserts 401 with `code: 'AUTH_REQUIRED'`, sampled per tier
  rather than repeated per route because the structural suite already proves `requireAuth` is the first
  handler on every gated route.

## Role Mutation Takes Effect Immediately

Authorization is decided per request from current database state, never from token contents. An access
token carries only `sub`, `jti` plus the standard `iat`/`exp` — no role and no `businessId` claim —
and `middlewares/authenticate.js` reloads the user (and therefore the role and business) from the
database on every request. A hand-forged `role` claim therefore neither grants a capability nor
escalates one.

The runtime consequence is specified and tested: changing a user's role takes effect on the
**already-issued token**, with no new login. Promotion grants the new capability and demotion revokes
the old one immediately, in both directions, including across tiers. This mirrors the long-standing
account-status rule, where disabling a user revokes an existing JWT instantly.

## Tenant Isolation Mechanism

Tenant isolation is enforced by **query scoping**, not by a rejection middleware: every business-owned
read and write is filtered by the `businessId` taken from the authenticated session, so a reference to
another tenant's resource resolves to nothing and surfaces as an ordinary 404 `NOT_FOUND`. Client
supplied `businessId` values are never trusted and never influence a query.

`src/utils/businessAccess.js` (`assertBusinessAccess`, which emits the `FORBIDDEN_BUSINESS` code) has
**no production call site** — it is referenced only by tests, one of which exercises it inside a
test-only router. It is retained unmodified, wired to nothing, and no client behaviour depends on it;
the `FORBIDDEN_BUSINESS` code is consequently not reachable at runtime in production. The presence of
that utility must not be read as the isolation mechanism.

---

# 31. API Structure

REST API modules:

```text
/api/auth
/api/businesses
/api/users
/api/locations
/api/categories
/api/products
/api/purchase-orders
/api/suppliers
/api/inventory
/api/transactions
/api/dashboard
/api/ai
/api/audit
```

Example endpoints:

```text
POST   /api/auth/register
POST   /api/auth/login

GET    /api/users
POST   /api/users
GET    /api/users/:id
PATCH  /api/users/:id

GET    /api/products
POST   /api/products
GET    /api/products/:id
PATCH  /api/products/:id
POST   /api/products/:id/archive
POST   /api/products/:id/restore

GET    /api/suppliers
POST   /api/suppliers
GET    /api/suppliers/:id
PATCH  /api/suppliers/:id
POST   /api/suppliers/:id/archive
POST   /api/suppliers/:id/restore

POST   /api/purchase-orders
GET    /api/purchase-orders
GET    /api/purchase-orders/:id
PATCH  /api/purchase-orders/:id
POST   /api/purchase-orders/:id/issue
POST   /api/purchase-orders/:id/cancel
POST   /api/purchase-orders/:id/receive

GET    /api/inventory
POST   /api/inventory/stock-in
POST   /api/inventory/stock-out

GET    /api/transactions

GET    /api/dashboard

POST   /api/ai/chat
GET    /api/ai/conversations
GET    /api/ai/conversations/:id

GET    /api/audit
```

Exact endpoint design may be refined during implementation while preserving the architecture and security requirements.

These are illustrative examples, not an exhaustive or guaranteed contract. The implemented product surface is archive/restore: product deletion is not implemented and is not part of the contract (see §13 Product Lifecycle). There is likewise no `/api/transactions` module — the ledger is read through `GET /api/inventory/history`, protected by `inventory.history.view` (see §30 Inventory History Authorization).

---

# 32. API Validation

Every write endpoint must validate input.

Validation must include:

- Required fields
- Data types
- String lengths
- Numeric ranges
- IDs
- Enum values
- Business ownership
- Permissions

Invalid requests must return appropriate HTTP status codes and structured errors.

---

# 33. Error Handling

The backend should use centralized error handling.

Errors should be:

- Consistent
- Safe
- Useful to clients
- Free of sensitive internal details

Production responses must not expose:

- Stack traces
- Database credentials
- Internal paths
- Secrets
- Provider credentials

---

# 34. Security Requirements

Production backend must include appropriate protection such as:

- HTTPS
- JWT authentication
- bcrypt password hashing
- Server-side authorization
- Request validation
- Rate limiting
- CORS configuration
- Secure environment variables
- MongoDB least-privilege credentials
- Safe error responses
- Business data isolation
- AI request limits

Never commit secrets to Git.

---

# 35. Environment Configuration

Use environment variables.

Example:

```text
NODE_ENV
PORT
MONGODB_URI
JWT_SECRET
JWT_REFRESH_SECRET
AI_PROVIDER
ANTHROPIC_API_KEY
GEMINI_API_KEY
```

## Password Recovery and Mail Delivery

Password recovery is disabled unless mail delivery is configured. It requires:

```text
MAIL_PROVIDER               the provider that sends mail; empty disables recovery entirely
MAIL_FROM                   a sender address the provider has verified
RESEND_API_KEY              provider credential — server-side only
MAIL_APP_NAME               optional; product name shown in the email (default "Inventory AI")
MAIL_REQUEST_TIMEOUT_MS     optional; abort a provider request slower than this (default 10000)
PASSWORD_RESET_URL          the reset page an emailed link points at
```

The provider, its credential and `PASSWORD_RESET_URL` must all be set before a reset token is created
or a link is sent; while any is missing, `POST /api/auth/forgot-password` answers its fixed `503` and no
token is written. A provider credential is never returned in a response, written to a log, or sent to
the mobile application.

`PASSWORD_RESET_URL` is the **only** source of the reset URL. It is never built from the `Host`,
`Origin` or `Referer` headers or from anything a client sends, so a hostile request cannot redirect a
victim's reset link to another domain. It must point at a real screen that reads the token from its
query string and submits it to `POST /api/auth/reset-password`; a value pointing nowhere leaves the
feature configured but unusable.

Recovery is rate-limited per source address and per account, separately from login:

```text
AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS          default 3600000  (1 hour)
AUTH_PASSWORD_RESET_RATE_LIMIT_MAX                default 5        per source + email
AUTH_PASSWORD_RESET_IP_RATE_LIMIT_WINDOW_MS       default 3600000  (1 hour)
AUTH_PASSWORD_RESET_IP_RATE_LIMIT_MAX             default 20       per source
AUTH_PASSWORD_RESET_CONFIRM_RATE_LIMIT_WINDOW_MS  default 900000   (15 minutes)
AUTH_PASSWORD_RESET_CONFIRM_RATE_LIMIT_MAX        default 20       reset attempts per source
```

Every attempt counts against these budgets, including successful ones and requests for addresses that
have no account (§29 Password Recovery). The rate-limit values are read when the server builds its
routes, so **changing any of them requires a restart**; the mail values above are read per request and
take effect without one. Limit budgets are held in process memory, so a deployment with more than one
application instance multiplies each of them.

Secrets must never be hardcoded.

Provide:

```text
.env.example
```

without real credentials.

---

# 36. Database Indexing

Appropriate indexes should be created for common queries.

Potential indexes:

```text
businessId
businessId + sku
businessId + barcode
businessId + name
businessId + productId
businessId + locationId
businessId + productId + locationId
businessId + createdAt
```

Indexes must be based on actual query patterns and should not be created indiscriminately.

---

# 37. Performance Requirements

Backend:

- Use pagination.
- Avoid unnecessary database queries.
- Use indexes.
- Return only required fields where appropriate.
- Avoid unbounded queries.

Mobile:

- Optimize list rendering.
- Use pagination/infinite loading where appropriate.
- Debounce search.
- Avoid unnecessary re-renders.
- Optimize image loading.
- Keep API payloads reasonable.

AI:

- Do not send the entire database to the model.
- Retrieve only relevant records through tools.
- Keep prompts/context controlled.
- Limit conversation history when appropriate.
- Track AI usage where possible.

---

# 38. Offline Strategy

V1 will be:

```text
ONLINE-FIRST
```

The application should not attempt full offline synchronization during initial development.

However, architecture should avoid making future offline support impossible.

Future implementation may include:

```text
Local Cache
↓
Offline Queue
↓
Synchronization
↓
Conflict Resolution
↓
Server
```

Offline inventory writes should only be introduced after a clear synchronization strategy is designed.

---

# 39. Barcode / QR Strategy

V1 product schema should include:

```text
barcode
```

but scanning functionality is not required for the first release.

Future V2:

```text
Camera
 ↓
Barcode Scanner
 ↓
Product Lookup
 ↓
Inventory Action
```

---

# 40. Product Images

Product images should not be stored directly inside MongoDB documents as large binary data for normal usage.

Preferred architecture:

```text
Mobile
 ↓
Image Storage
 ↓
Image URL
 ↓
MongoDB
```

The specific image storage provider can be selected later.

---

# 41. Testing Strategy

Critical backend tests must cover:

## Authentication

- Register
- Login
- Invalid credentials
- Protected routes

## Authorization

- OWNER permissions
- ADMIN permissions
- MANAGER permissions
- STAFF permissions
- Unauthorized actions

## Business Isolation

User from Business A must never access Business B data.

## Products

- Create
- Read
- Update
- Archive
- Search

## Inventory

- Stock in
- Stock out
- Adjustment
- Insufficient stock
- Quantity consistency
- Transaction creation

## Dashboard

- Correct totals
- Correct low-stock count
- Correct out-of-stock count

## AI

- Authentication
- Business isolation
- Tool authorization
- Read-only restrictions
- Correct database-derived answers

---

# 42. Git Strategy

Recommended branches:

```text
main
develop
feature/*
```

Feature branches should be used for substantial features.

Commit messages should clearly describe the change.

Example:

```text
feat: add product model
feat: implement stock in
feat: add inventory history
fix: prevent negative stock
feat: add read-only AI inventory tools
```

Do not commit:

```text
.env
API keys
database credentials
private certificates
```

---

# 43. Documentation

The project should eventually contain:

```text
docs/
├── SYSTEM_SPECIFICATION.md
├── DATABASE_SPECIFICATION.md
├── API_SPECIFICATION.md
├── AI_SPECIFICATION.md
├── MOBILE_SPECIFICATION.md
├── SECURITY_SPECIFICATION.md
└── DEVELOPMENT_ROADMAP.md
```

`SYSTEM_SPECIFICATION.md` is the primary source of truth.

Other documents should provide deeper implementation details as the project grows.

---

# 44. V1 Mobile Screens

Recommended V1 screens:

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

Navigation should be designed so core inventory workflows require minimal interaction.

---

# 45. V1 User Flow

## Registration

```text
Register
 ↓
Create Business
 ↓
Create OWNER user
 ↓
Login
 ↓
Dashboard
```

## Product Setup

```text
Create Location
 ↓
Create Category
 ↓
Create Product
 ↓
Assign inventory/location
```

## Stock-In

```text
Select Product
 ↓
Select Location
 ↓
Enter Quantity
 ↓
Confirm
 ↓
Update Inventory
 ↓
Create Transaction
 ↓
Create Audit Log
```

## Stock-Out

```text
Select Product
 ↓
Select Location
 ↓
Enter Quantity
 ↓
Validate Available Quantity
 ↓
Confirm
 ↓
Update Inventory
 ↓
Create Transaction
 ↓
Create Audit Log
```

---

# 46. AI User Flow

```text
Open AI Assistant
 ↓
Ask Question
 ↓
Backend Authenticates User
 ↓
AI Service
 ↓
AI Determines Required Tool
 ↓
Backend Executes Authorized Tool
 ↓
Database Result
 ↓
AI Generates Response
 ↓
Display Response
```

Example:

```text
User:
"What products are low in stock?"

AI:
"I found 5 products below their minimum stock level..."
```

The product list must originate from the database.

---

# 47. V1 Scope Summary

## Included

```text
Authentication
User roles
Business
Locations
Categories
Products
Inventory
Stock In
Stock Out
Inventory Transactions
Inventory History
Dashboard
Search
Low Stock
Out of Stock
AI Assistant
AI read-only tools
Audit Logs
Security
Testing
```

## Excluded

```text
Payments
Subscriptions
Full Offline Sync
Advanced AI Actions
AI Forecasting
RAG
Vector Search
Advanced Analytics
Supplier Management
Barcode Scanner
Automated Purchasing
```

---

# 48. Future Roadmap

## V2

```text
Barcode/QR Scanner
Push Notifications
Advanced Reports
Multiple Branch Improvements
Supplier Management
Stock Transfers
Document Upload
RAG
MongoDB Vector Search
Improved AI Context
```

## V3

```text
AI Forecasting
Demand Prediction
Purchase Recommendations
Automated Stock Alerts
Advanced Analytics
AI-assisted Actions
```

AI write actions must require explicit confirmation before execution.

## V4 — SaaS

```text
Multiple Businesses
Subscription Plans
Billing
AI Usage Quotas
Team Management
Organization Settings
SaaS Administration
```

---

# 49. AI Cost Control

AI usage must be treated as a potentially variable operational cost.

The backend should eventually support:

- Rate limits
- Per-user limits
- Per-business limits
- Token/usage tracking
- Provider fallback
- Model selection
- Error handling when AI quota is exhausted

If AI is unavailable, the inventory application must continue operating normally.

---

# 50. Deployment Architecture

Initial deployment:

```text
React Native / Expo
        │
        ▼
Android / iOS
        │
        ▼
Production API
        │
        ▼
Node.js / Express
        │
        ▼
MongoDB Atlas
        │
        └──────► AI Provider
```

Production secrets must be configured through the hosting platform's environment configuration.

---

# 51. Mobile App Distribution

The application should eventually support:

```text
Android
↓
Google Play Store

iOS
↓
Apple App Store
```

The project should use a build and submission workflow appropriate for Expo/EAS.

Store requirements must be handled before production release, including:

- App icon
- Splash screen
- App metadata
- Screenshots
- Privacy policy
- Terms where appropriate
- Data disclosure
- Support information
- App versioning
- Production testing

---

# 52. Observability

Production should eventually include:

- Error monitoring
- Crash reporting
- API logs
- Performance monitoring
- AI usage monitoring
- Authentication/security monitoring

The application should avoid logging sensitive information.

---

# 53. Backup and Recovery

MongoDB production data must have an appropriate backup strategy.

The project should define:

- Backup frequency
- Retention
- Recovery process
- Disaster recovery expectations

Database backup configuration must not be treated as optional for a production application.

---

# 54. Acceptance Criteria

V1 is considered functionally complete when the following workflow works end-to-end:

1. A user can register.
2. A business is created.
3. The user becomes OWNER.
4. The user can log in.
5. The user can create a location.
6. The user can create a category.
7. The user can create a product.
8. The product can have inventory at a location.
9. Stock-in increases inventory.
10. Stock-in creates an inventory transaction.
11. Stock-out decreases inventory.
12. Stock-out creates an inventory transaction.
13. Stock-out cannot exceed available inventory.
14. Inventory history displays changes.
15. Dashboard statistics update correctly.
16. Low-stock detection works.
17. Out-of-stock detection works.
18. Product search works.
19. Role permissions are enforced.
20. Business isolation is enforced.
21. AI can answer supported inventory questions.
22. AI uses controlled backend tools.
23. AI cannot directly access MongoDB.
24. AI cannot modify inventory in V1.
25. AI credentials remain server-side.
26. Core inventory functions continue working when AI is unavailable.
27. Critical backend tests pass.
28. Production configuration does not expose secrets.
29. Documentation accurately reflects the implementation.

---

# 55. Development Principle

The application should be developed incrementally.

Do not attempt to build the entire system in one implementation step.

Recommended sequence:

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
```

Each phase must be implemented, tested, reviewed, and verified before moving to the next phase.

---

# 56. Source of Truth Rule

When implementation decisions conflict with this specification:

1. Review the specification.
2. Identify the conflict.
3. Do not silently change architectural requirements.
4. Report significant conflicts before making major changes.
5. Update the specification only when the project decision intentionally changes.

The goal is to prevent implementation drift as the project becomes larger.

---

# 57. Final Architecture Principle

The system should maintain this separation:

```text
MOBILE
User Interface
        ↓
BACKEND
Security + Business Logic
        ↓
DATABASE
Source of Truth

AI
Natural Language Interface
        ↓
Controlled Backend Tools
        ↓
Authorized Database Information
```

The AI is an assistant.

It is not the database.

It is not the authorization layer.

It is not the inventory engine.

The backend remains the authority for business rules, permissions, and inventory consistency.