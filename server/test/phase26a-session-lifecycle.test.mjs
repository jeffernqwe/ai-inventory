// Phase 26A — Session hardening & real logout.
//
// Before this phase a JWT was the whole session: possession of the token was
// the only requirement, sign-out was a client-side gesture that deleted a local
// copy while the token stayed valid until it expired, and a lost or stolen
// device could not be cut off without changing the password (which ends every
// session at once) or disabling the user entirely.
//
// The phase makes the token a *reference* to a server-side session:
//
//   login  -> sessions row { userId, jti, deviceLabel, expiresAt } + a JWT whose
//             `jti` names that row
//   request-> requireAuth verifies the signature, then requires a row that
//             exists, is not revoked, has not expired, and belongs to the token's
//             subject
//   logout -> the row is revoked, so every token naming it dies immediately
//
// Three self-service routes were added, all authenticated and none gated by a
// new permission (a user acts only on their own sessions, and the owning userId
// always comes from req.user, never from the request):
//
//   POST   /api/auth/logout        revoke the calling session ({all:true} = everywhere)
//   GET    /api/auth/sessions      the caller's own open sessions
//   DELETE /api/auth/sessions/:id  end one session the caller owns
//
// Nothing about authorization moved into the token or the session row: role and
// businessId are still reloaded from the User on every request, which is why a
// hand-forged role claim still grants nothing (case 14).
//
// The compatibility cost is deliberate and one-time: every token minted before
// this phase has no `jti` and is therefore rejected, so each user signs in again
// exactly once. Registered as PURE_DB in run-tests.mjs.

import 'dotenv/config';

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
import { verifyAccessToken, signAccessToken } from '../src/config/jwt.ts';
import { newSessionId, SESSION_ABSOLUTE_CAP_MS } from '../src/services/session.service.ts';
import env from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../src/constants/audit.ts';
import requireAuth from '../src/middlewares/authenticate.ts';
import { createAuthRouter } from '../src/routes/auth.routes.ts';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'NewPassword456!';
const SESSION_CODES = [
  AUDIT_ACTIONS.SESSION_CREATED,
  AUDIT_ACTIONS.SESSION_LOGGED_OUT,
  AUDIT_ACTIONS.SESSION_REVOKED,
  AUDIT_ACTIONS.SESSIONS_REVOKED_ALL,
];

