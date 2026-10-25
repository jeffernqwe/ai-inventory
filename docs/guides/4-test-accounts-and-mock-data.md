# 4. Test accounts and mock data

**What this guide gets you:** an understanding of which accounts exist, where the sample data lives,
and which of the available commands are safe to run — plus the one mistake that cannot be undone.

Read the first two sections even if you plan to skip the commands. They are the part that makes the
rest obvious instead of scary.

> **Looking for the command itself?** [Guide 6 — Every script, explained](6-scripts-and-commands.md)
> is the full command reference, including the seeding scripts for your own account, the test
> accounts, the performance probes and the destructive cleanup commands.

---

## Part 1 — How accounts and data fit together

### Two systems, two different jobs

| System | What it holds | In plain words |
|---|---|---|
| **Firebase** | The login itself: the email address and the password | Answers *"who is this person?"* — it is the doorkeeper |
| **MongoDB** | The business, the users, the products, the stock, the history | Answers *"what are they allowed to do, and what is their data?"* — it is the filing cabinet |

These are **two separate companies' systems**, and they are not joined by the email address. They
are joined by a long hidden identifier (a *Firebase UID*) that is stored on the MongoDB user record
the first time you register. That is deliberate: an email address can be changed or re-used, and a
door key that depends on a re-usable name is not a key.

```text
   you type email + password
             │
             ▼
   ┌──────────────────┐   "yes, that's them"    ┌───────────────────────┐
   │     FIREBASE      │ ──────────────────────► │  the hidden UID        │
   │  (the doorkeeper) │                         │  is the ONLY link      │
   └──────────────────┘                         └───────────┬───────────┘
                                                             ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  MONGODB — your business, your role, your products, your stock,       │
   │  your history. The business is found through the UID, never by email. │
   └──────────────────────────────────────────────────────────────────────┘
```

### Why this matters to you, practically

Three consequences, all of which look like bugs until you know them:

1. **Deleting a login without deleting its database record locks that person out permanently.**
   The doorkeeper forgets them, but the filing cabinet still has their file — and the app refuses
   to create a *second* file for the same address. Nothing in the application can repair it.
   **This is the one irreversible mistake in this guide.** Clearing the database is safe; clearing
   Firebase is not.
2. **Sample data belongs to a business, not to an email.** Every piece of data carries a hidden
   "which business owns me" label, and every screen and query filters by it. So two accounts on the
   same machine never see each other's data, and deleting sample data cannot touch the wrong
   business.
3. **A brand-new verified address creates a brand-new empty business** (the person who does it
   becomes its OWNER). That is why a fresh sign-in shows empty screens — see
   [Guide 2, "what authenticated needs"](2-run-on-your-phone.md) if that is what you are seeing.

---

## Part 2 — The three places test data can live

| Where | Who uses it | Safe to delete? |
|---|---|---|
| **The development database** — `inventoryai_dev_db` | This laptop's backend (`npm start`), the phone app, and both seeding tools. **This is where your real account and its seeded data live.** | Whole-database delete is **⚠️ destructive**; the per-tenant tools below are safe |
| **The test database** — `inventoryai_test_db` | The automated tests (`npm test`). Rebuilt on every run | ✅ Yes — it is throwaway by design |
| **A disposable seeded tenant** inside the development database | The performance-seeding tools. It is self-contained, clearly named, and never your own work | ✅ Yes — `cleanup:perf` removes exactly it |
| **A production database** — `inventoryai_prod_db` | The deployed server and the shipped app. No ordinary seeding or cleanup command may touch it | ⚠️ Only via the named-database pair in [Guide 6, Part 3G](6-scripts-and-commands.md) |

There is a third database, `inventoryai_prod_db`, for a real deployment. **Nothing in a normal working
session should touch it**, and every cleanup command requires an extra, deliberate phrase to go
anywhere near it. The one sanctioned exception is `seed:perf-tenant` / `cleanup:perf-tenant`
(2026-10-25), which write exactly one clearly-named test tenant there and remove exactly it — the
database must be **named** on the command line and each has a phrase of its own.

### The safety net that is already built in

Every seeding and cleanup command in this guide refuses to run until it can *prove* it is in the
right place. Before it opens a connection or writes anything, it checks:

