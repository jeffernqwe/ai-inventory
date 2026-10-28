# 10. Seeding data — production

Putting sample data into **`inventoryai_prod_db`**, the database the deployed server and the shipped app
use. Development is [Guide 9](9-seeding-development.md); deleting data is [Guide 12](12-deleting-production.md);
Firebase logins are [Guide 13](13-firebase-identities.md); the accounts are [Guide 4](4-test-accounts-and-mock-data.md).

The commands are the same as development. Three things differ: **the phrases**, **the environment** and
**what is refused**.

Run everything from `server/`.

---

## The production rule

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db   # both, enforced by config/env.ts
--database=inventoryai_prod_db                           # and named again on the command line
```

- **Three phrases.** Both of development's, plus `SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA`. They answer
  three different questions — *what* is written, *where*, and *is this real data* — so no single exported
  variable can reach production by habit. A refusal names every phrase that is missing and how many that
  target needs.
- **A preset is refused.** `seed:three` (and `seed --plan=accounts` with no list) would reset three real
  businesses in one command, so production requires every account to be **named by address**. Its tenant is
  **resolved from the database**, and the account must be that tenant's OWNER.
- **Every write is scoped by `businessId`.** Nothing outside the tenants you name is read or reset.
- **The Firebase project is pinned** to `inventoryai-d0d20`; a login created elsewhere could never be
  joined to the tenant ([Guide 13](13-firebase-identities.md)).

PowerShell keeps variables until you clear them, so set, run, then clear `NODE_ENV`, `MONGODB_DB_NAME`,
`SEED_CONFIRM`, `SEED_DB_CONFIRM` and `SEED_PROD_CONFIRM`.

---

## Step 0 — check, read-only, no phrase

```bash
npm run check:accounts -- --with-production
```

It reads **the production database only** and Firebase, and prints each account's tenant id and the
size that tenant currently holds. `--with-production` selects production instead of development, so a
tenant that exists only in development never fails this check. Exit **0** every account ready, **1**
missing or mismatched, **2** could not check.

| Account | Products | ≈ Documents | `businessId` |
|---|---|---|---|
| `jefferndullamalinaozxc@gmail.com` | 5 000 | 22 222 | `6ae15d1b6f2be6b817771e97` |
| `jefferndullamalinao@gmail.com` | 10 000 | 44 444 | `6ae15dc16f2be6b817771e9c` |
| `jeffernmalinaoqwe@gmail.com` | 15 000 | 66 667 | `6ae15e926f2be6b817771ea2` |

That table is a **measurement of what the tenants held on 2026-10-29**, not a target: nothing reads it.
`seed:accounts` uses the size you type in `--accounts`, and re-seeding replaces whatever is there. The
`seed:three` preset (30 000 / 50 000 / 90 000) is a separate, development-only convenience.

The id is the tenant's own `_id`, not the login's. `seed:accounts` resolves the address to that row and
needs no id; `seed --plan=demo` still names it with `--business=<id>`. A supplied id is checked against
the resolved tenant and refused if it disagrees — the lookup is the source, an id is only a claim it
checks. A production address with **no tenant is refused** too: registration in the app creates it, a
seeder does not.

---

## Naming a tenant that already exists

| Command | How the tenant is named |
|---|---|
| `seed --plan=demo` | `--business=<id>` |
| `seed:accounts` / `seed:three`'s place | resolved from each address; an optional `:businessId` is checked |
| `seed:perf-tenant`, `seed --plan=roles` | not needed — each owns the tenant it creates |

The address resolves to its user row and that row's own `businessId` is what is written. In production the
row must be the **OWNER of exactly one** business: the resolver refuses a missing tenant, a second
association, or a non-OWNER before any write. If you do supply an id, it must **agree** with that row.
In production the run says the password was left alone — `password unchanged` in `seed:accounts`,
`password NOT changed` in `seed --plan=demo`. An existing login's password is never rewritten.

---

## Seeding the three accounts, all three in one run

**The counts are yours on every run.** `--accounts` is the only thing that sets a size — there is no
preset or documentation value behind it. Each entry is `address:products` (an optional `:businessId` is
checked, not required), and any whole number from **5 to 112 500 products** per account is accepted.
The unit is products, so `1000` means 1 000 products (≈4 444 documents across the collections) and the
console prints both figures before it writes. Change the three numbers to whatever you need,
independently; the command below is an example, not a required set.

```bash
# PREVIEW — the same three phrases, nothing written
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
  SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed:accounts -- --database=inventoryai_prod_db --dry-run \
    --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:2000,jeffernmalinaoqwe@gmail.com:3000"

