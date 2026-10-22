# 6. Every script, explained

**What this guide gets you:** a plain list of every command this project ships, what each one does
in ordinary words, the exact line to type, what you should see, and whether it can harm anything.

It is the companion to [Guide 4](4-test-accounts-and-mock-data.md): Guide 4 explains *how accounts
and data fit together*; this one is the *command reference*. Read Guide 4 first if you have not.

---

## How to read a command

Every command in this guide has three parts. Once you can see them, none of them look like
gibberish:

```bash
cd C:/Users/jeffe/inventory-ai/server                          # 1. go to the right folder
SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=x@y.z   # 2. setting  3. command
```

| Part | What it is | How to recognise it |
|---|---|---|
| `cd …` | **Where** you must be standing. A command only works from its own folder | The line starts with `cd` |
| `NAME=value` | A **setting for one command only** — it disappears when the command ends | Text on the left, before `npm` or `node` |
| `npm run name` / `node file` | The **command itself**, and often an option after it | `npm run …` or `node …` |

Three details that explain most confusion:

- **`--` separates npm from the script.** On the line `npm run seed:demo -- --email=x@y.z`, everything
  after the `--` is an *option for the script*, not for npm. Forget the `--` and npm swallows the
  option and complains about an unknown flag.
- **Options are written `--name=value`.** For example `--size=1000` or `--email=me@example.com`.
- **Where you type it matters.** `server/` commands assume you are in `server/`; `mobile/` commands
  assume you are in `mobile/`; the three commands in Part 5 are typed from the project root. Each
  block below starts with the exact `cd` line.

> **On Windows with PowerShell**, `NAME=value npm run …` is not valid and must be split into two
> lines first: `$env:SEED_CONFIRM="seed-demo-account"` then the command, then `$env:SEED_CONFIRM=$null`
> to tidy up. In **Git Bash** the one-line form works as written. If a command complains that a
> phrase is missing, this difference is almost always why.

---

## Part 1 — Starting things

### `npm start` — start the backend

```bash
cd C:/Users/jeffe/inventory-ai/server
npm start
```

Runs the backend, which holds the business rules and talks to the database. **You should see** a
couple of database lines and then the port it is listening on — **4000**. Leave the window open.

### `npm run dev` — the same, but self-restarting

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run dev
```

Identical to `npm start`, except it watches the `server/` folder and restarts by itself when you
edit a file. Handy while changing backend code; for everything else, `npm start` is fine. Stop either
one with **`Ctrl+C`**.

### `npx expo start --dev-client` — start the app's code server

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx expo start --dev-client
```

Serves the app's code to a phone (that server is called **Metro**). Press **`a`** to open the app on
a connected Android phone. [Guide 2](2-run-on-your-phone.md) covers the phone side; nothing here
works without the backend from Part 1 also running.

### The other ways to start the app

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npm start          # same as npx expo start (no --dev-client)
npm run android    # expo start --android
npm run ios        # expo start --ios   (needs a Mac)
npm run web        # expo start --web   (opens in a browser)
```

---

## Part 2 — Checking your work (safe, read-only)

These do not change any data. They are the commands to run when you have edited code and want to
know whether you broke something.

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run typecheck        # checks the code is written consistently; prints nothing when clean
npm run lint             # checks for likely mistakes; prints nothing when clean
npm run test:unit        # the fast tests; needs NO database
npm test                 # every test, including ones that use a database
npm run test:db          # only the database-using tests
npm run check:extensions # catches a half-finished file rename
npm run check:specifiers # catches an import that points at nothing
```

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npm run typecheck        # same idea, for the app
npm run lint
npm test                 # the app's own test suite
npm run test:watch       # re-runs the tests automatically as you edit
npm run check:build-env  # will a phone build have the settings it needs?
node scripts/check-build-env.mjs --live   # the same question, including EAS (needs a sign-in)
```

**How to read the result:** the tests end with a summary line, where `0 failures` is a pass.
`typecheck` and `lint` are **silent** when clean — no output at all is the good outcome. The two
`check:` commands are the exception: they print an explicit `OK` line with counts.

**About the database tests.** `npm test` and `npm run test:db` need the database. They use their own
**throwaway** database (`inventoryai_test_db`) and there are guards that refuse to point them at
your real data. If the database cannot be reached, a DB test **fails loudly** rather than being
quietly skipped — a green run always means the tests really ran.

### The label barcode — does it decode?

A product label's barcode is drawn as vector bars, and a label whose bars are clipped or the wrong
width prints perfectly and cannot be scanned. From the **project root**:

```bash
node scripts/verify-label-barcode.mjs --html --expect=2000053337540
node scripts/verify-label-barcode.mjs --pdf=scripts/fixtures/label-2000053337540.pdf --expect=2000053337540
```

The first decodes the label the app generates **right now** and also checks its geometry against the
page — both 11-module quiet zones, and a page big enough to hold the label (a decode alone cannot see
either defect, and both were real). The second decodes a **real** printed PDF (the fixtures record two
that a phone produced, one either side of the quiet-zone fix). Both print what they found — code,
module count, bar count, module width — and exit `0` only on a match. The decoder's own must-fail controls
(clipped, thickened, stray bar, damaged digit) run first on every invocation, so a decoder that had
stopped catching problems fails before it can report on a label. `2` means it could not look (a
missing file) and is never a pass. This runs in CI with the app's tests; it is also what to run after
a device print, replacing the fixture path with the file you just exported.

### A phone pass you can re-run — `scripts/device/run.mjs`

The device acceptance pass used to be a hand-written list of `adb input tap` coordinates, which only
worked on the screen they were measured on and left nothing behind. It is now a script. From the
**project root**, with the phone connected, the development build installed and the tunnels up
(`adb reverse tcp:4000 tcp:4000` and `adb reverse tcp:8081 tcp:8081`):

```bash
node scripts/device/run.mjs --list                      # what can be run
node scripts/device/run.mjs --self-test                 # the harness's own controls; needs no phone
node scripts/device/run.mjs                             # the read-only walk over every main screen
node scripts/device/run.mjs --all --product=<id>        # the walk + print a label and decode its PDF
node scripts/device/run.mjs --journey=draft --allow-writes   # create a draft purchase order
node scripts/device/run.mjs --journey=stock --product=<id> --source="Shop Front" --allow-writes
node scripts/device/run.mjs --journey=transfer --product=<id> \
  --source="Shop Front" --destination="Main Warehouse" --allow-writes
```

The two stock journeys are **net-zero**: `stock` moves 5 in and 5 out, `transfer` moves 1 across and 1
back, and each checks the app's own confirmation arithmetic (`33 → 38`, `33 → 32, 32 → 33`) instead of
a hard-coded quantity — so running them on every build does not drift the tenant and the tenth run
still means something. They are write journeys, hence `--allow-writes`.

**A pass means data, not just screens.** The smoke walk's `expectData` steps wait for labels only the
server's data can produce — a stock row's `33 available · 33 on hand`, a product row's `SKU … ·
Barcode …` — and fail when the screen shows its error state instead. This was added on 2026-10-22
after a run reported **17/17 on a phone where every request was refused `401`**: every assertion was
a heading, and a heading renders over an empty list. If a run stops at `expect stock rows on screen`
with *"the screen is showing its error state"*, the app could not reach the API — check
`curl http://localhost:4000/api/health` and the `tcp:4000` tunnel first. An **empty** tenant blocks
that step (`exit 2`, *"nothing to prove"*) rather than passing it.

