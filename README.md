# Inventory AI

An AI-powered inventory management system for Android and iOS.

- **Mobile:** React Native + Expo + Expo Router (JavaScript)
- **Backend:** Node.js + Express (JavaScript, ES Modules)
- **Database (Phase 02+):** MongoDB Atlas + Mongoose
- **AI (Phase 06):** read-only assistant via a provider abstraction

> **Phase discipline:** This project is built in strict phases (see
> `docs/DEVELOPMENT_ROADMAP.md`). The system specification in
> `docs/SYSTEM_SPECIFICATION.md` is the primary source of truth.

---

## Repository Structure

```text
/
├── CLAUDE.md
├── docs/                  (specification + roadmap)
├── mobile/                (React Native + Expo + Expo Router app)
└── server/                (Node.js + Express REST API)
```

`mobile/` and `server/` are **independent workspaces** — each has its own
`package.json` and lockfile. There is intentionally no root `package.json`.

---

## Prerequisites

- Node.js **≥ 18 LTS** (recommended: current LTS)
- npm (ships with Node)
- Git

Check your versions:

```sh
node --version
npm --version
git --version
```

---

## Backend (`server/`)

Express API using ES Modules. Mongoose provides the MongoDB data layer (Phase 02):
models, schema validation, and indexes. A health endpoint and centralized 404/error
handling are in place. Authentication and role-based authorization (Phase 03) use
JWT + bcrypt with server-authoritative role/business context on every request.

```sh
cd server
npm install
cp .env.example .env        # add MONGODB_URI and JWT_SECRET here (real values, never committed)
npm run dev                 # start with auto-reload (node --watch)
npm test                    # full test suite (requires MongoDB — see "Backend tests")
npm run lint                # backend ESLint baseline (no MongoDB — see "Backend lint")
```

### Backend tests

The backend test suite is **classified** (DB-independent vs DB-required) and is
**never silently green** when MongoDB is unreachable.

```sh
npm test              # full suite: DB-independent + DB-required (requires MongoDB)
npm run test:unit     # DB-independent tests only (never touches MongoDB)
npm run test:db       # DB-backed tests only (requires MongoDB)
```

- **`npm test` (default) requires MongoDB.** A DB-required suite that cannot reach
  the database becomes **one failing test** with an actionable message — the run
  exits non-zero instead of skipping and reporting a false green.
- **`npm run test:unit`** runs only the DB-independent tests and is safe with
  MongoDB down or unset. DB-backed suites become one visibly **skipped** test each,
  each carrying the reason (`TEST_MODE=unit`).
- **`npm run test:db`** runs only the DB-backed tests; DB-independent suites are
  likewise shown as visibly skipped.
- **Intentional skipping is explicit and never silent.** Suites declare their class
  through `dbSuite()` / `unitSuite()` in `server/test/testEnv.mjs`; an out-of-mode
  suite is always a *visible* skipped test (never a hidden describe-level skip), and
  an unknown `TEST_MODE` prints a warning and falls back to `full`. If MongoDB is
  unavailable, nothing is skipped: DB-required tests fail loudly so a drop in
  coverage can never look like a passing run.

### Backend lint

`npm run lint` runs the backend ESLint baseline (`eslint .` from `server/`, config in
`server/eslint.config.js`) across `src/`, `test/`, and `scripts/`. The baseline is practical and
bug-focused — ESLint's `recommended` rules plus Node globals for ES Modules and one consistency
rule (`eqeqeq`); it intentionally does **not** enforce formatting. It requires a Node version
ESLint 10 supports (≥ 20.19, ≥ 22.13, or ≥ 24 — current LTS recommended); that is a
developer-tool floor only, not a runtime requirement.

### Request logging & correlation IDs

Every response carries an `X-Request-ID` header — a request/correlation id that is also available
server-side as `req.requestId` throughout the middleware chain and error handling. A client-supplied
id is echoed only when it is a safe header value (≤ 128 chars, `[A-Za-z0-9._:-]`); otherwise a
fresh cryptographic id (`crypto.randomUUID()`) is generated.