- the environment is **not** production;
- the database it resolved is **the development database** (or, for cleanup, an explicitly
  named one) — never "whatever the shell happened to say";
- the correct **confirmation phrase** was supplied.

The production-capable pair is the exception that proves those rules: instead of refusing production
it requires the database to be **named** (`--database=`), refuses the test database, and asks for a
phrase unique to itself — so the target is deliberate rather than merely permitted.

If any check fails it stops, prints why, and exits without touching anything. This is why the
commands below include a phrase such as `SEED_CONFIRM=seed-perf-ai` — that is not ceremony, it is
the guard saying *"prove you meant this one."*

> **A note on shell syntax.** The examples are written for **Git Bash / a bash terminal**, where
> `NAME=value npm run …` sets a setting for one command only. In **PowerShell** the same thing is
> two steps:
> ```powershell
> $env:SEED_CONFIRM="seed-perf-ai"
> npm run seed:perf -- --size=1000
> $env:SEED_CONFIRM=$null      # tidy up afterwards
> ```
> If a command complains that a phrase is missing, this difference is almost always why.

---

## Part 3 — The commands, one at a time

### A. Give *your own account* a large, realistic dataset

This is the one to use on this machine. It attaches a big, believable inventory to the account you
already sign in with, so the phone the owner uses lands directly in a full dataset.

```bash
cd C:/Users/jeffe/inventory-ai/server
SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=jefferndullamalinaozxc@gmail.com
```

- `--email=` is **the address you sign in with** — the one whose Firebase identity already exists.
  On this machine that is `jefferndullamalinaozxc@gmail.com`, and the script has been run against it.
- Optional: `--total=80000` (the size, and the default), `--seed=1` (makes the data identical every
  run — useful, because then two measurements describe the same business).
- Optional: if the identity does **not** exist yet, the script creates it. Supply its initial
  password through a setting, never on the command line:
  `DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=new@example.com`
- **The same command is also how an extra test account is created** — a new address plus a password
  setting gives you a working login, its own business and its own data in one step. See
  [Guide 6, "Create an extra test account"](6-scripts-and-commands.md).

**What it does:** reads your identity from Firebase (the doorkeeper), then **resets only the data of
that one business** and writes the new dataset. The account rows themselves are never deleted.

**Running it again** is safe — it replaces that business's data with the same dataset, which is
exactly how you get a clean slate without touching anything else.

### B. Check that the seed really did what it claimed

A seeder printing its own numbers is evidence about the script, not about the database. This one
reads the rows back:

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run verify:demo -- --email=jefferndullamalinaozxc@gmail.com
```

It prints an account summary, independent counts, the stock-health spread and any integrity
problems. It only **reads** — it can never damage anything. It also tells you three different things
by its exit code, which matters if you ever script it:

| Exit code | Meaning |
|---|---|
| **0** | Everything checked out |
| **1** | A real problem was found (a broken arithmetic row, a negative quantity, a row pointing at a missing product) |
| **2** | Could not check — the database was unreachable, or there is no such account. **This is not a data problem**, and the tool says so explicitly, because mistaking "I could not look" for "it is broken" sends you hunting for a bug that is not there |

### C. A throwaway tenant, for measuring performance

Use this when you want realistic data **without attaching it to a real sign-in** — it creates one
self-contained business, clearly named `PERF SEED — AI assistant stress test (do not use)`.

```bash
SEED_CONFIRM=seed-perf-ai npm run seed:perf -- --size=1000     # size = number of products
SEED_CONFIRM=seed-perf-ai npm run cleanup:perf                  # remove exactly that tenant
```

`cleanup:perf` deletes only that tenant, **re-queries to prove nothing is left behind**, and reports
`0 remaining`. It is safe to run when nothing was ever seeded — it says so and exits cleanly.
Nothing else in the database can be reached from it, even if it were handed the wrong identifier.

> **When the data has to be in production** — because the app on a phone can only reach the deployed
> database — use `seed:perf-tenant` instead (2026-10-25). It writes the same shape into a database you
> must **name** (`--database=inventoryai_prod_db`), creates a verified OWNER login so the tenant can be
> signed into on the handset, verifies every collection and the ledger arithmetic before it reports OK,
> and is removed by `cleanup:perf-tenant` with the same scoping and proof. [Guide 6, Part 3G](6-scripts-and-commands.md)
> has the commands, the two phrases, and the measured timings (60,000 documents in 110 s, 13,500 products).

### D. The optional measurement tools

These answer "how fast is it, really?" without spending much of the AI provider's limited quota.
They are read-only against the database.

| Command | What it measures |
|---|---|
| `npm run perf:measure` | How long each of the assistant's data queries takes at your current data size — **no AI calls at all** |
| `npm run perf:golden` | Records the exact answers the assistant's queries produce, so a later change can be proven not to alter them |
| `npm run perf:turns -- --only=2` | One or two **real** assistant conversations, timed end to end |
| `npm run perf:turns -- --login --base=https://…` | The same turns against the **deployed** server, signed in through Firebase (see Guide 6, Part 4) |