It drives the app by **route** (`inventoryai://dashboard`) and by the **label a person reads**, not by
coordinates, so the same journey works on a different screen size. Each run writes `report.md`,
`report.json` and screenshots into `docs/evidence/device-runs/<timestamp>-<journey>/`, and prints one
line per step. Exit codes are the repository's: **0** every step passed, **1** a step failed (the app
did something wrong), **2** a step was **blocked** — no device, no signed-in session, no debuggable
build, no artifact — and a block is never reported as a pass. `--until=<n>` stops after step `n` and
writes the screen to `state.json`, which is how a journey that fails mid-form gets debugged without
another guessing session.

The `label` journey needs a product whose barcode is a 13-digit EAN-13, so it takes `--product=<id>`.
It reads the code **off the screen**, taps *Share PDF*, then decodes the PDF the phone wrote and
fails if the two disagree — the same decoder CI uses. Its PDF is read with `adb exec-out`: plain
`adb shell cat` runs the file through the phone's shell, which rewrites every newline and turned a
correct label into "contains no decodable EAN-13" on the harness's first run.

**What a pass does not mean:** iOS (still unverified, no macOS here), paper (no printer — the PDF
decode rules out clipped bars, but it is not a scan of paper), and the camera (a barcode in the room
was read by hand: a *Clearance Multi-Purpose Wipes* pack scanned to the record entered for it). The
journeys prove the screens render, the routes work, the print path writes a decodable PDF and a form
submits; a person still looks at the screenshots.

**About `check:extensions` / `check:specifiers`.** These are plumbing checks that catch a specific
kind of half-finished edit (a file renamed but its import lines not updated). When clean they print
a line beginning `[check-module-graph] … OK` with a count of what they scanned, then exit `0`; a
failure names the file and the line. You will rarely need them; they are listed so a failure is not
a mystery.

---

## Part 3 — Putting sample data in (and taking it out)

There are **two different seeding tools**. They do genuinely different things, and one of them can
also create a brand-new signable account. Pick by the outcome you want:

| You want | Use | Login needed? |
|---|---|---|
| **Data inside the account you sign in with** | `seed:demo` | Yes — it uses your existing login |
| **A throwaway test tenant you measure against** | `seed:perf` | No — it never signs in |
| **A small, fully known demo tenant** (6 products / 3 locations / 112 units) | `seed:demo-tenant` | It creates the login — sign in as `demo-preview@example.invalid` |
| **Removing that demo tenant** | `cleanup:demo-tenant` | No — it deletes the tenant's rows only |
| **A brand-new signable test account** | `seed:demo` with a new email + a password setting | Yes, and it creates the login |

### A. Seed *your personal account* — the one you sign in with

Your account on this machine is **`jefferndullamalinaozxc@gmail.com`** (role `OWNER`). To fill it
with a large, realistic inventory dataset:

```bash
cd C:/Users/jeffe/inventory-ai/server
SEED_CONFIRM=seed-demo-account npm run seed:demo -- --email=jefferndullamalinaozxc@gmail.com
```

- **`--email=`** must be the address you sign in with. The address is used to look up your identity
  in **Firebase** (the sign-in service), and the business is then found through that identity's
  hidden id — never through the email itself. That is why the address has to be the real one.
- **Optional `--total=80000`** — roughly how many documents to write. It must be between **100** and
  **400000**, and the number is a real target, not a hint: the script hits it and prints the total it
  actually produced.
- **Optional `--seed=1`** — a number that makes the dataset **identical on every run**. Useful,
  because then two measurements describe the same business.

**What you should see:** an `account` line, a `tenant` line naming your business, a `reset` line if
data was replaced, a block of counts, and a final `OK` with `TOTAL 80000 (target 80000)`.

**What it does, plainly:** it does **not** create anything new if your account already exists. It
**deletes only the data of the one business that account owns**, then writes the new dataset. Your
login is untouched, your other data is untouched, and no other business can be reached — every
delete is filtered by your business's hidden id. Running it twice is safe: the second run replaces
the data with the same dataset, which is exactly how you get a clean slate.

**Only the first time, if the identity does not exist yet:** the script creates the login. Supply its
initial password through a setting — never on the command line, never in a file:

```bash
cd C:/Users/jeffe/inventory-ai/server
DEMO_ACCOUNT_PASSWORD='a-password-you-choose' SEED_CONFIRM=seed-demo-account \
  npm run seed:demo -- --email=new-tester@example.com
```

### B. Create an extra test account you can sign in with

There is no separate "create a user" script, and that is deliberate — the product's rules forbid
deleting users, so a pile of half-made accounts is a liability. **A test account is created by the
same command as A, with a new address:**

```bash
cd C:/Users/jeffe/inventory-ai/server
DEMO_ACCOUNT_PASSWORD='choose-a-strong-password' SEED_CONFIRM=seed-demo-account \
  npm run seed:demo -- --email=tester-1@example.com --total=500
```

That single command gives you **three** things at once:

1. a **Firebase login** for that address, marked verified;
2. a **MongoDB user + business** linked to that login by its hidden id, with role `OWNER`;
3. a **small seeded dataset** inside that business.

