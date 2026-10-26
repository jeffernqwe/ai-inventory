# 6. Every script, explained

Every command this project ships: what it does, the exact line, and whether it can harm anything.
How accounts and data fit together is [Guide 4](4-test-accounts-and-mock-data.md); words are in
[Guide 5](5-words-explained.md).

## How to read a command

```bash
cd C:/Users/jeffe/inventory-ai/server                          # where to stand
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db --email=x@y.z   # settings, then command
```

- `cd` — commands only work from their own folder (`server/`, `mobile/`, or the project root).
- `NAME=value` — a setting for one command only.
- `--` — everything after it goes to the script; forget it and npm rejects the option.
- Options are `--name=value`.
- In **PowerShell**: `$env:SEED_CONFIRM="…"`, run the command, then `$env:SEED_CONFIRM=$null`. Same
  shape for `$env:CLEANUP_CONFIRM` and `$env:CLEANUP_PROD_CONFIRM` — and because PowerShell keeps
  them until you clear them, clear both after a production run rather than leaving one exported.

## Part 1 — Starting things

```bash
cd C:/Users/jeffe/inventory-ai/server
npm start        # backend on port 4000; no build step
npm run dev      # the same, restarting on edits
```

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx expo start --dev-client   # Metro; press "a" to open on a connected phone
npm start                     # same, without --dev-client
npm run android               # expo start --android
npm run ios                   # expo start --ios (needs a Mac)
npm run web                   # expo start --web
```

## Part 2 — Checking your work (read-only)

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run typecheck        # silent when clean
npm run lint             # silent when clean
npm run test:unit        # fast, no database
npm test                 # everything, including database tests
npm run test:db          # database tests only
npm run check:extensions # half-finished file rename
npm run check:specifiers # import pointing at nothing
```

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npm run typecheck
npm run lint
npm test
npm run test:watch
npm run check:build-env                  # are this project's build settings complete?
node scripts/check-build-env.mjs --live  # …and what the EAS environment holds (needs sign-in)
```

`0 failures` is a pass; `typecheck` and `lint` print nothing when clean; the two `check:` commands
print an explicit `OK`. Database tests use the throwaway `inventoryai_test_db` and **fail loudly** if
it is unreachable — a green run means they really ran.

### Label barcode — does it decode?

```bash
cd C:/Users/jeffe/inventory-ai
node scripts/verify-label-barcode.mjs --html --expect=2000053337540
node scripts/verify-label-barcode.mjs --pdf=scripts/fixtures/label-2000053337540.pdf --expect=2000053337540
```

The first decodes the label the app draws now **and** checks geometry (both 11-module quiet zones, a
page large enough). The second decodes a real printed PDF. Exit `0` only on a match, `2` when it could
not look. Its own must-fail controls run first on every invocation.

### A phone pass you can re-run

Phone connected, development build installed, tunnels up (`adb reverse tcp:4000 tcp:4000`,
`adb reverse tcp:8081 tcp:8081`):

```bash
cd C:/Users/jeffe/inventory-ai
node scripts/device/run.mjs --list
node scripts/device/run.mjs --self-test
node scripts/device/run.mjs                                   # read-only walk, 24 steps
node scripts/device/run.mjs --all --sku=SMOKE-1               # + print a label, decode its PDF
node scripts/device/run.mjs --journey=draft --allow-writes
node scripts/device/run.mjs --journey=stock --sku=SMOKE-1 --source="Smoke shelf" --allow-writes
node scripts/device/run.mjs --journey=transfer --sku=SMOKE-1 \
  --source="Smoke shelf" --destination="Smoke" --allow-writes
```

- Exit **0** all steps passed, **1** a step failed, **2** blocked (no device, no session, no
  debuggable build) — a block is never a pass. `--until=<n>` stops after step `n` and writes
  `state.json`.
- The write journeys are **net-zero** (`stock` 5 in/5 out; `transfer` stocks 1 in, moves it across
  and back, then stocks it out) and check the app's own confirmation arithmetic. `transfer` supplies
  its own unit because a transfer never creates stock.
- **No journey takes an internal id.** A product is named by its `--sku`, which the harness types into
  the products search the way a person would, and it proceeds only once the product screen prints
  that SKU back. The product must belong to the tenant you are signed in as — another business's
  slug simply has no row, and the run is BLOCKED (exit 2), not failed.
- A picker whose list is empty (a tenant with no supplier) is **BLOCKED** rather than failed: the app
  disables it, so there is nothing to tap and nothing was judged.
- Screens that may legitimately be empty are checked with `expectClean` (not loading, not the error
  state); a screen that never finishes is exit 2.
- The `label` journey reads the code off the screen, taps *Share PDF*, and decodes the PDF with the
  same decoder CI uses (read via `adb exec-out` — `adb shell cat` rewrites newlines).
- Each run writes `report.md`, `report.json` and screenshots to
  `docs/evidence/device-runs/<timestamp>-<journey>/`.
- Not covered: iOS, paper (no printer), the camera.

## Part 3 — Sample data in and out

**One seeding command, two environments** ([Guide 9](9-seeding-data.md) is the short version):

```bash
npm run seed -- --plan=<demo|accounts|roles> --database=<name> [options]
```

`--database=` is **required and must equal** the database `MONGODB_DB_NAME` resolved. Development
needs **two** phrases — `SEED_CONFIRM=<the plan's phrase>` and `SEED_DB_CONFIRM=<the database name>`;
production needs **three**, adding `SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA`. `npm run seed:demo`,
`seed:accounts` and `seed:roles` are the same command with the plan preselected and take the same
phrases. `seed:perf`, `seed:perf-tenant` and `seed:demo-tenant` are separate tools with their own
guards (D, G.1, H).

