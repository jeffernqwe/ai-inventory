// AUTH-02 follow-up — the per-user session cap.
//
// WHY THIS SUITE EXISTS. The roadmap has carried "a per-user session cap" under
// *Still open (recommended, not started)* twice. The property it adds is narrow
// and worth stating precisely, because the obvious reading of a cap is wrong:
//
//   * It is NOT login throttling. It does not slow an attacker down and it does
//     not shorten the 14-day absolute cap on any single session.
//   * It bounds ACCUMULATION. Every sign-in, every reinstall and every Exchange
//     mints a row that stays usable for the full cap, and nothing counted them.
//     Revoking the OLDEST rows when the bound is crossed means the credential a
//     forgotten test device still holds eventually stops working, without ever
//     touching the device the member is holding now.
//
// The failure this must never become is a lockout: signing in must ALWAYS
// succeed, the session just created must never be the one revoked, and a
// cleanup failure must never fail the login that already happened. Those are the
// directions below, not a happy path.
//
// Registered PURE_DB in run-tests.mjs: every case needs real rows, a real sort
// and the real partial filter. The service under test is imported, not
// reimplemented — a copy would agree with itself and prove nothing about the
// code the login path runs.

import 'dotenv/config';

import { after, it } from 'node:test';
import assert from 'node:assert/strict';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName } from './support.mjs';
import { dbSuite } from './testEnv.mjs';

import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';
import { signAccessToken } from '../src/config/jwt.ts';
import {
  MAX_ACTIVE_SESSIONS_PER_USER,
  createSessionForToken,
  newSessionId,
  revokeSessionById,
} from '../src/services/session.service.ts';

const dbOk = await ensureDb();
const tracker = createTracker(dbOk);

after(async () => {
  await tracker.cleanup();
  await disconnectDb();
});

/** A fresh business + OWNER, created directly so no helper pre-creates a session. */
async function makeAccount(label) {
  const business = await Business.create({ name: uniqueName(`Biz${label}`) });
  tracker.trackBusiness(String(business._id));
  const user = await User.create({
    businessId: business._id,
    name: uniqueName(`User${label}`),
    email: uniqueEmail(`cap${label.toLowerCase()}`),
    role: 'OWNER',
    status: 'ACTIVE',
  });
  tracker.trackUser(String(user._id));
  return { userId: String(user._id), businessId: String(business._id) };
}

/** One real sign-in: a signed token naming a fresh jti, then the session row. */
async function signIn(account, deviceLabel) {
  const token = signAccessToken(account.userId, newSessionId());
  return createSessionForToken({
    userId: account.userId,
    businessId: account.businessId,
    token,
    deviceLabel,
  });
}

/** Fills an account to the cap, oldest first, and returns the rows in order. */
async function fillToCap(account) {
  const created = [];
  for (let index = 0; index < MAX_ACTIVE_SESSIONS_PER_USER; index += 1) {
    created.push(await signIn(account, `Device ${index}`));
  }
  return created;
}

function activeSessions(userId) {
  return Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({
    createdAt: -1,
    _id: -1,
  });
}

