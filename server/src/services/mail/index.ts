/**
 * The mail service boundary.
 *
 * This is the only mail module the rest of the application imports. Callers —
 * today nothing, later services/passwordReset.service.js — depend on this
 * interface and on the error classes re-exported here, and on nothing else. They
 * never learn which provider is configured, and only resendProvider.js knows that
 * Resend exists.
 *
 * The four exported functions are deliberately small:
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

export default {
  isMailConfigured,
  mailProviderName,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
};
