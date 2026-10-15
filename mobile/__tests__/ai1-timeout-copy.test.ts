/**
 * AI-1 — the assistant's failure copy must describe what actually happened.
 *
 * THE DEFECT (ISS-21, root cause RC-3). `sendErrorMessage` tested `e.isNetwork`,
 * which is `status === 0`, BEFORE it could ever look at the error's code. A
 * timeout is also a `status === 0` error, so the two collapsed into one message:
 *
 *     "Cannot reach the server. Check your connection and try again."
 *
 * That is what the user saw on 2026-10-12 when the assistant was simply slow.
 * The sentence was not merely unhelpful — it sent them to check a connection that
 * was working, and it named the wrong component as the cause.
 *
 * The distinction the transport already draws is `NETWORK_TIMEOUT` (we gave up
 * waiting) versus `NETWORK_ERROR` (we could not connect). This suite requires the
 * screen to keep them apart, and requires every other code's copy to be
 * unchanged. It is a table with a negative control in both directions: a function
 * that returned the timeout sentence for everything fails the NETWORK_ERROR and
 * AI_NOT_CONFIGURED rows, and one that kept the old ordering fails the first two.
 */

import { sendErrorMessage } from '../components/AiChat';

const TOO_LONG = 'The assistant took too long to answer. Please try again.';
const UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';

describe('AI-1 — a timeout is reported as a timeout, not as a network failure', () => {
  it('names the wait when the CLIENT gave up (NETWORK_TIMEOUT)', () => {
    // `isNetwork` is true here too — the code must win, which is the whole fix.
    expect(sendErrorMessage({ code: 'NETWORK_TIMEOUT', isNetwork: true })).toBe(TOO_LONG);
  });

  it('names the wait when the SERVER said its own deadline expired (AI_TIMEOUT)', () => {
    expect(sendErrorMessage({ code: 'AI_TIMEOUT' })).toBe(TOO_LONG);
  });

  it('still says the server is unreachable when it actually is', () => {
    expect(sendErrorMessage({ code: 'NETWORK_ERROR', isNetwork: true })).toBe(UNREACHABLE);
  });

  it('keeps "unreachable" as the meaning of a bare network error with no code', () => {
    // Unchanged default: a transport failure the client could not classify.
    expect(sendErrorMessage({ isNetwork: true })).toBe(UNREACHABLE);
  });
});

describe('AI-1 — every other assistant failure keeps its existing copy', () => {
  it('AI_NOT_CONFIGURED still points at an administrator', () => {
    expect(sendErrorMessage({ code: 'AI_NOT_CONFIGURED' })).toMatch(/not enabled on this server/);
  });

  it('AI_UNAVAILABLE still says temporarily unavailable', () => {
    expect(sendErrorMessage({ code: 'AI_UNAVAILABLE' })).toMatch(/temporarily unavailable/);
  });

  it('AI_RATE_LIMITED still names the rate limit', () => {
    expect(sendErrorMessage({ code: 'AI_RATE_LIMITED' })).toMatch(/too quickly/);
  });

  it('a field-level problem is still surfaced verbatim', () => {
    expect(sendErrorMessage({ fields: [{ field: 'message', message: 'Message is too long.' }] })).toBe(
      'Message is too long.',
    );
  });

  it('an unclassified error still falls back to its own message', () => {
    expect(sendErrorMessage({ message: 'Something else went wrong.' })).toBe(
      'Something else went wrong.',
    );
  });
});
