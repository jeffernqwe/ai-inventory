# AI-1 — The AI Turn Time Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** PLAN — written 2026-10-12, not yet approved, nothing implemented.

**Goal:** Make one AI chat turn's time budget a single explicit contract that both sides honour, and make its failures describe what actually happened.

**Architecture:** The server owns the budget. `runAiChat` computes one absolute deadline for the whole turn and clamps each provider call to the time remaining, so the sum of the tool loop can never exceed it; when it expires the server answers an explicit `504 AI_TIMEOUT` instead of letting the client guess. The client stops applying one global 15 s abort to every route, gives the assistant a budget deliberately larger than the server's, and stops describing a timeout as an unreachable server. An abandoned turn cancels its upstream call, so a client that gives up stops costing money.

**Tech Stack:** Node 24 (`.nvmrc`) running `.ts` through native type stripping; Express 5; `node:test` on the server. React Native 0.86 / Expo SDK 57 / TypeScript; Jest on mobile. No new dependency on either side.

**Spec:** `docs/SYSTEM_SPECIFICATION.md` §21–§26 (AI), §25 (cost / rate protection); `CLAUDE.md` §4 §11 (AI is READ-ONLY), §9 §10; roadmap `docs/DEVELOPMENT_ROADMAP.md` §27BC and issue **ISS-21**.

## Global Constraints

- **No new dependency**, server or mobile. No `package.json` change on either side.
- **No route change.** `/api/ai/chat` keeps `requireAuth, requirePermission(PERMISSIONS.AI_USE), aiRateLimiter` and its registration order in `routes/ai.routes.ts`. No route is added, removed or re-classified; the Phase 22 / 23 authorization guards must stay green.
- **No schema change.** `AIConversation` / `AIMessage` are untouched. No migration.
- **No permission change.** `ROLE_PERMISSIONS` and `constants/roles.ts` are untouched.
- **AI stays READ-ONLY** (`CLAUDE.md` §4 §11): no tool gains a write, and no tool is added.
- **No secret and no content reaches the log.** `httpLogger`'s fields stay exactly as they are; prompts and responses are still never logged.
- Server code is **TypeScript** and `npm run typecheck` (`tsc --noEmit`, `erasableSyntaxOnly`) must pass.
- The existing 15 s global budget is **not deleted**; only the assistant's budget changes.
- Every server test file must run **DB-free** where the behaviour allows it, and use `support.mjs` / `testEnv.mjs` / `test/fakes/aiProvider.mjs` for the cases that need a route.

## Root cause (established 2026-10-12, before this plan)

Four independent defects combine into one symptom. Each is recorded with its evidence.

| # | Defect | Evidence |
|---|---|---|
| **RC-1** | The client's abort budget is global (`REQUEST_TIMEOUT_MS = 15000`, `mobile/lib/config.ts`) while a real AI turn is not bounded at all on the server. | A *successful* turn measured **13 283 ms** — 88 % of the budget, with almost no headroom. |
| **RC-2** | The server has no total-turn deadline. `AI_REQUEST_TIMEOUT_MS` bounds **each** provider call (60 s) and `AI_MAX_TOOL_ITERATIONS` bounds the count (6), so the intent "how long may a turn take?" is the *product* of two knobs and is expressed nowhere. | `aiConfig.ts` `requestTimeoutMs: 60000`, `maxToolIterations: 6`; neither `.env` overrides them. |
| **RC-3** | A timeout is reported to the user as an unreachable server. `AiChat.sendErrorMessage` checks `e.isNetwork` (which is `status === 0`) **before** it can ever surface the more accurate `NETWORK_TIMEOUT` code, so both collapse to *"Cannot reach the server. Check your connection and try again."* | `mobile/components/AiChat.tsx` `sendErrorMessage`; `mobile/lib/client.ts` abort branch. |
| **RC-4** | An abandoned turn keeps working and keeps paying. No abort signal is threaded from the inbound request into the provider call. | Code read (`runAiChat` takes no signal; `postJson` builds its own `AbortController`) **plus the probe below**. |

### The abort probe (this corrects the earlier record)

