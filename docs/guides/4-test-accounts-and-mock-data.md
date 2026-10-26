# 4. Test accounts and mock data

Which accounts exist, where sample data lives, which commands are safe — and the one mistake that
cannot be undone. Exact command detail is in [Guide 6](6-scripts-and-commands.md).

## Part 1 — How accounts and data fit together

| System | Holds | Answers |
|---|---|---|
| **Firebase** | the email and password | *who is this person?* (the doorkeeper) |
| **MongoDB** | business, users, products, stock, history | *what may they do, and what is their data?* |

They are joined by Firebase's **UID**, stored on the MongoDB user at registration — **never by email**.

Three consequences:

1. **Deleting a login while its database record exists locks that person out permanently.** The app
   refuses to register the address again, and nothing can repair it. **This is the one irreversible
   mistake here.** Clearing MongoDB is safe; clearing Firebase is not.
2. **Sample data belongs to a business, not an email.** Every row carries its business, and every
   query filters by it, so tenants never see each other.
3. **A new verified address creates a new empty business**, with that person as OWNER.

## Part 2 — Where data can live

| Where | Used by | Safe to delete? |
|---|---|---|
| **`inventoryai_dev_db`** | this laptop's backend, the phone, the seeders — your own account and data | whole-database wipe is ⚠️; per-tenant tools are safe |
| **`inventoryai_test_db`** | `npm test`; rebuilt every run | ✅ throwaway |
| **A seeded tenant in the dev database** | `seed:perf` / `seed:roles` | ✅ `cleanup:perf` / `cleanup:roles` remove exactly it |
| **`inventoryai_prod_db`** | the deployed server and shipped app | ⚠️ only by **naming** the database (`--database=`) |

### Built-in safety

Before connecting or writing, every seeding run checks: `--database=` names the database this process
resolved (which comes from `MONGODB_DB_NAME`); that database is development or production; two
confirmation phrases in development (`SEED_CONFIRM` and `SEED_DB_CONFIRM`) or three in production
(adding `SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA`); and, for a production run that would replace an
existing business, that business's `--business=` id. Any failure stops before touching anything. The
test database is always refused.

**PowerShell** cannot run `NAME=value npm run …` in one line:

```powershell
$env:SEED_CONFIRM='seed-demo-account'; $env:SEED_DB_CONFIRM='inventoryai_dev_db'
npm run seed -- --plan=demo --database=inventoryai_dev_db --email=you@example.com
$env:SEED_CONFIRM=$null; $env:SEED_DB_CONFIRM=$null
```

## Part 3 — The commands

| You want | Use |
|---|---|
| Data in the account you sign in with (dev) | §A — `seed:demo` |
| The same in production | `seed:demo` + `--database=` and `--business=` (Guide 6 §G.2) |
| Empty it again, keeping the login | `cleanup:demo` (Guide 6 §G.2) |
| A throwaway measurement tenant | §D — `seed:perf` |
| A large tenant you can sign into, in a named database | `seed:perf-tenant` (Guide 6 §G.1) |
| Several accounts at different sizes | §E — `seed:accounts` |
| A small demo tenant with fixed figures | §F — `seed:demo-tenant` |
| One working login per role | §G — `seed:roles` |
| A brand-new signable test account | §A with a new email + `DEMO_ACCOUNT_PASSWORD` |

### A. Seed your own account (development)

```bash
cd C:/Users/jeffe/inventory-ai/server
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db --email=YOUR_EMAIL
```

**Two phrases in development, three in production** — `SEED_CONFIRM` (the plan), `SEED_DB_CONFIRM`
(the database name) and, for production, `SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA`. The full rule,
the dry run and the production examples are in [Guide 9](9-seeding-data.md).

- `--email=` is the address you sign in with; the business is found through its UID.
- `--total=80000` (default, range 100–400000) is a real target; `--seed=1` makes the data identical
  every run.
- **What it does:** replaces **only that one business's data**. Logins and other tenants are untouched.
  Re-running is safe and gives a clean slate.
- If the identity does not exist yet it is created — supply its password through a setting, never on
  the command line: `DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db npm run seed -- --plan=demo --database=inventoryai_dev_db --email=new@example.com`

