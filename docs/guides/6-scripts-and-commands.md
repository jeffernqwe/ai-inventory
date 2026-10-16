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
- **`ai:usage` is the one to run *before* spending anything.** It reads the server's own per-turn log
  lines (`[ai] turn …`, written for every turn including the ones that fail) and the AI provider's
  own account, then joins them: how many turns happened, which ones failed and how, how many provider
  **requests** they cost, the provider-versus-tools time split, and — from the provider — how much of
  the daily free allowance is left. Nothing is called and nothing is written, so it is free to run
  whenever the question comes up. It reads a saved log with `--log=<path>`, or **stdin** when no path
  is given (so `npm start > server.log` and a pipe both work); `--no-provider` keeps it fully offline
  and `--json` prints the same figures as one object.

```bash
cd C:/Users/jeffe/inventory-ai/server

# what has the assistant cost, and what is left today?   (nothing is spent)
npm run ai:usage -- --log=server.log

# the same, straight off a running server's output
npm start | npm run ai:usage --silent --
```

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
| `npm run seed:demo -- --email=…` | put sample data in **your** account | ⚠️ replaces that one business's data |
| `npm run seed:accounts` | seed **several** accounts, each at its own size, with **no** SKUs/barcodes | ⚠️ replaces those accounts' data |
| `npm run verify:demo -- --email=…` | read the data back and check it | ✅ reads only |
| `npm run seed:perf -- --size=N` | create the throwaway test tenant | ⚠️ writes that tenant only |
| `npm run cleanup:perf` | remove the throwaway tenant | ⚠️ scoped delete |
| `npm run perf:measure -- --business=…` | time the assistant's queries (no AI cost) | ✅ reads only |
| `npm run perf:golden -- --business=…` | fingerprint the assistant's answers | ✅ reads only |
| `npm run perf:turns -- --business=…` | real assistant turns | ⚠️ spends AI quota |
| `npm run ai:usage -- --log=…` | turns, failures and the allowance left | ✅ reads only (offline with `--no-provider`) |
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
- **Read-only** — looks at data but cannot change it.
- **Destructive** — permanently removes data. Nothing here can be undeleted.
- **Fixture** — a small, fixed set of data used by automated tests.

← Back to [the guides index](README.md) · Related: [4. Test accounts and mock data](4-test-accounts-and-mock-data.md) ·
[5. Words explained](5-words-explained.md)