| You want | Use |
|---|---|
| Data in the account you sign in with (dev) | `seed --plan=demo` — A |
| The same in production | `seed --plan=demo --business=…` — G.2 |
| Empty it again, keeping the login | `cleanup:demo -- --email=… --business=…` — G.2 |
| A throwaway measurement tenant (no login) | `seed:perf` — D |
| A large tenant you can sign into, in a named database | `seed:perf-tenant` — G.1 |
| Several accounts at different sizes | `seed:accounts` — E |
| One working login per role | `seed:roles` — F |
| A small demo tenant with known figures (6 products, 112 units) | `seed:demo-tenant` — H |
| Remove that demo tenant | `cleanup:demo-tenant` — H |
| A brand-new signable test account | `seed:demo` with a new email + `DEMO_ACCOUNT_PASSWORD` |

### A. Seed your own account

```bash
cd C:/Users/jeffe/inventory-ai/server
SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db \
    --email=jefferndullamalinaozxc@gmail.com
```

- `--email=` must be the address you sign in with; the business is found through its Firebase UID.
- `--total=80000` (default, **100–400000**) is a real target; `--seed=1` makes runs identical.
- `--dry-run` prints the plan, the target and the phrase count without connecting or writing.
- **Replaces only that business's data.** Login and other tenants untouched. Re-running is safe.
- Expect `OK` and `TOTAL 80000 (target 80000)`.
- First run for a brand-new address creates the login — pass the password through a setting:
  `DEMO_ACCOUNT_PASSWORD='…' SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db npm run seed -- --plan=demo --database=inventoryai_dev_db --email=new-tester@example.com`

### B. An extra test account

The same command with a new address creates a verified Firebase login, a MongoDB user + business
(OWNER) and its dataset:

```bash
DEMO_ACCOUNT_PASSWORD='choose-a-strong-password' SEED_CONFIRM=seed-demo-account \
  SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=demo --database=inventoryai_dev_db \
    --email=tester-1@example.com --total=500
```

Use a throwaway address per tester. Do not delete its login while its database record exists (Part 6).

### C. Verify a seed

```bash
npm run verify:demo -- --email=jefferndullamalinaozxc@gmail.com
```

Reads rows back: counts, ledger arithmetic, referential integrity, stock health. Exit **0** clean,
**1** a real problem, **2** could not check (unreachable database / no such account) — not a data
problem. Production: add `NODE_ENV=production MONGODB_DB_NAME=…` and `--database=`. Read-only, so no
phrase.

### D. Throwaway measurement tenant

```bash
SEED_CONFIRM=seed-perf-ai npm run seed:perf -- --size=1000    # products, 1–200000
SEED_CONFIRM=seed-perf-ai npm run cleanup:perf
```

Named `PERF SEED — AI assistant stress test (do not use)`, **no login** (owner
`perf-seed-ai@example.invalid`), so it cannot be signed into. It prints the `businessId` the
measurements need. `cleanup:perf` proves `0 remaining`; it says `nothing to clean` when empty.

### E. Several accounts, barcodes left blank

```bash
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=accounts --database=inventoryai_dev_db --dry-run   # plan only, guard still runs
SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=accounts --database=inventoryai_dev_db
```

- **No SKUs or barcodes** — so the app's own generation is what assigns them.
- `--accounts="a@x.com:5000,b@x.com:44000"` replaces the plan; a size is required per entry.
- `--include-sku` generates them too.
- Default sizes: small ≈ 5,000 documents (≈1,100 products), medium ≈ 44,000 (≈9,900), large ≈ 225,000
  (≈50,600).
- Each account gets its own business; the command refuses if two resolve to one business.
- A missing login stops the run (unless `DEMO_ACCOUNT_PASSWORD` is supplied); an existing password is
  never changed.

