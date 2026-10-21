# Inventory AI

An AI-powered inventory management system for Android and iOS.

- **Mobile:** React Native + Expo + Expo Router (TypeScript)
- **Backend:** Node.js + Express (TypeScript, ES Modules)
- **Database (Phase 02+):** MongoDB Atlas + Mongoose
- **Email (Phase 26B / AUTH-04):** transactional mail through a provider-agnostic server boundary —
  **Brevo** in development and production — for password-reset links and the custom 6-digit
  email-verification codes
- **AI (Phase 06):** read-only assistant via a provider abstraction

> **Phase discipline:** This project is built in strict phases (see
> `docs/DEVELOPMENT_ROADMAP.md`). The system specification in
> `docs/SYSTEM_SPECIFICATION.md` is the primary source of truth.

**Not a programmer?** Start with the plain-English guides in
[`docs/guides/`](docs/guides/README.md): running the app on a laptop, running it on a phone,
mirroring the phone to a laptop, the test accounts and mock data, and a reference for every script
and command the project ships. They explain the technical terms as they go, and they never contradict
the documents above.

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

- Node.js **≥ 24** — `.nvmrc` pins the major version. The server runs its `.ts` modules
  directly, with no build step, through Node's native type stripping (on by default from
  Node 24); an older runtime cannot start it.
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

### TypeScript migration (campaign complete)

The backend source is **TypeScript**, and the server TypeScript migration campaign
(**TS-1** … **TS-2F-p**) is **complete and closed**. `server/src` holds **117** `.ts` modules (94 at campaign close-out; re-counted 2026-10-10) and
exactly one intentionally deferred `.js` module, `server/src/services/entitlement.service.js`;
`.ts` is canonical for all new and modified server code.

There is no build, transpile or bundle step — `tsc` is configured as a checker only
(`noEmit`), and the runtime executes the sources directly (see "Prerequisites").
`docs/TS-MIGRATION-MANIFEST.md` records the full campaign: the commit history, the deferred
exception, and the verification baseline.

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

### Deployment & auto-deploy (Render)

The backend is deployed to Render as the service **`ai-inventory`**, which runs **only the
backend** — its build and start commands are relative to the repository's `server/` directory,
configured as **`rootDir: server`**. The service's Auto-Deploy setting is **`On Commit`**.

Together these two settings have one important consequence: **Render receives every push to the
repository, but a push does not necessarily trigger a deployment.** With a root directory set,
Render only auto-deploys when the pushed change affects at least one file **under that root
directory** — here, under `server/`. A push that touches only `mobile/`, `docs/`, `README.md`,
`CLAUDE.md`, or any other path outside `server/` is **correctly skipped**, and no deployment is
created.

> **`GitHub push received by Render` ≠ `Render deployment triggered`.**
>
> **`Auto-Deploy: On Commit` + `rootDir: server`** means *deploy the backend when the backend
> changes* — not *deploy on every repository change*.

A skipped deploy is **expected Render behavior, not necessarily an auto-deploy failure**. Observed
examples:

| Push | Files changed under `server/` | Auto-deployed? |
| ---- | ----------------------------- | -------------- |
| `fa87941` (PR #1 merge) | 22 | ✅ yes |
| `dbdf673` (PR #2 merge) | 0 (`mobile/**` + `docs/**` only) | ❌ skipped (expected) |
| `37f5535` (PR #3 merge) | 0 (`docs/**` only) | ❌ skipped (expected) |

**Troubleshooting a "missing" Render deployment**

1. **First, check whether the pushed change actually affects `server/`.** If it does not
   (docs/mobile-only), there is nothing to fix — Render intentionally skipped a backend deploy
   that was not needed. Do **not** reconnect GitHub, create webhooks, or manually deploy in
   response.
2. Confirm Render received the push: a **GitHub check suite created by the `render` app** on the
   commit proves delivery. **The absence of a deployment does not, by itself, mean the GitHub
   connection is broken.**
3. Only if the commit **clearly changes files under `server/`** and still did not auto-deploy
   should you look at Render's Auto-Deploy configuration and its service Events/Deploys. The usual
   causes there are the Auto-Deploy mode, the linked branch, build filters, a `[skip render]`-style
   directive in the commit message, or a suspended service.

### Required production configuration (Render + EAS)

**Deployment configuration is split by design.** The repository holds the code, the `mobile/eas.json`
profiles and the **names** of every variable (`server/.env.example`); the **values** live in the Render
service and the EAS project dashboards. A variable's absence from a repository file is therefore **not**
evidence that it is unset.

**Server (Render service `ai-inventory`).** The server fails fast at boot when a **required** variable
is missing or unusable (`server/src/config/validateConfig.ts`); everything else has a documented
default and needs no dashboard entry. Verify the current values in the Render dashboard, not here.

| Variable | Required in production | Notes |
| --- | --- | --- |
| `MONGODB_URI` | **required** | startup exits when missing |
| `JWT_SECRET` | **required** | at least 32 characters |
| `JWT_EXPIRES_IN` | optional | default `1h` (AUTH-02: the Inventory AI access token is short-lived); an unparseable value fails fast. Session longevity is bounded **separately** by the 14-day absolute session cap, so this value never changes how long a session lasts |
| `JWT_ISSUER`, `JWT_AUDIENCE` | optional | defaults `inventory-ai` / `inventory-ai-api` (AUTH-02); non-secret, non-environment-specific labels minted and validated on every request. A token minted before AUTH-02 carries neither claim and is rejected, so every existing user signs in once more |
| `AI_PROVIDER` | optional | empty = AI disabled; when set, that provider's own keys become required |
| `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `AI_MODEL_OPENROUTER` | **required when `AI_PROVIDER=openrouter`** | the model has no default |
| `AI_FALLBACK_MODELS_OPENROUTER`, `AI_MODEL_FAILURE_THRESHOLD`, `AI_MODEL_COOLDOWN_MS` | optional | AI-29/AI-31 automatic failover and promotion: an ordered, comma-separated candidate chain (max 5, empty = no failover), how many consecutive availability failures rest a model (default **5**) and the first cooldown in ms (default **30000**, backing off to 5 min). The active model is runtime state only — `AI_MODEL_OPENROUTER` is never rewritten, and a restart returns to it. `npm run ai:models` shows the chain; see `docs/guides/6-scripts-and-commands.md` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` — or the three-variable form | **all-or-nothing** | a partially supplied service account fails fast; none at all = Firebase disabled |
| `TRUST_PROXY` | **effectively required behind Render** | set to `1`; see below |
| `MAIL_PROVIDER`, `MAIL_FROM`, `BREVO_API_KEY`, `PASSWORD_RESET_URL` | optional | **Brevo** is the mail provider in development and production and the **only built-in transport** (`MAIL_PROVIDER=brevo`). Missing configuration **disables password recovery only** (`forgot-password` answers 503) — the server still starts and serves every other feature. The mail layer keeps a provider-agnostic boundary, but no second transport ships; no Firebase reset flow is implemented |
| `AUTH_*_RATE_LIMIT_*` — **twenty-two** variables (eleven window/limit pairs) | optional | the documented defaults are the production values; the count is taken from code, not estimated. AUTH-03 added the per-IP session-renewal pair (`AUTH_SESSION_RENEW_RATE_LIMIT_WINDOW_MS` / `AUTH_SESSION_RENEW_RATE_LIMIT_MAX`, default 15 min / 120) and AUTH-04 the two per-IP email-verification pairs (`AUTH_EMAIL_VERIFICATION_REQUEST_*` / `AUTH_EMAIL_VERIFICATION_CONFIRM_*`, both 15 min / 30). `TRUST_PROXY` and `JWT_SECRET` / `JWT_EXPIRES_IN` / `JWT_ISSUER` / `JWT_AUDIENCE` are listed separately above and are **not** `AUTH_*` variables |
| `CORS_ORIGINS`, `JSON_BODY_LIMIT`, `SHUTDOWN_TIMEOUT_MS`, `LOG_REQUESTS` | optional | the documented defaults are the production values |

**`TRUST_PROXY=1`.** Render terminates TLS at a proxy, so without this setting `req.ip` is the proxy's
address for every request and the per-IP auth rate limiters would share one bucket across all clients.
Setting the exact hop count (`1`) restores real client addresses. Never set it to `true` — an unbounded
forwarded chain lets anyone spoof `X-Forwarded-For`. See `server/src/config/env.ts`.

**Mobile (EAS project).** Only `preview` and `production` carry an explicit `env` block in
`mobile/eas.json`, and only for `EXPO_PUBLIC_API_URL` (both point at `https://ai-inventory-l1mi.onrender.com`).
Everything else the app needs at build time is a **dashboard environment variable**, not a value missing
from the repository:

| EAS environment variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID` | public Firebase client configuration — not a credential and unable to authorize anything on its own |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | native Google Sign-In |
| `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST` | **file** variables feeding `android.googleServicesFile` / `ios.googleServicesFile` (`mobile/app.config.js`) — a missing or renamed variable fails from inside Gradle, so the names are load-bearing |

The Firebase Android **SHA-1 / SHA-256** fingerprints are configured in the Firebase console, not in
the repository. `mobile/.easignore` excludes `.env`, `.env.*`, `google-services.json` and
`GoogleService-Info.plist` from a remote build, so a build must receive these through the dashboard.

**What is deliberately *not* in the repository.** Local secrets and build-time configuration are
excluded on purpose — they are not missing:

- `server/.env` and `mobile/.env` hold **developer-local** values and are git-ignored. The tracked
  `server/.env.example` and `mobile/.env.example` carry variable **names only**. `dotenv` resolves from
  the process working directory (`server/`), so a root-level `.env` is read by nothing.
- `mobile/google-services.json` and `mobile/GoogleService-Info.plist` are **not** committed (owner
  decision **P-1**); a build receives them through the EAS file environment variables above.
- `mobile/.easignore` also excludes `.env`, `.env.*`, `google-services.json` and
  `GoogleService-Info.plist` from a **remote build archive**. EAS uses `.easignore` *instead of*
  `.gitignore`, so that file must stay the **union** of `mobile/.gitignore` and the relevant root
  rules — **keep the two in step.**
- `mobile/ios/` and `mobile/android/` do not exist and remain ignored (Expo Continuous Native
  Generation); `node_modules/`, Expo build output, logs and local smoke-test artifacts are ignored too.
- **Local tooling state is repository-ignored**: `.freebuff/` (Freebuff project/session metadata) and
  `.claude/settings.local.json`. Neither is committed by design — the `.freebuff/` rule replaced an
  earlier protection that was convention only, and the `.claude/settings.local.json` rule replaced a
  machine-local exclusion so the file is ignored in every clone.
- The `wip/backup-working-tree` branch is a preserved snapshot and must **not** be deleted.

### Commercialization foundation (Phase 10)

`Business.planCode`, the centralized plan catalog (`server/src/constants/plans.ts`), and
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
| PATCH  | `/api/auth/me`  | Update the caller's own name (`name` only; any other field is `400 VALIDATION_ERROR`) |
| POST   | `/api/auth/change-password` | Change own password — verifies the current password first, then revokes every previously issued JWT (`401 SESSION_INVALIDATED`) |
| POST   | `/api/auth/logout` | Sign out — revokes the session this token belongs to, identified from the token's own `jti`. `{ "all": true }` signs out everywhere |
| GET    | `/api/auth/sessions` | The caller's own open sessions; `current` marks this one. No token and no `jti` is ever returned |
| DELETE | `/api/auth/sessions/:id` | Sign out one of the caller's own sessions (`404` for an unknown id and for another user's session alike) |

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
| POST   | `/api/inventory/transfer` | Move stock between two locations (MANAGER+)      |
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
stock through 11 server-side, authorization-aware tools (`searchProducts`, `getProduct`,
`getInventory`, `getLowStockProducts`, `getOutOfStockProducts`, `getInventorySummary`,
`getInventoryHistory`, `getProductsByLocation`, `getReorderNeededProducts`,
`listLocations`, `listCategories`). Tools always run inside the
authenticated user's role and `businessId` context — the AI never connects to MongoDB
directly and can never change products, stock, transactions, users or roles. If no AI
provider is configured, chat returns `503 AI_NOT_CONFIGURED`; the rest of the API keeps
working normally.

Roles: `OWNER`, `ADMIN`, `MANAGER`, `STAFF`. Protected routes derive role, status,
and `businessId` from the database for every request (never from the client or token
claims); `DISABLED` accounts are rejected. Phase 04 reuses that RBAC permission set:
catalog writes need `categories.manage`/`locations.manage` (OWNER, ADMIN) or
`products.manage` (MANAGER+); stock-in/stock-out and inventory/history reads are open
to STAFF and up, while `adjust`, `transfer`, the dashboard and transaction-view
permissions are MANAGER+.

Inventory semantics: availability = `quantity − reservedQuantity`
(`reservedQuantity` stays `0` in V1). Low stock = available ≤ `minimumStock`;
out of stock = available ≤ `0`. Mutations are atomic single-document updates with
negative-stock guards. The Atlas free/shared tier does not support multi-document
transactions, so when a transaction/audit write fails after a movement, the inventory
change is compensated (rolled back) instead — there is no read-modify-write race. A
**transfer** (Phase 19) is the one movement that touches two rows: the source debit is a
guarded atomic update, the destination credit is an upsert, and the same
quantity-anchored compensation pattern rolls the pair back if either leg or the ledger
write fails — so the source never goes negative, the destination is never credited
without a successful source leg, and a concurrent movement on the same row is never
clobbered. Both legs share one `reference`. SKU
and barcode uniqueness is enforced per business by **partial** unique indexes (a
compound sparse index would wrongly reject a second SKU-less product).

The server listens on `PORT` (default `4000`). It starts even when MongoDB is
unreachable — `/api/health` reports `db: connected|disconnected`.

---

## Mobile (`mobile/`)

Expo app with Expo Router (file-based routing), written in **TypeScript** (`app/`, `components/` and `lib/` hold 87 `.ts`/`.tsx` files and no `.js`; `__tests__/` adds 62 more — both re-counted 2026-10-15). It is a **client
only** — the backend is the security boundary. The app never connects to MongoDB and
never holds MongoDB or AI credentials. The JWT is the only thing persisted (Expo
SecureStore); the user profile is re-fetched from `/api/auth/me` on every launch so
role/status always reflect the server. Since Phase 26A the token names a server-side
session, so signing out revokes it for real and a session ended on another device stops
working here at the next request.

```sh
cd mobile
npm install
cp .env.example .env        # optional: set EXPO_PUBLIC_API_URL (see below)
npx expo start              # start Metro dev server — requires a DEVELOPMENT BUILD (Expo Go cannot run this app:
                             #  it uses RNFirebase and expo-dev-client). See docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md
```

- **API base URL:** the app reads `EXPO_PUBLIC_API_URL`. When it is unset it defaults to
  `http://10.0.2.2:4000` on Android (emulator loopback) and `http://localhost:4000`
  elsewhere — i.e. the local Phase 03/04 backend. Point `EXPO_PUBLIC_API_URL` at your
  server when running on a physical device.
- **Screens (Expo Router, authenticated group):** dashboard (MANAGER+; inventory-health tiles and a "Needs restock" preview), products
  (list/new/edit/detail with search, status/category/location and low/out filters),
  categories, locations, inventory (with low/out views), stock in, stock out, adjust
  (MANAGER+), **transfer between locations** (MANAGER+), inventory history, **AI assistant** (conversation hub, new chat and
  conversation threads — read-only; a configured provider is required for real answers),
  profile (with **edit name**, **change password** — changing the password revokes every
  existing session — and **active sessions**, which lists the devices signed in and can end one of
  them or sign out everywhere).
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
- **AI provider (Phase 06):** set `AI_PROVIDER=openrouter` (an Anthropic-compatible gateway in
  front of many models) in `server/.env` and add `OPENROUTER_API_KEY` +
  `OPENROUTER_BASE_URL` + `AI_MODEL_OPENROUTER` (the model is required — OpenRouter has no
  default). It is the **only** shipped provider (AI-25): Claude and Gemini models are reached
  through it by choosing a different `AI_MODEL_OPENROUTER`, so there is no second key to manage.
  AI credentials stay server-side — they are never sent to the mobile app.
- **Firebase Authentication (Phases 32B–32E):** the server verifies Firebase ID tokens and
  needs a service account, supplied either as `FIREBASE_PROJECT_ID`,
  `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, or — preferred, because it removes
  the newline-mangling failure class — as a single base64-encoded
  `FIREBASE_SERVICE_ACCOUNT_JSON`. These are **server-side only** and are never sent to
  the mobile app. Production fails fast if some but not all are set; in development the
  server boots without them, and the Firebase routes answer their own not-configured
  error. The **names only** are listed in `server/.env.example`. The mobile app holds no
  Firebase secret; under the M2 path it uses only the public `EXPO_PUBLIC_FIREBASE_*`
  client configuration (apiKey, authDomain, projectId, appId), which is not a credential
  and cannot authorize anything on its own — the API accepts Inventory AI tokens only.
- **Password recovery / mail (Phases 26B, 28):** see the Phase 26B and 28 sections below and
  the mail block in `server/.env.example`.

---

## Phase Status

> **Current open work, known issues and the next-step order:** `docs/DEVELOPMENT_ROADMAP.md` **§27AH**. Start
> there — it is kept current so the whole repository does not have to be re-audited.

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
- **Phase 06 — AI Assistant:** complete — provider abstraction (one shipped provider, **OpenRouter**,
  over Node `fetch` with no AI SDK dependency; Claude and Gemini models are reached through it by
  choosing `AI_MODEL_OPENROUTER`, since AI-25 removed the direct implementations), an AI service that orchestrates tool calls with strict read-only,
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
- **Phase 15 — Account Security & Profile Management:** implemented, verified, and committed
  (`1124834`) — self-service account security on top of the Phase 03 auth layer. `POST
  /api/auth/change-password` verifies the current password **first** (nothing changes on a wrong
  one), replaces the bcrypt hash, and stamps `User.passwordChangedAt`; `requireAuth` then rejects
  every token whose `iat` second is strictly older than that stamp with `401 SESSION_INVALIDATED` —
  so changing a password revokes all existing sessions with **no server-side session store** (Phase
  26A later added one; the `iat` comparison remains the password-change mechanism and is unchanged).
  A
  token minted in the same second as the change (the fresh login) stays valid. `PATCH /api/auth/me`
  updates the caller's **name only**: identity comes exclusively from the authenticated session, and
  every other field (email, role, status, businessId, password) is rejected with
  `400 VALIDATION_ERROR` rather than silently ignored. Mobile: an edit-name screen and a
  change-password screen reached from Profile. No new dependency, and no change to register/login,
  RBAC, or tenant isolation. Verified by `npm run lint` (0/0),
  `server/test/phase15-account-security.test.mjs` (7 cases, including the second-granularity
  revocation boundary), and the full backend suite (339/339).
- **Phase 16 — Audit Trail Viewer:** implemented, verified, and committed (`ddea22e`) — the
  read side of the audit feature (the write path existed since Phase 04). `GET /api/audit` exposes
  the business-scoped governance trail newest-first with action/entityType/user/date/q filters and
  pagination, gated by a new `audit.view` permission (OWNER + ADMIN only; MANAGER/STAFF get 403). No
  model change, no new dependency, no write routes. Mobile: an Audit Log screen + dashboard tile for
  OWNER/ADMIN. Verified by `npm run lint` (0/0), the DB-free unit run (107 passed), the full backend
  suite (350/350), and mobile android+iOS exports.
- **Phase 17 — Mobile Supplier & Purchase Order Management:** implemented, verified, and committed
  (`9249633`) — the mobile management half of the Phase 13 supplier/PO backend, with **ZERO
  backend changes**. A Suppliers screen (create/edit/archive/restore incl. contact fields) via an
  additive `fields` prop on the shared `RefManage` (Categories/Locations unchanged), and the full PO
  lifecycle on mobile — create DRAFT, edit DRAFT, issue, cancel — using the exact existing backend
  error codes. The permission mirror gains `suppliers.manage`/`suppliers.view` (ADMIN + MANAGER
  manage, every role views); STAFF stays view-only for supplier/PO management but can still receive.
  Verified by `npm run lint` (0/0), the full backend suite (350/350 — regression check only, no
  server file changed), and mobile android+iOS exports.
- **Phase 18A — SaaS-style UI Foundation, Light/Dark Theme System & Readability:** implemented,
  verified, and committed (`263b857`) — a semantic **light + dark** theme system
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
- **Phase 18B — Dashboard Redesign & Navigation Hierarchy:** implemented, verified, and committed
  (`3dd75dd`) — the first adoption increment on the 18A foundation. The dashboard is rebuilt on
  `StatCard`, `SectionHeader`, `ListRow`, `Icon`, `Button`, and `Card`, with a grouped navigation
  hierarchy so primary destinations read as first-class entries instead of a flat tile grid. Same
  data, same destinations, same permission gates — presentation only.
- **Phase 18C — Core List Screens:** implemented, verified, and committed (`dac15c7`) — the three
  core list screens (products, inventory, purchase orders) move onto one shared list grammar
  (`ListScreen`/`ListRow`/`SearchField`/`PressableCard`/`Icon`), with an additive `footer` and
  `titleStyle` on `ListRow`, `emptyAction`/`loadingLabel` on `ListScreen`, prop forwarding on
  `PressableCard`, and `autoCapitalize` on `SearchField`. Behavior is unchanged — API calls, filters,
  RBAC gates, deep links, navigation, and loading/empty/error copy — and no new entry points were
  added.
- **Phase 18D — Detail Screens:** implemented, verified, and committed (`d3592fb`) — the four
  record-detail screens (product, stock record, purchase order, receive) adopt `SectionHeader`,
  `StatCard` for the key quantities (available/on-hand; received/remaining, with ordered preserved in
  the `sub` line), and the shared `ListRow` grammar for stock rows, PO items, receipts, and receive
  lines. No shared primitive needed changing. Presentation only — the claim-first receive workflow is
  unchanged.
- **Phase 18E — Secondary Screens:** implemented, verified, and committed (`979968a`; the themed
  native-header follow-up landed separately as `04a2b3d`) — the fifteen secondary routes (users
  index/new/detail, audit, history, categories, locations, suppliers, profile, change-password,
  edit-name, scan, AI hub/new/chat) adopt the same primitives, and the three backing components
  `RefManage`, `UserForm`, and `AiChat` are modernised in place. `Chip` gains a semantic selected
  state and a 44px floor; `ListScreen` gains additive `errorTitle`/`footer` props. RBAC gates,
  validation order, payload asymmetries, and the `scan.js` rescan semantics are preserved.
- **Phase 18F — Forms & Auth Screens:** implemented, verified, and committed (`311e558`) — the last
  18x increment. The three shared form components (`ProductForm`, `MovementForm`, `PoForm`) and
  `AuthLayout` move onto the same primitives, and the ten routes that render them are reduced to a
  bare render: each form component now owns a single `Screen` instead of being wrapped by its route,
  which would have doubled both the safe-area insets and the keyboard offset. Two owner-approved
  scope additions rode along — the **dark** `placeholder` token was lifted from `#7A8494` to
  `#8A93A6` (4.41:1 → 5.40:1 on `surface`), fixing the AA failure 18E reported, while the **light**
  `placeholder` (3.06:1) was left unchanged as out of scope and is documented as a known issue in
  `docs/DESIGN_SYSTEM.md`. RBAC gates, validation order, payload shapes, and loading/empty/error copy
  are preserved, and no form was submitted during verification.
- **Phase 19 — Stock Transfers Between Locations:** implemented, verified, and committed
  (`6bc9a70`) — closes the last §15 gap: `TRANSFER` was reserved in Phase 04 but never implemented, so
  moving stock between locations required a manual stock-out plus stock-in. `POST
  /api/inventory/transfer` now performs it as one logical operation producing both legs, reusing the
  **Phase 07A compensation architecture** — guarded atomic source debit, destination credit by
  upsert, two `TRANSFER` ledger rows sharing one `reference`, and a quantity-anchored,
  destination-first rollback if any leg fails. **No MongoDB sessions or multi-document transactions
  were introduced.** Gated by the **existing** `INVENTORY_MANAGE` permission — no new permission and
  no RBAC matrix change (OWNER/ADMIN/MANAGER allowed; STAFF 403). Mobile: a `/transfer` screen with
  source-availability, same-location and over-quantity guards, reached from a role-gated dashboard
  entry, plus a "Transfer" history filter chip/badge and the `INVENTORY_TRANSFERRED` audit label.
  Verified by `npm run lint` (0/0), the new Level-2 suite `server/test/phase19-transfers.test.mjs`
  (24/24, including failure injection, compensation, and the H4/H5 concurrent-mutation case), a
  re-run of `phase04-inventory` + `phase07a-inventory-compensation` (24/24), and a MANAGER-only
  emulator smoke. One pre-existing fixture in `phase04-inventory.test.mjs` was updated: it used
  `?type=TRANSFER` as its example of an *unknown* history type, which Phase 19 makes a real
  filterable type.
- **Phase 20 — Performance, Pagination & Filter Contract Hardening (20A–20H):** implemented, verified,
  and committed — an owner-directed cascade of ten increments after Phase 19, all on the shared list
  read path and none changing what a well-formed request returns. **20A** (`bf84a6a`) made offset
  pagination ordering deterministic by adding an `_id` tiebreaker to the list sorts, so a page
  boundary can no longer repeat or skip a row when two documents share a sort key. **20B** was the
  read-path audit that identified the remaining findings. **20C** (`23a3673`, `45afd75`) restored
  index-backed pagination sorts with three compound indexes matching the `_id`-augmented sorts.
  **20D** (`4c04248`, `821b469`) normalised list filter validation so a malformed `q`/`status`/
  `supplierId` is rejected with `400 VALIDATION_ERROR` rather than silently ignored. **20E**
  (`7369796`) replaced prefix integer parsing with an exact whole-value parse for `page`/`limit`,
  closing the case where `?limit=1e3` was read as `limit: 1` and answered with a single row while
  passing both the minimum and the cap. **20F** (`b96c805`) added the `{businessId, userId, updatedAt,
  _id}` index to `ai_conversations`, whose list sort had been covered only by a `createdAt` index.
  **20G** (`3d06c91`) added the matching list-sort indexes for products, purchase orders and users,
  each with a DB-free schema-declaration guard. **20H** (`0bd289f`) hoisted the product list sort
  above its first `$lookup` so the 20G index can serve it. Pagination values COERCE to the documented
  default while filters REJECT — a deliberate asymmetry, and Phase 20C's coercion contract is
  unchanged. Deferred at the time and left deferred: nothing beyond these two behaviours.
- **Phase 21 — Product Archive-Only Lifecycle & Inventory Invariant:** implemented, verified, and
  committed (`bd10b12`) — a documentation-and-guard increment that changes **no production behavior**.
  It makes explicit, and prevents from drifting, two properties the system already had: products
  follow an archive-only lifecycle (`ACTIVE` ↔ `ARCHIVED`, with `ARCHIVED` terminal and no hard delete
  existing or permitted), and an inventory record depends on a live product in the same business, with
  that dependency held by application lifecycle rules and write-path validation rather than by any
  database-level foreign key — Mongoose `ref` enforces nothing, and read-path filters such as
  `inventory.service.ts`'s `{'product.0': {$exists: true}}` guard are defensive query hygiene, not
  integrity enforcement. `docs/SYSTEM_SPECIFICATION.md` gains `## Product Lifecycle`, `## Inventory
  and Product Integrity` and a transaction-permanence note, and the previously illustrative
  `DELETE /api/products/:id` is replaced by the implemented archive/restore endpoints. The new DB-free
  `server/test/phase21-product-archive-invariant.test.mjs` pins the invariant by declaration (no
  deleted product status, no delete route, no delete service method, no product-deletion audit action,
  `productId` required on both inventory and the ledger), and three DB-backed cases in
  `phase04-inventory.test.mjs` prove an archived product keeps its inventory row, quantity and full
  transaction history while all four movement paths reject it with `PRODUCT_ARCHIVED`. No model, route,
  index, migration or AI tool changed, and `inventory.service.ts` is byte-identical. Suite 419 → 429.
- **Phase 22 — Authorization Contract Enforcement & RBAC Coverage Guards:** implemented, verified, and
  committed (`dc341dd`) — hardens the **route→capability binding** without changing who may do what.
  The read routes for products, suppliers and purchase orders had been protected by authentication
  alone; they now name the capability they require (`PRODUCTS_VIEW`, `SUPPLIERS_VIEW`,
  `PURCHASE_ORDERS_VIEW`), so the requirement is stated rather than implied by "any authenticated
  member". This is behaviour-neutral by construction — all four roles hold all three view permissions
  — and **no role grant was added, removed or changed**. The catalogue also becomes self-checking:
  `roles.js` gains `CATALOGUE_ONLY_PERMISSIONS` (`business.manage`, `roles.manage`,
  `transactions.view`), which is **metadata for the guard only** and takes no part in any runtime
  authorization decision. The ledger read deliberately stays on `inventory.history.view` rather than
  `transactions.view`, because only three roles hold the latter while all four hold the former, so the
  switch would have silently revoked STAFF history access. Categories and locations reads were left on
  `requireAuth` because no `categories.view`/`locations.view` key exists. Verified by `npm run lint`
  (0/0) and the new DB-free `server/test/phase22-authorization-contract.test.mjs`, which proves each
  binding structurally, behaviourally and by declaration; suite 429 → 440.
- **Phase 23 — Authorization Contract Completion: Route Classification & RBAC Mirror Guards:**
  implemented and verified — **authorization contract guards and cross-layer RBAC consistency; no
  production behavior change.** Closes the three authorization surfaces Phase 22 left held by
  convention, entirely as one DB-free guard suite plus documentation: no permission key added, no role
  grant changed, and no route, controller, service, model, middleware or mobile file modified. It
  classifies every route reachable from `app.ts` into exactly one declared authorization bucket
  (`PERMISSION_GATED`, `AUTHENTICATED`, `PUBLIC`, `ROLE_GATED`), so a route added without a gate now
  fails instead of passing unnoticed — with **no route-count assertion**, so a future phase adds a
  route by declaring it rather than by editing a number. It pins `mobile/lib/permissions.js` to
  `server/src/constants/roles.ts` (roles, the 21 catalogue keys *and values*, and every role's grant
  set), which had been kept in step by hand since Phase 13A. It recognises `requireRole(` as a gate so
  a role-name route cannot silently bypass the contract, and pins `requireRole`'s **inertness** —
  retained, still exported, referenced by no route module. And it requires every error code the mobile
  client branches on to be one the server can actually emit, across all three emission shapes
  (`new ApiError` third argument, `this.code =`, and direct response-body `code:`). Every comparison is
  a pure function exercised against deliberately perturbed in-memory clones, so the guard is
  demonstrably able to fail rather than merely green. Suite 440 → 459; `npm run lint` 0/0.
- **Phase 24 — Runtime Authorization Matrix & Tenant-Isolation Verification:** implemented and verified
  — **runtime authorization matrix and tenant-isolation verification; no production behavior
  change.** The vertical RBAC axis was already exercised per feature, but only ever against the
  boundary each feature cares about, and the one four-role matrix in the suite ran against the
  **test-only `/guard` router** inside `phase03-auth.test.mjs` — synthetic routes, not shipped
  endpoints. Phase 24 adds `server/test/phase24-runtime-authorization-matrix.test.mjs` (DB-backed), a
  consolidated matrix over **real** routes. Its expectations are **derived, never transcribed**: the
  tier a route belongs to is computed by asking the shipped `hasPermission(role, permission)` who
  holds its capability, so the file holds no second copy of the role matrix and cannot silently
  disagree with `constants/roles.ts`. Admitted cells deliberately depend on nothing else — a gate is
  the second handler, so it decides before validation runs, and an admitted cell asserts only "not
  401, not 403, and not the code-less global 404" (the global handler answers with no `code`, every
  `ApiError` 404 with one, so a mistyped path cannot pass as admitted). It also closes the one
  authorization property nothing verified: **a role change takes effect immediately on an
  already-issued JWT**, proven in both directions — STAFF → MANAGER grants a MANAGER-gated capability,
  MANAGER → STAFF revokes it, STAFF → ADMIN → STAFF crosses tiers, and a promotion reaches the AI tool
  permission gate — always using the *same pre-existing token*. That is now safe by construction
  rather than by assertion: an access token carries only `sub`/`iat`/`exp`, so there is no role claim
  to go stale, and a hand-forged `role` claim neither grants nor escalates anything. Tenant isolation
  is documented accurately as **404-scoped queries**, not a 403 middleware: `assertBusinessAccess` is
  production-dead (its only callers are tests) and is left byte-identical. The structurally empty
  OWNER-only runtime tier is asserted explicitly rather than left implicit — the two OWNER-exclusive
  capabilities are catalogue-only, so no real route distinguishes OWNER from ADMIN. Suite 459 → 469,
  `test:db` 320 → 330, `test:unit` unchanged at 170; `npm run lint` 0/0.
- **Phase 25 — Design-Token Contrast Close-Out & Mobile Known-Issue Reconciliation:** implemented and
  verified — **two light-theme token values and documentation; no production behavior change.** Closes
  the last two entries in `docs/DESIGN_SYSTEM.md`'s open known-issues list, which 18E and 18F had
  reported and left alone because each was a cross-phase token change needing an owner decision.
  Values were **computed, not chosen by eye**: `palettes.light.placeholder` `#8A94A6` → `#646E83`
  (3.06:1 → 5.12:1 on `surface`; 2.70:1 → 4.53:1 on `surfaceMuted`) and `palettes.light.textMuted`
  `#667085` → `#5F697E` (4.97:1 → 5.51:1; 4.40:1 → 4.87:1). The dark theme already cleared AA
  (5.40:1 / 4.76:1) and is unchanged. Two things drove the result and are documented rather than
  smoothed over: `surfaceMuted` — the lightest ground a placeholder sits on — is the **binding
  surface** that sets the floor for both tokens; and consequently **`textMuted` had to move too**,
  because clearing AA there requires a value darker than `#667085`, which would otherwise leave the
  placeholder darker than the token it sits beneath and invert the muted hierarchy. The cost is a
  **~7% contrast separation** between the two tokens, the ceiling that floor allows, approved
  explicitly as Option A. Placeholders are **not** exempt from WCAG 1.4.3 (its exceptions cover only
  incidental text, logotypes and inactive components, and the binding sites are live fields). The
  diff is two lines in `mobile/lib/theme.js` but reaches four placeholder-emitting components across
  five sites, plus 44 `textMuted` sites; `server/**` is untouched. Contrast re-verified
  programmatically from the edited file.
- **Phase 26A — Session Hardening & Real Logout:** implemented and verified — an access token is no
  longer the whole session. Signing a token now also creates a server-side session record whose id is
  the token's `jti` claim (`sub`/`jti`/`iat`/`exp` and nothing else — no role, no `businessId`, and
  the session record holds no authorization data either). `requireAuth` remains the single
  authentication choke point and now additionally refuses a token whose `jti` names no session, or one
  that is revoked or expired, so **sign-out is real**, **one device can be revoked without touching
  the others**, and **sign out everywhere** ends every session at once. Three self-service
  authenticated routes were added — `POST /api/auth/logout` (`{ "all": true }` for sign out
  everywhere), `GET /api/auth/sessions` (the caller's own sessions, `current` marked; never a token or
  a `jti`) and `DELETE /api/auth/sessions/:id` (the owner is part of the lookup, so another user's
  session answers the same `404` as an unknown id). **No new permission** was added and no existing
  role grant changed: these are the caller's own sessions, so they are authenticated routes, not
  capability-gated ones. Mobile gains an Active Sessions screen (reached from Profile) that lists
  devices, marks the current one, and can end one or all of them; sign-out now tells the server before
  clearing local state (and still clears when offline), and a refused token is handled centrally in
  the API client so a screen that never thinks about sessions can no longer strand a user on an
  authentication error it cannot resolve. Audit gains four session events, written through the
  existing best-effort `recordAudit` path. One consequence is deliberate and was accepted: tokens
  issued before this change carry no `jti` and are rejected, so every user signs in once more. No
  refresh-token rotation was added.
- **Phase 26B — Password Recovery (Email Reset):** implemented, verified, and committed (`5a46781`
  for the mail service; `9900e9a` for the token store, recovery service and HTTP surface; documentation
  close-out `e95c785`) — the first way back into an account without an operator. A provider-agnostic
  mail layer (`server/src/services/mail/`, Brevo being the transport used in every environment) sits behind three functions, and
  `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` were added as two **public**,
  rate-limited routes. Reset tokens are single-use and stored only as a SHA-256 digest — the raw
  32-byte value is emailed and never persisted — expire after 30 minutes, are claimed by one conditional
  `findOneAndUpdate`, and are **fail-closed**: no branch ever unsets `usedAt`, so a spent token stays
  spent even if everything after the claim fails. Only one token is live per user, and the `deleteMany`
  that enforces it uses `_id: { $lt: token._id }` so two concurrent requests converge instead of
  cancelling each other out. An unknown, expired, already-used, disabled or suspended account is
  rejected identically and no mail is sent. The request path is an enumeration-resistant invariant: one
  module-level constant is returned as a **202** from every non-error exit, and a **mail delivery
  failure is swallowed to that same 202**, because it can only be thrown *after* the account lookup,
  where a `503` would be an account-existence oracle. The one deliberate exception is
  `MAIL_NOT_CONFIGURED`, which stays a `503` because it is checked *before* the lookup and therefore
  distinguishes nothing — an ordering argument, not a status choice. Two audit events are written
  through the existing best-effort path and carry no metadata, so a token can never reach the trail.
  **No new permission**, no role grant change, no new dependency, and no mobile file touched; mobile
  consumption arrived in Phase 27. Two residual risks were identified by the pre-commit audit and
  recorded rather than fixed — their dispositions are recorded in Phases 28 and 29 below.
- **Phase 27 — Mobile Password Recovery:** implemented, verified, and committed (`6b8c3c0`) — the
  client half of the Phase 26B recovery surface, with **ZERO backend changes** and no new dependency.
  Two **public** screens are added — `/forgot-password` and `/reset-password` — plus a "Forgot
  password?" entry point on the Sign In screen and two tokenless wrappers in `lib/api.js` that call the
  existing endpoints. Both screens sit outside the `(app)` group, whose layout would redirect an
  unauthenticated visitor and discard the incoming token before it could be read. The reset token comes
  from the deep link's URL parameter and nowhere else; it is never rendered, logged by application
  code, persisted, or copied into another navigation, and it leaves the app only in the reset POST
  body. A missing, empty or malformed token is rejected locally with no request. The forgot-password
  success state is a fixed client constant that does not read the response, so the client cannot undo
  the server's enumeration resistance. **After a successful reset the client session is cleared before
  navigating to Login** — `login.js` redirects a signed-in client into the app, so without that
  ordering a completed reset would bounce the user back inside instead of asking them to sign in.
  Reset links target the custom scheme (`inventoryai://reset-password`, i.e.
  `PASSWORD_RESET_URL=inventoryai://reset-password`); Universal Links and Android App Links remain
  deferred, so a link opened without the app installed has no web fallback. Verified by mobile
  android+iOS exports (iOS is export/bundle-only — **no iOS runtime verification**), the unchanged
  backend suite (`test:unit` 209 pass / `test:db` 394 pass, `npm run lint` exit 0), and Android runtime
  QA in Expo Go through `exp://…/--/reset-password` — the same route-resolution path a custom scheme
  uses, because Expo Go cannot be launched by a custom scheme, which leaves the literal
  `inventoryai://` handoff configuration-verified only.
- **Phase 28 — Password Reset Mail Delivery Timing Hardening (B1 only):** implemented, verified, and
  committed (`7185e5e`) — the outbound password-reset email send is detached from the HTTP request path,
  so `POST /api/auth/forgot-password` no longer waits on a mail provider before answering. The send is
  dispatched **unawaited**, strictly after the token insert, the one-live-token `deleteMany` and the
  `PASSWORD_RESET_REQUESTED` audit row, with its rejection handled in the same synchronous turn by
  `logDetachedMailFailure` — so a delivery failure cannot become an unhandled rejection, and the
  handler itself is written so it cannot throw. **Nothing else moved:** `isMailConfigured()` and
  `resetUrl` still guard *before* the account lookup, so `MAIL_NOT_CONFIGURED` is still a pre-lookup
  `503`; the uniform `202` and the `undefined` return are unchanged; token semantics, audit ordering,
  rate limiting, the reset flow, mobile and the route inventory (65 routes — none added) are untouched.
  The controller's `MailDeliveryError` branch is **retained as an unreachable regression guard** and is
  documented as such, so that deleting it is a visible decision rather than a tidy-up. **B1 is
  PARTIALLY MITIGATED, NOT CLOSED:** the transport wait — the dominant, most separable term — is gone,
  but the known-address path still does more **database** work (writes and an audit insert against one
  indexed read), and that residual is not claimed to be eliminated. No delay is injected to mask it.
  **B2 — distributed reset-mail flooding of one address — was not implemented and remains open,
  deferred to V4 by the Phase 29 owner decision.** No backend route, permission, role grant, dependency
  or mobile file changed.
- **Phase 29 — Residual Security-Risk Decision Record & Documentation Reconciliation:** implemented and
  verified — **documentation only**: no production code, test, dependency, configuration or behavior
  changed, and `server/**` and `mobile/**` are byte-identical. It converts the project's three remaining
  open security items from "requires an owner decision" into **recorded owner decisions**, and
  reconciles four documentation inconsistencies against the shipped implementation. **B1's residual
  database-work timing term is ACCEPTED FOR V1 and DEFERRED** — the oracle stays **PARTIALLY MITIGATED,
  NOT CLOSED**, is explicitly not claimed to be eliminated, and no delay is injected to mask it; token
  durability, audit ordering and detached-mail behavior are unchanged. **B2 and E3 are DEFERRED TO V4**
  as related shared-infrastructure work: no Redis or other shared store was introduced, and the
  in-memory per-process limiter architecture is unchanged. Documentation reconciled: the roadmap Phase
  Overview gained Phases 27 and 28 (it had stopped at 26B), the missing Phase 26B entry was added to
  this list, and the specification's §48 V2 list was corrected to drop the barcode/QR scanner, supplier
  management and stock transfers — all long since shipped. The retained `MailDeliveryError` regression
  guard is untouched, no roadmap section was renumbered, and historical verification snapshots were
  deliberately **not** back-updated.
- **Phase 30A — EAS Development Build & iOS Readiness Foundation (EAS foundation only):** implemented and
  **statically verified** — the Expo Continuous Native Generation architecture is retained, so
  `mobile/ios/` and `mobile/android/` do not exist and remain gitignored, and every native setting still
  flows from `app.json` plus config plugins. The project is linked to EAS project
  **`@jeffernqwes-team/inventory-ai`** (`607eca05-1175-43ed-86a0-1829e91c9531`), which `eas init` recorded
  as `extra.eas.projectId` plus `owner`. `expo-dev-client` was added at the SDK-57-matched `~57.0.19`;
  **`expo-updates` was deliberately not installed**, so there is no OTA path and no update channel
  anywhere in the config. `mobile/eas.json` defines four profiles — `development`, `ios-simulator`,
  `preview` and `production` — under `cli.appVersionSource: "remote"`. Both platforms use the hyphen-free
  identifier `com.inventoryai.app`. **No `eas build`, `eas submit` or `expo prebuild` has been run, so
  nothing in this phase is runtime-verified:** the evidence is the local toolchain (jest 11 suites / 88
  tests, `tsc --noEmit`, `eslint .`, `expo-doctor` 21/21) plus config introspection.  **F-1 (PDF sharing) is fixed in code as of 2026-10-11** (§27AM — both print actions pass the same label
  geometry, guarded by 8 cases whose two geometry assertions fail if the fix is reverted), with its
  **print → scan round trip still unverified on hardware**; and **Phase 30B is defined as Native & Device
  Acceptance** (§27AW) — **not started**, since it needs a native build.
- **Phase 31 — AI Provider Wire Diagnostics & the AgentRouter → OpenRouter Migration:** complete —
  provider wire diagnostics that make an upstream failure diagnosable (`31D.3` began recording the
  status, Content-Type and a redacted body prefix for a 2xx whose body could not be parsed; `31D.6`
  extended that to every non-2xx, which had logged the status alone and discarded the body). The AI
  provider then moved off the retired **AgentRouter** gateway onto **OpenRouter**, an
  Anthropic-compatible gateway that documents a bare `Authorization: Bearer` — so the provider sends
  no claude-cli / claude-code fingerprint headers and no `anthropic-version` — and whose model
  (`AI_MODEL_OPENROUTER`) is required with no default, because it fronts many models with differing
  tool-calling ability. Selection stays server-side through `AI_PROVIDER`, and the AI Assistant flow,
  tool authorization, tenant isolation and the read-only boundary are unchanged (`e9f2690`,
  `711d090`, `7b4f4fa`, merge `e97497b`; roadmap §27S). **The OpenRouter integration is working in
  test production, and the AI Assistant responds through it.** A later unit-test failure in
  `server/test/phase-openrouter-provider.test.mjs` was **not** a production defect and **not** an
  OpenRouter / model / credits failure: that file imports `support.mjs` (which loads `dotenv/config`),
  and its helper restored `AI_MODEL_OPENROUTER` before the deferred request ran, so the request read
  the developer's real `server/.env` model. It was fixed test-only in `751d796`, and that suite runs
  against a **local HTTP stub** — it never contacts OpenRouter and cannot consume credits. A
  historical verification is not a guarantee of future model or gateway availability: free-model
  availability and credits can change independently of application correctness.
- **Phase 32A — Firebase Authentication Architecture & Console Runbook:** documentation only. The
  design authority is `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`. It records the
  selected architecture (**Option B**: Firebase is the identity provider, while the existing MongoDB
  `User` + JWT + server-side `Session` remains the application's session layer), the non-negotiable
  invariants, the identity mapping, the migration strategy, the two UNVERIFIED gates, and the open
  owner decisions. **No implementation was authorised by it.**
- **Phase 32B — Firebase Admin SDK Foundation (server verify boundary):** the Admin SDK dependency,
  `config/firebase.ts`, the ID-token verifier wrapper, environment validation with production
  fail-fast, the `.env.example` names, and three **additive** `users` fields — `firebaseUid` (String,
  **`sparse: true`** unique), `emailVerified` (Boolean, persisted but **not enforced**) and
  `passwordHash.required: false`. **No routes.** Sparse is mandatory rather than decorative: without
  it the index cannot be built once two users lack the field.
- **Phase 32C — Firebase Authentication Session Exchange:** two **public** routes,
  `POST /api/auth/firebase/exchange` and `POST /api/auth/firebase/register`, their service and rate
  limiters. The Firebase ID token is exchanged **once** for an ordinary Inventory AI access token and
  **never becomes the API bearer credential**. A verified identity with no MongoDB user answers
  `REGISTRATION_REQUIRED`; an email that already belongs to a MongoDB user answers `409 EMAIL_IN_USE`
  — **account linking is refused, not implemented**. `requireAuth`, RBAC and the legacy path are
  unchanged.
- **Phase 32D — Firebase JS SDK Boundary (mobile):** `mobile/lib/firebase.ts` only — the SDK version,
  initialization order, the `inMemoryPersistence` decision and the `EXPO_PUBLIC_FIREBASE_*` gate that
  leaves the SDK uninitialized so an unconfigured build behaves as it did before Firebase existed.
  Infrastructure only: no screen reached Firebase, no API call was made, no authentication state was
  touched.
- **Phase 32E — Firebase Email/Password Authentication Flow:** mobile Firebase-first sign-in
  exchanging its ID token through the 32C endpoint, with the legacy password route reached **only**
  for the two codes that mean "no Firebase identity answers to these credentials"
  (`auth/invalid-credential`, `auth/user-not-found`) — **never** for a Firebase or backend failure, so
  an outage cannot become a downgrade. Adds the server-side `firebaseUid` guard refusing the legacy
  route with `403 FIREBASE_SIGN_IN_REQUIRED`, placed after the password comparison and the status
  check (so it is not an enumeration oracle) and before the session write (so no half-login is left
  behind). **Google Sign-In NOT implemented; account linking and migration NOT implemented.**
- **Phase 32F — Firebase Multi-Provider Authentication Architecture Decision Record & Documentation
  Close-out:** **documentation only** — no production code, test, dependency, schema, route,
  configuration, payment or authentication behaviour changed, and no EAS build created. It converts the
  multi-provider architecture from open questions into **recorded owner decisions**, and reconciles
  the documentation drift found during the architecture investigation. **Eleven decisions are
  RESOLVED**: Firebase is the identity provider while MongoDB stays authoritative for account,
  business, role, status, permission, billing, session and audit state; the security boundary is
  server-controlled; a Firebase ID token is exchanged once and never becomes the bearer credential;
  **a provider identity is never automatically linked to an existing account because the email
  matches — email is not an account-linking join key**, since authenticating a provider identity is not
  proof of ownership of an existing account; provider linking is an explicit operation by an
  already-authenticated user whose provider UID comes from the verified credential and never from a
  request body; linking **during a sign-in attempt** requires an explicit ownership/recovery proof
  flow; the exchange remains **UID-authoritative**; the Phase 32E password-authority guard is retained
  unchanged; sessions remain **provider-neutral** with no provider field on the session model;
  Facebook identities without a usable email require explicit email completion rather than an invented
  or UID-derived address; and subscription ownership is **business-level**, never Firebase-user-level.
  The owner/ADMIN/MANAGER/STAFF creation hierarchy is documented with **invitation-based onboarding
  recorded as future implementation** (none exists). Open items are kept explicitly separate:
  unlink/last-method protection, the linked-account `change-password`/reset disposition,
  `emailVerified` enforcement, M1 vs M2, the Facebook missing-email flow, the unhealable-orphan remedy
  and credential-file storage all remain **OPEN**. **Google Sign-In, Facebook Login, Apple Sign-In,
  account linking, account unlinking and invitations were NOT implemented; Apple remains future scope;
  no provider SDK was installed; and the first EAS development build remains a prerequisite for
  validating the mobile provider path.** No historical phase record was rewritten.
- **Phase 32G — First EAS Development Build / Native Runtime Validation:** **validation only** — no
  provider was implemented (no Google Sign-In, Facebook Login, Apple Sign-In, account linking or
  unlinking), no MongoDB schema, authentication server behaviour, payment or billing behaviour was
  modified, **M1 vs M2 was NOT chosen**, and no provider SDK was installed. **No production or
  configuration file changed**: the EAS configuration was verified against the project rather than
  assumed correct, and Phase 30A's foundation turned out to be correct as committed, so the phase's
  diff is documentation only. A `development` profile Android build was produced (`finished` in
  12 min 11 s), installed on the emulator and **launched — the app runs outside Expo Go**, proven by
  Metro serving `expo-router/entry.js` (1,525 modules) into the installed native APK with
  `topResumedActivity=com.inventoryai.app/.MainActivity`. The signed-out root renders, the auth UI
  loads, Firebase is never initialized (all four `EXPO_PUBLIC_FIREBASE_*` unset) and does not crash,
  and **API communication is proven end-to-end**: invalid credentials produced the server's own
  "Invalid email or password" copy, with the backend logging `POST /api/auth/login → 401`. **No
  physical device was used and no device test is claimed** — all evidence is from the Android
  **emulator**; **iOS was neither built nor run** (no iOS build exists and the host is Windows); the
  `preview` and `production` profiles were not exercised; and nothing beyond the signed-out root was
  navigated. **The build history is corrected:** EAS holds **three** Android builds — two of them
  predating this phase, including a development build from the Phase 30A commit itself — which
  supersede the "no EAS build has ever been executed" statements in the Phase 30A and Phase 32F
  records; Phase 32G is the third build, not the first. **M1 and M2 findings were documented, not
  chosen:** M1's pipeline is now proven and its plugin auto-discovery confirmed, while M2's redirect
  capability remains unproven because no redirect was tested. **Phase 32H, 32I and 32J were NOT
  started** (Phase 32H subsequently shipped — see its entry below; this sentence is the Phase 32G
  record and is not rewritten).
- **Phase 32H — Server-Side Account Linking Boundary & Authentication Ownership:** the **server half of
  linking, and nothing else.** One route, `POST /api/auth/firebase/link`, is added —
  `requireAuth` + controller, **no permission**, Phase 23's `AUTHENTICATED` bucket — and it is the
  **only** way a `firebaseUid` is attached to an existing account. It answers one question: *may this
  authenticated Inventory AI account carry this verified Firebase identity?* **Both sides of the
  association are server-derived:** the account is `req.user.id`, put there by `requireAuth` from the
  caller's own session (which *is* the ownership proof), and the identity is the verified token's uid.
  `validateFirebaseLink` returns only `{ problems, idToken }`, so a body naming `userId`, `businessId`,
  `firebaseUid`, `role` or `status` is **inert rather than rejected** — the handler holds no
  client-supplied identity to forward and there is no check that could be deleted. A link writes
  **exactly two fields**, `firebaseUid` and `emailVerified`, so it can never move an account between
  businesses or change its role. **Four lifecycle cases:** the same identity on the same account is an
  idempotent `linked: false` with no write and no audit row; an account that already owns a *different*
  identity is refused; an identity belonging to *another* account is refused and **never merged,
  transferred or re-pointed**; an identity belonging to nobody is attached. **The email is never a join
  key in any of them** — not compared, not used to find an account, not used to resolve a conflict —
  which is what makes "no automatic linking on an address match" a property of the code's shape rather
  than of a check someone could delete. CASE B and CASE D share **one `409 FIREBASE_IDENTITY_CONFLICT`**
  naming no account, tenant, role or Firebase UID, and the conflicting uid **never enters the audit
  row** (readable by every ADMIN, and in CASE B it may name a person in another tenant) — it goes only
  to the server-side log. Concurrency is settled by the database: one conditional update guarded on
  `firebaseUid: null` plus the unique index's E11000 mapped to the same conflict, so two accounts racing
  for one identity cannot both win. **A rejected Firebase token answers `400`, not `401`**, because the
  mobile client treats a `401`/`403` on a token-carrying request as session loss — a `401` here would
  sign a user out over a bad provider credential; the error **code** and the Phase 32E
  password-authority guard are unchanged. **No schema change, no new dependency, no session-model
  change** (`firebaseUid` stays unique + sparse; the JWT stays `sub` + `jti`, provider-neutral), **no
  payment or subscription code touched.** **Google Sign-In, Facebook Login, Apple Sign-In, provider
  SDKs, OAuth redirect flows, provider buttons, account linking via a provider, unlinking and
  invitations are NOT implemented** — Firebase's own provider linking is performed by the Firebase
  **client** SDK, and no fake server-side equivalent was invented. **§15 finding, not changed:**
  `change-password` and the password reset flow still write an inert hash for a linked account and
  report success — the linking boundary makes that state reachable for the first time, so **O-2 is
  escalated from a gate on a future phase to a live defect**, left undecided on purpose. *(**Superseded by
  Phase 32K — see its entry below.** O-2 was decided and implemented there, and the Phase 32K audit
  corrected this sentence too: `change-password` does not report success for a Firebase-native account;
  it was the reset flow that did.)* **§16 finding,
  not changed:** no unlink capability of any kind, **O-1 still open**, Phase 32L owns it. Verified by a
  new **25-test** suite (unit + DB-backed) whose every assertion was **proven able to fail** by a
  seven-mutation pass — including two doubly-enforced guards that only fall when *both* layers are
  removed. **Phase 32I, 32J and 32L were NOT started.** (Phase 32J subsequently shipped — see its
  entry below — and Phase 32L subsequently shipped as 32L-A/32L-B; this sentence is the Phase 32H record
  and is not rewritten.)

- **Phase 32J — Mobile Firebase Registration Onboarding:** an identity that Firebase has **already
authenticated** but that owns no Inventory AI account can now finish registration and enter the app,
reusing the backend that already exists. The exchange answers `403 REGISTRATION_REQUIRED` for exactly
that identity, so the client now arms `firebaseRegistrationRequired` from that one code — from **both**
entry points, so Google and email/password converge here — and the login banner's action targets a new
**`/register-firebase`** route instead of the email/password `/register`. That route is **additive rather
than a mode of `/register`**, because `/register` collects an email the user has just proved and a
password that would mint a **second** Firebase identity via `ensureFirebaseAccount`, which the server then
refuses; the onboarding screen collects exactly what is missing — `businessName` (required) and `name`
(optional) — and renders **no** email, password or confirmation field. **The credential never travels
through navigation:** `completeFirebaseRegistration({ businessName, name })` is the entire client input
surface, the token is read from the Firebase Auth layer inside the context (`currentFirebaseIdToken()`),
and the server still derives `firebaseUid`/`email`/`emailVerified` from the verified token. **Session
creation is the existing one, twice over:** `firebase/register → 201` issues no token, so the client calls
the existing exchange with the same Firebase identity and applies the ordinary Inventory AI JWT with
`applySession` — **no new endpoint, no second JWT, no new session mechanism, no schema change, and zero
server files changed.** A half-done attempt is not repeated: a resolved `firebaseRegister` is remembered,
so a retry after a failed exchange resumes at the exchange rather than creating a second Business and a
second OWNER, while a refusal leaves the attempt correctable and re-armable. `409 EMAIL_IN_USE` is
**reported, never linked** (Phase 32H's explicit-session linking is the only route to that), a Firebase UID
collision shows one fixed sentence and never the thrown server text, and a missing Firebase user makes no
request at all — the cold-start limitation is stated plainly rather than papered over, since the identity
lives in memory and cannot be reconstructed. Verified by **two new suites (24 tests)** whose assertions
were each **proven able to fail** by a five-mutation pass (all reverted, files byte-identical), the full
suite at **20 suites / 209 tests**, `tsc` and `eslint` clean — and then by a **real-device run** on the
development build that observed the whole chain rather than inferring it: `403 REGISTRATION_REQUIRED` →
`firebase/register 201` → `firebase/exchange 200` → `GET /api/dashboard 200` with a real `userId`, landing
on the authenticated Home screen with the **same PID** (warm, no restart) and **zero** `Unmatched Route`
or JS errors in logcat. **iOS remains unverified**, and **O-2 is now reachable in the ordinary course of
business**: the first Google-registered OWNER is Firebase-native, so `change-password` and the reset flow
would report success while changing nothing — **left undecided on purpose**. **Phase 32L was NOT
started.** *(**Resolved by Phase 32K — see its entry below.** The audit there also corrected this
sentence's second clause: it was the reset flow, not `change-password`, that reported success.
**Phase 32L subsequently shipped** — see its entry at the end of this list.)*

- **Phase 32K — Firebase Password Authority Boundary & Timing-Equalizer Credential Fix:** the boundary
  Phase 32H escalated to a live defect is now true in code — **for every user carrying a `firebaseUid`,
  Firebase is the sole authentication authority**, so Inventory AI local password operations do not
  apply. `change-password` is **refused** for such an account (`409 PASSWORD_NOT_APPLICABLE`, placed
  **before** the current-password comparison and before every effect, so a Firebase-native account and a
  Firebase-linked one get the *same* answer rather than one being decided by whether an inert hash is
  still on the document — and `409`, not `401`/`403`, because the mobile client treats those two as
  session loss and would sign a user out of a valid session). `forgot-password` takes the **silent exit**
  — one uniform `202`, **no token, no email, no audit row** — because distinguishing such an address
  would be the account-existence oracle the Phase 26B design refuses to be; the check sits **after** the
  tenant check so it adds no new timing signal to a path already documented as only **partially
  mitigated**. `reset-password` refuses with the generic `400 INVALID_RESET_TOKEN` **last, immediately
  before the write**, so no local credential is ever created for such an account — while
  `change-password` and the recovery flow still write an inert hash, and the Phase 32E login guard is
  untouched. **A second defect was found and fixed in the same boundary:** the timing equalizer
  `bcrypt.hashSync('timing-equalizer-placeholder', 10)` is a **valid hash of a known string**, and the
  old `user?.passwordHash || DUMMY_HASH` idiom made it the comparison *target* for hashless accounts — so
  that literal **authenticated** a hashless account and, in `change-password`, **installed a real
  credential** from it. Both call sites now route through one `verifyPassword`, which still runs the
  bcrypt work (timing preserved) and **discards the result** when no hash is stored: *no stored hash
  means no password*. The client learns only a **provider-neutral capability** —
  `authMethods: { password: boolean }`, derived in one helper and published by **both** `toPublicUser`
  and `requireAuth`'s `req.user` (so login/exchange and `GET /api/auth/me` cannot disagree) — and the
  `firebaseUid` behind it is **never** exposed; the Profile screen hides the Change-password control and
  explains why. **No schema change, no migration, no dependency, no session change, and no retained hash
  deleted** — the hash is retained and made **inert**, because the unlink / last-auth-method disposition
  is still open (O-1, Phase 32L). Verified by a new **12-case** server suite
  (`server/test/phase32k-firebase-password-boundary.test.mjs`) that walks the legacy /
  Firebase-native / Firebase-linked matrix and **reads the equalizer literal out of the source** rather
  than restating it (so it cannot pass vacuously), a new mobile suite, and a **seven-mutation pass** in
  which every new assertion was **proven able to fail** (all reverted, no mutated file left behind):
  server `npm test` **795 tests / 106 suites**, `test:unit` 336 tests, mobile **21 suites / 213 tests**,
  `tsc` and `eslint` clean on both. **Two pre-existing suites changed** — `phase26a-session-lifecycle` and
  `phase32c-firebase-exchange`, which pin the **exact key set** of a user payload — and each now asserts
  the `firebaseUid`-absent property explicitly. **No runtime verification:** no development build, no
  device run and no live Firebase project, so every figure is a test result rather than an observation.
  **Phase 32L was NOT started.** *(Superseded 2026-09-26: **Phase 32L shipped** as 32L-A (`01ae73f`,
  server) and 32L-B (`0c3f87d`, mobile), both contained in `main` `dbdf673`. This is the Phase 32K record
  and is not rewritten; see the Phase 32L entry below.)*

- **Phase 32L — Firebase Identity Unlink (32L-A server, 32L-B mobile):** the owner-directed increment
  that lets an authenticated account **stop authenticating through the Firebase identity it carries** and
  become a password account. It was approved and shipped in two halves, and **both were already merged
  before this entry was written** — 32L-A is the server boundary (`01ae73f`) and 32L-B is the mobile flow
  (`0c3f87d`), and both are contained in `main` (`dbdf673`). **This entry is the documentation close-out,
  not an implementation.**

  > **Superseded in part — 2026-10-01 (`Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`).** The
  > unlink capability this entry documents as shipped was **REMOVED**, not deprecated: the route
  > `POST /api/auth/firebase/unlink`, its service and its two audit actions no longer exist in the committed
  > tree, and the operation was re-scoped into a **credential change**. **Everything below — the route
  > description, the Policy B mechanics, the refuted-assumption measurements and the two audit actions — is
  > the Phase 32L record and remains valid as history**; it is annotated here rather than rewritten. The
  > Policy B measurements stay valid historical facts. What is no longer true is only this: the capability
  > itself is gone, and no reachable path clears `firebaseUid`. See the Phase F-1 correction in `CLAUDE.md`
  > and `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §8.

  **The server boundary is ONE route:** `POST /api/auth/firebase/unlink` — `requireAuth` + controller,
  **no permission** (it acts only on the caller's own account), and no rate limiter, matching the
  existing `firebase/link` precedent — every attempt first needs a live session, a verified Firebase
  credential, a matching identity and a fresh authentication. Both sides of the
  association are **server-derived**: the account is `req.user.id` and the identity is the uid the
  verified token carries, so a body supplying `userId`, `businessId`, `firebaseUid`, `role` or `status`
  is **inert by construction**. **The email is never consulted** — not compared, not used to find an
  account, not used to resolve anything.

  **★ Policy B is the unlink policy, and it is the last-authentication-method invariant made structural:**
  an account may leave Firebase authority **only by establishing a NEW local password in the same
  transition**, so it never passes through a zero-authentication-method state. That is why `newPassword`
  is required and why the retained legacy bcrypt hash is **REPLACED, never re-enabled** — re-enabling it
  could resurrect a credential the user abandoned, or one an attacker still knows. The write touches
  exactly four fields — `firebaseUid`, `emailVerified`, `passwordHash`, `passwordChangedAt` — so an unlink
  can never move an account between businesses, change its role or change its status. Stale
  authentication answers **`409 FIREBASE_REAUTHENTICATION_REQUIRED`** (a 300-second freshness window
  enforced server-side from the signed claim), never a 401/403, so a stale credential cannot sign the
  user out. The detach is one conditional update guarded on the expected identity (`firebaseUid` is
  `$unset`, not blanked), so a stale or racing unlink matches nothing rather than detaching an identity
  set microseconds earlier — the sparse unique index enforces UID uniqueness, it is not this operation's
  race guard — and `revokeAllSessions` plus the `passwordChangedAt` stamp end every session the account
  held.

  **★ The assumption it refuted.** This repository had recorded that Firebase refuses to remove a user's
  last provider. **Two separate measurements settle it, and they are different facts.** The
  **last-provider** measurement is the refutation: the unlink **succeeded on the account's final provider,
  leaving the Firebase account with zero providers**. Separately, the **390-second** measurement found a
  provider unlink **accepted** at an authentication age where `updatePassword` was **refused** — a finding
  about *recency*, not about the last provider. Together they are why **last-authentication-method
  protection is enforced server-side and never delegated to Firebase**, and why Policy B enforces it.

  **What the server deliberately does NOT do:** Firebase-side provider unlinking ("Disconnect Google") is
  performed by the **Firebase client SDK** against the signed-in Firebase user; the server cannot observe
  it and offers no API for it. Two audit actions were added — `FIREBASE_IDENTITY_UNLINKED` and
  `FIREBASE_IDENTITY_UNLINK_CONFLICT` — and the **detached uid is never written to the trail**, because
  the audit viewer is readable by every ADMIN of the business.

  **Verification status, stated so it cannot be overstated:** the 32L test/typecheck/lint figures are the
  phase records' own **historical** figures and **no suite was re-run for this close-out**. **Firebase
  end-to-end is NOT verified and is not described as production-verified anywhere:** email/password is
  **PARTIAL**, and native Google Sign-In, the Firebase → backend exchange, the Inventory AI JWT/session
  flow through live Firebase and Firebase logout/session teardown are all **BLOCKED/PARTIAL** because no
  live Firebase project or credentials have ever existed. The 32L-B Google confirmation path was **never
  runtime-verified**. **iOS remains `[EXTERNAL VERIFICATION REQUIRED]`.**

  **Stale statements superseded by this entry (preserved in place, not rewritten):** the three
  "**Phase 32L was NOT started.**" sentences in the Phase 32H, Phase 32J and Phase 32K entries above.
  **Documentation only:** no source, test, dependency, schema, route, permission, Firebase, EAS or Render
  change, and no protected working-tree file touched. See `docs/DEVELOPMENT_ROADMAP.md` §27Q.

- **Phase F1 — Retire the Firebase JS SDK and the Browser OAuth Path:** the first half of the cleanup the
  Firebase migration kept deferring, and **pure JavaScript — no native surface changed, so no new build
  was required.** It removed the JavaScript SDK boundary (`mobile/lib/firebase.ts`), the `firebase`
  dependency, the `expo-auth-session` import and everything only it served (`acquireGoogleIdToken`, its
  Google discovery constants, `GOOGLE_SCOPES`, `GoogleIdTokenOutcome`, `googleRedirectUri()`). **The
  prerequisite that made it safe was ordering, not luck:** `lib/firebase.ts` had been the only SDK
  importer but two modules pulled `isFirebaseConfigured` through it, so those imports were redirected to
  the SDK-free `lib/config.ts` **first**; deleting the module first would have broken the native gate for
  every Firebase and Google sign-in. Three negative browser-seam assertions were **replaced, not
  dropped**, by a structural guard that walks every source file under `lib/` and `app/` and proves none
  imports the retired packages. **The Firebase JS SDK is still not absent from `node_modules`** and no
  record claims otherwise: `@react-native-firebase/app@26.4.0` — kept on purpose, because it is what
  authenticates — declares `firebase@12.17.1`, so the JS SDK remains nested beneath it; the invariant is
  that **no module under `lib/` or `app/` can resolve or import it.** `npm test` **30 suites / 423 tests,
  0 failures**; `tsc` and `eslint` clean; authentication behaviour unchanged. **iOS remains
  `[EXTERNAL VERIFICATION REQUIRED]`.** See `docs/DEVELOPMENT_ROADMAP.md` §27N.

- **Phase F2 — Retire the Browser Dependencies, the Plugin, the Second Scheme and the Native-Intent
  Hook:** the **native-surface** half of the same cleanup, delivered in six approved sub-steps with two
  verification steps, and the phase that required a new development build. `expo-auth-session`,
  `expo-web-browser` (together with its `app.json` plugin, removed atomically) and `expo-crypto` are gone
  from the manifest and the lockfile; `expo.scheme` is exactly `["inventoryai"]`; `app/+native-intent.ts`
  and its suite are deleted, because the `com.inventoryai.app:/oauthredirect` callback it intercepted can
  no longer be delivered by any configured scheme. Kept on purpose: the three native packages and their
  plugins, the `inventoryai` scheme (Phase 27's `inventoryai://reset-password`), and both identifiers
  `com.inventoryai.app`. **No authentication behaviour changed, no server file was touched, and no
  protected working-tree file was touched.** See `docs/DEVELOPMENT_ROADMAP.md` §27O.

- **Phase F2.9 — EAS Development Build & Android Runtime/Native Verification:** the step F2 left open,
  and it changed **no source or configuration file** — the minimum change set was empty. EAS build
  **`f3038fa1-1cab-476e-b0f9-d6a9178f955b`** (`FINISHED`, `development` / Android, fingerprint
  **`d16abc4e7df419812e73598db676985be3606dc7`**) was installed and run on emulator `emulator-5554` with
  **0** fatal exceptions, and the fingerprint **exactly matched the current working tree's**, proving the
  uncommitted F2 tree was what EAS built. The F2 native surface is now **Android-runtime verified**: the
  retained `inventoryai://reset-password` deep link renders the reset screen, the retired
  `com.inventoryai.app:/oauthredirect` callback is **unresolvable at the OS level**, and the retired
  browser module is **absent from the APK dex** while RNFirebase and native Google Sign-In remain. A real
  **local-backend** round trip was proven and **Render was not used**. **Authentication E2E remains
  deliberately unverified and is not an F2 failure** — the blockers are pre-existing and environmental
  (no live Firebase project), and **iOS remains `[EXTERNAL VERIFICATION REQUIRED]`**. See
  `docs/DEVELOPMENT_ROADMAP.md` §27P.

- **Registration required-field validation fix (mobile; the "F-1" found during Preview validation):**
  fixed and device-verified. The register screen had validated only the confirm-password mismatch, so
  submitting the form **empty** produced no client-side errors and reached the Firebase sign-up path.
  `mobile/app/register.tsx` `submit()` now checks that business name, name, email, password and
  confirmation are each non-empty **before** it calls `signUp()`, and the confirm-mismatch rule is
  preserved (an empty confirmation reports "required"; a differing non-empty one still reports
  "Passwords do not match"). **Naming:** this is *not* the Phase 30A **"F-1 (PDF sharing)"** finding
  recorded above, and *not* a Phase F1/F2/F2.9 cleanup phase — the three names are unrelated. Guarded by
  the new focused suite `mobile/__tests__/register-validation.test.tsx` (**6 cases**); full mobile suite
  **30 suites / 438 tests, 0 failures**; `tsc --noEmit` and `eslint .` clean; verified on device through
  the `preview` EAS build **`75fc3eb6-…`**. **No backend, dependency, permission, route or session
  change.** See `docs/DEVELOPMENT_ROADMAP.md` §27R.

- **Phase 32N — Firebase-Only Authentication Architecture & the Credential-Change Revocation Bridge
  (design record only):** **documentation only — no code, test, schema, dependency, environment
  variable, Firebase Console setting, EAS configuration or deployment change.** The owner has locked
  **Firebase Authentication as the sole authentication authority** (email/password, Google, password
  reset, email verification, password changes) and fixed the premise that all current MongoDB users are
  **mocked development/test data**, so **no legacy migration or bulk `auth:import` is designed**. The
  **Inventory AI JWT + server-side session remain** and **MongoDB remains authoritative** for
  `businessId`, `role`, `status`, permissions, business lifecycle and tenant isolation — **business
  authorization must not move into Firebase custom claims**. The application-owned password path is on a
  **retirement path**, with **invitation-based onboarding a hard prerequisite** of removing legacy
  login. The phase records the **credential-change revocation bridge** (`POST
  /api/auth/credentials-changed` — authenticated, bound to the verified uid **and** a fresh signed
  `auth_time`, stamping `passwordChangedAt` and revoking every session, with the re-exchange ordered
  after it so the new session survives), recommends **`checkRevoked` stays `false`**, and records that
  the **Firebase action-link return leg must be verified live** before recovery is complete. **N-2 (2026-09-29,
live test) then verified the Android app/OS half and found the `token`-vs-`oobCode` mismatch** —
`inventoryai://reset-password` resolves to the app and routes to the reset screen, but the screen reads
`?token=` while a Firebase link carries `?oobCode=`, so a native link currently dead-ends on
*"Link incomplete"*; the **Firebase email side remains UNVERIFIED** (no inbox or Console access), so the
gate stays open and **iOS is entirely unverified**. **Nothing
  was removed:** the 26B/27 endpoints, the reset-token model and the mail layer all remain — the
  record documents a later retirement, it does not perform one. Full record:
  `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C**; security record
  `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` **§39**; phase record `docs/DEVELOPMENT_ROADMAP.md` **§27U**.

- **Phase N-3 — Firebase-Native Password Recovery (additive):** the mobile half of the Firebase-only
  recovery direction, shipped **beside** the existing flow rather than in place of it. `forgot-password`
  now asks **Firebase** to send the reset email, and the custom 26B endpoint is reached **only** when the
  build has no Firebase configuration — so a configured-but-failing Firebase reports a failure instead of
  quietly falling back to another mail system. `reset-password` redeems a Firebase `?oobCode=` through the
  native SDK while a legacy `?token=` link still goes to `POST /api/auth/reset-password`, so both link
  shapes work. The Phase 1 verb guard was relaxed for **exactly one verb** (`sendPasswordResetEmail`) with
  the reason recorded in place, and the deep link the email must return to is **pinned against
  `app.json`**. Two properties are implemented rather than assumed: **enumeration resistance follows the
  flow** (`auth/user-not-found` and `auth/user-disabled` answer *sent*, because with Firebase's
  enumeration protection off those codes identify an address), and **a failed redemption can never fall
  back** to the server endpoint, because an action code is a Firebase credential. The 26B/27 routes,
  controller, service, reset-token model, mail layer and their suites are **untouched** — removing
  them is N-7. **No server, permission, schema, dependency, environment, EAS or Firebase Console change.**
  Verified by **2 new mobile suites / 36 cases** (mobile **36 suites / 509 tests**, `tsc` and `eslint`
  clean). **★ An on-device run against the live Firebase project was then performed** (the F2.9
  development APK driven by Metro): a `?oobCode=` link **renders the reset form** (closing the `token`
  vs `oobCode` mismatch that dead-ended it before), the legacy `?token=` link still works,
  `sendPasswordResetEmail` for the dedicated test address reached the project and answered
  **`onComplete:success`**, and a deliberately fake code was refused and rendered as *"This reset link is
  invalid or has expired."* — so the project **accepted the custom-scheme `ActionCodeSettings`**.
  **The reset email itself was never received or inspected (no mailbox access), so delivery and the
  email's link remain UNVERIFIED, test items 3, 6 and 7 remain BLOCKED, the gate L-17 is narrowed but
  stays open, and iOS remains `[EXTERNAL VERIFICATION REQUIRED]`.** One consequence is recorded rather than glossed: a Firebase-native
  reset does **not** revoke Inventory AI sessions, which is the credential-change bridge's job (N-4,
  designed and not implemented). See `docs/DEVELOPMENT_ROADMAP.md` **§27U** and
  `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.4.2**.

> **AUTH-04 supersession (2026-10-02; status updated 2026-10-04).** The entry below chose a **Firebase
> verification link + native resend** mechanism. That mechanism is **superseded**: email verification is a
> **custom 6-digit Inventory AI code delivered through the provider-agnostic mail boundary** (Brevo, the
> provider used in development and production and for the live acceptance), and Firebase's
> `email_verified` state is set through the Admin SDK after a successful confirmation. The registration
> ordering gate, the Firebase-UID-only join, MongoDB authority and the unmodified `requireAuth` are
> preserved, and the server-side `EMAIL_NOT_VERIFIED` enforcement remains. This entry is preserved as the
> historical record. See design `§14C.10`, checklist `§40`, roadmap `§27Y`.
>
> **AUTH-04 status (2026-10-04).** AUTH-04-A through AUTH-04-F are **shipped**; **AUTH-04-G PASSED its
> live end-to-end acceptance gate on Brevo** (request HTTP 200 with the exact success envelope, Brevo
> `sent` → `delivered`, confirmation HTTP 200 with `Email verified.`, Firebase `emailVerified` false →
> true, Mongo challenge consumed, safe-log checks passed); **AUTH-04-H** is the documentation close-out.
> The AUTH-04 request path also enforces a **60-second per-UID resend cooldown**.

- **Phase 32O — Registration & Email-Verification Decisions (documentation only):** the **read-only
  registration/sign-up audit** is now written down and its open questions are **decided**, so N-5 no
  longer has to invent policy in code. The registration **order is the mechanism:** Firebase account →
  **verification email sent** → the user verifies → `reload()` confirms `emailVerified === true` →
  **only then** Inventory AI creates the MongoDB `User` **and** `Business` together (OWNER,
  `User.businessId` still required), mints the JWT + server session, and lets the user into the app. **No
  `User`, no `Business`, no JWT and no session exist before verification**, so there is no
  half-registered tenant to clean up; a signed-in-but-unverified identity is held on a **client verify
  screen** that can resend through **native Firebase Auth**. **`requireAuth` is deliberately NOT
  modified** — a check inside the single authentication choke point would both change the frozen Phase
  23/24 authorization order and **strand every already-shipped client**, because a server-side check
  cannot be deployed in lockstep with the builds it would reject — so the Phase 23/24 contract is
  preserved exactly. The **Firebase UID stays the only** Firebase→MongoDB identity join key (**email is
  never one**), **MongoDB stays authoritative** for `businessId`/`role`/`status`/permissions/lifecycle,
  an unverified **Google** identity is **refused** per Firebase's signed `email_verified` claim rather
  than the provider name, `User.emailVerified` is persisted with **no per-request Firebase call**, and
  the legacy `/api/auth/register` path stays **transitional** (N-6 retires it, and **universal**
  enforcement becomes possible only then). The **verification-link return is SELECTED as the Inventory
  AI deep-link flow** — no new infrastructure: one `inventoryai` scheme, Expo-Router path routing, and an
  `ActionCodeSettings` shape the live project already accepted — with the **Firebase-hosted page recorded
  as the fallback**, and it **inherits the open L-17 gate**, so the delivery half must still be measured
  live. **OD-3 is resolved**, and the audit gaps **D-5…D-9** are closed. Three findings are recorded
  from source: `nativeCurrentIdToken()` passes **no argument** to `getIdToken()`, so RG-9's fresh-token
  requirement needs a **forced refresh** (a boundary change, **not** a guard change);
  `sendEmailVerification`/`reload` are **not** in the Phase 1 `FORBIDDEN` map, so **no guard relaxation
  is owed**; and **no verify screen or verification gate exists today**. **Documentation only — no code,
  test, schema, dependency, environment, EAS or Firebase Console change, and nothing is implemented.**
  Full record: `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.9** (decisions
  **RG-1…RG-15**); `docs/DEVELOPMENT_ROADMAP.md` **§27V**; `docs/AUTH_SECURITY_MASTER_CHECKLIST.md`
  **§39**.

- **Phase 32P — N-4 D2 Resolved: the Recovery-Context Bridge Caller (documentation only):** closes the
  **previously undocumented D2 gap** between Firebase password recovery and the planned N-4
  credential-change bridge. The bridge is an **authenticated** route and needs a live Inventory AI
  session — correct for the in-app password **change**, but **unsatisfiable for the primary reset
  flow**, because `forgot-password`/`reset-password` are **public** screens, the reset completes inside
  Firebase, and the reset screen clears the local session before returning to Login. At the instant the
  password changes the caller holds **no** session, so a Firebase-native reset would have revoked
  **nothing** — every prior session, including an attacker's, would have survived. **The approved
  resolution is to establish the context first, never to relax authentication:** after the reset the
  user **signs in again with the new password** (which is also what makes the **300-second `auth_time`
  freshness** check satisfiable) → a **fresh Firebase ID token** → the **existing public exchange**
  mints a **temporary recovery-context session** → the **bridge** stamps `passwordChangedAt` and calls
  `revokeAllSessions()`, which revokes **all** sessions **including that temporary one** (it has **no
  caller exception**) → a **re-exchange** mints the **final** session, valid because its `iat >=
  changedAtSec`. The recovery-context session is **structurally an ordinary session** — **no new session
  type, no new field, no "recovery" flag** — so the frozen session surface is untouched, and stopping
  after the bridge is **loud and recoverable** (sign in again), never silent. **Restated as still
  binding:** `passwordChangedAt` **and** `revokeAllSessions()` remain the N-4 invariant; a Firebase ID
  token is **never** the application's permanent bearer credential; the **Firebase UID → MongoDB
  `User`** binding stays authoritative; **no public unauthenticated `credentials-changed` endpoint** and
  **no Cloud Function / Admin-SDK trigger** is introduced. The only piece left open is **OD-9** — how
  the client knows to run the bridge after a reset — recorded rather than chosen silently. **Documentation
  only — no code, test, schema, dependency, environment, EAS or Firebase Console change, and the bridge
  is still not implemented.** Full record: `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`
  **§14C.3.8**; `docs/DEVELOPMENT_ROADMAP.md` **§27W**; `docs/AUTH_SECURITY_MASTER_CHECKLIST.md`
  **§39**.
- **Phase 32Q — OD-9 LOCKED: the Automatic Recovery Marker (documentation only):** closes the last piece
  of **D2** — **OD-9**, how the client knows that a post-reset sign-in must run the bridge — and locks it
  as **M-1…M-10**. The mechanism is a **durable, non-secret recovery marker** in `expo-secure-store` under
  **`inventoryai.auth.passwordResetPending`**, holding **only an account fingerprint** — never a password,
  an `oobCode`, a Firebase ID token, an Inventory AI JWT, a `userId`, a `businessId`, a `role` or tenant
  data — created with **`verifyPasswordResetCode(oobCode)`**, whose returned email is **memory-only**: it
  supplies the automatic sign-in and the fingerprint, and is **never** an authorization source. **F1
  automatic recovery is approved:** verify → write marker → `confirmPasswordReset` → sign in with the new
  password → **temporary** public exchange → `credentials-changed` → revoke all → **final** exchange →
  `applySession`. The temporary session is **held only in a local variable** — never persisted, never
  applied, never navigated with, never in route parameters — and `revokeAllSessions()` revokes it with
  every other active session (**no caller exception**). The marker is created **before** the
  password-change operation; **cleared** after a successful bridge acknowledgement or a
  **success-equivalent** `401 SESSION_INVALIDATED`; **kept** on `409 FIREBASE_REAUTHENTICATION_REQUIRED`
  and on transport failure; **never consumed on a fingerprint mismatch**; and the legacy `?token=`
  recovery **never creates it**, because that server flow already revokes. **Two limits are recorded,
  not glossed:** the marker is **device-local**, so a reset on one device followed by the **first**
  password sign-in on **another** is **not detectable** — OD-9 is **not** a universal cross-device
  revocation guarantee — and the server-side `passwordUpdatedAt` derivation that would close that residue
  (**Option E**, now **OD-10**) is **deferred as a separate owner decision, with nothing of it introduced**: no Mongo
  field, no extra Admin lookup. `requireAuth`, `passwordChangedAt`, `revokeAllSessions()`, the UID→Mongo
  `User` mapping, Mongo business/role authority and the JWT/session architecture are **unchanged**, and
  **no new session type or session field** exists. **L-17 stays OPEN** as the end-to-end gate and **gains
  one requirement**: the live device test must confirm `verifyPasswordResetCode()` returns the correct
  email **without consuming** the reset code. Findings **F-19…F-22**. **Documentation only** — no code,
  test, schema, dependency, environment, EAS or Firebase Console change, and the bridge is still **not
  implemented**. Full record: `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.3.9**;
  `docs/DEVELOPMENT_ROADMAP.md` **§27X**; `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` **§39**.
  *(**Annotated 2026-10-09:** the bridge shipped on the same day as this record, in **`703a9da`** —
  `server/src/services/credentialsChanged.service.ts` and the authenticated
  `POST /api/auth/credentials-changed`, exercised by `phaseN4-credentials-changed.test.mjs` and the
  `phaseN4-*` mobile suites — so the "not implemented" clause above is superseded on the implementation
  question only. **L-17 and the deferred OD-10 remain OPEN** exactly as recorded. See the annotation in
  `docs/DEVELOPMENT_ROADMAP.md` §27W.)*

- **Phase A / F-1 — Firebase Disconnect Re-scoped into a Credential Change (the unlink capability
  removed):** the server-side Firebase unlink capability was **REMOVED, not deprecated** — `POST
  /api/auth/firebase/unlink`, its service, controller handler, payload validator, both audit actions
  (`FIREBASE_IDENTITY_UNLINKED`, `FIREBASE_IDENTITY_UNLINK_CONFLICT`) and the mobile `firebaseUnlink`
  wrapper are gone from the committed tree, and the client disconnect surface was re-scoped. The
  operation moved into **credential-change authority**: Firebase `updatePassword` → the shipped N-4
  `credentials-changed` bridge → the session the sequence ends with, so **`firebaseUid` is never cleared
  and no reachable path clears it**. What the removal closes is the old path's credential-authority dead
  end — the OLD password stayed valid at Firebase while the server no longer knew the account, so the
  sign-in resolved to `REGISTRATION_REQUIRED` and then met `EMAIL_IN_USE`. Exact commit
  **`6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`** (2026-10-01; **27 files, +1,347 / −3,372**); the formal
  record is **`docs/DEVELOPMENT_ROADMAP.md` §27AA**, written retrospectively because the commit predates
  §27Z. See also the Phase 32L entry above, `CLAUDE.md`, and
  `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §8.

- **AUTH-01 — Firebase Revocation Checking & Verification-Failure Classification:** implemented, verified,
  and committed (`b3f1146`, 2026-10-02) — the Admin SDK ID-token verification now runs with
  **`checkRevoked: true`**, and a verification failure is classified into **three disjoint outcomes**:
  a **terminal rejected credential** (`FirebaseTokenError`), a **transient inability to verify**
  (`FIREBASE_UNAVAILABLE` → **503**), and the **operator configuration fault**
  (`FIREBASE_NOT_CONFIGURED`). The terminal allowlist is the four unambiguous SDK codes; **everything
  else — including the overloaded `auth/argument-error` — is transient**, so an outage can never be
  presented as a bad credential or destroy a valid session. A structural JWT pre-check and an `aud`/`iss`
  assertion were added as defence-in-depth on the real Admin SDK path only; a guard fails if the installed
  `firebase-admin` version changes, because the classification is derived from 14.5.0's error codes. No
  route, schema, session/JWT or mobile behaviour changed, and **no `revokeRefreshTokens()` was introduced**.
  Verified by `server/test/phaseAUTH01-firebase-verification.test.mjs`. See `docs/DEVELOPMENT_ROADMAP.md`
  §27AB.
- **AUTH-02 — Short-Lived JWT, Enforced Issuer/Audience & the 14-Day Absolute Session Cap:** implemented,
  verified, and committed (`6a0f41b`, 2026-10-02) — the access token now lives about an hour
  (`JWT_EXPIRES_IN`, default `1h`), carries **`iss`/`aud`** which `jsonwebtoken` enforces on every request
  (`JWT_ISSUER` default `inventory-ai`, `JWT_AUDIENCE` default `inventory-ai-api`), and a session's life is
  bounded **separately and in code** at **14 days** (`SESSION_ABSOLUTE_CAP_DAYS`, with `expiresAt` anchored
  at creation), so changing the JWT lifetime can neither lengthen nor shorten a session. `requireAuth`
  distinguishes the recoverable **`SESSION_EXPIRED`** from the other 401s. A token minted before this
  change carries neither claim and is rejected, so **every existing user signs in once more** — accepted
  deliberately as a one-time re-login. Verified by `server/test/phaseAUTH02-session-jwt.test.mjs`.
  See `docs/DEVELOPMENT_ROADMAP.md` §27AC.
- **AUTH-03 — Inventory Session Renewal (server boundary + mobile client):** implemented, verified, and
  committed (`3085e3f`, plus the `5da0692` re-entrancy fix, 2026-10-02) — **`POST /api/auth/renew`** is an
  **authenticated** route (`requireAuth → limiter → controller`) that takes the account from
  `req.user.id` and the session from `req.auth.jti`, so a client can never name another user, business or
  session. It **re-issues a token for the same session**: the `jti` is unchanged, **no session row is
  created**, **`expiresAt` is never written** and **no audit row is written**, so the 14-day cap cannot be
  extended by renewing. A uid that does not match the account is `409 FIREBASE_IDENTITY_CONFLICT`; an
  unverified identity is `400 EMAIL_NOT_VERIFIED` (400 on purpose, so it cannot trip the client's
  session-loss rule); the per-IP limiter answers `429 SESSION_RENEW_RATE_LIMITED`. The client renews
  **proactively** when `min(tokenExpiresAt, sessionExpiresAt)` enters a 10-minute window or on foreground,
  **single-flight** with an authentication epoch, and classifies failures **by application error code, never
  by HTTP status** — a recoverable `SESSION_EXPIRED` retries once, terminal codes never renew, transient
  failures preserve the session. Verified by `server/test/phaseAUTH03-session-renewal.test.mjs` and the two
  `phaseAUTH03-*` mobile suites. See `docs/DEVELOPMENT_ROADMAP.md` §27AD and `docs/SYSTEM_SPECIFICATION.md`
  §"Session Renewal".
- **CI quality gate (`ci / server`, `ci / mobile`):** implemented, verified, and committed (`9f4c5c1`,
  2026-10-07; corrected by `d415335`, 2026-10-09) — `.github/workflows/ci.yml` runs **typecheck, lint, both
  module-graph checks, the full backend suite and a boot smoke** (`/ready`, `/live`, `SIGTERM`) against a
  `mongo:7` container, plus **typecheck and jest** for mobile, on **every pull request** and on pushes to
  `main`. Node comes from `.nvmrc`; there are **no GitHub secrets**. The gate's **first-ever run, on PR #7,
  caught a real defect**: the tests need `JWT_SECRET`, which every suite gets locally from the git-ignored
  `server/.env` and which the workflow never supplied — 118 failing tests, all cascading from
  `AUTH_NOT_CONFIGURED`. That was **reproduced off-CI** (a clone with no `.env`), fixed with one fixed,
  non-secret test value, and **PR #7 then passed both jobs**; the merge commit is `3e5d2aa`. See
  `docs/DEVELOPMENT_ROADMAP.md` §27AE.
