// Brevo provider — the second mail transport.
//
// This suite pins the ONE thing adding Brevo changes: a transport that speaks
// Brevo's wire format. Everything above the provider registry is provider-agnostic
// and is covered by phase26b-mail-service.test.mjs, so the properties asserted here
// are the ones that are Brevo's alone:
//
//   * the exact endpoint, the `api-key` header (NOT `Bearer`), and the
//     `htmlContent`/`textContent` field names;
//   * the LOCAL sender parse — `Name <email>` becomes Brevo's structured
//     `sender: { name, email }`, and a bare address falls back to `{ email }` —
//     which is why `mailConfig.ts` needs no change;
//   * a string `messageId` is the only success, and it maps to `{ id }`;
//   * nothing that could be replayed leaves the layer. Brevo's free-text error
//     `message` is discarded, the request body (which carries the reset URL, and
//     for AUTH-04 the live six-digit code) is never attached to a thrown error or
//     written to the console, and the API key never appears on an error surface.
//
// The transport is exercised with a stubbed globalThis.fetch, so no real email is
// ever sent and no network is touched. DATABASE-FREE on purpose: it runs in both
// `npm test` and `npm run test:unit`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { unitSuite } from './testEnv.mjs';

import {
  isMailConfigured,
  mailProviderName,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  MailNotConfigured,
  MailDeliveryError,
  isMailError,
} from '../src/services/mail/index.ts';
import { MAIL_NOT_CONFIGURED, MAIL_UNAVAILABLE } from '../src/services/mail/mailErrors.ts';
import { mailProviderRequiredEnv, selectProvider } from '../src/services/mail/providers/index.ts';
import { createBrevoProvider } from '../src/services/mail/providers/brevoProvider.ts';

const RESET_TOKEN = 'Kq7Qw3vT9xR2mB6nP1sL4dH8jF5gZ0cY';
const RESET_URL = `https://app.inventory-ai.test/reset-password?token=${RESET_TOKEN}`;
const API_KEY = 'xkeysib-brevo-test-key-000111222333'; // secret-guard:allow (deliberate fixture)
const MAIL_FROM = 'Inventory AI <no-reply@inventory-ai.test>';
const BARE_FROM = 'no-reply@inventory-ai.test';
const RECIPIENT = 'owner@inventory-ai.test';
const CODE = '481902';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const MAIL_ENV_KEYS = [
  'MAIL_PROVIDER',
  'BREVO_API_KEY',
  'MAIL_FROM',
  'MAIL_APP_NAME',
  'MAIL_REQUEST_TIMEOUT_MS',
  'PASSWORD_RESET_URL',
];

const BREVO_CONFIGURED = { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: API_KEY, MAIL_FROM };

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

async function captureError(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected the call to throw, but it resolved');
}

/** The whole error surface a caller or a crash reporter could reach. */
function serialiseError(err) {
  return [err.message, err.stack, JSON.stringify(err, Object.getOwnPropertyNames(err))].join('\n');
}

function sendReset(overrides = {}) {
  return sendPasswordResetEmail({
    to: RECIPIENT,
    resetUrl: RESET_URL,
    expiresInMinutes: 30,
    ...overrides,
  });
}