### B. Create an extra test account

The same command with a new address, which creates a verified Firebase login, a MongoDB user +
business (OWNER) and its dataset:

```bash
DEMO_ACCOUNT_PASSWORD='choose-a-strong-password' SEED_CONFIRM=seed-demo-account \
  SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db \
    --email=tester-1@example.com --total=500
```

Use a throwaway address per tester; its data is completely separate from yours.

### C. Verify the seed

```bash
npm run verify:demo -- --email=YOUR_EMAIL
```

Read-only: prints account, counts, ledger arithmetic, referential integrity and stock health.

| Exit | Meaning |
|---|---|
| **0** | Everything checked out |
| **1** | A real problem — broken arithmetic, negative quantity, dangling reference |
| **2** | **Could not check** (unreachable database, no such account) — not a data problem |

### D. A throwaway measurement tenant

```bash
SEED_CONFIRM=seed-perf-ai npm run seed:perf -- --size=1000   # products, 1–200000
SEED_CONFIRM=seed-perf-ai npm run cleanup:perf               # removes exactly that tenant
```

Named `PERF SEED — AI assistant stress test (do not use)`, **no login attached**, so it cannot be
signed into. It prints the `businessId` the measurement commands need. `cleanup:perf` proves
`0 remaining` and says `nothing to clean` when there was nothing.

### E. Several accounts at different sizes

```bash
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=accounts --database=inventoryai_dev_db --dry-run   # plan only, writes nothing
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=accounts --database=inventoryai_dev_db
```

- **No SKUs or barcodes** are generated, so the app's own barcode generation is exercised.
- `--accounts="a@x.com:5000,b@x.com:44000"` replaces the plan; a size is required per entry.
- `--include-sku` generates them too.
- Each account gets its own business; the command refuses if two accounts resolve to the same one.
- A missing login stops the run (unless you supply `DEMO_ACCOUNT_PASSWORD`); an existing password is
  never changed.

### F. A small demo tenant with known figures

```bash
# create or reset — the database must be named and must match the resolved one
DEMO_ACCOUNT_PASSWORD='<password>' SEED_CONFIRM=seed-demo-tenant \
  npm run seed:demo-tenant -- --database=inventoryai_dev_db

# remove it
CLEANUP_CONFIRM=cleanup:demo-tenant npm run cleanup:demo-tenant -- --database=inventoryai_dev_db
```

Sign in as `demo-preview@example.invalid` (owner `Demo Tester`). Every figure is fixed:

| | |
|---|---|
| Products | **6** active, 5 with stock (Demo Desk Lamp has no inventory row) |
| On hand | **112 units** |
| Locations | **Demo Warehouse 75** (4 products) · **Demo Shop 30** (2) · **Demo Van 7** (1) |
| Health | 3 healthy · 3 at/below minimum · **1 out of stock** |
| Restock | Demo Desk Lamp (0 vs min 3) · Demo Coffee Beans 1kg (4 vs 10) · Demo Paper Cups 100pk (15 vs 20) |
| Ledger | 9 movements, each ending at the figures above |

It may run against production, because the database must be named and match, and the password becomes
`DEMO_ACCOUNT_PASSWORD` on every run. Production form:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  DEMO_ACCOUNT_PASSWORD='<password>' SEED_CONFIRM=seed-demo-tenant \
  npm run seed:demo-tenant -- --database=inventoryai_prod_db
```

Its teardown removes MongoDB rows only; the Firebase identity is left in place.

### G. One login per role

```bash
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=roles --database=inventoryai_dev_db --dry-run
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=roles --database=inventoryai_dev_db

