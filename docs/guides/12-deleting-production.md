# 12. Deleting data — production

Removing data from **`inventoryai_prod_db`**, the database the deployed server and the shipped app use.
Development is [Guide 11](11-deleting-development.md); seeding is [Guide 9](9-seeding-development.md) and
[Guide 10](10-seeding-production.md); deleting Firebase logins is [Guide 13](13-firebase-identities.md).

The commands are the same as development. Three things differ: **the phrases**, **the environment** and
**what is refused**.

[Guide 14](14-command-runbook.md) is the single sheet of complete development and production
invocations; this guide explains the production rules behind them.

Run everything from `server/`.

---

## The production rule

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db   # both, enforced by config/env.ts
--database=inventoryai_prod_db                           # and named again on the command line
```

| Target database | Phrases required |
|---|---|
| Development | `CLEANUP_CONFIRM=<the command's phrase>` + `CLEANUP_DB_CONFIRM=inventoryai_dev_db` |
| Production | both of the above, plus `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` |

Each phrase answers a different question — *which command*, *where*, *is this real* — so one habitual export
cannot reach production. A refusal names **every** missing phrase and says how many that target needs. Every
command also has a `--dry-run`, and the preview counts through the same plan the real run executes.

- **A preset is refused.** `cleanup:three` would empty three real businesses in one command, so every
  **address** is named instead; each is resolved to its own tenant, and the account must be its OWNER.
- **Every deletion is scoped by `businessId`**, resolved from the account's own row in this database.
- **Nothing here deletes a login.** `--target=firebase` is a separate, deliberate operation, and it refuses
  while any database row still owns the address ([Guide 13](13-firebase-identities.md)).

The phrase each command uses in production:

| Command | `CLEANUP_CONFIRM` |
|---|---|
| `cleanup -- --target=database` | `cleanup:database` |
| `cleanup:account` | `cleanup-account-data` |
| `cleanup:demo` | `cleanup:demo-account` |
| `cleanup:perf-tenant` | `cleanup:perf-tenant` |
| `cleanup:demo-tenant` | `cleanup:demo-tenant` |
| `cleanup:roles` | `cleanup:roles` |
| `cleanup:three` | **refused in production** — name the tenants instead |
| `cleanup:perf` | development only; its own guard refuses production |

---

## ⚠️ Clearing the whole production database

```bash
# PREVIEW — the phrases are still required, and nothing is deleted
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup -- --target=database --database=inventoryai_prod_db --dry-run

# EXECUTE — only when you mean it
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup -- --target=database --database=inventoryai_prod_db
```

- It empties **every** collection, including `users` and `businesses`. Structure, collections and indexes
  survive; documents do not.
- It does **not** touch Firebase, so every account in this database is left stranded: the app can no longer
  find their user row, and the login can neither sign in nor register again. Delete the identities
  afterwards, or leave them and register again only after the rows are gone everywhere.
- Prefer a tenant-scoped cleanup below unless the whole database is really what you mean.

---

## Emptying the accounts you name

`cleanup:account` removes the **seeded data** of the accounts you name and keeps everything that makes them
accounts: the login, the business row, its members and their sessions.

```bash
# PREVIEW — per account, per collection; the tenant comes from each address
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:account -- --database=inventoryai_prod_db --dry-run \
    --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"

# EXECUTE — the same command, with --dry-run removed
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:account -- --database=inventoryai_prod_db \
    --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

- **Production resolves every tenant:** `--accounts="address,…"`. The run reads the account's own user
  row, requires that account to be the tenant's **OWNER**, and refuses a missing tenant or a second
  association before deleting anything. The older `address:<businessId>` form is still accepted, and a
  supplied id must equal that row's tenant — an id is checked, never trusted.
- The preview counts through the **same** plan the deletion executes, per collection and per account, and
  deletes nothing.
- A real run re-counts every tenant afterwards and prints `0 remaining`; anything left **fails** the run
  rather than being reported as done.
- An address with no account in this database is **refused before any delete** — a named account that does
  not exist cannot return `SUCCESS` for a tenant the run never found.
- Add `--witness="<an account outside the plan>"` to either line for a read-only proof that another tenant
  was untouched. The witness must exist and must not share a business with any account being emptied. Its
  data counts, login row, business row, role, status and Firebase linkage are captured before the run and
  compared after it; any difference **fails** the run. The witness is never modified or deleted.
- It never deletes a user row, a business row, a session or a Firebase identity.

---

## Emptying one tenant, keeping its login (`cleanup:demo`)

```bash
# PREVIEW — both identifiers must agree; nothing is deleted
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:demo -- --database=inventoryai_prod_db \
    --email=jefferndullamalinaozxc@gmail.com \
    --business=6ae15d1b6f2be6b817771e97 --dry-run