### F. One login per role

```bash
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=roles --database=inventoryai_dev_db --dry-run
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_dev_db \
  npm run seed -- --plan=roles --database=inventoryai_dev_db
npm run verify:roles -- --business=<id printed>
CLEANUP_CONFIRM=cleanup:roles npm run cleanup:roles -- --database=inventoryai_dev_db
```

| Role | Address |
|---|---|
| OWNER | `role-owner@example.invalid` |
| ADMIN | `role-admin@example.invalid` |
| MANAGER | `role-manager@example.invalid` |
| STAFF | `role-staff@example.invalid` |

One tenant (`ROLE TEST — role boundary fixture (do not use)`, ≈900 documents). The `.invalid` addresses
cannot receive mail; the logins are marked verified through the Firebase admin interface — the same
write the app makes after a real code, so no rule is weakened. `verify:roles` signs all four in and
checks **96 cells**, exiting 0 only when every one matches the role table; `--signin` (with
`FIREBASE_WEB_API_KEY` and `ROLE_TEST_PASSWORD`) proves the real sign-in path. `cleanup:roles` keeps
the logins unless `--delete-firebase`, and only after the database is gone.

### G. Production — the same commands, made deliberate

| Route | Commands | Touches |
|---|---|---|
| **A. A tenant of its own** (recommended for scale) | `seed:perf-tenant` / `cleanup:perf-tenant` — G.1 | one new, clearly named tenant; never an account it did not create |
| **B. Your own account** | `seed:demo`, `seed:accounts`, `seed:roles` — G.2/G.3 | only the tenant that account owns, named with `--business=` when it exists |
| **C. Emptying a tenant, keeping the login** | `cleanup:demo` — G.2 | one named tenant's data; user, business, members and sessions survive |

The rules every production run follows:

| Rule | Meaning |
|---|---|
| `--database=<name>` **required** | must equal the database the process resolved — never inferred from `--base=` or the URI |
| the test database is refused | `npm test` clears it, so seeded rows would vanish mid-experiment |
| a per-command phrase | `SEED_CONFIRM` for seeders, `CLEANUP_CONFIRM` for cleanups — the families cannot be satisfied by one habitual export |
| the **tenant** is named when it would be reset | `seed:demo` and `seed:accounts` refuse to replace an existing business without `--business=` |
| an existing **password is never changed** | only a brand-new identity gets one; the commands that own their addresses (G.1, roles) may rotate theirs |
| every delete is scoped by `businessId` | no command here can become `cleanup -- --target=database` |

**One cycle:** G.1 seeds and prints the `businessId` → Part 4 asks the deployed assistant → G.2 empties
the tenant keeping its login → G.1's cleanup removes the empty tenant and leaves the Firebase identity.
They are not chained: the measurement spends shared AI allowance and the cleanups delete rows.

#### G.1 A tenant of its own

```bash
cd C:/Users/jeffe/inventory-ai/server

NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  DEMO_ACCOUNT_PASSWORD='choose-a-password' SEED_CONFIRM=seed:perf-tenant \
  npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=60000

NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:perf-tenant \
  npm run cleanup:perf-tenant -- --database=inventoryai_prod_db
```

`NODE_ENV=production` alone is not enough: `server/.env` sets the development database, and the config
refuses production with it.

`--size` is **documents**, 50–400,000, default 4,000; products ≈22 %. It creates a verified OWNER login
(`perf-seed-ai@example.invalid`) **only** in that tenant. Deterministic (`--seed`, default 1), SKUs are
`SEEDSKU-…` (the probe asks about `SEEDSKU-0`). It re-counts every collection, re-checks every
movement's arithmetic and requires that anchor before saying OK. Re-running resets its own rows and
refreshes its password.

Measured on production 2026-10-25: `--size=60000` → 18 categories, 6 locations, 240 suppliers, 13,500
products, 27,200 inventory rows, 17,836 movements, 1,200 purchase orders in **110 s**. `--size=80000`
→ 24 / 6 / 300 / 18,000 / 36,104 / 23,966 / 1,600 in **171 s**, after removing 60,016 previous rows.

The printed next-step commands carry the `NODE_ENV`/`MONGODB_DB_NAME` prefix, the deployed `--base=`
URL and `node --env-file=../mobile/.env scripts/measure-ai-turns.mjs`. `cleanup:perf-tenant` re-queries
to `0 remaining`, **keeps the Firebase identity** (F-50), and refuses if its name and owner address
point at different businesses.

#### G.2 Your own account

