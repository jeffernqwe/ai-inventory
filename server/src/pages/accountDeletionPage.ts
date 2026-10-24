/**
 * The public account-deletion page Google Play requires.
 *
 * WHY A PAGE AND NOT JUST THE IN-APP FLOW. Play's data-deletion policy asks for a web
 * address, reachable without signing in or installing anything, that explains how a
 * person deletes their account and what happens to their data. A reviewer opens this
 * URL; somebody who has already uninstalled the app or cannot sign in also needs it.
 * It therefore has to describe the exact same operation the app performs — it is not
 * a mailto landing page.
 *
 * WHAT IT MUST KEEP IN STEP WITH:
 *
 *   - `server/src/services/accountDeletion.service.ts` — the tombstone semantics, the
 *     re-authentication requirement and BOTH ownership outcomes stated below ARE that
 *     code: another member remains (they must be made an owner first), or the caller is
 *     the only member and the business is closed with the account. If the service
 *     changes what it erases or keeps, this page changes with it.
 *   - `server/src/pages/privacyPolicy.ts` — the contact address and the retention
 *     paragraph. `CONTACT_EMAIL` is imported rather than copied so the two cannot
 *     disagree.
 *
 * NO SCRIPT, NO FORM, NO EXTERNAL ASSET. There is nothing here to submit and nothing to
 * load from a third party, so `default-src 'none'` is honest rather than aspirational;
 * the stylesheet is authorized by a CSP hash computed from the bytes served, the same
 * technique the privacy and reset-link pages use.
 */

import { createHash } from 'node:crypto';

import { CONTACT_EMAIL } from './privacyPolicy.ts';

/** Shown at the top. Update together with the policy's own date when either changes. */
const EFFECTIVE_DATE = '24 October 2026';

/** The confirmation word the in-app flow asks for, stated so the instructions are exact. */
const CONFIRMATION_WORD = 'DELETE';

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
  ol, ul { padding-left: 22px; }
  li { margin: 0 0 8px; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 14px;
    background: #e9ecf1;
    padding: 1px 5px;
    border-radius: 4px;
  }
  a { color: #1b5cff; }
  .note {
    border-left: 3px solid #1b5cff;
    padding: 4px 0 4px 14px;
    margin: 20px 0;
  }
  footer { margin-top: 40px; font-size: 13px; color: #5b6472; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #f2f4f7; }
    p, li { color: #c3c9d4; }
    .mark, .dates, footer { color: #98a1b0; }
    code { background: #232834; }
    a { color: #7ea6ff; }
    .note { border-left-color: #7ea6ff; }
  }
`;

function hashOf(source: string): string {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

/** Nothing may be fetched, framed, submitted or executed. */
export function accountDeletionCsp(): string {
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
  'Content-Security-Policy': accountDeletionCsp(),
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** The page. Pure and constant: no request data reaches it. */
export function renderAccountDeletionPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Delete your account — Inventory AI</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="mark">Inventory AI</div>
<h1>Delete your account</h1>
<p class="dates">Effective ${EFFECTIVE_DATE}. This page explains how to delete an Inventory AI
account and exactly what happens to the data behind it.</p>

<p>Inventory AI is an inventory management app for businesses, operated by Jeffern. Every account
holder can delete their own account. There are two ways to do it.</p>

<h2>In the app (fastest)</h2>
<ol>
  <li>Sign in to Inventory AI and open <strong>Profile</strong>.</li>
  <li>Choose <strong>Delete account</strong>.</li>
  <li>Confirm your identity — with your current password, or by signing in again if your account
  uses Google or another Firebase sign-in — and type <code>${CONFIRMATION_WORD}</code> to confirm.</li>
</ol>
<p>The account is closed immediately. You are signed out and cannot sign in again.</p>

<p class="note">If other people still use your business and you are its only owner, the app will
ask you to make another member an owner first — a business must always have an owner. If you are
the business's only member, there is nobody to hand it to: closing your account closes the business
as well, and its products, stock, purchase orders and history are deleted with it.</p>

<h2>If you cannot sign in</h2>
<p>Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from the address on the account and
say that you want the account deleted. We will confirm the request with you and complete it. If
other people still use your business and you are its only owner, we will tell you what is needed
before the account can be closed.</p>

<h2>What is deleted</h2>
<ul>
  <li>Your name and email address.</li>
  <li>Your password and any Google sign-in connection — the Firebase Authentication identity itself
  is deleted, so it cannot be used to sign in again.</li>
  <li>Every signed-in session on every device.</li>
  <li>Your pending password-reset and email-verification records.</li>
  <li>Your assistant conversations and the messages in them.</li>
</ul>

<h2>What is kept, and why</h2>
<p>While other people still use the business, its own records — products, stock levels, stock
movements, suppliers, purchase orders and audit entries — belong to the business rather than to one
person, and deleting them would falsify that business's inventory history for its remaining
members. So they stay, with your personal details removed from them:</p>
<ul>
  <li>Audit entries that recorded your actions are kept as a governance record of the business, but
  they no longer identify you.</li>
  <li>The account row is kept only as an anonymous placeholder, so those records still have
  something valid to point at.</li>
</ul>
<p>Nothing in that placeholder identifies you: it carries no name, no email address, no password,
no Google sign-in link, and it cannot be signed into.</p>

<p>None of that applies when you are the business's only member. There is then nobody left to own
its records or to read them, so the business is deleted with your account — products, stock,
movements, purchase orders, suppliers, locations, audit entries and assistant history.</p>

<h2>More information</h2>
<p>The <a href="/privacy">privacy policy</a> describes what the app collects, which services process
it, and how long it is kept. Questions about a deletion: 
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

<footer>Inventory AI · Account deletion · Effective ${EFFECTIVE_DATE}</footer>
</main>
</body>
</html>
`;
}

/** Headers every response from this route carries. Exported so the route and its test agree. */
export function accountDeletionHeaders(): Record<string, string> {
  return { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' };
}
