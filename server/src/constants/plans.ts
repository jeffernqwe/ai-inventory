/**
 * Phase 10 — Commercialization Foundation: centralized plan definitions and
 * per-feature limits.
 *
 * SYSTEM_SPECIFICATION.md reserves real Subscription Plans / Billing / AI Usage
 * Quotas for V4 (§48) and keeps online payments out of V1 (§2). This module only
 * defines the shape a future billing flow will write onto a Business; it performs
 * no billing and no metering.
 *
 * The default plan — FOUNDATION — is the V1 baseline. Every feature is unlimited,
 * so existing businesses and newly registered ones keep today's exact behavior.
 * When V4 introduces paid tiers, the assignment flow will write a real tier code
 * onto the Business document and entitlement.service.js applies its caps.
 */

export const DEFAULT_PLAN_CODE = 'FOUNDATION';

/**
 * Canonical feature keys. Every plan in the catalog defines every key, so a plan
 * can never silently lack an entitlement. Limit semantics (see each plan's
 * `limits`): `null` = unlimited; `0` = the feature is not part of the plan; a
 * positive integer = ceiling (the caller supplies the current count at
 * enforcement time).
 */
export const PLAN_FEATURES = Object.freeze(['ai', 'products', 'users']);

/** Human labels for plan features (used only in generic, business-safe errors). */
export const FEATURE_LABELS = Object.freeze({
  ai: 'AI assistant usage',
  products: 'product capacity',
  users: 'team members',
});

export const PLANS = Object.freeze({
  [DEFAULT_PLAN_CODE]: Object.freeze({
    code: DEFAULT_PLAN_CODE,
    name: 'Foundation',
    description: 'V1 baseline — all current features are available without limits.',
    limits: Object.freeze({
      ai: null,
      products: null,
      users: null,
    }),
  }),
  TRIAL: Object.freeze({
    code: 'TRIAL',
    name: 'Trial',
    description:
      'Illustrative capped plan, ready for a future billing/trial flow to assign.',
    limits: Object.freeze({
      ai: 20,
      products: 50,
      users: 3,
    }),
  }),
});

/**
 * Resolve a stored plan code to its catalog definition.
 *
 * LENIENT on unknown/missing codes (returns FOUNDATION): a code a future billing
 * flow has not written yet — or the pre-Phase-10 absence of a code on an existing
 * business document — must never lock a tenant out of features it already has.
 * Only the default (unlimited) plan is used for that fallback.
 */
export function resolvePlan(planCode: unknown) {
  if (
    typeof planCode === 'string' &&
    Object.prototype.hasOwnProperty.call(PLANS, planCode)
  ) {
    return PLANS[planCode as keyof typeof PLANS];
  }
  return PLANS[DEFAULT_PLAN_CODE];
}

export default { DEFAULT_PLAN_CODE, PLAN_FEATURES, FEATURE_LABELS, PLANS, resolvePlan };
