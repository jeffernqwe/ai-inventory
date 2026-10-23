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

## What this run does not prove

- The **idle** and **abort** paths are measured (scenarios 6 and 4); a genuine mid-answer TCP reset
  from the network itself was not produced — the proxy's cut is the same event to the client.
- iOS: no macOS on this host.
- The real free-tier allowance was not exhausted, so `quota=unknown` was the only reading seen;
  the fail-fast on an observed **zero** is proven by the server suite, and scenario 5 exercises the
  client's copy, not the server's block.