You can then sign in to the app with that address and password, and it lands in its own data. **Rules
of thumb:** use a different address for each tester, keep the address one you can throw away (the
app's own rules never let an account be deleted cleanly), and remember that this account and your
personal account have **completely separate data** — they are two different businesses.

> **The one irreversible mistake in this guide.** Do **not** delete a login from Firebase while its
> database record still exists. The two halves then disagree, nothing can repair it, and that address
> can never sign in or register again. Part 6 covers the command that does this — read it there.

**The other kind of test account — data only, no login.** `seed:perf` (next section) creates a tenant
whose owner is `perf-seed-ai@example.invalid`. It has **no Firebase identity**, so it can never be
signed into from the app. It exists purely to be measured against. Do not confuse the two.

### C. Check that the seed really did what it claimed

A script printing its own counts is evidence about the *script*. This one reads the rows back out of
the database:

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run verify:demo -- --email=jefferndullamalinaozxc@gmail.com
```

**It only reads** — it cannot damage anything. It prints the account, independent counts, the
ledger check (every stock movement must satisfy the arithmetic its own type implies), referential
integrity (no row may point at a product that does not exist) and the stock-health spread.

Its **exit code** is a contract, which matters if you ever script it:

| Exit code | Meaning |
|---|---|
| **0** | Everything checked out |
| **1** | A real problem was found — broken arithmetic, a negative quantity, a dangling reference |
| **2** | **Could not check** — the database was unreachable, or there is no such account. This is *not* a data problem, and the tool says so explicitly, so you do not go hunting for a bug that is not there |

If the numbers look wrong to you, that is the tool working: it is showing you the truth for whatever
you actually seeded, including anything added in the app since.

### D. A throwaway tenant, for measuring performance

This creates one self-contained business, clearly named
`PERF SEED — AI assistant stress test (do not use)`, with **no login attached**:

```bash
cd C:/Users/jeffe/inventory-ai/server
SEED_CONFIRM=seed-perf-ai npm run seed:perf -- --size=1000    # size = number of products (1–200000)
SEED_CONFIRM=seed-perf-ai npm run cleanup:perf                # remove exactly that tenant
```

The seeder prints a **`businessId`** on its last lines — copy it; Part 4's commands need it.
`cleanup:perf` deletes only that tenant, **re-queries to prove nothing is left behind**, and reports
`0 remaining`. It is safe to run when nothing was ever seeded — it says `nothing to clean` and exits
cleanly. Nothing else in the database can be reached from it, even if it were handed a wrong id.

### E. Seed *several* accounts at once — and leave the barcodes blank on purpose

`seed:accounts` fills **several accounts in one command**, each with its own size. Unlike `seed:demo`
it **does not generate SKUs or barcodes**, which is the point: it leaves the app's own barcode
generation as the thing that assigns a code first, so you can watch that feature work.

```bash
cd C:/Users/jeffe/inventory-ai/server
SEED_CONFIRM=seed-accounts npm run seed:accounts -- --dry-run   # show the plan; writes nothing
SEED_CONFIRM=seed-accounts npm run seed:accounts                # seed the three default accounts
```

- **`--dry-run`** prints the plan and stops. It still runs the safety guard, so it proves the database
  and the confirmation phrase are right — not merely the shape of the plan.
- **`--accounts="a@x.com:5000,b@x.com:44000"`** replaces the plan. Each entry is `address:documents`.
  A size is **required** for every entry; a guessed one would show up later as an unexplained
  difference between two accounts, which is exactly what this tool exists to make trustworthy.
- **`--include-sku`** generates SKUs and barcodes after all (then barcode generation has nothing left
  to do).

| What the plan changes | Meaning |
|---|---|
| account **sizes** (`:5000`) | how many **documents** that account gets; products land at roughly 22 % of it |
| `--seed` (default 1) | the number that makes a dataset reproducible |

**Why the default sizes differ.** The default plan is three accounts at three very different sizes,
because *"is the assistant slower on a bigger account?"* is a question three identical accounts cannot
answer. `small` ≈ 5,000 documents, `medium` ≈ 44,000, `large` ≈ 225,000 (roughly 1,100 / 9,900 /
50,600 products). The large tier is deliberately that size because an earlier measurement in
`docs/DEVELOPMENT_ROADMAP.md` (§27BG) could only go up to 10,000 products and recorded "above that is
still unmeasured".

**What it guarantees:**

- **Each account is its own business**, and every row is written with that account's own id, so the
  three datasets cannot see each other. The script **refuses to continue** if two accounts in the plan
  resolve to the same business — the whole comparison would be void, so it is checked rather than
  assumed.
- **Only the accounts in the plan are touched.** A re-run resets those accounts' data first, so running
  it twice is safe and gives the same dataset.
- **It never deletes a login**, and it only ever *creates* one if you supply `DEMO_ACCOUNT_PASSWORD`.
  If an address has no login yet it **stops and tells you** rather than guessing — which is what you
  want if you intend to register that address in the app yourself.

**What you should see:** one block per account, then a table of **products**, **documents** and the
**`businessId`** for each — and the exact `perf:measure` command to compare them.

> **Good to know:** an account that has **never been signed in to** will still have its data, because
> the seeder attaches the dataset to the account behind the address. Sign in once to see it in the app.

### F. One login per role — for checking permissions, with no verification code

`seed:roles` creates a **single small tenant** that holds **one working account per role** — OWNER, ADMIN,
MANAGER and STAFF — so each role can be signed into on the phone and compared against the others **on the same
data**. Four separate tenants would make a missing button indistinguishable from an empty dataset.

```bash
cd C:/Users/jeffe/inventory-ai/server
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles npm run seed:roles -- --dry-run
ROLE_TEST_PASSWORD='choose-a-password' SEED_CONFIRM=seed-roles npm run seed:roles
```

The four addresses are fixed, and are all in the reserved `example.invalid` domain, which **cannot receive
mail**:

| Role | Address |
|---|---|
| OWNER | `role-owner@example.invalid` |
| ADMIN | `role-admin@example.invalid` |
| MANAGER | `role-manager@example.invalid` |
| STAFF | `role-staff@example.invalid` |

All four share the password you put in `ROLE_TEST_PASSWORD`. Sign in on the phone with any of them, exactly as
a normal user would.

**No six-digit code is needed, and nothing is weakened to avoid it.** The login is marked verified through
Firebase's admin interface — the *same* write the app performs after a real code is confirmed — and nothing
about the app's verification rules changes: a normal account still has to verify its email, and these addresses
could never receive a code anyway. The command refuses to run outside the development database, and it only
ever touches those four addresses.

**What it creates:** a tenant named `ROLE TEST — role boundary fixture (do not use)` with about **900
documents** (roughly 200 products, 2 locations, suppliers, purchase orders and stock history), so every screen
has something on it. The seeder **reads its own numbers back** and fails if the database disagrees.

**Prove the permissions, not just the logins** (the backend must be running):

```bash
SEED_CONFIRM=seed-roles npm run verify:roles -- --business=<the id the seeder printed>
```

It signs all four in and checks **96 cells** — every route against every role, plus the user-management rules
(can ADMIN create another ADMIN? can ADMIN change its own role?) — and prints one line per route with `allow`
or `deny` for each role. It exits **0** only when every cell matches the app's own role table. Add `--signin`
(with `FIREBASE_WEB_API_KEY` and `ROLE_TEST_PASSWORD` set) to prove the real **phone sign-in path** too,
rather than a session minted on the server.

**Remove it when you are done:**

```bash
SEED_CONFIRM=seed-roles npm run cleanup:roles
```

It removes that tenant and **proves nothing is left**; it re-queries rather than trusting its own report. The
four Firebase logins are **kept** by default — that is the safe direction, because deleting a login whose
database record still exists is the one irreversible mistake in this guide. `--delete-firebase` removes them
too, but only after the database is gone and only after re-checking that nothing points at them.

> **Note on ADMIN:** no screen or route is closed to ADMIN that is open to OWNER — the two capabilities ADMIN
> lacks (business settings and role administration) have no screens yet. ADMIN's real restriction is visible in
> **Users**: it cannot create another ADMIN, cannot change its own role, and cannot edit an ADMIN or the OWNER.
> That is the difference to look for when comparing OWNER with ADMIN.

---

---

## Part 4 — Measuring the assistant

These answer *"how fast is it, really?"* and *"how much of the allowance is left?"*. The three that
ask the database need a `businessId`, and they refuse without one — the throwaway tenant's is printed
by `seed:perf`, and your own account's is printed by `verify:demo`. All of them are **read-only
against the database**, and only `perf:turns` spends AI quota.

| Command | What it measures |
|---|---|
| `npm run perf:measure -- --business=<id>` | How long each of the assistant's data queries takes — **no AI calls at all**, so it costs nothing |
| `npm run perf:golden -- --business=<id> --out=before.json` | Records the exact answers those queries produce, with a fingerprint of each |
| `npm run perf:turns -- --business=<id> --only=2` | One or two **real** assistant conversations, timed end to end |
| `npm run ai:usage -- --log=<path>` | What the assistant has actually cost and how it failed — **no AI calls, no database, no quota** |
| `npm run ai:usage -- --provider-only` | **Just the allowance left today** — no log, no database, no model call, no quota |
| `npm run ai:models` | The configured chain with each model's **live endpoint status and 5m/30m/1d uptime**, then the free tool-capable ids you can add — **no completions, no quota** |
| `npm run ai:models -- --check=<id>` | That model's live endpoint health, then whether ONE id answers a tool-shaped request, before you add it — **one request** |
| `npm run ai:check` | The configured primary (and chain) verified against the provider's catalogue — free; `-- --probe` proves each with one tool-shaped request |
| `npm run ai:health` | One scheduled model-health check, in the terminal — quota-free endpoint GETs; exit 0 healthy, 1 unavailable/degraded, 2 could not check; `-- --alert` sends the alert |

### Changing the AI models yourself

The model list is **configuration, not code**. Two variables in `server/.env` (and the same two in
the deployed host's environment) are the whole of it:

```bash
# the model every turn starts on — measured healthy (100% endpoint uptime, 6/6 grounded
# inventory turns) and therefore first
AI_MODEL_OPENROUTER=nvidia/nemotron-3.5-lightning:free

# the chain a turn falls back through, in preference order, comma-separated (max 5);
# the primary is skipped automatically, so it does not need to be repeated here.
# Order follows the same measurement: healthy second, degraded later, dead last.
AI_FALLBACK_MODELS_OPENROUTER=nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3.5-super-vl:free,liquid/lfm-2.5-2.6b:free,nvidia/nemotron-3-super-120b-a12b:free
```

1. **See what is available:** `npm run ai:models` prints the configured chain with each model's
   **live endpoint health** — the provider's own status code and its uptime over the last 5 minutes,
   30 minutes and 1 day — then lists the ids you could add (free ones that declare tool support).
   The health read is a GET, so it spends **no completion and no quota**.
2. **Try one first:** `npm run ai:models -- --check=nvidia/nemotron-3.5-lightning:free` reads that
   model's endpoint health, then sends a single tool-shaped request. A model that cannot call tools
   cannot read inventory, so it is worth one request before it becomes part of the chain.
3. **Edit the line** — reorder it to change priority, delete an id to drop it, add ids to try them. The
   primary is skipped automatically wherever it appears, and duplicates are collapsed.
4. **Restart the server** (`Ctrl+C`, then `npm start`, or `npm run dev`). `.env` is read at boot, so a
   saved file does nothing until the process restarts; source edits under `npm run dev` do not reload
   it either.
5. **Verify:** `npm run ai:check` — and `npm run ai:check -- --probe` when you want each configured
   model proven to answer (one request each).

**How to choose the order.** Put the model with the best *measured* behaviour first — uptime alone is
not enough, because a model can be up and still answer inventory questions badly. `npm run ai:models`
now shows the provider's endpoint status and 5-minute, 30-minute and 1-day uptime beside each
configured model, so the first half of that judgement needs no separate script. The second half is a
real turn on your own tenant (`npm run perf:turns`), which shows whether its tool calls ground the
numbers. A degraded model belongs below a healthy one, and a model reported at `status: -5` (no live
endpoint) belongs last. The configured order is a snapshot of that judgement, not a permanent
ranking: re-measure when answers slow down or start failing, and move the ids rather than editing
code.

On the deployed server there is no file to edit: set the same two variables in the host's environment
and redeploy. Nothing else changes — no code, no migration, no mobile build.

**On Render, a plain restart is not enough.** A changed environment variable belongs to the next
**deploy**; a restart keeps the environment the deployment started with. Measured 2026-10-21: after
changing the primary from `super-vl` to `lightning`, a restart still served `super-vl`, and the next
deploy served `lightning`. Trigger a deploy after editing the variables, then confirm with the AI-5
turn line (`model=…`).

Two more optional variables decide when a model is rested, if the defaults are not what you want:

```bash
# how many consecutive availability failures open the cooldown (default 5)
AI_MODEL_FAILURE_THRESHOLD=5

# the first cooldown, in milliseconds (default 30000); repeated failed trials back off
# 30 s, 60 s, 2 min, 4 min, then no more than every 5 min until the model answers again
AI_MODEL_COOLDOWN_MS=30000
```

**What happens by itself.** When the active model fails five times in a row it is skipped for the
cooldown and the next configured model serves the turn. Once that model answers, it becomes the
**active** model for later turns — the configured default is not edited and still comes back after a
restart. A cooled model is retried when its window ends; one success puts it back in the rotation,
and one failure re-opens its cooldown immediately (so a permanently dead model costs one probe per
window, not one per question). If every configured model is cooling, the assistant answers its
normal temporary-unavailability message without spending a request. A quota refusal (429/402) is
never treated as a model outage — the daily free allowance is shared by every model, so switching
cannot help and the turn says so.

### What watches the models (AI-34)

Nothing used to notice a dead model until a member asked a question. The **model-health watchdog**
now runs inside the server in production, once every 30 minutes, and reads the provider's own
endpoint-health API for the primary and every configured fallback:

```text
GET /v1/models/{author}/{slug}/endpoints
```

That is a **GET, not a completion**, so it spends none of the free tier's daily request allowance.
A model is:

- **ok** — a current endpoint reports status 0 and its best 5-minute uptime is at least 90% and its
  best 30-minute uptime is at least 95%;
- **degraded** — an endpoint is down while another is up, an uptime window has fallen below its
  threshold, or no endpoint reports status 0 but a recent uptime is still measurable (a negative
  status with 100% five-minute uptime means *serving badly*, not *dead*);
- **unavailable** — the provider publishes no endpoint, or none reports status 0 and no recent
  uptime is measurable;
- **unknown** — the health record could not be read. This is **not** called an outage, because the
  check itself may be the broken thing. Two consecutive unreadable checks alert that the check
  cannot run, and a later success reports the recovery.

The watchdog alerts **only when the state changes**: one message when a model goes down or starts
degrading, one when it recovers, and silence while nothing moves. A restart forgets the previous
state, so a still-broken model produces one alert on the first check after the restart. That is
deliberate for a single-instance deployment; there is no shared store for this state.

**Where the alert goes.** Set the operator address and it is emailed through the same Brevo mail
boundary that delivers verification and reset mail:

```bash
# the alert recipient; leave empty and the alert is written to the server log at error level
AI_HEALTH_ALERT_EMAIL=owner@example.com

# optional; the defaults are shown
AI_HEALTH_WATCH_ENABLED=true            # production defaults on; development/test off
AI_HEALTH_WATCH_INTERVAL_MS=1800000     # 30 minutes
AI_HEALTH_WATCH_INITIAL_DELAY_MS=60000
AI_HEALTH_MIN_UPTIME_5M=90
AI_HEALTH_MIN_UPTIME_30M=95
AI_HEALTH_UNKNOWN_ALERT_AFTER=2
```

Set these in the host's environment, not in a committed file. On Render a changed variable applies
on the **next deploy**, not a restart. If mail is not configured, the alert is still logged — the
watchdog never decides that an undeliverable alert is no alert.

**Run the same check once, without waiting for the timer:**

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run ai:health                  # print the state; send nothing
npm run ai:health -- --alert       # send the alert too, if a problem was found
```

It exits **0** healthy, **1** a model is unavailable or degraded, **2** the check could not run.
A 2 is never a pass. This is also the command to use from an external scheduler if the host sleeps
and the in-process timer therefore does not run; in that case `--alert` sends on every run that
finds a problem, because a one-shot process has no previous state to compare.

**What it cannot do.** A free hosting instance that sleeps stops checking while it sleeps. The
watchdog watches the *model chain*, not the deployment: `/api/health/ready` and the 5xx counters are
still the signals for "is the service itself healthy?" (Part 7).

### Measuring turns, latency and answer changes

```bash
cd C:/Users/jeffe/inventory-ai/server

# how fast are the data queries, with no AI cost?
npm run perf:measure -- --business=PUT_THE_BUSINESS_ID_HERE --iterations=7 --label=before

# did a change alter the answers? capture before, change, capture after and compare
npm run perf:golden -- --business=PUT_THE_BUSINESS_ID_HERE --out=before.json
#   ... make your change ...
npm run perf:golden -- --business=PUT_THE_BUSINESS_ID_HERE --out=after.json --compare=before.json

# ask the assistant two real questions (the backend must be running on port 4000)
npm run perf:turns -- --business=PUT_THE_BUSINESS_ID_HERE --only=1,3
```

- **`--iterations`** (perf:measure) is 1–200, default 7. **`--label`** just names the run in the
  output.
- **`perf:golden --compare`** exits **0** when every answer is byte-for-byte identical, **1** when
  something differs, **2** when the two captures are from *different* tenants (a re-seed creates new
  ids, so differences are then expected and this deliberately says "cannot compare" instead of
  crying wolf).
- **`perf:turns` spends real AI quota.** The service behind the assistant allows only a small number
  of requests per day in total, so keep the question list short and use `--only=` to re-check one
  question instead of all of them. It defaults to `http://localhost:4000`; `--base=` overrides that,
  and `--out=` says where to save the answers.
- **`perf:turns` reads the allowance before it spends it.** It asks the provider for the day's
  remaining free-model requests and, when there are **provably** too few for the questions selected,
  refuses with exit **2** — before a session is minted and before anything is sent — naming the
  numbers and the window (`00:00 UTC`). A reading it could not make (no key, no network, an
  unfamiliar body) never blocks a run: the numbers are printed and the run continues, because a
  diagnostic that cannot see must not pretend to know. `--force` overrides a refusal. Note what it
  does **not** guarantee: a turn with tool rounds costs more than one request, so the check only
  catches the run that cannot possibly fit — a run can still meet a `429` mid-way.
- **`ai:usage` is the one to run *before* spending anything.** It reads two things that cost nothing
  and joins them. **The log** — the server's own per-turn lines (`[ai] turn …`, written for every turn
  including the ones that fail) — gives turns, which ones failed and how, how many provider
  **requests** they cost and the provider-versus-tools time split. **The database** (`--db`) gives the
  turns that were *answered*: `AIMessage` has always persisted the model, the tools used, the
  provider's token usage and (since AI-8) whether the turn was degraded, so those figures need no new
  field and no log sink. Then it asks the AI provider's own account how much of the daily free
  allowance is left. Nothing is called and nothing is written, which is what makes it free to run
  whenever the question comes up.

  `--log=<path>` reads a saved log and **stdin** reads a pipe; `--db` reads the database and is
  **opt-in** (no flag, no connection), scoped by `--days=N` (default 7) and `--business=<id>`;
  `--no-provider` keeps it fully offline; `--json` prints the same figures as one object;
  **`--provider-only`** prints the allowance and nothing else, and is the one form that needs no log
  at all (it used to be impossible to ask "is there quota?" without first producing a log). The two
  halves are **complements, not alternatives**: a failed turn persists nothing, so timeouts,
  abandonment, output limits and quota refusals appear only in the log.

