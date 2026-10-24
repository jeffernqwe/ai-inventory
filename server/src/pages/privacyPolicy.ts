/**
 * The privacy policy, served as a page rather than kept as a document.
 *
 * WHY IT IS PART OF THE SERVER. Google Play requires a public URL that a reviewer and a
 * user can open without signing in, and the policy has to stay true to what the software
 * actually does: which data is stored, which outside services touch it, and how a person
 * gets it deleted. The only place where that can be kept honest is beside the code that
 * creates the obligation — the same reason `pages/resetPasswordLink.ts` lives here.
 *
 * WHAT THIS PAGE MUST KEEP IN STEP WITH, and what a future change has to revisit:
 *
 *   - `server/src/services/mail/` — the mail provider named here is the one configured
 *     there (Brevo today). A second transport is a change to this page, not a footnote.
 *   - `server/src/services/ai/providers/` — the assistant's provider (OpenRouter) is the
 *     one that receives a question and the inventory data the assistant reads.
 *   - `server/src/services/firebase/` — Firebase Authentication is the identity provider,
 *     and Google processes sign-in identifiers for it.
 *   - `server/src/services/accountDeletion.service.ts` — account deletion is now a real
 *     in-app operation, so the "Deleting your data" section describes what that code
 *     actually does (tombstone, what is erased, what remains) instead of asking people
 *     to send an email. The public `/account-deletion` page is the store-facing copy of
 *     the same facts, and both must change together.
 *   - `mobile/components/` barcode scanning — the camera opens only for a scan the person
 *     starts, and nothing it sees leaves the device; the policy has to keep saying so.
 *
 * NO SCRIPT, NO TRACKING, NO EXTERNAL ASSET. That is deliberate: a privacy page that
 * loads a font from somewhere else would undermine the sentence it is making. The only
 * inline resource is the stylesheet, authorized by a CSP hash computed from the bytes
 * served — the same technique the reset-link page uses, so the policy can never describe
 * a different document than the one delivered.
 *
 * IT IS NOT LEGAL ADVICE. The wording below was written to match the code; the owner is
 * responsible for confirming it fits the jurisdiction the app is operated from.
 */

import { createHash } from 'node:crypto';

/**
 * Where a person writes about their data. A real, monitored mailbox is a requirement.
 *
 * EXPORTED because `/account-deletion` offers the same address as the way to delete an
 * account when signing in is not possible. One constant means the two pages cannot drift
 * apart and leave a store reviewer with an address that bounces.
 */
export const CONTACT_EMAIL = 'jefferndullamalinaozxc@gmail.com';