### E. Cleanup commands — read before using

| Command | What it deletes | Risk |
|---|---|---|
| `npm run cleanup:test-mongodb` | Everything in `inventoryai_test_db` — the automated tests' scratch database | ✅ Low. It is throwaway |
| `npm run cleanup:perf` | The disposable performance tenant (and nothing else) | ✅ Low |
| `npm run cleanup:demo-tenant` | The demo tenant created by `seed:demo-tenant` (its rows, users and business — nothing else) | ✅ Low. The Firebase identity is left in place on purpose |
| `npm run cleanup:dev-mongodb` | **Everything, in every business, in `inventoryai_dev_db`** — your account's data included | ⚠️ **High.** Your login survives (Firebase is untouched, so you can still sign in), but everything in the app is gone |
| `npm run cleanup:test-firebase` | **Every login** in the development Firebase project | ⚠️⚠️ **Read the next section first** |
| `npm run cleanup:prod-mongodb`, `npm run cleanup:all-mongodb` | Real data | ⚠️⚠️ Requires a second, deliberately loud phrase: `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` |

Each asks for a typed confirmation phrase unless you pass `--yes`, and **`--yes` does not skip the
phrase** — it only skips the typing prompt. The phrase must still be supplied through the
environment:

```bash
CLEANUP_CONFIRM=cleanup:test-mongodb npm run cleanup:test-mongodb -- --yes
```

One more guard worth knowing about, because it can look like the tool is broken: the cleanup
commands also require the environment to be **explicitly** `development`. An unset or blank value
is refused on purpose — *"I could not tell where this would delete"* is treated as *"refuse"*, not
as *"probably fine"*. On this machine `server/.env` already sets it, so nothing extra is normally
needed; if you are told the environment is not set, that is the setting being talked about.

### F. A small demo tenant, for testing the preview build

This is the tenant to use when you want to compare what the app SHOWS with a number you already
know. Unlike the seeded datasets above, every figure here is fixed and printed by the command that
creates it, so a screen that reads `112` can be checked against `112` rather than against a feeling.

```bash
# create (or reset) the demo tenant — the database must be NAMED and must be the resolved one
DEMO_ACCOUNT_PASSWORD='<a password you choose>' SEED_CONFIRM=seed-demo-tenant \r
  npm run seed:demo-tenant -- --database=inventoryai_dev_db

# remove it
CLEANUP_CONFIRM=cleanup:demo-tenant npm run cleanup:demo-tenant -- --database=inventoryai_dev_db
```

Sign in as **`demo-preview@example.invalid`** (the owner is `Demo Tester`). The tenant is a separate
business, so its data never mixes with a real one; the email is on the reserved `.invalid` domain and
can never receive mail.

What it contains — and therefore what the app and the assistant must answer:

| | |
|---|---|
| Products | **6** active, 5 with stock (the Desk Lamp deliberately has **no** inventory row) |
| On hand | **112 units** |
| Locations | **Demo Warehouse 75** (4 products) · **Demo Shop 30** (2) · **Demo Van 7** (1) |
| Health | 3 healthy · 3 at or below minimum · **1 out of stock** |
| Restock list | **Demo Desk Lamp** (out, 0 vs min 3) · **Demo Coffee Beans 1kg** (low, 4 vs 10) · **Demo Paper Cups 100pk** (low, 15 vs 20) |
| Ledger | 9 movements, each ending exactly at the stock figure above |