```bash
cd C:/Users/jeffe/inventory-ai/server

# what has the assistant cost, and what is left today?   (nothing is spent)
npm run ai:usage -- --log=server.log

# the same, straight off a running server's output
npm start | npm run ai:usage --silent --

# what has actually been ANSWERED, over the last 30 days — straight from the database
npm run ai:usage -- --db --days=30
```

  **The log has to come from somewhere, because there is no durable copy of it.** A turn line and
  the empty-completion line are written to the server's stdout and never stored, so the failures
  that persist nothing — a timeout, an abandoned turn, a quota refusal — exist **only** there, and
  the database half cannot show them (the report says so in place). `logs/` is already ignored by
  git, so keeping one is a redirect and nothing else:

```bash
cd C:/Users/jeffe/inventory-ai/server

# a fresh clone has no logs/ directory, and the redirect fails without one
mkdir -p logs

# start the server with its output going to a file you can read back later
npm start > logs/server.log 2>&1

# ...and then, whenever the question comes up: nothing is spent, nothing is written
npm run ai:usage -- --log=logs/server.log

# the turns that FAILED (a turn line is written on every exit, including the ones that throw)
grep '\[ai\] turn outcome=' logs/server.log | grep -v outcome=ok

# the 2xxs that carried nothing at all — one line per occurrence, with the body's SHAPE (AI-12)
grep 'empty completion' logs/server.log
```

  The last grep is the one to run first when an answer arrives as *"I could not generate a response
  right now."*: it names the model the request asked for, whether the body named a model and
  reported usage, which block types it carried, and which top-level fields it had — enough to tell
  "the model reasoned and produced nothing" from "the gateway answered with a body that is not a
  message". It never prints the body itself, so it is safe to paste into a record.

