/**
 * The public Terms of Use page.
 *
 * WHY THIS SUITE EXISTS. The privacy policy says what happens to a person's data; the terms say
 * what the service asks of them and what they may expect from it. Google Play's listing points at
 * both, so the same rule applies to each: a page that drifts from the software is worse than no
 * page, because the store listing then points at a promise the code does not keep.
 *
 * WHAT IS PINNED:
 *   1. It is reachable with no authentication, at a plain HTML address, and answers 200.
 *   2. The CSP is computed from the stylesheet actually served, and there is no script at all.
 *   3. It is not cached, not framed, not sniffed and not a referrer source.
 *   4. It states the three behaviours a person would otherwise be surprised by: the assistant is
 *      read-only and can be wrong, a sole member's business is deleted with the account, and
 *      nothing here removes a consumer right.
 *   5. It carries no placeholder text.
 *   6. Only GET is served; a POST to the same path is a 404, not a write endpoint.
 *   7. THE THREE LEGAL PAGES LINK TO EACH OTHER, so a reviewer or a user can walk between them
 *      and never reads a page that describes a different product.
 */

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { unitSuite } from './testEnv.mjs';
import { createApp } from '../src/app.ts';
import {
  renderTermsOfUsePage,
  termsOfUseHeaders,
  termsOfUseCsp,
} from '../src/pages/termsOfUse.ts';
import { renderPrivacyPolicyPage } from '../src/pages/privacyPolicy.ts';
import { renderAccountDeletionPage } from '../src/pages/accountDeletionPage.ts';

function sha256(source) {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

function inlineStyle(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/);
  return match ? match[1] : null;
}

async function startApp(options = {}) {
  const app = createApp(options);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

unitSuite('terms of use page', () => {
  let app;

  before(async () => {
    app = await startApp({ requestLogging: false });
  });

  after(async () => {
    await app.close();
  });

  it('serves the page at GET /terms with no authentication', async () => {
    const res = await fetch(`${app.baseUrl}/terms`);
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/html; charset=utf-8$/);
    assert.match(text, /<title>Terms of Use — Inventory AI<\/title>/);
    assert.match(text, /Effective 25 October 2026/);
  });

  it('★ authorizes the stylesheet by hash computed from the bytes actually served', async () => {
    const res = await fetch(`${app.baseUrl}/terms`);
    const html = await res.text();
    const style = inlineStyle(html);

    assert.ok(style, 'the page must carry its stylesheet inline');
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.ok(
      csp.includes(`style-src ${sha256(style)}`),
      'the CSP hash must match the stylesheet in the response — otherwise the page renders unstyled'
    );
    assert.ok(csp.includes("default-src 'none'"), 'nothing may be fetched from anywhere');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'the page must not be framable');
    assert.equal(csp.includes('script-src'), false, 'the page has no script, so none may be allowed');
    assert.equal(/unsafe-inline|unsafe-eval/.test(csp), false, 'no unsafe source may be allowed');
    assert.equal(csp, termsOfUseCsp(), 'the route serves the exported policy unchanged');
  });

  it('is not cached, indexed as a referrer, framed or sniffed', async () => {
    const res = await fetch(`${app.baseUrl}/terms`);
    await res.text();

    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
    for (const [name, value] of Object.entries(termsOfUseHeaders())) {
      assert.equal(res.headers.get(name.toLowerCase()), value, `${name} must be served as declared`);
    }
  });

  it('★ states the behaviours a person would otherwise be surprised by', () => {
    const html = renderTermsOfUsePage();

    // The assistant is read-only and fallible. Both halves matter: a claim of read-only without a
    // claim of fallibility would be a promise the model cannot keep.
    assert.match(html, /assistant is <strong>read-only<\/strong>/);
    assert.match(html, /<strong>can be wrong or out of date<\/strong>/);
    assert.match(html, /not accounting, tax,\s*legal or safety advice/);
    // The ownership outcome the server enforces, in the same words the deletion page uses.
    assert.match(html, /only member/);
    assert.match(html, /deleted with the account/);
    // The liability sentence may not read as taking a consumer right away.
    assert.match(html, /Nothing in these terms limits any right you have under the consumer/);
    // Who operates the service, and how to reach them.
    assert.match(html, /operated by Jeffern/);
    assert.match(html, /mailto:/);
    for (const placeholder of ['TODO', 'TBD', 'lorem', 'example.com', 'XXX', '[Company]']) {
      assert.equal(html.includes(placeholder), false, `placeholder "${placeholder}" must not ship`);
    }
  });

  it('★ the three legal pages link to one another', () => {
    const terms = renderTermsOfUsePage();
    const privacy = renderPrivacyPolicyPage();
    const deletion = renderAccountDeletionPage();

    assert.match(terms, /<a href="\/privacy">privacy policy<\/a>/);
    assert.match(terms, /<a href="\/account-deletion">account deletion page<\/a>/);
    assert.match(privacy, /<a href="\/terms">terms of use<\/a>/);
    assert.match(privacy, /<a href="\/account-deletion">\/account-deletion<\/a>/);
    assert.match(deletion, /<a href="\/terms">terms of use<\/a>/);
    assert.match(deletion, /<a href="\/privacy">privacy policy<\/a>/);
  });

  it('serves GET only — a POST to the same path is not a write endpoint', async () => {
    const res = await fetch(`${app.baseUrl}/terms`, { method: 'POST' });
    const body = await res.text();

    assert.equal(res.status, 404);
    assert.equal(/Terms of Use/.test(body), false, 'the 404 must not serve the page');
  });
});
