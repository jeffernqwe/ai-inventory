// AI-7 — the conversation list is ordered by real activity, not by creation.
//
// THE DEFECT (found on the device 2026-10-14, §27BT). `AIConversation` carries
// `timestamps: true`, `listConversations` sorts on `{ updatedAt: -1, _id: -1 }`, and
// the mobile list renders `formatDateTime(item.updatedAt)`. Both ends were built for
// an "updated at" the server never wrote: the only writes to that collection were
// `AIConversation.create(...)`, so `updatedAt` stayed equal to `createdAt` forever.
// Two consequences, both visible: a conversation continued later did NOT rise in the
// list, and the time beside it was the time it was opened rather than the time it was
// last used — on the phone, a chat continued at 17:14 still read 17:02.
//
// The Phase 20F index comment had already anticipated the difference in so many words:
// "the two fields hold equal values today only because a conversation is written once
// and never updated; the first update path would make that difference real." This
// increment is that update path.
//
// WHAT THIS PINS. Three things, in the order they matter:
//
//   * the conversation's `updatedAt` ADVANCES when a turn is persisted, and to a value
//     later than the turn that created the other conversation;
//   * `createdAt` does NOT move — creation is a fact, activity is a timestamp, and a
//     fix that overwrote creation would lose real information;
//   * the list's ORDER follows the new field, which is the point of writing it at all.
//
// And one negative, because "advance the timestamp on success" must not quietly become
// "advance it on any request": a turn that fails persists nothing at all (Phase 07E /
// M7), so its conversation's activity time cannot move either.

import { it, after } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, makeApi, createTracker, registerOwner, disconnectDb } from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import { registerFakeProvider, setFakeScenario, fakeText } from './fakes/aiProvider.mjs';

process.env.AI_PROVIDER = 'fake';
// Permissive limiter: this suite issues several turns in a row as one user.
process.env.AI_RATE_LIMIT_MAX = '1000';
registerFakeProvider();

/** A scenario that answers plainly, so a turn completes and persists. */
setFakeScenario(() => fakeText('Nothing is out of stock right now.'));

const tick = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

after(async () => {
  setFakeScenario(null);
  await tracker.cleanup();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDb();
});

const ask = (token, message, conversationId) =>
  api('POST', '/api/ai/chat', {
    token,
    body: conversationId ? { message, conversationId } : { message },
  });

dbSuite('AI-7 the conversation list is ordered by real activity', dbOk, () => {
  it('★ advances updatedAt when a turn is persisted, and the list follows it', async () => {
    const owner = await registerOwner(api, tracker);

    // Conversation A, then conversation B: B is the newer one, so B leads the list.
    const first = await ask(owner.token, 'Which products are low on stock?');
    assert.equal(first.status, 201);
    const convA = first.json.conversation.id;

    await tick();
    const second = await ask(owner.token, 'Is anything out of stock?');
    assert.equal(second.status, 201);
    const convB = second.json.conversation.id;
    assert.notEqual(convA, convB, 'the two turns must have produced two conversations');

    let list = await api('GET', '/api/ai/conversations', { token: owner.token });
    assert.equal(list.json.total, 2);
    assert.equal(list.json.items[0].id, convB, 'the newer conversation leads before any continuation');

    // Now continue A. Before this increment nothing about A changed, so B stayed first.
    await tick();
    const continued = await ask(owner.token, 'And how much stock do we hold?', convA);
    assert.equal(continued.status, 201);
    assert.equal(continued.json.conversation.id, convA, 'a continuation stays in its own conversation');

    list = await api('GET', '/api/ai/conversations', { token: owner.token });
    assert.equal(
      list.json.items[0].id,
      convA,
      'a continued conversation becomes the most recently ACTIVE one',
    );

    // The timestamp itself, not only the order it produces.
    const movedAt = Date.parse(continued.json.conversation.updatedAt);
    assert.ok(
      movedAt > Date.parse(second.json.conversation.updatedAt),
      'updatedAt must be later than the turn that created the other conversation',
    );
    assert.ok(
      movedAt > Date.parse(first.json.conversation.updatedAt),
      'updatedAt must advance past the value it held when the conversation was created',
    );
  });

  it('never rewrites createdAt — creation is a fact, activity is a timestamp', async () => {
    const owner = await registerOwner(api, tracker);
    const first = await ask(owner.token, 'How much stock do we hold?');
    const convId = first.json.conversation.id;
    const created = first.json.conversation.createdAt;

    await tick();
    const continued = await ask(owner.token, 'What has moved recently?', convId);
    assert.equal(continued.json.conversation.createdAt, created, 'createdAt must not move');
    assert.ok(
      Date.parse(continued.json.conversation.updatedAt) >= Date.parse(created),
      'updatedAt can never precede creation',
    );
  });

  it('a conversation created BY a turn reports that turn as its activity', async () => {
    const owner = await registerOwner(api, tracker);
    const res = await ask(owner.token, 'Is anything out of stock?');
    const conv = res.json.conversation;
    assert.ok(conv.createdAt, 'createdAt must be present');
    assert.ok(conv.updatedAt, 'updatedAt must be present');
    // DELIBERATELY NOT `updatedAt === createdAt`. The bug was that the two were
    // ALWAYS equal, because nothing ever wrote an activity time — which is exactly
    // why it went unnoticed. A conversation created by a question already has
    // activity, so its `updatedAt` is at or after creation, and the honest
    // assertion is the ordering, not the equality that used to hide the defect.
    // (This expectation was written the other way first and failed against the
    // fix by ~136 ms — the test was wrong, not the code.)
    assert.ok(
      Date.parse(conv.updatedAt) >= Date.parse(conv.createdAt),
      'activity can never precede creation',
    );
  });

  it('a failed turn cannot advance it, because a failed turn writes nothing', async () => {
    const owner = await registerOwner(api, tracker);
    const first = await ask(owner.token, 'How much stock do we hold?');
    const convId = first.json.conversation.id;
    const before = first.json.conversation.updatedAt;

    // The turn runs out of its own deadline, which is a failure with nothing persisted.
    process.env.AI_TURN_DEADLINE_MS = '150';
    setFakeScenario(() => new Promise(() => {}));
    try {
      await tick();

      const failed = await ask(owner.token, 'And what moved recently?', convId);
      assert.equal(failed.status, 504, 'the failing turn must be reported as a timeout');
    } finally {
      delete process.env.AI_TURN_DEADLINE_MS;
      setFakeScenario(() => fakeText('Nothing is out of stock right now.'));
    }

    const list = await api('GET', '/api/ai/conversations', { token: owner.token });
    assert.equal(list.json.total, 1, 'a failed turn adds no conversation');
    assert.equal(
      list.json.items[0].updatedAt,
      before,
      'a failed turn must leave the conversation’s activity time exactly where it was',
    );
  });
});