Read the id first (read-only, no phrase):

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --database=inventoryai_prod_db --email=YOUR_EMAIL
```

Then seed, naming that id:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  SEED_CONFIRM=seed-demo-account \
  SEED_DB_CONFIRM=inventoryai_prod_db \
  SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed -- --plan=demo --database=inventoryai_prod_db --email=YOUR_EMAIL \
    --business=THE_BUSINESS_ID --total=60000
```

Expect `database … (PRODUCTION)`, the tenant line, `scope : replacing the DATA of business …`, counts,
`OK`, and `password NOT changed on a production run`. Name, members and roles are untouched. A new
business may omit `--business=`; once it exists, omitting it or naming the wrong id is refused **before**
anything is deleted. `--total=900` is a quick smaller reset.

Empty it, keeping the login:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:demo-account \
  npm run cleanup:demo -- --database=inventoryai_prod_db \
  --email=YOUR_EMAIL --business=THE_BUSINESS_ID
```

Both identifiers are required and must agree. It removes inventory, movements, products, categories,
locations, suppliers, purchase orders, audit rows, invitations and assistant conversations, then
re-reads and prints `verification found 0 remaining`. Never deletes an identity. Add `--dry-run` to see
the counts first — same collections, same order, nothing deleted.

Measured on production 2026-10-25: 80,006 documents removed (36,104 inventory, 23,966 movements, 18,000
products, 1,600 purchase orders, 300 suppliers, 24 categories, 6 locations, 4 assistant messages,
1 conversation, 1 audit row), 0 remaining; the login and business row still signed in.

#### G.3 Several accounts, and the role fixture

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=inventoryai_prod_db \
  SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed -- --plan=accounts --database=inventoryai_prod_db \
    --accounts="a@x.com:60000:BUSINESS_ID_A,b@x.com:5000:BUSINESS_ID_B"

NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  ROLE_TEST_PASSWORD='…' SEED_CONFIRM=seed-roles SEED_DB_CONFIRM=inventoryai_prod_db \
  SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
  npm run seed -- --plan=roles --database=inventoryai_prod_db
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:roles npm run cleanup:roles -- --database=inventoryai_prod_db
```

`seed:accounts` refuses the default plan in production. Roles own their tenant and addresses, so they
need no `--business=`. `verify:roles` needs `--signin` when `--base` is the deployment: a local session
is signed with the local `JWT_SECRET`, which the server does not share.

#### G.4 Check before you trust it

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  npm run verify:demo -- --database=inventoryai_prod_db --email=YOUR_EMAIL
```

Prints `(PRODUCTION)`, counts, ledger and integrity checks; exits 0 only if all hold; no phrase.

#### H. The small demo tenant

```bash
DEMO_ACCOUNT_PASSWORD='<password>' SEED_CONFIRM=seed-demo-tenant \
  npm run seed:demo-tenant -- --database=inventoryai_dev_db
CLEANUP_CONFIRM=cleanup:demo-tenant npm run cleanup:demo-tenant -- --database=inventoryai_dev_db
```

Sign in as `demo-preview@example.invalid`. Fixed figures: **6 products**, **112 units**, Demo
Warehouse 75 / Demo Shop 30 / Demo Van 7, health 3 healthy / 3 low / 1 out, three restock lines, 9
ledger movements. Production form adds `NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db`. The
database must be named and must match the resolved one; the password is set on every run; the teardown
removes MongoDB rows only.

## Part 4 — Measuring the assistant

| Command | Measures |
|---|---|
| `npm run perf:measure -- --business=<id> --iterations=7 --label=before` | each data query's time — **no AI calls** |
| `npm run perf:golden -- --business=<id> --out=before.json` | fingerprints the answers; `--compare=before.json` later |
| `npm run perf:turns -- --business=<id> --only=1,3` | real assistant turns, end to end |
| `npm run ai:usage -- --log=<path>` | turns, failures, requests and the allowance left — nothing spent (`--no-provider` keeps it offline) |
| `npm run ai:usage -- --provider-only` | **just the allowance left today** — no log, database or model call |
| `npm run ai:usage -- --db --days=30` | what was actually answered, from the database |
| `npm run ai:models` | configured chain with live endpoint status and 5m/30m/1d uptime, plus free tool-capable ids |
| `npm run ai:models -- --check=<id>` | one model's health, then one tool-shaped request |
| `npm run ai:check` (`-- --probe`) | the configured models verified against the provider's catalogue |
| `npm run ai:health` (`-- --alert`) | one model-health check; exit 0 healthy, 1 degraded/unavailable, 2 could not check |

`perf:golden --compare` exits 0 identical, 1 different, 2 different tenants (a re-seed changes ids).
`perf:turns` reads the allowance first and refuses with exit 2 when it provably cannot fit; `--force`
overrides. All three read the database only; only `perf:turns` spends quota.

### Measuring the deployed server

```bash
cd C:/Users/jeffe/inventory-ai/server

