# Cleanup utilities (development / test / production)

**Destructive** commands that clear data so you do not need an agent to do it.
Each targets an explicitly named database and refuses to run anywhere else. They
never drop a database, collection or index — only documents are removed.

> **These delete data.** MongoDB cleanup is for disposable databases only. The
> production commands are real and will delete production data — read the
> confirmation rules below before running them.

## Commands

```bash
# MongoDB — clear ALL documents in one approved database
npm run cleanup:test-mongodb      # inventoryai_test_db
npm run cleanup:dev-mongodb       # inventoryai_dev_db
npm run cleanup:prod-mongodb      # inventoryai_prod_db  (extra confirmation)

# MongoDB — clear ALL THREE, in order test → dev → prod
npm run cleanup:all-mongodb       # extra confirmation required

# Firebase Auth — delete ALL users in the approved project
npm run cleanup:test-firebase
```

The MongoDB target is chosen **by the command**, never by `MONGODB_DB_NAME`, and
every name is checked against a hard-coded allowlist.

Each command prints its target(s) and asks you to type the command name to confirm:

```bash
npm run cleanup:dev-mongodb
# Type "cleanup:dev-mongodb" to delete all documents in the selected target(s):
```

For non-interactive shells, pass `--yes` **and** the phrase explicitly. `--yes`
skips only the interactive read — it does **not** skip any confirmation phrase:

```bash
CLEANUP_CONFIRM=cleanup:dev-mongodb npm run cleanup:dev-mongodb -- --yes

# Production, or anything including it, ALSO needs the production phrase:
CLEANUP_CONFIRM=cleanup:prod-mongodb CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:prod-mongodb -- --yes

CLEANUP_CONFIRM=cleanup:all-mongodb CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup:all-mongodb -- --yes
```

## What each MongoDB command does

| Command | Target | Deletes | Preserves |
|---|---|---|---|
| `cleanup:test-mongodb` | `inventoryai_test_db` | every document in every collection | database, collections, indexes |
| `cleanup:dev-mongodb` | `inventoryai_dev_db` | same | same |
| `cleanup:prod-mongodb` | `inventoryai_prod_db` | same | same |
| `cleanup:all-mongodb` | all three, in order | same, on each | same, on each |

Each reports the target and document counts before / deleted / after, then
collection count and indexes, and exits non-zero if any collection is still
non-empty or any index is missing.

## `cleanup:test-firebase`

| | |
|---|---|
| **Deletes** | every Firebase Authentication user in the approved project |
| **Preserves** | nothing — users are removed. It never creates a user |
| **Target** | Firebase project `inventoryai-d0d20` |
| **Never touches** | MongoDB (no connection is opened) |
| **Never does** | create a user, send email, call registration/exchange |

## Safety guards (fail-closed)

Every guard runs **before** anything is deleted, and the command exits non-zero
when any of them cannot be satisfied. When in doubt, it stops.

1. **Explicit allowlist** — the only databases ever touched are
   `inventoryai_test_db`, `inventoryai_dev_db`, `inventoryai_prod_db`. The target
   is selected by the command (`test`/`dev`/`prod`/`all`); it is **never** derived
   from `MONGODB_DB_NAME` or any other environment value.
2. **Environment** — a non-production target requires `NODE_ENV` to be explicitly
   non-production. The **production** target instead requires the production
   confirmation phrase (below), because it is the one command allowed to run in
   production.
3. **Live connection** — the live connection's database name must equal the
   requested target exactly. A mismatch, or a blank name, refuses.
4. **Command phrase** — the command-name phrase must match exactly.
5. **Production phrase** — `cleanup:prod-mongodb` and `cleanup:all-mongodb`
   additionally require `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA`.
6. **Firebase project** — the project id must be present, match the approved
   project exactly, and not look production-flavoured.

No destructive call happens when a guard fails. This is proven by
`server/test/phase-cleanup-test-utilities.test.mjs`, which drives the whole
guarded sequence against in-memory fake ports — including the allowlist, the
production/all confirmation requirements, `--yes` without a phrase, and the
post-cleanup verification.

## Files

| File | Role |
|---|---|
| `lib.mjs` | pure, testable guards, the allowlist and the safety error types |
| `run.mjs` | guarded cleanup sequences (injectable ports) |
| `../cleanup-mongodb.mjs` | MongoDB CLI (target selector, I/O + prompt) |
| `../cleanup-test-firebase.mjs` | Firebase CLI (I/O + prompt) |

These utilities never print credentials — only counts, database/project names
(which are non-secret), and environment names.
