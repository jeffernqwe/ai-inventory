/**
 * The page a Firebase password-reset email lands on, and what it does about it.
 *
 * WHY THIS EXISTS AT ALL. Firebase can only be asked to point an emailed action link
 * at an HTTPS URL on a domain the project authorizes. It refuses a custom scheme
 * (`inventoryai://reset-password`) outright — measured on this project as
 * `auth/unauthorized-domain`, with no mail generated — so an email whose link opens the
 * app directly is not something the client can request. What it CAN do is open a real
 * HTTPS page, and that page can hand the one-time code to the app.
 *
 * So the chain is:
 *
 *   Firebase email → https://<server>/auth/reset?mode=resetPassword&oobCode=…&apiKey=…
 *                 → inventoryai://reset-password?oobCode=…
 *                 → the app's reset screen redeems the code with `confirmPasswordReset`
 *
 * The code is still Firebase's own, still single-use, still expiring. Nothing is minted,
 * read or validated here: this page is a conduit, not an authority, which is why it has
 * no state, no database access, no session and no rate limiter. If it were down, the
 * Firebase-hosted action page it links to as a fallback would still complete the reset.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   - It does not redeem the code. Redeeming is the app's job (and a browser cannot set
 *     the app's session), so the code arrives at the reset screen untouched.
 *   - It does not log the code, or the query string. The access log already records the
 *     path alone (middlewares/httpLogger.ts captures `req.path`), and nothing here adds
 *     a line of its own.
 *   - It does not redirect to a caller-supplied URL. The only destination is a constant
 *     deep link, so a crafted `?continueUrl=` cannot turn this into an open redirect.
 *   - It does not reflect anything unvalidated into the markup, and the inline script is
 *     authorized by hash (see `contentSecurityPolicy`) rather than by `unsafe-inline`.
 */

import { createHash } from 'node:crypto';

/**
 * The one destination this page ever navigates to. A native-app scheme, so it cannot
 * be used to reach another site even if it were somehow injected.
 */
const APP_RESET_DEEP_LINK = 'inventoryai://reset-password';

/** Where the app's own "send me a new link" screen lives, for a link that cannot be used. */
const APP_FORGOT_PASSWORD_DEEP_LINK = 'inventoryai://forgot-password';

/**
 * An action code is Firebase's own base64url-ish token. The rule is an allow-list, not a
 * sanitizer: anything outside it means the link is malformed, and a malformed link is
 * answered as an invalid link rather than being escaped and forwarded. That is stricter
 * than escaping and it is what makes the deep link safe to place in an `href` by
 * construction — no quote, angle bracket or control character can survive the check.
 */
const ACTION_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,512}$/;