npm run ai:usage -- --provider-only

NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  PERF_TURNS_CONFIRM=perf-turns:production \
  PERF_ACCOUNT_PASSWORD='the password the seed was run with' \
  node --env-file=../mobile/.env scripts/measure-ai-turns.mjs \
    --base=https://ai-inventory-l1mi.onrender.com \
    --database=inventoryai_prod_db \
    --business=<businessId> --login --only=1,2,3,4,5,6
```

`--login` signs in through Firebase REST and exchanges the ID token, as the phone does. The Firebase
web key can come from `EXPO_PUBLIC_FIREBASE_API_KEY=` or `--firebase-api-key=` (both public), or be
loaded from `mobile/.env` as above. `PERF_ACCOUNT_PASSWORD` is the seed's credential
(`DEMO_ACCOUNT_PASSWORD` is a fallback). `--database=` plus `PERF_TURNS_CONFIRM` are both required — the
probe reads its ground truth from that database.

Questions 1–6: dashboard numbers, reorder total, one product by `SEEDSKU-0`, out-of-stock count and
percentage, total units on hand, products per location. `grounded` counts successful turns whose answer
held every expected fact; `MISSING …` is a real disagreement; `NOT CHECKED` means the turn did not
succeed (transport/quota/server) and is not a wrong answer.

Measured 2026-10-25 on production: at 60,000 documents **6/6 answered and grounded** (3275–13321 ms,
one tool call each); at 80,000 documents questions 1–2 **2/2 grounded** (8713, 16419 ms). A six-question
run cost **13 provider requests** — budget about two per question.

### Changing the AI models yourself, and the watchdog

```bash
# server/.env (and the deployed host's environment)
AI_MODEL_OPENROUTER=nvidia/nemotron-3.5-lightning:free
AI_FALLBACK_MODELS_OPENROUTER=nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3.5-super-vl:free,liquid/lfm-2.5-2.6b:free,nvidia/nemotron-3-super-120b-a12b:free
AI_MODEL_FAILURE_THRESHOLD=5     # default 5 failures open a cooldown
AI_MODEL_COOLDOWN_MS=30000       # first cooldown; backs off 30s, 60s, 2m, 4m, then ≤5m
AI_ATTEMPT_MAX_MS=0              # optional per-attempt slice; 0 = off
AI_QUOTA_BLOCK_MS=30000          # a zero-remaining refusal blocks calls this long
```

To change models: `npm run ai:models` to see health, `--check=<id>` to try one, edit the line, restart
the server (`.env` is read at boot), then `npm run ai:check` (`-- --probe`). On Render a changed
variable applies on the **next deploy**, not a restart.

Watchdog and alert variables:

```bash
AI_HEALTH_ALERT_EMAIL=owner@example.com
AI_HEALTH_WATCH_ENABLED=true            # production on; development/test off
AI_HEALTH_WATCH_INTERVAL_MS=1800000     # 30 minutes
AI_HEALTH_WATCH_INITIAL_DELAY_MS=60000
AI_HEALTH_MIN_UPTIME_5M=90
AI_HEALTH_MIN_UPTIME_30M=95
AI_HEALTH_UNKNOWN_ALERT_AFTER=2
```

The watchdog reads `GET /v1/models/{author}/{slug}/endpoints` (a GET, no quota), classifies each model
**ok / degraded / unavailable / unknown**, alerts only on state change, and emails through Brevo, or
logs at error level when mail is not configured. If every model is cooling, the assistant answers its
normal temporary-unavailability message without spending a request. A quota refusal (429/402) is never
treated as a model outage.

### Capturing the log the usage report needs

```bash
cd C:/Users/jeffe/inventory-ai/server
mkdir -p logs
npm start > logs/server.log 2>&1

npm run ai:usage -- --log=logs/server.log
npm start | npm run ai:usage --silent --      # or straight off a running server's output
grep '\[ai\] turn outcome=' logs/server.log | grep -v outcome=ok
grep 'empty completion' logs/server.log
```

Turn lines exist only in stdout (never stored), so timeouts, abandoned turns and quota refusals appear
only here; the database half shows what was answered. The `empty completion` line names the model,
whether the body reported usage, which block types it carried and which top-level fields — never the
body itself.

## Part 5 — Maintenance (from the project root)

```bash
cd C:/Users/jeffe/inventory-ai
node scripts/check-secrets.mjs           # 0 = clean; waive a line with "secret-guard:allow"
node scripts/audit-access.mjs            # repo privacy/access; needs gh signed in; run by hand
node scripts/check-upgrade-watches.mjs   # deferred upgrades; --json, --self-test; needs network
```

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run audit:indexes
```