unitSuite('Brevo provider — transport, sender parse and error hygiene', () => {
  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------
  describe('provider registry', () => {
    it('declares brevo as a built-in with exactly the two required variables', () => {
      assert.deepEqual(mailProviderRequiredEnv('brevo'), ['BREVO_API_KEY', 'MAIL_FROM']);
      assert.deepEqual(mailProviderRequiredEnv('  BrEvO  '), ['BREVO_API_KEY', 'MAIL_FROM']);
    });

    it('★ is the ONLY built-in: resend was removed, not left selectable', async () => {
      // The transport, its key variable and its documentation were deleted on
      // 2026-10-20. This guard fails if the entry is quietly restored — a built-in with
      // no credential configured anywhere is a path an operator can select and no test
      // run reaches, which is exactly what "unused provider" means.
      assert.equal(mailProviderRequiredEnv('resend'), null);
      assert.equal(mailProviderRequiredEnv('sendgrid'), null);

      await withMailEnv({ MAIL_PROVIDER: 'resend', MAIL_FROM }, () => {
        assert.throws(() => selectProvider(), /not supported/i);
      });
      await withMailEnv({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: API_KEY, MAIL_FROM }, () => {
        assert.equal(selectProvider().name, 'brevo');
      });
    });

    it('refuses to select brevo while any required variable is missing or blank', async () => {
      const incomplete = [
        { MAIL_PROVIDER: 'brevo' },
        { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: API_KEY },
        { MAIL_PROVIDER: 'brevo', MAIL_FROM },
        { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: '   ', MAIL_FROM },
      ];
      for (const vars of incomplete) {
        await withMailEnv(vars, () => {
          assert.throws(() => selectProvider(), MailNotConfigured);
        });
      }

      // The message names the missing variable so an operator can act on it, and
      // names no value.
      await withMailEnv({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: API_KEY }, () => {
        assert.throws(() => selectProvider(), /MAIL_FROM/);
      });
      await withMailEnv({ MAIL_PROVIDER: 'brevo', MAIL_FROM }, () => {
        assert.throws(() => selectProvider(), /BREVO_API_KEY/);
      });
    });

    it('normalises case and surrounding whitespace, as the other providers do', async () => {
      await withMailEnv(
        { MAIL_PROVIDER: '  BrEvO  ', BREVO_API_KEY: `  ${API_KEY}  `, MAIL_FROM: `  ${MAIL_FROM}  ` },
        () => {
          assert.equal(mailProviderName(), 'brevo');
          assert.equal(isMailConfigured(), true);
          assert.equal(selectProvider().name, 'brevo');
        },
      );
    });

    it('reports brevo as unconfigured when the key is blank', async () => {
      for (const vars of [
        { MAIL_PROVIDER: 'brevo', MAIL_FROM },
        { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: '   ', MAIL_FROM },
        { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: API_KEY },
      ]) {
        await withMailEnv(vars, () => {
          assert.equal(isMailConfigured(), false);
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Brevo transport
  // ---------------------------------------------------------------------------
  describe('brevo transport', () => {
    it('posts the documented wire format to the Brevo endpoint and returns the message id', async () => {
      const calls = [];
      let result;
      await withFetchStub(
        async (url, options) => {
          calls.push({ url, options });
          return jsonResponse(201, { messageId: '<20260101.abc@brevo>' });
        },
        async () => {
          await withMailEnv(BREVO_CONFIGURED, async () => {
            result = await sendReset({ expiresInMinutes: 30 });
          });
        },
      );

      assert.equal(calls.length, 1, 'exactly one HTTP request may be made');
      const { url, options } = calls[0];
      assert.equal(url, BREVO_ENDPOINT);
      assert.equal(options.method, 'POST');
      assert.deepEqual(Object.keys(options.headers).sort(), ['accept', 'api-key', 'content-type']);
      assert.equal(options.headers['api-key'], API_KEY);
      assert.equal(options.headers['content-type'], 'application/json');
      assert.equal(options.headers.accept, 'application/json');
      assert.ok(options.signal, 'the request must carry an AbortSignal');

      const body = JSON.parse(options.body);
      assert.deepEqual(Object.keys(body).sort(), [
        'htmlContent',
        'sender',
        'subject',
        'textContent',
        'to',
      ]);
      assert.deepEqual(body.sender, { name: 'Inventory AI', email: 'no-reply@inventory-ai.test' });
      assert.deepEqual(body.to, [{ email: RECIPIENT }]);
      assert.equal(body.subject, 'Reset your Inventory AI password');
      assert.ok(body.textContent.includes(RESET_URL), 'the reset link must reach the transport');
      assert.ok(body.htmlContent.includes(RESET_URL), 'the reset link must reach the transport');

      assert.deepEqual(result, { id: '<20260101.abc@brevo>', provider: 'brevo' });
    });

    it('falls back to a bare email when MAIL_FROM has no display name', async () => {
      let options = null;
      await withFetchStub(
        async (_url, opts) => {
          options = opts;
          return jsonResponse(201, { messageId: 'msg_bare' });
        },
        async () => {
          await withMailEnv({ ...BREVO_CONFIGURED, MAIL_FROM: BARE_FROM }, async () => {
            await sendReset();
          });
        },
      );
      assert.deepEqual(JSON.parse(options.body).sender, { email: BARE_FROM });
    });

    it('unquotes a quoted display name', async () => {
      let options = null;
      await withFetchStub(
        async (_url, opts) => {
          options = opts;
          return jsonResponse(201, { messageId: 'msg_quoted' });
        },
        async () => {
          await withMailEnv(
            { ...BREVO_CONFIGURED, MAIL_FROM: '"Inventory AI" <no-reply@inventory-ai.test>' },
            async () => {
              await sendReset();
            },
          );
        },
      );
      assert.deepEqual(JSON.parse(options.body).sender, {
        name: 'Inventory AI',
        email: 'no-reply@inventory-ai.test',
      });
    });

    it('renders the subject with the configured app name', async () => {
      let options = null;
      await withFetchStub(
        async (_url, opts) => {
          options = opts;
          return jsonResponse(201, { messageId: 'msg_app' });
        },
        async () => {
          await withMailEnv(
            { ...BREVO_CONFIGURED, MAIL_APP_NAME: 'Cebu Traders', MAIL_REQUEST_TIMEOUT_MS: '4000' },
            async () => {
              await sendReset();
            },
          );
        },
      );
      assert.equal(JSON.parse(options.body).subject, 'Reset your Cebu Traders password');
    });

    it('treats a 2xx that carries no usable message id as a delivery error', async () => {
      for (const response of [
        jsonResponse(201, {}),
        jsonResponse(201, { messageId: 123 }),
        jsonResponse(201, { messageId: '   ' }),
        jsonResponse(201, null),
        nonJsonResponse(201),
      ]) {
        let err;
        await withFetchStub(
          async () => response,
          async () => {
            await withMailEnv(BREVO_CONFIGURED, async () => {
              err = await captureError(() => sendReset());
            });
          },
        );
        assert.ok(err instanceof MailDeliveryError);
        assert.equal(err.code, MAIL_UNAVAILABLE);
        assert.match(err.message, /unexpected response/);
      }
    });

    it('turns a non-2xx response into a MailDeliveryError that leaks nothing', async () => {
      const hostile = {
        code: 'invalid_parameter',
        // A real upstream is free to echo what we sent. Nothing from this body may
        // survive into the error, so the test makes it echo every secret at once.
        message: `rejected request for ${RECIPIENT} with key ${API_KEY} and link ${RESET_URL} (token ${RESET_TOKEN})`,
      };

      let err;
      await withFetchStub(
        async () => jsonResponse(400, hostile),
        async () => {
          await withMailEnv(BREVO_CONFIGURED, async () => {
            err = await captureError(() => sendReset());
          });
        },
      );

      assert.ok(err instanceof MailDeliveryError);
      assert.equal(err.name, 'MailDeliveryError');
      assert.equal(err.code, MAIL_UNAVAILABLE);
      assert.ok(isMailError(err));
      assert.match(err.message, /400/);
      assert.match(err.message, /invalid_parameter/);

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

    it('ignores a prose error code that is not a safe identifier', async () => {
      let err;
      await withFetchStub(
        async () => jsonResponse(400, { code: 'Domain does not exist', message: `token ${RESET_TOKEN}` }),
        async () => {
          await withMailEnv(BREVO_CONFIGURED, async () => {
            err = await captureError(() => sendReset());
          });
        },
      );
      assert.ok(err instanceof MailDeliveryError);
      assert.equal(err.message, 'The email service rejected the message (HTTP 400).');
      assert.ok(!serialiseError(err).includes(RESET_TOKEN));
    });

    it('accepts a non-2xx error body that is not JSON, without relaying it', async () => {
      let err;
      await withFetchStub(
        async () => nonJsonResponse(502),
        async () => {
          await withMailEnv(BREVO_CONFIGURED, async () => {
            err = await captureError(() => sendReset());
          });
        },
      );
      assert.ok(err instanceof MailDeliveryError);
      assert.match(err.message, /502/);
      assert.ok(!serialiseError(err).includes('Unexpected token'));
    });

    it('turns a network failure into a MailDeliveryError', async () => {
      let err;
      await withFetchStub(
        async () => {
          throw new TypeError('fetch failed');
        },
        async () => {
          await withMailEnv(BREVO_CONFIGURED, async () => {
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
            await withMailEnv({ ...BREVO_CONFIGURED, MAIL_REQUEST_TIMEOUT_MS: '20' }, async () => {
              err = await captureError(() => sendReset());
            });
          },
        );
        assert.equal(aborted, true, 'the in-flight request must be aborted when the timeout elapses');
        assert.ok(err instanceof MailDeliveryError);
        assert.match(err.message, /too long/i);
      },
    );

    it('throws MailNotConfigured for a direct construction without its key or sender', async () => {
      await withMailEnv({}, async () => {
        const provider = createBrevoProvider();
        assert.equal(provider.name, 'brevo');
        const err = await captureError(() =>
          provider.send({ to: RECIPIENT, subject: 's', text: 't', html: 'h' }),
        );
        assert.ok(err instanceof MailNotConfigured);
        assert.equal(err.code, MAIL_NOT_CONFIGURED);
        assert.match(err.message, /BREVO_API_KEY/);
      });
    });

    it('writes nothing to the console on any path', async () => {
      const originalLog = console.log;
      const originalError = console.error;
      const written = [];
      console.log = (...args) => written.push(args.join(' '));
      console.error = (...args) => written.push(args.join(' '));
      try {
        await withFetchStub(
          async () => jsonResponse(400, { code: 'invalid_parameter', message: RESET_URL }),
          async () => {
            await withMailEnv(BREVO_CONFIGURED, async () => {
              await captureError(() => sendReset());
            });
          },
        );
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
      assert.deepEqual(written, [], 'the mail layer must never log');
    });
  });

  // ---------------------------------------------------------------------------
  // AUTH-04 verification-code path — the code is a live credential
  // ---------------------------------------------------------------------------
  describe('verification-code delivery', () => {
    it('delivers the six-digit code through Brevo without leaking it on an error', async () => {
      let options = null;
      await withFetchStub(
        async (_url, opts) => {
          options = opts;
          return jsonResponse(201, { messageId: 'msg_code' });
        },
        async () => {
          await withMailEnv(BREVO_CONFIGURED, async () => {
            const result = await sendEmailVerificationEmail({ to: RECIPIENT, code: CODE });
            assert.deepEqual(result, { id: 'msg_code', provider: 'brevo' });
          });
        },
      );
      const body = JSON.parse(options.body);
      assert.ok(body.textContent.includes(CODE), 'the code must reach the transport');
      assert.ok(body.htmlContent.includes(CODE), 'the code must reach the transport');
      assert.ok(!body.subject.includes(CODE), 'the code must stay out of the subject line');

      // A hostile provider rejection that echoes the code must not surface it.
      let err;
      await withFetchStub(
        async () => jsonResponse(400, { code: 'bad_request', message: `code ${CODE} rejected` }),
        async () => {
          await withMailEnv(BREVO_CONFIGURED, async () => {
            err = await captureError(() => sendEmailVerificationEmail({ to: RECIPIENT, code: CODE }));
          });
        },
      );
      assert.ok(err instanceof MailDeliveryError);
      assert.ok(!serialiseError(err).includes(CODE), 'the verification code must never leave on an error');
      assert.ok(!serialiseError(err).includes(RECIPIENT), 'the recipient must never leave on an error');
    });
  });
});