The server logs one structured JSON line per completed request — `requestId`, method, path (never
the query string), status, authenticated `userId`, and duration — plus structured server-side error
records carrying the same id and user context. Logs **never** contain authorization headers,
cookies, request bodies, query strings, or full AI prompts/responses. The per-request access log is
on by default; set `LOG_REQUESTS=0` in `server/.env` to disable it (error logs still emit). The
test runner forces `LOG_REQUESTS=0` so suites stay quiet.

### Commercialization foundation (Phase 10)

`Business.planCode`, the centralized plan catalog (`server/src/constants/plans.js`), and
`server/src/services/entitlement.service.js` provide the SaaS foundation. Every business carries a
plan code — default `FOUNDATION`, the unlimited V1 baseline — and business-level entitlement checks
are available through `getBusinessPlan` / `assertBusinessEntitled`. This is groundwork only: actual
subscriptions, the billing lifecycle, payment providers, AI usage metering, and paid-plan
enforcement are **deferred** (V4) and not implemented. No V1 behavior is gated or changed.

### Inventory intelligence & restock alerts (Phase 11)

The dashboard summary and the product API now expose read-only decision support built on the existing
availability math. The dashboard reports a healthy **in-stock** count alongside active products,
total on-hand quantity, low-stock, and out-of-stock counts (low = available ≤ `minimumStock`; out =
available ≤ 0; in-stock = active products above minimum — the exact complement of low, i.e.
`totalProducts − lowStockProducts`, so it always agrees with the low count). `GET
/api/products/reorder` returns ACTIVE products whose available quantity is at or below their minimum,
each flagged `OUT_OF_STOCK` vs `LOW_STOCK`, worst (most depleted) first, with `q`/category filters
and standard pagination. The AI assistant gained a ninth read-only tool, `getReorderNeededProducts`
(permissioned and business-isolated like its siblings), which answers "what needs restocking" /
"which products are out or low in stock". The MANAGER+ mobile dashboard shows an "Inventory health"
tile row and a compact "Needs restock" preview of the worst candidates (taps into product detail for
stock-in). Read-only throughout — no data-model change, no AI write action, no new dependency.

Models (collections):

```text
Business  User  Location  Category  Product  Inventory
InventoryTransaction  AuditLog  AIConversation  AIMessage
```

Endpoints:

| Method | Path            | Description                                             |
| ------ | --------------- | ------------------------------------------------------- |
| GET    | `/`             | Service info                                            |
| GET    | `/api/health`   | Health check + DB connection state (`200` JSON)         |
| POST   | `/api/auth/register` | Register a Business + OWNER user (`201`, no token)  |
| POST   | `/api/auth/login`    | Log in, returns `{ token, tokenType, expiresIn, user }` |
| GET    | `/api/auth/me`  | Current user (requires `Authorization: Bearer <token>`) |

Phase 04 — catalog, inventory, dashboard (all `Authorization: Bearer <token>`):

