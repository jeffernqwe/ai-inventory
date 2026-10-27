# 10. Deleting data

Everything about removing data from MongoDB: the commands, which database they act on, the
confirmation phrases, what is verified afterwards, and the order that keeps accounts usable. Seeding
is [Guide 9](9-seeding-data.md); deleting Firebase logins is [Guide 11](11-firebase-identities.md).

Run everything from `server/`.

---

## Which command?

| You want | Command |
|---|---|
| Every document in a database | `npm run cleanup -- --target=database --database=<name>` |
| The three comparison accounts' data | `npm run cleanup:three -- --database=<name>` |
| The data of accounts you name | `npm run cleanup:account -- --database=<name> --accounts="a@x.com,b@y.com"` |
| One tenant's data, keeping its login | `npm run cleanup:demo -- --database=<name> --email=… --business=…` |
| The measurement tenant removed | `npm run cleanup:perf-tenant -- --database=<name>` |
| The fixed-figure demo tenant removed | `npm run cleanup:demo-tenant -- --database=<name>` |
| The role fixture removed | `npm run cleanup:roles -- --database=<name>` |
| The no-login measurement tenant removed | `npm run cleanup:perf` |
| A Firebase login removed | [Guide 11](11-firebase-identities.md) |

The first is the dispatcher; the rest are one tenant each. **Every one of them needs the destination
named and the phrases supplied, and every one has a `--dry-run`** — including `cleanup:perf`, which
cannot reach production at all.

---

## The one command

```bash
npm run cleanup -- --target=<database|firebase> --database=<name> [options]
```

| Target | Deletes | Keeps |
|---|---|---|
| `database` | every document in that database | the database, its collections and indexes |
| `firebase` | **only** the logins you name with `--email=` | every other login, and MongoDB ([Guide 11](11-firebase-identities.md)) |

`--target` is required: there is no default, so a forgotten flag cannot pick one for you.

`cleanup:test-mongodb`, `cleanup:dev-mongodb`, `cleanup:prod-mongodb`, `cleanup:all-mongodb` and
`cleanup:firebase-accounts` no longer exist — each was this command with the target baked in, so
`npm run` on those names now fails with "missing script". Use the form above.

---

## Choosing the database

The database comes from **`MONGODB_DB_NAME`**, and it must be named again on the command line:

```bash
--database=<name>          # must equal what MONGODB_DB_NAME resolves
```

If the two disagree, the run refuses **before connecting**. Only two databases can be cleaned:
`inventoryai_dev_db` and `inventoryai_prod_db`. The test database is refused because `npm test` owns it.

The connection string must agree as well. If `MONGODB_URI` names a database in its path — for example
`…/inventoryai_prod_db` — and that is not the resolved one, the run refuses. This is the case where the
flag, the phrases and the resolved name all agree and the shell is still wrong: it was configured for
the other environment. Nothing is deleted, and the message never echoes the URI.

Production can only be selected with **both** of these, which `config/env.ts` enforces:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db
```

---

## The phrases: two in development, three in production

| Target database | Required |
|---|---|
| Development | `CLEANUP_CONFIRM=<the command's phrase>` and `CLEANUP_DB_CONFIRM=inventoryai_dev_db` |
| Production | both of the above, plus `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` |

Each phrase answers a different question — *which command*, *where*, *is this real* — so one habitual
export cannot reach production. A refusal names **every** missing phrase and says how many that target
needs.

The phrase is the command's own name:

| Command | `CLEANUP_CONFIRM` |
|---|---|
| `cleanup -- --target=database` | `cleanup:database` |
| `cleanup -- --target=firebase` | `cleanup:firebase` |
| `cleanup:demo` | `cleanup:demo-account` |
| `cleanup:perf-tenant` | `cleanup:perf-tenant` |
| `cleanup:demo-tenant` | `cleanup:demo-tenant` |
| `cleanup:roles` | `cleanup:roles` |
| `cleanup:three` | `cleanup-three-accounts` |
| `cleanup:account` | `cleanup-account-data` |
| `cleanup:test-firebase` | `cleanup:test-firebase` ([Guide 11](11-firebase-identities.md)) |

A phrase that belongs to a different command is refused, so `CLEANUP_CONFIRM=cleanup:database` cannot
run `--target=firebase`.

`cleanup:test-firebase` is the exception to the table above: it takes no `--database=` and no
`CLEANUP_DB_CONFIRM`. It is guarded by a development-only shell and the exact Firebase project id
instead — [Guide 11](11-firebase-identities.md).

---

## Clearing a whole database

