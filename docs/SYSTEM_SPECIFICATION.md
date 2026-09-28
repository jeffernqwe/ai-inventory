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
- TypeScript
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
├── planCode
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

## Subscription Ownership Is Business-Level

Subscription and billing state belongs to the **business (tenant)**, never to an individual Firebase
identity or user account. Conceptually:

```text
Business
 ├── Owner
 ├── Admin(s)
 ├── Manager(s)
 └── Staff
       ↓
   Subscription / Billing
       ↓
   Business feature access
```

A Firebase UID **must never be used as the subscription owner**. Changing the Owner of a business, or
changing which authentication provider a person signs in with, must not inherently transfer, destroy
or recreate the business's subscription or its feature access.

Entitlements are resolved from the business, not from the person: `planCode` lives on the `Business`
document, the plan catalogue is `server/src/constants/plans.ts`, and the entitlement check is
`server/src/services/entitlement.service.js`. Section 30 governs who may act inside the business.

Subscription plans, billing and paid-plan enforcement are **not implemented** — they are deferred to
V4 (see §48). The foundation above exists so that billing can be added to the tenant without
re-keying ownership onto an identity.

---

# 10. User Model

Conceptual fields:

```text
User
├── _id
├── businessId
├── name
├── email
├── passwordHash        optional
├── firebaseUid         optional
├── emailVerified
├── role
├── status
├── passwordChangedAt
├── createdAt
└── updatedAt
```

Possible statuses:

```text
ACTIVE
DISABLED
```

Passwords must never be stored in plain text.

## Identity Linkage vs. Authorization

`firebaseUid` is an **identity linkage field, not an authorization source**. It records which Firebase
identity a user account is bound to. It never grants a role, a permission, a business, or access to
anything — `businessId`, `role`, `status` and permissions always come from this document, loaded from
the database on every request (§30).

| Field | Notes |
| --- | --- |
| `email` | Globally unique. **Not an account-linking join key** — see §29. |
| `passwordHash` | **Optional.** Absent for an account created through Firebase, which never receives a password through the API. Never returned by any endpoint. |
| `firebaseUid` | Optional, and **sparse-unique**: at most one account per Firebase identity, while any number of accounts may have none. Sparse is mandatory — without it the index cannot be built once two accounts lack the field. |
| `emailVerified` | Persisted from the verified Firebase token claim, and **not enforced**. No authorization decision reads it. |
| `passwordChangedAt` | The revocation clock for §29's `SESSION_INVALIDATED`. |

An account may hold both a retained `passwordHash` and a `firebaseUid`. Where it does, **Firebase is
the authentication authority and the retained hash is not a second way in** (§29, Password Authority).

