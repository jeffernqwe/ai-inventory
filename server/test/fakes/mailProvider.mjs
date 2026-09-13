/**
 * A fake mail provider registered through the real registry seam.
 *
 * The production mail service has no capture mechanism, and must never grow one:
 * capturing messages means holding a live reset URL in memory outside the send
 * call. This file is test infrastructure and is the only place a captured message
 * exists, which is why it may hold the raw reset URL.
 *
 * Usage:
 *   registerFakeMailProvider();
 *   setFakeMailScenario(fakeMailFailure('...'));   // optional; default succeeds
 *   process.env.MAIL_PROVIDER = FAKE_MAIL_PROVIDER;
 *   ...
 *   sentMessages();                                 // what was handed to the transport
 *   await awaitPendingMail();                       // Phase 28 B1: let it settle
 *   deregisterFakeMailProvider();                   // always, in a finally
 *
 * `sentMessages()` answers "was the transport reached", which is still true
 * synchronously. `awaitPendingMail()` answers "and how did it turn out", which
 * since Phase 28 B1 happens after the HTTP response.
 */

import { registerProvider, deregisterProvider } from '../../src/services/mail/providers/index.js';
import { MailDeliveryError } from '../../src/services/mail/mailErrors.ts';

export const FAKE_MAIL_PROVIDER = 'fake-mail';

let scenario = null;
let sent = [];
let inflight = new Set();

/**
 * Phase 28 B1 — follows one attempt to settlement.
 *
 * Since B1 the production service does not await the send, so a test can no
 * longer assume the transport has finished when the HTTP response arrives.
 * Without this, `sentMessages()` proves only that the send was ENTERED (which is
 * still synchronous, and still the useful half) while the scenario's outcome —
 * success, failure, the log record it produces — lands an unknown number of
 * microtasks later.
 *
 * The tracked promise is a settled-safe COPY: both handlers are attached, so the
 * tracker can never be the source of the unhandled rejection these tests exist to
 * rule out. The original promise is untouched and stays the service's to handle.
 */
function track(promise) {
  const entry = promise.then(
    () => {},
    () => {}
  );
  inflight.add(entry);
  entry.then(() => inflight.delete(entry));
  return entry;
}

/**
 * Waits for every in-flight send to settle, so background delivery is
 * deterministic in tests rather than timed.
 *
 * Rounds rather than a single pass: `setImmediate` lets the detached chain run,
 * the `allSettled` then covers whatever reached the transport, and the loop
 * repeats in case settling one send started another. Returns as soon as a round
 * finds nothing in flight, so a normal call costs one macrotask.
 *
 * A scenario that never settles (see `fakeMailGate`) will block this — release
 * the gate first.
 */
export async function awaitPendingMail({ rounds = 10 } = {}) {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    if (inflight.size === 0) return;
    await Promise.allSettled([...inflight]);
  }
}

/** Promises currently in flight. For asserting that a send is still blocked. */
export function pendingMailCount() {
  return inflight.size;
}

/**
 * A scenario whose send enters the transport and then BLOCKS until released.
 *
 * This is what makes "the 202 does not wait for the transport" testable: the
 * attempt is recorded by `send` before the scenario runs, so a test can hold the
 * send open, observe that the HTTP response has already arrived, and only then
 * release it.
 *
 * With `fail`, the release produces a MailDeliveryError instead of a success —
 * which is how a test can prove a delivery failure is logged strictly AFTER the
 * response, rather than merely asserting the log exists at the end.
 */
export function fakeMailGate({ fail } = {}) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return {
    scenario: () =>
      gate.then(() => {
        if (fail) throw new MailDeliveryError(fail);
        return { id: 'fake-gated' };
      }),
    release: () => release(),
  };
}

/** Overrides the send behaviour. `null` restores the default success. */
export function setFakeMailScenario(fn) {
  scenario = typeof fn === 'function' ? fn : null;
}

/** Recorded at attempt time, so a failing scenario still shows what was attempted. */
export function sentMessages() {
  return sent.slice();
}

export function lastSentMessage() {
  return sent.length > 0 ? sent[sent.length - 1] : null;
}

export function clearSentMessages() {
  sent = [];
}

export function registerFakeMailProvider(name = FAKE_MAIL_PROVIDER) {
  registerProvider(name, () => ({
    name,
    async send(message) {
      // Recorded at attempt time — the FIRST statement, and still synchronous.
      // That is what lets a test observe that the transport was reached even
      // while the scenario is blocked, which is how Phase 28 B1 proves the 202
      // no longer waits for delivery.
      sent.push({ ...message });
      const attempt = scenario
        ? Promise.resolve().then(() => scenario(message))
        : Promise.resolve({ id: `${name}-${sent.length}` });
      // Tracked for determinism, but the ORIGINAL is returned: `track` is a
      // swallowed copy, and handing it back would hide the rejection the service
      // is required to observe.
      track(attempt);
      return attempt;
    },
  }));
  return name;
}

export function deregisterFakeMailProvider(name = FAKE_MAIL_PROVIDER) {
  deregisterProvider(name);
  scenario = null;
  sent = [];
  inflight = new Set();
}

export function fakeMailSuccess(id = 'fake-message-id') {
  return () => ({ id });
}

export function fakeMailFailure(message = 'The email could not be sent.') {
  return () => {
    throw new MailDeliveryError(message);
  };
}

export default {
  FAKE_MAIL_PROVIDER,
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  setFakeMailScenario,
  sentMessages,
  lastSentMessage,
  clearSentMessages,
  fakeMailSuccess,
  fakeMailFailure,
  awaitPendingMail,
  pendingMailCount,
  fakeMailGate,
};