# EXECUTE — the same command, with --dry-run removed
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:demo -- --database=inventoryai_prod_db \
    --email=jefferndullamalinaozxc@gmail.com \
    --business=6ae15d1b6f2be6b817771e97
```

Both identifiers are required and must **agree** — the email and the business id are two fingerprints of
the same tenant. The id above is the one `check:accounts --with-production` prints for that account; a
stale id is refused. A real run re-reads afterwards and prints `verification found 0 remaining`.

Measured on production 2026-10-25: **80 006 documents removed** (36 104 inventory, 23 966 movements, 18 000
products, 1 600 purchase orders, 300 suppliers, 24 categories, 6 locations, 4 assistant messages, 1
conversation, 1 audit row), 0 remaining — and the login and business row still signed in.

---

## The measurement tenant (`cleanup:perf-tenant`)

```bash
# PREVIEW — how many rows would go, and nothing deleted
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:perf-tenant -- --database=inventoryai_prod_db --dry-run

# EXECUTE — the same line without --dry-run
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:perf-tenant -- --database=inventoryai_prod_db
```

`cleanup:perf-tenant` removes the tenant `seed:perf-tenant` created ([Guide 10](10-seeding-production.md))
and keeps its Firebase identity, so the address stays usable.

## The fixed demo tenant (`cleanup:demo-tenant`)

Deletes the demo tenant's inventory, ledger, products, categories, locations, suppliers, assistant rows,
audit trail, its users and the business row. It keeps the Firebase identity, deliberately.

```bash
# PREVIEW — counts every collection, deletes nothing
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:demo-tenant -- --database=inventoryai_prod_db --dry-run

# EXECUTE — the same command, with --dry-run removed
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:demo-tenant -- --database=inventoryai_prod_db
```

## The role fixture (`cleanup:roles`)

Deletes the role-fixture tenant, its four users and their sessions, and keeps the four Firebase identities
unless `--delete-firebase` is supplied. That flag deletes them only **after** the database rows are gone,
and never before.

```bash
# PREVIEW — counts the rows, never touches Firebase, even with --delete-firebase
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:roles -- --database=inventoryai_prod_db --dry-run

# EXECUTE — the same command, with --dry-run removed; identities kept
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:roles -- --database=inventoryai_prod_db

