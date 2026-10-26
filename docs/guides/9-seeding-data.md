# 9. Seeding data

One command puts sample inventory data into a tenant. Development and production use the **same
command**; only the database changes, and production costs one more confirmation phrase.

Run everything from `server/`.

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

`npm run seed:demo`, `seed:accounts` and `seed:roles` still work — they are the same command with
the plan already chosen, and they take the same phrases.

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

`SEED_CONFIRM` is the plan's own phrase: `seed-demo-account`, `seed-accounts`, `seed-roles`.

---

## Development: two phrases

```bash
cd /c/Users/jeffe/inventory-ai/server

SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db \
  --email=you@example.com --total=80000
```

PowerShell keeps variables until you clear them:

```powershell
$env:SEED_CONFIRM='seed-demo-account'; $env:SEED_DB_CONFIRM='inventoryai_dev_db'
npm run seed -- --plan=demo --database=inventoryai_dev_db --email=you@example.com --total=80000
$env:SEED_CONFIRM=$null; $env:SEED_DB_CONFIRM=$null
```

## Production: three phrases

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

---

## Dry run — plan without writing

Add `--dry-run` to any plan. The target and all phrases are still checked; nothing is connected to
and nothing is written, so it is the safe way to prove a production command is correct.

```bash
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db --email=you@example.com --dry-run
```

`--dry-run` is not a verification: it reports what *would* happen. Verification reads the rows back.

## Verify — read-only, always

```bash
npm run verify:demo -- --email=you@example.com --database=inventoryai_dev_db
```

It reads the database and checks counts, ledger arithmetic (`newQuantity = previous ± quantity`) and
referential integrity (inventory → product/location, receipts → real movements). It writes nothing,
so it needs no phrase. Exit codes are a contract:

- **0** verified — the data is what the seeder claimed
- **1** a violation was found — the data is wrong
- **2** not verified — the database or account could not be read (not a data problem)

Run it after every seed. It is the only thing that proves the rows, rather than the seeder's own
count of its inserts.

---

## What resets and what does not

| Command | Existing data | Account rows | Firebase identities |
|---|---|---|---|
| `seed --plan=demo` | **replaced** for that one tenant | created if absent, else kept | never deleted; created only if absent |
| `seed --plan=accounts` | **replaced** for each named tenant | same | same |
| `seed --plan=roles` | **replaced** for the role fixture tenant | four role logins reused | same |
| `verify:demo` | untouched | untouched | untouched |

Re-running a seed is the documented way to start over: it empties that tenant's data and writes a
fresh dataset. It never deletes a user, a business row or a login, and it never removes another
tenant's data — every write is scoped by `businessId`.

---

## Large data, safely

`--total` is documents, and products land at roughly 22.5 % of it (80 000 documents ≈ 18 000
products). Allowed range is 100–400 000.

| Want | Command |
|---|---|
| Your own account, big | `--plan=demo --email=you@example.com --total=80000` |
| Three sizes at once | `--plan=accounts` (defaults 5 000 / 44 000 / 225 000) |
| Choose the sizes | `--plan=accounts --accounts="a@x.com:5000,b@x.com:44000,c@x.com:225000"` |

The dataset is deterministic (`--seed=1` by default), so two measurements describe the same tenant.
Seed in the morning rather than mid-measurement: a run replaces the tenant's data, and the assistant
would be measured against a half-written catalogue.

Two performance tools sit **outside** this workflow, because they are measurements rather than
fixtures: `npm run seed:perf` (a disposable tenant with no login, development only) and
`npm run seed:perf-tenant` (a sign-in-able tenant in a named database). Each has its own guard and
phrase, documented in Guide 6.

---

## When it refuses

| Message | Meaning | Do |
|---|---|---|
| `--plan=<demo\|accounts\|roles> is required` | no plan chosen | add `--plan=…` |
| `--database=<name> is required` | the target was not named | add `--database=` with the resolved name |
| `--database is "…" but this process resolved "…"` | the flag and `MONGODB_DB_NAME` disagree | set `MONGODB_DB_NAME` to the database you mean |
| `MONGODB_URI names the database "…"` | the connection string is configured for the other database | fix the URI or the environment; nothing was written |
| `two/three confirmation phrase(s) … missing or wrong` | a phrase is absent or mistyped | the message lists every one it needs |
| `test database … npm test clears` | the test database was selected | use development or production |
| `not a seeding target` | an unknown database name | only `inventoryai_dev_db` / `inventoryai_prod_db` |
| `the database account for … is linked to Firebase uid …` | the Firebase identity was deleted and re-created under the same address, so the row still holds the old uid | see below — the seeder will not re-link it for you |

### If an account is stranded

That last message is a **data state**, not a command mistake: the database row carries a `firebaseUid`
that no longer exists in Firebase. Measured on 2026-10-26, all three development accounts were in it.
Such a row can neither sign in (the exchange resolves by `firebaseUid` only) nor register again
(`409 EMAIL_IN_USE`), and re-pointing an identity link is an identity operation — deliberately not
something a data seeder performs as a side effect.

The ways out are deliberate ones: seed a **different** address, or repair the link through an approved
flow. Do not "fix" it by deleting the Firebase identity; that keeps the address unusable.

← [Guides index](README.md) · Related: [4. Test accounts](4-test-accounts-and-mock-data.md) ·
[6. Every script](6-scripts-and-commands.md) · [10. Deleting data](10-deleting-data.md)
