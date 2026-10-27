# 9. Seeding data

Everything about putting sample data into a database: the commands, which database they write, the
confirmation phrases, and how to check the result. Deleting data is [Guide 10](10-deleting-data.md);
Firebase identities are [Guide 11](11-firebase-identities.md); the accounts themselves are
[Guide 4](4-test-accounts-and-mock-data.md).

Run everything from `server/`.

---

## Which command?

| You want | Command |
|---|---|
| Data in the account you sign in with | `npm run seed -- --plan=demo --database=<name> --email=YOUR_EMAIL` |
| Several accounts at different sizes | `npm run seed -- --plan=accounts --database=<name>` |
| One working login per role | `npm run seed -- --plan=roles --database=<name>` |
| A small demo tenant with fixed figures | `npm run seed:demo-tenant -- --database=<name>` |
| A large, sign-in-able tenant of its own | `npm run seed:perf-tenant -- --database=<name> --size=<documents>` |
| A disposable tenant with no login (measurement only) | `npm run seed:perf -- --size=<products>` |

The first three are one command with a plan chosen. The last three are separate commands:
`seed:perf-tenant` follows the **same** two/three-phrase rule, while `seed:perf` and `seed:demo-tenant`
state their own terms — both documented below.

---

## The one command

```bash
npm run seed -- --plan=<demo|accounts|roles> --database=<name> [options]
```

| Plan | Writes | Use it for |
|---|---|---|
| `demo` | one account's tenant, replacing its data | the phone you sign in with; asking the assistant about a big catalogue |
| `accounts` | several tenants, each at its own size | comparing speed and answers across tenants of different sizes |
| `roles` | one isolated tenant with a working login per role | seeing what OWNER / ADMIN / MANAGER / STAFF can actually do |

`npm run seed:demo`, `seed:accounts` and `seed:roles` are the same command with the plan already
chosen, and they take the same phrases. `npm run seed -- --plan demo` (a space) is accepted too.

Every plan **counts its dataset back** from the database before it prints `OK`: the seven
collections, through the tenant's own filter. A partly-rejected insert therefore fails the run instead
of being reported as a dataset that is not there. Sizes and seeds are whole numbers only —
`--total=900abc` and `--seed=1.5` are refused, not silently truncated.

---

## Choosing the database

The database comes from **`MONGODB_DB_NAME`**, and it must be named again on the command line:

```bash
--database=<name>          # must equal what MONGODB_DB_NAME resolves
```

If the two disagree, the run refuses before connecting. That is the point: a typo in one cannot
quietly seed the other. Only two targets are seedable — `inventoryai_dev_db` and
`inventoryai_prod_db`. The test database is refused because `npm test` clears it.

The connection string must agree too. If `MONGODB_URI` ends with a database name — say
`…/inventoryai_prod_db` — and it is not the resolved one, the run refuses. The connection obeys the
resolved name, so the write would land correctly; the refusal is about the shell being configured for
the other environment. The message names both databases and never echoes the URI.

Production can only be selected with **both** of these, which `config/env.ts` enforces:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db
```

---

## The confirmation phrases

| Target | Phrases required |
|---|---|
| Development | **2**: `SEED_CONFIRM` (the plan) + `SEED_DB_CONFIRM` (the database name) |
| Production | **3**: both of the above + `SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA` |

They answer three different questions — *what* is written, *where*, and *is this real data* — so no
single exported variable can reach production by habit. A refusal names every phrase that is missing
and how many are required.

`SEED_CONFIRM` is the plan's own phrase: `seed-demo-account`, `seed-accounts`, `seed-roles`. The two
performance tools use their own: `seed:perf-tenant` (two/three phrases, same rule) and `seed-perf-ai`
(`seed:perf`, development only). `seed:demo-tenant` is the exception — see its section.

---

## Development: two phrases

```bash
cd /c/Users/jeffe/inventory-ai/server

SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db \
  --email=you@example.com --total=80000
```

PowerShell keeps variables until you clear them, so set, run, clear:

```powershell
$env:SEED_CONFIRM='seed-demo-account'; $env:SEED_DB_CONFIRM='inventoryai_dev_db'
npm run seed -- --plan=demo --database=inventoryai_dev_db --email=you@example.com --total=80000
$env:SEED_CONFIRM=$null; $env:SEED_DB_CONFIRM=$null
```

`--total=80000` is the default (range **100–400 000**); `--seed=1` makes the data identical every run.
`--email=` must be the address you sign in with — the tenant is found through the Firebase UID. Expect
`OK` and `TOTAL 80000 (target 80000)`.

For a brand-new address the login is created; supply its password through a setting, never on the
command line:

```bash
DEMO_ACCOUNT_PASSWORD='choose-a-strong-password' \
  SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db \
  --email=tester-1@example.com --total=500