```bash
# development: look first, then delete
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db --dry-run
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db

# production: three phrases, and only when you mean it
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup -- --target=database --database=inventoryai_prod_db
```

- `--dry-run` counts every collection it would empty and stops. It still requires the phrases,
  because a dry run is there to prove the destination rather than to skip it.
- The preview and the real run share **one** collection list and one counting function, so the numbers
  cannot drift apart.
- `--yes` is accepted and does nothing — there is no interactive prompt any more.
- Structure, collections and indexes survive; documents do not. Clearing far more than you expect is
  what the dry run is for.

**Clearing a database deletes its `users` rows too.** That is why a fresh start is always *database
first, logins second*: once the rows are gone, no login is left stranded.

---

## Emptying one tenant, keeping its login

`cleanup:demo` removes one named tenant's data — inventory, movements, products, categories,
locations, suppliers, purchase orders, audit rows, invitations and assistant conversations — and
leaves the user, the business row and sessions in place. It never deletes an identity.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:demo -- --database=inventoryai_prod_db \
  --email=YOUR_EMAIL --business=THE_BUSINESS_ID --dry-run
```

Both identifiers are required and must **agree** — the email and the business id are two fingerprints
of the same tenant. Drop `--dry-run` to delete. A real run re-reads afterwards and prints
`verification found 0 remaining`.

Measured on production 2026-10-25: 80 006 documents removed (36 104 inventory, 23 966 movements,
18 000 products, 1 600 purchase orders, 300 suppliers, 24 categories, 6 locations, 4 assistant
messages, 1 conversation, 1 audit row), 0 remaining; the login and business row still signed in.

---

---

## Emptying the accounts you name

`cleanup:three` and `cleanup:account` remove the seeded inventory data of accounts **by address** — the
other half of `seed:three` and `seed:accounts` — and keep everything that makes them accounts: the
login, the business row, its members and their sessions.

```bash
# the three comparison accounts: preview, then the same line without --dry-run
CLEANUP_CONFIRM=cleanup-three-accounts CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup:three -- --database=inventoryai_dev_db --dry-run

# accounts you name
CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup:account -- --database=inventoryai_dev_db \
    --accounts="a@x.com,b@y.com" --dry-run
```

- **Production names every tenant:** `--accounts="address:<businessId>,…"`, and the id must be the
  tenant that account actually owns. The preset is refused there, exactly as the seeder's is. The id
  is the one `npm run check:accounts --with-production` prints.
- The preview counts through the **same** plan the deletion executes, per collection and per account,
  and deletes nothing.
- A real run re-counts every tenant afterwards and prints `0 remaining`; anything left **fails** the run
  rather than being reported as done.
- An address with no account in that database is reported as `nothing to delete` and skipped. That is an
  answer rather than a failure, and the run still exits 0.
- It never deletes a user row, a business row, a session or a Firebase identity. Removing a login is a
  separate, deliberate operation — database first, then `--target=firebase` — which refuses while any
  row still owns the address ([Guide 11](11-firebase-identities.md)).

---

## The tenant-scoped cleanups

All of them follow the same rule: `--database=` required, **two phrases in development, three in
production**, and a `--dry-run` that counts the same teardown plan as the real run.

| Command | Removes | Keeps |
|---|---|---|
| `cleanup:demo` | one tenant's data (`--email=`, `--business=`) | user, business row, sessions, login |
| `cleanup:three` | the three comparison accounts' data (preset; development only) | their logins, business rows and identities |
| `cleanup:account` | the data of the accounts in `--accounts=` | same |
| `cleanup:perf-tenant` | the `seed:perf-tenant` tenant | the Firebase identity |
| `cleanup:demo-tenant` | the `seed:demo-tenant` fixture | the Firebase identity |
| `cleanup:roles` | the role fixture tenant | its four identities unless `--delete-firebase` |
| `cleanup:perf` | the no-login `seed:perf` tenant (`--dry-run`; development only, its own `SEED_CONFIRM=seed-perf-ai`) | — |

```bash
# the sign-in-able tenant: preview the count first
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:perf-tenant -- --database=inventoryai_prod_db --dry-run

# the fixtures use the same rule, with their own first phrase
CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup:demo-tenant -- --database=inventoryai_dev_db --dry-run

CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup:roles -- --database=inventoryai_dev_db --dry-run
```

`--dry-run` walks the same teardown plan as the real run, lists every collection it would delete and
stops. Drop `--dry-run` to delete; a real run then re-counts to `0 remaining` over that same plan, and
**fails** if anything still references the tenant. A command that deletes rows without proving that is
how a "temporary" tenant survives forever.

`cleanup:perf --dry-run` counts that tenant over the same plan and deletes nothing; without the flag
it removes the rows and proves `0 remaining`. It says `nothing to clean` when nothing was ever seeded,
and exits 0 either way. `cleanup:roles --delete-firebase` removes the four identities **only after** the
database rows are gone, and only after re-querying that no user row still uses the addresses.

---

## Order: database first, identities second

A Firebase identity whose MongoDB user row survives is the one unrecoverable state in this project:
the address can neither sign in nor register, and nothing in the app repairs it. So:

1. Delete the MongoDB rows — a tenant-scoped cleanup, or `--target=database`.
2. Then delete the identities — `--target=firebase` ([Guide 11](11-firebase-identities.md)).

The second command refuses when step 1 has not happened, so the order is a check rather than a
convention. `cleanup:perf-tenant`, `cleanup:demo-tenant` and `cleanup:roles` keep the identities by
default for the same reason.

---

## The space a delete does not give back

A cleanup removes documents, not the space their **indexes** were allocated. Measured 2026-10-27 on
the 512 MB Atlas M0 cluster: after removing 755,555 documents the counted figure fell only from
337 MB to 214 MB, and those 214 MB were three *empty* collections' index allocation — `inventory`
94.8 MB, `inventory_transactions` 77.3 MB, `products` 39.9 MB. Atlas counts **data plus indexes**, so
that residue is why a re-seed can still be refused as too large.

**The cleanup is still complete** — every document is gone and the run printed `0 remaining`; only the
allocation stays. To reclaim it, rebuild those three indexes on the empty collections and prove the
declaration came back:

- drop them, then rebuild from the models' own declarations (`dropIndexes()` followed by
  `syncIndexes()` on `Product`, `Inventory` and `InventoryTransaction`, against the database being
  reclaimed) — measured effect: 39.8 / 94.6 / 77.3 MB → 7.2 / 13.2 / 9.2 MB;
- `npm run audit:indexes` — expect `0 disagreements`, `every declared index matches the database`.

The declaration is the source of truth, so a rebuild cannot invent or lose an index; that check is
what proves it. Do it before a large re-seed, not after the cluster refuses the write.

---

## Proving it worked

| After | Run | Expect |
|---|---|---|
| a tenant cleanup | the command again with `--dry-run` | every collection at 0, or `nothing to clean` |
| a tenant cleanup | `npm run verify:demo -- --email=… --database=…` | exit 0, or `no such account` if the rows are gone |
| an accounts cleanup | `npm run check:accounts --with-production` | the accounts are still `READY`, with 0 documents a seed would reset |
| a database wipe | `npm run seed -- … --dry-run` or a fresh seed | a clean target; the app shows an empty business |
| firebase deletion | the same `--target=firebase` line with `--dry-run` | `no identity` for each address |

Cleanups prove themselves: each real run re-queries the same plan and prints `0 remaining`. Nothing
here needs a phrase to check, because reading changes nothing.

---

## When it refuses

| Message | Do |
|---|---|
| `two confirmation phrase(s) are required` | set `CLEANUP_CONFIRM=<the command>` and `CLEANUP_DB_CONFIRM=<database>` |
| `three confirmation phrase(s) … CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` | add the third phrase |
| `--database is "…" but this process resolved "…"` | set `MONGODB_DB_NAME` to match; do not retype the flag |
| `MONGODB_URI names the database "…"` | the URI points the shell at another database; fix it before retrying |
| `is the test database … "npm test" owns` | name development or production |
| `CLEANUP_CONFIRM names "…", but this run is [cleanup:firebase]` | the phrase belongs to the other target; use the target's own phrase |
| `no such tenant` / `nothing to clean` | the fixture is not in that database — check `--database=` first |
| `--accounts="address[:businessId],…" is required` | a bare `cleanup:account` named nothing | add the list, or use `cleanup:three` |
| `must name its tenant in production` | a production run gave an address without its businessId | add `:businessId` (the one `check:accounts` prints) |
| `the cleanup:three preset … is refused in production` | a preset against real businesses | name every account with `--accounts=` |
| `belongs to business …, not …` | the id named is not the tenant that account owns | nothing was deleted; use the account's own id |
| `verification failed: N document(s) still reference the fixture tenant` | the delete was partial; re-run and read the collections named |
| `still have a MongoDB user` | clear the database first, then the login ([Guide 11](11-firebase-identities.md)) |

← [Guides index](README.md) · Related: [9. Seeding data](9-seeding-data.md) ·
[11. Firebase identities](11-firebase-identities.md) · [4. Test accounts](4-test-accounts-and-mock-data.md) ·
[6. Everything else](6-scripts-and-commands.md)