| Method | Path            | Description                                             |
| ------ | --------------- | ------------------------------------------------------- |
| GET    | `/api/categories` | List/search categories                                |
| POST   | `/api/categories` | Create category (OWNER/ADMIN)                          |
| GET    | `/api/categories/:id` | Get one category                                    |
| PATCH  | `/api/categories/:id` | Update category                                    |
| POST   | `/api/categories/:id/archive` `/restore` | Archive/restore                     |
| GET    | `/api/locations` | List/search locations                                  |
| POST   | `/api/locations` | Create location (OWNER/ADMIN)                          |
| GET    | `/api/locations/:id` | Get one location                                    |
| PATCH  | `/api/locations/:id` | Update location                                    |
| POST   | `/api/locations/:id/archive` `/restore` | Archive/restore                     |
| GET    | `/api/products` | List/search products (`q`, `status`, `categoryId`, `locationId`, `lowStock`, `outOfStock`) |
| GET    | `/api/products/reorder` | Products needing restock — available ≤ `minimumStock`, each OUT/LOW, OUT first |
| POST   | `/api/products` | Create product (MANAGER+)                              |
| GET    | `/api/products/:id` | Get one product (nested category)                  |
| PATCH  | `/api/products/:id` | Update product (MANAGER+)                          |
| POST   | `/api/products/:id/archive` `/restore` | Archive/restore (MANAGER+)        |
| GET    | `/api/inventory` | Inventory rows with availability + low/out flags       |
| GET    | `/api/inventory/:id` | Get one inventory row                              |
| POST   | `/api/inventory/stock-in` | Stock in (STAFF+)                               |
| POST   | `/api/inventory/stock-out` | Stock out (STAFF+)                              |
| POST   | `/api/inventory/adjust` | Adjust to absolute quantity (MANAGER+)             |
| GET    | `/api/inventory/history` | Transaction history (filters, pagination)         |
| GET    | `/api/dashboard` | Totals, in-stock/low/out counts, recent activity (MANAGER+) |

Phase 06 — AI assistant (all `Authorization: Bearer <token>`, require `ai.use`):

| Method | Path            | Description                                             |
| ------ | --------------- | ------------------------------------------------------- |
| POST   | `/api/ai/chat`  | Run a chat turn — creates the conversation on first turn, persists user + assistant messages, executes read-only tools. Per-user rate limited |
| GET    | `/api/ai/conversations` | List my conversations (newest first, paginated)   |
| POST   | `/api/ai/conversations` | Create a conversation (optional `title`)           |
| GET    | `/api/ai/conversations/:id/messages` | Get one conversation's messages (oldest first)  |

Phase 13 — suppliers & purchase orders (all `Authorization: Bearer <token>`; list/get viewable by every
authenticated member, mutations by the noted permissions):

| Method | Path            | Description                                             |
| ------ | --------------- | ------------------------------------------------------- |
| GET    | `/api/suppliers` | List/search suppliers                                 |
| POST   | `/api/suppliers` | Create supplier (`suppliers.manage`: OWNER/ADMIN/MANAGER) |
| GET    | `/api/suppliers/:id` | Get one supplier                                   |
| PATCH  | `/api/suppliers/:id` | Update supplier (name, description, contact fields) |
| POST   | `/api/suppliers/:id/archive` `/restore` | Archive/restore (manage)        |
| GET    | `/api/purchase-orders` | List purchase orders                                |
| POST   | `/api/purchase-orders` | Create draft order (`purchase-orders.manage`: OWNER/ADMIN/MANAGER) |
| GET    | `/api/purchase-orders/:id` | Get one order (lines, totals, receipts, pending claims) |
| PATCH  | `/api/purchase-orders/:id` | Update a **DRAFT** order (DRAFT-only, `PO_NOT_DRAFT` otherwise) |
| POST   | `/api/purchase-orders/:id/issue` | Issue DRAFT → OPEN (`PO_ALREADY_OPEN`/`PO_CANCELED` guards) |
| POST   | `/api/purchase-orders/:id/cancel` | Cancel DRAFT/OPEN → CANCELED              |
| POST   | `/api/purchase-orders/:id/receive` | Receive stock (`purchase-orders.receive`: STAFF+; claim-first) |

Phase 16 — audit trail (read-only, `Authorization: Bearer <token>`, OWNER/ADMIN only):

| Method | Path            | Description                                             |
| ------ | --------------- | ------------------------------------------------------- |
| GET    | `/api/audit`    | Read-only governance trail — every recorded action, newest first. Filters: `action`, `entityType`, `userId`, `from`/`to`, `q`; paginated. Strict whitelisted DTO with actor name; system rows return `actor: null` |

