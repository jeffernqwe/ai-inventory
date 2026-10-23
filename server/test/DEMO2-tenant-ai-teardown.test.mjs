// DEMO-2 — a tenant teardown removes the assistant's own history.
//
// Found on 2026-10-23 while deleting a production demo tenant after a device run:
// `clearTenantData` covered inventory, products, categories, locations, suppliers and
// purchase orders, but not `ai_conversations` / `ai_messages`. The teardown printed
// "leftovers: 0 — verified over every tenant collection" while three conversations and
// eight messages from the run stayed behind.
//
// The reason it needs an extra step rather than another row in TENANT_DATA_COLLECTIONS:
// a conversation carries `businessId`, but a MESSAGE does not — it points at its
// conversation. So the conversations have to be resolved first and their messages
// deleted by `conversationId`, before the conversations themselves.

import { it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { dbSuite } from './testEnv.mjs';
import { ensureDb, disconnectDb } from './helpers.mjs';
import Product from '../src/models/product.model.ts';
import AIConversation from '../src/models/aiConversation.model.ts';
import AIMessage from '../src/models/aiMessage.model.ts';
import { clearTenantData, countTenantLeftovers } from '../scripts/perf/lib.mjs';

const oid = () => new mongoose.Types.ObjectId();
const targetBusiness = oid();
const keeperBusiness = oid();
const targetUser = oid();
const keeperUser = oid();

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

const dbOk = await ensureDb();

dbSuite('DEMO-2 a tenant teardown takes the assistant history with it', dbOk, () => {
  beforeEach(async () => {
    await ensureDb();
    await Promise.all([
      AIConversation.deleteMany({ businessId: { $in: [targetBusiness, keeperBusiness] } }),
      Product.deleteMany({ businessId: { $in: [targetBusiness, keeperBusiness] } }),
    ]);
    await AIMessage.deleteMany({ content: /stock do we hold|112 units/ });
  });

  // Inside the suite, so a unit run (where dbSuite never registers the tests) does not
  // touch a database it deliberately has no connection to.
  after(async () => {
    await Promise.all([
      AIConversation.deleteMany({ businessId: { $in: [targetBusiness, keeperBusiness] } }),
      Product.deleteMany({ businessId: { $in: [targetBusiness, keeperBusiness] } }),
    ]);
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

  it('★ an empty tenant is a no-op that still reports zero, not an error', async () => {
    const result = await clearTenantData([oid()]);
    assert.equal(result.counts.ai_conversations, 0);
    assert.equal(result.counts.ai_messages, 0);
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