Every business-owned resource is isolated by `businessId`, and a client-supplied `businessId` is never
trusted (§30).

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
ClaudeProvider            (Anthropic Messages API)
GeminiProvider            (Google Generative Language API)
OpenRouterProvider        (Anthropic-compatible gateway)
```

The gateway provider speaks the same Anthropic Messages wire as ClaudeProvider through one shared
mapping layer, so a gateway is a configuration over that layer rather than a second protocol
implementation. `openrouter` additionally requires `AI_MODEL_OPENROUTER`: it fronts many models with
different tool-calling ability, so the assistant model is named explicitly rather than defaulted.

Provider selection is server-side only (`AI_PROVIDER`). Keys never reach the mobile application, and
`AI_PROVIDER` stays `openrouter` unless an operator changes it — adding a provider does not switch one.

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

Authentication uses:

```text
Firebase Authentication     identity      — "who is this person?"
Inventory AI JWT + session  authorization — "what may they do?"
Email + Password            legacy credential, retained for pre-Firebase accounts
bcrypt                      legacy password hashing
```

The backend must validate authentication on protected routes.

## Firebase Authentication (Identity Provider)

Firebase Authentication is the **identity provider**. It answers *who is this person?* — nothing more.
The Inventory AI backend answers *which Inventory AI account and business does this person belong to,
and what are they allowed to do?*, and MongoDB remains authoritative for `userId`, `businessId`,
`role`, account status, permissions, business status, subscription/billing state, application
sessions and audit records.

**Planned authentication methods:**

| Method | Status |
| --- | --- |
| Email/password via Firebase Authentication | **Implemented** (Phases 32B–32E) |
| Google via Firebase Authentication | **Implemented** (Phase C, native `@react-native-google-signin/google-signin`) — existing-account Android flow E2E verified 2026-09-26; the new-identity path is environment-blocked |
| Facebook via Firebase Authentication | **Planned — not implemented** |
| Apple Sign-In | **Future scope — not part of the current implementation** |

### The Exchange Boundary

Firebase ID tokens are accepted at **two** boundaries and nowhere else:

```text
POST /api/auth/firebase/exchange     PUBLIC         verified token -> Inventory AI session
POST /api/auth/firebase/register     PUBLIC         verified token -> new Business + OWNER user
POST /api/auth/firebase/link         AUTHENTICATED  verified identity -> the CALLER'S OWN account
```

The two public routes are the exchange boundary proper: the caller holds no Inventory AI JWT, which
is why they must prove an identity instead. The server verifies the ID token, uses the verified
Firebase UID, resolves the MongoDB user **by `firebaseUid`**, applies the existing user and business
status checks, and mints the existing Inventory AI JWT and session. An unresolved UID answers the
existing registration-required behaviour.

`POST /api/auth/firebase/link` accepts an ID token for the opposite purpose and in the opposite
direction: the caller is **already** authenticated, and the token names an identity to be attached to
the account the caller's own session already resolves to. It creates no session, resolves no account
from the token, and cannot name an account. See *Safe Account Linking* below.

Three invariants govern these boundaries:

- **A Firebase ID token must never become the application's long-lived API bearer credential.** It is
  exchanged **once** for an Inventory AI access token. The API accepts Inventory AI tokens only.
- **The exchange is UID-authoritative. It never resolves an account by email.**
- **The link boundary never resolves an account from an identity.** The account is the authenticated
  caller's and the identity is the verified token's, so neither side of the association is read from
  a request body.

**On the link route, a rejected ID token is answered `400`, not `401`, and the distinction is
load-bearing.** The mobile client treats a `401` or `403` response to a request that carried a token
as session loss and clears the session. The link route is authenticated, so a `401` there would mean
"the Firebase credential was bad" and be acted on as "your Inventory AI session is gone" — signing a
user out over an unrelated failure. `400` states what actually happened and falls outside that rule.
The error `code` is unchanged, so a client branching on codes needs no second branch.

### Password Authority for Linked Accounts

When an account carries a `firebaseUid`, **Firebase is the authentication authority for it and the
retained `passwordHash` is not a second authentication door.** `POST /api/auth/login` refuses such an
account with `403 FIREBASE_SIGN_IN_REQUIRED`, after the password comparison and the status check — so
the refusal does not reveal whether the account exists — and before any session is written, so no
half-login can be left behind. This guard is **not to be removed or weakened**.

**Phase 32H made that population reachable for the first time** — it added the only operation that
writes `firebaseUid` onto an existing password account — and **Phase 32K decided and implemented the
consequence**: because Firebase holds such an account's credential, Inventory AI local password
operations **do not apply** to it.

- `POST /api/auth/change-password` is **refused** with `409 PASSWORD_NOT_APPLICABLE`, **before** the
  current-password comparison and before every effect — no hash rewritten, no `passwordChangedAt`
  stamped, no session revoked. That position is deliberate: placed after the comparison, a
  Firebase-native account (no hash) would report `400 INVALID_CURRENT_PASSWORD` while a linked account
  (hash retained) would report the boundary refusal — two different answers to one question, decided by
  whether an inert hash happens to remain on the document. `409`, not `401`/`403`, because the mobile
  client treats those two statuses on a token-bearing request as session loss and would sign the user
  out of a perfectly valid session.
- `POST /api/auth/forgot-password` takes the **silent exit**: one uniform `202`, with **no token, no
  email and no audit row**. Distinguishing such an address would be the account-existence oracle the
  recovery design refuses to be, and the check sits *after* the tenant check so it adds no new timing
  signal to a path whose residual database-work term is only partially mitigated. `POST
  /api/auth/reset-password` refuses with the generic `400 INVALID_RESET_TOKEN`, **last, immediately
  before the write**, so no local credential is ever created for such an account.

**No retained `passwordHash` is deleted, and none is created.** A hash a linked account already holds is
**retained and made inert** — deleting it now could make a later unlink irreversible, which is why that
lifecycle question remains open below. A **Firebase-native** account holds no hash at all.

**The timing equalizer is never a credential** (Phase 32K). `passwordHash` is optional, so a comparison
must still run — and still run at bcrypt cost — when an account has none, or a hashless account would be
distinguishable from a real one by response time. Its *result*, however, must never be accepted: a
placeholder that is a valid bcrypt hash of a known string would otherwise become a working password.
Both comparison sites — login and `change-password` — therefore route through one helper whose contract
is **no stored hash means no password**, so the timing property is preserved and acceptance is not.

The client learns whether local password management applies through a **provider-neutral capability** —
`authMethods: { password: boolean }` — published by both the public user DTO (`toPublicUser`) and
`requireAuth`'s `req.user`, so the two surfaces cannot disagree. The `firebaseUid` behind it is **never**
exposed: it is the identity join key this design keeps server-side. Nothing about the Phase 32E guard
itself changed — it is intact and unweakened, and the link route does not offer a second way in.

## Provider Identity Linking Policy

**A provider identity is NEVER automatically linked to an existing Inventory AI account merely because
the email address matches.** Email is **not** an account-linking join key.

Authenticating a provider identity is **not** proof of ownership of an existing Inventory AI account.
If an identity asserting `john@example.com` were merged into an existing `john@example.com` account on
the strength of the address alone, then anyone able to obtain a provider account bearing a victim's
address would receive that victim's session — their `businessId`, their role and their entire tenant's
data. A provider that does not verify addresses, or that allows an address to be changed later, makes
that reachable in practice rather than in theory.

The server therefore stays **UID-authoritative**, and linking is a deliberate act with an explicit
proof of ownership, never a side effect of matching an address.

### Safe Account Linking (server-side boundary implemented — Phase 32H)

Linking is an **explicit account operation performed by an already-authenticated user**:

```text
Inventory AI authenticated session
        ↓