**Two safety differences from every other seeder, both deliberate.** It is allowed to run against
**production**, because the preview build can only reach production — so the database must be named
on the command line (`--database=…`) and must equal the one the process resolved; the test database
is always refused. And the teardown removes MongoDB rows **only**: the Firebase identity is left in
place, because deleting an identity whose MongoDB record survives is the lockout described in Part 4.
Re-seeding simply reuses it.

**The password you pass is the password it ends up with, every time.** When the identity already
exists, re-seeding sets its password to `DEMO_ACCOUNT_PASSWORD` and reports *"password refreshed from
DEMO_ACCOUNT_PASSWORD"*; before 2026-10-24 it kept whatever password the FIRST run chose, so a second
test cycle had a login nobody could sign in as and no message saying why. (The identity is also left
`emailVerified`, because this is a reserved test credential, not a person.)

To target production, state the environment and the environment's database explicitly — the config
refuses a production database from a development process:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \r
  DEMO_ACCOUNT_PASSWORD='<password>' SEED_CONFIRM=seed-demo-tenant \r
  npm run seed:demo-tenant -- --database=inventoryai_prod_db
```

---

## Part 4 — The one irreversible mistake

`npm run cleanup:test-firebase` deletes **every login** from the development Firebase project —
including your own, and including the account whose data you can see in the app.

**If your MongoDB record still exists but your login is gone, that account can never sign in
again**, and the app will not let you register the same address afresh, because it can see that
address already has a record. The application has no way to repair this. It is recorded in the
project's history as exactly this kind of lockout.

**So the rule is:**

> Clear **MongoDB** when you want a fresh start. Leave **Firebase** alone.

Clearing the database frees the address, orphans nothing, and your login keeps working — you sign
in and get a brand-new empty business, exactly as a first-time user would. That gives you the same
"clean slate" outcome with none of the risk.

The only genuinely disposable identity is the one the performance tools create for themselves
(`perf-seed-ai@example.invalid`, from Part 3 C), which nothing else uses. Even that one is better
left in place than deleted.

**Also worth knowing:** there is no way to remove *one* login from the app itself, and none should
be added (the project's product rules forbid deleting users). If you need to test "a new user
arriving", register a **new** address instead — that is the supported path and it is what the
product actually does.

---

## Part 5 — What the seeded data looks like

### What the sample data looks like when it is there

These figures describe the dataset `seed:demo` writes. They were measured on **2026-10-14** by reading
the development database directly (read-only) — **before** the reset in Part 7 — so read them as *"what
this dataset produces"*, not as what happens to be in the database this minute:

| | |
|---|---|
| Accounts | **1** — `jefferndullamalinaozxc@gmail.com`, role `OWNER`, `ACTIVE`, linked to Firebase |
| Businesses | **1** — named `royal kludge` (`businessId 6accbaf8f3e7c9079ea6f769`) |
| Products in it | **18,001** |
| Low on stock (restock list) | **2,778** |
| Zero on hand | **1,110** |
| Ledger / references | **0** inconsistencies, **0** negative quantities, **0** dangling references |
| Performance tenant | **not present** — no `perf-seed-ai@example.invalid` exists, so `npm run cleanup:perf` would report *nothing to clean* and exit cleanly |

Those figures are what `npm run verify:demo -- --email=jefferndullamalinaozxc@gmail.com` printed on
**2026-10-14** (exit code **0**). Two things worth taking from the table: the development database is
**not** a shared dump of other people's test accounts — when it holds anything, it holds the accounts
**you** deliberately created and their data — and the tools above are safe to run whether or not the
thing they are cleaning is there.

> **What is in there right now** (re-checked **2026-10-14**, read-only): **0 documents** across the
development database's 15 collections, and **0 logins** in the development Firebase project. Nothing is
broken — that is the clean starting state Part 7 begins from, and every figure above comes back the
moment you seed again.

### The seeded dataset

Seeded with the default size (`--total=80000`, `--seed=1`), the dataset on this machine measures:

| Collection | Documents |
|---|---|
| products | 18,000 |
| inventory rows (stock per product per location) | 36,104 |
| inventory movements (the history) | 23,966 |
| purchase orders | 1,600 |
| suppliers | 300 |
| categories | 24 |
| locations | 6 |
| **total** | **80,000** |

Verified clean: **0** ledger inconsistencies, **0** negative quantities, **0** rows pointing at a
missing product, location or supplier, and all 842 purchase-order receipt lines backed by real
movements. The live check above re-confirmed every one of those on 2026-10-14.

The seeder writes exactly **18,000** products, of which **2,777** are at or below their minimum and
**1,109** are at zero. The live check above found **18,001 / 2,778 / 1,110** — exactly one more of
each, which is what a product added in the app since the seed looks like (a new product counts toward
the total and, with no stock, toward both other figures). So the numbers on your dashboard may differ
from the seeder's own from the moment someone adds or moves stock: `npm run verify:demo` prints the
truth for whatever is actually in the database.

**On the dashboard, a freshly seeded `seed:demo` account should read** 18,000 products, **2,777** low
on stock, **1,109** out of stock. (The live check above found exactly one more of each, which is what a
product added in the app after the seed looks like.) Different `--total` or `--seed` values give
different numbers — `npm run verify:demo` prints the truth for whatever you actually seeded.

---

## Part 6 — Starting over: choose the outcome you want

| What you want | Do this | Touches |
|---|---|---|
| A fresh copy of the sample data | `SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=jefferndullamalinaozxc@gmail.com` | Only your business's data |
| Your data gone, your login kept | `CLEANUP_CONFIRM=cleanup:dev-mongodb npm run cleanup:dev-mongodb` | Every business in the development database |
| The disposable tenant gone | `SEED_CONFIRM=seed-perf-ai npm run cleanup:perf` | Only that one tenant |
| A truly new user experience | Register a **new** email address in the app | Creates a new empty business |
| **Three accounts at three sizes, for comparing the assistant** | Part 7 below | Those accounts' data only |

Ignore `cleanup:all-mongodb`, `cleanup:prod-mongodb` and `cleanup:test-firebase` unless you have a
specific, deliberate reason.

---

## Part 7 — Testing the assistant across three accounts (and the app's barcode feature)

This is the setup for comparing the assistant's **speed, accuracy and reliability** on accounts that
hold very different amounts of data. Three accounts, three very different sizes, one command.

### The accounts, and the size each one gets

| Account | Size | Documents | Products (roughly) |
|---|---|---|---|
| `jefferndullamalinaozxc@gmail.com` | small | ≈ 5,000 | ≈ 1,100 |
| `jefferndullamalinao@gmail.com` | medium | ≈ 44,000 | ≈ 9,900 |
| `jeffernmalinaoqwe@gmail.com` | large | ≈ 225,000 | ≈ 50,600 |

A **document** is one stored row. The sizes differ on purpose: *"is the assistant slower on a bigger
account?"* is a question three identical accounts cannot answer.

### Step 1 — clear both stores, in this order (done on 2026-10-14)

```bash
cd C:/Users/jeffe/inventory-ai/server

