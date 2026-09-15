/**
 * Phase 10 — Commercialization Foundation: business-level entitlement checks.
 *
 * Plan state lives ON the Business document (`planCode`). These helpers resolve a
 * business's stored plan against the centralized catalog
 * (src/constants/plans.js) and enforce feature entitlements. They are the seam a
 * future V4 SaaS layer (paid tiers, AI usage quotas) will call from business
 * rules; no payment provider is referenced here and none is implemented yet.
 *
 * Tenant boundaries mirror the rest of the backend:
 *   * `businessId` always comes from the authenticated session — never the client;
 *   * `assertActiveBusiness` runs first, so an ACTIVE tenant is a precondition
 *     (a missing / SUSPENDED / ARCHIVED business, or a DB error, fails closed with
 *     403 BUSINESS_NOT_ACTIVE);
 *   * per-feature decisions are fail-closed (see `decideFeature`); only the
 *     documented FOUNDATION default is lenient, and only for unassignable codes.
 */
import Business from '../models/business.model.ts';
import ApiError from '../utils/ApiError.ts';
import { assertActiveBusiness } from './business.service.ts';
import {
  DEFAULT_PLAN_CODE,
  PLAN_FEATURES,
  FEATURE_LABELS,
  resolvePlan,
} from '../constants/plans.ts';

export const PLAN_FEATURE_NOT_INCLUDED_CODE = 'PLAN_FEATURE_NOT_INCLUDED';
export const PLAN_LIMIT_REACHED_CODE = 'PLAN_LIMIT_REACHED';
export const PLAN_CONFIGURATION_CODE = 'PLAN_CONFIGURATION';

function labelFor(feature) {
  return FEATURE_LABELS[feature] || feature;
}

/**
 * Pure entitlement decision over a single plan definition — no database access,
 * so the full branch matrix is unit-testable.
 *
 * Returns `{ allowed: true }`, or `{ allowed: false, code }` where `code` is
 * PLAN_FEATURE_NOT_INCLUDED (plan limit is 0) or PLAN_LIMIT_REACHED (a finite
 * ceiling and `usage` has reached it). An unknown feature key is a server-side
 * configuration bug and throws PLAN_CONFIGURATION.
 *
 * Semantics:
 *   * `limit === null` (unlimited) → always allowed;
 *   * `limit === 0` → feature not part of the plan → denied;
 *   * finite positive limit → inclusion is granted; only a supplied `usage`
 *     greater than or equal to the limit denies (a caller with no current count
 *     is checking inclusion, not capacity).
 */
export function decideFeature(plan, feature, { usage } = {}) {
  if (
    !PLAN_FEATURES.includes(feature) ||
    !Object.prototype.hasOwnProperty.call(plan.limits, feature)
  ) {
    throw new ApiError(
      500,
      `Entitlement check references an unknown plan feature "${feature}".`,
      PLAN_CONFIGURATION_CODE
    );
  }

  const limit = plan.limits[feature];
  if (limit === 0) {
    return { allowed: false, code: PLAN_FEATURE_NOT_INCLUDED_CODE };
  }
  if (limit == null) {
    return { allowed: true }; // unlimited
  }
  // Finite ceiling: enforce only when the caller supplies the current count.
  if (typeof usage !== 'number') {
    return { allowed: true };
  }
  return usage >= limit
    ? { allowed: false, code: PLAN_LIMIT_REACHED_CODE }
    : { allowed: true };
}

/**
 * Load a business's stored plan after confirming the tenant is ACTIVE. Never
 * trusts a client-supplied plan; the code is read from the Business document.
 * A query failure propagates (centralized handler returns 503 DB_UNAVAILABLE) —
 * it is not swallowed into a lenient grant.
 */
async function loadPlan(businessId) {
  await assertActiveBusiness(businessId);
  const doc = await Business.findById(businessId).select('planCode').lean();
  const storedCode =
    doc && typeof doc.planCode === 'string' ? doc.planCode : DEFAULT_PLAN_CODE;
  return { storedCode, plan: resolvePlan(storedCode) };
}

/** Current plan for a business: stored code + the resolved catalog definition. */
export async function getBusinessPlan(businessId) {
  const { storedCode, plan } = await loadPlan(businessId);
  return { businessId: String(businessId), planCode: storedCode, plan };
}

/**
 * Business-level entitlement check (the primitive V4 feature routes will call).
 * Pass `usage` to enforce a finite ceiling; omit it to check inclusion only.
 * Denied → 403 with a generic, business-safe message and a stable code.
 */
export async function assertBusinessEntitled(businessId, feature, { usage } = {}) {
  const { plan } = await loadPlan(businessId);
  const decision = decideFeature(plan, feature, { usage });
  if (decision.allowed) return;
  const message =
    decision.code === PLAN_LIMIT_REACHED_CODE
      ? `This business has reached its plan limit for ${labelFor(feature)}.`
      : `This plan does not include ${labelFor(feature)}.`;
  throw new ApiError(403, message, decision.code);
}

export default {
  PLAN_FEATURE_NOT_INCLUDED_CODE,
  PLAN_LIMIT_REACHED_CODE,
  PLAN_CONFIGURATION_CODE,
  decideFeature,
  getBusinessPlan,
  assertBusinessEntitled,
};