---

## Part 5 — Maintenance and safety checks (from the project root)

These three live in the project's `scripts/` folder **outside** `server/` and `mobile/`, so they are
typed from the project root with plain `node`:

```bash
cd C:/Users/jeffe/inventory-ai

node scripts/check-secrets.mjs              # fails if a credential shape appears in the tracked files
node scripts/audit-access.mjs               # checks the repository is still private and yours alone
node scripts/check-upgrade-watches.mjs      # reports whether a deferred upgrade is ready to start
```

- **`check-secrets.mjs`** is the project's only automated credential control (the repository is
  private, so GitHub's own scanning is not available). It proves its own rules can still *fail*
  first, then scans. **Read the script itself if you want the detail; to use it, just note that `0`
  means clean.** A deliberate exception can be waived on the line with the comment
  `secret-guard:allow`.
- **`audit-access.mjs`** needs the `gh` tool already signed in as you, and is deliberately **not**
  run automatically — in a pipeline the same endpoints answer `403`, which would be a useless "not
  verified". Run it by hand before and after anything that touches repository settings.
- **`check-upgrade-watches.mjs`** needs the network. It watches four things that are **waiting on
  other people to publish** — a new Expo SDK, the Jest version that comes with it, the linter that
  gates a TypeScript 7 upgrade, and a `decode-uri-component` release that is both patched and usable
  from CommonJS (the one open advisory that reaches a shipped bundle; its patched release is ESM-only,
  so applying it today breaks the app — see `SECURITY.md`). `--json` gives machine-readable output;
  `--self-test` runs only its own controls. A "READY" line is **news, not an error** — the exit code
  stays 0 unless one of its own checks is broken.

