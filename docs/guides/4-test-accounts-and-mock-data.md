# 4. Test accounts and mock data

Which accounts exist, which data each one owns, and what the sample data contains. This guide is a
reference — the commands live in their own guides:

| For | Read |
|---|---|
| Putting data in | [9. Seeding data](9-seeding-data.md) |
| Removing data | [10. Deleting data](10-deleting-data.md) |
| Firebase logins | [11. Firebase identities](11-firebase-identities.md) |
| Everything else | [6. Scripts and commands](6-scripts-and-commands.md) |

---

## Part 1 — How accounts and data fit together

| System | Holds | Answers |
|---|---|---|
| **Firebase** | the email and password | *who is this person?* (the doorkeeper) |
| **MongoDB** | business, users, products, stock, history | *what may they do, and what is their data?* |

They are joined by Firebase's **UID**, stored on the MongoDB user at registration — **never by email**.

Three consequences:

1. **Deleting a login while its database record exists locks that person out permanently.** The app
   refuses to register the address again, and nothing can repair it. **This is the one irreversible
   mistake here** — [Guide 11](11-firebase-identities.md) explains the checks that prevent it.
   Clearing MongoDB is safe; clearing Firebase is not.
2. **Sample data belongs to a business, not an email.** Every row carries its business, and every query
   filters by it, so tenants never see each other.
3. **A new verified address creates a new empty business**, with that person as OWNER.

---

## Part 2 — Where data can live

| Where | Used by | Safe to delete? |
|---|---|---|
| **`inventoryai_dev_db`** | this laptop's backend, the phone, the seeders — your own account and data | whole-database wipe is ⚠️; per-tenant tools are safe |
| **`inventoryai_test_db`** | `npm test`; rebuilt every run | ✅ throwaway |
| **A seeded tenant in the dev database** | `seed:roles`, `seed:perf`, `seed:demo-tenant` | ✅ its own cleanup removes exactly it |
| **`inventoryai_prod_db`** | the deployed server and shipped app | ⚠️ only by **naming** the database (`--database=`) |

Development and production use the same commands. Production costs a third confirmation phrase, and
every command must name its database. The rule in full: [Guide 9](9-seeding-data.md) (writing) and
[Guide 10](10-deleting-data.md) (deleting).

---

## Part 3 — The accounts that exist

| Account | Created by | Holds |
|---|---|---|
| **Your own address** | `seed --plan=demo` | one tenant sized by `--total` (default 80 000 documents) |
| **A throwaway tester** (`tester-1@example.com`, …) | `seed --plan=demo` with a new address | its own separate tenant; a fresh address per tester |
| **Three comparison accounts** | `npm run seed:three` | 30 000 / 50 000 / 90 000 products — ≈133 000 / 222 000 / 400 000 documents |
| **`demo-preview@example.invalid`** | `seed:demo-tenant` | the small fixed-figure demo tenant (6 products, 112 units) |
| **`role-owner@…` / `role-admin@…` / `role-manager@…` / `role-staff@…`** | `seed:roles` | one tenant, one working login per role, ~900 documents |
| **`perf-seed-ai@example.invalid`** | `seed:perf-tenant` | a large measurement tenant you can sign into |
| *no login* | `seed:perf` | a measurement tenant that cannot be signed into |

All addresses end in the reserved `example.invalid` domain, which can never receive mail. Their logins
are marked verified through Firebase's admin interface — the same write the app makes after a real
code — so no rule is weakened and no mailbox is needed. Passwords come from
`DEMO_ACCOUNT_PASSWORD` / `ROLE_TEST_PASSWORD`, never from the command line.

The role fixture's value is the boundary, not the data: `verify:roles` checks **96 cells** (route ×
role). ADMIN's visible restriction is in **Users** — no creating another ADMIN, no changing its own
role, no editing an ADMIN or the OWNER.

### The three comparison accounts

