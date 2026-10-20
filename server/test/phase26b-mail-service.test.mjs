// Phase 26B-1 — the mail service abstraction.
//
// This suite pins the layer that password recovery was built on: the provider
// registry, the built-in transport selection, the template and the error contract.
// The BUILT-IN transport it exercises is **Brevo, the provider in use**; the wire
// format itself is pinned in phase-brevo-provider.test.mjs, so this file keeps to
// the parts that are provider-agnostic plus the one thing that must never come back:
// `resend` is no longer a built-in (see "provider registry" below).
//
// Two properties are worth more than the rest of the file, and both are asserted
// against a deliberately hostile upstream:
//
//   * Nothing that could be replayed may leave the layer. The request body carries
//     the password-reset URL, which carries the raw single-use token. A provider
//     error, an exception or a log line is therefore treated as an exfiltration
//     surface: the tests make the upstream answer with a body that echoes the API
//     key, the reset URL and the token, and require all three to be absent from the
//     thrown error, from every own property of it and from anything written to the
//     console.
//   * The transport is exercised without a network. The provider cases stub
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
const API_KEY = 'xkeysib-phase26b-test-key-000111222333'; // secret-guard:allow (deliberate fixture)
const MAIL_FROM = 'Inventory AI <no-reply@inventory-ai.test>';
const RECIPIENT = 'owner@inventory-ai.test';

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

unitSuite('Phase 26B-1 — mail service (registry, built-in transport, template)', () => {
  // ---------------------------------------------------------------------------
  // Provider registry
  // ---------------------------------------------------------------------------
  describe('provider registry', () => {
    it('declares brevo as a built-in with exactly the two required variables', () => {
      assert.deepEqual(mailProviderRequiredEnv('brevo'), ['BREVO_API_KEY', 'MAIL_FROM']);
      assert.deepEqual(mailProviderRequiredEnv('  BreVo  '), ['BREVO_API_KEY', 'MAIL_FROM']);
    });

    it('★ no longer declares resend as a built-in', async () => {
      // THE REMOVAL GUARD. The Resend transport was deleted along with its key, its
      // registry entry and its documentation; this fails if any of it comes back,
      // because a re-added built-in would need a credential nobody configures and would
      // present an operator with a provider the project does not use.
      assert.equal(mailProviderRequiredEnv('resend'), null);
      assert.equal(mailProviderRequiredEnv('  ReSend  '), null);

      await withMailEnv({ MAIL_PROVIDER: 'resend', MAIL_FROM }, () => {
        const err = captureErrorSync(() => selectProvider());
        assert.ok(err instanceof MailNotConfigured);
        assert.match(err.message, /not supported/i);
        assert.match(err.message, /brevo/, 'the refusal must name the provider that IS supported');
      });
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

    it('refuses an unsupported provider name instead of silently doing nothing', async () => {
      await withMailEnv({ ...BREVO_CONFIGURED, MAIL_PROVIDER: 'sendgrid' }, () => {
        assert.throws(() => selectProvider(), /sendgrid/);
      });
    });

    it('selects brevo once every required variable is present', async () => {
      await withMailEnv(BREVO_CONFIGURED, () => {
        const provider = selectProvider();
        assert.equal(provider.name, 'brevo');
        assert.equal(typeof provider.send, 'function');
      });
    });

    it('reads the environment lazily, so a change is observed without reloading', async () => {
      await withMailEnv({ ...BREVO_CONFIGURED, MAIL_APP_NAME: 'First', PASSWORD_RESET_URL: 'https://one.test/reset' }, () => {
        assert.equal(mailConfig().provider, 'brevo');
        assert.equal(mailConfig().appName, 'First');
        assert.equal(mailConfig().resetUrl, 'https://one.test/reset');
        assert.equal(mailProviderName(), 'brevo');
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
      await withMailEnv(BREVO_CONFIGURED, () => {
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
      assert.deepEqual(mailProviderRequiredEnv('brevo'), ['BREVO_API_KEY', 'MAIL_FROM']);

      await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, () => {
        assert.throws(() => selectProvider(), MailNotConfigured);
      });
      await withMailEnv(BREVO_CONFIGURED, () => {
        assert.equal(selectProvider().name, 'brevo');
      });
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
      await withMailEnv({ MAIL_PROVIDER: 'brevo' }, () => assert.equal(isMailConfigured(), false));
      await withMailEnv({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: API_KEY }, () =>
        assert.equal(isMailConfigured(), false),
      );
      await withMailEnv({ MAIL_PROVIDER: 'brevo', MAIL_FROM }, () => assert.equal(isMailConfigured(), false));
      await withMailEnv({ MAIL_PROVIDER: 'nope', BREVO_API_KEY: API_KEY, MAIL_FROM }, () =>
        assert.equal(isMailConfigured(), false),
      );
      await withMailEnv(BREVO_CONFIGURED, () => assert.equal(isMailConfigured(), true));
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
          // Brevo's success shape: a `messageId`, not Resend's `id`.
          async () => jsonResponse(201, { messageId: 'msg_quiet' }),
          async () => {
            await withMailEnv(BREVO_CONFIGURED, async () => {
              await sendReset();
            });
          },
        );

        // A hostile upstream: the body names itself safely AND echoes the key and the
        // reset URL in its free-text `message`, which must never be relayed.
        await withFetchStub(
          async () => jsonResponse(400, { code: 'invalid_parameter', message: `key ${API_KEY} link ${RESET_URL}` }),
          async () => {
            await withMailEnv(BREVO_CONFIGURED, async () => {
              await captureError(() => sendReset());
            });
          },
        );

        await withFetchStub(
          async () => {
            throw new TypeError('fetch failed');
          },
          async () => {
            await withMailEnv(BREVO_CONFIGURED, async () => {
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
