/**
 * The public privacy policy page.
 *
 * WHY THIS SUITE EXISTS. Google Play requires a public privacy policy URL before an app can be
 * reviewed, and the page has to be true: the name of each processor, what is deliberately NOT
 * collected, and how a person gets their data deleted. A page that drifts from the code is worse
 * than no page, because the store listing then points at a promise the software does not keep.
 *
 * WHAT IS PINNED:
 *   1. It is reachable with no authentication, at a plain HTML address, and answers 200.
 *   2. The CSP is computed from the stylesheet actually served, and there is no script at all.
 *   3. It is not cached, not framed, not sniffed and not a referrer source.
 *   4. It names every outside processor the code uses — Firebase, Brevo, OpenRouter — and says
 *      plainly that there is no advertising, analytics or tracking.
 *   5. It contains no placeholder text, and the deletion route it describes is the one that exists
 *      today (email), not a feature that has not shipped.
 *   6. Only GET is served; a POST to the same path is a 404, not a write endpoint.
 */

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { unitSuite } from './testEnv.mjs';
import { createApp } from '../src/app.ts';
import {
  renderPrivacyPolicyPage,
  privacyPolicyHeaders,
  contentSecurityPolicy,
} from '../src/pages/privacyPolicy.ts';

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

unitSuite('privacy policy page', () => {
  let app;

  before(async () => {
    app = await startApp({ requestLogging: false });
  });

  after(async () => {
    await app.close();
  });

  it('serves the page at GET /privacy with no authentication', async () => {
    const res = await fetch(`${app.baseUrl}/privacy`);
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/html; charset=utf-8$/);
    assert.match(text, /<title>Privacy Policy — Inventory AI<\/title>/);
    assert.match(text, /Effective 24 October 2026/);
  });

  it('★ authorizes the stylesheet by hash computed from the bytes actually served', async () => {
    const res = await fetch(`${app.baseUrl}/privacy`);
    const html = await res.text();
    const style = inlineStyle(html);

    assert.ok(style, 'the page must carry its stylesheet inline');
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.ok(
      csp.includes(`style-src ${sha256(style)}`),
      'the CSP hash must match the stylesheet in the response — otherwise the page renders unstyled'
    );
    assert.ok(csp.includes("default-src 'none'"), 'nothing may be fetched from anywhere');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'the policy must not be framable');
    assert.equal(csp.includes('script-src'), false, 'the policy has no script, so none may be allowed');
    assert.equal(/unsafe-inline|unsafe-eval/.test(csp), false, 'no unsafe source may be allowed');
    assert.equal(csp, contentSecurityPolicy(), 'the route serves the exported policy unchanged');
  });

  it('is not cached, indexed as a referrer, framed or sniffed', async () => {
    const res = await fetch(`${app.baseUrl}/privacy`);
    await res.text();

    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('pragma'), 'no-cache');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
    for (const [name, value] of Object.entries(privacyPolicyHeaders())) {
      assert.equal(res.headers.get(name.toLowerCase()), value, `${name} must be served as declared`);
    }
  });

  it('names every outside processor the code actually uses', () => {
    const html = renderPrivacyPolicyPage();

    for (const processor of ['Firebase Authentication', 'Brevo', 'OpenRouter', 'MongoDB Atlas']) {
      assert.ok(html.includes(processor), `the policy must name ${processor}, which receives data`);
    }
    assert.match(html, /does not receive your name, email address or password/);
    assert.match(html, /no advertising, analytics or crash-reporting SDK/);
    assert.match(html, /We do not sell your data/);
    assert.match(html, /not intended for anyone under 18/);
  });

  it('describes deletion as it exists today, and carries no placeholder', () => {
    const html = renderPrivacyPolicyPage();

    // Until self-service deletion ships, the only honest instruction is to write to the address
    // on the account. If this test is still asserting the mailto path after the feature ships,
    // the page has drifted from the product.
    assert.match(html, /To delete your account and the information that identifies you, email/);
    assert.match(html, /mailto:/);
    for (const placeholder of ['TODO', 'TBD', 'lorem', 'example.com', 'XXX']) {
      assert.equal(html.includes(placeholder), false, `placeholder "${placeholder}" must not ship`);
    }
  });

  it('serves GET only — a POST to the same path is not a write endpoint', async () => {
    const res = await fetch(`${app.baseUrl}/privacy`, { method: 'POST' });
    const body = await res.text();

    assert.equal(res.status, 404);
    assert.equal(/Privacy Policy/.test(body), false, 'the 404 must not serve the page');
  });
});
