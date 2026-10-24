// Invitation-based onboarding (2026-10-25).
//
// WHY THIS FILE EXISTS. Until now the only way to add a colleague was
// `POST /api/users`, which makes an admin invent a password for somebody else. That is
// both a security smell and the one hard prerequisite for retiring the legacy password
// login. An invitation moves the credential decision to the person who will use it, so the
// properties that matter are all about what the SERVER decides versus what a request can
// say:
//
//   * the tenant and role come from the invitation ROW, never from the acceptance body
//     (which has no such field to send);
//   * acceptance requires a VERIFIED Firebase identity whose address equals the invited
//     one, so a leaked link is inert without the inbox;
//   * one pending invitation per address per business, a re-invite supersedes the token,
//     and revoke makes the token unresolvable;
//   * a failed delivery withdraws the row rather than leaving a member who was never asked;
//   * OWNER is not invitable and an ADMIN cannot invite an ADMIN — the same rules
//     `users.service` enforces on the direct route;
//   * the address never reaches the audit trail, and a deleted account takes its
//     invitations with it.
//
// MIXED: the landing page and the payload/template cases need no database; everything that
// creates, resolves or revokes an invitation does.
//
// No network and no real Firebase project: the verifier is the test seam the production
// code dispatches through, and mail goes to the fake provider.

import 'dotenv/config';

import { it, before, after, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';

import mongoose from 'mongoose';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName, startServer, makeApi, registerOwner } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';

import { createApp } from '../src/app.ts';
import Invitation from '../src/models/invitation.model.ts';
import User from '../src/models/user.model.ts';
import {
  INVITABLE_ROLES,
  INVITATION_TOKEN_LENGTH,
  INVITATION_TTL_DAYS,
  INVITATION_EMAIL_IN_USE,
  INVITATION_EMAIL_MISMATCH,
  INVITATION_INVALID,
} from '../src/constants/invitations.ts';
import { invitationEmail } from '../src/services/mail/templates/invitation.ts';
import {
  renderInvitationLinkPage,
  renderInvitationLinkErrorPage,
  invitationLinkCsp,
} from '../src/pages/invitationLink.ts';
import { validateInvitationCreate } from '../src/utils/validate.ts';
import {
  registerFakeMailProvider,
  deregisterFakeMailProvider,
  setFakeMailScenario,
  sentMessages,
  clearSentMessages,
  fakeMailFailure,
  FAKE_MAIL_PROVIDER,
} from './fakes/mailProvider.mjs';
import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
} from './fakes/firebaseVerifier.mjs';
import { setFirebaseUserDeleter, resetFirebaseUserDeleter } from '../src/services/firebase/index.ts';

// ===========================================================================
// Pure unit: payload rules, the template and the landing page
// ===========================================================================