/** A Firebase project id, used only to build the hosted fallback link. */
const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The only action this page is responsible for. */
const SUPPORTED_MODE = 'resetPassword';

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
    line-height: 1.5;
  }
  .card {
    width: 100%;
    max-width: 420px;
    background: #ffffff;
    border: 1px solid #e2e5ea;
    border-radius: 16px;
    padding: 32px 24px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  }
  .mark {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5b6472;
    margin-bottom: 16px;
  }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 20px; font-size: 15px; color: #3d4552; }
  .button {
    display: inline-block;
    width: 100%;
    padding: 14px 20px;
    border-radius: 10px;
    background: #1b5cff;
    color: #ffffff;
    font-size: 16px;
    font-weight: 600;
    text-decoration: none;
  }
  .button:active { background: #1649cc; }
  .fallback { margin: 20px 0 0; font-size: 13px; color: #5b6472; }
  .fallback a { color: inherit; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #f2f4f7; }
    .card { background: #171a20; border-color: #262b33; box-shadow: none; }
    p { color: #c3c9d4; }
    .mark, .fallback { color: #98a1b0; }
    .button { background: #3b76ff; }
  }
`;

/**
 * Runs last, after the markup has been parsed, so the page paints before it leaves.
 *
 * It reads the deep link out of the anchor rather than rebuilding it, which keeps the
 * destination in exactly one place (the server-rendered `href`) and means the script
 * itself contains no dynamic data at all — the reason a fixed CSP hash is possible.
 * `location.replace` rather than `assign` keeps this hop out of the phone's back stack,
 * so the back button after the app opens does not return to a spent link.
 */
const SCRIPT = `
  (function () {
    var link = document.getElementById('open-app');
    if (!link) return;
    window.setTimeout(function () {
      try { window.location.replace(link.href); } catch (e) { /* button remains */ }
    }, 250);
  })();
`;

function hashOf(source: string): string {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

/**
 * One strict policy for both shapes of page: nothing may be fetched, framed, submitted
 * or navigated to except the deep link the document itself carries.
 *
 * The hashes are computed from the same constants that are rendered, so the policy can
 * never describe a different script than the one served — and a test asserts that.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    `style-src ${hashOf(STYLE)}`,
    `script-src ${hashOf(SCRIPT)}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Headers every response from this route carries. `no-store` keeps a one-time code out of
 * any cache, `no-referrer` keeps it out of the `Referer` of anything the page might load
 * (nothing does), and the robots header keeps a link that is meant for one phone out of
 * search indexes.
 */
const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Security-Policy': contentSecurityPolicy(),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};

export interface ResetLinkPage {
  status: number;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Which value arrived for a query key. Express gives an array for a repeated key and an
 * object for a bracketed one; neither is a usable code, and treating them as absent is
 * how "the link is malformed" stays a single, non-reflective answer.
 */
function single(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function document({
  title,
  heading,
  body,
  script,
}: {
  title: string;
  heading: string;
  body: string;
  script: boolean;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="card">
<div class="mark">Inventory AI</div>
<h1>${escapeHtml(heading)}</h1>
${body}
</main>
${script ? `<script>${SCRIPT}</script>` : ''}
</body>
</html>
`;
}

/**
 * The link is unusable for a reason the person cannot fix by trying again — expired,
 * spent, mistyped, or issued for something other than a password reset.
 *
 * A 400 is answered rather than a 200 because this really is a bad request, and the page
 * still tells the person the one useful thing: request a new link. The deep link that
 * opens the app's own request screen is offered because it needs no code.
 */
function invalidLinkPage(): ResetLinkPage {
  return {
    status: 400,
    html: document({
      title: 'Reset link not usable — Inventory AI',
      heading: 'This reset link is not usable',
      body: `<p>It may have expired, or it may already have been used. Reset links work once and do not last long.</p>
<a class="button" href="${APP_FORGOT_PASSWORD_DEEP_LINK}">Request a new link</a>
<p class="fallback">Open Inventory AI and choose &ldquo;Forgot password&rdquo;.</p>`,
      script: false,
    }),
  };
}

/**
 * The happy path: hand the code to the app.
 *
 * `fallbackHref` is Firebase's hosted action page for the SAME code, offered for the two
 * audiences a deep link cannot serve — a phone where the app is not installed, and a
 * desktop browser. It is built from the server's own configured project id, never from
 * the request, so it cannot be pointed anywhere else.
 */
function openAppPage({ deepLink, fallbackHref }: { deepLink: string; fallbackHref: string }) {
  const fallback = fallbackHref
    ? `<p class="fallback">App not installed, or nothing happened? <a href="${escapeHtml(
        fallbackHref
      )}">Reset your password in the browser</a> instead.</p>`
    : `<p class="fallback">Nothing happened? Open Inventory AI and choose &ldquo;Forgot password&rdquo;.</p>`;

  return document({
    title: 'Opening Inventory AI…',
    heading: 'Opening Inventory AI…',
    body: `<p>Your password reset link is ready. The app should open in a moment.</p>
<a class="button" id="open-app" href="${escapeHtml(deepLink)}">Open Inventory AI</a>
${fallback}`,
    script: true,
  });
}

/**
 * Renders the response for a request to this route.
 *
 * Pure: the query, the project id and nothing else. The route hands in `req.query` and
 * the configured project id, which is what lets the whole surface — including the
 * XSS-shaped and traversal-shaped inputs — be tested without a server.
 */
export function renderResetLinkPage(query: unknown, projectId: string): ResetLinkPage {
  const params = (query && typeof query === 'object' ? query : {}) as Record<string, unknown>;

  const mode = single(params.mode);
  const code = single(params.oobCode);

  if (!code || !ACTION_CODE_PATTERN.test(code) || mode !== SUPPORTED_MODE) {
    return invalidLinkPage();
  }

  const deepLink = `${APP_RESET_DEEP_LINK}?oobCode=${encodeURIComponent(code)}`;
  const fallbackHref = PROJECT_ID_PATTERN.test(projectId)
    ? `https://${projectId}.firebaseapp.com/__/auth/action?mode=${SUPPORTED_MODE}&oobCode=${encodeURIComponent(code)}`
    : '';

  return { status: 200, html: openAppPage({ deepLink, fallbackHref }) };
}

/** Every response this route produces carries these; exported so the route and its test agree. */
export function resetLinkHeaders(): Record<string, string> {
  return { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' };
}
