/**
 * Brevo transport.
 *
 * This is the second module in the project that knows one provider exists — the
 * endpoint, the `api-key` header and Brevo's error shape all stop here, exactly as
 * resendProvider.ts keeps Resend's. Everything above it depends on the provider
 * registry and on a `send({ to, subject, text, html })` contract, so which of the
 * two transports delivers a message is a matter of `MAIL_PROVIDER` and nothing
 * else. The two providers are deliberately independent files: neither shares a
 * fetch helper, because the two upstreams do not share a payload, a header or an
 * error body, and the coupling a shared helper would introduce is exactly what
 * this boundary exists to prevent.
 *
 * No SDK is used. Node >= 18.11 has a global fetch and AbortController, and
 * services/ai/providers/http.js already established this shape, so the mail layer
 * adds no dependency.
 *
 * THE SENDER IS THE ONE THING THIS PROVIDER DOES DIFFERENTLY, and it does it
 * locally. Resend is handed `from` verbatim as an RFC 5322 string; Brevo wants a
 * structured `sender: { name, email }`. `MAIL_FROM` stays the single generic
 * sender variable it always was — `mailConfig.ts` is NOT extended — and the
 * display-name form is split here, in the only module that needs it. A value
 * without a display name falls back to `{ email: raw }`. No Brevo-specific sender
 * address is hardcoded anywhere: an operator points `MAIL_FROM` at a sender the
 * Brevo account has verified, and nothing in this file assumes which one.
 *
 * LOGGING: this module writes nothing to any log, deliberately. The request body
 * contains the password-reset URL (which carries the raw single-use token) or the
 * AUTH-04 verification code, and neither may reach a log aggregator. The upstream
 * error body is read and discarded — Brevo's free-text `message` can quote the
 * submitted field values — and nothing but a validated snake_case `code` and the
 * HTTP status is ever put into a message we throw. The submitted payload and the
 * underlying transport error are never attached to the thrown error.
 */

import { MailNotConfigured, MailDeliveryError } from '../mailErrors.ts';
import { mailConfig } from '../mailConfig.ts';
import type { MailProvider } from './index.ts';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo names its failures with a `code` from a fixed enum. Some of those values
 * are snake_case identifiers (`invalid_parameter`, `not_enough_credits`,
 * `account_under_validation`) and some are prose (`Domain does not exist`,
 * `Authentication failed`). Accepting only the identifier shape is what makes it
 * safe to put an upstream string into a message we throw: anything else — and in
 * particular the free-text `message`, which can echo the submitted field values —
 * is discarded.
 */
const SAFE_ERROR_NAME = /^[a-z0-9_]{1,64}$/;

/**
 * The upstream JSON body, as far as anything here is allowed to assume: an object
 * whose properties are probed and never trusted. `Response.json()` is typed
 * `unknown`, and this local contract is the narrowest thing that permits the
 * `data?.messageId` / `data?.code` reads below while leaving every `typeof` guard
 * doing the real work.
 */
type UpstreamJsonBody = Record<string, unknown>;

/** What Brevo's `sender` field expects: an address, with a display name when one was given. */
interface ParsedSender {
  name?: string;
  email: string;
}

/**
 * Splits a generic `MAIL_FROM` value into Brevo's structured sender.
 *
 * `Inventory AI <no-reply@example.com>` becomes `{ name: 'Inventory AI', email:
 * 'no-reply@example.com' }`; a quoted display name is unquoted; a bare address
 * becomes `{ email: '<raw>' }`. This is a provider-local concern by design — it is
 * why `mailConfig.ts` needs no change and why the Resend path is untouched.
 *
 * The address itself is never validated here beyond being non-empty: an operator
 * misconfiguration is a provider rejection with a real status, not a local guess
 * about what Brevo will accept.
 */
function parseSender(from: string): ParsedSender {
  const raw = typeof from === 'string' ? from.trim() : '';
  const match = /^(.*?)\s*<\s*([^<>]+?)\s*>$/.exec(raw);
  if (match) {
    const name = (match[1] ?? '').trim().replace(/^"(.*)"$/, '$1').trim();
    const email = (match[2] ?? '').trim();
    if (email) return name ? { name, email } : { email };
  }
  return { email: raw };
}

/**
 * The return annotation is what types `send` below: the object literal is
 * contextually checked against the registry's contract, so its destructured
 * parameter needs no annotation of its own and the emitted method signature is
 * unchanged.
 */
export function createBrevoProvider(): MailProvider {
  return {
    name: 'brevo',

    async send({ to, subject, text, html }) {
      const { from, requestTimeoutMs } = mailConfig();
      const apiKey = (process.env.BREVO_API_KEY || '').trim();

      // selectProvider() already refuses to hand this provider out when these are
      // missing, so this is belt-and-braces for a direct construction. Names only
      // — never a value.
      const missing: string[] = [];
      if (!apiKey) missing.push('BREVO_API_KEY');
      if (!from) missing.push('MAIL_FROM');
      if (missing.length > 0) {
        throw new MailNotConfigured(
          `The mail provider "brevo" is missing required configuration: ${missing.join(', ')}.`,
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

      // The definite-assignment assertion is what replaces an untyped `let res;`
      // without touching the flow: every path that reaches the read below has
      // either assigned a response or thrown. Erased, so the declaration is still
      // emitted as a bare `let res;`.
      let res!: Response;
      try {
        res = await fetch(BREVO_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            sender: parseSender(from),
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        // `err` is `unknown`: a thrown value has no shape TypeScript may assume.
        // Nothing is attached to the error that leaves.
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

      const id = typeof data?.messageId === 'string' && data.messageId.trim() !== '' ? data.messageId : null;
      if (!id) {
        throw new MailDeliveryError('The email service returned an unexpected response.');
      }

      return { id };
    },
  };
}

/**
 * Returns ", invalid_parameter" when Brevo's error body names itself with a safe
 * snake_case code, and an empty string otherwise. The body is read and discarded:
 * it is never attached to the error and never logged, so the free-text `message`
 * cannot carry the reset URL or the verification code into a thrown error.
 */
async function upstreamErrorSuffix(res: Response) {
  try {
    const data = await res.json() as UpstreamJsonBody;
    const name = typeof data?.code === 'string' ? data.code.trim().toLowerCase() : '';
    return SAFE_ERROR_NAME.test(name) ? `, ${name}` : '';
  } catch {
    // A non-JSON error body carries nothing that may be relayed.
    return '';
  }
}

export default { createBrevoProvider };
