/**
 * DEP-2 — the client's account of WHY a request failed, and how long it is
 * willing to wait for a host that has been asleep.
 *
 * WHAT WAS MEASURED ON THE DEVICE (2026-10-16, OPPO CPH1969, deployed backend).
 *
 *   1. The app's own 15 s budget fired and the phone displayed
 *      "Cannot reach the server. Check your connection and try again."
 *      — the sentence for a request that never arrived. The timeout had been
 *      classified by the SHAPE of the rejection (`err.name === 'AbortError'`),
 *      and React Native's aborted request does not have that shape, so the
 *      client's own decision was reported as a network outage and the member was
 *      sent to check a connection that was working. The server-side fingerprint
 *      of the same event, from a stand-in backend: `CLIENT-GONE … after=14989ms`.
 *
 *   2. The deployed free-tier instance needs ~32 s to answer its first request
 *      after an idle period (measured twice: 32 369 ms and 32 440 ms to first
 *      byte, against 194 ms warm; TCP completes in 52 ms and TLS in 87 ms, so the
 *      host is the wait). Every non-assistant request carried the same 15 s
 *      budget, so the FIRST request of every session was aborted before the
 *      server could possibly answer it.
 *
 * WHAT THIS FILE PINS.
 *   A. A request that states no budget gets a budget that outlasts a cold start,
 *      and settles as `NETWORK_TIMEOUT` — not as "unreachable" — when the client
 *      is the one that gave up, whatever shape the rejection arrives in.
 *   B. Once the server has answered anything, requests return to the ordinary
 *      budget, so the longer wait is not paid when it cannot be needed.
 *   C. An unreachable server still says so, and in a DEVELOPMENT build pointed at
 *      a loopback address it says why — the configuration, not the connection.
 *   D. A caller's own cancellation still wins over both (AI-9 unchanged).
 *
 * ONE DELIBERATE ORDER DEPENDENCY. The cold state is the state a process starts
 * in — no server has answered yet — so the cold cases run before any case that
 * lets a response through. Each case says which state it needs rather than
 * relying on luck, and `describe` order in this file is declaration order.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ApiError, apiFetch, unreachableMessage } from '../lib/client';
import {
  AI_REQUEST_TIMEOUT_MS,
  API_URL,
  COLD_START_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  SERVER_WARM_WINDOW_MS,
} from '../lib/config';

const projectRoot = join(__dirname, '..');
const repoRoot = join(projectRoot, '..');

const UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';

interface FetchInit {
  signal?: AbortSignal;
}

const fetchMock = jest.fn();

/**
 * A fetch that never settles on its own and rejects on abort. `shape` decides
 * what the rejection looks like, because that shape is the whole point of case B
 * below: `abort` is what a browser-style abort looks like, and `network` is what
 * React Native's aborted request looked like on the device — a plain TypeError
 * that claimed the network failed.
 */