npm run verify:roles -- --business=<id the seeder printed>
CLEANUP_CONFIRM=cleanup:roles npm run cleanup:roles
```

| Role | Address |
|---|---|
| OWNER | `role-owner@example.invalid` |
| ADMIN | `role-admin@example.invalid` |
| MANAGER | `role-manager@example.invalid` |
| STAFF | `role-staff@example.invalid` |

One tenant, `ROLE TEST — role boundary fixture (do not use)`, ~900 documents (≈200 products). The
addresses cannot receive mail, so no code is needed: the logins are marked verified through Firebase's
admin interface — the same write the app makes after a real code. `verify:roles` checks **96 cells**
(route × role) and exits 0 only when all match; add `--signin` with `FIREBASE_WEB_API_KEY` and
`ROLE_TEST_PASSWORD` to prove the real sign-in path. `cleanup:roles` keeps the four logins by default;
`--delete-firebase` removes them only after the database is gone.

ADMIN's visible restriction is in **Users**: no creating another ADMIN, no changing its own role, no
editing an ADMIN or the OWNER.

### Cleanup commands

One command, two targets — the same shape as seeding. `--database=` is required and must equal the
database this shell resolved, and the phrases are supplied as settings: **two in development, three
in production** ([Guide 9](9-seeding-data.md) has the rule in full).

```bash
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db --dry-run
```

| Command | Deletes | Risk |
|---|---|---|
| `cleanup:perf` | the disposable perf tenant | ✅ that tenant only (`SEED_CONFIRM=seed-perf-ai`) |
| `cleanup:demo-tenant` | the demo tenant's rows | ✅ identity kept |
| `cleanup -- --target=database` (`inventoryai_dev_db`) | everything in dev, **logins included** | ⚠️ **High** |
| `cleanup -- --target=firebase` | only the identities you name with `--email=` | ⚠️⚠️ irreversible; refuses a linked address |
| `cleanup:test-firebase` | **every** identity in the approved project | ⚠️⚠️ irreversible — Part 4 |
| `cleanup -- --target=database` (`inventoryai_prod_db`) | real data | ⚠️⚠️ needs **three** phrases |

The test database is refused by name: `npm test` owns it. Clearing a database deletes its `users`
rows too, which is why the safe order for a fresh start is **database first, identities second** —
after the rows are gone, no address is left stranded by a deleted identity.

### H. Production

Every command above reaches production only when `--database=` names it **and** the third phrase is
supplied. That opens the door; a business that would be replaced must also be named with `--business=`.
The block below is the recommended route for scale testing; [Guide 9](9-seeding-data.md) has the short
explanation of the phrase rule.

```bash
cd C:/Users/jeffe/inventory-ai/server

# a tenant of its own, with a working login — the freestanding form is in Guide 6, Part 3G.1
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  DEMO_ACCOUNT_PASSWORD='choose-a-password' SEED_CONFIRM=seed:perf-tenant \
  npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=60000

# your own account: replace only the business its login owns (three phrases)
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_prod_db \
  SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed -- --plan=demo --database=inventoryai_prod_db --email=YOUR_EMAIL \
  --business=THE_BUSINESS_ID --total=60000

# empty that tenant's data, keeping the login, the business row and sessions
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db CLEANUP_CONFIRM=cleanup:demo-account \
  npm run cleanup:demo -- --database=inventoryai_prod_db \
  --email=YOUR_EMAIL --business=THE_BUSINESS_ID

# remove the dedicated tenant (identity kept)
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db CLEANUP_CONFIRM=cleanup:perf-tenant \
  npm run cleanup:perf-tenant -- --database=inventoryai_prod_db
