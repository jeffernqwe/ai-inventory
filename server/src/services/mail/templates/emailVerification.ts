/**
 * The email-verification code email body (AUTH-04).
 *
 * A pure function of its inputs: no I/O, no clock, no randomness, no database, no
 * environment, no network. The caller mints the code and owns its lifetime; this
 * renderer only presents what it is handed, which is what keeps code generation,
 * the pepper and the HMACs in `services/emailVerification/` — this template never
 * sees a pepper, a `codeHmac` or an `emailHmac`.
 *
 * The only secret this email may contain is the code itself, and it is here
 * because delivering it is the entire purpose of the message. The code is a LIVE
 * CREDENTIAL for its ten-minute window, so nothing else is rendered around it:
 * no user id, no email address, no HMAC, no Firebase ID token, no URL. There is
 * deliberately no password parameter, for the same reason the reset template has
 * none — a password cannot leak into a message that has nowhere to put one.
 *
 * The code is also kept OUT of the subject line, deliberately: a subject is
 * rendered in notification previews and inbox lists, and a live credential does
 * not belong on a lock screen.
 *
 * The length and the lifetime are imported rather than restated. They are AUTH-04
 * flow policy (`constants/emailVerification.ts`), and a template that hardcoded
 * "six digits" and "10 minutes" could drift from the challenge that enforces both.
 */

import {
  EMAIL_VERIFICATION_CODE_LENGTH,
  EMAIL_VERIFICATION_TTL_MINUTES,
} from '../../../constants/emailVerification.ts';

/** The flow's own lifetime, so a caller may omit `expiresInMinutes`. */
export const DEFAULT_EXPIRES_IN_MINUTES = EMAIL_VERIFICATION_TTL_MINUTES;

function normaliseAppName(appName: string | undefined) {
  const raw = typeof appName === 'string' ? appName.trim() : '';
  return raw || 'Inventory AI';
}

function normaliseExpiry(expiresInMinutes: number | undefined) {
  // The explicit String() is the coercion parseInt performs internally anyway;
  // writing it down is what lets the checker accept a numeric parameter.
  const parsed = Number.parseInt(String(expiresInMinutes), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRES_IN_MINUTES;
}

/**
 * Accepts only a code of exactly the documented length, all decimal digits, and
 * returns it unchanged — so a leading zero survives.
 *
 * This is a programming-error guard, not a delivery failure: the code always
 * exists before a message does, and rendering a mail whose entire content is a
 * missing or malformed code would fail silently at the worst possible moment.
 * The thrown message never echoes the value it rejected, because that value is
 * the credential.
 */
function normaliseCode(code: unknown) {
  const raw = typeof code === 'string' ? code.trim() : '';
  const digits = new RegExp(`^\\d{${EMAIL_VERIFICATION_CODE_LENGTH}}$`);
  if (!digits.test(raw)) {
    throw new Error(
      `emailVerificationEmail requires a ${EMAIL_VERIFICATION_CODE_LENGTH}-digit code.`,
    );
  }
  return raw;
}

/** Everything the email body depends on. All three are optional: a code is
 * required by the guard above, and the other two fall back to their defaults. */
interface EmailVerificationEmailOptions {
  code?: string;
  expiresInMinutes?: number;
  appName?: string;
}

export function emailVerificationEmail({
  code,
  expiresInMinutes,
  appName,
}: EmailVerificationEmailOptions = {}) {
  const value = normaliseCode(code);
  const name = normaliseAppName(appName);
  const minutes = normaliseExpiry(expiresInMinutes);

  const subject = `Your ${name} verification code`;

  const text = [
    `Your ${name} verification code`,
    '',
    'Enter this code to verify your email address:',
    '',
    value,
    '',
    `This code expires in ${minutes} minutes and can only be used once.`,
    '',
    'If you did not try to verify this email address, you can safely ignore this email — nobody can verify it without this code.',
    '',
    `Never share this code with anyone. ${name} staff will never ask you for it.`,
    '',
    `This is an automated message from ${name}. Please do not reply.`,
  ].join('\n');

  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F2937;line-height:1.5;">',
    `  <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;">Your ${name} verification code</h1>`,
    '  <p style="margin:0 0 16px;">Enter this code to verify your email address:</p>',
    `  <p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px;">${value}</p>`,
    `  <p style="margin:0 0 16px;"><strong>This code expires in ${minutes} minutes and can only be used once.</strong></p>`,
    '  <p style="margin:0 0 16px;">If you did not try to verify this email address, you can safely ignore this email — nobody can verify it without this code.</p>',
    `  <p style="margin:0 0 16px;">Never share this code with anyone. ${name} staff will never ask you for it.</p>`,
    `  <p style="margin:0;color:#6B7280;font-size:13px;">This is an automated message from ${name}. Please do not reply.</p>`,
    '</div>',
  ].join('\n');

  return { subject, text, html };
}

export default { emailVerificationEmail, DEFAULT_EXPIRES_IN_MINUTES };
