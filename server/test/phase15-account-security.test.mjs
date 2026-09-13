// Phase 15 — Account Security & Profile Management.
//
// DB-backed suite over the real HTTP app. Exercises the two self-service
// endpoints added in this phase:
//
//   POST /api/auth/change-password — verifies the current password, replaces
//     the hash, and stamps User.passwordChangedAt = now. requireAuth then
//     rejects every JWT issued before that moment (401 SESSION_INVALIDATED) by
//     comparing the token's iat (integer Unix seconds, jsonwebtoken floors at
//     sign) with the floor-second of passwordChangedAt — strict `<`, so a
//     token minted in the same second as the change (the fresh post-change
//     login) stays valid while strictly older-second tokens are revoked.
//
//   PATCH /api/auth/me — updates ONLY the caller's name; identity comes
//     exclusively from the authenticated session; every other field (email,
//     role, status, businessId, password, passwordHash, …) is rejected with an
//     explicit 400 VALIDATION_ERROR entry, never silently ignored.
//
// The tests prove the full invalidation lifecycle (old JWT dead, old password
// dead, new password + new JWT work), the deterministic second-granularity
// boundary (iat < changedAtSec rejected; iat === changedAtSec and iat >
// changedAtSec valid), wrong-current-password safety, and the strict /me
// whitelist. Registered as MIXED in run-tests.mjs.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  uniqueName,
  uniqueEmail,
  disconnectDb,
} from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import { verifyAccessToken } from '../src/config/jwt.js';
import User from '../src/models/user.model.ts';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'NewPassword456!';