A temporary probe (`server/abort-probe.mjs`, run once and deleted) mounted the **real** `requestLogger` and had a route answer after 5 s. Result, with a positive control so the probe cannot pass vacuously:

```
positive control  /fast -> log lines after completion: 1
negative          /slow -> client aborted: true
negative          /slow -> log lines after abort: 0
negative          /slow -> log lines after handler settled: 0
handler work continued after disconnect: true
late res.json() -> writable (wrote to a dead connection)
VERDICT: PASS — an aborted request is invisible to the access log
```

Two consequences, both load-bearing:

1. **`httpLogger` emits on `res.on('finish')` only** — "one JSON line per COMPLETED request". A request the client aborts **never produces a log line**. The observation that `POST /api/ai/chat` appeared **0 times** in the 2026-10-12 device run is therefore *exactly what a client abort looks like* and does **not** show the request was never sent. The earlier wording in §27BC/F-51 ("the request was never sent") is unsupported and must be corrected to "never *completed*, so it was never logged".
2. **Handler work continues after the client disconnects** (RC-4 confirmed empirically, not inferred).

## Review Focus

The five ways this is most likely to bite, each pinned by a test in the task that owns the code:

1. **A turn that legitimately needs 70 s** — must surface as `AI_TIMEOUT` with truthful copy, must not say "cannot reach the server", and must never be treated as a lost session (a timeout is not a 401).
2. **A provider call that hangs rather than errors** — must be cut off by the turn deadline, not left to run 6 × 60 s. The deadline holds even if a provider ignores the per-call `timeoutMs`.
3. **The client aborting mid-turn** — must not produce a *logged* 5xx, must not be counted as a user-visible failure, and must cancel the upstream call.
4. **An empty provider response** (F-52 — the free model intermittently answers with neither text nor a tool call) — must still yield the existing fallback sentence, never a deadline error.
5. **Retrying after a timeout** — must not duplicate the user's message in the conversation. *(Already pinned by the existing Phase 07E M6/M7 suites, which assert nothing is persisted on a provider failure — those must stay green rather than being re-written. Only the "must not require retyping" half is new work, and it is the optional item in Task 4.)*

---

## Task 1: One deadline for the whole turn (server)

**Files:**
- Modify: `server/src/services/ai/aiConfig.ts` (add `turnDeadlineMs`)
- Modify: `server/src/services/ai/aiErrors.ts` (add `AI_TIMEOUT` + `AiTimeout`)
- Modify: `server/src/services/ai/ai.service.ts` (`runAiChat` deadline)
- Modify: `server/src/services/ai/providers/index.ts` (optional `timeoutMs` on `ProviderRequest`)
- Modify: `server/src/services/ai/providers/anthropicWire.ts`, `server/src/services/ai/providers/geminiProvider.ts` (honour it)
- Modify: `server/test/fakes/aiProvider.mjs` (accept a per-call budget; let a scenario hang)
- Test: `server/test/AI1-ai-turn-deadline.test.mjs`

**Interfaces:**
- Consumes: `aiConfig()` (`server/src/services/ai/aiConfig.ts`), `registerFakeProvider` / `setFakeScenario` (`server/test/fakes/aiProvider.mjs`), `unitSuite` (`server/test/testEnv.mjs`).
- Produces: `aiConfig().turnDeadlineMs: number`; `class AiTimeout extends Error` with `name = 'AiTimeout'` and `code = 'AI_TIMEOUT'`; `AI_TIMEOUT` const; `ProviderRequest.timeoutMs?: number`; `ProviderRequest.signal?: AbortSignal` (used in Task 5).

- [ ] **Step 1: Write the failing test**

