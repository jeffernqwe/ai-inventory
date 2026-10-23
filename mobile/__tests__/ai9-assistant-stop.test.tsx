/**
 * AI-9 — the assistant's turn can be stopped, and a stop is not a failure.
 *
 * WHY THIS EXISTS. Measured on the device, a real turn runs 6–40 s and the server is
 * allowed a full minute (`AI_TURN_DEADLINE_MS`); the client waits 75 s for it. Until
 * this change the member had no way to end that wait: the Send button sat behind
 * `loading` with an emptied input (so it was disabled), and the only exits were to
 * leave the screen or kill the app. Both of those abort the request — which is exactly
 * what AI-1's Task 5 exists to handle — but neither is a decision the app made, and
 * neither can be described to the member.
 *
 * THE DISTINCTION THAT HAD TO BE BUILT, NOT ASSUMED. A stop and a timeout arrive at
 * `fetch` as the same `AbortError`, because both abort the same controller. Without a
 * separate code, stopping a slow turn would have been reported as `NETWORK_TIMEOUT` —
 * *"The assistant took too long to answer. Please try again."* — a sentence about a
 * problem the member does not have, and one that invites them to retry the very turn
 * they just cancelled. The transport therefore reads back WHOSE abort fired, and the
 * screen routes that one code away from the error banner entirely.
 *
 * The negative controls are the point of the transport cases: a function that reported
 * every abort as a cancellation fails the `NETWORK_TIMEOUT` case, and one that kept
 * treating every abort as a timeout fails the `REQUEST_CANCELLED` case.
 *
 * WHAT THIS DOES NOT PROVE. That the server ends the turn when the socket closes —
 * that is AI-1's `499 AI_ABANDONED`, covered by the server suite and stated as
 * mechanism here, not measured. It also says nothing about what the member sees when
 * they stop a turn the model had already finished: the answer is stored either way, so
 * the note's copy deliberately promises only what is true in both cases.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AiChat, { isStoppedSend, sendErrorMessage } from '../components/AiChat';
import { aiApi } from '../lib/api';
import { useSession } from '../lib/auth';
import { ApiError, REQUEST_CANCELLED, apiFetch } from '../lib/client';
import { ThemeProvider } from '../lib/theme-context';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
  isSessionError: () => false,
}));

jest.mock('../lib/api', () => ({
  aiApi: { chat: jest.fn(), chatStream: jest.fn(), messages: jest.fn() },
}));

const chat = aiApi.chat as jest.Mock;
const chatStream = aiApi.chatStream as jest.Mock;
const messages = aiApi.messages as jest.Mock;
const mockedUseSession = useSession as jest.Mock;

const signOut = jest.fn();

/**
 * A turn that only ends if the caller stops it — the shape a slow model produces.
 *
 * It also *requires* a signal: without one it never settles, so a screen that forgot to
 * pass one fails by timing out rather than by quietly passing this suite.
 */
const pendingUntilStopped = (_token: string, _body: unknown, options?: { signal?: AbortSignal }) =>
  new Promise((_resolve, reject) => {
    const signal = options?.signal;
    if (!signal) return;
    signal.addEventListener('abort', () =>
      reject(new ApiError(0, REQUEST_CANCELLED, 'The request was cancelled.')),
    );
  });

const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

const PLACEHOLDER = 'Ask about your stock…';

/** Mount a brand-new chat (no conversationId) and wait for the welcome state. */
const mount = async () => {
  const view = await withTheme(<AiChat />);
  await waitFor(() => expect(view.getByText('Ask about your inventory')).toBeTruthy());
  return view;
};

/**
 * Press a button and let the turn it starts stay in flight.
 *
 * The press is deliberately NOT awaited: RNTL 14's `fireEvent.press` resolves only after
 * the handler's own work settles, and a turn that is meant to stay pending settles only
 * when it is stopped — so awaiting it here would deadlock until jest's own test timeout
 * (measured: 5000 ms, three cases). `waitFor` below is what flushes the update instead, and
 * it is also the assertion: the Stop button appearing IS the state change under test.
 */
