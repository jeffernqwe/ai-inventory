/**
 * Account deletion — DELETE /api/auth/me (Google Play data-deletion requirement).
 *
 * WHY THIS SUITE EXISTS. This is the only operation in the product that deliberately
 * destroys an account, so the properties below are the whole safety argument:
 *
 *   1. IT CAN ONLY DELETE THE CALLER. The account is `req.user.id`; there is no id in
 *      the request that could aim it at anybody else, and the tenant filters come from
 *      the loaded document rather than the body.
 *   2. A CONFIRMATION WORD AND A RE-AUTHENTICATION ARE BOTH REQUIRED. A mistyped word, a
 *      wrong password or a mismatched Firebase identity is refused without touching a
 *      single record, and none of those refusals is a 401 — a typo must not sign the
 *      person out.
 *   3. A BUSINESS KEEPS AN OWNER WHILE IT HAS MEMBERS. An OWNER is refused (409) while
 *      another active member remains, because a business with no owner can never be
 *      administered again; a second OWNER unlocks the account-only deletion.
 *   3a. A BUSINESS WITH NOBODY ELSE LEFT IS CLOSED WITH THE ACCOUNT. Keeping it would
 *      retain personal data for nobody's benefit — and would leave a sole proprietor
 *      permanently unable to close their account, which is what Google Play requires.
 *      That branch removes the tenant through the SAME definition the cleanup tooling
 *      uses, so the two can never drift apart.
 *   4. AN ORDINARY DELETION IS A TOMBSTONE, NOT A HARD DELETE. Name, email, password,
 *      Firebase link, sessions, reset/verification records and assistant conversations
 *      are erased; the business's own records and its audit trail survive with the
 *      identity anonymized.
 *   5. THE FIREBASE IDENTITY IS DELETED TOO, so a deleted account is not still a usable
 *      identity at the provider.
 *   6. IT IS IDEMPOTENT. A repeat call reports success without repeating the destructive
 *      work, which is what a retry after a partial failure depends on.
 *
 * Registered MIXED in run-tests.mjs: the pure confidentiality checks run without a
 * database; everything else needs MongoDB.
 */

import 'dotenv/config';

import { it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { dbSuite, unitSuite } from './testEnv.mjs';
import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  issueSessionToken,
  uniqueEmail,
  uniqueName,
  disconnectDb,
} from './support.mjs';

import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import Session from '../src/models/session.model.ts';
import AuditLog from '../src/models/auditLog.model.ts';
import PasswordResetToken from '../src/models/passwordResetToken.model.ts';
import PasswordResetChallenge from '../src/models/passwordResetChallenge.model.ts';
import AIConversation from '../src/models/aiConversation.model.ts';
import AIMessage from '../src/models/aiMessage.model.ts';
import {
  deleteOwnAccount,
  DELETE_CONFIRMATION_PHRASE,
  DELETED_EMAIL_DOMAIN,
  DELETED_USER_NAME,
  LAST_OWNER_TRANSFER_REQUIRED,
  INVALID_CURRENT_PASSWORD,
  FIREBASE_IDENTITY_CONFLICT,
} from '../src/services/accountDeletion.service.ts';
import {
  setFirebaseIdTokenVerifier,
  resetFirebaseIdTokenVerifier,
  setFirebaseUserDeleter,
  resetFirebaseUserDeleter,
} from '../src/services/firebase/index.ts';


const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

after(async () => {
  // Both handles keep the process alive: the HTTP listener and the Atlas socket. Node's
  // test runner reports the summary either way, but a run that never EXITS is a run a CI
  // job has to kill, so both are closed here.
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDb();
});

unitSuite('account deletion — the confirmation contract', () => {
  it('accepts exactly the documented word, and the mobile copy is pinned to it', async () => {
    // The word is a constant on both sides, and this is the only place the two meet:
    // the screen shows what the server demands, so a change here without a change there
    // would make deletion impossible to confirm on the phone.
    assert.equal(DELETE_CONFIRMATION_PHRASE, 'DELETE');
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('../../mobile/lib/accountDeletion.ts', import.meta.url),
      'utf8'
    );
    assert.match(source, /DELETE_CONFIRMATION/);
    assert.match(source, /'DELETE'/);
  });

  it('uses a non-routable placeholder domain, never a real address', () => {
    // `.invalid` is reserved by RFC 2606: mail to it can never be delivered, so the
    // tombstone cannot become an accidental inbox.
    assert.equal(DELETED_EMAIL_DOMAIN, 'deleted.invalid');
  });
});

