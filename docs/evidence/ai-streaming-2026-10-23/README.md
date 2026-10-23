# AI-40 — the assistant's answer, on the phone (2026-10-23)

Screenshots and the server's own record of five device runs: a normal streamed turn, a stream
cut **before** any text, a stream cut **after** text, a turn the member stopped, and a quota
refusal. Every number below was observed, not inferred from the code.

## What was run

- **Device:** OPPO CPH1969, Android 11 (API 30), the installed `development` build (no rebuild —
  this is a JavaScript change), driven over `adb reverse`.
- **Server:** the local server from the working tree, `NODE_ENV=development`. A small local proxy
  sat in front of it (`localhost:4000` on the phone → proxy `:4010` → server `:4001`) so the three
  transport failures could be produced on demand without touching app code. Its `stall` mode is
  the one that matters: headers sent, then **nothing**, socket left open.
- **Tenant:** the documented demo fixture (`demo-preview@example.invalid`), so the correct answer
  is known in advance — 6 products, **112** units, and a restock list of exactly **Demo Desk
  Lamp** (0 vs min 3), **Demo Paper Cups 100pk** (15 vs 20) and **Demo Coffee Beans 1kg** (4 vs 10).

## Results

| # | Scenario | What the phone showed | Wire evidence |
|---|---|---|---|
| 1 | Normal answer with a tool call (`1-streamed-answer.png`) | The three fixture products with quantities and minimums; *Read: Restock list* | One `POST /api/ai/chat`, **200**, 16 232 ms; turn `calls=2 toolRuns=1 tools=getReorderNeededProducts failovers=0 model=nvidia/nemotron-3.5-lightning:free` |
| 2 | Stream cut **before** any text (`2-before-text.png` is the pre-text state) | The spinner, then the complete answer — no error | **Two** POSTs: `text/event-stream` cut at 11:47:19.250, the ordinary `application/json` retry at **11:47:19.531**, **201** in 4 238 ms |
| 3 | Stream cut **after** the first delta (`3-cut-after-text.png`) | The partial text (`Three`) kept on screen, the red sentence, the question still above it, **no** retry | **One** POST; the server logged `AI_ABANDONED` and persisted nothing |
| 4 | Member pressed **Stop** mid-turn | *You stopped waiting for this answer…* — the documented AI-9 state | The server finished the turn it was already writing (`outcome=ok`); the copy covers exactly that, and reopening the chat would show it |
| 5 | A 429 with the quota envelope (`4-quota-refusal.png`) | *The assistant has used today's request allowance. It resets at midnight UTC (8AM in Manila) — the rest of the app works as usual.* | **One** POST, refused before it left the proxy; no provider request, no retry |
| 6 | A stream that goes silent and never closes (`5-recovered-from-stall.png`) | Spinner for ~20 s, then the complete answer with its tool table | First POST stalled at 11:57:22.139; the client gave up at **11:57:42.684** (20.5 s) and the ordinary retry answered **201** in 9 431 ms |

## Two defects this run found (both fixed before release)

1. **A wedged stream could hang the screen forever.** With the pre-fix build, scenario 6 left the
   spinner running for minutes: the body reader never settled, so even the 75 s budget abort could
   not produce a rejection (`chatStream` never returned and `sending` never cleared). The fix is
   threefold — an **idle window of 20 s** (one server heartbeat plus grace) that treats silence as
   a dead connection, an abort that **settles the read even if the reader ignores `cancel()`**, and
   a race in `chatStream` that guarantees the call settles regardless. Scenario 6 is the fix
   observed on the failure it exists for; `__tests__/ai40-chat-stream-transport.test.ts` (6 cases)
   pins it.