unitSuite('Invitations — payload, template and landing page (no database)', () => {
  describe('the create payload', () => {
    it('accepts an address and an invitable role, and nothing else is read', () => {
      const v = validateInvitationCreate({ email: 'Person@Example.test', role: 'MANAGER' });
      assert.deepEqual(v.problems, []);
      assert.equal(v.email, 'person@example.test', 'the address is normalized for comparison and mail');
      assert.equal(v.role, 'MANAGER');
      // A body naming a tenant or a user has no field to travel through.
      assert.equal('businessId' in v, false);
      assert.equal('userId' in v, false);
    });

    it('★ refuses OWNER, an unknown role and a missing address', () => {
      assert.equal(validateInvitationCreate({ email: 'a@b.test', role: 'OWNER' }).problems.length, 1);
      assert.equal(validateInvitationCreate({ email: 'a@b.test', role: 'SUPERUSER' }).problems.length, 1);
      assert.equal(validateInvitationCreate({ role: 'STAFF' }).problems.length, 1);
      assert.equal(validateInvitationCreate({ email: 'not-an-address', role: 'STAFF' }).problems.length, 1);
      // The catalogue itself is the list every caller shares.
      assert.deepEqual([...INVITABLE_ROLES], ['ADMIN', 'MANAGER', 'STAFF']);
    });
  });

  describe('the email', () => {
    it('names the business, the inviter and the role in words, and carries both links', () => {
      const token = 'a'.repeat(INVITATION_TOKEN_LENGTH);
      const mail = invitationEmail({
        businessName: 'Acme Supplies',
        inviterName: 'Jane Doe',
        role: 'MANAGER',
        inviteUrl: `https://api.example.test/invite?token=${token}`,
        appUrl: `inventoryai://invite?token=${token}`,
        expiresInDays: INVITATION_TTL_DAYS,
      });

      assert.match(mail.subject, /Acme Supplies/);
      assert.match(mail.text, /Jane Doe/);
      assert.match(mail.text, /manager/, 'the role is a word, not a raw enum');
      assert.match(mail.text, /7 days/);
      assert.ok(mail.text.includes(`https://api.example.test/invite?token=${token}`));
      assert.ok(mail.text.includes(`inventoryai://invite?token=${token}`));
      // It never claims to contain a password, because it must not.
      assert.equal(/password/i.test(mail.text), false);
    });

    it('★ escapes a business or person name rather than rendering markup', () => {
      const mail = invitationEmail({
        businessName: '<img src=x onerror=alert(1)>',
        inviterName: '"><script>alert(2)</script>',
        role: 'STAFF',
        inviteUrl: 'https://api.example.test/invite?token=aa',
      });
      assert.equal(mail.html.includes('<img src=x'), false);
      assert.equal(mail.html.includes('<script>'), false);
      assert.match(mail.html, /&lt;img src=x/);
      // The plain-text half is not HTML, so the same value appears as written and is safe.
      assert.match(mail.text, /<img src=x onerror=alert\(1\)>/);
    });

    it('refuses to render a message with no working link', () => {
      assert.throws(() => invitationEmail({ businessName: 'Acme', role: 'STAFF' }));
    });
  });

  describe('the landing page', () => {
    const TOKEN = 'b'.repeat(INVITATION_TOKEN_LENGTH);

    it('forwards a well-formed token to the app scheme and nothing else', () => {
      const html = renderInvitationLinkPage(TOKEN);
      assert.ok(html.includes(`inventoryai://invite?token=${TOKEN}`));
      assert.equal(/<script/i.test(html), false, 'no script is needed or allowed');
      assert.equal(/<form/i.test(html), false);
      // The only hrefs are the app link; no external asset is referenced.
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(hrefs, [`inventoryai://invite?token=${TOKEN}`]);
    });

    it('★ never reflects a crafted token — the error page carries no request value', () => {
      const html = renderInvitationLinkErrorPage();
      assert.equal(html.includes('javascript:'), false);
      assert.equal(html.includes('inventoryai://'), false);
      assert.match(html, /not usable/);
      // And a valid-shaped token is the ONLY thing that reaches the attribute, because
      // the route checks the shape before calling the renderer.
      assert.ok(invitationLinkCsp().includes("style-src 'sha256-"));
      assert.equal(invitationLinkCsp().includes("script-src"), false);
    });

    it('is served without a session, with no-store and no-referrer, and refuses a bad token', async () => {
      const app = createApp();
      const server = app.listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        const good = await fetch(`${base}/invite?token=${TOKEN}`);
        assert.equal(good.status, 200);
        assert.match(good.headers.get('cache-control') || '', /no-store/);
        assert.equal(good.headers.get('referrer-policy'), 'no-referrer');
        assert.equal(good.headers.get('x-content-type-options'), 'nosniff');
        assert.match(good.headers.get('content-security-policy') || '', /default-src 'none'/);
        assert.ok((await good.text()).includes(TOKEN));

        const bad = await fetch(`${base}/invite?token=${'z'.repeat(64)}`);
        assert.equal(bad.status, 400);
        assert.equal((await bad.text()).includes('z'.repeat(64)), false);

        const missing = await fetch(`${base}/invite`);
        assert.equal(missing.status, 400);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});

// ===========================================================================
// Database-backed: the flow over the real application
// ===========================================================================

const dbOk = await ensureDb();

dbSuite('Invitations — create, list, revoke, preview and accept', dbOk, () => {
  const tracker = createTracker(dbOk);
  let server = null;
  let api = null;

  before(async () => {
    const started = await startServer();
    server = started.server;
    api = makeApi(started.baseUrl);
    registerFakeMailProvider();
    registerFakeFirebaseVerifier();
    // The deletion case needs the provider DELETE to succeed offline, exactly as the
    // account-deletion suite arranges it.
    setFirebaseUserDeleter(async () => ({ deleted: true }));
    process.env.MAIL_PROVIDER = FAKE_MAIL_PROVIDER;
    process.env.MAIL_FROM = 'no-reply@example.test';
  });

  after(async () => {
    await tracker.cleanup();
    await new Promise((resolve) => server?.close(resolve));
    deregisterFakeMailProvider();
    deregisterFakeFirebaseVerifier();
    resetFirebaseUserDeleter();
    await disconnectDb();
  });

  beforeEach(() => {
    clearSentMessages();
    setFakeMailScenario(null);
  });

  afterEach(() => {
    setFakeMailScenario(null);
  });

  /** An owner plus their token. */
  async function owner() {
    return registerOwner(api, tracker);
  }

  async function invite(token, body) {
    return api('POST', '/api/invitations', { token, body });
  }

  it('★ creates an invitation, mails it, and stores a digest rather than the token', async () => {
    const me = await owner();
    const email = uniqueEmail('invitee');

    const res = await invite(me.token, { email, role: 'MANAGER' });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(res.json.email, email.toLowerCase());
    assert.equal(res.json.role, 'MANAGER');
    assert.equal(res.json.id.length, 24);

    // The mail was actually attempted, to the invited address, and carries the token.
    const [mail] = sentMessages();
    assert.ok(mail, 'the invitation mail was not sent');
    assert.equal(mail.to, email.toLowerCase());
    const match = mail.text.match(/\/invite\?token=([a-f0-9]{64})/);
    assert.ok(match, 'the mail carries no invitation link');
    assert.ok(mail.text.includes(`inventoryai://invite?token=${match[1]}`));

    // The row holds the digest, not the token, and the token is not readable by a query
    // that does not ask for it.
    const row = await Invitation.findById(res.json.id).select('+tokenHash').lean();
    assert.notEqual(row.tokenHash, match[1]);
    assert.equal(row.tokenHash.length, 64);
    assert.equal(row.status, 'PENDING');
    assert.equal(String(row.businessId), me.businessId);

    // The audit row records the fact and the role, never the address.
    // `recordAudit` stringifies entityId, so the filter is the string id.
    const audits = await mongoose.connection.db
      .collection('audit_logs')
      .find({ action: 'INVITATION_SENT', entityId: res.json.id })
      .toArray();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].metadata.role, 'MANAGER');
    assert.equal(JSON.stringify(audits[0].metadata).includes(email), false);

    // The list shows it; a second owner sees none of it.
    const listed = await api('GET', '/api/invitations', { token: me.token });
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.json.items.map((i) => i.id), [res.json.id]);

    const other = await owner();
    const otherList = await api('GET', '/api/invitations', { token: other.token });
    assert.deepEqual(otherList.json.items, []);
  });

  it('★ supersedes a pending invitation instead of accumulating links', async () => {
    const me = await owner();
    const email = uniqueEmail('repeat');

    const first = await invite(me.token, { email, role: 'STAFF' });
    const second = await invite(me.token, { email, role: 'MANAGER' });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.json.id, first.json.id, 'the pending row is reused, not duplicated');

    const rows = await Invitation.countDocuments({ businessId: me.businessId, email: email.toLowerCase() });
    assert.equal(rows, 1);
    assert.equal(second.json.role, 'MANAGER');

    const tokens = sentMessages().map((m) => m.text.match(/\/invite\?token=([a-f0-9]{64})/)[1]);
    assert.equal(tokens.length, 2);
    assert.notEqual(tokens[0], tokens[1], 'a re-invite mints a new token');

    // The FIRST token no longer resolves; the second does.
    const oldPreview = await api('GET', `/api/auth/invitation?token=${tokens[0]}`);
    assert.equal(oldPreview.status, 404);
    assert.equal(oldPreview.json.code, INVITATION_INVALID);
    const newPreview = await api('GET', `/api/auth/invitation?token=${tokens[1]}`);
    assert.equal(newPreview.status, 200);
    assert.equal(newPreview.json.role, 'MANAGER');
  });

  it('★ preview discloses only what the inbox holder already knows', async () => {
    const me = await owner();
    const email = uniqueEmail('preview');
    await invite(me.token, { email, role: 'STAFF' });
    const token = sentMessages()[0].text.match(/\/invite\?token=([a-f0-9]{64})/)[1];

    const res = await api('GET', `/api/auth/invitation?token=${token}`);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json).sort(), ['businessName', 'email', 'expiresAt', 'role']);
    assert.equal(res.json.email, email.toLowerCase());

    // Shape is refused before any lookup; a well-formed unknown token is the one generic 404.
    const malformed = await api('GET', '/api/auth/invitation?token=nope');
    assert.equal(malformed.status, 400);
    const unknown = await api('GET', `/api/auth/invitation?token=${'c'.repeat(64)}`);
    assert.equal(unknown.status, 404);
    assert.equal(unknown.json.code, INVITATION_INVALID);
  });

  it('★ an expired invitation resolves to the same generic refusal', async () => {
    const me = await owner();
    await invite(me.token, { email: uniqueEmail('expired'), role: 'STAFF' });
    const token = sentMessages()[0].text.match(/\/invite\?token=([a-f0-9]{64})/)[1];
    const row = await Invitation.findOne({ businessId: me.businessId });
    row.expiresAt = new Date(Date.now() - 1000);
    await row.save();

    const res = await api('GET', `/api/auth/invitation?token=${token}`);
    assert.equal(res.status, 404);
    assert.equal(res.json.code, INVITATION_INVALID);
  });

  it('★ revoking is tenant-scoped, by the caller’s own business', async () => {
    const me = await owner();
    const other = await owner();
    await invite(me.token, { email: uniqueEmail('revoke'), role: 'STAFF' });
    const id = (await Invitation.findOne({ businessId: me.businessId }))._id;

    // A foreign admin cannot even see it, let alone revoke it.
    const foreign = await api('DELETE', `/api/invitations/${id}`, { token: other.token });
    assert.equal(foreign.status, 404);

    const revoked = await api('DELETE', `/api/invitations/${id}`, { token: me.token });
    assert.equal(revoked.status, 204);

    const issued = sentMessages()[0].text.match(/\/invite\?token=([a-f0-9]{64})/)[1];
    const preview = await api('GET', `/api/auth/invitation?token=${issued}`);
    assert.equal(preview.status, 404);

    // Revoking twice is a 404: the row is no longer PENDING.
    const again = await api('DELETE', `/api/invitations/${id}`, { token: me.token });
    assert.equal(again.status, 404);

    const listed = await api('GET', '/api/invitations', { token: me.token });
    assert.deepEqual(listed.json.items, []);
  });

  it('★ a delivery failure withdraws the invitation rather than leaving a promise nobody received', async () => {
    const me = await owner();
    setFakeMailScenario(fakeMailFailure());

    const res = await invite(me.token, { email: uniqueEmail('undeliverable'), role: 'STAFF' });
    assert.equal(res.status, 502);
    assert.equal(
      await Invitation.countDocuments({ businessId: me.businessId }),
      0,
      'the row must not outlive the message that would have made it actionable'
    );

    // A delivered invitation is still possible afterwards.
    setFakeMailScenario(null);
    const retry = await invite(me.token, { email: uniqueEmail('deliverable'), role: 'STAFF' });
    assert.equal(retry.status, 201);
  });

  it('★ refuses a role the caller may not assign and an address that is already a member', async () => {
    const me = await owner();
    assert.equal((await invite(me.token, { email: uniqueEmail('r'), role: 'OWNER' })).status, 400);

    const existing = await api('POST', '/api/users', {
      token: me.token,
      body: { name: uniqueName('Member'), email: uniqueEmail('member'), password: 'Password123!', role: 'STAFF' },
    });
    assert.equal(existing.status, 201);
    const res = await invite(me.token, { email: existing.json.email, role: 'STAFF' });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, INVITATION_EMAIL_IN_USE);

    // An ADMIN may not invite an ADMIN — the same rule as direct creation.
    const admin = await makeAdmin(me);
    const escalate = await invite(admin, { email: uniqueEmail('admin2'), role: 'ADMIN' });
    assert.equal(escalate.status, 403);
    assert.equal(escalate.json.code, 'ADMIN_RESTRICTED');
  });

  /** Creates an ADMIN in `me`'s business and returns their token. */
  async function makeAdmin(me) {
    const created = await api('POST', '/api/users', {
      token: me.token,
      body: { name: uniqueName('Admin'), email: uniqueEmail('admin'), password: 'Password123!', role: 'ADMIN' },
    });
    assert.equal(created.status, 201);
    tracker.trackUser(created.json.id);
    const login = await api('POST', '/api/auth/login', {
      body: { email: created.json.email, password: 'Password123!' },
    });
    assert.equal(login.status, 200);
    return login.json.token;
  }

  it('★ accepting requires a VERIFIED identity for the INVITED address, and joins that business', async () => {
    const me = await owner();
    const email = uniqueEmail('joiner');
    const created = await invite(me.token, { email, role: 'MANAGER' });
    assert.equal(created.status, 201);
    const token = sentMessages()[0].text.match(/\/invite\?token=([a-f0-9]{64})/)[1];


    // 1. An unverified identity is refused before any lookup or write.
    setFakeFirebaseToken({ uid: uniqueName('uid'), email, email_verified: false });
    const unverified = await api('POST', '/api/auth/firebase/register', {
      body: { idToken: 'fake', invitationToken: token },
    });
    assert.equal(unverified.status, 400);
    assert.equal(await User.countDocuments({ email }), 0);

    // 2. A verified identity for a DIFFERENT address cannot spend somebody else's link.
    setFakeFirebaseToken({ uid: uniqueName('uid'), email: uniqueEmail('stranger'), email_verified: true });
    const wrongAddress = await api('POST', '/api/auth/firebase/register', {
      body: { idToken: 'fake', invitationToken: token },
    });
    assert.equal(wrongAddress.status, 403);
    assert.equal(wrongAddress.json.code, INVITATION_EMAIL_MISMATCH);
    assert.equal(await User.countDocuments({ email }), 0);

    // 3. The invited address succeeds — no business is created, the role is the invited one.
    const uid = uniqueName('uid');
    setFakeFirebaseToken({ uid, email, email_verified: true });
    const accepted = await api('POST', '/api/auth/firebase/register', {
      body: { idToken: 'fake', invitationToken: token, name: 'New Joiner' },
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.json));
    assert.equal(accepted.json.business.id, me.businessId, 'joined the inviting business');
    assert.equal(accepted.json.user.role, 'MANAGER');
    // NO SECOND BUSINESS, asserted on the business this test OWNS rather than on the
    // collection's total: node:test runs test FILES concurrently, so a global count is
    // decided by whatever another suite is doing at the same instant (measured: this line
    // passed alone and failed in a four-file run). A second tenant would have left the
    // inviting business with its owner alone, so its member count is the honest check.
    assert.equal(
      await User.countDocuments({ businessId: me.businessId }),
      2,
      'the invited identity joined the inviting business instead of starting one'
    );

    const user = await User.findOne({ email });
    assert.equal(user.firebaseUid, uid);
    assert.equal(user.emailVerified, true);
    assert.equal(user.status, 'ACTIVE');
    tracker.trackUser(String(user._id));

    const row = await Invitation.findById(created.json.id);
    assert.equal(row.status, 'ACCEPTED');
    assert.equal(String(row.acceptedBy), String(user._id));
    assert.ok(row.acceptedAt);

    // 4. Replaying the link does not manufacture a second account or move the person.
    const replay = await api('POST', '/api/auth/firebase/register', {
      body: { idToken: 'fake', invitationToken: token },
    });
    assert.equal(replay.status, 409, 'an existing account is refused before the link is read');
    assert.equal(await User.countDocuments({ email }), 1);
    // Still exactly the two members, and still no tenant of their own.
    assert.equal(await User.countDocuments({ businessId: me.businessId }), 2);
  });

  it('★ a spent or revoked link cannot be replayed by a new identity', async () => {
    const me = await owner();
    const email = uniqueEmail('revoked-link');
    await invite(me.token, { email, role: 'STAFF' });
    const token = sentMessages()[0].text.match(/\/invite\?token=([a-f0-9]{64})/)[1];
    await api('DELETE', `/api/invitations/${(await Invitation.findOne({ businessId: me.businessId }))._id}`, {
      token: me.token,
    });

    setFakeFirebaseToken({ uid: uniqueName('uid'), email, email_verified: true });
    const res = await api('POST', '/api/auth/firebase/register', {
      body: { idToken: 'fake', invitationToken: token },
    });
    assert.equal(res.status, 404);
    assert.equal(res.json.code, INVITATION_INVALID);
    assert.equal(await User.countDocuments({ email }), 0);
  });

  it('★ closing an account removes the invitations addressed to it', async () => {
    const me = await owner();
    const email = uniqueEmail('delete-me');
    await invite(me.token, { email, role: 'STAFF' });
    const token = sentMessages()[0].text.match(/\/invite\?token=([a-f0-9]{64})/)[1];

    // Accept, so the row is ACCEPTED and still holds the address.
    const uid = uniqueName('uid');
    setFakeFirebaseToken({ uid, email, email_verified: true });
    const accepted = await api('POST', '/api/auth/firebase/register', {
      body: { idToken: 'fake', invitationToken: token, name: 'Leaver' },
    });
    assert.equal(accepted.status, 201);
    const userId = accepted.json.user.id;
    tracker.trackUser(userId);

    // The person signs in and deletes their own account through the real flow.
    const login = await api('POST', '/api/auth/firebase/exchange', {
      body: { idToken: 'fake' },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));

    const deleted = await api('DELETE', '/api/auth/me', {
      token: login.json.token,
      body: { confirmation: 'DELETE', idToken: 'fake' },
    });
    // The exact body contract lives in ACCOUNT-DELETION.test.mjs; here only the invitation
    // consequence matters. If the deletion route is unhappy with this payload the case says
    // so rather than silently passing.
    assert.equal(deleted.status, 200, JSON.stringify(deleted.json));

    assert.equal(
      await Invitation.countDocuments({ email }),
      0,
      'an invitation naming a closed account must not survive it'
    );
  });
});
