// Phase 26B-1 — the mail service abstraction.
//
// This suite pins the layer that password recovery will be built on, before any
// password-recovery code exists: the provider registry, the Resend transport, the
// template and the error contract.
//
// Two properties are worth more than the rest of the file, and both are asserted
// against a deliberately hostile upstream:
//
//   * Nothing that could be replayed may leave the layer. The request body carries
//     the password-reset URL, which carries the raw single-use token. A provider
//     error, an exception or a log line is therefore treated as an exfiltration
//     surface: the tests make Resend answer with a body that echoes the API key,
//     the reset URL and the token, and require all three to be absent from the
//     thrown error, from every own property of it and from anything written to the
//     console.
//   * The transport is exercised without a network. The wire-format cases stub
//     globalThis.fetch, because testing the real endpoint would mean sending real
//     mail — and because the endpoint is a module constant, not configuration.
//     Provider selection is exercised through the registry seam with a fake.
//
// DATABASE-FREE on purpose: no model, no connection, no route. It runs in both
// `npm test` and `npm run test:unit`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { unitSuite } from './testEnv.mjs';

import {
  isMailConfigured,
  mailProviderName,
  sendPasswordResetEmail,
  MailNotConfigured,
  MailDeliveryError,
  isMailError,
} from '../src/services/mail/index.ts';
import { mailConfig } from '../src/services/mail/mailConfig.ts';
import { MAIL_NOT_CONFIGURED, MAIL_UNAVAILABLE } from '../src/services/mail/mailErrors.ts';
import {
  registerProvider,
  deregisterProvider,
  registeredProviders,
  resetMailProviders,
  mailProviderRequiredEnv,
  selectProvider,
} from '../src/services/mail/providers/index.ts';
import { createResendProvider } from '../src/services/mail/providers/resendProvider.ts';
import { passwordResetEmail } from '../src/services/mail/templates/passwordReset.ts';
import {
  FAKE_MAIL_PROVIDER,
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  setFakeMailScenario,
  sentMessages,
  clearSentMessages,
  fakeMailSuccess,
  fakeMailFailure,
} from './fakes/mailProvider.mjs';

const RESET_TOKEN = 'Kq7Qw3vT9xR2mB6nP1sL4dH8jF5gZ0cY';
const RESET_URL = `https://app.inventory-ai.test/reset-password?token=${RESET_TOKEN}`;
const API_KEY = 're_phase26b_test_key_000111222333';
const MAIL_FROM = 'Inventory AI <no-reply@inventory-ai.test>';
const RECIPIENT = 'owner@inventory-ai.test';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const MAIL_ENV_KEYS = [
  'MAIL_PROVIDER',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'MAIL_APP_NAME',
  'MAIL_REQUEST_TIMEOUT_MS',
  'PASSWORD_RESET_URL',
];

const RESEND_CONFIGURED = { MAIL_PROVIDER: 'resend', RESEND_API_KEY: API_KEY, MAIL_FROM };

/**
 * Runs `fn` with exactly the named mail env vars set — every other mail var is
 * cleared first — and restores the previous environment afterwards.
 */
