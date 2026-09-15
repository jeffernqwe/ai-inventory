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

import { MailNotConfigured, MailDeliveryError } from '../mailErrors.ts';
import { mailConfig } from '../mailConfig.ts';
import type { MailProvider } from './index.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend names its errors with short snake_case identifiers (`validation_error`,
 * `rate_limit_exceeded`, …). Accepting only that shape is what makes it safe to
 * put an upstream string into a message we throw: anything else — including the
 * free-text `message` field, which can quote the submitted field values, one of
 * which carries the reset URL — is discarded.
 */
const SAFE_ERROR_NAME = /^[a-z0-9_]{1,64}$/;

/**
 * The upstream JSON body, as far as anything here is allowed to assume: an object
 * whose properties are probed and never trusted. `Response.json()` is typed
 * `unknown`, and this local contract is the narrowest thing that permits the
 * `data?.id` / `data?.name` reads below while leaving every `typeof` guard doing
 * the real work — nothing is coerced and no default is introduced, so an array,
 * a string or a body missing the property still behaves exactly as it did when
 * the local was untyped.
 */
type UpstreamJsonBody = Record<string, unknown>;

/**
 * The return annotation is what types `send` below: the object literal is
 * contextually checked against the registry's contract, so its destructured
 * parameter needs no annotation of its own and the emitted method signature is
 * unchanged.
 */
export function createResendProvider(): MailProvider {
  return {
    name: 'resend',

    async send({ to, subject, text, html }) {
      const { from, requestTimeoutMs } = mailConfig();
      const apiKey = (process.env.RESEND_API_KEY || '').trim();

      // selectProvider() already refuses to hand this provider out when these are
      // missing, so this is belt-and-braces for a direct construction. Names only
      // — never a value.
      const missing: string[] = [];
      if (!apiKey) missing.push('RESEND_API_KEY');
      if (!from) missing.push('MAIL_FROM');
      if (missing.length > 0) {
        throw new MailNotConfigured(
          `The mail provider "resend" is missing required configuration: ${missing.join(', ')}.`,
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

      // The definite-assignment assertion is what replaces the untyped `let res;`
      // without touching the flow: every path that reaches the read below has
      // either assigned a response or thrown. Erased, so the declaration is still
      // emitted as a bare `let res;`.
      let res!: Response;
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
        // `err` is `unknown`: a thrown value has no shape TypeScript may assume,
        // and the assertion is the erasable way to read the one property this
        // check has always read. Nothing is attached to the error that leaves.
        if ((err as { name?: unknown })?.name === 'AbortError') {
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

      let data: UpstreamJsonBody;
      try {
        data = await res.json() as UpstreamJsonBody;
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
async function upstreamErrorSuffix(res: Response) {
  try {
    const data = await res.json() as UpstreamJsonBody;
    const name = typeof data?.name === 'string' ? data.name.trim().toLowerCase() : '';
    return SAFE_ERROR_NAME.test(name) ? `, ${name}` : '';
  } catch {
    // A non-JSON error body carries nothing that may be relayed.
    return '';
  }
}

export default { createResendProvider };
