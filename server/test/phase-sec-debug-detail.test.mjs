/**
 * Debug detail in an error response is released only to a process that says, explicitly, that it
 * is a development one.
 *
 * WHY THIS EXISTS. `errorHandler` used to append `err.stack` whenever
 * `process.env.NODE_ENV !== 'production'` — a rule that answers YES to an unset, empty or
 * MISSPELLED value. Measured on the local server on 2026-10-22, a failed login answered:
 *
 *   {"error":"Invalid email or password","code":"INVALID_CREDENTIALS",
 *    "stack":"ApiError: Invalid email or password\n    at loginWithPassword
 *             (file:///C:/Users/jeffe/inventory-ai/server/src/services/auth.service.ts:322:11)"}
 *
 * …which is a map of the codebase, an absolute local path and a line number, handed to any caller
 * who can provoke a 4xx. In development that is a convenience; on a host where `NODE_ENV` was never
 * set — or was written `Production`, `prod`, `staging` — it is a disclosure that nobody chose.
 *
 * The rule is now fail-closed: only `development` and `test` get stacks, and anything else hides
 * them. The cases below are the ones that must REJECT a stack, including the capitalised value the
 * previous rule published.
 *
 * WHAT THESE DO NOT PROVE: that a particular deployed host sets the variable. That is now a BOOT
 * REQUIREMENT rather than a warning — a process that cannot name its environment refuses to start,
 * on every host, and the second half of this suite pins that rule.
 */

import 'dotenv/config';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import express from 'express';

import { createApp } from '../src/app.ts';
import {
  classifyNodeEnv,
  isDebugNodeEnv,
  isRecognisedNodeEnv,
  isTestProcess,
  KNOWN_NODE_ENVS,
} from '../src/config/env.ts';
import { startServer } from '../src/config/startup.ts';

/** The 4xx this suite provokes: the login validator, which answers before any database work. */
async function loginValidationError(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  return { status: res.status, body: await res.json() };
}

/** Run `fn` with `NODE_ENV` set to `value` (or deleted), then restore the real one. */
async function withNodeEnv(value, fn) {
  const saved = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  }
}