```

### Several accounts

```bash
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=accounts --database=inventoryai_dev_db --dry-run   # plan only
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=accounts --database=inventoryai_dev_db
```

- Default sizes: small ≈ 5 000 documents (≈1 100 products), medium ≈ 44 000 (≈9 900), large ≈ 225 000
  (≈50 600).
- **No SKUs or barcodes** are generated, so the app's own barcode generation is exercised.
  `--include-sku` generates them too.
- `--accounts="a@x.com:5000,b@x.com:44000"` replaces the plan; a size is required per entry.
- Each account gets its own business; the command refuses if two accounts resolve to the same one.
- A missing login stops the run (unless you supply `DEMO_ACCOUNT_PASSWORD`); an existing password is
  never changed.

### One login per role

```bash
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=roles --database=inventoryai_dev_db --dry-run
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=roles --database=inventoryai_dev_db

npm run verify:roles -- --business=<id the seeder printed>
```

| Role | Address |
|---|---|
| OWNER | `role-owner@example.invalid` |
| ADMIN | `role-admin@example.invalid` |
| MANAGER | `role-manager@example.invalid` |
| STAFF | `role-staff@example.invalid` |

One tenant, `ROLE TEST — role boundary fixture (do not use)`, ~900 documents (≈200 products). The
`.invalid` addresses cannot receive mail, so the four logins are marked verified through Firebase's
admin interface — the same write the app makes after a real code. `verify:roles` checks **96 cells**
(route × role) and exits 0 only when all match; add `--signin` with `FIREBASE_WEB_API_KEY` and
`ROLE_TEST_PASSWORD` to prove the real sign-in path.

ADMIN's visible restriction is in **Users**: no creating another ADMIN, no changing its own role, no
editing an ADMIN or the OWNER.

---

## Production: three phrases

The command is identical. The third phrase is the only new thing.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  SEED_CONFIRM=seed-demo-account \
  SEED_DB_CONFIRM=inventoryai_prod_db \
  SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed -- --plan=demo --database=inventoryai_prod_db \
  --email=you@example.com --business=<the id verify:demo prints> --total=60000
```

In production, an account that **already owns** a tenant must name it with `--business=<id>`. Naming
the tenant is the fourth deliberate act when the run would replace data that already exists. A
brand-new tenant has no id to name. An existing login's password is never rewritten.

Expect `database … (PRODUCTION)`, the tenant line, `scope : replacing the DATA of business …`, the
counts, `OK`, and `password NOT changed on a production run`. Name, members and roles are untouched.

`--plan=accounts` refuses its default three-account plan in production: every account must be given
as `--accounts="address:documents[:businessId],…"`. `--plan=roles` owns its own fixture tenant and
needs no `--business=`. PowerShell adds `$env:NODE_ENV='production'`, `$env:MONGODB_DB_NAME`,
`$env:SEED_PROD_CONFIRM` and clears all four afterwards.

### The sign-in-able measurement tenant (`seed:perf-tenant`)

A large tenant of its own, with a working login, in any named database — the recommended production
route because it never touches an account it did not create.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  DEMO_ACCOUNT_PASSWORD='choose-a-password' SEED_CONFIRM=seed:perf-tenant \
  SEED_DB_CONFIRM=inventoryai_prod_db SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=60000

# preview first: how many rows would be replaced, and never a write
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  SEED_CONFIRM=seed:perf-tenant SEED_DB_CONFIRM=inventoryai_prod_db \
  SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=60000 --dry-run
