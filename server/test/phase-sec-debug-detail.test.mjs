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
 * WHAT THESE DO NOT PROVE: that a particular deployed host sets the variable. That is what the boot
 * warning is for (`nodeEnvWarning`), and it is verified by reading the boot line, not here.
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
  isDeployedHost,
  KNOWN_NODE_ENVS,
  nodeEnvWarning,
} from '../src/config/env.ts';
import { deploymentNotes } from '../src/config/deploymentReadiness.ts';
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
      assert.match(nodeEnvWarning(), /NODE_ENV is not set/);
    } finally {
      if (saved !== undefined) process.env.NODE_ENV = saved;
    }
  });

  it('names the recognised values, so the warning and the switch cannot drift', () => {
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

  it('never repeats a mistyped value back into a report', () => {
    const typo = 'prod-db-please-fix';
    assert.equal(nodeEnvWarning(typo).includes(typo), false);
  });

  it('recognises a host that identifies itself, and nothing else', () => {
    assert.equal(isDeployedHost({ RENDER: 'true' }), true);
    assert.equal(isDeployedHost({ RENDER_GIT_COMMIT: 'abc1234' }), true);
    assert.equal(isDeployedHost({ RENDER: '' }), false);
    assert.equal(isDeployedHost({ HOME: '/root' }), false);
    assert.equal(isDeployedHost({}), false);
  });

  it('warns when the value is missing or unrecognised, and stays quiet when it is right', () => {
    // An empty value is what an unset variable looks like once it has been through `.env`.
    assert.match(nodeEnvWarning(''), /NODE_ENV is not set/);
    assert.match(nodeEnvWarning('Production'), /does not name one of/);
    assert.match(nodeEnvWarning('staging'), /does not name one of/);
    // The consequences are named, because they are neither local nor obvious.
    assert.match(nodeEnvWarning('prod'), /treats? as DEVELOPMENT|treated as DEVELOPMENT/i);
    assert.match(nodeEnvWarning('prod'), /production configuration checks/i);
    assert.match(nodeEnvWarning('prod'), /development database/i);

    assert.equal(nodeEnvWarning('development'), null);
    assert.equal(nodeEnvWarning('test'), null);
    assert.equal(nodeEnvWarning('production'), null);
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
 * The environment as a READINESS fact, and the boot decision that follows from it.
 *
 * Task-level reasoning: a host that identifies itself and cannot name its environment is
 * refusing to serve production traffic out of the development database with the production
 * checks switched off, so the boot is refused. A developer's machine (or a CI boot, or a
 * platform this code has never heard of) gets the same fact as a warning and keeps working.
 */
const report = (nodeEnv) => ({
  mail: true,
  mailProvider: 'brevo',
  firebase: true,
  emailVerification: true,
  ai: true,
  aiProvider: 'openrouter',
  ...(nodeEnv === 'absent' ? {} : { nodeEnv }),
});

describe('the deployment readiness report names the environment fault', () => {
  it('says NOT SET when nothing set it, and does not call it invalid', () => {
    const notes = deploymentNotes(report('missing'));

    assert.equal(notes.length, 1, notes.join('; '));
    assert.match(notes[0], /NODE_ENV is NOT SET/);
    assert.match(notes[0], /development database is selected/);
    assert.match(notes[0], /Set NODE_ENV=production/);
    // The distinction the request asked for: a missing variable is not a typo.
    assert.doesNotMatch(notes[0], /does not name one of/);
  });

  it('says UNRECOGNISED when a value is wrong, and never repeats it', () => {
    const notes = deploymentNotes(report('unrecognised'));

    assert.equal(notes.length, 1, notes.join('; '));
    assert.match(notes[0], /does not name one of development, test or production/);
    assert.doesNotMatch(notes[0], /is NOT SET/);
  });

  it('stays silent for a recognised environment (control)', () => {
    for (const kind of ['production', 'development', 'test']) {
      assert.deepEqual(deploymentNotes(report(kind)), [], kind);
    }
    // And for a report that never asked the question, which is every hand-built report in the
    // suites that predate this field.
    assert.deepEqual(deploymentNotes(report('absent')), []);
  });
});

describe('a host that identifies itself refuses a NODE_ENV it cannot name', () => {
  const signalTarget = { on: () => {}, listeners: () => [] };

  async function boot({ deployedHost, events = [] }) {
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
      // The report reflects the environment under test, because the environment diagnostic is
      // the report's job off a deployment — the boot deliberately adds no second line.
      readiness: () => report(classifyNodeEnv()),
      exit: (code) => exits.push(code),
      logger: {
        log: (message) => events.push({ channel: 'log', message }),
        error: (message) => events.push({ channel: 'error', message }),
      },
      signalTarget,
      deployedHost,
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

  it('refuses to boot on a missing NODE_ENV, before connecting to anything', async () => {
    await withNodeEnv(undefined, async () => {
      const { result, exits, events, messages } = await bootAndClose({ deployedHost: true });

      assert.deepEqual(exits, [1]);
      assert.equal(result, null);
      // One explanation (the readiness note) and one decision (the refusal).
      assert.match(messages, /NODE_ENV is NOT SET/);
      assert.match(messages, /refusing to start/);
      assert.match(messages, /Nothing was connected or served/);
      // The refusal happens before the database is touched, which is what makes it safe.
      assert.equal(events.some((e) => /listening on/.test(e.message)), false);
      assert.equal(events.some((e) => e.message === 'db-connect'), false, 'nothing was connected');
    });
  });

  it('refuses to boot on a mistyped NODE_ENV too', async () => {
    await withNodeEnv('prod', async () => {
      const { result, exits, messages } = await bootAndClose({ deployedHost: true });

      assert.deepEqual(exits, [1]);
      assert.equal(result, null);
      assert.match(messages, /refusing to start/);
      assert.match(messages, /does not name one of/);
    });
  });

  it('only WARNS off a deployment — a developer machine must keep working (control)', async () => {
    await withNodeEnv('prod', async () => {
      const { result, exits, messages } = await bootAndClose({ deployedHost: false });

      assert.deepEqual(exits, []);
      assert.ok(result, 'the server must still start off a deployment');
      // The readiness note is the diagnostic off a deployment; there is no second line saying it.
      assert.match(messages, /NODE_ENV does not name one of/);
      assert.equal(/refusing to start/.test(messages), false);
    });
  });

  it('boots normally when the environment is recognised (control)', async () => {
    await withNodeEnv('production', async () => {
      const { result, exits, messages } = await bootAndClose({ deployedHost: true });

      assert.deepEqual(exits, []);
      assert.ok(result);
      assert.equal(/NODE_ENV/.test(messages), false, 'nothing to say about a correct environment');
    });
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

  it('the server refuses a NODE_ENV it cannot name on a self-identifying host', () => {
    assert.match(startupSource, /nodeEnvWarning\(process\.env\.NODE_ENV\)/);
    assert.match(startupSource, /envWarning && deployedHost/);
    // And the report is what speaks off a deployment, rather than a second line repeating it.
    assert.equal(/warning: \$\{envWarning\}/.test(startupSource), false);
  });

  it('the helper is the single definition, not a copy of the rule (control)', () => {
    // A second `=== 'development'` comparison in the handler would let the two drift.
    assert.equal(/['"]development['"]/.test(handlerSource), false);
  });
});
