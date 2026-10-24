/**
 * The invitation email body.
 *
 * A pure function of its inputs: no I/O, no clock, no randomness, no environment. The
 * caller mints the token, owns its lifetime and decides the address; this renderer only
 * presents what it is handed, so a pepper, a digest or a database id can never appear in
 * a message.
 *
 * THE ONLY SECRET HERE IS THE TOKEN, and it is here because delivering it is the whole
 * purpose of the message. It is not a credential for an account on its own — acceptance
 * also needs a verified Firebase identity for this address (see
 * constants/invitations.ts) — so the body can afford to say plainly what it is and what
 * to do if it arrived by mistake.
 *
 * TWO LINKS, DELIBERATELY. `inviteUrl` is the server's own `/invite` page, which any
 * browser can open and which forwards to the app's `inventoryai://` scheme. The second
 * is that scheme directly, for a phone whose mail client will honour it. A mail whose
 * only link is a custom scheme is a mail that does nothing on a desktop, and a mail whose
 * only link is the web page is a mail that costs an extra tap on the phone. Neither
 * carries more than the token.
 *
 * NO PASSWORD FIELD, NO ROLE-BY-ROLE PERMISSION LIST. The role is named in words; what
 * that role can do is the app's own business and would go stale here.
 */

import { INVITATION_TTL_DAYS } from '../../../constants/invitations.ts';

function normaliseAppName(appName: string | undefined) {
  const raw = typeof appName === 'string' ? appName.trim() : '';
  return raw || 'Inventory AI';
}

function normaliseText(value: unknown, fallback: string) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || fallback;
}

/**
 * Escapes the three characters that would end a text node or an attribute early.
 *
 * The values interpolated here are a business name and a person's display name — both
 * attacker-adjacent, because whoever runs a business chooses its name. They are rendered
 * into HTML, so they are escaped rather than trusted, exactly as the reset page refuses
 * to echo unvalidated input. The URLs are built from the configured origin and a hex
 * token, so they cannot carry markup at all.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The human word for a role, so the mail never shows a raw enum. */
const ROLE_WORDS: Record<string, string> = {
  ADMIN: 'administrator',
  MANAGER: 'manager',
  STAFF: 'staff member',
};

function roleWord(role: string) {
  return ROLE_WORDS[role] ?? 'team member';
}

interface InvitationEmailOptions {
  businessName?: string;
  inviterName?: string;
  role?: string;
  inviteUrl?: string;
  appUrl?: string;
  expiresInDays?: number;
  appName?: string;
}

export function invitationEmail({
  businessName,
  inviterName,
  role,
  inviteUrl,
  appUrl,
  expiresInDays,
  appName,
}: InvitationEmailOptions = {}) {
  const business = normaliseText(businessName, 'a business');
  const inviter = normaliseText(inviterName, 'An administrator');
  const app = normaliseAppName(appName);
  const days =
    Number.isFinite(Number(expiresInDays)) && Number(expiresInDays) > 0
      ? Number(expiresInDays)
      : INVITATION_TTL_DAYS;
  const word = roleWord(normaliseText(role, 'STAFF'));

  const web = normaliseText(inviteUrl, '');
  const appLink = normaliseText(appUrl, '');
  // A caller that supplies neither URL would render a message with no way to act on it.
  // That is a programming error, not a delivery failure, so it fails here rather than
  // arriving as a dead end in somebody's inbox.
  if (!web && !appLink) {
    throw new Error('invitationEmail requires an invite URL');
  }

  const subject = `You have been invited to join ${business} on ${app}`;

  const text = [
    `${inviter} invited you to join ${business} on ${app} as a ${word}.`,
    '',
    'Open this link on your phone to accept:',
    web || appLink,
    '',
    ...(appLink && appLink !== web ? ['Or open it directly in the app:', appLink, ''] : []),
    `This invitation expires in ${days} days.`,
    '',
    `You will be asked to verify this email address and to create your own ${app} sign-in. Nobody can accept this invitation without access to this inbox.`,
    '',
    'If you were not expecting this invitation, you can ignore this email — it does nothing on its own.',
    '',
    `This is an automated message from ${app}. Please do not reply.`,
  ].join('\n');

  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F2937;line-height:1.5;">',
    `  <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;">Join ${escapeHtml(business)} on ${escapeHtml(app)}</h1>`,
    `  <p style="margin:0 0 16px;">${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(business)}</strong> as a ${escapeHtml(word)}.</p>`,
    `  <p style="margin:0 0 24px;"><a href="${escapeHtml(web || appLink)}" style="display:inline-block;padding:12px 20px;background:#1F2937;color:#FFFFFF;border-radius:8px;text-decoration:none;font-weight:600;">Accept the invitation</a></p>`,
    `  <p style="margin:0 0 16px;"><strong>This invitation expires in ${days} days.</strong></p>`,
    `  <p style="margin:0 0 16px;">You will be asked to verify this email address and to create your own ${escapeHtml(app)} sign-in. Nobody can accept this invitation without access to this inbox.</p>`,
    '  <p style="margin:0 0 16px;">If you were not expecting this invitation, you can ignore this email — it does nothing on its own.</p>',
    `  <p style="margin:0;color:#6B7280;font-size:13px;">This is an automated message from ${escapeHtml(app)}. Please do not reply.</p>`,
    '</div>',
  ].join('\n');

  return { subject, text, html };
}

export default { invitationEmail };
