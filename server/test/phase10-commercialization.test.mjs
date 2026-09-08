// Phase 10 — Commercialization Foundation (plan state + entitlement checks).
//
// Two layers:
//   * unit (DB-free): catalog integrity (the default plan is unlimited; every
//     plan defines every canonical feature) and the pure entitlement decision
//     core (decideFeature / resolvePlan) over representative plan objects.
//   * db: real Business documents — planCode defaulting, plan resolution, the
//     unlimited-vs-capped enforcement path, and tenant isolation between two
//     businesses.
//
// Registered as MIXED in run-tests.mjs so unit mode exercises the DB-free
// suites and db/full mode also run the DB-backed suite.

import 'dotenv/config';

import { it, after } from 'node:test';
import assert from 'node:assert/strict';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';
import Business from '../src/models/business.model.js';
import ApiError from '../src/utils/ApiError.js';
import {
  DEFAULT_PLAN_CODE,
  PLANS,
  PLAN_FEATURES,
  resolvePlan,
} from '../src/constants/plans.js';
import {
  decideFeature,
  getBusinessPlan,
  assertBusinessEntitled,
  PLAN_FEATURE_NOT_INCLUDED_CODE,
  PLAN_LIMIT_REACHED_CODE,
  PLAN_CONFIGURATION_CODE,
} from '../src/services/entitlement.service.js';

const dbOk = await ensureDb();

// An id that cannot exist in MongoDB (24 hex zeroes) — for fail-closed tests.
const MISSING_ID = '000000000000000000000000';

// ---------------------------------------------------------------------------
// Plan catalog (all DB-free)
// ---------------------------------------------------------------------------
unitSuite('plan catalog — integrity and default semantics (Phase 10)', () => {
  it('defines the default plan (FOUNDATION) with every feature unlimited', () => {
    const def = PLANS[DEFAULT_PLAN_CODE];
    assert.ok(def, 'default plan exists in the catalog');
    assert.equal(def.code, DEFAULT_PLAN_CODE);
    for (const feature of PLAN_FEATURES) {
      assert.equal(def.limits[feature], null, `${feature} is unlimited on the default plan`);
    }
  });

  it('every plan defines exactly the canonical feature keys (no magic/partial plans)', () => {
    const codes = Object.keys(PLANS);
    assert.ok(codes.length >= 1, 'at least one plan is defined');
    for (const code of codes) {
      const plan = PLANS[code];
      assert.equal(plan.code, code, 'plan key matches its stored code');
      assert.deepEqual(
        Object.keys(plan.limits).sort(),
        [...PLAN_FEATURES].sort(),
        `plan ${code} defines every canonical feature`
      );
    }
  });

  it('resolves known codes to their definition', () => {
    assert.equal(resolvePlan(DEFAULT_PLAN_CODE), PLANS[DEFAULT_PLAN_CODE]);
    assert.equal(resolvePlan('TRIAL'), PLANS.TRIAL);
  });

  it('resolves missing or unknown codes to the unlimited default (no lockout)', () => {
    assert.equal(resolvePlan(undefined), PLANS[DEFAULT_PLAN_CODE]);
    assert.equal(resolvePlan(null), PLANS[DEFAULT_PLAN_CODE]);
    assert.equal(resolvePlan('NOT-A-PLAN-YET'), PLANS[DEFAULT_PLAN_CODE]);
  });
});

unitSuite('entitlement decision core — decideFeature (Phase 10)', () => {
  const unlimited = { code: 'X', limits: { ai: null, products: null, users: null } };
  const capped = { code: 'Y', limits: { ai: 20, products: null, users: null } };
  const excluded = { code: 'Z', limits: { ai: 0, products: null, users: null } };

  it('allows an unlimited feature regardless of current usage', () => {
    assert.deepEqual(decideFeature(unlimited, 'products', { usage: 1_000_000 }), { allowed: true });
  });

  it('allows a finite feature below its ceiling and denies at/over it', () => {
    assert.deepEqual(decideFeature(capped, 'ai', { usage: 19 }), { allowed: true });
    assert.deepEqual(decideFeature(capped, 'ai', { usage: 20 }), {
      allowed: false,
      code: PLAN_LIMIT_REACHED_CODE,
    });
    assert.deepEqual(decideFeature(capped, 'ai', { usage: 21 }), {
      allowed: false,
      code: PLAN_LIMIT_REACHED_CODE,
    });
  });

  it('treats a finite feature with no usage supplied as inclusion-only (allowed)', () => {
    assert.deepEqual(decideFeature(capped, 'ai'), { allowed: true });
  });

  it('denies a feature the plan excludes (limit 0)', () => {
    assert.deepEqual(decideFeature(excluded, 'ai'), {
      allowed: false,
      code: PLAN_FEATURE_NOT_INCLUDED_CODE,
    });
  });

  it('throws a configuration error for an unknown feature key', () => {
    assert.throws(() => decideFeature(unlimited, 'teleportation'), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 500);
      assert.equal(err.code, PLAN_CONFIGURATION_CODE);
      return true;
    });
  });

  it('the TRIAL plan enforces its real caps (ai 20, products 50)', () => {
    assert.deepEqual(decideFeature(PLANS.TRIAL, 'ai', { usage: 20 }), {
      allowed: false,
      code: PLAN_LIMIT_REACHED_CODE,
    });
    assert.deepEqual(decideFeature(PLANS.TRIAL, 'ai', { usage: 19 }), { allowed: true });
    assert.deepEqual(decideFeature(PLANS.TRIAL, 'products', { usage: 50 }), {
      allowed: false,
      code: PLAN_LIMIT_REACHED_CODE,
    });
    assert.deepEqual(decideFeature(PLANS.TRIAL, 'products', { usage: 49 }), { allowed: true });
  });
});

