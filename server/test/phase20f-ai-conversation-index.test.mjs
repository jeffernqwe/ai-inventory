// Phase 20F (M-5) — the ai_conversations list index, asserted at the schema.
//
// `GET /api/ai/conversations` reads the authenticated user's conversations
// most-recently-active first, with a deterministic tiebreaker:
// `sort({ updatedAt: -1, _id: -1 })` over `{ businessId, userId }`
// (ai.controller.js). The model declared only
// `{ businessId: 1, userId: 1, createdAt: 1 }` — it keys on `createdAt`, which
// is not the sort field at all, so it could serve the equality match but not the
// order, and the winning plan was `SORT -> FETCH -> IXSCAN`: a blocking
// in-memory sort. Phase 20F adds the index whose key shape actually matches the
// sort, keeping the `createdAt` index alongside it.
//
// This suite pins the DECLARATION, not the query plan. It is the cheap guard
// that the index cannot be dropped, reordered, or "tidied away" without a
// deliberate change. Every part of the shape is load-bearing: the two equality
// keys must come first, `updatedAt` must carry the sort's direction, and `_id`
// must be last so paging a tie boundary stays deterministic.
//
// DATABASE-FREE on purpose — it reads the schema, never the data, so it runs in
// both `npm test` and `npm run test:unit`. Plan-level evidence (the blocking
// SORT before, the index-ordered walk after) is not reproducible as a unit test
// and lives in the Phase 20F explain probe instead.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import AIConversation from '../src/models/aiConversation.model.js';

/** The index the conversations list must be able to use. */
const REQUIRED_KEY = { businessId: 1, userId: 1, updatedAt: -1, _id: -1 };
/** The index that predates Phase 20F and must survive it. */
const KEPT_KEY = { businessId: 1, userId: 1, createdAt: 1 };

/**
 * Renders an index key as an ORDER-SENSITIVE signature. `assert.deepEqual` is
 * order-insensitive for object keys, but key order is precisely what decides
 * whether the equality keys can be used as a prefix and whether the index can be
 * walked instead of sorted — so the signature is built from `Object.entries`.
 */
const signature = (key) =>
  Object.entries(key)
    .map(([field, direction]) => `${field}:${direction}`)
    .join(', ');

/** Every index key declared on the schema, in declaration order. */
const declaredKeys = () => AIConversation.schema.indexes().map(([key]) => key);

const declaredSignatures = () => declaredKeys().map(signature);

describe('Phase 20F — ai_conversations list index (M-5)', () => {
  it('declares the full key shape of the conversations list sort', () => {
    const wanted = signature(REQUIRED_KEY);
    assert.ok(
      declaredSignatures().includes(wanted),
      `the model must declare { businessId: 1, userId: 1, updatedAt: -1, _id: -1 } ` +
        `(order-sensitive: "${wanted}") so the list sort is index-ordered; ` +
        `declared instead: ${JSON.stringify(declaredSignatures())}`
    );
  });

  it('keeps the pre-existing createdAt index alongside the new one', () => {
    // Phase 20F adds an index; it does not replace or modify one. A future
    // "cleanup" that drops this key shape has to fail here first.
    const kept = signature(KEPT_KEY);
    assert.ok(
      declaredSignatures().includes(kept),
      `{ businessId: 1, userId: 1, createdAt: 1 } must remain declared ("${kept}"); ` +
        `declared instead: ${JSON.stringify(declaredSignatures())}`
    );
  });
});
