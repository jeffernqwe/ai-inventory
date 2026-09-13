/**
 * The mail service boundary.
 *
 * This is the only mail module the rest of the application imports. Callers —
 * today nothing, later services/passwordReset.service.js — depend on this
 * interface and on the error classes re-exported here, and on nothing else. They
 * never learn which provider is configured, and only resendProvider.js knows that
 * Resend exists.
 *
 * The three exported functions are deliberately small:
 *
 *   isMailConfigured()  — may this server send mail at all? Never throws. Answers
 *                         false when MAIL_PROVIDER is empty, when it names an
 *                         unsupported provider, and when the selected provider is
 *                         missing required configuration.
 *   mailProviderName()  — the configured provider name, for a health line or a
 *                         startup log. Never throws, and is '' when disabled.
 *   sendPasswordResetEmail({ to, resetUrl, expiresInMinutes })
 *                       — renders the template and hands it to the provider.
 *
 * Note what sendPasswordResetEmail does NOT do: it does not build the reset URL,
 * does not mint or hash the token, and does not know a user exists. The caller
 * owns the token; this layer only transports a link it is given.
 *
 * No module in this layer logs anything. A delivery failure reaches the caller as
 * a MailDeliveryError carrying safe facts only, and the caller decides what may be
 * recorded — the request body never travels with the error, because the reset URL
 * inside it is a live credential.
 */

import { mailConfig } from './mailConfig.ts';
import { selectProvider } from './providers/index.js';
import { passwordResetEmail } from './templates/passwordReset.ts';
import { MailNotConfigured, MailDeliveryError, isMailError } from './mailErrors.ts';

export { MailNotConfigured, MailDeliveryError, isMailError };

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
export async function sendPasswordResetEmail({ to, resetUrl, expiresInMinutes }) {
  const provider = selectProvider();
  const { appName } = mailConfig();
  const { subject, text, html } = passwordResetEmail({ resetUrl, expiresInMinutes, appName });

  const result = await provider.send({ to, subject, text, html });

  return { id: result?.id ?? null, provider: provider.name };
}

export default { isMailConfigured, mailProviderName, sendPasswordResetEmail };
