/**
 * The port-ownership guard — written from the trap, not from the idea.
 *
 * WHY THIS EXISTS. On 2026-10-17 four `node src/index.ts` processes were alive on this laptop, three of them from
 * earlier sessions, and the one that owned `:4000` was **not** the one just started. Windows let the new bind
 * succeed: it printed `[server] environment=development listening on http://localhost:4000` exactly as a healthy
 * one does, `/api/health/ready` answered `{"status":"ready"}` from the OLD process, and every request kept being
 * served there. The consequence was not tidiness — an `OPENROUTER_BASE_URL` override pointed at a local stub
 * looked like it had been ignored, two turns reached the deployed free tier instead of the stub, and four
 * provider requests were spent producing two unusable answers (§27CW). A readiness probe and a startup banner
 * both identify *a* server; neither identifies *which*.
 *
 * WHAT IT MEASURES. Every response this process sends carries a per-boot instance id, and a boot verifies that
 * the port it just bound answers with **its own** id. Three outcomes, deliberately distinct:
 *
 *   * **same id** → the port is ours. Silent.
 *   * **different id** → ANOTHER Inventory AI server is answering. This is the measured trap, it is unambiguous,
 *     and the boot fails loudly (exit 1) because a process that is listening but not serving is worse than one
 *     that refused to start.
 *   * **unreachable, or a response with no id at all** → inconclusive. It is logged and startup CONTINUES: a
 *     loopback probe can fail for reasons that are not the trap (a slow host, a server built without the
 *     middleware, a test's bare Express app), and a guard that refuses to boot on an inconclusive probe would
 *     break real deployments to catch a hypothetical one.
 *
 * THE PROBE IS PART OF THE CONTRACT, not an implementation detail: a real loopback HTTP server is used in the
 * cases below so the fetch path, the header read and the closed-port failure are exercised for real, and the
 * `startServer` cases inject a probe so the wiring (and the skip for a server without a bound address) is pinned
 * without any network at all.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';

import { INSTANCE_ID, INSTANCE_ID_HEADER } from '../src/config/instanceIdentity.ts';
import { probePortOwnership, verifyPortOwnership, verifyBoundPort } from '../src/config/portGuard.ts';
import { startServer } from '../src/config/startup.ts';

/** A loopback server answering `/api/health`, optionally identifying itself. */
async function identityServer(id) {
  const server = http.createServer((_req, res) => {
    if (id) res.setHeader(INSTANCE_ID_HEADER, id);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** A logger that records both channels separately, so "warned" and "failed" cannot be confused. */
function captureLogger() {
  const logs = [];
  const errors = [];
  return { logs, errors, log: (m) => logs.push(String(m)), error: (m) => errors.push(String(m)) };
}

function captureExit() {
  const codes = [];
  return { codes, exit: (code) => codes.push(code) };
}

/**
 * A minimal server-shaped object: enough for startServer + the shutdown wiring, with no real socket.
 *
 * `close(cb)` MUST call the callback: the shutdown handler resolves its drain from it, and a fake that silently
 * swallows it leaves the returned promise pending for ever (which is how the first draft of this suite hung).
 */
function fakeListenServer({ address } = {}) {
  return {
    listening: true,
    close(callback) {
      if (typeof callback === 'function') callback();
    },
    closeIdleConnections() {},
    once() {},
    removeListener() {},
    on() {},
    ...(address ? { address } : {}),
  };
}

/**
 * A server that can actually EMIT — the error handler below is attached with `on('error')`, so a fake whose `on`
 * is a no-op can never exercise it. EventEmitter supplies on/once/removeListener; the rest is server-shaped.
 */
function eventfulServer({ address } = {}) {
  const server = new EventEmitter();
  server.listening = true;
  server.close = (callback) => {
    if (typeof callback === 'function') callback();
  };
  server.closeIdleConnections = () => {};
  if (address) server.address = address;
  return server;
}

const QUIET_REPORT = {
  mail: false,
  mailProvider: null,
  firebase: false,
  emailVerification: false,
  ai: false,
  aiProvider: null,
};

describe('the port-ownership guard (2026-10-18)', () => {
  it('the identity is this process\u2019s own, and the header name is the one the probe reads', () => {
    assert.equal(INSTANCE_ID_HEADER, 'x-instance-id');
    assert.equal(typeof INSTANCE_ID, 'string');
    assert.ok(INSTANCE_ID.length >= 16, 'an id that could collide by accident is not an identity');
    assert.notEqual(INSTANCE_ID, 'unknown');
  });

  it('the real probe reads the identity off a live loopback server', async () => {
    const { server, port } = await identityServer('another-process-id');
    try {
      const result = await probePortOwnership(port);
      assert.deepEqual(result, { reachable: true, instanceId: 'another-process-id' });
    } finally {
      await closeServer(server);
    }
  });

  it('the real probe reports a response with no identity as unknown rather than as ours', async () => {
    const { server, port } = await identityServer(null);
    try {
      const result = await probePortOwnership(port);
      assert.deepEqual(result, { reachable: true, instanceId: null });
    } finally {
      await closeServer(server);
    }
  });

  it('the real probe reports an unreachable port instead of throwing', async () => {
    // A port nothing listens on: bind one, close it, keep the number.
    const { server, port } = await identityServer('x');
    await closeServer(server);
    const result = await probePortOwnership(port, { timeoutMs: 500 });
    assert.equal(result.reachable, false);
    assert.equal(result.instanceId, null);
  });

  it('\u2605 a port answered by ANOTHER instance fails the boot loudly', async () => {
    const logger = captureLogger();
    const { codes, exit } = captureExit();
    const result = await verifyPortOwnership({
      port: 4000,
      probe: async () => ({ reachable: true, instanceId: 'some-other-server' }),
      logger,
      exit,
      instanceId: 'mine',
    });

    assert.deepEqual(result, { ok: false, verified: false });
    assert.deepEqual(codes, [1], 'a process that is listening but not serving must not stay up');
    assert.equal(logger.errors.length, 1, 'exactly one fatal line');
    const line = logger.errors[0];
    assert.match(line, /port 4000/);
    assert.match(line, /NOT serving/);
    assert.match(line, /some-other-server/, 'the answering identity is worth printing');
    assert.match(line, /netstat/, 'and so is how to find the owner');
  });

  it('\u2605 the SAME identity verifies quietly — no exit, no line', async () => {
    const logger = captureLogger();
    const { codes, exit } = captureExit();
    const result = await verifyPortOwnership({
      port: 4000,
      probe: async () => ({ reachable: true, instanceId: INSTANCE_ID }),
      logger,
      exit,
    });

    assert.deepEqual(result, { ok: true, verified: true });
    assert.deepEqual(codes, []);
    assert.deepEqual(logger.errors, []);
    assert.deepEqual(logger.logs, []);
  });

  it('an inconclusive probe warns and CONTINUES — the guard never refuses a boot it cannot decide', async () => {
    for (const probe of [
      async () => ({ reachable: false, instanceId: null }),
      async () => ({ reachable: true, instanceId: null }),
    ]) {
      const logger = captureLogger();
      const { codes, exit } = captureExit();
      const result = await verifyPortOwnership({ port: 4321, probe, logger, exit });

      assert.deepEqual(result, { ok: true, verified: false });
      assert.deepEqual(codes, [], 'inconclusive is not the measured trap and must not stop a deployment');
      assert.equal(logger.errors.length, 1);
      assert.match(logger.errors[0], /port 4321/);
    }
  });

  it('the bound-port reader skips a server that has no address yet, without probing', async () => {
    let probes = 0;
    const result = await verifyBoundPort({
      server: fakeListenServer(),
      probe: async () => {
        probes += 1;
        return { reachable: true, instanceId: 'nope' };
      },
      logger: captureLogger(),
      exit: () => {},
    });

    assert.equal(probes, 0, 'no socket, no probe');
    assert.deepEqual(result, { ok: true, verified: false, skipped: true });
  });

  it('the bound-port reader probes the port the server actually bound (an ephemeral 0 is read back)', async () => {
    const probed = [];
    const result = await verifyBoundPort({
      server: fakeListenServer({ address: () => ({ port: 54321 }) }),
      probe: async (port) => {
        probed.push(port);
        return { reachable: true, instanceId: INSTANCE_ID };
      },
      logger: captureLogger(),
      exit: () => {},
    });

    assert.deepEqual(probed, [54321]);
    assert.deepEqual(result, { ok: true, verified: true });
  });

  it('\u2605 startServer runs the guard against the bound port, and a foreign answer exits non-zero', async () => {
    const logger = captureLogger();
    const { codes, exit } = captureExit();
    const probed = [];

    const result = await startServer({
      appInstance: {
        listen(_port, callback) {
          callback();
          return fakeListenServer({ address: () => ({ port: 45999 }) });
        },
      },
      nodeEnv: 'development',
      port: 0,
      connectFn: async () => true,
      validator: () => [],
      readiness: () => QUIET_REPORT,
      probe: async (port) => {
        probed.push(port);
        return { reachable: true, instanceId: 'the-stale-one' };
      },
      logger,
      exit,
      signalTarget: new EventEmitter(),
    });

    assert.ok(result, 'the dev server still returns its handles');
    await new Promise((resolve) => setImmediate(resolve)); // the guard is fired unawaited, like the boot is

    assert.deepEqual(probed, [45999], 'the guard probes the BOUND port, not the requested one');
    assert.deepEqual(codes, [1], 'the stale-server trap is fatal');
    assert.ok(logger.errors.some((m) => /NOT serving/.test(m)), 'and says so');
    await result.shutdown('TEST');
  });

  it('\u2605 EADDRINUSE arriving AFTER the listening callback is still fatal', async () => {
    // Measured on this host 2026-10-18: the second boot printed `listening on http://localhost:4011 instance=521c…`
    // — its listening callback really fired — and the EADDRINUSE error arrived afterwards. Treating "already
    // listening" as proof of serving left that process up for 30 s with no working listener, which is the exact
    // trap this guard exists to prevent. A port that cannot be taken is never a normal runtime event.
    const logger = captureLogger();
    const { codes, exit } = captureExit();
    let emitted;

    const result = await startServer({
      appInstance: {
        listen(_port, callback) {
          callback();
          emitted = eventfulServer({ address: () => ({ port: 45997 }) });
          return emitted;
        },
      },
      nodeEnv: 'development',
      port: 4011,
      connectFn: async () => true,
      validator: () => [],
      readiness: () => QUIET_REPORT,
      probe: async () => ({ reachable: true, instanceId: INSTANCE_ID }),
      logger,
      exit,
      signalTarget: new EventEmitter(),
    });

    assert.deepEqual(codes, [], 'nothing has failed yet');
    emitted.emit('error', Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }));

    assert.deepEqual(codes, [1], 'a port that cannot be taken must not leave a zombie');
    assert.ok(
      logger.errors.some((m) => /port 4011 is already in use/.test(m) && /netstat/.test(m)),
      'and must name the port and how to find the owner'
    );
    await result.shutdown('TEST');
  });

  it('an error AFTER listening that is NOT EADDRINUSE is logged, and the serving process keeps running', async () => {
    const logger = captureLogger();
    const { codes, exit } = captureExit();
    let emitted;

    const result = await startServer({
      appInstance: {
        listen(_port, callback) {
          callback();
          emitted = eventfulServer({ address: () => ({ port: 45996 }) });
          return emitted;
        },
      },
      nodeEnv: 'development',
      port: 4012,
      connectFn: async () => true,
      validator: () => [],
      readiness: () => QUIET_REPORT,
      probe: async () => ({ reachable: true, instanceId: INSTANCE_ID }),
      logger,
      exit,
      signalTarget: new EventEmitter(),
    });

    emitted.emit('error', Object.assign(new Error('socket hiccup'), { code: 'ECONNRESET' }));

    assert.deepEqual(codes, [], 'a serving process is not killed over a stray socket error');
    assert.ok(logger.errors.some((m) => /ECONNRESET/.test(m)), 'but it is said out loud');
    await result.shutdown('TEST');
  });

  it('startServer does not probe when the server exposes no bound address', async () => {
    let probes = 0;
    const result = await startServer({
      appInstance: {
        listen(_port, callback) {
          callback();
          return fakeListenServer();
        },
      },
      nodeEnv: 'development',
      port: 0,
      connectFn: async () => true,
      validator: () => [],
      readiness: () => QUIET_REPORT,
      probe: async () => {
        probes += 1;
        return { reachable: true, instanceId: 'x' };
      },
      logger: captureLogger(),
      exit: () => {},
      signalTarget: new EventEmitter(),
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(probes, 0);
    await result.shutdown('TEST');
  });
});
