/**
 * Resend transport.
 *
 * This is the only module in the project that knows Resend exists: the endpoint,
 * the bearer header and Resend's error shape all stop here. Everything above it
 * depends on the provider registry and on a `send({ to, subject, text, html })`
 * contract, so replacing Resend later means writing another factory and nothing
 * else.
 *
 * No SDK is used. Node >= 18.11 has a global fetch and AbortController, and
 * services/ai/providers/http.js already established this shape, so the mail layer
 * adds no dependency. The fetch logic is not shared with the AI layer because the
 * two must raise different error types — sharing it would make the mail service
 * able to throw an AiProviderError, which is exactly the coupling this boundary
 * exists to prevent.
 *
 * LOGGING: this module writes nothing to any log, deliberately. The request body
 * contains the password-reset URL, which carries the raw single-use token; no
 * value here is safe enough to be worth the risk of one careless console.error.
 * The only facts that could ever be logged are the HTTP status and a validated
 * upstream error identifier, and even those are left to a caller that knows the
 * request context. For the same reason the upstream error body, the submitted
 * payload and the underlying transport error are never attached to the thrown
 * error — only a message built from safe facts.
 */

import { MailNotConfigured, MailDeliveryError } from '../mailErrors.js';
import { mailConfig } from '../mailConfig.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend names its errors with short snake_case identifiers (`validation_error`,
 * `rate_limit_exceeded`, …). Accepting only that shape is what makes it safe to
 * put an upstream string into a message we throw: anything else — including the
 * free-text `message` field, which can quote the submitted field values, one of
 * which carries the reset URL — is discarded.
 */
const SAFE_ERROR_NAME = /^[a-z0-9_]{1,64}$/;

export function createResendProvider() {
  return {
    name: 'resend',

    async send({ to, subject, text, html }) {
      const { from, requestTimeoutMs } = mailConfig();
      const apiKey = (process.env.RESEND_API_KEY || '').trim();

      // selectProvider() already refuses to hand this provider out when these are
      // missing, so this is belt-and-braces for a direct construction. Names only
      // — never a value.
      const missing = [];
      if (!apiKey) missing.push('RESEND_API_KEY');
      if (!from) missing.push('MAIL_FROM');
      if (missing.length > 0) {
        throw new MailNotConfigured(
          `The mail provider "resend" is missing required configuration: ${missing.join(', ')}.`,
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

      let res;
      try {
        res = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw new MailDeliveryError('The email service took too long to respond. Please try again.');
        }
        throw new MailDeliveryError('The email service could not be reached. Please try again.');
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        throw new MailDeliveryError(
          `The email service rejected the message (HTTP ${res.status}${await upstreamErrorSuffix(res)}).`,
        );
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new MailDeliveryError('The email service returned an unexpected response.');
      }

      const id = typeof data?.id === 'string' && data.id.trim() !== '' ? data.id : null;
      if (!id) {
        throw new MailDeliveryError('The email service returned an unexpected response.');
      }

      return { id };
    },
  };
}

/**
 * Returns ", validation_error" when the upstream error body names itself safely,
 * and an empty string otherwise. The body is read and discarded: it is never
 * attached to the error and never logged.
 */
async function upstreamErrorSuffix(res) {
  try {
    const data = await res.json();
    const name = typeof data?.name === 'string' ? data.name.trim().toLowerCase() : '';
    return SAFE_ERROR_NAME.test(name) ? `, ${name}` : '';
  } catch {
    // A non-JSON error body carries nothing that may be relayed.
    return '';
  }
}

export default { createResendProvider };