The V1 assistant is **read-only**: it answers questions about the caller's catalog and
stock through 9 server-side, authorization-aware tools (`searchProducts`, `getProduct`,
`getInventory`, `getLowStockProducts`, `getOutOfStockProducts`, `getInventorySummary`,
`getInventoryHistory`, `getProductsByLocation`, `getReorderNeededProducts`). Tools always run inside the
authenticated user's role and `businessId` context — the AI never connects to MongoDB
directly and can never change products, stock, transactions, users or roles. If no AI
provider is configured, chat returns `503 AI_NOT_CONFIGURED`; the rest of the API keeps
working normally.

Roles: `OWNER`, `ADMIN`, `MANAGER`, `STAFF`. Protected routes derive role, status,
and `businessId` from the database for every request (never from the client or token
claims); `DISABLED` accounts are rejected. Phase 04 reuses that RBAC permission set:
catalog writes need `categories.manage`/`locations.manage` (OWNER, ADMIN) or
`products.manage` (MANAGER+); stock-in/stock-out and inventory/history reads are open
to STAFF and up, while `adjust`, the dashboard and transaction-view permissions are
MANAGER+.

Inventory semantics: availability = `quantity − reservedQuantity`
(`reservedQuantity` stays `0` in V1). Low stock = available ≤ `minimumStock`;
out of stock = available ≤ `0`. Mutations are atomic single-document updates with
negative-stock guards. The Atlas free/shared tier does not support multi-document
transactions, so when a transaction/audit write fails after a movement, the inventory
change is compensated (rolled back) instead — there is no read-modify-write race. SKU
and barcode uniqueness is enforced per business by **partial** unique indexes (a
compound sparse index would wrongly reject a second SKU-less product).

The server listens on `PORT` (default `4000`). It starts even when MongoDB is
unreachable — `/api/health` reports `db: connected|disconnected`.

---

## Mobile (`mobile/`)

Expo app with Expo Router (file-based routing), written in JavaScript. It is a **client
only** — the backend is the security boundary. The app never connects to MongoDB and
never holds MongoDB or AI credentials. The JWT is the only thing persisted (Expo
SecureStore); the user profile is re-fetched from `/api/auth/me` on every launch so
role/status always reflect the server.

```sh
cd mobile
npm install
cp .env.example .env        # optional: set EXPO_PUBLIC_API_URL (see below)
npx expo start              # start Metro dev server (Expo Go / simulator)
```

- **API base URL:** the app reads `EXPO_PUBLIC_API_URL`. When it is unset it defaults to
  `http://10.0.2.2:4000` on Android (emulator loopback) and `http://localhost:4000`
  elsewhere — i.e. the local Phase 03/04 backend. Point `EXPO_PUBLIC_API_URL` at your
  server when running on a physical device.
- **Screens (Expo Router, authenticated group):** dashboard (MANAGER+; inventory-health tiles and a "Needs restock" preview), products
  (list/new/edit/detail with search, status/category/location and low/out filters),
  categories, locations, inventory (with low/out views), stock in, stock out, adjust
  (MANAGER+), inventory history, **AI assistant** (conversation hub, new chat and
  conversation threads — read-only; a configured provider is required for real answers),
  profile.
- **Theming & design system (Phase 18A):** the app renders a semantic **light** and **dark**
  palette from `lib/theme.js` tokens via `ThemeProvider`/`useTheme`
  (`lib/theme-context.jsx`); the scheme follows the OS automatically
  (`userInterfaceStyle: "automatic"`) and can be pinned via a persisted preference.
  Reusable primitives live in `mobile/components/` (`Button`, `Card`, `Badge`, `Chip`,
  `Input`, `SelectField`, `Screen`, `StatCard`, `ListRow`, `Sheet`, `SearchField`,
  `IconButton`, …) and icons come from a semantic `icons.js` map over
  `@expo/vector-icons`. See `docs/DESIGN_SYSTEM.md`. Native font scaling stays enabled;
  controls are ≥ 44px and status always reads through text/icon + color.
- **Client-side RBAC gating mirrors the server permission matrix** purely to hide
  actions a role cannot perform (e.g. adjust for STAFF). The backend still enforces every
  permission, role and `businessId` on each request.