```js
// server/test/AI1-ai-turn-deadline.test.mjs
process.env.AI_PROVIDER = 'fake';
registerFakeProvider();

unitSuite('AI-1 turn deadline (DB-free)', () => {
  it('rejects with AiTimeout when a provider call outlasts the turn deadline', async () => {
    process.env.AI_TURN_DEADLINE_MS = '200';
    setFakeScenario(() => new Promise(() => {})); // never resolves
    await assert.rejects(
      () => runAiChat({ businessId: 'b', userId: 'u', role: ROLES.OWNER, message: 'hi' }),
      (err) => err.name === 'AiTimeout' && err.code === 'AI_TIMEOUT',
    );
    delete process.env.AI_TURN_DEADLINE_MS;
  });

  it('bounds the WHOLE loop, not each call: 6 hung calls still end near one deadline', async () => {
    process.env.AI_TURN_DEADLINE_MS = '300';
    const started = Date.now();
    setFakeScenario(() => new Promise(() => {}));
    await assert.rejects(() => runAiChat({ businessId: 'b', userId: 'u', role: ROLES.OWNER, message: 'hi' }));
    assert.ok(Date.now() - started < 300 + 750, 'the loop must not run deadline x iterations');
    delete process.env.AI_TURN_DEADLINE_MS;
  });

  // F-52 guard: the deadline must not swallow the existing empty-answer fallback.
  it('a fast empty provider response still yields the fallback sentence, not a timeout', async () => {
    setFakeScenario(() => fakeText(''));
    const result = await runAiChat({ businessId: 'b', userId: 'u', role: ROLES.OWNER, message: 'hi' });
    assert.match(result.content, /could not generate a response/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/AI1-ai-turn-deadline.test.mjs`
Expected: FAIL — no `AiTimeout`, and the harness itself hangs until the runner's own timeout.

- [ ] **Step 3: Implement the deadline**

In `aiConfig.ts`, beside `requestTimeoutMs`: `turnDeadlineMs: positiveInt(process.env.AI_TURN_DEADLINE_MS, 60000),`

In `aiErrors.ts`, following the existing two error classes exactly:

```ts
export const AI_TIMEOUT = 'AI_TIMEOUT';
export class AiTimeout extends Error {
  declare code: string;
  constructor(message = 'The assistant took too long to answer. Please try again.') {
    super(message); this.name = 'AiTimeout'; this.code = AI_TIMEOUT;
  }
}
```

In `ai.service.ts`, add a small helper and use it around the provider call. The helper is the guarantee; `timeoutMs` is the courtesy that lets a well-behaved provider abort its own socket.

```ts
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiTimeout()), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
```

Then in `runAiChat`, before the loop: `const deadlineAt = Date.now() + cfg.turnDeadlineMs;` and inside the loop, before calling the provider:

```ts
const remaining = deadlineAt - Date.now();
if (remaining <= 0) throw new AiTimeout();
response = await withDeadline(
  provider.complete({ system: systemPrompt(), messages, tools: AI_TOOL_DEFS as ToolDefinition[], timeoutMs: remaining }),
  remaining,
);
```

