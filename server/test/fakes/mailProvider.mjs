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
 *   deregisterFakeMailProvider();                   // always, in a finally
 */

import { registerProvider, deregisterProvider } from '../../src/services/mail/providers/index.js';
import { MailDeliveryError } from '../../src/services/mail/mailErrors.js';

export const FAKE_MAIL_PROVIDER = 'fake-mail';

let scenario = null;
let sent = [];

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
      sent.push({ ...message });
      if (scenario) return scenario(message);
      return { id: `${name}-${sent.length}` };
    },
  }));
  return name;
}

export function deregisterFakeMailProvider(name = FAKE_MAIL_PROVIDER) {
  deregisterProvider(name);
  scenario = null;
  sent = [];
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
};