2. **A CRLF stream whose `\r\n` was split across two network writes delivered no events at all**
   until EOF, turning streaming into one late paint. Found in review on the **server** transport
   (the same class the mobile parser's split-CRLF case pins) and fixed by normalising CRLF on the
   whole buffer rather than per chunk. `AI40-ai-streaming.test.mjs` now has a case that reports
   **1** event instead of **7** if that regresses.

## Production, authenticated (2026-10-23)

Run separately from everything above, against `https://ai-inventory-l1mi.onrender.com` (commit
`3294387`, `environment: production`) — the deployment, not the local server. **Not a phone run:**
the installed build bakes its API base at build time and points at the local server, so this half
was driven over the public internet with a real session, which is the part that proves what Render
and the Cloudflare edge in front of it do with an event stream. The client half of streaming was
proven on the phone above.

**The session was real.** The demo tenant (`demo-preview@example.invalid`, the same fixture, so the
correct answer is again 112 units and the same three restock products) was seeded into
`inventoryai_prod_db` by naming the database on the command, its Firebase identity was created in
the project the deployed server verifies (`inventoryai-d0d20`), and the identity was signed in
through Firebase, then exchanged at `POST /api/auth/firebase/exchange` — **200**, a 293-character
Inventory AI token. The Firebase ID token never became the bearer credential.

**One streamed turn, measured on the wire:**

| | |
|---|---|
| `POST /api/ai/chat` + `Accept: text/event-stream` | **200**, `text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform` |
| Network chunks | **36**, arriving between **13 476 ms** and **14 735 ms** |
| `delta` events | **98**, first at **13 477 ms**, last at **14 521 ms** — 1 044 ms of delivery, not one paint |
| `done` | **1**, at **14 734 ms** |
| Answer | *3 products need restocking…* Demo Desk Lamp 0 vs min 3, Demo Coffee Beans 1 kg 4 vs 10, Demo Paper Cups 100 pk 15 vs 20; **total 112 units** |
| Turn | `model=nvidia/nemotron-3.5-lightning:free` (the configured primary), tools `getInventorySummary` + `getReorderNeededProducts` |

Ninety-eight deltas over 36 separate network chunks a second apart is the fact that matters: a
buffering proxy returns the body in one piece at the end, and this one did not. The 13.5 s before
the first delta is the tool round — the model writes no answer while it is asking for one — and it
is the same shape measured locally.

**Stored exactly once.** After the turn: **1** conversation for the account, **2** messages in it,
`USER` then `ASSISTANT`, the assistant message **309** characters and containing `112`. No third
row, no duplicate turn.

**Three failure paths, on the same deployment:**

- An **unauthenticated** streamed request (`Accept: text/event-stream`, no session) answered
  **401** `application/json` with no SSE header — streaming is still behind `requireAuth`.
- An **empty message** on the streamed path answered **400** `VALIDATION_ERROR` as the ordinary JSON
  envelope with `fields`, not an `error` event — `prepareTurn` runs before any header is written.
- A streamed turn **abandoned by the client at 2 180 ms** left the conversation count and its two
  messages **unchanged**: the turn was cancelled, and nothing was persisted.

**Server health after all of it:** `responses: 77`, `4xx: 2` (the deliberate 401 and 400 above),
**`5xx: 0`**, `serverErrors: 0`, `lastServerErrorAt: null`. No authentication error occurred in the
successful flow, and no provider retry is implied: one assistant row, the primary model named on
it, and a turn length in line with the two-call tool round measured locally.

**What was not available here:** Render's own log stream — there is no dashboard or API credential
for it on this host — so the review of logs used the deployment's own counters, the database rows
and the request telemetry above rather than the log lines. That is a narrower instrument, and it is
why the counters are quoted instead of a claim that the logs were read.

**`X-Accel-Buffering: no` was not visible on the client's copy of the response headers** (Cloudflare
answers in front of Render). It is a hint for nginx-style proxies rather than something the client
needs, and delivery was incremental regardless, so nothing was changed for it; the measurement that
matters is the 36 chunks.

**Cleanup, verified.** The demo tenant was removed with `cleanup:demo-tenant --database=inventoryai_prod_db`:
1 user, 1 business, 6 products, 7 inventory rows, 9 transactions, 2 categories and 3 locations
deleted, **leftovers 0** over every tenant collection. The database then read **3 users / 3
businesses / 1 product / 0 conversations**, exactly its pre-test shape — no real account, business
or product was touched. The Firebase identity was left in place, as that teardown documents (the
demo address is on a reserved domain and re-seeding reuses it). The password used for the run was
deleted from this host afterwards.

## What this run does not prove

- The **idle** and **abort** paths are measured (scenarios 6 and 4); a genuine mid-answer TCP reset
  from the network itself was not produced — the proxy's cut is the same event to the client.
- iOS: no macOS on this host.
- The real free-tier allowance was not exhausted, so `quota=unknown` was the only reading seen;
  the fail-fast on an observed **zero** is proven by the server suite, and scenario 5 exercises the
  client's copy, not the server's block.
