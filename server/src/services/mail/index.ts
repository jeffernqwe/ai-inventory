/**
 * The mail service boundary.
 *
 * This is the only mail module the rest of the application imports. Callers —
 * today nothing, later services/passwordReset.service.js — depend on this
 * interface and on the error classes re-exported here, and on nothing else. They
 * never learn which provider is configured: each transport module is the only
 * place that knows the upstream it talks to. Brevo is the transport configured in
 * development and production.
 *
 * The exported functions are deliberately small:
 *
 *   isMailConfigured()  — may this server send mail at all? Never throws. Answers
 *                         false when MAIL_PROVIDER is empty, when it names an
 *                         unsupported provider, and when the selected provider is
 *                         missing required configuration.
 *   mailProviderName()  — the configured provider name, for a health line or a
 *                         startup log. Never throws, and is '' when disabled.
 *   sendPasswordResetEmail({ to, resetUrl, expiresInMinutes })
 *                       — renders the template and hands it to the provider.
 *   sendEmailVerificationEmail({ to, code, expiresInMinutes })
 *                       — renders the AUTH-04 verification-code template and
 *                         hands it to the same provider.
 *   sendPasswordResetCodeEmail({ to, code, expiresInMinutes })
 *                       — renders the AUTH-06 six-digit reset-code template.
 *   sendOperationalAlertEmail({ to, subject, text })
 *                       — renders and transports the AI-34 model-health alert. It is
 *                         operator mail, not member mail: no link, no token, no code.
 *
 * Note what sendPasswordResetEmail does NOT do: it does not build the reset URL,
 * does not mint or hash the token, and does not know a user exists. The caller
 * owns the token; this layer only transports a link it is given.
 *
 * Note what sendEmailVerificationEmail does NOT do, for the same reason: it does
 * not generate the code, does not hash it, does not store it, does not read the
 * pepper and does not log it. The caller mints the code and owns the challenge;
 * this layer only delivers the digits it is handed.
 *
 * No module in this layer logs anything. A delivery failure reaches the caller as
 * a MailDeliveryError carrying safe facts only, and the caller decides what may be
 * recorded — the request body never travels with the error, because the reset URL
 * inside it is a live credential.
 */

import { mailConfig } from './mailConfig.ts';
import { selectProvider } from './providers/index.ts';
import { passwordResetEmail } from './templates/passwordReset.ts';
import { emailVerificationEmail } from './templates/emailVerification.ts';
import { passwordResetCodeEmail } from './templates/passwordResetCode.ts';
import { operationalAlertEmail } from './templates/operationalAlert.ts';
import { MailNotConfigured, MailDeliveryError, isMailError } from './mailErrors.ts';

export { MailNotConfigured, MailDeliveryError, isMailError };

/**
 * Everything `sendPasswordResetEmail` needs. All three are required: the caller
 * has already resolved the recipient, owns the reset URL and knows the lifetime
 * the token store used, so there is no sensible default for any of them —
 * `passwordResetEmail` has the defaults, and this layer only transports.
 */