describe('debug detail is released only to an explicitly development process (2026-10-22)', () => {
  it('recognises exactly the two development environments', () => {
    assert.equal(isDebugNodeEnv('development'), true);
    assert.equal(isDebugNodeEnv('test'), true);

    // Every one of these must be false. `Production` and `prod` are the spellings that the retired
    // rule published stacks for.
    for (const value of ['production', 'Production', 'PRODUCTION', 'prod', 'staging', '', ' ']) {
      assert.equal(isDebugNodeEnv(value), false, `${JSON.stringify(value)} must not be debug mode`);
    }

    // The no-argument form reads the process, so "unset" is proved by removing it: an omitted
    // variable is exactly the case that must not be treated as a developer's machine.
    const saved = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      assert.equal(isDebugNodeEnv(), false);
      assert.equal(classifyNodeEnv(), 'missing');
    } finally {
      if (saved !== undefined) process.env.NODE_ENV = saved;
    }
  });

  it('names the recognised values, so the classifier and the boot gate cannot drift', () => {
    assert.deepEqual([...KNOWN_NODE_ENVS], ['development', 'test', 'production']);
  });

  it('separates a variable nobody set from one somebody mistyped', () => {
    // The distinction is the diagnostic: an operator fixes them in different places, and a report
    // that said only "invalid" would send them to the wrong one.
    // NB: the no-argument form reads `process.env` — an explicit `undefined` is the default
    // parameter firing, not "unset" — so the absent case is proved by removing the variable.
    const saved = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      assert.equal(classifyNodeEnv(), 'missing');
    } finally {
      if (saved !== undefined) process.env.NODE_ENV = saved;
    }
    assert.equal(classifyNodeEnv(''), 'missing');
    assert.equal(classifyNodeEnv('   '), 'missing');

    assert.equal(classifyNodeEnv('prod'), 'unrecognised');
    assert.equal(classifyNodeEnv('Production'), 'unrecognised');
    assert.equal(classifyNodeEnv('staging'), 'unrecognised');

    assert.equal(classifyNodeEnv('production'), 'production');
    assert.equal(classifyNodeEnv('development'), 'development');
    assert.equal(classifyNodeEnv('test'), 'test');
    assert.equal(classifyNodeEnv(' production '), 'production');
  });

  it('accepts exactly three postures, and a test process that declares itself', () => {
    for (const kind of ['production', 'development', 'test']) {
      assert.equal(isRecognisedNodeEnv(kind), true, kind);
    }
    for (const kind of ['missing', 'unrecognised']) {
      assert.equal(isRecognisedNodeEnv(kind), false, kind);
    }

    // TEST_MODE is a declaration in its own right, and it is fail-closed: the database resolver
    // pins a test process to the test database and refuses `NODE_ENV=production` alongside it.
    assert.equal(isTestProcess({ TEST_MODE: 'unit' }), true);
    assert.equal(isTestProcess({ TEST_MODE: '  ' }), false);
    assert.equal(isTestProcess({ TEST_MODE: '' }), false);
    assert.equal(isTestProcess({ NODE_ENV: 'test' }), false);
  });

  it('a recognised value with surrounding whitespace is the posture it names', () => {
    // The bug the classifier closes: `env.nodeEnv` used to be the raw string, so
    // `NODE_ENV=" production "` selected the production DATABASE while skipping the production
    // CONFIGURATION CHECKS. Classification trims once, and the module reads the classified value.
    assert.equal(classifyNodeEnv(' production '), 'production');
    assert.equal(isDebugNodeEnv(' production '), false);
  });

  describe('over the real app', () => {
    let baseUrl;
    let server;

    before(async () => {
      server = createApp().listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
    });

    it('includes a stack in development, which is the behaviour that must survive', async () => {
      const { status, body } = await withNodeEnv('development', () => loginValidationError(baseUrl));

      assert.equal(status, 400);
      assert.equal(body.code, 'VALIDATION_ERROR');
      assert.equal(typeof body.stack, 'string');
      assert.match(body.stack, /ApiError/);
    });

    it('includes a stack in test', async () => {
      const { body } = await withNodeEnv('test', () => loginValidationError(baseUrl));
      assert.equal(typeof body.stack, 'string');
    });

    it('withholds the stack in production', async () => {
      const { status, body } = await withNodeEnv('production', () => loginValidationError(baseUrl));

      assert.equal(status, 400);
      assert.equal('stack' in body, false);
    });

    it('withholds the stack for a capitalised NODE_ENV — the value the old rule published', async () => {
      const { body } = await withNodeEnv('Production', () => loginValidationError(baseUrl));

      assert.equal('stack' in body, false, '`NODE_ENV=Production` must not be treated as development');
      assert.equal(JSON.stringify(body).includes('file:///'), false);
    });

    it('withholds the stack when NODE_ENV is unset or empty (must trip)', async () => {
      // This is the defect: an unset variable used to mean "development" here, so a host that set
      // no NODE_ENV at all answered with its own file paths.
      for (const value of [undefined, '', 'prod', 'staging']) {
        const { body } = await withNodeEnv(value, () => loginValidationError(baseUrl));
        assert.equal(
          'stack' in body,
          false,
          `NODE_ENV=${JSON.stringify(value)} must not publish a stack`,
        );
      }
    });

    it('changes NOTHING else about the error a client already branches on', async () => {
      // Withholding a stack must not become withholding the answer: the status, the message and the
      // machine-readable code are identical in both postures, and only `stack` differs.
      const dev = await withNodeEnv('development', () => loginValidationError(baseUrl));
      const prod = await withNodeEnv('production', () => loginValidationError(baseUrl));

      assert.equal(dev.status, prod.status);
      assert.deepEqual(prod.body, { error: dev.body.error, code: dev.body.code, fields: dev.body.fields });
      assert.deepEqual(prod.body.error, dev.body.error);
      assert.deepEqual(prod.body.code, dev.body.code);
      assert.deepEqual(prod.body.fields, dev.body.fields);
    });
  });
});

/**
 * The wiring, which no request can show: the handler must ask the new helper, and the boot must say
 * when the environment is the reason. Read from source, because a response cannot reveal which rule
 * produced its shape.
 */
/**
 * The boot rule: a server must state the environment it serves.
 *
 * `NODE_ENV` decides the production checks, the database and the error detail at once, so a value
 * the process cannot name is refused on EVERY host. The platform is deliberately not consulted
 * (an earlier version only refused on Render, which made the same mistake fatal on one host and
 * silent on another); `TEST_MODE` is the single exception, and only because the database resolver
 * already pins such a process to the test database.
 */
