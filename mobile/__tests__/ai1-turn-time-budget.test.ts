/**
 * AI-1 — the assistant's time budget on the client, and the relationship that
 * stops the two sides drifting apart again.
 *
 * WHAT WENT WRONG (ISS-21, root cause RC-1). `REQUEST_TIMEOUT_MS = 15000` was
 * applied by `apiFetch` to EVERY route. The assistant is not like the other
 * routes: its server side was bounded only by (per-call cap x iterations), so a
 * slow-but-successful answer routinely outlived 15 s — one measured working
 * answer took 13283 ms, 88 % of the budget. The phone therefore aborted a
 * request the server was still answering, and the user was told "Cannot reach
 * the server", which was not true.
 *
 * WHAT THIS FILE PINS.
 *   1. A caller can state its own budget (`timeoutMs`), and it is honoured.
 *   2. Omitting it changes nothing: every other route keeps the ordinary budget
 *      — 15 s — which DEP-2 narrowed to mean "while the server has answered
 *      recently". The test below therefore proves the server is AWAKE first (one
 *      answered request), because that is the state in which this contract is
 *      stated; the cold-start allowance that applies before it is DEP-2's own
 *      subject, in `dep2-client-connectivity.test.ts`.
 *   3. The assistant's budget is the one that grew — proven by observing that a
 *      chat request is STILL ALIVE past 15001 ms, which is the assertion that
 *      would fail if `aiApi.chat` forgot to pass it.
 *   4. The two numbers are related, not coincidental: the client's assistant
 *      budget must exceed the SERVER's turn deadline, read from the server's own
 *      source rather than transcribed. That relationship is the thing that was
 *      missing before, and a guard is the only way it stays true.
 *
 * WHAT IT DOES NOT PROVE: that a real answer arrives within the budget. That is a
 * device measurement, not a unit test.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { apiFetch } from '../lib/client';
import type { ApiError } from '../lib/client';
import { AI_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../lib/config';
import { aiApi } from '../lib/api';

const projectRoot = join(__dirname, '..');
const repoRoot = join(projectRoot, '..');

interface FetchInit {
  signal?: AbortSignal;
}

const fetchMock = jest.fn();

/**
 * A fetch that never settles on its own and rejects ONLY on abort. A mock that
 * ignores the signal cannot test a timeout at all — the promise would simply
 * hang — so the signal is honoured here rather than simulated.
 */
function abortAware() {
  return (_url: string, init?: FetchInit) =>
    new Promise<never>((_resolve, reject) => {
      const fail = () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      const signal = init?.signal;
      if (signal?.aborted) fail();
      else signal?.addEventListener('abort', fail);
    });
}

/**
 * Watch a request settle WITHOUT awaiting it, so a test can assert it is still
 * pending at a given instant. `settled` is the load-bearing field: an earlier
 * draft asserted `Promise.race([p, Promise.resolve('pending')])`, which returns
 * 'pending' unconditionally and so could never fail. A check that cannot fail
 * proves nothing about a timeout.
 */
function track(promise: Promise<unknown>) {
  const state = { settled: false, code: 'pending' };
  void promise.then(
    () => {
      state.settled = true;
      state.code = 'resolved';
    },
    (err: unknown) => {
      state.settled = true;
      state.code = (err as ApiError).code ?? 'no-code';
    },
  );
  return state;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(abortAware());
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AI-1 — a caller may state its own budget', () => {
  it('honours a per-request timeoutMs', async () => {
    await expect(apiFetch('/api/ai/chat', { timeoutMs: 5 })).rejects.toMatchObject({
      code: 'NETWORK_TIMEOUT',
    });
  });

  it('keeps the ordinary budget for a route that does not ask for one, once the server is awake', async () => {
    // DEP-2: awake means "answered something recently". One answered request is
    // the whole condition, and it is established here rather than assumed, so this
    // test states the warm contract without depending on file order.
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        json: async () => ({}),
        headers: { get: () => null },
      } as unknown as Response),
    );
    await apiFetch('/api/health');

    fetchMock.mockImplementation(abortAware());
    jest.useFakeTimers();
    const state = track(apiFetch('/api/products'));

    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(state.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(2);
    expect(state.settled).toBe(true);
    expect(state.code).toBe('NETWORK_TIMEOUT');
  });
});

describe('AI-1 — the assistant is the route whose budget grew', () => {
  it('a chat request is still alive past the global budget', async () => {
    jest.useFakeTimers();
    const state = track(aiApi.chat('token', { message: 'how much stock do we hold?' }));

    // Past the 15 s budget every other route lives with. If `aiApi.chat` had not
    // passed its own budget this would already be NETWORK_TIMEOUT.
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    expect(state.settled).toBe(false);

    // ...and it still ends, at its own budget rather than never.
    await jest.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
    expect(state.settled).toBe(true);
    expect(state.code).toBe('NETWORK_TIMEOUT');
  });
});

describe('AI-1 — the two budgets are related, not coincidental', () => {
  it('the assistant budget exceeds the server turn deadline by a real margin', () => {
    const source = readFileSync(
      join(repoRoot, 'server', 'src', 'services', 'ai', 'aiConfig.ts'),
      'utf8',
    );
    const match = source.match(
      /turnDeadlineMs:\s*positiveInt\(\s*process\.env\.AI_TURN_DEADLINE_MS\s*,\s*(\d+)\s*\)/,
    );
    if (!match) {
      throw new Error(
        'could not read AI_TURN_DEADLINE_MS from the server config — the guard would be blind',
      );
    }
    const serverDeadlineMs = Number(match[1]);
    expect(serverDeadlineMs).toBeGreaterThan(0);

    // The client must outlast the server's own limit, plus the response write and
    // the two message rows persisted after the model answers. A client budget at
    // or below the server's deadline recreates RC-1 exactly.
    expect(AI_REQUEST_TIMEOUT_MS).toBeGreaterThan(serverDeadlineMs + 5000);
  });

  it('pins both numbers, so a silent change to either is a failure', () => {
    expect(AI_REQUEST_TIMEOUT_MS).toBe(75000);
    expect(REQUEST_TIMEOUT_MS).toBe(15000);
  });
});