/** Create a STAFF user over the API (owner acts). Returns the public shape. */
async function createStaff(main) {
  const res = await api('POST', '/api/users', {
    token: main.token,
    body: { name: uniqueName('U15'), email: uniqueEmail('u15'), password: PASSWORD, role: 'STAFF' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  tracker.trackUser(res.json.id);
  return res.json;
}

async function login(email, password) {
  return api('POST', '/api/auth/login', { body: { email, password } });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let main; // fixture business (OWNER), used to create the dedicated users below
let flow; // { user, newToken } after the invalidation lifecycle test

dbSuite('Phase 15 — account security & profile over real HTTP', dbOk, () => {
  before(async () => {
    main = await registerOwner(api, tracker);
  });

  after(async () => {
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  it('requires authentication for change-password and PATCH /me', async () => {
    const change = await api('POST', '/api/auth/change-password', {
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    assert.equal(change.status, 401, JSON.stringify(change.json));
    assert.equal(change.json.code, 'AUTH_REQUIRED');

    const patch = await api('PATCH', '/api/auth/me', { body: { name: 'X' } });
    assert.equal(patch.status, 401, JSON.stringify(patch.json));
    assert.equal(patch.json.code, 'AUTH_REQUIRED');
  });

  it('validates the change-password payload (400 VALIDATION_ERROR)', async () => {
    const user = await createStaff(main);
    const loginRes = await login(user.email, PASSWORD);
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.json));
    const token = loginRes.json.token;

    const cases = [
      { body: {}, fields: ['currentPassword', 'newPassword'] },
      { body: { currentPassword: '' }, fields: ['currentPassword'] },
      { body: { currentPassword: PASSWORD }, fields: ['newPassword'] }, // missing new
      { body: { currentPassword: PASSWORD, newPassword: 'short' }, fields: ['newPassword'] },
    ];
    for (const c of cases) {
      const res = await api('POST', '/api/auth/change-password', { token, body: c.body });
      assert.equal(res.status, 400, `body=${JSON.stringify(c.body)}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
      for (const f of c.fields) {
        assert.ok(
          res.json.fields.some((p) => p.field === f),
          `expected a field problem for '${f}' (got ${JSON.stringify(res.json.fields)})`
        );
      }
    }
  });

  it('rejects a wrong current password (400 INVALID_CURRENT_PASSWORD) and changes nothing', async () => {
    const user = await createStaff(main);
    const loginRes = await login(user.email, PASSWORD);
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.json));
    const token = loginRes.json.token;

    const wrong = await api('POST', '/api/auth/change-password', {
      token,
      body: { currentPassword: 'DefinitelyWrong!', newPassword: NEW_PASSWORD },
    });
    assert.equal(wrong.status, 400, JSON.stringify(wrong.json));
    assert.equal(wrong.json.code, 'INVALID_CURRENT_PASSWORD');

    // Nothing changed: the old password still logs in and the token still works.
    const still = await login(user.email, PASSWORD);
    assert.equal(still.status, 200, JSON.stringify(still.json));
    const me = await api('GET', '/api/auth/me', { token });
    assert.equal(me.status, 200, JSON.stringify(me.json));
    assert.equal(me.json.user.id, user.id);
  });

  it('invalidates the old JWT and the old password on change; the new login works', async () => {
    const user = await createStaff(main);

    // 1. Login and capture the old JWT.
    const oldLogin = await login(user.email, PASSWORD);
    assert.equal(oldLogin.status, 200, JSON.stringify(oldLogin.json));
    const oldToken = oldLogin.json.token;

    // Ensure the old token was issued in a strictly earlier second than the
    // change below, so its iat < changedAtSec is deterministic (no same-second
    // ambiguity in this lifecycle assertion).
    await delay(1100);

    // 2. Change the password successfully with the old token.
    const change = await api('POST', '/api/auth/change-password', {
      token: oldToken,
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    assert.equal(change.status, 200, JSON.stringify(change.json));
    assert.equal(change.json.message, 'Password changed. Please sign in again.');

    // The stored hash is now bcrypt of the NEW password and passwordChangedAt
    // is stamped.
    const dbUser = await User.findById(user.id).select('+passwordHash');
    assert.ok(dbUser.passwordChangedAt instanceof Date, 'passwordChangedAt is set');
    assert.ok(await bcrypt.compare(NEW_PASSWORD, dbUser.passwordHash), 'stored hash matches new password');
    assert.ok(!(await bcrypt.compare(PASSWORD, dbUser.passwordHash)), 'old password no longer matches');

    // 3. The old JWT is rejected with the session-invalidated error — on /me
    //    and, crucially, before any role gate on a business endpoint.
    const oldMe = await api('GET', '/api/auth/me', { token: oldToken });
    assert.equal(oldMe.status, 401, JSON.stringify(oldMe.json));
    assert.equal(oldMe.json.code, 'SESSION_INVALIDATED');

    const oldUsers = await api('GET', '/api/users', { token: oldToken });
    assert.equal(oldUsers.status, 401, JSON.stringify(oldUsers.json));
    assert.equal(oldUsers.json.code, 'SESSION_INVALIDATED');

    // 4. The old password no longer logs in.
    const oldPw = await login(user.email, PASSWORD);
    assert.equal(oldPw.status, 401, JSON.stringify(oldPw.json));
    assert.equal(oldPw.json.code, 'INVALID_CREDENTIALS');

    // 5. The new password logs in and the fresh JWT works normally.
    const newLogin = await login(user.email, NEW_PASSWORD);
    assert.equal(newLogin.status, 200, JSON.stringify(newLogin.json));
    const newToken = newLogin.json.token;

    const newMe = await api('GET', '/api/auth/me', { token: newToken });
    assert.equal(newMe.status, 200, JSON.stringify(newMe.json));
    assert.equal(newMe.json.user.id, user.id);
    assert.equal(newMe.json.user.email, user.email);

    // The fresh token passes requireAuth on a business endpoint (STAFF is then
    // correctly denied by the role gate with 403 — proving the middleware let
    // it through, rather than a 401 session rejection).
    const newUsers = await api('GET', '/api/users', { token: newToken });
    assert.equal(newUsers.status, 403, JSON.stringify(newUsers.json));
    assert.equal(newUsers.json.code, 'FORBIDDEN');

    flow = { user, newToken };
  });

  it('second-granularity boundary: only strictly older-second tokens are revoked', async () => {
    // Uses the post-change token from the lifecycle test above: a REAL token
    // issued by logging in with the new password, whose iat is at or after the
    // change second. We then pin passwordChangedAt directly in the DB at the
    // three boundary positions and check requireAuth's verdict — deterministic
    // (no wall-clock waits) and an exact proof of the same-second guarantee.
    assert.ok(flow, 'lifecycle test must have run first');
    const { user, newToken } = flow;
    const { iat } = verifyAccessToken(newToken);
    assert.ok(Number.isInteger(iat), 'iat is an integer Unix second');

    const setChangedAt = (ms) =>
      User.updateOne({ _id: user.id }, { passwordChangedAt: ms === null ? null : new Date(ms) });

    try {
      // changedAtSec > iat → token issued BEFORE the change → revoked.
      await setChangedAt((iat + 10) * 1000);
      const before = await api('GET', '/api/auth/me', { token: newToken });
      assert.equal(before.status, 401, JSON.stringify(before.json));
      assert.equal(before.json.code, 'SESSION_INVALIDATED');

      // changedAtSec === iat → SAME second as the change → the new-token
      // guarantee: never revoked. (This is the case the ms-precision
      // alternative would get wrong.)
      await setChangedAt(iat * 1000);
      const same = await api('GET', '/api/auth/me', { token: newToken });
      assert.equal(same.status, 200, JSON.stringify(same.json));

      // changedAtSec < iat → token issued AFTER the change → valid.
      await setChangedAt((iat - 10) * 1000);
      const after = await api('GET', '/api/auth/me', { token: newToken });
      assert.equal(after.status, 200, JSON.stringify(after.json));
    } finally {
      // Restore the safe default so nothing downstream sees a pinned field.
      await setChangedAt(null);
    }
  });

  it('PATCH /api/auth/me updates only the caller name', async () => {
    const user = await createStaff(main);
    const loginRes = await login(user.email, PASSWORD);
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.json));
    const token = loginRes.json.token;

    const res = await api('PATCH', '/api/auth/me', {
      token,
      body: { name: 'Renamed Staff' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.user.name, 'Renamed Staff');
    assert.equal(res.json.user.email, user.email, 'email untouched');
    assert.equal(res.json.user.role, 'STAFF', 'role untouched');
    assert.equal(res.json.user.status, 'ACTIVE', 'status untouched');

    // Persisted, and the current token keeps working (name change is not a
    // session event).
    const me = await api('GET', '/api/auth/me', { token });
    assert.equal(me.status, 200, JSON.stringify(me.json));
    assert.equal(me.json.user.name, 'Renamed Staff');

    const dbUser = await User.findById(user.id);
    assert.equal(dbUser.name, 'Renamed Staff');
  });

  it('PATCH /api/auth/me rejects every non-name field and empty bodies', async () => {
    const user = await createStaff(main);
    const loginRes = await login(user.email, PASSWORD);
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.json));
    const token = loginRes.json.token;

    const rejected = ['email', 'role', 'status', 'businessId', 'password', 'passwordHash', 'unknownField'];
    for (const field of rejected) {
      const res = await api('PATCH', '/api/auth/me', {
        token,
        body: { name: 'Still Fine', [field]: 'anything' },
      });
      assert.equal(res.status, 400, `field=${field}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
      assert.ok(
        res.json.fields.some((p) => p.field === field),
        `expected an explicit rejection for '${field}' (got ${JSON.stringify(res.json.fields)})`
      );
    }

    // Empty body → 400 naming name as required.
    const empty = await api('PATCH', '/api/auth/me', { token, body: {} });
    assert.equal(empty.status, 400, JSON.stringify(empty.json));
    assert.equal(empty.json.code, 'VALIDATION_ERROR');
    assert.ok(empty.json.fields.some((p) => p.field === 'name'));

    // Name is still the ORIGINAL (nothing above was applied).
    const me = await api('GET', '/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.name, user.name);
  });
});
