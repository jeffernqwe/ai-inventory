/**
 * Mail error layer, mirroring services/ai/aiErrors.js.
 *
 * Two distinct conditions, two distinct codes:
 *
 *   MAIL_NOT_CONFIGURED — an operator problem. MAIL_PROVIDER is empty, names an
 *     unsupported provider, or the selected provider is missing required
 *     configuration. Nothing was attempted.
 *   MAIL_UNAVAILABLE — an upstream problem. The email service was unreachable,
 *     timed out, or rejected the message.
 *
 * Both codes are namespaced MAIL_* on purpose. A delivery failure must never be
 * mistaken for an authentication failure: a later controller decides how to
 * answer a caller, and it distinguishes these from auth errors by code, so
 * nothing here may reuse an auth or session code. `isMailError()` is the check
 * that boundary uses.
 */

export const MAIL_NOT_CONFIGURED = 'MAIL_NOT_CONFIGURED';
export const MAIL_UNAVAILABLE = 'MAIL_UNAVAILABLE';

export class MailNotConfigured extends Error {
  constructor(message = 'Email delivery is not configured on this server.') {
    super(message);
    this.name = 'MailNotConfigured';
    this.code = MAIL_NOT_CONFIGURED;
  }
}

export class MailDeliveryError extends Error {
  constructor(message = 'The email could not be sent.', code = MAIL_UNAVAILABLE) {
    super(message);
    this.name = 'MailDeliveryError';
    this.code = code;
  }
}

export function isMailError(err) {
  return err instanceof MailNotConfigured || err instanceof MailDeliveryError;
}

export default {
  MailNotConfigured,
  MailDeliveryError,
  MAIL_NOT_CONFIGURED,
  MAIL_UNAVAILABLE,
  isMailError,
};