dbSuite('account deletion — over a real database', dbOk, () => {
  /** Registers a fresh owner for a test that needs its own account. */
  async function freshOwner() {
    return registerOwner(api, tracker);
  }

  /**
   * An owner whose account MAY be deleted: a business must keep one active OWNER, so a
   * deletable owner needs a second one. The co-owner is left in place deliberately —
   * that is the state the last-owner rule exists to produce.
   */
  async function deletableOwner() {
    const owner = await freshOwner();
    const coOwner = await User.create({
      businessId: owner.businessId,
      name: uniqueName('CoOwner'),
      email: uniqueEmail('coowner'),
      passwordHash: await bcrypt.hash('Password123!', 10),
      role: 'OWNER',
      status: 'ACTIVE',
    });
    tracker.trackUser(coOwner._id);
    return owner;
  }

  /** Creates a member in the given business, through the real OWNER-only endpoint. */
  async function createMember(ownerSession, role = 'STAFF') {
    const email = uniqueEmail('staff');
    const password = 'Password123!';
    const res = await api('POST', '/api/users', {
      token: ownerSession.token,
      body: { name: uniqueName('Staff'), email, password, role },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    // POST /api/users answers the created user itself (users.controller create).
    tracker.trackUser(res.json.id);
    return { id: res.json.id, email, password };
  }

  it('refuses an unauthenticated request with 401 and deletes nothing', async () => {
    const target = await freshOwner();
    const res = await api('DELETE', '/api/auth/me', {
      body: { confirmation: 'DELETE', currentPassword: 'Password123!' },
    });

    assert.equal(res.status, 401);
    assert.equal((await User.findById(target.userId)).status, 'ACTIVE');
  });

  it('refuses a mistyped confirmation without touching the account or the session', async () => {
    const target = await freshOwner();
    const res = await api('DELETE', '/api/auth/me', {
      token: target.token,
      body: { confirmation: 'delete', currentPassword: 'Password123!' },
    });

    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(res.json.fields));

    const user = await User.findById(target.userId);
    assert.equal(user.status, 'ACTIVE');
    assert.equal(user.name.startsWith('Deleted'), false);

    // The session survives a typo — a refusal on this screen must not sign anybody out.
    const me = await api('GET', '/api/auth/me', { token: target.token });
    assert.equal(me.status, 200);
  });

  it('refuses a wrong password with 400, not 401, and keeps the session', async () => {
    const target = await freshOwner();
    const res = await api('DELETE', '/api/auth/me', {
      token: target.token,
      body: { confirmation: 'DELETE', currentPassword: 'not-the-password' },
    });

    assert.equal(res.status, 400);
    assert.equal(res.json.code, INVALID_CURRENT_PASSWORD);

    const me = await api('GET', '/api/auth/me', { token: target.token });
    assert.equal(me.status, 200);
    assert.equal((await User.findById(target.userId)).status, 'ACTIVE');
  });

  it('★ closes the whole business when its only member deletes their account', async () => {
    const target = await freshOwner();
    const bystander = await freshOwner();

    // Evidence that the tenant's own records are reached by the teardown: a governance
    // row, the assistant's history (a message is only reachable through its
    // conversation) and a second member's session are all created before the call.
    await AuditLog.create({
      businessId: target.businessId,
      userId: target.userId,
      action: 'PRODUCT_CREATED',
      entityType: 'PRODUCT',
      entityId: new mongoose.Types.ObjectId().toString(),
      metadata: {},
    });
    const conversation = await AIConversation.create({
      businessId: target.businessId,
      userId: target.userId,
      title: 'History that belongs to the tenant',
    });
    await AIMessage.create({
      conversationId: conversation._id,
      role: 'USER',
      content: 'How many do I have?',
    });
    const bystanderSession = await issueSessionToken(bystander.userId, { deviceLabel: 'test' });

    const res = await api('DELETE', '/api/auth/me', {
      token: target.token,
      body: { confirmation: 'DELETE', currentPassword: 'Password123!' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.deleted, true);

    // The tenant is GONE — not tombstoned, because there is nobody left to own it.
    assert.equal(await Business.countDocuments({ _id: target.businessId }), 0);
    assert.equal(await User.countDocuments({ businessId: target.businessId }), 0);
    assert.equal(await AuditLog.countDocuments({ businessId: target.businessId }), 0);
    assert.equal(await AIConversation.countDocuments({ businessId: target.businessId }), 0);
    assert.equal(await AIMessage.countDocuments({ conversationId: conversation._id }), 0);
    assert.equal(await Session.countDocuments({ userId: target.userId }), 0);

    // The caller's token grants nothing at all now: its account row no longer exists.
    const me = await api('GET', '/api/auth/me', { token: target.token });
    assert.equal(me.status, 401);

    // AND THE OTHER TENANT IS UNTOUCHED — the teardown is anchored on one businessId.
    assert.ok(await Business.findById(bystander.businessId));
    const bystanderUser = await User.findById(bystander.userId).lean();
    assert.equal(bystanderUser.status, 'ACTIVE');
    assert.equal((await api('GET', '/api/auth/me', { token: bystanderSession })).status, 200);
  });

  it('refuses while another member remains, and a second owner unlocks the account-only path', async () => {
    const target = await freshOwner();
    const member = await createMember(target, 'STAFF');

    const res = await api('DELETE', '/api/auth/me', {
      token: target.token,
      body: { confirmation: 'DELETE', currentPassword: 'Password123!' },
    });

    // Somebody else still uses this business, and they are not an owner: deleting this
    // person would leave it ownerless, which is the one refusal that remains.
    assert.equal(res.status, 409);
    assert.equal(res.json.code, LAST_OWNER_TRANSFER_REQUIRED);
    assert.equal((await User.findById(target.userId)).status, 'ACTIVE');
    assert.ok(await Business.findById(target.businessId));

    // A SECOND ACTIVE OWNER UNLOCKS IT, which is the whole point of the rule, and the
    // business and its staff survive this time.
    const coOwner = await User.create({
      businessId: target.businessId,
      name: uniqueName('CoOwner'),
      email: uniqueEmail('coowner'),
      passwordHash: await bcrypt.hash('Password123!', 10),
      role: 'OWNER',
      status: 'ACTIVE',
    });
    tracker.trackUser(coOwner._id);

    const retry = await api('DELETE', '/api/auth/me', {
      token: target.token,
      body: { confirmation: 'DELETE', currentPassword: 'Password123!' },
    });
    assert.equal(retry.status, 200, JSON.stringify(retry.json));
    assert.equal(retry.json.deleted, true);

    assert.ok(await Business.findById(target.businessId), 'the business is NOT closed');
    assert.equal((await User.findById(coOwner._id)).status, 'ACTIVE');
    assert.equal((await User.findById(member.id)).status, 'ACTIVE');
    const tombstone = await User.findById(target.userId).lean();
    assert.equal(tombstone.status, 'DELETED');
  });

  it('★ deletes an account as a tombstone, erases its identity and keeps an anonymous trail', async () => {
    const target = await deletableOwner();
    const originalEmail = (await User.findById(target.userId)).email;

    // Evidence that must be erased.
    const conversation = await AIConversation.create({
      businessId: target.businessId,
      userId: target.userId,
      title: 'A question about stock',
    });
    await AIMessage.create({
      conversationId: conversation._id,
      role: 'USER',
      content: 'How many do I have?',
    });
    await PasswordResetToken.create({
      userId: target.userId,
      tokenHash: 'deadbeef',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await PasswordResetChallenge.create({
      emailHmac: 'hmac',
      userId: target.userId,
      codeHmac: 'code',
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await AuditLog.create({
      businessId: target.businessId,
      userId: target.userId,
      action: 'PRODUCT_CREATED',
      entityType: 'PRODUCT',
      entityId: new mongoose.Types.ObjectId().toString(),
      metadata: {},
    });

    const res = await api('DELETE', '/api/auth/me', {
      token: target.token,
      body: { confirmation: 'DELETE', currentPassword: 'Password123!' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.deleted, true);
    assert.equal(res.json.changed, true);
    // Nothing about the account is echoed back.
    assert.deepEqual(Object.keys(res.json).sort(), ['changed', 'deleted']);

    const tombstone = await User.findById(target.userId).select('+passwordHash').lean();
    assert.equal(tombstone.status, 'DELETED');
    assert.equal(tombstone.name, DELETED_USER_NAME);
    assert.equal(tombstone.email, `deleted+${String(target.userId)}@${DELETED_EMAIL_DOMAIN}`);
    assert.ok(tombstone.deletedAt instanceof Date);
    assert.equal(tombstone.passwordHash, undefined, 'no credential may survive');
    assert.equal(tombstone.firebaseUid, undefined, 'no identity link may survive');
    assert.equal(tombstone.emailVerified, false);
    assert.equal(tombstone.businessId.toString(), target.businessId, 'the business stays');

    assert.equal(await Session.countDocuments({ userId: target.userId }), 0);
    assert.equal(await PasswordResetToken.countDocuments({ userId: target.userId }), 0);
    assert.equal(await PasswordResetChallenge.countDocuments({ userId: target.userId }), 0);
    assert.equal(await AIConversation.countDocuments({ userId: target.userId }), 0);
    assert.equal(await AIMessage.countDocuments({ conversationId: conversation._id }), 0);

    // The trail survives, and it no longer names the person.
    assert.equal(await AuditLog.countDocuments({ userId: target.userId }), 0);
    const anonymized = await AuditLog.findOne({
      businessId: target.businessId,
      action: 'PRODUCT_CREATED',
    }).lean();
    assert.ok(anonymized, 'the business’s audit history must survive the deletion');
    assert.equal(anonymized.userId, null);

    const deletionRow = await AuditLog.findOne({
      businessId: target.businessId,
      action: 'ACCOUNT_DELETED',
    }).lean();
    assert.ok(deletionRow, 'the deletion must be visible in the trail');
    assert.equal(deletionRow.userId, null, 'the deletion row must not re-identify the account');
    assert.equal(String(deletionRow.entityId), String(target.userId));

    // The old session and the old token are dead. `requireAuth` refuses a non-ACTIVE
    // account with 403 (the same answer a disabled account gets) before it ever reaches
    // the session check, which is the correct outcome here: the token grants nothing.
    const me = await api('GET', '/api/auth/me', { token: target.token });
    assert.equal(me.status, 403);
    assert.equal(me.json.code, 'ACCOUNT_DISABLED');
    assert.equal(await Session.countDocuments({ userId: target.userId }), 0);

    // And the real address is FREE — the tombstone gave it up, so somebody can register
    // with the same address again. A placeholder that kept the original would preserve
    // exactly the identifier deletion promised to remove.
    const reuse = await api('POST', '/api/auth/register', {
      body: {
        businessName: uniqueName('Reuse'),
        name: uniqueName('Person'),
        email: originalEmail,
        password: 'Password123!',
      },
    });
    assert.equal(reuse.status, 201, JSON.stringify(reuse.json));
    tracker.trackBusiness(reuse.json.business.id);
    tracker.trackUser(reuse.json.user.id);
  });

  it('★ erases the name and email an audit row kept ABOUT the person, and only theirs', async () => {
    // Found by review on 2026-10-25: `users.service.create` records USER_CREATED with
    // `metadata: { name, email, role }`, and the tombstone only cleared the row's `userId`.
    // The business's audit viewer therefore still showed the deleted person's real address —
    // exactly what the deletion screen, the public page and the privacy policy say is removed.
    // The existing tombstone case could not see it because its audit fixture had no metadata.
    const owner = await freshOwner();
    const leaverEmail = uniqueEmail('leaver');
    const leaver = await User.create({
      businessId: owner.businessId,
      name: uniqueName('Leaver'),
      email: leaverEmail,
      passwordHash: await bcrypt.hash('Password123!', 4),
      role: 'STAFF',
      status: 'ACTIVE',
    });
    const colleague = await User.create({
      businessId: owner.businessId,
      name: uniqueName('Colleague'),
      email: uniqueEmail('colleague'),
      passwordHash: await bcrypt.hash('Password123!', 4),
      role: 'STAFF',
      status: 'ACTIVE',
    });

    for (const [created, role] of [
      [leaver, 'STAFF'],
      [colleague, 'STAFF'],
    ]) {
      await AuditLog.create({
        businessId: owner.businessId,
        userId: owner.userId,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: String(created._id),
        metadata: { name: created.name, email: created.email, role },
      });
    }

    const result = await deleteOwnAccount({
      userId: String(leaver._id),
      confirmation: DELETE_CONFIRMATION_PHRASE,
      currentPassword: 'Password123!',
    });
    assert.equal(result.changed, true);

    const aboutLeaver = await AuditLog.findOne({
      businessId: owner.businessId,
      entityType: 'USER',
      entityId: String(leaver._id),
    }).lean();
    assert.ok(aboutLeaver, 'the creation row survives as a governance record of the business');
    assert.equal(aboutLeaver.metadata?.email, undefined, 'the deleted address must not stay readable');
    assert.equal(aboutLeaver.metadata?.name, undefined, 'the deleted name must not stay readable');
    assert.equal(aboutLeaver.metadata?.role, 'STAFF', 'the non-personal fact is kept');
    assert.equal(
      String(aboutLeaver.userId),
      String(owner.userId),
      'the actor of that row is somebody else and must not be anonymized'
    );

    // Over-reach control: the colleague's row is about a different person and is untouched.
    const aboutColleague = await AuditLog.findOne({
      businessId: owner.businessId,
      entityType: 'USER',
      entityId: String(colleague._id),
    }).lean();
    assert.equal(aboutColleague.metadata.email, colleague.email);
    assert.equal(aboutColleague.metadata.name, colleague.name);
  });

  it('converges on a repeat deletion instead of failing or repeating the work', async () => {
    const target = await deletableOwner();
    const first = await deleteOwnAccount({
      userId: target.userId,
      confirmation: 'DELETE',
      currentPassword: 'Password123!',
    });
    assert.equal(first.changed, true);

    // No credential is supplied on the second call — the early return must not ask for
    // one, because the account it would verify no longer has any.
    const second = await deleteOwnAccount({ userId: target.userId, confirmation: 'DELETE' });
    assert.equal(second.deleted, true);
    assert.equal(second.changed, false);
    assert.equal(second.firebaseIdentityDeleted, false);
  });

  it('leaves another business and its members completely untouched', async () => {
    const victim = await deletableOwner();
    const bystander = await freshOwner();
    const bystanderSession = await issueSessionToken(bystander.userId, { deviceLabel: 'test' });
    const victimBusinessId = victim.businessId;

    const res = await api('DELETE', '/api/auth/me', {
      token: victim.token,
      body: { confirmation: 'DELETE', currentPassword: 'Password123!' },
    });
    assert.equal(res.status, 200);

    assert.equal((await User.findById(bystander.userId)).status, 'ACTIVE');
    assert.ok(await Business.findById(bystander.businessId));
    assert.ok(await Business.findById(victimBusinessId), 'the business row itself is kept');

    const me = await api('GET', '/api/auth/me', { token: bystanderSession });
    assert.equal(me.status, 200, 'a session in another business must still work');
    assert.ok(await Session.countDocuments({ userId: bystander.userId }));
  });

  it('hides a deleted member from the user-management surface', async () => {
    const ownerSession = await freshOwner();
    const member = await createMember(ownerSession);

    const login = await api('POST', '/api/auth/login', {
      body: { email: member.email, password: member.password },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));

    const del = await api('DELETE', '/api/auth/me', {
      token: login.json.token,
      body: { confirmation: 'DELETE', currentPassword: member.password },
    });
    assert.equal(del.status, 200, JSON.stringify(del.json));

    const list = await api('GET', '/api/users?q=' + encodeURIComponent(member.email), {
      token: ownerSession.token,
    });
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 0, 'a deleted member must not be listed');
    assert.equal(list.json.items.length, 0);

    const direct = await api('GET', `/api/users/${member.id}`, { token: ownerSession.token });
    assert.equal(direct.status, 404);
  });

  it('★ a Firebase-linked account must prove the matching Firebase identity', async () => {
    const target = await deletableOwner();
    const uid = `uid-${new mongoose.Types.ObjectId().toString()}`;
    await User.updateOne({ _id: target.userId }, { $set: { firebaseUid: uid } });

    const deletedUids = [];
    resetFirebaseIdTokenVerifier();
    resetFirebaseUserDeleter();
    setFirebaseIdTokenVerifier(async () => ({
      uid: 'somebody-else',
      email: 'other@example.com',
      email_verified: true,
    }));
    setFirebaseUserDeleter(async (deletedUid) => {
      deletedUids.push(deletedUid);
      return { uid: deletedUid };
    });

    try {
      const wrong = await api('DELETE', '/api/auth/me', {
        token: target.token,
        body: { confirmation: 'DELETE', idToken: 'a-token-for-somebody-else' },
      });

      assert.equal(wrong.status, 409);
      assert.equal(wrong.json.code, FIREBASE_IDENTITY_CONFLICT);
      assert.equal(deletedUids.length, 0, 'nothing may be deleted for a mismatched identity');
      assert.equal((await User.findById(target.userId)).status, 'ACTIVE');

      // AND WITHOUT ANY CREDENTIAL: a Firebase-only account has no password to check, so
      // it must not fall through to the password branch.
      const noCredential = await api('DELETE', '/api/auth/me', {
        token: target.token,
        body: { confirmation: 'DELETE' },
      });
      assert.equal(noCredential.status, 400);
      assert.equal(deletedUids.length, 0);
      assert.equal((await User.findById(target.userId)).status, 'ACTIVE');

      setFirebaseIdTokenVerifier(async () => ({
        uid,
        email: 'owner@example.com',
        email_verified: true,
      }));

      const ok = await api('DELETE', '/api/auth/me', {
        token: target.token,
        body: { confirmation: 'DELETE', idToken: 'the-owners-own-token' },
      });
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      assert.deepEqual(deletedUids, [uid], 'the provider identity must be deleted once');
    } finally {
      resetFirebaseIdTokenVerifier();
      resetFirebaseUserDeleter();
    }
  });

  it('keeps the account when the provider refuses to delete the identity', async () => {
    const target = await deletableOwner();
    const uid = `uid-${new mongoose.Types.ObjectId().toString()}`;
    await User.updateOne({ _id: target.userId }, { $set: { firebaseUid: uid } });

    setFirebaseIdTokenVerifier(async () => ({ uid, email: 'x@example.com', email_verified: true }));
    setFirebaseUserDeleter(async () => {
      const failure = new Error('upstream said no');
      failure.code = 'app/network-error';
      throw failure;
    });

    try {
      const res = await api('DELETE', '/api/auth/me', {
        token: target.token,
        body: { confirmation: 'DELETE', idToken: 'token' },
      });

      assert.equal(res.status, 503);
      assert.equal(res.json.code, 'FIREBASE_UNAVAILABLE');
      // The tombstone MUST NOT be written when the identity could not be removed: a
      // deleted account that can still sign in is the failure this order prevents.
      assert.equal((await User.findById(target.userId)).status, 'ACTIVE');
      const me = await api('GET', '/api/auth/me', { token: target.token });
      assert.equal(me.status, 200);
    } finally {
      resetFirebaseIdTokenVerifier();
      resetFirebaseUserDeleter();
    }
  });

  it('limits repeated attempts per account', async () => {
    const target = await deletableOwner();
    let last;
    for (let i = 0; i < 10; i += 1) {
      last = await api('DELETE', '/api/auth/me', {
        token: target.token,
        body: { confirmation: 'wrong-word', currentPassword: 'Password123!' },
      });
      if (last.status === 429) break;
    }

    assert.equal(last.status, 429, 'the destructive route must be budgeted');
    assert.equal(last.json.code, 'ACCOUNT_DELETION_RATE_LIMITED');
    assert.equal((await User.findById(target.userId)).status, 'ACTIVE');
  });

});
