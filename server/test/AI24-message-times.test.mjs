// AI-24 — the question's stored time is when it was ASKED, not when the answer was written.
//
// THE DEFECT, found while adding the timestamp to the member's own bubble (mobile AI-24). A
// turn is persisted only after the provider succeeds (Phase 07E / M7), so `AIMessage.create`
// stamped the USER message at the moment the turn COMPLETED. The consequence was worse than a
// cosmetic one: the question and the answer showed the same minute however long the member
// waited, which is precisely the interval the pair of timestamps exists to expose. A
// reloaded thread therefore reported a zero-second response time.
//
// WHAT THIS SUITE PINS. The controller records the time the turn STARTED — before `runAiChat`
// — and writes it as the USER message's `createdAt`. Mongoose honours a supplied `createdAt`
// (checked against the live schema before this was written: a value 45 s in the past was
// stored unchanged), so the stored question carries its own send time with no schema change.
// The fake provider below is DELIBERATELY slow, because with a fast one a persist-time
// stamping and a send-time stamping produce the same millisecond and the test would pass
// whatever the code did. The assertion is on the interval, not on the field being present.
//
// DB-gated: this exercises the real route, the real controller and the real schema.

import { it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, makeApi, createTracker, registerOwner, disconnectDb } from './support.mjs';
import { dbSuite } from './testEnv.mjs';
import { AIMessage } from '../src/models/index.ts';
import { registerFakeProvider, setFakeScenario, fakeText } from './fakes/aiProvider.mjs';

process.env.AI_PROVIDER = 'fake';
process.env.AI_RATE_LIMIT_MAX = '1000';
registerFakeProvider();

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

/** Long enough that persist-time and ask-time cannot collapse into the same millisecond. */
const TURN_DELAY_MS = 350;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => setFakeScenario(null));

after(async () => {
  await tracker.cleanup();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDb();
});

dbSuite('AI-24 a stored question carries the time it was asked', dbOk, () => {
  let owner;
  before(async () => {
    owner = await registerOwner(api, tracker);
  });

  it('★ the gap between the question and the answer is the turn, not zero', async () => {
    setFakeScenario(async () => {
      await sleep(TURN_DELAY_MS);
      return fakeText('Forty-six thousand units.');
    });

    const res = await api('POST', '/api/ai/chat', {
      token: owner.token,
      body: { message: 'How many total units do we have?' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));

    const user = res.json.userMessage;
    const assistant = res.json.assistantMessage;
    const gap = new Date(assistant.createdAt).getTime() - new Date(user.createdAt).getTime();

    // The provider was held for at least this long, so a persist-time stamp could not
    // produce a gap this large — that is what makes this case able to fail.
    assert.ok(
      gap >= TURN_DELAY_MS - 50,
      `the question and answer are ${gap} ms apart; the turn took at least ${TURN_DELAY_MS} ms`,
    );

    // Read back from the DATABASE, not just the response: a reloaded thread is built from
    // these rows, so the stored value is the one that has to be right.
    const stored = await AIMessage.findById(user.id).lean();
    assert.equal(new Date(stored.createdAt).getTime(), new Date(user.createdAt).getTime());
  });

  it('a question is never stored AFTER its answer', async () => {
    setFakeScenario(async () => {
      await sleep(50);
      return fakeText('Yes.');
    });
    const res = await api('POST', '/api/ai/chat', {
      token: owner.token,
      body: { message: 'Anything out of stock?' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.ok(
      new Date(res.json.userMessage.createdAt).getTime() <= new Date(res.json.assistantMessage.createdAt).getTime(),
      'the question is ordered after the answer it produced',
    );
  });

  it('a failed turn still writes nothing, so no timestamp is invented', async () => {
    setFakeScenario(() => {
      throw new Error('provider exploded');
    });
    const res = await api('POST', '/api/ai/chat', {
      token: owner.token,
      body: { message: 'This turn must not persist.' },
    });
    assert.ok(res.status >= 500, `expected a failure status, got ${res.status}`);
    const rows = await AIMessage.find({ content: 'This turn must not persist.' }).lean();
    assert.equal(rows.length, 0);
  });
});