- Stock quantities are always read from the server (`/api/inventory`) — the client never
  independently computes stock. Movement forms submit to the atomic server endpoints and
  surface backend errors (insufficient stock, archived product/location, no change, etc.).

> Install React Native related packages with `npx expo install`, not plain `npm install`,
> so versions stay compatible with the Expo SDK.

---

## Environment Configuration

Secrets and configuration live in environment variables. Real credentials are **never**
committed.

- Copy `server/.env.example` to `server/.env` for local development.
- `.env` files are git-ignored; `.env.example` contains variable **names only**.
- **AI provider (Phase 06):** set `AI_PROVIDER` to `claude`, `gemini`, or `agentrouter`
  (an Anthropic-compatible gateway, e.g. routing to DeepSeek-V4-Flash) in `server/.env`
  and add the matching `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or
  `AGENTROUTER_API_KEY` + `AGENTROUTER_BASE_URL`. AI credentials stay server-side —
  they are never sent to the mobile app.

---

## Phase Status

- **Phase 00 — Planning & Inspection:** complete
- **Phase 01 — Project Foundation:** complete (Expo mobile scaffold + Express server scaffold)
- **Phase 02 — Backend + Database:** complete — Mongoose models, indexes, and DB connection
  module implemented and **verified against a live MongoDB Atlas connection**
  (`MONGODB_URI` in `server/.env`, database `inventory_ai`); `/api/health` reports `db: connected`
- **Phase 03 — Authentication + Authorization:** complete — register/login/me, JWT + bcrypt,
  OWNER/ADMIN/MANAGER/STAFF RBAC, server-side business isolation, duplicate/prevention and
  validation; verified by unit + integration tests and a live end-to-end check
- **Phase 04 — Inventory Core:** complete — locations/categories/products CRUD with archive/search,
  inventory stock-in/stock-out/adjust, availability + low/out-of-stock flags, transaction history,
  dashboard, and audit logs; multi-tenant isolation and RBAC reused from Phase 03; verified by 65
  integration tests against a live Atlas connection
- **Phase 05 — Mobile Application:** complete — Expo (SDK 57) + Expo Router app consuming the
  Phase 03/04 API: register/login/logout with secure JWT persistence (Expo SecureStore) and
  session restore via `/api/auth/me`; dashboard, products, categories, locations, inventory,
  stock in/out, adjust (MANAGER+), history and profile screens; centralized API client with
  timeout/network handling; client RBAC gating mirrors the server; verified by `expo export`
  bundling for Android and iOS plus a secret scan
- **Phase 06 — AI Assistant:** complete — provider abstraction (Claude/Gemini over Node `fetch`,
  no AI SDK dependency), an AI service that orchestrates tool calls with strict read-only,
  authorization-aware tools (9 inventory tools), conversation/message persistence, a rate-limited
  `/api/ai/chat` endpoint plus conversation listing/creation and message retrieval, and a mobile
  chat UI (hub, new chat, threads) with loading/error/empty states. Tool execution is bound to the
  authenticated user's role and `businessId`; the AI never reaches MongoDB directly and never
  changes data. Verified by 128 backend tests (Phase 06 suites included) and an emulator
  walkthrough of the mobile chat screens

Phase 07 (testing + production hardening) and Phase 08 (owner-directed hardening) are **complete**:

- **Phase 07 — Testing + Production Hardening:** complete, delivered as increments 07A–07G —
  tenant/auth security (login/register rate limiting, business status), HTTP security hardening
  (helmet headers, CORS allow-list, JSON body limit, trust proxy), inventory + database-operation
  hardening, production config with fail-fast startup and graceful shutdown, AI conversation
  reliability, fail-loud DB-gated test infrastructure, and final production hardening
- **Phase 08 — Owner-Directed Hardening:** complete, delivered as increments 08A and 08B —
  structured request logging + correlation IDs (`X-Request-ID`, `LOG_REQUESTS`; see
  "Request logging & correlation IDs") and a backend ESLint baseline (`npm run lint`; see
  "Backend lint")
- **Phase 10 — Commercialization Foundation:** 10A (foundation) approved and 10B (documentation
  close-out) recorded — `Business.planCode`, a centralized plan catalog with feature limits, and
  `entitlement.service.js` entitlement checks now provide the SaaS foundation (see
  "Commercialization foundation"). Groundwork only: actual subscriptions, the billing lifecycle,
  payment providers, AI usage metering, and paid-plan enforcement are **deferred** (V4) and not
  implemented. V1 completion status is unchanged. Verified by `npm run lint` (0/0) and the full
  backend suite (240/240).
- **Phase 11 — Inventory Intelligence & Alerts:** 11A (implementation) approved and committed
  (`fe1b21d`), 11B (documentation close-out) recorded — dashboard inventory-health counts
  (in-stock / low / out, plus active products and total on-hand), a reorder-needed endpoint
  (`GET /api/products/reorder`), a read-only `getReorderNeededProducts` AI tool, and a mobile
  dashboard inventory-health + "Needs restock" preview (see "Inventory intelligence & restock
  alerts"). Read-only throughout — no data-model, RBAC, or V1 status change. Verified by
  `npm run lint` (0/0), the DB-free unit run (106 passed), and the full backend suite (257/257).
- **Phase 16 — Audit Trail Viewer:** implemented, verified, commit pending owner sign-off — the
  read side of the audit feature (the write path existed since Phase 04). `GET /api/audit` exposes
  the business-scoped governance trail newest-first with action/entityType/user/date/q filters and
  pagination, gated by a new `audit.view` permission (OWNER + ADMIN only; MANAGER/STAFF get 403). No
  model change, no new dependency, no write routes. Mobile: an Audit Log screen + dashboard tile for
  OWNER/ADMIN. Verified by `npm run lint` (0/0), the DB-free unit run (107 passed), the full backend
  suite (350/350), and mobile android+iOS exports.
- **Phase 17 — Mobile Supplier & Purchase Order Management:** implemented, verified, commit pending
  owner sign-off — the mobile management half of the Phase 13 supplier/PO backend, with **ZERO
  backend changes**. A Suppliers screen (create/edit/archive/restore incl. contact fields) via an
  additive `fields` prop on the shared `RefManage` (Categories/Locations unchanged), and the full PO
  lifecycle on mobile — create DRAFT, edit DRAFT, issue, cancel — using the exact existing backend
  error codes. The permission mirror gains `suppliers.manage`/`suppliers.view` (ADMIN + MANAGER
  manage, every role views); STAFF stays view-only for supplier/PO management but can still receive.
  Verified by `npm run lint` (0/0), the full backend suite (350/350 — regression check only, no
  server file changed), and mobile android+iOS exports.
- **Phase 18A — SaaS-style UI Foundation, Light/Dark Theme System & Readability:** implemented,
  verified, commit pending owner sign-off — a semantic **light + dark** theme system
  (`lib/theme.js` palettes + `ThemeProvider`/`useTheme` in `lib/theme-context.jsx`, preference
  persisted via expo-secure-store, `userInterfaceStyle: "automatic"`), the behavior-neutral
  conversion of all 41 non-owner-held theme importers to `useTheme()`, `@expo/vector-icons` behind a
  semantic `icons.js` map, new primitives (`IconButton`, `SectionHeader`, `ListRow`, `StatCard`,
  `Sheet`, `SearchField`, `ListScreen`), and a readability pass (44px+ touch targets, labelled icon
  controls, status via text/icon + color, larger type for key quantities/status/prices, native font
  scaling kept enabled, WCAG-AA contrast in both themes, layouts verified at increased font sizes).
  **Zero backend changes.** Verified by mobile android+iOS exports and an emulator smoke
  (light → dark → increased font size); owner-held files (`_layout.js`, `SignOutIcon.jsx`)
  byte-identical. See `docs/DESIGN_SYSTEM.md`.
