// AUTH-04-B1 — the email-verification mail extension.
//
// This suite pins the ONE thing the AUTH-04-B mail step adds: a pure template and
// a `sendEmailVerificationEmail` that transports it. No code generation, no
// hashing, no pepper, no challenge, no route, no Firebase. So the properties worth
// asserting are:
//
//   * the digits reach the recipient EXACTLY as given, leading zeros included,
//     because the challenge compares a digest of the code and a mangled `42` would
//     refuse a correct `000042`;
//   * the rendered message carries nothing else that could be replayed — no URL,
//     no address, no user id, no HMAC, no pepper;
//   * the send is AWAITED (the opposite of the Phase 28 B1 password-reset detach),
//     because the AUTH-04 request path must know whether the code was delivered
//     before it decides what to report;
//   * a mail misconfiguration surfaces as MailNotConfigured / MAIL_NOT_CONFIGURED,
//     and this layer emits NO EMAIL_VERIFICATION_* code at all — the D-B2 mapping
//     to EMAIL_VERIFICATION_NOT_CONFIGURED belongs to the AUTH-04 HTTP surface,
//     which also owns the fixed caller-facing copy;
//   * nothing is logged, and no secret reaches an error object or the console.
//
// DATABASE-FREE on purpose: no model, no connection, no route. It runs in both
// `npm test` and `npm run test:unit`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { unitSuite } from './testEnv.mjs';

import {
  isMailConfigured,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  MailNotConfigured,
  MailDeliveryError,
  isMailError,
} from '../src/services/mail/index.ts';
import { MAIL_NOT_CONFIGURED, MAIL_UNAVAILABLE } from '../src/services/mail/mailErrors.ts';
import {
  emailVerificationEmail,
  DEFAULT_EXPIRES_IN_MINUTES,
} from '../src/services/mail/templates/emailVerification.ts';
import {
  EMAIL_VERIFICATION_CODE_LENGTH,
  EMAIL_VERIFICATION_TTL_MINUTES,
} from '../src/constants/emailVerification.ts';
import {
  FAKE_MAIL_PROVIDER,
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  setFakeMailScenario,
  sentMessages,
  clearSentMessages,
  fakeMailSuccess,
  fakeMailFailure,
  fakeMailGate,
} from './fakes/mailProvider.mjs';

const CODE = '481902';
const CODE_WITH_LEADING_ZERO = '000042';
const RECIPIENT = 'owner@inventory-ai.test';
const PASSWORD = 'hunter2-Correct-Horse';
const RESET_URL = 'https://app.inventory-ai.test/reset-password?token=Kq7Qw3vT9xR2mB6nP1sL4dH8jF5gZ0cY';

const MAIL_ENV_KEYS = [
  'MAIL_PROVIDER',
  'BREVO_API_KEY',
  'MAIL_FROM',
  'MAIL_APP_NAME',
  'MAIL_REQUEST_TIMEOUT_MS',
  'PASSWORD_RESET_URL',
];

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

async function captureError(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected the call to throw, but it resolved');
}

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

function sendCode(overrides = {}) {
  return sendEmailVerificationEmail({ to: RECIPIENT, code: CODE, ...overrides });
}

