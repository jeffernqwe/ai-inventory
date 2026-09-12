/**
 * The password-reset email body.
 *
 * A pure function of its three inputs: no I/O, no clock, no randomness, no
 * database, no environment. That is what lets the renderer be tested exactly and
 * lets the caller decide what the reset link is.
 *
 * The only secret this email may contain is the reset URL it is handed, and the
 * only reason the raw token appears at all is that the URL carries it. There is
 * deliberately no password parameter: a password cannot leak into a message that
 * has nowhere to put one.
 */

export const DEFAULT_EXPIRES_IN_MINUTES = 30;

function normaliseAppName(appName) {
  const raw = typeof appName === 'string' ? appName.trim() : '';
  return raw || 'Inventory AI';
}

function normaliseExpiry(expiresInMinutes) {
  const parsed = Number.parseInt(expiresInMinutes, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRES_IN_MINUTES;
}

export function passwordResetEmail({ resetUrl, expiresInMinutes, appName } = {}) {
  const url = typeof resetUrl === 'string' ? resetUrl.trim() : '';
  if (!url) {
    // Rendering a mail whose only action is an empty link would fail silently at
    // the worst possible moment, so this is a programming error, not a delivery
    // failure: the caller always has the link before it has a message.
    throw new Error('passwordResetEmail requires a reset URL.');
  }

  const name = normaliseAppName(appName);
  const minutes = normaliseExpiry(expiresInMinutes);

  const subject = `Reset your ${name} password`;

  const text = [
    `Reset your ${name} password`,
    '',
    `We received a request to reset the password for your ${name} account.`,
    '',
    'Choose a new password using this link:',
    url,
    '',
    `This link expires in ${minutes} minutes and can only be used once.`,
    '',
    `If you did not request a password reset, you can safely ignore this email — your password will not change. If you are concerned about your account, contact your ${name} administrator.`,
    '',
    'For your security, this email does not contain your password. Never share your password with anyone.',
    '',
    `This is an automated message from ${name}. Please do not reply.`,
  ].join('\n');

  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F2937;line-height:1.5;">',
    `  <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;">Reset your ${name} password</h1>`,
    `  <p style="margin:0 0 16px;">We received a request to reset the password for your ${name} account.</p>`,
    '  <p style="margin:0 0 24px;">',
    `    <a href="${url}" style="display:inline-block;padding:12px 20px;background:#2563EB;color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a>`,
    '  </p>',
    '  <p style="margin:0 0 16px;">Or copy this link into your browser:<br>',
    `    <span style="word-break:break-all;color:#2563EB;">${url}</span>`,
    '  </p>',
    `  <p style="margin:0 0 16px;"><strong>This link expires in ${minutes} minutes and can only be used once.</strong></p>`,
    `  <p style="margin:0 0 16px;">If you did not request a password reset, you can safely ignore this email — your password will not change. If you are concerned about your account, contact your ${name} administrator.</p>`,
    '  <p style="margin:0 0 16px;">For your security, this email does not contain your password. Never share your password with anyone.</p>',
    `  <p style="margin:0;color:#6B7280;font-size:13px;">This is an automated message from ${name}. Please do not reply.</p>`,
    '</div>',
  ].join('\n');

  return { subject, text, html };
}

export default { passwordResetEmail, DEFAULT_EXPIRES_IN_MINUTES };
