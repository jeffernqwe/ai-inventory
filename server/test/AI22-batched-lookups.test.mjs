// AI-22 — one round-trip per set of independent lookups.
//
// THE DEFECT, measured on the device 2026-10-19 rather than guessed at. The question
// "Compare my two locations, how many products are in each?" cost **5 provider calls and
// 51.6 seconds** for an answer that needs three lookups (`listLocations`, then one
// `getProductsByLocation` per location) — the turn line read
// `calls=5 toolRuns=4 providerMs=50879`, i.e. ONE model round-trip per lookup at roughly
// ten seconds each, against a 60-second turn deadline. The answer itself was numerically
// exact (203 / 99, checked against MongoDB), which is exactly why the cost is the finding:
// nothing was wrong with the answer and everything was wrong with the path to it.
//
// THREE THINGS ARE PINNED HERE, and they are the three legs the fix stands on:
//
//   1. THE PROMPT asks for the lookups together and forbids two habits the same answer
//      showed: naming an internal tool in member-facing prose ("these counts come from the
//      getProductsByLocation tool") and appending sections nobody asked for.
//   2. THE LOOP already executes every call in one provider response (that behaviour is
//      older than this suite and is re-pinned, not introduced) — so a batched response is
//      worth asking for.
//   3. THE WIRE now sends the results of a batched response as ONE user message carrying
//      N `tool_result` blocks, which is the canonical Anthropic shape. The previous mapping
//      emitted one user message PER result and relied on the gateway merging consecutive
//      user turns — documented for Anthropic, but a compatible gateway is not obliged to,
//      and a rejected continuation would fail a turn that used to work only because the
//      model never batched. Merging removes that dependency before it can be exercised.
//
// DB-free by construction: the tools named below do not exist, so the loop exercises the
// multi-call path without touching MongoDB and without a credential.