# EXECUTE — the same line without --dry-run
```

- **A size is PRODUCTS.** `:400000d` asks in documents instead; the ceiling is **112 500 products ≈ 500 000
  documents** per account.
- **The run proves what it wrote.** After each tenant it re-counts every collection and compares the
  database with what the writer reported; a disagreement stops the run and names the collection
  (`wrote X, found Y`), and `Result : SUCCESS` is printed only after every tenant passes. The counts are
  checked against the plan from your own command, never against a documented figure.
- Each tenant is emptied and rewritten only after its address has resolved to exactly one tenant the
  account owns, so the run is the documented way to start over for that tenant.
- Expect `Database : inventoryai_prod_db (PRODUCTION)`, `Products`/`Documents`, a preflight line per
  account (`… — OWNER — N documents to reset`), an `Identity : … — verified — password unchanged` line, a
  `wrote … documents (… products)` line, and `Result : SUCCESS`. Name, members and roles are untouched.
  (The `scope : …` and `OK` lines belong to `seed --plan=accounts`, which is a different command.)
- **No SKUs or barcodes** are generated unless you ask for `--include-sku`.
- `verify:demo` ([Guide 9](9-seeding-development.md#verify--read-only-always)) is the independent
  check afterwards: it validates ledger arithmetic, references and emptiness, and prints the counts it
  read. It does not require any particular size, so it works for every size this command accepts.
- Measured 2026-10-29 at **5 000 / 10 000 / 15 000** products: those tenants held **22 222 / 44 444 /
  66 667 documents** (133 333 in all) and `verify:demo` returned **SUCCESS** for each with 0 bad ledger
  rows and 0 missing references. That measurement describes that run, not a requirement. The earlier
  30 000 / 50 000 / 90 000 run on 2026-10-27 wrote **755 555 documents** in **23 min 6 s**, and every
  identity was reported `already existed, verified` — nothing was written to Firebase.

---

## The account you sign in with (`seed --plan=demo`)

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  SEED_CONFIRM=seed-demo-account \
  SEED_DB_CONFIRM=inventoryai_prod_db \
  SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed -- --plan=demo --database=inventoryai_prod_db \
  --email=you@example.com --business=<the id check:accounts prints> --total=60000
```

`--total` is **documents** (100–400 000). Naming the tenant is the fourth deliberate act when the run would
replace data that already exists. A brand-new tenant has no id to name — `--business` is required only when
the account already owns one.

---

## Which command, in production

Every row below is a production command: it needs `NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db`
and the phrases shown in the full blocks. A line copied without them resolves the development database and
is refused by the same guard — `check:accounts --with-production` is the exception, because it selects
production itself.

| You want | Command |
|---|---|
| A large tenant of its own, with a login | `npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=60000` — the recommended route |
| Your own account's tenant | `npm run seed -- --plan=demo --database=… --email=… --business=<id>` |
| Accounts you name | `npm run seed:accounts -- --database=… --accounts="address:products,…"` |
| One login per role | `npm run seed -- --plan=roles --database=…` |
| The fixed-figure demo tenant | `npm run seed:demo-tenant -- --database=…` (its own single phrase) |
| The comparison preset | **refused** — `seed:three` may not run against production |
| A no-login measurement tenant | **refused** — `seed:perf` is development only |

### The measurement tenant (`seed:perf-tenant`)

A large tenant of its own, with a working login, in any named database — the recommended production route
because it never touches a tenant it did not create.

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

- It follows the **same three-phrase rule** as every command above.
- `--size` is **documents**, 50–400 000, default 4 000; products land at ≈22 %. Deterministic (`--seed`,
  default 1). SKUs are `SEEDSKU-…`.
- It creates a verified OWNER login (`perf-seed-ai@example.invalid`) in that tenant only, and refreshes its
  password from `DEMO_ACCOUNT_PASSWORD` when that variable is supplied.
- Re-counts every collection, re-checks every movement's arithmetic and requires its anchor before saying
  `OK`.
- Its teardown is `cleanup:perf-tenant` ([Guide 12](12-deleting-production.md)); it keeps the identity.

Measured on production 2026-10-25: `--size=60000` → 13 500 products, 27 200 inventory rows, 17 836 movements,
1 200 purchase orders in **110 s**.

### The fixed-figure demo tenant

`seed:demo-tenant` keeps its own single phrase and may be pointed at production, because the database is
named and matched. Its figures are in [Guide 9](9-seeding-development.md); teardown is `cleanup:demo-tenant`.

---

## Dry run — prove the destination first

Add `--dry-run` to any command above. The target and **all three phrases** are still checked, the plan is
printed, and nothing is written. `seed:accounts` also reads — never writes — to resolve every address to
its own tenant, require an OWNER, refuse an ambiguous association, check any supplied `:businessId`
against that row, and count what a run would reset. A wrong or missing mapping fails the preview rather
than the write. In production, `seed --plan=demo` reads the named tenant to check `--business` and
count what it would replace (development still opens no connection). `seed:perf-tenant` and
`seed:demo-tenant` also read the database to count what they would replace. None of them touches
Firebase.

`--dry-run` is not a verification: it reports what *would* happen. Verification reads the rows back.