# 1 — clear the DATABASE first. Your logins survive this: it touches the database only.
CLEANUP_CONFIRM=cleanup:dev-mongodb npm run cleanup:dev-mongodb -- --yes

# 2 — THEN delete the logins you want to register afresh. Name the addresses explicitly.
CLEANUP_CONFIRM=cleanup:firebase-accounts npm run cleanup:firebase-accounts -- \
  --email=jefferndullamalinaozxc@gmail.com \
  --email=jefferndullamalinao@gmail.com \
  --email=jeffernmalinaoqwe@gmail.com
```

Step 1 empties **every business** in the development database. Step 2 removes the **logins** you named.
Between them, those three addresses can register exactly as a first-time user does — which is the point:
the registration flow itself (sign up → 6-digit verification code → business created) is what you are
about to exercise on all three.

**The order is not a style choice — it is the whole safety of step 2.** A database record whose login has
been deleted can **never sign in again**, and the app will not let you register that address afresh
either, because it can see a record for it already. Nothing in the application can repair that state, and
it has happened here for real (roadmap §27BB, F-50). So `cleanup:firebase-accounts` **refuses to delete
any address a database record still points at**, and refuses the **whole** run rather than part of it. Run
it before step 1 and it stops with the list of addresses it will not touch — that is the safety system
working, not a broken install.

`cleanup:firebase-accounts` deletes **only the addresses you name**, **only** on the development Firebase
project (it checks the project id first), and it is nothing like `cleanup:test-firebase`, which deletes
**every** login in the project. Take any backup *before* step 1: read-only dumps from earlier cleanups
live in `C:\Users\jeffe\inventory-ai-backups\`, outside the repository so they cannot be committed. The
80,000-document sample dataset is never really lost — `seed:demo` rebuilds it in one command.

> **Do NOT reach for `cleanup:test-firebase` to "start fresh".** It deletes **every** login, including
> ones you did not mean to touch, and it never checks whether a database record still points at them.

**State as of 2026-10-14 (both steps were run, then re-checked read-only the same day):** the development
database is **empty** — 15 collections, **0** documents — and the development Firebase project holds **0**
logins, the three addresses above each reporting `no identity`. All three are free to register fresh.

### Step 2 — register the three accounts in the app

Register each of the three addresses in the app, one after the other. Registration sends a **6-digit
verification code** by email, which is exactly why these three addresses — mailboxes you can open — are
the right ones to use.

All three now have **no login and no business**, so all three take the path a first-time user takes. The
screens you will see:

1. **Login** → at the bottom, **"New to Inventory AI? Create an account"**.
2. The **"Create your workspace"** screen — *"You'll get a new business and an Owner account."* Fill in
   **Business name**, **Your name**, **Email**, **Password** and **Confirm password**, then press
   **Create Account**.
3. The app creates the sign-in, emails the code, and moves you to **"Verify your email"** — *"Enter the
   6-digit code we sent to your email address."*
4. Open that mailbox, read the 6 digits, type them into **Verification code**, and press **Verify**. (If
   the mail is slow, **Send verification code** asks for another one; the button counts down for a
   minute between sends, which is what stops a mailbox being flooded.)
5. The app creates the business and signs you in. The **dashboard is empty** — nothing is seeded yet.

Register them in any order, and stop after each one to look at the (still empty) dashboard if you like.
When all three are done, sign out and sign in as each in turn to confirm you can reach all three.

**If sign-up reaches an address that is already taken**, the app says so in exactly those words —
*"An account with this email already exists. Sign in instead."* — and that is the correct move: sign in
with that address rather than registering it again. Because step 1 cleared the database, such a login has
**no business behind it yet**, so signing in lands on the "complete your registration" screen and gives
you the same fresh, empty business.

### Step 3 — seed all three at once

```bash
cd C:/Users/jeffe/inventory-ai/server
SEED_CONFIRM=seed-accounts npm run seed:accounts -- --dry-run   # look at the plan first
SEED_CONFIRM=seed-accounts npm run seed:accounts
```

- Each address must be registered **before** this runs, or the command stops and tells you which one
  is missing (it will not invent a login unless you deliberately give it a password to use).
- Every account gets **its own business**, so the three datasets cannot mix. The command checks this
  rather than assuming it.
- **No products get a SKU or a barcode.** That is deliberate — see the next step.
- Safe to re-run: it replaces those accounts' data with the same dataset.
- **How long it takes:** measured runs wrote 800 documents in 5.3 s and 3,000 in 8.8 s, so the **small**
  account (5,000) is over in seconds, the **medium** (44,000) is a minute or two, and the **large**
  (225,000) takes **minutes, not seconds** — several, plausibly five to ten. That last figure is an
  estimate rather than a measurement: the three-account plan has never been run end to end. The command
  prints one block per account as it goes, so you can watch progress instead of wondering whether it has
  hung.

### Step 4 — generate a barcode in the app

Because the seeder left every product's **SKU** and **barcode** blank, you can now watch the app's own
barcode generation do the work: open any seeded product and use the barcode action. That is a feature a
pre-filled fixture would never exercise, because there would be nothing left to generate.

### Step 5 — compare the assistant

The seeding command ends with the exact comparison command for each account. It looks like:

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run perf:measure -- --business=<id from the table above> --label=small
```