const press = (view: Awaited<ReturnType<typeof mount>>, name: string): void => {
  void fireEvent.press(view.getByRole('button', { name }));
};

/** Type a question and send it, leaving the turn deliberately unresolved. */
const ask = async (view: Awaited<ReturnType<typeof mount>>, text: string) => {
  await fireEvent.changeText(view.getByPlaceholderText(PLACEHOLDER), text);
  press(view, 'Send');
  await waitFor(() => expect(view.getByText('Stop')).toBeTruthy());
};

beforeEach(() => {
  jest.clearAllMocks();
  chat.mockImplementation(pendingUntilStopped);
  // AI-40 — the screen streams first. These cases are about the NON-streaming turn's behaviour
  // (a stop, an error, a session ending), so the stream is made to fail the way an old server
  // would and the ordinary route is what they exercise.
  chatStream.mockRejectedValue(new ApiError(404, null, 'Not found'));
  messages.mockResolvedValue({ items: [], total: 0 });
  mockedUseSession.mockReturnValue({
    user: { id: 'u1', name: 'Test Member' },
    token: 'token-1',
    signOut,
  });
});

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

describe('AI-9 — a slow turn can be stopped', () => {
  it('★ turns the send action into a stop while a turn is in flight', async () => {
    const view = await mount();
    await ask(view, 'Which products are low on stock?');

    // The regression this pins: the slot used to be a disabled Send button for the
    // whole wait, which is precisely when the member wants the opposite.
    expect(view.getByText('Stop')).toBeTruthy();
    expect(view.queryByText('Send')).toBeNull();

    expect(chat).toHaveBeenCalledTimes(1);
    const options = chat.mock.calls[0][2] as { signal?: AbortSignal } | undefined;
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.signal?.aborted).toBe(false);

    // The wait is stated rather than implied: the server's own ceiling is a minute, and
    // the measured device turns run 6–40 s.
    expect(view.getByText(/up to a minute/)).toBeTruthy();
  });

  it('★ reports a stop as the member’s own decision, not as a failure', async () => {
    const view = await mount();
    await ask(view, 'How much stock do we hold?');

    press(view, 'Stop');
    await waitFor(() => expect(view.getByTestId('chat-stopped-note')).toBeTruthy());

    // Neither of the two sentences a failure would produce. Both are checked because
    // either one is the bug: the timeout sentence blames the assistant for the wait,
    // and the network sentence sends the member to check a working connection.
    expect(view.queryByText(/took too long/)).toBeNull();
    expect(view.queryByText(/Cannot reach the server/)).toBeNull();

    // A stop is not session loss, and must never be able to become it.
    expect(signOut).not.toHaveBeenCalled();

    // The composer is usable again immediately, and the question is still on screen,
    // so the member can see what was stopped.
    expect(view.getByText('Send')).toBeTruthy();
    expect(view.getByText('How much stock do we hold?')).toBeTruthy();
  });

  it('the question is not lost: the next turn sends and renders its answer', async () => {
    const view = await mount();
    await ask(view, 'first');
    press(view, 'Stop');
    await waitFor(() => expect(view.getByTestId('chat-stopped-note')).toBeTruthy());

    chat.mockImplementationOnce(() =>
      Promise.resolve({
        conversation: { id: 'c1' },
        assistantMessage: { id: 'm2', role: 'ASSISTANT', content: 'Twelve units.' },
      }),
    );

    await fireEvent.changeText(view.getByPlaceholderText(PLACEHOLDER), 'second');
    press(view, 'Send');

    await waitFor(() => expect(view.getByText('Twelve units.')).toBeTruthy());
    // The note belonged to the stopped turn, so it does not follow the member forward.
    expect(view.queryByTestId('chat-stopped-note')).toBeNull();
  });

  it('negative control: a real timeout still reads as a slow assistant, not as a stop', async () => {
    chat.mockImplementationOnce(() =>
      Promise.reject(new ApiError(0, 'NETWORK_TIMEOUT', 'The request timed out.')),
    );
    const view = await mount();

    await fireEvent.changeText(view.getByPlaceholderText(PLACEHOLDER), 'why');
    press(view, 'Send');

    await waitFor(() =>
      expect(view.getByText('The assistant took too long to answer. Please try again.')).toBeTruthy(),
    );
    expect(view.queryByTestId('chat-stopped-note')).toBeNull();
    expect(view.getByText('Send')).toBeTruthy();
  });
});