### `audit:indexes` — the database-index check

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run audit:indexes
```

Several performance and housekeeping features depend entirely on a **database index** existing for
real. The test suite can only prove an index is *declared in the code*; this command asks the
**database** whether it is actually there. **It is read-only** — it never creates, changes or drops
anything, on purpose (a tool that "fixes" indexes can drop one an operator added deliberately).

**You should see** a line per collection and an `OK`. There are **three outcomes**, and the difference
between the last two is the point:

| Exit code | Means | What to do |
|---|---|---|
| `0` | Every declared index is really there, in the right field order | Nothing |
| `1` | The audit **ran to completion** and found a declaration the database disagrees with | An operator should look. Deliberately **not** auto-fixed, because the fix can drop an index someone added on purpose |
| `2` | **NOT VERIFIED** — the audit could **not run** (no internet, database unreachable) | **Nothing is wrong.** Check the connection and re-run. **This is not a data problem** |

The `2` is deliberate: a network hiccup must never be reported as *"your indexes are wrong"*, because
the remedy for a real disagreement is a change to the database's index structure — and `2` is what
stops a blip from pointing anyone at that. `verify:demo` uses the same code for the same reason.

### `backup:db` — the recoverable copy, and `restore:db` — putting it back

```bash
cd C:/Users/jeffe/inventory-ai/server

# 1. Take the copy. The folder MUST be outside the project — see below.
BACKUP_DIR=C:/Users/jeffe/inventory-ai-backups CONFIRM=backup-db npm run backup:db

# 2. Look before you leap: checks every file, writes nothing. Safe against ANY database.
CONFIRM=restore-db npm run restore:db -- --from=<the folder it printed> --dry-run

# 3. Put it back — DISPOSABLE DATABASES ONLY (the test or development one).
CONFIRM=restore-db npm run restore:db -- --from=<a folder you have already dry-run>
```

The cluster this app runs on is Atlas's **free tier**, and MongoDB is blunt about it: free clusters
have **no backups at all** — the paid tiers do, and the documented answer for the free tier is a
`mongodump`. This pair is that dump, and it is the project's answer to *"what do we do if the data
is gone?"*.

**How it works, in one line each.** `backup:db` writes **one gzipped file per collection** plus a
`manifest.json` recording every file's length and its **SHA-256 fingerprint**. `restore:db` reads
that manifest, re-fingerprints every file, and only then drops and inserts — so a copy that was
truncated by a dropped connection fails **before** it can replace good data with bad.

| | `backup:db` | `restore:db` |
|---|---|---|
| Touches the database | **reads only** | **drops and rewrites** collections |
| Which database | any, including production | `inventoryai_test_db` or `inventoryai_dev_db` **only** |
| Folder | `BACKUP_DIR` (outside the project) | `--from=<folder>` |
| Phrase | `CONFIRM=backup-db` | `CONFIRM=restore-db` |
| `--dry-run` | — | verifies and reports, writes nothing |

**Three things that look like obstacles and are not.**

- **The folder must be outside the project.** A dump is a copy of real customer data; written inside
the repository it is one `git add` away from being committed and pushed. The command refuses such a
path rather than warning about it.
- **`restore:db` refuses production, by name and by shape.** Restoring is the most destructive thing
in this guide — it drops collections — so the target has to be one of the two throwaway databases,
and a name containing `prod` or `live` is refused even if you edited the list (you did not).- **A long restore prints its progress every 50 000 documents.** If a collection seems to stall, look
  for those lines before assuming it is stuck. On this project's throttled free-tier cluster the
  223 227-document `inventory` collection took **46 s**.
- **Watch the `size` line, because the disk copy tells you nothing about the fit.** The same drill
  measured the ceiling too: restoring the whole 525 750-document development database needs about
  **240 MB** of room, and this cluster is a 512 MB free tier, so the restore filled it and Atlas
  answered *"you are over your space quota, using 520 MB of 512 MB. Writes are blocked"*. The command
  reported that, exited `1`, and claimed nothing. **Nothing was lost** — the space was freed by
  dropping the test database, and the development data was never touched — but this is why the size
  is printed before the first write: an 11 MB copy can still be a 240 MB restore.

**The one habit worth forming:** restore the copy into the *test* database and run `npm test` against
it before you need it. That is the difference between a backup and a backup you have proved.

### Files that are not commands (you never type these)

For completeness, a few files in the `scripts/` folders look like scripts but are **shared code**, not
things to run:

| File | What it is |
|---|---|
| `server/scripts/perf/lib.mjs` | the code that defines what the performance tenant *is*, and the safety guard and tenant-teardown helpers every seeder and cleanup command shares. Opening it as a program does nothing — by design, so that reading it can never seed a database by accident |
| `server/scripts/seed/lib.mjs` | the code that shapes a seeded dataset (the seven collections). `seed:demo` and `seed:accounts` both call it, so the two seeders cannot drift apart. Opening it does nothing, for the same reason |
| `server/scripts/cleanup/lib.mjs`, `server/scripts/cleanup/run.mjs` | the guards and the guarded delete sequence behind every `cleanup:*` command. The guards live here so that the code being tested is the code that runs |

You will never type these directly; the commands in Part 6 already do. There is one more thing that
runs without being typed: **`npm install` inside `mobile/` also applies a small patch automatically**
(a `postinstall` step), so a fresh install is a complete install — you do not need a second command.

---

## Part 6 — The destructive commands

Everything here **permanently removes data**. Nothing is recoverable. Each one asks for a typed
confirmation phrase, and `--yes` **does not skip the phrase** — it only skips the typing prompt. The
phrase is always the command's own name, supplied as a setting:

```bash
cd C:/Users/jeffe/inventory-ai/server
CLEANUP_CONFIRM=cleanup:test-mongodb npm run cleanup:test-mongodb -- --yes
```

| Command | What it deletes | Risk |
|---|---|---|
| `npm run cleanup:test-mongodb` | Everything in `inventoryai_test_db` — the tests' scratch database | ✅ **Low.** It is throwaway by design |
| `npm run cleanup:perf` | The disposable performance tenant, and nothing else | ✅ **Low** (needs `SEED_CONFIRM=seed-perf-ai`) |
| `npm run cleanup:dev-mongodb` | **Everything, in every business, in `inventoryai_dev_db`** — including your account's data | ⚠️ **High.** Your login survives (Firebase is untouched, so you can still sign in), but the app will be empty |
| `npm run cleanup:test-firebase` | **Every login** in the development Firebase project, including yours | ⚠️⚠️ **Irreversible — read the next paragraphs first** |
| `npm run cleanup:prod-mongodb`, `npm run cleanup:all-mongodb` | Real data / every database | ⚠️⚠️ Requires a second, deliberately loud phrase: `CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA` |

**Two guards worth knowing, because they can look like the tool is broken.** The cleanup commands
refuse to run unless:
- the environment is **explicitly** `development` — unset or blank is refused on purpose, because
  "I could not tell where this would delete" is treated as "refuse", not "probably fine"; and
- the confirmation phrase matches the command exactly.

**Why `cleanup:test-firebase` is the dangerous one.** Delete a login while its database record still
exists and that address can **never sign in again** — and the app will not let you register it afresh
either, because it can see a record for that address already. The application has no way to repair
this, and it has happened here for real. So:

> **Clear MongoDB when you want a fresh start. Leave Firebase alone.**

Clearing the database frees the address, orphans nothing, and your login keeps working — you sign in
and get a brand-new empty business, exactly as a first-time user would. Same clean-slate outcome,
none of the risk. [Guide 4, Part 4](4-test-accounts-and-mock-data.md) walks through this in full,
including what to do instead of deleting anything.

### When you *do* need one specific login deleted

There is exactly one reason to delete a login rather than only the database: you are deliberately
testing the **registration** journey — sign-up, the 6-digit code, the business the app creates — on an
address that already has a login. That is what `cleanup:firebase-accounts` is for, and it deletes
**only the addresses you name**, on the **development** project (it checks the project id first).

```bash
cd C:/Users/jeffe/inventory-ai/server
CLEANUP_CONFIRM=cleanup:dev-mongodb npm run cleanup:dev-mongodb -- --yes          # 1. database first
CLEANUP_CONFIRM=cleanup:firebase-accounts npm run cleanup:firebase-accounts -- --yes \
  --email=one@x.com --email=two@x.com                                             # 2. THEN the logins
