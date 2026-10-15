# 1. Running Inventory AI on a laptop

**What this guide gets you:** the backend and the app both running on this laptop, and a way to
prove they are running rather than hoping they are.

**How long:** about five minutes the first time.

---

## Before you start: the three things you need

| You need | How to check it |
|---|---|
| **Node.js version 24** | Type `node -v` in a terminal. It must start with `v24`. Anything older cannot start the backend at all. |
| **An internet connection** | The database is in the cloud, so "no internet" looks like "the database is down". |
| **The project folder** | On this machine it is `C:\Users\jeffe\inventory-ai`. |

If `node -v` prints something like `v22` or `v20`, stop here — the backend will refuse to run and
the error will not obviously be about the version. Install Node 24 first.

## Step 0 — one-time setup (skip if you have done it before)

A *dependency* is a piece of code the project borrows from the internet (a small library). They
are listed in a file called `package.json` and installed from a file called `package-lock.json`
which pins the exact versions. Run this **once per half**:

```bash
cd C:/Users/jeffe/inventory-ai/server
npm install

cd C:/Users/jeffe/inventory-ai/mobile
npm install
```

You will also need a file called `server/.env`. It holds local settings (such as the database
address and the secret keys) and is deliberately **not** shared or committed, because it contains
secrets. The list of what belongs in it — names only, never real values — is in
[server/.env.example](../../server/.env.example). If the backend starts and says a setting is
missing, that file is where to look.

> **Never commit `.env`.** It is in the "do not share" list for a reason, and there is an automated
> check that fails if a secret-looking value is ever committed.

---

## Step 1 — start the backend

The **backend** is the program that holds the business rules and talks to the database. Open a
terminal and run:

```bash
cd C:/Users/jeffe/inventory-ai/server
npm start
```

`npm start` runs the file `src/index.ts` directly. There is **no build step** to run first — the
backend runs its own TypeScript source through Node 24's built-in type stripping. (In plain terms:
the code is written in a stricter dialect of JavaScript called TypeScript, and Node 24 can read it
as-is. On an older Node it cannot, which is the version requirement above.)

**What you should see:** a couple of lines about the database connecting, and then a line saying
which port it is listening on — port **4000** by default. Leave this window open. Closing it stops
the backend.

**What "the database is not reachable" looks like:** a line mentioning MongoDB in a warning tone.
The backend deliberately stays up so you can still ask it questions, but anything that needs data
will answer `503` instead of failing mysteriously. This is almost always a network or Wi-Fi
problem, or a paused cloud database — not something you installed wrongly.

## Step 2 — prove the backend works

Do not skip this. Open a **second** terminal window (keep the first one running) and run:

```bash
curl http://localhost:4000/api/health/ready
```

Expected: a short line of text containing `"status":"ready"`.

There are three health addresses, and they answer different questions:

| Address | Answers | Good response |
|---|---|---|
| `http://localhost:4000/api/health/live` | "Is the program running at all?" (never checks the database) | `"status":"live"` |
| `http://localhost:4000/api/health/ready` | "Is it running **and** can it reach the database right now?" | `"status":"ready"` |
| `http://localhost:4000/api/health` | A general summary, including the database state | `"status":"ok"` |

Run `live` first, then `ready`. That order tells you **which half** is broken: if `live` fails,
the backend is not running; if `live` works but `ready` does not, the backend is fine and the
database is unreachable.

## Step 3 — start the app's code server (only if you want the phone screen)

Skip this step if you only care about the backend.

The app is written in JavaScript, and a phone cannot run that directly — so a program on the laptop
*serves* the app's code to the phone, which it fetches over the network or a USB cable. That server
is called **Metro**, and it is what `npx expo start` launches. Expo is the toolkit the app is built
with; Metro is the part that hands the code out.

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx expo start --dev-client
```

You will get a menu in the terminal. Press **`a`** to open the app on a connected Android phone
(Guide 2 covers the phone side, including the USB cable that makes this work). Keep this window
open too — while it runs, editing a file reloads the app.

**If you change `mobile/.env`,** stop Metro with `Ctrl+C` and start it again. Settings starting with
`EXPO_PUBLIC_` are baked into the code when it is served, so they do not take effect otherwise.

## Step 4 — optional: run the automated tests

The project has a large set of automated tests: small programs that check the behaviour is still
what it should be. Running them is the quickest way to know the machine is set up correctly.

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run test:unit     # fast, no database needed
npm test              # everything, including tests that talk to a database
```

The full run uses its own **throwaway test database**, and there are guards in the code that
refuse to point it at the development or production database (and that refuse the reverse). So it
cannot touch real business data, even by mistake. Expect a summary line at the end with a count of
tests and **0 failures**; a healthy full run takes a few minutes.

## Step 5 — when you are done

In each terminal window press `Ctrl+C`. The backend also shuts the database connection down cleanly
when you do.

---

## Ports — the short version

A **port** is a numbered door on a computer. Two programs on the same computer need different
doors. These are the ones this project uses:

| Port | Used by | If something is already using it |
|---|---|---|
| **4000** | the backend | `npm start` fails with `EADDRINUSE` |
| **8081** | Metro (the app's code server) | Expo offers to use another port — accept |

`EADDRINUSE` means "this port is occupied". It usually means **you already have a backend running in
another window** — which is often exactly what you want. Check for it before starting a second one.

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `EADDRINUSE` on port 4000 | A backend is already running | Reuse it, or stop the other window with `Ctrl+C` |
| `Ready` never appears; `ready` returns 503 | Backend is up, database unreachable | Check the internet; it may be a temporary cloud blip. Re-run `ready` in a minute |
| `MONGODB_URI is not set` | `server/.env` is missing or incomplete | Copy the names from `.env.example` and fill in real values |
| `node: bad option` or a syntax error at startup | Node is older than 24 | Check `node -v`, install Node 24 |
| The app says *"Cannot reach the server"* | The app half is fine, the backend half is not reachable **from the phone** | This is usually the missing USB tunnel — see [Guide 2](2-run-on-your-phone.md) |
| The app shows a blank or red screen | Metro stopped, or the code has an error | Look at the Metro window; the real message is printed there |

---

## Words from this guide

- **Backend** — the half that holds the rules and talks to the database. Runs on the laptop.
- **Metro** — the program that serves the app's code to the phone. Started by `npx expo start`.
- **Node.js** — the program that runs JavaScript/TypeScript on a computer. Version 24 is required.
- **npm** — the tool that installs the project's borrowed code and runs its commands.
- **`npm install`** — downloads those borrowed pieces into a `node_modules` folder.
- **Dependency** — a piece of borrowed code the project uses.
- **Port** — a numbered door on a computer that a program listens on.
- **`.env`** — a private file of local settings and secrets. Never shared, never committed.
- **Health endpoint** — a web address that answers "are you alive / ready?" instead of doing work.
- **Test** — a small program that checks the real code behaves as documented.

See [5. Words explained](5-words-explained.md) for anything else.