That times the assistant's **data queries** and costs nothing. To ask the assistant real questions on a
chosen account, add `--business=` to `npm run perf:turns`.

### What you are likely to find (worth knowing before you start)

This has already been measured, and the answer is counter-intuitive: **the assistant's response time is
mostly the AI provider, not the database.** On a real device, timed turns spent **95–97 % waiting for
the model and only 3–5 % on the queries**, and the queries are sub-second even at tens of thousands of
products. So a small account and a large account can genuinely feel similar — the database was never
the slow part. What the sizes *do* change is the query work, which is why `perf:measure` (no AI
involvement) is the tool that isolates it.

---

## Part 8 — One login per role, for checking what each role can do

Parts 3 and 7 seed **data**: they attach a dataset to an account you already sign in with. This part is
different — it creates **four working logins in one small tenant**, one per role, so you can sign in as each in
turn and see exactly what that role reaches.

```bash
cd C:/Users/jeffe/inventory-ai/server
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles npm run seed:roles
```

| Role | Address | What it is for |
|---|---|---|
| OWNER | `role-owner@example.invalid` | everything, including Users and the audit trail |
| ADMIN | `role-admin@example.invalid` | everything except creating another ADMIN or touching the OWNER |
| MANAGER | `role-manager@example.invalid` | products, suppliers, purchase orders, stock, the assistant — **no** Users, **no** audit trail |
| STAFF | `role-staff@example.invalid` | stock in/out, receiving, reads — **no** creating products, suppliers or orders |