describe('a server that cannot name its environment refuses to start', () => {
  const signalTarget = { on: () => {}, listeners: () => [] };

  async function boot({ kind = 'development', testProcess = false, events = [] }) {
    const exits = [];
    const result = await startServer({
      nodeEnv: 'development',
      appInstance: express(),
      port: 0,
      validator: () => [],
      connectFn: async () => {
        events.push({ channel: 'event', message: 'db-connect' });
        return true;
      },
      // The posture is injected rather than read, so every case is deterministic under any
      // runner — including one that sets TEST_MODE for the whole process.
      environment: () => ({ kind, testProcess }),
      readiness: () => ({
        mail: true,
        mailProvider: 'brevo',
        firebase: true,
        emailVerification: true,
        ai: true,
        aiProvider: 'openrouter',
      }),
      exit: (code) => exits.push(code),
      logger: {
        log: (message) => events.push({ channel: 'log', message }),
        error: (message) => events.push({ channel: 'error', message }),
      },
      signalTarget,
      modelCheck: null,
      capabilities: null,
      healthWatch: null,
    });
    return { result, exits, events };
  }

  const close = (server) =>
    server ? new Promise((resolve) => (typeof server.close === 'function' ? server.close(resolve) : resolve())) : null;

  /** Boot, then close whatever started BEFORE asserting: a failed assertion must not leave a
   *  listening server behind, which is how this suite hung once and held the run open. */
  async function bootAndClose(options) {
    const booted = await boot(options);
    await close(booted.result?.server);
    return { ...booted, messages: booted.events.map((e) => e.message).join('\n') };
  }

  it('refuses to boot when nothing named the environment, before connecting to anything', async () => {
    const { result, exits, events, messages } = await bootAndClose({ kind: 'missing' });

    assert.deepEqual(exits, [1]);
    assert.equal(result, null);
    assert.match(messages, /NODE_ENV is not set/);
    assert.match(messages, /refusing to start/);
    // The consequence and the fix are named, because neither is obvious from the variable.
    assert.match(messages, /production configuration checks/);
    assert.match(messages, /NODE_ENV=production/);
    assert.match(messages, /Nothing was connected or served/);
    // The refusal happens before the database is touched, which is what makes it safe.
    assert.equal(events.some((e) => /listening on/.test(e.message)), false);
    assert.equal(events.some((e) => e.message === 'db-connect'), false, 'nothing was connected');
  });

  it('refuses a mistyped value too, and names the accepted ones without repeating it', async () => {
    const { result, exits, messages } = await bootAndClose({ kind: 'unrecognised' });

    assert.deepEqual(exits, [1]);
    assert.equal(result, null);
    assert.match(messages, /does not name one of development, test, production/);
    assert.doesNotMatch(messages, /is not set/, 'a typo is not a missing variable');
  });

  it('boots when the environment is recognised (control)', async () => {
    for (const kind of ['production', 'development', 'test']) {
      const { result, exits, messages } = await bootAndClose({ kind });

      assert.deepEqual(exits, [], kind);
      assert.ok(result, kind);
      assert.equal(/refusing to start/.test(messages), false, kind);
    }
  });

  it('boots a declared test process that has no NODE_ENV (control)', async () => {
    // TEST_MODE is accepted because `resolveDatabaseName` pins such a process to the test
    // database and refuses `NODE_ENV=production` alongside it — it cannot reach real data.
    const { result, exits } = await bootAndClose({ kind: 'missing', testProcess: true });

    assert.deepEqual(exits, []);
    assert.ok(result);
  });
});

describe('the fail-closed rule is the one wired in', () => {
  const handlerSource = readFileSync(new URL('../src/middlewares/errorHandler.ts', import.meta.url), 'utf8');
  const startupSource = readFileSync(new URL('../src/config/startup.ts', import.meta.url), 'utf8');

  it('the error handler no longer keys on "not production"', () => {
    assert.equal(
      /NODE_ENV\s*!==\s*['"]production['"]/.test(handlerSource),
      false,
      'the publish-unless-production rule is back in errorHandler',
    );
    assert.match(handlerSource, /isDebugNodeEnv\(\)/);
  });

  it('the server refuses an environment it cannot name, on every host', () => {
    assert.match(startupSource, /!isRecognisedNodeEnv\(stated\.kind\) && !stated\.testProcess/);
    assert.match(startupSource, /Nothing was connected or served/);
    // No platform marker decides this: the same mistake must be fatal everywhere.
    assert.equal(/RENDER|isDeployedHost/.test(startupSource), false, 'the boot consults the host');
  });

  it('the helper is the single definition, not a copy of the rule (control)', () => {
    // A second `=== 'development'` comparison in the handler would let the two drift.
    assert.equal(/['"]development['"]/.test(handlerSource), false);
  });
});