/** Shown at the top and used as the "last changed" fact. Update both together. */
const EFFECTIVE_DATE = '24 October 2026';

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 20px 64px;
    background: #f6f7f9;
    color: #14161a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
  }
  main { max-width: 680px; margin: 0 auto; }
  .mark {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5b6472;
    margin-bottom: 8px;
  }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .dates { font-size: 13px; color: #5b6472; margin: 0 0 28px; }
  h2 { font-size: 18px; margin: 32px 0 8px; }
  p, li { font-size: 15px; color: #2c333d; }
  ul { padding-left: 22px; }
  li { margin: 0 0 6px; }
  a { color: #1b5cff; }
  footer { margin-top: 40px; font-size: 13px; color: #5b6472; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #f2f4f7; }
    p, li { color: #c3c9d4; }
    .mark, .dates, footer { color: #98a1b0; }
    a { color: #7ea6ff; }
  }
`;

function hashOf(source: string): string {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

/**
 * Nothing may be fetched, framed, submitted or executed. The policy needs no script, so
 * `script-src` is absent and `default-src 'none'` closes it.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    `style-src ${hashOf(STYLE)}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': contentSecurityPolicy(),
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** The page itself. Pure and constant: no request data reaches it. */
export function renderPrivacyPolicyPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Inventory AI</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="mark">Inventory AI</div>
<h1>Privacy Policy</h1>
<p class="dates">Effective ${EFFECTIVE_DATE}. This page describes the app and the service behind it.</p>

<p>Inventory AI is an inventory management app for businesses, operated by Jeffern. This page
explains what the app collects, why it needs it, which outside services process it, and how to
have it deleted. It does not limit any right you have under the data-protection law that applies
where you live.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Your account.</strong> Your name, email address and the business name you enter when
  you create the account. Your password is handled by Firebase Authentication and is never seen or
  stored by this application. If you sign in with Google, Firebase tells us the account identifier
  and email address.</li>
  <li><strong>Your business data.</strong> The products, categories, locations, stock quantities,
  stock movements, suppliers, purchase orders and audit entries you create. This is the data the app
  exists to keep.</li>
  <li><strong>Assistant conversations.</strong> The questions you ask the assistant and the answers
  it gives, together with the inventory information the assistant reads in order to answer.</li>
  <li><strong>Sign-in records.</strong> A record of each sign-in session (when it started, when it
  ended, and a device description), so you can see and end your sessions. Firebase and Google Play
  services may also process identifiers needed to authenticate you.</li>
</ul>

<p><strong>We do not collect</strong> your location, contacts, photos, microphone audio or
advertising identifiers, and the app contains no advertising, analytics or crash-reporting SDK.
We do not sell your data and we do not use it for advertising.</p>

<p><strong>The camera is used only for barcode scanning.</strong> It opens when you choose to scan
a product barcode, the barcode is read on the device, and no camera image or video is uploaded,
stored or shared. You can decline the camera permission and still use every other part of the app.</p>

<h2>Why we need it</h2>
<ul>
  <li>To run the app: show your inventory, record stock movements and answer your questions.</li>
  <li>To keep each business's data separate, and to decide what your role is allowed to do.</li>
  <li>To keep your account secure: sign you in, verify your email address, and send password-reset
  codes when you ask for one.</li>
  <li>To keep an audit trail of who changed what, which owners and administrators can read.</li>
</ul>

<h2>Who processes it</h2>
<ul>
  <li><strong>Google Firebase Authentication</strong> — sign-in, Google sign-in, and the verified
  identity behind your account.</li>
  <li><strong>Brevo</strong> — delivers the verification and password-reset emails. It receives
  your email address and the contents of that message.</li>
  <li><strong>OpenRouter</strong> — the AI service that answers assistant questions. It receives
  your question, the recent conversation, and the inventory information the assistant reads. It
  does not receive your name, email address or password unless you type them into a question.</li>
  <li><strong>MongoDB Atlas</strong> — hosts the database where the data above is stored.</li>
  <li><strong>Render</strong> — runs the server that the app talks to.</li>
</ul>

<h2>Security</h2>
<p>Traffic between the app and the server uses HTTPS. Passwords are handled by Firebase
Authentication and are never stored by this application. The session token is kept in the device's
secure storage. Each business's records are filtered on the server by the business the signed-in
person belongs to, so one business cannot read another's data. Server access logs record the request
path and status, not the contents of requests.</p>

<h2>How long we keep it</h2>
<p>Your business data is kept while the business exists. Account details are kept until the account
is deleted. Audit entries are kept as part of the business's records, so that the history of a
business stays readable. Assistant conversations are kept until you or your administrator deletes
them, or until your account is deleted.</p>

<h2>Deleting your data</h2>
<p>You can delete your account inside the app: open <strong>Profile</strong> and choose
<strong>Delete account</strong>, then confirm it. The same option is described at
<a href="/account-deletion">/account-deletion</a>, which is the public page Google Play requires.
If you cannot sign in, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from the address
on the account and we will complete the deletion for you.</p>
<p><strong>What is removed.</strong> Your name, your email address, your password and any Google
sign-in connection, your signed-in sessions, your password-reset and email-verification records, and
your assistant conversations and their messages. The account is closed and cannot be signed into
again. The Firebase Authentication identity behind it is deleted as well.</p>
<p><strong>What remains, and why.</strong> While a business still has other members, its own
records — stock movements, purchase orders, stock levels, and audit entries — belong to the
business and stay readable by those members, because deleting them would falsify that business's
inventory history. Audit entries that named you are kept but no longer identify you, and the
account row itself is kept only as an anonymous placeholder that those records can point at. If
other people still use your business and you are its only owner, the app asks you to make another
member an owner first. If you are the business's only member, there is nobody left to own those
records or to read them, so closing your account closes the business and its records are deleted
with it.</p>

<h2>Children</h2>
<p>Inventory AI is a business tool and is not intended for anyone under 18. We do not knowingly
collect data from children.</p>

<h2>Changes to this page</h2>
<p>If what the app collects or who processes it changes, this page is updated and the effective date
at the top changes with it. The current version is always the one served at this address. This
policy is written to be read on its own; it does not replace the terms shown in the app store or
any agreement you have with the business whose inventory you use.</p>

<h2>Contact</h2>
<p>Questions about this policy or your data: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
The <a href="/terms">terms of use</a> describe what the app asks of you and what you can expect
from it.</p>

<footer>Inventory AI · Privacy Policy · Effective ${EFFECTIVE_DATE}</footer>
</main>
</body>
</html>
`;
}

/** Headers every response from this route carries. Exported so the route and its test agree. */
export function privacyPolicyHeaders(): Record<string, string> {
  return { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' };
}
