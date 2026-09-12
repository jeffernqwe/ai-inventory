// Phase 20C (L-1) — the offset-pagination coercion contract, asserted as shipped.
//
// `parsePagination()` (src/utils/pagination.js) does not reject a bad page or
// limit; it silently coerces it and answers 200. That is the actual V1 contract:
// page defaults to 1, limit defaults to 20, limit is capped at 100, and `page`
// past the end is an empty page rather than a 404. This suite PINS that behavior
// so a future change to it has to be deliberate — it documents what the code
// does today and deliberately does not assert what it "ought" to do.
//
// Two of the Phase 20B findings are intentionally NOT covered here, because
// Phase 20C was scoped to pin current behavior rather than to change it:
//   * M-1 — an invalid `status`/`type` filter is coerced rather than rejected.
//     Phase 20D has since normalized that: see phase20-filter-contract.test.mjs
//     for the rejected-filter contract.
//   * M-4 — exponent notation (`limit=1e3`) is parsed by `Number.parseInt` as
//     `1`. It behaves the same as `abc` here, so it adds no new contract, and it
//     is explicitly deferred rather than asserted as intended behavior.
//
// One representative list route is enough: `parsePagination` is shared by every
// paginated endpoint, and the Phase 20A suite already exercises the ordering of
// each individual list. DB-backed; registered as PURE_DB in run-tests.mjs.

import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  uniqueName,
  disconnectDb,
} from './support.mjs';
import { dbSuite } from './testEnv.mjs';

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

/** Three products is enough to page over and to sit well inside one page. */
const SEEDED = 3;
const PATH = '/api/products';

let owner; // the business whose catalog is paged

/**
 * GET the list route with raw query fragments appended verbatim, so the exact
 * spelling the client sent is what reaches the parser (no URLSearchParams
 * normalisation in between).
 */
async function listPage(query = '') {
  const res = await api('GET', `${PATH}${query}`, { token: owner.token });
  assert.equal(res.status, 200, `${PATH}${query} -> ${res.status} ${JSON.stringify(res.json)}`);
  return res.json;
}

dbSuite('Phase 20C — offset pagination coercion contract', dbOk, () => {
  before(async () => {
    owner = await registerOwner(api, tracker);
    for (let i = 0; i < SEEDED; i += 1) {
      const res = await api('POST', PATH, {
        token: owner.token,
        body: { name: uniqueName('P20C') },
      });
      assert.equal(res.status, 201, `product create -> ${res.status} ${JSON.stringify(res.json)}`);
    }
  });

  after(async () => {
    await tracker.cleanup();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  it('returns the standard pagination envelope and nothing else', async () => {
    const body = await listPage();
    assert.deepEqual(
      Object.keys(body).sort(),
      ['items', 'limit', 'page', 'total', 'totalPages'],
      'the envelope is exactly { items, page, limit, total, totalPages }'
    );
    assert.ok(Array.isArray(body.items), 'items is an array');
    assert.equal(body.total, SEEDED, 'total is the full count, not the page length');
    assert.equal(body.totalPages, Math.ceil(SEEDED / body.limit), 'totalPages follows the coerced limit');
  });

  it('defaults an omitted page to 1 and an omitted limit to 20', async () => {
    const body = await listPage();
    assert.equal(body.page, 1, 'page omitted -> 1');
    assert.equal(body.limit, 20, 'limit omitted -> 20');
    assert.equal(body.items.length, SEEDED, 'every seeded row is on page 1');
  });

  it('coerces an unusable page to 1 instead of rejecting it', async () => {
    for (const [label, query] of [
      ['page=0', '?page=0'],
      ['page=-1', '?page=-1'],
      ['page=abc', '?page=abc'],
      ['page empty', '?page='],
    ]) {
      const body = await listPage(query);
      assert.equal(body.page, 1, `${label} -> page 1`);
      assert.equal(body.total, SEEDED, `${label}: total is unaffected`);
      assert.equal(body.items.length, SEEDED, `${label}: page 1 is still the first page`);
    }
  });

  it('coerces an unusable limit to the default instead of rejecting it', async () => {
    for (const [label, query] of [
      ['limit=0', '?limit=0'],
      ['limit=-1', '?limit=-1'],
      ['limit=abc', '?limit=abc'],
      ['limit empty', '?limit='],
    ]) {
      const body = await listPage(query);
      assert.equal(body.limit, 20, `${label} -> limit 20`);
      assert.equal(body.total, SEEDED, `${label}: total is unaffected`);
      assert.equal(body.items.length, SEEDED, `${label}: the default limit still fits every row`);
      assert.equal(body.totalPages, 1, `${label}: totalPages follows the coerced limit`);
    }
  });

  it('caps an over-maximum limit at 100 rather than rejecting it', async () => {
    const body = await listPage('?limit=101');
    assert.equal(body.limit, 100, 'limit=101 -> 100');
    assert.equal(body.total, SEEDED, 'total is unaffected by the cap');
    assert.equal(body.items.length, SEEDED, 'all seeded rows still fit');
  });

  it('answers a page past the end with an empty page, not an error', async () => {
    const body = await listPage('?page=99&limit=2');
    assert.equal(body.page, 99, 'the requested page is echoed back');
    assert.equal(body.limit, 2, 'the limit is echoed back');
    assert.equal(body.total, SEEDED, 'total still describes the whole collection');
    assert.equal(body.totalPages, Math.ceil(SEEDED / 2), 'totalPages is unchanged by the page number');
    assert.deepEqual(body.items, [], 'past the final page is an empty page');
  });

  it('applies the coerced values to the window, not just the echo', async () => {
    // The last page holds the remainder, which proves skip = (page-1)*limit is
    // computed from the COERCED page and limit.
    const body = await listPage('?page=2&limit=2');
    assert.equal(body.page, 2);
    assert.equal(body.limit, 2);
    assert.equal(body.items.length, SEEDED - 2, 'page 2 at limit 2 is the one-row remainder');
  });
});
