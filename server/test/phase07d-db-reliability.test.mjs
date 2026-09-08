// Phase 07D — database operational reliability (H8) + readiness (M1) + safe
// DB-unavailable responses.
//
// Two parts:
//   * DB-independent tests that ALWAYS run: the centralized error mapping
//     (isDatabaseDownError / errorHandler) answers driver/buffering errors with
//     a fixed 503 and never leaks a connection string.
//   * DB-gated integration tests (fail loudly when MongoDB is unreachable —
//     Phase 07F / M9): real MongoDB reachable -> readiness 200;
//     after disconnecting, database requests answer a safe 503 and readiness
//     reports not-ready, while liveness stays 200.

import 'dotenv/config';

import { it, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';
import { createApp } from '../src/app.js';
import errorHandler from '../src/middlewares/errorHandler.js';
import { isDatabaseDownError } from '../src/config/db.js';
import ApiError from '../src/utils/ApiError.js';
import { signAccessToken } from '../src/config/jwt.js';

const dbOk = await ensureDb();

// ---------------------------------------------------------------------------
// Fake res for exercising the centralized error handler directly.
// ---------------------------------------------------------------------------
function fakeRes() {
  return {
    headersSent: false,
    statusCode: 0,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function dbError(name, message) {
  const err = new Error(message);
  err.name = name;
  return err;
}

// ---------------------------------------------------------------------------
// H8 — DB-unavailable request behavior (deterministic, no database needed)
// ---------------------------------------------------------------------------
unitSuite('H8 DB-unavailable error mapping (Phase 07D)', () => {
  // Built by concatenation so the SOURCE never contains a credential-shaped
  // literal that a repo secret scan would flag — this is a leak-detection
  // fixture, and the code under test must prove the value never reaches a reply.
  const CRED = 'password-marker-123';
  const LEAKY = 'mongodb' + '+srv://user:' + CRED + '@cluster.example/db?retryWrites=true';

  it('classifies driver/buffering "database down" errors by shape', () => {
    assert.equal(isDatabaseDownError(dbError('MongoServerSelectionError', LEAKY)), true);
    assert.equal(isDatabaseDownError(dbError('MongoNetworkError', 'connect ECONNREFUSED')), true);
    assert.equal(
      isDatabaseDownError(dbError('MongooseError', 'Operation `users.findOne()` buffering timed out after 1500ms')),
      true
    );
    assert.equal(isDatabaseDownError(dbError('MongooseError', 'buffering timed out')), true);
  });

  it('does not classify unrelated errors as database-down', () => {
    assert.equal(isDatabaseDownError(new ApiError(404, 'Product not found')), false);
    assert.equal(isDatabaseDownError(new Error('boom')), false);
    // A duplicate-key Mongo error is a data error, not an availability error.
    const dup = dbError('MongoServerError', 'duplicate key');
    dup.code = 11000;
    assert.equal(isDatabaseDownError(dup), false);
  });

  it('answers a database-down error with a fixed 503 and never leaks the connection string', () => {
    const res = fakeRes();
    const next = () => assert.fail('must not fall through to next');
    errorHandler(dbError('MongoServerSelectionError', LEAKY), {}, res, next);

    assert.equal(res.statusCode, 503);
    assert.deepEqual(Object.keys(res.body).sort(), ['code', 'error']);
    assert.equal(res.body.code, 'DB_UNAVAILABLE');
    assert.equal(res.body.error, 'Service temporarily unavailable');
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes(CRED), 'credentials never reach the client');
    assert.ok(!text.includes('mongodb'), 'no connection string reaches the client');
    assert.ok(!text.includes('at '), 'no stack trace reaches the client');
  });

  it('still maps a buffering-timeout error (the DB-down path a route sees) to 503', () => {
    const res = fakeRes();
    errorHandler(dbError('MongooseError', 'Operation `products.findOne()` buffering timed out after 1500ms'), {}, res, () => {});
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'DB_UNAVAILABLE');
  });

  it('leaves ordinary 4xx errors untouched', () => {
    const res = fakeRes();
    errorHandler(new ApiError(400, 'Validation failed', 'VALIDATION_ERROR'), {}, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('leaves a generic server error as 500 (not mislabeled as DB_UNAVAILABLE)', () => {
    const res = fakeRes();
    errorHandler(new Error('some application bug'), {}, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.notEqual(res.body.code, 'DB_UNAVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// Phase 07G — 5xx server logs identify the request they belong to, so a
// production error is traceable to a call. The log line is captured (never the
// response body) and must carry method + path + user, without crashing when no
// request object exists.
// ---------------------------------------------------------------------------
unitSuite('error-log request context (Phase 07G)', () => {
  /** Capture console.error for one errorHandler call; returns the log line. */
  function logLineFor(req) {
    const spy = mock.method(console, 'error', () => {});
    try {
      const res = fakeRes();
      errorHandler(new Error('simulated failure'), req, res, () => {});
      return String(spy.mock.calls[0]?.arguments?.[0] || '');
    } finally {
      spy.mock.restore();
    }
  }

  it('includes method, path and user on the 5xx server log line', () => {
    const line = logLineFor({
      method: 'POST',
      path: '/api/inventory/stock-out',
      user: { id: 'u-abc' },
    });
    assert.ok(line.includes('POST /api/inventory/stock-out'), `log should identify the request: ${line}`);
    assert.ok(line.includes('user u-abc'), `log should include the actor: ${line}`);
    assert.ok(line.includes('simulated failure'), 'the error message is still logged');
  });

  it('still logs a 5xx cleanly when no request object is available', () => {
    const line = logLineFor({});
    assert.ok(line.includes('unknown request'), `falls back to a stable label: ${line}`);
    assert.ok(line.includes('simulated failure'));
  });
});

// ---------------------------------------------------------------------------
// M1 + H8 — real readiness and DB-down behavior over the shipped app.
// The final test deliberately disconnects MongoDB and must run LAST in the
// file: nothing after it may use the database.
// ---------------------------------------------------------------------------
dbSuite('H8 readiness + DB-unavailable over the real app (Phase 07D)', dbOk, () => {
  let server;
  let baseUrl;

  async function startApp() {
    const app = createApp();
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  const get = (path, token) =>
    fetch(`${baseUrl}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

  it('readiness is 200 (db connected) while MongoDB is reachable; live stays 200', async () => {
    await startApp();
    try {
      const ready = await get('/api/health/ready');
      assert.equal(ready.status, 200);
      assert.equal(ready.json.status, 'ready');
      assert.equal(ready.json.db, 'connected');

      const live = await get('/api/health/live');
      assert.equal(live.status, 200);

      const legacy = await get('/api/health');
      assert.equal(legacy.status, 200);
      assert.equal(legacy.json.status, 'ok');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('while MongoDB is down: protected requests return a fixed 503 and readiness is 503, liveness 200', async () => {
    await startApp();
    try {
      const token = signAccessToken(new mongoose.Types.ObjectId()); // no such user

      // Sanity: with the DB up, an unknown user is a clean 401 (not a DB error).
      const before = await get('/api/auth/me', token);
      assert.equal(before.status, 401, 'precondition: DB up + unknown user -> 401');

      // Take MongoDB down (graceful, like the app would on shutdown).
      await disconnectDb();

      // A route that needs the database must answer a SAFE 503 — the buffering /
      // driver error is mapped centrally; no stack, no connection string.
      const down = await get('/api/auth/me', token);
      assert.equal(down.status, 503);
      assert.equal(down.json.code, 'DB_UNAVAILABLE');
      assert.equal(down.json.error, 'Service temporarily unavailable');
      const text = JSON.stringify(down.json);
      assert.ok(!text.includes('mongodb'), 'no connection string');
      assert.ok(!text.includes('at '), 'no stack trace');

      // Readiness agrees MongoDB is not ready.
      const ready = await get('/api/health/ready');
      assert.equal(ready.status, 503);
      assert.equal(ready.json.status, 'not ready');

      // Liveness is process-level and must survive the DB going away.
      const live = await get('/api/health/live');
      assert.equal(live.status, 200);
      assert.equal(live.json.status, 'live');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

after(async () => {
  await disconnectDb();
});
