# 1. Running Inventory AI on a laptop

Gets the backend and the app running on this laptop, with a way to prove it.

## Before you start

| You need | Check |
|---|---|
| **Node.js 24** | `node -v` must start with `v24`. Older versions cannot start the backend. |
| Internet | The database is in the cloud; "no internet" looks like "database down". |
| The project | `C:/Users/jeffe/inventory-ai`. |

## Step 0 — one-time setup

```bash
cd C:/Users/jeffe/inventory-ai/server
npm install

cd C:/Users/jeffe/inventory-ai/mobile
npm install
```

`server/.env` holds local settings and secrets and is **never committed**. The names it needs are in
[server/.env.example](../../server/.env.example); if the backend reports a missing setting, look there.
An automated check fails if a secret-looking value is ever committed.

## Step 1 — start the backend

```bash
cd C:/Users/jeffe/inventory-ai/server
npm start
```

`npm start` runs `src/index.ts` directly through Node 24's type stripping — **no build step**. Leave
the window open; closing it stops the backend.

Expect database lines and then the port, **4000**. If the database is unreachable you get a warning
line and the backend stays up, answering `503` for anything needing data.

## Step 2 — prove it works

```bash
curl http://localhost:4000/api/health/ready
```

Expect `"status":"ready"`. Three addresses answer different questions:

| Address | Answers | Good |
|---|---|---|
| `/api/health/live` | Is the program running? (never checks the database) | `"status":"live"` |
| `/api/health/ready` | Running **and** database reachable now? | `"status":"ready"` |
| `/api/health` | General summary, including counters | `"status":"ok"` |

Run `live` first: if `live` works and `ready` does not, the backend is fine and the database is
unreachable.

## Step 3 — start Metro (only for the phone)

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx expo start --dev-client
```

Press **`a`** to open the app on a connected Android phone (phone setup: [Guide 2](2-run-on-your-phone.md)).
Editing a file reloads the app while this runs. After changing `mobile/.env`, stop Metro with `Ctrl+C`
and start it again — `EXPO_PUBLIC_` values are baked in when the code is served.

## Step 4 — optional: the tests

```bash
cd C:/Users/jeffe/inventory-ai/server
npm run test:unit     # fast, no database
npm test              # everything, including database tests
```

The full run uses a throwaway test database, and guards refuse to point it at development or
production. Expect a summary ending in **0 failures**; a healthy run takes a few minutes.

## Step 5 — stop

`Ctrl+C` in each window. The backend closes the database connection cleanly.

## Ports

| Port | Used by | If occupied |
|---|---|---|
| **4000** | the backend | The new server exits, printing the `netstat`/`lsof` command that finds the owner |
| **8081** | Metro | Expo offers another port — accept |

`EADDRINUSE` means the port is taken, usually by a backend you already have running. To check you are
talking to the process you just started, compare the `instance=` value printed at boot with:

```bash
curl -s -D - -o NUL http://localhost:4000/api/health/live | grep -i x-instance-id
```

A different id means an older server owns port 4000.

## If something goes wrong

| What you see | Meaning | Do |
|---|---|---|
| `EADDRINUSE` on 4000 | A backend is already running | Reuse it, or `Ctrl+C` the other window |
| `instance=` differs from `x-instance-id` | An older server answers | Stop it with the printed command, start again |
| `ready` returns 503 | Backend up, database unreachable | Check the internet; re-run in a minute |
| `MONGODB_URI is not set` | `server/.env` missing/incomplete | Fill it from `.env.example` |
| `node: bad option` or a syntax error | Node older than 24 | Check `node -v` |
| App says *"Cannot reach the server"* | Backend unreachable **from the phone** | Missing USB tunnel — [Guide 2](2-run-on-your-phone.md) |
| Blank or red app screen | Metro stopped, or a code error | Read the Metro window |

← [Guides index](README.md) · Next: [2. Running on a phone](2-run-on-your-phone.md)