function pendingUntilAborted(shape: 'abort' | 'network' = 'abort') {
  return (_url: string, init?: FetchInit) =>
    new Promise<never>((_resolve, reject) => {
      const fail = () => {
        if (shape === 'network') {
          reject(new TypeError('Network request failed'));
          return;
        }
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      const signal = init?.signal;
      if (signal?.aborted) fail();
      else signal?.addEventListener('abort', fail);
    });
}

/** Rejects immediately, with no abort involved at all: a genuine no-connection. */
function rejectsImmediately() {
  return () => Promise.reject(new TypeError('Network request failed'));
}

/** Answers 200 with an empty JSON body — proof that the server is awake. */
function answersOk() {
  return () =>
    Promise.resolve({
      status: 200,
      json: async () => ({}),
      headers: { get: () => null },
    } as unknown as Response);
}

/** Watch a request settle WITHOUT awaiting it, so a test can assert a pending state. */
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
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// A + B, cold half. MUST run before any case that lets a response through.
// ---------------------------------------------------------------------------
describe('DEP-2 a request with no stated budget outlasts a cold start', () => {
  it('★ is still alive past the old 15 s budget, and ends as a TIMEOUT', async () => {
    fetchMock.mockImplementation(pendingUntilAborted('abort'));
    jest.useFakeTimers();
    const state = track(apiFetch('/api/products'));

    // The defect in one assertion: at the old budget this request was dead.
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    expect(state.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(COLD_START_TIMEOUT_MS);
    expect(state.settled).toBe(true);
    expect(state.code).toBe('NETWORK_TIMEOUT');
  });

  it('★ reports its OWN timeout as a timeout even when the rejection claims a network failure', async () => {
    // This is the device finding: React Native's aborted request rejects as
    // `TypeError: Network request failed`, and the old classification believed it.
    fetchMock.mockImplementation(pendingUntilAborted('network'));
    jest.useFakeTimers();
    const state = track(apiFetch('/api/products', { timeoutMs: 1000 }));

    await jest.advanceTimersByTimeAsync(1001);
    expect(state.settled).toBe(true);
    expect(state.code).toBe('NETWORK_TIMEOUT');
  });

  it('still says UNREACHABLE when nothing was aborted and the connection genuinely failed', async () => {
    fetchMock.mockImplementation(rejectsImmediately());
    await expect(apiFetch('/api/products')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('keeps a caller’s own stop winning over the budget (AI-9 untouched)', async () => {
    fetchMock.mockImplementation(pendingUntilAborted('network'));
    jest.useFakeTimers();
    const controller = new AbortController();
    const state = track(apiFetch('/api/products', { signal: controller.signal }));

    controller.abort();
    await jest.advanceTimersByTimeAsync(1);
    expect(state.code).toBe('REQUEST_CANCELLED');
  });
});

// ---------------------------------------------------------------------------
// B, warm half. A response of any kind is proof the server is awake.
// ---------------------------------------------------------------------------
describe('DEP-2 once the server has answered, the ordinary budget returns', () => {
  it('★ uses the 15 s budget again after one answered request', async () => {
    fetchMock.mockImplementation(answersOk());
    await apiFetch('/api/health');

    fetchMock.mockImplementation(pendingUntilAborted('abort'));
    jest.useFakeTimers();
    const state = track(apiFetch('/api/products'));

    // One millisecond short of the ordinary budget: still pending, which is the
    // assertion the cold-start allowance would fail.
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(state.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(2);
    expect(state.settled).toBe(true);
    expect(state.code).toBe('NETWORK_TIMEOUT');
  });

  it('an explicit timeoutMs still wins in either state', async () => {
    fetchMock.mockImplementation(pendingUntilAborted('abort'));
    await expect(apiFetch('/api/ai/chat', { timeoutMs: 5 })).rejects.toMatchObject({
      code: 'NETWORK_TIMEOUT',
    });
  });
});

// ---------------------------------------------------------------------------
// C. The copy: what the member is told, and when a dev build says more.
// ---------------------------------------------------------------------------
describe('DEP-2 the unreachable message describes the cause', () => {
  it('is the unchanged sentence in a production build', () => {
    expect(unreachableMessage('https://ai-inventory-l1mi.onrender.com', false)).toBe(UNREACHABLE);
    expect(unreachableMessage('http://192.168.1.20:4000', false)).toBe(UNREACHABLE);
  });

  it('★ names the loopback misconfiguration in a DEVELOPMENT build', () => {
    for (const url of ['http://localhost:4000', 'http://127.0.0.1:4000']) {
      const message = unreachableMessage(url, true);
      expect(message).toContain(UNREACHABLE);
      expect(message).toContain(url);
      expect(message).toContain('adb reverse');
    }
  });

  it('adds nothing in a development build that is pointed somewhere real', () => {
    expect(unreachableMessage('http://192.168.1.20:4000', true)).toBe(UNREACHABLE);
    expect(unreachableMessage('https://example.test', true)).toBe(UNREACHABLE);
  });

  it('is wired to the build’s own base URL, not a copy of it', () => {
    const source = readFileSync(join(projectRoot, 'lib', 'client.ts'), 'utf8');
    expect(source).toMatch(/unreachableMessage\(\s*API_URL\s*,\s*__DEV__\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// D. The numbers, and the relationships that stop them drifting.
// ---------------------------------------------------------------------------
describe('DEP-2 the budgets are related to measurements, not invented', () => {
  it('pins the ordinary budget, unchanged', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(15000);
  });

  it('★ the cold budget outlasts the measured cold start with real margin', () => {
    const MEASURED_COLD_START_MS = 32369; // 2026-10-16, first byte, deployed host
    expect(COLD_START_TIMEOUT_MS).toBeGreaterThan(MEASURED_COLD_START_MS);
  });

  it('★ the warm window stays BELOW the host’s own idle-sleep threshold', () => {
    // Render's free instances sleep after 15 minutes idle. A window at or above
    // that would let the client call a sleeping server "awake" and abort at 15 s
    // again — recreating the defect this increment removes.
    const HOST_IDLE_SLEEP_MS = 15 * 60 * 1000;
    expect(SERVER_WARM_WINDOW_MS).toBeGreaterThan(0);
    expect(SERVER_WARM_WINDOW_MS).toBeLessThan(HOST_IDLE_SLEEP_MS);
  });

  it('keeps the assistant’s budget above the turn deadline it must outlast', () => {
    // The relationship AI-1 introduced, re-asserted here because this increment
    // changes how the DEFAULT is chosen.
    const source = readFileSync(
      join(repoRoot, 'server', 'src', 'services', 'ai', 'aiConfig.ts'),
      'utf8',
    );
    const match = source.match(
      /turnDeadlineMs:\s*positiveInt\(\s*process\.env\.AI_TURN_DEADLINE_MS\s*,\s*(\d+)\s*\)/,
    );
    if (!match) throw new Error('could not read AI_TURN_DEADLINE_MS — the guard would be blind');
    expect(AI_REQUEST_TIMEOUT_MS).toBeGreaterThan(Number(match[1]) + 5000);
  });
});

describe('DEP-2 the build this test is running against', () => {
  it('has a base URL at all', () => {
    expect(typeof API_URL).toBe('string');
    expect(API_URL.length).toBeGreaterThan(0);
  });
});
