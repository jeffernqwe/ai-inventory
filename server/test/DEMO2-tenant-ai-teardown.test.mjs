// DEMO-2 — a tenant teardown removes everything that belongs to the tenant.
//
// Found on 2026-10-23 while deleting a production demo tenant after a device run:
// `clearTenantData` covered inventory, products, categories, locations, suppliers and
// purchase orders, but not `ai_conversations` / `ai_messages`. The teardown printed
// "leftovers: 0 — verified over every tenant collection" while three conversations and
// eight messages from the run stayed behind. Auditing the same list against the models
// then found two more gaps: `audit_logs` (which carries businessId) and the
// account-scoped rows a tenant owns indirectly — `sessions`, `password_reset_tokens`
// and `password_reset_challenges` (each carries only `userId`).
//
// Why these need more than another row in TENANT_DATA_COLLECTIONS:
//   * a MESSAGE has no businessId — it points at its conversation, so conversations
//     must be resolved first and messages deleted by `conversationId`;
//   * sessions and reset credentials have no businessId either, so the whole tenant's
//     user ids must be resolved before the users are deleted.

import { it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { dbSuite } from './testEnv.mjs';
import { ensureDb, disconnectDb } from './helpers.mjs';
import AuditLog from '../src/models/auditLog.model.ts';
import Business from '../src/models/business.model.ts';
import PasswordResetChallenge from '../src/models/passwordResetChallenge.model.ts';
import PasswordResetToken from '../src/models/passwordResetToken.model.ts';
import Product from '../src/models/product.model.ts';
import Session from '../src/models/session.model.ts';
import User from '../src/models/user.model.ts';
import AIConversation from '../src/models/aiConversation.model.ts';
import AIMessage from '../src/models/aiMessage.model.ts';
import {
  clearTenantData,
  countTenantDataRemoval,
  countTenantLeftovers,
  countTenantRemoval,
  removeTenant,
} from '../scripts/perf/lib.mjs';

const oid = () => new mongoose.Types.ObjectId();
const targetBusiness = oid();
const keeperBusiness = oid();
const targetUser = oid();
const keeperUser = oid();

const TARGET_EMAIL = 'demo2-target@example.invalid';
const KEEPER_EMAIL = 'demo2-keeper@example.invalid';
const TARGET_NAME = 'DEMO2 Teardown Target';
const KEEPER_NAME = 'DEMO2 Teardown Keeper';

async function seedTenant(businessId, userId, productName) {
  const conversation = await AIConversation.create({ businessId, userId, title: `conv ${productName}` });
  const messages = await AIMessage.create([
    { conversationId: conversation._id, role: 'USER', content: 'how much stock do we hold?' },
    { conversationId: conversation._id, role: 'ASSISTANT', content: '112 units.', model: 'test-model' },
  ]);
  const product = await Product.create({
    businessId,
    name: productName,
    sku: `DEMO2-${String(productName).slice(0, 6)}`,
    unit: 'unit',
    costPrice: 1,
    sellingPrice: 2,
  });
  return { conversation, messages, product };
}

/** A whole tenant: business, one user, a session and one of each reset artefact. */
async function seedAccount(businessId, userId, email, name) {
  const business = await Business.create({ _id: businessId, name });
  const user = await User.create({
    _id: userId,
    businessId: business._id,
    name,
    email,
    role: 'OWNER',
    status: 'ACTIVE',
  });
  const session = await Session.create({
    userId: user._id,
    jti: `demo2-${String(user._id)}`,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const token = await PasswordResetToken.create({
    userId: user._id,
    tokenHash: `demo2-token-${String(user._id)}`,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const challenge = await PasswordResetChallenge.create({
    emailHmac: `demo2-email-${String(user._id)}`,
    userId: user._id,
    codeHmac: `demo2-code-${String(user._id)}`,
    lastSentAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
  });
  return { business, user, session, token, challenge };
}

/** Remove every row these tests could have written, so a re-run starts clean. */
async function resetDemo2() {
  const users = await User.find({ email: { $in: [TARGET_EMAIL, KEEPER_EMAIL] } })
    .select('_id businessId')
    .lean();
  const userIds = users.map((u) => u._id);
  const businessIds = [targetBusiness, keeperBusiness, ...users.map((u) => u.businessId).filter(Boolean)];

  const conversations = await AIConversation.find({ businessId: { $in: businessIds } })
    .select('_id')
    .lean();

  await Promise.all([
    Session.deleteMany({ userId: { $in: userIds } }),
    PasswordResetToken.deleteMany({ userId: { $in: userIds } }),
    PasswordResetChallenge.deleteMany({ userId: { $in: userIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
    Business.deleteMany({ _id: { $in: businessIds } }),
    Product.deleteMany({ businessId: { $in: businessIds } }),
    AuditLog.deleteMany({ businessId: { $in: businessIds } }),
    AIMessage.deleteMany({ conversationId: { $in: conversations.map((c) => c._id) } }),
    AIConversation.deleteMany({ businessId: { $in: businessIds } }),
  ]);
}

const dbOk = await ensureDb();

dbSuite('DEMO-2 a tenant teardown takes everything the tenant owns', dbOk, () => {
  beforeEach(async () => {
    await ensureDb();
    await resetDemo2();
  });

  // Inside the suite, so a unit run (where dbSuite never registers the tests) does not
  // touch a database it deliberately has no connection to.
  after(async () => {
    await resetDemo2();
    await disconnectDb();
  });

  it('★ removes the target tenant’s conversations AND their messages, and counts them', async () => {
    const target = await seedTenant(targetBusiness, targetUser, 'Teardown Target');
    const keeper = await seedTenant(keeperBusiness, keeperUser, 'Teardown Keeper');

    const result = await clearTenantData([targetBusiness]);

    assert.equal(result.counts.ai_conversations, 1, 'the conversation is counted and removed');
    assert.equal(result.counts.ai_messages, 2, 'both messages are counted and removed');
    assert.equal(result.counts.products, 1, 'the previously-covered collections still work');

    assert.equal(await AIConversation.countDocuments({ businessId: targetBusiness }), 0);
    assert.equal(await AIMessage.countDocuments({ conversationId: target.conversation._id }), 0);

    // Isolation: a second tenant's history and catalogue are untouched.
    assert.equal(await AIConversation.countDocuments({ businessId: keeperBusiness }), 1);
    assert.equal(await AIMessage.countDocuments({ conversationId: keeper.conversation._id }), 2);
    assert.equal(await Product.countDocuments({ businessId: keeperBusiness }), 1);
    assert.ok(target.product && keeper.product);

    assert.equal(await countTenantLeftovers([targetBusiness]), 0, 'the verification agrees with the removal');
  });

  it('★ a tenant data reset clears its audit trail, and leaves another tenant’s alone', async () => {
    await AuditLog.create([
      { businessId: targetBusiness, action: 'PRODUCT_CREATED', entityType: 'PRODUCT' },
      { businessId: targetBusiness, action: 'STOCK_IN', entityType: 'INVENTORY' },
      { businessId: keeperBusiness, action: 'PRODUCT_CREATED', entityType: 'PRODUCT' },
    ]);

    const result = await clearTenantData([targetBusiness]);

    assert.equal(result.counts.audit_logs, 2, 'the tenant’s own governance rows go with it');
    assert.equal(await AuditLog.countDocuments({ businessId: targetBusiness }), 0);
    assert.equal(await AuditLog.countDocuments({ businessId: keeperBusiness }), 1);
    assert.equal(await countTenantLeftovers([targetBusiness]), 0);
  });

  it('★ removing a whole tenant takes its sessions and reset credentials with it', async () => {
    const target = await seedAccount(targetBusiness, targetUser, TARGET_EMAIL, TARGET_NAME);
    const keeper = await seedAccount(keeperBusiness, keeperUser, KEEPER_EMAIL, KEEPER_NAME);
    await AuditLog.create({ businessId: targetBusiness, action: 'SESSION_CREATED', entityType: 'SESSION' });

    const result = await removeTenant([targetBusiness]);

    assert.equal(result.counts.sessions, 1, 'the dead session is not left behind');
    assert.equal(result.counts.password_reset_tokens, 1);
    assert.equal(result.counts.password_reset_challenges, 1);
    assert.equal(result.counts.audit_logs, 1);
    assert.equal(result.counts.users, 1);
    assert.equal(result.counts.businesses, 1);

    assert.equal(await Session.countDocuments({ userId: target.user._id }), 0);
    assert.equal(await PasswordResetToken.countDocuments({ userId: target.user._id }), 0);
    assert.equal(await PasswordResetChallenge.countDocuments({ userId: target.user._id }), 0);
    assert.equal(await User.countDocuments({ _id: target.user._id }), 0);
    assert.equal(await Business.countDocuments({ _id: targetBusiness }), 0);

    // Isolation: the other account keeps its session and its single-use credentials.
    assert.equal(await Session.countDocuments({ userId: keeper.user._id }), 1);
    assert.equal(await PasswordResetToken.countDocuments({ userId: keeper.user._id }), 1);
    assert.equal(await PasswordResetChallenge.countDocuments({ userId: keeper.user._id }), 1);
    assert.equal(await Business.countDocuments({ _id: keeperBusiness }), 1);
  });

  it('★ the cleanup dry run counts exactly what the removal deletes, and deletes nothing', async () => {
    const target = await seedAccount(targetBusiness, targetUser, TARGET_EMAIL, TARGET_NAME);
    await seedTenant(targetBusiness, targetUser, 'Dry Run Target');
    await AuditLog.create({ businessId: targetBusiness, action: 'STOCK_IN', entityType: 'INVENTORY' });

    const preview = await countTenantRemoval([targetBusiness]);

    // Nothing moved: the tenant and its login are still there, and the count is why.
    assert.equal(await Business.countDocuments({ _id: targetBusiness }), 1);
    assert.equal(await User.countDocuments({ _id: target.user._id }), 1);
    assert.equal(await AIConversation.countDocuments({ businessId: targetBusiness }), 1);
    assert.equal(
      preview.total,
      Object.values(preview.counts).reduce((sum, count) => sum + count, 0),
      'the total is the sum of the per-collection counts',
    );

    const removal = await removeTenant([targetBusiness]);

    // The dry run is only trustworthy if it describes the REAL run byte for byte.
    assert.deepEqual(preview.counts, removal.counts);
    assert.equal(preview.total, removal.removed);
    assert.equal(await countTenantLeftovers([targetBusiness]), 0);
  });

  it('★ the data-only dry run counts exactly what clearTenantData deletes, and deletes nothing', async () => {
    const target = await seedTenant(targetBusiness, targetUser, 'Data Dry Run');

    const preview = await countTenantDataRemoval([targetBusiness]);

    // The preview must not have touched the rows it counted.
    assert.equal(await AIConversation.countDocuments({ businessId: targetBusiness }), 1);
    assert.equal(await AIMessage.countDocuments({ conversationId: target.conversation._id }), 2);
    assert.equal(await Product.countDocuments({ businessId: targetBusiness }), 1);

    const removal = await clearTenantData([targetBusiness]);
    assert.deepEqual(preview.counts, removal.counts);
    assert.equal(preview.total, removal.removed);
    assert.equal((await countTenantDataRemoval([targetBusiness])).total, 0);
  });

  it('★ an empty tenant is a no-op that still reports zero, not an error', async () => {
    const result = await clearTenantData([oid()]);
    assert.equal(result.counts.ai_conversations, 0);
    assert.equal(result.counts.ai_messages, 0);
    assert.equal(result.counts.audit_logs, 0);
    assert.equal(await countTenantLeftovers([oid()]), 0);
  });

  it('★ the leftover counter sees a conversation the removal never touched', async () => {
    // Positive control: if the AI collections were absent from the counter, this
    // would report 0 and the check above would pass for the wrong reason.
    const orphan = await seedTenant(oid(), oid(), 'Counter Control');
    assert.ok(orphan.conversation);
    // 1 conversation + 2 messages + 1 product: the counter must see all four, which it
    // could not while the AI collections were absent from it.
    assert.equal(await countTenantLeftovers([orphan.conversation.businessId]), 4);
    await AIConversation.deleteMany({ businessId: orphan.conversation.businessId });
    await AIMessage.deleteMany({ conversationId: orphan.conversation._id });
    await Product.deleteMany({ businessId: orphan.conversation.businessId });
  });
});
