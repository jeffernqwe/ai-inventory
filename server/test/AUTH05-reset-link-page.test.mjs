/**
 * AUTH-05 — the page a Firebase password-reset email lands on.
 *
 * WHY THIS SUITE EXISTS. The Firebase reset email can only point at an HTTPS URL on a
 * domain the project authorizes; a custom scheme is refused (`auth/unauthorized-domain`,
 * measured on this project), so the email cannot open the app by itself. The fix is a
 * page on this server that receives `?mode=resetPassword&oobCode=…` and hands the code to
 * `inventoryai://reset-password`.
 *
 * That page is PUBLIC and UNAUTHENTICATED, which is why it is tested rather than trusted:
 * it is reachable by anyone, it reflects part of a query string into markup, and it
 * navigates a browser to a custom scheme. The properties pinned below are the ones that
 * keep those three facts from becoming a vulnerability —
 *
 *   1. the only destination is a constant deep link (no open redirect, no caller-supplied
 *      `continueUrl` honoured),
 *   2. the code must match an allow-list before it is used at all, so escaping is a second
 *      line of defence rather than the first,
 *   3. the inline script and style are authorized by CSP hash, and the hash is computed
 *      from the bytes actually served — a policy that cannot drift from its document,
 *   4. nothing one-time is cached, indexed, or put in a `Referer`,
 *   5. the access log records the PATH and never the query string.
 *
 * The page itself is pure, so most cases call `renderResetLinkPage` directly; the header,
 * log and route cases run against the real shipped app.
 */

import { it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { unitSuite } from './testEnv.mjs';
import { createApp } from '../src/app.ts';
import {
  renderResetLinkPage,
  resetLinkHeaders,
  contentSecurityPolicy,
} from '../src/pages/resetPasswordLink.ts';

const PROJECT_ID = 'inventory-ai-test';

/** A code shaped like Firebase's own (base64url alphabet, no padding). */
const CODE = 'ABC123_-xyz.789';

function deepLinkFor(code) {
  return `inventoryai://reset-password?oobCode=${encodeURIComponent(code)}`;
}

/** The inline script exactly as served, for hashing. */
function inlineScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  return match ? match[1] : null;
}

function inlineStyle(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/);
  return match ? match[1] : null;
}

function sha256(source) {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
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

async function get(baseUrl, path) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, text, header: (name) => res.headers.get(name) };
}

