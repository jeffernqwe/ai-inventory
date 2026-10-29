# 14. Command runbook — development and production

One page of **complete invocations** for seeding, verifying, cleaning up and backing up data in either
environment. This is a command sheet, not a second rule book: the rules live in
[Guide 9](9-seeding-development.md), [Guide 10](10-seeding-production.md),
[Guide 11](11-deleting-development.md), [Guide 12](12-deleting-production.md) and
[Guide 13](13-firebase-identities.md). If this sheet and one of those guides disagree, **the guide wins**
and this sheet is wrong.

Run every command from `server/`:

```bash
cd /c/Users/jeffe/inventory-ai/server
```

`server/.env` must hold a working `MONGODB_URI` and Firebase Admin credentials. No command below prints
those values.

The page is split into **[A. Production runbook](#a-production-runbook)** and
**[B. Development runbook](#b-development-runbook)**. The shared [backup and restore](#c-backup-and-restore),
[comparison](#d-development-versus-production) and [refusal](#e-when-a-command-refuses) sections follow.

**Status labels used here**

| Label | Means |
|---|---|
| **PROD-TESTED** | actually run against `inventoryai_prod_db` in the 2026-10-29 pass, with the result read back |
| **PROD PREVIEW ONLY** | the `--dry-run` was run against production; the execute form was not |
| **REFUSAL TESTED** | production was proved to refuse it; that is the expected result |
| **DEV-TESTED** | run against `inventoryai_dev_db` during the 2026-10-27…29 work (e.g. §27GD, §27GR), with the result read back |
| **DEV PREVIEW ONLY** | the `--dry-run` was run in development; the execute form was not |
| **NOT RUN** | syntax checked against the source, but not executed in either environment |

---

## The fixed values

| | Development | Production |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `MONGODB_DB_NAME` | `inventoryai_dev_db` | `inventoryai_prod_db` |
| `--database=` | `inventoryai_dev_db` | `inventoryai_prod_db` |

Every write names the database **twice**: once through `MONGODB_DB_NAME`, once through `--database=`.
The two must match, and a `MONGODB_URI` whose path names a different database is refused before the
connection opens. The development blocks below still name `NODE_ENV=development` explicitly: the commands
default to it, but a page that is copied from should not leave the environment implicit.

**The production accounts.** `check:accounts` prints the live tenant id; the ids below are the ones
measured on 2026-10-29. `seed:accounts` and `cleanup:account` resolve each address themselves and need no
id.

| Account | Tenant id (production) |
|---|---|
| `jefferndullamalinaozxc@gmail.com` | `6ae15d1b6f2be6b817771e97` |
| `jefferndullamalinao@gmail.com` | `6ae15dc16f2be6b817771e9c` |
| `jeffernmalinaoqwe@gmail.com` | `6ae15e926f2be6b817771ea2` |

Development has its own ids for the same addresses. `check:accounts` prints them, and no command below
needs one typed in: `seed:accounts` and `cleanup:account` resolve the address, and the fixture cleanups
find their own tenant.

**The fixture logins.** These are not the three accounts above. They belong to reserved test addresses and
must never be used for a real person.

| Fixture | Address |
|---|---|
| Demo tenant owner | `demo-preview@example.invalid` |
| Measurement tenant owner | `perf-seed-ai@example.invalid` |
| Role fixture | `role-owner@example.invalid`, `role-admin@example.invalid`, `role-manager@example.invalid`, `role-staff@example.invalid` |

The fixture passwords are **chosen by the operator and are not stored in this repository**. The commands
below use literal placeholders that work as-is; replace them with the values you choose, and use the same
value for the seed and the verification that follows it.

---

## The phrases

A **production** seeder costs three phrases — *what*, *where*, *is this real*:

```text
SEED_CONFIRM=<the command's own phrase>
SEED_DB_CONFIRM=inventoryai_prod_db
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA
```

A **development** seeder costs two — *what* and *where*:

```text
SEED_CONFIRM=<the command's own phrase>
SEED_DB_CONFIRM=inventoryai_dev_db
```

A production **cleanup** costs the same three, under its own names; a development cleanup costs two:

```text
CLEANUP_CONFIRM=<the command's own phrase>
CLEANUP_DB_CONFIRM=<the database named above>
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA   # production only
```

**The exceptions**, in both environments:

- `seed:demo-tenant` costs **one** phrase, `SEED_CONFIRM=seed-demo-tenant`. It does not use
  `SEED_DB_CONFIRM` or `SEED_PROD_CONFIRM`; adding them does not make it safer, and the command ignores
  them.
- `seed:perf` and `cleanup:perf` cost **one** phrase, `SEED_CONFIRM=seed-perf-ai`. They are development
  only, open no `--database=` of their own, and refuse production outright.

`--dry-run` checks the target and every phrase the command requires. It never skips a phrase.

---

## A. Production runbook

### A0. Read before writing

These change nothing. Both were **PROD-TESTED**.

**Which accounts exist, what they own, and how much data a seed would reset:**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run check:accounts -- --with-production
```

**Are the declared indexes actually built:**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run audit:indexes
```

`check:accounts` exits **0** all ready, **1** missing or mismatched, **2** could not check.
`audit:indexes` exits **0** all present, **1** a real disagreement, **2** could not look.

---

### A1. Seeding

#### A1.1 Seed all three accounts — 1 000 products each

**Writes.** Replaces the inventory dataset of all three tenants and keeps their logins, businesses and
identities. About 13 332 documents.

**PREVIEW — writes nothing**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db --dry-run \
  --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:1000,jeffernmalinaoqwe@gmail.com:1000"
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:1000,jeffernmalinaoqwe@gmail.com:1000"
```

**VERIFY — all three accounts in one read-only run**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:1000,jeffernmalinaoqwe@gmail.com:1000"
```

Each `address:products` entry asserts the seeded product count. The command resolves each
address to its own `businessId`, checks the counts, ledger arithmetic and references, and exits
**0** only when every account passes. One account failing makes the run exit **1**; if none failed
but one could not be checked, it exits **2**.

**Status:** **PROD-TESTED** on 2026-10-29 at the exact size above — 13 332 documents written in 43.3 s
(12.6 / 14.2 / 16.5 s per tenant). The three tenants each verified with 1 000 products, 4 444 documents,
1 829 ledger rows (0 bad, 0 negative), 0 missing references, 166 low and 58 out of stock. The
one-command `--accounts` form ran on 2026-10-29 and returned `SUCCESS — 3 account(s) verified`
(exit 0); the three tenants still hold that dataset, and no cleanup was run after the seed.

#### A1.2 Seed one account — 1 000 products

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db --dry-run \
  --accounts="jefferndullamalinaozxc@gmail.com:1000"
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000"
```

**VERIFY**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --email=jefferndullamalinaozxc@gmail.com --database=inventoryai_prod_db
```

#### A1.3 The four SKU/barcode modes

Each command **replaces** the first account's tenant. Run one, inspect, then run the next.

**PREVIEW — `codes=both`**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db --dry-run \
  --accounts="jefferndullamalinaozxc@gmail.com:1000:codes=both"
```

**EXECUTE — both SKU and barcode**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000:codes=both"
```

**EXECUTE — SKU only**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000:codes=sku"
```

**EXECUTE — barcode only**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000:codes=barcode"
```

**EXECUTE — neither**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:accounts -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000:codes=none"
```

**VERIFY the mode — read-only**

Add `--expect-codes=<mode>` to the verification, or put `:codes=<mode>` in its `--accounts` entry. The
mode must be the one the seed used:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000:codes=both"
```

Expected:

```text
Codes    : 1,000 both, 0 SKU only, 0 barcode only, 0 neither — both (expected both)
Barcodes : 1,000 present — 1,000 valid EAN-13, 0 invalid check digits, 0 duplicate values, 0 non-EAN-13
```

A mismatch exits **1** and names the mode and counts it found. Use `codes=sku`, `codes=barcode` or
`codes=none` for the other three. Without an expectation the line still prints, but no mode is asserted.
`Codes` counts non-empty fields, so it proves presence. `Barcodes` checks the values: a wrong EAN-13 check
digit or a duplicate value exits **1**; a non-EAN-13 manufacturer code is reported but does not fail on its
own. A `codes=none` tenant reads `0 present`.

**Status:** all four modes **PROD-TESTED** at 5/7 products. A seeded barcode is 13 digits, a valid EAN-13
check digit, unique inside the tenant, and in the in-store range beginning `2`. The **`Barcodes` line and
its failure path are new** (2026-10-30) and covered by the `DEMO-1`, `DEMO-3` and `DEMO-4` suites; they
have **not** been observed against production data. No production tenant has deliberately carried a wrong
check digit or a duplicate value; a `none` tenant prints `0 present` until the app assigns a code.

#### A1.4 `seed --plan=demo` — 1 000 documents

**Writes.** Replaces the first account's tenant data. Keeps the login and business.

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed -- --plan=demo --database=inventoryai_prod_db --dry-run \
  --email=jefferndullamalinaozxc@gmail.com \
  --business=6ae15d1b6f2be6b817771e97 --total=1000
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed -- --plan=demo --database=inventoryai_prod_db \
  --email=jefferndullamalinaozxc@gmail.com \
  --business=6ae15d1b6f2be6b817771e97 --total=1000
```

**VERIFY**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --email=jefferndullamalinaozxc@gmail.com --database=inventoryai_prod_db
```

**Status:** **PROD-TESTED** at 100 documents; the exact 1 000 total was not run. A missing or mismatched
`--business` is refused.

#### A1.5 `seed:demo` — the direct alias

Same operation and same phrases as `seed --plan=demo`.

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:demo -- --database=inventoryai_prod_db --dry-run \
  --email=jefferndullamalinaozxc@gmail.com \
  --business=6ae15d1b6f2be6b817771e97 --total=1000
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:demo -- --database=inventoryai_prod_db \
  --email=jefferndullamalinaozxc@gmail.com \
  --business=6ae15d1b6f2be6b817771e97 --total=1000
```

**Status:** **PROD-TESTED** at 100 documents.

#### A1.6 The fixed demo tenant — one phrase

**Writes.** Creates or refreshes 6 products, 3 locations, 9 ledger rows and the OWNER login. It never
deletes the Firebase identity.

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-demo-tenant \
npm run seed:demo-tenant -- --database=inventoryai_prod_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-demo-tenant \
npm run seed:demo-tenant -- --database=inventoryai_prod_db
```

**VERIFY**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --email=demo-preview@example.invalid --database=inventoryai_prod_db
```

**Status:** **PROD-TESTED** — 15/15 fixture checks. The identity already exists; do not add
`DEMO_ACCOUNT_PASSWORD` unless you mean to rotate that test login.

#### A1.7 An isolated measurement tenant — 1 000 documents

**Writes.** Creates its own tenant and OWNER login; nothing else is read or reset.

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
DEMO_ACCOUNT_PASSWORD='choose-a-strong-demo-password' \
SEED_CONFIRM=seed:perf-tenant SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=1000 --dry-run
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
DEMO_ACCOUNT_PASSWORD='choose-a-strong-demo-password' \
SEED_CONFIRM=seed:perf-tenant SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=1000
```

**VERIFY**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --email=perf-seed-ai@example.invalid --database=inventoryai_prod_db
```

**Status:** **PROD-TESTED** at 50 documents; the exact 1 000 was not run. The command prints its own
`businessId`; cleanup finds it by fingerprint.

#### A1.8 The role fixture — 900 documents and four logins

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
ROLE_TEST_PASSWORD='choose-a-strong-test-password' \
SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:roles -- --database=inventoryai_prod_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
ROLE_TEST_PASSWORD='choose-a-strong-test-password' \
SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:roles -- --database=inventoryai_prod_db
```

**Status:** **PROD-TESTED** — 900 documents, four identities, 96/96 authorization cells in §2.2.

#### A1.9 Refused in production

**`seed:three` — the three-account comparison preset.** It would reset three real businesses in one
command, so production refuses it. Expected exit **1**.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
SEED_CONFIRM=seed-three-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:three -- --database=inventoryai_prod_db
```

**`seed:perf` — the no-login measurement tenant.** Development only; its guard refuses production.
Expected exit **1**.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run seed:perf -- --size=1000
```

---

### A2. Verification

#### A2.1 `verify:demo` — read-only

One command verifies one account (`--email=`) or several
(`--accounts="address[:products][:codes=…],…"`). It exits **0** all verified, **1** a real disagreement
(an empty tenant is a disagreement, and so are an expected product count and an expected code mode that
do not match), **2** could not look. `--expect-products=<n>` sets the expected size for entries that omit
`:products`; `--expect-codes=both|none|sku|barcode` sets the expected mode for entries that omit
`:codes=`. An entry's own value wins.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:1000,jeffernmalinaoqwe@gmail.com:1000" --expect-codes=none
```

Each account's block carries a line such as:

```text
Codes    : 0 both, 0 SKU only, 0 barcode only, 1,000 neither — none (expected none)
Barcodes : 0 present — 0 valid EAN-13, 0 invalid check digits, 0 duplicate values, 0 non-EAN-13
```

The four counts are disjoint. A mode can be `both`, `sku`, `barcode`, `none`, `MIXED` or `empty`; only
the four seed modes can be named as an expectation — `MIXED` and `empty` are observed results, not valid
`--expect-codes` values. A mismatch exits **1**. Without `--expect-codes` or `:codes=`, the line still
prints but no mode is asserted. `Codes` counts non-empty fields, so it proves presence, not validity.

`Barcodes` checks the stored values behind the counts. A 13-digit value with the correct or a wrong mod-10
check digit is counted as `valid EAN-13` or `invalid check digit`; a value shared by more than one product
is a `duplicate value`; every other string is `non-EAN-13`. A wrong check digit or a duplicate exits **1**.
A non-EAN-13 manufacturer code is reported but does not fail on its own.

**Status:** **PROD-TESTED** on a seeded tenant, an empty tenant and a missing tenant; the
multi-account form is **PROD-TESTED** on 2026-10-29 against all three accounts (A1.1). The
`Codes` line and its mismatch path were **PROD-TESTED read-only** on 2026-10-30: all three
accounts read `none (expected none)` and the run exited **0**; the first account with
`--expect-codes=both` exited **1** naming `none, expected both` and the four counts. The four
modes themselves are covered by the `DEMO-3` database suite; no production tenant currently
carries codes, so the `both`/`sku`/`barcode` coverage lines were not measured against
production data in this pass. The **`Barcodes` line is new** (2026-10-30): its four counters, the
empty line and the check-digit failure are covered by `DEMO-1`, `DEMO-3` and the command-level
`DEMO-4`, but it has **not** been observed on a production tenant.

#### A2.2 `verify:roles` — all 96 cells, then clean up

This block seeds the role fixture, captures the generated tenant id, verifies the 96 authorization cells
against the deployed production API, then removes the fixture and its four identities. It has no
placeholder: the id is read from the seed's own output.

```bash
cd /c/Users/jeffe/inventory-ai/server
set -euo pipefail

FIREBASE_WEB_API_KEY="$(node --env-file=../mobile/.env \
  -e 'process.stdout.write(process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "")')"
test -n "$FIREBASE_WEB_API_KEY"

OUT="$(mktemp)"
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
ROLE_TEST_PASSWORD='choose-a-strong-test-password' \
SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_prod_db \
SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
npm run seed:roles -- --database=inventoryai_prod_db | tee "$OUT"

BIZ="$(sed -n 's/.*businessId : \([0-9a-f]\{24\}\).*/\1/p' "$OUT" | head -1)"
test -n "$BIZ"

NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
ROLE_TEST_PASSWORD='choose-a-strong-test-password' \
SEED_CONFIRM=seed-roles FIREBASE_WEB_API_KEY="$FIREBASE_WEB_API_KEY" \
npm run verify:roles -- --database=inventoryai_prod_db --business="$BIZ" \
  --base=https://ai-inventory-l1mi.onrender.com --signin

NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:roles -- --database=inventoryai_prod_db --delete-firebase

rm -f "$OUT"
```

**Status:** **PROD-TESTED** — 96/96 cells and 12/12 user-management checks. The `businessId` capture is a
shell wrapper; the commands underneath were run in production.

---

### A3. Cleanup

#### A3.1 Empty the three named accounts — keep every login

**Deletes.** Inventory, movements, products, purchase orders, categories, locations, suppliers, audit
rows, pending invitations, and assistant conversations and messages for the three tenants. Keeps users,
businesses, sessions and identities.

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:account -- --database=inventoryai_prod_db --dry-run \
  --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:account -- --database=inventoryai_prod_db \
  --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

A named address with no MongoDB user row is refused before any delete, so a typo cannot return
`SUCCESS` for an account the run never found.

**Witness (optional).** Add `--witness="<an account outside the plan>"` to either line to prove that a
tenant this run is not emptying was untouched. The witness must exist and must not share a business with
any account in `--accounts`; its data counts, login row, business row, role, status and Firebase linkage
are read before and after, and any difference fails the run. Because this command empties all three
accounts, use one of them as the witness only when the plan names a subset, or name a fourth account. The
witness is never modified or deleted.

**VERIFY — the command's own `0 remaining` check covers every tenant**

`cleanup:account` re-counts each tenant through the same data-only plan it just executed and exits
non-zero if anything remains. Its `0 remaining` line is the first proof.

Then confirm all three accounts still exist and hold no data:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run check:accounts -- --with-production \
  --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

Expected for each address: `READY`, `0 products / 0 documents`, and `Result : SUCCESS` (exit 0). This
proves the logins and businesses survived and all three tenants are empty.

`verify:demo` is a deep integrity check, not the deletion proof: on an empty tenant it exits **1** and
says the tenant is empty, by design.

**Status:** **PROD PREVIEW ONLY** at the current three-account size. A read-only `check:accounts` on
2026-10-29 found all three `READY` at 1 000 products / 4 444 documents each — 13 332 in total — and the
cleanup preview matched that total while deleting nothing. The execute form has been exercised only at
fixture scale (68 documents across two fixtures), not at this size, so the post-delete `check:accounts`
call above has not been exercised after a cleanup; the command's own post-delete check reports
`0 remaining` per tenant when it does run.

#### A3.2 Empty one tenant, keep its login

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:demo -- --database=inventoryai_prod_db \
  --email=jefferndullamalinaozxc@gmail.com \
  --business=6ae15d1b6f2be6b817771e97 --dry-run
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:demo -- --database=inventoryai_prod_db \
  --email=jefferndullamalinaozxc@gmail.com \
  --business=6ae15d1b6f2be6b817771e97
```

**Status:** **PROD-TESTED** — 100 documents, `0 remaining`, account kept.

#### A3.3 Remove the fixed demo tenant

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:demo-tenant -- --database=inventoryai_prod_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:demo-tenant -- --database=inventoryai_prod_db
```

**Does:** removes the demo tenant's data, user and business row; **keeps** `demo-preview@example.invalid`.
**Status:** **PROD-TESTED** — 29 documents, leftovers 0.

#### A3.4 Remove the measurement tenant

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:perf-tenant -- --database=inventoryai_prod_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:perf-tenant -- --database=inventoryai_prod_db
```

**Does:** removes the tenant, user and business row; **keeps** `perf-seed-ai@example.invalid` for §3.6.
**Status:** **PROD-TESTED** — 2 account rows, `0 remaining`.

#### A3.5 Remove the role fixture

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:roles -- --database=inventoryai_prod_db --dry-run
```

**EXECUTE — keep the four identities**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:roles -- --database=inventoryai_prod_db
```

**EXECUTE — delete the four identities too**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:roles -- --database=inventoryai_prod_db --delete-firebase
```

**Status:** **PROD-TESTED** — 914 documents, `0 remaining`, four identities deleted.

#### A3.6 Delete the measurement identity

Run this **after** §3.4. It refuses while a MongoDB user row still owns the address.

**PREVIEW**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup -- --target=firebase --database=inventoryai_prod_db \
  --email=perf-seed-ai@example.invalid --dry-run
```

**EXECUTE**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup -- --target=firebase --database=inventoryai_prod_db \
  --email=perf-seed-ai@example.invalid
```

**Status:** **PROD-TESTED** — 1 identity deleted; both databases checked for a remaining owner.

#### A3.7 The whole database — read the warning twice

**This removes every document in `inventoryai_prod_db`, including the `users` and `businesses` rows.** It
does **not** delete Firebase identities, so every login is left stranded: the app can no longer find its
user row, and the address can neither sign in nor register again. Prefer a tenant-scoped cleanup.

**PREVIEW — nothing is deleted**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup -- --target=database --database=inventoryai_prod_db --dry-run
```

**EXECUTE — only when the whole database is really what you mean**

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup -- --target=database --database=inventoryai_prod_db
```

**Status:** **PROD PREVIEW ONLY** — the preview counted 5 055 documents across 17 collections. The execute
form was not run.

#### A3.8 Refused in production

**`cleanup:three` — the three-account preset.** Expected exit **1**.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CLEANUP_CONFIRM=cleanup-three-accounts CLEANUP_DB_CONFIRM=inventoryai_prod_db \
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
npm run cleanup:three -- --database=inventoryai_prod_db
```

**`cleanup:perf` — the no-login measurement tenant.** Expected exit **1**.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run cleanup:perf -- --dry-run
```

**`cleanup:test-firebase` — every identity in the project.** The approved Firebase project is shared with
production, so this command is refused there. **Only the refusal below is shown.** The destructive form is
deliberately not printed in this runbook; [Guide 13](13-firebase-identities.md) owns the
test-project procedure.

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run cleanup:test-firebase -- --dry-run
```

**Status:** **REFUSAL TESTED** — all three commands refused in production, and none deleted anything.

---

## B. Development runbook

The same commands, **two phrases** instead of three. `NODE_ENV=development` is the default, but every block
names it: a page that is copied from should not leave the environment implicit. `MONGODB_DB_NAME` and
`--database=` must still agree, and a `MONGODB_URI` naming another database is still refused. These blocks
assume `server/.env` points at the development database; if it still names `inventoryai_prod_db`, the URI
guard refuses every one of them — that is the protection working, not a defect.

### B0. Read before writing

**Which accounts exist, what they own, and how much data a seed would reset** — **DEV-TESTED**:

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run check:accounts
```

Add `--accounts="address,…"` to ask about specific addresses only:

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run check:accounts -- --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

**Are the declared indexes actually built** — **DEV-TESTED**:

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run audit:indexes
```

`check:accounts` exits **0** all ready, **1** missing or mismatched, **2** could not check.
`audit:indexes` exits **0** all present, **1** a real disagreement, **2** could not look. Development is
the default, so `--with-production` must **not** be added here; that flag replaces the development database
with production for the run.

### B1. Seeding

Every seeder below has a `--dry-run`. The preview checks the target and both phrases and writes nothing;
the execute form is the same block without that flag.

#### B1.1 Seed the three accounts — 1 000 products each

**Writes.** Replaces the three tenants' inventory data and keeps their logins, businesses and identities.
**DEV-TESTED** at 1 000 products (§27GR).

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:accounts -- --database=inventoryai_dev_db --dry-run \
  --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:1000,jeffernmalinaoqwe@gmail.com:1000"
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:accounts -- --database=inventoryai_dev_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:1000,jeffernmalinaoqwe@gmail.com:1000"
```

**VERIFY — all three accounts in one read-only run**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run verify:demo -- --database=inventoryai_dev_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:1000,jeffernmalinaoqwe@gmail.com:1000"
```

A `MISSING` account has no user row in **this** database yet. `seed:accounts` creates the tenant for a
login that exists; a brand-new address needs `DEMO_ACCOUNT_PASSWORD` so the identity can be created. The
three addresses above already have identities; `check:accounts` is the answer for any other.

#### B1.2 `seed --plan=demo` — 1 000 documents

**Writes.** Replaces one account's tenant data. Keeps the login and business. **DEV-TESTED.**

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed -- --plan=demo --database=inventoryai_dev_db --dry-run \
  --email=jefferndullamalinaozxc@gmail.com --total=1000
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed -- --plan=demo --database=inventoryai_dev_db \
  --email=jefferndullamalinaozxc@gmail.com --total=1000
```

`seed:demo` is the direct alias and takes the same two phrases and the same `--email=`, optional
`--business=` (development resolves it from the address) and `--total=` flags. `--total` is **documents**,
range 100–400 000.

#### B1.3 The fixed demo tenant — one phrase

**Writes.** Creates or refreshes 6 products, 3 locations, 9 ledger rows and the OWNER login. It never
deletes the Firebase identity. **DEV-TESTED.**

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-demo-tenant \
npm run seed:demo-tenant -- --database=inventoryai_dev_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-demo-tenant \
npm run seed:demo-tenant -- --database=inventoryai_dev_db
```

**VERIFY**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run verify:demo -- --email=demo-preview@example.invalid --database=inventoryai_dev_db
```

This is the one-phrase exception. Adding `SEED_DB_CONFIRM` or `SEED_PROD_CONFIRM` is ignored: the target is
checked by the command itself, and the phrase count is one in both environments.

#### B1.4 An isolated measurement tenant — 1 000 documents

**Writes.** Creates its own tenant and OWNER login; nothing else is read or reset. **DEV-TESTED** at 1 000
documents.

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
DEMO_ACCOUNT_PASSWORD='choose-a-strong-demo-password' \
SEED_CONFIRM=seed:perf-tenant SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:perf-tenant -- --database=inventoryai_dev_db --size=1000 --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
DEMO_ACCOUNT_PASSWORD='choose-a-strong-demo-password' \
SEED_CONFIRM=seed:perf-tenant SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:perf-tenant -- --database=inventoryai_dev_db --size=1000
```

**VERIFY**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run verify:demo -- --email=perf-seed-ai@example.invalid --database=inventoryai_dev_db
```

`--size` is **documents**, 50–400 000, default 4 000. The command prints the `businessId` it used; cleanup
finds the tenant by fingerprint, so nothing has to be pasted into `cleanup:perf-tenant`.

#### B1.5 The role fixture — 900 documents and four logins

**Writes.** Creates one isolated tenant with a working login per role. **DEV-TESTED.**

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
ROLE_TEST_PASSWORD='choose-a-strong-test-password' \
SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:roles -- --database=inventoryai_dev_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
ROLE_TEST_PASSWORD='choose-a-strong-test-password' \
SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:roles -- --database=inventoryai_dev_db
```

`seed --plan=roles` is the same operation through the plan dispatcher, with the same `SEED_CONFIRM=seed-roles`
and `SEED_DB_CONFIRM`. `ROLE_TEST_PASSWORD` is required for a preview too and is never printed.

#### B1.6 The three-account preset — 30 000 / 50 000 / 90 000 products

**Writes.** The full comparison dataset: ≈755 000 documents and a `LARGE RUN` warning. **DEV-TESTED**
(§27GD). This is the one command in this page that is expected to take tens of minutes.

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-three-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:three -- --database=inventoryai_dev_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-three-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:three -- --database=inventoryai_dev_db
```

Add `--codes=both`, `--codes=sku` or `--codes=barcode` to either form to choose the products' codes; the
preset has no per-account field. Development allows the preset; production refuses it (§A1.9).

#### B1.7 `seed:perf` — the no-login measurement tenant

**Writes.** A disposable tenant with **no Firebase identity**, so it cannot be signed into. **DEV-TESTED.**
Development only: its guard refuses production.

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-perf-ai \
npm run seed:perf -- --size=1000 --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-perf-ai \
npm run seed:perf -- --size=1000
```

`--size` is **products**, 1–200 000. This command takes one phrase and no `--database=` of its own; the
database comes from `MONGODB_DB_NAME`.

### B2. Verification

#### B2.1 `verify:demo` — read-only

One command verifies one account (`--email=`) or several
(`--accounts="address[:products][:codes=…],…"`). It exits **0** all verified, **1** a real disagreement
(an empty tenant is a disagreement, and so are an expected product count and an expected code mode that
do not match), **2** could not look. `--expect-products=<n>` sets the expected size for entries that omit
`:products`; `--expect-codes=both|none|sku|barcode` sets the expected mode for entries that omit
`:codes=`. An entry's own value wins.

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run verify:demo -- --database=inventoryai_dev_db \
  --accounts="jefferndullamalinaozxc@gmail.com:1000,jefferndullamalinao@gmail.com:1000,jeffernmalinaoqwe@gmail.com:1000" --expect-codes=none
```

The block prints one line per account (`Codes    : … — <mode>`); with an expectation it names the mode
and exits **1** on a mismatch. Omit `--expect-codes` to print coverage without asserting a mode.

The single-account form is **DEV-TESTED**; the multi-account form is the one A1.1 runs against production.

#### B2.2 `verify:roles` — all 96 cells

This block seeds the role fixture, captures the id it prints, verifies the 96 authorization cells, and
removes the fixture. It has no placeholder: `BIZ` is read from the seed's own output. **DEV-TESTED**
without `--signin`; the real sign-in half needs `FIREBASE_WEB_API_KEY` and is the production form in
§A2.2.

```bash
cd /c/Users/jeffe/inventory-ai/server
set -euo pipefail

OUT="$(mktemp)"
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
ROLE_TEST_PASSWORD='choose-a-strong-test-password' \
SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
npm run seed:roles -- --database=inventoryai_dev_db | tee "$OUT"

BIZ="$(sed -n 's/.*businessId : \([0-9a-f]\{24\}\).*/\1/p' "$OUT" | head -1)"
test -n "$BIZ"

NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run verify:roles -- --database=inventoryai_dev_db --business="$BIZ"

NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:roles -- --database=inventoryai_dev_db

rm -f "$OUT"
```

`--base=` is not passed: development verifies against the local server on port 4000, so start it first
([Guide 1](1-run-on-your-laptop.md)). Add `--signin` only when the Firebase web key and
`ROLE_TEST_PASSWORD` are both exported.

### B3. Cleanup

Every cleanup below has a `--dry-run`; the preview counts through the same plan the deletion executes.

#### B3.1 Empty the three named accounts — keep every login

**Deletes.** The three tenants' inventory, movements, products, purchase orders, categories, locations,
suppliers, audit rows and pending invitations. **Keeps** users, businesses, sessions and identities.
**DEV-TESTED.**

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:account -- --database=inventoryai_dev_db --dry-run \
  --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:account -- --database=inventoryai_dev_db \
  --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

**VERIFY** — `check:accounts` still reports the logins `READY`, now with 0 documents to reset:

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run check:accounts -- --accounts="jefferndullamalinaozxc@gmail.com,jefferndullamalinao@gmail.com,jeffernmalinaoqwe@gmail.com"
```

#### B3.2 Empty one tenant, keep its login

**Deletes** one tenant's data; keeps the user row, business row, sessions and identity. The tenant id is
read from `check:accounts`, so nothing is typed in. **DEV-TESTED.**

**PREVIEW**

```bash
BIZ="$(NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run check:accounts -- --accounts="jefferndullamalinaozxc@gmail.com" \
  | sed -n 's/.*businessId: \([0-9a-f]\{24\}\).*/\1/p' | head -1)"
test -n "$BIZ"
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:demo -- --database=inventoryai_dev_db \
  --email=jefferndullamalinaozxc@gmail.com --business="$BIZ" --dry-run
```

**EXECUTE**

```bash
BIZ="$(NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run check:accounts -- --accounts="jefferndullamalinaozxc@gmail.com" \
  | sed -n 's/.*businessId: \([0-9a-f]\{24\}\).*/\1/p' | head -1)"
test -n "$BIZ"
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:demo-account CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:demo -- --database=inventoryai_dev_db \
  --email=jefferndullamalinaozxc@gmail.com --business="$BIZ"
```

`--business=` is always required: the address resolves the account, the id names the tenant being emptied.
An id that belongs to another account is refused.

#### B3.3 Remove the fixed demo tenant

**Deletes** the demo tenant's data, user and business row; **keeps** `demo-preview@example.invalid`.
**DEV-TESTED.**

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:demo-tenant -- --database=inventoryai_dev_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:demo-tenant CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:demo-tenant -- --database=inventoryai_dev_db
```

#### B3.4 Remove the measurement tenant

**Deletes** the tenant, user and business row; **keeps** `perf-seed-ai@example.invalid`. **DEV-TESTED.**

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:perf-tenant -- --database=inventoryai_dev_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:perf-tenant CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:perf-tenant -- --database=inventoryai_dev_db
```

#### B3.5 Remove the role fixture

**DEV-TESTED.** The first execute form keeps the four identities; the second deletes them too.

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:roles -- --database=inventoryai_dev_db --dry-run
```

**EXECUTE — keep the four identities**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:roles -- --database=inventoryai_dev_db
```

**EXECUTE — delete the four identities too**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:roles CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:roles -- --database=inventoryai_dev_db --delete-firebase
```

#### B3.6 Empty the three-account preset

**DEV-TESTED.** Production refuses this preset; development allows it.

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup-three-accounts CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:three -- --database=inventoryai_dev_db --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup-three-accounts CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup:three -- --database=inventoryai_dev_db
```

#### B3.7 Remove the no-login measurement tenant

**DEV-TESTED.** Development only; one phrase, no `--database=`.

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-perf-ai \
npm run cleanup:perf -- --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
SEED_CONFIRM=seed-perf-ai \
npm run cleanup:perf
```

#### B3.8 The whole development database — read the warning

**This empties every collection, including `users` and `businesses`.** Logins survive and are stranded:
the app can no longer find a user row. Prefer B3.1–B3.7 unless the whole database is really what you mean.
**DEV PREVIEW ONLY** — the execute form was not run.

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup -- --target=database --database=inventoryai_dev_db --dry-run
```

**EXECUTE — only when the whole database is really what you mean**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup -- --target=database --database=inventoryai_dev_db
```

#### B3.9 Delete one Firebase identity

**NOT RUN** in the 2026-10-29 pass; the production form is **PROD-TESTED** (§A3.6). It refuses while a
MongoDB user row still owns the address, in either database.

**PREVIEW**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup -- --target=firebase --database=inventoryai_dev_db \
  --email=perf-seed-ai@example.invalid --dry-run
```

**EXECUTE**

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_dev_db \
npm run cleanup -- --target=firebase --database=inventoryai_dev_db \
  --email=perf-seed-ai@example.invalid
```

### B4. What development does not switch off

- **The test database is still refused.** `inventoryai_test_db` belongs to `npm test`, which clears it; a
  seed or cleanup aimed at it stops.
- **A URI that names another database is still refused.** The development phrases do not excuse a mismatch
  between `MONGODB_URI`, `MONGODB_DB_NAME` and `--database=`.
- **The Firebase project is shared with production.** `cleanup:test-firebase` would delete every identity
  in that project, including real logins. It is **never** run for development or production. Only its
  refusal is shown here; do not remove `--dry-run`:

```bash
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
  npm run cleanup:test-firebase -- --dry-run
```

Do not run the execute form of that command in either environment. [Guide 13](13-firebase-identities.md)
owns the test-project procedure.

---

## C. Backup and restore

### C1. Back up a database — read-only on the database

**NOT RUN** in the 2026-10-29 pass. It writes a backup directory outside the repository. The directory is
named after the database, so a production backup and a development backup never overwrite one another.

**Production**

```bash
mkdir -p "$HOME/inventory-ai-backups"
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
CONFIRM=backup-db BACKUP_DIR="$HOME/inventory-ai-backups" \
npm run backup:db
```

**Development**

```bash
mkdir -p "$HOME/inventory-ai-backups"
NODE_ENV=development MONGODB_DB_NAME=inventoryai_dev_db \
CONFIRM=backup-db BACKUP_DIR="$HOME/inventory-ai-backups" \
npm run backup:db
```

### C2. Restore the latest backup into the test database

**NOT RUN.** This drops and rewrites `inventoryai_test_db`; it never touches production. Do not run it
while `npm test` is using the test database.

**PREVIEW**

```bash
LATEST="$(ls -dt "$HOME"/inventory-ai-backups/inventoryai_prod_db-* 2>/dev/null | head -1)"
test -n "$LATEST"
NODE_ENV=test MONGODB_DB_NAME=inventoryai_test_db CONFIRM=restore-db \
npm run restore:db -- --from="$LATEST" --dry-run
```

**EXECUTE**

```bash
LATEST="$(ls -dt "$HOME"/inventory-ai-backups/inventoryai_prod_db-* 2>/dev/null | head -1)"
test -n "$LATEST"
NODE_ENV=test MONGODB_DB_NAME=inventoryai_test_db CONFIRM=restore-db \
npm run restore:db -- --from="$LATEST"
```

The target guard permits only `inventoryai_test_db` and `inventoryai_dev_db`; production is refused. The
`LATEST` pattern above finds a **production** backup; use `inventoryai_dev_db-*` to restore a development
one into the test database.

---

## D. Development versus production

The commands are the same; the phrases and refusals differ. The complete invocations are in §A and §B; the
rules are in [Guide 9](9-seeding-development.md), [Guide 10](10-seeding-production.md),
[Guide 11](11-deleting-development.md) and [Guide 12](12-deleting-production.md).

| Operation | Production | Development |
|---|---|---|
| `seed:accounts`, `seed --plan=demo`, `seed:demo` | 3 phrases | 2 phrases (`SEED_CONFIRM` + `SEED_DB_CONFIRM`) |
| `seed:demo-tenant` | 1 phrase | 1 phrase — the same exception |
| `seed:perf-tenant`, `seed:roles` | 3 phrases | 2 phrases |
| `seed:three` | **refused** | allowed; 30 000 / 50 000 / 90 000 products, ≈755 000 documents |
| `seed:perf` | **refused** | allowed; one phrase (`SEED_CONFIRM=seed-perf-ai`), no `--database=`, no login |
| `cleanup:account`, `cleanup:demo`, `cleanup:demo-tenant`, `cleanup:perf-tenant`, `cleanup:roles` | 3 phrases | 2 phrases |
| `cleanup:three` | **refused** | allowed |
| `cleanup:perf` | **refused** | allowed; one phrase (`SEED_CONFIRM=seed-perf-ai`), no `--database=` |
| `cleanup -- --target=database\|firebase` | 3 phrases | 2 phrases |
| `cleanup:test-firebase` | **refused** | deletes every identity in the shared project — do not run it |
| `check:accounts` | `--with-production` | no flag; development is the default |
| `verify:demo` | no phrase | no phrase |
| `verify:roles` | `--base=` + `--signin` + the Firebase web key | local server on port 4000; no `--base`/`--signin` |
| `audit:indexes` | no phrase | no phrase |
| `backup:db` | allowed | allowed |
| `restore:db` | **refused** | test/development database only |

---

## E. When a command refuses

| Message | Meaning |
|---|---|
| `NODE_ENV=production. Refusing [seed:perf]` | that tool is development-only; the refusal is the correct result |
| `production refuses the three-account preset` | name every address instead, or use `seed:accounts` |
| `the resolved database is the test database` | `npm test` clears it; name a real target |
| `MONGODB_URI names the database "…", but this run resolved "…"` | the shell was configured for another database; fix one of them |
| `three confirmation phrase(s) are required` | one of *what* / *where* / *real* is missing or wrong in production; the message names each |
| `two confirmation phrase(s) are required` | the development form is missing `SEED_CONFIRM`/`SEED_DB_CONFIRM` or `CLEANUP_CONFIRM`/`CLEANUP_DB_CONFIRM` |
| `--database=<name> is required` | name the target on the command line as well as in `MONGODB_DB_NAME` |
| `NOT VERIFIED (exit 2)` | the command could not look; this is not a data problem |

← [Guides index](README.md) · Related: [9. Seeding — development](9-seeding-development.md) ·
[10. Seeding — production](10-seeding-production.md) · [11. Deleting — development](11-deleting-development.md) ·
[12. Deleting — production](12-deleting-production.md) · [13. Firebase identities](13-firebase-identities.md)