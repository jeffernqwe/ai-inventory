/**
 * The Terms of Use, served as a page rather than kept as a document.
 *
 * WHY IT IS PART OF THE SERVER, AND WHY IT SITS BESIDE THE PRIVACY POLICY. The app is a
 * business tool that holds inventory records other people depend on, so the terms have to
 * describe the product's actual behaviour: that the assistant is read-only and can be
 * wrong, that a business's records survive a member leaving but a sole member's business is
 * deleted with them, and that the person is responsible for who they invite. Keeping the
 * text next to `privacyPolicy.ts` — and importing the same `CONTACT_EMAIL` — is what stops
 * the two from describing different products.
 *
 * NOT A SUBSTITUTE FOR ADVICE, AND DELIBERATELY JURISDICTION-NEUTRAL. Like the privacy
 * policy, this page claims no country of establishment and no legal entity beyond the
 * operator name the store listing uses: inventing a jurisdiction would be worse than
 * omitting one, and the owner is the only one who can supply it. The consumer-rights
 * sentence is there so the liability section cannot be read as taking rights away.
 *
 * NO SCRIPT, NO TRACKING, NO EXTERNAL ASSET — the same rule the privacy and deletion pages
 * follow, with the stylesheet authorized by a CSP hash computed from the bytes served.
 */

import { createHash } from 'node:crypto';

import { CONTACT_EMAIL } from './privacyPolicy.ts';

/** Shown at the top. Update together with the policy's own date when either changes. */
const EFFECTIVE_DATE = '25 October 2026';

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

/** Nothing may be fetched, framed, submitted or executed. */
export function termsOfUseCsp(): string {
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
  'Content-Security-Policy': termsOfUseCsp(),
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** The page. Pure and constant: no request data reaches it. */
export function renderTermsOfUsePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Terms of Use — Inventory AI</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="mark">Inventory AI</div>
<h1>Terms of Use</h1>
<p class="dates">Effective ${EFFECTIVE_DATE}. These terms cover the Inventory AI app and the
service behind it.</p>

<p>Inventory AI is an inventory management app for businesses, operated by Jeffern. By creating an
account or using the app you agree to these terms. If you use Inventory AI for a business, you are
confirming that you are allowed to act for that business.</p>

<h2>Your account</h2>
<ul>
  <li>Give accurate details when you create an account, and keep your password and sign-in method
  secure. You are responsible for what is done through your account.</li>
  <li>An account belongs to one business. Other people join that business through the roles an
  owner or administrator assigns, and each role can do only what the app allows it to do.</li>
  <li>Do not share your sign-in with anyone. If you believe somebody else has used your account,
  change your password and end the sessions you do not recognise from <strong>Profile</strong>.</li>
</ul>

<h2>Acceptable use</h2>
<ul>
  <li>Use Inventory AI only for lawful inventory and stock-keeping work, and only for data you are
  entitled to keep.</li>
  <li>Do not try to reach another business's data, get around the permissions of your role, or
  interfere with the service or with other people's use of it.</li>
  <li>Do not use the app to store or transmit unlawful content, and do not use the assistant to ask
  for it.</li>
  <li>We may suspend or close an account that is used this way. Where it is reasonable to do so, we
  will tell you why.</li>
</ul>

<h2>Your data stays yours</h2>
<p>The products, stock levels, movements, suppliers, purchase orders and audit entries you record
belong to your business. We store and process them only to run the service — including the outside
services named in the <a href="/privacy">privacy policy</a> — and to keep the records consistent.
The <a href="/account-deletion">account deletion page</a> explains exactly what is removed and what
stays when an account is closed.</p>

<h2>The assistant</h2>
<p>The built-in assistant is <strong>read-only</strong>: it can read inventory information and
answer questions about it, and it cannot change your products, stock, transactions, users or roles.
Its answers are generated automatically and <strong>can be wrong or out of date</strong> — check an
answer against the inventory screen before you act on it. The assistant is not accounting, tax,
legal or safety advice.</p>

<h2>Availability and changes</h2>
<p>We work to keep the service available, but it is provided as it is and we do not promise that it
will always be uninterrupted or error-free. Features may change, and a feature may be withdrawn when
it is replaced or when keeping it would be unsafe. You can export or delete your data at any time
through the app.</p>

<h2>Ending your use</h2>
<p>You can close your account at any time from <strong>Profile</strong> → <strong>Delete
account</strong>, or by writing to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> if you
cannot sign in. Closing an account is permanent. If you are the business's only member, the business
and its records are deleted with the account.</p>

<h2>Liability</h2>
<p>To the extent the law allows, we are not liable for indirect or consequential loss, or for loss
of profit or business, arising from your use of the app — including a decision you take on the basis
of an assistant answer. <strong>Nothing in these terms limits any right you have under the consumer
law that applies where you live</strong>, and nothing here excludes liability that cannot lawfully be
excluded.</p>

<h2>Contact</h2>
<p>Questions about these terms: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. The
<a href="/privacy">privacy policy</a> explains how your data is handled.</p>

<footer>Inventory AI · Terms of Use · Effective ${EFFECTIVE_DATE}</footer>
</main>
</body>
</html>
`;
}

/** Headers every response from this route carries. Exported so the route and its test agree. */
export function termsOfUseHeaders(): Record<string, string> {
  return { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' };
}