// ---------------------------------------------------------------------------
// Real Business documents + entitlement service (needs MongoDB)
// ---------------------------------------------------------------------------
dbSuite('plan state and entitlement enforcement over real businesses (Phase 10)', dbOk, () => {
  let seq = 0;
  const unique = (prefix) => `P10 ${prefix} ${Date.now()}-${seq++}`;
  const createdBusinessIds = [];
  const track = (id) => id && createdBusinessIds.push(String(id));

  it('defaults a new business to the FOUNDATION plan', async () => {
    const business = await Business.create({ name: unique('Default') });
    track(business._id);
    assert.equal(business.planCode, DEFAULT_PLAN_CODE);
    const plan = await getBusinessPlan(business._id);
    assert.equal(plan.businessId, String(business._id));
    assert.equal(plan.planCode, DEFAULT_PLAN_CODE);
    assert.equal(plan.plan.code, DEFAULT_PLAN_CODE);
  });

  it('resolves an explicitly assigned plan code from the document', async () => {
    const business = await Business.create({ name: unique('Trial'), planCode: 'TRIAL' });
    track(business._id);
    const plan = await getBusinessPlan(business._id);
    assert.equal(plan.planCode, 'TRIAL');
    assert.equal(plan.plan, PLANS.TRIAL);
  });

  it('falls back to the unlimited default when an unknown code is stored (no lockout)', async () => {
    const business = await Business.create({ name: unique('Unknown'), planCode: 'FUTURE-TIER-9' });
    track(business._id);
    const plan = await getBusinessPlan(business._id);
    assert.equal(plan.planCode, 'FUTURE-TIER-9', 'stored code is preserved');
    assert.equal(plan.plan, PLANS[DEFAULT_PLAN_CODE], 'but entitlement resolves to the default plan');
  });

  it('grants every feature on the default plan even far beyond any trial cap', async () => {
    const business = await Business.create({ name: unique('Unlimited') });
    track(business._id);
    for (const feature of PLAN_FEATURES) {
      await assertBusinessEntitled(business._id, feature, { usage: 1_000_000 });
    }
  });

  it('enforces a finite ceiling for a business on the TRIAL plan', async () => {
    const business = await Business.create({ name: unique('Capped'), planCode: 'TRIAL' });
    track(business._id);
    await assertBusinessEntitled(business._id, 'products', { usage: 49 }); // under the cap
    await assert.rejects(
      () => assertBusinessEntitled(business._id, 'products', { usage: 50 }),
      (err) => err instanceof ApiError && err.status === 403 && err.code === PLAN_LIMIT_REACHED_CODE
    );
  });

  it('keeps plans tenant-isolated: one business cap never affects another', async () => {
    const foundation = await Business.create({ name: unique('IsolationA') });
    const trial = await Business.create({ name: unique('IsolationB'), planCode: 'TRIAL' });
    track(foundation._id);
    track(trial._id);

    await assert.rejects(
      () => assertBusinessEntitled(trial._id, 'products', { usage: 50 }),
      (err) => err.code === PLAN_LIMIT_REACHED_CODE
    );
    // Same usage is fine for the sibling FOUNDATION business.
    await assertBusinessEntitled(foundation._id, 'products', { usage: 50 });

    const a = await getBusinessPlan(foundation._id);
    const b = await getBusinessPlan(trial._id);
    assert.equal(a.planCode, DEFAULT_PLAN_CODE);
    assert.equal(b.planCode, 'TRIAL');
    assert.notEqual(a.planCode, b.planCode);
  });

  it('fails closed for a business that does not exist', async () => {
    await assert.rejects(
      () => getBusinessPlan(MISSING_ID),
      (err) => err instanceof ApiError && err.status === 403
    );
    await assert.rejects(
      () => assertBusinessEntitled(MISSING_ID, 'ai'),
      (err) => err instanceof ApiError && err.status === 403
    );
  });

  after(async () => {
    if (dbOk && createdBusinessIds.length) {
      await Business.deleteMany({ _id: { $in: createdBusinessIds } }).catch(() => {});
    }
    await disconnectDb();
  });
});