`audit:indexes` asks the **database** whether every declared index exists. Exit **0** all present,
**1** a real disagreement (never auto-fixed — the fix can drop an index someone added), **2** **NOT
VERIFIED**, the audit could not run. Nothing is created, changed or dropped.

### Backup and restore

```bash
cd C:/Users/jeffe/inventory-ai/server

BACKUP_DIR=C:/Users/jeffe/inventory-ai-backups CONFIRM=backup-db npm run backup:db

CONFIRM=restore-db npm run restore:db -- --from=<folder> --dry-run

CONFIRM=restore-db npm run restore:db -- --from=<a folder you already dry-ran>
```

The free Atlas tier has **no backups**; this pair is the answer. `backup:db` writes one gzipped file per
collection plus a `manifest.json` with every file's length and SHA-256; `restore:db` verifies those
fingerprints **before** dropping and inserting.

| | `backup:db` | `restore:db` |
|---|---|---|
| Database | any, including production | `inventoryai_test_db` or `inventoryai_dev_db` **only** |
| Folder | `BACKUP_DIR`, **outside the project** | `--from=` |
| Phrase | `CONFIRM=backup-db` | `CONFIRM=restore-db` |
| `--dry-run` | — | verifies and reports, writes nothing |

A dump inside the repository is refused (one `git add` from being committed). A name containing `prod`
or `live` is refused even if the list were edited. A long restore prints progress every 50,000
documents. Watch the `size` line: a 525,750-document restore needs ≈240 MB, which fills a 512 MB free
tier — the command reports that and exits 1. The habit worth forming: restore into the test database and
run `npm test` before you need it.

### Files that are not commands

`server/scripts/perf/lib.mjs` (the perf tenant definition, the safety guard and teardown helpers),
`server/scripts/seed/lib.mjs` (the dataset shape shared by `seed:demo` and `seed:accounts`),
`server/scripts/cleanup/guard.mjs` (the one cleanup rule), `lib.mjs` + `run.mjs` (the guarded delete
sequence). Opening them does nothing, by design. Also automatic: `npm install` in `mobile/` applies a `postinstall` patch.

## Part 6 — Destructive commands

Everything here permanently removes data. Two families, one shape each:

- **`npm run cleanup -- --target=database|firebase`** — a whole database, or the identities you name.
  `--database=` is required and must equal the database this shell resolved; **two phrases in
  development, three in production** ([Guide 9](9-seeding-data.md) has the rule).
- **the scoped cleanups** (`cleanup:perf`, `cleanup:demo`, `cleanup:roles`, …) — one named tenant, each
  with its own phrase. Most read `CLEANUP_CONFIRM`; the perf pair reads `SEED_CONFIRM=seed-perf-ai`,
  because it shares the perf seeder's fixture phrase.

The old `cleanup:test-mongodb`, `cleanup:dev-mongodb`, `cleanup:prod-mongodb`, `cleanup:all-mongodb` and
`cleanup:firebase-accounts` scripts are gone; each was this command with the target baked in.

```bash
cd C:/Users/jeffe/inventory-ai/server
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db --dry-run
```

| Command | Deletes | Risk |
|---|---|---|
| `cleanup -- --target=database` (dev) | everything in `inventoryai_dev_db`, **logins included** | ⚠️ **High** |
| `cleanup -- --target=database` (prod) | real data, logins included | ⚠️⚠️ needs **three** phrases |
| `cleanup -- --target=firebase -- --email=…` | **only the logins you name**, checked first | ⚠️⚠️ irreversible but guarded |
| `cleanup:perf` | the disposable perf tenant (needs `SEED_CONFIRM=seed-perf-ai`) | ✅ that tenant only |
| `cleanup:demo-tenant` | the `seed:demo-tenant` tenant's rows | ✅ identity kept |
| `cleanup:roles` | the role fixture tenant (logins kept unless `--delete-firebase`) | ✅ verified afterwards |
| `cleanup:demo` | **one named tenant's data**, keeping its login | ⚠️ production-capable, verified afterwards |
| `cleanup:test-firebase` | **every login** in the approved Firebase project | ⚠️⚠️ **irreversible** |

The test database is refused by name, because `npm test` owns it.

**Production needs three phrases, and each answers a different question.** `CLEANUP_CONFIRM` names
*which command*, `CLEANUP_DB_CONFIRM` names *where*, and `CLEANUP_PROD_CONFIRM` states *that the data is
real*. None substitutes for another: an exported command phrase cannot reach production on its own, and
the phrase that acknowledges real data cannot run a command the operator did not name. Measured
2026-10-26: with the first two set and the third missing, a production run stops at `three confirmation
phrase(s) are required to clean inventoryai_prod_db (PRODUCTION) … 1 is missing or wrong:
CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` and deletes nothing. The command that runs:

```bash
NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
  CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_prod_db \
  CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
  npm run cleanup -- --target=database --database=inventoryai_prod_db
```

Guards: the target must be one of the two; `--database` must match the resolved database **and** be a
cleanable name; a `MONGODB_URI` that names a different database in its path is refused (the shell is
configured for the other environment, even when every flag agrees); the live connection must report the
same name; and every phrase must match exactly. A run that fails any of them opens no connection at
all, so it cannot have deleted anything. The old
"`NODE_ENV` must be explicitly development" rule is gone — the database name and its phrase are the
proof, which is what lets one command serve both environments.
Measured tools check a recognised non-production environment **and** a resolved dev/test database,
printed before the first query; they need no phrase, but a run that cannot say which database it read
is not a measurement.

`perf:turns` is the exception that may measure production: the deployed `JWT_SECRET` is not on a laptop,
so it signs in like the phone and needs the database the server writes to — hence `--database=` **and**
`PERF_TURNS_CONFIRM=perf-turns:production`. Seeding commands use the same naming rule (Part G).

**Why `cleanup:test-firebase` is the dangerous one.** A deleted login whose database record survives can
never sign in again, and the address cannot be re-registered. **Clear MongoDB for a fresh start; leave
Firebase alone.**

### Deleting one specific login

Only for deliberately re-testing the registration journey on an address that already has a login:

```bash
# 1. database first
CLEANUP_CONFIRM=cleanup:database CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=database --database=inventoryai_dev_db

# 2. THEN the logins
CLEANUP_CONFIRM=cleanup:firebase CLEANUP_DB_CONFIRM=inventoryai_dev_db \
  npm run cleanup -- --target=firebase --database=inventoryai_dev_db \
  --email=one@x.com --email=two@x.com
```

The order is the safety. The command refuses any address a database record still points at, and refuses
the **whole** run (`REFUSED — still linked to a MongoDB user`, exit 1, nothing deleted). It counts in
**both** the development and the production database, because one Firebase project serves both and an
address can be referenced twice; a refusal names the database(s) that still hold it. Measured
2026-10-26: the first development address tried was referenced by both, which the old single-database
check would have called safe to delete.

It checks that link **twice**: by `firebaseUid` and by the address itself. The uid is not enough. A
`firebaseUid` is copied from a token, so when an identity is deleted and re-created under the same
address the row keeps the old uid forever — measured 2026-10-26, all three development rows held uids
that no longer existed in Firebase. A uid-only check called a live, owned identity *safe to delete*,
which is the one outcome that cannot be repaired. `email` is unique, lower-cased and indexed, and it is
what registration collides on, so the address decides.

A third verdict covers the case where the damage is already done: `ORPHANED — identity already gone,
database row remains` (exit 1). That address cannot sign in and cannot register (`409 EMAIL_IN_USE`),
and deleting anything in Firebase cannot change it — the database row has to go first. It is reported
rather than counted as "0 deleted", because the run's promise was not met.

`--dry-run` prints the same plan and the same refusals; unknown addresses report `no identity` and are
skipped; it cannot delete a login you did not name.

## Part 7 — What runs by itself

CI runs, for the server: `typecheck`, `lint`, `check:extensions`, `check:specifiers`, the full test
suite and a boot smoke test; for mobile: `typecheck` and Jest; separately, the secret guard. Not
automatic, because they write or need your credentials: the seeders, cleanups, performance probes and
`audit-access.mjs`.

**Nothing watches the deployment.** `/api/health/ready` answers 200 only when the database is reachable
now; poll it every 5 minutes, alert after two non-200 answers, and optionally watch `/api/health` for a
climbing `counters.serverErrors` (the 2026-10-18 failure shape readiness cannot see). The counters are
per process (reset on restart) and public but contain no names, paths, users or messages.

## Part 8 — The whole list

**`server/`**