All four share the password in `ROLE_TEST_PASSWORD`. They sign in on the phone exactly like any other account.

**The addresses can never receive mail** — `example.invalid` is reserved for exactly that — so no verification
code is sent or needed. The logins are marked verified through Firebase's admin interface, which is the **same
write the app performs after a real code is confirmed**. Nothing about the app's rules changes: an ordinary
account still has to verify its email.

**It cannot touch your own data.** The tenant is named `ROLE TEST — role boundary fixture (do not use)` and is
found by that name **and** by its owner address; every write is filtered by that one business, and the command
refuses to run unless the database is the development one. Your own account, its business and its 80,000
documents are never in scope.

**Prove the permissions rather than eyeballing them** (the backend must be running):

```bash
SEED_CONFIRM=seed-roles npm run verify:roles -- --business=<the id the seeder printed>
```

It prints one line per route with `allow`/`deny` for all four roles and exits **0** only when all **96 cells**
match the app's own role table. The exact commands, the flags and the teardown are in
[Guide 6, section F](6-scripts-and-commands.md).

**Tear it down** with `SEED_CONFIRM=seed-roles npm run cleanup:roles`. It removes the tenant and re-queries to
prove nothing is left; the four logins are kept unless you pass `--delete-firebase` (see
[Part 4](#part-4--the-one-irreversible-mistake) for why that order matters).

## Part 9 — Words from this guide

- **Firebase** — the outside service that holds logins (email + password). Runs in the cloud.
- **MongoDB / Atlas** — the database service that holds the business data. Also in the cloud.
- **UID** — the long hidden identifier that links a login to its database record. Not the email.
- **Tenant / business** — one customer's separate world of data. Everything is labelled with the
  business that owns it.
- **Seed** — to fill a database with realistic sample data.
- **SKU** — a shop's own code for a product. Optional here, which is why the seeder can leave it blank
  for the app to fill in.
- **Barcode** — the scannable pattern for a product. Also optional, and also left blank on purpose.
- **Fixture** — a small, fixed set of test data used by automated tests.
- **Environment** — which copy of the system you are pointing at: development, test, or production.
- **Destructive** — permanently removes data. Nothing here can be undeleted.
- **Idempotent** — safe to run twice: the second run leaves the same result, not a duplicate.
- **Exit code** — the small number a finished command reports: `0` means success.

← Back to [the guides index](README.md) · Related: [1. Laptop](1-run-on-your-laptop.md) ·
[2. Phone](2-run-on-your-phone.md) · [6. Every script, explained](6-scripts-and-commands.md) ·
[5. Words explained](5-words-explained.md)