unitSuite('AUTH-04-B1 — email-verification mail template and send', () => {
  // ---------------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------------
  describe('emailVerificationEmail template', () => {
    it('states the code, the expiry and what to do if it was not requested', () => {
      const { subject, text, html } = emailVerificationEmail({
        code: CODE,
        expiresInMinutes: 10,
        appName: 'Inventory AI',
      });

      assert.equal(subject, 'Your Inventory AI verification code');
      for (const part of [text, html]) {
        assert.ok(part.includes(CODE), 'the code must be present');
      }
      assert.match(text, /expires in 10 minutes/, 'the expiry must be stated');
      assert.match(html, /expires in 10 minutes/);
      assert.match(text, /only be used once/i, 'single use must be stated');
      assert.match(text, /did not try to verify/i, 'unrequested-code guidance must be present');
      assert.match(text, /never share this code/i, 'the never-share warning must be present');
    });

    it('keeps the code out of the subject line', () => {
      const { subject } = emailVerificationEmail({ code: CODE });
      assert.ok(!subject.includes(CODE), 'a live credential must not sit in an inbox preview');
    });

    it('preserves a leading zero exactly, in both renderings', () => {
      const { text, html } = emailVerificationEmail({ code: CODE_WITH_LEADING_ZERO });

      assert.ok(text.includes(CODE_WITH_LEADING_ZERO), 'the padded digits must survive');
      assert.ok(html.includes(CODE_WITH_LEADING_ZERO), 'the padded digits must survive');
      // A template that treated the code as a number would render `42` and the
      // challenge's digest could never match it again.
      assert.ok(!/\b42\b/.test(text.replace(CODE_WITH_LEADING_ZERO, '')), 'the code must not be truncated');
    });

    it('carries no URL, no address, no user id and no cryptographic material', () => {
      const { text, html } = emailVerificationEmail({ code: CODE });
      const all = [text, html].join('\n');

      assert.ok(!/https?:\/\//.test(all), 'the code flow is not a link flow');
      assert.ok(!all.includes('@'), 'the message must not name any address');
      assert.ok(!/userId|user id|businessId/i.test(all), 'no account identifier belongs in the message');
      for (const banned of ['hmac', 'pepper', 'firebase', 'idToken', 'reset']) {
        assert.ok(!all.toLowerCase().includes(banned.toLowerCase()), `the message must not mention ${banned}`);
      }
    });

    it('cannot render a password even if one is supplied', () => {
      const { text, html } = emailVerificationEmail({ code: CODE, password: PASSWORD });
      const all = [text, html].join('\n');

      assert.ok(!all.includes(PASSWORD), 'a supplied password must not render');
      assert.ok(!/password[ \t]*[:=][ \t]*\S/i.test(all), 'no "password: value" pair may appear');
    });

    it('is a pure function of its inputs — no clock, no randomness, no I/O', () => {
      const once = emailVerificationEmail({ code: CODE, expiresInMinutes: 10, appName: 'Inventory AI' });
      const twice = emailVerificationEmail({ code: CODE, expiresInMinutes: 10, appName: 'Inventory AI' });
      assert.deepEqual(once, twice);
    });

    it('refuses to render without a usable code, and never echoes what it rejected', () => {
      const bad = [
        undefined,
        '',
        '   ',
        '12345',
        '1234567',
        'abcdef',
        '12345a',
        123456,
        null,
        `${CODE}${CODE}`,
      ];
      for (const code of bad) {
        const err = captureErrorSync(() => emailVerificationEmail({ code }));
        assert.match(err.message, /requires a 6-digit code/);
        if (typeof code === 'string' && code.trim()) {
          assert.ok(!err.message.includes(code.trim()), 'the rejected value must not be echoed');
        }
      }
      assert.throws(() => emailVerificationEmail(), /requires a 6-digit code/);
    });

    it('falls back to the flow’s own lifetime and the documented app name', () => {
      const { subject, text } = emailVerificationEmail({ code: CODE });

      assert.equal(subject, 'Your Inventory AI verification code');
      assert.match(text, new RegExp(`expires in ${EMAIL_VERIFICATION_TTL_MINUTES} minutes`));
      assert.equal(DEFAULT_EXPIRES_IN_MINUTES, EMAIL_VERIFICATION_TTL_MINUTES);
      // The length is imported flow policy, not a literal retyped here.
      assert.equal(EMAIL_VERIFICATION_CODE_LENGTH, 6);
      assert.throws(() => emailVerificationEmail({ code: '1'.repeat(EMAIL_VERIFICATION_CODE_LENGTH - 1) }));
    });

    it('renders the configured app name', () => {
      const { subject, text } = emailVerificationEmail({ code: CODE, appName: 'Cebu Traders' });
      assert.equal(subject, 'Your Cebu Traders verification code');
      assert.ok(text.includes('Cebu Traders'));
    });
  });

  // ---------------------------------------------------------------------------
  // Service boundary
  // ---------------------------------------------------------------------------
  describe('sendEmailVerificationEmail', () => {
    it('transports the rendered message through the registry and reports the id and provider', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER, MAIL_APP_NAME: 'Inventory AI' }, async () => {
          clearSentMessages();
          setFakeMailScenario(fakeMailSuccess('fake-verification-1'));
          const result = await sendCode({ expiresInMinutes: 10 });

          assert.deepEqual(result, { id: 'fake-verification-1', provider: FAKE_MAIL_PROVIDER });

          const messages = sentMessages();
          assert.equal(messages.length, 1);
          assert.equal(messages[0].to, RECIPIENT);
          assert.equal(messages[0].subject, 'Your Inventory AI verification code');
          assert.ok(messages[0].text.includes(CODE), 'the code must reach the transport');
          assert.ok(messages[0].html.includes(CODE), 'the code must reach the transport');
          assert.ok(messages[0].text.includes('10 minutes'));
          assert.ok(
            !Object.prototype.hasOwnProperty.call(messages[0], 'from'),
            'the transport owns `from`',
          );
          assert.deepEqual(
            Object.keys(messages[0]).sort(),
            ['html', 'subject', 'text', 'to'],
            'the transport is handed rendered strings and nothing else',
          );
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('awaits the transport: the call does not resolve while the send is still open', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, async () => {
          clearSentMessages();
          const gate = fakeMailGate();
          setFakeMailScenario(gate.scenario);

          let resolved = false;
          const pending = sendCode().then((value) => {
            resolved = true;
            return value;
          });

          await new Promise((resolve) => setImmediate(resolve));
          assert.equal(sentMessages().length, 1, 'the transport must have been reached');
          assert.equal(resolved, false, 'an awaited send must not resolve while delivery is pending');

          gate.release();
          const result = await pending;
          assert.deepEqual(result, { id: 'fake-gated', provider: FAKE_MAIL_PROVIDER });
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('returns only after the transport has settled, in that order', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, async () => {
          const order = [];
          // The scenario settles on a MACROTASK, deliberately. A microtask-only
          // scenario would not discriminate: an `async` function whose send is not
          // awaited still yields once before returning, which is enough for a
          // queued microtask to run first and produce the right order by accident.
          setFakeMailScenario(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            order.push('transport');
            return { id: 'ordered' };
          });

          await sendCode();
          order.push('returned');

          assert.deepEqual(order, ['transport', 'returned'], 'the send must be awaited, not detached');
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('surfaces a missing or unusable mail configuration as MailNotConfigured, never a delivery error', async () => {
      for (const vars of [{}, { MAIL_PROVIDER: '' }, { MAIL_PROVIDER: '   ' }, { MAIL_PROVIDER: 'sendgrid' }]) {
        await withMailEnv(vars, async () => {
          assert.equal(isMailConfigured(), false);
          const err = await captureError(() => sendCode());

          assert.ok(err instanceof MailNotConfigured, 'a configuration problem is not a provider problem');
          assert.equal(err.code, MAIL_NOT_CONFIGURED);
          assert.equal(err instanceof MailDeliveryError, false);
          assert.ok(isMailError(err), 'the boundary recognises it by `isMailError`');
          assert.deepEqual(sentMessages(), [], 'nothing may be attempted while mail is unconfigured');
        });
      }
    });

    it('emits no EMAIL_VERIFICATION_* code — the D-B2 mapping belongs to the HTTP surface', async () => {
      await withMailEnv({}, async () => {
        const err = await captureError(() => sendCode());
        assert.equal(err.code, MAIL_NOT_CONFIGURED);
        assert.ok(
          !/^EMAIL_VERIFICATION_/.test(String(err.code)),
          'this layer keeps its own MAIL_* namespace; the controller maps it, with fixed copy',
        );
      });

      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, async () => {
          setFakeMailScenario(fakeMailFailure());
          const err = await captureError(() => sendCode());
          assert.equal(err.code, MAIL_UNAVAILABLE);
          assert.ok(!/^EMAIL_VERIFICATION_/.test(String(err.code)));
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('surfaces a provider failure as MailDeliveryError and still records the attempt', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, async () => {
          clearSentMessages();
          setFakeMailScenario(fakeMailFailure('The email provider is unavailable.'));
          const err = await captureError(() => sendCode());

          assert.ok(err instanceof MailDeliveryError);
          assert.equal(err.code, MAIL_UNAVAILABLE);
          assert.equal(err.message, 'The email provider is unavailable.');
          assert.equal(sentMessages().length, 1, 'the attempt is recorded even when it fails');
          assert.equal(sentMessages()[0].to, RECIPIENT);
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('attaches no payload, recipient or credential to a thrown error', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, async () => {
          setFakeMailScenario(fakeMailFailure('The email provider is unavailable.'));
          const err = await captureError(() => sendCode());

          const surface = serialiseError(err);
          for (const secret of [CODE, RECIPIENT]) {
            assert.ok(!surface.includes(secret), `a thrown error must never carry ${secret}`);
          }
          const own = Object.getOwnPropertyNames(err).filter(
            (key) => !['stack', 'message', 'name', 'code'].includes(key),
          );
          assert.deepEqual(own, [], 'no payload or transport error may be attached');
          assert.equal(err.cause, undefined);
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('writes nothing to the console on success, on failure or on misconfiguration', async () => {
      registerFakeMailProvider();
      try {
        const logged = await captureConsole(async () => {
          await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, async () => {
            setFakeMailScenario(fakeMailSuccess('quiet-1'));
            await sendCode();
            setFakeMailScenario(fakeMailFailure());
            await captureError(() => sendCode());
          });
          await withMailEnv({}, async () => {
            await captureError(() => sendCode());
          });
        });

        for (const secret of [CODE, RECIPIENT, PASSWORD]) {
          assert.ok(!logged.includes(secret), `nothing carrying ${secret} may reach the console`);
        }
      } finally {
        deregisterFakeMailProvider();
      }
    });

    it('leaves the password-reset path unchanged', async () => {
      registerFakeMailProvider();
      try {
        await withMailEnv({ MAIL_PROVIDER: FAKE_MAIL_PROVIDER }, async () => {
          clearSentMessages();
          setFakeMailScenario(fakeMailSuccess('reset-1'));
          const reset = await sendPasswordResetEmail({
            to: RECIPIENT,
            resetUrl: RESET_URL,
            expiresInMinutes: 30,
          });
          setFakeMailScenario(fakeMailSuccess('verify-1'));
          const verify = await sendCode();

          assert.deepEqual(reset, { id: 'reset-1', provider: FAKE_MAIL_PROVIDER });
          assert.deepEqual(verify, { id: 'verify-1', provider: FAKE_MAIL_PROVIDER });

          const [resetMessage, verifyMessage] = sentMessages();
          assert.equal(resetMessage.subject, 'Reset your Inventory AI password');
          assert.ok(resetMessage.text.includes(RESET_URL), 'the reset link must still reach the transport');
          assert.equal(verifyMessage.subject, 'Your Inventory AI verification code');
          assert.ok(!verifyMessage.text.includes(RESET_URL), 'the two templates must not be conflated');
        });
      } finally {
        deregisterFakeMailProvider();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Source guards — the boundary is a property of the code, not only of behaviour
  // ---------------------------------------------------------------------------
  describe('mail layer source guards', () => {
    const templateSource = readFileSync(
      path.join(SERVER_ROOT, 'src/services/mail/templates/emailVerification.ts'),
      'utf8',
    );
    const serviceSource = readFileSync(path.join(SERVER_ROOT, 'src/services/mail/index.ts'), 'utf8');

    it('logs nothing anywhere in the new mail surface', () => {
      for (const [name, source] of [
        ['templates/emailVerification.ts', templateSource],
        ['index.ts', serviceSource],
      ]) {
        assert.ok(!/console\./.test(source), `${name} must not write to the console`);
      }
    });

    it('generates, hashes and peppers nothing — that belongs to the challenge service', () => {
      for (const source of [templateSource, serviceSource]) {
        for (const banned of ['createHmac', 'randomInt', 'randomBytes', 'createHash', 'timingSafeEqual']) {
          assert.ok(!source.includes(banned), `the mail layer must not contain ${banned}`);
        }
      }
    });

    it('imports the flow policy rather than restating it', () => {
      assert.match(templateSource, /EMAIL_VERIFICATION_TTL_MINUTES/, 'the lifetime must be imported');
      assert.match(templateSource, /EMAIL_VERIFICATION_CODE_LENGTH/, 'the code length must be imported');
    });
  });
});