| Command | Does | Safe? |
|---|---|---|
| `npm start` / `npm run dev` | backend on 4000 / restarting on edits | ✅ |
| `npm run typecheck`, `lint`, `test:unit`, `test:db`, `test` | checks and tests | ✅ |
| `npm run check:extensions`, `check:specifiers` | module-graph plumbing | ✅ |
| `npm run audit:indexes` | are declared indexes really there | ✅ reads |
| `npm run backup:db` | recoverable copy (needs `BACKUP_DIR` outside the project) | ✅ reads; safe on production |
| `npm run restore:db -- --from=…` | put a copy back (needs `CONFIRM=restore-db`) | ⚠️⚠️ test/dev only; `--dry-run` |
| `npm run seed:demo -- --email=…` | sample data in your account | ⚠️ replaces that business |
| `npm run seed:demo -- --database=… --business=… --email=…` | the same in production | ⚠️ named business only; password untouched |
| `npm run cleanup:demo -- --email=… --business=…` | empty one tenant, keep its login (`--dry-run`) | ⚠️ scoped, verified |
| `npm run seed -- --plan=… --database=…` | any plan; **2 phrases** in development, **3** in production | ⚠️ resets that tenant's data |
| `npm run seed:accounts` | several accounts, no SKUs (`--accounts=…`) | ⚠️ those accounts only |
| `npm run seed:roles` | one login per role, ~900 documents | ⚠️ that fixture only |
| `npm run verify:roles -- --business=…` | 96 permission cells (`--signin` for a deployment) | ✅ |
| `npm run cleanup:roles` | remove the role fixture | ⚠️ scoped, verified |
| `npm run verify:demo -- --email=…` | read data back and check it | ✅ reads |
| `npm run seed:perf -- --size=N` | throwaway tenant, no login | ⚠️ that tenant only |
| `npm run seed:perf-tenant -- --database=… --size=N` | sign-in-able tenant in a named database | ⚠️ production-capable, own phrase |
| `npm run cleanup:perf` / `cleanup:perf-tenant` | remove those tenants, prove 0 remain | ⚠️ scoped |
| `npm run perf:measure`, `perf:golden` | query timings / answer fingerprints | ✅ reads |
| `npm run perf:turns` | real turns (`--login` for a deployment) | ⚠️ spends AI quota |
| `npm run ai:usage`, `ai:models`, `ai:check`, `ai:health` | cost, allowance, models, health | ✅ reads |
| `npm run cleanup -- --target=database --database=…` | wipe the named database (`--dry-run` first) | ⚠️⚠️ logins included; 2 phrases, 3 in production |
| `npm run cleanup -- --target=firebase --database=… --email=…` | only the named logins, checked in both databases | ⚠️⚠️ irreversible but guarded |
| `npm run cleanup:test-firebase` | delete every login in the approved project | ⚠️⚠️ irreversible |

**`mobile/`**: `npx expo start --dev-client`, `npm start`, `npm run android|ios|web`, `npm run
typecheck`, `npm run lint`, `npm test`, `npm run test:watch`, `npm run check:build-env`,
`node scripts/check-build-env.mjs --live` — all read-only or local.

**project root**: `node scripts/check-secrets.mjs`, `audit-access.mjs`,
`check-upgrade-watches.mjs`, `verify-label-barcode.mjs --html|--pdf --expect=…`,
`scripts/device/run.mjs` (read-only walk; `--journey=draft|stock|transfer --allow-writes` writes).

## Part 9 — When a command refuses

| Message | Meaning | Do |
|---|---|---|
| `set SEED_CONFIRM=<phrase> to proceed` | prove which seeder you meant | put that command's own phrase in front (`seed-demo-account`, `seed-accounts`, `seed-perf-ai`, `seed:perf-tenant`, `seed-roles`) |
| `no Firebase identity exists … and DEMO_ACCOUNT_PASSWORD is not set` | the address has no login | register it first (**recommended**) or set the password |
| `two confirmation phrase(s) are required to clean …` | a cleanup phrase is missing or wrong | set `CLEANUP_CONFIRM=cleanup:<target>` **and** `CLEANUP_DB_CONFIRM=<database>` |
| `three confirmation phrase(s) … CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` | production, and the third phrase is missing | add it **as well as** the other two |
| `--database is "…" but this process resolved "…"` | the shell resolves the other database | set `MONGODB_DB_NAME` (and `NODE_ENV=production` for production); do not retype the flag to match |
| `… is the test database … which "npm test" owns` | cleanup was aimed at the test database | `npm test` clears it; name development or production |
| `ORPHANED — identity already gone, database row remains` | a login was deleted for an address a database row still owns | clear the database first (`--target=database`); the row is what blocks it, not Firebase |
| `NOT VERIFIED (exit 2)` | could not look (database/account) | not a data problem; check the connection |
| `connect ETIMEDOUT …:27017` | network/DNS to Atlas; nothing was written | re-run; seen intermittently on 2026-10-25, succeeding on retry |
| `is inside the repository` (`backup:db`) | `BACKUP_DIR` inside the project | choose a folder outside it |
| `is not an approved restore target` | restore aimed elsewhere | test or development database only |
| `has SHA-256 … the manifest recorded …` | the copy is damaged; **nothing was restored** | take a fresh copy |

← [Guides index](README.md) · Related: [4. Test accounts](4-test-accounts-and-mock-data.md) ·
[5. Words explained](5-words-explained.md)