interface PasswordResetEmailRequest {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export function mailProviderName() {
  return (process.env.MAIL_PROVIDER || '').trim().toLowerCase();
}

export function isMailConfigured() {
  try {
    selectProvider();
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders the password-reset email and sends it through the configured provider.
 *
 * Throws MailNotConfigured when mail is disabled or misconfigured, and
 * MailDeliveryError when the provider fails. Both codes are MAIL_* — neither is,
 * or may become, an authentication error.
 */
export async function sendPasswordResetEmail({ to, resetUrl, expiresInMinutes }: PasswordResetEmailRequest) {
  const provider = selectProvider();
  const { appName } = mailConfig();
  const { subject, text, html } = passwordResetEmail({ resetUrl, expiresInMinutes, appName });

  const result = await provider.send({ to, subject, text, html });

  return { id: result?.id ?? null, provider: provider.name };
}

/**
 * Everything `sendEmailVerificationEmail` needs. `to` and `code` are required —
 * the caller has already resolved the recipient and minted the code, so there is
 * no sensible default for either. `expiresInMinutes` is optional because the
 * lifetime is AUTH-04 flow policy and the template already defaults to it; a
 * caller that minted a challenge with a different window may state it.
 */
interface EmailVerificationEmailRequest {
  to: string;
  code: string;
  expiresInMinutes?: number;
}

/**
 * Renders the AUTH-04 email-verification code email and sends it through the
 * configured provider.
 *
 * AWAITED, deliberately. Phase 28 B1 detached the password-reset send from the
 * request path so the HTTP 202 would not wait on a mail provider; the AUTH-04
 * request path has the OPPOSITE requirement, because whether the code reached the
 * recipient decides what the caller reports — the challenge is already current by
 * then, and a delivery failure is answered as EMAIL_VERIFICATION_MAIL_FAILED with
 * no rollback. So this function returns only once the transport has settled.
 *
 * CONFIGURATION FAILURE (D-B2). A missing or unusable mail configuration throws
 * MailNotConfigured (code MAIL_NOT_CONFIGURED) from selectProvider(), before any
 * template is rendered, exactly as sendPasswordResetEmail does. This layer
 * deliberately emits no EMAIL_VERIFICATION_* code: the AUTH-04 HTTP surface maps
 * this condition to EMAIL_VERIFICATION_NOT_CONFIGURED with fixed caller-facing
 * copy, so no environment-variable name, provider name or transport detail
 * reaches a caller. The message on this error object is operator-facing, and
 * `isMailError` is the check that surface uses to recognise it.
 *
 * Nothing here logs: a code is a live credential, and a log aggregator is not a
 * place it may ever appear.
 */
export async function sendEmailVerificationEmail({
  to,
  code,
  expiresInMinutes,
}: EmailVerificationEmailRequest) {
  const provider = selectProvider();
  const { appName } = mailConfig();
  const { subject, text, html } = emailVerificationEmail({ code, expiresInMinutes, appName });

  const result = await provider.send({ to, subject, text, html });

  return { id: result?.id ?? null, provider: provider.name };
}

/**
 * Everything `sendPasswordResetCodeEmail` needs. `to` and `code` are required: the caller has
 * already resolved the recipient and minted the code, so neither has a sensible default.
 * `expiresInMinutes` is optional because the lifetime is AUTH-06 flow policy and the template
 * already defaults to it.
 */
interface PasswordResetCodeEmailRequest {
  to: string;
  code: string;
  expiresInMinutes?: number;
}

/**
 * Renders the AUTH-06 password-reset code email and sends it through the configured provider.
 *
 * AWAITED BY ITS CALLER? No — the opposite of `sendEmailVerificationEmail` and the same as Phase
 * 28 B1's reset link: this function returns a promise, but the reset request path deliberately
 * does NOT await it, because a delivery failure must not become an observable difference between
 * a known and an unknown address. The caller attaches its rejection handler in the same
 * synchronous turn.
 *
 * CONFIGURATION FAILURE (D-B2, reused). A missing or unusable mail configuration throws
 * `MailNotConfigured` from `selectProvider()` before any template is rendered. This layer emits
 * no `PASSWORD_RESET_CODE_*` code: the HTTP surface maps the condition to its own fixed copy, so
 * no environment-variable name, provider name or transport detail reaches an unauthenticated
 * caller.
 *
 * Nothing here logs: a code is a live credential, and a log aggregator is not a place it may ever
 * appear.
 */
export async function sendPasswordResetCodeEmail({
  to,
  code,
  expiresInMinutes,
}: PasswordResetCodeEmailRequest) {
  const provider = selectProvider();
  const { appName } = mailConfig();
  const { subject, text, html } = passwordResetCodeEmail({ code, expiresInMinutes, appName });

  const result = await provider.send({ to, subject, text, html });

  return { id: result?.id ?? null, provider: provider.name };
}

/**
 * Everything `sendOperationalAlertEmail` needs. The caller owns the wording and the
 * decision; this layer only renders and transports. `subject` and `text` are required
 * because an alert with no content would be worse than no alert at all.
 */
interface OperationalAlertEmailRequest {
  to: string;
  subject: string;
  text: string;
}

/**
 * Renders the AI-34 model-health alert and sends it through the configured provider.
 *
 * Unlike the member-facing sends, this is operator mail: it never contains a reset link,
 * a verification code, a password or a session. The watchdog builds a report of model
 * ids, endpoint statuses and uptime, and this function adds only the HTML shell.
 *
 * Throws MailNotConfigured when mail is disabled or misconfigured, and MailDeliveryError
 * when the provider fails. The watchdog catches both and falls back to its log — an alert
 * that cannot be delivered must still be recorded.
 */
export async function sendOperationalAlertEmail({ to, subject, text }: OperationalAlertEmailRequest) {
  const provider = selectProvider();
  const { appName } = mailConfig();
  const { subject: renderedSubject, text: renderedText, html } = operationalAlertEmail({
    subject,
    text,
    appName,
  });

  const result = await provider.send({ to, subject: renderedSubject, text: renderedText, html });

  return { id: result?.id ?? null, provider: provider.name };
}

export default {
  isMailConfigured,
  mailProviderName,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendPasswordResetCodeEmail,
  sendOperationalAlertEmail,
};