`ProviderRequest` gains `timeoutMs?: number`, and both wire layers pass `request.timeoutMs ?? cfg.requestTimeoutMs` into `postJson` — replacing the current unconditional `timeoutMs: cfg.requestTimeoutMs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/AI1-ai-turn-deadline.test.mjs`
Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/ai server/test/AI1-ai-turn-deadline.test.mjs
git commit -m "feat: give one AI turn a single wall-clock deadline (AI-1)"
```

---

## Task 2: Answer the client with an explicit `504 AI_TIMEOUT`

**Files:**
- Modify: `server/src/controllers/ai.controller.ts` (`mapAiFailure`)
- Test: `server/test/AI1-ai-turn-deadline.test.mjs` (add a DB-gated case)

**Interfaces:**
- Consumes: `AiTimeout`, `AI_TIMEOUT` (Task 1); `startServer`, `makeApi`, `registerOwner` (`server/test/support.mjs`); `dbSuite` (`server/test/testEnv.mjs`).
- Produces: the wire contract `HTTP 504` with body `{ code: 'AI_TIMEOUT', error: 'The assistant took too long to answer. Please try again.' }`.

- [ ] **Step 1: Write the failing test** — a DB-gated case that registers an owner, sets a hanging fake scenario with `AI_TURN_DEADLINE_MS=200`, and asserts the chat route answers **504** with `code === 'AI_TIMEOUT'`.

- [ ] **Step 2: Run to verify it fails** — expect the current behaviour, a 502 `AI_UNAVAILABLE` or a hang.

- [ ] **Step 3: Implement** — add a branch to `mapAiFailure`, matching the existing style:
  `if (err instanceof AiTimeout) return new ApiError(504, 'The assistant took too long to answer. Please try again.', 'AI_TIMEOUT');`

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `feat: answer a turn that exceeds its deadline with 504 AI_TIMEOUT (AI-1)`

---

## Task 3: The client stops applying a global 15 s abort to the assistant

**Files:**
- Modify: `mobile/lib/config.ts` (add `AI_REQUEST_TIMEOUT_MS`)
- Modify: `mobile/lib/client.ts` (optional `timeoutMs` in `ApiFetchOptions`)
- Modify: `mobile/lib/api.ts` (`aiApi.chat` passes it)
- Test: `mobile/__tests__/ai1-turn-time-budget.test.ts`

**Interfaces:**
- Consumes: `REQUEST_TIMEOUT_MS`, `AI_REQUEST_TIMEOUT_MS` (`mobile/lib/config.ts`); `apiFetch` (`mobile/lib/client.ts`).
- Produces: `ApiFetchOptions.timeoutMs?: number`; `AI_REQUEST_TIMEOUT_MS = 75000`.

- [ ] **Step 1: Write the failing tests** — three cases:
  1. `apiFetch` with `{ timeoutMs: 5 }` aborts and rejects with `code === 'NETWORK_TIMEOUT'` (fake timers).
  2. `apiFetch` **without** `timeoutMs` still uses 15 000 ms — the global budget is unchanged for every other route.
  3. **The anti-drift guard, which is the point of the whole increment:** read `server/src/services/ai/aiConfig.ts` from disk, extract the `AI_TURN_DEADLINE_MS` default, and assert `AI_REQUEST_TIMEOUT_MS > deadline + 5000`. This is the relationship the original defect violated, and it is what stops the two numbers drifting apart again.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement** — `timeoutMs` defaults to `REQUEST_TIMEOUT_MS` at the `setTimeout` call site in `apiFetchAttempt`; `AI_REQUEST_TIMEOUT_MS = 75000` with a comment stating it must exceed the server's turn deadline plus slack for the response and the two message writes that follow the model call.

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Commit** — `feat: give the assistant budget room over the server's deadline (AI-1)`

---

## Task 4: Stop calling a timeout an unreachable server

**Files:**
- Modify: `mobile/components/AiChat.tsx` (export and correct `sendErrorMessage`)
- Test: `mobile/__tests__/ai1-timeout-copy.test.ts`

**Interfaces:**
- Consumes: the `ApiError` codes from `mobile/lib/client.ts` and `AI_TIMEOUT` from the server contract.
- Produces: `export function sendErrorMessage(err: unknown): string`.

- [ ] **Step 1: Write the failing tests** — a table of cases:
  | input | expected |
  |---|---|
  | `{ code: 'NETWORK_TIMEOUT' }` | the *"took too long"* copy, **not** "Cannot reach the server" |
  | `{ code: 'AI_TIMEOUT' }` | the same timeout family |
  | `{ code: 'NETWORK_ERROR', isNetwork: true }` | "Cannot reach the server…" (unchanged) |
  | `{ code: 'AI_NOT_CONFIGURED' }` | unchanged |
  | `{ code: 'AI_UNAVAILABLE' }` | unchanged |
  | `{ code: 'AI_RATE_LIMITED' }` | unchanged |
  | `{ isNetwork: true }` and no code | "Cannot reach the server…" (unchanged default) |

- [ ] **Step 2: Run to verify the two timeout rows fail.**

- [ ] **Step 3: Implement** — check the two timeout codes **before** the `e.isNetwork` branch, and export the function so it is unit-testable without mounting the screen.

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Commit** — `fix: report an assistant timeout as a timeout, not a network failure (AI-1)`

---

## Task 5: Stop paying for a turn the client abandoned

