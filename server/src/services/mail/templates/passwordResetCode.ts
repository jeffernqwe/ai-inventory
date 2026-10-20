/**
 * The password-reset code email body (AUTH-06).
 *
 * A pure function of its inputs: no I/O, no clock, no randomness, no database, no environment, no
 * network. The caller mints the code and owns its lifetime; this renderer only presents what it is
 * handed, so it never sees a pepper, a `codeHmac` or an `emailHmac`.
 *
 * THE ONLY SECRET IT MAY CONTAIN IS THE CODE, because delivering it is the entire purpose of the
 * message. It is a LIVE CREDENTIAL for its ten-minute window, so nothing else is rendered around
 * it: no address, no user id, no business, no link, no token. A password parameter does not exist
 * — a password cannot leak into a message that has nowhere to put one.
 *
 * NO LINK, DELIBERATELY. The whole point of this flow is that the person types the code in the
 * app, so a link here would be an invitation to the browser journey this replaces — and links in
 * mail are what corporate scanners open, spending a one-time credential before its owner sees it.
 *
 * The code is kept OUT of the subject line: a subject is rendered in notification previews and
 * inbox lists, and a live credential does not belong on a lock screen.
 *
 * The length and the lifetime are imported rather than restated, so the message cannot drift from
 * the challenge that enforces them.
 */

import {
  PASSWORD_RESET_CODE_LENGTH,
  PASSWORD_RESET_CODE_TTL_MINUTES,
} from '../../../constants/passwordResetCode.ts';

/** The flow's own lifetime, so a caller may omit `expiresInMinutes`. */
export const DEFAULT_EXPIRES_IN_MINUTES = PASSWORD_RESET_CODE_TTL_MINUTES;

function normaliseAppName(appName: string | undefined) {
  const raw = typeof appName === 'string' ? appName.trim() : '';
  return raw || 'Inventory AI';
}

function normaliseExpiry(expiresInMinutes: number | undefined) {
  const parsed = Number.parseInt(String(expiresInMinutes), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRES_IN_MINUTES;
}

/**
 * Accepts only a code of exactly the documented length, all decimal digits, and returns it
 * unchanged — so a leading zero survives.
 *
 * A programming-error guard, not a delivery failure: rendering a mail whose entire content is a
 * missing or malformed code would fail silently at the worst possible moment. The thrown message
 * never echoes the value it rejected, because that value is the credential.
 */
function normaliseCode(code: unknown) {
  const raw = typeof code === 'string' ? code.trim() : '';
  const digits = new RegExp(`^\\d{${PASSWORD_RESET_CODE_LENGTH}}$`);
  if (!digits.test(raw)) {
    throw new Error(
      `passwordResetCodeEmail requires a ${PASSWORD_RESET_CODE_LENGTH}-digit code.`
    );
  }
  return raw;
}

/** Everything the body depends on. Only the code is required; the rest fall back to defaults. */
interface PasswordResetCodeEmailOptions {
  code?: string;
  expiresInMinutes?: number;
  appName?: string;
}

export function passwordResetCodeEmail({
  code,
  expiresInMinutes,
  appName,
}: PasswordResetCodeEmailOptions = {}) {
  const value = normaliseCode(code);
  const name = normaliseAppName(appName);
  const minutes = normaliseExpiry(expiresInMinutes);

  const subject = `Your ${name} password reset code`;

  const text = [
    `Your ${name} password reset code`,
    '',
    'Enter this code in the app to choose a new password:',
    '',
    value,
    '',
    `This code expires in ${minutes} minutes and can only be used once.`,
    '',
    'If you did not ask to reset your password, you can ignore this email — your password stays as it is.',
    '',
    `Never share this code with anyone. ${name} staff will never ask you for it.`,
    '',
    `This is an automated message from ${name}. Please do not reply.`,
  ].join('\n');

  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F2937;line-height:1.5;">',
    `  <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;">Your ${name} password reset code</h1>`,
    '  <p style="margin:0 0 16px;">Enter this code in the app to choose a new password:</p>',
    `  <p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px;">${value}</p>`,
    `  <p style="margin:0 0 16px;"><strong>This code expires in ${minutes} minutes and can only be used once.</strong></p>`,
    '  <p style="margin:0 0 16px;">If you did not ask to reset your password, you can ignore this email — your password stays as it is.</p>',
    `  <p style="margin:0 0 16px;">Never share this code with anyone. ${name} staff will never ask you for it.</p>`,
    `  <p style="margin:0;color:#6B7280;font-size:13px;">This is an automated message from ${name}. Please do not reply.</p>`,
    '</div>',
  ].join('\n');

  return { subject, text, html };
}

export default { passwordResetCodeEmail, DEFAULT_EXPIRES_IN_MINUTES };