---

## Verify in production

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --email=you@example.com --database=inventoryai_prod_db
```

Reads counts, ledger arithmetic and referential integrity; writes nothing, needs no phrase. Exit **0**
verified, **1** a violation **or an empty tenant** (an empty tenant cannot verify a seeded dataset),
**2** could not read (a missing account or business, or the database — not a data problem). Measured
2026-10-29 on the current tenants: all three returned **SUCCESS**, with **0** bad ledger rows and **0**
missing references; stock health was 781 low / 320 out, 1 535 / 612 and 2 315 / 929. The earlier
30 000 / 50 000 / 90 000 run measured 4 656 / 1 892, 7 623 / 3 030 and 13 683 / 5 481 — the PRNG seed
doing what it promises across two environments and two sizes.

---

## Room on the cluster

The cluster is Atlas M0: **512 MB of data plus indexes**, shared by development and production. Measured
2026-10-29, `inventoryai_prod_db` reports **32.0 MB of document data (16.0 MB stored) and 59.0 MB of
indexes** — **91.0 MB of the 512 MB** by `dbStats`, with the current 5 000 / 10 000 / 15 000
tenants. At the preset's 30 000 / 50 000 / 90 000 sizes the same three tenants measured **379.9 MB** on
2026-10-27, so a full development copy of those full-size datasets (~338 MB) alongside a full
production copy still does not fit; an M0 that runs out of storage does **not** degrade, it **blocks
writes** (the 2026-10-18 incident).

So: seed the environment you are working in at full size, and keep the other small; or empty one first
([Guide 12](12-deleting-production.md)). A delete frees documents but **not** the space their indexes were
allocated — that guide has the numbers and the reclaim.

---

## What resets and what is kept

| Command | Existing data | Account rows | Firebase identities |
|---|---|---|---|
| `seed --plan=demo --business=<id>` | **replaced** for that tenant | kept; created if absent | never deleted; password never rewritten |
| `seed:accounts` (resolved tenants) | **replaced** for each account's own tenant | kept | never deleted |
| `seed:perf-tenant` | **replaced** for its own tenant | kept | created if absent; its own password refreshed when `DEMO_ACCOUNT_PASSWORD` is supplied |
| `seed --plan=roles` | **replaced** for the role fixture tenant | four role logins reused | reused |
| `seed:demo-tenant` | **replaced** for the demo tenant | kept | password set when `DEMO_ACCOUNT_PASSWORD` is supplied |
| `verify:demo` / `verify:roles` / `check:accounts` | untouched | untouched | untouched |

---

## When it refuses

| Message | Meaning | Do |
|---|---|---|
| `the seed:three preset … is refused in production` | a preset against real businesses | name every account: `--accounts="address:products,…"` |
| `no business exists for … and a production run will not create one` | the address has no tenant in this database | register it in the app first; registration creates the business |
| `… requires the OWNER` | the account is a member, not the tenant's owner | seed the owner's address — the whole tenant is replaced |
| `… is linked to 2 businesses …` | more than one row associates the address with a tenant | fix the association deliberately; nothing was written |
| `names business …, but this account owns …` | a supplied id is not that account's tenant | omit the id (the run resolves it), or use the row's own |
| `three confirmation phrase(s) … SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA` | a phrase is missing or wrong | the message lists every one it needs |
| `--database is "…" but this process resolved "…"` | the flag and `MONGODB_DB_NAME` disagree | set `MONGODB_DB_NAME` to the database you mean |
| `MONGODB_URI names the database "…"` | the connection string is configured for the other environment | fix the URI; nothing was written |
| `NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db` (the env pair in the message) | production was selected without both | export both, then re-run |
| `not a seeding target` | an unknown database name | only `inventoryai_dev_db` / `inventoryai_prod_db` |
| `asks for 1,000,000 products. The ceiling is 112,500` | over the per-account ceiling | split the plan across accounts |
| `this shell is configured for Firebase project "…"` | the credentials name a project other than the approved one | fix `FIREBASE_PROJECT_ID`; nothing was read or written |
| `no Firebase identity exists … a production seed will not create one` | the address has no login in this Firebase project | register it in the app first; production never creates one |
| `the database account for … is linked to Firebase uid …` | the identity was deleted and re-created, so the row holds a stale uid | seed a different address, or repair the link through an approved flow |
| `Writes are blocked on your cluster` (from MongoDB) | the M0 filled up | empty a tenant or rebuild the empty collections' indexes ([Guide 12](12-deleting-production.md)) |

---

← [Guides index](README.md) · Related: [4. Test accounts](4-test-accounts-and-mock-data.md) ·
[9. Seeding data — development](9-seeding-development.md) ·
[11. Deleting data — development](11-deleting-development.md) ·
[12. Deleting data — production](12-deleting-production.md) ·
[13. Firebase identities](13-firebase-identities.md) · [6. Everything else](6-scripts-and-commands.md)