async function withMailEnv(vars, fn) {
  const saved = new Map(MAIL_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of MAIL_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== undefined) {
      process.env[key] = vars[key];
    } else {
      delete process.env[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withFetchStub(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function nonJsonResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureError(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected the call to throw, but it resolved');
}

/** The same, for the few synchronous calls in this suite. */
function captureErrorSync(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected the call to throw, but it returned');
}

/** The whole error surface a caller or a crash reporter could reach. */
function serialiseError(err) {
  return [err.message, err.stack, JSON.stringify(err, Object.getOwnPropertyNames(err))].join('\n');
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function captureConsole(fn) {
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const lines = [];
  const capture = (...args) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : safeStringify(arg))).join(' '));
  };
  console.log = capture;
  console.error = capture;
  console.warn = capture;
  console.info = capture;
  try {
    await fn();
  } finally {
    Object.assign(console, original);
  }
  return lines.join('\n');
}

function sendReset(overrides = {}) {
  return sendPasswordResetEmail({
    to: RECIPIENT,
    resetUrl: RESET_URL,
    expiresInMinutes: 30,
    ...overrides,
  });
}

unitSuite('Phase 26B-1 — mail service (registry, Resend transport, template)', () => {
  // ---------------------------------------------------------------------------
  // Provider registry
  // ---------------------------------------------------------------------------
  describe('provider registry', () => {
    it('declares resend as a built-in with exactly the two required variables', () => {
      assert.deepEqual(mailProviderRequiredEnv('resend'), ['RESEND_API_KEY', 'MAIL_FROM']);
      assert.deepEqual(mailProviderRequiredEnv('  ReSend  '), ['RESEND_API_KEY', 'MAIL_FROM']);
    });

    it('reports no requirements for an unknown provider name', () => {
      assert.equal(mailProviderRequiredEnv('sendgrid'), null);
      assert.equal(mailProviderRequiredEnv('console'), null);
      assert.equal(mailProviderRequiredEnv(''), null);
      assert.equal(mailProviderRequiredEnv(undefined), null);
    });

    it('refuses to select a provider when MAIL_PROVIDER is unset or blank', async () => {
      for (const vars of [{}, { MAIL_PROVIDER: '' }, { MAIL_PROVIDER: '   ' }]) {
        await withMailEnv(vars, () => {
          const err = captureErrorSync(() => selectProvider());
          assert.ok(err instanceof MailNotConfigured, 'blank MAIL_PROVIDER means mail is disabled');
          assert.equal(err.code, MAIL_NOT_CONFIGURED);
          assert.ok(isMailError(err));
        });
      }
    });

    it('refuses to select resend while any required variable is missing or blank', async () => {
      const incomplete = [
        { MAIL_PROVIDER: 'resend' },
        { MAIL_PROVIDER: 'resend', RESEND_API_KEY: API_KEY },
        { MAIL_PROVIDER: 'resend', MAIL_FROM },
        { MAIL_PROVIDER: 'resend', RESEND_API_KEY: '   ', MAIL_FROM },
      ];
      for (const vars of incomplete) {
        await withMailEnv(vars, () => {
          assert.throws(() => selectProvider(), MailNotConfigured);
        });
      }

      // The message names the missing variable so an operator can act on it, and
      // names no value.
      await withMailEnv({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: API_KEY }, () => {
        assert.throws(() => selectProvider(), /MAIL_FROM/);
      });
      await withMailEnv({ MAIL_PROVIDER: 'resend', MAIL_FROM }, () => {
        assert.throws(() => selectProvider(), /RESEND_API_KEY/);
      });
    });

    it('refuses an unsupported provider name instead of silently doing nothing', async () => {
      await withMailEnv({ ...RESEND_CONFIGURED, MAIL_PROVIDER: 'sendgrid' }, () => {
        assert.throws(() => selectProvider(), /sendgrid/);
      });
    });

    it('selects resend once every required variable is present', async () => {
      await withMailEnv(RESEND_CONFIGURED, () => {
        const provider = selectProvider();
        assert.equal(provider.name, 'resend');
        assert.equal(typeof provider.send, 'function');
      });
    });

    it('reads the environment lazily, so a change is observed without reloading', async () => {
      await withMailEnv({ ...RESEND_CONFIGURED, MAIL_APP_NAME: 'First', PASSWORD_RESET_URL: 'https://one.test/reset' }, () => {
        assert.equal(mailConfig().provider, 'resend');
        assert.equal(mailConfig().appName, 'First');
        assert.equal(mailConfig().resetUrl, 'https://one.test/reset');
        assert.equal(mailProviderName(), 'resend');
        assert.equal(isMailConfigured(), true);

        process.env.MAIL_PROVIDER = 'something-else';
        process.env.MAIL_APP_NAME = 'Second';
        process.env.PASSWORD_RESET_URL = 'https://two.test/reset';

        assert.equal(mailConfig().provider, 'something-else');
        assert.equal(mailConfig().appName, 'Second');
        assert.equal(mailConfig().resetUrl, 'https://two.test/reset');
        assert.equal(mailProviderName(), 'something-else');
        assert.equal(isMailConfigured(), false);
      });
    });

    it('falls back to the documented defaults for the app name and the timeout', async () => {
      await withMailEnv({}, () => {
        assert.equal(mailConfig().appName, 'Inventory AI');
        assert.equal(mailConfig().requestTimeoutMs, 10000);
        assert.equal(mailProviderName(), '');
      });
      for (const raw of ['', '   ', 'nonsense', '0', '-5']) {
        await withMailEnv({ MAIL_REQUEST_TIMEOUT_MS: raw }, () => {
          assert.equal(mailConfig().requestTimeoutMs, 10000);
        });
      }
      await withMailEnv({ MAIL_REQUEST_TIMEOUT_MS: '2500' }, () => {
        assert.equal(mailConfig().requestTimeoutMs, 2500);
      });
    });

    it('keeps the API key out of the shared configuration object', async () => {
      await withMailEnv(RESEND_CONFIGURED, () => {
        const config = mailConfig();
        assert.equal(Object.values(config).includes(API_KEY), false);
        assert.ok(!JSON.stringify(config).includes(API_KEY), 'the shared config must not carry the key');
      });
    });

    it('selects a registered provider without requiring any environment', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, () => {
          assert.ok(registeredProviders().includes(FAKE_MAIL_PROVIDER));
          assert.equal(selectProvider().name, FAKE_MAIL_PROVIDER);
          assert.equal(isMailConfigured(), true);
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('removes a registered provider by name, case-insensitively', () => {
      registerProvider('temp-provider', () => ({ name: 'temp-provider', async send() { return { id: 'x' }; } }));
      assert.ok(registeredProviders().includes('temp-provider'));
      deregisterProvider('TEMP-PROVIDER');
      assert.ok(!registeredProviders().includes('temp-provider'));
    });

    it('resetMailProviders() drops every registered provider and leaves the built-ins declared', async () => {
      registerFakeMailProvider();
      assert.ok(registeredProviders().includes(FAKE_MAIL_PROVIDER));

      resetMailProviders();
      assert.deepEqual(registeredProviders(), []);
      assert.deepEqual(mailProviderRequiredEnv('resend'), ['RESEND_API_KEY', 'MAIL_FROM']);

      await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, () => {
        assert.throws(() => selectProvider(), MailNotConfigured);
      });
      await withMailEnv(RESEND_CONFIGURED, () => {
        assert.equal(selectProvider().name, 'resend');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Resend transport
  // ---------------------------------------------------------------------------
  describe('resend transport', () => {
    it('posts the documented wire format to the Resend endpoint and returns the message id', async () => {
      const calls = [];
      let result;
      await withFetchStub(
        async (url, options) => {
          calls.push({ url, options });
          return jsonResponse(200, { id: 'msg_2f9c1a' });
        },
        async () => {
          await withMailEnv(RESEND_CONFIGURED, async () => {
            result = await sendReset({ expiresInMinutes: 30 });
          });
        },
      );

      assert.equal(calls.length, 1, 'exactly one HTTP request may be made');
      const { url, options } = calls[0];
      assert.equal(url, RESEND_ENDPOINT);
      assert.equal(options.method, 'POST');
      assert.deepEqual(Object.keys(options.headers).sort(), ['accept', 'authorization', 'content-type']);
      assert.equal(options.headers.authorization, `Bearer ${API_KEY}`);
      assert.equal(options.headers['content-type'], 'application/json');
      assert.ok(options.signal, 'the request must carry an AbortSignal');

      const body = JSON.parse(options.body);
      assert.deepEqual(Object.keys(body).sort(), ['from', 'html', 'subject', 'text', 'to']);
      assert.equal(body.from, MAIL_FROM);
      assert.deepEqual(body.to, [RECIPIENT]);
      assert.equal(body.subject, 'Reset your Inventory AI password');
      assert.ok(body.text.includes(RESET_URL), 'the reset link must reach the transport');
      assert.ok(body.html.includes(RESET_URL), 'the reset link must reach the transport');

      assert.deepEqual(result, { id: 'msg_2f9c1a', provider: 'resend' });
    });

    it('renders the subject with the configured app name', async () => {
      let options = null;
      await withFetchStub(
        async (_url, opts) => {
          options = opts;
          return jsonResponse(200, { id: 'msg_app' });
        },
        async () => {
          await withMailEnv(
            { ...RESEND_CONFIGURED, MAIL_APP_NAME: 'Cebu Traders', MAIL_REQUEST_TIMEOUT_MS: '4000' },
            async () => {
              await sendReset();
            },
          );
        },
      );
      assert.equal(JSON.parse(options.body).subject, 'Reset your Cebu Traders password');
    });

    it('turns a non-2xx response into a MailDeliveryError that leaks nothing', async () => {
      const hostile = {
        statusCode: 422,
        name: 'validation_error',
        // A real upstream is free to echo what we sent. Nothing from this body may
        // survive into the error, so the test makes it echo every secret at once.
        message: `rejected request for ${RECIPIENT} with key ${API_KEY} and link ${RESET_URL} (token ${RESET_TOKEN})`,
      };

      let err;
      await withFetchStub(
        async () => jsonResponse(422, hostile),
        async () => {
          await withMailEnv(RESEND_CONFIGURED, async () => {
            err = await captureError(() => sendReset());
          });
        },
      );

      assert.ok(err instanceof MailDeliveryError);
      assert.equal(err.name, 'MailDeliveryError');
      assert.equal(err.code, MAIL_UNAVAILABLE);
      assert.ok(isMailError(err));
      assert.match(err.message, /422/);
      assert.match(err.message, /validation_error/);

      const surface = serialiseError(err);
      for (const secret of [API_KEY, RESET_URL, RESET_TOKEN, RECIPIENT, 'rejected request for']) {
        assert.ok(!surface.includes(secret), `a thrown error must never carry ${secret}`);
      }

      const own = Object.getOwnPropertyNames(err).filter(
        (key) => !['stack', 'message', 'name', 'code'].includes(key),
      );
      assert.deepEqual(own, [], 'no payload, upstream body or transport error may be attached');
      assert.equal(err.cause, undefined);
    });

    it('accepts a non-2xx error body that is not JSON, without relaying it', async () => {
      let err;
      await withFetchStub(
        async () => nonJsonResponse(502),
        async () => {
          await withMailEnv(RESEND_CONFIGURED, async () => {
            err = await captureError(() => sendReset());
          });
        },
      );
      assert.ok(err instanceof MailDeliveryError);
      assert.match(err.message, /502/);
      assert.ok(!serialiseError(err).includes('Unexpected token'));
    });

    it('ignores an upstream error name that is not a safe identifier', async () => {
      let err;
      await withFetchStub(
        async () => jsonResponse(500, { name: `bad name ${RESET_TOKEN}` }),
        async () => {
          await withMailEnv(RESEND_CONFIGURED, async () => {
            err = await captureError(() => sendReset());
          });
        },
      );
      assert.ok(err instanceof MailDeliveryError);
      assert.equal(err.message, 'The email service rejected the message (HTTP 500).');
      assert.ok(!serialiseError(err).includes(RESET_TOKEN));
    });

    it('treats a 2xx that carries no usable message id as a delivery error', async () => {
      for (const response of [
        jsonResponse(200, {}),
        jsonResponse(200, { id: 123 }),
        jsonResponse(200, { id: '   ' }),
        jsonResponse(200, null),
        nonJsonResponse(200),
      ]) {
        let err;
        await withFetchStub(
          async () => response,
          async () => {
            await withMailEnv(RESEND_CONFIGURED, async () => {
              err = await captureError(() => sendReset());
            });
          },
        );
        assert.ok(err instanceof MailDeliveryError);
        assert.match(err.message, /unexpected response/);
      }
    });

    it('turns a network failure into a MailDeliveryError', async () => {
      let err;
      await withFetchStub(
        async () => {
          throw new TypeError('fetch failed');
        },
        async () => {
          await withMailEnv(RESEND_CONFIGURED, async () => {
            err = await captureError(() => sendReset());
          });
        },
      );
      assert.ok(err instanceof MailDeliveryError);
      assert.equal(err.code, MAIL_UNAVAILABLE);
      assert.match(err.message, /could not be reached/);
      assert.equal(err.cause, undefined);
      assert.ok(!serialiseError(err).includes('fetch failed'), 'the transport error is not relayed');
    });

    it(
      'aborts a request that exceeds MAIL_REQUEST_TIMEOUT_MS and reports a delivery error',
      { timeout: 5000 },
      async () => {
        let aborted = false;
        let err;
        await withFetchStub(
          (_url, options) =>
            new Promise((_resolve, reject) => {
              options.signal.addEventListener('abort', () => {
                aborted = true;
                const abort = new Error('The operation was aborted.');
                abort.name = 'AbortError';
                reject(abort);
              });
            }),
          async () => {
            await withMailEnv({ ...RESEND_CONFIGURED, MAIL_REQUEST_TIMEOUT_MS: '20' }, async () => {
              err = await captureError(() => sendReset());
            });
          },
        );
        assert.equal(aborted, true, 'the in-flight request must be aborted when the timeout elapses');
        assert.ok(err instanceof MailDeliveryError);
        assert.match(err.message, /too long/i);
      },
    );

    it('clears the request timeout once a successful send settles', async () => {
      let signal = null;
      await withFetchStub(
        async (_url, options) => {
          signal = options.signal;
          return jsonResponse(200, { id: 'msg_fast' });
        },
        async () => {
          await withMailEnv({ ...RESEND_CONFIGURED, MAIL_REQUEST_TIMEOUT_MS: '20' }, async () => {
            const result = await sendReset();
            assert.equal(result.id, 'msg_fast');
          });
        },
      );

      assert.ok(signal, 'the provider must hand an AbortSignal to fetch');
      assert.equal(signal.aborted, false);
      await sleep(60);
      assert.equal(signal.aborted, false, 'the timeout timer must be cleared when the request settles');
    });

    it('clears the request timeout on the failure path too', async () => {
      let signal = null;
      await withFetchStub(
        async (_url, options) => {
          signal = options.signal;
          throw new TypeError('fetch failed');
        },
        async () => {
          await withMailEnv({ ...RESEND_CONFIGURED, MAIL_REQUEST_TIMEOUT_MS: '20' }, async () => {
            const err = await captureError(() => sendReset());
            assert.ok(err instanceof MailDeliveryError);
          });
        },
      );

      await sleep(60);
      assert.equal(signal.aborted, false, 'the timeout timer must be cleared when the request fails');
    });

    it('refuses to send when its own configuration disappears, without touching the network', async () => {
      const provider = createResendProvider();
      const payload = { to: RECIPIENT, subject: 's', text: 't', html: 'h' };

      await withFetchStub(
        async () => {
          throw new Error('the network must not be reached');
        },
        async () => {
          await withMailEnv({ RESEND_API_KEY: API_KEY }, async () => {
            const err = await captureError(() => provider.send(payload));
            assert.ok(err instanceof MailNotConfigured);
            assert.match(err.message, /MAIL_FROM/);
            assert.ok(!err.message.includes(API_KEY));
          });
          await withMailEnv({ MAIL_FROM }, async () => {
            const err = await captureError(() => provider.send(payload));
            assert.ok(err instanceof MailNotConfigured);
            assert.match(err.message, /RESEND_API_KEY/);
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------------
  describe('password reset template', () => {
    it('states the request, the reset link, the expiry and what to do if unrequested', () => {
      const { subject, text, html } = passwordResetEmail({
        resetUrl: RESET_URL,
        expiresInMinutes: 30,
        appName: 'Inventory AI',
      });

      assert.equal(subject, 'Reset your Inventory AI password');
      for (const part of [text, html]) {
        assert.ok(part.includes(RESET_URL), 'the reset link must be present');
        assert.match(part, /30 minutes/, 'the expiry must be stated');
        assert.match(part, /only be used once/i, 'single-use must be stated');
        assert.match(part, /did not request/i, 'unrequested-reset guidance must be present');
      }
      assert.match(html, /href="[^"]*reset-password\?token=/, 'the link must be a real anchor');
    });

    it('renders the raw token only as part of the reset URL', () => {
      const { subject, text, html } = passwordResetEmail({
        resetUrl: RESET_URL,
        expiresInMinutes: 30,
        appName: 'Inventory AI',
      });
      const all = [subject, text, html].join('\n');

      assert.ok(all.includes(RESET_TOKEN), 'the token is present because the URL carries it');
      const withoutUrl = all.split(RESET_URL).join('');
      assert.ok(
        !withoutUrl.includes(RESET_TOKEN),
        'the token must never be rendered anywhere except inside the reset URL',
      );
    });

    it('cannot render a password', () => {
      const { subject, text, html } = passwordResetEmail({
        resetUrl: RESET_URL,
        expiresInMinutes: 30,
        appName: 'Inventory AI',
        // A future spread of the options object would leak this; the template must
        // only ever read the three documented inputs.
        password: 'hunter2',
      });
      const all = [subject, text, html].join('\n');

      assert.ok(!all.includes('hunter2'), 'a supplied password must not render');
      // Same-line only, so a line ending in a label ("…using this link:") followed
      // by the URL on its own line is not mistaken for a credential.
      assert.ok(!/password[ \t]*[:=][ \t]*\S/i.test(all), 'the email must never print a "password: value" pair');
    });

    it('carries no user id, no email address and no account metadata', () => {
      const { subject, text, html } = passwordResetEmail({
        resetUrl: RESET_URL,
        expiresInMinutes: 30,
        appName: 'Inventory AI',
      });
      const all = [subject, text, html].join('\n');

      assert.ok(!all.includes('@'), 'the message must not name any address');
      assert.ok(!/userI?d/i.test(all), 'no user identifier belongs in the message');
    });

    it('is a pure function of its inputs — no clock, no randomness, no I/O', () => {
      const once = passwordResetEmail({ resetUrl: RESET_URL, expiresInMinutes: 15, appName: 'Inventory AI' });
      const twice = passwordResetEmail({ resetUrl: RESET_URL, expiresInMinutes: 15, appName: 'Inventory AI' });
      assert.deepEqual(once, twice);
    });

    it('refuses to render without a reset link', () => {
      assert.throws(() => passwordResetEmail({ expiresInMinutes: 30, appName: 'Inventory AI' }), /requires a reset URL/);
      assert.throws(() => passwordResetEmail({ resetUrl: '   ' }), /requires a reset URL/);
      assert.throws(() => passwordResetEmail(), /requires a reset URL/);
    });

    it('falls back to the documented app name and expiry window', () => {
      const { subject, text } = passwordResetEmail({ resetUrl: RESET_URL });
      assert.equal(subject, 'Reset your Inventory AI password');
      assert.match(text, /30 minutes/);
    });
  });

  // ---------------------------------------------------------------------------
  // Service boundary
  // ---------------------------------------------------------------------------
  describe('service boundary', () => {
    it('answers isMailConfigured() false when disabled, false when incomplete, true when complete', async () => {
      await withMailEnv({}, () => assert.equal(isMailConfigured(), false));
      await withMailEnv({ MAIL_PROVIDER: 'resend' }, () => assert.equal(isMailConfigured(), false));
      await withMailEnv({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: API_KEY }, () =>
        assert.equal(isMailConfigured(), false),
      );
      await withMailEnv({ MAIL_PROVIDER: 'resend', MAIL_FROM }, () => assert.equal(isMailConfigured(), false));
      await withMailEnv({ MAIL_PROVIDER: 'nope', RESEND_API_KEY: API_KEY, MAIL_FROM }, () =>
        assert.equal(isMailConfigured(), false),
      );
      await withMailEnv(RESEND_CONFIGURED, () => assert.equal(isMailConfigured(), true));
    });

    it('reports a sending attempt while mail is disabled as MailNotConfigured, never a delivery error', async () => {
      await withMailEnv({}, async () => {
        const err = await captureError(() => sendReset());
        assert.ok(err instanceof MailNotConfigured);
        assert.equal(err.code, MAIL_NOT_CONFIGURED);
        assert.equal(err instanceof MailDeliveryError, false);
      });
    });

    it('keeps mail failures in the MAIL_* namespace, never an authentication or session code', () => {
      const notConfigured = new MailNotConfigured();
      const delivery = new MailDeliveryError();

      assert.equal(notConfigured.code, MAIL_NOT_CONFIGURED);
      assert.equal(delivery.code, MAIL_UNAVAILABLE);
      for (const err of [notConfigured, delivery]) {
        assert.equal(isMailError(err), true);
        assert.match(err.code, /^MAIL_/);
        assert.ok(!/AUTH|SESSION|FORBIDDEN|UNAUTHORIZED|TOKEN|CREDENTIAL/.test(err.code));
      }
      assert.equal(isMailError(new Error('unrelated')), false);
      assert.equal(isMailError(null), false);
    });

    it('captures the rendered message through the fake provider without any network access', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER, MAIL_APP_NAME: 'Inventory AI' }, async () => {
          setFakeMailScenario(fakeMailSuccess('fake-id-1'));
          const result = await sendReset({ expiresInMinutes: 45 });

          assert.deepEqual(result, { id: 'fake-id-1', provider: FAKE_MAIL_PROVIDER });

          const messages = sentMessages();
          assert.equal(messages.length, 1);
          assert.equal(messages[0].to, RECIPIENT);
          assert.equal(messages[0].subject, 'Reset your Inventory AI password');
          assert.ok(messages[0].text.includes(RESET_URL));
          assert.ok(messages[0].html.includes(RESET_URL));
          assert.ok(messages[0].text.includes('45 minutes'));
          assert.ok(!Object.prototype.hasOwnProperty.call(messages[0], 'from'), 'the transport owns `from`');
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('surfaces a failing scenario as a MailDeliveryError and still records the attempt', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, async () => {
          clearSentMessages();
          setFakeMailScenario(fakeMailFailure('The email provider is unavailable.'));
          const err = await captureError(() => sendReset());

          assert.ok(err instanceof MailDeliveryError);
          assert.equal(err.message, 'The email provider is unavailable.');
          assert.equal(sentMessages().length, 1, 'the attempt is recorded even when it fails');
          assert.equal(sentMessages()[0].to, RECIPIENT);
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('removes the fake seam completely when it is deregistered', async () => {
      registerFakeMailProvider();
      assert.ok(registeredProviders().includes(FAKE_MAIL_PROVIDER));
      deregisterFakeMailProvider();

      assert.ok(!registeredProviders().includes(FAKE_MAIL_PROVIDER));
      assert.deepEqual(sentMessages(), []);
      await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, () => {
        assert.throws(() => selectProvider(), MailNotConfigured);
      });
    });

    it('writes nothing to the console on success or on any failure path', async () => {
      const logged = await captureConsole(async () => {
        await withFetchStub(
          async () => jsonResponse(200, { id: 'msg_quiet' }),
          async () => {
            await withMailEnv(RESEND_CONFIGURED, async () => {
              await sendReset();
            });
          },
        );

        await withFetchStub(
          async () => jsonResponse(500, { name: 'application_error', message: `key ${API_KEY} link ${RESET_URL}` }),
          async () => {
            await withMailEnv(RESEND_CONFIGURED, async () => {
              await captureError(() => sendReset());
            });
          },
        );

        await withFetchStub(
          async () => {
            throw new TypeError('fetch failed');
          },
          async () => {
            await withMailEnv(RESEND_CONFIGURED, async () => {
              await captureError(() => sendReset());
            });
          },
        );

        await withMailEnv({}, async () => {
          await captureError(() => sendReset());
        });
      });

      for (const secret of [API_KEY, RESET_URL, RESET_TOKEN, RECIPIENT, MAIL_FROM]) {
        assert.ok(!logged.includes(secret), `nothing carrying ${secret} may reach the console`);
      }
    });
  });
});
