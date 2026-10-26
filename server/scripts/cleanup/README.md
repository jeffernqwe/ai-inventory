# Cleanup — one command, two targets, same rule as seeding

**Destructive.** These commands remove data so you do not need an agent to do it.
They follow the same shape as `npm run seed`: one command, the target named on the
command line, and **two confirmation phrases in development, three in production**.
They never drop a database, a collection or an index — only documents are removed,
so the next start (or the next seed) finds the schema it expects.

```bash
npm run cleanup -- --target=<database|firebase> --database=<name> [options]
```

| `--target` | Deletes | Never touches |
|---|---|---|
| `database` | every document in the named database | the database, collections, indexes |
| `firebase` | **only** the Firebase identities you name with `--email=` | every other identity, and MongoDB |

`--database=` is **required** and must equal the database this shell resolves from
`MONGODB_DB_NAME`. Only `inventoryai_dev_db` and `inventoryai_prod_db` are accepted;
the test database belongs to `npm test`. The connection uses the resolved value,
never the flag, so a typo cannot redirect the delete.

## Phrases: two in development, three in production

| Target database | Required |
|---|---|
| Development | `CLEANUP_CONFIRM=<cleanup:database\|cleanup:firebase>` and `CLEANUP_DB_CONFIRM=inventoryai_dev_db` |
| Production | both of the above, plus `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` |

They answer *which command*, *where*, and *is this real*, so one habitual export
cannot reach production. A refusal lists **every** missing phrase and states how
many the target needs.

```bash
# development — look first, then delete
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db --dry-run
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db

# production
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup -- --target=database --database=inventoryai_prod_db
```

`--dry-run` counts what would be deleted and stops. It still requires the phrases,
because a dry run is there to prove the destination. `--yes` is accepted and does
nothing — there is no interactive prompt any more, only the phrases.

## Firebase identities

```bash
CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=firebase --database=inventoryai_dev_db \
  --email=person@example.com --dry-run
```

`--email=` is repeatable and comma-separated. `--dry-run` prints the plan and
deletes nothing.

**The link check reads both databases.** There is one Firebase project, so an
address is one identity, but user rows in development *and* production can
reference it. Both are counted by `firebaseUid` **and** by `email`, and a refusal
names the database(s) that still hold the address. A uid-only check is not enough:
a deleted-and-recreated identity leaves a stale uid behind on the old row.

**Order matters — clear the database first, then the identities.** A MongoDB user
whose identity is gone can neither sign in nor register (`409 EMAIL_IN_USE`), and
nothing in the application can repair it. So the Firebase command refuses while any
MongoDB user still references the address, and it refuses the whole run rather than
part of it.

## `cleanup:test-firebase` (test project only)

Deletes **every** Firebase identity in the approved project. It is the test-helper
counterpart, not a production tool: it refuses unless `NODE_ENV` is explicitly
`development` and the project is exactly `inventoryai-d0d20`. It never opens a
MongoDB connection.

## Guards (fail-closed, all before anything is deleted)

1. **Target** — `--target=database|firebase` must be one of the two; there is no
   default.
2. **Named database** — `--database` must equal the resolved database, must be
   development or production, and the test database is refused by name.
3. **Live connection** — the connection's database name must equal the requested
   one exactly; a mismatch, or a blank name, refuses.
4. **Phrases** — two in development, three in production, each checked exactly. A
   phrase that belongs to the other command is refused and named.
5. **Firebase project** — must be present, exactly `inventoryai-d0d20`, and must not
   look production-flavoured.
6. **Link check** — no address may still be referenced by a user row in either
   database.

No destructive call happens when a guard fails. Covered by
`server/test/cleanup-target-guard.test.mjs`, which drives the guarded sequence with
in-memory fake ports and proves a refused run never opens a connection and a dry run
never deletes.

## Files

| File | Role |
|---|---|
| `guard.mjs` | the pure rule: targets, phrase counts, `--database`, allowlist |
| `lib.mjs` | older guards still used by the test helpers, plus the safety error |
| `run.mjs` | guarded sequences with injectable ports (`performNamedDatabaseCleanup`) |
| `../cleanup.mjs` | the one entry point; dispatches on `--target` |
| `../cleanup-mongodb.mjs` | database engine (I/O, dry run, counts) |
| `../cleanup-firebase-accounts.mjs` | Firebase engine (link check, deletion) |
| `../cleanup-test-firebase.mjs` | test-project identity wipe |

These utilities never print credentials — only counts, database/project names
(which are non-secret), and environment names.
