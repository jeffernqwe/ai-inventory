# 10. Deleting data

One command removes data. Development and production use the **same command**; only the database
changes, and production costs one more confirmation phrase. This is the mirror of
[Guide 9](9-seeding-data.md), and it follows the same rules.

Run everything from `server/`.

---

## The one command

```bash
npm run cleanup -- --target=<database|firebase> --database=<name> [options]
```

| Target | Deletes | Keeps |
|---|---|---|
| `database` | every document in that database | the database, its collections and indexes |
| `firebase` | **only** the logins you name with `--email=` | every other login, and MongoDB |

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
| Development | `CLEANUP_CONFIRM=<cleanup:database\|cleanup:firebase>` and `CLEANUP_DB_CONFIRM=inventoryai_dev_db` |
| Production | both of the above, plus `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` |

Each phrase answers a different question — *which command*, *where*, *is this real* — so one
habitual export cannot reach production. A refusal names **every** missing phrase and says how many
that target needs.

```bash
# development: look first, then delete
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db --dry-run
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db

# production: three phrases
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup -- --target=database --database=inventoryai_prod_db
```

`--dry-run` counts what would be deleted and stops. It still requires the phrases, because a dry run
is there to prove the destination rather than to skip it. `--yes` is accepted and does nothing —
there is no interactive prompt any more.

**Clearing a database deletes its `users` rows too.** That is why a fresh start is always
*database first, logins second*: once the rows are gone, no login is left stranded.

---

## Deleting a login

```bash
CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=firebase --database=inventoryai_dev_db \
  --email=person@example.com --dry-run
```

`--email=` repeats (or takes a comma-separated list). The command prints one verdict per address:

| Verdict | Meaning |
|---|---|
| `will delete` | an identity exists and nothing references the address |
| `REFUSED — still linked to a MongoDB user` | a user row still owns it; the whole run stops |
| `ORPHANED — identity already gone, database row remains` | the damage is already done; the row must go first |
| `no identity` | nothing to delete |

**It checks both databases.** One Firebase project serves development and production, so the same
address can be referenced twice. Both are counted, by `firebaseUid` **and** by the address, and a
refusal names the database(s) still holding it. Deleting a login whose row survives leaves an address
that can neither sign in nor register, and nothing in the app can repair it — that is the outcome the
check exists to prevent.

---

## What is not replaced

The tenant-scoped cleanups delete one named tenant rather than a database. `cleanup:demo`,
`cleanup:perf-tenant`, `cleanup:demo-tenant` and `cleanup:roles` follow the same phrase rule as the
command above: **two phrases in development, three in production**, plus `--database=`. `cleanup:perf`
is development-only, and `cleanup:test-firebase` is a test helper rather than a production tool.

| Command | Removes |
|---|---|
| `cleanup:demo` | one tenant's data, keeping its login (`--dry-run`, `--database=`; 2 phrases dev / 3 prod) |
| `cleanup:perf-tenant` | the sign-in-able measurement tenant (`--dry-run`, `--database=`; 2 phrases dev / 3 prod); proves `0 remaining` and keeps the Firebase identity |
| `cleanup:demo-tenant` | the `seed:demo-tenant` fixture (`--dry-run`, `--database=`; 2 phrases dev / 3 prod); proves `0 remaining` and keeps the Firebase identity |
| `cleanup:roles` | the role fixture (`--dry-run`, `--database=`; 2 phrases dev / 3 prod); keeps its four identities unless `--delete-firebase` |
| `cleanup:perf` | the data-only measurement tenant (development only, its own phrase); proves `0 remaining` |
| `cleanup:test-firebase` | every login in the approved project — test helper, not a production tool |

```bash
# the sign-in-able tenant: preview the count first
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:perf-tenant -- --database=inventoryai_prod_db --dry-run

# the fixtures use the same rule, with their own first phrase; dry-run first
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:demo-tenant -- --database=inventoryai_prod_db --dry-run

NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:roles -- --database=inventoryai_prod_db --dry-run
```

`--dry-run` walks the same teardown plan as the real run, counts every collection it would delete
and stops. It costs the same phrases as the real run, because it proves the destination rather than
skipping it. Drop `--dry-run` to delete; a real run then re-counts to `0 remaining` over that same
plan.

---

## When it refuses

| Message | Do |
|---|---|
| `two confirmation phrase(s) are required` | set `CLEANUP_CONFIRM=cleanup:<target>` and `CLEANUP_DB_CONFIRM=<database>` |
| `three confirmation phrase(s) … CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` | add the third phrase |
| `--database is "…" but this process resolved "…"` | set `MONGODB_DB_NAME` to match; do not retype the flag |
| `MONGODB_URI names the database "…"` | the URI points the shell at another database; fix it before retrying |
| `is the test database … "npm test" owns` | name development or production |
| `still have a MongoDB user` | clear the database first, then the login |
| `NO Firebase identity … a MongoDB user still owns the address` | clear the database first; Firebase cannot fix it |

Full command reference: [Guide 6, Part 6](6-scripts-and-commands.md). Seeding: [Guide 9](9-seeding-data.md).