/** Create a STAFF user inside the fixture business (owner acts). */
async function createStaff(owner) {
  const res = await api('POST', '/api/users', {
    token: owner.token,
    body: { name: uniqueName('U26'), email: uniqueEmail('u26'), password: PASSWORD, role: 'STAFF' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  tracker.trackUser(res.json.id);
  return res.json;
}

/** Log in, optionally labelling the device (the label is cosmetic). */
async function login(email, password, deviceLabel) {
  const body = { email, password };
  if (deviceLabel !== undefined) body.deviceLabel = deviceLabel;
  return api('POST', '/api/auth/login', { body });
}

/** Assert a token is accepted, returning the /me body. */
async function me(token) {
  return api('GET', '/api/auth/me', { token });
}

/** Every session row for a user, newest first. */
async function sessionsOf(userId) {
  return Session.find({ userId }).sort({ createdAt: 1, _id: 1 });
}

/**
 * Signs a token exactly the way the server does. AUTH-02 made `iss`/`aud`
 * mandatory on verification, so a hand-built token that omits them is rejected
 * before it can reach any of the checks these cases exercise.
 */
function signAsServer(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
  });
}

/**
 * A brand-new business + OWNER created directly in the database, so tests that
 * mutate tenant liveness or the password never touch the shared fixture.
 */
async function isolatedOwner() {
  const business = await Business.create({ name: uniqueName('Biz26') });
  tracker.trackBusiness(String(business._id));
  const email = uniqueEmail('owner26');
  const user = await User.create({
    businessId: business._id,
    name: uniqueName('Owner26'),
    email,
    passwordHash: bcrypt.hashSync(PASSWORD, 10),
    role: 'OWNER',
    status: 'ACTIVE',
  });
  tracker.trackUser(String(user._id));
  const res = await login(email, PASSWORD);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return { business, user, email, token: res.json.token };
}

let owner; // fixture business + OWNER, used to create the staff users below

dbSuite('Phase 26A — session lifecycle over real HTTP', dbOk, () => {
  before(async () => {
    owner = await registerOwner(api, tracker);
  });

  after(async () => {
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  // -------------------------------------------------------------------------
  // 1-4: what login now produces, and what requireAuth now demands
  // -------------------------------------------------------------------------

  it('1. login creates a server-side session for the token it issues', async () => {
    const user = await createStaff(owner);
    assert.equal(await Session.countDocuments({ userId: user.id }), 0, 'no session before login');

    const res = await login(user.email, PASSWORD, 'Pixel 7');
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const payload = verifyAccessToken(res.json.token);
    const rows = await sessionsOf(user.id);
    assert.equal(rows.length, 1, 'exactly one session row was created');
    const session = rows[0];

    assert.equal(String(session.userId), user.id, 'the row belongs to the logging-in user');
    assert.equal(session.jti, payload.jti, 'the row is keyed on the token’s own jti');
    assert.equal(session.deviceLabel, 'Pixel 7', 'the cosmetic label is stored');
    assert.equal(session.revokedAt, null, 'a fresh session is not revoked');
    assert.equal(session.lastUsedAt, null, 'and has not been used yet');
    // AUTH-02: `expiresAt` is the SESSION's own 14-day absolute cap, not the
    // token's `exp`. The two lifetimes are deliberately independent: a ~1-hour
    // token names a 14-day session row.
    const capMs = session.expiresAt.getTime() - session.createdAt.getTime();
    assert.ok(
      Math.abs(capMs - SESSION_ABSOLUTE_CAP_MS) < 60_000,
      `the row carries a ~14-day absolute cap, was ${capMs}ms`
    );
    assert.notEqual(
      session.expiresAt.getTime(),
      payload.exp * 1000,
      'the session must not expire with its JWT (AUTH-02)'
    );

    // The session row carries NO authorization data (Phase 03/24 invariant).
    const raw = session.toObject();
    assert.equal(raw.role, undefined);
    assert.equal(raw.businessId, undefined);
  });

  it('2. the issued JWT carries sub and jti, and no authorization claims', async () => {
    const user = await createStaff(owner);
    const res = await login(user.email, PASSWORD);
    const payload = verifyAccessToken(res.json.token);

    assert.equal(payload.sub, user.id);
    assert.equal(typeof payload.jti, 'string');
    assert.ok(payload.jti.length > 0, 'the jti is present and non-empty');
    assert.ok(Number.isInteger(payload.iat), 'iat present');
    assert.ok(Number.isInteger(payload.exp), 'exp present');

    // Two logins never share a session id.
    const second = await login(user.email, PASSWORD);
    assert.notEqual(verifyAccessToken(second.json.token).jti, payload.jti);

    // Authorization data is never embedded: a role/business claim cannot go stale
    // because there is none to go stale.
    assert.equal(payload.role, undefined);
    assert.equal(payload.businessId, undefined);
    assert.equal(payload.status, undefined);
  });

  it('3. a signed token with no jti is rejected (the one-time pre-26A break)', async () => {
    const user = await createStaff(owner);
    const good = await login(user.email, PASSWORD);
    assert.equal((await me(good.json.token)).status, 200, 'precondition: the real token works');

    // Correctly signed with the real secret, correct subject, unexpired — the
    // ONLY thing wrong with it is that it names no session. This is exactly the
    // shape of every token issued before Phase 26A.
    const noJti = signAsServer({ sub: user.id });
    const res = await me(noJti);
    assert.equal(res.status, 401, JSON.stringify(res.json));
    assert.equal(res.json.code, 'INVALID_TOKEN');

    // An empty jti is the same as none.
    const emptyJti = signAsServer({ sub: user.id, jti: '' });
    const empty = await me(emptyJti);
    assert.equal(empty.status, 401, JSON.stringify(empty.json));
    assert.equal(empty.json.code, 'INVALID_TOKEN');

    // A jti naming no session at all is a 401 too — "unknown" and "revoked" are
    // deliberately indistinguishable to the caller.
    const unknownJti = signAsServer({ sub: user.id, jti: newSessionId() });
    const unknown = await me(unknownJti);
    assert.equal(unknown.status, 401, JSON.stringify(unknown.json));
    assert.equal(unknown.json.code, 'SESSION_REVOKED');
  });

  it('4. a valid jti naming a live session is accepted', async () => {
    const user = await createStaff(owner);
    const res = await login(user.email, PASSWORD);
    const { jti } = verifyAccessToken(res.json.token);

    const live = await Session.findOne({ jti });
    assert.ok(live, 'precondition: the session row exists');
    assert.equal(live.revokedAt, null);
    assert.ok(live.expiresAt.getTime() > Date.now(), 'precondition: not expired');

    const ok = await me(res.json.token);
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.user.id, user.id);

    // Using the session records lastUsedAt — the owner can recognize it later.
    const touched = await Session.findOne({ jti });
    assert.ok(touched.lastUsedAt instanceof Date, 'lastUsedAt was recorded on use');
  });

  // -------------------------------------------------------------------------
  // 5-9: revocation, on one session, everywhere, and across users
  // -------------------------------------------------------------------------

  it('5. logout revokes the current session and leaks nothing', async () => {
    const user = await createStaff(owner);
    const res = await login(user.email, PASSWORD, 'Laptop');
    const { jti } = verifyAccessToken(res.json.token);

    const out = await api('POST', '/api/auth/logout', { token: res.json.token });
    assert.equal(out.status, 200, JSON.stringify(out.json));

    const session = await Session.findOne({ jti });
    assert.ok(session.revokedAt instanceof Date, 'the row is revoked, not deleted');
    const after = await me(res.json.token);
    assert.equal(after.status, 401, 'and its token no longer works');
    assert.equal(after.json.code, 'SESSION_REVOKED');

    // The response is safe: it never echoes the session id or the token.
    const serialized = JSON.stringify(out.json);
    assert.equal(serialized.includes(jti), false, 'no jti in the response');
    assert.equal(serialized.includes(res.json.token), false, 'no token in the response');

    // Logging out is idempotent: the goal (that session is dead) already holds.
    const again = await api('POST', '/api/auth/logout', { token: res.json.token });
    assert.equal(again.status, 401, 'a revoked token cannot call logout again');
  });

  it('6. a revoked session’s JWT is rejected everywhere it is presented', async () => {
    const user = await createStaff(owner);
    const res = await login(user.email, PASSWORD);
    const token = res.json.token;

    assert.equal((await me(token)).status, 200, 'precondition: the token works');

    await Session.updateOne({ jti: verifyAccessToken(token).jti }, { $set: { revokedAt: new Date() } });

    const onMe = await me(token);
    assert.equal(onMe.status, 401, JSON.stringify(onMe.json));
    assert.equal(onMe.json.code, 'SESSION_REVOKED');

    // Not just /me: any authenticated route refuses it, before any role gate.
    const onUsers = await api('GET', '/api/users', { token });
    assert.equal(onUsers.status, 401, JSON.stringify(onUsers.json));
    assert.equal(onUsers.json.code, 'SESSION_REVOKED');

    const onSessions = await api('GET', '/api/auth/sessions', { token });
    assert.equal(onSessions.status, 401, JSON.stringify(onSessions.json));
    assert.equal(onSessions.json.code, 'SESSION_REVOKED');
  });

  it('7. revoking one session leaves the user’s other sessions working', async () => {
    const user = await createStaff(owner);
    const a = (await login(user.email, PASSWORD, 'Phone')).json.token;
    const b = (await login(user.email, PASSWORD, 'Tablet')).json.token;
    assert.notEqual(verifyAccessToken(a).jti, verifyAccessToken(b).jti);

    const out = await api('POST', '/api/auth/logout', { token: a });
    assert.equal(out.status, 200, JSON.stringify(out.json));

    assert.equal((await me(a)).status, 401, 'the ended session is dead');
    const stillOk = await me(b);
    assert.equal(stillOk.status, 200, JSON.stringify(stillOk.json));

    const rows = await sessionsOf(user.id);
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((r) => r.revokedAt !== null).length, 1, 'exactly one row was revoked');
  });

  it('8. sign out everywhere revokes every session for that user only', async () => {
    const user = await createStaff(owner);
    const tokens = [];
    for (let i = 0; i < 3; i += 1) tokens.push((await login(user.email, PASSWORD, `Device ${i}`)).json.token);

    // A different user of the SAME business must be unaffected.
    const bystander = await createStaff(owner);
    const bystanderToken = (await login(bystander.email, PASSWORD)).json.token;

    const out = await api('POST', '/api/auth/logout', {
      token: tokens[2],
      body: { all: true },
    });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    assert.equal(out.json.sessionsRevoked, 3, 'all three of this user’s sessions were ended');

    for (const [i, token] of tokens.entries()) {
      const res = await me(token);
      assert.equal(res.status, 401, `session ${i} must be dead: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'SESSION_REVOKED');
    }
    assert.equal((await me(bystanderToken)).status, 200, 'the other user is untouched');
    assert.equal(
      (await sessionsOf(bystander.id)).filter((r) => r.revokedAt === null).length,
      1,
      'the other user still has their session'
    );
  });

  it('9. one user cannot see or revoke another user’s session', async () => {
    const alice = await createStaff(owner);
    const bob = await createStaff(owner);
    const aliceToken = (await login(alice.email, PASSWORD, 'Alice')).json.token;
    const bobToken = (await login(bob.email, PASSWORD, 'Bob')).json.token;

    const bobRow = await Session.findOne({ jti: verifyAccessToken(bobToken).jti });

    // Listing is scoped: only the caller's own rows come back.
    const listed = await api('GET', '/api/auth/sessions', { token: aliceToken });
    assert.equal(listed.status, 200, JSON.stringify(listed.json));
    assert.ok(listed.json.sessions.length >= 1);
    const ids = listed.json.sessions.map((s) => s.id);
    assert.equal(ids.includes(String(bobRow._id)), false, 'another user’s session is not listed');
    assert.equal(
      listed.json.sessions.every((s) => s.id !== String(bobRow._id)),
      true
    );

    // Revoking is scoped by construction: the userId is part of the lookup, so a
    // foreign id matches nothing and answers the same 404 as an unknown id.
    const cross = await api('DELETE', `/api/auth/sessions/${String(bobRow._id)}`, { token: aliceToken });
    assert.equal(cross.status, 404, JSON.stringify(cross.json));
    assert.equal(cross.json.code, 'NOT_FOUND');

    const bobStill = await me(bobToken);
    assert.equal(bobStill.status, 200, 'Bob’s session survived the attempt');
    assert.equal((await Session.findById(bobRow._id)).revokedAt, null, 'and its row is untouched');
  });

  // -------------------------------------------------------------------------
  // 10-13: everything that used to invalidate a token still does
  // -------------------------------------------------------------------------

  it('10. an expired session is rejected even though its JWT is still unexpired', async () => {
    const user = await createStaff(owner);
    const res = await login(user.email, PASSWORD);
    const token = res.json.token;
    const { jti, exp } = verifyAccessToken(token);
    assert.ok(exp * 1000 > Date.now(), 'precondition: the JWT itself is still valid');

    assert.equal((await me(token)).status, 200, 'precondition: the session is live');

    // Expire the SESSION only — the token is untouched. The row is what the
    // liveness check reads, so the session cannot outlive its own expiry.
    await Session.updateOne({ jti }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const res2 = await me(token);
    assert.equal(res2.status, 401, JSON.stringify(res2.json));
    assert.equal(res2.json.code, 'SESSION_REVOKED');

    // It is also invisible to the owner's own session list.
    const other = (await login(user.email, PASSWORD)).json.token;
    const listed = await api('GET', '/api/auth/sessions', { token: other });
    assert.equal(listed.status, 200);
    const expiredRow = await Session.findOne({ jti });
    assert.equal(
      listed.json.sessions.some((s) => s.id === String(expiredRow._id)),
      false,
      'an expired session is not offered as an active one'
    );
  });

  it('11. a disabled user is still rejected (403 ACCOUNT_DISABLED)', async () => {
    const user = await createStaff(owner);
    const token = (await login(user.email, PASSWORD)).json.token;
    assert.equal((await me(token)).status, 200, 'precondition: the token works');

    await User.updateOne({ _id: user.id }, { $set: { status: 'DISABLED' } });

    const res = await me(token);
    assert.equal(res.status, 403, JSON.stringify(res.json));
    assert.equal(res.json.code, 'ACCOUNT_DISABLED');

    // Disabling also blocks a fresh login, unchanged from before this phase.
    const relogin = await login(user.email, PASSWORD);
    assert.equal(relogin.status, 403, JSON.stringify(relogin.json));
    assert.equal(relogin.json.code, 'ACCOUNT_DISABLED');

    await User.updateOne({ _id: user.id }, { $set: { status: 'ACTIVE' } });
  });

  it('12. SUSPENDED and ARCHIVED businesses still revoke access (403, fail closed)', async () => {
    const isolated = await isolatedOwner();
    assert.equal((await me(isolated.token)).status, 200, 'precondition: the token works');

    for (const status of ['SUSPENDED', 'ARCHIVED']) {
      await Business.updateOne({ _id: isolated.business._id }, { $set: { status } });
      const res = await me(isolated.token);
      assert.equal(res.status, 403, `${status}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'BUSINESS_NOT_ACTIVE', `${status} must fail closed`);
    }

    // A missing business is indistinguishable from an inactive one.
    await Business.deleteOne({ _id: isolated.business._id });
    const gone = await me(isolated.token);
    assert.equal(gone.status, 403, JSON.stringify(gone.json));
    assert.equal(gone.json.code, 'BUSINESS_NOT_ACTIVE');
  });

  it('13. passwordChangedAt invalidation still works, through its own code path', async () => {
    const isolated = await isolatedOwner();
    const oldToken = isolated.token;

    // Make the old token provably OLDER than the change (strict `<` comparison
    // happens at whole-second granularity).
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const change = await api('POST', '/api/auth/change-password', {
      token: oldToken,
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    assert.equal(change.status, 200, JSON.stringify(change.json));

    const res = await me(oldToken);
    assert.equal(res.status, 401, JSON.stringify(res.json));
    // Crucially SESSION_INVALIDATED and not SESSION_REVOKED: the pre-existing
    // Phase 15 mechanism is what fired, not the new session check. The session
    // row itself is still perfectly valid — the password change is what killed
    // the token.
    assert.equal(res.json.code, 'SESSION_INVALIDATED');

    const row = await Session.findOne({ jti: verifyAccessToken(oldToken).jti });
    assert.ok(row, 'the session row still exists');
    assert.equal(row.revokedAt, null, 'and was not revoked — the password path is what rejected it');

    const fresh = await login(isolated.email, NEW_PASSWORD);
    assert.equal(fresh.status, 200, JSON.stringify(fresh.json));
    assert.equal((await me(fresh.json.token)).status, 200, 'the new password’s session works');
  });

  it('14. forged role/business claims still grant nothing', async () => {
    const staff = await createStaff(owner);
    const token = (await login(staff.email, PASSWORD)).json.token;
    const { jti } = verifyAccessToken(token);

    // Precondition: this role is genuinely denied the route being probed.
    const denied = await api('GET', '/api/users', { token });
    assert.equal(denied.status, 403, JSON.stringify(denied.json));
    assert.equal(denied.json.code, 'FORBIDDEN');

    // Same live session, same subject — but with a forged OWNER role and a
    // forged businessId, correctly signed with the real secret. Claiming more
    // must not buy anything, because authorization is reloaded from the User.
    const forged = signAsServer({
      sub: staff.id,
      jti,
      role: 'OWNER',
      businessId: String(owner.businessId),
      status: 'ACTIVE',
    });
    const res = await api('GET', '/api/users', { token: forged });
    assert.equal(res.status, 403, JSON.stringify(res.json));
    assert.equal(res.json.code, 'FORBIDDEN');

    // And the forged claims do not leak back out of /me either.
    const who = await me(forged);
    assert.equal(who.status, 200, JSON.stringify(who.json));
    assert.equal(who.json.user.id, staff.id);
    assert.equal(who.json.user.role, 'STAFF', 'the database role, not the claimed one');

    // A forged jti pointing at another user's session is refused outright.
    const victim = await createStaff(owner);
    const victimToken = (await login(victim.email, PASSWORD)).json.token;
    const stolenJti = signAsServer({ sub: staff.id, jti: verifyAccessToken(victimToken).jti });
    const crossed = await me(stolenJti);
    assert.equal(crossed.status, 401, JSON.stringify(crossed.json));
    assert.equal(crossed.json.code, 'SESSION_REVOKED', 'a session only answers for its own owner');
  });

  it('15. the existing authorization contract is intact', async () => {
    // Structural: the three new routes are requireAuth + controller only, with
    // no permission gate — and no existing auth route lost or gained one.
    const router = createAuthRouter();
    const byPath = new Map();
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const stackLayer of layer.route.stack) {
        const methods = Object.keys(stackLayer.method ? { [stackLayer.method]: true } : {});
        for (const m of methods) {
          byPath.set(`${m.toUpperCase()} ${layer.route.path}`, layer.route.stack);
        }
      }
    }
    for (const route of ['POST /logout', 'GET /sessions', 'DELETE /sessions/:id']) {
      const handlers = byPath.get(route);
      assert.ok(handlers, `${route} must be registered on the auth router`);
      assert.equal(handlers.length, 2, `${route} must be requireAuth + controller`);
      assert.equal(handlers[0].handle, requireAuth, `${route} must be gated by requireAuth`);
    }
    for (const route of ['GET /me', 'PATCH /me', 'POST /change-password']) {
      const handlers = byPath.get(route);
      assert.ok(handlers, `${route} must still be registered`);
      assert.equal(handlers.length, 2, `${route} must still be requireAuth + controller`);
      assert.equal(handlers[0].handle, requireAuth);
    }

    // The public routes are unchanged: still reachable without a token.
    const loginRes = await api('POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: PASSWORD },
    });
    assert.equal(loginRes.status, 401, 'login is still public and still 401s bad credentials');

    // Runtime: the new routes are authenticated, not public.
    for (const [method, path] of [
      ['POST', '/api/auth/logout'],
      ['GET', '/api/auth/sessions'],
      ['DELETE', '/api/auth/sessions/507f1f77bcf86cd799439011'],
    ]) {
      const res = await api(method, path);
      assert.equal(res.status, 401, `${method} ${path} must require a token`);
      assert.equal(res.json.code, 'AUTH_REQUIRED');
    }

    // /api/auth/me's payload is the contract Phase 15 pinned, plus the ONE
    // capability Phase 32K added (`authMethods`); the session layer added nothing
    // to it — `jti` and the session id are still absent, which is what this case
    // exists to prove. The list is asserted EXACTLY rather than by inclusion, so
    // a future field still has to be declared here on purpose.
    const user = await createStaff(owner);
    const token = (await login(user.email, PASSWORD)).json.token;
    const res = await me(token);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json.user).sort(), [
      'authMethods',
      'businessId',
      'email',
      'id',
      'name',
      'role',
      'status',
    ]);
    assert.equal(
      JSON.stringify(res.json).includes('firebaseUid'),
      false,
      'the capability is published, never the uid behind it'
    );
    assert.equal(JSON.stringify(res.json).includes('jti'), false, 'no session id in /me');

    // A permission-gated route still denies an unpermitted role: the session
    // check did not become an alternative path through the gate.
    const staffToken = (await login(user.email, PASSWORD)).json.token;
    const gated = await api('POST', '/api/categories', { token: staffToken, body: { name: uniqueName('C26') } });
    assert.equal(gated.status, 403, JSON.stringify(gated.json));
    assert.equal(gated.json.code, 'FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // The rest of the new surface: listing, identifier hygiene, audit trail
  // -------------------------------------------------------------------------

  it('16. GET /api/auth/sessions lists only the caller’s open sessions, safely', async () => {
    const user = await createStaff(owner);
    const first = (await login(user.email, PASSWORD, 'Phone')).json.token;
    const second = (await login(user.email, PASSWORD, 'Tablet')).json.token;
    const currentJti = verifyAccessToken(second).jti;

    const res = await api('GET', '/api/auth/sessions', { token: second });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.sessions.length, 2);

    // Newest first, and exactly one is marked current — the caller's own.
    assert.equal(res.json.sessions[0].current, true, 'newest first, and it is the caller’s');
    assert.equal(res.json.sessions[0].deviceLabel, 'Tablet');
    assert.equal(res.json.sessions[1].current, false);
    assert.equal(res.json.sessions[1].deviceLabel, 'Phone');
    assert.equal(res.json.sessions.filter((s) => s.current).length, 1, 'exactly one current session');

    // Strict allowlist: no token, no jti, no owner id, no role.
    const serialized = JSON.stringify(res.json);
    assert.equal(serialized.includes('jti'), false, 'the jti is never exposed');
    assert.equal(serialized.includes(currentJti), false);
    assert.equal(serialized.includes(first), false, 'no token is ever exposed');
    assert.equal(serialized.includes(second), false);
    assert.equal(serialized.includes('userId'), false);
    assert.equal(serialized.includes(user.id), false, 'not even the owner’s own id');
    for (const s of res.json.sessions) {
      assert.deepEqual(Object.keys(s).sort(), [
        'createdAt',
        'current',
        'deviceLabel',
        'expiresAt',
        'id',
        'lastUsedAt',
      ]);
      // The id is the session's own ObjectId — usable for revocation, and not a
      // credential on its own: revoking still requires owning it.
      assert.ok(/^[a-f0-9]{24}$/.test(s.id), 'the public id is an ObjectId string');
    }
  });

  it('17. logout refuses identity fields in the body (never trusts the client)', async () => {
    const user = await createStaff(owner);
    const other = await createStaff(owner);
    const token = (await login(user.email, PASSWORD)).json.token;
    const otherRow = await Session.findOne({ jti: verifyAccessToken((await login(other.email, PASSWORD)).json.token).jti });

    for (const body of [
      { userId: other.id },
      { businessId: owner.businessId },
      { sessionId: String(otherRow._id) },
      { jti: newSessionId() },
      { all: true, userId: other.id },
    ]) {
      const res = await api('POST', '/api/auth/logout', { token, body });
      assert.equal(res.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
      assert.ok(
        res.json.fields.some((p) => p.field !== undefined),
        'the offending field is named'
      );
    }

    // None of those attempts did anything: both sessions are still live.
    assert.equal((await me(token)).status, 200, 'the caller was not signed out by a rejected body');
    assert.equal((await Session.findById(otherRow._id)).revokedAt, null, 'and nobody else was touched');

    // A non-boolean `all` is refused rather than coerced.
    const badAll = await api('POST', '/api/auth/logout', { token, body: { all: 'yes' } });
    assert.equal(badAll.status, 400, JSON.stringify(badAll.json));
    assert.ok(badAll.json.fields.some((f) => f.field === 'all'));

    // An empty body is the normal sign-out and is accepted.
    const ok = await api('POST', '/api/auth/logout', { token, body: {} });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
  });

  it('18. DELETE /api/auth/sessions/:id ends exactly one owned session', async () => {
    const user = await createStaff(owner);
    const doomed = (await login(user.email, PASSWORD, 'Doomed')).json.token;
    const keeper = (await login(user.email, PASSWORD, 'Keeper')).json.token;
    const doomedRow = await Session.findOne({ jti: verifyAccessToken(doomed).jti });

    const res = await api('DELETE', `/api/auth/sessions/${String(doomedRow._id)}`, { token: keeper });
    assert.equal(res.status, 200, JSON.stringify(res.json));

    assert.equal((await me(doomed)).status, 401, 'the targeted session is dead');
    assert.equal((await me(keeper)).status, 200, 'the caller’s own session is not');

    // Unknown and malformed ids answer the same 404 — no existence oracle.
    const unknown = await api('DELETE', '/api/auth/sessions/507f1f77bcf86cd799439011', { token: keeper });
    assert.equal(unknown.status, 404, JSON.stringify(unknown.json));
    assert.equal(unknown.json.code, 'NOT_FOUND');

    const malformed = await api('DELETE', '/api/auth/sessions/not-an-object-id', { token: keeper });
    assert.equal(malformed.status, 404, JSON.stringify(malformed.json));
    assert.equal(malformed.json.code, 'NOT_FOUND');

    // Revoking an already-revoked session is a 404, not a second success: the
    // row is no longer an open session.
    const twice = await api('DELETE', `/api/auth/sessions/${String(doomedRow._id)}`, { token: keeper });
    assert.equal(twice.status, 404, JSON.stringify(twice.json));
  });

  it('19. the audit trail records session events, and never a session id', async () => {
    const user = await createStaff(owner);
    const a = (await login(user.email, PASSWORD, 'Audited')).json.token;
    const b = (await login(user.email, PASSWORD)).json.token;
    const jtiA = verifyAccessToken(a).jti;

    await api('POST', '/api/auth/logout', { token: a });
    const bRow = await Session.findOne({ jti: verifyAccessToken(b).jti });
    await api('DELETE', `/api/auth/sessions/${String(bRow._id)}`, { token: b });
    await api('POST', '/api/auth/logout', { token: b });

    const rows = await AuditLog.find({
      businessId: user.businessId,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
    }).sort({ createdAt: 1 });

    const actions = rows.map((r) => r.action);
    assert.ok(actions.includes(AUDIT_ACTIONS.SESSION_CREATED), 'login is audited');
    assert.ok(actions.includes(AUDIT_ACTIONS.SESSION_LOGGED_OUT), 'sign-out is audited');
    assert.ok(actions.includes(AUDIT_ACTIONS.SESSION_REVOKED), 'a remote revoke is audited');

    // The actor is the session's owner and the entity is the session row. (The
    // fixture OWNER logged in too, so narrow to this user's own row.)
    const created = rows.find(
      (r) => r.action === AUDIT_ACTIONS.SESSION_CREATED && String(r.userId) === user.id
    );
    assert.ok(created, 'this user’s login is audited');
    assert.equal(created.metadata.deviceLabel, 'Audited');
    assert.ok(rows.every((r) => r.entityType === 'SESSION'));
    // Nothing invented alongside the declared events.
    assert.ok(actions.every((a) => SESSION_CODES.includes(a)), `unexpected action in ${actions}`);

    // No jti anywhere in the trail: the audit viewer is readable by every ADMIN
    // of the business, and a jti is the one value that could replay a token.
    const serialized = JSON.stringify(rows.map((r) => r.toObject()));
    assert.equal(serialized.includes(jtiA), false, 'the jti never reaches the audit trail');
    assert.equal(serialized.includes('"jti"'), false);
    assert.equal(serialized.includes(a), false, 'no token either');

    // Sign out everywhere records its own, distinct event.
    const c = (await login(user.email, PASSWORD)).json.token;
    const d = (await login(user.email, PASSWORD)).json.token;
    const allRes = await api('POST', '/api/auth/logout', { token: c, body: { all: true } });
    assert.equal(allRes.status, 200, JSON.stringify(allRes.json));
    const revokedAll = await AuditLog.findOne({
      businessId: user.businessId,
      userId: user.id,
      action: AUDIT_ACTIONS.SESSIONS_REVOKED_ALL,
    });
    assert.ok(revokedAll, 'sign out everywhere is audited');
    assert.equal(revokedAll.metadata.sessionsRevoked, 2);
    assert.equal((await me(d)).status, 401);

    // All four declared session events are now present, and no fifth exists.
    const allActions = await AuditLog.find({
      businessId: user.businessId,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
    }).distinct('action');
    assert.deepEqual([...allActions].sort(), [...SESSION_CODES].sort());
  });

  it('20. a malformed device label is coerced, never a reason to fail a login', async () => {
    const user = await createStaff(owner);

    // Too long: capped rather than refused.
    const long = await login(user.email, PASSWORD, 'x'.repeat(500));
    assert.equal(long.status, 200, JSON.stringify(long.json));
    const longRow = await Session.findOne({ jti: verifyAccessToken(long.json.token).jti });
    assert.equal(longRow.deviceLabel.length, 60, 'capped to the display limit');

    // Blank and non-string: replaced by the default.
    for (const label of ['   ', 42, null, { evil: true }, ['a']]) {
      const res = await login(user.email, PASSWORD, label);
      assert.equal(res.status, 200, `label=${JSON.stringify(label)}: ${JSON.stringify(res.json)}`);
      const row = await Session.findOne({ jti: verifyAccessToken(res.json.token).jti });
      assert.equal(row.deviceLabel, 'Unknown device');
    }

    // Absent entirely: the default is stored.
    const absent = await login(user.email, PASSWORD);
    const absentRow = await Session.findOne({ jti: verifyAccessToken(absent.json.token).jti });
    assert.equal(absentRow.deviceLabel, 'Unknown device');

    // A label is display-only — it never becomes a query filter, so a value that
    // looks like a Mongo operator is inert.
    const op = await login(user.email, PASSWORD, { $ne: null });
    assert.equal(op.status, 200);
    const opRow = await Session.findOne({ jti: verifyAccessToken(op.json.token).jti });
    assert.equal(opRow.deviceLabel, 'Unknown device', 'a non-string never reaches the store');

    const listed = await api('GET', '/api/auth/sessions', { token: absent.json.token });
    assert.equal(listed.status, 200);
    assert.ok(listed.json.sessions.some((s) => s.deviceLabel === 'Unknown device'));
  });

  it('21. signOutAll is the same route, and the current session is listed', async () => {
    // The "sign out everywhere" affordance is POST /api/auth/logout with
    // {all:true} rather than a fourth route, so the declared route set stays at
    // exactly the three the phase added.
    const user = await createStaff(owner);
    const token = (await login(user.email, PASSWORD)).json.token;

    const listed = await api('GET', '/api/auth/sessions', { token });
    assert.equal(listed.json.sessions.length, 1);
    assert.equal(listed.json.sessions[0].current, true, 'the caller can see which one it is');

    const signedOut = await api('POST', '/api/auth/logout', { token, body: { all: true } });
    assert.equal(signedOut.status, 200, JSON.stringify(signedOut.json));
    assert.equal(signedOut.json.sessionsRevoked, 1, 'the current session is included');
    assert.equal((await me(token)).status, 401);
  });

  it('22. a session id from one login cannot be reused as another session', async () => {
    const user = await createStaff(owner);
    const first = (await login(user.email, PASSWORD)).json.token;
    const firstJti = verifyAccessToken(first).jti;

    await api('POST', '/api/auth/logout', { token: first });
    assert.equal((await me(first)).status, 401);

    // A NEW login gets a NEW session id — revoking one can never be undone by
    // signing in again, and the old jti is never reissued.
    const second = (await login(user.email, PASSWORD)).json.token;
    assert.notEqual(verifyAccessToken(second).jti, firstJti);

    // A fresh login also cannot "claim" a revoked jti.
    const replay = signAccessToken(user.id, firstJti);
    const replayed = await me(replay);
    assert.equal(replayed.status, 401, JSON.stringify(replayed.json));
    assert.equal(replayed.json.code, 'SESSION_REVOKED', 'a revoked session is not resurrectable');
  });
});
