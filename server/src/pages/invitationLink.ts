/**
 * The page an invitation email's button opens.
 *
 * WHY A PAGE, WHEN THE EMAIL ALREADY CARRIES THE APP'S OWN LINK. A custom scheme
 * (`inventoryai://invite?token=…`) is not a URL every mail client will make clickable, and
 * none on a desktop will. A web address is clickable everywhere; on a phone it forwards to
 * the app, and on a machine without the app it explains what to do instead of appearing
 * broken.
 *
 * WHAT IT DOES WITH THE TOKEN: nothing but hand it to the app. It does not redeem it, so a
 * link opened on the wrong device stays usable, and the app remains the only place an
 * invitation is accepted. That also means this page needs no database access, no session
 * and no branch that can fail beyond a bad token shape.
 *
 * NO SCRIPT AND NO EXTERNAL ASSET. The only interactive element is a link, so the page
 * needs no JavaScript; the stylesheet is authorized by a CSP hash computed from the bytes
 * served (the same technique as the reset, privacy, terms and deletion pages). Nothing is
 * fetched, framed or submitted.
 *
 * THE TOKEN IS NEVER REFLECTED. It is validated against the same pattern the API uses and
 * then written into an attribute whose scheme and host are constants, so a crafted value
 * cannot become markup or navigate anywhere but the app.
 */

import { createHash } from 'node:crypto';

import { INVITATION_TOKEN_PATTERN } from '../constants/invitations.ts';

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #f6f7f9;
    color: #14161a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
  }
  main { max-width: 460px; }
  .mark { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #5b6472; margin-bottom: 8px; }
  h1 { font-size: 24px; margin: 0 0 12px; }
  p { font-size: 15px; color: #2c333d; margin: 0 0 16px; }
  a.open {
    display: inline-block;
    margin: 8px 0 20px;
    padding: 12px 20px;
    border-radius: 8px;
    background: #1b5cff;
    color: #ffffff;
    font-weight: 600;
    text-decoration: none;
  }
  .hint { font-size: 13px; color: #5b6472; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #f2f4f7; }
    p { color: #c3c9d4; }
    .mark, .hint { color: #98a1b0; }
    a.open { background: #7ea6ff; color: #0f1115; }
  }
`;

function hashOf(source: string): string {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

/** Nothing may be fetched, framed, submitted or executed. */
export function invitationLinkCsp(): string {
  return [
    "default-src 'none'",
    `style-src ${hashOf(STYLE)}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function invitationLinkHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': invitationLinkCsp(),
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/** The app's own address for a valid token. Constant scheme and host. */
export function invitationAppUrl(token: string): string {
  return `inventoryai://invite?token=${token}`;
}

/** The page shown for a token that is missing or malformed. Carries no value from the request. */
export function renderInvitationLinkErrorPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invitation link — Inventory AI</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="mark">Inventory AI</div>
<h1>This invitation link is not usable</h1>
<p>The link is incomplete, or it was copied with part of it missing. Open the invitation
email again and use its button, or ask an administrator to send a new invitation.</p>
<p class="hint">If the email has expired, a new invitation replaces it and the old link stops working.</p>
</main>
</body>
</html>
`;
}

/** The page shown for a token that has the right shape. Pure. */
export function renderInvitationLinkPage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open your invitation — Inventory AI</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="mark">Inventory AI</div>
<h1>You have been invited</h1>
<p>Tap below to open Inventory AI and continue. You will be asked to verify this email
address and to create your own sign-in.</p>
<a class="open" href="${invitationAppUrl(token)}">Open Inventory AI</a>
<p class="hint">If nothing happens, the app is not installed on this device. Install
Inventory AI, then open the invitation email again on the phone.</p>
</main>
</body>
</html>
`;
}

/** Whether a value is a well-formed invitation token. Shared with the API's validator shape. */
export function isInvitationToken(value: unknown): value is string {
  return typeof value === 'string' && INVITATION_TOKEN_PATTERN.test(value);
}