user explicitly chooses "Connect Google" / "Connect Facebook"
        ↓
provider authentication
        ↓
verified Firebase credential
        ↓
Firebase account linking
        ↓
the existing Inventory AI account is unchanged
        ↓
businessId / role / status remain authoritative
```

Two constraints apply:

- **The provider UID must come from the verified Firebase credential or token, and never from the
  mobile request body.** As with `businessId`, `role` and `status`, a client-supplied provider
  identity is untrusted input.
- **Linking during a sign-in attempt requires an explicit ownership/recovery proof flow** before it
  may attach a provider to an existing Inventory AI account. A sign-in is evidence about an identity;
  it is not evidence about an account.

**The diagram's first half is implemented; its last step is not.** `POST /api/auth/firebase/link`
records that a verified Firebase identity belongs to an account that has already proved itself, and
that is the entire server-side boundary:

```text
POST /api/auth/firebase/link     authenticated, 200
body: { idToken }
-> { linked: boolean, user }
```

What it does, and what it deliberately does not:

- **The account comes from the caller's session** (`req.user.id`), never from the request. There is no
  `userId`, `businessId`, `firebaseUid`, `role` or `status` field in the accepted payload, so a body
  naming any of them is inert rather than rejected — the handler holds no client-supplied identity to
  forward.
- **The identity comes from the verified token's UID.** It is never compared with the account's email,
  never used to find an account, and never used to resolve a conflict. A provider that supplies no
  address links exactly as well as one that does.
- **It writes exactly two fields: `firebaseUid` and `emailVerified`.** It cannot move an account
  between businesses or change its role, because no code path writes `businessId`, `role` or `status`.
- **Four lifecycle cases, in an order that matters.** The same identity on the same account is an
  idempotent success (`linked: false`, no write, no audit row). An account that already owns a
  *different* identity is refused. An identity that already belongs to *another* account is refused
  and never transferred, merged or re-pointed. An identity belonging to nobody is attached — which is
  safe only because the caller has already proved they own this account.
- **Both refusals are one `409`** with one code and one generic message that names no account, tenant,
  role or Firebase UID, so the two are indistinguishable to the caller. The precise reason and the UID
  go to the audit trail and the server log, where the reader is the tenant's own operator rather than
  the caller — and the UID itself is kept out of the audit row, because that row is readable by every
  ADMIN of the business while a conflicting UID may name a person in a different one.
- **Concurrency is resolved by the database, not by a check.** The attachment is one conditional
  update that applies only while the account is still unlinked, and the `firebaseUid` unique index is
  the last line of defence behind the pre-check, so two accounts racing for one identity cannot both
  win.

**Still not implemented:** the provider half. There is no "Connect Google" or "Connect Facebook" UI, no
provider credential acquisition, no OAuth redirect flow, no `unlink` route, and no provider field on
any model. Firebase's own provider linking is performed by the Firebase client SDK against the
signed-in Firebase user; the server neither performs it nor has an API for it, and attaching a
provider is not a server-side operation at all — the UID does not change, so from the Inventory AI
side a Firebase account with several providers is simply one `firebaseUid`.

### Facebook and Missing Email

The `User` model requires an email. Facebook may not provide a usable email address for every
identity — its email permission is not granted by default, and an account may be phone-only.

Therefore:

- **Never invent an email address.**
- **Never derive a fabricated email from a Facebook UID.**
- If a Facebook identity lacks a usable email, the onboarding flow **must require email completion**,
  explicitly handled, before an Inventory AI user is created.

That onboarding behaviour is **not implemented**; it belongs to the future Facebook phase.

### Unlink, Revocation and Last-Method Protection

Unlinking is a client-side Firebase operation, so the **server cannot observe it**; Firebase refuses to
unlink a user's last provider, but its notion of "last method" covers only Firebase methods and is
unaware of a retained `passwordHash`. The application, meanwhile, refuses password login for any
account carrying a `firebaseUid`. **An unlink policy and last-authentication-method protection that
account for both sides are OPEN** and must be settled before an unlink capability ships. Phase 32H
implemented **no** unlink capability of any kind, server-side or otherwise, and left this open rather
than deciding it.

**Superseded in part, 2026-09-26 (Phase 32L — see `docs/DEVELOPMENT_ROADMAP.md` §27Q).** The paragraph
above is the Phase 32H record and is not rewritten. **The unlink policy is now settled and the
server-side capability shipped:** one authenticated route, `POST /api/auth/firebase/unlink`
(`requireAuth` + controller, no permission), detaches the caller's **own** `firebaseUid`. **Policy B is
the policy, and it is the last-authentication-method invariant made structural:** an account may leave
Firebase authority **only by establishing a NEW local password in the same transition**, so it never
passes through a zero-authentication-method state; the retained legacy hash is **REPLACED, never
re-enabled**, and the write touches only `firebaseUid`, `emailVerified`, `passwordHash` and
`passwordChangedAt`, so an unlink can never move a tenant or change a role. Stale authentication answers
`409 FIREBASE_REAUTHENTICATION_REQUIRED` (a 300-second window, enforced server-side from the signed
claim). **The premise above was also refuted by measurement, and the two measurements are distinct
facts:** in the **last-provider** measurement the unlink **succeeded on the account's final provider and
left the Firebase account with zero providers**, which is what refutes "Firebase refuses to remove the
last provider"; in the separate **390-second** measurement a provider unlink was **accepted** at an
authentication age where `updatePassword` was **refused** — a finding about *recency* rather than about
the last provider. Firebase's "last provider" protection therefore cannot be relied on, and
**last-authentication-method protection is enforced server-side and never delegated to Firebase**.
**Residual, recorded and not closed:** Firebase's own provider set remains a client-side operation this
server cannot observe; the server owns only the MongoDB `firebaseUid` detachment, and no server-side
provider-unlink capability was faked.

Ending an Inventory AI session revokes that session only. It never revokes the Firebase identity, and
disabling an Inventory AI user does not disable the corresponding Firebase user — the exchange refuses
the disabled account, which is what denies access.

## Provider-Neutral Sessions

**There must remain one unified Inventory AI session representation regardless of authentication
provider.** There are no provider-specific session types: a session is the same record whether the
identity was proved by a legacy password or by any Firebase provider.

**No provider field may be added to the session model** merely because Google or Facebook is being
added. Adding a provider adds *credential acquisition*, not a session path — every provider reaches
the server through the same exchange and inherits the same check order, so a disabled account or an
inactive business cannot be bypassed by choosing a different sign-in method.

### Open Items (decided as open, not as resolved)

These are **not settled**. They are listed so they cannot be settled silently in code, and each
requires an explicit owner decision before the phase that would implement it:

| Open item | Blocks |
| --- | --- |
| The unlink policy and last-authentication-method protection — **RESOLVED FOR THE SERVER-SIDE PATH 2026-09-26 (Phase 32L): the policy is Policy B** (an account may leave Firebase authority only by establishing a new local password in the same transition, so the server-side last-authentication-method invariant holds structurally). **Residual, recorded and NOT closed:** Firebase's own provider set is a client-side operation the server cannot observe. | ~~Any unlink capability~~ — the server-side capability shipped in Phase 32L; the residual above is recorded rather than closed |
| Whether `emailVerified` is enforced | Provider sign-in that relies on a provider-asserted address |
| M1 (native SDK) vs M2 (`expo-auth-session`) for the mobile provider integration — **CLOSED 2026-09-25 (Phase F1): RESOLVED as M1, the shipped architecture; M2 is superseded and its browser machinery removed** | ~~All Google/Facebook mobile work~~ — this row no longer blocks Google, which ships natively. Facebook Login remains future scope, and it inherits the M1 decision |
| The Facebook missing-email onboarding flow | Facebook Login |
| The remedy, if any, for the unhealable orphan (a legacy account whose email already has a Firebase identity that can never resolve to it) | The legacy migration/linking phase |
| `google-services.json` / `GoogleService-Info.plist` storage and whether they are committed | Any native provider configuration |
| Whether Firebase takes over the password reset flow, and the disposition of the Phase 26B/27 artefacts if it does | Password recovery |

**Retired by Phase 32K.** The linked-account disposition of `change-password` and the password reset
flow was previously listed here as a live defect. It is no longer open — Phase 32K decided and
implemented the boundary described under *Password Authority for Linked Accounts* above. The audit
accompanying that phase also **corrected the finding's wording**: an ordinary `change-password` attempt
by a Firebase-native account **fails** `400 INVALID_CURRENT_PASSWORD` (a hashless account has no current
password to verify) rather than reporting success; it was the **reset** flow that reported success while
writing an unusable credential, and `change-password` behaved as first described only for a linked
account that still carries a hash.

Two further facts are **UNVERIFIED** and gate later work rather than this one: whether Firebase's
`auth:import` accepts bcrypt hashes (which decides whether a bulk migration is possible at all), and
whether the React Native Firebase config plugin works with Expo SDK 57 (which decides whether M1 is
viable). Neither has been tested against a real project.

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

`middlewares/authenticate.ts` is the single authentication choke point and
requires all of the following before a request proceeds: a valid HS256 signature,
an unexpired token, a `sub` that is a real user, a **`jti` that names a session
which exists, belongs to that user, is not revoked and has not expired**, an
ACTIVE user, and an ACTIVE business. A token with no `jti` is rejected outright.

The session record (`server/src/models/session.model.ts`) stores the user, the
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
account-existence oracle. **Since Phase 28 B1 the send is dispatched without being awaited**, so that
record is written from the detached background path (`logDetachedMailFailure` in the recovery service)
after the response has already been sent — the caller's `202` is unaffected by it, and the transport
failure remains invisible in the response either way.

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

Both properties below are documented and accepted, and neither is fully closed. They are recorded in
`docs/DEVELOPMENT_ROADMAP.md` §27B "Accepted / Deferred Security Risks", with Phase 28 B1's own record
in §27D.

- `forgot-password` is a **timing oracle** on account existence: the responses are uniform, but the
  time taken is not. **Phase 28 B1 partially mitigated this, and it is NOT closed.** An unknown address
  costs one indexed lookup; a known one additionally costs writes, an audit row and — until Phase 28 B1
  — an outbound mail request, which was awaited before the response and was the dominant, most easily
  separable term of the difference. That transport request is **no longer on the request path**: the
  send is dispatched unawaited after the durable writes, so the largest and most measurable component
  is gone. **What remains is database work**, and it is explicitly **not** claimed to be eliminated. No
  delay is injected to mask it.
- **Distributed flooding of one address is not bounded, and this is unchanged.** The per-address limit
  is keyed by source address *and* email, and the per-source limit never sees a rotating attacker, so
  mail volume to a single victim is not capped across sources. Closing it needs a shared store (Redis),
  which is out of V1 scope by decision.

Future authentication may include:

- Facebook Login — **planned** (§29); approved as a provider, not implemented
- Apple Sign-In — future scope
- MFA — future scope

*(**Google Sign-In was removed from this list when it shipped.** It is **implemented** — see §29.)*

Firebase Authentication **is** implemented as the identity provider (§29). **Google Sign-In is also
implemented** — the native provider SDK (`@react-native-google-signin/google-signin`) is installed and
the existing-account Android flow is E2E verified (2026-09-26), while the new-identity
`REGISTRATION_REQUIRED` path remains environment-blocked. Facebook is the one approved provider still
unimplemented: **no Facebook provider SDK is installed and no Facebook provider route exists.** Apple
Sign-In is future scope and is not part of the current implementation. Enforcing `emailVerified` is
likewise not implemented.

Account linking is **half** implemented, and the half matters: since Phase 32H the **server-side
boundary** exists (`POST /api/auth/firebase/link`, authenticated — see §29), while the provider side
does not. There is no "Connect Google", no OAuth redirect, no unlink, and no provider field on any
model. *(**Superseded in part 2026-09-26 (Phase 32L): the server-side unlink boundary now exists** —
`POST /api/auth/firebase/unlink`, under Policy B — while Firebase-side provider unlinking remains a
client-SDK operation the server cannot observe and no provider SDK was installed. This sentence is the
Phase 32F record and is not rewritten.)* The boundary is what Google and Facebook will converge on; it is not Google or Facebook.

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

`server/src/constants/roles.ts` is the single source of truth for capabilities.
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
not consumed by `middlewares/authorize.ts` and takes no part in any runtime
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

## User Creation Hierarchy

User management is the `users.manage` capability (OWNER and ADMIN only), exposed over `/api/users`.
Who may create whom is a strict server-side rule:

| Actor | May create / assign | May not |
| --- | --- | --- |
| OWNER | ADMIN, MANAGER, STAFF | — |
| ADMIN | MANAGER, STAFF | ADMIN or OWNER |
| MANAGER | — | any user (no such capability) |
| STAFF | — | any user (no such capability) |

Additional invariants, all enforced server-side and tenant-isolated:

- **No OWNER may be created or assigned through the API.** The OWNER account is immutable.
- **No user may change their own role or status.**
- **An ADMIN may neither create, assign, nor modify another ADMIN.** Cross-ADMIN modification is an
  OWNER-only act and is refused rather than merely hidden.
- A `businessId` supplied by the client is ignored; the tenant is taken from the authenticated user.

Disabling a user takes effect immediately: it revokes login and every existing session, because the
user row is reloaded from the database on each request (§30, *Role Mutation Takes Effect Immediately*).

### Invitation-Based Onboarding (approved direction — not implemented)

Creating a user should eventually use an **invitation-based** flow rather than having the creator
establish another person's Firebase password:

```text
OWNER / ADMIN
      ↓