describe('AI-9 — the distinction itself', () => {
  it('recognises only the transport’s own cancellation code', () => {
    expect(isStoppedSend(new ApiError(0, REQUEST_CANCELLED, 'x'))).toBe(true);
    // The three a stop must never be confused with.
    expect(isStoppedSend(new ApiError(0, 'NETWORK_TIMEOUT', 'x'))).toBe(false);
    expect(isStoppedSend(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(false);
    expect(isStoppedSend(new ApiError(499, 'AI_ABANDONED', 'x'))).toBe(false);
    expect(isStoppedSend(undefined)).toBe(false);
  });

  it('never lets a stop be described as an unreachable server', () => {
    // `isNetwork` is true for this error — status 0 — which is the trap: the original
    // ISS-21 defect was exactly this ordering. The screen routes a stop away from the
    // banner; this case keeps the wrong sentence unreachable even if one does not.
    expect(sendErrorMessage({ code: REQUEST_CANCELLED, isNetwork: true })).toBe(
      'You stopped waiting for that answer.',
    );
    // Negative control: the genuine transport failure still says so.
    expect(sendErrorMessage({ code: 'NETWORK_ERROR', isNetwork: true })).toBe(
      'Cannot reach the server. Check your connection and try again.',
    );
  });
});

// ---------------------------------------------------------------------------
// The transport: whose abort was it?
// ---------------------------------------------------------------------------

describe('AI-9 — the transport keeps a caller’s stop apart from its own timeout', () => {
  const fetchMock = jest.fn();

  /**
   * A fetch that settles only when the signal IT was given aborts.
   *
   * It also rejects an ALREADY-aborted signal, which is what the platform does. That case became
   * reachable with AI-40: the token is now resolved before the request starts (one microtask), so
   * a caller that aborts synchronously no longer wins a race it used to lose — the request is
   * cancelled before it is sent. A double that only listened would hang instead.
   */
  const fetchWaitingForAbort = (_url: string, init: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      const abort = () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (init?.signal?.aborted) {
        abort();
        return;
      }
      init?.signal?.addEventListener('abort', abort);
    });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(fetchWaitingForAbort);
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  it('★ reports the caller’s own abort as REQUEST_CANCELLED, never as a timeout', async () => {
    const controller = new AbortController();
    const pending = apiFetch('/api/ai/chat', {
      method: 'POST',
      signal: controller.signal,
      // A budget far longer than this test: only the caller's own abort can end it.
      timeoutMs: 60_000,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: REQUEST_CANCELLED, status: 0 });
  });

  it('negative control: with a signal supplied but never aborted, the budget still wins', async () => {
    const controller = new AbortController();

    await expect(
      apiFetch('/api/ai/chat', { signal: controller.signal, timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });

    // The control proves the case above is reading the signal, not merely never timing
    // out: the same stub, the same supplied signal, a different outcome.
    expect(controller.signal.aborted).toBe(false);
  });

  it('a stop is never reported as session loss', async () => {
    const lost = jest.fn();
    const { setSessionLostHandler } = jest.requireActual<typeof import('../lib/client')>('../lib/client');
    setSessionLostHandler(lost);

    const controller = new AbortController();
    const pending = apiFetch('/api/ai/chat', { token: 'token-1', signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: REQUEST_CANCELLED });
    expect(lost).not.toHaveBeenCalled();
    setSessionLostHandler(null);
  });
});