```

- It follows the **same two/three-phrase rule** as every command above.
- `--size` is **documents**, 50–400 000, default 4 000; products ≈ 22 %. Deterministic (`--seed`,
  default 1). SKUs are `SEEDSKU-…`.
- It creates a verified OWNER login (`perf-seed-ai@example.invalid`) in that tenant only, and
  refreshes its password from `DEMO_ACCOUNT_PASSWORD` on every run.
- Re-counts every collection, re-checks every movement's arithmetic and requires its anchor before
  saying `OK`.
- Its teardown is `cleanup:perf-tenant` ([Guide 10](10-deleting-data.md)); it keeps the identity.

Measured on production 2026-10-25: `--size=60000` → 13 500 products, 27 200 inventory rows, 17 836
movements, 1 200 purchase orders in **110 s**.

---

## The two tools on their own guards

Neither follows the two/three-phrase rule; each states its own terms. Both are documented here so the
difference is not guessed at.

### `seed:demo-tenant` — fixed figures, one phrase

```bash
DEMO_ACCOUNT_PASSWORD='<password>' SEED_CONFIRM=seed-demo-tenant \
  npm run seed:demo-tenant -- --database=inventoryai_dev_db --dry-run   # preview first
DEMO_ACCOUNT_PASSWORD='<password>' SEED_CONFIRM=seed-demo-tenant \
  npm run seed:demo-tenant -- --database=inventoryai_dev_db