create invitation
      ↓
invitation bound to the intended business and role
      ↓
invitee authenticates with an allowed Firebase provider
      ↓
server validates the invitation
      ↓
server creates / activates the Inventory AI user
      ↓
businessId and role assigned SERVER-SIDE
      ↓
Inventory AI session created
```

The `businessId` and `role` are assigned by the server from the invitation, never accepted from the
invitee's request. **No invitation model, route, service or screen exists**, and none may be added
without an approved phase.

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
route reachable from `server/src/app.ts` therefore falls into exactly one declared class:

- **Permission-gated** — the route carries a capability gate as its first handler after
  `requireAuth`, and its declaration names the catalogue key. This is the default and the expectation
  for every route that reads or writes a business resource.
- **Authenticated** — `requireAuth` plus a controller, with no capability gate. Reserved for the
  caller's own account (`GET`/`PATCH /api/auth/me`, `POST /api/auth/change-password`, and the
  session-lifecycle routes `POST /api/auth/logout`, `GET /api/auth/sessions`,
  `DELETE /api/auth/sessions/:id` — a user's own sessions are self-service, so no capability is
  involved). Phase 32H's `POST /api/auth/firebase/link` belongs here for the same reason: it attaches
  an identity to the caller's own account and names no other account, and no catalogue key could
  express "may link an identity" without inventing an authorization concept the catalogue does not
  have. Also here are the categories/locations reads, which have no view capability in the catalogue.
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

`requireRole(...roles)` in `server/src/middlewares/authorize.ts` is the role-name allowlist behind
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
`server/src/constants/roles.ts` because the UI needs to know what to show. The mirror is **not** an
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
second copy of the role matrix and cannot silently disagree with `src/constants/roles.ts`; a grant
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
  (`middlewares/notFound.ts`) answers `{error, message}` with **no `code`**, while every `ApiError` 404
  carries one.
* **Denial is asserted exactly.** A refused cell asserts HTTP 403 with `code: 'FORBIDDEN'`; an
  unauthenticated request to a gated route asserts 401 with `code: 'AUTH_REQUIRED'`, sampled per tier
  rather than repeated per route because the structural suite already proves `requireAuth` is the first
  handler on every gated route.

## Role Mutation Takes Effect Immediately

Authorization is decided per request from current database state, never from token contents. An access
token carries only `sub`, `jti` plus the standard `iat`/`exp` — no role and no `businessId` claim —
and `middlewares/authenticate.ts` reloads the user (and therefore the role and business) from the
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

`src/utils/businessAccess.ts` (`assertBusinessAccess`, which emits the `FORBIDDEN_BUSINESS` code) has
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
OPENROUTER_API_KEY
OPENROUTER_BASE_URL
AI_MODEL_OPENROUTER
```