# EXECUTE including the four identities — only after the rows are gone
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:roles -- --database=inventoryai_prod_db --delete-firebase
```

---

## The space a delete does not give back

A cleanup removes documents, not the space their **indexes** were allocated. Measured 2026-10-27 on the
512 MB Atlas M0 cluster: after removing 755 555 documents the counted figure fell only from 337 MB to
214 MB, and those 214 MB were three *empty* collections' index allocation — `inventory` 94.8 MB,
`inventory_transactions` 77.3 MB, `products` 39.9 MB. Atlas counts **data plus indexes**, so that residue is
why a re-seed can still be refused as too large.

**The cleanup is still complete** — every document is gone and the run printed `0 remaining`; only the
allocation stays. To reclaim it, rebuild those three indexes on the empty collections and prove the
declaration came back:

- drop them, then rebuild from the models' own declarations (`dropIndexes()` followed by `syncIndexes()` on
  `Product`, `Inventory` and `InventoryTransaction`, against the database being reclaimed) — measured
  effect: 39.8 / 94.6 / 77.3 MB → 7.2 / 13.2 / 9.2 MB;
- `npm run audit:indexes` — expect `0 disagreements`, `every declared index matches the database`.

The declaration is the source of truth, so a rebuild cannot invent or lose an index; that check is what
proves it. Do it before a large re-seed, not after the cluster refuses the write. Measured 2026-10-27, the
same reclaim took the cluster from 226.5 MB to **44.9 MB**, which is what made the full production re-seed
fit.

---

## Proving it worked

| After | Run | Expect |
|---|---|---|
| a tenant cleanup | the command again with `--dry-run` | every collection at 0, or `nothing to clean` |
| a tenant cleanup | `verify:demo` with the production environment, `--email=…` for one tenant or `--accounts="…"` for several | `FAILED — the tenant is empty` (exit 1) is the proof the data is gone; exit 2 if the rows are gone too |
| an accounts cleanup | `npm run check:accounts -- --with-production` | the accounts are still `READY`, with 0 documents a seed would reset |
| a database wipe | `npm run seed -- … --dry-run` | a clean target; the app shows an empty business |
| firebase deletion | the `--target=firebase` line with `--dry-run` | `no identity` for each address ([Guide 13](13-firebase-identities.md)) |

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

Use `--email=…` instead when only one tenant was emptied. With `--accounts`, each empty tenant is reported
separately and the run exits **1**; that is the intended proof, not a failure of the delete. A tenant that
cannot be read is reported as unchecked: if nothing else failed, the run exits **2** and the deletion is not
verified; an empty tenant already makes the exit **1**.

Cleanups prove themselves: each real run re-queries the same plan and prints `0 remaining`. Nothing here
needs a phrase to check, because reading changes nothing. An empty tenant is not a verification pass:
`verify:demo` exists to check a seeded dataset, so it reports that state as a failure (exit 1). Read it
as the deletion's proof, not as a data defect.

That covers the tenants you emptied. Isolation itself is structural — every plan is scoped by the
`businessId` resolved from the named account — and `--witness="<address>"` adds a cross-tenant measurement:
the witness's counts and account rows are read before and after the delete, and any difference fails the
run. It must be a tenant outside the plan (and not a second member of a planned business). If you omit the
flag, the same proof can be recorded by hand:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run check:accounts -- --with-production --accounts="witness@example.com"
```

Expect the same `READY` line and the same products/documents count both times. Replace the example address
with a tenant that is not in the cleanup plan.

---

## When it refuses

| Message | Do |
|---|---|
| `three confirmation phrase(s) … CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` | add the third phrase; the message lists every one it needs |
| `the cleanup:three preset … is refused in production` | name every account with `--accounts="address,…"` |
| `no business exists for … and a production run will not create one` | the address has no tenant here; check the address, or the database |
| `… requires the OWNER` | the account is a member, not the owner; empty the owner's tenant instead |
| `… is linked to 2 businesses …` | fix the association deliberately; nothing was deleted |
| `belongs to business …, not …` | a supplied id is not that account's tenant; omit it, or use the row's own |
| `--database is "…" but this process resolved "…"` | set `MONGODB_DB_NAME` to match; do not retype the flag |
| `MONGODB_URI names the database "…"` | the URI points the shell at another database; fix it before retrying |
| `is the test database … "npm test" owns` | name production or development |
| `no such tenant` / `nothing to clean` | the fixture is not in this database — check `--database=` first |
| `verification failed: N document(s) still reference the fixture tenant` | the delete was partial; re-run and read the collections named |
| `still have a MongoDB user` | clear the database first, then the login ([Guide 13](13-firebase-identities.md)) |

---

← [Guides index](README.md) · Related: [10. Seeding data — production](10-seeding-production.md) ·
[11. Deleting data — development](11-deleting-development.md) ·
[9. Seeding data — development](9-seeding-development.md) ·
[13. Firebase identities](13-firebase-identities.md) · [4. Test accounts](4-test-accounts-and-mock-data.md) ·
[6. Everything else](6-scripts-and-commands.md)