```

`cleanup:demo` requires the email and business id to **agree**, deletes that tenant's inventory,
movements, products, categories, locations, suppliers, purchase orders, audit rows, invitations and
assistant conversations, then re-reads and prints `0 remaining`. It never deletes an identity.
`--dry-run` prints the same counts without deleting. A production seed never changes an existing
login's password.

`seed:accounts` refuses the default plan in production; name every account and its tenant:
`--accounts="a@x.com:60000:BUSINESS_ID_A,b@x.com:5000:BUSINESS_ID_B"`. `seed:roles` owns its address
set, so it needs no `--business=`; `verify:roles` needs `--signin` when `--base` is the deployment.

Re-run `verify:demo` with `--database=` after any of these. It writes nothing, so it needs no phrase.

## Part 4 — The one irreversible mistake

`cleanup:test-firebase` deletes **every login** in the development Firebase project, including yours.
A database record whose login is gone can never sign in again, and the address cannot be re-registered.

> **Clear MongoDB for a fresh start. Leave Firebase alone.**

You then sign in and get a brand-new empty business, exactly like a first-time user. The only
disposable identity is the one the perf tools create (`perf-seed-ai@example.invalid`); even that is
better left alone. There is no way to delete one user from the app, and none should be added — register
a new address instead.

## Part 5 — What the seeded data looks like

Default `seed:demo` (`--total=80000`, `--seed=1`):

| Collection | Documents |
|---|---|
| products | 18,000 (**2,777** at/below minimum, **1,109** at zero) |
| inventory rows | 36,104 |
| inventory movements | 23,966 |
| purchase orders | 1,600 |
| suppliers | 300 |
| categories | 24 |
| locations | 6 |
| **total** | **80,000** |

The dashboard should read 18,000 / 2,777 / 1,109. Other `--total` or `--seed` values give other
numbers; `verify:demo` prints the truth for what is actually stored.

## Part 6 — Starting over

| Want | Do | Touches |
|---|---|---|
| Fresh sample data | `SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db npm run seed -- --plan=demo --database=inventoryai_dev_db --email=YOUR_EMAIL` | only your business |
| Your data gone, logins too | `CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db npm run cleanup -- --target=database --database=inventoryai_dev_db` | every business in dev |
| Disposable tenant gone | `SEED_CONFIRM=seed-perf-ai npm run cleanup:perf` | that tenant only |
| A truly new user | register a new address in the app | a new empty business |

Ignore `--target=database` against `inventoryai_prod_db`, and `cleanup:test-firebase`, without a
specific reason.

## Part 7 — Comparing the assistant across three accounts

| Account | Documents | Products |
|---|---|---|
| `jefferndullamalinaozxc@gmail.com` | ≈5,000 | ≈1,100 |
| `jefferndullamalinao@gmail.com` | ≈44,000 | ≈9,900 |
| `jeffernmalinaoqwe@gmail.com` | ≈225,000 | ≈50,600 |

**Step 1 — clear both stores, in this order:**

```bash
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db

CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=firebase --database=inventoryai_dev_db \
  --email=jefferndullamalinaozxc@gmail.com \
  --email=jefferndullamalinao@gmail.com \
  --email=jeffernmalinaoqwe@gmail.com
```

The order is the safety: `--target=firebase` deletes **only the addresses you name**, and refuses any
address a user row still points at — the whole run, not part of it. It checks the link by
`firebaseUid` **and** by the address, in **both** the development and the production database (there is
one Firebase project, so an address can be referenced twice), because a uid goes stale when an
identity is re-created. An address whose identity is already gone but whose row remains is reported as
`ORPHANED` (exit 1), not as "0 deleted". It is nothing like `cleanup:test-firebase`.

**Step 2 — register all three in the app** (Create Account → 6-digit code from the mailbox → dashboard).

**Step 3 — seed them:**

```bash
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=accounts --database=inventoryai_dev_db --dry-run
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=accounts --database=inventoryai_dev_db
```

**Step 4 — generate a barcode** on a seeded product: SKUs and barcodes were left blank on purpose.

**Step 5 — compare:**

```bash
npm run perf:measure -- --business=<id> --label=small
npm run perf:golden -- --business=<id> --out=before.json
npm run perf:turns -- --business=<id> --only=2
```

Measured on a device, **95–97 % of a turn is the model, 3–5 % the queries**, and queries stay
sub-second even at tens of thousands of products — so `perf:measure` is what isolates data size.

## Part 8 — Words

Barrel: **Firebase** (logins) · **MongoDB/Atlas** (data) · **UID** (the link) · **tenant** (one
customer's data) · **seed** (fill with sample data) · **SKU/barcode** (optional product codes) ·
**fixture** (small fixed test data) · **environment** (development/test/production) ·
**destructive** (permanent) · **idempotent** (safe to repeat) · **exit code** (`0` = success).

← [Guides index](README.md) · Related: [6. Every script](6-scripts-and-commands.md) ·
[5. Words explained](5-words-explained.md)