## Firebase Authentication

Firebase credentials are **server-side only** and are never sent to the mobile application. Either
the three separate values:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

or a single base64-encoded service-account document, which is preferred because it removes the
newline-mangling failure class entirely:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

Production fails fast in the existing `validateProductionConfig` contract: if any Firebase variable is
set, all required ones must be present and the key must parse. The error names only the **variable**,
never its value. In development and test these checks stay lenient, so the server still boots without
Firebase configured — and while Firebase is unconfigured the Firebase routes answer their own
not-configured error rather than the server failing to start.

`server/.env.example` carries these **names with comments and no values**. No credential, service
account document or private key is ever committed, logged, or returned in a response.

The mobile application holds **no** Firebase secret. Under the M2 integration path it uses only the
public `EXPO_PUBLIC_FIREBASE_*` client configuration (apiKey, authDomain, projectId, appId), which is
not a credential and cannot authorize anything by itself: the API accepts Inventory AI tokens only.

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
Push Notifications
Advanced Reports
Multiple Branch Improvements
Document Upload
RAG
MongoDB Vector Search
Improved AI Context
Facebook Login (Firebase provider)
```

Firebase Authentication itself is **not** future work — it shipped in Phases 32B–32E as the identity
provider (§29). **Google Sign-In is likewise no longer future work:** it shipped as a native provider
(Phase C) and its existing-account Android flow is E2E verified, so it has been removed from the list
above; only the new-identity `REGISTRATION_REQUIRED` path remains environment-blocked. The one provider
entry that remains is Facebook, which is approved but unimplemented — it needs its own phase and is
bound by §29's linking policy (no automatic linking on an email match) and by its open items (O-5), and
**no Facebook provider SDK is installed**. **Apple Sign-In remains future scope** and is not scheduled.

Shipped since this list was written, and therefore no longer future work: the barcode/QR scanner
(Phases 12B–12D), supplier management (Phases 13A and 17) and stock transfers (Phase 19). They were
removed from the list above by Phase 29 so that this roadmap states the remaining future scope rather
than repeating delivered work; their implemented behaviour is specified in §13–§19 and §39. This
reconciliation matches the equivalent note in `docs/DEVELOPMENT_ROADMAP.md` §35.

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

A **shared rate-limit / shared-state store** is also deferred to V4 rather than to V1. The
recovery-flooding exposure (B2) and the per-process limiter stores (E3) share one root cause and one
remedy, so they are recorded as related shared-infrastructure work and deferred together by the Phase
29 owner decision. Both remain **open**, V1 ships in-memory per-process limiters by decision, and no
shared store is in scope. See `docs/DEVELOPMENT_ROADMAP.md` §27B for the risks and §27E for the
decision.

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