import { it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { unitSuite } from './testEnv.mjs';
import { ROLES } from '../src/constants/roles.ts';
import { runAiChat, systemPrompt } from '../src/services/ai/ai.service.ts';
import { toAnthropicMessages } from '../src/services/ai/providers/anthropicWire.ts';
import { registerFakeProvider, setFakeScenario, fakeText, fakeCalls } from './fakes/aiProvider.mjs';

process.env.AI_PROVIDER = 'fake';
registerFakeProvider();

afterEach(() => setFakeScenario(null));

const ctx = { businessId: 'b-ai22', userId: 'u-ai22', role: ROLES.OWNER };

// ---------------------------------------------------------------------------
// 1. The prompt
// ---------------------------------------------------------------------------
unitSuite('AI-22 the prompt asks for the lookups together (DB-free)', () => {
  it('★ tells the model that one response may carry several tool calls', () => {
    const prompt = systemPrompt();
    // The rule must say three things and this asserts each: that more than one call fits in
    // ONE response, that it applies to independent lookups, and why it matters (the wait).
    assert.match(prompt, /SEVERAL tools in ONE response/);
    assert.match(prompt, /independent/i);
    assert.match(prompt, /round-trip/i);
  });

  it('★ forbids naming an internal tool in the answer', () => {
    // Read off the device: the answer said "these counts come from the getProductsByLocation
    // tool". A member should be told what was read, never which function read it — the same
    // judgement AI-21 applied to the provenance chip, applied to the prose.
    const prompt = systemPrompt();
    assert.match(prompt, /Never name your tools/i);
    assert.match(prompt, /member's terms/i);
  });

  it('★ answers stop at the question that was asked', () => {
    const prompt = systemPrompt();
    assert.match(prompt, /Answer the question that was asked/i);
    assert.match(prompt, /did not ask for/i);
  });

  it('leaves the rules it was added beside intact', () => {
    // A guard against a rewrite that silently drops an older guarantee. These three are the
    // ones whose loss would be worst: read-only scope, the page-aware five-item bound, and
    // the pass-the-name-through rule AI-16 found the device needed.
    const prompt = systemPrompt();
    assert.match(prompt, /This assistant is READ-ONLY/);
    assert.match(prompt, /at most five items/);
    assert.match(prompt, /do NOT call listLocations or listCategories first/i);
  });

  it('the matcher can fail — an absent sentence is not matched', () => {
    // The control: the assertions above are only evidence if the matcher would notice the
    // sentence being gone. A phrase that is deliberately NOT in the prompt must not match.
    const prompt = systemPrompt();
    assert.doesNotMatch(prompt, /Call every tool you can think of/i);
  });
});

// ---------------------------------------------------------------------------
// 2. The loop
// ---------------------------------------------------------------------------
unitSuite('AI-22 a response carrying several calls is one round (DB-free)', () => {
  it('★ executes every call of one response and returns all results before the next call', async () => {
    const seen = [];
    setFakeScenario((providerCtx) => {
      seen.push(providerCtx);
      if (seen.length === 1) {
        return fakeCalls([
          { id: 'a1', name: 'ghostOne', input: {} },
          { id: 'a2', name: 'ghostTwo', input: { location: 'Main Warehouse' } },
        ]);
      }
      return fakeText('Both lookups are done.');
    });

    const out = await runAiChat({ ...ctx, message: 'compare two places' });

    // One tool ROUND, two calls: two iterations total (the round, then the answer).
    assert.equal(out.iterations, 2);
    assert.deepEqual(out.toolsUsed, ['ghostOne', 'ghostTwo']);
    assert.equal(out.content, 'Both lookups are done.');

    // The second provider call must carry the assistant turn with BOTH calls replayed, and
    // one result per call in the order they were requested — a batched response that lost
    // its second result would still "answer", which is why this is asserted on the ids.
    const second = seen[1];
    const assistant = second.messages.find((m) => m.role === 'assistant' && m.toolCalls?.length);
    assert.deepEqual(
      assistant.toolCalls.map((c) => c.id),
      ['a1', 'a2'],
    );
    const results = second.messages.filter((m) => m.role === 'tool');
    assert.deepEqual(
      results.map((m) => m.toolCallId),
      ['a1', 'a2'],
    );
    assert.deepEqual(
      results.map((m) => m.name),
      ['ghostOne', 'ghostTwo'],
    );
    // Both are soft error results (the tools do not exist), not crashes: a batched response
    // must not turn one unknown tool into a failed turn.
    for (const result of results) {
      assert.match(result.content, /TOOL_NOT_FOUND/);
    }
  });

  it('still spends one iteration on a single call (the batched path did not change it)', async () => {
    const seen = [];
    setFakeScenario((providerCtx) => {
      seen.push(providerCtx);
      if (seen.length === 1) return fakeCalls([{ id: 's1', name: 'ghostSolo', input: {} }]);
      return fakeText('done');
    });

    const out = await runAiChat({ ...ctx, message: 'one lookup' });
    assert.equal(out.iterations, 2);
    assert.deepEqual(out.toolsUsed, ['ghostSolo']);
    assert.deepEqual(
      seen[1].messages.filter((m) => m.role === 'tool').map((m) => m.toolCallId),
      ['s1'],
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The wire
// ---------------------------------------------------------------------------
unitSuite('AI-22 parallel results travel as one tool_result batch (DB-free)', () => {
  it('★ two tool results become ONE user message with two blocks, in order', () => {
    const wire = toAnthropicMessages([
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'p1', name: 'getProductsByLocation', input: {} },
          { id: 'p2', name: 'getProductsByLocation', input: {} },
        ],
      },
      { role: 'tool', name: 'getProductsByLocation', toolCallId: 'p1', content: '{"count":203}' },
      { role: 'tool', name: 'getProductsByLocation', toolCallId: 'p2', content: '{"count":99}' },
    ]);

    assert.equal(wire.length, 2, 'assistant turn + ONE user turn');
    assert.equal(wire[0].role, 'assistant');
    const batch = wire[1];
    assert.equal(batch.role, 'user');
    assert.equal(Array.isArray(batch.content), true);
    assert.deepEqual(
      batch.content.map((b) => b.type),
      ['tool_result', 'tool_result'],
    );
    assert.deepEqual(
      batch.content.map((b) => b.tool_use_id),
      ['p1', 'p2'],
    );
    assert.deepEqual(
      batch.content.map((b) => b.content),
      ['{"count":203}', '{"count":99}'],
    );
  });

  it('leaves the single-result shape exactly as it was', () => {
    // The common case, pinned so the batching change cannot quietly alter it: one result is
    // one user message with one block (asserted by the OpenRouter suite too, at the HTTP
    // level).
    const wire = toAnthropicMessages([
      { role: 'assistant', content: '', toolCalls: [{ id: 'x1', name: 't1', input: {} }] },
      { role: 'tool', name: 't1', toolCallId: 'x1', content: '{"ok":true}' },
    ]);
    assert.equal(wire.length, 2);
    assert.equal(wire[1].content.length, 1);
    assert.equal(wire[1].content[0].tool_use_id, 'x1');
  });

  it('★ the shipped wire sends the batch as ONE user turn, with the ids in order', () => {
    // This began as a CROSS-WIRE parity case: Gemini's mapping already merged adjacent turns
    // while the Anthropic mapping emitted one user turn per result — a divergence nothing could
    // catch until a model was asked for two lookups at once, and the case was what made the
    // Anthropic wire canonical. AI-25 (2026-10-19) removed the Gemini provider and its mapping,
    // so there is one wire left to assert; the property itself is unchanged and is what this
    // now pins: the whole batch travels together, and the ids pair with their results in order.
    const conversation = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'q1', name: 'getProductsByLocation', input: {} },
          { id: 'q2', name: 'getProductsByLocation', input: {} },
        ],
      },
      { role: 'tool', name: 'getProductsByLocation', toolCallId: 'q1', content: '{"count":203}' },
      { role: 'tool', name: 'getProductsByLocation', toolCallId: 'q2', content: '{"count":99}' },
    ];

    const wire = toAnthropicMessages(conversation);
    assert.equal(wire.length, 2, 'model turn + ONE user turn');
    assert.deepEqual(
      wire[1].content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id),
      ['q1', 'q2'],
    );
  });

  it('a later message is never merged into the result batch', () => {
    // The merge is for ADJACENT tool results only. The loop never produces a user message
    // between them today, so this pins the boundary before something can.
    const wire = toAnthropicMessages([
      { role: 'tool', name: 't1', toolCallId: 'y1', content: '{"ok":1}' },
      { role: 'user', content: 'and what about the other place?' },
    ]);
    assert.equal(wire.length, 2);
    assert.equal(wire[1].content, 'and what about the other place?');
  });
});