dbSuite('the per-user session cap — a bound on accumulation, never a lockout', dbOk, () => {
  it('lets a member hold the whole cap without revoking anything (positive control)', async () => {
    const account = await makeAccount('full');
    const created = await fillToCap(account);

    assert.equal(created.length, MAX_ACTIVE_SESSIONS_PER_USER);
    assert.equal(await activeSessions(account.userId).then((rows) => rows.length), MAX_ACTIVE_SESSIONS_PER_USER);
    assert.equal(await Session.countDocuments({ userId: account.userId, revokedAt: { $ne: null } }), 0);
  });

  it('revokes the OLDEST session when the cap is crossed, and never the new one', async () => {
    const account = await makeAccount('cross');
    const created = await fillToCap(account);

    const newest = await signIn(account, 'The phone in my hand');

    const active = await activeSessions(account.userId);
    assert.equal(active.length, MAX_ACTIVE_SESSIONS_PER_USER);
    // The sign-in itself is never refused: the cap changes which rows are live,
    // not whether a member can get in.
    assert.ok(String(newest._id));
    assert.ok(
      active.some((row) => String(row._id) === String(newest._id)),
      'the session just created must survive its own arrival'
    );
    assert.ok(
      !active.some((row) => String(row._id) === String(created[0]._id)),
      'the oldest session is the one that goes'
    );
    // …and it is revoked rather than deleted, so a stale token cannot silently
    // resolve to a recreated row.
    const oldest = await Session.findById(created[0]._id);
    assert.ok(oldest?.revokedAt instanceof Date);
  });

  it('does not count a session that is already revoked', async () => {
    const account = await makeAccount('revoked');
    const created = await fillToCap(account);

    await revokeSessionById({
      userId: account.userId,
      businessId: account.businessId,
      sessionId: String(created[0]._id),
    });
    await signIn(account, 'A replacement device');

    assert.equal((await activeSessions(account.userId)).length, MAX_ACTIVE_SESSIONS_PER_USER);
    // Exactly one revoked row — the one signed out by hand. The cap did not fire,
    // because the replacement only restored the account to its bound.
    assert.equal(await Session.countDocuments({ userId: account.userId, revokedAt: { $ne: null } }), 1);
    assert.ok((await Session.findById(created[1]._id))?.revokedAt === null);
  });

  it('does not count a session past its own absolute cap', async () => {
    const account = await makeAccount('expired');
    // One short of the cap, so the arriving device is the last slot and no
    // eviction should happen at all.
    for (let index = 0; index < MAX_ACTIVE_SESSIONS_PER_USER - 1; index += 1) {
      await signIn(account, `Device ${index}`);
    }

    // A row the TTL monitor has not swept yet: still in the collection, already
    // dead at requireAuth. It must not consume a slot.
    await Session.create({
      userId: account.userId,
      jti: newSessionId(),
      deviceLabel: 'Expired row',
      expiresAt: new Date(Date.now() - 60_000),
    });

    const created = await signIn(account, 'A live device');
    assert.ok(String(created._id));
    // Exactly the cap is live, and nothing was revoked: the dead row did not
    // leave the arriving device one slot short.
    assert.equal((await activeSessions(account.userId)).length, MAX_ACTIVE_SESSIONS_PER_USER);
    assert.equal(await Session.countDocuments({ userId: account.userId, revokedAt: { $ne: null } }), 0);
  });

  it('applies to one account only', async () => {
    const first = await makeAccount('a');
    const second = await makeAccount('b');

    await fillToCap(first);
    const secondCreated = await fillToCap(second);
    await signIn(second, 'Second account overflow');

    // The overflow on the second account revokes only its own oldest row.
    assert.equal((await activeSessions(first.userId)).length, MAX_ACTIVE_SESSIONS_PER_USER);
    assert.equal(await Session.countDocuments({ userId: first.userId, revokedAt: { $ne: null } }), 0);
    assert.equal(await Session.countDocuments({ userId: second.userId, revokedAt: { $ne: null } }), 1);
    const oldestOfSecond = await Session.findById(secondCreated[0]._id);
    assert.ok(oldestOfSecond?.revokedAt instanceof Date);
  });

  it('writes an audit row naming the session it ended, and why', async () => {
    const account = await makeAccount('audit');
    const created = await fillToCap(account);
    await signIn(account, 'Overflow');

    const row = await AuditLog.findOne({
      action: 'SESSION_REVOKED',
      entityId: String(created[0]._id),
    }).lean();
    assert.ok(row, 'the cap revocation must be visible in the audit trail');
    assert.equal(row.metadata?.reason, 'session-cap');
    assert.equal(row.userId?.toString(), account.userId);
  });
});