```

- **The order is the whole safety.** A database record whose login has been deleted can never sign in
  again, and the address cannot be re-registered either. So this command **refuses any address a
  database record still points at**, and refuses the **whole** run rather than part of it. Run it before
  step 1 and it stops with `REFUSED — still linked to a MongoDB user`, exit **1**, having deleted
  nothing — that is the guard working, not a broken install.
- `--dry-run` prints the plan and deletes nothing (it still runs the guard).
- Addresses with no login are reported as `no identity` and skipped; the run still succeeds.
- Unlike `cleanup:test-firebase` above, it **cannot** delete a login you did not name.

---

## Part 7 — What already runs by itself

You do not have to run the quality commands by hand to be safe: **CI** (the automated check that runs
on every push) already runs, for the server, `typecheck`, `lint`, `check:extensions`,
`check:specifiers`, the **full test suite** and a boot smoke test; for the mobile app, `typecheck` and
the **Jest suite**; and, separately, the **secret guard** over the tracked files.

That is why `check-secrets.mjs` and the module-graph checks rarely need running by hand, and it is why
a silenced test would be caught rather than admired. The commands that **do not** run automatically —
and should not, because they write or they need your own credentials — are the seeders, the cleanup
commands, the performance probes and `audit-access.mjs`.

### The gap that is not a command: nothing watches the running service

CI checks the code. **Nothing checks the deployment.** On 2026-10-18 the database was refusing writes
and five of the assistant's tools were answering errors while `/api/health/ready` reported `ready` the
whole time — and nobody would have been told. The code half of that gap is closed (the counters below);
the other half is one uptime check, and it takes about five minutes to set up:

1. **Poll this URL every 5 minutes:** `https://<your-deployment>/api/health/ready`. It answers `200`
only when the database is reachable **right now** and `503` when it is not, which is exactly the
question worth waking someone for.
2. **Alert when it is not `200` twice in a row** — once can be a deploy or a blip.
3. **Optionally watch `https://<your-deployment>/api/health`** (always `200`) and alert if
`counters.serverErrors` keeps climbing. That is the number that moves when requests are failing while
the process is still up — the 2026-10-18 shape of failure, which readiness cannot see.