```

- The database must be **named** and must equal the resolved one; the test database is refused.
- **One phrase**, `SEED_CONFIRM=seed-demo-tenant` (there is no `SEED_DB_CONFIRM` and no production
  phrase for this tool).
- It may run against production, because the database is named and matched.
- The password is set on every run.

Sign in as `demo-preview@example.invalid` (owner `Demo Tester`). Every figure is fixed:

| | |
|---|---|
| Products | **6** active, 5 with stock (Demo Desk Lamp has no inventory row) |
| On hand | **112 units** |
| Locations | **Demo Warehouse 75** (4 products) · **Demo Shop 30** (2) · **Demo Van 7** (1) |
| Health | 3 healthy · 3 at/below minimum · **1 out of stock** |
| Restock | Demo Desk Lamp (0 vs min 3) · Demo Coffee Beans 1kg (4 vs 10) · Demo Paper Cups 100pk (15 vs 20) |
| Ledger | 9 movements, each ending at the figures above |

The seeder prints these figures itself; compare them with the screen. Teardown is
`cleanup:demo-tenant` ([Guide 10](10-deleting-data.md)), which keeps the Firebase identity.

### `seed:perf` — no login, development only

```bash
SEED_CONFIRM=seed-perf-ai npm run seed:perf -- --size=1000 --dry-run   # products, 1–200000
SEED_CONFIRM=seed-perf-ai npm run seed:perf -- --size=1000
SEED_CONFIRM=seed-perf-ai npm run cleanup:perf -- --dry-run   # count it first
SEED_CONFIRM=seed-perf-ai npm run cleanup:perf
```

Named `PERF SEED — AI assistant stress test (do not use)`, **no Firebase identity**, so it cannot be
signed into. It prints the `businessId` the query measurements need. Development only: its guard
refuses production outright. `cleanup:perf` proves `0 remaining` and says `nothing to clean` when
there was nothing.

---

## Dry run — plan without writing

Add `--dry-run` to any plan. The target and all phrases are still checked; nothing is connected to and
nothing is written, so it is the safe way to prove a production command is correct.

```bash
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db --email=you@example.com --dry-run
```

`--dry-run` is not a verification: it reports what *would* happen. Verification reads the rows back.

Every seeder previews, and each preview stops before its first write:

| Command | What the preview reports |
|---|---|
| `seed --plan=…` | the plan, the target and the phrase count — **no connection is opened** |
| `seed:perf` | the size, the tenant and the fact that any previous seed tenant would be replaced — no connection |
| `seed:perf-tenant` | whether the tenant would be created or replaced, and how many documents would be cleared |
| `seed:demo-tenant` | whether the tenant would be created, attached or replaced, and how many documents would be cleared |

The last two read the database to count (they need it to know what exists) and **never touch
Firebase**; a real run is what creates or refreshes the login. Neither needs the password to preview.

## Verify — read-only, always

```bash
npm run verify:demo -- --email=you@example.com --database=inventoryai_dev_db
```

It reads the database and checks counts, ledger arithmetic (`newQuantity = previous ± quantity`) and
referential integrity (inventory → product/location, receipts → real movements). It writes nothing, so
it needs no phrase. Add `NODE_ENV=production MONGODB_DB_NAME=…` for production. Exit codes are a
contract:

- **0** verified — the data is what the seeder claimed
- **1** a violation was found — the data is wrong
- **2** not verified — the database or account could not be read (not a data problem)

Run it after every seed. It is the only thing that proves the rows, rather than the seeder's own count
of its inserts. `verify:roles` is the equivalent for the role fixture.

---

## What resets and what does not

| Command | Existing data | Account rows | Firebase identities |
|---|---|---|---|
| `seed --plan=demo` | **replaced** for that one tenant | created if absent, else kept | never deleted; created only if absent |
| `seed --plan=accounts` | **replaced** for each named tenant | same | same |
| `seed --plan=roles` | **replaced** for the role fixture tenant | four role logins reused | same |
| `seed:perf-tenant` | **replaced** for its own tenant | created if absent | created if absent; password refreshed |
| `seed:demo-tenant` | **replaced** for the demo tenant | created if absent | created if absent; password set |
| `seed:perf` | **replaced** for its own tenant | recreated, no login | never touched |
| `verify:demo` / `verify:roles` | untouched | untouched | untouched |

Re-running a seed is the documented way to start over: it empties that tenant's data and writes a
fresh dataset. It never deletes a user, a business row or a login, and it never removes another
tenant's data — every write is scoped by `businessId`.

---

## Large data, safely

`--total` is documents, and products land at roughly 22.5 % of it (80 000 documents ≈ 18 000 products).
The range is 100–400 000 for `demo` and `accounts`; the role fixture takes 100–20 000.

| Want | Command |
|---|---|
| Your own account, big | `--plan=demo --email=you@example.com --total=80000` |
| Three sizes at once | `--plan=accounts` (defaults 5 000 / 44 000 / 225 000) |
| Choose the sizes | `--plan=accounts --accounts="a@x.com:5000,b@x.com:44000,c@x.com:225000"` |

The dataset is deterministic (`--seed=1` by default), so two measurements describe the same tenant.
Seed in the morning rather than mid-measurement: a run replaces the tenant's data, and the assistant
would be measured against a half-written catalogue.

---

## When it refuses

| Message | Meaning | Do |
|---|---|---|
| `--plan=<demo\|accounts\|roles> is required` | no plan chosen | add `--plan=…` |
| `--database=<name> is required` | the target was not named | add `--database=` with the resolved name |
| `--database is "…" but this process resolved "…"` | the flag and `MONGODB_DB_NAME` disagree | set `MONGODB_DB_NAME` to the database you mean |
| `MONGODB_URI names the database "…"` | the connection string is configured for the other database | fix the URI or the environment; nothing was written |
| `two/three confirmation phrase(s) … missing or wrong` | a phrase is absent or mistyped | the message lists every one it needs |
| `set SEED_CONFIRM=<phrase> to proceed` | a tool with its own guard wants its own phrase | use `seed-perf-ai`, `seed:perf-tenant` or `seed-demo-tenant` as appropriate |
| `--total must be a whole number …` | a size or seed is not a whole number | digits only; `900abc` and `1.5` are refused rather than read as 900 and 1 |
| `the read-back does not match what was written` | an insert was partly rejected | nothing is reported as done; re-run and read the collections named |
| `test database … npm test clears` | the test database was selected | use development or production |
| `not a seeding target` | an unknown database name | only `inventoryai_dev_db` / `inventoryai_prod_db` |
| `--email=<address> is required, and nothing was read` (`verify:demo`) | the verifier was run without an address | add `--email=`; it refuses before connecting, so nothing was read |
| `no Firebase identity exists … DEMO_ACCOUNT_PASSWORD is not set` | the address has no login | register it first (recommended) or set the password |
| `the database account for … is linked to Firebase uid …` | the Firebase identity was deleted and re-created under the same address, so the row still holds the old uid | see below — the seeder will not re-link it for you |

### If an account is stranded

That last message is a **data state**, not a command mistake: the database row carries a `firebaseUid`
that no longer exists in Firebase. Measured on 2026-10-26, all three development accounts were in it.
Such a row can neither sign in (the exchange resolves by `firebaseUid` only) nor register again
(`409 EMAIL_IN_USE`), and re-pointing an identity link is an identity operation — deliberately not
something a data seeder performs as a side effect.

The ways out are deliberate ones: seed a **different** address, or repair the link through an approved
flow. Do not "fix" it by deleting the Firebase identity; that keeps the address unusable
([Guide 11](11-firebase-identities.md)).

← [Guides index](README.md) · Related: [4. Test accounts](4-test-accounts-and-mock-data.md) ·
[10. Deleting data](10-deleting-data.md) · [11. Firebase identities](11-firebase-identities.md) ·
[6. Everything else](6-scripts-and-commands.md)