unitSuite('AUTH-05 — reset-link page', () => {
  it('hands the code to the app and offers the hosted page as a fallback', () => {
    const { status, html } = renderResetLinkPage(
      { mode: 'resetPassword', oobCode: CODE, apiKey: 'unused', lang: 'en' },
      PROJECT_ID
    );

    assert.equal(status, 200);
    assert.ok(html.includes(`href="${deepLinkFor(CODE)}"`), 'the app deep link carries the code');
    // The deep link must be the anchor's href, because the inline script navigates to it.
    assert.match(html, /id="open-app"/);
    assert.ok(
      html.includes(`https://${PROJECT_ID}.firebaseapp.com/__/auth/action?mode=resetPassword`),
      'the browser fallback is Firebase’s own hosted page'
    );
    assert.ok(html.includes(`oobCode=${CODE}`), 'the fallback carries the same code');
  });

  it('never navigates anywhere but the app and the project’s own hosted page', () => {
    // A crafted continueUrl is ignored: the only destinations are constants built here.
    const { html } = renderResetLinkPage(
      {
        mode: 'resetPassword',
        oobCode: CODE,
        continueUrl: 'https://evil.example.com/steal',
        apiKey: 'x',
      },
      PROJECT_ID
    );

    assert.ok(!html.includes('evil.example.com'), 'a caller-supplied URL is never reflected');
    const targets = [...html.matchAll(/(?:href|location\.replace\()\s*=?\s*"?'?([^"'<>\s]+)/g)]
      .map((m) => m[1])
      .filter((url) => /^[a-z][a-z0-9+.-]*:/i.test(url));
    for (const target of targets) {
      assert.ok(
        target.startsWith('inventoryai://') || target.startsWith(`https://${PROJECT_ID}.`),
        `unexpected navigation target: ${target}`
      );
    }
  });

  it('refuses a code outside the allow-list instead of escaping it and moving on', () => {
    const hostile = [
      '"><script>alert(1)</script>',
      "'; alert(1); '",
      'abc def',
      '../../etc/passwd',
      '<img src=x onerror=alert(1)>',
      'A'.repeat(513),
    ];

    for (const code of hostile) {
      const { status, html } = renderResetLinkPage(
        { mode: 'resetPassword', oobCode: code },
        PROJECT_ID
      );
      assert.equal(status, 400, `expected 400 for ${JSON.stringify(code)}`);
      assert.ok(!html.includes('<script>'), 'an unusable link serves no script at all');
      assert.ok(!html.includes('alert(1)'), 'the payload is never reflected');
      assert.ok(!html.includes('inventoryai://reset-password?oobCode='), 'no code is forwarded');
    }
  });

  it('treats a missing, repeated or non-reset action as a link that cannot be used', () => {
    const cases = [
      { mode: 'resetPassword' },
      { mode: 'resetPassword', oobCode: '' },
      { mode: 'verifyEmail', oobCode: CODE },
      { oobCode: CODE },
      { mode: 'resetPassword', oobCode: [CODE, CODE] },
      { mode: 'resetPassword', oobCode: { toString: () => CODE } },
      {},
    ];

    for (const query of cases) {
      const { status, html } = renderResetLinkPage(query, PROJECT_ID);
      assert.equal(status, 400, `expected 400 for ${JSON.stringify(query)}`);
      assert.ok(!html.includes(deepLinkFor(CODE)), 'no code reaches the app on an invalid link');
    }

    // The "request a new one" route stays useful: it opens the app's own screen, no code.
    const { html } = renderResetLinkPage({}, PROJECT_ID);
    assert.ok(html.includes('inventoryai://forgot-password'));
  });

  it('drops the hosted fallback when the project id is not configured', () => {
    for (const projectId of ['', 'not a domain', 'evil.example.com/x', '../traversal']) {
      const { status, html } = renderResetLinkPage(
        { mode: 'resetPassword', oobCode: CODE },
        projectId
      );
      assert.equal(status, 200);
      assert.ok(html.includes(deepLinkFor(CODE)));
      assert.ok(!html.includes('firebaseapp.com'), `no hosted link for ${JSON.stringify(projectId)}`);
    }
  });

  it('authorizes its inline script and style by hash, over the bytes actually served', () => {
    const { html } = renderResetLinkPage({ mode: 'resetPassword', oobCode: CODE }, PROJECT_ID);
    const policy = contentSecurityPolicy();

    const script = inlineScript(html);
    const style = inlineStyle(html);
    assert.ok(script, 'the page carries an inline script');
    assert.ok(style, 'the page carries an inline style');

    assert.ok(policy.includes(`script-src ${sha256(script)}`), 'script hash matches the served script');
    assert.ok(policy.includes(`style-src ${sha256(style)}`), 'style hash matches the served style');
    assert.ok(!policy.includes('unsafe-inline'), 'no inline exception is granted');
    assert.ok(policy.includes("default-src 'none'"));
    assert.ok(policy.includes("frame-ancestors 'none'"));
    assert.ok(policy.includes("base-uri 'none'"));
  });

  it('marks every response uncacheable, unindexable and referrer-free', () => {
    for (const query of [{ mode: 'resetPassword', oobCode: CODE }, {}]) {
      renderResetLinkPage(query, PROJECT_ID);
    }
    const headers = resetLinkHeaders();
    assert.match(headers['Cache-Control'], /no-store/);
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.match(headers['X-Robots-Tag'], /noindex/);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Content-Type'], 'text/html; charset=utf-8');
    assert.equal(headers['Content-Security-Policy'], contentSecurityPolicy());
  });

  unitSuite('over HTTP', () => {
    let server;
    before(async () => {
      // requestLogging on: the log case below needs a real access-log line to inspect.
      server = await startApp({ requestLogging: true });
    });
    after(async () => {
      if (server) await server.close();
    });

    it('serves the page with its own headers at GET /auth/reset', async () => {
      const res = await get(
        server.baseUrl,
        `/auth/reset?mode=resetPassword&oobCode=${CODE}&apiKey=k&lang=en`
      );

      assert.equal(res.status, 200);
      assert.match(res.header('content-type') ?? '', /^text\/html; charset=utf-8/);
      assert.match(res.header('cache-control') ?? '', /no-store/);
      assert.equal(res.header('referrer-policy'), 'no-referrer');
      assert.ok((res.header('content-security-policy') ?? '').includes("default-src 'none'"));
      assert.ok(res.text.includes(deepLinkFor(CODE)));
      // Helmet's generic headers still apply; this route adds its own policy on top.
      assert.equal(res.header('x-content-type-options'), 'nosniff');
      assert.equal(res.header('x-powered-by'), null);
    });

    it('answers a malformed link with a 400 page rather than a JSON error', async () => {
      const res = await get(server.baseUrl, '/auth/reset?mode=resetPassword&oobCode=%3Cscript%3E');
      assert.equal(res.status, 400);
      assert.match(res.header('content-type') ?? '', /^text\/html/);
      assert.ok(!res.text.includes('<script>'));
    });

    it('keeps the one-time code out of the access log', async (t) => {
      const lines = [];
      const methods = ['log', 'info', 'warn'].map((name) =>
        mock.method(console, name, (...args) => {
          lines.push(args.map(String).join(' '));
        })
      );
      t.after(() => methods.forEach((m) => m.mock.restore()));

      const res = await get(
        server.baseUrl,
        `/auth/reset?mode=resetPassword&oobCode=${CODE}&apiKey=SECRET_API_KEY`
      );
      assert.equal(res.status, 200);

      // The 'finish' event that writes the line fires after the response is sent.
      for (let i = 0; i < 100 && !lines.some((l) => l.includes('/auth/reset')); i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const line = lines.find((l) => l.includes('/auth/reset'));
      assert.ok(line, 'the request was logged');
      assert.ok(line.includes('/auth/reset'), 'the path IS logged, so the check below is meaningful');
      assert.ok(!line.includes(CODE), 'the log line must not carry the code');
      assert.ok(!line.includes('SECRET_API_KEY'), 'the log line must not carry the query string');
    });
  });
});