The smallest service that does this is **[UptimeRobot](https://uptimerobot.com)** — a free tier, HTTP
monitors, and an email when a check fails; create the monitor, paste the URL, choose your address as
the alert contact, and nothing in this repository changes. (A cron job running `curl` on any machine
you own works too, if you would rather not have an account anywhere. Anything that tells you is better
than nothing, which is the current answer.) The **model chain** now has its own in-process watchdog
(above); this section remains about the **service** being up and answering, which the watchdog does
not replace.

**Two things to know about the counters** so they are read correctly:

- **They are per process and they reset when it restarts.** A deploy resets them to zero, so watch the
  **climbing**, not the total.
- **They are public, and deliberately contain no names** — a total, a by-class breakdown, a 5xx count,
  a timestamp. No path, no user, no tenant, no error message. The detail stays in the logs behind
  credentials; the healthy/unhealthy signal is the part an outside watcher needs.

---

## Part 8 — The whole list, in one table

**From `server/`**

| Command | Does | Safe? |
|---|---|---|
| `npm start` | start the backend (port 4000) | ✅ |
| `npm run dev` | start it, restarting on edits | ✅ |
| `npm run typecheck` | consistency check; silent = clean | ✅ |
| `npm run lint` | mistake check; silent = clean | ✅ |
| `npm test` | all tests (needs the database) | ✅ |
| `npm run test:unit` | tests that need no database | ✅ |
| `npm run test:db` | only the database tests | ✅ |
| `npm run check:extensions` | half-finished file-rename check | ✅ |
| `npm run check:specifiers` | broken-import check | ✅ |
| `npm run audit:indexes` | are the declared database indexes really there? | ✅ reads only |
| `npm run backup:db` | write a recoverable copy of a database (needs `BACKUP_DIR` outside the project) | ✅ **reads only** — safe against production |
| `npm run restore:db -- --from=…` | put a copy back (needs `CONFIRM=restore-db`) | ⚠️⚠️ **destructive** — test/development databases only, `--dry-run` first |
| `npm run seed:demo -- --email=…` | put sample data in **your** account | ⚠️ replaces that one business's data |
| `npm run seed:accounts` | seed **several** accounts, each at its own size, with **no** SKUs/barcodes | ⚠️ replaces those accounts' data |
| `npm run seed:roles` | one isolated tenant with **one login per role** (OWNER/ADMIN/MANAGER/STAFF) and ~900 documents | ⚠️ replaces that fixture tenant's data |
| `npm run verify:roles -- --business=…` | sign all four roles in and check **96 permission cells** | ✅ reads almost nothing; removes its own sessions |
| `npm run cleanup:roles` | remove the role fixture tenant (Firebase logins kept unless `--delete-firebase`) | ⚠️ scoped delete, verified afterwards |
| `npm run verify:demo -- --email=…` | read the data back and check it | ✅ reads only |
| `npm run seed:perf -- --size=N` | create the throwaway test tenant | ⚠️ writes that tenant only |
| `npm run cleanup:perf` | remove the throwaway tenant | ⚠️ scoped delete |
| `npm run perf:measure -- --business=…` | time the assistant's queries (no AI cost) | ✅ reads only |
| `npm run perf:golden -- --business=…` | fingerprint the assistant's answers | ✅ reads only |
| `npm run perf:turns -- --business=…` | real assistant turns | ⚠️ spends AI quota |
| `npm run ai:usage -- --log=…` | turns, failures and the allowance left | ✅ reads only (offline with `--no-provider`) |
| `npm run ai:usage -- --db --days=30` | what was **answered**, and its degraded rate | ✅ reads only |
| `npm run ai:usage -- --provider-only` | the free-model requests **left today** (AI-27: run it before `perf:turns`) | ✅ reads only |
| `npm run ai:health` | one model-health check (endpoint GETs only, no quota); `-- --alert` sends the alert | ✅ reads only |
| `npm run restore:db -- --from=…` | put a `backup:db` copy back | ⚠️⚠️ **destructive** — refuses production; `--dry-run` first |
| `npm run cleanup:test-mongodb` | wipe the test database | ⚠️ destructive, throwaway data |
| `npm run cleanup:dev-mongodb` | wipe the development database | ⚠️⚠️ **your data** |
| `npm run cleanup:test-firebase` | delete every development login | ⚠️⚠️ **irreversible** |
| `npm run cleanup:firebase-accounts -- --email=…` | **only the logins you name** | ⚠️⚠️ irreversible, but **checked** — refuses any address a database record still points at |
| `npm run cleanup:prod-mongodb`, `cleanup:all-mongodb` | real data | ⚠️⚠️ **never** |

**From `mobile/`**

| Command | Does | Safe? |
|---|---|---|
| `npx expo start --dev-client` | serve the app's code to a phone | ✅ |
| `npm start`, `npm run android`, `npm run ios`, `npm run web` | other ways to start it | ✅ |
| `npm run typecheck`, `npm run lint` | app consistency checks | ✅ |
| `npm test`, `npm run test:watch` | the app's test suite | ✅ |
| `npm run check:build-env` | are this project's build settings complete? | ✅ reads only |
| `node scripts/check-build-env.mjs --live` | …**and** what the EAS environment holds (names only) | ✅ reads only |

**From the project root**

| Command | Does | Safe? |
|---|---|---|
| `node scripts/check-secrets.mjs` | scan tracked files for credentials | ✅ |
| `node scripts/audit-access.mjs` | repository privacy/access audit | ✅ |
| `node scripts/check-upgrade-watches.mjs` | is a deferred upgrade ready yet? | ✅ (needs network) |
| `node scripts/verify-label-barcode.mjs --html --expect=…` | does the label the app draws decode as that EAN-13, and does its geometry fit the page? | ✅ reads only |
| `node scripts/verify-label-barcode.mjs --pdf=… --expect=…` | does a **printed** label PDF decode as that EAN-13? | ✅ reads only |
| `node scripts/device/run.mjs` | walks every main screen on a **connected phone** and writes a report with screenshots | ⚠️ needs the phone + tunnels |
| `node scripts/device/run.mjs --journey=draft --allow-writes` | creates one draft purchase order on the phone | ❌ **writes** to the tenant |
| `node scripts/device/run.mjs --journey=stock --allow-writes` | stock 5 in, 5 out, checking the arithmetic (net zero) | ❌ **writes** to the tenant |
| `node scripts/device/run.mjs --journey=transfer --allow-writes` | transfer 1 unit across and back (net zero) | ❌ **writes** to the tenant |

---

## Part 9 — When a command refuses to run

Refusals are the safety system doing its job, not a broken install. The three you are most likely to
meet:

| What it says | What it means | What to do |
|---|---|---|
| *`set SEED_CONFIRM=<phrase> to proceed`* | The seed guard wants you to prove which command you meant | Put `SEED_CONFIRM=<phrase>` in front of the command, exactly as shown above. **Each seeder has its own phrase** — `seed-demo-account`, `seed-accounts`, `seed-perf-ai` — so pasting the wrong one does not work |
| *`no Firebase identity exists for … and DEMO_ACCOUNT_PASSWORD is not set`* | That address has no login yet, and the seeder will not invent one silently | Either register that address in the app first (**recommended**), or set `DEMO_ACCOUNT_PASSWORD` in front of the command to create it |
| *`set CLEANUP_CONFIRM=…`* / *`NODE_ENV is not set`* | The cleanup guard would not delete without an explicit environment | Set the phrase; if the environment is missing, `server/.env` — which normally sets it — is the thing being talked about |
| *`the resolved database is "…", not the development database`* | You are pointed at the wrong database — most likely the test one | Do not override the guard. Check `server/.env`; a seeder is deliberately only allowed near the development database |
| *`NOT VERIFIED (exit 2)`* from `verify:demo` | The database could not be reached, or the account does not exist | This is **not** a data problem. Check the internet and re-run |
| *`is inside the repository`* from `backup:db` | You pointed `BACKUP_DIR` at a folder inside the project | Pick a folder outside it. This one is deliberate: a dump is real data and must not be committable |
| *`is not an approved restore target`* from `restore:db` | You aimed a restore at a database it will not drop and rewrite | Point it at the test or development database. **Do not** widen the list |
| *`has SHA-256 … the manifest recorded …`* from `restore:db` | The copy on disk is **damaged** — and **nothing was restored** | This is the guard working. Take a fresh copy; do not hand-edit the manifest |

---

## Part 10 — Words from this guide

- **Script** — a small program you run to do one job. The seeders and checks above are scripts.
- **Backend** — the half that holds the rules and talks to the database.
- **Metro** — the program that serves the app's code to a phone.
- **Seed** — to fill a database with realistic sample data.
- **Tenant / business** — one customer's separate world of data. Everything is labelled with the
  business that owns it.
- **Index** — a database shortcut that makes lookups fast. If it is missing the app still works, just
  slowly — which is why `audit:indexes` exists.
- **Exit code** — the small number a finished command reports: `0` means success.
- **CI** — the automated checks that run after a push to the code host.
- **Backup** — a separate copy of the data, kept somewhere else, for the day the original is lost.
- **Manifest** — the small file inside a backup that lists what was written and each file's fingerprint.
- **SHA-256** — a numeric fingerprint of a file's exact bytes. Change one byte and it no longer
  matches, which is how a damaged backup is caught before it is used.
- **Dry run** — do all the checking and printing, but write nothing.
- **Read-only** — looks at data but cannot change it.
- **Destructive** — permanently removes data. Nothing here can be undeleted.
- **Fixture** — a small, fixed set of data used by automated tests.

← Back to [the guides index](README.md) · Related: [4. Test accounts and mock data](4-test-accounts-and-mock-data.md) ·
[5. Words explained](5-words-explained.md)