| Account | Products | ≈ Documents |
|---|---|---|
| `jefferndullamalinaozxc@gmail.com` | 30 000 | 133 333 |
| `jefferndullamalinao@gmail.com` | 50 000 | 222 222 |
| `jeffernmalinaoqwe@gmail.com` | 90 000 | 400 000 |

They exist to answer one question: does the assistant stay correct and fast as a catalogue grows? The
walkthrough is in [Guide 6](6-scripts-and-commands.md#comparing-the-assistant-across-tenants). The
addresses and sizes are fixed in `server/scripts/seed/lib.mjs`, and three commands read that one list:
`check:accounts` (do they exist?), `seed:three` (fill them) and `cleanup:three` (empty them, keeping the
logins) — all three in [Guide 9](9-seeding-data.md) and [Guide 10](10-deleting-data.md).

---

## Part 4 — What the sample data looks like

Default `seed --plan=demo` (`--total=80000`, `--seed=1`):

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

The dashboard should read 18,000 / 2,777 / 1,109. Products are ≈22.5 % of `--total`, so any size can be
predicted from it. Other `--total` or `--seed` values give other numbers; `verify:demo` prints the truth
for what is actually stored.

| Fixture | Shape |
|---|---|
| `seed:demo-tenant` | 6 products, 112 units, 3 locations, 9 ledger movements — every figure fixed and printed by the seeder |
| `seed:roles` | ~900 documents (≈200 products), four logins, one tenant |
| `seed:perf` / `seed:perf-tenant` | `--size` documents (products ≈22 %), deterministic SKUs `SEEDSKU-…` |

No SKUs or barcodes are seeded by `seed:three` / `seed:accounts`, so the app's own barcode generation is
what assigns them — that is deliberate, and worth one product per run.

---

## Part 5 — The one irreversible mistake

A deleted login whose database record survives can never sign in again, and the address cannot be
re-registered. `cleanup:test-firebase` deletes **every** login in the project, including yours.

> **Clear MongoDB for a fresh start. Leave Firebase alone.**

You then sign in and get a brand-new empty business, exactly like a first-time user. There is no way to
delete one user from the app, and none should be added — register a new address instead. When an
identity genuinely must go, [Guide 11](11-firebase-identities.md) has the guarded command and the
refusals that make the ordering impossible to get wrong.

---

## Part 6 — Starting over

| Want | Do |
|---|---|
| Fresh sample data in your own tenant | `seed --plan=demo --database=…` — [Guide 9](9-seeding-data.md) |
| Your data gone, logins kept | `cleanup:demo --database=… --email=… --business=…`, which removes one tenant and keeps its login — [Guide 10](10-deleting-data.md) |
| Your data gone and a brand-new business | `cleanup -- --target=database --database=…`, then sign in again; this removes **every** tenant in that database — [Guide 10](10-deleting-data.md) |
| One fixture tenant gone | its own cleanup (`cleanup:roles`, `cleanup:demo-tenant`, `cleanup:perf-tenant`, `cleanup:perf`) — [Guide 10](10-deleting-data.md) |
| A truly new user | register a new address in the app — a new empty business |
| A login gone, deliberately | [Guide 11](11-firebase-identities.md) — database first, identity second |

Ignore `--target=database` against `inventoryai_prod_db`, and `cleanup:test-firebase`, without a
specific reason.

---

## Part 7 — Words

**Firebase** (logins) · **MongoDB/Atlas** (data) · **UID** (the link) · **tenant** (one customer's data) ·
**seed** (fill with sample data) · **SKU/barcode** (optional product codes) ·
**fixture** (small fixed test data) · **environment** (development/test/production) ·
**destructive** (permanent). The full glossary is [Guide 5](5-words-explained.md).

← [Guides index](README.md) · Related: [9. Seeding data](9-seeding-data.md) ·
[10. Deleting data](10-deleting-data.md) · [11. Firebase identities](11-firebase-identities.md) ·
[5. Words explained](5-words-explained.md)