**Files:**
- Modify: `server/src/controllers/ai.controller.ts` (bind an `AbortController` to `req.on('close')`)
- Modify: `server/src/services/ai/ai.service.ts` (`ChatParams.signal`, race it)
- Modify: `server/src/services/ai/providers/index.ts` (`ProviderRequest.signal?`)
- Modify: `server/src/services/ai/providers/http.ts` (combine the caller signal with the timeout)
- Modify: `server/src/services/ai/providers/anthropicWire.ts`, `geminiProvider.ts` (pass it through)
- Test: `server/test/AI1-ai-turn-deadline.test.mjs`

**Interfaces:**
- Consumes: Task 1's `ProviderRequest.timeoutMs`.
- Produces: `ChatParams.signal?: AbortSignal`; `ProviderRequest.signal?: AbortSignal`; `postJson({ …, signal })`.

- [ ] **Step 1: Write the failing test** — DB-gated: a hanging fake scenario records the `signal` it was handed; the test issues the chat request and aborts it; assert the recorded signal became aborted.
- [ ] **Step 2: Run to verify it fails** (no signal reaches the provider).
- [ ] **Step 3: Implement** — the controller creates one controller per request and aborts it on `req.on('close')`; `runAiChat` passes it down; `postJson` uses `AbortSignal.any([timeoutController.signal, signal])`. A client-side abort must not be translated into an `AiProviderError` that then tries to write a 502 to a dead connection.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `feat: cancel an AI turn whose client has gone away (AI-1)`

---

## Task 6: Record it, and correct the record

**Files:**
- Modify: `docs/DEVELOPMENT_ROADMAP.md` (§27BC F-51 wording; ISS-21 row; new entry)
- Modify: `CLAUDE.md` §7 (the increment one line)

- [ ] **Step 1:** Correct §27BC/F-51: replace "the request was never sent" with the measured finding — an aborted request is **invisible to the access log** because `httpLogger` emits on `res.on('finish')` only, so "never logged" is what an abort looks like and does not establish "never sent". Cite the probe and both controls.
- [ ] **Step 2:** Update the **ISS-21** registry row: status, the fix, and what remains open.
- [ ] **Step 3:** Add the new dated record with the measured before/after numbers.
- [ ] **Step 4:** Run the docs guard: `cd server && node --test test/phase-docs-route-inventory.test.mjs` — expect 11/11, exit 0.

---

## Verification (whole increment)

- `cd server && npm run typecheck && npm run lint && npm run check:extensions && npm run check:specifiers`
- `cd server && node --test test/AI1-ai-turn-deadline.test.mjs` and the whole suite
- `cd mobile && npx tsc --noEmit && npx eslint . && npx jest`
- `cd server && node --test test/phase-docs-route-inventory.test.mjs`
- **Then, and only then, on the device:** the same prompt that failed on 2026-10-12, asked twice — once fast (a plain answer inside the budget) and once against a deliberately slowed provider, to confirm the timeout copy appears and reads correctly. Until that runs, the end-to-end fix is **verified in tests only, not on hardware**.

## Deliberately NOT in this increment

- **Streaming.** The structural answer — `expo/fetch` supports `response.body.getReader()` from SDK 52 and is the global `fetch` since SDK 56, on this app's `expo ~57.0.27` with no opt-out set, so it needs no new dependency. It removes the wall-clock abort entirely. It is a server SSE + client incremental-parser build, and streaming through a dev client over `adb reverse` is guaranteed by no Expo document, so it needs its own paced multi-chunk device test. **Owner decision: now or after.**
- **A change of model.** Measured: the deployed free model answered the app's own suggested prompt correctly but with a wide spread, one candidate was rate-limited upstream (`HTTP 429`), and **F-52**'s empty response is intermittent. A paid tool-capable model is a cost decision. **Owner decision.**
- **Draft-restore on failure**, so a retry is one tap rather than retyping, if no existing suite mounts `AiChat` to verify it.
- **Any AI capability that writes.** V1 is read-only (`CLAUDE.md` §4). Expanding it needs explicit approval and a spec change, not a plan task.
