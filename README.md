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
npm test                    # run the test suite (node --test)
```

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
| GET    | `/api/dashboard` | Totals, low/out counts, recent activity (MANAGER+)     |

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
- **Screens (Expo Router, authenticated group):** dashboard (MANAGER+), products
  (list/new/edit/detail with search, status/category/location and low/out filters),
  categories, locations, inventory (with low/out views), stock in, stock out, adjust
  (MANAGER+), inventory history, profile.
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

Phases 06–07 (AI assistant, testing + production hardening) are **not yet implemented**.
